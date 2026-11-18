extends Node3D

const POSE:=preload("res://delivery_actor_pose.gd")
const TROUSERS:={0:Vector3(10,13,27),2:Vector3(3,4,5),4:Vector3(65,50,26)}
const LINES:=["Шофёр, машину!","Без сахара, я сказал","Продавай всё!","Опять пробки…","Не наш уровень"]
const EN:=["Driver, my car!","No sugar, I said","Sell everything!","Traffic again…","Beneath us"]
var yard:Node
var traffic:Node
var bins:Dictionary={}
var posh:Array[Vector2]=[]
var residents:Array[Dictionary]=[]
var chauffeur:Dictionary={}
var random:=RandomNumberGenerator.new()
var accessories:Dictionary={}
var jackets:Dictionary={}
var body_paint:Material
var glass_paint:Material
var scan:=.5
var next_resident:=false
var next_car:=false
var fit:=PhysicsShapeQueryParameters3D.new()

func setup(courtyard:Node,streets:Node) -> void:
	yard=courtyard
	traffic=streets
	var data:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_chauffeur.json"))
	for row:Array in data.sites:
		var cell:=Vector2i((Vector2(row[0],row[1])/100).floor())
		if not bins.has(cell):bins[cell]=[]
		bins[cell].append(row)
	for raw:Array in data.posh:posh.append(Vector2(raw[0],raw[1]))
	var hull:=BoxShape3D.new()
	hull.size=Vector3(2.1,1.35,4.9)
	fit.shape=hull
	fit.collision_mask=1|2|8|32

func begin(seed_value:int) -> void:
	clear()
	random.seed=seed_value

func step(delta:float,at:Vector2) -> void:
	scan-=delta
	if scan<=0:
		scan=1
		for g:Dictionary in residents.duplicate():
			if at.distance_squared_to(g.at)>240*240 or not is_instance_valid(g.actor) or g.actor.defeated:_remove(g)
		if not chauffeur.is_empty() and at.distance_squared_to(chauffeur.at)>260*260:_remove_car()
		next_resident=residents.size()<2 and random.randf()<.3
		next_car=chauffeur.is_empty() and random.randf()<.2
	elif next_resident:
		next_resident=false
		_spawn(at)
	elif next_car:
		next_car=false
		_park(at)
	elif not chauffeur.is_empty() and not chauffeur.has("driver"):_driver()
	for g in residents:_walk(g,at,delta)
	if chauffeur.has("driver"):_watch(delta,at)

func _dress(person:Dictionary,at:Vector2,tone:String) -> Node3D:
	var actor:Node3D=yard.create_actor.call(int(person.model),at,at,0)
	var id:="%d/%s"%[int(person.model),tone]
	if not jackets.has(id):
		var paint:Material=yard.people.clothing(person,yard.paint).duplicate()
		if paint is ShaderMaterial:
			var c:=Color(tone).srgb_to_linear()
			paint.set_shader_parameter(&"new_shirt",Vector3(c.r,c.g,c.b))
			if TROUSERS.has(int(person.model)):
				paint.set_shader_parameter(&"change_trousers",true)
				paint.set_shader_parameter(&"original_trousers",TROUSERS[int(person.model)]/255.0)
				var trousers:=Color("#1f2328").srgb_to_linear() if person.female else c
				paint.set_shader_parameter(&"new_trousers",Vector3(trousers.r,trousers.g,trousers.b))
		jackets[id]=paint
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false):mesh.material_override=jackets[id]
	actor.player.get_animation("walk").loop_mode=Animation.LOOP_LINEAR
	return actor

func _accessory(parent:Node3D,key:String,parts:Array) -> void:
	if not accessories.has(key):accessories[key]=yard._prop(parts)
	var mesh:=MeshInstance3D.new()
	mesh.mesh=accessories[key]
	mesh.material_override=yard.props_paint
	parent.add_child(mesh)

func _headwear(actor:Node3D,sunglasses:bool,cap:bool) -> void:
	var head:=BoneAttachment3D.new()
	actor.skeleton.add_child(head)
	var joint:int=actor.skeleton.find_bone("Joint_7")
	head.bone_idx=joint
	var world:Transform3D=actor.skeleton.global_transform*actor.skeleton.get_bone_global_pose(joint)
	var anchor:=Node3D.new()
	head.add_child(anchor)
	anchor.transform=Transform3D(world.basis.inverse()*actor.global_basis,Vector3.ZERO)
	if cap:
		_accessory(anchor,"driver_cap",[[.27,.085,.25,"#24252c",0,.22,0,0,0,0],[.205,.018,.105,"#13161b",0,.175,.134,0,0,0]])
	else:
		var parts:Array=[[.07,.018,.022,"#27272a",0,.065,.108,0,0,0],[.105,.066,.018,"#23242a",-.066,.064,.107,0,0,0],[.105,.066,.018,"#23242a",.066,.064,.107,0,0,0]]
		if not sunglasses:
			parts.append([.077,.044,.008,"#898d91",-.066,.065,.12,0,0,0])
			parts.append([.077,.044,.008,"#898d91",.066,.065,.12,0,0,0])
		_accessory(anchor,"sun_glasses" if sunglasses else "spectacles",parts)

func _spawn(observer:Vector2) -> void:
	var roads:Array=traffic.roads.around(observer,175)
	if roads.is_empty():return
	for _i in 24:
		var e:RefCounted=roads[random.randi_range(0,roads.size()-1)]
		if e.bridge or e.blocked or e.length<9:continue
		var side:=1 if random.randf()<.5 else -1
		var at:Vector2=e.a+e.dir*random.randf_range(2,e.length-2)+e.right*(e.width*.5+1.45)*side
		if at.distance_to(observer)<45 or at.distance_to(observer)>170:continue
		var person:Dictionary=yard.people.worker(random.randi())
		var female:=random.randf()<.45
		for _attempt in 12:
			if person.female==female:break
			person=yard.people.worker(random.randi())
		var colors:=["#8a6a4e","#e8e0d4","#4a3a30","#b89a7a","#d8c8b0","#2b2a30"] if female else ["#1f2328","#2b2f3a","#3a3036","#2e3a4a","#4a4540"]
		var actor:=_dress(person,at,colors[random.randi_range(0,colors.size()-1)])
		_headwear(actor,random.randf()<.75,false)
		actor.rotation.y=atan2(e.dir.x,e.dir.y)
		actor.player.play(&"walk")
		var grip:=BoneAttachment3D.new()
		actor.skeleton.add_child(grip)
		grip.bone_idx=actor.grip.left if female else actor.grip.right
		if female:
			_accessory(grip,"purse",[[.26,.2,.12,"#8a2a2a",0,-.14,.03,0,0,0],[.03,.2,.03,"#e8c14a",0,.02,.03,0,0,0]])
		else:
			_accessory(grip,"case",[[.42,.3,.1,"#3a2a22",0,-.19,0,0,0,0],[.14,.04,.03,"#1f1c1a",0,-.02,0,0,0,0],[.3,.02,.11,"#e8c14a",0,-.07,0,0,0,0]])
		if female or random.randf()<.5:
			_accessory(actor,"chain",[[.145,.023,.023,"#e8c14a",-.06,1.27,.18,0,0,-.5],[.145,.023,.023,"#e8c14a",.06,1.27,.18,0,0,.5],[.05,.05,.025,"#e8c14a",0,1.21,.18,0,0,0]])
		residents.append({"actor":actor,"at":at,"edge":e,"side":side,"goal":e.b+e.right*(e.width*.5+1.45)*side,
			"speed":random.randf_range(.9,1.15),"cross":{},"crossing":false,"cross_t":random.randf_range(20,90),
			"talk":random.randf_range(8,20),"shock":0.0})
		return

func _walk(g:Dictionary,observer:Vector2,delta:float) -> void:
	var actor:Node3D=g.actor
	if not is_instance_valid(actor) or actor.defeated or actor.stunned>0 or actor.recovery>0 or actor.knockdown>0:return
	var d:=observer.distance_squared_to(g.at)
	actor.visible=d<130*130
	g.talk-=delta
	if g.talk<=0:
		g.talk=random.randf_range(14,30)
		if d<40*40:
			var i:=random.randi_range(0,LINES.size()-1)
			yard.couples._label(actor,EN[i] if _english() else tr(LINES[i]),Color("#8a6a1a"),2.4)
	if g.shock>0:
		g.shock-=delta
		if actor.player.current_animation!=&"idle":actor.player.play(&"idle",.15)
		return
	if not g.cross.is_empty() and g.cross.phase>=0 and not g.crossing:
		if traffic.signals.light(g.cross.phase)!=2:return
		g.crossing=true
	if g.at.distance_to(g.goal)<.14:yard.couples._next(g)
	g.cross_t-=delta
	if g.cross_t<=0 and g.cross.is_empty():
		g.cross_t=random.randf_range(20,90)
		yard.couples._zebra(g)
	var target:Vector2=g.at.move_toward(g.goal,g.speed*delta)
	var facing:Vector2=target-g.at
	if facing.length_squared()<.000001:return
	g.at=target
	actor.rotation.y=lerp_angle(actor.rotation.y,atan2(facing.x,facing.y),1-exp(-7*delta))
	actor.position=Vector3(target.x,yard.terrain.at(target.x,target.y),target.y)
	if actor.player.current_animation!=&"walk":actor.player.play(&"walk",.15,g.speed)
	if not g.cross.is_empty():g.cross.occupied=absf((target-g.cross.p).dot(Vector2(-g.cross.dir.y,g.cross.dir.x)))<g.cross.width*.5+.4

func _park(observer:Vector2) -> void:
	if not chauffeur.is_empty():return
	var cell:=Vector2i((observer/100).floor())
	var candidates:Array=[]
	for x in range(-2,3):
		for z in range(-2,3):candidates.append_array(bins.get(cell+Vector2i(x,z),[]))
	if candidates.is_empty():return
	for _i in 30:
		var site:Array=candidates[random.randi_range(0,candidates.size()-1)]
		var at:=Vector2(site[0],site[1])
		var d:=observer.distance_to(at)
		if d<45 or d>160 or not traffic._clear(at,observer):continue
		var yaw:float=site[2]+(PI if random.randf()<.5 else 0)
		fit.transform=Transform3D(Basis(Vector3.UP,yaw),Vector3(at.x,yard.terrain.at(at.x,at.y)+.91,at.y))
		if not get_world_3d().direct_space_state.intersect_shape(fit,1).is_empty():continue
		var car:CharacterBody3D=traffic._instance(at,yaw)
		var body:MeshInstance3D=car.visual.get_node("Car_CarBody_0")
		if not body_paint:
			var enamel:=body.get_active_material(0).duplicate() as StandardMaterial3D
			if enamel:enamel.albedo_color=Color("#15171f")
			body_paint=enamel
		body.material_override=body_paint
		for name_:String in ["winF","winB","winL","winR"]:
			var window:MeshInstance3D=car.visual.get_node(name_)
			if not glass_paint:
				var glass:=window.get_active_material(0).duplicate() as StandardMaterial3D
				if glass:glass.albedo_color=Color(.09,.12,.16,.78)
				glass_paint=glass
			window.material_override=glass_paint
		chauffeur={"car":car,"at":at,"home":Vector2(site[3],site[4]),"yaw":site[5]+random.randf_range(-.6,.6),
			"shock":0.0,"angry":false,"watch":0.0,"watch_t":random.randf_range(4,10)}
		car.player_impact.connect(_car_hit)
		return

func _driver() -> void:
	var p:Dictionary=yard.people.worker(random.randi())
	for i in 12:
		if not p.female:break
		p=yard.people.worker(random.randi())
	var driver:=_dress(p,chauffeur.home,"#1f2328")
	_headwear(driver,false,true)
	driver.rotation.y=chauffeur.yaw
	driver.player.play(&"idle")
	driver.player.advance(0)
	driver.player.pause()
	var pose:=POSE.new()
	pose.setup(driver.model)
	chauffeur.driver=driver
	chauffeur.pose=pose
	if chauffeur.angry:_say_angry(driver)

func _car_hit(_car:CharacterBody3D,_strength:float) -> void:
	if chauffeur.is_empty() or chauffeur.angry:return
	chauffeur.angry=true
	chauffeur.shock=2.5
	if chauffeur.has("driver"):_say_angry(chauffeur.driver)

func _say_angry(driver:Node3D) -> void:
	yard.couples._label(driver,"Hey! That's the boss's car!" if _english() else tr("Эй! Это машина шефа!"),Color("#d9342c"),2.6)

func _watch(delta:float,observer:Vector2) -> void:
	var driver:Node3D=chauffeur.driver
	if driver.defeated or driver.stunned>0 or driver.knockdown>0 or driver.recovery>0:return
	driver.visible=observer.distance_squared_to(chauffeur.home)<130*130
	chauffeur.watch_t-=delta
	if chauffeur.watch_t<=0:
		chauffeur.watch_t=random.randf_range(8,16)
		chauffeur.watch=1.6
	chauffeur.watch=maxf(0,chauffeur.watch-delta)
	chauffeur.shock=maxf(0,chauffeur.shock-delta)
	if chauffeur.shock>0:
		var direction:Vector2=observer-chauffeur.home
		driver.rotation.y=lerp_angle(driver.rotation.y,atan2(direction.x,direction.y),1-exp(-6*delta))
		chauffeur.pose.fly(true,0.0)
	else:chauffeur.pose.chauffeur(chauffeur.watch>0)

func rich_tip(at:Vector2,fee:int,customer:Node3D=null) -> int:
	var eligible:=false
	for g in residents:
		if is_instance_valid(g.actor) and not g.actor.defeated and _near(at,g.at,70):
			eligible=true
			break
	if not eligible and not chauffeur.is_empty():eligible=_near(at,chauffeur.at,90)
	if not eligible:
		for p in posh:
			if _near(at,p,40):
				eligible=true
				break
	if not eligible or random.randf()>=.125:return 0
	if is_instance_valid(customer):yard.couples._label(customer,"Keep the change!" if _english() else tr("Сдачи не надо!"),Color("#8a6a1a"),2.6)
	return maxi(300,roundi(fee*random.randf_range(1.5,3)/50)*50)

func _near(a:Vector2,b:Vector2,r:float) -> bool:
	return absf(a.x-b.x)<r and absf(a.y-b.y)<r

func _english() -> bool:
	return TranslationServer.get_locale().begins_with("en")

func scare(at:Vector2,radius:float) -> void:
	for g in residents:
		if at.distance_squared_to(g.at)<radius*radius:g.shock=random.randf_range(1.5,2.5)
	if not chauffeur.is_empty() and at.distance_squared_to(chauffeur.home)<radius*radius:chauffeur.shock=random.randf_range(1.5,2.5)

func _remove(g:Dictionary) -> void:
	if not g.cross.is_empty():g.cross.occupied=false
	if is_instance_valid(g.actor):g.actor.queue_free()
	residents.erase(g)

func _remove_car() -> void:
	if chauffeur.is_empty():return
	if chauffeur.has("driver") and is_instance_valid(chauffeur.driver):chauffeur.driver.queue_free()
	if is_instance_valid(chauffeur.car):chauffeur.car.queue_free()
	chauffeur.clear()

func clear() -> void:
	for g:Dictionary in residents.duplicate():_remove(g)
	_remove_car()
	next_resident=false
	next_car=false
	scan=.5
