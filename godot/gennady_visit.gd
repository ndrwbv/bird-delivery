extends CanvasLayer

signal completed
signal stair_time(delta: float)

enum Phase { CLOSED, LOADING, STAIRS, WRONG_DOOR, OPENING, DIALOGUE, LEAVING, SELF_WAIT }
const ASSET_CATALOG := preload("res://gennady_assets.gd")
const INTERIOR := "res://gennady_interior.tscn"
const DIALOG := [
	["Геннадий", "драсте"],
	["Женя", "драсте, ваша пицца"],
	["Женя", "у вас в заказе было..."],
	["Женя", "вот ваша пеперони"],
	["Геннадий", "заебок, ща я на нее колбаской докторской насыплю, а то вы заебали жмотить мяса"],
	["Геннадий", "вот ваши {amount}"],
	["Геннадий", "досвидания"],
]
const QUESTION := 2
const WRONG_REPLY := -1
const LATE_PIZZA := -2

var catalog := ASSET_CATALOG.new()
var prepared := false
var phase := Phase.CLOSED
var room: Node3D
var root: ColorRect
var scene_view: SubViewport
var goal: Label
var clock_label: Label
var prompt: Label
var speech: PanelContainer
var speaker: Label
var phrase: Label
var choices: HBoxContainer
var options: Array[Button] = []
var fade: ColorRect
var receipt: Label
var breath_meter: ProgressBar
var pause_label: Label
var sounds := AudioStreamPlayer.new()

var was_paused := false
var previous_mouse := Input.MOUSE_MODE_VISIBLE
var previous_disable_3d := false
var previous_focus: WeakRef
var suspended := false
var explicit_pause := false
var is_adult := true
var late_order := false
var payment := 0
var line := 0
var elapsed := 0.0
var typed := 0
var letters := 0.0
var typed_wait := 0.0
var wrong_count := 0
var wrong_flat := 0
var wrong_doors: Array[int] = []
var remark_left := 0.0
var self_wait := 0.0
var previous_second := -1
var blink_in := 4.0
var blink_left := 0.0
var mouth_in := 0.2
var mouth_open := false
var face_elapsed := 0.0
var next_step := 0.0
var active_pad := 0
var using_pad := false
var answer := 0
var door_creaked := false

func _ready() -> void:
	layer = 15
	process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(sounds)
	set_process(false)
	set_process_input(false)

func prepare() -> void:
	catalog.prepare()
	set_process(true)
	if ResourceLoader.load_threaded_get_status(INTERIOR) == ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
		ResourceLoader.load_threaded_request(INTERIOR, "PackedScene")

func active() -> bool:
	return phase != Phase.CLOSED

func start(payment_rubles := 0, adult := true, late := false) -> void:
	if active():
		return
	payment = payment_rubles
	is_adult = adult
	late_order = late
	wrong_count = 0
	wrong_doors.clear()
	face_elapsed = 0
	blink_in = 4
	blink_left = 0
	mouth_in = 0.2
	mouth_open = false
	previous_second = -1
	suspended = false
	explicit_pause = false
	answer = 0
	was_paused = get_tree().paused
	previous_disable_3d = get_viewport().disable_3d
	previous_mouse = Input.mouse_mode
	var focused := get_viewport().gui_get_focus_owner()
	previous_focus = weakref(focused) if focused else null
	get_tree().paused = true
	get_viewport().disable_3d = true
	_build_ui()
	phase = Phase.LOADING
	goal.text = tr("Калинина, 96 · подъезд 1")
	prepare()
	set_process(true)
	set_process_input(true)
	_set_mouse()

func _build_ui() -> void:
	root = ColorRect.new()
	root.color = Color("#151713")
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var image := SubViewportContainer.new()
	root.add_child(image)
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image.stretch = true
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scene_view = SubViewport.new()
	scene_view.own_world_3d = true
	scene_view.disable_3d = true
	scene_view.handle_input_locally = false
	scene_view.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	image.add_child(scene_view)
	goal = _label(24)
	root.add_child(goal)
	goal.position = Vector2(24, 16)
	clock_label = _label(20)
	root.add_child(clock_label)
	clock_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	clock_label.offset_top = 18
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	clock_label.hide()
	breath_meter = ProgressBar.new()
	breath_meter.max_value = 1.0
	breath_meter.show_percentage = false
	breath_meter.position = Vector2(26, 59)
	breath_meter.size = Vector2(150, 9)
	breath_meter.hide()
	root.add_child(breath_meter)
	prompt = _label(19)
	root.add_child(prompt)
	prompt.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	prompt.offset_top = -59
	prompt.offset_bottom = -16
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	receipt = _label(21)
	root.add_child(receipt)
	receipt.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	receipt.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	receipt.offset_right = -20
	receipt.offset_top = 18
	_update_receipt()
	receipt.hide()
	speech = PanelContainer.new()
	root.add_child(speech)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#25291fee")
	style.border_color = Color("#85714e")
	style.set_border_width_all(2)
	style.content_margin_left = 17
	style.content_margin_right = 17
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	speech.add_theme_stylebox_override("panel",style)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 9)
	speech.add_child(column)
	speaker = _label(19)
	speaker.add_theme_color_override("font_color", Color("#e4c690"))
	column.add_child(speaker)
	phrase = _label(24)
	phrase.size_flags_vertical = Control.SIZE_EXPAND_FILL
	phrase.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	phrase.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	phrase.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	column.add_child(phrase)
	choices = HBoxContainer.new()
	column.add_child(choices)
	options.clear()
	for i in 2:
		var option := Button.new()
		option.text = tr("диабло") if i == 0 else tr("пеперони")
		option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		option.pressed.connect(choose.bind(i))
		choices.add_child(option)
		options.append(option)
	speech.hide()
	fade = ColorRect.new()
	fade.color = Color(0,0,0,0)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pause_label = _label(30)
	root.add_child(pause_label)
	pause_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pause_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pause_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	pause_label.text = tr("Пауза · продолжить")
	pause_label.hide()

func _label(px: int) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size",px)
	label.add_theme_constant_override("outline_size",4)
	label.add_theme_color_override("font_outline_color", Color("#161a16"))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _process(delta: float) -> void:
	if not prepared:
		prepared = catalog.step()
		if not prepared and not catalog.failure.is_empty():
			if active():
				goal.text = tr("Не удалось загрузить подъезд")
				prompt.text = tr("Enter / A · повторить")
			return
		if not prepared:
			return
	if not active():
		set_process(false)
		return
	if suspended or explicit_pause:
		return
	if phase == Phase.LOADING:
		if is_instance_valid(room):
			if room.build_slice():
				scene_view.disable_3d = false
				_enter_stairs()
			return
		match ResourceLoader.load_threaded_get_status(INTERIOR):
			ResourceLoader.THREAD_LOAD_LOADED:
				var packed := ResourceLoader.load_threaded_get(INTERIOR) as PackedScene
				room = packed.instantiate() as Node3D
				room.assets = catalog.assets
				scene_view.add_child(room)
			ResourceLoader.THREAD_LOAD_FAILED, ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
				push_error("Не удалось загрузить сцену подъезда")
				goal.text = tr("Не удалось загрузить подъезд")
				prompt.text = tr("Enter / A · повторить")
		return
	elapsed += delta
	match phase:
		Phase.STAIRS:
			stair_time.emit(delta)
			if remark_left > 0:
				remark_left -= delta
				if remark_left <= 0:
					speech.hide()
			_walk(delta)
		Phase.WRONG_DOOR:
			stair_time.emit(delta)
			if elapsed >= 0.18 and not door_creaked:
				door_creaked = true
				_sound("wrong")
			room.open_door(wrong_flat, 0.62*smoothstep(0.0,0.18,elapsed)*(1.0-smoothstep(2.3,2.8,elapsed)))
		Phase.SELF_WAIT:
			stair_time.emit(delta)
			if elapsed >= self_wait + 0.7:
				_enter_stairs()
			elif elapsed >= self_wait:
				speaker.text = tr("Геннадий")
				phrase.text = tr("Ну, давай пиццу.")
			elif elapsed >= 0.7:
				speaker.text = tr("Геннадий")
				phrase.text = tr("Ладно, щас спущусь. Жди.")
			if phase == Phase.SELF_WAIT:
				prompt.text = tr("клиент спускается… %d с") % maxi(0,ceili(self_wait-elapsed))
		Phase.OPENING:
			if elapsed >= 0.75 and not door_creaked:
				door_creaked = true
				_sound("open")
			var open := 0.18*smoothstep(0.75,1.55,elapsed) + 0.82*smoothstep(1.85,3.70,elapsed)
			room.open_door(10,open)
			room.frame_door(elapsed)
			room.set_lamp(_lamp_amount(elapsed))
			if elapsed >= 5.0:
				phase = Phase.DIALOGUE
				_set_line(0)
		Phase.DIALOGUE:
			_dialog_step(delta)
		Phase.LEAVING:
			var k := clampf(elapsed/0.75,0,1)
			room.frame_door(5.0,smoothstep(0,0.45,k))
			room.open_door(10,1.0-pow(k,3.0))
			fade.color.a = smoothstep(0.78,1.0,k)
			if elapsed >= 0.75 and not door_creaked:
				door_creaked = true
				_sound("slam")
			if elapsed >= 0.90:
				_finish()

func _enter_stairs() -> void:
	phase = Phase.STAIRS
	elapsed = 0.0
	next_step = 0.55
	wrong_count = 0
	wrong_doors.clear()
	_update_receipt()
	remark_left = 2.0
	speaker.text = tr("Женя")
	phrase.text = tr("пахнет ссаниной")
	phrase.visible_ratio = 1
	choices.hide()
	_layout_speech(true)
	speech.show()
	_update_goal()
	_set_mouse()

func _walk(dt: float) -> void:
	var movement := Vector2(float(Input.is_physical_key_pressed(KEY_D))-float(Input.is_physical_key_pressed(KEY_A)),
		float(Input.is_physical_key_pressed(KEY_W))-float(Input.is_physical_key_pressed(KEY_S)))
	movement += Vector2(float(Input.is_physical_key_pressed(KEY_RIGHT))-float(Input.is_physical_key_pressed(KEY_LEFT)),
		float(Input.is_physical_key_pressed(KEY_UP))-float(Input.is_physical_key_pressed(KEY_DOWN)))
	var stick := Vector2(Input.get_joy_axis(active_pad,JOY_AXIS_LEFT_X), -Input.get_joy_axis(active_pad,JOY_AXIS_LEFT_Y))
	if stick.length() > 0.16:
		movement += stick
	var look := Vector2(Input.get_joy_axis(active_pad,JOY_AXIS_RIGHT_X),Input.get_joy_axis(active_pad,JOY_AXIS_RIGHT_Y))
	if look.length() > 0.12:
		room.look_by(look.x*dt*2.1,look.y*dt*1.7)
	var sprint := Input.is_key_pressed(KEY_SHIFT) or Input.get_joy_axis(active_pad,JOY_AXIS_TRIGGER_RIGHT) > 0.5
	# Substeps preserve the original 0.23 m step-up limit on a slow rendered frame.
	var left := minf(dt,0.25)
	while left > 0.0001:
		var step := minf(left,1.0/60.0)
		room.move_player(movement.limit_length(),sprint,step)
		left -= step
	if room.travelled >= next_step:
		next_step += 0.55
		_sound("step")
	_update_goal()

func _update_goal() -> void:
	var f := floori((room.feet.y+0.08)/2.8)+1
	goal.text = tr("Поднимись на 3-й этаж · квартира 10\nСейчас этаж %d") % f
	breath_meter.value = room.breath
	breath_meter.visible = room.breath < 0.99
	if room.nearby_flat > 0:
		prompt.text = tr("Позвонить · квартира %d   [A]") % room.nearby_flat if using_pad else tr("Позвонить · квартира %d   [E]") % room.nearby_flat
	else:
		prompt.text = tr("Стики · ходьба и обзор     RT · бег     X · накладная     RB · позвать вниз") if using_pad else tr("WASD · ходьба     Мышь · обзор     Shift · бег     Tab · накладная     Q · позвать вниз")

func set_deadline(seconds_left: float) -> void:
	var seconds := maxi(0, ceili(seconds_left))
	late_order = late_order or seconds_left <= 0
	if active() and seconds != previous_second:
		previous_second = seconds
		clock_label.text = "%d:%02d" % [floori(seconds / 60.0), seconds % 60]
		clock_label.visible = phase in [Phase.STAIRS, Phase.WRONG_DOOR, Phase.SELF_WAIT]

func _update_receipt() -> void:
	receipt.text = tr("Накладная\nКалинина, 96 · подъезд 1\n3 этаж · квартира 10\nГеннадий · пеперони")
	for flat in wrong_doors:
		receipt.text += tr("\n✕ кв. %d") % flat

func call_down() -> void:
	if phase != Phase.STAIRS or suspended or explicit_pause:
		return
	phase = Phase.SELF_WAIT
	self_wait = randf_range(6,10)
	elapsed = 0
	room.return_to_entry()
	receipt.hide()
	breath_meter.hide()
	goal.text = tr("Клиент спускается сам — жди внизу")
	speaker.text = tr("Женя")
	phrase.text = tr("Спуститесь сами, пожалуйста! Я внизу подожду.")
	phrase.visible_ratio = 1.0
	choices.hide()
	_layout_speech(true)
	speech.show()
	_set_mouse()

func interact() -> void:
	if not active() or suspended or explicit_pause:
		return
	match phase:
		Phase.LOADING:
			if not catalog.failure.is_empty():
				catalog.prepare()
			if not is_instance_valid(room) and ResourceLoader.load_threaded_get_status(INTERIOR) in [ResourceLoader.THREAD_LOAD_FAILED,ResourceLoader.THREAD_LOAD_INVALID_RESOURCE]:
				ResourceLoader.load_threaded_request(INTERIOR,"PackedScene")
		Phase.STAIRS:
			if room.nearby_flat == 0:
				return
			_sound("ring")
			elapsed = 0.0
			remark_left = 0
			door_creaked = false
			if room.nearby_flat == 10:
				phase = Phase.OPENING
				room.begin_closeup()
				clock_label.hide()
				speech.hide()
				goal.hide()
				prompt.hide()
				breath_meter.hide()
				receipt.hide()
			else:
				phase = Phase.WRONG_DOOR
				wrong_flat = room.nearby_flat
				wrong_count += 1
				wrong_doors.append(wrong_flat)
				if wrong_doors.size() > 3:
					wrong_doors.pop_front()
				_update_receipt()
				speaker.text = tr("Женя") if wrong_count % 2 else tr("кв. %d") % wrong_flat
				phrase.text = tr("походу не сюда") if wrong_count % 2 else (tr("кто там? иди нахуй") if is_adult else tr("кто там?"))
				phrase.visible_ratio = 1.0
				choices.hide()
				_layout_speech(wrong_count % 2 == 1)
				speech.show()
				prompt.text = tr("Дальше · Enter / A")
				_set_mouse()
		Phase.WRONG_DOOR:
			if elapsed < 0.30:
				return
			room.open_door(wrong_flat,0.0)
			speech.hide()
			phase = Phase.STAIRS
			_update_goal()
			_set_mouse()
		Phase.OPENING:
			elapsed = maxf(elapsed,5.0)
		Phase.DIALOGUE:
			if typed < phrase.text.length():
				typed = phrase.text.length()
				phrase.visible_characters = -1
				typed_wait = 0
			elif typed_wait >= 0.30 and line != QUESTION:
				_advance_line()
			elif line == QUESTION:
				choose(answer)
		Phase.LEAVING:
			elapsed = 0.90

func _set_line(which: int) -> void:
	line = which
	typed = 0
	letters = 0
	typed_wait = 0
	answer = 0
	var person := ""
	var value := ""
	if which == WRONG_REPLY:
		person = tr("Геннадий")
		value = tr("не, не мое")
	elif which == LATE_PIZZA:
		person = tr("Женя")
		value = tr("ваша пицца")
	else:
		person = tr(DIALOG[which][0])
		value = tr(DIALOG[which][1])
		if which == 4 and not is_adult:
			value = tr("здорово, ща я на нее колбаской докторской насыплю, а то мяса маловато")
		if late_order and which < 2:
			value = tr("драсте.. че так долго то, а?") if which == 0 else tr("извините задержался")
	speaker.text = person
	_layout_speech(person == tr("Женя"), which == QUESTION)
	phrase.text = value.replace("{amount}", "%d ₽" % payment)
	phrase.visible_characters = 0
	speech.show()
	choices.hide()
	_set_mouse()

func _layout_speech(courier: bool, question := false) -> void:
	speech.anchor_left = (0.28 if question else 0.20) if courier else 0.58
	speech.anchor_right = (0.72 if question else 0.80) if courier else 0.97
	speech.anchor_top = (0.73 if question else 0.81) if courier else 0.28
	speech.anchor_bottom = 0.95 if courier else 0.46

func _dialog_step(dt: float) -> void:
	var value := phrase.text
	var talking := (line == WRONG_REPLY or line in [0,4,5,6]) and typed < value.length()
	if typed < value.length():
		letters += dt*38.0
		while letters >= 1 and typed < value.length():
			var c := value[typed]
			typed += 1
			letters -= 7.0 if c in ["…",".","!","?"] else (3.0 if c == "," else 1.0)
		phrase.visible_characters = typed
	else:
		typed_wait += dt
		if line == QUESTION and typed_wait >= 0.3:
			if not choices.visible:
				choices.show()
				_focus_answer(0)
		elif line != QUESTION and typed_wait >= clampf(0.6 + value.length()*0.025,0.9,2.8):
			_advance_line()
			return
	face_elapsed += dt
	var emotion := "angry" if line == WRONG_REPLY or (late_order and line == 0) else ("smile" if line == 4 else "idle")
	if talking:
		mouth_in -= dt
		if mouth_in <= 0:
			mouth_open = not mouth_open
			mouth_in = randf_range(0.15,0.30)
		emotion = "talk" if mouth_open else "idle"
	else:
		blink_left = maxf(0,blink_left-dt)
		blink_in -= dt
		if blink_in <= 0:
			blink_in = randf_range(3.5,7.0)
			blink_left = 0.12
		if blink_left > 0:
			emotion = "blink"
	room.set_actor(emotion,face_elapsed)

func _advance_line() -> void:
	if line == WRONG_REPLY or line == LATE_PIZZA:
		_set_line(QUESTION)
	elif late_order and line == 1:
		_set_line(LATE_PIZZA)
	elif line < DIALOG.size()-1:
		_set_line(line+1)
	else:
		phase = Phase.LEAVING
		elapsed = 0
		door_creaked = false
		speech.hide()

func choose(index: int) -> void:
	if phase != Phase.DIALOGUE or line != QUESTION or suspended or explicit_pause:
		return
	if typed < phrase.text.length() or typed_wait < 0.30:
		return
	if index == 0 or index == 1:
		_set_line(WRONG_REPLY if index == 0 else 3)

func _focus_answer(index: int) -> void:
	answer = index
	options[index].grab_focus()

func _input(event: InputEvent) -> void:
	if not active():
		return
	if event is InputEventJoypadButton or event is InputEventJoypadMotion:
		using_pad = true
		active_pad = event.device
	elif event is InputEventKey or event is InputEventMouseMotion:
		using_pad = false
	if suspended:
		get_viewport().set_input_as_handled()
		return
	var key := event as InputEventKey
	var pad := event as InputEventJoypadButton
	if (key and key.pressed and not key.echo and key.keycode == KEY_ESCAPE) or (pad and pad.pressed and pad.button_index == JOY_BUTTON_START):
		explicit_pause = not explicit_pause
		_pause_changed()
		get_viewport().set_input_as_handled()
		return
	if explicit_pause:
		get_viewport().set_input_as_handled()
		return
	if phase == Phase.STAIRS and event is InputEventMouseMotion:
		room.look_by(event.relative.x*0.003,event.relative.y*0.003)
	if (key and key.pressed and not key.echo) or (pad and pad.pressed):
		if phase == Phase.STAIRS and ((key and key.keycode == KEY_TAB) or (pad and pad.button_index == JOY_BUTTON_X)):
			receipt.visible = not receipt.visible
		elif phase == Phase.STAIRS and ((key and key.physical_keycode == KEY_Q) or (pad and pad.button_index == JOY_BUTTON_RIGHT_SHOULDER)):
			call_down()
		elif phase == Phase.DIALOGUE and choices.visible and ((key and key.keycode in [KEY_LEFT,KEY_RIGHT,KEY_A,KEY_D]) or (pad and pad.button_index in [JOY_BUTTON_DPAD_LEFT,JOY_BUTTON_DPAD_RIGHT])):
			_focus_answer(1-answer)
		elif phase == Phase.DIALOGUE and choices.visible and key and key.keycode in [KEY_1, KEY_2]:
			choose(0 if key.keycode == KEY_1 else 1)
		elif (key and key.keycode in [KEY_E, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]) or (pad and pad.button_index == JOY_BUTTON_A):
			interact()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if phase == Phase.DIALOGUE and choices.visible:
			return # Buttons receive real mouse clicks from the control tree.
		if event.pressed:
			interact()
	get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if not active() or not is_inside_tree():
		return
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		suspended = true
		_pause_changed()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		suspended = false
		_pause_changed()

func _pause_changed() -> void:
	pause_label.visible = suspended or explicit_pause
	sounds.stream_paused = pause_label.visible
	fade.color.a = 0.70 if pause_label.visible else 0.0
	_set_mouse()

func _set_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if phase == Phase.STAIRS and not (suspended or explicit_pause) else Input.MOUSE_MODE_VISIBLE

func _lamp_amount(t: float) -> float:
	if t < 1.27: return 0
	if t < 1.38: return 0.25
	if t < 1.53: return 0.035
	if t < 1.64: return 0.62
	if t < 1.78: return 0.12
	if t < 1.93: return 0.78
	return 0.78 + 0.22*smoothstep(1.93,2.41,t)

func _sound(id: String) -> void:
	sounds.stream = room.sound_clip(id)
	sounds.pitch_scale = randf_range(150.0,200.0)/175.0 if id == "step" else 1.0
	sounds.play()

func _finish() -> void:
	_release()
	completed.emit()

func _exit_tree() -> void:
	catalog.close()
	if active():
		_release()

func _release() -> void:
	phase = Phase.CLOSED
	set_process(false)
	set_process_input(false)
	get_viewport().disable_3d = previous_disable_3d
	Input.mouse_mode = previous_mouse
	get_tree().paused = was_paused
	if previous_focus and is_instance_valid(previous_focus.get_ref()):
		previous_focus.get_ref().grab_focus()
	if is_instance_valid(root) and root.is_inside_tree():
		root.hide()
		root.queue_free()
	room = null
