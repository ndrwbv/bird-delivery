extends Node3D

signal prop_lost(id: int)

const MASK_WIDTH := 4096
const PROP_LAYER := 8
const SOFT_KNOCK := 0.4
const POST_KNOCK := 6.0
const MAX_DEBRIS := 28
const DEBRIS := preload("res://street_debris.gd")

var mask_image := Image.create_empty(MASK_WIDTH,1,false,Image.FORMAT_R8)
var mask_texture := ImageTexture.create_from_image(mask_image)
var impact_ground: Node3D
var debris_paint: Material
var batches: Dictionary = {}
var props: Dictionary = {}
var shapes: Dictionary = {}
var down: Dictionary = {}
var fragment_file: FileAccess
var mask_dirty := false
var lamp_scales: Dictionary


func setup(floor: Node3D, paint: Material, street_scales: Dictionary) -> void:
	impact_ground = floor
	debris_paint = paint
	lamp_scales = street_scales
	for item: Dictionary in JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-breakables.json")):
		props[int(item.id)] = item
	var by_tile: Dictionary = {}
	for row: Array in JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-breakable-collision.json")):
		var tile := Vector2i(floori(float(row[1])/32.0),floori(float(row[3])/32.0))
		if not by_tile.has(tile):
			by_tile[tile] = []
		by_tile[tile].append(row)
	for rows: Array in by_tile.values():
		var body := PhysicsServer3D.body_create()
		PhysicsServer3D.body_set_mode(body,PhysicsServer3D.BODY_MODE_STATIC)
		PhysicsServer3D.body_set_collision_layer(body,PROP_LAYER)
		PhysicsServer3D.body_set_collision_mask(body,0)
		var ids := PackedInt32Array()
		for row: Array in rows:
			var half_extent := Vector3(row[4],row[5],row[6])
			var key := Vector3i(roundi(half_extent.x*100),roundi(half_extent.y*100),roundi(half_extent.z*100))
			if not shapes.has(key):
				var shape := PhysicsServer3D.box_shape_create()
				PhysicsServer3D.shape_set_data(shape,Vector3(key)*0.01)
				shapes[key] = shape
			var pose := Transform3D(Basis(Vector3.UP,-float(row[7])),Vector3(row[1],row[2],row[3]))
			PhysicsServer3D.body_add_shape(body,shapes[key],pose)
			ids.append(int(row[0]))
		batches[body] = ids
		PhysicsServer3D.body_set_space(body,get_world_3d().space)
	set_process(false)


func impact(contact: KinematicCollision3D, approach: float, motion: Vector3) -> float:
	var body := contact.get_collider_rid()
	if not batches.has(body):
		return -1.0
	var shape_index := contact.get_collider_shape_index()
	var id: int = batches[body][shape_index]
	if down.has(id):
		return 1.0
	var item: Dictionary = props[id]
	var threshold := POST_KNOCK if item.post else SOFT_KNOCK
	if item.heavy:
		threshold = POST_KNOCK
	if approach <= threshold:
		return -1.0
	PhysicsServer3D.body_set_shape_disabled(body,shape_index,true)
	down[id] = true
	prop_lost.emit(id)
	mask_image.set_pixel(id,0,Color.WHITE)
	mask_dirty = true
	set_process(true)
	_throw_pieces(item,motion)
	if item.post or item.heavy:
		return 0.62
	return 0.91 if item.kind in ["fence","bigfence","bench","table"] else 0.98


func _process(_delta: float) -> void:
	if mask_dirty:
		mask_texture.update(mask_image)
		mask_dirty = false
	set_process(false)


func _throw_pieces(item: Dictionary, motion: Vector3) -> void:
	if fragment_file == null:
		fragment_file = FileAccess.open("res://assets/south-breakables.bin",FileAccess.READ)
		if fragment_file == null:
			return
	var count := int(item.count)
	fragment_file.seek(int(item.offset))
	var fragment_bytes := fragment_file.get_buffer(count*16)
	if fragment_bytes.size() != count*16:
		return
	var points := PackedVector3Array()
	var colors := PackedColorArray()
	var material_tint := Color.WHITE
	if item.kind in ["sign","bin","stop","can"]:
		material_tint = Color(0.61,0.68,0.66)
	var vertical_scale := float(lamp_scales.get(int(item.id),1.0))
	for i in count:
		var offset := i*16
		points.append(Vector3(fragment_bytes.decode_float(offset),fragment_bytes.decode_float(offset+4)*vertical_scale,fragment_bytes.decode_float(offset+8)))
		colors.append(Color8(fragment_bytes[offset+12],fragment_bytes[offset+13],fragment_bytes[offset+14])*material_tint)
	var split: bool = item.kind in ["fence","bigfence"] and count >= 30
	var axis := 0 if float(item.max[0])-float(item.min[0]) > float(item.max[2])-float(item.min[2]) else 2
	var at := Vector3(item.at[0],item.at[1],item.at[2])
	impact_ground.cover(at,14.0)
	var sides: Array[PackedInt32Array] = [PackedInt32Array(),PackedInt32Array()]
	for i in range(0,count,3):
		var side := 0
		if split and points[i][axis]+points[i+1][axis]+points[i+2][axis] > 0.0:
			side = 1
		sides[side].append(i)
		sides[side].append(i+2)
		sides[side].append(i+1)
	for side in sides:
		if side.is_empty():
			continue
		if get_child_count() >= MAX_DEBRIS:
			var oldest := get_child(0)
			remove_child(oldest)
			oldest.queue_free()
		var mesh := ArrayMesh.new()
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = points
		arrays[Mesh.ARRAY_COLOR] = colors
		arrays[Mesh.ARRAY_INDEX] = side
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
		var fragment := DEBRIS.new()
		add_child(fragment)
		fragment.setup(mesh,debris_paint,at,motion,item.kind)


func _exit_tree() -> void:
	for body: RID in batches:
		PhysicsServer3D.free_rid(body)
	for shape: RID in shapes.values():
		PhysicsServer3D.free_rid(shape)
