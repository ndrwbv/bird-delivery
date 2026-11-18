extends MeshInstance3D

const STEP := 4.0
const HALF_WIDTH := .28
const MAX_POINTS_PER_FRAME := 38
var ground: RefCounted
var path := PackedVector2Array()
var vertices := PackedVector3Array()
var indices := PackedInt32Array()
var segment := 1
var along := 0.0
var paint := StandardMaterial3D.new()


func setup(terrain: RefCounted) -> void:
	ground = terrain
	paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	paint.cull_mode = BaseMaterial3D.CULL_DISABLED
	paint.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material_override = paint
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	set_process(false)


func set_route(points: Array, back: bool, enabled: bool) -> void:
	path.clear()
	vertices.clear()
	indices.clear()
	mesh = null
	segment = 1
	along = 0
	visible = enabled and points.size() >= 2
	set_process(visible)
	if not visible:
		return
	paint.albedo_color = Color("#57c883c9") if back else Color("#f1913fc9")
	for pair: Array in points:
		var at := Vector2(pair[0],pair[1])
		if path.is_empty() or path[-1].distance_squared_to(at) > .05:
			path.append(at)


func _process(_delta: float) -> void:
	for i in MAX_POINTS_PER_FRAME:
		if segment >= path.size():
			break
		var a := path[segment-1]
		var b := path[segment]
		var span := a.distance_to(b)
		var dir := (b-a)/span
		var at := a + dir * minf(along,span)
		var normal := Vector2(-dir.y,dir.x)
		if along >= span and segment+1 < path.size():
			var next := (path[segment+1]-b).normalized()
			var join := normal+Vector2(-next.y,next.x)
			if join.length_squared() > .01:
				normal = join.normalized()
		var side := normal * HALF_WIDTH
		for p in [at-side,at+side]:
			vertices.append(Vector3(p.x,ground.at(p.x,p.y)+.09,p.y))
		var k := vertices.size()-4
		if k >= 0:
			indices.append_array(PackedInt32Array([k,k+1,k+2,k+1,k+3,k+2]))
		if along >= span:
			segment += 1
			along = STEP
		else:
			along = minf(span,along+STEP)
	if segment >= path.size():
		if not indices.is_empty():
			var arrays := []
			arrays.resize(Mesh.ARRAY_MAX)
			arrays[Mesh.ARRAY_VERTEX] = vertices
			arrays[Mesh.ARRAY_INDEX] = indices
			var ribbon := ArrayMesh.new()
			ribbon.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
			mesh = ribbon
		set_process(false)
