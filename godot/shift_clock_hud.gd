extends CanvasLayer

const BEATS := [.14,.48,.82,1.12,1.65]
const CHAT := ["Кто кружку на крыше машины оставил?","Так вот почему кофе не было.",
	"Женя   Выхожу сегодня на смену","Ирина Сергеевна печатает…","Ирина Сергеевна   Ок"]
const PRIORITY := {"urgent":0,"pay":1,"boss":2,"line":2,"rank":3,"ach":4,"daily":4,"hint":5,"toast":5,"note":5,"crew":6}
var panel := Control.new()
var banner := Label.new()
var notice_time := 0.0
var intro := -1.0
var beat := 0
var phone: Control
var car: CharacterBody3D
var modal: Callable
var waiting: Array[Dictionary] = []
var current := {}
var gap := 0.0
var shown := 0.0
var panel_kind := ""

func _ready() -> void:
	layer = 3
	add_to_group("ride_notifications")
	add_child(banner)
	banner.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	banner.offset_left = 16
	banner.offset_right = 326
	banner.offset_top = -320
	banner.offset_bottom = -248
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	banner.add_theme_font_size_override("font_size",15)
	banner.add_theme_color_override("font_color",Color("#533a23"))
	var paper := StyleBoxFlat.new()
	paper.bg_color = Color("#ffedcb")
	paper.border_color = Color("#bf995d")
	paper.set_border_width_all(1)
	paper.set_corner_radius_all(6)
	for side in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		paper.set_content_margin(side,6)
	banner.add_theme_stylebox_override("normal",paper)
	banner.hide()
	add_child(panel)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.hide()
	panel.visibility_changed.connect(_panel_visibility)
	visibility_changed.connect(_visibility)

func bind_phone(device: Control, vehicle: CharacterBody3D, guard: Callable) -> void:
	phone = device
	car = vehicle
	modal = guard

func _visibility() -> void:
	if visible:
		return
	clear_notices()
	panel.hide()

func clear_notices() -> void:
	waiting.clear()
	_end()
	gap = 0.0

func _panel_visibility() -> void:
	if panel.visible:
		return
	if phone:
		if panel_kind == "pay":
			phone.end_pay()
		elif panel_kind == "intro":
			phone.end_intro()
	panel_kind = ""
	gap = .5

func notice(value: String, kind := "") -> void:
	if kind.is_empty():
		kind = "hint" if value.begins_with("Следующий адрес") else "boss"
	queue_notice(value,kind)

func queue_notice(value: String, kind: String, duration := 4.0) -> void:
	if current.get("text","") == value:
		return
	for item in waiting:
		if item.text == value:
			return
	waiting.append({"text":value,"kind":kind,"priority":int(PRIORITY.get(kind,5)),"age":0.0,"duration":duration,"wait":60.0 if kind=="ach" else 20.0})
	if kind in ["boss","crew","line"] and phone:
		phone.message(value,kind!="crew",false,false)

func queue_rank(rows: Array, duration: float) -> void:
	for item in waiting:
		if item.kind=="rank":
			item.rows = rows.duplicate()
			item.age = 0.0
			return
	waiting.append({"kind":"rank","text":"rank","rows":rows.duplicate(),"priority":PRIORITY.rank,"age":0.0,"duration":duration,"wait":20.0})

func _end() -> void:
	if phone and str(current.get("kind","")) in ["boss","crew","line","rank"] and not panel.visible:
		phone.dock()
	current = {}
	notice_time = 0
	shown = 0
	banner.hide()

func _cut() -> void:
	if shown<1.0 and not current.is_empty() and not str(current.kind) in ["boss","crew","line"]:
		waiting.push_front(current)
	_end()

func _process(delta: float) -> void:
	if not visible or (modal.is_valid() and modal.call()):
		return
	if panel.visible:
		return
	gap = maxf(0,gap-delta)
	for i in range(waiting.size()-1,-1,-1):
		waiting[i].age += delta
		if waiting[i].age > waiting[i].wait:
			waiting.remove_at(i)
	if not current.is_empty():
		shown += delta
		notice_time -= delta
		if notice_time<=0:
			_end()
			gap = .5
	var best := -1
	for i in waiting.size():
		if best<0 or waiting[i].priority < waiting[best].priority:
			best = i
	if best<0:
		return
	var next: Dictionary = waiting[best]
	if not current.is_empty():
		if next.kind == "urgent" and current.kind!="urgent":
			waiting.remove_at(best)
			_cut()
			_show_notice(next)
		return
	if gap<=0 or next.kind=="urgent":
		waiting.remove_at(best)
		_show_notice(next)

func _show_notice(item: Dictionary) -> void:
	current = item
	shown = 0
	notice_time = item.duration
	if phone and item.kind=="rank":
		phone.set_crew(item.rows)
		phone.open_page("rank")
		return
	if phone and item.kind in ["boss","crew","line"]:
		phone.set_channel("crew" if item.kind=="crew" else "direct")
		phone.begin_message()
	else:
		banner.text = item.text
		banner.show()

func opening() -> void:
	clear_notices()
	intro = 0
	beat = 0
	panel_kind = "intro"
	if phone:
		phone.begin_intro()
	panel.show()

func advance_chat(delta: float) -> bool:
	intro += delta
	while beat<BEATS.size() and intro>=BEATS[beat]:
		if phone:
			phone.message(tr(CHAT[beat]),false,beat==4)
		beat += 1
	if intro<2.45:
		return false
	intro = -1
	panel.hide()
	return true

func show_pay(base: int, tip: int, late: bool, total: int) -> void:
	if not current.is_empty():
		_cut()
	panel_kind = "pay"
	if phone:
		phone.pay(base,tip,late,total)
	panel.show()

func update_clock(_number: int, clock: String, left: float, deadline_active: bool, hp: int) -> void:
	if phone and car:
		phone.resources(clock,left,deadline_active,hp,ceili(car.hearts_max))
