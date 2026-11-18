extends CanvasLayer

signal repeat_requested
signal conditions_requested
signal menu_requested

const PAPER := Color("#fff9e7")
const INK := Color("#3e3124")
const ACCENT := Color("#39734e")
const SUB := Color("#7b6955")
const SEASONS := {"winter":"зима","spring":"весна","summer":"лето","autumn":"осень"}
var sheet := VBoxContainer.new()
var paused_before := false
var results := false
var gate := -1
var animation: Tween

func setup() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 9
	hide()
	var cover := ColorRect.new()
	cover.color = Color("#181722c9")
	add_child(cover)
	cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	cover.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var panel := PanelContainer.new()
	center.add_child(panel)
	var style := StyleBoxFlat.new()
	style.bg_color = PAPER
	style.content_margin_left = 22
	style.content_margin_right = 22
	style.content_margin_top = 18
	style.content_margin_bottom = 18
	style.set_corner_radius_all(4)
	style.shadow_size = 6
	style.shadow_color = Color("#17101770")
	panel.add_theme_stylebox_override("panel",style)
	panel.custom_minimum_size.x = 555
	panel.add_child(sheet)
	sheet.add_theme_constant_override("separation",8)

func _open() -> void:
	if not visible:
		paused_before = get_tree().paused
	get_tree().paused = true
	gate = Time.get_ticks_msec()+300
	if animation:
		animation.kill()
	for child in sheet.get_children():
		sheet.remove_child(child)
		child.queue_free()
	show()

func dismiss() -> void:
	if not visible:
		return
	if animation:
		animation.kill()
	hide()
	get_tree().paused = paused_before

func result(stats: Dictionary) -> void:
	_open()
	results = true
	_label(tr("чек заезда") + "     № %02d" % int(stats.number),17,SUB)
	_label(tr(stats.title),28,INK)
	if stats.kind == "time":
		_label(tr("время вышло — пиццерия закрылась"),16,SUB)
	animation = create_tween()
	animation.tween_interval(.28)
	_stat("доставлено",str(stats.delivered))
	if int(stats.tips) > 0:
		_stat("чаевые","+%d ₽" % int(stats.tips))
	_stat("ударов",str(stats.hits))
	if int(stats.people) > 0:
		_stat("прохожих сбито",str(stats.people))
	if int(stats.fine) > 0:
		_stat("штрафы","−%d ₽" % int(stats.fine))
	var amount := _stat("заработано","0 ₽")
	animation.tween_method(func(v: float): amount.text = "%d ₽" % roundi(v),0.0,float(stats.earned),.7 if int(stats.earned)>0 else .01)
	if bool(stats.record):
		_label(tr("рекорд"),19,ACCENT)
	elif int(stats.previous)>0:
		_label(tr("рекорд заезда — {m}").format({"m":str(stats.previous)+" ₽"}),15,SUB)
	var subtitle: String = {"hell":"Ад на земле","afterhell":"День после катастрофы"}.get(stats.mode,SEASONS.get(stats.season,"лето"))
	_label(tr(subtitle) + " · " + tr("Семёрка") + " · " + tr("Юг") + " · 09:00—" + str(stats.clock),16,SUB)
	_label(tr("в копилку не идёт, сюжета нет"),15,SUB)
	var line := HBoxContainer.new()
	sheet.add_child(line)
	var replay := _button(line,"ещё заезд",repeat_requested)
	_button(line,"поменять условия",conditions_requested)
	_button(line,"в меню",menu_requested)
	replay.grab_focus.call_deferred()

func records(career: Dictionary, quick_best: int, deliveries: int) -> void:
	_open()
	results = false
	_label(tr("таблица рекордов"),26,INK)
	_label(tr("Личные"),18,SUB)
	if not career.is_empty():
		_stat("лучшая смена","%d ₽" % int(career.get("earned",0)))
		_stat("доставлено",str(career.get("delivered",0)))
	_stat("быстрый заезд",("%d ₽" % quick_best) if quick_best>0 else "—")
	if quick_best>0:
		_stat("доставлено",str(deliveries))
	_button(sheet,"назад",menu_requested).grab_focus.call_deferred()

func _stat(key: String, value: String) -> Label:
	var row := HBoxContainer.new()
	sheet.add_child(row)
	var name_label := _text(tr(key),17,SUB)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_label)
	var number := _text(value,19,ACCENT)
	row.add_child(number)
	if results:
		row.modulate.a = 0
		animation.tween_property(row,"modulate:a",1.0,.07)
	return number

func _label(value: String, pixels: int, color: Color) -> void:
	var l := _text(value,pixels,color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sheet.add_child(l)

func _text(value: String, pixels: int, color: Color) -> Label:
	var l := Label.new()
	l.text = value
	l.add_theme_font_size_override("font_size",pixels)
	l.add_theme_color_override("font_color",color)
	return l

func _button(parent: Container, text: String, next: Signal) -> Button:
	var button := Button.new()
	button.text = tr(text)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size.y = 38
	parent.add_child(button)
	button.pressed.connect(_choose.bind(next))
	return button

func _choose(next: Signal) -> void:
	if Time.get_ticks_msec() < gate:
		return
	dismiss()
	next.emit()

func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed(&"ui_cancel") or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B):
		get_viewport().set_input_as_handled()
		_choose(menu_requested)
	elif results and event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_X:
		get_viewport().set_input_as_handled()
		_choose(conditions_requested)
