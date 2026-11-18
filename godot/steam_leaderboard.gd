extends Node

# BEST_SHIFT in steam.js and board.js. A valid local career never depends on Steam.
signal rows_ready(tab: String, rows: Array, remote: bool)
signal score_stored(rank: int, changed: bool)
const SAVE := "user://shift_records.cfg"
var platform: Node
var cfg := ConfigFile.new()
var writable := true
var memory_only := false
var handle := 0
var phase := ""
var requested := ""
var reading := ""
var top_rows: Array = []
var sending := {}
var account := ""
var timeout := 0.0
var retry := 0.0
var uncertain := false

func setup(bridge: Node, temporary: bool) -> void:
	platform = bridge
	memory_only = temporary
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)
	if temporary:
		return
	var err := cfg.load(SAVE)
	writable = err in [OK,ERR_FILE_NOT_FOUND]
	platform.online_changed.connect(_online)
	adopt_imported()

func attach(sdk: Object) -> void:
	var callbacks := {"leaderboard_find_result":_found,"leaderboard_scores_downloaded":_downloaded,"leaderboard_score_uploaded":_uploaded}
	for key: String in callbacks:
		if not sdk.has_signal(key):
			return
	for method: String in ["findLeaderboard","downloadLeaderboardEntries","uploadLeaderboardScore"]:
		if not sdk.has_method(method):
			return
	for key: String in callbacks:
		sdk.connect(key,callbacks[key])
	set_process(true)

func _online(_value: bool) -> void:
	account = platform.account
	if not requested.is_empty():
		rows_ready.emit(requested,local_top(),false)
	requested = ""
	phase = ""
	sending = {}
	top_rows.clear()
	handle = 0
	uncertain = false
	retry = 1.0

func adopt_imported() -> void:
	var profile: RefCounted = platform.profile
	if not writable or memory_only or profile.in_memory or not profile.data.get("imported_scores") is Array:
		return
	var digest := str(profile.data.get("import_digest",""))
	if digest.is_empty() or cfg.has_section_key("import",digest):
		return
	var all: Array = cfg.get_value("local","scores",[])
	for row: Dictionary in profile.data.imported_scores:
		if int(row.get("score",0)) <= 0:
			continue
		var entry := {"owner":str(row.get("owner","")),"name":str(row.get("name","")),"score":int(row.score),"delivered":int(row.get("delivered",0)),"level":int(row.get("level",0)),"ts":int(row.get("ts",0))}
		if not all.has(entry):
			all.append(entry)
	_sort_local(all)
	cfg.set_value("import",digest,true)
	_save()

func _sort_local(all: Array) -> void:
	all.sort_custom(func(a: Dictionary,b: Dictionary): return a.score>b.score or (a.score==b.score and a.ts<b.ts))
	if all.size()>50:
		all.resize(50)
	cfg.set_value("local","scores",all)

func available() -> bool:
	return is_processing() and platform.available() and not uncertain

func record(value: int, delivered: int, level: int) -> void:
	if value<=0 or memory_only or not writable or platform.profile.in_memory:
		return
	var owner := str(platform.profile.data.save_id)
	var entry := {"name":tr("Женя"),"owner":owner,"score":value,"delivered":delivered,"level":level,"ts":roundi(Time.get_unix_time_from_system()*1000.0)}
	var all: Array = cfg.get_value("local","scores",[])
	all.append(entry)
	_sort_local(all)
	var pending: Dictionary = cfg.get_value("pending",owner,{})
	if value>int(pending.get("score",0)):
		cfg.set_value("pending",owner,entry)
	_save()
	retry = 0.0

func _save() -> void:
	if memory_only or not writable:
		return
	var path := ProjectSettings.globalize_path(SAVE)
	if cfg.save(path+".tmp")==OK:
		DirAccess.rename_absolute(path+".tmp",path)

func local_top() -> Array:
	var result := []
	var owner := str(platform.profile.data.save_id)
	var rows: Array = cfg.get_value("local","scores",[])
	for i in mini(10,rows.size()):
		var row: Dictionary = rows[i].duplicate()
		row.rank = i+1
		row.me = str(row.get("owner",""))==owner
		result.append(row)
	var best: Dictionary = platform.profile.data.get("best",{})
	if rows.is_empty() and int(best.get("earned",0))>0:
		result.append({"rank":1,"name":tr("Женя"),"score":int(best.earned),"delivered":int(best.get("delivered",0)),"level":0,"me":true})
	return result

func request(tab: String) -> void:
	if tab not in ["world","friends"]:
		return
	requested = tab
	if not available():
		_local_response()
	else:
		retry = 0

func _local_response() -> void:
	var tab := requested
	requested = ""
	if not tab.is_empty():
		rows_ready.emit(tab,local_top(),false)

func _process(delta: float) -> void:
	if not available():
		return
	if account != platform.account:
		_online(platform.online)
	if not phase.is_empty():
		timeout -= delta
		if timeout<=0:
			# API callbacks have no request ID. Retire the timed-out session so a late
			# world response cannot be mistaken for the friends list or a new upload.
			uncertain = true
			phase = ""
			_local_response()
		return
	retry = maxf(0.0,retry-delta)
	if retry>0:
		return
	var owner := str(platform.profile.data.save_id)
	var pending: Dictionary = cfg.get_value("pending",owner,{})
	var can_upload: bool = not pending.is_empty() and platform._owner_matches()
	if requested.is_empty() and not can_upload:
		retry = 1.0
		return
	timeout = 10.0
	if handle==0:
		phase = "find"
		platform.sdk.call("findLeaderboard","BEST_SHIFT")
	elif not requested.is_empty():
		reading = requested
		phase = "read"
		platform.sdk.call("downloadLeaderboardEntries",1,10,2 if reading=="friends" else 0,handle)
	else:
		sending = pending.duplicate()
		sending.app = platform.app_id
		sending.account = account
		phase = "upload"
		platform.sdk.call("uploadLeaderboardScore",int(pending.score),true,PackedInt32Array([int(pending.delivered),int(pending.level)]),handle)

func _found(found_handle: int, found: int) -> void:
	if phase!="find" or not available():
		return
	phase = ""
	if found==1 and found_handle!=0:
		handle = found_handle
	else:
		retry = 30.0
		_local_response()

func _downloaded(message: String, this_handle: int, entries: Array) -> void:
	if phase not in ["read","around"] or this_handle!=handle or not available():
		return
	var second := phase=="around"
	phase = ""
	if requested != reading:
		return
	if "fail" in message.to_lower() or "error" in message.to_lower():
		_local_response()
		return
	var output := []
	for entry: Dictionary in entries:
		var id := str(entry.get("steam_id",""))
		var rank := int(entry.get("global_rank",0))
		if rank<=0 or not id.is_valid_int():
			continue
		var details: Variant = entry.get("details",[])
		var name_ := str(platform.sdk.call("getFriendPersonaName",int(id))) if platform.sdk.has_method("getFriendPersonaName") else ""
		var mine: bool = id==platform.account
		output.append({"rank":rank,"name":name_ if not name_.is_empty() and name_!="[unknown]" else tr("Курьер"),"score":int(entry.get("score",0)),
			"delivered":int(details[0]) if details.size()>0 else 0,"level":int(details[1]) if details.size()>1 else 0,"me":mine})
		if output.size()>=10:
			break
	if second:
		for row: Dictionary in output:
			if row.me:
				top_rows.append(row)
		output = top_rows.duplicate()
		top_rows.clear()
	elif reading=="world" and not output.any(func(row: Dictionary): return bool(row.me)):
		top_rows = output
		phase = "around"
		timeout = 10.0
		platform.sdk.call("downloadLeaderboardEntries",0,0,1,handle)
		return
	requested = ""
	rows_ready.emit(reading,output,true)

func _uploaded(ok: int, this_handle: int, result: Dictionary) -> void:
	if phase!="upload" or this_handle!=handle or not available() or sending.is_empty():
		return
	phase = ""
	if ok!=1 or sending.account!=platform.account or sending.app!=platform.app_id or not platform._owner_matches() or int(result.get("score",-1))!=int(sending.score):
		retry = 30.0
		return
	var owner: String = sending.owner
	var pending: Dictionary = cfg.get_value("pending",owner,{})
	if int(pending.get("score",0))<=int(sending.score):
		cfg.erase_section_key("pending",owner)
		_save()
	score_stored.emit(int(result.get("global_rank_new",0)),bool(result.get("score_changed",false)))
	sending = {}
