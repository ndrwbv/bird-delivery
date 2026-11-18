extends Control

var engine: RefCounted
var just_started := 0.0
var flash := 0.0
var hit := false


func setup(motor: RefCounted) -> void:
	engine = motor
	engine.started.connect(func() -> void: just_started = 0.65)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	offset_left = -168.0
	offset_right = 168.0
	offset_top = 68.0
	offset_bottom = 175.0
	hide()


func step(delta: float, active: bool) -> void:
	just_started = maxf(0.0,just_started-delta)
	flash = maxf(0.0,flash-delta)
	visible = active and (engine.restarting or just_started > 0.0)
	if visible:
		queue_redraw()


func press() -> void:
	if not engine.restarting or engine.press_delay > 0.0:
		return
	hit = engine.press_starter()
	flash = 0.12


func _draw() -> void:
	var font := ThemeDB.fallback_font
	var bg := Color("#231f24ef")
	draw_rect(Rect2(Vector2.ZERO,size),bg)
	draw_string(font,Vector2(0,28),tr("Завелась!") if just_started > 0.0 else tr("Заглохла — заводим"),
		HORIZONTAL_ALIGNMENT_CENTER,size.x,23,Color.WHITE)
	if just_started > 0.0:
		return
	draw_string(font,Vector2(0,50),tr("Пробел, E или A — когда метка в зелёном"),HORIZONTAL_ALIGNMENT_CENTER,size.x,15)
	var bar := Rect2(18,60,size.x-36,16)
	draw_rect(bar,Color("#655a55"))
	draw_rect(Rect2(bar.position.x+bar.size.x*float(engine.zone.x),bar.position.y,bar.size.x*float(engine.zone.y),bar.size.y),Color("#7ac75b"))
	var at := Vector2(bar.position.x+bar.size.x*float(engine.marker),bar.position.y)
	draw_rect(Rect2(at-Vector2(2,3),Vector2(4,bar.size.y+6)),Color("#f37961") if flash > 0.0 and not hit else Color.WHITE)
	for i in 3:
		draw_circle(Vector2(size.x*0.5+float(i-1)*18.0,92),4.5,Color("#7ac75b") if i < engine.hits else Color("#817873"))
