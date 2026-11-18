extends ColorRect

signal closed
const PAPER := Color("#fff1ce")
const INK := Color("#37291e")
const GROUP := {"progress":"прогресс","skill":"мастерство","chaos":"хаос","fun":"смешные"}
const SECRETS := {"CAR_BOOM":"секрет: машине бывает очень, очень плохо","DROWNED":"секрет: Солнечный стоит у воды","ALL_IN":"секрет: крупная ставка"}
var ledger: CanvasLayer
var old_pause := false
var tab := 0
var tabs := HBoxContainer.new()
var title := Label.new()
var grid := GridContainer.new()
var info := Label.new()
var count := Label.new()
var scroll := ScrollContainer.new()
var focused: Button
var focus_guard := -1
var tabs_buttons: Array[Button] = []

func setup(data: CanvasLayer) -> void:
	ledger = data
	hide()
	color = Color("#181521e8")
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",_paper(Color("#a37a4f"),Color("#5f442d"),18))
	center.add_child(panel)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation",8)
	panel.add_child(body)
	body.add_child(title)
	title.add_theme_font_size_override("font_size",25)
	title.add_theme_color_override("font_color",Color.WHITE)
	title.text = tr("доска почёта")
	body.add_child(tabs)
	for i in 2:
		var b := _button(["достижения","личные рекорды"][i])
		b.pressed.connect(_switch.bind(i))
		tabs.add_child(b)
		tabs_buttons.append(b)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tabs.add_child(spacer)
	tabs.add_child(count)
	var back := _button("назад")
	back.pressed.connect(dismiss)
	tabs.add_child(back)
	body.add_child(scroll)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	scroll.add_child(grid)
	grid.columns = 4
	grid.add_theme_constant_override("h_separation",7)
	grid.add_theme_constant_override("v_separation",7)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(info)
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info.custom_minimum_size.y = 56
	info.add_theme_stylebox_override("normal",_paper(PAPER,Color("#d3a66b"),8))
	info.add_theme_color_override("font_color",INK)
	resized.connect(_resize)
	_resize()

func _resize() -> void:
	grid.columns = 4 if size.x >= 1080 else (3 if size.x >= 770 else 2)
	scroll.custom_minimum_size = Vector2(clampf(size.x-100,350,1035),clampf(size.y-235,150,510))

func open() -> void:
	old_pause = get_tree().paused
	get_tree().paused = true
	focus_guard = Time.get_ticks_msec()+180
	show()
	_switch(0)

func dismiss() -> void:
	hide()
	get_tree().paused = old_pause
	closed.emit()

func _switch(index: int) -> void:
	tab = index
	title.text = tr("доска почёта")
	focused = null
	for child in grid.get_children():
		grid.remove_child(child)
		child.queue_free()
	for i in tabs_buttons.size():
		tabs_buttons[i].disabled = i == tab
	var n := 0
	var total := 0
	for def: Dictionary in ledger.definitions:
		if def.get("adult",false) and not ledger.adult:
			continue
		var old: bool = def.id in ledger.HISTORICAL
		var got: bool = ledger.earned.has(def.id)
		if not old:
			total += 1
			n += int(got)
		if tab == 0 and (got or not old):
			_award(def,got,old)
	count.text = "%d / %d  ·  %d %%  " % [n,total,roundi(100.0*n/maxi(1,total))]
	if tab == 1:
		var rows := [["лучшая смена","best","₽"],["быстрый заезд","quick","₽"],["доставлено всего","delivered",""],["смен отработано","shifts",""]]
		rows.append(["сбито всего","knocked",""] if ledger.adult else ["фонарей снесено","lamps",""])
		for row: Array in rows:
			var value := int(ledger.snapshot.get(row[1],0))
			var cap := tr(row[0])
			var details: String = cap + "   " + str(value) + " " + row[2]
			_card(details,details,true)
	scroll.scroll_vertical = 0
	if focused:
		focused.grab_focus.call_deferred()

func _award(def: Dictionary, got: bool, historical: bool) -> void:
	var locked_secret := not got and bool(def.get("hidden",false))
	var name_text := "???" if locked_secret else tr(def.name)
	var progress := mini(int(ledger.counters.get(def.stat,0)),int(def.need))
	var state := "%d / %d" % [progress,def.need]
	if got:
		var d := Time.get_date_dict_from_unix_time(int(ledger.earned[def.id]))
		state = "%02d.%02d.%04d" % [d.day,d.month,d.year]
	var heading := (("✓  " if got else "")+name_text+"\n"+state)
	if not got and locked_secret:
		heading = "???\n"+tr("скрытое достижение")
	var text := tr(SECRETS.get(def.id,"скрытое достижение")) if locked_secret else tr(def.desc)
	var line := name_text+"  ·  "+tr(GROUP[def.group])+"\n"+text
	if historical:
		line += "  ·  "+tr("из прежней версии")
	_card(heading,line,got)

func _card(caption: String, details: String, solid: bool) -> void:
	var b := _button(caption)
	b.text = caption
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.custom_minimum_size = Vector2(0,71)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.add_theme_stylebox_override("normal",_paper(PAPER if solid else Color("#e2cfb4"),Color("#775737"),5))
	grid.add_child(b)
	var explain := func(): info.text = details
	b.focus_entered.connect(explain)
	b.mouse_entered.connect(explain)
	b.pressed.connect(explain)
	if not focused:
		focused = b
		info.text = details

func _button(label: String) -> Button:
	var b := Button.new()
	b.text = tr(label)
	b.custom_minimum_size.y = 37
	b.add_theme_font_size_override("font_size",15)
	for state in ["normal","hover","pressed"]:
		b.add_theme_stylebox_override(state,_paper(PAPER if state == "normal" else Color("#ffdf9a"),Color("#856640"),6))
	for kind in ["font_color","font_focus_color","font_hover_color","font_pressed_color"]:
		b.add_theme_color_override(kind,INK)
	return b

func _paper(fill: Color, edge: Color, margin: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	style.content_margin_left = margin
	style.content_margin_right = margin
	style.content_margin_top = margin*0.6
	style.content_margin_bottom = margin*0.6
	return style

func _input(event: InputEvent) -> void:
	if not visible or not event.is_pressed() or event.is_echo() or Time.get_ticks_msec() < focus_guard:
		return
	if event.is_action_pressed(&"ui_cancel") or (event is InputEventJoypadButton and event.button_index == JOY_BUTTON_B):
		get_viewport().set_input_as_handled()
		dismiss()
	elif event is InputEventJoypadButton and event.button_index in [JOY_BUTTON_LEFT_SHOULDER,JOY_BUTTON_RIGHT_SHOULDER]:
		get_viewport().set_input_as_handled()
		_switch(1-tab)
