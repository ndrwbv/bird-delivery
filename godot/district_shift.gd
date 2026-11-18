extends RefCounted

const DEPOT_RADIUS := 7.0
const DISPATCH_DELAY := 0.8
const WARM_DISTANCE := Vector2(60.0, 350.0)
const EASY_ROAD_METERS := 450.0

var delivered := 0
var money := 0
var fee := 0
var settled := false
var depot_time := 0.0


# Keep the original warm-up distance when choosing from the prototype's authored handoffs.
func choose_first(orders: Array, depot: Vector2, routes: RefCounted) -> void:
	for i in orders.size():
		var handoff: Dictionary = orders[i]
		var stop := Vector2(handoff.stop[0], handoff.stop[1])
		var direct := depot.distance_to(stop)
		if direct < WARM_DISTANCE.x or direct > WARM_DISTANCE.y:
			continue
		var path: Array = routes.route_between(depot, stop)
		if path.size() < 2:
			continue
		var meters := 0.0
		for j in range(1, path.size()):
			meters += Vector2(path[j-1][0], path[j-1][1]).distance_to(Vector2(path[j][0], path[j][1]))
		if meters <= EASY_ROAD_METERS:
			orders.remove_at(i)
			orders.push_front(handoff)
			return


func accept(order: Dictionary) -> void:
	fee = roundi((640.0+1.12*float(order.meters))/10.0)*10
	settled = false
	depot_time = 0.0


func settle(tips_allowed: bool, failed: bool) -> void:
	if settled:
		return
	settled = true
	if failed:
		money = maxi(0,money-fee)
		return
	delivered += 1
	money += fee
	if tips_allowed and randf() < 0.25:
		money += roundi(fee*randf_range(0.1,0.4)/10.0)*10


func wait_for_dispatch(delta: float, near: bool) -> bool:
	depot_time = depot_time+delta if near else 0.0
	return depot_time >= DISPATCH_DELAY
