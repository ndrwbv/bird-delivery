extends Node3D

const MESHES := "res://assets/south-outer-tree-meshes.glb"
const CROWN := preload("res://crown_core.gdshader")
const TILE := 64.0
const SHOW_RANGE := 270.0
const KEEP_RANGE := 340.0

var focus: Node3D
var tiles := {}
var active := {}
var pending: Array[Vector2i] = []
var retire: Array[Vector2i] = []
var meshes: Array[Mesh] = []
var paint := ShaderMaterial.new()
var trunk := CylinderMesh.new()
var roots := CapsuleShape3D.new()
var last := Vector2i.MAX


func setup(observer: Node3D) -> void:
	focus = observer
	var scene: PackedScene
	if ResourceLoader.exists(MESHES):
		scene = load(MESHES)
	var sample: Node3D
	if scene:
		sample = scene.instantiate() as Node3D
	else:
		var gltf := GLTFDocument.new()
		var data := GLTFState.new()
		if gltf.append_from_file(MESHES,data) == OK:
			sample = gltf.generate_scene(data)
	if not sample:
		push_error("Could not load the South tree meshes")
		set_process(false)
		return
	for i in 6:
		meshes.append((sample.get_node("Crown"+str(i)) as MeshInstance3D).mesh)
	sample.free()
	paint.shader = CROWN
	var bark := StandardMaterial3D.new()
	bark.albedo_color = Color("#664d3a")
	trunk.material = bark
	trunk.top_radius = .14
	trunk.bottom_radius = .31
	trunk.height = 5.4
	trunk.radial_segments = 6
	trunk.rings = 1
	roots.radius = .33
	roots.height = 3.5
	var catalog: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-outer-trees.json"))
	for data: Array in catalog:
		var at := _tile(Vector2(data[0],data[2]))
		if not tiles.has(at):
			tiles[at] = []
		tiles[at].append(data)


func _process(_delta: float) -> void:
	var pose := focus.global_position
	var point := Vector2(pose.x,pose.z)
	var current := Vector2i((point/24.0).floor())
	if current != last:
		last = current
		_refresh(point)
	if not pending.is_empty():
		var id := pending.pop_back() as Vector2i
		active[id] = _attach(id)
	if not retire.is_empty():
		var id := retire.pop_back() as Vector2i
		active[id].queue_free()
		active.erase(id)


func _refresh(point: Vector2) -> void:
	pending.clear()
	retire.clear()
	var center := _tile(point)
	var distance := ceili(SHOW_RANGE/TILE)
	for z in range(center.y-distance,center.y+distance+1):
		for x in range(center.x-distance,center.x+distance+1):
			var id := Vector2i(x,z)
			if tiles.has(id) and not active.has(id) and _tile_center(id).distance_squared_to(point) < SHOW_RANGE*SHOW_RANGE:
				pending.append(id)
	for id: Vector2i in active:
		if _tile_center(id).distance_squared_to(point) > KEEP_RANGE*KEEP_RANGE:
			retire.append(id)
	pending.sort_custom(func(a: Vector2i,b: Vector2i): return _tile_center(a).distance_squared_to(point) > _tile_center(b).distance_squared_to(point))


func _attach(id: Vector2i) -> Node3D:
	var center := _tile_center(id)
	var node := StaticBody3D.new()
	node.position = Vector3(center.x,0,center.y)
	node.collision_layer = 1
	node.collision_mask = 0
	var boughs := [[],[],[],[],[],[]]
	var trunks: Array[Transform3D] = []
	for row: Array in tiles[id]:
		var at := Vector3(row[0]-center.x,row[1],row[2]-center.y)
		var size := float(row[3])
		var axes := Basis(Vector3.UP,float(row[5])).scaled(Vector3.ONE*size)
		boughs[int(row[4])].append(Transform3D(axes,at))
		var trunk_width := sqrt(size)
		trunks.append(Transform3D(axes.orthonormalized().scaled(Vector3(trunk_width,size,trunk_width)),at+Vector3.UP*size*2.65))
		var solid := CollisionShape3D.new()
		solid.shape = roots
		solid.position = at + Vector3.UP*1.65
		node.add_child(solid)
	_batch(node,trunk,trunks,null)
	for i in meshes.size():
		if not boughs[i].is_empty():
			_batch(node,meshes[i],boughs[i],paint)
	add_child(node)
	return node


func _batch(parent: Node3D, mesh: Mesh, poses: Array, material: Material) -> void:
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = mesh
	instances.instance_count = poses.size()
	for i in poses.size():
		instances.set_instance_transform(i,poses[i])
	var layer := MultiMeshInstance3D.new()
	layer.multimesh = instances
	layer.material_override = material
	layer.visibility_range_end = 264.0
	layer.visibility_range_end_margin = 24.0
	parent.add_child(layer)


func _tile(point: Vector2) -> Vector2i:
	return Vector2i((point/TILE).floor())


func _tile_center(id: Vector2i) -> Vector2:
	return (Vector2(id)+Vector2(.5,.5))*TILE
