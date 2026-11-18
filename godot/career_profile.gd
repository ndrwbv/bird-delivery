extends RefCounted

const FILE := "user://career.json"
var data := {"version": 1, "wallet": 0, "shifts": 0, "stars": 0, "xp": 0,
	"skill": 0.0, "gennady_paid": false, "recent": [], "skill_shift": 0}
var in_memory := false
var writable := true


func open(temporary: bool) -> void:
	in_memory = temporary
	if temporary or not FileAccess.file_exists(FILE):
		return
	for path in [FILE, FILE + ".bak"]:
		if not FileAccess.file_exists(path):
			continue
		var content: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if content is Dictionary and content.get("version") == 1 and content.get("wallet") is float:
			data.merge(content, true)
			return
	writable = false
	push_error("Не удалось прочитать сохранение карьеры. Исходный файл сохранён.")


func save() -> bool:
	if in_memory:
		return true
	if not writable:
		return false
	var target := ProjectSettings.globalize_path(FILE)
	var tmp := target + ".tmp"
	var output := FileAccess.open(tmp, FileAccess.WRITE)
	if output == null:
		push_error("Не удалось открыть временный файл карьеры")
		return false
	output.store_string(JSON.stringify(data))
	output.flush()
	var error := output.get_error()
	output.close()
	if error != OK:
		push_error("Не удалось записать карьеру: %s" % error_string(error))
		return false
	if FileAccess.file_exists(target):
		var previous: Variant = JSON.parse_string(FileAccess.get_file_as_string(target))
		if previous is Dictionary and previous.get("version") == 1:
			DirAccess.copy_absolute(target, target + ".bak")
	error = DirAccess.rename_absolute(tmp, target)
	if error != OK:
		push_error("Не удалось сохранить карьеру: %s" % error_string(error))
	return error == OK


func remember(address: String) -> void:
	var recent: Array = data.recent
	recent.erase(address)
	recent.append(address)
	if recent.size() > 24:
		recent.pop_front()
