extends RefCounted

const AMOUNT := [0.0,0.30,0.85,1.0]
const DRIZZLE := {"summer":0.03,"autumn":0.12,"spring":0.12,"winter":0.22}
var random := RandomNumberGenerator.new()
var weather := "clear"
var season := "winter"
var novice := true
var pinned := false
var amount := 0.0
var top := 0.0
var rain := 0.0
var flakes := 0.0
var drizzle_left := 0.0
var drizzling := false
var snow_time := 30.0
var ambient_snow := 0.0
var points := PackedVector2Array()
var elapsed := 0.0
var gap := 0.0
var index := 0

func start(id: String, season_id: String, first: bool, seed_value: int, hold_peak: bool) -> void:
	random.seed = seed_value
	weather = id
	season = season_id
	novice = first
	pinned = hold_peak
	drizzle_left = random.randf_range(90,160)
	drizzling = false
	snow_time = random.randf_range(30,80)
	ambient_snow = 0
	amount = 0
	top = 0
	rain = 0
	flakes = 0
	points.clear()
	if weather in ["snowy","rain"]:
		_wave(true)
	step(0)

func _wave(first: bool) -> void:
	var length := 60.0+300.0*pow(random.randf(),1.4)
	var chance := random.randf()
	var peak := 1
	if chance >= (0.30 if weather == "snowy" else 0.25):
		peak = 2
	if chance >= (0.80 if weather == "snowy" else 0.75) and length >= 150:
		peak = 3
	if first:
		peak = maxi(2,peak)
	var up := PackedFloat32Array()
	var down := PackedFloat32Array()
	var ramp_total := 0.0
	for i in peak:
		up.append(random.randf_range(15,30))
		down.append(random.randf_range(15,30))
		ramp_total += up[i]+down[i]
	var hold := maxf(10,length-ramp_total)
	var at_peak := hold*random.randf_range(0.5,0.8) if peak>1 else hold
	var below := (hold-at_peak)/(2.0*maxi(1,peak-1))
	points = PackedVector2Array([Vector2.ZERO])
	var t := 0.0
	elapsed = 0
	for i in range(1,peak+1):
		t += up[i-1]
		points.append(Vector2(t,i))
		if first and i == 2:
			elapsed = t
		t += at_peak if i == peak else below
		points.append(Vector2(t,i))
	for i in range(peak-1,-1,-1):
		t += down[i]
		points.append(Vector2(t,i))
		if i>0:
			t += below
			points.append(Vector2(t,i))
	index = 1

func _level(delta: float) -> float:
	if pinned:
		return 3.0
	if points.is_empty():
		gap -= delta
		if gap <= 0:
			_wave(false)
		return 0
	elapsed += delta
	while index < points.size() and elapsed > points[index].x:
		index += 1
	if index == points.size():
		points.clear()
		gap = (25.0+125.0*pow(random.randf(),1.4)) if weather=="snowy" else (15.0+105.0*pow(random.randf(),1.4))
		return 0
	var a := points[index-1]
	var b := points[index]
	return lerpf(a.y,b.y,smoothstep(a.x,b.x,elapsed))

func step(delta: float) -> void:
	var target := 0.0
	var snow_target := 0.0
	if weather in ["rain","snowy"]:
		var level := _level(delta)
		var lo := mini(2,floori(level))
		amount = lerpf(AMOUNT[lo],AMOUNT[lo+1],level-lo)
		top = maxf(0,level-2)
		if weather == "snowy":
			snow_target = amount
		else:
			target = amount
	elif weather in ["storm","hurricane"]:
		target = 1
	elif weather in ["clear","firstsnow","thaw"]:
		drizzle_left -= delta
		if drizzle_left <= 0:
			if drizzling:
				drizzling = false
				drizzle_left = random.randf_range(150,260)
			else:
				drizzling = not novice and random.randf() < float(DRIZZLE[season])
				drizzle_left = random.randf_range(40,70) if drizzling else random.randf_range(90,160)
		if drizzling:
			target = 1
			if season == "winter":
				snow_target = 1
		if weather == "firstsnow":
			snow_target = maxf(0.42,snow_target)
	elif weather == "maysnow":
		snow_target = 0.55
	if season=="winter" and weather!="snowy" and not novice:
		snow_time -= delta
		if snow_time <= 0:
			ambient_snow = random.randf_range(0.3,0.7) if ambient_snow==0.0 and random.randf()<0.55 else 0.0
			snow_time = random.randf_range(40,90) if ambient_snow>0 else random.randf_range(30,80)
		snow_target = maxf(snow_target,ambient_snow)
	rain = lerpf(rain,target,1.0-exp(-0.6*delta))
	flakes = snow_target if delta == 0 else lerpf(flakes,snow_target,1.0-exp(-0.5*delta))
