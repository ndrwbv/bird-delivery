extends Node3D

signal event_started(kind: String)
signal event_ended(kind: String)
signal notice(text: String)
signal road_thump(strength: float)
signal money_changed(delta: int, reason: String)
signal heart_hit(hearts: float, at: Vector3)
signal rival_defeated
signal respect_earned(reason: String)
signal run_bonus(amount: int, reason: String)
signal road_closed(from: Vector2, to: Vector2, closed: bool)

var request_closure := Callable()
var route_provider := Callable()

const TIER := {"gig":"light","crew":"light","thugs":"light","flirt":"light","moose":"light","odd":"light",
	"story":"story","errand":"story","march":"medium","gang":"medium","mafia":"medium",
	"raid":"major","riot":"major","fest":"major","hurricane":"major"}
const OPEN := {"light":2,"story":2,"medium":4,"major":6}
const CAP := {"light":2,"medium":1,"major":1}
const BEATS := {"meet":2,"mini":2,"errand":5,"scene":2}

var car: CharacterBody3D
var ground: RefCounted
var traffic: Node3D
var profile: RefCounted
var region: Dictionary
var factory: Callable
var scenes: Array[Dictionary] = []
var active: Array[Dictionary] = []
var session_deliveries := 0
var session_shifts := 0
var career_n := 0
var career_shifts := 0
var quiet_to := 0.0
var calm_at := -999.0
var pause := 0.0
var elapsed := 0.0
var duration := 0.0
var number := 0
var role := ""
var tension := 0.0
var peaked := false
var order_index := 0
var safe_stop := Vector2.INF
var story := false
var ride := false
var quick := false
var running := false
var last_beat := -9
var total := 0
var budget := 3
var counts := {}
var gig_in := 30.0
var march_in := 15.0
var benches := PackedVector2Array()
var footprints := {}
var road_cells := {}
var _decoration_materials := {}
var clock_write := 60.0
var dialogue: Dictionary
var street_works := preload("res://south_roadworks.gd").new()
var cast := preload("res://south_event_people.gd").new()
var brand_crews := preload("res://south_brand_crews.gd").new()
var rivals := preload("res://south_rival_deliveries.gd").new()
var drivers := preload("res://south_angry_drivers.gd").new()
var robbery := preload("res://south_street_robbery.gd").new()
var thief := preload("res://south_pizza_thief.gd").new()
var garage_zone := preload("res://south_garage_zone.gd").new()
var winter_view := preload("res://south_winter_view.gd").new()
var holes := preload("res://south_potholes.gd").new()
var translation: Translation
var profile_id := ""
var protest_topic := {}
var last_cycle := -1
var protest_history: Array = []


func setup(player: CharacterBody3D, terrain: RefCounted, population: Node3D, map_data: Dictionary, career: RefCounted, create_person: Callable) -> void:
	car = player
	ground = terrain
	traffic = population
	region = map_data
	profile = career
	factory = create_person
	cast.host = self
	thief.host = self
	thief.cast = cast
	robbery.host = self
	robbery.cast = cast
	brand_crews.host = self
	brand_crews.cast = cast
	drivers.host = self
	drivers.cast = cast
	traffic.vehicle_struck.connect(drivers.struck)
	var shared: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-event-sites.json"))
	dialogue = shared
	add_child(street_works)
	street_works.setup(self)
	add_child(rivals)
	rivals.setup(self)
	add_child(garage_zone)
	garage_zone.setup(self)
	add_child(winter_view)
	winter_view.setup(car,ground)
	add_child(holes)
	holes.setup(car,ground,region)
	holes.struck.connect(func(strength: float): road_thump.emit(strength))
	translation = Translation.new()
	translation.locale = "en"
	for ru: String in shared.en:
		translation.add_message(ru,shared.en[ru])
	TranslationServer.add_translation(translation)
	traffic.signals.march_speed = _march_speed
	for p: Array in shared.benches:
		benches.append(Vector2(p[0],p[1]))
	for road: Dictionary in region.roads:
		var padding := float(road.width)*0.5+12.0
		for i in range(1,road.points.size()):
			var a := Vector2(road.points[i-1][0],road.points[i-1][1])
			var b := Vector2(road.points[i][0],road.points[i][1])
			if a == b:
				continue
			var bounds := Rect2(a,Vector2.ZERO).expand(b).grow(padding)
			var lo := Vector2i((bounds.position/48.0).floor())
			var hi := Vector2i((bounds.end/48.0).floor())
			var entry := [a,b,float(road.width)]
			for z in range(lo.y,hi.y+1):
				for x in range(lo.x,hi.x+1):
					var key := Vector2i(x,z)
					if not road_cells.has(key):
						road_cells[key] = []
					road_cells[key].append(entry)
	for h: Dictionary in region.buildings:
		var poly := PackedVector2Array()
		var bounds := Rect2()
		for xy: Array in h.outline:
			var p := Vector2(xy[0],xy[1])
			bounds = Rect2(p,Vector2.ZERO) if poly.is_empty() else bounds.expand(p)
			poly.append(p)
		var lo := Vector2i((bounds.position/64.0).floor())
		var hi := Vector2i((bounds.end/64.0).floor())
		for z in range(lo.y,hi.y+1):
			for x in range(lo.x,hi.x+1):
				var key := Vector2i(x,z)
				if not footprints.has(key):
					footprints[key] = []
				footprints[key].append(poly)
	_read_profile()


func _read_profile() -> void:
	profile_id = str(profile.data.get("save_id",""))
	session_deliveries = 0
	session_shifts = 0
	last_cycle = -1
	protest_history = []
	protest_topic = {}
	var save: Dictionary = profile.data.get("event_session",{})
	var now := Time.get_unix_time_from_system()
	if str(save.get("date","")) == Time.get_date_string_from_system() and now-float(save.get("at",0)) < 4.0*3600.0:
		session_deliveries = int(save.get("n",0))
		session_shifts = int(save.get("shifts",0))
	career_n = session_deliveries
	career_shifts = session_shifts
	var cycle: Dictionary = profile.data.get("south_protest",{})
	last_cycle = int(cycle.get("cycle",-1))
	protest_history = cycle.get("history",[]).duplicate()
	if cycle.has("topic"):
		protest_topic = dialogue.topics[clampi(int(cycle.topic),0,dialogue.topics.size()-1)]


func _exit_tree() -> void:
	if translation != null:
		TranslationServer.remove_translation(translation)
	if is_instance_valid(traffic) and is_instance_valid(traffic.signals):
		traffic.signals.march_speed = Callable()


func _stamp() -> void:
	if profile == null or quick or str(profile.data.get("save_id",""))!=profile_id:
		return
	career_n = session_deliveries
	career_shifts = session_shifts
	profile.data.event_session = {"at":Time.get_unix_time_from_system(),"date":Time.get_date_string_from_system(),
		"n":session_deliveries,"shifts":session_shifts}


func begin_shift(shift_number: int, seconds: float, free_drive := false, quick_run := false) -> void:
	finish()
	if str(profile.data.get("save_id",""))!=profile_id:
		_read_profile()
	number = shift_number
	garage_zone.begin()
	thief.begin()
	robbery.begin()
	street_works.begin()
	rivals.begin(int(profile.data.get("shifts",0)))
	duration = seconds
	ride = free_drive
	quick = quick_run
	session_deliveries = career_n
	session_shifts = career_shifts
	running = true
	if not ride and not quick:
		session_shifts += 1
	if quick:
		# Quick runs use a private temporary profile in the Steam release.
		session_shifts = 1
		session_deliveries = 0
	elapsed = 0.0
	quiet_to = 0.0
	calm_at = -999.0
	last_beat = -9
	total = 0
	counts.clear()
	role = ""
	peaked = false
	order_index = 0
	_update_topic()
	story = false
	safe_stop = Vector2.INF
	budget = 3 if seconds < 300.0 else (4 if seconds < 420.0 else 5)
	gig_in = randf_range(15.0,40.0)
	march_in = randf_range(8.0,20.0)
	_stamp()


func order(index: int, remaining: float, client_at: Vector2, is_story := false) -> void:
	order_index = index
	safe_stop = client_at
	story = is_story
	garage_zone.order(client_at,is_story)
	var fraction := clampf(1.0-remaining/maxf(duration,1.0),0.0,1.0)
	role = "rise"
	if index == 1:
		role = "open"
	elif remaining >= 0.0 and remaining < 75.0:
		role = "last"
	else:
		var average := (duration-remaining)/(index-1) if index > 1 and duration > remaining else 55.0
		if not peaked and index >= 3 and (fraction >= 0.6 or remaining < 75.0+2.0*average):
			peaked = true
			role = "peak"
	tension = 1.0 if role == "peak" else (minf(1.0,fraction/0.7) if role == "rise" else 0.0)


func person_hit(actor: Node3D, impact_kmh: float) -> void:
	garage_zone.person_hit(actor,impact_kmh)
	thief.hit(actor,impact_kmh)
	drivers.hit(actor,impact_kmh)
	rivals.hit(actor,impact_kmh)
	brand_crews.hit(actor,impact_kmh)
	robbery.hit(actor,impact_kmh)


func honk() -> void:
	robbery.honk()
	brand_crews.honk()


func reward(amount: int, why: String, respect_key := "") -> void:
	if ride or quick:
		if amount>0:
			run_bonus.emit(amount,tr(why))
		return
	if not respect_key.is_empty():
		respect_earned.emit(respect_key)
	if amount>0:
		money_changed.emit(amount,tr(why))


func delivered() -> void:
	garage_zone.delivered()
	street_works.delivered()
	session_deliveries += 1
	_stamp()


func can_event(kind: String) -> bool:
	var tier: String = TIER.get(kind,"")
	var category := _beat(kind,tier)
	var planned := kind == "hurricane" or kind == "fest"
	if not running:
		return false
	if tier != "":
		if not (ride and tier == "light") and session_deliveries < int(OPEN[tier]):
			return false
		if planned and session_shifts < 2:
			return false
		if tier == "story" and kind != "errand":
			return true
		var same := 0
		for event in active:
			if event.tier == tier:
				same += 1
		if CAP.has(tier) and same >= int(CAP[tier]):
			return false
		if pause > 0.0 and (tier == "medium" or tier == "major"):
			return false
		if planned:
			return true
	if ride:
		return true
	if role == "" or role == "open" or story:
		return false
	var small := category in ["mini","errand"]
	var until := minf(quiet_to,calm_at+40.0) if small else quiet_to
	if elapsed < until-(30.0 if category == "meet" or category == "mini" else 0.0):
		return false
	if category == "light":
		return true
	if role == "last" or last_beat == order_index:
		return false
	for event in active:
		if event.beat in ["meet","mini","scene","errand"]:
			return false
	if category == "meet" and order_index-last_beat < 2:
		return false
	if not small and total >= budget:
		return false
	return int(counts.get(category,0)) < int(BEATS.get(category,1)) and (category != "scene" or tension >= 0.35)


func _beat(kind: String, tier: String) -> String:
	if kind in ["mini","meet","errand"]:
		return kind
	if tier == "light":
		return "light"
	return "" if kind in ["hurricane","fest","story"] else "scene"


func start_event(kind: String, ttl := 0.0) -> bool:
	if not can_event(kind):
		return false
	var tier: String = TIER.get(kind,"")
	var beat := _beat(kind,tier)
	if not ride and beat in ["meet","mini","scene","errand"]:
		last_beat = order_index
		counts[beat] = int(counts.get(beat,0))+1
		if beat == "meet" or beat == "scene":
			total += 1
	var limit := ttl if ttl > 0.0 else (INF if kind in ["hurricane","fest"] else 300.0)
	active.append({"kind":kind,"tier":tier,"beat":beat,"age":0.0,"limit":limit})
	event_started.emit(kind)
	return true


func end_event(kind: String) -> void:
	for i in active.size():
		if active[i].kind == kind:
			_end(i)
			return


func _end(index: int) -> void:
	var e := active[index]
	active.remove_at(index)
	if e.tier == "major" and e.kind not in ["hurricane","fest"]:
		pause = 150.0
	if not ride and e.beat in ["meet","mini","scene","errand"]:
		var clear := true
		for other in active:
			if other.beat in ["meet","mini","scene","errand"]:
				clear = false
		if clear:
			quiet_to = maxf(quiet_to,elapsed+randf_range(60.0,120.0))
			calm_at = elapsed
	event_ended.emit(str(e.kind))


func finish() -> void:
	garage_zone.clear()
	thief.clear()
	robbery.clear()
	drivers.clear()
	rivals.clear()
	brand_crews.clear()
	cast.clear()
	street_works.clear()
	for scene in scenes:
		_dispose(scene)
	scenes.clear()
	active.clear()
	running = false
	_stamp()


func step(delta: float, live: bool, hour: float) -> void:
	if not running or not live:
		return
	elapsed += delta
	holes.step(delta)
	garage_zone.step(delta,hour)
	street_works.step(delta)
	cast.tick(delta)
	if factory.is_valid():
		drivers.step(delta,cast.at(car))
		robbery.step(delta,cast.at(car))
		var calm := not ride and (story or not bool(profile.data.get("gennady_paid",false)))
		rivals.step(delta,cast.at(car),calm)
		brand_crews.step(delta,cast.at(car),calm)
		thief.step(delta,cast.at(car),calm)
	winter_view.step()
	pause = maxf(0.0,pause-delta)
	clock_write -= delta
	if clock_write <= 0.0:
		clock_write = 60.0
		_stamp()
	for i in range(active.size()-1,-1,-1):
		var e := active[i]
		e.age += delta
		if e.age >= e.limit:
			for j in range(scenes.size()-1,-1,-1):
				if scenes[j].kind == e.kind:
					_dispose(scenes[j])
					scenes.remove_at(j)
					break
			_end(i)
	_step_scenes(delta)
	if story or not factory.is_valid():
		return
	var stage := _protest_stage()
	if stage in [3,4] and _scene_count("march") == 0:
		march_in -= delta
		if march_in <= 0.0:
			march_in = 3.0
			if can_event("march"):
				_spawn("march",hour)
	var evening := hour >= 17.0 and hour < 24.0
	if _scene_count("gig") < (2 if evening else 1):
		gig_in -= delta
		if gig_in <= 0.0:
			gig_in = 5.0
			if can_event("gig") and _spawn("gig",hour):
				gig_in = randf_range(20.0,45.0) if evening else (randf_range(150.0,260.0) if hour >= 1.0 and hour < 8.0 else randf_range(60.0,120.0))


func _update_topic() -> void:
	var cycle := maxi(0,floori((number-2)/8.0))
	if ride or quick or cycle == last_cycle:
		return
	var choices: Array[int] = []
	for i in dialogue.topics.size():
		if not protest_history.has(i):
			choices.append(i)
	var selected: int = choices.pick_random()
	protest_topic = dialogue.topics[selected]
	protest_history.append(selected)
	if protest_history.size() > 4:
		protest_history.pop_front()
	last_cycle = cycle
	profile.data.south_protest = {"cycle":cycle,"history":protest_history.duplicate(),"topic":selected}


func _protest_stage() -> int:
	if number <= 1:
		return 0
	var k := posmod(number-2,8)
	return 1+floori(k/2.0) if k < 6 else k-2


func _scene_count(kind: String) -> int:
	var n := 0
	for scene in scenes:
		if scene.kind == kind:
			n += 1
	return n


func _dispose(scene: Dictionary) -> void:
	for actor: Node3D in scene.actors:
		if is_instance_valid(actor):
			actor.queue_free()
	if is_instance_valid(scene.root):
		scene.root.queue_free()



func _road_at(p: Vector2, radius: float) -> Dictionary:
	var found := {}
	var nearest := INF
	var key := Vector2i((p/48.0).floor())
	for edge: Array in road_cells.get(key,[]):
		var point := Geometry2D.get_closest_point_to_segment(p,edge[0],edge[1])
		var distance := p.distance_to(point)
		if distance < nearest and distance <= radius:
			nearest = distance
			found = {"p":point,"d":distance,"width":edge[2]}
	return found


func _clear_yard(p: Vector2, clearance: float) -> bool:
	if p.distance_squared_to(safe_stop) < 12.0*12.0:
		return false
	var offset := Vector2.RIGHT*clearance
	# Crowd members use their centre. Stage clearance samples its whole rim.
	var samples := 1 if clearance < 1.0 else 8
	for i in samples:
		var q := p+offset.rotated(TAU*i/8.0)
		var key := Vector2i((q/64.0).floor())
		for house: PackedVector2Array in footprints.get(key,[]):
			if Geometry2D.is_point_in_polygon(q,house):
				return false
		var road := _road_at(q,10.0)
		if not road.is_empty() and float(road.d) < float(road.width)*0.5+1.5:
			return false
	return true


func _gig_site(observer: Vector2) -> Dictionary:
	var near := PackedVector2Array()
	for p in benches:
		var d := p.distance_squared_to(observer)
		if d > 45.0*45.0 and d < 170.0*170.0:
			near.append(p)
	# Select a few candidates per attempt. Failed placements use the game's 5s retry.
	for i in mini(8,near.size()*2):
		var point := near[randi_range(0,near.size()-1)]+Vector2.RIGHT.rotated(randf()*TAU)*4.0
		var conflict := false
		for existing in scenes:
			if existing.p.distance_squared_to(point) < 70.0*70.0:
				conflict = true
				break
		if conflict or not _clear_yard(point,4.5) or not _clear_yard(point,2.5):
			continue
		var road := _road_at(point,60.0)
		var toward := Vector2.RIGHT if road.is_empty() else point.direction_to(road.p)
		return {"p":point,"axis":toward}
	return {}


func _march_site(observer: Vector2) -> Dictionary:
	var heading := Vector2(-car.basis.z.x,-car.basis.z.z)
	if absf(car.speed) > 3.0:
		heading = Vector2(car.velocity.x,car.velocity.z).normalized()
	var choices: Array[Dictionary] = []
	for e: RefCounted in traffic.roads.around(observer,160.0):
		var p: Vector2 = e.a.lerp(e.b,0.5)
		var d := observer.distance_to(p)
		if e.width < 6.0 or d < 60.0 or d > 160.0 or e.exit-e.entry < 50.0 or safe_stop.distance_to(p)<18.0:
			continue
		choices.append({"edge":e,"score":heading.dot(observer.direction_to(p))+randf()*0.8})
	if choices.is_empty():
		return {}
	choices.sort_custom(func(a,b):return a.score>b.score)
	var edge: RefCounted = choices[0].edge
	var length := minf(160.0,edge.exit-edge.entry)
	return {"p":edge.a+edge.dir*edge.entry,"axis":edge.dir,"length":length,"width":edge.width}


func _spawn(kind: String, hour: float) -> bool:
	var at := Vector2(car.position.x,car.position.z)
	var scene := _gig_site(at) if kind == "gig" else _march_site(at)
	if scene.is_empty() or not start_event(kind):
		return false
	scene.kind = kind
	scene.actors = []
	scene.jobs = []
	scene.root = Node3D.new()
	scene.age = 0.0
	scene.rally = -1.0
	scene.flee = -1.0
	scene.say = 1.5 if kind == "gig" else 1.0
	scene.note = 0.5
	scene.spoken = 0.0
	scene.ringing = 0.0
	scene.life = randf_range(100.0,160.0)
	add_child(scene.root)
	scene.bubble = _label(scene.root,0.007)
	scene.symbol = _label(scene.root,0.013)
	scene.symbol.text = "♪"
	var p: Vector2 = scene.p
	var dir: Vector2 = scene.axis
	var right := Vector2(dir.y,-dir.x)
	if kind == "gig":
		var band := randf() < (0.45 if hour >= 17.0 and hour < 24.0 else 0.25)
		scene.variant = "band" if band else ("guitar" if randf()<0.6 else "meet")
		scene.musicians = 3 if band else 1
		scene.top = 0.35 if band else (0.4 if scene.variant == "meet" else 0.0)
		scene.band = dialogue.bands.pick_random()
		if band:
			_prop(scene.root,p,dir,Vector3(4.4,0.35,2.6),Color("#3a3a42"),0.175)
			for side: float in [-1.0,1.0]:
				_prop(scene.root,p+right*side*2.6+dir*0.3,dir,Vector3(0.6,1.2,0.5),Color("#1b1b20"),0.6)
			_drum(scene.root,p-dir*0.7,dir,0.38,0.35,0.75,Color("#c9452a"),true)
			_drum(scene.root,p-dir*0.7+right*0.5,dir,0.22,0.14,1.0,Color("#e8eef2"),false)
		elif scene.variant == "guitar":
			_prop(scene.root,p+right*0.8+dir*0.1,dir,Vector3(0.5,0.45,0.3),Color("#2b2a30"),0.225)
		else:
			_prop(scene.root,p,dir,Vector3(0.7,0.4,0.6),Color("#8a6a4a"),0.2)
		_prop(scene.root,p-right*0.4+dir*0.5,dir,Vector3(0.04,1.4,0.04),Color("#1b1b20"),scene.top+0.7)
		var places := [p-right*1.2+dir*0.3,p+right*1.2+dir*0.3,p-dir*1.1] if band else [p]
		for i in scene.musicians:
			var point: Vector2 = places[i]
			var instrument: String = ["guitar","bass","drums"][i] if band else scene.variant
			scene.jobs.append({"a":point,"b":point,"look":dir,"instrument":instrument})
		var count := randi_range(10,20)
		for i in count*3:
			if scene.jobs.size() >= count+scene.musicians:
				break
			var angle := randf_range(-2.4,2.4) if scene.variant == "meet" else randf_range(-1.1,1.1)
			var point := p+dir.rotated(angle)*(randf_range(3.0,7.5) if band else randf_range(2.0,5.5))
			if not _clear_yard(point,0.3):
				continue
			var crowded := false
			for job: Dictionary in scene.jobs:
				if point.distance_squared_to(job.a) < 0.45:
					crowded = true
					break
			if not crowded:
				scene.jobs.append({"a":point,"b":point,"look":point.direction_to(p),"perform":false})
	else:
		var count := randi_range(12,20)
		var columns := 4 if float(scene.width) >= 9.0 else 3
		scene.musicians = 0
		scene.columns = columns
		scene.topic = dialogue.topics.pick_random() if protest_topic.is_empty() else protest_topic
		scene.chants = scene.topic.chant + scene.topic.slog + dialogue.march_adult
		scene.rows = PackedVector2Array()
		for i in count:
			var lane := p+right*(i%columns-(columns-1)*0.5)*1.10-dir*floorf(float(i)/columns)*1.3
			scene.jobs.append({"a":lane,"b":lane+dir*float(scene.length),"look":dir,"placard":i<3})
	scenes.append(scene)
	return true


func _label(parent: Node3D, units: float) -> Label3D:
	var label := Label3D.new()
	label.font_size = 34
	label.pixel_size = units
	label.outline_size = 7
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.visibility_range_end = 58.0
	label.visibility_range_end_margin = 8.0
	label.visible = false
	parent.add_child(label)
	return label


func _paint(color: Color) -> StandardMaterial3D:
	if not _decoration_materials.has(color):
		var paint := StandardMaterial3D.new()
		paint.albedo_color = color
		_decoration_materials[color] = paint
	return _decoration_materials[color]


func _box(size_value: Vector3, color: Color) -> MeshInstance3D:
	var shape := BoxMesh.new()
	shape.size = size_value
	shape.material = _paint(color)
	var model := MeshInstance3D.new()
	model.mesh = shape
	model.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return model


func _prop(parent: Node3D, p: Vector2, dir: Vector2, size_value: Vector3, color: Color, elevation: float) -> void:
	var model := _box(size_value,color)
	model.position = Vector3(p.x,ground.at(p.x,p.y)+elevation,p.y)
	model.rotation.y = atan2(dir.x,dir.y)
	parent.add_child(model)


func _drum(parent: Node3D, p: Vector2, dir: Vector2, radius: float, height: float, y: float, color: Color, horizontal: bool) -> void:
	var drum := CylinderMesh.new()
	drum.top_radius = radius
	drum.bottom_radius = radius
	drum.height = height
	drum.radial_segments = 12
	drum.rings = 0
	drum.material = _paint(color)
	var model := MeshInstance3D.new()
	model.mesh = drum
	model.position = Vector3(p.x,ground.at(p.x,p.y)+y,p.y)
	model.rotation = Vector3(PI*0.5 if horizontal else 0.0,atan2(dir.x,dir.y),0.0)
	parent.add_child(model)


func _build_one(scene: Dictionary) -> void:
	var job: Dictionary = scene.jobs.pop_front()
	var actor: Node3D = factory.call(scene.actors.size(),job.a,job.b,0.0)
	actor.rotation.y = atan2(float(job.look.x),float(job.look.y))
	if scene.kind == "march":
		traffic.people._walk(actor,job.a,job.b,1.3)
		if job.get("placard",false):
			var label := Label3D.new()
			label.text = tr(scene.topic.title if scene.actors.is_empty() else scene.topic.slog.pick_random())
			label.font_size = 32
			label.pixel_size = 0.0025
			label.modulate = Color("#fff4cd")
			label.outline_size = 10
			label.double_sided = true
			label.position.y = 2.35
			actor.add_child(label)
	elif job.has("instrument"):
		actor.model.position.y += float(scene.top)
		if job.instrument in ["guitar","bass"]:
			var guitar := Node3D.new()
			actor.add_child(guitar)
			guitar.position = Vector3(0.02,1.0+float(scene.top),0.2)
			guitar.rotation.z = 0.9
			var neck := _box(Vector3(0.06,0.6,0.05),Color("#3a2a20"))
			neck.position.y = 0.5
			guitar.add_child(neck)
			guitar.add_child(_box(Vector3(0.36,0.44,0.1),Color("#2f6fd8") if job.instrument == "bass" else Color("#c9873a")))
	scene.actors.append(actor)


func _step_scenes(delta: float) -> void:
	var observer := Vector2(car.position.x,car.position.z)
	var created := false
	for i in range(scenes.size()-1,-1,-1):
		var scene := scenes[i]
		scene.age += delta
		scene.spoken = maxf(0.0,float(scene.spoken)-delta)
		scene.ringing = maxf(0.0,float(scene.ringing)-delta)
		scene.bubble.visible = scene.spoken > 0.0
		scene.symbol.visible = scene.ringing > 0.0
		if not scene.jobs.is_empty() and not created:
			_build_one(scene)
			created = true
		var d := observer.distance_to(scene.p)
		var complete := false
		if scene.kind == "gig":
			_step_gig(scene,observer,delta)
			complete = d>260.0 or (scene.age>scene.life and (d>60.0 or scene.age>scene.life+40.0)) or scene.flee>7.0
		else:
			_step_march(scene,delta)
			complete = d>280.0 or (scene.rally>18.0 and (d>70.0 or scene.rally>58.0))
		if complete:
			end_event(scene.kind)
			_dispose(scene)
			scenes.remove_at(i)
			if scene.kind == "march":
				march_in = randf_range(30.0,60.0)


func _step_gig(scene: Dictionary, observer: Vector2, delta: float) -> void:
	var first: Node3D
	var note_actor: Node3D
	var live_count := 0
	var note_due: bool = scene.note<=delta and scene.variant!="meet" and observer.distance_squared_to(scene.p)<120.0*120.0
	for j in scene.actors.size():
		var actor: Node3D = scene.actors[j]
		if not traffic.people._clear_to_use(actor):
			continue
		var p := Vector2(actor.position.x,actor.position.z)
		actor.player.active = p.distance_squared_to(observer)<72.0*72.0
		if j < int(scene.musicians):
			live_count += 1
			if first == null:
				first = actor
			if note_due and randi_range(1,live_count) == 1:
				note_actor = actor
		elif scene.flee < 0.0 and p.distance_squared_to(observer) < 9.0 and absf(car.speed) >= 20.0/3.6:
			var away := observer.direction_to(p)
			traffic.people._walk(actor,p,p+away*8.0,3.6)
	if first != null and scene.flee < 0.0:
		var meeting: bool = scene.variant == "meet"
		scene.say -= delta
		if scene.say <= 0.0:
			scene.say = randf_range(3.0,5.0) if meeting else randf_range(6.0,10.0)
			var line: String = tr(dialogue.meet.pick_random() if meeting else dialogue.gig.pick_random())
			if scene.variant == "band" and randf() < 0.30:
				line = tr("Мы — группа «{band}»!").format({"band":tr(scene.band)})
			_speak(scene,first,line)
		if not meeting and observer.distance_squared_to(scene.p)<120.0*120.0:
			scene.note -= delta
			if scene.note <= 0.0:
				scene.note = randf_range(0.7,1.2)
				scene.ringing = 0.7
				scene.symbol.position = note_actor.position+Vector3(0.3,2.4+float(scene.top),0.0)
				scene.symbol.show()
			elif scene.ringing > 0.0:
				scene.symbol.position.y += delta*0.48
	if first == null and scene.jobs.is_empty() and scene.flee < 0.0:
		scene.flee = 0.0
		for actor: Node3D in scene.actors:
			if traffic.people._clear_to_use(actor):
				var p := Vector2(actor.position.x,actor.position.z)
				traffic.people._walk(actor,p,p+Vector2(scene.p).direction_to(p)*18.0,3.6)
	if scene.flee >= 0.0:
		scene.flee += delta


func _speak(scene: Dictionary, speaker: Node3D, line: String) -> void:
	scene.spoken = 2.8
	scene.bubble.text = line
	scene.bubble.position = speaker.position+Vector3.UP*(2.7+float(scene.get("top",0.0)))
	scene.bubble.show()


func _step_march(scene: Dictionary, delta: float) -> void:
	var marching := false
	var rows := PackedVector2Array()
	var count := 0
	var middle := Vector2.ZERO
	for i in scene.actors.size():
		var actor: Node3D = scene.actors[i]
		if not traffic.people._clear_to_use(actor):
			continue
		var p := Vector2(actor.position.x,actor.position.z)
		if i % int(scene.columns) == 0:
			rows.append(p+Vector2(scene.axis.y,-scene.axis.x)*((int(scene.columns)-1)*0.55))
		middle += p
		count += 1
		if i == 0:
			scene.say -= delta
			if scene.say <= 0.0:
				scene.say = randf_range(2.6,4.2)
				_speak(scene,actor,tr(scene.chants.pick_random()))
			elif scene.spoken > 0.0:
				scene.bubble.position = actor.position+Vector3.UP*2.7
		if not actor.walker:
			continue
		if actor.reverse or p.distance_squared_to(actor.to) < 0.30:
			traffic.people._walk(actor,p,p,1.3)
		else:
			marching = true
	if count > 0:
		scene.p = middle/count
	scene.rows = rows
	if not marching and scene.jobs.is_empty():
		scene.rally = maxf(0.0,float(scene.rally))+delta


func _march_speed(at: Vector2, nose: Vector2) -> float:
	for scene in scenes:
		if scene.kind != "march" or at.distance_squared_to(scene.p)>34.0*34.0:
			continue
		var slow := 1.0
		for row: Vector2 in scene.rows:
			var d := row-at
			var ahead := d.dot(nose)
			if ahead > -1.0 and ahead <= 18.0 and absf(d.cross(nose)) <= 1.6+(int(scene.columns)-1)*0.55:
				slow = minf(slow,clampf((ahead-2.49-2.5)/6.0,0.0,1.0))
		return slow
	return 1.0
