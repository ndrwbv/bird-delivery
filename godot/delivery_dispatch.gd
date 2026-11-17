extends Node3D

const STARTER := preload("res://assets/courier-starter.wav")
const BAG_HOLD := Vector3(0.0,0.09,0.035)
const RUN_SPEED := 6.9

enum Stage { IDLE, RUN, LOAD, WALK, START }

var stage := Stage.IDLE
var car: CharacterBody3D
var courier: CharacterBody3D
var chase: Camera3D
var terrain: RefCounted
var door: Node3D
var door_leaf: Node3D
var bag: Node3D
var starter: AudioStreamPlayer3D
var path := PackedVector2Array()
var leg := 0
var elapsed := 0.0


func setup(vehicle: CharacterBody3D, runner: CharacterBody3D, camera: Camera3D,
		ground: RefCounted, data: Dictionary) -> void:
	car = vehicle
	courier = runner
	chase = camera
	terrain = ground
	var threshold := Vector2(float(data.door[0]),float(data.door[1]))
	var front := Vector2(sin(float(data.yaw)),cos(float(data.yaw)))
	door = Node3D.new()
	door.position = _at_ground(threshold)
	door.rotation.y = float(data.yaw)
	add_child(door)
	_make_pizzeria_door()
	var inside := threshold-front*0.23
	path.append(inside)
	for point: Array in data.run:
		path.append(Vector2(float(point[0]),float(point[1])))
	bag = _make_bag()
	add_child(bag)
	bag.hide()
	starter = AudioStreamPlayer3D.new()
	starter.stream = STARTER
	starter.volume_db = -8.0
	starter.unit_size = 7.0
	car.add_child(starter)


func active() -> bool:
	return stage != Stage.IDLE


func begin() -> void:
	stage = Stage.RUN
	elapsed = 0.0
	leg = 1
	car.controls_locked = true
	var origin := _at_ground(path[0])
	var forward := _at_ground(path[1])-origin
	courier.show_courier(origin,forward,bag)
	courier.interaction_locked = true
	bag.reparent(courier.grip,false)
	bag.position = BAG_HOLD
	bag.rotation = Vector3.ZERO
	bag.show()
	door_leaf.rotation.y = -1.36
	chase.follow_dispatch(courier)


func step(delta: float, skip: bool) -> bool:
	if skip:
		finish()
		return true
	elapsed += delta
	match stage:
		Stage.RUN:
			if courier.position.distance_to(car.position) < 10.0:
				chase.frame_trunk()
			var arrived: bool = courier.run_to(_at_ground(path[leg]),RUN_SPEED,delta,true)
			door_leaf.rotation.y = lerpf(-1.36,0.0,smoothstep(0.34,0.82,elapsed))
			car.damage.trunk_open = smoothstep(2.9,3.55,elapsed)
			if arrived:
				leg += 1
				if leg == path.size():
					_begin_load()
		Stage.LOAD:
			var t := smoothstep(0.03,0.62,elapsed)
			var grip: Vector3 = courier.grip.to_global(BAG_HOLD)
			var boot := car.to_global(Vector3(0.0,0.98,1.86))
			bag.global_position = grip.lerp(boot,t)+Vector3.UP*sin(t*PI)*0.36
			car.damage.trunk_open = 1.0-smoothstep(0.63,0.87,elapsed)
			if elapsed >= 0.66:
				bag.hide()
			if elapsed >= 0.88:
				stage = Stage.WALK
				elapsed = 0.0
				leg = 0
		Stage.WALK:
			var offset := Vector3(-1.52,0.0,2.25) if leg == 0 else Vector3(-1.52,0.0,-0.52)
			var point := car.to_global(offset)
			if courier.run_to(_at_ground(Vector2(point.x,point.z)),4.1,delta,false):
				leg += 1
				if leg == 2:
					_begin_ignition()
		Stage.START:
			car.damage.driver_door_open = 1.0-smoothstep(0.16,0.46,elapsed)
			if elapsed >= 0.16:
				courier.hide_courier()
			if elapsed >= 0.68:
				finish()
				return true
	return false


func finish() -> void:
	if not active():
		return
	stage = Stage.IDLE
	door_leaf.rotation.y = 0.0
	bag.hide()
	if bag.get_parent() != self:
		bag.reparent(self,false)
	courier.hide_courier()
	car.damage.trunk_open = 0.0
	car.damage.driver_door_open = 0.0
	car.controls_locked = false
	chase.follow_person(null)


func _begin_load() -> void:
	stage = Stage.LOAD
	elapsed = 0.0
	car.damage.trunk_open = 1.0
	var facing := car.position-courier.position
	courier.rotation.y = atan2(facing.x,facing.z)
	courier.player.play(&"carry",0.10)
	bag.reparent(self,true)


func _begin_ignition() -> void:
	stage = Stage.START
	elapsed = 0.0
	car.damage.driver_door_open = 1.0
	courier.player.play(&"idle",0.1)
	chase.follow_person(null)
	starter.play()


func _at_ground(point: Vector2) -> Vector3:
	return Vector3(point.x,terrain.at(point.x,point.y)+0.025,point.y)


func _make_pizzeria_door() -> void:
	var dark := _paint("#493021")
	var wood := _paint("#662e1b")
	var glass := _paint("#74625a")
	glass.metallic = 0.12
	glass.roughness = 0.23
	_panel(door,Vector3(2.1,2.37,0.065),Vector3(0.0,1.56,-0.13),dark)
	door_leaf = Node3D.new()
	door_leaf.position = Vector3(-1.02,0.0,0.07)
	door.add_child(door_leaf)
	_panel(door_leaf,Vector3(1.02,2.23,0.065),Vector3(0.51,1.56,0.0),wood)
	_panel(door_leaf,Vector3(0.83,1.66,0.07),Vector3(0.51,1.66,0.025),glass)
	_panel(door_leaf,Vector3(0.06,0.28,0.09),Vector3(0.89,1.36,0.084),_paint("#e8bd80"))
	_panel(door,Vector3(0.91,2.23,0.065),Vector3(0.56,1.56,0.08),wood)
	_panel(door,Vector3(0.76,1.66,0.071),Vector3(0.56,1.66,0.107),glass)


func _make_bag() -> Node3D:
	var item := Node3D.new()
	var cloth := _paint("#a93923")
	var seams := _paint("#df7755")
	var handle := _paint("#2d2220")
	_panel(item,Vector3(0.48,0.24,0.44),Vector3.ZERO,cloth)
	_panel(item,Vector3(0.51,0.043,0.47),Vector3(0.0,0.12,0.015),seams)
	_panel(item,Vector3(0.23,0.036,0.038),Vector3(0.0,0.164,0.13),handle)
	_panel(item,Vector3(0.04,0.078,0.04),Vector3(0.10,0.144,0.13),handle)
	_panel(item,Vector3(0.04,0.078,0.04),Vector3(-0.10,0.144,0.13),handle)
	_panel(item,Vector3(0.42,0.12,0.37),Vector3(0.06,-0.17,-0.03),cloth)
	var label := Label3D.new()
	label.text = "ПТИЦА ПИЦЦА"
	label.font_size = 37
	label.pixel_size = 0.00135
	label.position.z = 0.225
	label.modulate = Color("#ffead2")
	label.outline_size = 0
	item.add_child(label)
	return item


func _paint(hex: String) -> StandardMaterial3D:
	var paint := StandardMaterial3D.new()
	paint.albedo_color = Color(hex)
	paint.roughness = 0.88
	return paint


func _panel(parent: Node3D, size: Vector3, at: Vector3, paint: Material) -> void:
	var panel := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size
	shape.material = paint
	panel.mesh = shape
	panel.position = at
	parent.add_child(panel)
