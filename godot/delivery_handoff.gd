extends Node3D

enum Stage { DRIVING, TAKING, CARRYING, HANDOFF, CASH, RETURNING }
const PARK_RADIUS := 9.0
const REACH := 1.23
const RETURN_RADIUS := 3.45
const TRANSFER_SECONDS := 0.52
const CASH_SECONDS := 0.56

var stage := Stage.DRIVING
var car: CharacterBody3D
var courier: CharacterBody3D
var chase: Camera3D
var terrain: RefCounted
var target: Node3D
var box: Node3D
var transfer := 0.0
var handoff_position := Vector3.ZERO
var door: Node3D
var cash: Node3D
var reach_query := PhysicsRayQueryParameters3D.new()
var exit_line := PhysicsRayQueryParameters3D.new()
var done := false
var failed := false
var tips_allowed := true
var exit_point := Vector3.ZERO
var exit_query := PhysicsShapeQueryParameters3D.new()


func setup(vehicle: CharacterBody3D, person: CharacterBody3D, camera: Camera3D, ground: RefCounted) -> void:
	car = vehicle
	courier = person
	chase = camera
	terrain = ground
	var shape := CapsuleShape3D.new()
	shape.radius = 0.41
	shape.height = 1.66
	exit_query.shape = shape
	exit_query.collision_mask = 47
	reach_query.collision_mask = 9
	exit_line.collision_mask = 11
	box = _make_box()
	add_child(box)
	box.hide()


func reset_order() -> bool:
	var already_delivered := stage == Stage.RETURNING or stage == Stage.CASH
	if stage == Stage.CASH:
		_complete_cash()
	_return_to_driver()
	return already_delivered


func play_order(receiver: Node3D, entrance: Node3D) -> void:
	target = receiver
	door = entrance
	done = false
	failed = false
	tips_allowed = true


func customer_hit(result: int) -> void:
	if result == 1:
		tips_allowed = false
	elif result == 3:
		_return_to_driver()
		failed = true
		done = true


func action_ready(stop: Vector3) -> bool:
	match stage:
		Stage.DRIVING:
			return _distance_2d(car.position,stop) < PARK_RADIUS and absf(car.speed) < 0.9
		Stage.RETURNING:
			return _distance_2d(courier.position,car.position) < RETURN_RADIUS
	return false


func step(delta: float, use: bool, stop: Vector3) -> void:
	if not is_instance_valid(target):
		return
	if stage == Stage.TAKING:
		transfer += delta
		car.damage.trunk_open = sin(PI*clampf(transfer/0.47,0.0,1.0))
		if transfer >= 0.47:
			box.show()
			courier.interaction_locked = false
			stage = Stage.CARRYING
		return
	match stage:
		Stage.CARRYING:
			if _receiver_in_reach():
				_start_handoff()
			return
		Stage.HANDOFF:
			transfer += delta
			courier.position = courier.position.lerp(handoff_position,1.0-exp(-16.0*delta))
			if transfer >= TRANSFER_SECONDS:
				_start_cash()
			return
		Stage.CASH:
			transfer += delta
			if transfer >= 0.27 and cash.get_parent() != courier.grip.cash:
				cash.reparent(courier.grip.cash,false)
			if transfer >= CASH_SECONDS:
				_complete_cash()
			return
	if not use or not action_ready(stop):
		return
	if stage == Stage.DRIVING:
		_exit_car()
	elif stage == Stage.RETURNING:
		_return_to_driver()
		done = true


func _receiver_in_reach() -> bool:
	if _distance_2d(courier.position,target.position) >= REACH or absf(courier.position.y-target.position.y) > 0.45:
		return false
	reach_query.from = courier.position+Vector3.UP*1.05
	reach_query.to = target.position+Vector3.UP*1.05
	return get_world_3d().direct_space_state.intersect_ray(reach_query).is_empty()


func _exit_car() -> void:
	var bias := -1.0 if car.basis.x.dot(target.position-car.position) < 0.0 else 1.0
	var places: Array[Vector3] = [car.position+car.basis.z*2.83]
	for side in [bias,-bias]:
		for fore in [0.1,-1.50,1.51]:
			places.append(car.position+car.basis.x*float(side)*1.68-car.basis.z*float(fore))
	places.sort_custom(func(a: Vector3,b: Vector3):
		return _distance_2d(a,target.position) < _distance_2d(b,target.position))
	var space := get_world_3d().direct_space_state
	var fallback := Vector3.INF
	exit_line.to = target.position+Vector3.UP*0.83
	for candidate in places:
		candidate.y = terrain.at(candidate.x,candidate.z)+0.02
		exit_query.transform = Transform3D(Basis.IDENTITY,candidate+Vector3.UP*0.83)
		if not space.intersect_shape(exit_query,1).is_empty():
			continue
		if not fallback.is_finite():
			fallback = candidate
		exit_line.from = candidate+Vector3.UP*0.83
		if space.intersect_ray(exit_line).is_empty():
			fallback = candidate
			break
	if not fallback.is_finite():
		return
	exit_point = fallback
	car.controls_locked = true
	courier.show_courier(exit_point,target.position-exit_point,box)
	box.reparent(courier.grip,false)
	box.position = Vector3.ZERO
	box.rotation = Vector3.ZERO
	box.hide()
	courier.interaction_locked = true
	chase.follow_person(courier)
	transfer = 0.0
	stage = Stage.TAKING


func _start_handoff() -> void:
	var direction := target.position-courier.position
	direction.y = 0.0
	direction = direction.normalized()
	if direction.length_squared() < 0.01:
		direction = courier.basis.z
	var facing := atan2(direction.x,direction.z)
	courier.rotation.y = facing
	target.rotation.y = facing+PI
	courier.interaction_locked = true
	courier.player.play(&"carry",0.10)
	target.player.play(&"carry",0.12)
	handoff_position = target.position-direction*0.87
	handoff_position.y = terrain.at(handoff_position.x,handoff_position.z)+0.02
	chase.focus_exchange(target)
	transfer = 0.0
	stage = Stage.HANDOFF


func _start_cash() -> void:
	box.reparent(target.grip,false)
	box.position = Vector3.ZERO
	box.rotation = Vector3.ZERO
	target.grip.support_on_left(true)
	cash = _make_cash()
	target.grip.cash.add_child(cash)
	courier.player.play(&"exchange",0.12)
	target.player.play(&"exchange",0.12)
	transfer = 0.0
	stage = Stage.CASH


func _complete_cash() -> void:
	cash.queue_free()
	cash = null
	target.go_inside(box,door)
	box = _make_box()
	add_child(box)
	box.hide()
	courier.carrying = false
	courier.interaction_locked = false
	chase.focus_exchange(null)
	stage = Stage.RETURNING


func _return_to_driver() -> void:
	car.damage.trunk_open = 0.0
	courier.hide_courier()
	if box.get_parent() != self:
		box.reparent(self,false)
	box.hide()
	car.controls_locked = false
	chase.follow_person(null)
	stage = Stage.DRIVING


func _distance_2d(a: Vector3, b: Vector3) -> float:
	return Vector2(a.x-b.x,a.z-b.z).length()


func _make_cash() -> Node3D:
	var notes := Node3D.new()
	var paper := StandardMaterial3D.new()
	paper.albedo_color = Color("#d2d99b")
	paper.roughness = 0.88
	var ink := StandardMaterial3D.new()
	ink.albedo_color = Color("#537252")
	_box_face(notes,Vector3(0.112,0.005,0.057),Vector3.ZERO,paper)
	_box_face(notes,Vector3(0.071,0.002,0.035),Vector3(-0.008,0.003,0.003),ink)
	notes.rotation.y = 0.38
	return notes


func _make_box() -> Node3D:
	var root := Node3D.new()
	var kraft := StandardMaterial3D.new()
	kraft.albedo_color = Color("#ceb384")
	kraft.roughness = 0.98
	var lid := StandardMaterial3D.new()
	lid.albedo_color = Color("#e6cc9e")
	lid.roughness = 0.94
	_box_face(root,Vector3(0.39,0.056,0.40),Vector3.ZERO,kraft)
	_box_face(root,Vector3(0.405,0.016,0.41),Vector3(0.0,0.031,-0.003),lid)
	var band := StandardMaterial3D.new()
	band.albedo_color = Color("#9d4032")
	band.roughness = 0.92
	_box_face(root,Vector3(0.26,0.004,0.063),Vector3(0.0,0.041,0.016),band)
	var label := Label3D.new()
	label.text = "ПТИЦА ПИЦЦА"
	label.font_size = 24
	label.pixel_size = 0.00135
	label.modulate = Color("#f3d7a8")
	label.outline_size = 0
	label.position = Vector3(0.0,0.044,0.016)
	label.rotation.x = -PI*0.5
	root.add_child(label)
	return root


func _box_face(root: Node3D, size: Vector3, at: Vector3, paint: Material) -> void:
	var instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = paint
	instance.mesh = mesh
	instance.position = at
	root.add_child(instance)
