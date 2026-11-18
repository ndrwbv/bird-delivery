extends CanvasLayer

signal invoice_accepted
signal next_shift_requested
signal free_drive_requested
signal garage_requested
signal bet_requested
signal main_menu_requested

enum Page { CLOSED, INVOICE, RECEIPT }

const INK := Color("#38291d")
const MUTED := Color("#816951")
const PAPER := Color("#fffaee")
const GREEN := Color("#386e48")
const RED := Color("#a13f32")
const PHONE_SIZE := Vector2(330, 648)
const RECEIPT_WIDTH := 560.0
const SKIP_GUARD_MS := 350

# The order preview follows hudmapios.overview in Steam v0.36.0.
# World coordinates are cached once. A new order only repaints this small panel.
class RoutePreview extends Control:
	var roads: Array[PackedVector2Array] = []
	var extents: Array[Rect2] = []
	var major: Array[bool] = []
	var route := PackedVector2Array()

	func setup(region: Dictionary) -> void:
		for road: Dictionary in region.get("roads", []):
			var line := PackedVector2Array()
			for p: Array in road.points:
				line.append(Vector2(p[0], p[1]))
			if line.size() < 2:
				continue
			roads.append(line)
			extents.append(_bounds(line))
			major.append(int(road["class"]) <= 3)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		clip_contents = true

	func set_path(points: Array, destination: Array) -> void:
		route.clear()
		for xy: Array in points:
			route.append(Vector2(xy[0], xy[1]))
		if not route.is_empty() and destination.size() == 2:
			var stop := Vector2(destination[0], destination[1])
			if route[-1].distance_squared_to(stop) > 0.0025:
				route.append(stop)
		queue_redraw()

	func _bounds(points: PackedVector2Array) -> Rect2:
		var area := Rect2(points[0], Vector2.ZERO)
		for p: Vector2 in points:
			area = area.expand(p)
		return area

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#f0ead8"))
		if route.size() < 2:
			return
		var area := _bounds(route)
		var fit := minf((size.x - 28.0) / maxf(35.0, area.size.x), (size.y - 28.0) / maxf(35.0, area.size.y))
		var shift := size * 0.5 - area.get_center() * fit
		var view := Rect2(-shift / fit, size / fit).grow(4.0 / fit)
		draw_set_transform(shift, 0.0, Vector2.ONE * fit)
		for i in roads.size():
			if not view.intersects(extents[i], true):
				continue
			var tint := Color("#eac47c") if major[i] else Color("#faf8ed")
			draw_polyline(roads[i], tint, (2.5 if major[i] else 1.5) / fit, true)
		draw_polyline(route, Color("#fffdf4"), 6.0 / fit, true)
		draw_polyline(route, Color("#3185b6"), 3.2 / fit, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var start := shift + route[0] * fit
		var end := shift + route[-1] * fit
		draw_circle(start, 6.0, Color.WHITE, true, -1, true)
		draw_circle(start, 4.5, Color("#267db4"), true, -1, true)
		draw_rect(Rect2(start - Vector2(2.6, 1), Vector2(5.2, 2)), Color.WHITE)
		draw_colored_polygon(PackedVector2Array([end, end + Vector2(-4,-7), end + Vector2(4,-7)]), Color("#c54735"))
		draw_circle(end - Vector2(0,8), 5.0, Color.WHITE, true, -1, true)
		draw_circle(end - Vector2(0,8), 3.8, Color("#d95037"), true, -1, true)


var page := Page.CLOSED
var stage := Control.new()
var dim := ColorRect.new()
var phone := Panel.new()
var preview := RoutePreview.new()
var clock_label: Label
var health_label: Label
var balance_label: Label
var invoice_title: Label
var person_name: Label
var initials: Label
var portrait := TextureRect.new()
var address_value: Label
var former_address: RichTextLabel
var items_value: Label
var fee_value: Label
var special_value: Label
var accept_btn: Button
var sheet := PanelContainer.new()
var receipt_head: Label
var reason_label: Label
var wallet_value: Label
var score_note: Label
var leaders: Node
var receipt_key := 0
var rows := VBoxContainer.new()
var bottom := HBoxContainer.new()
var receipt_buttons: Array[Button] = []
var garage_button: Button
var bet_button: Button
var back_button: Button
var adult_spending := false
var returning_from_spending := false
var bold := SystemFont.new()
var print_tween: Tween
var printing := false
var input_after := 0
var consumed_physics_frame := -2
var gas_armed := true
var pad := false


func setup(region: Dictionary, _core: Dictionary) -> void:
	layer = 5
	process_mode = Node.PROCESS_MODE_ALWAYS
	bold.font_names = PackedStringArray(["Helvetica Neue", "Arial", "sans-serif"])
	bold.font_weight = 700
	add_child(stage)
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(dim)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_phone(region)
	_build_receipt()
	stage.resized.connect(_layout)
	_layout()
	dismiss()


func active() -> bool:
	return page != Page.CLOSED


func blocking() -> bool:
	return page == Page.RECEIPT


func show_invoice(paper: Dictionary) -> void:
	dismiss()
	page = Page.INVOICE
	dim.color = Color(0.02, 0.04, 0.08, 0.12)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	invoice_title.text = tr("Новый заказ") + " № %04d" % int(paper.number)
	person_name.text = str(paper.recipient)
	initials.text = person_name.text.left(1).to_upper()
	portrait.texture = paper.get("avatar") as Texture2D
	initials.visible = portrait.texture == null
	clock_label.text = str(paper.get("clock", ""))
	health_label.text = str(paper.get("health", ""))
	balance_label.text = _money(int(paper.balance)) if paper.has("balance") else ""
	address_value.text = str(paper.address)
	var apartment := int(paper.get("flat", 0))
	if apartment > 0 and not address_value.text.contains(tr("кв.")):
		address_value.text += ", %s %d" % [tr("кв."), apartment]
	former_address.clear()
	former_address.visible = paper.has("was_address")
	address_value.position.y = 292.0 if former_address.visible else 268.0
	address_value.size.y = 40.0 if former_address.visible else 64.0
	if former_address.visible:
		former_address.push_strikethrough()
		former_address.add_text(str(paper.was_address))
		former_address.pop()
	items_value.text = str(paper.items)
	fee_value.text = _money(int(paper.fee))
	special_value.text = str(paper.get("special",""))
	special_value.visible = not special_value.text.is_empty()
	fee_value.size.y = 25.0 if special_value.visible else 52.0
	preview.set_path(paper.get("route", []), paper.get("stop", []))
	gas_armed = not Input.is_action_pressed(&"accelerate")
	pad = bool(paper.get("pad", pad))
	_set_drive_hint()
	phone.show()
	show()
	_layout()


func accept_invoice() -> void:
	if page == Page.INVOICE:
		consumed_physics_frame = Engine.get_physics_frames()
		dismiss()
		invoice_accepted.emit()


func set_spending_enabled(adult: bool) -> void:
	adult_spending = adult


func refresh_balance(amount: int) -> void:
	if page != Page.RECEIPT:
		return
	wallet_value.text = _money(amount)
	bet_button.visible = adult_spending and amount >= 50 and bet_requested.has_connections()
	garage_button.visible = garage_requested.has_connections()
	back_button.text = tr("в меню") if main_menu_requested.has_connections() else tr("Свободная езда")
	if returning_from_spending:
		returning_from_spending = false
		input_after = Time.get_ticks_msec() + 180
		receipt_buttons[0].grab_focus.call_deferred()


func bind_leaders(source: Node) -> void:
	leaders = source
	leaders.receipt_updated.connect(_score_update)

func _score_update(key: int, line: String) -> void:
	if page==Page.RECEIPT and key==receipt_key:
		score_note.text = line
		score_note.visible = not line.is_empty()

func show_receipt(receipt: Dictionary) -> void:
	dismiss()
	page = Page.RECEIPT
	dim.color = Color(0.07, 0.05, 0.04, 0.73)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	receipt_head.text = tr("ЧЕК СМЕНЫ · ЮГ") + "     № %04d" % int(receipt.shift_number)
	reason_label.text = str(receipt.get("reason", ""))
	var mood_line: String = {"bad":"Сегодня вышло плохо. Завтра соберись, Женя.","ok":"Смена закончилась. Отдохни перед следующей.","great":"Молодец, Женя. Сегодня клиенты довольны."}.get(receipt.get("mood",""),"")
	if not mood_line.is_empty():
		reason_label.text += "\n" + tr(mood_line)
	reason_label.visible = not reason_label.text.is_empty()
	refresh_balance(int(receipt.balance))
	for old in rows.get_children():
		rows.remove_child(old)
		old.queue_free()
	_receipt_row(tr("Доставлено заказов") + " · %d" % int(receipt.delivered), _money(int(receipt.pay)), GREEN)
	if int(receipt.get("tips", 0)) > 0:
		_receipt_row(tr("Чаевые"), "+" + _money(int(receipt.tips)), GREEN)
	if receipt.has("hits"):
		_receipt_row(tr("Удары"), str(int(receipt.hits)), INK)
	if int(receipt.get("knocked",0)) > 0:
		_receipt_row(tr("Сбито прохожих"), str(int(receipt.knocked)), INK)
	if int(receipt.get("missed", 0)) > 0:
		_receipt_row(tr("Сорвано заказов"), str(int(receipt.missed)), RED)
	if int(receipt.get("penalties", 0)) > 0:
		_receipt_row(tr("Штрафы и вычеты"), "−" + _money(int(receipt.penalties)), RED)
	if receipt.has("bonus"):
		_receipt_row(tr("Бонус за смену"), _money(int(receipt.bonus)), GREEN)
	if receipt.has("stars"):
		_receipt_row(tr("Звёзды"), str(receipt.stars), INK)
	if receipt.has("rank"):
		_receipt_row(tr("Место в смене"), str(receipt.rank), INK)
	if int(receipt.get("win",0)) > 0:
		_receipt_row(tr("Первое место на смене"), "+" + _money(int(receipt.win)),GREEN)
	if receipt.has("rating"):
		_receipt_row(tr("Рейтинг"), str(receipt.rating), INK)
	var earned := int(receipt.earned)
	receipt_key = 0
	score_note.hide()
	if leaders and int(leaders.last_receipt.score)==earned and int(leaders.last_receipt.key)>0:
		receipt_key = leaders.last_receipt.key
		_score_update(receipt_key,leaders.last_receipt.line)
	_receipt_row(tr("За смену"), _money(earned), GREEN if earned >= 0 else RED, 23)
	sheet.show()
	show()
	sheet.reset_size()
	_layout()
	_print_receipt()


func dismiss() -> void:
	if print_tween:
		print_tween.kill()
		print_tween = null
	printing = false
	returning_from_spending = false
	page = Page.CLOSED
	hide()
	phone.hide()
	sheet.hide()
	release_focus()


func release_focus() -> void:
	var focused := get_viewport().gui_get_focus_owner()
	if focused != null and stage.is_ancestor_of(focused):
		focused.release_focus()


func _layout() -> void:
	if stage.size.x < 2.0 or stage.size.y < 2.0:
		return
	var phone_scale := clampf(minf((stage.size.y - 28.0) / PHONE_SIZE.y, (stage.size.x - 28.0) / PHONE_SIZE.x), 0.1, 1.0)
	phone.scale = Vector2.ONE * phone_scale
	phone.position = (stage.size - PHONE_SIZE * phone_scale - Vector2(24, 28)).max(Vector2.ZERO)
	var sheet_scale := clampf(minf((stage.size.y - 32.0) / maxf(1.0, sheet.size.y), (stage.size.x - 32.0) / RECEIPT_WIDTH), 0.1, 1.0)
	sheet.scale = Vector2.ONE * sheet_scale
	sheet.position = ((stage.size - sheet.size * sheet_scale) * 0.5).round()


func _input(event: InputEvent) -> void:
	if not active() or returning_from_spending:
		return
	if page == Page.INVOICE:
		if get_tree().paused:
			return
		if event is InputEventJoypadButton or event is InputEventJoypadMotion:
			if not pad:
				pad = true
				_set_drive_hint()
		elif event is InputEventKey and event.pressed and pad:
			pad = false
			_set_drive_hint()
		if event.is_action_released(&"accelerate") and not Input.is_action_pressed(&"accelerate"):
			gas_armed = true
		if (gas_armed and event.is_action_pressed(&"accelerate")) or event.is_action_pressed(&"ui_accept"):
			get_viewport().set_input_as_handled()
			accept_invoice()
		return
	var tap: bool = (event is InputEventKey and event.pressed and not event.echo) or (event is InputEventJoypadButton and event.pressed) or (event is InputEventMouseButton and event.pressed)
	if not tap:
		return
	if printing:
		get_viewport().set_input_as_handled()
		_finish_print(true)
	elif Time.get_ticks_msec() < input_after:
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed(&"ui_cancel") or (event is InputEventJoypadButton and event.button_index == JOY_BUTTON_B):
		get_viewport().set_input_as_handled()
		_leave_receipt(false)
	elif (event is InputEventKey and event.physical_keycode == KEY_Y) or (event is InputEventJoypadButton and event.button_index == JOY_BUTTON_Y):
		if garage_button.visible:
			get_viewport().set_input_as_handled()
			_spending(garage_requested)
	elif (event is InputEventKey and event.physical_keycode == KEY_X) or (event is InputEventJoypadButton and event.button_index == JOY_BUTTON_X):
		if bet_button.visible:
			get_viewport().set_input_as_handled()
			_spending(bet_requested)


func _set_drive_hint() -> void:
	var key := "RT" if pad else "W"
	accept_btn.text = "%s    %s" % [key, tr("поехать — принять заказ")]


func _build_phone(region: Dictionary) -> void:
	stage.add_child(phone)
	phone.size = PHONE_SIZE
	var shell := _style(Color("#101213"), Color("#adb1b4"), 3, 38)
	shell.shadow_color = Color(0, 0, 0, 0.48)
	shell.shadow_size = 10
	phone.add_theme_stylebox_override("panel", shell)
	_box(phone, Rect2(120,29,88,7), Color("#292c2d"), Color.BLACK, 1, 4)
	_box(phone, Rect2(81,28,9,9), Color("#252d3a"), Color("#07090c"), 1, 5)
	_box(phone, Rect2(144,597,42,42), Color("#111315"), Color("#47494b"), 2, 21)
	_box(phone, Rect2(156,609,18,18), Color("#111315"), Color("#65696d"), 1, 4)
	var screen := _box(phone, Rect2(15,72,300,510), PAPER, Color("#343330"), 2, 5)
	var status := _box(screen, Rect2(2,2,296,19), Color("#313331"), Color.TRANSPARENT)
	health_label = _text_at(status, Rect2(7,0,90,19), 12, Color.WHITE)
	clock_label = _text_at(status, Rect2(101,0,94,19), 12, Color.WHITE)
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	balance_label = _text_at(status, Rect2(195,0,94,19), 12, Color.WHITE)
	balance_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var header := _box(screen, Rect2(2,21,296,58), Color("#79513a"), Color("#60402e"), 1)
	_text_at(header, Rect2(14,4,264,20), 13, Color("#fff3df")).text = tr("Птица Пицца")
	invoice_title = _text_at(header, Rect2(14,22,265,32), 20, Color.WHITE, true)
	var face := _box(screen, Rect2(14,94,49,49), Color("#edccaa"), Color("#9e7c58"), 1, 7)
	face.clip_contents = true
	initials = _text_at(face, Rect2(0,0,49,49), 26, MUTED, true)
	initials.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	face.add_child(portrait)
	portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_text_at(screen, Rect2(76,92,207,22), 13, MUTED).text = tr("получатель")
	person_name = _text_at(screen, Rect2(76,112,208,37), 18, INK, true)
	var route_frame := _box(screen, Rect2(14,155,272,104), Color("#f0ead8"), Color("#bf9567"), 1, 4)
	route_frame.add_child(preview)
	preview.position = Vector2(2, 2)
	preview.size = Vector2(268, 100)
	preview.setup(region)
	address_value = _invoice_row(screen, 267, 65, tr("адрес"), INK)
	former_address = RichTextLabel.new()
	former_address.position = Vector2(97,272)
	former_address.size = Vector2(188,22)
	former_address.scroll_active = false
	former_address.mouse_filter = Control.MOUSE_FILTER_IGNORE
	former_address.add_theme_font_size_override("normal_font_size",12)
	former_address.add_theme_color_override("default_color",MUTED)
	screen.add_child(former_address)
	items_value = _invoice_row(screen, 333, 50, tr("заказ"), INK)
	fee_value = _invoice_row(screen, 384, 53, tr("оплата"), GREEN)
	special_value = _text_at(screen,Rect2(15,411,270,28),12,MUTED)
	special_value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	special_value.hide()
	accept_btn = _button(screen, "", Color("#ecdbc1"), INK)
	accept_btn.position = Vector2(2, 442)
	accept_btn.size = Vector2(296, 65)
	accept_btn.pressed.connect(accept_invoice)


func _invoice_row(parent: Control, y: int, height: int, key: String, tint: Color) -> Label:
	var divider := ColorRect.new()
	parent.add_child(divider)
	divider.color = Color("#d7c6af")
	divider.position = Vector2(15, y)
	divider.size = Vector2(270, 1)
	divider.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_text_at(parent, Rect2(15,y+1,75,height-1), 14, MUTED).text = key
	var value := _text_at(parent, Rect2(97,y+1,188,height-1), 17, tint, tint == GREEN)
	value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return value


func _build_receipt() -> void:
	stage.add_child(sheet)
	sheet.custom_minimum_size.x = RECEIPT_WIDTH
	var paper := _style(PAPER, Color("#92775a"), 1, 3)
	paper.shadow_color = Color(0, 0, 0, 0.38)
	paper.shadow_size = 8
	paper.content_margin_left = 32
	paper.content_margin_right = 32
	paper.content_margin_top = 24
	paper.content_margin_bottom = 22
	sheet.add_theme_stylebox_override("panel", paper)
	sheet.resized.connect(_layout)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	sheet.add_child(column)
	receipt_head = _label(column, 22, INK, true)
	reason_label = _label(column, 16, MUTED)
	reason_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(HSeparator.new())
	_label(column, 16, MUTED).text = tr("Всего в копилке")
	wallet_value = _label(column, 35, GREEN, true)
	column.add_child(HSeparator.new())
	rows.add_theme_constant_override("separation", 6)
	column.add_child(rows)
	score_note = _label(column,13,MUTED)
	score_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	score_note.hide()
	column.add_child(HSeparator.new())
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom.add_theme_constant_override("separation", 12)
	column.add_child(bottom)
	var again := _button(bottom, tr("На новую смену"), Color("#865237"), Color.WHITE)
	garage_button = _button(bottom,tr("гараж"),Color("#ecdbc1"),INK)
	bet_button = _button(bottom,tr("депнуть"),Color("#f0d0b5"),INK)
	back_button = _button(bottom,tr("в меню"),Color("#ecdbc1"),INK)
	again.pressed.connect(_leave_receipt.bind(true))
	garage_button.pressed.connect(_spending.bind(garage_requested))
	bet_button.pressed.connect(_spending.bind(bet_requested))
	back_button.pressed.connect(_leave_receipt.bind(false))
	receipt_buttons = [again,garage_button,bet_button,back_button]


func _spending(request: Signal) -> void:
	if page == Page.RECEIPT and not printing and not returning_from_spending and Time.get_ticks_msec() >= input_after:
		returning_from_spending = true
		release_focus()
		request.emit()


func _receipt_row(key: String, value: String, tint: Color, font_size := 17) -> void:
	var line := HBoxContainer.new()
	rows.add_child(line)
	var name_label := _label(line, font_size, INK)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.text = key
	_label(line, font_size, tint, true).text = value


func _print_receipt() -> void:
	printing = true
	for button in receipt_buttons:
		button.disabled = true
	bottom.modulate.a = 0.0
	print_tween = create_tween()
	print_tween.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	print_tween.tween_interval(0.30)
	for line: Control in rows.get_children():
		line.modulate.a = 0.0
		print_tween.tween_callback(func(): get_tree().call_group(&"game_audio",&"cue","receipt"))
		print_tween.tween_property(line, "modulate:a", 1.0, 0.09)
	print_tween.tween_interval(0.38)
	print_tween.tween_callback(_finish_print.bind(false))


func _finish_print(skipped: bool) -> void:
	if not printing:
		return
	printing = false
	if skipped and print_tween:
		print_tween.kill()
	print_tween = null
	input_after = Time.get_ticks_msec() + (SKIP_GUARD_MS if skipped else 0)
	for line: Control in rows.get_children():
		line.modulate.a = 1.0
	bottom.modulate.a = 1.0
	for button in receipt_buttons:
		button.disabled = false
	receipt_buttons[0].grab_focus()


func _leave_receipt(another_shift: bool) -> void:
	if page != Page.RECEIPT or printing or Time.get_ticks_msec() < input_after:
		return
	consumed_physics_frame = Engine.get_physics_frames()
	dismiss()
	if another_shift:
		next_shift_requested.emit()
	elif main_menu_requested.has_connections():
		main_menu_requested.emit()
	else:
		free_drive_requested.emit()


func _style(fill: Color, edge: Color, width := 0, radius := 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(width)
	style.set_corner_radius_all(radius)
	return style


func _box(parent: Control, bounds: Rect2, fill: Color, edge: Color, width := 0, radius := 0) -> Panel:
	var panel := Panel.new()
	parent.add_child(panel)
	panel.position = bounds.position
	panel.size = bounds.size
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _style(fill, edge, width, radius))
	return panel


func _label(parent: Control, pixels: int, tint: Color, heavy := false) -> Label:
	var label := Label.new()
	parent.add_child(label)
	label.add_theme_font_size_override("font_size", pixels)
	label.add_theme_color_override("font_color", tint)
	if heavy:
		label.add_theme_font_override("font", bold)
	return label


func _text_at(parent: Control, bounds: Rect2, pixels: int, tint: Color, heavy := false) -> Label:
	var label := _label(parent, pixels, tint, heavy)
	label.position = bounds.position
	label.size = bounds.size
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return label


func _button(parent: Control, caption: String, fill: Color, ink: Color) -> Button:
	var button := Button.new()
	parent.add_child(button)
	button.text = caption
	button.custom_minimum_size = Vector2(0, 44)
	button.add_theme_font_override("font", bold)
	button.add_theme_font_size_override("font_size", 17)
	for state_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state_name, ink)
	var normal := _style(fill, Color("#a58868"), 1, 4)
	normal.content_margin_left = 14
	normal.content_margin_right = 14
	button.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = fill.lightened(0.09)
	button.add_theme_stylebox_override("hover", hover)
	return button


func _money(amount: int) -> String:
	var digits := str(absi(amount))
	var i := digits.length() - 3
	while i > 0:
		digits = digits.insert(i, " ")
		i -= 3
	return ("−" if amount < 0 else "") + digits + " ₽"
