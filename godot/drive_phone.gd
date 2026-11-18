extends Control

# Native version of the parked and expanded phone in hudphone.js and hudphone.css.
signal payment_closed
const PHONE := Vector2(330,648)
const INK := Color("#503923")
const PAPER := Color("#f9edd4")
const GOLD := Color("#d6ae70")
const GREEN := Color("#427449")
var body: Panel
var screen: Panel
var header: Label
var health: Label
var time: Label
var money: Label
var name_label: Label
var distance: Label
var destination: Label
var initial: Label
var face: TextureRect
var timer: Label
var dock_target: Button
var shift_btn: Button
var chat_btn: Button
var home_btn: Button
var account: Label
var rank_text: Label
var order_box: Panel
var deadline_style: StyleBoxFlat
var pages: Dictionary = {}
var page := "shift"
var expanded := false
var popup := false
var intro := false
var channel := "crew"
var previous := "shift"
var was_open := false
var history := {"crew":[],"direct":[]}
var conversations: Label
var chat_scroll: ScrollContainer
var roster: Label
var pay_info: Label
var pay_name: Label
var pay_face: TextureRect
var pay_btn: Button
var rank_list: Label
var earned := 0
var crew: Array = []
var text_name := ""
var layout_tween: Tween
var block_input: Callable
var last_clock := ""
var last_left := -2
var last_health := ""
var last_balance := -1
var home_head: Label
var textures := {}

func build() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	body = _panel(self,Rect2(Vector2.ZERO,PHONE),Color("#0c0e10"),Color("#b2babd"),4,42)
	body.pivot_offset = PHONE*.5
	_panel(body,Rect2(5,5,320,638),Color("#101214"),Color("#474a4e"),1,37)
	_panel(body,Rect2(83,34,11,11),Color("#17212e"),Color("#07090c"),2,6)
	_panel(body,Rect2(137,37,56,7),Color("#222529"),Color("#080809"),1,4)
	screen = _panel(body,Rect2(18,69,294,521),PAPER,Color("#32353a"),2,12)
	screen.clip_contents = true
	for id: String in ["shift","chat","home","paid","rank"]:
		var bg := _panel(screen,Rect2(2,21,290,497),PAPER,Color.TRANSPARENT)
		pages[id] = bg
		if id in ["shift","rank","home"]:
			_texture(bg,Rect2(0,0,290,497),"leather")
	var status := _panel(screen,Rect2(2,2,290,20),Color("#34383b"),Color.TRANSPARENT)
	health = _label(status,Rect2(6,0,85,20),11,Color("#ffb8a7"))
	time = _label(status,Rect2(91,0,108,20),12,Color.WHITE)
	time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	money = _label(status,Rect2(195,0,88,20),11,Color("#d7efb7"))
	money.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var top := _panel(screen,Rect2(2,21,290,43),Color("#875b3c"),Color("#69462e"),1)
	_texture(top,Rect2(0,0,290,43),"wood")
	header = _label(top,Rect2(13,0,262,43),20,Color("#fff6df"))
	var courier: Panel = pages.shift
	order_box = _panel(courier,Rect2(8,49,274,80),Color("#ffe3a2"),GOLD,1,8)
	var photo := _panel(order_box,Rect2(8,12,46,49),Color("#eab26d"),Color("#f7edc8"),2,7)
	initial = _label(photo,Rect2(0,0,46,49),21,INK)
	initial.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	face = _portrait(photo,Rect2(2,2,42,45))
	name_label = _label(order_box,Rect2(62,4,196,27),16,INK)
	destination = _label(order_box,Rect2(62,29,198,20),12,INK)
	distance = _label(order_box,Rect2(62,50,108,20),12,Color("#87542b"))
	timer = _label(order_box,Rect2(183,47,80,24),13,Color.WHITE)
	timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	deadline_style = _style(GREEN,GREEN,1,5)
	timer.add_theme_stylebox_override("normal",deadline_style)
	var leaderboard := _panel(courier,Rect2(8,138,274,123),PAPER,GOLD,1,7)
	_label(leaderboard,Rect2(8,1,245,20),11,Color("#87582b")).text = tr("Рейтинг смены").to_upper()
	rank_text = _label(leaderboard,Rect2(9,20,255,96),13,INK)
	rank_text.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	var rank_button := _bare_button(leaderboard,Rect2(0,0,274,123),"",func(): open_page("rank"))
	rank_button.tooltip_text = tr("Рейтинг смены")
	var pay := _panel(courier,Rect2(8,269,274,73),PAPER,GOLD,1,7)
	_label(pay,Rect2(10,4,253,22),12,Color("#886642")).text = tr("Заработано за смену")
	account = _label(pay,Rect2(10,26,253,39),25,GREEN)
	var chat: Panel = pages.chat
	_tab(chat,Rect2(7,49,135,34),"Курьеры",func(): set_channel("crew"))
	_tab(chat,Rect2(147,49,135,34),"Личные",func(): set_channel("direct"))
	var members := _tab(chat,Rect2(7,89,275,31),"Участники",func(): roster.visible = not roster.visible)
	members.alignment = HORIZONTAL_ALIGNMENT_LEFT
	chat_scroll = ScrollContainer.new()
	_at(chat,chat_scroll,Rect2(7,126,275,314))
	chat_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	conversations = _label(chat_scroll,Rect2(0,0,251,0),15,Color("#33462d"))
	conversations.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	conversations.custom_minimum_size.x = 251
	conversations.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	conversations.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	roster = _label(chat,Rect2(8,121,273,120),13,INK)
	roster.add_theme_stylebox_override("normal",_style(Color("#f0f4e7"),Color("#a1b398"),1,5))
	roster.hide()
	var rank: Panel = pages.rank
	rank_list = _label(rank,Rect2(8,51,274,350),16,INK)
	rank_list.add_theme_stylebox_override("normal",_style(PAPER,GOLD,1,6,8))
	rank_list.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	var home: Panel = pages.home
	_tab(home,Rect2(12,72,126,68),"Птица Пицца",func(): open_page("shift"))
	_tab(home,Rect2(150,72,126,68),"Сообщения",func(): open_page("chat"))
	var receipt: Panel = pages.paid
	var green := _panel(receipt,Rect2(0,42,290,74),Color("#568950"),Color("#3c633c"),1)
	home_head = _label(green,Rect2(5,4,280,66),23,Color.WHITE)
	home_head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pay_face = _portrait(receipt,Rect2(12,130,51,54))
	pay_name = _label(receipt,Rect2(71,125,205,62),17,INK)
	pay_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pay_info = _label(receipt,Rect2(18,189,257,238),17,INK)
	pay_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pay_info.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	pay_btn = _tab(receipt,Rect2(8,452,274,37),"Дальше",func(): payment_closed.emit())
	shift_btn = _tab(screen,Rect2(9,472,136,37),"Смена",func(): open_page("shift"))
	chat_btn = _tab(screen,Rect2(149,472,136,37),"Сообщения",func(): open_page("chat"))
	home_btn = _bare_button(body,Rect2(144,596,43,43),"▢",_home)
	home_btn.add_theme_stylebox_override("normal",_style(Color("#111416"),Color("#53595d"),2,22))
	dock_target = _bare_button(body,Rect2(0,0,330,648),"",func(): open_page("shift"))
	for state: String in ["normal","hover","pressed","focus"]:
		dock_target.add_theme_stylebox_override(state,StyleBoxEmpty.new())
	dock_target.tooltip_text = tr("Птица Пицца")
	resized.connect(_layout.bind(false))
	set_account(0)
	set_crew([])
	_show_page()
	_layout(false)

func _at(parent: Control, child: Control, area: Rect2) -> void:
	parent.add_child(child)
	child.position = area.position
	child.size = area.size

func _style(fill: Color, edge: Color, width := 0, radius := 0, margin := 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = fill
	s.border_color = edge
	s.set_border_width_all(width)
	s.set_corner_radius_all(radius)
	for side in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		s.set_content_margin(side,margin)
	return s

func _panel(parent: Control, area: Rect2, fill: Color, edge: Color, width := 0, radius := 0) -> Panel:
	var panel := Panel.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel",_style(fill,edge,width,radius))
	_at(parent,panel,area)
	return panel

func _label(parent: Control, area: Rect2, px: int, color: Color) -> Label:
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.add_theme_font_size_override("font_size",px)
	label.add_theme_color_override("font_color",color)
	_at(parent,label,area)
	return label

func _texture(parent: Control, area: Rect2, key: String) -> void:
	var path := "res://assets/game_menu/phone-"+key+".webp"
	if not textures.has(key):
		textures[key] = ImageTexture.create_from_image(Image.load_from_file(path))
	var pic := _portrait(parent,area)
	pic.texture = textures[key]

func _portrait(parent: Control, area: Rect2) -> TextureRect:
	var pic := TextureRect.new()
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_at(parent,pic,area)
	return pic

func _bare_button(parent: Control, area: Rect2, title: String, cb: Callable) -> Button:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.flat = true
	button.text = title
	button.pressed.connect(cb)
	_at(parent,button,area)
	return button

func _tab(parent: Control, area: Rect2, title: String, cb: Callable) -> Button:
	var b := _bare_button(parent,area,tr(title),cb)
	b.flat = false
	b.set_meta("source_label",title)
	b.add_theme_font_size_override("font_size",14)
	for state: String in ["normal","hover","pressed"]:
		b.add_theme_stylebox_override(state,_style(PAPER if state=="normal" else GOLD,Color("#a68762"),1,5))
		b.add_theme_color_override("font_color" if state=="normal" else "font_"+state+"_color",INK)
	return b

func _layout(animate: bool) -> void:
	if body == null or size.y < 1:
		return
	if layout_tween:
		layout_tween.kill()
	var k := minf(1.0,(size.y-28.0)/PHONE.y)
	var zoom := k if expanded else .85*k
	var center := Vector2(size.x-190.0*k,size.y-355.0*k) if expanded else Vector2(size.x-155*k,size.y+70*k)
	var pos := center-PHONE*.5
	var angle := 0.0 if expanded else deg_to_rad(2)
	if animate:
		layout_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		layout_tween.tween_property(body,"position",pos,.53)
		layout_tween.tween_property(body,"scale",Vector2.ONE*zoom,.53)
		layout_tween.tween_property(body,"rotation",angle,.53)
		layout_tween.tween_property(body,"modulate:a",1.0 if expanded else .76,.53)
	else:
		body.position = pos
		body.scale = Vector2.ONE*zoom
		body.rotation = angle
		body.modulate.a = 1.0 if expanded else .76

func _notification(what: int) -> void:
	if what==NOTIFICATION_TRANSLATION_CHANGED and is_instance_valid(dock_target):
		for b: Button in body.find_children("*","Button",true,false):
			if b.has_meta("source_label"):
				b.text = tr(str(b.get_meta("source_label")))
		_show_page()
		set_channel(channel)

func _show_page() -> void:
	for id: String in pages:
		pages[id].visible = id == page
	header.text = tr({"shift":"Птица Пицца","chat":"Сообщения","home":"Домой","rank":"Рейтинг смены","paid":"Птица Пицца"}[page])
	shift_btn.visible = page not in ["paid","home"]
	chat_btn.visible = shift_btn.visible
	home_btn.visible = page != "paid"
	dock_target.visible = not expanded

func open_page(next: String) -> void:
	if popup or intro or (block_input.is_valid() and block_input.call()):
		return
	_switch(next,true)

func _switch(next: String, full: bool) -> void:
	var move := full != expanded
	page = next
	expanded = full
	_show_page()
	if move:
		_layout(true)

func _home() -> void:
	if page == "home":
		dock()
	else:
		open_page("home")

func dock() -> void:
	if not popup and not intro:
		_switch("shift",false)

func begin_shift() -> void:
	earned = 0
	popup = false
	intro = false
	history = {"crew":[],"direct":[]}
	set_channel("crew")
	set_crew([])
	dock()

func set_order(data: Dictionary) -> void:
	text_name = str(data.get("recipient",data.get("address","")))
	name_label.text = text_name
	destination.text = str(data.get("address",""))
	initial.text = text_name.left(1)
	face.texture = data.get("avatar") as Texture2D
	face.visible = face.texture != null
	initial.visible = not face.visible
	order_box.visible = not text_name.is_empty()

func set_account(total: int) -> void:
	if total != last_balance:
		last_balance = total
		money.text = "%d ₽" % total
	account.text = "%d ₽" % earned

func set_crew(rows: Array) -> void:
	crew = rows
	var lines := PackedStringArray()
	var names := PackedStringArray()
	for i in rows.size():
		var row: Dictionary = rows[i]
		var name_ := str(row.get("name",""))
		lines.append("%d   %s     %d ₽"%[i+1,name_,int(row.get("money",0))])
		names.append(name_)
		if row.get("me",false):
			earned = int(row.get("money",0))
	rank_list.text = "\n\n".join(lines)
	rank_text.text = "\n".join(lines.slice(0,4)) if lines.size()>0 else "—"
	roster.text = "\n".join(names)
	set_account(maxi(0,last_balance))

func resources(clock: String, left: float, active: bool, hp: int, maximum: int) -> void:
	if last_clock != clock:
		last_clock = clock
		time.text = clock
	var hearts := "♥ %d/%d" % [hp,maximum]
	if hearts != last_health:
		last_health = hearts
		health.text = hearts
	var seconds := ceili(maxf(0,left)) if active else -1
	if seconds != last_left:
		last_left = seconds
		timer.visible = active
		timer.text = "◷ %d:%02d" % [seconds/60,seconds%60] if active else ""
		deadline_style.bg_color = Color("#be5541") if seconds<10 else (Color("#bd7b35") if seconds<25 else GREEN)

func set_channel(next: String) -> void:
	channel = next
	roster.hide()
	var lines := PackedStringArray()
	for entry: String in history[channel]:
		lines.append(entry)
	conversations.text = "\n\n".join(lines) if not lines.is_empty() else tr("Сообщений пока нет")
	chat_scroll.set_deferred("scroll_vertical",1000000)

func message(value: String, direct := false, replace_typing := false, reveal := true) -> void:
	var target := "direct" if direct else "crew"
	var items: Array = history[target]
	if replace_typing and not items.is_empty():
		items.pop_back()
	items.append(value)
	if items.size()>40:
		items.pop_front()
	if reveal:
		set_channel(target)

func begin_message() -> void:
	if not popup:
		_switch("chat",true)

func begin_intro() -> void:
	intro = true
	set_channel("crew")
	_switch("chat",true)

func end_intro() -> void:
	intro = false
	dock()

func pay(base: int, tip: int, late: bool, total: int) -> void:
	was_open = expanded
	previous = page
	popup = true
	pay_face.texture = face.texture
	pay_name.text = text_name
	home_head.text = "★  "+tr("Заказ доставлен!")
	var mood := tr("Клиент недоволен") if late else (tr("Клиент в восторге") if tip>0 else tr("Нормально"))
	pay_info.text = "%s\n\n%s     %d ₽\n%s     +%d ₽\n\n%s     +%d ₽\n%s     %d ₽" % [mood,tr("заказ"),base,tr("чаевые"),tip,tr("Выплата"),base+tip,tr("В кошельке"),total]
	_switch("paid",true)

func end_pay() -> void:
	if popup:
		popup = false
		_switch(previous if was_open else "shift",was_open)

func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or (block_input.is_valid() and block_input.call()):
		return
	if (event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_I) or (event is InputEventJoypadButton and event.pressed and event.button_index==JOY_BUTTON_DPAD_UP):
		if popup:
			return
		if expanded:
			dock()
		else:
			open_page("shift")
		get_viewport().set_input_as_handled()
	elif expanded and not popup and not intro:
		if event is InputEventJoypadButton and event.pressed and event.button_index in [JOY_BUTTON_DPAD_LEFT,JOY_BUTTON_DPAD_RIGHT]:
			open_page("chat" if page == "shift" else "shift")
			get_viewport().set_input_as_handled()
