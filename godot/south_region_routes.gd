extends RefCounted

## Road approaches in the original South delivery district, in local (x, z) metres.
## Only the stops already authored in south.json include a drivable parking spur.
const CELL := 128.0
const CORE_HOUSES := {
	"Южный проезд, 23": 118887128,
	"Чапаева, 20": 126602492,
	"Победы, 7": 124084732,
}
const LANDMARK_HOUSES := {119208348: "kalinina_96", 327909116: "slavskogo_21"}
const DEPOT_HOUSE := 126601195
const GENNADY_HOUSE := 119208348

var destinations: Array[Dictionary] = []
var _graph := AStar2D.new()
var _edges: Array[Vector2i] = []
var _cells: Dictionary = {}
var _parking: Array[Dictionary] = []
var _building_cells: Dictionary


func setup(region: Dictionary, core: Dictionary) -> void:
	destinations.clear()
	_parking.clear()
	_cells.clear()
	_graph.clear()
	_edges.clear()
	var node_ids: Dictionary = {}
	var edges: Dictionary = {}
	var incoming: Dictionary = {}
	_building_cells = _footprints(region.get("buildings", []))
	for road: Dictionary in region.get("roads", []):
		var previous := -1
		for xy: Array in road.points:
			var point := _vec(xy)
			var id: int = node_ids.get(point, -1)
			if id == -1:
				id = node_ids.size()
				node_ids[point] = id
				_graph.add_point(id, point)
				incoming[id] = []
			if previous != -1 and previous != id:
				if not road.has("deck_y") and _crosses_building(_graph.get_point_position(previous), point, _building_cells):
					previous = id
					continue
				var direction := int(road.get("oneway", 0))
				if direction >= 0:
					_link(previous, id, incoming)
				if direction <= 0:
					_link(id, previous, incoming)
				edges[Vector2i(mini(previous, id), maxi(previous, id))] = true
			previous = id
	if edges.is_empty():
		return
	# Anchor both traversals at the actual depot driveway, including one-way streets.
	var spawn := _vec(core.spawn)
	var deliveries: Array = core.get("deliveries", [])
	var driveway := spawn
	if not deliveries.is_empty() and deliveries[0].from_home.size() > 2:
		driveway = _vec(deliveries[0].from_home[1])
	_edges.assign(edges.keys())
	var depot_edge: Vector2i = _nearest_on_edges(driveway, _edges).edge
	var outward := _reachable(depot_edge.x, {})
	var returning := _reachable(depot_edge.x, incoming)
	_edges.clear()
	for edge: Vector2i in edges:
		if outward.has(edge.x) and returning.has(edge.x) and outward.has(edge.y) and returning.has(edge.y):
			_edges.append(edge)
			_index_edge(edge)
	if _edges.is_empty():
		return
	_add_parking("depot", "Пиццерия · Победы, 1Б", spawn, driveway, "depot", DEPOT_HOUSE)
	var known_houses := {DEPOT_HOUSE: true}
	for delivery: Dictionary in deliveries:
		var path: Array = delivery.from_home
		if path.size() < 2:
			continue
		var house := int(delivery.get("building_id", CORE_HOUSES.get(delivery.name, 0)))
		var id := "house_%d" % house if house != 0 else "delivery_%s" % delivery.name
		if house != 0:
			known_houses[house] = true
		_add_parking(id, delivery.name, _vec(delivery.stop), _vec(path[-2]), "delivery", house)
	for building: Dictionary in region.get("buildings", []):
		var house := int(building.id)
		if known_houses.has(house) or str(building.street).is_empty() or str(building.number).is_empty():
			continue
		var outline: Array = building.outline
		if outline.is_empty():
			continue
		var doorstep: Array = building.get("door", [])
		var approach: Array = building.get("approach", [])
		if house == GENNADY_HOUSE and region.has("gennady"):
			# The scripted first entrance is on another side of this long building.
			doorstep = region.gennady.door
			approach = region.gennady.parking
		var reference := Vector2.ZERO
		if approach.size() == 2:
			reference = _vec(approach)
		else:
			for xy: Array in outline:
				reference += _vec(xy)
			reference /= float(outline.size())
		var street := str(building.street).trim_prefix("улица ").trim_suffix(" улица")
		var label := "%s, %s" % [street, building.number]
		var id: String = LANDMARK_HOUSES.get(house, "house_%d" % house)
		var item := _add_approach(id, label, reference, "address")
		item["building_id"] = house
		if doorstep.size() == 2:
			item["site"] = doorstep
	for gate: Dictionary in region.get("gates", []):
		var label := str(gate.name)
		var id := "gate_leningrad" if "Ленинград" in label else "gate_central"
		_add_gate(id, label, _vec(gate.at), spawn)
	if region.get("beach", []).size() == 2:
		_add_approach("beach", "Подъезд к пляжу", _vec(region.beach), "beach")
	if region.get("garage", []).size() == 2:
		_add_approach("garage", "Мастерская", _vec(region.garage), "garage")


func route_to(car_xz: Vector2, destination: Dictionary) -> Array:
	if _edges.is_empty() or not destination.has("stop"):
		return []
	var finish: Dictionary = destination.get("_snap", {})
	if finish.is_empty():
		finish = _nearest(_vec(destination.stop))
	var start := _car_snap(car_xz)
	if start.has("parking") and start.parking == destination.get("id", ""):
		if car_xz.distance_squared_to(_vec(destination.stop)) < 0.0064:
			return [destination.stop]
		return [_xy(car_xz), destination.stop]
	var path := _road_path(start, finish)
	if path.is_empty():
		return []
	if start.has("parking"):
		path.push_front(_xy(car_xz))
	if destination.has("parking") and _vec(path.back()).distance_to(_vec(destination.stop)) > 0.08:
		path.append(destination.stop)
	return path


## Arbitrary map points resolve to reachable roads. Recognized parking stops include
## the authored driveway segment, so returning to the depot ends beside the pizzeria.
func route_between(car_xz: Vector2, target_xz: Vector2) -> Array:
	for stop: Dictionary in _parking:
		if target_xz.distance_squared_to(_vec(stop.stop)) < 1.0:
			return route_to(car_xz, stop)
	return route_to(car_xz, {"stop": _xy(target_xz)})


func _link(a: int, b: int, incoming: Dictionary) -> void:
	if not _graph.are_points_connected(a, b, false):
		_graph.connect_points(a, b, false)
		incoming[b].append(a)


func walk_clear(a: Vector2, b: Vector2) -> bool:
	return not _crosses_building(a, b, _building_cells)


func _footprints(buildings: Array) -> Dictionary:
	var cells: Dictionary = {}
	for building: Dictionary in buildings:
		var poly := PackedVector2Array()
		for xy: Array in building.outline:
			poly.append(_vec(xy))
		if poly.size() < 3:
			continue
		var rect := Rect2(poly[0], Vector2.ZERO)
		for point in poly:
			rect = rect.expand(point)
		var entry := {"bounds": rect, "poly": poly}
		var low := _cell(rect.position)
		var high := _cell(rect.end)
		for x in range(low.x, high.x + 1):
			for z in range(low.y, high.y + 1):
				var cell := Vector2i(x, z)
				if not cells.has(cell):
					cells[cell] = []
				cells[cell].append(entry)
	return cells


func _crosses_building(a: Vector2, b: Vector2, cells: Dictionary) -> bool:
	var rect := Rect2(a, Vector2.ZERO).expand(b)
	var low := _cell(rect.position)
	var high := _cell(rect.end)
	for x in range(low.x, high.x + 1):
		for z in range(low.y, high.y + 1):
			for entry: Dictionary in cells.get(Vector2i(x, z), []):
				if not rect.intersects(entry.bounds, true):
					continue
				var poly: PackedVector2Array = entry.poly
				if Geometry2D.is_point_in_polygon(a, poly) or Geometry2D.is_point_in_polygon(b, poly):
					return true
				for i in poly.size():
					if Geometry2D.segment_intersects_segment(a, b, poly[i - 1], poly[i]) != null:
						return true
	return false


func _reachable(root: int, incoming: Dictionary) -> Dictionary:
	var seen: Dictionary = {}
	var pending: Array[int] = [root]
	seen[root] = true
	while not pending.is_empty():
		var current: int = pending.pop_back()
		var neighbors = _graph.get_point_connections(current) if incoming.is_empty() else incoming[current]
		for id: int in neighbors:
			if not seen.has(id):
				seen[id] = true
				pending.append(id)
	return seen


func _index_edge(edge: Vector2i) -> void:
	var a := _cell(_graph.get_point_position(edge.x))
	var b := _cell(_graph.get_point_position(edge.y))
	for x in range(mini(a.x, b.x), maxi(a.x, b.x) + 1):
		for z in range(mini(a.y, b.y), maxi(a.y, b.y) + 1):
			var key := Vector2i(x, z)
			if not _cells.has(key):
				_cells[key] = []
			_cells[key].append(edge)


func _nearest(point: Vector2) -> Dictionary:
	var close: Dictionary = {}
	var cell := _cell(point)
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			for edge: Vector2i in _cells.get(cell + Vector2i(dx, dz), []):
				close[edge] = true
	var result := _nearest_on_edges(point, close.keys())
	# Every segment within CELL metres intersects one of those nine cells.
	if not result.is_empty() and point.distance_squared_to(result.at) < CELL * CELL:
		return result
	return _nearest_on_edges(point, _edges)


func _nearest_on_edges(point: Vector2, edges: Array) -> Dictionary:
	var best := INF
	var result: Dictionary = {}
	for edge: Vector2i in edges:
		var a := _graph.get_point_position(edge.x)
		var b := _graph.get_point_position(edge.y)
		var at := Geometry2D.get_closest_point_to_segment(point, a, b)
		var distance := point.distance_squared_to(at)
		if distance < best:
			best = distance
			result = {"edge": edge, "at": at}
	return result


# End the route on the city side with enough space to stop before the boom.
func _add_gate(id: String, label: String, booth: Vector2, spawn: Vector2) -> void:
	var place := _add_approach(id, label, booth, "gate")
	if _vec(place.stop).distance_to(booth) >= 10.0:
		return
	var path := route_to(spawn, place)
	for i in range(path.size() - 1, 0, -1):
		var start := _vec(path[i])
		var towards_city := _vec(path[i - 1])
		if towards_city.distance_to(booth) < 10.0:
			continue
		var stop := start.move_toward(towards_city, 10.0 - start.distance_to(booth))
		place["_snap"] = _nearest(stop)
		place["stop"] = _xy(place._snap.at)
		return


func _add_approach(id: String, label: String, site: Vector2, kind: String) -> Dictionary:
	var snap := _nearest(site)
	var item := {"id": id, "name": label, "kind": kind, "site": _xy(site), "stop": _xy(snap.at), "_snap": snap}
	destinations.append(item)
	return item


func _add_parking(id: String, label: String, stop: Vector2, driveway: Vector2, kind: String, house: int) -> void:
	var item := {"id": id, "name": label, "kind": kind, "site": _xy(stop), "stop": _xy(stop),
			"_snap": _nearest(driveway), "parking": true, "building_id": house}
	destinations.append(item)
	_parking.append(item)


func _car_snap(point: Vector2) -> Dictionary:
	for stop: Dictionary in _parking:
		var parked := _vec(stop.stop)
		var road: Vector2 = stop._snap.at
		if parked.distance_squared_to(road) < 0.01:
			continue
		var spur := Geometry2D.get_closest_point_to_segment(point, parked, road)
		if point.distance_squared_to(spur) < 2.25 and point.distance_squared_to(road) > 0.04:
			return {"edge": stop._snap.edge, "at": road, "parking": stop.id}
	return _nearest(point)


func _road_path(start: Dictionary, finish: Dictionary) -> Array:
	var a: Vector2 = start.at
	var b: Vector2 = finish.at
	if a.distance_squared_to(b) < 0.0025:
		return [_xy(b)]
	# Insert projections only for this query so mid-block starts and goals follow
	# direction even when they share the same street between two junctions.
	var first := _graph.get_available_point_id()
	_graph.add_point(first, a)
	var last := _graph.get_available_point_id()
	_graph.add_point(last, b)
	_connect_projection(first, start, true)
	_connect_projection(last, finish, false)
	if start.edge == finish.edge:
		var edge: Vector2i = start.edge
		var origin := _graph.get_point_position(edge.x)
		var forward := origin.distance_squared_to(a) <= origin.distance_squared_to(b)
		var from_id := edge.x if forward else edge.y
		var to_id := edge.y if forward else edge.x
		if _graph.are_points_connected(from_id, to_id, false):
			_graph.connect_points(first, last, false)
	var points := _graph.get_point_path(first, last)
	_graph.remove_point(last)
	_graph.remove_point(first)
	var path: Array = []
	for point: Vector2 in points:
		if path.is_empty() or point.distance_squared_to(_vec(path.back())) > 0.0025:
			path.append(_xy(point))
	return path


func _connect_projection(id: int, snap: Dictionary, leaving: bool) -> void:
	var edge: Vector2i = snap.edge
	for end: int in [edge.x, edge.y]:
		var other := edge.y if end == edge.x else edge.x
		var a := other if leaving else end
		var b := end if leaving else other
		var at_junction := _graph.get_point_position(end).distance_squared_to(snap.at) < 0.0001
		if at_junction or _graph.are_points_connected(a, b, false):
			if leaving:
				_graph.connect_points(id, end, false)
			else:
				_graph.connect_points(end, id, false)


func _cell(point: Vector2) -> Vector2i:
	return Vector2i(floori(point.x / CELL), floori(point.y / CELL))


func _vec(xy: Array) -> Vector2:
	return Vector2(xy[0], xy[1])


func _xy(point: Vector2) -> Array:
	return [point.x, point.y]
