extends Node

# Four seamless PCM loops are the original motor.js genLayer("vaz") at 44.1 kHz.
const ASSETS := "res://assets/semerka-motor-%d.wav"
const REVS := [900.0,2500.0,4000.0,5600.0]
var voices: Array[AudioStreamPlayer] = []
var starter := AudioStreamPlayer.new()
var wobble := 0.0
var limiter := 0.0
var cut := 0.0


func _ready() -> void:
	for i in REVS.size():
		var path := ASSETS % i
		var layer: AudioStreamWAV
		if FileAccess.file_exists(path):
			layer = AudioStreamWAV.load_from_file(path,{"edit/loop_mode":2})
		else:
			layer = ResourceLoader.load(path) as AudioStreamWAV
		var voice := AudioStreamPlayer.new()
		voice.stream = layer
		voice.volume_db = -80.0
		add_child(voice)
		voices.append(voice)
	starter.stream = preload("res://assets/courier-starter.wav")
	add_child(starter)


func step(delta: float, engine: RefCounted, load: bool, active: bool) -> void:
	if not active:
		for voice in voices:
			if voice.playing:
				voice.stop()
		return
	var sick := clampf((70.0-float(engine.condition))/55.0,0.0,1.0)
	wobble += delta*(1.7+randf()) if sick > 0.0 else 0.0
	var revs: float = engine.rpm
	var relative := clampf((revs-850.0)/5150.0,0.0,1.0)
	revs *= 1.0+sick*(sin(wobble)*0.6+sin(wobble*2.7+1.0)*0.4)*(0.06-0.04*relative)
	var level := lerpf(0.55,1.0,relative) if load else lerpf(0.30,0.70,relative)
	level *= 0.075
	if engine.crank_time > 0.0:
		level = 0.0
	elif engine.dead:
		level *= pow(clampf(revs/850.0,0.0,1.0),1.5)
	elif engine.shift_time > 0.0:
		level *= 0.4
	limiter = maxf(0.0,limiter-delta)
	cut = maxf(0.0,cut-delta)
	if load and not engine.dead and revs >= 6000.0*0.985 and limiter <= 0.0:
		limiter = randf_range(0.065,0.085)
		cut = 0.03
		engine.rpm *= 0.972
	elif sick > 0.0 and not engine.dead and randf() < sick*(1.2 if load else 2.5)*delta:
		cut = randf_range(0.04,0.11)*(0.6+sick)
	if cut > 0.0:
		level *= 0.15
	for i in voices.size():
		var gain := 1.0
		if revs < REVS[i] and i > 0:
			gain = sin(clampf(inverse_lerp(REVS[i-1],REVS[i],revs),0.0,1.0)*PI*0.5)
		elif revs > REVS[i] and i < REVS.size()-1:
			gain = cos(clampf(inverse_lerp(REVS[i],REVS[i+1],revs),0.0,1.0)*PI*0.5)
		var voice := voices[i]
		voice.pitch_scale = clampf(revs/REVS[i],0.5,2.0)
		voice.volume_db = linear_to_db(maxf(0.0001,level*gain))
		if not voice.playing:
			voice.play()
