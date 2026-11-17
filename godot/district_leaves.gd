extends Node3D

const LEAF_ATLAS := preload("res://assets/leaf-sprigs.png")
const CANOPY_ATLAS := preload("res://assets/shrub-leaves.png")
const LEAF_SHADER := preload("res://leaf_cards.gdshader")
const FLOATS_PER_SPRIG := 16
const CHUNK_BOUND := Vector3(61.0,74.0,61.0)

var camera: Camera3D
var near_paint := ShaderMaterial.new()
var far_paint := ShaderMaterial.new()
var far_only := ShaderMaterial.new()
var verge_paint := ShaderMaterial.new()
var face := QuadMesh.new()
var data: FileAccess
var catalog: Array
var visible_tiles: Dictionary
var cached_tiles: Dictionary
var pending: Array[Vector2i] = []
var last_cell := Vector2i(-999,-999)
var frame := 0


func setup(chase: Camera3D, start: Vector2) -> void:
	camera = chase
	_setup_paint(near_paint,1)
	_setup_paint(far_paint,2)
	_setup_paint(far_only,3)
	_setup_paint(verge_paint,0)
	catalog = JSON.parse_string(FileAccess.get_file_as_string("res://assets/leaf-tiles.json"))
	data = FileAccess.open("res://assets/leaf-tiles.bin",FileAccess.READ)
	# Small crowns are present immediately. Only the nearest dense leaf layers stream in.
	for i in catalog.size():
		_load(Vector2i(i,2))
	_rebuild_pending(start)
	# A few tiles make up the first screen, the rest arrive after the first frame.
	for _i in mini(4,pending.size()):
		_load(pending.pop_front())


func _setup_paint(paint: ShaderMaterial, mode: int) -> void:
	paint.shader = LEAF_SHADER
	paint.set_shader_parameter(&"leaf_atlas",LEAF_ATLAS)
	paint.set_shader_parameter(&"canopy_atlas",CANOPY_ATLAS)
	paint.set_shader_parameter(&"leaf_mode",mode)


func _process(_delta: float) -> void:
	var eye := camera.global_position
	near_paint.set_shader_parameter(&"view_origin",eye)
	far_paint.set_shader_parameter(&"view_origin",eye)
	var at := Vector2(eye.x,eye.z)
	var cell := Vector2i(floori(at.x/18.0),floori(at.y/18.0))
	if last_cell != cell:
		last_cell = cell
		_rebuild_pending(at)
	frame += 1
	if frame%2 == 0 and not pending.is_empty():
		_load(pending.pop_front())


func _rebuild_pending(at: Vector2) -> void:
	pending.clear()
	for i in catalog.size():
		var row: Array = catalog[i]
		var offset := at.distance_squared_to(Vector2(float(row[0]),float(row[1])))
		var keep_near := offset < 111.0*111.0
		if keep_near and not cached_tiles.has(i):
			pending.append(Vector2i(i,1))
		elif offset > 136.0*136.0 and cached_tiles.has(i):
			cached_tiles[i].queue_free()
			cached_tiles.erase(i)
			if visible_tiles.has(i):
				visible_tiles[i].material_override = far_only
	var view := -camera.global_basis.z
	var facing := Vector2(view.x,view.z).normalized()
	pending.sort_custom(func(a:Vector2i,b:Vector2i):
		var ra: Array = catalog[a.x]
		var rb: Array = catalog[b.x]
		var a_to := Vector2(ra[0],ra[1])-at
		var b_to := Vector2(rb[0],rb[1])-at
		var da := a_to.length_squared()*(1.0-0.60*maxf(0.0,facing.dot(a_to.normalized())))
		var db := b_to.length_squared()*(1.0-0.60*maxf(0.0,facing.dot(b_to.normalized())))
		return da < db)


func _load(request: Vector2i) -> void:
	var row: Array = catalog[request.x]
	var near := request.y == 1
	var offset := int(row[2] if near else row[4])
	var count := int(row[3] if near else row[5])
	if count <= 0:
		return
	data.seek(offset)
	var buffer := data.get_buffer(count*FLOATS_PER_SPRIG*4).to_float32_array()
	var batch := MultiMeshInstance3D.new()
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_custom_data = true
	multimesh.mesh = face
	multimesh.instance_count = count
	multimesh.buffer = buffer
	multimesh.custom_aabb = AABB(Vector3(-30.5,-18.0,-30.5),CHUNK_BOUND)
	batch.multimesh = multimesh
	batch.position = Vector3(row[0],0,row[1])
	batch.material_override = near_paint if near else far_only
	batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if near else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(batch)
	if near:
		cached_tiles[request.x] = batch
		if visible_tiles.has(request.x):
			visible_tiles[request.x].material_override = far_paint
	else:
		visible_tiles[request.x] = batch
