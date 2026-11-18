extends CanvasLayer

signal awarded(id: String)
signal closed
const BOARD := preload("res://honor_board.gd")
const SAVE := "user://achievements.cfg"
const DEFS := "res://assets/game_menu/awards.json"
const HISTORICAL := ["BUHANKA_20","DISTRICT_2","CITY_OPEN","ERRANDS_10"]
var definitions: Array = []
var counters := {}
var earned := {}
var seen := {}
var adult := true
var temporary := false
var dirty := false
var writable := true
var pending_save := 0.0
var shift_late := 0
var shift_closed := false
var board := BOARD.new()
var snapshot := {}
var unseen_toasts: Array[Dictionary] = []
var toast := Label.new()
var toast_time := 0.0
var blocked := false
var _configured := false

func setup(adult_mode := true, memory_only := false) -> void:
	if _configured:
		return
	_configured = true
	adult = adult_mode
	temporary = memory_only
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 18
	add_to_group(&"local_achievements")
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(DEFS))
	if data is Array:
		definitions = data
	var cfg := ConfigFile.new()
	if not temporary and FileAccess.file_exists(SAVE):
		var error := cfg.load(SAVE)
		if error != OK:
			error = cfg.load(SAVE+".bak")
		if error != OK:
			writable = false
			push_warning("Не удалось прочитать доску почёта")
		else:
			_read_ledger(cfg)
	add_child(board)
	board.setup(self)
	board.closed.connect(func(): closed.emit())
	add_child(toast)
	toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.offset_left = -187
	toast.offset_right = 187
	toast.offset_top = 51
	toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#fff2d4")
	style.border_color = Color("#845b31")
	style.set_border_width_all(2)
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	style.set_corner_radius_all(3)
	toast.add_theme_stylebox_override("normal",style)
	toast.add_theme_color_override("font_color",Color("#462e16"))
	toast.add_theme_font_size_override("font_size",15)
	toast.hide()
	for def: Dictionary in definitions:
		_check(def)
	set_process(true)

func _read_ledger(cfg: ConfigFile) -> void:
	for name_key: String in ["counters","earned","seen"]:
		var values: Variant = cfg.get_value("ledger",name_key,{})
		if values is Dictionary:
			set(name_key,values)

## Merge the original dlv-ach representation when a save is explicitly transferred.
## Device clocks in Steam's release stored millisecond timestamps.
func import_legacy(data: Dictionary) -> void:
	var old_earned: Dictionary = data.get("got",{})
	for id: String in old_earned:
		if not earned.has(id):
			var timestamp := int(old_earned[id])
			earned[id] = floori(timestamp/1000.0) if timestamp > 30000000000 else timestamp
	for stat: String in data.get("n",{}):
		counters[stat] = maxi(int(counters.get(stat,0)),int(data.n[stat]))
	for id: String in data.get("seen",{}):
		if data.seen[id]:
			seen[id] = true
	dirty = true
	for def: Dictionary in definitions:
		_check(def)
	flush()

func bind_vehicle(vehicle: CharacterBody3D) -> void:
	var drowned := over.bind("drowned")
	if not vehicle.drowned.is_connected(drowned):
		vehicle.drowned.connect(drowned)
	var stall := add.bind("pothole")
	if not vehicle.engine.pothole_stalled.is_connected(stall):
		vehicle.engine.pothole_stalled.connect(stall)

func begin_shift() -> void:
	shift_late = 0
	shift_closed = false

func deliver(order: Dictionary) -> void:
	var count := maxi(1,int(order.get("n",1)))
	var on_time := bool(order.get("on_time",false))
	add("orders",count)
	if not on_time:
		shift_late += 1
	if on_time and not order.get("free",false) and float(order.get("left",0)) >= 0.9:
		add("lightning")
	if order.get("last",false) and order.get("bundle",false) and int(order.get("stops",0)) >= 5 and order.get("all_on_time",false):
		add("bundle5")
	if on_time and order.get("urgent",false):
		add("urgent")
	if order.has("hour") and fposmod(float(order.hour),24.0) < 5:
		add("night")
	if order.get("semerka",true):
		add("semerka",count)

func finish_shift(summary: Dictionary) -> void:
	if shift_closed:
		return
	shift_closed = true
	add("shifts")
	var delivered := int(summary.get("delivered",0))
	if summary.get("full",false) and delivered > 0:
		add("fullShifts")
		if shift_late == 0 and delivered >= 5:
			add("perfect")
		if int(summary.get("hits",-1)) == 0:
			add("clean")
	if summary.get("mood","") == "bad":
		add("mdaa")
	flush()

func deposit(won: bool, all_in: bool) -> void:
	if not won and all_in:
		add("allin")

func over(reason: String) -> void:
	if reason in ["boom","drowned"]:
		add(reason)

func add(stat: String, count := 1) -> void:
	if count < 1 or not _configured:
		return
	counters[stat] = int(counters.get(stat,0))+count
	dirty = true
	for def: Dictionary in definitions:
		if def.stat == stat:
			_check(def)

func _check(def: Dictionary) -> void:
	if earned.has(def.id) or def.id in HISTORICAL or (def.get("adult",false) and not adult):
		return
	if int(counters.get(def.stat,0)) < int(def.need):
		return
	earned[def.id] = int(Time.get_unix_time_from_system())
	unseen_toasts.append({"id":def.id,"expires":Time.get_ticks_msec()+60000})
	dirty = true
	flush.call_deferred()
	awarded.emit(def.id)

func set_records(career: Dictionary, quick_best := 0) -> void:
	snapshot = {"best":int(career.get("best",{}).get("earned",0)),"quick":quick_best,
		"shifts":int(career.get("shifts",0)),"delivered":int(career.get("deliveries",0)),
		"knocked":int(career.get("knocked",0)),"lamps":int(counters.get("lamps",0))}

func set_notifications_blocked(value: bool) -> void:
	blocked = value

func show_board() -> void:
	if active():
		return
	board.open()
	for id: String in earned:
		seen[id] = true
	dirty = true
	flush()

func active() -> bool:
	return board.visible and _configured

func unseen() -> int:
	var count := 0
	for def: Dictionary in definitions:
		if earned.has(def.id) and not seen.has(def.id) and (adult or not def.get("adult",false)):
			count += 1
	return count

func _process(dt: float) -> void:
	if dirty:
		pending_save += dt
		if pending_save >= 5.0:
			flush()
	if get_tree().paused or blocked or active():
		toast.hide()
		return
	if toast_time > 0:
		toast_time -= dt
		toast.visible = toast_time > 0
		return
	while not unseen_toasts.is_empty():
		var note: Dictionary = unseen_toasts.pop_front()
		if Time.get_ticks_msec() > int(note.expires) or seen.has(note.id):
			continue
		for def: Dictionary in definitions:
			if def.id == note.id:
				toast.text = tr("достижение")+"  ·  "+tr(def.name)
				var ride := get_tree().get_first_node_in_group("ride_notifications")
				if ride != null and ride.visible:
					ride.queue_notice(toast.text,"ach",4.0)
				else:
					toast_time = 4.0
					toast.show()
				break
		break

func flush() -> void:
	if not dirty or not writable:
		return
	pending_save = 0.0
	if not temporary:
		var cfg := ConfigFile.new()
		for key: String in ["counters","earned","seen"]:
			cfg.set_value("ledger",key,get(key))
		var path := ProjectSettings.globalize_path(SAVE)
		if cfg.save(path+".tmp") != OK:
			return
		if FileAccess.file_exists(path):
			var previous := ConfigFile.new()
			if previous.load(path) == OK:
				DirAccess.copy_absolute(path,path+".bak")
		if DirAccess.rename_absolute(path+".tmp",path) != OK:
			return
	dirty = false

func _exit_tree() -> void:
	flush()
