extends Node3D

const CAST := preload("res://south_event_people.gd")
const SITE := "res://assets/south-night.json"
const CAMP_LINES := ["Ууга!","Огонь — наш!","Пляши с нами!"]
const POT_LINES := ["Хи-хи-хи!","Не подходи — заколдую!","Отвар не для курьеров","Пицца с мухоморами — завтра"]
const STREET_LINES := ["Красавчик, подвезёшь?","Ночь сегодня тёплая","Далеко едешь?"]
var specs: Array[Dictionary] = []
var ghosts: Array[Dictionary] = []
var cast: CAST
var ground: RefCounted
var car: CharacterBody3D
var events: Node
var adult := true
var scan := 0.0
var hour := 9.0
var glow := StandardMaterial3D.new()
var liquid := StandardMaterial3D.new()
var iron := StandardMaterial3D.new()


func setup(_region: Dictionary, terrain: RefCounted, vehicle: CharacterBody3D, _traffic: Node,
		host: Node, _sky: Node, _people: Node, _paint: Material, _depot: Vector2) -> void:
	ground = terrain
	car = vehicle
	events = host
	cast = events.cast
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.albedo_color = Color("#ff9a2c")
	glow.emission_enabled = true
	glow.emission = Color("#f78b24")
	liquid.albedo_color = Color("#91bd2e")
	liquid.emission_enabled = true
	liquid.emission = Color("#52702d")
	iron.albedo_color = Color("#4a4847")
	var source: Array = JSON.parse_string(FileAccess.get_file_as_string(SITE))
	for data: Dictionary in source:
		var xz := Vector2(data.at[0],data.at[1])
		specs.append({"kind":data.kind,"xz":xz,"axis":Vector2(data.axis[0],data.axis[1]),"n":int(data.people),
			"root":null,"people":[],"payload":null,"flames":[],"spill":null,"tipped":-1.0,"talk":0.0,"age":0.0})


func begin(_number: int, _seed_value: int, mature: bool) -> void:
	clear()
	adult = mature


func step(delta: float, clock: float) -> void:
	hour = fposmod(clock,24.0)
	var xz := Vector2(car.position.x,car.position.z)
	scan -= delta
	for site: Dictionary in specs:
		var road_people: bool = site.kind == "people"
		var open: bool = (hour >= (22.0 if road_people else 23.0) or hour < 5.0) and (adult or not road_people)
		var point: Vector2 = site.xz
		var distance_sq := xz.distance_squared_to(point)
		if scan <= 0 and site.root == null and open and distance_sq < (200.0 if road_people else 230.0)**2 and _off_camera(xz,point):
			_spawn(site)
		if not is_instance_valid(site.root):
			continue
		if distance_sq > (260.0 if road_people else 300.0)**2 or (not open and _off_camera(xz,point)):
			_retire(site)
			continue
		if distance_sq < 170.0*170.0:
			_update(site,xz,delta)
	if scan <= 0:
		scan = .45
	_step_ghosts(xz,delta)


func _off_camera(from: Vector2, to: Vector2) -> bool:
	if from.distance_squared_to(to) > 140.0*140.0:
		return true
	var camera := get_viewport().get_camera_3d()
	if not camera:
		return false
	return camera.is_position_behind(Vector3(to.x,ground.land_height(to.x,to.y)+1.6,to.y))


func _spawn(site: Dictionary) -> void:
	var root := Node3D.new()
	add_child(root)
	var xz: Vector2 = site.xz
	root.position = Vector3(xz.x,ground.land_height(xz.x,xz.y),xz.y)
	site.root = root
	site.age = 0.0
	site.talk = 0.0
	site.tipped = -1.0
	site.people.clear()
	if site.kind == "people":
		var axis: Vector2 = site.axis
		for i in int(site.n):
			var person := cast.actor(1 if i%2==0 else 3,xz+axis*(float(i)-.5)*1.4,Color("#8b5067"))
			person.rotation.y = atan2(-axis.y,axis.x)
			site.people.append(person)
		return
	if site.kind == "camp":
		for i in 3:
			var flame := _cone(root,glow,Vector3(.18*(i-1),.48,0),.35+float(i)*.10,.9)
			site.flames.append(flame)
		for i in int(site.n):
			var angle := TAU*i/float(site.n)
			var at := xz + Vector2.from_angle(angle)*3.4
			var person := cast.actor(i,at,Color("#aa6c3d"))
			person.rotation.y = atan2(xz.x-at.x,xz.y-at.y)
			site.people.append(person)
	else:
		site.payload = _cone(root,iron,Vector3(0,.49,0),.74,.76,.55)
		_cone(site.payload,liquid,Vector3(0,.388,0),.60,.022,.60)
		var witch := cast.actor(1,xz+Vector2(site.axis)*1.38,Color("#65724e"))
		var brim := _cone(witch,iron,Vector3(0,1.78,0),.37,.03,.37)
		_cone(brim,iron,Vector3(0,.235,0),.0,.47,.21)
		site.people.append(witch)


func _update(site: Dictionary, at: Vector2, dt: float) -> void:
	site.age += dt
	site.talk = maxf(0.0,float(site.talk)-dt)
	var delta: Vector2 = at-site.xz
	if site.kind == "pot" and site.tipped < 0.0 and _contact(delta,.75):
		site.tipped = 0.0
		site.payload.rotate_x(1.17)
		site.spill = _cone(site.root,liquid,Vector3.ZERO,3.6,.022,3.6)
	if site.tipped >= 0.0:
		site.tipped += dt
		if is_instance_valid(site.spill):
			var age := float(site.tipped)
			var span := smoothstep(0.0,1.5,age)*(1.0-smoothstep(5.5,12.5,age))
			site.spill.scale = Vector3(maxf(.01,span),1.0,maxf(.01,span))
			if age > 12.5:
				site.spill.queue_free()
				site.spill = null
	if site.kind == "camp":
		for i in site.flames.size():
			site.flames[i].scale.y = 0.9 + .18*sin(float(site.age)*11.0+i*2.3)
		if site.talk <= 0.0 and absf(car.speed)>2.0 and _contact(delta,1.1):
			site.talk = 1.2
			car.velocity *= .85
			events.road_thump.emit(.55)
	if site.talk > 0.0 or site.people.is_empty():
		return
	var speaker: Node3D = site.people[0]
	if not is_instance_valid(speaker) or speaker.defeated:
		return
	if site.kind == "people" and delta.length_squared() < 64 and absf(car.speed)*3.6<20:
		cast.say(speaker,tr(str(STREET_LINES.pick_random())),Color("#e5acbc"),3.2)
		site.talk = 6.0
	elif site.kind == "pot" and delta.length_squared() < 18.0*18.0:
		cast.say(speaker,tr(str(POT_LINES.pick_random())),Color("#acd6a0"),3.6)
		site.talk = 7.0
	elif site.kind == "camp" and delta.length_squared() < 18.0*18.0:
		cast.say(speaker,tr(str(CAMP_LINES.pick_random())),Color("#ffc687"),2.8)
		site.talk = 7.0


func fallen(actor: Node3D, direction: Vector3) -> void:
	if hour >= 5.0 and hour < 23.0 or ghosts.size() >= 8:
		return
	var facing := Vector2(direction.x,direction.z).normalized()
	ghosts.append({"at":actor.global_position,"direction":facing if not facing.is_zero_approx() else Vector2.DOWN,
		"age":0.0,"node":null})


func _step_ghosts(observer: Vector2, dt: float) -> void:
	for i in range(ghosts.size()-1,-1,-1):
		var ghost := ghosts[i]
		ghost.age += dt
		var at: Vector3 = ghost.at
		var delta := observer-Vector2(at.x,at.z)
		var node: Node3D = ghost.node
		if ghost.age >= 90.0 or delta.length_squared() > 260.0*260.0 or (hour < 23.0 and hour >= 5.0) or (node and _contact(delta,.45)):
			if is_instance_valid(node):
				node.queue_free()
			ghosts.remove_at(i)
			continue
		if not node and ghost.age >= 1.2:
			node = _ghost_body(at)
			ghost.node = node
		if node:
			var direction: Vector2 = ghost.direction
			at += Vector3(direction.x,0,direction.y)*1.2*dt
			at.y = ground.land_height(at.x,at.z)+.12*sin(float(ghost.age)*2.4)
			ghost.at = at
			node.position = at
			node.rotation.y = atan2(direction.x,direction.y)


func _ghost_body(at: Vector3) -> Node3D:
	var ghost := Node3D.new()
	ghost.position = at
	add_child(ghost)
	var mist := StandardMaterial3D.new()
	mist.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mist.albedo_color = Color("#a9d0dd62")
	mist.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_cone(ghost,mist,Vector3(0,.72,0),.25,1.45,.40)
	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = .19
	sphere.height = .38
	sphere.material = mist
	head.mesh = sphere
	head.position.y = 1.51
	head.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ghost.add_child(head)
	return ghost


func _contact(delta: Vector2, radius: float) -> bool:
	if car.airborne or absf(car.speed) < .8 or delta.length_squared() > 25.0:
		return false
	var front := Vector2(-car.basis.z.x,-car.basis.z.z)
	return absf(delta.dot(front)) < 2.32+radius and absf(delta.cross(front)) < 1.04+radius


func _retire(site: Dictionary) -> void:
	for actor: Node3D in site.people:
		cast.retire(actor)
	site.people.clear()
	site.flames.clear()
	if is_instance_valid(site.root):
		site.root.queue_free()
	site.root = null
	site.payload = null
	site.spill = null


func clear() -> void:
	for site: Dictionary in specs:
		_retire(site)
	for ghost: Dictionary in ghosts:
		if is_instance_valid(ghost.node):
			ghost.node.queue_free()
	ghosts.clear()
	scan = 0.0


func _cone(parent: Node3D, paint: Material, at: Vector3, upper: float, height: float, lower := 0.0) -> MeshInstance3D:
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = upper
	cylinder.bottom_radius = lower
	cylinder.height = height
	cylinder.radial_segments = 10
	cylinder.rings = 1
	cylinder.material = paint
	var node := MeshInstance3D.new()
	node.mesh = cylinder
	node.position = at
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(node)
	return node
