extends Node3D

const MESHES := "res://assets/south-outer-tree-meshes.glb"
const CROWN := preload("res://crown_core.gdshader")
const GRASS := preload("res://grass.gdshader")
const LEAF := preload("res://leaf_cards.gdshader")
const LEAF_ATLAS := preload("res://assets/leaf-sprigs.png")
const PLANTING := preload("res://south_planting_catalog.gd")
const TILE := PLANTING.TILE
const SHOW_RANGE := 365.0
const KEEP_RANGE := 430.0
const TREE_VIEW := 350.0
const COVER_VIEW := 118.0

var focus: Node3D
var planting := PLANTING.new()
var active := {}
var pending: Array[Vector2i] = []
var retire: Array[Vector2i] = []
var meshes: Array[Mesh] = []
var sprigs: Array[Mesh] = []
var paint := ShaderMaterial.new()
var meadow_paint := ShaderMaterial.new()
var leaf_paint := ShaderMaterial.new()
var shrub: Mesh
var meadow: Mesh
var stones := SphereMesh.new()
var trunk := CylinderMesh.new()
var branched: ArrayMesh
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
		if i < 5:
			sprigs.append((sample.get_node("Sprigs"+str(i)) as MeshInstance3D).mesh)
	shrub = (sample.get_node("Shrub") as MeshInstance3D).mesh
	sample.free()
	paint.shader = CROWN
	meadow_paint.shader = GRASS
	leaf_paint.shader = LEAF
	leaf_paint.set_shader_parameter(&"leaf_atlas",LEAF_ATLAS)
	meadow = _meadow_mesh()
	var stone_paint := StandardMaterial3D.new()
	stone_paint.albedo_color = Color("#777260")
	stone_paint.roughness = 0.96
	stones.material = stone_paint
	stones.radius = 0.67
	stones.height = 0.68
	stones.radial_segments = 6
	stones.rings = 2
	var bark := StandardMaterial3D.new()
	bark.albedo_color = Color("#664d3a")
	trunk.material = bark
	trunk.top_radius = .14
	trunk.bottom_radius = .31
	trunk.height = 5.4
	trunk.radial_segments = 6
	trunk.rings = 1
	branched = _branched_trunk(bark)
	roots.radius = .33
	roots.height = 3.5
	planting.load_tiles()

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
	var center := PLANTING.tile_at(point)
	var distance := ceili(SHOW_RANGE/TILE)
	for z in range(center.y-distance,center.y+distance+1):
		for x in range(center.x-distance,center.x+distance+1):
			var id := Vector2i(x,z)
			if planting.tiles.has(id) and not active.has(id) and _tile_center(id).distance_squared_to(point) < SHOW_RANGE*SHOW_RANGE:
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
	var trunks := [[],[]]
	var low := [[],[],[]]
	var bytes := planting.bytes
	var rows: Vector2i = planting.tiles[id]
	for row in range(rows.x,rows.y,PLANTING.PLANT_BYTES):
		var at := Vector3(bytes.decode_u16(row)*0.01-TILE*0.5,bytes.decode_s16(row+2)*0.01,
			bytes.decode_u16(row+4)*0.01-TILE*0.5)
		var size := bytes[row+6]*0.01
		var kind := int(bytes[row+7])
		var rotation := Basis(Vector3.UP,bytes[row+8]*TAU/256.0)
		var pose := Transform3D(rotation.scaled(Vector3.ONE*size),at)
		if kind >= PLANTING.SHRUB:
			if kind == PLANTING.STONE:
				pose.origin.y += .08
			low[kind-PLANTING.SHRUB].append(pose)
			continue
		boughs[kind].append(pose)
		var trunk_width := sqrt(size)
		trunks[int(kind == 5)].append(Transform3D(rotation.scaled(Vector3(trunk_width,size,trunk_width)),
			at+Vector3.UP*size*2.65))
		var solid := CollisionShape3D.new()
		solid.shape = roots
		solid.position = at + Vector3.UP*1.65
		node.add_child(solid)
	_batch(node,branched,trunks[0],null,TREE_VIEW)
	_batch(node,trunk,trunks[1],null,TREE_VIEW)
	for i in meshes.size():
		_batch(node,meshes[i],boughs[i],paint,TREE_VIEW)
	for i in sprigs.size():
		_batch(node,sprigs[i],boughs[i],leaf_paint,COVER_VIEW)
	_batch(node,shrub,low[0],paint,COVER_VIEW)
	_batch(node,meadow,low[1],meadow_paint,COVER_VIEW)
	_batch(node,stones,low[2],null,COVER_VIEW)
	add_child(node)
	return node


func _batch(parent: Node3D, mesh: Mesh, poses: Array, material: Material, distance: float) -> void:
	if poses.is_empty():
		return
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = mesh
	instances.instance_count = poses.size()
	for i in poses.size():
		instances.set_instance_transform(i,poses[i])
	var layer := MultiMeshInstance3D.new()
	layer.multimesh = instances
	layer.material_override = material
	layer.visibility_range_end = distance
	layer.visibility_range_end_margin = 24.0
	if distance == COVER_VIEW:
		layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(layer)


func _meadow_mesh() -> ArrayMesh:
	var random := RandomNumberGenerator.new()
	random.seed = 283
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in 72:
		var angle := random.randf()*TAU
		var spread := random.randf()*1.48
		var at := Vector3(cos(angle)*spread,-.10,sin(angle)*spread)
		var leaf := Vector3(cos(angle+.7),0,sin(angle+.7))
		var width := random.randf_range(.035,.085)
		var tall := random.randf_range(.28,.78)
		var tone := random.randf()
		mesh.set_color(Color(.055,.098,.027,0.0).lerp(Color(.12,.167,.043,0.0),tone))
		mesh.add_vertex(at-leaf*width)
		mesh.add_vertex(at+leaf*width)
		mesh.set_color(Color(.15,.23,.055,1.0).lerp(Color(.29,.31,.097,1.0),tone))
		mesh.add_vertex(at+Vector3.UP*tall+leaf*.24)
	return mesh.commit()


func _branched_trunk(bark: Material) -> ArrayMesh:
	var stem := SurfaceTool.new()
	stem.begin(Mesh.PRIMITIVE_TRIANGLES)
	stem.append_from(trunk,0,Transform3D.IDENTITY)
	var limb := CylinderMesh.new()
	limb.bottom_radius = .12
	limb.top_radius = .04
	limb.height = 1.0
	limb.radial_segments = 5
	limb.rings = 1
	for i in range(1,5):
		var angle := i*2.39996
		var start := Vector3(0.0,.50+i*.26,0.0)
		var end := Vector3(cos(angle)*2.05,3.82+sin(angle)*.42,sin(angle)*2.05)
		var axis := start.direction_to(end)
		var rotation := Quaternion(Vector3.UP,axis)
		var shape := Basis(rotation).scaled_local(Vector3(1.0,start.distance_to(end),1.0))
		stem.append_from(limb,0,Transform3D(shape,(start+end)*.5))
	stem.set_material(bark)
	return stem.commit()


func _tile_center(id: Vector2i) -> Vector2:
	return (Vector2(id)+Vector2(.5,.5))*TILE
