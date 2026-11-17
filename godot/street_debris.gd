extends RigidBody3D

var time_left := 18.0


func setup(geometry: ArrayMesh, paint: Material, at: Vector3, impulse: Vector3, kind: String) -> void:
	# Centre the body on the vertices belonging to this fragment. The collision
	# hull follows the piece, including when it is resting on a long edge.
	var source := geometry.surface_get_arrays(0)
	var vertices: PackedVector3Array = source[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = source[Mesh.ARRAY_INDEX]
	var bounds := AABB(vertices[indices[0]],Vector3.ZERO)
	for index in indices:
		bounds = bounds.expand(vertices[index])
	var pivot := bounds.get_center()
	for i in vertices.size():
		vertices[i] -= pivot
	source[Mesh.ARRAY_VERTEX] = vertices
	var piece := ArrayMesh.new()
	piece.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,source)
	var render := MeshInstance3D.new()
	render.mesh = piece
	render.material_override = paint
	add_child(render)

	var support := PackedVector3Array()
	var distinct: Dictionary = {}
	for index in indices:
		var point := vertices[index]
		var key := Vector3i(roundi(point.x*100),roundi(point.y*100),roundi(point.z*100))
		if not distinct.has(key):
			distinct[key] = true
			support.append(point)
	var collider := CollisionShape3D.new()
	var volume := ConvexPolygonShape3D.new()
	volume.points = support
	volume.margin = 0.019
	if support.size() >= 4:
		collider.shape = volume
	else:
		var box := BoxShape3D.new()
		box.size = bounds.size.max(Vector3.ONE*0.02)
		collider.shape = box
	add_child(collider)

	collision_layer = 256
	collision_mask = 1 | 8 | 64
	mass = 3.0 if kind in ["lamp","stop","can"] else 0.82
	linear_damp = 0.55
	angular_damp = 0.70
	continuous_cd = true
	var material := PhysicsMaterial.new()
	material.friction = 0.76
	material.bounce = 0.18
	physics_material_override = material
	position = at+pivot
	var strength := impulse.length()
	linear_velocity = impulse.normalized()*clampf(strength*0.34,0.8,10.0)
	linear_velocity += Vector3(randf_range(-0.7,0.7),clampf(strength*0.17,0.5,4.4),randf_range(-0.7,0.7))
	angular_velocity = Vector3(randf_range(1.8,5.0),randf_range(-2.4,2.4),randf_range(-5.0,-1.7))
	reset_physics_interpolation()


func _process(delta: float) -> void:
	time_left -= delta
	if time_left <= 0.0:
		queue_free()
