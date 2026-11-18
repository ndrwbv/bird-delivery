extends CanvasLayer

signal payment_closed
signal map_requested
const DISTRICT_MAP := preload("res://district_map.gd")
const MAP_CAR := preload("res://map_car.gd")
const PHONE := preload("res://drive_phone.gd")
const RESOURCES := preload("res://drive_resources.gd")
const INK := Color("#53381d")
var screen: Control
var district_map: Control
var map_car: Control
var phone: Control
var bars: Control
var mission: Label
var address: Label
var range_label: Label
var controls: Label
var card: Panel
var avatar: TextureRect
var initial: Label
var car: CharacterBody3D
var balance := 0
var last_meters := -1
var free_roam := false
var homebound := false
var consumed_physics_frame: int:
	get:
		return int(phone.meal.consumed_frame) if is_instance_valid(phone) and is_instance_valid(phone.meal) else -2
var last_hint := ""
var using_pad := false
var on_foot := false
var _delivery_path: Array = []
var _delivery_stop: Array = []
var _navigation_active := false

func configure(data: Dictionary, region: Dictionary = {}) -> void:
	screen = Control.new()
	add_child(screen)
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	district_map = DISTRICT_MAP.new()
	screen.add_child(district_map)
	district_map.setup(region,data,false)
	district_map.size = Vector2(190,136)
	district_map.mouse_filter = Control.MOUSE_FILTER_STOP
	district_map.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	district_map.gui_input.connect(_map_input)
	_anchor(district_map, Vector2(0,1), Vector2(16,-181))
	map_car = MAP_CAR.new()
	district_map.add_child(map_car)
	map_car.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card = Panel.new()
	screen.add_child(card)
	var paper := StyleBoxFlat.new()
	paper.bg_color = Color("#fcf1d9")
	paper.border_color = Color("#bf975f")
	paper.set_border_width_all(1)
	paper.set_corner_radius_all(6)
	paper.shadow_size = 3
	card.add_theme_stylebox_override("panel",paper)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.size = Vector2(256,55)
	_anchor(card,Vector2(0,1),Vector2(16,-244))
	initial = _label(card,Rect2(5,4,44,46),21,INK)
	initial.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	avatar = TextureRect.new()
	card.add_child(avatar)
	avatar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar.position = Vector2(4,4)
	avatar.size = Vector2(44,46)
	avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	mission = _label(card,Rect2(55,1,194,19),13,INK)
	address = _label(card,Rect2(55,18,194,19),13,INK)
	range_label = _label(card,Rect2(55,35,194,17),11,Color("#805932"))
	bars = RESOURCES.new()
	screen.add_child(bars)
	bars.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bars.size = Vector2(96,21)
	_anchor(bars,Vector2(0,1),Vector2(16,-37))
	controls = _label(screen, Rect2(0,0,580,32),14,Color("#ffe4a2"))
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	controls.add_theme_color_override("font_outline_color", Color("#442e18"))
	controls.add_theme_constant_override("outline_size", 5)
	_anchor(controls,Vector2(.5,1),Vector2(-290,-45))
	phone = PHONE.new()
	screen.add_child(phone)
	phone.build()
	phone.payment_closed.connect(func(): payment_closed.emit())
	_update_controls()

func _map_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT and not (phone.block_input.is_valid() and phone.block_input.call()):
		district_map.accept_event()
		map_requested.emit()

func bind_drive(vehicle: CharacterBody3D, clock_hud: CanvasLayer, modal: Callable = Callable()) -> void:
	car = vehicle
	phone.block_input = modal
	clock_hud.bind_phone(phone,car,modal)

func open_meal(apply: Callable, next: Callable) -> bool:
	if not apply.is_valid():
		return false
	var apply_and_refresh := func(index: int):
		apply.call(index)
		if car:
			phone.resources(phone.last_clock,phone.last_left,phone.last_left>=0,ceili(car.hearts),ceili(car.hearts_max))
	return phone.meal.open(apply_and_refresh,next)

func meal_active() -> bool:
	return is_instance_valid(phone) and is_instance_valid(phone.meal) and phone.meal.active()

func cancel_meal() -> void:
	if meal_active():
		phone.meal.cancel()

func begin_shift() -> void:
	phone.begin_shift()

func set_crew(rows: Array) -> void:
	phone.set_crew(rows)

func set_invoice(invoice: Dictionary) -> void:
	phone.set_order(invoice)
	mission.text = str(invoice.get("recipient",""))
	initial.text = mission.text.left(1)
	avatar.texture = invoice.get("avatar") as Texture2D
	initial.visible = avatar.texture == null

func set_order(index: int, order: Dictionary, from_home: bool) -> void:
	free_roam = false
	homebound = false
	card.show()
	var recipients: Array = order.get("recipients",[])
	set_invoice({"recipient":str(recipients[0].get("label","")) if not recipients.is_empty() else tr("Заказ")+" "+str(index+1),"address":order.name})
	address.text = order.name
	_set_delivery_route(order.from_home if from_home else order.route, order.stop)
	last_meters = -1

func return_to_depot(path: Array, at: Array, failed: bool, cancelled := false) -> void:
	homebound = true
	card.show()
	var title := tr("Заказ сорван") if failed else tr("Заказ доставлен!")
	if cancelled:
		title = tr("Заказ отменён")
	set_invoice({"recipient":title,"address":tr("В пиццерию")})
	address.text = tr("В пиццерию")
	_set_delivery_route(path,at)
	last_meters = -1

func show_payment(_earned: int, total: int) -> void:
	balance = total
	phone.set_account(total)

func free_drive(_delivered: int, _earned: int) -> void:
	cancel_meal()
	card.hide()
	phone.end_pay()
	phone.end_intro()
	phone.set_order({})
	_set_delivery_route([],[])
	free_roam = true

func set_navigation(path: Array, stop: Array) -> void:
	_navigation_active = stop.size() == 2
	if _navigation_active:
		district_map.set_route(path,stop)
	else:
		district_map.set_route(_delivery_path,_delivery_stop)

func _set_delivery_route(path: Array, stop: Array) -> void:
	_delivery_path = path
	_delivery_stop = stop
	if not _navigation_active:
		district_map.set_route(path,stop)

func update_drive(at: Vector2, forward: Vector2, _kmh: float, meters: float, hint: String, pad: bool, running: bool) -> void:
	district_map.follow(at)
	var pixels: Vector2 = district_map.project(at)
	if not pixels.is_equal_approx(map_car.point) or not forward.is_equal_approx(map_car.direction):
		map_car.point = pixels
		map_car.direction = forward
		map_car.queue_redraw()
	var rounded := roundi(meters)
	if not free_roam and rounded != last_meters:
		last_meters = rounded
		var measure := "%d %s" % [rounded,tr("м")] if rounded < 1000 else "%.1f %s" % [meters/1000.0,tr("км")]
		range_label.text = measure
		phone.distance.text = measure
	if car:
		var cold: float = car.pizza_cooling()
		bars.set_values(car.nitro,-1 if homebound or free_roam else (2 if cold>=.25 else (1 if cold>0.0 else 0)))
	if pad != using_pad or running != on_foot or hint != last_hint:
		using_pad = pad
		on_foot = running
		last_hint = hint
		_update_controls()

func _update_controls() -> void:
	if not last_hint.is_empty():
		controls.text = last_hint
	elif on_foot:
		controls.text = tr("Стик — бежать") if using_pad else tr("WASD — бежать")
	else:
		controls.text = tr("RT / LT — газ и тормоз") if using_pad else tr("Газуй в пиццерию — за заказом")
		controls.visible = not free_roam
	controls.visible = not last_hint.is_empty() or on_foot or (homebound and not free_roam)

func _label(parent: Control, area: Rect2, px: int, color: Color) -> Label:
	var label := Label.new()
	parent.add_child(label)
	label.position = area.position
	label.size = area.size
	label.add_theme_font_size_override("font_size",px)
	label.add_theme_color_override("font_color",color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return label

func _anchor(control: Control, anchor: Vector2, offset: Vector2) -> void:
	var dimensions := control.size
	control.anchor_left = anchor.x
	control.anchor_right = anchor.x
	control.anchor_top = anchor.y
	control.anchor_bottom = anchor.y
	control.offset_left = offset.x
	control.offset_top = offset.y
	control.offset_right = offset.x+dimensions.x
	control.offset_bottom = offset.y+dimensions.y
