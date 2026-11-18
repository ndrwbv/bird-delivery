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
	var yards: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-yards.json"))
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
		var yard: Dictionary = yards.get(str(int(building.id)),{})
		if not yard.is_empty():
			routes.register_yard(place,_v(yard.stop),_v(yard.driveway))
			candidates.append({"name":place.name,"stop":yard.stop,"building_id":int(building.id),
				"entrance":yard.entrance,"customer":yard.customer})



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
	if template.get("route_revision",-1) != routes.revision:
		var endpoint := _v(template.get("approach", template.stop))
		var there: Array = routes.route_between(home, endpoint)
		var back: Array = routes.route_between(endpoint, home)
		if there.size() < 2 or back.size() < 2:
			return {}
		if template.has("approach"):
			there.append(template.stop)
			back.push_front(template.stop)
		template.merge({"route_revision": routes.revision, "route": there, "from_home": there, "back_home": back,
			"meters": length_of(there), "back_meters": length_of(back)}, true)
	return template.duplicate(false)


static func length_of(path: Array) -> float:
	var meters := 0.0
	for i in range(1, path.size()):
		meters += _v(path[i - 1]).distance_to(_v(path[i]))
	return meters


static func _v(point: Array) -> Vector2:
	return Vector2(point[0], point[1])
