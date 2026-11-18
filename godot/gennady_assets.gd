extends RefCounted

const SOUND := preload("res://semerka_motor_audio.gd")
const FOLDER := "res://assets/gennady/"
const FILES := ["idle.png","talk.png","blink.png","angry.png","smile.png",
	"family-dacha.webp","family-room.webp","gennady-chairman.webp",
	"step.wav","ring.wav","wrong.wav","open.wav","slam.wav"]

var assets: Dictionary = {}
var _thread: Thread
var _decoded: Dictionary = {}
var failure := ""
var silent := false

func prepare() -> void:
	if _thread or not assets.is_empty() or not _decoded.is_empty():
		return
	failure = ""
	silent = SOUND.dummy_driver()
	_thread = Thread.new()
	if _thread.start(_read_sources) != OK:
		_thread = null
		failure = "asset worker"

func _read_sources() -> Dictionary:
	var loaded := {}
	for filename: String in FILES:
		if silent and filename.ends_with(".wav"):
			loaded[filename.get_basename()] = null
			continue
		var path := FOLDER + filename
		var item: Resource
		if (not FileAccess.file_exists(path) or FileAccess.file_exists(path+".import")) and ResourceLoader.exists(path):
			item = ResourceLoader.load(path)
		if not item and FileAccess.file_exists(path):
			if filename.ends_with(".wav"):
				item = AudioStreamWAV.load_from_file(path)
			else:
				var source := Image.new()
				if source.load(path) == OK:
					item = source
		if not item:
			return {"error":path}
		loaded[filename.get_basename()] = item
	return loaded

func step() -> bool:
	if _thread:
		if _thread.is_alive():
			return false
		_decoded = _thread.wait_to_finish()
		_thread = null
		if _decoded.has("error"):
			failure = _decoded.error
			_decoded.clear()
			return false
	if _decoded.is_empty():
		return assets.size() == FILES.size()
	# Only one uncached texture upload per frame while the player is driving to the house.
	var key: String = _decoded.keys().back()
	var item: Resource = _decoded[key]
	assets[key] = ImageTexture.create_from_image(item as Image) if item is Image else item
	_decoded.erase(key)
	return assets.size() == FILES.size()

func close() -> void:
	if _thread:
		_thread.wait_to_finish()
		_thread = null
