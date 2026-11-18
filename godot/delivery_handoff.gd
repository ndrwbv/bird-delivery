extends Node3D

signal arrived
signal payment_started

# The public phases are also used by the shift, HUD and benchmark.
enum Stage { DRIVING, TAKING, CARRYING, HANDOFF, CASH, RETURNING }
const CARGO := preload("res://pizza_cargo.gd")
const HANDOFF_CAMERA := preload("res://delivery_handoff_camera.gd")
const ARRIVAL_RADIUS := 6.0
const ARRIVAL_SPEED := 6.0
const PIN_TIME := 0.28
const TRUNK_TIME := 0.4
const REACH_TIME := 0.15
const FLIGHT_TIME := 0.6
const LOWER_TIME := 0.65
const PAYMENT_TIME := 5.5
const RETURN_DELAY := 0.9
const BOOT := Vector3(0.0, 0.98, 1.86)

var stage := Stage.DRIVING
var car: CharacterBody3D
var target: Node3D
var door: Node3D
var reach := ARRIVAL_RADIUS
var done := false
var failed := false
var tips_allowed := true
var paid := false

var view := HANDOFF_CAMERA.new()
var terrain: RefCounted
var spilled: Array[Dictionary] = []
var queue: Array[Node3D] = []
var flying_box: CARGO
var elapsed := 0.0
var flight_from := Vector3.ZERO
var reaching := false
var launched := false
var caught := false


func setup(vehicle: CharacterBody3D, _person: CharacterBody3D, camera: Camera3D, ground: RefCounted) -> void:
	car = vehicle
	terrain = ground
	add_child(view)
	view.setup(camera, vehicle, ground)


func play_order(receiver: Node3D, entrance: Node3D, arrival_radius := ARRIVAL_RADIUS, boxes := 1) -> void:
	_clear_presentation()
	queue.clear()
	target = receiver
	door = entrance
	reach = arrival_radius
	flying_box = _package(boxes)
	elapsed = 0.0
	reaching = false
	launched = false
	caught = false
	paid = false
	done = false
	failed = false
	tips_allowed = true
	stage = Stage.DRIVING


func add_recipient(person: Node3D) -> void:
	queue.append(person)


func reset_order() -> bool:
	if not paid:
		return false
	# An accepted stop stays completed even when the car is reset mid-flight.
	if not caught and _receiver_alive() and is_instance_valid(flying_box):
		_give_box()
	_clear_presentation()
	stage = Stage.RETURNING
	done = true
	return true


func cancel_order() -> void:
	queue.clear()
	_clear_presentation()
	stage = Stage.RETURNING
	paid = false
	done = false
	failed = false


func customer_hit(result: int) -> void:
	if stage != Stage.DRIVING or paid or done:
		return
	if result == 1:
		tips_allowed = false
	elif result == 3:
		failed = true
		done = true


func action_ready(stop: Vector3) -> bool:
	if paid or done or stage != Stage.DRIVING or not _receiver_alive():
		return false
	var speed := Vector2(car.velocity.x, car.velocity.z)
	if speed.length_squared() > ARRIVAL_SPEED * ARRIVAL_SPEED:
		return false
	var at := Vector2(car.position.x, car.position.z)
	var receiver := Vector2(target.position.x, target.position.z)
	var road_end := Vector2(stop.x, stop.z)
	return at.distance_squared_to(receiver) <= reach * reach or at.distance_squared_to(road_end) <= maxf(ARRIVAL_RADIUS, reach) ** 2


func pin_alpha() -> float:
	if stage == Stage.DRIVING:
		return 1.0
	if stage == Stage.HANDOFF:
		return clampf(1.0 - elapsed / PIN_TIME, 0.0, 1.0)
	return 0.0


func step(delta: float, use: bool, stop: Vector3) -> void:
	if done:
		return
	match stage:
		Stage.DRIVING:
			if action_ready(stop):
				paid = true
				stage = Stage.HANDOFF
				view.start(target)
				arrived.emit()
		Stage.HANDOFF:
			_present_box(delta)
		Stage.CASH:
			elapsed += delta
			if use or elapsed >= PAYMENT_TIME:
				close_payment()
		Stage.RETURNING:
			elapsed += delta
			if elapsed >= RETURN_DELAY:
				done = true


func close_payment() -> void:
	if stage == Stage.CASH:
		elapsed = 0.0
		stage = Stage.RETURNING


func _present_box(delta: float) -> void:
	elapsed += delta
	var trunk_time := elapsed - PIN_TIME
	var flight_time := trunk_time - TRUNK_TIME
	if trunk_time >= 0.0:
		var open := flight_time < FLIGHT_TIME
		car.damage.trunk_open = lerpf(car.damage.trunk_open, float(open), 1.0 - exp(-9.0 * delta))
	if trunk_time >= REACH_TIME and not reaching:
		reaching = true
		if _receiver_alive():
			var look := car.position - target.position
			target.rotation.y = atan2(look.x, look.z)
			target.player.play(&"carry", 0.12)
	if flight_time >= 0.0 and not caught:
		_step_flight(flight_time, delta)
	if flight_time >= FLIGHT_TIME + LOWER_TIME:
		while not queue.is_empty():
			var next: Node3D = queue.pop_front()
			if not is_instance_valid(next) or next.defeated:
				continue
			target = next
			flying_box = _package(1)
			launched = false
			caught = false
			reaching = false
			elapsed = PIN_TIME
			view.start(target)
			return
		car.damage.trunk_open = 0.0
		stage = Stage.CASH
		elapsed = 0.0
		payment_started.emit()


func _step_flight(time: float, delta: float) -> void:
	if not _receiver_alive():
		if is_instance_valid(flying_box):
			flying_box.queue_free()
			flying_box = null
		caught = true
		return
	if not launched:
		launched = true
		flight_from = car.to_global(BOOT)
		flying_box.show()
		flying_box.global_position = flight_from
		flying_box.reset_physics_interpolation()
	var t := clampf(time / FLIGHT_TIME, 0.0, 1.0)
	var hands: Node3D = target.grip
	flying_box.global_position = flight_from.lerp(hands.global_position, t) + Vector3.UP * sin(t * PI) * 1.9
	flying_box.rotate_x(7.0 * delta)
	flying_box.rotate_y(4.0 * delta)
	if t > 0.65:
		flying_box.global_basis = flying_box.global_basis.slerp(hands.global_basis, (t - 0.65) / 0.35)
	if t >= 1.0:
		_give_box()


func _give_box() -> void:
	flying_box.reparent(target.grip, false)
	flying_box.transform = Transform3D.IDENTITY
	if flying_box.count >= 4 and launched and randf() < .30:
		_spill()
	flying_box.show()
	target.player.play(&"carry", 0.12)
	caught = true
	var held := flying_box
	flying_box = null
	# After the catch the customer holds the box independently of the on-screen payment.
	var delay: float = target.box_caught()
	get_tree().create_timer(delay, false, true).timeout.connect(_leave_with_box.bind(target, door, held))


func _leave_with_box(person: Node3D, entrance: Node3D, held: Node3D) -> void:
	if not is_instance_valid(held):
		return
	if is_instance_valid(person) and is_instance_valid(entrance) and not person.defeated and person.is_visible_in_tree():
		person.go_inside(held, entrance)
	else:
		held.queue_free()


func _receiver_alive() -> bool:
	return is_instance_valid(target) and target.is_visible_in_tree() and not target.defeated


func _clear_presentation() -> void:
	view.finish()
	if is_instance_valid(flying_box):
		flying_box.queue_free()
		flying_box = null
	car.damage.trunk_open = 0.0


func _package(boxes: int) -> CARGO:
	var cargo := CARGO.new()
	cargo.setup(boxes)
	add_child(cargo)
	cargo.hide()
	return cargo


func _spill() -> void:
	var count := mini(3,flying_box.count-2)
	var top := flying_box.to_global(Vector3.UP*(flying_box.count-1)*CARGO.HEIGHT)
	flying_box.resize(flying_box.count-count)
	for i in count:
		var loose := _package(1)
		loose.global_position = top+Vector3.UP*i*.08
		loose.show()
		var impulse := Vector3(randf_range(-1.5,1.5),randf_range(.4,1.4),randf_range(-1.8,1.8))
		spilled.append({"box":loose,"velocity":impulse,"ttl":14.0})


func _physics_process(delta: float) -> void:
	for i in range(spilled.size()-1,-1,-1):
		var part := spilled[i]
		part.ttl -= delta
		var piece: Node3D = part.box
		if part.ttl <= 0:
			piece.queue_free()
			spilled.remove_at(i)
		elif not part.velocity.is_zero_approx():
			part.velocity.y -= 9.8*delta
			piece.position += part.velocity*delta
			var floor_y: float = terrain.at(piece.position.x,piece.position.z,piece.position.y)+.05
			if piece.position.y <= floor_y:
				piece.position.y = floor_y
				piece.rotation = Vector3.ZERO
				part.velocity = Vector3.ZERO
			else:
				piece.rotate_x(4.0*delta)
