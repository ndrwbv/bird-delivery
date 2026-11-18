extends Control

var bars := -1
var cold := -1

func set_values(nitro: float, heat: int) -> void:
	var fill := clampi(ceili(nitro*6.0),0,6)
	if fill != bars or cold != heat:
		bars = fill
		cold = heat
		queue_redraw()

func _draw() -> void:
	var white := Color("#f2f7fa")
	var shadow := Color("#515b5c")
	draw_polyline(PackedVector2Array([Vector2(2,6),Vector2(11,6),Vector2(11,17),Vector2(2,17),Vector2(2,6),Vector2(5,2),Vector2(10,2)]),white,1.7,true)
	draw_polyline(PackedVector2Array([Vector2(11,9),Vector2(14,11),Vector2(14,15),Vector2(17,15),Vector2(17,7),Vector2(14,4)]),white,1.5,true)
	for i in 6:
		var height := 14.0 if i>=3 else 10.0
		var r := Rect2(22+i*7,17-height,5,height)
		draw_rect(r,white if i<bars else shadow)
		draw_rect(r,Color("#b6c8d0"),false,1.0)
	if cold < 0:
		return
	draw_line(Vector2(68,3),Vector2(68,17),Color("#c4cbd0"),1.0)
	var tint := Color("#ffd386") if cold==0 else (Color("#efa65d") if cold==1 else Color("#8bd7f5"))
	draw_polyline(PackedVector2Array([Vector2(73,11),Vector2(88,6),Vector2(91,16),Vector2(73,11)]),tint,1.8,true)
	draw_line(Vector2(86,7),Vector2(89,15),tint,1.4,true)
	draw_circle(Vector2(82,10),1.1,tint)
	if cold < 2:
		for x in [78,83]:
			draw_line(Vector2(x,6),Vector2(x+1,2),tint,1.4,true)
	else:
		for i in 3:
			var dir := Vector2.from_angle(float(i)*PI/3.0)*3.4
			draw_line(Vector2(77,4)-dir,Vector2(77,4)+dir,tint,1.3,true)
