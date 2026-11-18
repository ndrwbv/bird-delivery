extends Node3D

signal notice(text: String)
signal scored(at: Vector3)
signal pigeons_startled
const WILDLIFE := preload("res://south_wildlife.gd")
const BIRDS := preload("res://south_birds.gd")
const SHORE := preload("res://south_shore_people.gd")
const PARK := preload("res://south_park_life.gd")
const FOOTBALL := preload("res://south_park_football.gd")
const COURTYARD := preload("res://south_courtyard_life.gd")
var wildlife:Node
var courtyard:Node
var park:Node
const NIGHT := preload("res://south_night_life.gd")
var night := NIGHT.new()
var systems: Array[Node] = []

func setup(region: Dictionary, ground: RefCounted, vehicle: CharacterBody3D, traffic: Node, events: Node, sky: Node,
		people: Node, paint: Material, depot: Vector2) -> void:
	add_child(night)
	night.setup(region,ground,vehicle,traffic,events,sky,people,paint,depot)
	systems.append(night)
	for script: Script in [WILDLIFE,BIRDS,SHORE,PARK,FOOTBALL,COURTYARD]:
		var service: Node = script.new()
		add_child(service)
		service.setup(region,ground,vehicle,traffic,events,sky,people,paint,depot)
		if script==WILDLIFE:wildlife=service
		if script==COURTYARD:
			courtyard=service
		if script==FOOTBALL:
			service.scored.connect(func(at:Vector3): scored.emit(at))
		if script==PARK:
			park=service
			park.notice.connect(func(message:String): notice.emit(message))
		if service.has_signal("startled"):
			service.startled.connect(func(): pigeons_startled.emit())
		systems.append(service)

func begin(number: int, seed_value: int, adult: bool) -> void:
	for s in systems:
		s.begin(number,seed_value,adult)

func step(delta: float, hour: float, drive_or_back:=false) -> void:
	if park: park.drive_or_back=drive_or_back
	for s in systems:
		s.step(delta,hour)

func honk() -> void:
	for s in systems:
		if s.has_method("honk"):
			s.honk()

func clear() -> void:
	for s in systems:
		s.clear()

func bind_street(clients:Array[Node3D],broken:Dictionary) -> void:
	wildlife.moose.clients=clients
	courtyard.denied_bench=func(id:int):return broken.has(id)
	courtyard.near_client=func(point:Vector2):
		for customer in clients:
			if is_instance_valid(customer) and customer.visible and point.distance_squared_to(Vector2(customer.position.x,customer.position.z))<14*14: return true
		return false

func scare(at:Vector2,radius:=26.0) -> void:
	if courtyard: courtyard.scare(at,radius)

func rich_tip(at:Vector2,fee:int,customer:Node3D=null) -> int:
	return courtyard.rich.rich_tip(at,fee,customer) if courtyard else 0
