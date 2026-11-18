extends Node

const HANDOFF := preload("res://delivery_handoff.gd")
const GAS := &"accelerate"
const REVERSE := &"reverse"
const LEFT := &"steer_left"
const RIGHT := &"steer_right"
const BRAKE := &"handbrake"
const DELIVER := &"deliver"

@onready var game: Node3D = get_parent()
@onready var car: CharacterBody3D = game.car

var path := PackedVector2Array()
var waypoint := 1
var order := -1
var returning := false
var elapsed := 0.0
var ready_reported := false
var capture_dir := ""
var startup_only := false
var first_order_only := false
var capture_index := 0
var frame_intervals := PackedFloat64Array()
var interval_start := 0
var last_frame_usec := 0
var slowest_interval := 0.0
var slowest_at := Vector2.ZERO
var stage_started_usec := 0
var phase_name := ""
var headless := false
var finished := false
var last_delivery_stage := 0


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	headless = DisplayServer.get_name() == "headless"
	startup_only = "--startup-only" in args
	first_order_only = "--first-order" in args
	for arg in args:
		if arg.begins_with("--capture-dir="):
			capture_dir = arg.trim_prefix("--capture-dir=")
	if not headless:
		RenderingServer.frame_post_draw.connect(_frame_presented)
	process_physics_priority = 1
	_set_path()


func _physics_process(delta: float) -> void:
	if finished:
		return
	elapsed += delta
	_note_phase()
	if elapsed > 240.0:
		push_error("Drive timed out at %s near waypoint %s of order %s" % [str(car.position), waypoint, order+1])
		get_tree().quit(1)
		return
	if game.destination != order:
		print("DELIVERY %d at %.2f s" % [game.destination, elapsed])
		if game.destination >= game.map_data.deliveries.size() or first_order_only:
			_finish()
			return
		_set_path()
	elif returning != game.back_to_depot:
		_set_path()
	if game.courier.active:
		_walk_delivery()
	else:
		_drive()


func _note_phase() -> void:
	var next: String
	if game.destination >= game.map_data.deliveries.size():
		next = "свободная езда"
	elif game.dispatch.active():
		next = "погрузка"
	elif game.back_to_depot:
		next = "возврат на базу"
	else:
		next = str(HANDOFF.Stage.keys()[game.delivery.stage])
	next = "%d · %s" % [game.destination + 1, next]
	if next == phase_name:
		return
	var now := Time.get_ticks_usec()
	if stage_started_usec > 0:
		print("PHASE %s · %.2f s" % [phase_name, (now - stage_started_usec) * 0.000001])
	phase_name = next
	stage_started_usec = now


func _drive() -> void:
	var at := Vector2(car.position.x, car.position.z)
	var last := path.size() - 1
	while waypoint < last and at.distance_to(path[waypoint]) < 4.0:
		waypoint += 1
	var to_target := path[waypoint] - at
	var meters := to_target.length()

	if waypoint == last and meters < 6.0:
		_action(GAS, 0.0)
		_action(REVERSE, 0.0)
		_action(BRAKE, 1.0)
		_action(LEFT, 0.0)
		_action(RIGHT, 0.0)
		_action(DELIVER, 1.0 if game.can_deliver else 0.0)
		return

	var heading := atan2(-to_target.x, -to_target.y)
	var error := angle_difference(car.rotation.y, heading)
	var reversing := absf(error) > 2.12
	var steer_error := wrapf(error + PI, -PI, PI) if reversing else -error
	var turn_choke := clampf(1.0 - absf(steer_error) * 0.67, 0.26, 1.0)
	var target_speed := minf(17.5, 5.5 + meters * 1.45) * turn_choke
	if waypoint == last:
		target_speed = minf(target_speed, 0.9 * meters)
	var speed := absf(car.speed)
	_action(LEFT, clampf(-steer_error * 1.7, 0.0, 1.0))
	_action(RIGHT, clampf(steer_error * 1.7, 0.0, 1.0))
	_action(DELIVER, 0.0)
	_action(BRAKE, 1.0 if speed > target_speed + 2.1 and not reversing else 0.0)
	_action(REVERSE, clampf(target_speed / 5.8, 0.45, 1.0) if reversing else 0.0)
	_action(GAS, clampf(target_speed / 24.0, 0.12, 1.0) if not reversing and speed < target_speed + 1.0 else 0.0)


func _walk_delivery() -> void:
	_action(BRAKE,0.0)
	var stage: int = game.delivery.stage
	if stage != last_delivery_stage:
		_action(DELIVER,0.0)
		last_delivery_stage = stage
		return
	var ready: bool = game.can_deliver
	var target: Vector3 = car.position if stage == 3 else game.customers[game.destination].position
	var direction: Vector3 = target-game.courier.position
	direction.y = 0.0
	direction = direction.normalized()
	var forward: Vector3 = -game.chase.global_basis.z
	forward.y = 0.0
	forward = forward.normalized()
	var go := 0.0 if ready or stage == 2 else direction.dot(forward)
	var turn := 0.0 if ready or stage == 2 else direction.dot(Vector3(-forward.z,0.0,forward.x))
	_action(GAS,maxf(go,0.0))
	_action(REVERSE,maxf(-go,0.0))
	_action(LEFT,maxf(-turn,0.0))
	_action(RIGHT,maxf(turn,0.0))
	_action(DELIVER,1.0 if ready else 0.0)


func _action(action: StringName, strength: float) -> void:
	if strength > 0.01:
		Input.action_press(action, strength)
	elif Input.is_action_pressed(action):
		Input.action_release(action)


func _set_path() -> void:
	order = game.destination
	returning = game.back_to_depot
	var delivery: Dictionary = game.map_data.deliveries[order]
	path.clear()
	for p: Array in (delivery.back_home if returning else delivery.from_home):
		path.append(Vector2(p[0], p[1]))
	waypoint = 1


func _frame_presented() -> void:
	var now := Time.get_ticks_usec()
	if not ready_reported and absf(car.speed) > 0.01:
		ready_reported = true
		print("PLAYABLE")
		_capture("start")
		if startup_only:
			get_tree().quit()
			return
	if ready_reported and elapsed > 2.0:
		if last_frame_usec != 0:
			var interval := float(now - last_frame_usec) / 1000.0
			frame_intervals.append(interval)
			if interval > slowest_interval:
				slowest_interval = interval
				slowest_at = Vector2(car.position.x, car.position.z)
		else:
			interval_start = now
		last_frame_usec = now
	if capture_index == 1 and elapsed > 8.0:
		_capture("drive")
	if capture_index == 2 and game.can_deliver:
		_capture("delivery")


func _capture(name: String) -> void:
	if capture_dir.is_empty():
		return
	capture_index += 1
	get_viewport().get_texture().get_image().save_png(capture_dir.path_join(name + ".png"))


func _finish() -> void:
	finished = true
	for action in [GAS, REVERSE, LEFT, RIGHT, BRAKE, DELIVER]:
		_action(action, 0.0)
	if not headless and not frame_intervals.is_empty():
		var over_22 := 0
		var over_50 := 0
		# A readback for the visible preview adds one artificial gap. Keep it in the totals.
		for interval in frame_intervals:
			over_22 += int(interval > 22.2)
			over_50 += int(interval > 50.0)
		var count := frame_intervals.size()
		var duration := float(last_frame_usec - interval_start) / 1000000.0
		frame_intervals.sort()
		print("FRAME_P95 %.2f ms, slowest at %s" % [frame_intervals[ceili(count*0.95)-1], slowest_at])
		print("FRAMES %.1f s, %d intervals, %.1f FPS, p99 %.2f ms, >22.2 ms %d, >50 ms %d, max %.2f ms" %
			[duration, count, count / duration, frame_intervals[ceili(count*0.99)-1], over_22, over_50, frame_intervals[-1]])
	print("DRIVE_OK")
	get_tree().quit()
