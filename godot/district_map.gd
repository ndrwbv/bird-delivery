extends Control

const MINI_SIZE := 208.0
const MINI_METERS := 495.0
const INK := Color("#433f30")
const PAPER := Color("#e8dfcb")
const OUTSIDE := Color("#c8cabc")
const ROUTE_COLOR := Color("#216b99")
const POI_COLOR := Color("#915a35")
const GREEN_COLORS := {
	"park": Color("#c5d2ad"), "wood": Color("#b5c8a0"), "water": Color("#98bfcc"),
	"pitch": Color("#c0d1a7"), "play": Color("#d0d4af"), "cem": Color("#c2c9ae")
}

## Separate CanvasItem so its drawing commands survive panning and moving markers.
class Streets extends Node2D:
	var boundary := PackedVector2Array()
	var boundary_fill := false
	var areas: Array[PackedVector2Array] = []
	var colors := PackedColorArray()
	var roads: Array[PackedVector2Array] = []
	var widths := PackedFloat32Array()
	var main: Array[bool] = []
	var rails: Array[PackedVector2Array] = []
	var streams: Array[PackedVector2Array] = []
	var stream_widths := PackedFloat32Array()

	func add_area(points: PackedVector2Array, color: Color) -> void:
		if points.size() >= 3 and not Geometry2D.triangulate_polygon(points).is_empty():
			areas.append(points)
			colors.append(color)

	func _draw() -> void:
		if boundary_fill:
			draw_colored_polygon(boundary, PAPER)
		for i in areas.size():
			draw_colored_polygon(areas[i], colors[i])
		for i in streams.size():
			draw_polyline(streams[i], Color("#92bdcd"), maxf(stream_widths[i], 2.0), true)
		for rail in rails:
			draw_polyline(rail, Color("#9a9182"), 2.3, true)
		for i in roads.size():
			var color := Color("#ad9876") if main[i] else Color("#bcae94")
			draw_polyline(roads[i], color, -1.0, false)
			draw_polyline(roads[i], color, widths[i] + 1.8, true)
		for i in roads.size():
			var color := Color("#f3dcad") if main[i] else Color("#f1eada")
			draw_polyline(roads[i], color, widths[i], true)
		if boundary.size() > 2:
			var line := boundary.duplicate()
			line.append(boundary[0])
			draw_polyline(line, Color("#83917b"), -1.0, false)


class Markers extends Node2D:
	var canvas: Control

	func _draw() -> void:
		canvas.draw_markers(self)


class Frame extends Control:
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size).grow(-0.5), Color("#a98761"), false, 1.0)


class EdgeArrow extends Node2D:
	func _draw() -> void:
		draw_colored_polygon(PackedVector2Array([Vector2.ZERO, Vector2(-8, 4), Vector2(-8, -4)]), ROUTE_COLOR)


var _streets: Streets
var _markers: Markers
var _frame: Frame
var _arrow: EdgeArrow
var _full := false
var _bounds := Rect2()
var _center := Vector2.ZERO
var _scale := 1.0
var _zoom := 1.0
var _home := Vector2.ZERO
var _landmarks: Array[Dictionary] = []
var _route := PackedVector2Array()
var _destination := Vector2.ZERO
var _has_destination := false
var _player := Vector2.ZERO
var _has_player := false


func setup(region: Dictionary, core: Dictionary, full: bool) -> void:
	_full = full
	clip_contents = true
	if not full:
		size = Vector2.ONE * MINI_SIZE
	var limits: Array = region.get("bounds", core.bounds)
	_bounds = Rect2(Vector2(limits[0], limits[1]), Vector2(limits[2] - limits[0], limits[3] - limits[1]))
	_home = _point(core.home)
	_center = _bounds.get_center() if full else _point(core.spawn)
	_zoom = 1.0
	_route.clear()
	_landmarks.clear()
	_has_destination = false
	_has_player = false
	if is_instance_valid(_streets):
		_streets.free()
		_markers.free()
		_frame.free()
	_streets = Streets.new()
	add_child(_streets)
	_markers = Markers.new()
	_markers.canvas = self
	add_child(_markers)
	_frame = Frame.new()
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)
	_frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_arrow = EdgeArrow.new()
	_arrow.hide()
	_frame.add_child(_arrow)
	if region.has("roads"):
		_set_region(region)
	else:
		_set_core(core)
	_refresh_view()


func _set_region(region: Dictionary) -> void:
	_streets.boundary = _points(region.boundary)
	_streets.boundary_fill = not Geometry2D.triangulate_polygon(_streets.boundary).is_empty()
	for area: Dictionary in region.get("greens", []):
		_streets.add_area(_points(area.outline), GREEN_COLORS.get(str(area.kind), Color("#d1d6b7")))
	for building: Dictionary in region.buildings:
		_streets.add_area(_points(building.outline), Color("#cbbda4"))
	for road: Dictionary in region.roads:
		_add_road(_points(road.points), float(road.width), int(road["class"]) <= 4)
	for rail: Dictionary in region.get("rails", []):
		var line := _points(rail.points)
		if line.size() >= 2:
			_streets.rails.append(line)
	for stream: Dictionary in region.get("streams", []):
		var line := _points(stream.points)
		if line.size() >= 2:
			_streets.streams.append(line)
			_streets.stream_widths.append(float(stream.width))
	for gate: Dictionary in region.get("gates", []):
		_landmarks.append({"label": str(gate.name), "point": _point(gate.at), "color": Color("#786c60")})
	if region.get("beach", []).size() == 2:
		_landmarks.append({"label": "Пляж", "point": _point(region.beach), "color": Color("#43829a")})
	if region.get("garage", []).size() == 2:
		_landmarks.append({"label": "Мастерская", "point": _point(region.garage), "color": POI_COLOR})


func _set_core(core: Dictionary) -> void:
	for shape: Array in core.buildings:
		_streets.add_area(_points(shape), Color("#cbbda4"))
	for road: Array in core.roads:
		_add_road(PackedVector2Array([_point(road[0]), _point(road[1])]), 8.0 if road[2] else 4.0, road[2])


func _add_road(line: PackedVector2Array, width: float, main: bool) -> void:
	if line.size() < 2:
		return
	_streets.roads.append(line)
	_streets.widths.append(maxf(width, 2.0))
	_streets.main.append(main)


func set_route(points: Array, stop: Array = []) -> void:
	_route = _points(points)
	_has_destination = stop.size() == 2
	if _has_destination:
		_destination = _point(stop)
	if is_instance_valid(_markers):
		_markers.queue_redraw()
		_position_arrow()


func set_player(at: Vector2) -> void:
	if _has_player and _player == at:
		return
	_player = at
	_has_player = true
	if is_instance_valid(_markers):
		_markers.queue_redraw()


func follow(at: Vector2) -> void:
	if not _full and at != _center:
		_center = at
		_position_layers()


func pan_by(screen_delta: Vector2) -> void:
	if _full and _scale > 0.0 and not screen_delta.is_zero_approx():
		_center -= screen_delta / _scale
		_refresh_view()


func zoom_by(factor: float) -> void:
	if _full and factor > 0.0:
		var next := clampf(_zoom * factor, 1.0, 16.0)
		if not is_equal_approx(next, _zoom):
			_zoom = next
			_refresh_view()


func project(point: Vector2) -> Vector2:
	return (point - _center) * _scale + size * 0.5


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_instance_valid(_arrow):
		_refresh_view()


func _refresh_view() -> void:
	if size.x < 1.0 or size.y < 1.0:
		return
	if _full:
		var space := (size - Vector2.ONE * 30.0).max(Vector2.ONE)
		_scale = minf(space.x / maxf(_bounds.size.x, 1.0), space.y / maxf(_bounds.size.y, 1.0)) * _zoom
		var travel := ((_bounds.size - space / _scale) * 0.5).max(Vector2.ZERO)
		_center = _center.clamp(_bounds.get_center() - travel, _bounds.get_center() + travel)
	else:
		_scale = minf(size.x, size.y) / MINI_METERS
	_streets.scale = Vector2.ONE * _scale
	_position_layers()
	_markers.queue_redraw()


func _position_layers() -> void:
	_streets.position = project(Vector2.ZERO)
	_markers.position = _streets.position
	_position_arrow()


func _position_arrow() -> void:
	if not is_instance_valid(_arrow):
		return
	var dest := project(_destination)
	var half := size * 0.5 - Vector2.ONE * 7.0
	_arrow.visible = _has_destination and not _full and half.x > 0.0 and half.y > 0.0 and not Rect2(Vector2.ZERO, size).has_point(dest)
	if _arrow.visible:
		var direction := (dest - size * 0.5).normalized()
		var radius := 1.0 / maxf(absf(direction.x) / half.x, absf(direction.y) / half.y)
		_arrow.position = size * 0.5 + direction * radius
		_arrow.rotation = direction.angle()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), OUTSIDE if is_instance_valid(_streets) and _streets.boundary_fill else PAPER)


func draw_markers(layer: Node2D) -> void:
	var view := Rect2(Vector2.ZERO, size)
	if _route.size() > 1:
		var path := PackedVector2Array()
		for point in _route:
			path.append(point * _scale)
		layer.draw_polyline(path, Color("#f4efe1"), 4.8, true)
		layer.draw_polyline(path, ROUTE_COLOR, 2.5, true)
	var home := _home * _scale
	layer.draw_rect(Rect2(home - Vector2.ONE * 3.5, Vector2.ONE * 7.0), Color("#b54e25"))
	for landmark: Dictionary in _landmarks:
		var at: Vector2 = landmark.point * _scale
		layer.draw_circle(at, 3.2, landmark.color, true, -1.0, true)
		if _full and view.has_point(at + layer.position):
			_draw_label(layer, at, landmark.label)
	if _full and view.has_point(home + layer.position):
		_draw_label(layer, home, "Пиццерия")
	if _has_destination:
		var dest := _destination * _scale
		layer.draw_circle(dest, 6.0, Color("#fff5dd"), true, -1.0, true)
		layer.draw_circle(dest, 4.3, ROUTE_COLOR, true, -1.0, true)
	if _has_player:
		var car := _player * _scale
		layer.draw_circle(car, 5.8, INK, true, -1.0, true)
		layer.draw_circle(car, 3.8, Color("#fffbed"), true, -1.0, true)


func _draw_label(layer: Node2D, point: Vector2, label: String) -> void:
	var font := ThemeDB.fallback_font
	var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
	point += layer.position
	var px := point.x + 6.0 if point.x + width + 10.0 < size.x else point.x - width - 6.0
	var baseline := Vector2(maxf(3.0, px), clampf(point.y - 4.0, 14.0, size.y - 3.0)) - layer.position
	layer.draw_string_outline(font, baseline, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 3, PAPER)
	layer.draw_string(font, baseline, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, INK)


func _point(xy: Array) -> Vector2:
	return Vector2(xy[0], xy[1])


func _points(rows: Array) -> PackedVector2Array:
	var result := PackedVector2Array()
	for xy: Array in rows:
		var point := _point(xy)
		if result.is_empty() or result[-1] != point:
			result.append(point)
	return result
