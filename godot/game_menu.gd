extends CanvasLayer

signal career_requested
signal free_drive_requested
signal quick_requested(mode: String)
signal resume_requested
signal finish_shift_requested
signal garage_requested
signal records_requested
signal map_requested
signal quit_requested
signal main_menu_requested
signal profile_changed
signal cancel_order_requested

const PREFS := "user://game_settings.cfg"
const ART := "res://assets/game_menu/"
const INK := Color("#41372a")
const FAINT := Color("#786a53")
const PAPER := Color("#fff9e9")
const LINE := Color("#cebea4")
const CODES := ["ru","en","tr","de","es","pt","fr","it","pl","uk","kk","uz","be","ja","zh"]
const LANG_NAMES := ["Русский","English","Türkçe","Deutsch","Español","Português","Français","Italiano","Polski","Українська","Қазақша","Oʻzbekcha","Беларуская","日本語","中文"]
const MODE_NAMES := {"normal":"обычный заезд","hell":"Ад на земле","afterhell":"День после катастрофы"}
const CALENDAR := preload("res://south_calendar.gd")
const WEATHER := {"auto":"как выпадет","clear":"обычная","heat":"жара","rain":"дождь","storm":"гроза","hurricane":"ураган"}
const LENGTHS := {"short":"короткая","medium":"средняя","long":"длинная"}
const DISPLAY_SIZES := [Vector2i(960,540),Vector2i(1280,720),Vector2i(1280,800),Vector2i(1600,900),Vector2i(1680,1050),Vector2i(1920,1080),Vector2i(1920,1200),Vector2i(2560,1440),Vector2i(2560,1600),Vector2i.ZERO]
const DEFAULT_RENDER_SIZE := 6 # 1920 × 1200, with a 1:1 limit in smaller windows.
const RANGES := [250,370,490]
const TABS := ["игра","графика","звук","управление","язык"]

var prefs := ConfigFile.new()
var backdrop := TextureRect.new()
var layout := VBoxContainer.new()
var stage := CenterContainer.new()
var dock := HBoxContainer.new()
var bar_context := Label.new()
var hint := Label.new()
var mode_ids := PackedStringArray()
var quick := {"mode":"normal", "weather":"auto", "len":"medium"}
var selected_locale := ""
var completed_shifts := 0
var summary := {}
var invoice := {}
var current_page := ""
var pause_menu := false
var previous_pause := false
var consumed_physics_frame := -2
var tab_index := 0
var map_overlay: CanvasLayer
var focus_default: Control
var owns_focus_after_map := false
var pad_active := false
var stick_direction := Vector2i.ZERO
var tab_buttons: Array[Button] = []
var textures: Dictionary[String, Texture2D] = {}
var shift_location: Dictionary = {}
var steam_platform: Node
var profile_tool: Node
var achievement_board: CanvasLayer
var game_audio: Node
var music_row := HBoxContainer.new()
var music_name := Button.new()
var music_toggle := Button.new()
var _configured := false
var driving_camera: Camera3D
var sunlight: DirectionalLight3D

func setup() -> void:
	if _configured:
		return
	_configured = true
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 6
	hide()
	for key: String in ["aurora","pizza-game","quick","map","settings","controls","end","resume","depot-map","honor","garage-game"]:
		var path := ART + key + ".webp"
		if ResourceLoader.exists(path) and FileAccess.file_exists(path + ".import"):
			textures[key] = load(path)
		else:
			textures[key] = ImageTexture.create_from_image(Image.load_from_file(path))
	var locales := FileAccess.get_file_as_string(ART + "locales.json")
	var bundle: Variant = JSON.parse_string(locales)
	if bundle is Dictionary:
		for code: String in bundle:
			var catalog := Translation.new()
			catalog.locale = code
			for source: String in bundle[code]:
				catalog.add_message(source, bundle[code][source])
			TranslationServer.add_translation(catalog)
	prefs.load(PREFS)
	selected_locale = str(prefs.get_value("menu","language",""))
	if selected_locale in CODES:
		TranslationServer.set_locale(selected_locale)
	else:
		selected_locale = ""
	var saved: Variant = prefs.get_value("menu","quick",{})
	if saved is Dictionary:
		for key: String in quick:
			if saved.get(key) is String:
				quick[key] = saved[key]
	_apply_saved()
	add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = textures["aurora"]
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	backdrop.add_child(layout)
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation",0)
	var bar := PanelContainer.new()
	bar.add_theme_stylebox_override("panel",_box(Color("#e4e7ea"),Color("#adb4bb"),0,12,3))
	layout.add_child(bar)
	var bar_row := HBoxContainer.new()
	bar_row.add_theme_constant_override("separation",18)
	bar.add_child(bar_row)
	bar_row.add_child(_label("Солнечный",17,INK))
	bar_row.add_child(bar_context)
	bar_context.add_theme_color_override("font_color",FAINT)
	bar_row.add_child(hint)
	hint.add_theme_color_override("font_color",FAINT)
	hint.add_theme_font_size_override("font_size",14)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar_row.add_child(spacer)
	bar_row.add_child(music_row)
	music_row.add_child(music_name)
	music_row.add_child(music_toggle)
	music_name.flat = true
	music_toggle.flat = true
	music_name.focus_mode = Control.FOCUS_NONE
	music_toggle.focus_mode = Control.FOCUS_NONE
	music_name.pressed.connect(func(): if game_audio: game_audio.next_track())
	music_toggle.pressed.connect(func(): if game_audio: game_audio.toggle_music())
	_update_music_strip()
	bar_row.add_child(_label("Женя",15,INK))
	layout.add_child(stage)
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var base := CenterContainer.new()
	layout.add_child(base)
	base.add_child(dock)
	dock.add_theme_constant_override("separation",0)

func bind_steam(platform: Node) -> void:
	steam_platform = platform
	if active() and current_page == "language":
		_show_page("language")

func bind_profile(owner: RefCounted, honors: CanvasLayer, modes: Node) -> void:
	if profile_tool:
		return
	profile_tool = preload("res://profile_transfer.gd").new()
	add_child(profile_tool)
	profile_tool.bind(owner,honors,modes)
	profile_tool.updated.connect(_refresh_profile)
	profile_tool.changed.connect(func():
		completed_shifts = int(owner.data.shifts)
		profile_changed.emit()
	)

func _refresh_profile() -> void:
	if active() and current_page == "profile":
		_show_page("profile")

func bind_achievements(board: CanvasLayer) -> void:
	achievement_board = board
	board.closed.connect(func():
		if active(): _show_page(current_page)
	)
	if active(): _show_page(current_page)

func bind_audio(player: Node) -> void:
	game_audio = player
	if not player.track_changed.is_connected(_track_changed):
		player.track_changed.connect(_track_changed)
	_update_music_strip()

func _track_changed(_title: String) -> void:
	_update_music_strip()

func _update_music_strip() -> void:
	music_row.visible = is_instance_valid(game_audio) and current_page != "language"
	if music_row.visible:
		music_name.text = "♫  " + game_audio.title() + "  ▸"
		music_toggle.text = tr("вкл" if game_audio.music_off else "выкл")

func _click() -> void:
	if game_audio:
		game_audio.cue("ui-click")

func bind_graphics(camera: Camera3D, sun: DirectionalLight3D) -> void:
	driving_camera = camera
	sunlight = sun
	for key: String in ["range","shadow"]:
		if prefs.has_section_key("graphics",key):
			_apply_graphic(key,prefs.get_value("graphics",key))

func set_available_modes(ids: PackedStringArray) -> void:
	mode_ids.clear()
	for id: String in MODE_NAMES:
		if id in ids:
			mode_ids.append(id)
	if active() and current_page in ["start","quick"]:
		_show_page("start")

## Optional live location for the two original pizzeria camera angles.
## building and driveway are global positions, on_shift and roster are real crew counts.
func set_shift_location(building: Vector3, driveway: Vector3, on_shift := -1, roster := -1) -> void:
	shift_location = {"building":building,"driveway":driveway,"on_shift":on_shift,"roster":roster}

func bind_map(overlay: CanvasLayer) -> void:
	map_overlay = overlay
	if is_instance_valid(overlay) and not overlay.visibility_changed.is_connected(_map_visibility):
		overlay.visibility_changed.connect(_map_visibility)

func _map_visibility() -> void:
	if owns_focus_after_map and active() and not map_overlay.visible:
		owns_focus_after_map = false
		if is_instance_valid(focus_default):
			_restore_default_focus.call_deferred()

func open_start(_has_career := false, finished_shifts := 0, _hell_completed := false) -> void:
	setup()
	completed_shifts = finished_shifts
	summary.clear()
	invoice.clear()
	pause_menu = false
	_open("language" if selected_locale.is_empty() else "start")

func open_quick(finished_shifts := -1) -> void:
	if finished_shifts >= 0:
		completed_shifts = finished_shifts
	pause_menu = false
	_open("quick")

func open_pause(current_summary: Dictionary = {}, current_invoice: Dictionary = {}) -> void:
	if active():
		return
	setup()
	summary = current_summary.duplicate()
	invoice = current_invoice.duplicate()
	pause_menu = true
	_open("pause")

func active() -> bool:
	return visible and not current_page.is_empty()

func dismiss() -> void:
	if not active():
		return
	consumed_physics_frame = Engine.get_physics_frames()
	current_page = ""
	owns_focus_after_map = false
	hide()
	get_tree().paused = previous_pause
	_clear(stage)
	_clear(dock)

func _open(page: String) -> void:
	if not active():
		previous_pause = get_tree().paused
	get_tree().paused = true
	show()
	_show_page(page)

func _show_page(page: String) -> void:
	current_page = page
	_update_music_strip()
	_clear(stage)
	_clear(dock)
	focus_default = null
	tab_buttons.clear()
	bar_context.text = tr("пауза") if pause_menu else tr("главное меню")
	_update_hint()
	match page:
		"language": _language_page()
		"start": _start_dock()
		"district": _district_page()
		"pause": _pause_page()
		"quick": _quick_page()
		"settings": _settings_page()
		"credits": _credits_page()
		"profile": _profile_page()
	if is_instance_valid(focus_default):
		_restore_default_focus.call_deferred()

func _restore_default_focus() -> void:
	if active() and is_instance_valid(focus_default) and focus_default.is_inside_tree() and focus_default.is_visible_in_tree():
		focus_default.grab_focus()


func _clear(container: Container) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()

func _update_hint() -> void:
	var ok := "A" if pad_active else "Enter"
	var back_key := "B" if pad_active else "Esc"
	hint.text = ok + "  " + tr("выбрать")
	if not current_page in ["start","language"]:
		hint.text += "      " + back_key + "  " + tr("назад")

func _language_page() -> void:
	var card := _sheet(stage,"Язык · Language",570)
	_language_buttons(card)

func _language_buttons(card: Container) -> void:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation",8)
	grid.add_theme_constant_override("v_separation",7)
	card.add_child(grid)
	var guess := selected_locale if not selected_locale.is_empty() else OS.get_locale_language()
	if selected_locale.is_empty() and steam_platform and not steam_platform.suggested_locale().is_empty():
		guess = steam_platform.suggested_locale()
	if not guess in CODES:
		guess = "en"
	for i in CODES.size():
		var item := _button(grid,LANG_NAMES[i],_select_locale.bind(CODES[i]))
		item.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		item.custom_minimum_size = Vector2(173,40)
		if CODES[i] == guess:
			focus_default = item

func _select_locale(code: String) -> void:
	selected_locale = code
	TranslationServer.set_locale(code)
	_save("menu","language",code)
	_show_page("settings" if current_page == "settings" else "start")

func _start_dock() -> void:
	focus_default = _tile("на смену","pizza-game",_show_page.bind("district"))
	if not _available_quick().is_empty():
		_tile("быстрый заезд","quick",_show_page.bind("quick"))
	if garage_requested.has_connections():
		_tile("гараж","garage-game",_leave.bind(garage_requested))
	_tile("покататься","map",_leave.bind(free_drive_requested))
	if achievement_board:
		_tile("доска почёта","honor",achievement_board.show_board)
	if records_requested.has_connections():
		_tile("таблица рекордов","honor",_leave.bind(records_requested))
	_tile("настройки","settings",_settings.bind(0))
	_tile("выйти","end",_leave.bind(quit_requested))

func _district_page() -> void:
	var card := _sheet(stage,"Птица Пицца",650)
	card.add_child(_label("Текущий район",15,FAINT))
	card.add_child(_label("Юг",32,INK))
	card.add_child(_label("Победы, 1Б",18,INK))
	var gallery := HBoxContainer.new()
	gallery.add_theme_constant_override("separation",8)
	card.add_child(gallery)
	var printed_map := TextureRect.new()
	printed_map.texture = textures["depot-map"]
	printed_map.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	printed_map.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	printed_map.custom_minimum_size = Vector2(180,115)
	printed_map.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gallery.add_child(printed_map)
	if not shift_location.is_empty():
		_district_photo(gallery,false)
		_district_photo(gallery,true)
	_field(card,"управляющая",tr("Ирина Сергеевна"))
	if int(shift_location.get("on_shift",-1)) >= 0:
		_field(card,"Курьеров на смене",str(shift_location.on_shift))
	if int(shift_location.get("roster",-1)) >= 0:
		_field(card,"Коллег в команде",str(shift_location.roster))
	focus_default = _button(card,"Начать смену",_leave.bind(career_requested),true)
	_button(card,"назад",_back)

func _district_photo(row: Container, roof: bool) -> void:
	var world := get_viewport().world_3d
	if not world:
		return
	var print_frame := SubViewportContainer.new()
	print_frame.custom_minimum_size = Vector2(180,115)
	print_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	print_frame.stretch = true
	print_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(print_frame)
	var picture := SubViewport.new()
	picture.size = Vector2i(180,115)
	picture.world_3d = world
	picture.audio_listener_enable_3d = false
	picture.gui_disable_input = true
	print_frame.add_child(picture)
	var camera := Camera3D.new()
	picture.add_child(camera)
	var building: Vector3 = shift_location.building
	var drive: Vector3 = shift_location.driveway
	var angle := atan2(drive.x-building.x,drive.z-building.z) + (0.8 if roof else -0.3)
	var distance := 74.0 if roof else 34.0
	camera.position = building + Vector3(sin(angle)*distance,45 if roof else 9,cos(angle)*distance)
	camera.look_at(building + Vector3.UP*5.0)
	camera.fov = 43
	camera.far = 600
	camera.current = true
	picture.render_target_update_mode = SubViewport.UPDATE_ONCE

func _pause_page() -> void:
	var sheets := HBoxContainer.new()
	sheets.add_theme_constant_override("separation",18)
	stage.add_child(sheets)
	var free := bool(summary.get("free_drive",false))
	var stats := _sheet(sheets,"покататься" if free else "за смену",310)
	if summary.has("shift_number") and not free:
		_field(stats,"Смена",str(summary.shift_number))
	if summary.has("clock"):
		_field(stats,"время смены",str(summary.clock))
	if not free:
		for entry: Array in [["delivered","Доставлено",false],["earned","Заработано",true]]:
			if summary.has(entry[0]):
				_field(stats,entry[1],_cash(summary[entry[0]]) if entry[2] else str(summary[entry[0]]))
	if summary.has("balance"):
		_field(stats,"в копилке",_cash(summary.balance))
	if not free:
		var order := _sheet(sheets,"накладная",350)
		if invoice.is_empty():
			order.add_child(_label("—",16,FAINT))
		else:
			for field: Array in [["recipient","клиент"],["address","адрес"],["items","заказ"],["fee","Выплата"]]:
				if not invoice.has(field[0]):
					continue
				var value: Variant = invoice[field[0]]
				order.add_child(_label(field[1],14,FAINT))
				var content := _cash(value) if field[0] == "fee" else _display_value(value)
				order.add_child(_wrapped(content,18))
			if bool(invoice.get("can_cancel",false)) and cancel_order_requested.has_connections():
				_button(order,"Отменить заказ",_leave.bind(cancel_order_requested))
	focus_default = _tile("продолжить","resume",_leave.bind(resume_requested))
	if map_requested.has_connections():
		_tile("карта","map",_open_map)
	_tile("управление","controls",_settings.bind(3))
	_tile("настройки","settings",_settings.bind(0))
	if free:
		if main_menu_requested.has_connections():
			_tile("в главное меню","end",_leave.bind(main_menu_requested))
	else:
		_tile("закончить смену","end",_leave.bind(finish_shift_requested))

func _open_map() -> void:
	owns_focus_after_map = true
	map_requested.emit()

func quick_options() -> Dictionary:
	var options := quick.duplicate()
	if options.mode != "normal":
		options.merge({"weather":"clear","len":"short"},true)
	return options

func _available_quick() -> PackedStringArray:
	var ids := mode_ids.duplicate()
	if completed_shifts < 1:
		ids.erase("normal")
	return ids

func _quick_page() -> void:
	var available := _available_quick()
	if available.is_empty():
		_show_page("start")
		return
	if not quick.mode in available:
		quick.mode = available[0]
	var card := _sheet(stage,"путевой лист",550)
	_quick_field(card,"режим заезда","mode",available,MODE_NAMES)
	if quick.mode == "normal":
		if not LENGTHS.has(quick.len):
			quick.len = "medium"
		var weather := PackedStringArray(["auto"])
		weather.append_array(PackedStringArray(CALENDAR.PROBABILITY.summer.keys()))
		if not quick.weather in weather:
			quick.weather = "auto"
		_quick_field(card,"погода","weather",weather,WEATHER)
		_quick_field(card,"длина","len",LENGTHS.keys(),LENGTHS)
	else:
		_field(card,"район",tr("Юг"))
		_field(card,"длина",tr("короткая"))
	focus_default = _button(card,"поехали",_launch_quick,true)
	_button(card,"назад",_back)

func _quick_field(card: Container, title: String, key: String, ids: PackedStringArray, names: Dictionary) -> void:
	var labels := PackedStringArray()
	for id: String in ids:
		labels.append(names[id])
	_option(card,title,labels,ids.find(quick[key]),func(i: int):
		quick[key] = ids[i]
		if key == "mode":
			_show_page("quick")
	)

func _launch_quick() -> void:
	_save("menu","quick",quick)
	var id: String = quick.mode
	dismiss()
	quick_requested.emit(id)

func _settings(wanted: int) -> void:
	tab_index = wanted
	_show_page("settings")

func _settings_page() -> void:
	var card := _sheet(stage,"анкета сотрудника",720)
	var tabs := HBoxContainer.new()
	card.add_child(tabs)
	for i in TABS.size():
		var item := _button(tabs,TABS[i],_settings.bind(i),tab_index == i)
		tab_buttons.append(item)
		if i == tab_index:
			focus_default = item
	match tab_index:
		0:
			_field(card,"курьер",tr("Женя"))
			_field(card,"район",tr("Юг"))
			if profile_tool and not pause_menu:
				_button(card,"сохранение карьеры",_show_page.bind("profile"))
			_button(card,"авторы и лицензии",_show_page.bind("credits"))
		1: _graphics(card)
		2: _sound(card)
		3: _controls(card)
		4:
			if pause_menu:
				_field(card,"язык",LANG_NAMES[maxi(0,CODES.find(selected_locale))])
				card.add_child(_wrapped(tr("меняется в главном меню"),16))
			else:
				_language_buttons(card)
	_button(card,"готово",_back)

func _graphics(card: Container) -> void:
	var caps := [30,40,60,0]
	var display_labels := PackedStringArray()
	for pixels: Vector2i in DISPLAY_SIZES:
		display_labels.append("%d × %d" % [pixels.x,pixels.y] if pixels != Vector2i.ZERO else "как у экрана")
	var resolution := int(prefs.get_value("graphics","resolution",DEFAULT_RENDER_SIZE))
	var aa := 1 if get_viewport().msaa_3d != Viewport.MSAA_DISABLED else 0
	_option(card,"качество",["низкая","средняя","высокая","своя"],int(prefs.get_value("graphics","preset",3)),_preset)
	if is_instance_valid(driving_camera):
		var distances := PackedStringArray(["250 м","370 м","490 м"])
		var active_distance := RANGES.find(roundi(driving_camera.far))
		if active_distance < 0:
			active_distance = distances.size()
			distances.append("%d м" % roundi(driving_camera.far))
		_option(card,"дальность",distances,active_distance,func(i: int):
			if i < RANGES.size():
				_set_graphic("range",RANGES[i])
		)
	_option(card,"кадров в секунду",["30","40","60","без ограничения"],caps.find(Engine.max_fps),
		func(i: int): _set_graphic("fps",caps[i]))
	_option(card,"разрешение отрисовки",display_labels,resolution,func(i: int): _set_graphic("resolution",i))
	_option(card,"сглаживание",["выкл","вкл"],aa,func(i: int): _set_graphic("aa",i == 1))

	if is_instance_valid(sunlight):
		_option(card,"тени",["выкл","вкл"],int(sunlight.shadow_enabled),func(i: int): _set_graphic("shadow",i == 1))

func _preset(index: int) -> void:
	if index < 3:
		var values := {"fps":[30,0,0][index],"resolution":[1,3,5][index],"aa":index > 0,"shadow":index == 2,"range":RANGES[index]}
		for key: String in values:
			prefs.set_value("graphics",key,values[key])
			_apply_graphic(key,values[key])
	_save("graphics","preset",index)
	_show_page("settings")

func _apply_saved() -> void:
	for key: String in ["fps","resolution","aa","range","shadow"]:
		if prefs.has_section_key("graphics",key):
			_apply_graphic(key,prefs.get_value("graphics",key))
	_apply_resolution()
	if not get_viewport().size_changed.is_connected(_apply_resolution):
		get_viewport().size_changed.connect(_apply_resolution)

func _set_graphic(key: String, value: Variant) -> void:
	prefs.set_value("graphics","preset",3)
	_save("graphics",key,value)
	_apply_graphic(key,value)
	_show_page("settings")

func _apply_graphic(key: String, value: Variant) -> void:
	match key:
		"fps": Engine.max_fps = int(value) if int(value) in [30,40,60] else 0
		"resolution": _apply_resolution()
		"range":
			if is_instance_valid(driving_camera):
				driving_camera.far = float(value)
		"shadow":
			if is_instance_valid(sunlight):
				sunlight.shadow_enabled = bool(value)
		"aa": get_viewport().msaa_3d = Viewport.MSAA_2X if value else Viewport.MSAA_DISABLED

func _apply_resolution() -> void:
	var index := clampi(int(prefs.get_value("graphics","resolution",DEFAULT_RENDER_SIZE)),0,DISPLAY_SIZES.size()-1)
	var target: Vector2i = DISPLAY_SIZES[index]
	var window_size := get_window().size
	if target == Vector2i.ZERO or window_size.x <= 0 or window_size.y <= 0:
		get_viewport().scaling_3d_scale = 1.0
	else:
		get_viewport().scaling_3d_scale = clampf(minf(float(target.x)/window_size.x,float(target.y)/window_size.y),0.25,1.0)

func _sound(card: Container) -> void:
	if not game_audio:
		return
	_option(card,"звук",["выкл","вкл"],int(not game_audio.muted),func(i: int): game_audio.set_muted(i == 0))
	for key: String in ["Music","Effects","Motor"]:
		_sound_slider(card,key,{"Music":"музыка","Effects":"звуки","Motor":"мотор"}[key])
	_button(card,"следующий трек",game_audio.next_track)
	_button(card,"музыка вкл" if game_audio.music_off else "музыка выкл",func():
		game_audio.toggle_music()
		_settings(2)
	)

func _sound_slider(card: Container, key: String, title: String) -> void:
	var row := HBoxContainer.new()
	card.add_child(row)
	var label := _label(title,16,INK)
	label.custom_minimum_size.x = 120
	row.add_child(label)
	var slider := HSlider.new()
	slider.max_value = 100
	slider.step = 1
	slider.value = float(game_audio.levels[key])
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(slider)
	var percent := _label("%d %%" % roundi(slider.value),15,INK)
	percent.custom_minimum_size.x = 58
	row.add_child(percent)
	slider.value_changed.connect(func(v: float):
		game_audio.set_level(key,v)
		percent.text = "%d %%" % roundi(v)
	)
	if key != "Music":
		slider.drag_ended.connect(func(changed: bool):
			if changed: game_audio.cue("engine-crank" if key == "Motor" else "coin")
		)

func _controls(card: Container) -> void:
	for line: Array in [["газ","W / ↑","RT"],["тормоз","S / ↓","LT"],["руль","A D / ← →","L"],["ручник","Space","B"],["нитро","Shift / N","RB"],["карта","Tab","Y"],["пауза","Esc / P","Menu"]]:
		_field(card,line[0],line[1]+"     ·     "+line[2])

func _profile_page() -> void:
	var card := _sheet(stage,"сохранение карьеры",690)
	var owner: RefCounted = profile_tool.profile
	_field(card,"Юг",tr("Смена")+" "+str(int(owner.data.shifts)+1)+"    "+_cash(owner.data.wallet))
	_field(card,"Номер сохранения",str(owner.data.save_id))
	if owner.recovery == "backup":
		card.add_child(_wrapped(tr("Основной файл повреждён. Загружена предыдущая исправная запись."),16))
	elif owner.recovery == "damaged":
		card.add_child(_wrapped(tr("Основной и резервный файлы повреждены. Выберите исправную копию или начните заново."),16))
	if not profile_tool.status.is_empty():
		card.add_child(_wrapped(tr(profile_tool.status),16))
	if profile_tool.busy():
		return
	if owner.data.has("pending_transfer"):
		focus_default = _button(card,"завершить перенос",profile_tool.apply,true)
	elif profile_tool.action == "":
		focus_default = _button(card,"Выбрать копию папки Steam",profile_tool.choose.bind(true))
		_button(card,"Выбрать копию JSON",profile_tool.choose.bind(false))
		if owner.has_reserve():
			_button(card,"Вернуть сохранение до последнего изменения",profile_tool.ask.bind("restore"))
		if owner.recovery == "backup":
			_button(card,"Восстановить основной файл",profile_tool.ask.bind("repair"))
		_button(card,"Сбросить карьеру",profile_tool.ask.bind("reset"))
	else:
		match profile_tool.action:
			"import":
				var source: Dictionary = profile_tool.preview.career
				_field(card,"Копия Steam",tr("Смена")+" "+str(int(source.shifts)+1)+"    "+_cash(source.wallet))
				_field(card,"Семёрка",tr("броня")+" "+str(int(source.semerka.armor))+"    "+tr("мотор")+" "+str(int(source.semerka.engine)))
				_field(card,"достижения",str(profile_tool.preview.awards.got.size()))
				card.add_child(_wrapped(tr("Заменить текущую карьеру этой копией? Предыдущее сохранение можно вернуть."),16))
			"reset":
				card.add_child(_wrapped(tr("Начать карьеру с первой смены и нулевой копилкой? Достижения и настройки сохранятся."),16))
			"restore":
				card.add_child(_wrapped(tr("Вернуть карьеру и рекорд быстрого заезда из предыдущей копии?"),16))
			"repair":
				card.add_child(_wrapped(tr("Восстановить основной файл из исправной записи? Повреждённый файл будет сохранён отдельно."),16))
		focus_default = _button(card,"Отмена",profile_tool.cancel,true)
		_button(card,"Подтвердить",profile_tool.apply)
	_button(card,"назад",_back)

func _credits_page() -> void:
	var card := _sheet(stage,"авторы и лицензии",680)
	card.add_child(_wrapped(FileAccess.get_file_as_string("res://assets/CREDITS.txt").strip_edges(),16))
	focus_default = _button(card,"назад",_back)

func _save(section: String, key: String, value: Variant) -> void:
	prefs.set_value(section,key,value)
	var error := prefs.save(PREFS)
	if error != OK:
		push_warning("Menu settings: " + error_string(error))

func _input(event: InputEvent) -> void:
	if not active() or (profile_tool and profile_tool.dialog) or (achievement_board and achievement_board.active()) or (is_instance_valid(map_overlay) and map_overlay.visible):
		return
	var pad := event is InputEventJoypadButton or event is InputEventJoypadMotion
	if pad != pad_active and (pad or event is InputEventKey or event is InputEventMouseButton):
		pad_active = pad
		_update_hint()
	if event is InputEventJoypadMotion:
		_handle_stick(event)
		return
	var back: bool = event.is_action_pressed(&"ui_cancel") or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B)
	var pause_key: bool = (event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_P) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_START)
	if back or (pause_key and pause_menu):
		get_viewport().set_input_as_handled()
		_back()
		return
	if current_page == "settings" and event is InputEventJoypadButton and event.pressed and event.button_index in [JOY_BUTTON_LEFT_SHOULDER,JOY_BUTTON_RIGHT_SHOULDER]:
		get_viewport().set_input_as_handled()
		_settings(posmod(tab_index + (-1 if event.button_index == JOY_BUTTON_LEFT_SHOULDER else 1),TABS.size()))

func _handle_stick(event: InputEventJoypadMotion) -> void:
	if event.axis not in [JOY_AXIS_LEFT_X,JOY_AXIS_LEFT_Y]:
		return
	var horizontal := event.axis == JOY_AXIS_LEFT_X
	var old := stick_direction.x if horizontal else stick_direction.y
	var next := old
	if absf(event.axis_value) < 0.32:
		next = 0
	elif absf(event.axis_value) > 0.62:
		next = signi(roundi(event.axis_value))
	if horizontal:
		stick_direction.x = next
	else:
		stick_direction.y = next
	if old == next or next == 0:
		return
	var focus := get_viewport().gui_get_focus_owner()
	if not is_instance_valid(focus):
		return
	if focus is Slider and horizontal:
		focus.value += focus.step * next
	else:
		var side := (SIDE_LEFT if next < 0 else SIDE_RIGHT) if horizontal else (SIDE_TOP if next < 0 else SIDE_BOTTOM)
		var neighbor := focus.find_valid_focus_neighbor(side)
		if neighbor:
			neighbor.grab_focus()
	get_viewport().set_input_as_handled()

func _back() -> void:
	match current_page:
		"pause": _leave(resume_requested)
		"district","quick": _show_page("start")
		"settings": _show_page("pause" if pause_menu else "start")
		"credits": _settings(0)
		"profile":
			if profile_tool.dialog:
				profile_tool.dialog.hide()
				profile_tool._close_picker()
			elif not profile_tool.action.is_empty():
				profile_tool.cancel()
			else:
				_settings(0)

func _leave(request: Signal) -> void:
	dismiss()
	request.emit()

func _display_value(value: Variant) -> String:
	if value is Array or value is PackedStringArray:
		return ", ".join(value)
	return str(value)

func _cash(value: Variant) -> String:
	return "%d ₽" % int(value)

func _tile(title: String, art: String, action: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(106,126)
	b.add_theme_stylebox_override("normal",StyleBoxEmpty.new())
	b.add_theme_stylebox_override("hover",_box(Color("#c8d9ed24"),Color.TRANSPARENT,7,2,2))
	b.add_theme_stylebox_override("pressed",_box(Color("#c8d9ed4a"),Color.TRANSPARENT,7,2,2))
	b.add_theme_stylebox_override("focus",_focus_box())
	b.tooltip_text = tr(title)
	dock.add_child(b)
	var plate := ColorRect.new()
	plate.color = Color("#87818ec9")
	b.add_child(plate)
	plate.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	plate.offset_top = -37
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var image := TextureRect.new()
	image.texture = textures[art]
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(image)
	image.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	image.offset_bottom = 92
	var name_label := _label(title,13,Color.WHITE)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	b.add_child(name_label)
	name_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	name_label.offset_top = -36
	name_label.offset_left = 3
	name_label.offset_right = -3
	b.pressed.connect(_click)
	b.pressed.connect(action)
	return b

func _sheet(parent: Container, title: String, width: float) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",_box(PAPER,LINE,7,18,15))
	panel.custom_minimum_size.x = width
	parent.add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation",8)
	panel.add_child(v)
	v.add_child(_label(title,23,Color("#875b37")))
	var rule := ColorRect.new()
	rule.color = LINE
	rule.custom_minimum_size.y = 1
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(rule)
	return v

func _field(parent: Container, caption: String, value: String) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var label := _label(caption,16,FAINT)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	row.add_child(_label(value,17,INK))

func _option(parent: Container, title: String, labels: PackedStringArray, idx: int, change: Callable) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var label := _label(title,17,INK)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var choice := OptionButton.new()
	choice.custom_minimum_size = Vector2(235,36)
	for value in labels:
		choice.add_item(tr(value))
	choice.select(maxi(0,idx))
	row.add_child(choice)
	choice.item_selected.connect(change)

func _button(parent: Container, title: String, cb: Callable, emphasis := false) -> Button:
	var button := Button.new()
	button.text = tr(title)
	button.custom_minimum_size.y = 35
	button.add_theme_constant_override("h_separation",8)
	button.add_theme_stylebox_override("normal",_box(Color("#d3e5ce") if emphasis else Color("#f0e7d5"),LINE,5,10,5))
	button.add_theme_stylebox_override("hover",_box(Color("#ecdbb0"),LINE,5,10,5))
	button.add_theme_stylebox_override("pressed",_box(Color("#d5c595"),LINE,5,10,5))
	button.add_theme_stylebox_override("focus",_focus_box())
	for tone in ["font_color","font_hover_color","font_pressed_color","font_focus_color","font_hover_pressed_color"]:
		button.add_theme_color_override(tone,INK)
	button.add_theme_font_size_override("font_size",16)
	button.pressed.connect(_click)
	button.pressed.connect(cb)
	parent.add_child(button)
	return button

func _label(value: String, pixels: int, color: Color) -> Label:
	var output := Label.new()
	output.text = value
	output.add_theme_font_size_override("font_size",pixels)
	output.add_theme_color_override("font_color",color)
	output.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return output

func _wrapped(value: String, pixels: int) -> Label:
	var output := _label(value,pixels,INK)
	output.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return output

func _box(color: Color, edge: Color, radius: int, h: int, v: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.border_color = edge
	box.set_border_width_all(1)
	box.set_corner_radius_all(radius)
	box.content_margin_left = h
	box.content_margin_right = h
	box.content_margin_top = v
	box.content_margin_bottom = v
	return box

func _focus_box() -> StyleBoxFlat:
	var focus := StyleBoxFlat.new()
	focus.draw_center = false
	focus.border_color = Color("#5098c6")
	focus.set_border_width_all(3)
	focus.set_corner_radius_all(5)
	return focus
