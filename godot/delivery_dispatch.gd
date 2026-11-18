extends Node3D

const FLIGHT_TIME := 1.0
const CARGO := preload("res://pizza_cargo.gd")

var car: CharacterBody3D
var door := Node3D.new()
var door_leaf: Node3D
var bag := CARGO.new()
var elapsed := FLIGHT_TIME
var kitchen_wait := 0.0
var origin: Vector3


func setup(vehicle: CharacterBody3D, ground: RefCounted, data: Dictionary) -> void:
	car = vehicle
	var at := Vector2(data.door[0], data.door[1])
	door.position = Vector3(at.x, ground.at(at.x, at.y), at.y)
	door.rotation.y = float(data.yaw)
	add_child(door)
	_make_pizzeria_door()
	origin = door.to_global(Vector3(0.0, 1.7, 0.3))
	bag.setup(1)
	add_child(bag)
	bag.hide()


func active() -> bool:
	return elapsed < FLIGHT_TIME


func begin(delay := 0.0, boxes := 1) -> void:
	bag.resize(boxes)
	elapsed = 0.0
	kitchen_wait = maxf(0.0,delay)
	bag.position = origin
	bag.visible = kitchen_wait <= 0.0


func step(delta: float) -> bool:
	if not active():
		return false
	if kitchen_wait > 0:
		var waiting := minf(kitchen_wait,delta)
		delta -= waiting
		kitchen_wait -= waiting
		if kitchen_wait > 0:
			return false
		bag.show()
	elapsed = minf(FLIGHT_TIME,elapsed+delta)
	var t := elapsed / FLIGHT_TIME
	var trunk := car.to_global(Vector3(0.0, 0.98, 1.86))
	bag.position = origin.lerp(trunk, t) + Vector3.UP * (4.0 * t * (1.0 - t) * 2.3)
	bag.rotation.y = lerp_angle(door.rotation.y, car.rotation.y, t)
	car.damage.trunk_open = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.84, 1.0, t))
	if elapsed >= FLIGHT_TIME:
		finish()
		return true
	return false


func finish() -> void:
	kitchen_wait = 0.0
	elapsed = FLIGHT_TIME
	bag.hide()
	car.damage.trunk_open = 0.0


func story_box() -> Node3D:
	var package := CARGO.new()
	package.setup(1)
	return package


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
