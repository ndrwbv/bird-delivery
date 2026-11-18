extends Control

# The meal is a direct message. Opening pauses the shift. Choosing applies one
# effect immediately; the reply, acknowledgement and summary are presentation.
const MEALS := [
	["Починить машину","Восстановить сердца, кузов и мотор","Машину бы починить.","Машина починена"],
	["«Директорская»","Шанс чаевых +{p} п.п., размер ×{k}","«Директорскую».","Шанс чаевых +{p} п.п., размер ×{k}"],
	["Холодная пепперони","+1 сердце","Холодную пепперони.","+1 сердце"]]
const INK := Color("#34472e")
const BUBBLE := Color("#eef8df")
var platform: Node
var device: Control
var on_choose: Callable
var on_resume: Callable
var original_focus: WeakRef
var selected := -1
var cursor := 0
var stage := ""
var lines: Label
var hint: Label
var suggestions: Array[Button] = []
var elapsed := 0.0
var typed := 0
var letters := 0.0
var body := ""
var history := PackedStringArray()
var reply_buttons: Control
var prior_pause := false
var consumed_frame := -2
var stick_latch := false
var active_device := -1
var accept_guard := false
var previous_page := ""
var previous_open := false

func setup(phone: Control) -> void:
	device = phone
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg: Panel = device._panel(self,Rect2(0,0,290,497),Color("#e3efdf"),Color("#a8bd9f"),1)
	var head: Panel = device._panel(bg,Rect2(0,0,290,42),Color("#49765a"),Color("#365f46"),1)
	device._label(head,Rect2(12,0,235,42),18,Color.WHITE).text = tr("Личные")
	var close: Button = device._bare_button(head,Rect2(245,3,38,36),"×",finish)
	close.add_theme_font_size_override("font_size",24)
	var paper: Panel = device._panel(bg,Rect2(8,51,274,167),BUBBLE,Color("#aac894"),1,10)
	lines = device._label(paper,Rect2(10,6,254,155),16,INK)
	lines.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lines.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	reply_buttons = Control.new()
	device._at(bg,reply_buttons,Rect2(7,225,276,209))
	for i in MEALS.size():
		var btn: Button = device._tab(reply_buttons,Rect2(0,i*67,276,62),"",pick.bind(i))
		btn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.mouse_entered.connect(_focus_choice.bind(i))
		suggestions.append(btn)
	hint = device._label(bg,Rect2(8,438,273,43),12,Color("#577251"))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hide()

func active() -> bool:
	return not stage.is_empty()

func open(apply: Callable, next: Callable) -> bool:
	if active() or not apply.is_valid() or not next.is_valid() or device.popup:
		return false
	on_choose = apply
	on_resume = next
	platform = get_tree().get_first_node_in_group("game_platform")
	original_focus = weakref(get_viewport().gui_get_focus_owner()) if get_viewport().gui_get_focus_owner() else null
	selected = -1
	cursor = 0
	active_device = -1
	history.clear()
	previous_page = device.page
	previous_open = device.expanded
	prior_pause = get_tree().paused
	get_tree().paused = true
	accept_guard = _accept_down()
	stick_latch = true
	for i in suggestions.size():
		var b := suggestions[i]
		b.text = "%d   %s\n       %s" % [i+1,tr(MEALS[i][0]),_effect(MEALS[i][1])]
	device._switch("meal",true)
	device.home_btn.hide()
	show()
	set_process(true)
	_line("question",tr("Поешь, что будешь?"),tr("Ирина Сергеевна"))
	_focus_choice(0)
	return true

func _effect(key: String) -> String:
	var locale := TranslationServer.get_locale().get_slice("_",0)
	return tr(key).format({"p":20,"k":"1,3" if locale in ["ru","uk","be","kk","de","es","fr","pt","pl","tr","it"] else "1.3"})

func _line(id: String, line: String, sender: String) -> void:
	stage = id
	elapsed = 0
	letters = 0
	typed = 0
	body = line
	history.append(sender+"  ·  "+line)
	device.message(sender+"   "+line,true,false,false)
	lines.text = "\n\n".join(history.slice(maxi(0,history.size()-2)))
	lines.visible_characters = lines.text.length()-body.length()
	reply_buttons.hide()
	for b in suggestions:
		b.disabled = true
	_hint()

func _hint() -> void:
	hint.text = tr("Крестовина — выбрать · A — ответить") if active_device>=0 else tr("↑ ↓ — выбрать · Enter — ответить")
	hint.visible = stage=="question" and typed>=body.length()

func _focus_choice(i: int) -> void:
	cursor = i
	for j in suggestions.size():
		var b := suggestions[j]
		b.add_theme_stylebox_override("normal",device._style(Color("#ffe3a7") if j==cursor else Color("#fff5dd"),Color("#a6895b"),2 if j==cursor else 1,7))

func _complete_text() -> void:
	typed = body.length()
	lines.visible_characters = -1
	elapsed = 0.0
	if stage=="question":
		reply_buttons.show()
		for b in suggestions:
			b.disabled = false
	_hint()

func pick(index: int) -> void:
	if _platform_paused() or stage!="question" or index not in [0,1,2] or selected>=0 or accept_guard:
		return
	if typed<body.length():
		_complete_text()
		return
	if elapsed<.12:
		return
	selected = index
	var apply := on_choose
	on_choose = Callable()
	_line("reply",tr(MEALS[index][2]),tr("Женя"))
	apply.call(index)

func _advance() -> void:
	if typed<body.length():
		_complete_text()
	elif elapsed>=.12:
		match stage:
			"question": pick(cursor)
			"reply": _line("ack",tr("Ок"),tr("Ирина Сергеевна"))
			"ack": _line("effect",_effect(MEALS[selected][3]),tr("Птица Пицца"))
			"effect": finish()

func _process(delta: float) -> void:
	if not active() or _platform_paused():
		return
	if accept_guard:
		accept_guard = _accept_down()
	if typed<body.length():
		letters += minf(delta,.15)*38.
		while letters>=1 and typed<body.length():
			var letter := body.substr(typed,1)
			typed+=1
			letters-=7 if letter in [".","!","?","…"] else (3 if letter=="," else 1)
		lines.visible_characters = lines.text.length()-body.length()+typed
		if typed>=body.length():
			_complete_text()
	else:
		elapsed += delta
		if stage!="question" and elapsed>=clampf(.6+body.length()*.025,.9,2.8):
			_advance()

func _accept_down() -> bool:
	if Input.is_key_pressed(KEY_ENTER) or Input.is_key_pressed(KEY_KP_ENTER) or Input.is_key_pressed(KEY_SPACE):
		return true
	for id in Input.get_connected_joypads():
		if Input.is_joy_button_pressed(id,JOY_BUTTON_A):
			return true
	return false

func _platform_paused() -> bool:
	return is_instance_valid(platform) and not platform.pause_reasons.is_empty()

func _input(event: InputEvent) -> void:
	if not active() or _platform_paused():
		return
	# Pointer clicks on the phone are handled by its own controls.
	if event is InputEventMouse or event is InputEventScreenTouch:
		return
	var used := false
	if event is InputEventJoypadMotion and event.axis in [JOY_AXIS_LEFT_X,JOY_AXIS_LEFT_Y]:
		active_device=event.device
		var magnitude := absf(event.axis_value)
		if magnitude<.30:
			stick_latch=false
		elif magnitude>.62 and not stick_latch and stage=="question":
			stick_latch=true
			_focus_choice(posmod(cursor+(1 if event.axis_value>0 else -1),3))
		_hint()
		used=true
	if (event is InputEventJoypadButton or event is InputEventKey) and not event.is_echo():
		var key: int=event.physical_keycode if event is InputEventKey else -1
		var joy: int=event.button_index if event is InputEventJoypadButton else -1
		var accept := key in [KEY_SPACE,KEY_ENTER,KEY_KP_ENTER] or joy==JOY_BUTTON_A
		if event is InputEventJoypadButton:
			active_device=event.device
		elif event.pressed:
			active_device=-1
		if not event.pressed:
			if accept:
				accept_guard=_accept_down()
		elif key in [KEY_ESCAPE,KEY_BACKSPACE] or joy==JOY_BUTTON_B:
			finish()
		elif accept:
			if not accept_guard:
				_advance()
			accept_guard=true
		elif stage=="question" and typed>=body.length():
			if key in [KEY_1,KEY_2,KEY_3]:
				pick(key-KEY_1)
			elif key in [KEY_W,KEY_A,KEY_UP,KEY_LEFT] or joy in [JOY_BUTTON_DPAD_UP,JOY_BUTTON_DPAD_LEFT]:
				_focus_choice(posmod(cursor-1,3))
			elif key in [KEY_S,KEY_D,KEY_DOWN,KEY_RIGHT] or joy in [JOY_BUTTON_DPAD_DOWN,JOY_BUTTON_DPAD_RIGHT]:
				_focus_choice(posmod(cursor+1,3))
		used=true
	if used:
		get_viewport().set_input_as_handled()

func finish() -> void:
	_close(true)

func cancel() -> void:
	_close(false)

func _close(resume: bool) -> void:
	if not active():
		return
	stage = ""
	set_process(false)
	consumed_frame = Engine.get_physics_frames()
	var next := on_resume
	on_choose = Callable()
	on_resume = Callable()
	hide()
	device._switch(previous_page if previous_open else "shift",previous_open)
	get_tree().paused = prior_pause or _platform_paused()
	if original_focus and is_instance_valid(original_focus.get_ref()) and original_focus.get_ref().is_visible_in_tree():
		original_focus.get_ref().grab_focus()
	original_focus = null
	if resume and next.is_valid():
		next.call()
