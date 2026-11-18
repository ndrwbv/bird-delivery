extends Camera3D

# handcam.js applies its turn after the driving camera has updated for this frame.
const TURN_IN := 0.45
const HOLD := 0.95
const TURN_OUT := 0.55
const QUICK := 0.30

var driving_view: Camera3D
var vehicle: CharacterBody3D
var ground: RefCounted
var receiver: Node3D
var elapsed := 0.0
var initial_speed := 0.0
var skip_time := -1.0
var skip_weight := 0.0
var weight := 0.0
var wall_check := PhysicsRayQueryParameters3D.new()


func setup(base_view: Camera3D, car: CharacterBody3D, terrain: RefCounted) -> void:
	driving_view = base_view
	vehicle = car
	ground = terrain
	process_priority = base_view.process_priority + 1
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	wall_check.collision_mask = 1
	set_process(false)
	set_process_input(false)


func start(person: Node3D) -> void:
	receiver = person
	elapsed = 0.0
	weight = 0.0
	skip_time = -1.0
	initial_speed = Vector2(vehicle.velocity.x, vehicle.velocity.z).length()
	global_transform = driving_view.global_transform
	fov = driving_view.fov
	near = driving_view.near
	far = driving_view.far
	keep_aspect = driving_view.keep_aspect
	make_current()
	set_process(true)
	set_process_input(true)


func finish() -> void:
	if current and is_instance_valid(driving_view):
		driving_view.make_current()
	receiver = null
	set_process(false)
	set_process_input(false)


func _skip() -> void:
	if skip_time < 0.0:
		skip_time = elapsed
		skip_weight = weight


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		_skip()
	elif event is InputEventMouseButton and event.pressed:
		_skip()
	elif event is InputEventJoypadButton and event.pressed:
		_skip()


func _process(delta: float) -> void:
	if not is_instance_valid(receiver) or not receiver.is_visible_in_tree() or receiver.defeated:
		finish()
		return
	elapsed += delta
	var speed := Vector2(vehicle.velocity.x, vehicle.velocity.z).length()
	if speed > maxf(4.0, initial_speed + 1.5):
		_skip()
	if skip_time >= 0.0:
		weight = skip_weight * (1.0 - _ease((elapsed - skip_time) / QUICK))
	elif elapsed < TURN_IN:
		weight = _ease(elapsed / TURN_IN)
	else:
		weight = 1.0 - _ease((elapsed - TURN_IN - HOLD) / TURN_OUT)
	if weight <= 0.0:
		finish()
		return

	var car_pose := vehicle.get_global_transform_interpolated()
	var client := receiver.get_global_transform_interpolated().origin
	var tail := car_pose.basis.z
	tail.y = 0.0
	tail = tail.normalized()
	var boot := car_pose.origin + tail * 2.0
	var center := boot.lerp(client, 0.5)
	center.y = ground.at(center.x, center.z) + 1.0
	var throw_line := client - boot
	throw_line.y = 0.0
	var side := Vector3(-throw_line.z, 0.0, throw_line.x).normalized()
	if side.dot(tail) < 0.0:
		side = -side
	side = (side + tail * 0.45).normalized()
	var normal_view := driving_view.global_transform
	var distance := clampf(throw_line.length() * 0.8 + 6.0, 6.0, 11.0)
	var desired := center + side * distance
	desired.y = maxf(car_pose.origin.y + 3.6, ground.at(desired.x, desired.z) + 3.3)
	var start := normal_view.origin - car_pose.origin
	var end := desired - car_pose.origin
	var heading := lerp_angle(atan2(start.x, start.z), atan2(end.x, end.z), weight)
	var radius := lerpf(Vector2(start.x, start.z).length(), Vector2(end.x, end.z).length(), weight)
	var eye := car_pose.origin + Vector3(sin(heading) * radius, lerpf(start.y, end.y, weight), cos(heading) * radius)
	wall_check.from = center
	wall_check.to = eye
	var hit := get_world_3d().direct_space_state.intersect_ray(wall_check)
	if not hit.is_empty():
		eye = (hit.position as Vector3).move_toward(center, 0.22)
	var forward_point := normal_view.origin - normal_view.basis.z * center.distance_to(normal_view.origin)
	var look := forward_point.lerp(center, weight)
	global_position = eye
	if eye.distance_squared_to(look) > 0.001:
		look_at(look)
	fov = driving_view.fov


func _ease(fraction: float) -> float:
	var t := clampf(fraction, 0.0, 1.0)
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
