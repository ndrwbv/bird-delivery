extends Control

var point := Vector2.ZERO
var direction := Vector2.UP


func _draw() -> void:
	var side := direction.orthogonal()
	var arrow := PackedVector2Array([point + direction*7.5, point - direction*4.8 + side*4.2,
		point - direction*2.5, point - direction*4.8 - side*4.2])
	draw_colored_polygon(arrow, Color("#fffbed"))
	var edges := arrow.duplicate()
	edges.append(arrow[0])
	draw_polyline(edges, Color("#33393a"), 1.4, true)
