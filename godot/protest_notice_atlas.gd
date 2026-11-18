extends Node2D

var topic: Dictionary
var copy: Dictionary
var stage := 0
var adults := true
const PAPER := ["#f4f1ea","#fff7c2","#e3f0ff","#ffe3e8","#e8ffe3"]
const SPRAY := ["#ff3b6b","#3bd1ff","#9dff3b","#ffd23b","#c86bff","#ff8a3b","#ffffff","#3bff9d"]


func _words(text: String, area: Rect2, ink: Color, font_size: int, outline := false) -> void:
	var f := ThemeDB.fallback_font
	var layout := TextParagraph.new()
	layout.width = area.size.x
	layout.alignment = HORIZONTAL_ALIGNMENT_CENTER
	layout.break_flags = TextServer.BREAK_MANDATORY|TextServer.BREAK_WORD_BOUND|TextServer.BREAK_ADAPTIVE
	for size_value in range(font_size,6,-1):
		layout.clear()
		layout.add_string(text,f,size_value)
		if layout.get_size().y<=area.size.y:
			break
	var pos := area.position+Vector2(0,maxf(0,area.size.y-layout.get_size().y)*0.5)
	if outline:
		layout.draw_outline(get_canvas_item(),pos,2,Color("#242026"))
	layout.draw(get_canvas_item(),pos,ink)


func _draw() -> void:
	if topic.is_empty():
		return
	var title: String = tr(topic.get("kids",topic.title) if not adults else topic.title)
	var primary := Color(topic.col[0])
	var secondary := Color(topic.col[1])
	var flag_at := Vector2(768,128)
	draw_rect(Rect2(flag_at,Vector2(256,64)),primary)
	draw_rect(Rect2(flag_at+Vector2.DOWN*64,Vector2(256,64)),secondary)
	var sun := flag_at+Vector2(128,64)
	draw_circle(sun,32,Color("#ffd84a"),true,-1,true)
	for i in 12:
		var axis := Vector2.from_angle(TAU*i/12)
		draw_line(sun+axis*39,sun+axis*53,Color("#ffd84a"),4,true)
	var lines: Array = [title]+topic.slog+copy.graffiti
	for i in 8:
		var loc := Vector2(i%4*256,(2+floori(i/4.0))*128)
		_words(tr(lines[i]),Rect2(loc+Vector2(8,5),Vector2(240,105)),Color(SPRAY[i]),38,true)
		for k in 5:
			draw_line(loc+Vector2(37+k*38,96),loc+Vector2(37+k*38,103+(k*17+i*7)%16),Color(SPRAY[i]),2)
	var civic: Array = copy.flyers.duplicate()
	if adults:
		civic += copy.flyers_adult
	for i in 32:
		var cell := 16+floori(i/2.0)
		var p := Vector2(cell%4*256+(i%2)*128,floori(cell/4.0)*128)
		var color := Color("#6f7378") if i==31 else Color(PAPER[i%5])
		draw_rect(Rect2(p,Vector2(128,128)),color)
		if i>=30:
			continue
		var text: String
		if i<14:
			text = title if i%4==0 else tr(topic.slog[(i-1+3)%3])
		else:
			text = tr(civic[floori((i-14)*0.5)%civic.size()])
		_words(text,Rect2(p+Vector2(6,6),Vector2(116,90)),primary.darkened(.2) if i<14 else Color("#302c2d"),22)
		if i>=14 and i%2==1:
			for j in 8:
				draw_rect(Rect2(p+Vector2(3+j*15,101),Vector2(14,26)),Color("#939087"),false,1)
