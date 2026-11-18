extends Node3D

const GRIP := preload("res://hand_grip.gd")
var grip := GRIP.new()
enum Hit { SHOVE, GLANCE, FALL, DOWN }

const RAGDOLL := preload("res://pedestrian_ragdoll.gd")
const BODY_RADIUS := 0.34
const RECOVERABLE_SPEED := 20.0/3.6
const FATAL_SPEED := 55.0/3.6
const CLIENT_GLANCE := 3.0
const CLIENT_DROP := 12.0
var shove_speed := CLIENT_GLANCE

var from := Vector2.ZERO
var to := Vector2.ZERO
var pace := 1.0
var progress := 0.0
var reverse := false
var terrain: RefCounted
var walker := false
var model: Node3D
var player: AnimationPlayer
var collider: AnimatableBody3D
var shape_node: CollisionShape3D
var camera: Camera3D
var received_box: Node3D
var entrance: Node3D
var after_mood := "happy"
var door_wait := -1.0
var entry_remaining := 25.0
var next_emote := 0.0
var received := false
var hit_points := 3
var stunned := 0.0
var knockdown := 0.0
var knockdown_elapsed := 0.0
var fallen_pose: Array[Transform3D] = []
var ragdoll_cell := Vector2i(-99999,-99999)
var repeat_at := 0
var blood_anchor: Node3D
var defeated := false
var impulse := Vector3.ZERO
var stumble_lean := Vector3.ZERO
var skeleton: Skeleton3D
var ragdoll: Node3D
var impact_ground: Node3D
var standing_offset := Vector3.ZERO
var facing_before_hit := 0.0
var recovery := 0.0
var recover_poses: Array[Transform3D] = []
var clearance := PhysicsRayQueryParameters3D.new()


func setup(actor: PackedScene, a: Vector2, b: Vector2, phase: float, ground: RefCounted) -> void:
	terrain = ground
	from = a
	to = b
	progress = phase
	walker = from.distance_to(to) > 0.5
	pace = 0.85 + phase * 0.5
	model = actor.instantiate()
	add_child(model)
	add_child(grip)
	grip.setup(model)
	player = model.find_child("AnimationPlayer",true,false)
	skeleton = model.find_children("*","Skeleton3D",true,false)[0]
	player.play(&"idle")
	if walker:
		player.get_animation("walk").loop_mode = Animation.LOOP_LINEAR
		player.play("walk",-1.0,pace)
		player.seek(phase*player.current_animation_length,true)
	collider = AnimatableBody3D.new()
	collider.collision_layer = 4
	collider.collision_mask = 0
	clearance.collision_mask = 43
	collider.sync_to_physics = false
	add_child(collider)
	var shape := CapsuleShape3D.new()
	shape.radius = BODY_RADIUS
	shape.height = 1.55
	shape_node = CollisionShape3D.new()
	shape_node.shape = shape
	shape_node.position.y = 0.80
	collider.add_child(shape_node)
	_update_position()
	reset_physics_interpolation()


func set_active(enabled: bool) -> void:
	visible = enabled
	shape_node.set_deferred(&"disabled",not enabled)
	set_physics_process(enabled)
	player.active = enabled


func set_delivery_result(late: bool, bumped: bool, cold: bool, cold_upset: bool) -> void:
	after_mood = "angry" if late or bumped or cold_upset else ("ok" if cold else "happy")


func box_caught() -> float:
	if not received:
		received = true
		if after_mood != "ok":
			_emote(5 if after_mood == "happy" else 3)
	return 1.5 if after_mood == "angry" else 3.0


func _emote(count: int) -> void:
	for i in count:
		var mark := Label3D.new()
		mark.text = "♥" if after_mood == "happy" else "!"
		mark.modulate = Color("#f16b72") if after_mood == "happy" else Color("#f29249")
		mark.outline_size = 3
		mark.pixel_size = 0.0055
		mark.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		mark.no_depth_test = true
		add_child(mark)
		mark.position = Vector3((float(i)/maxi(count-1,1)-0.5)*0.68,1.97+0.08*(i%2),0)
		var flight := create_tween().bind_node(mark)
		flight.set_parallel(true)
		flight.tween_property(mark,"position:y",mark.position.y+0.40,0.9)
		flight.tween_property(mark,"modulate:a",0.0,0.60).set_delay(0.30)
		flight.chain().tween_callback(mark.queue_free)


func go_inside(box: Node3D, door: Node3D) -> void:
	received_box = box
	entrance = door
	door_wait = -1.0
	entry_remaining = 25.0
	next_emote = randf_range(0.6,1.2)
	player.get_animation("carry_walk").loop_mode = Animation.LOOP_LINEAR
	player.play("carry_walk",0.14,1.4 if after_mood == "angry" else 0.95)
	grip.support_on_left(false)


func _enter_building(delta: float) -> void:
	entry_remaining -= delta
	var sill: Vector3 = entrance.passage()
	var outside: Vector3 = sill + entrance.global_basis.z * 1.74
	var crossing := door_wait >= 0.0
	var goal := sill if crossing else outside
	var direction := goal-position
	direction.y = 0.0
	if direction.length_squared()>0.0001:
		rotation.y = lerp_angle(rotation.y,atan2(direction.x,direction.z),1.0-exp(-15.0*delta))
	if crossing and door_wait < 0.35:
		door_wait += delta
		return
	var speed := (2.4 if crossing else 2.8) if after_mood=="angry" else (1.4 if crossing else 1.5)
	position = position.move_toward(goal,speed*delta)
	if after_mood=="angry" and not crossing:
		next_emote -= delta
		if next_emote<=0.0:
			_emote(1)
			next_emote = randf_range(1.3,2.2)
	if not crossing and position.distance_squared_to(goal)<0.36:
		door_wait = 0.0
		entrance.begin_entry()
		collider.collision_layer = 0
		return
	if (crossing and position.distance_squared_to(goal)<0.0225) or entry_remaining<=0:
		if crossing:
			entrance.end_entry()
		entrance = null
		if is_instance_valid(received_box):
			received_box.queue_free()
		received_box = null
		set_active(false)


func _physics_process(delta: float) -> void:
	if recovery > 0.0:
		_recover(delta)
		return
	if defeated or knockdown > 0.0 or stunned > 0.0 or ragdoll != null:
		_react(delta)
		return
	if is_instance_valid(entrance):
		_enter_building(delta)
		return
	if not walker:
		return
	if is_instance_valid(camera):
		var near := camera.position.distance_squared_to(position) < 72.0*72.0
		if player.active != near:
			player.active = near
	var path := to-from
	var walk_dir := path.normalized() * (-1.0 if reverse else 1.0)
	var step := Vector3(walk_dir.x,0.0,walk_dir.y)*pace*delta
	if _blocked(step+step.normalized()*0.58,0.62):
		return
	standing_offset = standing_offset.move_toward(Vector3.ZERO,0.35*delta)
	progress += pace*delta/path.length()
	if progress >= 1.0:
		progress -= 1.0
		reverse = not reverse
	_update_position()


func _update_position() -> void:
	var at := from.lerp(to,1.0-progress if reverse else progress)
	position = Vector3(at.x+standing_offset.x,0.0,at.y+standing_offset.z)
	position.y = terrain.at(position.x,position.z)+0.022
	if walker:
		var direction := to-from
		rotation.y = atan2(direction.x,direction.y)+(PI if reverse else 0.0)


func impact(approach: float, push: Vector3, active_client: bool,
			contact_offset: Vector3 = Vector3(0.0,0.48,0.0), lift: float = 0.60, blast := false) -> int:
	if defeated or knockdown > 0.0:
		return Hit.FALL
	player.active = true
	if not blast and (approach < shove_speed or (active_client and approach < CLIENT_DROP)):
		if stunned > 0.0:
			return Hit.GLANCE if approach >= CLIENT_GLANCE else Hit.SHOVE
		stunned = 0.42
		impulse = push*clampf(approach*0.57,0.56,3.0)
		var local := global_basis.transposed()*push
		stumble_lean = Vector3(local.z,0.0,-local.x)*clampf(0.08+approach*0.023,0.09,0.25)
		_walk_reaction()
		return Hit.GLANCE if approach >= CLIENT_GLANCE else Hit.SHOVE

	if approach >= RECOVERABLE_SPEED:
		hit_points -= 1
	defeated = blast or approach >= FATAL_SPEED or hit_points <= 0 or active_client
	facing_before_hit = rotation.y
	knockdown = 30.0 if defeated else 2.75
	knockdown_elapsed = 0.0
	stunned = 0.0
	collider.collision_layer = 0
	player.pause()
	impact_ground.cover(global_position,13.0)
	impact_ground.cover(global_position+push*minf(29.0,approach),12.0)
	ragdoll_cell = Vector2i(-99999,-99999)
	ragdoll = RAGDOLL.new()
	add_child(ragdoll)
	var walking_velocity := -global_basis.z*pace if walker else Vector3.ZERO
	if not ragdoll.begin(skeleton,push,approach,global_position+contact_offset,lift,walking_velocity):
		ragdoll.queue_free()
		ragdoll = null
		model.rotation.x = -1.54
		model.position.y = 0.21
	return Hit.DOWN if defeated else Hit.FALL


func bleed_from() -> Node3D:
	if blood_anchor == null:
		blood_anchor = Node3D.new()
		add_child(blood_anchor)
	blood_anchor.position = Vector3.UP*0.88
	if is_instance_valid(ragdoll):
		blood_anchor.global_position = ragdoll.hip_position()
	elif not fallen_pose.is_empty():
		blood_anchor.position = Vector3.UP*0.13
	return blood_anchor


func ground_hit(speed: float) -> bool:
	var frame := Engine.get_physics_frames()
	if speed < RECOVERABLE_SPEED or not (defeated or knockdown > 0.0) or frame < repeat_at:
		return false
	repeat_at = frame+30
	if not defeated and knockdown_elapsed >= 1.5:
		hit_points -= 1
		defeated = speed >= FATAL_SPEED or hit_points <= 0
		knockdown_elapsed = 0.0
		knockdown = 30.0 if defeated else 2.75
	return defeated


func _walk_reaction() -> void:
	player.get_animation(&"walk").loop_mode = Animation.LOOP_LINEAR
	player.play(&"walk",0.05,1.6)


func _react(delta: float) -> void:
	if stunned > 0.0:
		var motion := impulse*delta
		if not _blocked(motion+motion.normalized()*0.24,0.32,9):
			position += motion
			standing_offset += motion
		impulse *= exp(-6.0*delta)
		position.y = terrain.at(position.x,position.z)+0.022
		stunned = maxf(stunned-delta,0.0)
		model.rotation = stumble_lean*sin(stunned/0.42*PI)
		if stunned <= 0.0:
			_resume_walk()
		return
	knockdown_elapsed += delta
	knockdown = maxf(0.0,knockdown-delta)
	if is_instance_valid(ragdoll):
		var at: Vector3 = ragdoll.hip_position()
		var cell := Vector2i(floori(at.x/10.0),floori(at.z/10.0))
		if cell != ragdoll_cell:
			ragdoll_cell = cell
			impact_ground.cover(at,11.0)
		if blood_anchor:
			blood_anchor.global_position = at
		if ragdoll.reached_ground(terrain,delta,knockdown_elapsed):
			_freeze_body()
		else:
			return
	if knockdown > 0.0:
		return
	if defeated:
		skeleton.clear_bones_global_pose_override()
		set_active(false)
		return
	if not fallen_pose.is_empty():
		var last_pose := fallen_pose
		fallen_pose = []
		shape_node.position.y = 0.8
		shape_node.rotation = Vector3.ZERO
		collider.collision_layer = 0
		rotation.y = facing_before_hit
		var to_skeleton := skeleton.global_transform.affine_inverse()
		for bone in last_pose:
			recover_poses.append(to_skeleton*bone)
		recovery = 0.68
		_resume_walk()
		_recover(0.0)
		return
	collider.collision_layer = 4
	rotation.y = facing_before_hit
	_resume_walk()


func _freeze_body() -> void:
	fallen_pose = ragdoll.world_poses()
	var at: Vector3 = ragdoll.hip_position()
	var offset := Vector3(at.x-global_position.x,0.0,at.z-global_position.z)
	position += offset
	standing_offset += offset
	position.y = terrain.at(position.x,position.z)+0.022
	ragdoll.release()
	ragdoll = null
	var to_skeleton := skeleton.global_transform.affine_inverse()
	for bone in fallen_pose.size():
		skeleton.set_bone_global_pose_override(bone,to_skeleton*fallen_pose[bone],1.0,true)
	shape_node.position.y = 0.23
	shape_node.rotation.x = PI*0.5
	collider.collision_layer = 512
	if blood_anchor:
		blood_anchor.position = Vector3.UP*0.13
	reset_physics_interpolation()


func _recover(delta: float) -> void:
	recovery = maxf(recovery-delta,0.0)
	var weight := smoothstep(0.0,0.68,recovery)
	for i in recover_poses.size():
		skeleton.set_bone_global_pose_override(i,recover_poses[i],weight,true)
	if recovery <= 0.0:
		recover_poses.clear()
		skeleton.clear_bones_global_pose_override()
		collider.collision_layer = 4


func _resume_walk() -> void:
	model.rotation = Vector3.ZERO
	model.position = Vector3.ZERO
	if walker:
		player.play(&"walk",0.12,pace)
	else:
		player.play(&"idle",0.13)


func _blocked(step: Vector3, height: float, mask: int = 43) -> bool:
	if step.length_squared() < 0.00001:
		return false
	clearance.collision_mask = mask
	clearance.from = global_position+Vector3.UP*height
	clearance.to = clearance.from+step
	return not get_world_3d().direct_space_state.intersect_ray(clearance).is_empty()
