extends Node

const RAIN := preload("res://rain.gdshader")
const SHIFT_SECONDS := 240.0

@onready var sun: DirectionalLight3D = $"../Sun"
@onready var environment: Environment = $"../Summer".environment

var sky: ShaderMaterial
var scene_paint: ShaderMaterial
var ground_paint: ShaderMaterial
var window_paint: ShaderMaterial
var car: CharacterBody3D
var camera: Camera3D
var street_lights: Node3D
var night := 0.0
var elapsed := 0.0
var weather := "clear"
var wet := 0.0
var puddles := 0.0
var rain_material: ShaderMaterial
var streaks: MultiMeshInstance3D


func _ready() -> void:
	sky = environment.sky.sky_material
	_apply_sun()


func configure(vehicle: CharacterBody3D, view: Camera3D, paint: ShaderMaterial, soil: ShaderMaterial, windows: ShaderMaterial, lights: Node3D) -> void:
	car = vehicle
	camera = view
	scene_paint = paint
	ground_paint = soil
	window_paint = windows
	street_lights = lights
	for arg in OS.get_cmdline_user_args():
		if arg == "--night":
			elapsed = SHIFT_SECONDS
		if arg in ["--weather=rain","--weather=storm"]:
			weather = arg.trim_prefix("--weather=")
	if weather != "clear":
		_make_rain()


func set_retro_profile(ps2: bool) -> void:
	environment.fog_depth_begin = 117.0 if ps2 else 63.0
	environment.fog_depth_end = 410.0 if ps2 else 273.0
	environment.fog_density = 0.68 if ps2 else 0.89


func _process(delta: float) -> void:
	elapsed = minf(elapsed+delta,SHIFT_SECONDS)
	_apply_sun()
	if not is_instance_valid(car):
		return
	car.headlamps = night > 0.32 or wet > 0.65
	street_lights.update_lights(night)
	if weather != "clear":
		_rain_step(delta)


func _apply_sun() -> void:
	var day := minf(elapsed/SHIFT_SECONDS,1.0)
	var azimuth := lerpf(1.94,0.75,day)
	var height := 0.52 + sin(day*PI*1.16)*0.30 - day*0.32
	night = smoothstep(172.0,222.0,elapsed)
	var day_direction := Vector3(cos(azimuth),height,sin(azimuth)).normalized()
	var moon_direction := Vector3(-0.38,0.69,0.61).normalized()
	var direction := day_direction.lerp(moon_direction,night).normalized()
	sun.look_at(sun.position-direction)
	var clouds := 0.73+sin(elapsed*0.066+0.6)*0.13+sin(elapsed*0.019)*0.06
	var dark := night
	if window_paint:
		window_paint.set_shader_parameter(&"dusk",dark)
	var warm := smoothstep(139.0,187.0,elapsed)*(1.0-dark)
	sun.light_energy = lerpf(lerpf(0.81,1.08,clouds),0.12,dark)*lerpf(1.0,0.37,wet)
	sun.light_color = Color("#ffe5bd").lerp(Color("#ffad78"),warm).lerp(Color("#b8d2ff"),dark)
	environment.ambient_light_color = Color("#b4c5e3").lerp(Color("#8da6cf"),dark)
	environment.ambient_light_energy = lerpf(lerpf(0.30,0.22,clouds),0.42,dark)
	environment.fog_light_color = Color("#b7ad8c").lerp(Color("#374257"),dark).lerp(Color("#8898a2"),wet*0.65)
	sky.set_shader_parameter(&"sun_vector",direction)
	sky.set_shader_parameter(&"daylight",day)
	sky.set_shader_parameter(&"darkness",dark)
	sky.set_shader_parameter(&"overcast",wet)


func _make_rain() -> void:
	streaks = MultiMeshInstance3D.new()
	var drops := MultiMesh.new()
	drops.transform_format = MultiMesh.TRANSFORM_3D
	drops.use_custom_data = true
	var quad := QuadMesh.new()
	quad.size = Vector2(0.028,1.0)
	rain_material = ShaderMaterial.new()
	rain_material.shader = RAIN
	quad.material = rain_material
	drops.mesh = quad
	drops.instance_count = 1400
	for i in drops.instance_count:
		drops.set_instance_transform(i,Transform3D.IDENTITY)
		drops.set_instance_custom_data(i,Color(randf(),randf(),randf(),randf()))
	drops.custom_aabb = AABB(Vector3(-28.0,0.0,-28.0),Vector3(56.0,29.0,56.0))
	streaks.multimesh = drops
	streaks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	get_parent().add_child.call_deferred(streaks)


func _rain_step(delta: float) -> void:
	var target := 0.64+sin(elapsed*0.061)*0.28 if weather == "rain" else 0.99
	wet = move_toward(wet,target,delta*0.12)
	puddles = move_toward(puddles,wet if wet > 0.5 else 0.0,delta/(70.0 if wet > 0.5 else 150.0))
	car.wet = wet
	ground_paint.set_shader_parameter(&"ground_wetness", wet)
	scene_paint.set_shader_parameter(&"road_wetness",wet)
	scene_paint.set_shader_parameter(&"water_film",puddles)
	rain_material.set_shader_parameter(&"rain_amount",wet)
	var point := camera.position
	var ground: float = car.terrain.at(point.x,point.z)
	streaks.position = Vector3(point.x,ground,point.z)
