extends RefCounted

# Allow the same short runout past the delivery zone as the original district.
const RUNOUT := 25.0
const DECELERATION := 16.0
const WINDOW := 70.0
const GRIP := 8.0

var polygon := PackedVector2Array()
var safe_center := Vector2.ZERO
var safe_radius := 0.0

func setup(vertices: Array, frequent_point := Vector2.ZERO) -> void:
	polygon.clear()
	for vertex: Array in vertices:
		polygon.append(Vector2(vertex[0],vertex[1]))
	safe_radius = 0.0
	if polygon.size() < 3 or not Geometry2D.is_point_in_polygon(frequent_point,polygon):
		return
	safe_center = frequent_point
	var radius := INF
	for i in polygon.size():
		var edge := Geometry2D.get_closest_point_to_segment(safe_center,polygon[i-1],polygon[i])
		radius = minf(radius,safe_center.distance_to(edge))
	safe_radius = maxf(0.0,radius-WINDOW)

func limit(at: Vector3, velocity: Vector3, delta: float) -> Vector3:
	var point := Vector2(at.x, at.z)
	var moving := Vector2(velocity.x, velocity.z)
	if polygon.size() < 3 or moving.is_zero_approx():
		return velocity
	if point.distance_to(safe_center) + moving.length() * delta < safe_radius:
		return velocity
	var closest := polygon[0]
	var distance_sq := INF
	for i in polygon.size():
		var p := Geometry2D.get_closest_point_to_segment(point, polygon[i - 1], polygon[i])
		var d := point.distance_squared_to(p)
		if d < distance_sq:
			closest = p
			distance_sq = d
	var distance := sqrt(distance_sq)
	var inside := Geometry2D.is_point_in_polygon(point, polygon)
	var room := RUNOUT + distance if inside else RUNOUT - distance
	if room > WINDOW:
		safe_center = point
		safe_radius = room - WINDOW
		return velocity
	var outward := (closest - point).normalized() if inside else (point - closest).normalized()
	var outward_speed := moving.dot(outward)
	var cap := sqrt(2.0 * DECELERATION * maxf(0.0, room))
	if outward_speed > cap:
		var grip := minf(1.0, GRIP * delta + (0.5 if room < 3.0 else 0.0))
		moving -= outward * (outward_speed - cap) * grip
	# Stop at the limit within this step, preserving all tangential motion.
	var step_cap := maxf(0.0, room) / maxf(delta, 0.0001)
	moving -= outward * maxf(0.0, moving.dot(outward) - step_cap)
	return Vector3(moving.x, velocity.y, moving.y)
