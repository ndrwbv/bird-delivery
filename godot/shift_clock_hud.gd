extends CanvasLayer

const BEATS := [.14, .48, .82, 1.12, 1.65]
const CHAT := ["Кто кружку на крыше машины оставил?", "Так вот почему кофе не было.",
	"Женя   Выхожу сегодня на смену", "Ирина Сергеевна печатает…", "Ирина Сергеевна   Ок"]
var corner := Label.new()
var panel := PanelContainer.new()
var banner := Label.new()
var notice_time := 0.0
var messages := Label.new()
var intro := -1.0
var beat := 0
var history := PackedStringArray()
var cached_clock := ""


func _ready() -> void:
	layer = 3
	add_child(banner)
	banner.position = Vector2(25,61)
	banner.add_theme_constant_override("outline_size",6)
	banner.hide()
	add_child(corner)
	corner.position = Vector2(25, 24)
	corner.add_theme_font_size_override("font_size", 19)
	corner.add_theme_constant_override("outline_size", 6)
	add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	var paper := StyleBoxFlat.new()
	paper.bg_color = Color("#25312f")
	paper.set_corner_radius_all(12)
	for side in [SIDE_TOP,SIDE_LEFT,SIDE_RIGHT,SIDE_BOTTOM]:
		paper.set_content_margin(side, 18)
	panel.add_theme_stylebox_override("panel", paper)
	panel.add_child(messages)
	panel.hide()


func notice(value: String) -> void:
	banner.text = value
	banner.show()
	notice_time = 4


func _process(delta: float) -> void:
	if notice_time > 0:
		notice_time -= delta
		if notice_time <= 0:
			banner.hide()


func opening() -> void:
	intro = 0
	beat = 0
	history = PackedStringArray(["Общий чат пиццерии", ""])
	messages.text = "\n".join(history)
	panel.show()


func advance_chat(delta: float) -> bool:
	intro += delta
	while beat < BEATS.size() and intro >= BEATS[beat]:
		if beat == 4:
			history.remove_at(history.size()-1)
		history.append(CHAT[beat])
		messages.text = "\n".join(history)
		beat += 1
	if intro < 2.45:
		return false
	intro = -1
	panel.hide()
	return true


func show_pay(base: int, tip: int, late: bool, total: int) -> void:
	var lines := ["Заказ доставлен", "%d ₽" % base]
	if tip > 0:
		lines.append("Чаевые   +%d ₽" % tip)
	if late:
		lines.append("Клиент недоволен опозданием")
	lines.append("В кошельке   %d ₽" % total)
	messages.text = "\n".join(lines)
	panel.show()


func update_clock(number: int, clock: String, left: float, deadline_active: bool, hp: int) -> void:
	var limit := "   •   %d:%02d" % [ceili(maxf(0,left))/60, ceili(maxf(0,left))%60] if deadline_active else ""
	var caption := "Смена %d    %s    ♥ %d%s" % [number, clock, hp, limit]
	if caption != cached_clock:
		cached_clock = caption
		corner.text = caption
