extends Node3D

const MESHES := "res://assets/south-outer-tree-meshes.glb"
const CROWN := preload("res://crown_core.gdshader")
const GRASS := preload("res://grass.gdshader")
const LEAF := preload("res://leaf_cards.gdshader")
const LEAF_ATLAS := preload("res://assets/leaf-sprigs.png")
const CANOPY_ATLAS := preload("res://assets/shrub-leaves.png")
const PLANTING := preload("res://south_planting_catalog.gd")
const BUILDER := preload("res://south_vegetation_builder.gd")
const TILE := PLANTING.TILE
const NEAR_FADE := Vector2(77.0,169.0)
const SHRUB_FADE := Vector2(36.0,67.0)
const LEAF_FADE := Vector2(44.0,76.0)
const GRASS_FADE := Vector2(23.0,49.0)
const LOAD := [735.0,225.0]
const KEEP := [825.0,285.0]
const SOLID_LOAD := 87.0
const SOLID_KEEP := 111.0
const BARK_STEP := .06

var focus: Node3D
var planting := PLANTING.new()
var worker := BUILDER.new()
var bands := [{},{}]
var pending := [[],[]]
var retire := [[],[]]
var rooted := {}
var root_pending: Array[Vector2i] = []
var root_retire: Array[Vector2i] = []
var root_shapes := {}
var meshes: Array[Mesh] = []
var plant_materials: Array[Material] = []
var paint := ShaderMaterial.new()
var infill_paint := ShaderMaterial.new()
var shrub_paint := ShaderMaterial.new()
var meadow_paint := ShaderMaterial.new()
var leaf_paint := ShaderMaterial.new()
var task := -1
var task_band := 0
var task_key: Vector2i
var next_band := 0
var last_view := Vector2i.MAX
var last_car := Vector2i.MAX


func setup(observer: Node3D) -> void:
	focus = observer
	var sample := _open_meshes()
	if sample == null:
		push_error("Could not load the South tree meshes")
		set_process(false)
		return
	for name_: String in ["Broadleaf","Spruce","Dry","Shrub"]:
		meshes.append((sample.get_node(name_) as MeshInstance3D).mesh)
	meshes.append(_meadow_mesh())
	var stones := SphereMesh.new()
	stones.radius = .67
	stones.height = .68
	stones.radial_segments = 6
	stones.rings = 2
	meshes.append(stones)
	for name_: String in ["Leaves","Needles"]:
		meshes.append((sample.get_node(name_) as MeshInstance3D).mesh)
	sample.free()

	_set_plant_paint(paint,CROWN,Vector2(515.0,635.0))
	paint.set_shader_parameter(&"outer_tree",true)
	_set_plant_paint(infill_paint,CROWN,NEAR_FADE)
	infill_paint.set_shader_parameter(&"outer_tree",true)
	_set_plant_paint(shrub_paint,CROWN,SHRUB_FADE)
	_set_plant_paint(meadow_paint,GRASS,GRASS_FADE)
	_set_plant_paint(leaf_paint,LEAF,LEAF_FADE)
	leaf_paint.set_shader_parameter(&"leaf_atlas",LEAF_ATLAS)
	leaf_paint.set_shader_parameter(&"canopy_atlas",CANOPY_ATLAS)
	leaf_paint.set_shader_parameter(&"leaf_mode",4)
	var stone_paint := StandardMaterial3D.new()
	stone_paint.albedo_color = Color("#777260")
	stone_paint.roughness = .96
	plant_materials.assign([infill_paint,infill_paint,infill_paint,shrub_paint,meadow_paint,stone_paint,leaf_paint,leaf_paint])
	planting.load_tiles()
	worker.planting = planting


func _open_meshes() -> Node3D:
	if ResourceLoader.exists(MESHES):
		var scene := load(MESHES) as PackedScene
		if scene:
			return scene.instantiate() as Node3D
	var gltf := GLTFDocument.new()
	var data := GLTFState.new()
	if gltf.append_from_file(MESHES,data) == OK:
		return gltf.generate_scene(data)
	return null


static func _set_plant_paint(material: ShaderMaterial, shader: Shader, fade: Vector2) -> void:
	material.shader = shader
	material.set_shader_parameter(&"vegetation_distance",fade)


func _process(_delta: float) -> void:
	if not is_instance_valid(focus):
		return
	var car := Vector2(focus.global_position.x,focus.global_position.z)
	var eye := car
	var camera := get_viewport().get_camera_3d()
	if camera:
		eye = Vector2(camera.global_position.x,camera.global_position.z)
	var cell := Vector2i((eye/25.0).floor())
	if cell != last_view:
		last_view = cell
		_refresh_view(eye)
	var car_cell := Vector2i((car/22.0).floor())
	if last_car != car_cell:
		last_car = car_cell
		_refresh_roots(car)
	if not root_pending.is_empty():
		var key: Vector2i = root_pending.pop_back()
		rooted[key] = _root_tile(key)
	if not root_retire.is_empty():
		var key: Vector2i = root_retire.pop_back()
		PhysicsServer3D.free_rid(rooted[key])
		rooted.erase(key)
	if task != -1 and WorkerThreadPool.is_task_completed(task):
		WorkerThreadPool.wait_for_task_completion(task)
		task = -1
		if eye.distance_squared_to(_mid(task_key,task_band)) < float(KEEP[task_band])*float(KEEP[task_band]):
			_install(task_key,task_band,worker.result)
		worker.result = {}
	if task == -1:
		_start_task()
	for band in 2:
		if not retire[band].is_empty():
			var key: Vector2i = retire[band].pop_back()
			bands[band][key].queue_free()
			bands[band].erase(key)


func _refresh_view(eye: Vector2) -> void:
	for band in 2:
		pending[band].clear()
		retire[band].clear()
		var factor := BUILDER.FAR_FACTOR if band == BUILDER.BAND_FAR else 1
		var scale := TILE*factor
		var reach := ceili(float(LOAD[band])/scale)
		var period := Vector2i((eye/scale).floor())
		var loaded: Dictionary = bands[band]
		var radius := float(LOAD[band])
		for z in range(period.y-reach,period.y+reach+1):
			for x in range(period.x-reach,period.x+reach+1):
				var key := Vector2i(x,z)
				if loaded.has(key) or (task != -1 and band == task_band and key == task_key):
					continue
				if eye.distance_squared_to(_mid(key,band)) <= radius*radius and _has_plants(key,factor):
					pending[band].append(key)
		for key: Vector2i in loaded:
			var keep := float(KEEP[band])
			if eye.distance_squared_to(_mid(key,band)) > keep*keep:
				retire[band].append(key)
		pending[band].sort_custom(func(a: Vector2i,b: Vector2i):
			return eye.distance_squared_to(_mid(a,band)) > eye.distance_squared_to(_mid(b,band)))


func _start_task() -> void:
	for band in [next_band,1-next_band]:
		if pending[band].is_empty():
			continue
		task_band = band
		task_key = pending[band].pop_back()
		task = WorkerThreadPool.add_task(worker.prepare.bind(task_key,task_band),false,"South vegetation")
		next_band = 1-band
		return


func _install(key: Vector2i, band: int, data: Dictionary) -> void:
	var node := Node3D.new()
	var center: Vector2 = data.center
	node.position = Vector3(center.x,0,center.y)
	var far := band == BUILDER.BAND_FAR
	var near_limits := [NEAR_FADE.y,NEAR_FADE.y,NEAR_FADE.y,SHRUB_FADE.y,
		GRASS_FADE.y,58.0,LEAF_FADE.y,LEAF_FADE.y]
	var buffers: Array = data.buffers
	for i in buffers.size():
		var buffer: PackedFloat32Array = buffers[i]
		if buffer.is_empty():
			continue
		var instances := MultiMesh.new()
		instances.transform_format = MultiMesh.TRANSFORM_3D
		instances.use_colors = true
		instances.use_custom_data = true
		instances.mesh = meshes[i]
		instances.instance_count = floori(float(buffer.size())/BUILDER.INSTANCE_FLOATS)
		instances.buffer = buffer
		instances.custom_aabb = data.bounds
		var layer := MultiMeshInstance3D.new()
		layer.multimesh = instances
		layer.material_override = paint if far else plant_materials[i]
		if not far:
			# The back edge of the tile can be outside the per-pixel fade
			# while its front is still visible.
			layer.visibility_range_end = float(near_limits[i])+54.0
		if not far:
			layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(layer)
	add_child(node)
	bands[band][key] = node


func _has_plants(key: Vector2i,factor: int) -> bool:
	for z in factor:
		for x in factor:
			if planting.tiles.has(key*factor+Vector2i(x,z)):
				return true
	return false


func _refresh_roots(car: Vector2) -> void:
	root_pending.clear()
	root_retire.clear()
	var cell := PLANTING.tile_at(car)
	for dz in range(-2,3):
		for dx in range(-2,3):
			var key := cell+Vector2i(dx,dz)
			if rooted.has(key) or not planting.tiles.has(key):
				continue
			var tree_rows: Vector3i = planting.tiles[key]
			if tree_rows.x < tree_rows.y and car.distance_squared_to(BUILDER.tile_center(key,1)) <= SOLID_LOAD*SOLID_LOAD:
				root_pending.append(key)
	for key: Vector2i in rooted:
		if car.distance_squared_to(BUILDER.tile_center(key,1)) > SOLID_KEEP*SOLID_KEEP:
			root_retire.append(key)
	root_pending.sort_custom(func(a: Vector2i,b: Vector2i):
		return car.distance_squared_to(BUILDER.tile_center(a,1)) > car.distance_squared_to(BUILDER.tile_center(b,1)))


func _root_tile(key: Vector2i) -> RID:
	var body := PhysicsServer3D.body_create()
	PhysicsServer3D.body_set_mode(body,PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_set_collision_layer(body,1)
	PhysicsServer3D.body_set_collision_mask(body,0)
	var rows: Vector3i = planting.tiles[key]
	var bytes := planting.bytes
	var corner := Vector2(key)*TILE
	PhysicsServer3D.body_set_state(body,PhysicsServer3D.BODY_STATE_TRANSFORM,
		Transform3D(Basis.IDENTITY,Vector3(corner.x,0,corner.y)))
	for row in range(rows.x,rows.y,PLANTING.PLANT_BYTES):
		var bucket := maxi(1,roundi(float(bytes[row+9])*.01/BARK_STEP))
		if not root_shapes.has(bucket):
			var capsule := CapsuleShape3D.new()
			capsule.radius = float(bucket)*BARK_STEP
			capsule.height = 3.6
			root_shapes[bucket] = capsule
		var hull: CapsuleShape3D = root_shapes[bucket]
		var at := Vector3(bytes.decode_u16(row)*.01,bytes.decode_s16(row+2)*.01+1.7,bytes.decode_u16(row+4)*.01)
		PhysicsServer3D.body_add_shape(body,hull.get_rid(),Transform3D(Basis.IDENTITY,at))
	PhysicsServer3D.body_set_space(body,get_world_3d().space)
	return body


func _meadow_mesh() -> ArrayMesh:
	var random := RandomNumberGenerator.new()
	random.seed = 283
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in 30:
		var angle := random.randf()*TAU
		var spread := random.randf()*1.48
		var at := Vector3(cos(angle)*spread,-.10,sin(angle)*spread)
		var leaf := Vector3(cos(angle+.7),0,sin(angle+.7))
		var width := random.randf_range(.041,.095)
		var tall := random.randf_range(.28,.78)
		var tone := random.randf()
		mesh.set_color(Color(.055,.098,.027,0.0).lerp(Color(.12,.167,.043,0.0),tone))
		mesh.add_vertex(at-leaf*width)
		mesh.add_vertex(at+leaf*width)
		mesh.set_color(Color(.15,.23,.055,1.0).lerp(Color(.29,.31,.097,1.0),tone))
		mesh.add_vertex(at+Vector3.UP*tall+leaf*.24)
	return mesh.commit()


func _mid(id: Vector2i, band: int) -> Vector2:
	return BUILDER.tile_center(id,BUILDER.FAR_FACTOR if band == BUILDER.BAND_FAR else 1)


func _exit_tree() -> void:
	if task != -1:
		WorkerThreadPool.wait_for_task_completion(task)
		task = -1
	for body: RID in rooted.values():
		PhysicsServer3D.free_rid(body)
	rooted.clear()
