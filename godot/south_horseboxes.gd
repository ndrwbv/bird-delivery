extends Node3D

signal hit(at: Vector3, speed: float)
signal neighed(at: Vector3)

const PART := preload("res://south_worksite_mesh.gd")
const VEHICLE := preload("res://traffic_vehicle.gd")
const CHANCE := 1.0/50.0
const BAR := 2.7
const SLOW := 0.8
const TOW := 4.4
const PLAYER_HALF_LENGTH := 2.2
const BREAKAWAY := 8.0
const TIP := 14.0
const TOW_SHOCK := 10.0
const MAX_LOOSE := 4
const FAR := 140.0

class Trailer:
	var tractor: CharacterBody3D
	var body: CharacterBody3D
	var neck: MeshInstance3D
	var tail: MeshInstance3D
	var axle: Vector2
	var heading: float
	var floor_y: float
	var slide := Vector2.ZERO
	var spin := 0.0
	var roll := 0.0
	var tipped := 0.0
	var pitch := 0.0
	var phase := 0.0
	var loose := false

var host: Node3D
var trailers: Array[Trailer] = []
var loose: Array[Trailer] = []
var meshes: Array[Mesh] = []
var hull := BoxShape3D.new()
var spark_mesh := BoxMesh.new()
var dust_mesh := SphereMesh.new()

func setup(director: Node3D) -> void:
	host = director
	host.traffic.ordinary_vehicle_spawned.connect(_roll)
	host.traffic.damage.wrecked.connect(_tractor_wrecked)
	# Rear face is 4.4 m behind the rear of the towing car on a straight road.
	hull.size = Vector3(1.9,1.9,3.1)
	spark_mesh.size = Vector3(.038,.19,.038)
	spark_mesh.material = host._paint(Color("#ffcf64"))
	dust_mesh.radius = .14
	dust_mesh.height = .22
	dust_mesh.radial_segments = 5
	dust_mesh.rings = 2
	dust_mesh.material = host._paint(Color("#8a8275"))

func begin() -> void:
	for vehicle in host.traffic.moving:
		_roll(vehicle)

func _roll(vehicle: CharacterBody3D) -> void:
	if not host.running or vehicle.horse_rolled or not vehicle.ordinary or vehicle.incident or vehicle.owner_lost or not vehicle.going:
		return
	vehicle.horse_rolled = true
	if randf()<CHANCE:
		_attach(vehicle)

func _tractor_wrecked(vehicle: CharacterBody3D) -> void:
	if vehicle.tow_length==0.0:
		return
	for t in trailers:
		if t.tractor==vehicle:
			_let_go(t,_xz(vehicle.coast)*.5,0.0)
			return

func _load_shapes() -> void:
	if not meshes.is_empty():
		return
	var file := FileAccess.open("res://assets/south-horsebox.bin",FileAccess.READ)
	var paint := StandardMaterial3D.new()
	paint.vertex_color_use_as_albedo = true
	paint.roughness = .85
	var lights := paint.duplicate() as StandardMaterial3D
	lights.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in 4:
		meshes.append(PART.next(file,lights if i==1 else paint))

func _xz(p: Vector3) -> Vector2:
	return Vector2(p.x,p.z)

func _along(yaw: float) -> Vector2:
	return Vector2(sin(yaw),cos(yaw))

func _tune(tractor: CharacterBody3D, factor: float) -> void:
	tractor.cruise *= factor
	for i in tractor.limits.size():
		tractor.limits[i] *= factor

func _attach(vehicle: CharacterBody3D) -> Trailer:
	_load_shapes()
	var t := Trailer.new()
	t.tractor = vehicle
	t.phase = randf()*6.0
	t.floor_y = vehicle.position.y
	var forward := _xz(-vehicle.basis.z).normalized()
	t.axle = _xz(vehicle.position)-forward*(VEHICLE.NOSE+.25+BAR)
	t.body = CharacterBody3D.new()
	t.body.name = "HorseTrailer"
	t.body.collision_layer = VEHICLE.TRAILER_LAYER
	t.body.collision_mask = 1
	t.body.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	t.body.rotation_order = EULER_ORDER_YXZ
	var shape := CollisionShape3D.new()
	shape.shape = hull
	shape.position = Vector3(0,1.15,.1)
	t.body.add_child(shape)
	add_child(t.body)
	PART.instance(t.body,meshes[0])
	PART.instance(t.body,meshes[1])
	t.neck = PART.instance(t.body,meshes[2],Vector3(.86,1.72,1.1))
	t.neck.scale = Vector3.ONE*1.3
	t.tail = PART.instance(t.body,meshes[3],Vector3(0,2.25,-1.66))
	_tune(vehicle,SLOW)
	vehicle.tow_length = TOW
	vehicle.horse_rolled = true
	trailers.append(t)
	_follow(t)
	t.body.reset_physics_interpolation()
	return t

func _pose(t: Trailer, hitch_y := INF) -> void:
	t.floor_y = host.ground.at(t.axle.x,t.axle.y,t.floor_y)
	if is_inf(hitch_y):
		var tip := t.axle+_along(t.heading)*BAR
		hitch_y = host.ground.at(tip.x,tip.y,t.floor_y)
	t.body.position = Vector3(t.axle.x,t.floor_y+absf(sin(t.roll))*.85,t.axle.y)
	t.body.rotation = Vector3(-atan((hitch_y-t.floor_y)/BAR)+t.pitch,t.heading,t.roll)

func _follow(t: Trailer) -> void:
	var forward := _xz(-t.tractor.basis.z).normalized()
	var hitch := _xz(t.tractor.position)-forward*(VEHICLE.NOSE+.25)
	var offset := t.axle-hitch
	var length := offset.length()
	if length<.01 or absf(length-BAR)>3.0:
		offset = -forward
	else:
		offset /= length
	t.axle = hitch+offset*BAR
	t.heading = atan2(-offset.x,-offset.y)
	t.pitch = 0
	_pose(t,t.tractor.position.y)

func _let_go(t: Trailer, kick: Vector2, strength: float) -> void:
	if t.loose:
		t.slide += kick
		return
	t.loose = true
	loose.append(t)
	t.tractor.tow_length = 0
	t.tractor = null
	t.slide = kick
	t.spin = randf_range(-1,1)*minf(3.0,.6+strength*.12)
	if strength>=TIP:
		t.tipped = 1.45 if randf()<.5 else -1.45
	host.cast.say(t.body,"иго-го!",Color("#7a4a2a"),2.2)
	t.body.get_node("EventSpeech").position.y = 3.5
	neighed.emit(t.body.position)

func _free_motion(t: Trailer, dt: float) -> void:
	var speed := t.slide.length()
	if speed>.05 or absf(t.spin)>.02:
		var motion := t.slide*dt
		var collision := t.body.move_and_collide(Vector3(motion.x,0,motion.y))
		t.axle = _xz(t.body.position)
		if collision:
			t.slide *= .4
		t.slide = t.slide.move_toward(Vector2.ZERO,minf(speed,9.0*dt)*(.4 if collision else 1.0))
		t.heading += t.spin*dt
		t.spin *= exp(-2.4*dt)
		if speed>4.0 and randf()<dt*10.0:
			_particles(t.body.position+Vector3.UP*.2,Vector3.UP,false,1)
	t.roll = lerpf(t.roll,t.tipped,minf(1.0,dt*5.0))
	t.pitch = lerpf(t.pitch,.16,minf(1.0,dt*6.0))
	_pose(t)

func _particles(at: Vector3, toward: Vector3, sparks: bool, count: int) -> void:
	if DisplayServer.get_name()=="headless":
		return
	var p := CPUParticles3D.new()
	p.emitting = false
	p.one_shot = true
	p.amount = count
	p.lifetime = .34 if sparks else .48
	p.explosiveness = 1.0
	p.direction = (toward+Vector3.UP*.75).normalized()
	p.spread = 48
	p.gravity = Vector3.DOWN*9.0 if sparks else Vector3.UP*.45
	p.initial_velocity_min = 2.0 if sparks else .3
	p.initial_velocity_max = 5.5 if sparks else .7
	p.mesh = spark_mesh if sparks else dust_mesh
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.finished.connect(p.queue_free,CONNECT_ONE_SHOT)
	add_child(p)
	p.position = at
	p.emitting = true

func _touch(t: Trailer, pos: Vector2) -> void:
	var car: CharacterBody3D = host.car
	if absf(car.position.y-t.floor_y)>1.85 or car.airborne:
		return
	var car_dir := _xz(-car.basis.z).normalized()
	var trailer_dir := _along(t.heading)
	var center := t.axle+trailer_dir*.1
	var best := INF
	var normal := Vector2.ZERO
	var touch := Vector2.ZERO
	for nose: float in [-.55,.55]:
		var a := pos+car_dir*(nose*PLAYER_HALF_LENGTH)
		for end: float in [-.85,.85]:
			var b := center+trailer_dir*end
			var distance := a.distance_squared_to(b)
			if distance<best:
				best = distance
				normal = a-b
				touch = (a+b)*.5
	if best>=1.95*1.95 or best<.000001:
		return
	var gap := sqrt(best)
	normal /= gap
	var penetration := 1.95-gap
	var n := Vector3(normal.x,0,normal.y)
	var relative := t.slide if t.loose else trailer_dir*float(t.tractor.pace if t.tractor.going else 0.0)
	var closing := (_xz(car.velocity)-relative).dot(normal)
	if closing>=0:
		car.position += n*penetration
	elif -closing>BREAKAWAY:
		var strength := -closing
		var at := Vector3(touch.x,t.floor_y+.8,touch.y)
		_let_go(t,-normal*strength*.8,strength)
		t.axle -= normal*penetration
		_pose(t)
		hit.emit(at,strength)
		_particles(at,-n,true,12 if strength>12.0 else 5)
		car.collision_damage(strength,true,at,n,(strength-5.0)*.14)
		car.velocity.x *= .88
		car.velocity.z *= .88
	elif t.loose:
		t.axle -= normal*penetration*.6
		_pose(t)
		car.position += n*penetration*.4
		t.slide -= closing*normal*.3
		car.velocity -= closing*n*.5
	else:
		car.position += n*penetration
		car.velocity -= closing*n*.8

func step(dt: float, observer: Vector2) -> void:
	for i in range(trailers.size()-1,-1,-1):
		var t := trailers[i]
		if not t.loose:
			if not is_instance_valid(t.tractor) or t.tractor.is_queued_for_deletion():
				_drop(t)
				continue
			var knock := _xz(t.tractor.coast)
			if knock.length_squared()>TOW_SHOCK*TOW_SHOCK:
				_let_go(t,knock*.5,knock.length())
		if t.loose:
			if t.axle.distance_squared_to(observer)>FAR*FAR:
				_drop(t)
				continue
			_free_motion(t,dt)
		else:
			_follow(t)
		t.phase += dt
		t.neck.rotation.y = sin(t.phase*.7)*.4
		t.neck.rotation.z = sin(t.phase*2.1)*.06
		t.tail.rotation.z = sin(t.phase*3.3)*.35
		var at := _xz(host.car.position)
		if absf(t.axle.x-at.x)<9.0 and absf(t.axle.y-at.y)<9.0 and not host.car.controls_locked:
			_touch(t,at)
	while loose.size()>MAX_LOOSE:
		_drop(loose[0])

func _drop(t: Trailer) -> void:
	if is_instance_valid(t.tractor):
		t.tractor.tow_length = 0.0
	if is_instance_valid(t.body):
		t.body.collision_layer = 0
		t.body.queue_free()
	loose.erase(t)
	trailers.erase(t)

func clear() -> void:
	for i in range(trailers.size()-1,-1,-1):
		var t := trailers[i]
		if is_instance_valid(t.tractor) and not t.tractor.is_queued_for_deletion():
			_tune(t.tractor,1.0/SLOW)
		_drop(t)
