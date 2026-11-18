extends Node3D

const MESHES := preload("res://wildlife_meshes.gd")
const POSE := preload("res://delivery_actor_pose.gd")
const SWIM_REPLIES := ["Эй, тут люди загорают!","Куда по пляжу на машине?!","Песком всех засыпал!","Купаться будешь?","А пицца с чем?"]
const ALONG := Vector2(.459,.888)
const OUT := 1.5/.045
var terrain: RefCounted
var car: CharacterBody3D
var sky: Node
var people: Node
var paint: Material
var make_actor: Callable
var center: Vector2
var water_y:=0.0
var data: Dictionary
var bank:=MESHES.new()
var furniture:=MeshInstance3D.new()
var furniture_paint:=ShaderMaterial.new()
var sign_text:=Label3D.new()
var house_bodies: Array[StaticBody3D]=[]
var hits:=PackedVector4Array()
var last_open:=false
var active:=false
var occupants: Array[Dictionary]=[]
var pending: Array[Dictionary]=[]
var rng:=RandomNumberGenerator.new()
var spawn_wait:=0.0
var cull_wait:=0.0
var time:=0.0
var near:=false
var last_smash:=-999.0

func setup(region: Dictionary, ground: RefCounted, vehicle: CharacterBody3D, traffic: Node, _events: Node, atmosphere: Node,
		recipients: Node, material: Material, _base: Vector2) -> void:
	terrain=ground
	car=vehicle
	sky=atmosphere
	people=recipients
	paint=material
	make_actor=traffic.people.create_person
	center=_vec(region.beach)
	water_y=float(region.water_y)
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_shore.json"))
	hits.resize(24)
	furniture.position=Vector3(center.x,0,center.y)
	furniture_paint.shader=preload("res://summer_shore.gdshader")
	furniture.material_override=furniture_paint
	furniture.visibility_range_end=270
	furniture.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(furniture)
	var kiosk:Dictionary=data.kiosk
	var p:=_vec(kiosk.sign)
	var k:=_vec(kiosk.at)
	sign_text.text=tr("КВАС · МОРОЖЕНОЕ")
	sign_text.position=Vector3(p.x,terrain.land_height(k.x,k.y)+2.5,p.y)
	sign_text.rotation.y=kiosk.heading
	sign_text.modulate=Color("#2e6fb8")
	sign_text.outline_size=1
	sign_text.font_size=60
	sign_text.pixel_size=.0047
	sign_text.visibility_range_end=105
	add_child(sign_text)
	for ob:Dictionary in data.obstacles:
		var body:=StaticBody3D.new()
		body.collision_layer=1
		body.collision_mask=0
		var shape:=CollisionShape3D.new()
		var hull:=BoxShape3D.new()
		hull.size=Vector3(float(ob.xr)*2,2.4,float(ob.zr)*2)
		shape.shape=hull
		shape.position.y=1.2
		body.add_child(shape)
		body.position=Vector3(ob.x,terrain.land_height(ob.x,ob.z),ob.z)
		body.rotation.y=-float(ob.yaw)
		add_child(body)
		house_bodies.append(body)
	hide()

func begin(number:int,seed_value:int,_adult:bool) -> void:
	clear()
	rng.seed=("%d/summer-shore/%d"%[seed_value,number]).hash()
	time=0
	last_smash=-999
	hits.fill(Vector4.ZERO)
	furniture_paint.set_shader_parameter("motion",hits)
	active=true
	show()

func step(delta:float,_hour:float) -> void:
	if not active: return
	time+=delta
	cull_wait-=delta
	if cull_wait<=0:
		cull_wait=.45
		var distance:=Vector2(car.position.x,car.position.z).distance_to(center)
		near=distance<250
		var open:bool=sky.night<.45 and sky.wet<.35
		if open!=last_open or time<1.0:
			furniture_paint.set_shader_parameter("shutters",not open)
			last_open=open
		if distance<290 and not furniture.mesh: bank.request("shore")
		if (not open or distance>240) and (not occupants.is_empty() or not pending.is_empty()): _despawn()
		elif open and distance<170 and occupants.is_empty() and pending.is_empty(): _plan()
	bank.upload_one()
	if not furniture.mesh and bank.meshes.has("shore"):
		furniture.mesh=bank.meshes.shore
	if not near: return
	if not pending.is_empty():
		spawn_wait-=delta
		if spawn_wait<=0:
			_spawn(pending.pop_front())
			spawn_wait=.07
	if time-last_smash<1.0: furniture_paint.set_shader_parameter("clock",time)
	var observer:=Vector2(car.position.x,car.position.z)
	_knock_over(observer)
	for entry in occupants:
		_animate(entry,observer,delta)

func _plan() -> void:
	var towels:Array=data.towels.duplicate()
	for i in 9:
		if towels.is_empty(): break
		var towel:Dictionary=towels.pop_at(rng.randi_range(0,towels.size()-1))
		pending.append({"kind":"sun" if i<7 else "sit","at":Vector2(towel.x,towel.z),"yaw":float(towel.ry),
			"lift":.33 if towel.lounger else .06,"belly":rng.randf()<.35})
	for i in 7:
		var swim:=i<5
		var a:=rng.randf_range(-45,45)
		var b:=-OUT-rng.randf_range(3,17) if swim else -OUT+rng.randf_range(1.5,3.5)
		pending.append({"kind":"swim" if swim else "walk","at":_world(a,b),"yaw":0,"lift":0.0,"belly":false,
			"a":a,"b":b,"ta":a,"tb":b,"dir":1 if rng.randf()<.5 else -1,"stroke":rng.randf()<.35})
	for kind in ["seller","buyer"]:
		pending.append({"kind":kind,"at":_vec(data.kiosk[kind]),"yaw":float(data.kiosk.heading)+(PI if kind=="buyer" else 0),
			"lift":.25 if kind=="seller" else 0.0,"belly":false})

func _spawn(e:Dictionary) -> void:
	if not make_actor.is_valid(): return
	var person:Dictionary=people.worker(rng.randi())
	if e.kind!="seller": person.swim=rng.randi_range(0,7)
	var actor:Node3D=make_actor.call(int(person.model),e.at,e.at,0.0)
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false):
		mesh.material_override=people.clothing(person,paint)
	e.actor=actor
	e.pose=POSE.new()
	e.pose.setup(actor.model)
	e.phase=rng.randf()*TAU
	e.seated=false
	e.said=rng.randf_range(3,8)
	e.stance=""
	actor.rotation.y=e.yaw
	occupants.append(e)

func _animate(e:Dictionary,observer:Vector2,delta:float) -> void:
	var actor:Node3D=e.actor
	if not is_instance_valid(actor) or actor.defeated: return
	if actor.stunned>0 or actor.knockdown>0 or actor.ragdoll!=null or actor.recovery>0:
		if e.kind!="stand":
			e.kind="stand"
			e.pose.sit(0)
			actor.model.position=Vector3.ZERO
			actor.model.rotation=Vector3.ZERO
		return
	var offset:Vector2=observer-e.at
	var d:=offset.length()
	e.phase+=delta
	match e.kind:
		"sun","sit":
			if e.kind=="sun":
				if d<9 and absf(car.speed)>.5: e.seated=true
				elif d>13: e.seated=false
			else: e.seated=true
			var stance:="sit" if e.seated else "lie"
			if stance!=e.stance:
				actor.player.pause()
				if stance=="sit":
					actor.model.rotation=Vector3.ZERO
					actor.model.position=Vector3(0,e.lift-.6,0)
					e.pose.sit(1)
				else:
					e.pose.sit(0)
					actor.model.rotation=Vector3(PI*.5 if e.belly else -PI*.5,0,0)
					actor.model.position=Vector3(0,e.lift+.2,-.85 if e.belly else .85)
				e.stance=stance
			actor.rotation.y=atan2(offset.x,offset.y) if e.seated and d<14 else e.yaw
		"walk":
			e.a+=e.dir*.65*delta
			if absf(e.a)>54: e.dir=-signf(e.a)
			e.at=_world(e.a,e.b)
			var along:=ALONG.normalized()*float(e.dir)
			actor.rotation.y=atan2(along.x,along.y)
			actor.position=Vector3(e.at.x,terrain.land_height(e.at.x,e.at.y),e.at.y)
			if e.stance!="walk":
				actor.player.get_animation("walk").loop_mode=Animation.LOOP_LINEAR
				actor.player.play("walk",.15,.75)
				e.stance="walk"
		"swim":
			if e.stroke:
				if absf(e.ta-e.a)<.5 and absf(e.tb-e.b)<.5:
					e.ta=rng.randf_range(-50,50)
					e.tb=-OUT-rng.randf_range(3,20)
				var position_:Vector2=Vector2(e.a,e.b).move_toward(Vector2(e.ta,e.tb),.55*delta)
				var goal:=_world(e.ta,e.tb)
				e.a=position_.x
				e.b=position_.y
				e.at=_world(e.a,e.b)
				actor.rotation.y=atan2(goal.x-e.at.x,goal.y-e.at.y)
			actor.position=Vector3(e.at.x,water_y-1.31+sin(e.phase*2.3)*.075,e.at.y)
			if e.stance!="swim":
				actor.player.play("carry",.2)
				actor.model.rotation.x=.47 if e.stroke else 0.0
				e.stance="swim"
		"stand","seller","buyer":
			if d<14: actor.rotation.y=atan2(offset.x,offset.y)
			actor.model.position.y=e.lift
	if d<14 and absf(car.speed)>4 and e.kind not in ["sun","sit"]:
		e.said-=delta
		if e.said<=0:
			e.said=rng.randf_range(8,16)
			_bubble(actor)

func _bubble(actor:Node3D) -> void:
	var line:=Label3D.new()
	line.text=tr(SWIM_REPLIES[rng.randi_range(0,SWIM_REPLIES.size()-1)])
	line.font_size=22
	line.pixel_size=.008
	line.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	line.position.y=2.1
	actor.add_child(line)
	var fade:=line.create_tween()
	fade.tween_interval(2.3)
	fade.tween_property(line,"modulate:a",0.0,.35)
	fade.tween_callback(line.queue_free)

func _knock_over(observer:Vector2) -> void:
	if absf(car.speed)<3.0 or observer.distance_squared_to(center)>80*80: return
	for i in data.breakable.size():
		if hits[i+1].w>0: continue
		var item:Dictionary=data.breakable[i]
		var at:=_vec(item.at)
		if at.distance_squared_to(observer)>36: continue
		var point:=car.to_local(Vector3(at.x,car.position.y,at.y))
		if absf(point.x)>1.0+float(item.r) or absf(point.z)>2.1+float(item.r): continue
		var h:=Vector2(car.velocity.x,car.velocity.z).normalized()
		if h.length_squared()<.1: h=Vector2(-car.basis.z.x,-car.basis.z.z)
		var push:=h*clampf(absf(car.speed)*.12,.6,3.2)
		hits[i+1]=Vector4(push.x,push.y,time,1.0)
		furniture_paint.set_shader_parameter("clock",time)
		furniture_paint.set_shader_parameter("motion",hits)
		last_smash=time

func _world(a:float,b:float) -> Vector2:
	var along:=ALONG.normalized()
	return center+along*a+Vector2(along.y,-along.x)*b

func _despawn() -> void:
	for e in occupants:
		if is_instance_valid(e.actor): e.actor.queue_free()
	occupants.clear()
	pending.clear()

func clear() -> void:
	_despawn()
	active=false
	near=false
	cull_wait=0
	hide()

func _exit_tree() -> void:
	bank.dispose()

static func _vec(raw:Array) -> Vector2:
	return Vector2(raw[0],raw[1])
