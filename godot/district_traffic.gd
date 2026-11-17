extends Node3D

const VEHICLE := preload("res://traffic_vehicle.gd")
const MODEL_PATH := "res://assets/south-traffic-models.glb"
const CITY_COLOR := preload("res://city_color.gdshader")

var terrain: RefCounted
var paint := ShaderMaterial.new()
var off := StandardMaterial3D.new()
var on := StandardMaterial3D.new()
var shapes: Array[Mesh] = []
var specs: Array
var positions: Array[Vector2] = []


func setup(ground: RefCounted, start: Vector2) -> void:
	terrain = ground
	paint.shader = CITY_COLOR
	off.albedo_color = Color("#532b23")
	on.albedo_color = Color("#e64420")
	on.emission_enabled = true
	on.emission = Color("#ef2f19")
	on.emission_energy_multiplier = 1.55
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-parking.json"))
	specs = data.styles
	var catalog := (load(MODEL_PATH) as PackedScene).instantiate()
	for i in specs.size():
		var sample := catalog.get_node("Style%d" % i) as MeshInstance3D
		shapes.append(sample.mesh)
	catalog.free()
	for p: Array in data.parked:
		var at := Vector2(p[0],p[1])
		if _clear_of_cars(at,start):
			_instance(int(p[3]),at,float(p[2]))
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
			_instance(i%shapes.size(),at,0.0).follow(route,item,off,on)
			break


func _clear_of_cars(at: Vector2, start: Vector2, clearance: float = 3.5) -> bool:
	if at.distance_squared_to(start) < 9.0*9.0:
		return false
	for existing in positions:
		if existing.distance_squared_to(at) < clearance*clearance:
			return false
	return true


func _instance(style: int, at: Vector2, yaw: float) -> CharacterBody3D:
	var car := VEHICLE.new()
	add_child(car)
	car.setup(terrain,shapes[style],paint,float(specs[style].hl),at,yaw)
	positions.append(at)
	return car
