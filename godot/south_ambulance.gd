extends RefCounted

const MOTOR_AUDIO := preload("res://semerka_motor_audio.gd")

enum Phase { IDLE, GO, WALK, WORK, BACK, LEAVE }
var phase := Phase.IDLE
var incidents: Array[Vector2] = []
var location := Vector2.INF
var vehicle: CharacterBody3D
var medics: Array[Node3D] = []
var siren: AudioStreamPlayer3D
var siren_loop: AudioStreamWAV
var lights: Array[MeshInstance3D] = []
var timer := 0.0
var elapsed := 0.0
var cooldown := 0.0


func report(at: Vector2) -> void:
	if incidents.size() >= 4 or at.distance_squared_to(location) < 14.0*14.0:
		return
	for existing in incidents:
		if existing.distance_squared_to(at) < 14.0*14.0:
			return
	incidents.append(at)


func step(delta: float, traffic: Node3D, observer_at: Vector2) -> void:
	cooldown = maxf(0.0,cooldown-delta)
	if phase == Phase.IDLE:
		if incidents.is_empty() or cooldown > 0.0:
			return
		incidents.sort_custom(func(a,b): return a.distance_squared_to(observer_at)<b.distance_squared_to(observer_at))
		var at: Vector2 = incidents.pop_front()
		if at.distance_squared_to(observer_at) < 420.0*420.0:
			_dispatch(traffic,at,observer_at)
		return
	elapsed += delta
	timer -= delta
	var here := Vector2(vehicle.position.x,vehicle.position.z)
	if siren:
		var audible: bool = phase == Phase.GO and vehicle.going and here.distance_squared_to(observer_at) < 170.0*170.0
		if audible and not siren.playing:
			siren.play(fposmod(elapsed,0.84))
		elif not audible and siren.playing:
			siren.stop()
	for i in lights.size():
		lights[i].visible = phase != Phase.LEAVE and floori(elapsed/0.13)%2 == i
	if here.distance_squared_to(observer_at) > 520.0*520.0 or (phase != Phase.LEAVE and not vehicle.going):
		_finish(traffic)
		return
	match phase:
		Phase.GO:
			if vehicle.stop_served:
				vehicle.dwelling = 10.0
				phase = Phase.WALK
				for i in 2:
					if not traffic.people.create_person.is_valid():
						break
					var door := _door(i)
					var dest := location+Vector2(-0.7,-0.4)*(1.0 if i == 0 else -1.0)
					var medic: Node3D = traffic.people._spawn(door,dest,0.0)
					traffic.people._walk(medic,door,dest,2.4)
					medics.append(medic)
			elif elapsed > 75.0:
				_leave(traffic,observer_at)
		Phase.WALK, Phase.BACK:
			vehicle.dwelling = 2.0
			var ready := true
			for medic in medics:
				if not traffic.people._clear_to_use(medic):
					continue
				var p := Vector2(medic.position.x,medic.position.z)
				if not medic.walker:
					continue
				if medic.reverse or p.distance_squared_to(medic.to) < 0.25:
					traffic.people._walk(medic,p,p,2.4)
				else:
					ready = false
			if ready and phase == Phase.WALK:
				phase = Phase.WORK
				timer = 4.5
			elif ready:
				_clear_medics(traffic)
				for at in incidents:
					if here.distance_squared_to(at) < 140.0*140.0 and _aim(traffic,at):
						incidents.erase(at)
						return
				_leave(traffic,observer_at)
		Phase.WORK:
			vehicle.dwelling = 2.0
			if timer <= 0.0:
				phase = Phase.BACK
				for i in medics.size():
					var medic := medics[i]
					if traffic.people._clear_to_use(medic):
						traffic.people._walk(medic,Vector2(medic.position.x,medic.position.z),_door(i),2.0)
		Phase.LEAVE:
			if here.distance_squared_to(observer_at) > 300.0*300.0 or vehicle.stop_served:
				_finish(traffic)


func _dispatch(traffic: Node3D, at: Vector2, observer_at: Vector2) -> void:
	var options: Array = traffic.roads.around(at,170.0)
	if options.is_empty():
		return
	for i in 48:
		var edge: RefCounted = options.pick_random()
		var distance: float = lerpf(edge.entry,edge.exit,0.5)
		var p: Vector2 = edge.lane(distance)
		if p.distance_to(at) < 90.0 or p.distance_to(at) > 170.0 or not traffic._clear(p,observer_at):
			continue
		vehicle = traffic._instance(p,0.0)
		vehicle.start_flow(traffic.roads,edge,traffic.signals,distance,traffic.off,traffic.on,16.0)
		if not _aim(traffic,at):
			vehicle.queue_free()
			vehicle = null
			continue
		_mark_vehicle()
		return


func _aim(traffic: Node3D, at: Vector2) -> bool:
	var nearest := INF
	var closest: RefCounted
	var stop := Vector2.ZERO
	for e in traffic.roads.around(at,60.0):
		var p := Geometry2D.get_closest_point_to_segment(at,e.a,e.b)
		var d := p.distance_squared_to(at)
		if d < nearest:
			nearest = d
			closest = e
			stop = p
	if closest == null or not vehicle.aim_for(closest,stop):
		return false
	location = at
	phase = Phase.GO
	vehicle.dwelling = 0.0
	elapsed = 0.0
	return true


func _leave(traffic: Node3D, observer_at: Vector2) -> void:
	phase = Phase.LEAVE
	vehicle.dwelling = 0.0
	vehicle.dwell_stop = Vector2.INF
	vehicle.stop_served = false
	var options: Array = traffic.roads.around(observer_at,380.0)
	if options.is_empty():
		_finish(traffic)
		return
	for i in 20:
		var e: RefCounted = options.pick_random()
		if observer_at.distance_to(e.a) > 220.0 and vehicle.aim_for(e,e.b):
			return
	_finish(traffic)


func _door(i: int) -> Vector2:
	var at := vehicle.position+vehicle.basis.x*(2.0 if i == 0 else -2.0)
	return Vector2(at.x,at.z)


func _mark_vehicle() -> void:
	if not MOTOR_AUDIO.dummy_driver():
		_siren()
	for i in 2:
		_beacon(i)


func _siren() -> void:
	if not siren_loop:
		var path := "res://assets/south-siren.wav"
		siren_loop = AudioStreamWAV.load_from_file(path,{"edit/loop_mode":2}) if FileAccess.file_exists(path) else ResourceLoader.load(path) as AudioStreamWAV
	siren = AudioStreamPlayer3D.new()
	siren.stream = siren_loop
	siren.max_distance = 170.0
	siren.unit_size = 12.0
	siren.volume_db = linear_to_db(0.031)
	siren.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_PHYSICS_STEP
	vehicle.add_child(siren)


func _beacon(i: int) -> void:
	var mesh := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = Vector3(0.40,0.15,0.27)
	var paint := StandardMaterial3D.new()
	paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	paint.albedo_color = Color("#337bff") if i == 0 else Color("#ff352d")
	shape.material = paint
	mesh.mesh = shape
	mesh.position = Vector3(-0.23 if i == 0 else 0.23,1.53,-0.12)
	vehicle.visual.add_child(mesh)
	lights.append(mesh)


func _clear_medics(traffic: Node3D) -> void:
	for medic in medics:
		if traffic.people._clear_to_use(medic):
			medic.queue_free()
		else:
			traffic.people.walkers.append({"person":medic})
	medics.clear()


func _finish(traffic: Node3D) -> void:
	_clear_medics(traffic)
	if is_instance_valid(siren):
		siren.stop()
		siren.stream = null
	if is_instance_valid(vehicle):
		vehicle.queue_free()
	vehicle = null
	lights.clear()
	siren = null
	location = Vector2.INF
	phase = Phase.IDLE
	cooldown = 3.0
