extends Node3D

# Original Quaternius rig: hips, spine, head, arms and legs. Hands, feet,
# fingers and facial bones are carried by their nearest simulated parent.
const PARTS := [
	[1,3,-1,0.145,12.0,0.73], [3,5,0,0.159,17.0,0.56], [7,-1,1,0.102,4.5,0.66],
	[9,10,1,0.068,2.3,1.34], [10,11,3,0.058,1.55,0.86],
	[32,33,1,0.068,2.3,1.34], [33,34,5,0.058,1.55,0.86],
	[54,55,0,0.080,7.0,1.03], [55,-1,7,0.065,3.5,0.78],
	[56,57,0,0.080,7.0,1.03], [57,-1,9,0.065,3.5,0.78],
]

var skeleton: Skeleton3D
var bodies: Array[RigidBody3D] = []
var bindings: Array[int] = []
var offsets: Array[Transform3D] = []
var last_car_hit := 0
var rest_time := 0.0


func begin(skin: Skeleton3D, push: Vector3, strength: float, contact: Vector3, lift: float,
		   walking_velocity: Vector3) -> bool:
	skeleton = skin
	last_car_hit = Engine.get_physics_frames()
	var bone_to_body: Dictionary = {}
	var measured: Array[int] = []
	for row in PARTS:
		var bone := skin.find_bone("Joint_%d" % int(row[0]))
		if bone < 0:
			return false
		measured.append(bone)
	skin.force_update_all_bone_transforms()
	for i in PARTS.size():
		var row: Array = PARTS[i]
		var bone := measured[i]
		var a := _world_pose(bone).origin
		var b := _end_point(i,a,measured)
		if b.distance_squared_to(a) < 0.000005:
			var upward := i < 3
			b = a+(Vector3.UP if upward else Vector3.DOWN)*(0.20 if upward else 0.26)
		var direction := (b-a).normalized()
		var parent := int(row[2])
		var body := _body(a,b,float(row[3]),float(row[4]))
		bodies.append(body)
		bone_to_body[bone] = i
		if parent >= 0:
			_link(bodies[parent],body,a,direction,float(row[5]),i in [4,6,8,10])
	for bone in skin.get_bone_count():
		var ancestor := bone
		while ancestor >= 0 and not bone_to_body.has(ancestor):
			ancestor = skin.get_bone_parent(ancestor)
		var i: int = bone_to_body.get(ancestor,0)
		bindings.append(i)
		offsets.append(bodies[i].global_transform.affine_inverse()*_world_pose(bone))
	_start_fall(push,strength,contact,lift,walking_velocity)
	_update_skin()
	return true


func _start_fall(push: Vector3, strength: float, contact: Vector3, lift: float, walking: Vector3) -> void:
	var hip := hip_position()
	var energy := smoothstep(3.0,25.0,strength)
	var drift := push*minf(11.8,strength*lerpf(0.30,0.55,energy))+walking*0.40
	drift.y = lift*lerpf(0.07,2.35,energy)
	var lever := (contact-hip).limit_length(0.67)
	var turn := (lever.cross(push)*lerpf(3.8,8.4,energy)).limit_length(4.5)
	var closest: RigidBody3D = bodies[0]
	var gap := INF
	for part in bodies:
		var weight := part.global_position.distance_squared_to(contact)
		if weight < gap:
			closest = part
			gap = weight
		var pivot_speed := turn.cross(part.global_position-hip).limit_length(3.1)
		part.linear_velocity = drift+pivot_speed*0.8
		part.angular_velocity = turn
	closest.linear_velocity += push*lerpf(0.42,1.72,energy)


func hip_position() -> Vector3:
	return bodies[0].global_position


func car_hit(limb: RigidBody3D, point: Vector3, motion: Vector3, approach: float) -> bool:
	var frame := Engine.get_physics_frames()
	if frame-last_car_hit < 10 or approach < 1.55:
		return false
	last_car_hit = frame
	var forward := motion.normalized()
	var push := (forward+Vector3.UP*0.08).normalized()
	limb.apply_impulse(push*limb.mass*clampf(approach*0.62,1.2,8.0),point-limb.global_position)
	if limb != bodies[0]:
		bodies[0].apply_central_impulse(push*bodies[0].mass*clampf(approach*0.26,0.4,4.2))
	return true


func reached_ground(terrain: RefCounted, delta: float, age: float) -> bool:
	var hips := bodies[0].global_position
	var chest := bodies[1].global_position
	var low: bool = hips.y-terrain.at(hips.x,hips.z) < 0.39 and chest.y-terrain.at(chest.x,chest.z) < 0.44
	var slow: bool = bodies[0].linear_velocity.length_squared() < 2.0 and bodies[1].linear_velocity.length_squared() < 2.6
	if low and (slow or age > 1.65):
		rest_time += delta
	else:
		rest_time = 0.0
	return rest_time >= 0.14


func world_poses() -> Array[Transform3D]:
	var poses: Array[Transform3D] = []
	for bone in bindings.size():
		poses.append(bodies[bindings[bone]].global_transform*offsets[bone])
	return poses


func release() -> void:
	set_physics_process(false)
	for body in bodies:
		body.collision_layer = 0
		body.collision_mask = 0
		body.freeze = true
	if is_instance_valid(skeleton):
		skeleton.clear_bones_global_pose_override()
	queue_free()


func _physics_process(_delta: float) -> void:
	if is_instance_valid(skeleton) and not bodies.is_empty():
		_update_skin()


func _update_skin() -> void:
	var to_skeleton := skeleton.global_transform.affine_inverse()
	for bone in bindings.size():
		var pose := to_skeleton*bodies[bindings[bone]].global_transform*offsets[bone]
		skeleton.set_bone_global_pose_override(bone,pose,1.0,true)


func _world_pose(bone: int) -> Transform3D:
	return skeleton.global_transform*skeleton.get_bone_global_pose(bone)


func _end_point(index: int, at: Vector3, measured: Array[int]) -> Vector3:
	var next := int(PARTS[index][1])
	if next >= 0:
		var endpoint := skeleton.find_bone("Joint_%d" % next)
		if endpoint >= 0:
			return _world_pose(endpoint).origin
	if index == 2:
		return at+Vector3.UP*0.14
	var thigh := _world_pose(measured[index-1]).origin
	var axis := (at-thigh).normalized()
	return at+axis*0.36


func _body(from: Vector3, to: Vector3, radius: float, weight: float) -> RigidBody3D:
	var body := RigidBody3D.new()
	body.mass = weight
	body.collision_layer = 128
	body.collision_mask = 1 | 8 | 64
	body.gravity_scale = 1.8
	body.linear_damp = 0.60
	body.angular_damp = 1.40
	body.continuous_cd = true
	var capsule := CapsuleShape3D.new()
	capsule.radius = radius
	capsule.height = maxf(radius*2.0,from.distance_to(to)+radius*0.72)
	var collider := CollisionShape3D.new()
	collider.shape = capsule
	body.add_child(collider)
	add_child(body)
	var pose := Basis(Quaternion(Vector3.UP,(to-from).normalized()))
	body.global_transform = Transform3D(pose,(from+to)*0.5)
	body.reset_physics_interpolation()
	return body


func _link(parent: RigidBody3D, child: RigidBody3D, point: Vector3, axis: Vector3, swing: float, hinge: bool) -> void:
	var joint := ConeTwistJoint3D.new()
	joint.swing_span = swing
	joint.twist_span = 0.32 if hinge else 0.83
	add_child(joint)
	joint.global_transform = Transform3D(Basis(Quaternion(Vector3.RIGHT,axis)),point)
	joint.node_a = joint.get_path_to(parent)
	joint.node_b = joint.get_path_to(child)
