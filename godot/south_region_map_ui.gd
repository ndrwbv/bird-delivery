extends CanvasLayer

signal waypoint_changed(destination: Dictionary, points: Array)

const DISTRICT_MAP := preload("res://district_map.gd")
const LANDMARKS := ["depot", "kalinina_96", "slavskogo_21", "beach", "garage", "gate_leningrad", "gate_central"]

var canvas := DISTRICT_MAP.new()
var search := LineEdit.new()
var places := ItemList.new()
var info := Label.new()
var navigate := Button.new()
var router: RefCounted
var selected: Dictionary = {}
var preview: Array = []
var position_on_open := Vector2.ZERO
var catalog: Array[Dictionary] = []
var previous_pause := false
var active_device := 0
var closed_on_frame := -2

func setup(region: Dictionary, core: Dictionary, routes: RefCounted) -> void:
	layer = 8
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	set_process(false)
	router = routes
	catalog.assign(routes.destinations)
	catalog.sort_custom(_before)
	var panel := PanelContainer.new()
	add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin := MarginContainer.new()
	for side in ["top", "bottom", "left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 18)
	panel.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	margin.add_child(row)
	row.add_child(canvas)
	canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	canvas.setup(region, core, true)
	canvas.gui_input.connect(_map_input)
	var sidebar := VBoxContainer.new()
	row.add_child(sidebar)
	sidebar.custom_minimum_size.x = 294
	var title := Label.new()
	title.text = tr("Солнечный · Юг")
	title.add_theme_font_size_override("font_size", 28)
	sidebar.add_child(title)
	search.placeholder_text = tr("Улица, дом или место")
	search.clear_button_enabled = true
	sidebar.add_child(search)
	search.text_changed.connect(_filter)
	places.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sidebar.add_child(places)
	places.item_selected.connect(_select)
	places.item_activated.connect(_activate)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info.custom_minimum_size.y = 42
	sidebar.add_child(info)
	navigate.text = tr("Проложить маршрут")
	sidebar.add_child(navigate)
	navigate.pressed.connect(_use_waypoint)
	var clear := Button.new()
	clear.text = tr("Вернуться к маршруту смены")
	sidebar.add_child(clear)
	clear.pressed.connect(_clear_waypoint)
	var close := Button.new()
	close.text = tr("Закрыть карту  ·  Tab / Y")
	sidebar.add_child(close)
	close.pressed.connect(_close)

func _before(a: Dictionary, b: Dictionary) -> bool:
	var ai := LANDMARKS.find(a.id)
	var bi := LANDMARKS.find(b.id)
	if ai != bi:
		return ai != -1 and (bi == -1 or ai < bi)
	return str(a.name).naturalnocasecmp_to(str(b.name)) < 0

func open_at(at: Vector2, current: Dictionary, points: Array, stop: Array) -> void:
	if visible:
		return
	previous_pause = get_tree().paused
	get_tree().paused = true
	set_process(true)
	position_on_open = at
	show()
	search.clear()
	_filter("")
	canvas.set_player(at)
	canvas.set_route(points, stop)
	if not current.is_empty():
		for i in places.item_count:
			if places.get_item_metadata(i).id == current.id:
				places.select(i)
				places.ensure_current_is_visible()
				_select(i)
				break
	places.grab_focus()

func _filter(query: String) -> void:
	places.clear()
	selected = {}
	preview = []
	navigate.disabled = true
	canvas.set_route([])
	for entry: Dictionary in catalog:
		if query.strip_edges().is_empty() or str(entry.name).containsn(query.strip_edges()):
			places.add_item(entry.name)
			places.set_item_metadata(places.item_count - 1, entry)
	info.text = tr("Выберите адрес или место.") if places.item_count else tr("Такого адреса нет в районе.")

func _select(index: int) -> void:
	selected = places.get_item_metadata(index)
	preview = router.route_to(position_on_open, selected)
	canvas.set_route(preview, selected.stop)
	navigate.disabled = preview.is_empty()
	var meters := 0.0
	for i in range(1, preview.size()):
		var a: Array = preview[i - 1]
		var b: Array = preview[i]
		meters += Vector2(a[0], a[1]).distance_to(Vector2(b[0], b[1]))
	info.text = tr("%s · %d м по дороге") % [selected.name, roundi(meters)] if not preview.is_empty() else tr("Нет проезда от текущего места.")

func _activate(index: int) -> void:
	_select(index)
	_use_waypoint()

func _use_waypoint() -> void:
	if preview.is_empty():
		return
	waypoint_changed.emit(selected, preview)
	_close()

func _clear_waypoint() -> void:
	waypoint_changed.emit({}, [])
	_close()

func _close() -> void:
	closed_on_frame = Engine.get_physics_frames()
	set_process(false)
	hide()
	get_tree().paused = previous_pause
	get_viewport().set_input_as_handled()

func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventJoypadMotion or event is InputEventJoypadButton:
		active_device = event.device
	if event is InputEventJoypadMotion and event.axis in [JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y]:
		get_viewport().set_input_as_handled()
		return
	var back := event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B
	if back or event.is_action_pressed(&"district_map") or event.is_action_pressed(&"ui_cancel"):
		_close()

func _process(delta: float) -> void:
	if not visible:
		return
	var axes := Vector2(Input.get_joy_axis(active_device, JOY_AXIS_LEFT_X), Input.get_joy_axis(active_device, JOY_AXIS_LEFT_Y))
	if axes.length() < 0.20:
		axes = Vector2.ZERO
	if not search.has_focus():
		axes += Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
			float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W)))
	if not axes.is_zero_approx():
		canvas.pan_by(-axes.limit_length() * 360.0 * delta)
	var zoom := Input.get_joy_axis(active_device, JOY_AXIS_TRIGGER_RIGHT) - Input.get_joy_axis(active_device, JOY_AXIS_TRIGGER_LEFT)
	if absf(zoom) > 0.12:
		canvas.zoom_by(exp(zoom * 1.5 * delta))


func _map_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		canvas.pan_by(event.relative)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			canvas.zoom_by(1.25)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			canvas.zoom_by(0.8)
