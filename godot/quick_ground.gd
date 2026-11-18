extends RefCounted

const PIXELS := 512
const SPAN := 420.0
const CELL := 16.0
var base: RefCounted
var scars: Array[Dictionary] = []
var houses: Array[Dictionary] = []
var cells := {}
var materials: Array[ShaderMaterial] = []
var atlas: Image
var texture: ImageTexture
var origin := Vector2.INF
var dirty := true
var cuts := false
var repairing := false

func setup(original: RefCounted, source: Node) -> void:
	base = original
	var unique := {}
	for node: MeshInstance3D in source.find_children("*","MeshInstance3D",true,false):
		var material := node.material_override as ShaderMaterial
		if not material or not material.shader or unique.has(material):
			continue
		var file := material.shader.resource_path.get_file().get_basename()
		if file in ["city_color","actor_color","landscape","residential_window","textured_city","south_region_surface","south_region_overview"]:
			unique[material] = true
			materials.append(material)

func start(aftermath: bool) -> void:
	stop()
	repairing = aftermath
	if not atlas:
		atlas = Image.create_empty(PIXELS,PIXELS,false,Image.FORMAT_RG8)
		texture = ImageTexture.create_from_image(atlas)
	for material in materials:
		material.set_shader_parameter(&"quick_cut_map",texture)

func stop() -> void:
	for material in materials:
		if cuts:
			material.set_shader_parameter(&"quick_cut_enabled",false)
	cuts = false
	cells.clear()
	scars.clear()
	houses.clear()
	origin = Vector2.INF
	dirty = true

func add_crater(p: Vector2, radius: float) -> void:
	var scar := {"p":p,"r":radius,"y":base.at(p.x,p.y),"depth":radius*.52}
	scars.append(scar)
	if scars.size() > 48:
		scars.pop_front()
		cells.clear()
		for other in scars:
			_index(other)
	else:
		_index(scar)
	dirty = true

func _index(scar: Dictionary) -> void:
	var p: Vector2 = scar.p
	var r := Vector2.ONE * float(scar.r)
	var lo := Vector2i(((p-r)/CELL).floor())
	var hi := Vector2i(((p+r)/CELL).floor())
	for y in range(lo.y,hi.y+1):
		for x in range(lo.x,hi.x+1):
			var key := Vector2i(x,y)
			if not cells.has(key):
				cells[key] = []
			cells[key].append(scar)

func deformation(p: Vector2) -> float:
	if repairing:
		return 0.0
	var depth := 0.0
	for scar: Dictionary in cells.get(Vector2i((p/CELL).floor()),[]):
		var d := p.distance_to(scar.p) / float(scar.r)
		if d < 1.0:
			depth = maxf(depth,float(scar.depth)*(1.0-smoothstep(0.18,1.0,d)))
	return depth

func at(x: float,z: float,previous := INF) -> float:
	return float(base.at(x,z,previous))-deformation(Vector2(x,z))

func wheel_height(x: float,z: float,previous := INF) -> float:
	return float(base.wheel_height(x,z,previous))-deformation(Vector2(x,z))

func land_height(x: float,z: float) -> float:
	return float(base.land_height(x,z))-deformation(Vector2(x,z))

func material_at(x: float,z: float) -> int:
	return base.material_at(x,z)

func add_house(house: Dictionary) -> void:
	if houses.size() >= 10:
		houses.pop_front()
	houses.append(house)
	dirty = true

func update_at(p: Vector2) -> void:
	if not dirty and is_finite(origin.x) and (p-origin-Vector2.ONE*SPAN*.5).length_squared() < 72.0*72.0:
		return
	dirty = false
	origin = (p/32.0).round()*32.0-Vector2.ONE*SPAN*.5
	atlas.fill(Color.BLACK)
	var box := Rect2(origin,Vector2.ONE*SPAN)
	for house in houses:
		if box.intersects(house.bounds):
			_raster_house(house)
	if not repairing:
		for scar in scars:
			if box.grow(scar.r).has_point(scar.p):
				_raster_crater(scar)
	texture.update(atlas)
	var active := not houses.is_empty() or (not repairing and not scars.is_empty())
	for material in materials:
		material.set_shader_parameter(&"quick_cut_origin",origin)
		if active != cuts:
			material.set_shader_parameter(&"quick_cut_enabled",active)
	cuts = active

func _raster_crater(scar: Dictionary) -> void:
	var center: Vector2 = (scar.p-origin)*(PIXELS/SPAN)
	var radius: float = scar.r*(PIXELS/SPAN)
	var tint := Color(0,clampf((float(scar.y)+67.2)/190.0,.004,1),0)
	for y in range(maxi(0,floori(center.y-radius)),mini(PIXELS,ceili(center.y+radius))):
		var dy := y+.5-center.y
		var dx := sqrt(maxf(0,radius*radius-dy*dy))
		_line(y,center.x-dx,center.x+dx,tint)

func _raster_house(house: Dictionary) -> void:
	var points := PackedVector2Array()
	for p: Vector2 in house.outline:
		points.append((p-origin)*PIXELS/SPAN)
	var area: Rect2 = house.bounds
	var tint := Color(clampf((float(house.cut)+65.0)/190.0,.004,1),0,0)
	for y in range(maxi(0,floori((area.position.y-origin.y)*PIXELS/SPAN)),mini(PIXELS,ceili((area.end.y-origin.y)*PIXELS/SPAN))):
		var xs := PackedFloat32Array()
		var py := y+.5
		for i in points.size():
			var a := points[i-1]
			var b := points[i]
			if (a.y>py) != (b.y>py):
				xs.append(lerpf(a.x,b.x,(py-a.y)/(b.y-a.y)))
		xs.sort()
		for i in range(1,xs.size(),2):
			_line(y,xs[i-1]-.8,xs[i]+.8,tint)

func _line(y: int, left: float, right: float, tint: Color) -> void:
	var first := maxi(0,ceili(left-.5))
	var end := mini(PIXELS,ceili(right-.5))
	if end>first:
		atlas.fill_rect(Rect2i(first,y,end-first,1),tint)
