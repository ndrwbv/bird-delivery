extends CharacterBody3D

const GRIP := preload("res://hand_grip.gd")
var grip := GRIP.new()
var camera: Camera3D
var region_edge: RefCounted
var terrain: RefCounted
var actor: Node3D
var player: AnimationPlayer
var carrying := true
var interaction_locked := false
var active := false
var box: Node3D
var previous_axes := Vector2.ZERO
var control_forward := Vector3.FORWARD


func setup(scene: PackedScene, paint: Material, ground: RefCounted, camera_node: Camera3D) -> void:
	camera = camera_node
	terrain = ground
	collision_layer = 16
	collision_mask = 47
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	var capsule := CapsuleShape3D.new()
	capsule.height = 1.65
	capsule.radius = 0.33
	var hull := CollisionShape3D.new()
	hull.position.y = 0.82
	hull.shape = capsule
	add_child(hull)
	actor = scene.instantiate()
	add_child(actor)
	add_child(grip)
	grip.setup(actor)
	player = actor.find_child("AnimationPlayer",true,false)
	for mesh in actor.find_children("*","MeshInstance3D",true,false):
		mesh.material_override = paint
	for name in [&"walk",&"carry_walk"]:
		player.get_animation(name).loop_mode = Animation.LOOP_LINEAR
	hide_courier()


func show_courier(at: Vector3, facing: Vector3, delivery_box: Node3D) -> void:
	position = at
	rotation.y = atan2(facing.x,facing.z)
	velocity = Vector3.ZERO
	previous_axes = Vector2.ZERO
	grip.support_on_left(false)
	box = delivery_box
	carrying = true
	interaction_locked = false
	active = true
	show()
	set_physics_process(true)
	player.active = true
	player.play(&"carry")
	reset_physics_interpolation()
	set_deferred(&"collision_layer",16)


func hide_courier() -> void:
	active = false
	box = null
	hide()
	set_physics_process(false)
	player.active = false
	set_deferred(&"collision_layer",0)


func run_to(target: Vector3, speed: float, delta: float, with_bag: bool) -> bool:
	var step := Vector2(target.x-position.x,target.z-position.z)
	var distance := step.length()
	if distance < 0.018:
		return true
	var direction := step/distance
	var moved := direction*minf(distance,speed*delta)
	position.x += moved.x
	position.z += moved.y
	position.y = terrain.at(position.x,position.z,position.y)+0.02
	rotation.y = lerp_angle(rotation.y,atan2(direction.x,direction.y),1.0-exp(-18.0*delta))
	var motion := &"carry_walk" if with_bag else &"walk"
	if player.current_animation != motion:
		player.play(motion,0.10,1.95 if with_bag else 1.45)
	return distance <= speed*delta+0.018


func _physics_process(delta: float) -> void:
	if interaction_locked:
		velocity = Vector3.ZERO
		return
	var axes := Vector2(Input.get_axis(&"steer_left",&"steer_right"),Input.get_axis(&"reverse",&"accelerate"))
	if axes == Vector2.ZERO:
		var stick := Vector2(Input.get_joy_axis(0,JOY_AXIS_LEFT_X),-Input.get_joy_axis(0,JOY_AXIS_LEFT_Y))
		if stick.length() > 0.20:
			axes = stick
	axes = axes.limit_length()
	if previous_axes.distance_to(axes) > 0.16:
		previous_axes = axes
		control_forward = -camera.global_basis.z
		control_forward.y = 0.0
		control_forward = control_forward.normalized()
	var right := Vector3(-control_forward.z,0.0,control_forward.x)
	var wanted := (right*axes.x+control_forward*axes.y)*(5.5 if carrying else 6.25)
	velocity = velocity.lerp(wanted,1.0-exp(-14.0*delta))
	if region_edge != null:
		velocity = region_edge.limit(position, velocity, delta)
	move_and_slide()
	position.y = terrain.at(position.x,position.z,position.y)+0.02
	if wanted.length_squared() > 0.08:
		rotation.y = lerp_angle(rotation.y,atan2(wanted.x,wanted.z),1.0-exp(-14.0*delta))
	_update_pose(wanted.length() > 0.18)


func _update_pose(moving: bool) -> void:
	if moving:
		var name := &"carry_walk" if carrying else &"walk"
		if player.current_animation != name:
			player.play(name,0.12,2.0 if carrying else 2.18)
	elif carrying:
		if player.current_animation != &"carry":
			player.play(&"carry",0.12)
	elif player.current_animation != &"idle":
		player.play(&"idle",0.13)
