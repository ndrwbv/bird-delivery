extends RigidBody3D

var lifetime := 15.0


func configure(mesh: ArrayMesh, at: Transform3D, points: PackedVector3Array, shot: Vector3) -> void:
	var bounds := mesh.get_aabb()
	var center := bounds.get_center()
	var render := MeshInstance3D.new()
	render.mesh = mesh
	render.position = -center
	add_child(render)
	var collider := CollisionShape3D.new()
	var hull := ConvexPolygonShape3D.new()
	for i in points.size():
		points[i] -= center
	hull.points = points
	collider.shape = hull
	add_child(collider)
	collision_layer = 256
	collision_mask = 1 | 8 | 64
	mass = 3.5
	continuous_cd = true
	linear_damp = 0.37
	angular_damp = 0.49
	global_transform = Transform3D(at.basis.orthonormalized(),at*center)
	linear_velocity = shot
	angular_velocity = Vector3(3.5,-2.7,4.8)


func _process(delta: float) -> void:
	lifetime -= delta
	if lifetime <= 0.0:
		queue_free()
