extends Node3D

const MESHES := "res://assets/south-outer-tree-meshes.glb"
const CROWN := preload("res://crown_core.gdshader")
const GRASS := preload("res://grass.gdshader")
const LEAF := preload("res://leaf_cards.gdshader")
const LEAF_ATLAS := preload("res://assets/leaf-sprigs.png")
const CANOPY_ATLAS := preload("res://assets/shrub-leaves.png")
const PLANTING := preload("res://south_planting_catalog.gd")
const TILE := PLANTING.TILE
const FAR_LOAD := 638.0
const FAR_KEEP := 708.0
const NEAR_LOAD := 212.0
const NEAR_KEEP := 255.0
const TREE_VIEW := 179.0
const COVER_VIEW := 119.0

var focus: Node3D
var planting := PLANTING.new()
var distant := {}
var nearby := {}
var pending_far: Array[Vector2i] = []
var pending_near: Array[Vector2i] = []
var retire_far: Array[Vector2i] = []
var retire_near: Array[Vector2i] = []
var meshes: Array[Mesh] = []
var sprigs: Array[Mesh] = []
var paint := ShaderMaterial.new()
var meadow_paint := ShaderMaterial.new()
var leaf_paint := ShaderMaterial.new()
var far_meshes: Array[Mesh] = []
var shrub: Mesh
var shrub_leaves: Mesh
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
		sprigs.append((sample.get_node("Sprigs"+str(i)) as MeshInstance3D).mesh)
	shrub = (sample.get_node("Shrub") as MeshInstance3D).mesh
	shrub_leaves = (sample.get_node("ShrubLeaves") as MeshInstance3D).mesh
	far_meshes.assign([(sample.get_node("FarDeciduous") as MeshInstance3D).mesh,
		(sample.get_node("FarSpruce") as MeshInstance3D).mesh])
	sample.free()
	paint.shader = CROWN
	meadow_paint.shader = GRASS
	leaf_paint.shader = LEAF
	leaf_paint.set_shader_parameter(&"leaf_atlas",LEAF_ATLAS)
	leaf_paint.set_shader_parameter(&"canopy_atlas",CANOPY_ATLAS)
	leaf_paint.set_shader_parameter(&"leaf_mode",4)
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
	var camera := get_viewport().get_camera_3d()
	if camera and camera.global_position.distance_squared_to(pose) > 72.0*72.0:
		pose = camera.global_position
	var point := Vector2(pose.x,pose.z)
	var current := Vector2i((point/24.0).floor())
	if current != last:
		last = current
		_refresh(point)
	if not pending_near.is_empty():
		var id: Vector2i = pending_near.pop_back()
		nearby[id] = _attach(id,true)
		_set_far_start(id,TREE_VIEW-9.0)
	for _i in mini(2,pending_far.size()):
		var id: Vector2i = pending_far.pop_back()
		distant[id] = _attach(id,false)
		if nearby.has(id):
			_set_far_start(id,TREE_VIEW-9.0)
	if not retire_near.is_empty():
		var id: Vector2i = retire_near.pop_back()
		nearby[id].queue_free()
		nearby.erase(id)
		_set_far_start(id,0.0)
	if not retire_far.is_empty():
		var id: Vector2i = retire_far.pop_back()
		distant[id].queue_free()
		distant.erase(id)


func _refresh(point: Vector2) -> void:
	pending_far.clear()
	pending_near.clear()
	retire_far.clear()
	retire_near.clear()
	var center := PLANTING.tile_at(point)
	var reach := ceili(FAR_LOAD/TILE)
	for z in range(center.y-reach,center.y+reach+1):
		for x in range(center.x-reach,center.x+reach+1):
			var id := Vector2i(x,z)
			if not planting.tiles.has(id):
				continue
			var distance := _tile_center(id).distance_squared_to(point)
			if distance <= FAR_LOAD*FAR_LOAD and not distant.has(id):
				pending_far.append(id)
			if distance <= NEAR_LOAD*NEAR_LOAD and not nearby.has(id):
				pending_near.append(id)
	for id: Vector2i in distant:
		if _tile_center(id).distance_squared_to(point) > FAR_KEEP*FAR_KEEP:
			retire_far.append(id)
	for id: Vector2i in nearby:
		if _tile_center(id).distance_squared_to(point) > NEAR_KEEP*NEAR_KEEP:
			retire_near.append(id)
	var nearer := func(a: Vector2i,b: Vector2i): return _tile_center(a).distance_squared_to(point) > _tile_center(b).distance_squared_to(point)
	pending_far.sort_custom(nearer)
	pending_near.sort_custom(nearer)


func _attach(id: Vector2i, detail: bool) -> Node3D:
	var center := _tile_center(id)
	var node: Node3D = StaticBody3D.new() if detail else Node3D.new()
	node.position = Vector3(center.x,0,center.y)
	if detail:
		var body := node as StaticBody3D
		body.collision_layer = 1
		body.collision_mask = 0
	var boughs := [[],[],[],[],[],[]]
	var trunks := [[],[]]
	var low := [[],[],[]]
	var far := [[],[]]
	var floor_y := INF
	var peak_y := -INF
	var bytes := planting.bytes
	var rows: Vector2i = planting.tiles[id]
	for row in range(rows.x,rows.y,PLANTING.PLANT_BYTES):
		var at := Vector3(bytes.decode_u16(row)*0.01-TILE*0.5,bytes.decode_s16(row+2)*0.01,
			bytes.decode_u16(row+4)*0.01-TILE*0.5)
		floor_y = minf(floor_y,at.y)
		peak_y = maxf(peak_y,at.y)
		var size := bytes[row+6]*0.01
		var kind := int(bytes[row+7])
		var rotation := Basis(Vector3.UP,bytes[row+8]*TAU/256.0)
		var lateral := 0.92+0.18*float(bytes[row+8]%19)/18.0
		var pose := Transform3D(rotation.scaled(Vector3(size*lateral,size,size/lateral)),at)
		if not detail:
			if kind < PLANTING.SHRUB:
				far[int(kind == 5)].append(pose)
			continue
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
	# Identical bounds keep the distance switch aligned for all species in this tile.
	var bounds := AABB(Vector3(-TILE*.5-13.0,floor_y-0.25,-TILE*.5-13.0),
		Vector3(TILE+26.0,peak_y-floor_y+22.0,TILE+26.0))
	if detail:
		_batch(node,branched,trunks[0],null,TREE_VIEW,bounds,true)
		_batch(node,trunk,trunks[1],null,TREE_VIEW,bounds,true)
		for i in meshes.size():
			_batch(node,meshes[i],boughs[i],paint,TREE_VIEW,bounds,true)
			_batch(node,sprigs[i],boughs[i],leaf_paint,COVER_VIEW,bounds,false)
		_batch(node,shrub,low[0],paint,COVER_VIEW,bounds,false)
		_batch(node,shrub_leaves,low[0],leaf_paint,COVER_VIEW,bounds,false)
		_batch(node,meadow,low[1],meadow_paint,COVER_VIEW,bounds,false)
		_batch(node,stones,low[2],null,COVER_VIEW,bounds,false)
	else:
		for i in far_meshes.size():
			_batch(node,far_meshes[i],far[i],paint,0.0,bounds,false)
	add_child(node)
	return node


func _set_far_start(id: Vector2i, distance: float) -> void:
	if distant.has(id):
		for layer: MultiMeshInstance3D in distant[id].get_children():
			layer.visibility_range_begin = distance


func _batch(parent: Node3D, mesh: Mesh, poses: Array, material: Material, distance: float, bounds: AABB,
		shadows: bool) -> void:
	if poses.is_empty():
		return
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = mesh
	instances.instance_count = poses.size()
	for i in poses.size():
		instances.set_instance_transform(i,poses[i])
	instances.custom_aabb = bounds
	var layer := MultiMeshInstance3D.new()
	layer.multimesh = instances
	layer.material_override = material
	layer.visibility_range_end = distance
	if not shadows:
		layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(layer)


func _meadow_mesh() -> ArrayMesh:
	var random := RandomNumberGenerator.new()
	random.seed = 283
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in 48:
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
