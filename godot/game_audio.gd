extends Node

signal track_changed(title: String)
const BANK := preload("res://game_audio_bank.gd")
const MOTOR_AUDIO := preload("res://semerka_motor_audio.gd")
const PREFS := "user://audio_settings.cfg"
const IDS := ["asphalt","rain","lanterns","snow","beach","mandarins"]
const TITLES := ["Тёплый асфальт","Двор после дождя","Фонари на проспекте","Снег на антенне","Пляж на речке","Мандарины и куранты"]
const POOLS := {"menu":[0,1],"day":[0,1],"night":[2,1],"winter":[3,0],"winterNight":[3,2],"summer":[4,0],"newyear":[5,3]}
const BUS := ["Music","Effects","Motor"]
const SILENCE := -80.0

var bank: BANK
var settings := ConfigFile.new()
var muted := false
var music_off := false
var unavailable := true
var levels := {"Music":100.0,"Effects":100.0,"Motor":100.0}
var scene := "menu"
var night := false
var season := "winter"
var holiday := ""
var weather := "clear"
var rain := 0.0
var night_amount := 0.0
var green := 0.4
var traffic := 0.35
var paused_scene := false
var duck := 1.0
var current_duck := 1.0
var tension := 0.0
var ear: Node3D
var location_tick := 0
var plate: Label
var plate_time := 0.0
var music: Array[AudioStreamPlayer] = []
var playing := -1
var cur_path := ""
var next_path := ""
var cur_index := -1
var next_index := -1
var transition := 2.5
var fade := 1.0
var pinned := false
var mood := ""
var previous_title := ""
var interval := 0.0
var amb := {}
var cue_pool: Array[AudioStreamPlayer] = []
var spatial_pool: Array[AudioStreamPlayer3D] = []
var requests: Array[Dictionary] = []
var _ready_audio := false

func setup(car: Node3D) -> void:
	if _ready_audio:
		return
	_ready_audio = true
	add_to_group(&"game_audio")
	process_mode = Node.PROCESS_MODE_ALWAYS
	ear = car
	unavailable = MOTOR_AUDIO.dummy_driver()
	settings.load(PREFS)
	var legacy := ConfigFile.new()
	legacy.load("user://game_settings.cfg")
	muted = bool(settings.get_value("mix","muted",legacy.get_value("sound","mute",false)))
	music_off = bool(settings.get_value("mix","music_off",false))
	for k: String in BUS:
		levels[k] = clampf(float(settings.get_value("mix",k,legacy.get_value("sound","volume",100.0))),0.0,100.0)
		var index := AudioServer.get_bus_index(k)
		if index < 0:
			AudioServer.add_bus()
			index = AudioServer.bus_count-1
			AudioServer.set_bus_name(index,k)
			AudioServer.set_bus_send(index,&"Master")
		_apply_bus(k)
	AudioServer.set_bus_mute(0,muted)
	if unavailable:
		return
	bank = BANK.new()
	add_child(bank)
	bank.scan()
	for i in 2:
		var player := AudioStreamPlayer.new()
		player.bus = &"Music"
		add_child(player)
		music.append(player)
	for i in 12:
		var player := AudioStreamPlayer.new()
		player.bus = &"Effects"
		add_child(player)
		cue_pool.append(player)
		var world := AudioStreamPlayer3D.new()
		world.bus = &"Effects"
		world.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED
		add_child(world)
		spatial_pool.append(world)
	for player in get_tree().root.find_children("*","AudioStreamPlayer",true,false):
		_route(player)
	for player in get_tree().root.find_children("*","AudioStreamPlayer3D",true,false):
		_route(player)
	get_tree().node_added.connect(_route)
	var overlay := CanvasLayer.new()
	overlay.layer = 3
	add_child(overlay)
	plate = Label.new()
	overlay.add_child(plate)
	plate.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	plate.offset_left = 20
	plate.offset_top = -70
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_theme_constant_override("outline_size",4)
	plate.add_theme_color_override("font_outline_color",Color("#201e25"))
	plate.hide()
	if is_instance_valid(car):
		car.engine.stalled.connect(cue.bind("engine-stall"))
		car.drowned.connect(cue.bind("drown"))
	_music_tick()

func _route(node: Node) -> void:
	if not (node is AudioStreamPlayer or node is AudioStreamPlayer3D) or node.bus != &"Master":
		return
	var owner_node := node.get_parent()
	node.bus = &"Motor" if owner_node and owner_node.get_script() == MOTOR_AUDIO else &"Effects"

func set_context(place: String, night_state: bool, paused := false, volume_duck := 1.0) -> void:
	scene = place
	night = night_state
	paused_scene = paused
	duck = minf(0.4,volume_duck) if paused else volume_duck

func set_environment(season_id: String, weather_id: String, night_level: float, rain_level := 0.0, festival := "") -> void:
	season = season_id
	weather = weather_id
	holiday = festival
	night_amount = clampf(night_level,0,1)
	rain = clampf(rain_level,0,1)
	if night_amount > 0.6:
		night = true
	elif night_amount < 0.4:
		night = false

func tense() -> void:
	tension = 6.0

func set_level(channel: String, value: float) -> void:
	if not levels.has(channel):
		return
	levels[channel] = clampf(value,0,100)
	_apply_bus(channel)
	_save(channel,levels[channel])

func _apply_bus(channel: String) -> void:
	var fraction := float(levels[channel])/100.0
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(channel),linear_to_db(maxf(0.0001,fraction*fraction)))

func set_muted(value: bool) -> void:
	muted = value
	AudioServer.set_bus_mute(0,muted)
	_save("muted",muted)
	_publish(true)

func toggle_mute() -> void:
	set_muted(not muted)

func toggle_music() -> void:
	music_off = not music_off
	_save("music_off",music_off)
	pinned = false
	if not unavailable:
		_music_tick()
	_publish(true)

func _save(key: String, value: Variant) -> void:
	settings.set_value("mix",key,value)
	settings.save(PREFS)

func title() -> String:
	if music_off or muted:
		return tr("музыка выкл")
	if cur_index >= 0:
		return tr(TITLES[cur_index])
	return cur_path.get_file().get_basename() if not cur_path.is_empty() else tr("музыка")

func _publish(force := false) -> void:
	var label := title()
	if force or label != previous_title:
		previous_title = label
		track_changed.emit(label)
		if scene == "drive" and not paused_scene and is_instance_valid(plate) and plate.is_inside_tree():
			plate.text = "♫  "+label
			plate_time = 2.6
			plate.show()

func _process(dt: float) -> void:
	if unavailable or not _ready_audio:
		return
	plate_time = maxf(0.0,plate_time-dt)
	plate.visible = plate_time > 0.0 and scene == "drive" and not paused_scene
	tension = maxf(0.0,tension-dt)
	current_duck = lerpf(current_duck,duck,1.0-exp(-dt/0.25))
	fade = minf(1.0,fade+dt/maxf(0.01,transition))
	for i in music.size():
		var player := music[i]
		if not player.playing:
			continue
		var k := fade if i == playing else 1.0-fade
		if k <= 0.0 and i != playing:
			player.stop()
		else:
			var level := 1.0 if bool(player.get_meta("chip",true)) else 0.4
			player.volume_db = linear_to_db(maxf(0.0001,k*current_duck*level))
	interval -= dt
	if interval <= 0:
		interval = 0.1
		_music_tick()
		_ambience()
	for i in range(requests.size()-1,-1,-1):
		var entry := requests[i]
		entry.left -= dt
		var stream := bank.request(entry.path)
		if stream:
			_play_cue(entry,stream)
		if stream or entry.left <= 0 or bank.loaded.has(entry.path):
			requests.remove_at(i)

func _slot() -> String:
	if scene == "menu" or scene == "shiftend":
		return scene
	if tension > 0.0 and bank.music_files.has("tense"):
		return "tense"
	return "night" if night else "day"

func _pool() -> Array:
	if holiday == "newyear":
		return POOLS.newyear
	var is_night := night and scene == "drive"
	if season == "winter":
		return POOLS.winterNight if is_night else POOLS.winter
	if is_night:
		return POOLS.night
	if season == "summer":
		return POOLS.summer
	return POOLS.menu if scene == "menu" else POOLS.day

func _files() -> Array:
	var slot := _slot()
	for k: String in [slot,{"day":"night","night":"day","shiftend":"menu"}.get(slot,"")]:
		if bank.music_files.has(k):
			var good: Array = []
			for path: String in bank.music_files[k]:
				if not bank.loaded.has(path) or bank.loaded[path] != null:
					good.append(path)
			if not good.is_empty():
				return good
	return []

func next_track() -> void:
	if music_off:
		toggle_music()
		return
	if unavailable or scene == "interior":
		return
	var files := _files()
	pinned = true
	if files.is_empty():
		_queue_chip((cur_index+1)%IDS.size(),1.2)
	else:
		_queue_file(files[(files.find(cur_path)+1)%files.size()],-1,1.2)

func _queue_chip(index: int, secs: float) -> void:
	_queue_file(BANK.LIBRARY+IDS[index]+".ogg",index,secs)

func _queue_file(path: String, index: int, secs: float) -> void:
	next_path = path
	next_index = index
	transition = secs
	bank.request(path)

func _music_tick() -> void:
	if scene == "interior" or music_off:
		next_path = ""
		if playing >= 0:
			cur_path = ""
			cur_index = -1
			playing = -1
			transition = 0.6
			fade = 0.0
			_publish()
		return
	if not next_path.is_empty():
		var stream := bank.request(next_path)
		if stream:
			playing = 0 if playing != 0 else 1
			var player := music[playing]
			player.stop()
			player.stream = stream
			player.volume_db = SILENCE
			player.set_meta("chip",next_index >= 0)
			player.play()
			cur_path = next_path
			cur_index = next_index
			next_path = ""
			fade = 0.0
			_publish()
		elif bank.loaded.has(next_path):
			next_path = ""
		return
	var ending := playing < 0 or not music[playing].playing or music[playing].stream.get_length()-music[playing].get_playback_position() < 2.5
	var files := _files()
	if not files.is_empty():
		if ending or not cur_path in files:
			_queue_file(files[(files.find(cur_path)+1)%files.size()],-1,2.5)
		return
	var pool := _pool()
	if ending or (not pinned and not cur_index in pool):
		pinned = false
		_queue_chip(pool[(pool.find(cur_index)+1)%pool.size()],2.5)

func cue(id: String, at := Vector3.INF, strength := 1.0, far := 90.0) -> void:
	if unavailable or muted or requests.size() >= 24:
		return
	var path := bank.effect_path(id)
	var entry := {"path":path,"at":at,"gain":strength,"far":far,"left":0.35,"id":id}
	var stream := bank.request(path)
	if stream:
		_play_cue(entry,stream)
	elif not bank.loaded.has(path):
		requests.append(entry)

func impact(material: String, speed: float, at := Vector3.INF) -> void:
	if speed < 2.5:
		return
	if not material in ["wall","car","pole","fence","person","bin","tree","curb","rail"]:
		material = "wall"
	var tier := "heavy" if speed >= 15.0 else ("mid" if speed >= 8 else "light")
	cue("hit-"+material+"-"+tier,at)

func _play_cue(entry: Dictionary, stream: AudioStream) -> void:
	var at: Vector3 = entry.at
	var gain := float(entry.gain)
	if not str(entry.path).begins_with(BANK.LIBRARY):
		gain *= 0.45
	var is_world := at.is_finite() and is_instance_valid(ear)
	var pool: Array = spatial_pool if is_world else cue_pool
	if is_world:
		var dist := Vector2(at.x-ear.global_position.x,at.z-ear.global_position.z).length()
		if dist >= float(entry.far):
			return
		var k := 1.0-clampf((dist-5.0)/maxf(1.0,float(entry.far)-5.0),0,1)
		gain *= k*k*0.6+k*0.4
	for player: Variant in pool:
		if player.playing:
			continue
		if is_world:
			player.global_position = at
			player.panning_strength = minf(1.0,ear.global_position.distance_to(at)/10.0)
		player.bus = &"Motor" if str(entry.id).begins_with("engine-") else &"Effects"
		player.volume_db = linear_to_db(maxf(0.0001,gain))
		player.pitch_scale = randf_range(0.95,1.05)
		player.stream = stream
		player.play()
		return

func _sample_location() -> void:
	if not is_instance_valid(ear) or not ear.terrain:
		return
	var at := ear.global_position
	var greenery := 0
	var pavement := 0
	for offset: Vector2 in [Vector2.ZERO,Vector2(12,0),Vector2(-12,0),Vector2(0,12),Vector2(0,-12)]:
		var surface: int = ear.terrain.material_at(at.x+offset.x,at.z+offset.y)
		greenery += int(surface == 1)
		pavement += int(surface == 0)
	green = greenery*0.2
	traffic = pavement*0.2

func _ambience() -> void:
	location_tick = (location_tick+1)%5
	if location_tick == 1:
		_sample_location()
	var targets := {}
	if scene == "interior":
		targets["amb-stairwell"] = 0.55
	elif (scene == "drive" and not paused_scene) or scene == "menu":
		var day := 1.0-night_amount
		var winter := season == "winter"
		targets["amb-city"] = (0.35+0.65*traffic)*(1.0-0.5*night_amount)*(1.0-0.35*rain)
		targets["amb-birds"] = day*day*pow(1-rain,2)*(0.2 if winter else 1.0)*(0.25+0.75*green)*(1.0-0.4*traffic)
		targets["amb-crickets"] = smoothstep(0.5,0.9,night_amount)*(1-rain)*float({"summer":1.0,"spring":0.4,"autumn":0.5}.get(season,0.0))*(0.35+0.65*green)
		targets["amb-wind"] = 0.18+0.2*rain+(0.2 if winter else 0.0)-0.08*traffic
		if rain > 0:
			targets["amb-rain-roof"] = rain*(1.0 if weather in ["storm","hurricane"] else 0.7)
		if weather == "hurricane":
			targets["amb-storm-wind"] = 0.8
	var keys := targets.keys()
	keys.sort_custom(func(a: String,b: String): return float(targets[a]) > float(targets[b]))
	for i in keys.size():
		if i >= 4 or float(targets[keys[i]]) < 0.008:
			targets.erase(keys[i])
	var mix := 0.5 if scene == "menu" else 1.0
	if not music_off and playing >= 0:
		mix *= 1.0-0.3*pow(float(levels.Music)/100.0,2)*current_duck
	for id: String in targets:
		if amb.has(id):
			continue
		var stream := bank.request(bank.effect_path(id))
		if not stream:
			continue
		var player := AudioStreamPlayer.new()
		player.bus = &"Effects"
		player.stream = stream
		player.volume_db = SILENCE
		add_child(player)
		player.finished.connect(player.play)
		player.play()
		amb[id] = player
	for id: String in amb.keys():
		var player: AudioStreamPlayer = amb[id]
		var volume := lerpf(db_to_linear(player.volume_db),float(targets.get(id,0))*mix,1.0-exp(-0.1/0.5))
		if not targets.has(id) and volume < 0.001:
			player.stop()
			player.queue_free()
			amb.erase(id)
		else:
			player.volume_db = linear_to_db(maxf(0.0001,volume))

func _input(event: InputEvent) -> void:
	if not _ready_audio or not event.is_pressed() or event.is_echo():
		return
	var key: int = event.physical_keycode if event is InputEventKey else -1
	var btn: int = event.button_index if event is InputEventJoypadButton else -1
	if key == KEY_M or btn == JOY_BUTTON_RIGHT_STICK:
		toggle_mute()
	elif key == KEY_B or btn == JOY_BUTTON_LEFT_STICK:
		toggle_music()
	elif key == KEY_F or (btn == JOY_BUTTON_DPAD_DOWN and scene == "drive" and not paused_scene):
		next_track()
	else:
		return
	get_viewport().set_input_as_handled()
