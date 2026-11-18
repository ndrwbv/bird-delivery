extends Node3D

const SOUND := preload("res://semerka_motor_audio.gd")
const THUNDER := "res://assets/weather/thunder.wav"
var enabled := false
var hurricane := false
var flash := 0.0
var _random := RandomNumberGenerator.new()
var _next := 6.0
var _thunder_delay := -1.0
var _pulses := PackedVector3Array()
var _age := 0.0
var _bolt := MeshInstance3D.new()
var _ribbon := ImmediateMesh.new()
var _paint := StandardMaterial3D.new()
var _sound := AudioStreamPlayer3D.new()

func _ready() -> void:
	_paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_paint.cull_mode = BaseMaterial3D.CULL_DISABLED
	_paint.disable_fog = true
	_paint.albedo_color = Color("#e4e9ff")
	_bolt.mesh = _ribbon
	_bolt.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_bolt)
	_bolt.hide()
	_sound.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED
	add_child(_sound)

func configure(id: String, seed_value: int) -> void:
	enabled = id == "storm" or id == "hurricane"
	hurricane = id == "hurricane"
	_random.seed = seed_value
	_next = _random.randf_range(4,10) if hurricane else _random.randf_range(6,16)
	_thunder_delay = -1
	flash = 0
	_pulses.clear()
	_bolt.hide()
	_sound.stop()
	if enabled and not _sound.stream and not SOUND.dummy_driver():
		if ResourceLoader.exists(THUNDER) and (not FileAccess.file_exists(THUNDER) or FileAccess.file_exists(THUNDER+".import")):
			_sound.stream = ResourceLoader.load(THUNDER) as AudioStream
		else:
			_sound.stream = AudioStreamWAV.load_from_file(THUNDER)

func step(dt: float, view: Camera3D) -> void:
	if not enabled:
		return
	_next -= dt
	if _next <= 0:
		_strike(view)
		_next = _random.randf_range(4,10) if hurricane else _random.randf_range(6,16)
	if _thunder_delay >= 0:
		_thunder_delay -= dt
		if _thunder_delay < 0 and _sound.stream:
			_sound.play()
	_age += dt
	flash = 0
	for pulse in _pulses:
		if _age >= pulse.x and _age < pulse.y:
			flash = pulse.z
			break
	_bolt.visible = flash > 0

func _strike(view: Camera3D) -> void:
	var distance := _random.randf_range(320,1100)
	var f := -view.global_basis.z
	var a := atan2(f.x,f.z) + _random.randf_range(-0.5,0.5)
	var origin := view.global_position + Vector3(sin(a)*distance,0,cos(a)*distance)
	var side := Vector3(cos(a),0,-sin(a))
	var p := Vector3(_random.randf_range(-40,40),190,_random.randf_range(-40,40))
	var width := 3+distance/140
	_ribbon.clear_surfaces()
	_ribbon.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP,_paint)
	for i in 17:
		var span := width*(1-i/22.0)
		_ribbon.surface_add_vertex(p-side*span)
		_ribbon.surface_add_vertex(p+side*span)
		if i==15:
			p = Vector3.ZERO
		else:
			p += Vector3(_random.randf_range(-14,14),-190.0/16*_random.randf_range(0.8,1.2),_random.randf_range(-8,8))
	_ribbon.surface_end()
	_bolt.global_position = origin
	_sound.global_position = origin
	_sound.volume_db = linear_to_db(0.55*clampf(420/distance,0.25,1))
	_thunder_delay = distance/343.0
	_age = 0
	_pulses.clear()
	var t := 0.0
	for i in _random.randi_range(2,3):
		var end := t+_random.randf_range(0.05,0.11)
		_pulses.append(Vector3(t,end,1 if i==0 else _random.randf_range(0.55,0.9)))
		t = end+_random.randf_range(0.06,0.16)
