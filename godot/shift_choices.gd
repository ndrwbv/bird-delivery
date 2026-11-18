extends CanvasLayer

signal selected(index: int)
var shade := ColorRect.new()
var card := PanelContainer.new()
var body := VBoxContainer.new()
var buttons: Array[Button] = []
var remaining := -1.0
var default_answer := -1
var previous_pause := false
var previous_focus: WeakRef
var consumed_physics_frame := -2


func _ready() -> void:
	layer = 13
	process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(.045,.055,.065,.6)
	var center := CenterContainer.new()
	shade.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.add_child(card)
	var paint := StyleBoxFlat.new()
	paint.bg_color = Color("#f4e6ce")
	paint.set_corner_radius_all(10)
	for side in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		paint.set_content_margin(side, 18)
	card.add_theme_stylebox_override("panel",paint)
	card.add_child(body)
	body.add_theme_constant_override("separation",10)
	hide()


func offer(person: String, question: String, answers: Array, timeout := -1.0, on_timeout := -1) -> void:
	remaining = timeout
	default_answer = on_timeout
	if not visible:
		previous_pause = get_tree().paused
		var focused := get_viewport().gui_get_focus_owner()
		previous_focus = weakref(focused) if focused else null
	get_tree().paused = true
	for item in body.get_children():
		body.remove_child(item)
		item.queue_free()
	buttons.clear()
	_line(person,16,Color("#9b4728"))
	_line(question,22,Color("#382d25"))
	for i in answers.size():
		var button := Button.new()
		button.text = tr(str(answers[i]))
		button.custom_minimum_size.y = 44
		body.add_child(button)
		button.pressed.connect(_pick.bind(i))
		buttons.append(button)
	for i in buttons.size():
		buttons[i].focus_neighbor_top = buttons[i].get_path_to(buttons[posmod(i-1,buttons.size())])
		buttons[i].focus_neighbor_bottom = buttons[i].get_path_to(buttons[(i+1)%buttons.size()])
	show()
	buttons[0].grab_focus()


func _process(delta: float) -> void:
	if visible and remaining >= 0 and default_answer >= 0:
		remaining -= delta
		if remaining <= 0:
			_pick(default_answer)


func _line(value: String, size_px: int, color: Color) -> void:
	var label := Label.new()
	label.text = tr(value)
	label.add_theme_font_size_override("font_size",size_px)
	label.add_theme_color_override("font_color",color)
	body.add_child(label)


func _pick(index: int) -> void:
	if not visible:
		return
	consumed_physics_frame = Engine.get_physics_frames()
	hide()
	get_tree().paused = previous_pause
	if previous_focus and is_instance_valid(previous_focus.get_ref()) and previous_focus.get_ref().is_visible_in_tree():
		previous_focus.get_ref().grab_focus()
	selected.emit(index)
