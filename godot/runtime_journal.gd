extends Node

const LOG_PATH := "user://south-runtime.jsonl"
const LONG_FRAME_USEC := 50000
const REPORT_GAP_USEC := 500000
const FILE_LIMIT := 512 * 1024

class GameLogger extends Logger:
	var lock := Mutex.new()
	var errors: Array[Dictionary] = []

	func _log_error(function: String, file: String, line: int, code: String, rationale: String,
			_editor_notify: bool, error_type: int, backtraces: Array[ScriptBacktrace]) -> void:
		if error_type == ERROR_TYPE_WARNING:
			return
		var result := {"type":"engine_error","file":file.get_file(),"line":line,"function":function,
			"message":(rationale if not rationale.is_empty() else code).left(512)}
		if not backtraces.is_empty() and backtraces[0].get_frame_count()>0:
			result.script = backtraces[0].get_frame_file(0).get_file()
			result.script_line = backtraces[0].get_frame_line(0)
		lock.lock()
		if errors.size()<32:
			errors.append(result)
		lock.unlock()

	func drain() -> Array[Dictionary]:
		lock.lock()
		var copied := errors
		errors = []
		lock.unlock()
		return copied

var context: Callable
var logger: GameLogger
var path := LOG_PATH
var pending: Array[Dictionary] = []
var last_usec := 0
var last_report_usec := 0
var since_flush := 0.0


func setup(current: Callable, temporary: bool, destination := LOG_PATH) -> void:
	context = current
	path = destination
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(not temporary)
	if temporary:
		return
	logger = GameLogger.new()
	OS.add_logger(logger)
	record({"type":"start"})


func _process(delta: float) -> void:
	var now := Time.get_ticks_usec()
	var elapsed := now-last_usec
	var focused := DisplayServer.get_name()!="headless" and get_window().has_focus()
	var active := focused and not get_tree().paused
	if active and last_usec>0 and elapsed>LONG_FRAME_USEC and now-last_report_usec>REPORT_GAP_USEC:
		last_report_usec = now
		record({"type":"long_frame","ms":float(elapsed)*.001,
			"process_ms":Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,
			"physics_ms":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0,
			"draws":int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))})
	last_usec = now if active else 0
	since_flush += delta
	if since_flush >= 2.0:
		since_flush = 0.0
		_flush()


func record(event: Dictionary) -> void:
	if not logger or pending.size()>=64:
		return
	if context.is_valid():
		event.merge(context.call())
	event.at = int(Time.get_unix_time_from_system())
	pending.append(event)


func _flush() -> void:
	if not logger:
		return
	for error in logger.drain():
		record(error)
	if pending.is_empty():
		return
	var file := FileAccess.open(path,FileAccess.READ_WRITE)
	if file == null:
		file = FileAccess.open(path,FileAccess.WRITE)
	elif file.get_length()>FILE_LIMIT:
		file.close()
		DirAccess.rename_absolute(ProjectSettings.globalize_path(path),ProjectSettings.globalize_path(path+".previous"))
		file = FileAccess.open(path,FileAccess.WRITE)
	if file == null:
		pending.clear()
		return
	file.seek_end()
	for event in pending:
		file.store_line(JSON.stringify(event))
	file.close()
	pending.clear()


func _exit_tree() -> void:
	if logger:
		OS.remove_logger(logger)
		_flush()
		logger = null
