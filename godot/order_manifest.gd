extends RefCounted

const PIZZAS := ["пепперони","маргарита","четыре сыра","мясная","гавайская","птичий микс","ветчина и сыр","диабло","карбонара"]
const STACK_COUNTS := [2,2,2,3,3,3,4,4,5,6,8]
const LIMITS := [2,20,35,55,80,110]
const SIZE_WEIGHTS := [28,18,9,6,3,2]
const TIME_FACTOR := [.9,.85,.8,.76,.72,.70]
var remaining: Array[Dictionary] = []
var stops := 1
var pizzas := 1
var progress := 0
var total_meters := 0.0
var total_fee := 0
var all_on_time := true
var urgent_count := 0
var kind := "solo"
var previous := ""
var streak := 0
var last_size := 1
var time_factor := 1.0


func prepare(first: Dictionary, shift: RefCounted, book: RefCounted) -> void:
	remaining.clear()
	stops = 1
	progress = 0
	total_fee = 0
	all_on_time = true
	time_factor = 1
	kind = "edge" if first.get("edge",false) else "solo"
	var life := int(shift.profile.data.xp) + 1
	var skill := float(shift.profile.data.skill)
	var safe: bool = shift.number == 1 or shift.orders == 0 or first.get("story",false) or first.get("beach",false) or first.get("edge",false) or shift.duration-shift.elapsed < 75.0
	if not safe:
		var hour: float = shift.hour()
		var from_hour := 16 if shift.pace == "generous" else (10 if shift.pace == "tight" else 11)
		if skill >= 1.5 and hour >= from_hour and urgent_count < 2 and float(first.meters) >= 350.0 and (randf() < .15 or (hour >= 21 and urgent_count == 0)):
			kind = "urgent"
			urgent_count += 1
		else:
			kind = _ordinary_kind(life)
	if kind == "multi":
		_make_stops(first, shift, book, life, skill)
	if kind == "multi" and remaining.is_empty():
		kind = "solo"
	pizzas = 0
	total_meters = 0
	for order: Dictionary in [first]+remaining:
		order.items = "пеперони" if order.get("story",false) else PIZZAS.pick_random()
		order.kind = kind
		order.people = randi_range(2,4) if kind == "group" else 1
		order.boxes = order.people
		if order.people == 1 and shift.orders >= 2 and not order.get("story",false) and not order.get("beach",false) and randf() < .14:
			order.boxes = int(STACK_COUNTS.pick_random())
		pizzas += int(order.boxes)
		total_meters += float(order.meters)
		total_fee += shift.quote(order)
	streak = streak + 1 if previous == kind else 1
	previous = kind
	last_size = pizzas


func _ordinary_kind(life: int) -> String:
	var bag := []
	var weighted := {"solo":51,"group":28,"multi":21}
	for name_: String in weighted:
		var limit := 3 if name_ == "solo" else 2
		if name_ == "multi" and life < 2 or name_ == previous and streak >= limit:
			continue
		for i in int(weighted[name_]):
			bag.append(name_)
	return str(bag.pick_random()) if not bag.is_empty() else "solo"


func _make_stops(first: Dictionary, shift: RefCounted, book: RefCounted, life: int, skill: float) -> void:
	var cap := 1
	for i in LIMITS.size():
		if life >= LIMITS[i]:
			cap = i + 2
			time_factor = TIME_FACTOR[i]
	cap = mini(cap, roundi(lerpf(3,7,clampf(skill/5.0,0,1))))
	cap = mini(cap, 2 if last_size >= 4 else last_size+3)
	cap = mini(cap, int(shift.orders)+1)
	var bag := []
	for size_ in range(2,cap+1):
		for j in SIZE_WEIGHTS[size_-2]:
			bag.append(size_)
	if bag.is_empty():
		return
	var wanted := int(bag.pick_random())
	var used: Array = shift.profile.data.recent.duplicate()
	used.append(first.name)
	var start := Vector2(first.stop[0],first.stop[1])
	for i in range(1,wanted):
		var next: Dictionary = book.next_order(false,false,used,shift.level,shift.orders+1)
		if used.has(next.name):
			break
		var at := Vector2(next.stop[0],next.stop[1])
		var leg: Array = book.routes.route_between(start, at)
		if leg.size() < 2:
			break
		next.route = leg
		next.meters = book.length_of(leg)
		remaining.append(next)
		used.append(next.name)
		start = at
	stops = 1 + remaining.size()


func take_next(index: int) -> Dictionary:
	progress += 1
	return remaining.pop_at(index)


func invoice_items(order: Dictionary) -> String:
	if kind == "multi":
		return "%d пицц   •   %d адресов" % [pizzas,stops]
	return "%d × %s" % [pizzas, order.items] if pizzas > 1 else str(order.items)
