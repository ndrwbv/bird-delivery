extends RefCounted

const FILE := "user://career.json"
const RESERVE := "user://career.before-change.json"
const DEFAULTS := {"version":1,"wallet":0,"shifts":0,"stars":0,"xp":0,"skill":0.0,"gennady_paid":false,"recent":[],"skill_shift":0}
var data := DEFAULTS.duplicate(true)
var in_memory := false
var writable := true
var recovery := ""
var _memory_reserve := {}

func _identity() -> String:
	var bytes := Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6]&15)|64
	bytes[8] = (bytes[8]&63)|128
	var hex := bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [hex.left(8),hex.substr(8,4),hex.substr(12,4),hex.substr(16,4),hex.substr(20)]

func _valid(value: Variant) -> bool:
	if not value is Dictionary or value.get("version") != 1 or not value.has("wallet"):
		return false
	for key: String in ["wallet","shifts","stars","xp","skill","skill_shift","resets","counted","deliveries","knocked","seed"]:
		if value.has(key) and (typeof(value[key]) not in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(value[key]))):
			return false
	if value.has("recent") and not value.recent is Array:
		return false
	for key: String in ["best","semerka","engine","pending_transfer","crew_totals"]:
		if value.has(key) and not value[key] is Dictionary:
			return false
	if value.has("save_id") and (not value.save_id is String or str(value.save_id).is_empty()):
		return false
	return true

func _load(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var json := JSON.new()
	return json.data if json.parse(FileAccess.get_file_as_string(path)) == OK else null

func open(temporary: bool) -> void:
	in_memory = temporary
	data = DEFAULTS.duplicate(true)
	writable = true
	recovery = ""
	var needs_identity := true
	var exists := false
	if not temporary:
		for path: String in [FILE,FILE+".bak"]:
			exists = exists or FileAccess.file_exists(path)
			var content: Variant = _load(path)
			if _valid(content):
				data.merge(content,true)
				needs_identity = not data.has("save_id")
				if path.ends_with(".bak"):
					recovery = "backup"
				break
		if exists and not data.has("save_id") and not _valid(_load(FILE)) and not _valid(_load(FILE+".bak")):
			recovery = "damaged"
			writable = false
	if needs_identity:
		data.save_id = _identity()
	if not data.has("seed"):
		data.seed = str(data.save_id).sha256_text().left(7).hex_to_int()
	if not temporary and writable and needs_identity and recovery.is_empty():
		save()

func _write(path: String, value: Dictionary) -> bool:
	var target := ProjectSettings.globalize_path(path)
	var tmp := target + ".tmp"
	var output := FileAccess.open(tmp,FileAccess.WRITE)
	if not output:
		return false
	output.store_string(JSON.stringify(value))
	output.flush()
	var error := output.get_error()
	output.close()
	if error != OK or not _valid(_load(tmp)):
		return false
	return DirAccess.rename_absolute(tmp,target) == OK

func save() -> bool:
	if in_memory:
		return true
	if not writable or not _valid(data):
		return false
	var target := ProjectSettings.globalize_path(FILE)
	var previous: Variant = _load(FILE)
	if recovery == "backup" and FileAccess.file_exists(FILE) and not _valid(previous):
		var damaged := target+".damaged-"+str(Time.get_unix_time_from_system()).replace(".","-")
		if DirAccess.copy_absolute(target,damaged) != OK:
			return false
	if _valid(previous) and not _write(FILE+".bak",previous):
		return false
	if not _write(target,data):
		push_error("Не удалось записать карьеру")
		return false
	recovery = ""
	return true

func has_reserve() -> bool:
	return not _memory_reserve.is_empty() if in_memory else _valid(_load(RESERVE))

func _protect(quick_snapshot: Dictionary) -> bool:
	if not writable:
		# Preserve the unreadable originals under unique names before an explicit replacement.
		var stamp := str(Time.get_unix_time_from_system()).replace(".","-")
		for f: String in [FILE,FILE+".bak"]:
			if FileAccess.file_exists(f):
				var full := ProjectSettings.globalize_path(f)
				if DirAccess.copy_absolute(full,full+".damaged-"+stamp) != OK:
					return false
		return true
	var previous := data.duplicate(true)
	previous["_quick_backup"] = quick_snapshot.duplicate(true)
	if in_memory:
		_memory_reserve = previous
		return true
	return _write(RESERVE,previous)

func replace(candidate: Dictionary, quick: Dictionary, awards: Dictionary, current_quick: Dictionary) -> bool:
	if not _valid(candidate) or not candidate.has("save_id"):
		return false
	if not _protect(current_quick):
		return false
	var old := data
	var old_writable := writable
	var next := DEFAULTS.duplicate(true)
	next.merge(candidate.duplicate(true),true)
	next.erase("_quick_backup")
	next.pending_transfer = {"quick":quick.duplicate(true),"awards":awards.duplicate(true)}
	if not next.has("seed"):
		next.seed = str(next.save_id).sha256_text().left(7).hex_to_int()
	data = next
	writable = true
	if not save():
		data = old
		writable = old_writable
		return false
	recovery = ""
	return true

func reset_progress(current_quick: Dictionary) -> bool:
	var fresh := DEFAULTS.duplicate(true)
	fresh.save_id = data.save_id
	fresh.seed = data.seed
	fresh.resets = int(data.get("resets",0))+1
	for key in ["road_path","door_games","camera"]:
		if data.has(key):
			fresh[key] = data[key]
	return replace(fresh,{}, {},current_quick)

func restore_previous(current_quick: Dictionary) -> bool:
	var history: Variant = _memory_reserve if in_memory else _load(RESERVE)
	if not _valid(history):
		return false
	return replace(history,history.get("_quick_backup",{}),{},current_quick)

## The save holds the requested secondary changes until both stores acknowledge them.
## Restarting after a partial import is safe: awards merge by max/timestamp and quick data is a snapshot.
func complete_transfer(awards: CanvasLayer, quick: Node) -> bool:
	var pending: Dictionary = data.get("pending_transfer",{})
	if pending.is_empty():
		return true
	if not pending.get("awards",{}).is_empty():
		var was_temporary: bool = awards.temporary
		awards.temporary = was_temporary or in_memory
		awards.import_legacy(pending.awards)
		awards.temporary = was_temporary
		if (not awards.writable or awards.dirty) and not in_memory:
			return false
	if not quick.replace_progress(pending.get("quick",{}),in_memory):
		return false
	data.erase("pending_transfer")
	if save():
		return true
	data.pending_transfer = pending
	return false

func remember(address: String) -> void:
	var recent: Array = data.recent
	recent.erase(address)
	recent.append(address)
	if recent.size() > 24:
		recent.pop_front()
