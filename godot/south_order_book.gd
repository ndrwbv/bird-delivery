extends RefCounted

const GENNADY := 119208348
var candidates: Array[Dictionary] = []
var warmup: Dictionary
var story: Dictionary
var home: Vector2
var routes: RefCounted


func setup(region: Dictionary, core: Dictionary, graph: RefCounted) -> void:
	routes = graph
	home = _v(core.spawn)
	var known := {}
	for source: Dictionary in core.deliveries:
		var order := source.duplicate(true)
		if order.name == "Коммунистический проспект, 124А":
			warmup = order
		known[order.name] = true
		candidates.append(order)
	if warmup.is_empty():
		warmup = candidates.back()
	var buildings := {}
	for building: Dictionary in region.buildings:
		buildings[int(building.id)] = building
	for place: Dictionary in routes.destinations:
		if place.kind != "address" or known.has(place.name):
			continue
		var building: Dictionary = buildings[int(place.building_id)]
		if int(building.id) == GENNADY:
			var site: Dictionary = region.gennady
			story = {"name": place.name, "stop": site.parking, "entrance": {"at": site.door, "front": site.normal},
				"customer": site.spot, "approach": site.approach, "story": true, "building_id": GENNADY}
			continue
		if building.kind != "res" or building.get("doors", []).is_empty():
			continue
		# Use a real entrance with a clear path between its doorstep and the street.
		var best := INF
		var order := {}
		for door: Dictionary in building.doors:
			var normal := _v(door.normal)
			var wait := _v(door.at) + normal * 1.45
			var approach := _v(place.stop) - wait
			if approach.length() > 42.0 or approach.length() >= best or approach.dot(normal) < 0:
				continue
			if not routes.walk_clear(wait, _v(place.stop)):
				continue
			best = approach.length()
			order = {"name": place.name, "stop": place.stop, "building_id": int(building.id),
				"entrance": {"at": door.at, "front": door.normal}, "customer": [wait.x,wait.y]}
		if not order.is_empty():
			candidates.append(order)


func next_order(first: bool, story_due: bool, recent: Array, level: int, number: int) -> Dictionary:
	if story_due and not story.is_empty():
		return _routed(story)
	if first:
		return _routed(warmup)
	var pool := candidates.duplicate()
	pool.shuffle()
	var shortest := INF
	var fallback: Dictionary = {}
	var reach := minf(2300, 450 + 185 * maxi(0, number - 1) + 100 * (level - 1))
	for candidate: Dictionary in pool:
		if recent.has(candidate.name) or home.distance_to(_v(candidate.stop)) > reach:
			continue
		var order := _routed(candidate)
		if order.is_empty():
			continue
		if order.meters <= reach * 1.6:
			return order
		if order.meters < shortest:
			shortest = order.meters
			fallback = order
	if not fallback.is_empty():
		return fallback
	for candidate: Dictionary in pool:
		if recent.is_empty() or candidate.name != recent.back():
			var order := _routed(candidate)
			if not order.is_empty():
				return order
	return _routed(warmup)


func _routed(template: Dictionary) -> Dictionary:
	if not template.has("route_cached"):
		var endpoint := _v(template.get("approach", template.stop))
		var there: Array = routes.route_between(home, endpoint)
		var back: Array = routes.route_between(endpoint, home)
		if there.size() < 2 or back.size() < 2:
			return {}
		if template.has("approach"):
			there.append(template.stop)
			back.push_front(template.stop)
		template.merge({"route_cached": true, "route": there, "from_home": there, "back_home": back,
			"meters": length_of(there), "back_meters": length_of(back)}, true)
	return template.duplicate(false)


static func length_of(path: Array) -> float:
	var meters := 0.0
	for i in range(1, path.size()):
		meters += _v(path[i - 1]).distance_to(_v(path[i]))
	return meters


static func _v(point: Array) -> Vector2:
	return Vector2(point[0], point[1])
