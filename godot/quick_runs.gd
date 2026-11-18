extends Node

signal repeat_requested
signal conditions_requested
signal menu_requested

const PROFILE := preload("res://career_profile.gd")
const SHIFT := preload("res://quick_shift.gd")
const DISASTER := preload("res://quick_disaster.gd")
const RESULT := preload("res://quick_result.gd")
const SAVE := "user://quick_runs.cfg"
const WEIGHTS := {
	"winter":{"clear":65,"snowy":35}, "summer":{"clear":62,"heat":15,"rain":13,"storm":7,"hurricane":3},
	"autumn":{"clear":48,"golden":30,"rain":12,"storm":6,"hurricane":4}, "spring":{"clear":64,"rain":25,"storm":8,"hurricane":3}
}
const TITLES := {"time":"заезд окончен","quit":"ты сам закончил заезд","pulled":"сняли с заезда","dead":"заезд сорвался"}

var conditions := {}
var original_options := {}
var state := ConfigFile.new()
var effects := DISASTER.new()
var paper := RESULT.new()
var running := false
var temporary := false
var writable := true
var car: CharacterBody3D
var mode := ""

func setup(vehicle: CharacterBody3D, terrain: RefCounted, region: Dictionary, traffic: Node3D, walkers: Array = []) -> void:
	car = vehicle
	add_child(effects)
	effects.setup(vehicle,terrain,region,traffic,walkers)
	effects.history_changed.connect(_save_damage)
	add_child(paper)
	paper.setup()
	paper.repeat_requested.connect(func(): repeat_requested.emit())
	paper.conditions_requested.connect(func(): conditions_requested.emit())
	paper.menu_requested.connect(func(): menu_requested.emit())
	var error := state.load(SAVE)
	if error not in [OK, ERR_FILE_NOT_FOUND]:
		writable = false
		push_warning("Could not read quick-run results: " + error_string(error))

func active() -> bool:
	return running

func results_open() -> bool:
	return paper.visible

func begin(career: RefCounted, options: Dictionary) -> RefCounted:
	var id := str(options.get("mode","normal"))
	if id not in ["normal","hell","afterhell"] or (id == "normal" and int(career.data.shifts) < 1):
		return null
	if running:
		return null
	temporary = career.in_memory
	paper.dismiss()
	original_options = options.duplicate(true)
	conditions = options.duplicate(true)
	mode = id
	conditions.mode = id
	if id == "normal":
		var season := str(options.get("season","now"))
		if not WEIGHTS.has(season):
			season = str(career.data.get("season","winter"))
		if not WEIGHTS.has(season):
			season = "winter"
		var weights: Dictionary = WEIGHTS[season]
		var weather := str(options.get("weather","auto"))
		if not weights.has(weather):
			var roll := randi_range(1,100)
			for name_: String in weights:
				roll -= int(weights[name_])
				if roll <= 0:
					weather = name_
					break
		var length_id := str(options.get("len","medium"))
		conditions.merge({"weather":weather, "season":season,"len":length_id if length_id in ["short","medium","long"] else "medium"},true)
	else:
		conditions.merge({"weather":"clear","season":"summer","len":"short"},true)
	var sandbox := PROFILE.new()
	sandbox.open(true)
	sandbox.data = career.data.duplicate(true)
	# Story customers and progression never enter the quick-run pool.
	sandbox.data.gennady_paid = true
	running = true
	state.set_value("quick","runs",int(state.get_value("quick","runs",0))+1)
	_store()
	if id != "normal":
		_begin_effects.call_deferred(id)
	return sandbox

func _begin_effects(requested_mode: String) -> void:
	if running and mode == requested_mode:
		effects.begin(mode,state.get_value("hell","history",{}))

func _save_damage() -> void:
	if running and mode == "hell":
		state.set_value("hell","history",effects.history())
		_store()

func make_shift() -> RefCounted:
	var shift := SHIFT.new()
	shift.length_id = str(conditions.get("len","medium"))
	return shift

func protect_order(order: Dictionary) -> void:
	effects.protect_order(order)

func finish(shift: RefCounted, kind: String, people := 0) -> void:
	if not running:
		return
	running = false
	var earned := maxi(0,shift.money)
	var previous := int(state.get_value("quick","best",0))
	var rec := mode == "normal" and earned > previous
	if rec:
		state.set_value("quick","best",earned)
		state.set_value("quick","best_delivered",shift.delivered)
	if mode == "hell":
		state.set_value("hell","history",effects.history())
	effects.stop()
	_store()
	paper.result({
		"number":int(state.get_value("quick","runs",1)),"title":TITLES.get(kind,TITLES.dead),"kind":kind,
		"delivered":shift.delivered,"hits":shift.hits,"tips":shift.tips,"people":people,"fine":shift.penalties,
		"earned":earned,"record":rec and previous > 0,"previous":previous if mode == "normal" else 0,
		"mode":mode,"season":conditions.season,"clock":shift.clock_text()
	})

func abort() -> void:
	if not running:
		return
	running = false
	if mode == "hell":
		state.set_value("hell","history",effects.history())
		_store()
	effects.stop()
	paper.dismiss()

func show_records(career_best: Dictionary = {}) -> void:
	paper.records(career_best,int(state.get_value("quick","best",0)),int(state.get_value("quick","best_delivered",0)))

func _store() -> void:
	if temporary or not writable:
		return
	var pending := SAVE + ".tmp"
	var error := state.save(pending)
	if error == OK:
		error = DirAccess.rename_absolute(ProjectSettings.globalize_path(pending),ProjectSettings.globalize_path(SAVE))
	if error != OK:
		push_warning("Could not save quick-run results: " + error_string(error))
