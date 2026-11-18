extends Node3D

signal notice(text: String)
signal scored(at: Vector3)
signal pigeons_startled
const WILDLIFE := preload("res://south_wildlife.gd")
const BIRDS := preload("res://south_birds.gd")
const SHORE := preload("res://south_shore_people.gd")
const PARK := preload("res://south_park_life.gd")
const FOOTBALL := preload("res://south_park_football.gd")
var park:Node
var systems: Array[Node] = []

func setup(region: Dictionary, ground: RefCounted, vehicle: CharacterBody3D, traffic: Node, events: Node, sky: Node,
		people: Node, paint: Material, depot: Vector2) -> void:
	for script: Script in [WILDLIFE,BIRDS,SHORE,PARK,FOOTBALL]:
		var service: Node = script.new()
		add_child(service)
		service.setup(region,ground,vehicle,traffic,events,sky,people,paint,depot)
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
