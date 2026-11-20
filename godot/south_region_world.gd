extends Node3D

const GROUND := preload("res://south_region_ground.gd")
const GEOMETRY := preload("res://south_region_mesh.gd")
const OVERVIEW := preload("res://south_region_overview.gd")
const CHECKPOINT := preload("res://south_region_checkpoint.gd")
const REGION_PAINT := preload("res://south_region_surface.gdshader")
const VIEW_RADIUS := 388.0
const RETAIN_RADIUS := 494.0
const BUILDING_VIEW := 820.0

var ground := GROUND.new()
var builder := GEOMETRY.new()
var paint := ShaderMaterial.new()
var overview := OVERVIEW.new()
var observer: Node3D
var loaded := {}
var pending: Array[Vector2i] = []
var evictions: Array[Vector2i] = []
var last_tile := Vector2i(2147483647,2147483647)
var task := -1
var building_key: Vector2i


func setup(data: Dictionary, core_bounds: Array, detail: RefCounted, car: Node3D) -> void:
	var yards: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-yard-spaces.json"))
	data.yard_spaces = yards if yards is Dictionary else {}
	ground.setup(data, core_bounds, detail)
	builder.setup(data,ground)
	observer = car
	paint.shader = REGION_PAINT
	overview.setup(ground,builder.terrain_bounds,GEOMETRY.TILE,builder.water_y)
	add_child(overview)
	for gate: Dictionary in data.gates:
		var checkpoint := CHECKPOINT.new()
		add_child(checkpoint)
		checkpoint.setup(gate,ground,paint)
	for key: Vector2i in builder.house_blocks:
		var block := builder.make_house_block(key)
		var node := Node3D.new()
		node.name = "Buildings_%d_%d" % [key.x,key.y]
		_attach_surface(node,block.surface,BUILDING_VIEW)
		var shape := ConcavePolygonShape3D.new()
		shape.backface_collision = true
		shape.set_faces(block.walls)
		var collision := CollisionShape3D.new()
		collision.shape = shape
		var body := StaticBody3D.new()
		body.collision_layer = 1
		body.collision_mask = 0
		body.add_child(collision)
		node.add_child(body)
		add_child(node)


func _process(_delta: float) -> void:
	if not is_instance_valid(observer):
		return
	var focus := observer.global_position
	var lead := Vector2.ZERO
	var camera := get_viewport().get_camera_3d()
	if camera and camera.global_position.distance_squared_to(focus) > 45.0*45.0:
		focus = camera.global_position
	elif observer is CharacterBody3D:
		var car := observer as CharacterBody3D
		lead = Vector2(car.velocity.x,car.velocity.z).limit_length(45.0)*2.2
	var at := Vector2(focus.x,focus.z)
	var current := builder.tile_at(at)
	if current != last_tile:
		_refresh(at, lead, current)
	var mask_changed := false
	if task != -1 and WorkerThreadPool.is_task_completed(task):
		WorkerThreadPool.wait_for_task_completion(task)
		task = -1
		if builder.tile_rect(building_key).get_center().distance_to(at) <= RETAIN_RADIUS:
			loaded[building_key] = _install_mesh(building_key)
			overview.mark(building_key,true)
			mask_changed = true
		builder.surface_arrays = []
	if task == -1 and not pending.is_empty():
		building_key = pending.pop_back()
		task = WorkerThreadPool.add_task(builder.prepare.bind(building_key),false,"South district scenery")
	# A teleport can retire many old chunks. Free at most one per frame.
	if not evictions.is_empty():
		var key: Vector2i = evictions.pop_back()
		var tile: Node3D = loaded[key]
		tile.queue_free()
		loaded.erase(key)
		overview.mark(key,false)
		mask_changed = true
	if mask_changed:
		overview.upload()


func _refresh(at: Vector2, lead: Vector2, current: Vector2i) -> void:
	last_tile = current
	pending.clear()
	evictions.clear()
	for key: Vector2i in loaded:
		if builder.tile_rect(key).get_center().distance_to(at) > RETAIN_RADIUS:
			evictions.append(key)
	var priority := {}
	var reach := ceili(VIEW_RADIUS / GEOMETRY.TILE)
	for z in range(current.y-reach, current.y+reach+1):
		for x in range(current.x-reach, current.x+reach+1):
			var key := Vector2i(x,z)
			if loaded.has(key) or (task != -1 and key == building_key):
				continue
			var area := builder.tile_rect(key)
			if not area.intersects(builder.terrain_bounds) or ground.core.encloses(area):
				continue
			var center := area.get_center()
			var distance := center.distance_to(at)
			if distance <= VIEW_RADIUS:
				priority[key] = distance * 0.7 + center.distance_to(at+lead) * 0.3
				pending.append(key)
	pending.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return float(priority[a]) > float(priority[b]))


func _install_mesh(key: Vector2i) -> Node3D:
	var node := Node3D.new()
	node.name = "Region_%d_%d" % [key.x,key.y]
	_attach_surface(node,builder.surface_arrays,0.0)
	add_child(node)
	return node


func _attach_surface(node: Node3D, arrays: Array, view_distance: float) -> void:
	if arrays.is_empty() or arrays[Mesh.ARRAY_VERTEX] == null:
		return
	var combined := ArrayMesh.new()
	combined.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var visible_mesh := MeshInstance3D.new()
	visible_mesh.mesh = combined
	visible_mesh.material_override = paint
	visible_mesh.visibility_range_end = view_distance
	node.add_child(visible_mesh)


func _exit_tree() -> void:
	if task != -1:
		WorkerThreadPool.wait_for_task_completion(task)
		task = -1
