extends Node

const LIBRARY := "res://assets/audio/"
var music_files := {}
var effect_files := {}
var loaded := {}
var jobs := {}

func scan() -> void:
	var root := ProjectSettings.globalize_path("res://").path_join("../public").simplify_path()
	_index(root.path_join("music"),music_files,true)
	_index(root.path_join("sfx"),effect_files,false)

func _index(directory: String, catalog: Dictionary, music: bool) -> void:
	var folder := DirAccess.open(directory)
	if not folder:
		return
	for file in folder.get_files():
		if not file.get_extension().to_lower() in ["ogg","mp3","wav"]:
			continue
		var key := file.get_basename()
		var split := key.rfind("-")
		if split > 0 and key.substr(split+1).is_valid_int():
			key = key.left(split)
		if music and not key in ["menu","day","night","tense","shiftend"]:
			continue
		if not catalog.has(key):
			catalog[key] = []
		catalog[key].append(directory.path_join(file))

func effect_path(id: String) -> String:
	if effect_files.has(id):
		return effect_files[id].pick_random()
	return LIBRARY + id + ".ogg"

func request(path: String) -> AudioStream:
	if loaded.has(path):
		return loaded[path]
	if not jobs.has(path):
		jobs[path] = WorkerThreadPool.add_task(_read.bind(path),false,"Audio " + path.get_file())
	return null

func _read(path: String) -> void:
	var stream: AudioStream
	if FileAccess.file_exists(path):
		match path.get_extension().to_lower():
			"ogg": stream = AudioStreamOggVorbis.load_from_file(path)
			"mp3": stream = AudioStreamMP3.load_from_file(path)
			"wav": stream = AudioStreamWAV.load_from_file(path)
	elif path.begins_with("res://") and ResourceLoader.exists(path):
		stream = ResourceLoader.load(path) as AudioStream
	_receive.call_deferred(path,stream)

func _receive(path: String, stream: AudioStream) -> void:
	if jobs.has(path):
		WorkerThreadPool.wait_for_task_completion(jobs[path])
		jobs.erase(path)
	loaded[path] = stream

func _exit_tree() -> void:
	for task: int in jobs.values():
		WorkerThreadPool.wait_for_task_completion(task)
	jobs.clear()
