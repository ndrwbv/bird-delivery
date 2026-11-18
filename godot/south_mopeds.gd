extends Node3D

signal rider_down(person: Node3D, direction: Vector3, speed: float)
signal knocked(at: Vector3, speed: float)

const SWEEP := preload("res://pedestrian_contact.gd")
const WALKER := preload("res://pedestrian.gd")
const POSE := preload("res://delivery_actor_pose.gd")
const COLORS := [Color("#bfa04e"),Color("#b07a8e"),Color("#5f8a69")]
const MAX_MOVING := 3
const NO_CLIENT_RADIUS := 20.0

class Bike:
	var at: Vector2
	var heading: Vector2
	var root: MeshInstance3D
	var rider: Node3D
	var bag: MeshInstance3D
	var edge: RefCounted
	var next: RefCounted
	var path := PackedVector2Array()
	var path_index := 0
	var pace := 0.0
	var cruise := 0.0
	var parked := false
	var hit := false
	var wait := 0.0
	var slide := Vector2.ZERO
	var roll_side := 1.0
	var weave := 0.0
	var lane_shift := 0.0
	var bypass := false
	var shop := -1
	var sushi_goal := Vector2.INF
	var trips := 0
	var sushi_rewarded := false

var car: CharacterBody3D
var terrain: RefCounted
var traffic: Node3D
var make_person: Callable
var bikes: Array[Bike] = []
var entrances: Array = []
var models: Array[ArrayMesh] = []
var bags: Array[ArrayMesh] = []
var spawn_in := 1.0
var check_in := 0.0
var sequence := 0
var sushi := preload("res://south_sushi_couriers.gd").new()


func setup(player: CharacterBody3D, ground: RefCounted, street: Node3D, factory: Callable, doors: Array) -> void:
	car = player
	terrain = ground
	traffic = street
	make_person = factory
	entrances = doors
	for i in COLORS.size():
		models.append(_model(COLORS[i]))
		bags.append(_bag(COLORS[i], Color("#2b2a2e") if i==0 else Color("#d9d4ca")))


func bind_sushi(events: Node3D) -> void:
	sushi.bind(self,events)
	if models.size()==COLORS.size():
		models.append(_model(sushi.BLUE))
		bags.append(_roll_box())


func clear() -> void:
	sushi.cooldown = 0
	for bike in bikes:
		bike.root.queue_free()
		bike.rider.queue_free()
	bikes.clear()
	spawn_in = 1.0


func step(delta: float, customer: Vector2) -> void:
	var observer := _xz(car.position)
	sushi.tick(delta,observer)
	spawn_in -= delta
	check_in -= delta
	for bike in bikes:
		if bike.hit:
			_step_hit(bike,delta)
		elif not bike.parked:
			_step_lane(bike,delta,observer)
	if check_in <= 0.0:
		check_in = .23
	if spawn_in > 0.0:
		return
	spawn_in = 1.0
	var moving := 0
	var parked := 0
	var general := 0
	for i in range(bikes.size()-1,-1,-1):
		var bike := bikes[i]
		var distance := observer.distance_squared_to(bike.at)
		var near_client := bike.parked and distance > 1600.0 and customer.distance_squared_to(bike.at) < NO_CLIENT_RADIUS*NO_CLIENT_RADIUS
		var radius := 160.0 if bike.rider.defeated else (280.0 if bike.parked else 420.0)
		if distance > radius*radius or near_client:
			bike.root.queue_free()
			bike.rider.queue_free()
			bikes.remove_at(i)
			continue
		if bike.shop>=0:
			continue
		general += 1
		if bike.parked:
			parked += 1
		else:
			moving += int(not bike.rider.defeated)
	if moving < MAX_MOVING and general < 6:
		_spawn_moving(observer)
	elif parked == 0 and general < 6:
		_spawn_parked(observer,customer)


func _spawn_moving(observer: Vector2) -> void:
	var nearby: Array = traffic.roads.around(observer,330.0)
	if nearby.is_empty():
		return
	for attempt in 32:
		var e: RefCounted = nearby.pick_random()
		if e.blocked or e.rank > 4 or e.exit-e.entry < 8.0:
			continue
		var at: Vector2 = e.lane(randf_range(e.entry,e.exit-4.0))+e.right*.6
		var d := observer.distance_squared_to(at)
		if d < 60.0*60.0 or d > 330.0*330.0 or not traffic._clear(at,observer) or not _offscreen(at):
			continue
		var bike := _make(at,e.dir,false)
		bike.edge = e
		bike.cruise = randf_range(12.5,16.5)
		bike.pace = bike.cruise
		bike.path = PackedVector2Array([e.lane(e.exit)])
		return


func _spawn_parked(observer: Vector2, customer: Vector2) -> void:
	if entrances.is_empty():
		return
	for attempt in 40:
		var entrance: Array = entrances.pick_random()
		var heading := Vector2(entrance[2],entrance[3]).normalized()
		var at := Vector2(entrance[0],entrance[1])+heading*2.4
		var d := at.distance_squared_to(observer)
		if d < 70.0*70.0 or d > 230.0*230.0 or at.distance_squared_to(customer) < NO_CLIENT_RADIUS*NO_CLIENT_RADIUS:
			continue
		var road: RefCounted = traffic.roads.nearest(at)
		if not road or road.bridge:
			continue
		var away := at.distance_to(Geometry2D.get_closest_point_to_segment(at,road.a,road.b))
		if away < road.width*.5+.8 or away > 24.0 or not traffic._clear(at,observer) or not _offscreen(at):
			continue
		_make(at,heading.orthogonal(),true)
		return


func _make(at: Vector2, heading: Vector2, parked: bool, shop := -1) -> Bike:
	var bike := Bike.new()
	bike.at = at
	bike.heading = heading
	bike.parked = parked
	bike.shop = shop
	var draw := randf()
	var brand := 3 if shop>=0 else (0 if draw < .5 else (1 if draw < .75 else 2))
	bike.root = MeshInstance3D.new()
	bike.root.mesh = models[brand]
	bike.root.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(bike.root)
	sequence += 1
	var person_at := at+heading.orthogonal()*1.05 if parked else at
	bike.rider = sushi.rider(sequence,person_at) if shop>=0 else make_person.call(200+sequence,person_at,person_at,0.0)
	bike.bag = MeshInstance3D.new()
	bike.bag.mesh = bags[brand]
	bike.bag.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	bike.bag.position = Vector3(0,1.36,.52) if shop>=0 else Vector3(0,1.32,.39)
	bike.rider.add_child(bike.bag)
	if parked:
		bike.rider.rotation.y = atan2(-heading.x,-heading.y)
		bike.rider.player.pause()
		var pose := POSE.new()
		pose.setup(bike.rider.model)
		pose.gesture("phone",0.0)
	else:
		_mount(bike)
	_place(bike)
	bikes.append(bike)
	return bike


func _mount(bike: Bike) -> void:
	bike.rider.walker = false
	bike.rider.player.play(&"idle")
	bike.rider.player.advance(0.0)
	bike.rider.player.pause()
	bike.rider.set_physics_process(false)
	bike.rider.collider.collision_layer = 0
	bike.rider.model.position = Vector3(0,.25,.15)
	var pose := POSE.new()
	pose.setup(bike.rider.model)
	pose.sit(.86)
	bike.hit = false
	bike.root.rotation.z = 0.0


func _step_lane(bike: Bike, delta: float, observer: Vector2) -> void:
	if bike.shop>=0:
		sushi.next_goal(bike)
	bike.weave = maxf(0.0,bike.weave-delta)
	var e := bike.edge
	var want := bike.cruise*float(traffic.signals.road_speed(bike.at,bike.heading,bike.pace))
	if check_in <= 0.0:
		bike.bypass = false
		for vehicle: CharacterBody3D in traffic.moving:
			var ahead := _xz(vehicle.position)-bike.at
			var gap := ahead.dot(bike.heading)
			if gap > 0.0 and gap < 12.0 and absf(ahead.cross(bike.heading)) < 2.4:
				bike.bypass = true
				if bike.weave <= 0.0 and gap < 8.0 and e.width >= 7.0 and vehicle.pace < 5.0 and randf() < .55:
					bike.weave = randf_range(2.5,4.0)
	if bike.bypass and bike.weave <= 0.0:
		want = minf(want,6.0)
	var player_gap := observer-bike.at
	if player_gap.dot(bike.heading) > 0.0 and absf(player_gap.cross(bike.heading)) < 1.75:
		want = minf(want,maxf(0.0,(player_gap.length()-2.2)*1.8))
	if e.blocked and bike.path_index == 0 and not bike.next:
		want = minf(want,5.0)
	var shift := -minf(e.width*.14,1.6) if bike.weave>0.0 else clampf(e.width*.12-.32,.1,.95)
	bike.lane_shift = move_toward(bike.lane_shift,shift,delta*1.7)
	bike.pace = move_toward(bike.pace,want,delta*(5.0 if want>bike.pace else 12.0))
	if bike.path_index < bike.path.size():
		var goal: Vector2 = bike.path[bike.path_index]+e.right*bike.lane_shift
		var toward := goal-bike.at
		if toward.length_squared() < .22:
			bike.path_index += 1
		else:
			var before := bike.heading
			bike.heading = bike.heading.lerp(toward.normalized(),1.0-exp(-12.0*delta)).normalized()
			bike.at = bike.at.move_toward(goal,bike.pace*delta)
			bike.root.rotation.z = lerpf(bike.root.rotation.z,
				clampf(before.cross(bike.heading)*2.0,-.31,.31),1.0-exp(-7.0*delta))
		_place(bike)
		return
	if bike.next:
		bike.edge = bike.next
		bike.next = null
		bike.path = PackedVector2Array([bike.edge.lane(bike.edge.exit)])
		bike.path_index = 0
		return
	if bike.shop>=0:
		bike.next = sushi.next_edge(bike)
	if bike.next==null:
		bike.next = traffic.roads.choose_after(bike.edge)
	if bike.next:
		bike.path = traffic.roads.path_after(bike.edge,bike.next)
		bike.path.resize(bike.path.size()-1)
		bike.path_index = 0
	else:
		bike.pace = 0.0


func sweep(start: Vector3, end: Vector3, motion: Vector3) -> void:
	for bike in bikes:
		if bike.hit or absf(bike.root.position.y-start.y)>1.5 or bike.at.distance_squared_to(_xz(start))>36.0:
			continue
		var hit := SWEEP.from_sweep(start,end,car.basis,motion,bike.root.position,.42)
		var speed := float(hit.get("speed",0.0))
		if speed < 3.0:
			continue
		bike.hit = true
		if bike.shop>=0 and not bike.parked:
			sushi.notice_fall(bike)
		bike.slide = _xz(hit.direction)*(speed*.55)+bike.heading*bike.pace*.4
		bike.roll_side = signf(bike.heading.cross(_xz(hit.direction)))
		if is_zero_approx(bike.roll_side):
			bike.roll_side = 1.0
		bike.wait = 0.0
		bike.pace = 0.0
		knocked.emit(bike.root.position,speed)
		car.person_bump()
		if bike.parked:
			continue
		bike.rider.set_physics_process(true)
		var outcome: int = bike.rider.impact(speed,hit.direction,false,hit.offset,1.4)
		bike.rider.model.position = Vector3.ZERO
		if outcome == WALKER.Hit.DOWN:
			rider_down.emit(bike.rider,hit.direction,speed)


func _step_hit(bike: Bike, delta: float) -> void:
	if bike.slide.length_squared()>.08:
		var proposed := bike.at+bike.slide*delta
		var ray := PhysicsRayQueryParameters3D.create(bike.root.position+Vector3.UP*.25,
			Vector3(proposed.x,bike.root.position.y+.25,proposed.y),1)
		if get_world_3d().direct_space_state.intersect_ray(ray).is_empty():
			bike.at = proposed
		else:
			bike.slide *= -.2
		bike.slide *= exp(-3.6*delta)
	bike.root.rotation.z = move_toward(bike.root.rotation.z,1.43*bike.roll_side,delta*5.4)
	_place(bike)
	if bike.parked or bike.rider.defeated or bike.rider.knockdown > 0.0 or bike.rider.recovery > 0.0 or bike.rider.stunned > 0.0:
		return
	bike.wait += delta
	var foot := bike.at+bike.heading.orthogonal()*.5
	var at := _xz(bike.rider.position)
	if at.distance_squared_to(foot) < .3:
		_mount(bike)
		return
	if bike.wait > 12.0:
		bike.parked = true
		return
	if not bike.rider.walker:
		bike.rider.from = at
		bike.rider.to = foot
		bike.rider.progress = 0.0
		bike.rider.pace = 1.5
		bike.rider.reverse = false
		bike.rider.walker = true
		bike.rider.player.play(&"walk",.18,1.1)


func _place(bike: Bike) -> void:
	var y: float = terrain.at(bike.at.x,bike.at.y,bike.root.position.y) if bike.edge and bike.edge.bridge else terrain.at(bike.at.x,bike.at.y)
	bike.root.position = Vector3(bike.at.x,y,bike.at.y)
	bike.root.rotation.y = atan2(-bike.heading.x,-bike.heading.y)
	if not bike.parked and not bike.hit:
		bike.rider.position = bike.root.position
		bike.rider.rotation = bike.root.rotation


func _offscreen(at: Vector2) -> bool:
	var camera := get_viewport().get_camera_3d()
	if not camera:
		return true
	return not camera.is_position_in_frustum(Vector3(at.x,terrain.at(at.x,at.y)+.8,at.y))


static func _xz(at: Vector3) -> Vector2:
	return Vector2(at.x,at.z)


static func _part(st: SurfaceTool, primitive: PrimitiveMesh, transform: Transform3D, color: Color) -> void:
	var data := primitive.get_mesh_arrays()
	var positions: PackedVector3Array = data[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = data[Mesh.ARRAY_NORMAL]
	st.set_color(color.srgb_to_linear())
	for i: int in data[Mesh.ARRAY_INDEX]:
		st.set_normal(transform.basis*normals[i])
		st.add_vertex(transform*positions[i])


static func _box(st: SurfaceTool, size: Vector3, at: Vector3, color: Color) -> void:
	var b := BoxMesh.new()
	b.size = size
	_part(st,b,Transform3D(Basis.IDENTITY,at),color)


static func _model(tint: Color) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st,Vector3(.34,.16,1.0),Vector3(0,.34,.02),Color("#2b2a30"))
	_box(st,Vector3(.4,.62,.1),Vector3(0,.64,-.42),tint)
	_box(st,Vector3(.36,.30,.62),Vector3(0,.56,.30),tint)
	_box(st,Vector3(.3,.1,.56),Vector3(0,.76,.24),Color("#1b1a1f"))
	_box(st,Vector3(.07,.5,.07),Vector3(0,.98,-.46),Color("#585460"))
	_box(st,Vector3(.62,.05,.06),Vector3(0,1.22,-.44),Color("#1b1a1f"))
	_box(st,Vector3(.16,.12,.08),Vector3(0,1.10,-.52),Color("#fff3c4"))
	_box(st,Vector3(.14,.08,.05),Vector3(0,.68,.62),Color("#e8323c"))
	_box(st,Vector3(.32,.05,.32),Vector3(0,.74,.66),Color("#2b2a30"))
	var wheel := CylinderMesh.new()
	wheel.top_radius = .24
	wheel.bottom_radius = .24
	wheel.height = .12
	wheel.radial_segments = 8
	wheel.rings = 1
	for z: float in [-.52,.55]:
		_part(st,wheel,Transform3D(Basis(Vector3.BACK,PI*.5),Vector3(0,.24,z)),Color("#221c19"))
	return _commit(st)


static func _roll_box() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var stripe := Color("#1a8cff")
	for band: Array in [[0.31,0.62,0.0,Color("#1d3b2c"),12],[0.315,0.1,0.0,stripe,12],
		[0.27,0.02,-0.315,Color("#f8f6ef"),12],[0.27,0.02,0.315,Color("#f8f6ef"),12],
		[0.11,0.03,-0.32,Color("#f07a5a"),8],[0.11,0.03,0.32,Color("#f07a5a"),8]]:
		var ring := CylinderMesh.new()
		ring.top_radius = band[0]
		ring.bottom_radius = band[0]
		ring.height = band[1]
		ring.radial_segments = band[4]
		ring.rings = 1
		_part(st,ring,Transform3D(Basis(Vector3.BACK,PI*0.5),Vector3(band[2],0,0)),band[3])
	return _commit(st)


static func _bag(tint: Color, stripe: Color) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st,Vector3(.58,.56,.44),Vector3.ZERO,tint)
	_box(st,Vector3(.59,.09,.45),Vector3(0,.04,0),stripe)
	_box(st,Vector3(.24,.16,.02),Vector3(0,-.13,.23),stripe)
	return _commit(st)


static func _commit(st: SurfaceTool) -> ArrayMesh:
	st.index()
	var paint := StandardMaterial3D.new()
	paint.vertex_color_use_as_albedo = true
	paint.roughness = .87
	st.set_material(paint)
	return st.commit()
