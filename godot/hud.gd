extends CanvasLayer

const DISTRICT_MAP := preload("res://district_map.gd")
const MAP_CAR := preload("res://map_car.gd")
const PIXEL_FONT := preload("res://retro/PressStart2P-Regular.ttf")
const INK := Color("#171818")
const CREAM := Color("#f3dfb2")
const ACCENT := Color("#f5ae66")
const SOFT := Color("#c0af8c")

var screen: Control
var district_map: Control
var map_car: Control
var mission: Label
var graphics: Label
var preset := "PS1"
var address: Label
var range_label: Label
var speed: Label
var wallet: Label
var balance := 0
var controls: Label
var last_kmh := -1
var last_meters := -1
var free_roam := false
var homebound := false
var last_hint := ""
var using_pad := false
var on_foot := false


func configure(data: Dictionary) -> void:
	screen = Control.new()
	add_child(screen)
	screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE

	graphics = _label(screen,"",11,CREAM,Vector2(25,26))
	graphics.add_theme_font_override("font",PIXEL_FONT)
	graphics.add_theme_color_override("font_outline_color",INK)
	graphics.add_theme_constant_override("outline_size",6)
	set_graphics_profile(preset)

	var order_card := _panel(Vector2(344, 130))
	_anchor(order_card, Vector2(1,0), Vector2(-368,24))
	var stripe := ColorRect.new()
	stripe.color = ACCENT
	stripe.position = Vector2(0, 16)
	stripe.size = Vector2(3, 100)
	order_card.add_child(stripe)
	mission = _label(order_card, "СОЛНЕЧНЫЙ  /  ЮГ", 9, SOFT, Vector2(19, 13))
	mission.add_theme_font_override("font",PIXEL_FONT)
	address = _label(order_card, "", 25, CREAM, Vector2(19, 31))
	range_label = _label(order_card, "", 15, ACCENT, Vector2(20, 70))
	wallet = _label(order_card,"Баланс  0 ₽",14,SOFT,Vector2(20,98))

	district_map = DISTRICT_MAP.new()
	district_map.data = data
	screen.add_child(district_map)
	district_map.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_anchor(district_map, Vector2(0,1), Vector2(24,-232))
	map_car = MAP_CAR.new()
	district_map.add_child(map_car)
	map_car.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var dash := _panel(Vector2(134, 89))
	_anchor(dash, Vector2.ONE, Vector2(-158,-113))
	speed = _label(dash, "000", 30, CREAM, Vector2(0, 17))
	speed.add_theme_font_override("font",PIXEL_FONT)
	speed.size.x = 134
	speed.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var unit := _label(dash, "КМ/Ч", 10, SOFT, Vector2(0, 62))
	unit.add_theme_font_override("font",PIXEL_FONT)
	unit.size.x = 134
	unit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	controls = _label(screen, "", 15, Color("#fff1d3"), Vector2.ZERO)
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	controls.add_theme_color_override("font_outline_color", INK)
	controls.add_theme_constant_override("outline_size", 7)
	_anchor(controls, Vector2(0.5,1), Vector2(-260,-45))
	controls.size.x = 520
	_update_controls()


func set_order(index: int, order: Dictionary, from_home: bool) -> void:
	homebound = false
	wallet.text = "Баланс  %d ₽" % balance
	mission.text = "СОЛНЕЧНЫЙ  /  ЮГ  •  ЗАКАЗ %d ИЗ 3" % (index+1)
	address.text = order.name
	district_map.set_route(order.from_home if from_home else order.route, order.stop)
	last_meters = -1


func return_to_depot(path: Array, at: Array, failed: bool) -> void:
	homebound = true
	mission.text = "ЗАКАЗ СОРВАН" if failed else "ЗАКАЗ ДОСТАВЛЕН"
	address.text = "В пиццерию"
	district_map.set_route(path,at)
	last_meters = -1


func show_payment(earned: int, total: int) -> void:
	balance = total
	wallet.text = "+%d ₽  •  Баланс %d ₽" % [earned,total] if earned > 0 else "Баланс  %d ₽" % total


func free_drive(delivered: int, earned: int) -> void:
	mission.text = "СОЛНЕЧНЫЙ  /  ЮГ"
	address.text = "Свободная езда"
	range_label.text = "Доставлено %d из 3    •    %d ₽" % [delivered,earned]
	district_map.set_route([])
	free_roam = true


func update_drive(at: Vector2, forward: Vector2, kmh: float, meters: float, hint: String, pad: bool, running: bool) -> void:
	var pixels: Vector2 = district_map.project(at)
	if not pixels.is_equal_approx(map_car.point) or not forward.is_equal_approx(map_car.direction):
		map_car.point = pixels
		map_car.direction = forward
		map_car.queue_redraw()

	var whole := roundi(kmh)
	if whole != last_kmh:
		last_kmh = whole
		speed.text = "%03d" % whole
	if not free_roam:
		var rounded := roundi(meters)
		if rounded != last_meters or last_hint != hint or using_pad != pad:
			last_meters = rounded
			if homebound:
				range_label.text = "%d м  до пиццерии" % rounded
			elif not hint.is_empty():
				range_label.text = hint
			else:
				range_label.text = "%d м  %s" % [rounded, "•  остановитесь у метки" if rounded < 9 else "до точки доставки"]
	last_hint = hint
	if pad != using_pad or running != on_foot:
		using_pad = pad
		on_foot = running
		_update_controls()


func set_graphics_profile(value: String) -> void:
	preset = value
	graphics.text = "%s  /  %s" % [preset,"VIEW" if using_pad else "F6"]


func _update_controls() -> void:
	set_graphics_profile(preset)
	if on_foot:
		controls.text = "Стик  бежать      X  к пиццерии" if using_pad else "WASD  бежать      R  к пиццерии"
	elif using_pad:
		controls.text = "RT / LT  газ и тормоз      Стик  руль      X  к пиццерии"
	else:
		controls.text = "WASD  ехать      ПРОБЕЛ  ручник      R  к пиццерии"


func _panel(dimensions: Vector2) -> Panel:
	var panel := Panel.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#222522ef")
	style.border_color = Color("#dbb06f")
	style.set_border_width_all(1)
	style.set_corner_radius_all(0)
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.size = dimensions
	screen.add_child(panel)
	return panel


func _label(parent: Control, value: String, pixels: int, color: Color, at: Vector2) -> Label:
	var label := Label.new()
	label.text = value
	label.position = at
	label.add_theme_font_size_override("font_size", pixels)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label


func _anchor(control: Control, anchor: Vector2, offset: Vector2) -> void:
	var dimensions := control.size
	control.anchor_left = anchor.x
	control.anchor_right = anchor.x
	control.anchor_top = anchor.y
	control.anchor_bottom = anchor.y
	control.offset_left = offset.x
	control.offset_top = offset.y
	control.offset_right = offset.x + dimensions.x
	control.offset_bottom = offset.y + dimensions.y
