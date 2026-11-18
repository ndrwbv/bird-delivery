extends Control

signal resolved(success: bool)
var state := ""
var age := 0.0
var radius := 1.0
var outcome := false
var adult := true


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	hide()


func begin(is_adult: bool) -> void:
	adult = is_adult
	state = "lead"
	age = 0.0
	radius = 1.0
	show()
	queue_redraw()


func advance(delta: float) -> void:
	if state.is_empty():
		return
	age += delta
	if state=="lead" and age>=0.75:
		age = 0.0
		state = "go"
	elif state=="go":
		radius = maxf(0.0,radius-0.5*delta)
		if radius<0.42-0.075:
			_finish(false)
	elif state=="end" and age>=1.1:
		cancel()
		resolved.emit(outcome)
	queue_redraw()


func _finish(hit: bool) -> void:
	outcome = hit
	state = "end"
	age = 0.0


func cancel() -> void:
	state = ""
	hide()


func _input(event: InputEvent) -> void:
	if not visible or state.is_empty():
		return
	var hit_button: bool = event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT and event.pressed
	var hit_key: bool = event is InputEventKey and event.pressed and not event.echo and event.physical_keycode in [KEY_SPACE,KEY_ENTER,KEY_KP_ENTER,KEY_E]
	var hit_pad: bool = event is InputEventJoypadButton and event.button_index==JOY_BUTTON_A and event.pressed
	if hit_button or hit_key or hit_pad:
		if state=="go":
			_finish(absf(radius-0.42)<=0.075)
		get_viewport().set_input_as_handled()


func _draw() -> void:
	var c := size*0.5
	var w := minf(410,size.x-20.0)
	var f := ThemeDB.fallback_font
	var ink := Color("#31291e")
	var paper := Color("#fff0cc")
	draw_rect(Rect2(Vector2.ZERO,size),Color(0.08,0.06,0.05,0.6))
	draw_rect(Rect2(c-Vector2(w*0.5,170),Vector2(w,340)),paper)
	draw_string(f,c+Vector2(-w*.5,-123),tr("Сожми очко!" if adult else "Соберись!"),HORIZONTAL_ALIGNMENT_CENTER,w,24,ink)
	draw_string(f,c+Vector2(-w*.5,-92),"−10 000 ₽",HORIZONTAL_ALIGNMENT_CENTER,w,18,Color("#a43524"))
	draw_arc(c,94.0*0.42,0,TAU,64,ink,3,true)
	var hot := absf(radius-0.42)<=0.075
	draw_arc(c,94.0*radius,0,TAU,96,Color("#35934e") if hot else Color("#bc472e"),5,true)
	var line := tr("жми, когда кольцо ляжет на круг")
	if state=="end":
		line = tr("отбился!" if outcome else ("очканул" if adult else "промах"))
	draw_string(f,c+Vector2(-w*.5,109),line,HORIZONTAL_ALIGNMENT_CENTER,w,17,ink)
	draw_string(f,c+Vector2(-w*.5,139),"[A]   Enter",HORIZONTAL_ALIGNMENT_CENTER,w,15,ink)
