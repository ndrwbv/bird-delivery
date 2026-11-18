extends RefCounted

const FIRST_SHIFT := 3
const PROBABILITY := .07
const MIN_DISTANCE := 320.0
const MIN_REMAINING := 140.0
const MIN_MOVE := 120.0
const MAX_MOVE := 420.0
var used := false
var pick_distance := 0.0
var checked := false


func begin_shift() -> void:
	used = false
	begin_stop()


func begin_stop() -> void:
	checked = false
	pick_distance = 0.0


func step(order: Dictionary, here: Vector2, heading: Vector2, on_deck: bool, book: RefCounted, finished_shifts: int) -> Dictionary:
	if used or order.is_empty():
		return {}
	var old := _point(order.stop)
	var distance := here.distance_to(old)
	if not checked:
		checked = true
		if finished_shifts < FIRST_SHIFT or distance < MIN_DISTANCE or not _eligible(order) or randf() >= PROBABILITY:
			return {}
		pick_distance = distance
		return {}
	if pick_distance <= 0.0 or distance > pick_distance*.70:
		return {}
	pick_distance = 0.0
	if distance < MIN_REMAINING or not _eligible(order):
		return {}
	return _target(order,old,here,heading,on_deck,book)


func _target(order: Dictionary, old: Vector2, here: Vector2, heading: Vector2, on_deck: bool, book: RefCounted) -> Dictionary:
	var possible: Array[Dictionary] = []
	for candidate: Dictionary in book.candidates:
		var d := old.distance_to(_point(candidate.stop))
		if candidate.name != order.name and d >= MIN_MOVE and d <= MAX_MOVE:
			possible.append(candidate)
	possible.shuffle()
	for i in mini(14,possible.size()):
		var change: Dictionary = book._routed(possible[i])
		if change.is_empty() or change.get("zone","") == "gang":
			continue
		var target := _point(change.stop)
		var move: Array = book.routes.route_between(old,target)
		if move.size() < 2 or book.length_of(move)>maxf(2.0*old.distance_to(target),MAX_MOVE):
			continue
		var route: Array = book.routes.route_between(here,target,heading,on_deck)
		if route.size() < 2:
			continue
		var old_route: Array = book.routes.route_between(here,old,heading,on_deck)
		var extra := 0.0 if old_route.is_empty() else maxf(0.0,book.length_of(route)-book.length_of(old_route))
		change.route = route
		change.from_home = route
		change.add_seconds = roundi(extra/19.0*1.4+8.0)
		used = true
		return change
	return {}


static func _eligible(order: Dictionary) -> bool:
	if order.get("kind","solo") not in ["solo","multi"] or int(order.get("people",1))!=1 or order.get("zone","")=="gang" or order.has("was_address"):
		return false
	for disallowed in ["story","quick","tutorial","beach","staff"]:
		if order.has(disallowed) and bool(order[disallowed]):
			return false
	return true


static func _point(value: Array) -> Vector2:
	return Vector2(value[0],value[1])
