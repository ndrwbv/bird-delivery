extends Control

const WHEEL := [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
const SYMBOLS := ["7","★","♥","₽","◆","♣"]
var game := ""
var outcome := {}
var progress := 1.0

func configure(id: String, result: Dictionary = {}) -> void:
	game = id
	outcome = result
	custom_minimum_size = Vector2(330,205)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	queue_redraw()

func progress_to(v: float) -> void:
	progress = v
	queue_redraw()

func _draw() -> void:
	var board := Rect2(Vector2.ZERO,size)
	var fg := Color("#eee1be")
	draw_rect(board,Color("#204c44") if game!="slot" else Color("#3f2636"))
	match game:
		"roulette":
			var c := size*.5
			var r := minf(size.y*.46,size.x*.44)
			var step := TAU/37
			var winner := int(outcome.get("index",0))
			var rotation := (-winner*step + TAU*4)*progress
			for i in WHEEL.size():
				var a := (i-.5)*step+rotation-PI/2
				var b := a+step
				var chosen := Color("#45885b") if i==0 else (Color("#af544a") if i%2 else Color("#26313b"))
				draw_colored_polygon(PackedVector2Array([c,c+Vector2.from_angle(a)*r,c+Vector2.from_angle(b)*r]),chosen)
				var mark := c+Vector2.from_angle((a+b)*.5)*(r-10)
				draw_string(ThemeDB.fallback_font,mark+Vector2(-8,4),str(WHEEL[i]),HORIZONTAL_ALIGNMENT_CENTER,16,8,fg)
			draw_circle(c,r*.49,Color("#ad8959"),true,-1,true)
			draw_circle(c-Vector2(0,r*.79),3.5,Color.WHITE,true,-1,true)
		"slot":
			var reels: Array = outcome.get("reels",[0,0,0])
			var w := minf(75,size.x*.24)
			for i in 3:
				var at := size*.5+Vector2((i-1)*w*1.12,-9)
				draw_rect(Rect2(at-Vector2(w*.46,41),Vector2(w*.92,83)),Color("#ffedb9"))
				var index := int(reels[i])
				if progress<.99:
					index = (index+floori((1-progress)*(23+i*6)))%SYMBOLS.size()
				draw_string(ThemeDB.fallback_font,at+Vector2(-w*.46,18),SYMBOLS[index],HORIZONTAL_ALIGNMENT_CENTER,w*.92,48,Color("#b13547"))
		"tennis":
			var court := board.grow(-24)
			draw_rect(court,Color("#448672"))
			draw_rect(court,fg,false,2)
			draw_line(Vector2(court.get_center().x,court.position.y),Vector2(court.get_center().x,court.end.y),fg,2)
			draw_line(Vector2(court.position.x,court.get_center().y),Vector2(court.end.x,court.get_center().y),fg,1)
			for i in 2:
				var x := court.position.x+10 if i==0 else court.end.x-10
				var y := court.get_center().y+sin(progress*16+i*.8)*court.size.y*.28
				draw_circle(Vector2(x,y),7,Color("#e9aa72") if i==0 else Color("#729bcc"),true,-1,true)
			var winner_right := int(outcome.get("pick",0))==1
			var line := pow(sin(progress*PI*4.5),2) if not winner_right else 1.0-pow(sin(progress*PI*4.5),2)
			draw_circle(Vector2(lerpf(court.position.x+17,court.end.x-17,line),court.get_center().y+sin(progress*25)*court.size.y*.27),4,Color("#edf58e"),true,-1,true)
