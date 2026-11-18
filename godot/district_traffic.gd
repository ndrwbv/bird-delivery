extends Node3D

const VEHICLE := preload("res://traffic_vehicle.gd")
const SEMERKA := preload("res://assets/semerka.glb")

var terrain: RefCounted
var off := StandardMaterial3D.new()
var on := StandardMaterial3D.new()
var positions: Array[Vector2] = []


func setup(ground: RefCounted, start: Vector2) -> void:
	terrain = ground
	off.albedo_color = Color("#532b23")
	on.albedo_color = Color("#e64420")
	on.emission_enabled = true
	on.emission = Color("#ef2f19")
	on.emission_energy_multiplier = 1.55
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-parking.json"))
	for p: Array in data.parked:
		var at := Vector2(p[0],p[1])
		if _clear_of_cars(at,start):
			_instance(at,float(p[2]))
	var routes: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-traffic-routes.json"))
	for i in routes.size()*2:
		var route: Array = routes[i%routes.size()]
		var seed := (i*41 + i/routes.size()*int(route.size()/2)) % route.size()
		for a in route.size():
			var item := (seed+a)%route.size()
			var spot: Array = route[item]
			var at := Vector2(spot[0],spot[1])
			if not _clear_of_cars(at,start,14.0):
				continue
			_instance(at,0.0).follow(route,item,off,on)
			break


func _clear_of_cars(at: Vector2, start: Vector2, clearance: float = 3.5) -> bool:
	if at.distance_squared_to(start) < 9.0*9.0:
		return false
	for existing in positions:
		if existing.distance_squared_to(at) < clearance*clearance:
			return false
	return true


func _instance(at: Vector2, yaw: float) -> CharacterBody3D:
	var car := VEHICLE.new()
	add_child(car)
	car.setup(terrain, SEMERKA, at, yaw)
	positions.append(at)
	return car
