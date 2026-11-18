extends Node

signal changed
signal updated
var profile: RefCounted
var achievements: CanvasLayer
var quick: Node
var reader := Thread.new()
var preview := {}
var action := ""
var status := ""
var dialog: FileDialog

func bind(owner: RefCounted, honors: CanvasLayer, modes: Node) -> void:
	profile = owner
	achievements = honors
	quick = modes
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not profile.complete_transfer(achievements,quick):
		status = "Не удалось завершить перенос. Можно повторить."
	set_process(false)

func busy() -> bool:
	return reader.is_started()

func choose(directory: bool) -> void:
	if busy():
		return
	if dialog:
		dialog.queue_free()
	dialog = FileDialog.new()
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_DIR if directory else FileDialog.FILE_MODE_OPEN_FILE
	dialog.title = tr("Выбрать копию папки Steam" if directory else "Выбрать копию JSON")
	if not directory:
		dialog.add_filter("*.json","JSON")
	add_child(dialog)
	dialog.dir_selected.connect(_read)
	dialog.file_selected.connect(_read)
	dialog.canceled.connect(_close_picker)
	dialog.popup_centered_ratio(0.72)

func _close_picker() -> void:
	if dialog:
		dialog.queue_free()
		dialog = null

func _read(path: String) -> void:
	_close_picker()
	if path.is_empty() or busy():
		return
	action = ""
	preview = {}
	status = "Читаю выбранную копию…"
	if reader.start(_extract.bind(path)) != OK:
		status = "Не удалось открыть копию."
	else:
		set_process(true)
	updated.emit()

func _extract(path: String) -> Dictionary:
	# The local Mac checkout already has its Steam release's Electron runtime.
	var root := ProjectSettings.globalize_path("res://").path_join("..").simplify_path()
	var engine := root.path_join("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
	var tool := root.path_join("godot/tools/read-steam-save.cjs")
	if not FileAccess.file_exists(engine) or not FileAccess.file_exists(tool):
		return {"error":"helper"}
	var output: Array = []
	var args := PackedStringArray(["--headless","--mute-audio","--disable-audio-output",tool,"--source="+path])
	var result := OS.execute(engine,args,output,true)
	for chunk: String in output:
		for line in chunk.split("\n",false):
			if line.begins_with("PIZZA_ERROR="):
				return {"error":line.trim_prefix("PIZZA_ERROR=")}
			if result == 0 and line.begins_with("PIZZA_SAVE="):
				var value: Variant = JSON.parse_string(line.trim_prefix("PIZZA_SAVE="))
				if value is Dictionary and value.get("version") == 1 and value.get("career") is Dictionary:
					return value
	return {"error":"read"}

func _process(_dt: float) -> void:
	if not reader.is_started() or reader.is_alive():
		return
	var value: Dictionary = reader.wait_to_finish()
	set_process(false)
	if value.has("error"):
		match str(value.error):
			"helper": status = "Для чтения копии нужен Electron из локального проекта."
			"leveldb-folder": status = "Выберите копию папки Local Storage или leveldb игры."
			"no-game-data": status = "В выбранной копии нет сохранения Птицы Пиццы."
			_: status = "Копия повреждена или имеет другой формат."
	else:
		preview = value
		action = "import"
		status = ""
	updated.emit()

func ask(type: String) -> void:
	if busy():
		return
	preview = {}
	action = type
	status = ""
	updated.emit()

func cancel() -> void:
	if busy():
		return
	preview = {}
	action = ""
	status = ""
	updated.emit()

func apply() -> void:
	if busy():
		return
	var ok := false
	if profile.data.has("pending_transfer"):
		ok = profile.complete_transfer(achievements,quick)
		if not ok:
			status = "Не удалось завершить перенос. Можно повторить."
			updated.emit()
			return
		if action.is_empty():
			status = "Перенос завершён."
			changed.emit()
			updated.emit()
			return
	var prior: Dictionary = quick.snapshot_progress()
	match action:
		"import":
			if not preview.has("career"):
				return
			ok = profile.replace(preview.career,preview.quick,preview.awards,prior)
		"reset": ok = profile.reset_progress(prior)
		"restore": ok = profile.restore_previous(prior)
		"repair": ok = profile.save()
	if not ok:
		status = "Не удалось записать сохранение."
		updated.emit()
		return
	preview = {}
	action = ""
	if not profile.complete_transfer(achievements,quick):
		status = "Не удалось завершить перенос. Можно повторить."
	else:
		status = "Готово. Прогресс сохранён."
	changed.emit()
	updated.emit()

func _exit_tree() -> void:
	if reader.is_started():
		reader.wait_to_finish()
