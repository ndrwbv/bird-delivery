extends Node

const RAIN := preload("res://rain.gdshader")
const CALENDAR := preload("res://south_calendar.gd")
const PRECIPITATION := preload("res://south_precipitation.gd")
const STORM := preload("res://south_storm.gd")
# Steam SKY_KEYS. Colors, sunlight and night remain tied to the shift's own clock.
const SKY_TIMES := [0.0,0.07,0.62,0.70,0.77,0.93,1.0]
const SUN_COLORS := [Color("#ffcf9a"),Color("#fff4de"),Color("#fff4de"),Color("#ffac6a"),Color("#8fa8ff"),Color("#8fa8ff"),Color("#ffcf9a")]
const FOG_COLORS := [Color("#f3d6bf"),Color("#c6e3f6"),Color("#c6e3f6"),Color("#eab48e"),Color("#1e2746"),Color("#1e2746"),Color("#f3d6bf")]
const HEMI_COLORS := [Color("#ffe6d0"),Color("#e4f3ff"),Color("#e4f3ff"),Color("#ffd2b0"),Color("#5a6a9a"),Color("#5a6a9a"),Color("#ffe6d0")]
const SUN_POWER := [0.85,1.75,1.75,0.9,0.3,0.3,0.85]
const NIGHT := [0.3,0.0,0.0,0.35,1.0,1.0,0.3]

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
var season := "winter"
var season_value := 2.5
var holiday := ""
var snow := 1.0
var ice := 1.0
var wet := 0.0
var grip := 1.0
var puddles := 0.0
var wind := Vector2.ZERO
var rain_material: ShaderMaterial
var streaks: MultiMeshInstance3D
var calendar := CALENDAR.new()
var precipitation := PRECIPITATION.new()
var storm := STORM.new()
var season_materials: Array[ShaderMaterial] = []
var _date := {}
var _last_career := {}
var _clock := 0.06
var _external_clock := false
var _force_night := false
var _force_weather := ""
var _gale_angle := 0.0
var _soil_wet := 0.0
var _sky_delay := 0.0
var _region_paint: ShaderMaterial

func _ready() -> void:
	sky = environment.sky.sky_material
	add_child(storm)
	_apply_sun()

func configure(vehicle: CharacterBody3D, view: Camera3D, paint: ShaderMaterial, soil: ShaderMaterial, windows: ShaderMaterial, lights: Node3D) -> void:
	car = vehicle
	camera = view
	scene_paint = paint
	ground_paint = soil
	window_paint = windows
	street_lights = lights
	var district = get_parent()
	_region_paint = district.region_world.paint
	season_materials.assign([paint,soil,_region_paint,district.region_world.overview.material_override,
		district.leaves.near_paint,district.leaves.far_paint,district.leaves.far_only,district.leaves.verge_paint])
	for name in ["Grass","Crowns","Understory"]:
		var layer := district.get_node(name) as Node3D
		if layer.get_child_count():
			var first := layer.get_child(0) as MeshInstance3D
			if first and first.material_override is ShaderMaterial:
				season_materials.append(first.material_override)
	for arg: String in OS.get_cmdline_user_args():
		if arg == "--night":
			_force_night = true
		elif arg.begins_with("--weather="):
			_force_weather = arg.trim_prefix("--weather=")
	start_career(1,1)

func start_career(number: int, seed_value := 1, first_in_session := false) -> void:
	_date = calendar.at(number,seed_value)
	_last_career = _date.duplicate()
	if first_in_session and _date.weather == "hurricane":
		_date.weather = "storm"
	_external_clock = true
	_begin(_date,number==1,int(CALENDAR.random01(seed_value,number)*2147483647))

func start_quick(season_id := "now", weather_id := "auto", seed_value := 1) -> void:
	var state: Dictionary = _last_career.duplicate() if not _last_career.is_empty() else calendar.at(1,seed_value)
	state.holiday = ""
	if CALENDAR.QUICK.has(season_id):
		state.season = season_id
		state.value = CALENDAR.QUICK[season_id]
	if weather_id in ["","calendar","auto"]:
		state.weather = CALENDAR.pick(CALENDAR.PROBABILITY[state.season], CALENDAR.random01(seed_value,5003))
	else:
		state.weather = weather_id
	_external_clock = false
	_begin(state,false,seed_value)

func set_clock(env_time: float) -> void:
	_external_clock = true
	_clock = fposmod(env_time,1.0)

func _begin(state: Dictionary, novice: bool, seed_value: int) -> void:
	season = state.season
	season_value = state.value
	holiday = state.holiday
	weather = state.weather if _force_weather.is_empty() else _force_weather
	var peak := weather in ["blizzard","downpour"]
	if weather == "blizzard":
		weather = "snowy"
		season = "winter"
		season_value = 2.5
	elif weather == "downpour":
		weather = "rain"
	elif not _force_weather.is_empty():
		var homes := {"heat":"summer","golden":"autumn","snowy":"winter","rain":"spring","storm":"summer","hurricane":"autumn"}
		if homes.has(weather) and not CALENDAR.PROBABILITY[season].has(weather):
			season = homes[weather]
			season_value = CALENDAR.QUICK[season]
	var cover := CALENDAR.cover(season_value,weather)
	snow = cover.snow
	ice = cover.ice
	_soil_wet = cover.soil_wet
	var params := Vector4(snow,cover.leaves,cover.yellow,cover.dry)
	for paint in season_materials:
		paint.set_shader_parameter(&"season_surface",params)
	if is_instance_valid(car):
		car.surface.snow = snow
		car.surface.frozen = snow >= 0.318
		get_node("../CurbGrowth").visible = snow < 0.65
		get_node("../Grass").visible = snow < 0.95
	precipitation.start(weather,season,novice and _force_weather.is_empty(),seed_value,peak)
	if (weather != "clear" or not novice) and not streaks:
		_make_rain()
	wet = 0
	puddles = 0
	elapsed = 0
	_sky_delay = 0
	_clock = 0.06
	_gale_angle = TAU*CALENDAR.random01(seed_value,145)
	storm.configure(weather,seed_value)
	_update_precipitation(0)
	_apply_sun()

func _process(delta: float) -> void:
	if not is_instance_valid(car):
		return
	elapsed += delta
	if not _external_clock:
		_clock = fposmod(_clock+delta/480.0,1.0)
	precipitation.step(delta)
	_update_precipitation(delta)
	storm.step(delta,camera)
	_sky_delay -= delta
	if _sky_delay <= 0 or storm.flash > 0:
		_sky_delay = 1.0/15.0
		_apply_sun()
		street_lights.update_lights(night)
	car.headlamps = night > 0.32 or wet > 0.65

func _update_precipitation(delta: float) -> void:
	wet = precipitation.rain
	grip = 1-minf(1.0,wet+snow*0.32)
	if not is_instance_valid(car):
		return
	puddles = move_toward(puddles,wet if wet>0.5 else 0.0,delta/(70.0 if wet>0.5 else 150.0)) if snow<=0.45 else 0.0
	car.wet = wet
	var gust := 0.0
	if weather == "hurricane":
		gust = clampf(0.67+0.28*sin(elapsed*0.71)+0.19*sin(elapsed*1.83),0.25,1.1)
	wind = Vector2.from_angle(_gale_angle)*gust*6.5
	car.surface.wind = wind
	if not streaks:
		return
	var intensity := maxf(wet,precipitation.flakes)
	streaks.visible = intensity > 0.012
	if streaks.visible:
		rain_material.set_shader_parameter(&"rain_amount",intensity)
		rain_material.set_shader_parameter(&"snowfall",snow>0.45 or precipitation.flakes>wet)
		rain_material.set_shader_parameter(&"crosswind",Vector2.from_angle(_gale_angle)*(gust+precipitation.top))
		var point := camera.global_position
		streaks.position = Vector3(point.x,car.global_position.y-2.0,point.z)
		streaks.multimesh.visible_instance_count = roundi(lerpf(300,1400,intensity))

func _apply_sun() -> void:
	var t := 0.84 if _force_night else _clock
	var i := 0
	while i+1 < SKY_TIMES.size()-1 and t >= float(SKY_TIMES[i+1]):
		i += 1
	var k := smoothstep(SKY_TIMES[i],SKY_TIMES[i+1],t)
	night = lerpf(NIGHT[i],NIGHT[i+1],k)
	var u := fposmod(t-0.97,1.0)/0.765
	var elevation := deg_to_rad(maxf(5,35*sin(PI*u) if u<=1 else 0.0))
	var azimuth := deg_to_rad((0.5-minf(1,u))*230.0)
	var dir := Vector3(cos(elevation)*sin(azimuth),sin(elevation),cos(elevation)*cos(azimuth))
	var old_dir := Vector3(cos(TAU*t)*160,60+maxf(0,sin(PI*t+0.3))*140,90).normalized()
	dir = dir.lerp(old_dir,smoothstep(0.5,1.0,night)).normalized()
	sun.look_at(sun.position-dir)
	var overcast := maxf(wet,precipitation.flakes*0.70)
	var shade := 1.0-0.55*wet
	if weather == "storm":
		shade *= 1.0-0.55*wet
	elif weather == "hurricane":
		shade *= 1.0-0.30*wet
	sun.light_energy = lerpf(SUN_POWER[i],SUN_POWER[i+1],k)*shade*0.70+storm.flash*0.60
	sun.light_color = SUN_COLORS[i].lerp(SUN_COLORS[i+1],k)
	var mist: Color = FOG_COLORS[i].lerp(FOG_COLORS[i+1],k)
	mist = mist.lerp(Color("#dfe5ec"),snow*0.42*(1-night))
	mist = mist.lerp(Color("#8393a4"), wet*0.6*(1-night*0.6))
	if weather == "heat":
		mist = mist.lerp(Color("#e5bd8c"),0.35*(1.0-night))
		sun.light_color = sun.light_color.lerp(Color("#ffbf70"),0.5)
	elif weather == "golden":
		sun.light_color = sun.light_color.lerp(Color("#ffd9a0"),0.45)
	elif weather == "snowy":
		mist = mist.lerp(Color("#dfe5ec"),(0.4+0.5*precipitation.top)*(1-night))
	elif weather in ["storm","hurricane"]:
		mist = mist.lerp(Color("#646b62") if weather=="hurricane" else Color("#4a525f"),0.45*wet)
	environment.fog_light_color = mist.lerp(Color("#bfc8e6"),storm.flash*0.5)
	environment.ambient_light_color = HEMI_COLORS[i].lerp(HEMI_COLORS[i+1],k)
	environment.ambient_light_energy = lerpf(0.35,0.47,night)*(1-0.18*wet)+storm.flash*0.8
	var reach := 1.0-0.20*wet
	if weather == "snowy":
		reach = 0.82-0.12*precipitation.flakes-0.42*precipitation.top
	environment.fog_depth_begin = (195.0-105.0*wet)*(1.0-0.85*precipitation.top if weather=="snowy" else 1.0)
	environment.fog_depth_end = 590.0*reach
	sky.set_shader_parameter(&"sun_vector",dir)
	sky.set_shader_parameter(&"daylight",smoothstep(0.32,0.735,t))
	sky.set_shader_parameter(&"darkness",night)
	sky.set_shader_parameter(&"overcast",overcast)
	sky.set_shader_parameter(&"snow_cover",snow)
	sky.set_shader_parameter(&"heat",1.0 if weather=="heat" else 0.0)
	sky.set_shader_parameter(&"flash",storm.flash)
	if window_paint:
		window_paint.set_shader_parameter(&"dusk",night)
		ground_paint.set_shader_parameter(&"ground_wetness",maxf(_soil_wet,wet))
		scene_paint.set_shader_parameter(&"road_wetness",maxf(_soil_wet,wet))
		scene_paint.set_shader_parameter(&"water_film",puddles)
		_region_paint.set_shader_parameter(&"rain_film",Vector2(maxf(_soil_wet,wet),puddles))

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
	var random := RandomNumberGenerator.new()
	random.seed = 436
	for i in drops.instance_count:
		drops.set_instance_transform(i,Transform3D.IDENTITY)
		drops.set_instance_custom_data(i,Color(random.randf(),random.randf(),random.randf(),random.randf()))
	drops.custom_aabb = AABB(Vector3(-30,-2,-30),Vector3(60,34,60))
	streaks.multimesh = drops
	streaks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	streaks.hide()
	get_parent().add_child.call_deferred(streaks)
