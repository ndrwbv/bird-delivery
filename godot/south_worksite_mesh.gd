extends RefCounted

const DIRECTORY := "res://assets/worksites/"
const CHANNELS := [Mesh.ARRAY_VERTEX,Mesh.ARRAY_NORMAL,Mesh.ARRAY_COLOR,Mesh.ARRAY_INDEX]

# Each surface is compressed separately so an approaching driver never uploads the whole site in one tick.
static func block(file: FileAccess) -> PackedByteArray:
	var packed_size := file.get_32()
	var original_size := file.get_32()
	if packed_size<=0 or original_size<=0 or file.get_position()+packed_size>file.get_length():
		return PackedByteArray()
	var packed := file.get_buffer(packed_size)
	var data := packed.decompress(original_size,FileAccess.COMPRESSION_DEFLATE)
	if data.size()!=original_size:
		return PackedByteArray()
	return data

static func arrays_in(file: FileAccess) -> Array:
	var data := block(file)
	if data.is_empty():
		return []
	var cursor := 0
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	for channel in CHANNELS:
		var length := data.decode_u32(cursor)
		arrays[channel] = data.decode_var(cursor+4)
		cursor += 4+length
	return arrays

static func next(file: FileAccess, paint: Material) -> ArrayMesh:
	var arrays := arrays_in(file)
	if arrays.is_empty():
		return null
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	mesh.surface_set_material(0,paint)
	return mesh

static func instance(parent: Node3D, mesh: Mesh, at := Vector3.ZERO) -> MeshInstance3D:
	var view := MeshInstance3D.new()
	view.mesh = mesh
	view.position = at
	parent.add_child(view)
	return view
