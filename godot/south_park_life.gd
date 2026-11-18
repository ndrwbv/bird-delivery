extends Node3D

signal notice(text: String)
const POSE := preload("res://delivery_actor_pose.gd")
const FLIGHT := preload("res://south_park_flight.gd")
const COURIER := preload("res://assets/courier.glb")
const BAR_HEIGHT := 2.3
const DIP_HEIGHT := 1.25
var wave:=preload("res://south_park_flyers.gd").new()
var terrain: RefCounted
var car: CharacterBody3D
var sky: Node
var people: Node
var paint: Material
var create_actor: Callable
var gyms: Array[Dictionary]=[]
var flights: Array[Dictionary]=[]
var populated: Array[Dictionary]=[]
var flying: Array[Dictionary]=[]
var next_flyers: Array[Dictionary]=[]
var near_gyms: Array[Dictionary]=[]
var iron_meshes: Dictionary={}
var rng:=RandomNumberGenerator.new()
var scan:=0.0
var spawn_wait:=0.0
var active:=false
var number:=0
var last_heal:=-1
var last_site:Dictionary={}
var session:Dictionary={}
var waited:=0.0
var drive_or_back:=false
var iron_paint:=StandardMaterial3D.new()

func setup(_region:Dictionary, ground:RefCounted, vehicle:CharacterBody3D, traffic:Node, _events:Node, atmosphere:Node,
		recipients:Node, material:Material, _base:Vector2) -> void:
	terrain=ground
	car=vehicle
	sky=atmosphere
	people=recipients
	paint=material
	create_actor=traffic.people.create_person
	add_child(wave)
	wave.setup(self,_region,traffic.roads)
	iron_paint.vertex_color_use_as_albedo=true
	var data:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_park.json"))
	for entry:Dictionary in data.gym:
		var at:=Vector2(entry.at[0],entry.at[1])
		var axis:=Vector2(entry.axis[0],entry.axis[1]).normalized()
		gyms.append({"at":at,"axis":axis,"bar":at-axis*1.3,"dip":at+axis*1.5,"height":terrain.land_height(at.x,at.y),
			"color":entry.color,"baked":entry.baked,"prop":null,"people":[]})
	for entry:Dictionary in data.kites:
		var at:=Vector2(entry.at[0],entry.at[1])
		flights.append({"at":at,"kite":entry.kite,"wind":entry.wind,"color":entry.color,"height":terrain.land_height(at.x,at.y),"rest":0.0,"person":null})

func begin(shift_number:int,seed_value:int,_adult:bool) -> void:
	clear()
	number=shift_number
	last_heal=-1
	rng.seed=("%d/parks/%d"%[seed_value,shift_number]).hash()
	active=true
	wave.begin(rng.randi())
	scan=0.0

func step(delta:float,_hour:float) -> void:
	if not active: return
	var pos:=Vector2(car.position.x,car.position.z)
	wave.step(delta,_hour,pos)
	scan-=delta
	if scan<=0:
		scan=1
		_nearby(pos)
	spawn_wait-=delta
	if not next_flyers.is_empty() and spawn_wait<=0:
		_spawn_flight(next_flyers.pop_front())
		spawn_wait=.09
	for s in populated:
		for p:Dictionary in s.people:
			if is_instance_valid(p.actor) and not _fallen(p.actor):
				_exercise(p,s,delta)
	for i in range(flying.size()-1,-1,-1):
		var s:=flying[i]
		if not is_instance_valid(s.person) or s.person.defeated:
			_stop_flight(s,true)
		else:
			s.toy.advance(delta,s.person,_fallen(s.person))
	_player_step(pos,delta)

func _nearby(pos:Vector2) -> void:
	near_gyms.clear()
	var wants_people:bool=sky.night<.45 and sky.wet<.5
	var wants_kites:bool=sky.night<.4 and sky.wet<.3
	var closest:Dictionary={}
	var best:=130.0*130.0
	for s in gyms:
		var d:=pos.distance_squared_to(s.at)
		if d<24.0*24.0: near_gyms.append(s)
		if d<205.0*205.0 and not s.baked and not is_instance_valid(s.prop): _make_iron(s)
		if d>255.0*255.0 and is_instance_valid(s.prop):
			s.prop.queue_free()
			s.prop=null
		if (d>160.0*160.0 or not wants_people) and s in populated and s!=session.get("site",{}): _stop_gym(s)
		if wants_people and d<best and s not in populated:
			closest=s
			best=d
	if not closest.is_empty() and populated.size()<3:
		populated.append(closest)
		var bar:=rng.randf()<.6
		if not (bar and closest==session.get("site",{})): _athlete(closest,bar)
		if rng.randf()<.55 and not (not bar and closest==session.get("site",{})): _athlete(closest,not bar)
	next_flyers.clear()
	for s in flights:
		s.rest=maxf(0,s.rest-1.0)
		var d:=pos.distance_squared_to(s.at)
		if is_instance_valid(s.person):
			if not wants_kites or d>320.0*320.0: _stop_flight(s,false)
		elif wants_kites and s.rest<=0 and d<260.0*260.0:
			next_flyers.append(s)
	next_flyers.sort_custom(func(a,b):return pos.distance_squared_to(a.at)<pos.distance_squared_to(b.at))
	if next_flyers.size()>4-flying.size(): next_flyers.resize(maxi(0,4-flying.size()))

func _make_iron(s:Dictionary) -> void:
	var prop:=StaticBody3D.new()
	prop.collision_layer=1
	prop.collision_mask=0
	var bars:=MeshInstance3D.new()
	if not iron_meshes.has(s.color):
		var surface:=SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		var cube:=BoxMesh.new()
		cube.size=Vector3.ONE
		var cube_data:=cube.get_mesh_arrays()
		_iron_piece(surface,cube_data,Vector3(0,.025,0),Vector3(4.6,.05,2.4),Color("#dcb174"))
		for p in _posts():
			_iron_piece(surface,cube_data,Vector3(p.x,p.y*.5,p.z),Vector3(.09,p.y,.09),Color(s.color))
		_iron_piece(surface,cube_data,Vector3(-1.3,BAR_HEIGHT,0),Vector3(1.5,.05,.05),Color("#4f5a66"))
		for z:float in [-.3,.3]:
			_iron_piece(surface,cube_data,Vector3(1.5,DIP_HEIGHT,z),Vector3(1.9,.06,.06),Color("#4f5a66"))
		iron_meshes[s.color]=surface.commit()
	bars.mesh=iron_meshes[s.color]
	bars.material_override=iron_paint
	prop.add_child(bars)
	for p in _posts():
		var shape:=BoxShape3D.new()
		shape.size=Vector3(.24,p.y,.24)
		var hull:=CollisionShape3D.new()
		hull.position=Vector3(p.x,p.y*.5,p.z)
		hull.shape=shape
		prop.add_child(hull)
	prop.rotation.y=-atan2(s.axis.y,s.axis.x)
	prop.position=Vector3(s.at.x,s.height,s.at.y)
	add_child(prop)
	s.prop=prop

func _posts() -> PackedVector3Array:
	return PackedVector3Array([Vector3(-2,2.35,0),Vector3(-.6,2.35,0),Vector3(.7,1.25,-.3),Vector3(2.3,1.25,-.3),Vector3(.7,1.25,.3),Vector3(2.3,1.25,.3)])

func _iron_piece(surface:SurfaceTool,cube:Array,center:Vector3,extent:Vector3,tone:Color) -> void:
	var vertices:PackedVector3Array=cube[Mesh.ARRAY_VERTEX]
	var normals:PackedVector3Array=cube[Mesh.ARRAY_NORMAL]
	var color:=tone.srgb_to_linear()
	for index:int in cube[Mesh.ARRAY_INDEX]:
		surface.set_color(color)
		surface.set_normal(normals[index])
		surface.add_vertex(center+vertices[index]*extent)

func _person(at:Vector2,seed_value:int) -> Node3D:
	var person:Dictionary=people.worker(seed_value)
	var actor:Node3D=create_actor.call(int(person.model),at,at,0)
	var shirt:Material=people.clothing(person,paint)
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false): mesh.material_override=shirt
	actor.player.pause()
	return actor

func _athlete(s:Dictionary,bar:bool) -> void:
	var target:Vector2=s.bar if bar else s.dip
	var actor:=_person(target,rng.randi())
	var exercise_pose:=POSE.new()
	exercise_pose.setup(actor.model)
	var p:Dictionary={"actor":actor,"model":actor.model,"pose":exercise_pose,"bar":bar,"reps":rng.randi_range(5,12),"per":rng.randf_range(1.4,1.9),
		"rest":rng.randf_range(3,6),"t":rng.randf_range(0,3),"rep":0}
	s.people.append(p)
	_exercise(p,s,0)

func _exercise(p:Dictionary,s:Dictionary,delta:float) -> void:
	p.t+=delta
	if p.t>p.reps*p.per+p.rest:
		if p==session:
			_end_set(true)
			return
		p.t=0.0
		p.rep=0
		p.reps=rng.randi_range(5,12)
	var fraction:=.5-.5*cos(float(p.t)/p.per*TAU) if p.t<p.reps*p.per else 0.0
	var pull:bool=p.bar
	var site:Vector2=s.bar if pull else s.dip
	var heading:Vector2=Vector2(-s.axis.y,s.axis.x) if pull else s.axis
	var offset:float=BAR_HEIGHT-1.3-.6*cos(.22+.95*fraction)
	if not pull:
		var angle:=.12+.75*(1-fraction)
		offset=DIP_HEIGHT-1.3+.6*cos(angle)
		site+=heading*.6*sin(angle)
	p.pose.exercise(pull,fraction)
	p.actor.position=Vector3(site.x,s.height,site.y)
	p.actor.rotation.y=atan2(heading.x,heading.y)
	p.model.position.y=offset
	if p.has("counter"):
		var rep:=mini(p.reps,floori(float(p.t)/p.per))
		if rep!=p.rep:
			p.rep=rep
			p.counter.text=str(rep)

func _player_step(pos:Vector2,delta:float) -> void:
	var speed:=Vector2(car.velocity.x,car.velocity.z).length()
	var free:bool=drive_or_back and not car.controls_locked
	if not session.is_empty():
		if not free or speed>1: _end_set(false)
		else: _exercise(session,session.site,delta)
		return
	if not last_site.is_empty() and pos.distance_squared_to(last_site.at)>169: last_site={}
	if not free or speed>.55:
		waited=0
		return
	for s in near_gyms:
		if s==last_site or pos.distance_squared_to(s.bar)>=49: continue
		waited+=delta
		if waited>=1.5: _start_set(s)
		return
	waited=0

func _start_set(s:Dictionary) -> void:
	for i in range(s.people.size()-1,-1,-1):
		var p:Dictionary=s.people[i]
		if p.bar:
			if is_instance_valid(p.actor): p.actor.queue_free()
			s.people.remove_at(i)
	var avatar:=Node3D.new()
	var model:Node3D=COURIER.instantiate()
	avatar.add_child(model)
	var pose:=POSE.new()
	pose.setup(model)
	for mesh in model.find_children("*","MeshInstance3D",true,false): mesh.material_override=paint
	var player:AnimationPlayer=model.find_child("AnimationPlayer",true,false)
	player.active=false
	var counter:=Label3D.new()
	counter.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	counter.position.y=2.9
	counter.pixel_size=.008
	counter.font_size=32
	counter.modulate=Color("#ff6a13")
	avatar.add_child(counter)
	add_child(avatar)
	session={"actor":avatar,"model":model,"pose":pose,"bar":true,"site":s,"t":0.0,"rep":0,"reps":rng.randi_range(5,12),"per":1.5,"rest":1.2,"counter":counter}
	waited=0
	_exercise(session,s,0)

func _end_set(full:bool) -> void:
	if session.is_empty(): return
	var reps:int=session.reps
	last_site=session.site
	session.actor.queue_free()
	session={}
	waited=0
	if not full: return
	if last_heal!=number and car.hearts<car.hearts_max:
		last_heal=number
		car.hearts=minf(car.hearts+.5,car.hearts_max)
		car.damage.set_hearts(car.hearts)
		notice.emit(tr("Подтянулся {n} раз. Размялся: +½ сердца").format({"n":reps}))
	else: notice.emit(tr("Подтянулся {n} раз. Пицца подождёт").format({"n":reps}))

func _stop_gym(s:Dictionary) -> void:
	for p:Dictionary in s.people:
		if is_instance_valid(p.actor) and not p.actor.defeated: p.actor.queue_free()
	s.people.clear()
	populated.erase(s)

func _spawn_flight(s:Dictionary) -> void:
	var actor:=_person(s.at,rng.randi())
	var toy:=FLIGHT.new()
	add_child(toy)
	toy.setup(s,actor,rng.randf()*30)
	s.person=actor
	s.toy=toy
	flying.append(s)

func _stop_flight(s:Dictionary,defeated:bool) -> void:
	if is_instance_valid(s.person) and not defeated: s.person.queue_free()
	if is_instance_valid(s.get("toy")): s.toy.queue_free()
	s.person=null
	s.rest=90.0 if defeated else 0.0
	flying.erase(s)

func _fallen(actor:Node) -> bool:
	return actor.stunned>0 or actor.knockdown>0 or actor.ragdoll!=null or actor.recovery>0 or actor.defeated

func clear() -> void:
	wave.clear()
	_end_set(false)
	for s:Dictionary in populated.duplicate(): _stop_gym(s)
	for s:Dictionary in flying.duplicate(): _stop_flight(s,false)
	for s in flights: s.rest=0
	for s in gyms:
		if is_instance_valid(s.prop):
			s.prop.queue_free()
			s.prop=null
	next_flyers.clear()
	near_gyms.clear()
	waited=0
	last_site={}
	active=false
