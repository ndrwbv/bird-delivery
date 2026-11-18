extends Node

signal overlay_changed(opened: bool)
signal online_changed(is_online: bool)
signal achievement_synced(id: String)
const SAVE := "user://steam_queue.cfg"
const LANGUAGE := {"russian":"ru","english":"en","german":"de","spanish":"es","latam":"es","french":"fr","italian":"it",
	"polish":"pl","portuguese":"pt","brazilian":"pt","turkish":"tr","ukrainian":"uk","japanese":"ja","schinese":"zh","tchinese":"zh"}
var leaders := preload("res://steam_leaderboard.gd").new()
var sdk: Object
var app_id := 0
var account := ""
var initialized := false
var online := false
var temporary := false
var profile: RefCounted
var honors: CanvasLayer
var modal_guard: Callable
var disk := ConfigFile.new()
var writable := true
var dispatch_callbacks := true
var inflight: Array[String] = []
var timeout := 0.0
var next_sync := 1.0
var connection_check := 0.0
var language := ""
var on_deck := false
var owns_pause := false
var pause_reasons := {}
var pause_id := ""
var keyboard_focused: Control
var queue_dirty := false

func setup(board: CanvasLayer, owner: RefCounted, memory_only := false, other_modal := Callable()) -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	add_to_group("game_platform")
	honors = board
	profile = owner
	temporary = memory_only
	modal_guard = other_modal
	add_child(leaders)
	leaders.setup(self,temporary)
	if temporary:
		set_process(false)
		return
	var err := disk.load(SAVE)
	if err not in [OK,ERR_FILE_NOT_FOUND]:
		# A corrupt account mapping must never cause an upload to a different person.
		writable = false
	board.awarded.connect(_new_award)
	for id: String in board.earned:
		_queue(id)
	if not Engine.has_singleton(&"Steam"):
		set_process(false)
		return
	app_id = _application_id()
	if app_id <= 0:
		set_process(false)
		return
	sdk = Engine.get_singleton(&"Steam")
	var auto_init := bool(ProjectSettings.get_setting("steam/initialization/initialize_on_startup",false))
	if not auto_init:
		if not sdk.has_method(&"steamInitEx"):
			return
		var args: Array = [app_id,false]
		var arity := sdk.get_method_argument_count(&"steamInitEx")
		var result: Variant = sdk.callv(&"steamInitEx",args.slice(0,maxi(0,mini(2,arity))))
		if not result is Dictionary or int(result.get("status",-1)) != 0:
			return
	dispatch_callbacks = not (auto_init and ProjectSettings.get_setting("steam/initialization/embed_callbacks",false))
	if not sdk.has_method(&"getAppID") or int(sdk.call(&"getAppID")) != app_id:
		return
	initialized = true
	leaders.attach(sdk)
	_wire("overlay_toggled",_overlay)
	_wire("user_stats_stored",_stored)
	_wire("steam_server_connected",_reconnect)
	_wire("steam_server_disconnected",_disconnect)
	_wire("floating_gamepad_text_input_dismissed",_keyboard_closed)
	if sdk.has_method(&"getCurrentGameLanguage"):
		language = LANGUAGE.get(str(sdk.call(&"getCurrentGameLanguage")).to_lower(),"")
	on_deck = bool(_call("isSteamRunningOnSteamDeck")) or bool(_call("isSteamInBigPictureMode"))
	get_viewport().gui_focus_changed.connect(_focus)
	_refresh_connection()
	set_process(true)

func _application_id() -> int:
	for key: String in ["STEAM_APP_ID","SteamAppId","SteamGameId"]:
		var raw := OS.get_environment(key)
		if raw.is_valid_int() and int(raw) > 0 and int(raw) < 2147483648:
			return int(raw)
	for name_: String in ["res://steam_appid.txt",ProjectSettings.globalize_path("res://").path_join("../steam_appid.txt"),OS.get_executable_path().get_base_dir().path_join("steam_appid.txt")]:
		if FileAccess.file_exists(name_):
			var raw := FileAccess.get_file_as_string(name_).strip_edges()
			if raw.is_valid_int() and int(raw) > 0 and int(raw) < 2147483648:
				return int(raw)
	return 0

func _wire(key: StringName, cb: Callable) -> void:
	if sdk.has_signal(key) and not sdk.is_connected(key,cb):
		sdk.connect(key,cb)

func _call(key: StringName) -> Variant:
	return sdk.call(key) if initialized and sdk.has_method(key) else null

func available() -> bool:
	return initialized and online

func suggested_locale() -> String:
	return language

func bind_profile(owner: RefCounted) -> void:
	profile = owner
	leaders.adopt_imported()
	inflight.clear()
	next_sync = 1.0
	if not temporary:
		for id: String in honors.earned:
			_queue(id)

func _refresh_connection() -> void:
	var previous := account
	var id := str(_call("getSteamID")) if initialized else ""
	if not id.is_valid_int() or int(id) <= 0:
		id = ""
	var live := not id.is_empty() and bool(_call("loggedOn"))
	if live != online or id != previous:
		online = live
		account = id
		inflight.clear()
		next_sync = 1.0
		online_changed.emit(online)
	if online and writable and not profile.in_memory:
		var save_id := str(profile.data.save_id)
		if not disk.has_section_key("apps",save_id) and str(disk.get_value("profiles",save_id,""))==account:
			disk.set_value("apps",save_id,app_id)
			queue_dirty = true
		if str(disk.get_value("profiles",save_id,"")).is_empty():
			disk.set_value("profiles",save_id,account)
			disk.set_value("apps",save_id,app_id)
			queue_dirty = true

func _reconnect() -> void:
	_refresh_connection()

func _disconnect(_result := 0) -> void:
	online = false
	inflight.clear()
	online_changed.emit(false)

func _new_award(id: String) -> void:
	_queue(id)
	next_sync = minf(next_sync,1.0)

func _queue(id: String) -> void:
	if not writable or temporary:
		return
	if not disk.has_section_key("grants",id):
		# Shared device achievements are claimed once. Unclaimed local grants
		# retain the save that earned them until a matching Steam session appears.
		disk.set_value("grants",id,{"save":str(profile.data.save_id),"account":"","confirmed":false})
		queue_dirty = true
		_flush.call_deferred()

func _owner_matches() -> bool:
	return online and int(disk.get_value("apps",str(profile.data.save_id),app_id))==app_id and str(disk.get_value("profiles",str(profile.data.save_id),"")) == account and str(_call("getSteamID")) == account

func _sync() -> void:
	if not _owner_matches() or not writable or not disk.has_section("grants"):
		return
	if not sdk.has_signal(&"user_stats_stored") or not sdk.has_method(&"setAchievement") or not sdk.has_method(&"storeStats"):
		return
	var batch: Array[String] = []
	for id in disk.get_section_keys("grants"):
		var row: Dictionary = disk.get_value("grants",id,{})
		if row.get("confirmed",false) or not honors.earned.has(id):
			continue
		var scope := str(disk.get_value("profiles",str(row.get("save","")),""))
		if scope != account or (not str(row.get("account","")).is_empty() and row.account != account):
			continue
		var already: Variant = sdk.call(&"getAchievement",id) if sdk.has_method(&"getAchievement") else {}
		if not row.get("submitted",false) and already is Dictionary and already.get("ret",false) and already.get("achieved",false):
			_ack(id)
			continue
		row.account = account
		disk.set_value("grants",id,row)
		queue_dirty = true
		if bool(sdk.call(&"setAchievement",id)):
			row.submitted = true
			disk.set_value("grants",id,row)
			batch.append(id)
	_flush()
	if not batch.is_empty():
		inflight = batch
		timeout = 15.0
		if not bool(sdk.call(&"storeStats")):
			inflight.clear()

func _ack(id: String) -> void:
	var row: Dictionary = disk.get_value("grants",id,{})
	row.account = account
	row.confirmed = true
	disk.set_value("grants",id,row)
	queue_dirty = true
	achievement_synced.emit(id)

func _stored(game: int, result: int) -> void:
	if game != app_id or not _owner_matches():
		return
	if result == 1:
		for id in inflight:
			_ack(id)
		_flush()
	inflight.clear()
	next_sync = 10.0 if result == 1 else 30.0

func _flush() -> void:
	if not queue_dirty or temporary or not writable:
		return
	var path := ProjectSettings.globalize_path(SAVE)
	if disk.save(path+".tmp") == OK and DirAccess.rename_absolute(path+".tmp",path) == OK:
		queue_dirty = false

func _process(delta: float) -> void:
	if not initialized:
		return
	if dispatch_callbacks and sdk.has_method(&"run_callbacks"):
		sdk.call(&"run_callbacks")
	connection_check -= delta
	if connection_check <= 0:
		connection_check = 5.0
		_refresh_connection()
	if not inflight.is_empty():
		timeout -= delta
		if timeout <= 0:
			inflight.clear()
			next_sync = 30.0
	else:
		next_sync -= delta
		if next_sync <= 0:
			next_sync = 30.0
			_sync()
	if queue_dirty:
		_flush()

func _overlay(toggled: bool, _user_initiated := false, overlay_app := 0) -> void:
	if overlay_app != 0 and overlay_app != app_id:
		return
	_pause_reason("overlay",toggled)
	overlay_changed.emit(toggled)

func _notification(what: int) -> void:
	if not initialized or not is_inside_tree():
		return
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_pause_reason("focus",true)
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_pause_reason("focus",false)

func _pause_reason(reason: String, active_now: bool) -> void:
	if active_now:
		if pause_reasons.is_empty():
			owns_pause = not get_tree().paused
			pause_id = str(profile.data.save_id)
		pause_reasons[reason] = true
		get_tree().paused = true
	elif pause_reasons.erase(reason) and pause_reasons.is_empty():
		if owns_pause and pause_id == str(profile.data.save_id) and (not modal_guard.is_valid() or not modal_guard.call()):
			get_tree().paused = false
		owns_pause = false

func _focus(control: Control) -> void:
	if on_deck:
		open_keyboard(control)

func open_keyboard(control: Control) -> bool:
	if not initialized or not sdk.has_method(&"showFloatingGamepadTextInput"):
		return false
	if not (control is LineEdit or control is TextEdit) or not control.editable or not control.is_visible_in_tree():
		return false
	if keyboard_focused == control:
		return true
	var rect := control.get_global_transform_with_canvas()*Rect2(Vector2.ZERO,control.size)
	var window := control.get_window()
	var view_size := window.get_visible_rect().size
	var scale := Vector2(window.size)/Vector2(maxf(1,view_size.x),maxf(1,view_size.y))
	var ok := bool(sdk.call(&"showFloatingGamepadTextInput",1 if control is TextEdit else 0,roundi(rect.position.x*scale.x),roundi(rect.position.y*scale.y),maxi(1,roundi(rect.size.x*scale.x)),maxi(1,roundi(rect.size.y*scale.y))))
	if ok:
		keyboard_focused = control
	return ok

func _keyboard_closed() -> void:
	keyboard_focused = null

func _exit_tree() -> void:
	_flush()
