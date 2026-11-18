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
var previous_draw_calls := 0
var next_report := 20.0
var ready_reported := false
var capture_dir := ""
var straight_road := false
var matched_input := false
var sample_clock := 0.0
var next_speed_sample := 0.0
var sample_seconds := 0.0
var startup_only := false
var first_order_only := false
var capture_index := 0
var frame_intervals := PackedFloat64Array()
var interval_start := 0
var last_frame_usec := 0
var slowest_interval := 0.0
var slowest_at := Vector2.ZERO
var phase_start := -1.0
var phase_name := ""
var headless := false
var finished := false
var last_delivery_stage := 0


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	headless = DisplayServer.get_name() == "headless"
	straight_road = "--straight-road" in args
	matched_input = straight_road or "--matched-input" in args
	startup_only = "--startup-only" in args
	first_order_only = "--first-order" in args
	for arg in args:
		if arg.begins_with("--sample-seconds="):
			sample_seconds = arg.trim_prefix("--sample-seconds=").to_float()
		elif arg.begins_with("--capture-dir="):
			capture_dir = arg.trim_prefix("--capture-dir=")
	if not headless:
		RenderingServer.frame_post_draw.connect(_frame_presented)
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_physics_priority = 1


func _physics_process(delta: float) -> void:
	if finished:
		return
	if game.choices.visible:
		print("CHOICE at ",car.position," · hearts ",car.hearts," · sinking ",car.sinking)
		game.choices._pick(0)
	if get_tree().paused:
		return
	elapsed += delta
	if elapsed >= next_report:
		next_report += 20.0
		var obstacle := ""
		if car.get_slide_collision_count():
			var hit := car.get_last_slide_collision()
			var body := hit.get_collider() as Node
			obstacle = str(body.get_path()) if body else ""
		print("ROUTE ", roundi(elapsed), " s · ", car.position, " · точка ", waypoint, " / ", path.size(), " · скорость ", car.speed, " · препятствие ", obstacle, " · урон ", car.hearts, " · курс ", car.rotation.y)
	_note_phase()
	if game.destination < 0:
		return
	if game.papers.active() and not game.papers.blocking():
		game.papers.accept_invoice()
	if game.papers.blocking():
		_finish()
		return
	if elapsed > 720.0:
		push_error("Drive timed out at %s near waypoint %s of order %s" % [str(car.position), waypoint, order+1])
		get_tree().quit(1)
		return
	if game.destination != order:
		print("DELIVERY %d at %.2f s" % [game.destination, elapsed])
		if game.destination >= game.map_data.deliveries.size() or (first_order_only and order >= 0):
			_finish()
			return
		_set_path()
	elif returning != game.back_to_depot:
		_set_path()
	if matched_input:
		if not game.dispatch.active():
			if straight_road and sample_clock == 0.0:
				var axis := Vector2(-31.22,156.08)
				car.park(Vector2(-82.78,75.92)+axis*.36,atan2(axis.x,axis.y)+PI)
				game.chase.reset_view()
			sample_clock += delta
			_action(GAS, float(sample_clock < 2.8))
			_action(REVERSE, float(sample_clock >= 2.8 and sample_clock < 4.4))
			if headless and matched_input and sample_seconds > 0 and sample_clock >= sample_seconds:
				_finish()
				return
			if sample_clock <= 7.5 and sample_clock+.000001 >= next_speed_sample:
				print("SPEED %.2f %.3f at %s HP %.2f" % [sample_clock, Vector2(car.velocity.x,car.velocity.z).length(), car.position,car.hearts])
				next_speed_sample += .5
	elif not game.courier.active and not path.is_empty():
		_drive()


func _note_phase() -> void:
	var next: String
	if game.destination < 0:
		next = "общий чат"
	elif game.destination >= game.map_data.deliveries.size():
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
	if phase_start >= 0:
		print("PHASE %s · %.2f s" % [phase_name, elapsed - phase_start])
	phase_name = next
	phase_start = elapsed


func _drive() -> void:
	var at := Vector2(car.position.x, car.position.z)
	var last := path.size() - 1
	while waypoint < last:
		var end := path[waypoint]
		var passed := (at-end).dot(end-path[waypoint-1]) >= 0 and at.distance_to(end) < 6
		if at.distance_to(end) >= 2.3 and not passed:
			break
		waypoint += 1
	var to_target := path[waypoint] - at
	var meters := to_target.length()
	# Pursue the lane itself, including long OSM segments with no intermediate vertices.
	if waypoint > 0:
		var a := path[waypoint-1]
		var b := path[waypoint]
		if a.distance_squared_to(b) > 24.0 * 24:
			var near := Geometry2D.get_closest_point_to_segment(at,a,b)
			to_target = near.move_toward(b, clampf(3.0 + absf(car.speed) * .60, 3, 10)) - at

	if waypoint == last and meters < 5.5:
		_action(GAS, 0.0)
		_action(REVERSE, 0.0)
		_action(BRAKE, 1.0)
		_action(LEFT, 0.0)
		_action(RIGHT, 0.0)
		_action(DELIVER, 0.0)
		return

	var heading := atan2(-to_target.x, -to_target.y)
	var error := angle_difference(car.rotation.y, heading)
	var reversing := absf(error) > 2.12
	var steer_error := wrapf(error + PI, -PI, PI) if reversing else -error
	var turn_choke := clampf(1.0 - absf(steer_error) * 0.67, 0.26, 1.0)
	var target_speed := minf(15.0, 3.0 + meters * .7) * turn_choke
	if waypoint < last and meters < 12 and absf((path[waypoint+1]-path[waypoint]).angle_to(path[waypoint]-path[waypoint-1])) > .7:
		target_speed = minf(target_speed, 2.8 + meters * .3)
	if waypoint == last:
		target_speed = minf(target_speed, 0.9 * meters)
	var speed := absf(car.speed)
	_action(LEFT, clampf(-steer_error * 1.7, 0.0, 1.0))
	_action(RIGHT, clampf(steer_error * 1.7, 0.0, 1.0))
	_action(DELIVER, 0.0)
	_action(BRAKE, 1.0 if speed > target_speed + 2.1 and not reversing else 0.0)
	_action(REVERSE, clampf(target_speed / 5.8, 0.45, 1.0) if reversing else 0.0)
	_action(GAS, 1.0 if not reversing and speed < target_speed + 1.0 else 0.0)


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
	if finished:
		return
	var now := Time.get_ticks_usec()
	if not ready_reported and absf(car.speed) > 0.01:
		ready_reported = true
		print("PLAYABLE %.3f seconds · output %s · 3D scale %.3f · %s" %
			[Time.get_ticks_msec()*.001,get_viewport().get_texture().get_size(),get_viewport().scaling_3d_scale,RenderingServer.get_video_adapter_name()])
		_capture("start")
		if startup_only:
			get_tree().quit()
			return
	if ready_reported and elapsed > 2.0:
		if last_frame_usec != 0:
			var interval := float(now - last_frame_usec) / 1000.0
			frame_intervals.append(interval)
			if interval > 50:
				print("LONG_FRAME %.2f ms · %s · %s · %d tiles · CPU %.2f ms · physics %.2f ms · draws %d → %d" %
					[interval,car.position,phase_name,game.region_world.loaded.size(),Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,
					Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0,previous_draw_calls,
					int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))])
			if interval > slowest_interval:
				slowest_interval = interval
				slowest_at = Vector2(car.position.x, car.position.z)
		else:
			interval_start = now
		last_frame_usec = now
		previous_draw_calls = int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	if sample_seconds > 0 and interval_start > 0 and (now-interval_start)*.000001 >= sample_seconds:
		_finish()
		return
	if capture_index == 1 and elapsed > 8.0:
		_capture("drive")
	if capture_index == 2 and game.delivery.stage == HANDOFF.Stage.HANDOFF:
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
