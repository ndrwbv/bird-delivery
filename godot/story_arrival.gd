extends Node3D

signal at_door
signal returned

enum Phase { IDLE, PARK, TO_DOOR, INSIDE, TO_CAR }
var phase := Phase.IDLE
var car: CharacterBody3D
var courier: CharacterBody3D
var chase: Camera3D
var terrain: RefCounted
var routes: RefCounted
var site: Dictionary
var road := PackedVector2Array()
var meters := 0.0
var elapsed := 0.0
var duration := 1.0
var start_yaw := 0.0
var carrying_box: Node3D
var fallback := false
var fade_layer := CanvasLayer.new()
var shade := ColorRect.new()


func setup(vehicle: CharacterBody3D, person: CharacterBody3D, camera: Camera3D, ground: RefCounted, graph: RefCounted, location: Dictionary) -> void:
	car = vehicle
	courier = person
	chase = camera
	terrain = ground
	routes = graph
	site = location
	fade_layer.layer = 9
	add_child(fade_layer)
	fade_layer.add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shade.color = Color.BLACK
	shade.hide()


func try_begin(box: Node3D) -> bool:
	if phase != Phase.IDLE:
		return false
	var start := Vector2(car.position.x, car.position.z)
	var parking := _v(site.parking)
	if start.distance_to(_v(site.door)) > 38.0:
		return false
	var approach := _v(site.approach)
	road = PackedVector2Array([start])
	if routes.walk_clear(start, parking):
		road.append(parking)
	elif routes.walk_clear(start, approach):
		road.append(approach)
		road.append(parking)
	else:
		road = PackedVector2Array([approach, parking])
		fallback = true
		shade.show()
		shade.modulate.a = 1
	meters = 0
	for i in range(1, road.size()):
		meters += road[i-1].distance_to(road[i])
	duration = clampf(meters/13.0, .9, 5.5)
	elapsed = 0
	start_yaw = car.rotation.y
	car.controls_locked = true
	car.set_physics_process(false)
	car.velocity = Vector3.ZERO
	car.speed = 0
	if fallback:
		car.position = _ground(approach)
		car.reset_physics_interpolation()
	carrying_box = box
	phase = Phase.PARK
	return true


func step(delta: float) -> void:
	match phase:
		Phase.PARK:
			elapsed += delta
			var t := clampf(elapsed/duration, 0, 1)
			var distance := smoothstep(0, 1, t) * meters
			for i in range(1, road.size()):
				var a := road[i-1]
				var b := road[i]
				var span := a.distance_to(b)
				if distance > span and i < road.size()-1:
					distance -= span
					continue
				car.position = _ground(a.move_toward(b, distance))
				var heading := atan2(a.x-b.x, a.y-b.y)
				heading = lerp_angle(heading, float(site.parking_heading) + PI, smoothstep(.74, 1.0, t))
				car.rotation.y = lerp_angle(start_yaw, heading, smoothstep(0,.38,t))
				break
			if fallback:
				shade.modulate.a = 1.0 - smoothstep(0,.35,elapsed)
				if shade.modulate.a == 0:
					shade.hide()
					fallback = false
			if t >= 1:
				_walk_in()
		Phase.TO_DOOR:
			if courier.run_to(_ground(_v(site.spot)), 3.8, delta, true):
				phase = Phase.INSIDE
				at_door.emit()
		Phase.TO_CAR:
			if courier.run_to(car.to_global(Vector3(-1.35,0,-.42)), 4.1, delta, false):
				courier.hide_courier()
				chase.follow_person(null)
				car.controls_locked = false
				car.set_physics_process(true)
				phase = Phase.IDLE
				returned.emit()


func _walk_in() -> void:
	var at := car.to_global(Vector3(-1.35,0,-.42))
	var front := _ground(_v(site.spot)) - at
	courier.show_courier(at, front, carrying_box)
	courier.interaction_locked = true
	carrying_box.reparent(courier.grip, false)
	carrying_box.position = Vector3(0,.08,0)
	carrying_box.show()
	chase.follow_person(courier)
	phase = Phase.TO_DOOR


func walk_out() -> void:
	carrying_box.hide()
	carrying_box.reparent(self, false)
	carrying_box.queue_free()
	courier.carrying = false
	phase = Phase.TO_CAR


func _ground(at: Vector2) -> Vector3:
	return Vector3(at.x, terrain.at(at.x, at.y) + .04, at.y)


func _v(point: Array) -> Vector2:
	return Vector2(point[0], point[1])
