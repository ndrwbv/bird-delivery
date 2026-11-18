extends Node3D

const SNOW := preload("res://south_winter_view.gdshader")
const ROAD := preload("res://south_winter_road.gd")
const RADIUS := 3
const MICROSECONDS := 950
var model: RefCounted
var terrain: RefCounted
var car: CharacterBody3D
var tiles := {}
var waiting: Array[Vector2i] = []
var last_cell := Vector2i(-99999,-99999)
var amount := -1.0
var task: Surface
var parts: ROAD.Cell
var part := 0
var target: Vector2i
var cut_map: Texture2D
var cut_at := Vector2.INF
var cuts := false

class Surface:
	var points := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var colors := PackedColorArray()
	var idx := PackedInt32Array()

	func put(p: Vector2, y: float, offset: Vector2, mode: Vector2, shade: Color) -> void:
		points.append(Vector3(p.x,y,p.y))
		uv.append(offset)
		uv2.append(mode)
		colors.append(shade)

	func quads(start: int, columns: int, rows: int) -> void:
		for i in rows-1:
			for j in columns-1:
				var n := start+i*columns+j
				idx.append_array(PackedInt32Array([n,n+columns,n+1,n+1,n+columns,n+columns+1]))


func setup(vehicle: CharacterBody3D, ground: RefCounted) -> void:
	car = vehicle
	terrain = ground
	model = car.surface.winter


func step() -> void:
	var snow: float = smoothstep(0.04,0.90,car.surface.snow)
	if not is_equal_approx(amount,snow):
		amount = snow
		visible = amount>0.002
		for t: MeshInstance3D in tiles.values():
			if is_instance_valid(t):
				t.material_override.set_shader_parameter(&"winter",amount)
	if not visible:
		return
	var use_cuts: bool = car.terrain.has_method(&"update_at") and car.terrain.cuts
	if cuts != use_cuts or (use_cuts and (cut_at!=car.terrain.origin or cut_map!=car.terrain.texture)):
		cuts = use_cuts
		cut_at = car.terrain.origin if use_cuts else Vector2.ZERO
		cut_map = car.terrain.texture if use_cuts else null
		for existing: MeshInstance3D in tiles.values():
			if is_instance_valid(existing):
				_apply_cuts(existing.material_override)
	var here := Vector2(car.position.x,car.position.z)
	var cell := Vector2i((here/32.0).floor())
	if cell != last_cell:
		last_cell = cell
		waiting.clear()
		for key: Vector2i in tiles.keys():
			if absi(key.x-cell.x)>RADIUS+2 or absi(key.y-cell.y)>RADIUS+2:
				var node: MeshInstance3D = tiles[key]
				if node != null:
					node.queue_free()
				tiles.erase(key)
		for x in range(cell.x-RADIUS,cell.x+RADIUS+1):
			for z in range(cell.y-RADIUS,cell.y+RADIUS+1):
				var key := Vector2i(x,z)
				if not tiles.has(key) and (task==null or key!=target):
					waiting.append(key)
		waiting.sort_custom(func(a: Vector2i,b: Vector2i):return a.distance_squared_to(cell)>b.distance_squared_to(cell))
	var started := Time.get_ticks_usec()
	for operation in 12:
		if Time.get_ticks_usec()-started>MICROSECONDS:
			break
		if task==null:
			if waiting.is_empty():
				break
			target = waiting.pop_back()
			parts = model._cell((Vector2(target)+Vector2(0.5,0.5))*32.0)
			if parts.roads.is_empty() and parts.banks.is_empty():
				tiles[target] = null
				continue
			task = Surface.new()
			part = 0
		if part<parts.roads.size():
			_road(parts.roads[part])
		elif part<parts.roads.size()+parts.banks.size():
			_bank(parts.banks[part-parts.roads.size()])
		else:
			_publish()
			task = null
			parts = null
			continue
		part += 1


func _road(r: ROAD.Section) -> void:
	var center := (Vector2(target)+Vector2(0.5,0.5))*32.0
	var half := r.width*0.5
	# Clip long source segments before sampling terrain. The shader clips the last
	# centimetres at a tile edge, so a road crossing a tile corner stays seamless.
	var radius: float = 16.0*(absf(r.axis.x)+absf(r.axis.y))+half
	var center_distance := (center-r.a).dot(r.axis)
	var lo := clampf(center_distance-radius,0.0,r.length)
	var hi := clampf(center_distance+radius,0.0,r.length)
	if hi-lo<0.01:
		return
	var steps := maxi(1,ceili((hi-lo)/4.0))
	var side := Vector2(-r.axis.y,r.axis.x)
	var start := task.points.size()
	var service := Vector2(r.mode,r.lanes)
	for i in steps+1:
		var along := lerpf(lo,hi,float(i)/steps)
		var mid := r.a+r.axis*along
		var fade := 1.0
		for g in range(0,r.gaps.size(),3):
			fade = minf(fade,smoothstep(0.0,r.gaps[g+2],absf(along-r.gaps[g])-r.gaps[g+1]))
		for s: float in [-1.0,0.0,1.0]:
			var p := mid+side*s*half
			var surface: float = terrain.land_height(p.x,p.y)
			var y: float = terrain.at(p.x,p.y,INF if r.bridge else surface)
			var cover := 1.0
			if r.mode!=2:
				for q in parts.roads:
					if q.mode!=2 or q.bridge!=r.bridge or q.rank>r.rank:
						continue
					var offset := p-q.a
					var station := offset.dot(q.axis)
					if station>=-0.1 and station<=q.length+0.1:
						cover = minf(cover,smoothstep(0.0,8.0,absf(q.axis.cross(offset))-q.width*0.5))
			task.put(p,y+(0.024 if r.mode==2 else 0.032),Vector2(s*half,half),service,Color(fade,cover,0.0))
	task.quads(start,3,steps+1)


func _bank(b: ROAD.Bank) -> void:
	if b.length<0.1:
		return
	var steps := maxi(2,ceili(b.length/2.5))
	var start := task.points.size()
	var side := Vector2(-b.axis.y,b.axis.x)
	for i in steps+1:
		var t := float(i)/steps
		var along := b.length*t
		var ends := smoothstep(0.0,minf(2.3,b.length*0.5),minf(along,b.length-along))
		var offset := b.width*0.08*sin(t*TAU+b.phase)*sin(t*PI)
		var mid := b.a+b.axis*along+side*offset
		var h := (b.base+b.height*(0.91+0.09*sin(t*PI*3.0+b.phase)))*ends
		for s: float in [-1.0,-0.5,0.0,0.5,1.0]:
			var p := mid+side*(s*b.width*0.5*sqrt(ends))
			var land: float = terrain.land_height(p.x,p.y)
			var y: float = terrain.at(p.x,p.y,INF if b.bridge else land)
			var rise := h*pow(1.0-s*s,2.0)
			task.put(p,y+0.021+rise,Vector2.ZERO,Vector2(3,0),Color(1.0,1.0,rise))
	task.quads(start,5,steps+1)


func _apply_cuts(paint: ShaderMaterial) -> void:
	paint.set_shader_parameter(&"quick_cut_enabled",cuts)
	if cuts:
		paint.set_shader_parameter(&"quick_cut_map",cut_map)
		paint.set_shader_parameter(&"quick_cut_origin",cut_at)


func _publish() -> void:
	if task.idx.is_empty():
		tiles[target] = null
		return
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = task.points
	arrays[Mesh.ARRAY_TEX_UV] = task.uv
	arrays[Mesh.ARRAY_TEX_UV2] = task.uv2
	arrays[Mesh.ARRAY_COLOR] = task.colors
	arrays[Mesh.ARRAY_INDEX] = task.idx
	var geometry := ArrayMesh.new()
	geometry.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var node := MeshInstance3D.new()
	node.mesh = geometry
	var paint := ShaderMaterial.new()
	paint.shader = SNOW
	_apply_cuts(paint)
	var origin := Vector2(target)*32
	paint.set_shader_parameter(&"clip_zone",Vector4(origin.x,origin.y,origin.x+32,origin.y+32))
	paint.set_shader_parameter(&"winter",amount)
	node.material_override = paint
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visibility_range_end = 120.0
	add_child(node)
	tiles[target] = node
