extends RefCounted

const PALETTE := ["#7bd64a","#8e5bd8","#ffd23f","#2fb8a8"]
const POSE := preload("res://delivery_actor_pose.gd")

static func deck(index: int) -> ArrayMesh:
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	var tint := Color(PALETTE[index]).srgb_to_linear()
	var steel := Color("#2b2a30").srgb_to_linear()
	_box(mesh,Vector3(.22,.07,1.05),Vector3(0,.12,0),tint)
	_box(mesh,Vector3(.06,1.05,.06),Vector3(0,.62,.5),steel,-.18)
	_box(mesh,Vector3(.56,.05,.05),Vector3(0,1.13,.58),steel)
	_box(mesh,Vector3(.12,.16,.08),Vector3(0,1,.57),tint)
	var wheel := CylinderMesh.new()
	wheel.top_radius=.10
	wheel.bottom_radius=.10
	wheel.height=.06
	wheel.radial_segments=8
	wheel.rings=1
	for z: float in [.5,-.48]:
		_append(mesh,wheel,Transform3D(Basis(Vector3.BACK,PI*.5),Vector3(0,.10,z)),Color("#1b1a1f").srgb_to_linear())
	return mesh.commit()

static func _box(mesh: SurfaceTool, size_: Vector3, point: Vector3, tint: Color, pitch := 0.0) -> void:
	var box := BoxMesh.new()
	box.size=size_
	_append(mesh,box,Transform3D(Basis(Vector3.RIGHT,pitch),point),tint)

static func _append(mesh: SurfaceTool, part: PrimitiveMesh, pose: Transform3D, tint: Color) -> void:
	var arrays:=part.get_mesh_arrays()
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	for i in indices:
		mesh.set_color(tint)
		mesh.set_normal(pose.basis*normals[i])
		mesh.add_vertex(pose*vertices[i])

static func seated_rider(person: Node3D, passenger: bool) -> RefCounted:
	person.collider.collision_layer=0
	person.set_physics_process(false)
	person.player.pause()
	person.player.active=false
	var pose:=POSE.new()
	pose.setup(person.model)
	person.model.position.y=.16
	for joint: int in pose.joints:
		var angle:=0.0
		match joint:
			9,32: angle=-1.3 if passenger else -1.05
			54: angle=.15 if passenger else .25
			56: angle=-.10 if passenger else -.25
		pose.skeleton.set_bone_pose_rotation(pose.joints[joint],Quaternion(pose.axes[joint],angle)*pose.rests[joint])
	return pose

static func push_leg(pose: RefCounted, amount: float) -> void:
	if pose and pose.joints.has(56):
		pose.skeleton.set_bone_pose_rotation(pose.joints[56],Quaternion(pose.axes[56],-.25+.95*amount)*pose.rests[56])
