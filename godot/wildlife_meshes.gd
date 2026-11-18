extends RefCounted

# Flattened local mesh data from the published fauna.js and cats.js model factories.
# Decode off the main thread; the caller creates at most one new surface per tick.
const KINDS := ["moose","cow","hare","fox","cat0","cat1","cat2","cat3","cat4","cat5","shore"]
var meshes := {}
var pending := {}
var queue: Array[String] = []
var mutex := Mutex.new()

func request(kind: String) -> void:
	if meshes.has(kind) or pending.has(kind) or not KINDS.has(kind):
		return
	pending[kind] = WorkerThreadPool.add_task(_decode.bind(kind))

func _decode(kind: String) -> void:
	var path := "res://assets/summer_shore.bin" if kind=="shore" else "res://assets/wildlife/"+kind+".bin"
	var data := FileAccess.get_file_as_bytes(path).to_float32_array()
	var count := data.size()/14
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	vertices.resize(count)
	normals.resize(count)
	colors.resize(count)
	uv.resize(count)
	uv2.resize(count)
	for i in count:
		var k := i*3
		vertices[i] = Vector3(data[k],data[k+1],data[k+2])
		k += count*3
		normals[i] = Vector3(data[k],data[k+1],data[k+2])
		k = count*6+i*4
		colors[i] = Color(data[k],data[k+1],data[k+2],1)
		k = count*10+i*2
		uv[i] = Vector2(data[k],data[k+1])
		k += count*2
		uv2[i] = Vector2(data[k],data[k+1])
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_TEX_UV2] = uv2
	mutex.lock()
	_decoded[kind] = arrays
	queue.append(kind)
	mutex.unlock()

var _decoded := {}

func upload_one() -> void:
	mutex.lock()
	if queue.is_empty():
		mutex.unlock()
		return
	var kind: String = queue.pop_front()
	var arrays: Array = _decoded[kind]
	_decoded.erase(kind)
	mutex.unlock()
	var mesh := ArrayMesh.new()
	if not arrays[Mesh.ARRAY_VERTEX].is_empty():
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	meshes[kind] = mesh
	WorkerThreadPool.wait_for_task_completion(pending[kind])
	pending.erase(kind)

func dispose() -> void:
	for task in pending.values():
		WorkerThreadPool.wait_for_task_completion(task)
	pending.clear()
