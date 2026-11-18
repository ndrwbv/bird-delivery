extends Node3D

signal struck(strength: float)

const TILE := 80.0
const RINGS := [1.22,1.0,0.94,0.66]
const SHIFTS := [Vector2.ZERO,Vector2(-0.048,-0.064),Vector2(0.024,0.032),Vector2(0.02,0.03)]
const TONES := [Color("#cdc9c1"),Color("#8c8a84"),Color("#55534e"),Color("#323339")]
const WHEELS := [Vector2(-0.8,1.3),Vector2(0.8,1.3),Vector2(-0.8,-1.25),Vector2(0.8,-1.25)]
var car: CharacterBody3D
var terrain: RefCounted
var origin := Vector2.ZERO
var hits := {}
var tiles := {}
var meshes := {}
var stamps := {}
var elapsed := 0.0
var refresh := 0.0
var paint := StandardMaterial3D.new()


func setup(vehicle: CharacterBody3D, ground: RefCounted, region: Dictionary) -> void:
	car = vehicle
	terrain = ground
	origin = Vector2(region.origin[0],region.origin[1])
	var center: Array = region.core_bounds
	var core := Rect2(Vector2(center[0],center[1]),Vector2(center[2]-center[0],center[3]-center[1]))
	var raw: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-potholes.json"))
	for hole: Array in raw:
		var at := Vector2(hole[0],hole[1])
		var radius := float(hole[2])*0.9
		hits[_wheel_cell(at)] = Vector3(at.x,at.y,radius*radius)
		if core.has_point(at):
			continue  # The original detailed street mesh contains these polygons already.
		var key := Vector2i((at/TILE).floor())
		if not tiles.has(key):
			tiles[key] = []
		tiles[key].append(hole)
	paint.vertex_color_use_as_albedo = true
	paint.vertex_color_is_srgb = true
	paint.roughness = 0.95
	paint.cull_mode = BaseMaterial3D.CULL_DISABLED


func _wheel_cell(p: Vector2) -> Vector2i:
	return Vector2i(((p+origin)/6.0).floor())


func step(dt: float) -> void:
	elapsed += dt
	var here := Vector2(car.position.x,car.position.z)
	refresh -= dt
	if refresh <= 0.0:
		refresh = 0.24
		_stream(here)
	if absf(car.speed) < 3.0 or car.airborne:
		return
	var forward := Vector2(-car.basis.z.x,-car.basis.z.z)
	var side := Vector2(forward.y,-forward.x)
	for wheel: Vector2 in WHEELS:
		var contact := here+forward*wheel.y+side*wheel.x
		var key := _wheel_cell(contact)
		if not hits.has(key) or elapsed < float(stamps.get(key,-2.0))+1.2:
			continue
		var hole: Vector3 = hits[key]
		if contact.distance_squared_to(Vector2(hole.x,hole.y)) > hole.z:
			continue
		# A road under a bridge has its own wheel contacts.
		if absf(car.position.y-terrain.land_height(contact.x,contact.y)) > 1.4:
			continue
		stamps[key] = elapsed
		var strength := 0.6+minf(1.0,absf(car.speed)/30.0)*0.4
		car.pothole(wheel.y > 0.0,0.4)
		struck.emit(strength)
		break


func _stream(here: Vector2) -> void:
	var cell := Vector2i((here/TILE).floor())
	for key: Vector2i in meshes.keys():
		if absi(key.x-cell.x)>3 or absi(key.y-cell.y)>3:
			meshes[key].queue_free()
			meshes.erase(key)
	var chosen := Vector2i.ZERO
	var nearest := INF
	for x in range(cell.x-2,cell.x+3):
		for z in range(cell.y-2,cell.y+3):
			var key := Vector2i(x,z)
			if meshes.has(key) or not tiles.has(key):
				continue
			var d := here.distance_squared_to((Vector2(key)+Vector2(0.5,0.5))*TILE)
			if d < nearest:
				nearest = d
				chosen = key
	if nearest < INF:
		_build(chosen)


func _build(key: Vector2i) -> void:
	var positions := PackedVector3Array()
	var colors := PackedColorArray()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	for hole: Array in tiles[key]:
		var center := Vector2(hole[0],hole[1])
		var corners := (hole.size()-3)/2 as int
		var radius := float(hole[2])
		var outlines: Array[PackedVector3Array] = []
		var y: float = terrain.land_height(center.x,center.y)
		# Each ring uses the very same nine radial samples as roadwear.drawPots.
		for j in RINGS.size():
			var loop := PackedVector3Array()
			for i in corners:
				var offset := Vector2(hole[3+i*2],hole[4+i*2])
				var q: Vector2 = center+offset*float(RINGS[j])+Vector2(SHIFTS[j])*radius
				loop.append(Vector3(q.x,terrain.at(q.x,q.y,y)+0.023+0.001*j,q.y))
			outlines.append(loop)
		for j in RINGS.size():
			var ring: PackedVector3Array = outlines[j]
			var base := positions.size()
			positions.append_array(ring)
			if j+1 < outlines.size():
				positions.append_array(outlines[j+1])
				for i in corners:
					var next := (i+1)%corners
					indices.append_array(PackedInt32Array([base+i,base+corners+i,base+next,base+next,base+corners+i,base+corners+next]))
			else:
				for i in range(1,corners-1):
					indices.append_array(PackedInt32Array([base,base+i,base+i+1]))
			while colors.size() < positions.size():
				colors.append(TONES[j])
				normals.append(Vector3.UP)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = positions
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	mesh.surface_set_material(0,paint)
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.visibility_range_end = 150.0
	node.visibility_range_end_margin = 15.0
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	meshes[key] = node
