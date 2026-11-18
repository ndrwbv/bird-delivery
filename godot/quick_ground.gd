extends RefCounted

const PIXELS := 512
const SPAN := 420.0
const CELL := 16.0
var base: RefCounted
var scars: Array[RefCounted] = []
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

func add_scar(scar: RefCounted) -> void:
	scars.append(scar)
	if scars.size() > 48:
		scars.pop_front()
		cells.clear()
		for other in scars:
			_index(other)
	else:
		_index(scar)
	dirty = true

func _index(scar: RefCounted) -> void:
	if not scar.repaired and scar.kind!="crater":
		return
	var p: Vector2 = scar.p
	var span := Vector2.ONE * float(scar.radius)
	var lo := Vector2i(((p-span)/CELL).floor())
	var hi := Vector2i(((p+span)/CELL).floor())
	for y in range(lo.y,hi.y+1):
		for x in range(lo.x,hi.x+1):
			var key := Vector2i(x,y)
			if not cells.has(key):
				cells[key] = []
			cells[key].append(scar)

func _support(x: float,z: float,original: float) -> float:
	var point := Vector2(x,z)
	for scar: RefCounted in cells.get(Vector2i((point/CELL).floor()),[]):
		if point.distance_squared_to(scar.p)>scar.radius*scar.radius:
			continue
		var surface: float = scar.support(point)
		if is_finite(surface):
			return surface
	return original

func at(x: float,z: float,previous := INF) -> float:
	return _support(x,z,float(base.at(x,z,previous)))

func wheel_height(x: float,z: float,previous := INF) -> float:
	return _support(x,z,float(base.wheel_height(x,z,previous)))

func land_height(x: float,z: float) -> float:
	return _support(x,z,float(base.land_height(x,z)))

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
			if box.grow(scar.radius).has_point(scar.p):
				_raster_polygon(scar.border,Color(0,clampf((float(scar.center_y)+67.2)/190.0,.004,1),0),scar.p,scar.open_scale)
	texture.update(atlas)
	var active := not houses.is_empty() or (not repairing and not scars.is_empty())
	for material in materials:
		material.set_shader_parameter(&"quick_cut_origin",origin)
		if active != cuts:
			material.set_shader_parameter(&"quick_cut_enabled",active)
	cuts = active

func _raster_house(house: Dictionary) -> void:
	_raster_polygon(house.outline,Color(clampf((float(house.cut)+65.0)/190.0,.004,1),0,0))

func _raster_polygon(outline: PackedVector2Array, tint: Color, pivot := Vector2.ZERO, k := 1.0) -> void:
	var points := PackedVector2Array()
	var lo := PIXELS
	var hi := 0
	for p in outline:
		var at := ((pivot+(p-pivot)*k)-origin)*(PIXELS/SPAN)
		points.append(at)
		lo = mini(lo,floori(at.y))
		hi = maxi(hi,ceili(at.y))
	for y in range(maxi(0,lo),mini(PIXELS,hi)):
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
