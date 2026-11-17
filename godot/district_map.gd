extends Control

const SPAN := 208.0
const MARGIN := 12.0
const BACKGROUND := Color("#e8dfcb")
const LANDMARK := Color("#216b99")

var data: Dictionary
var route := PackedVector2Array()
var destination := Vector2.ZERO
var has_destination := false


func set_route(points: Array, stop: Array = []) -> void:
	route.clear()
	for p: Array in points:
		route.append(project(Vector2(p[0], p[1])))
	has_destination = stop.size() == 2
	if has_destination:
		destination = project(Vector2(stop[0], stop[1]))
	queue_redraw()


func project(point: Vector2) -> Vector2:
	var limits: Array = data.bounds
	var start := Vector2(limits[0], limits[1])
	var area := Vector2(limits[2], limits[3]) - start
	return Vector2.ONE * MARGIN + (point - start) * ((SPAN - 2.0 * MARGIN) / maxf(area.x, area.y))


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2.ONE * SPAN), BACKGROUND)
	for building: Array in data.buildings:
		var poly := PackedVector2Array()
		for p: Array in building:
			poly.append(project(Vector2(p[0], p[1])))
		if Geometry2D.triangulate_polygon(poly).size() > 0:
			draw_colored_polygon(poly, Color("#cec4ac"))
	for road: Array in data.roads:
		var a := project(Vector2(road[0][0], road[0][1]))
		var b := project(Vector2(road[1][0], road[1][1]))
		draw_line(a, b, Color("#b6a581") if road[2] else Color("#eee9de"), 1.45 if road[2] else 0.75, true)
	if route.size() > 1:
		draw_polyline(route, LANDMARK, 2.0, true)
	var home := project(Vector2(data.home[0], data.home[1]))
	draw_rect(Rect2(home - Vector2(2.5, 2.5), Vector2(5, 5)), Color("#b54e25"))
	if has_destination:
		draw_circle(destination, 4.5, LANDMARK, true, -1.0, true)
	draw_rect(Rect2(Vector2.ZERO, Vector2.ONE * SPAN), Color("#a98761"), false, 1.0)
