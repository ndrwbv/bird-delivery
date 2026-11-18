extends Node3D

# LIFE.flyers are additional park visitors, separate from KITES's permanent sites.
const TOY:=preload("res://south_park_flight.gd")
const GROUND:=preload("res://south_region_ground.gd")
var park:Node
var roads:RefCounted
var plots:Array[Dictionary]=[]
var flyers:Array[Dictionary]=[]
var generation:=RandomNumberGenerator.new()
var scan:=0.0
var time:=0.0
var day:=0
var previous_hour:=-1.0
var phase:=Vector3.ZERO
var calm:=false
var wind:=0.0
var space_query:=PhysicsShapeQueryParameters3D.new()

func setup(host:Node,region:Dictionary,graph:RefCounted) -> void:
	park=host
	roads=graph
	for green:Dictionary in region.greens:
		if green.kind not in ["park","green"]:continue
		var p:=GROUND.outline_of(green.outline)
		var area:=0.0
		for i in p.size():area+=p[i].cross(p[i-1])*.5
		if absf(area)<2500 or (green.kind=="green" and absf(area)>250000):continue
		plots.append({"p":p,"bounds":GROUND.bounds_of(p)})
	var fit:=CylinderShape3D.new()
	fit.radius=.8
	fit.height=1.6
	space_query.shape=fit
	space_query.collision_mask=1|8|32

func begin(seed_value:int) -> void:
	clear()
	generation.seed=seed_value
	time=generation.randf_range(0,5000)
	phase=Vector3(generation.randf()*TAU,generation.randf()*TAU,generation.randf()*TAU)
	wind=generation.randf()*TAU

func step(delta:float,hour:float,observer:Vector2) -> void:
	time+=delta
	if previous_hour>hour+12:day+=1
	previous_hour=hour
	scan-=delta
	if scan<=0:
		scan=1
		var day_hash:=absf(fmod(sin(floorf(day+time/480)*91.7+3.1)*43758.5453,1))
		calm=day_hash<.25
		var wave:=.5*sin(time/14+phase.x)+.35*sin(time/38+phase.y)+.3*sin(time/97+phase.z)
		var wanted:=clampi(roundi((wave-.12)*4.2),0,4)
		if day_hash>.9 or park.sky.night>=.4 or park.sky.wet>=.25 or park.sky.precipitation.top>.25:wanted=0
		var live:=0
		for f:Dictionary in flyers.duplicate():
			if observer.distance_squared_to(f.at)>240*240:
				_remove(f)
			elif not f.pack and f.fallen<0:
				live+=1
				if live>wanted:f.pack=true
		if flyers.size()<wanted and generation.randf()<.5:
			var point:=_site(observer)
			if point.is_finite():_spawn(point,not calm and generation.randf()<.55)
	for f:Dictionary in flyers.duplicate():
		if _move(f,delta,observer):_remove(f)

func _site(observer:Vector2) -> Vector2:
	for i in 24:
		var at:=observer+Vector2.from_angle(generation.randf()*TAU)*generation.randf_range(30,150)
		var valid:=false
		for plot in plots:
			if plot.bounds.has_point(at) and Geometry2D.is_point_in_polygon(at,plot.p):
				valid=true
				break
		if not valid:continue
		for edge:RefCounted in roads.around(at,7):
			if Geometry2D.get_closest_point_to_segment(at,edge.a,edge.b).distance_to(at)<edge.width*.5+3:
				valid=false
				break
		if not valid:continue
		for f in flyers:
			if at.distance_squared_to(f.at)<18*18:valid=false
		if not valid:continue
		space_query.transform=Transform3D(Basis(),Vector3(at.x,park.terrain.land_height(at.x,at.y)+1.15,at.y))
		if get_world_3d().direct_space_state.intersect_shape(space_query,1).is_empty():return at
	return Vector2.INF

func _spawn(at:Vector2,kite:bool) -> void:
	var actor:Node3D=park._person(at,generation.randi())
	var ground:float=park.terrain.land_height(at.x,at.y)
	var gaze:=generation.randf()*TAU
	var toy:=TOY.new()
	add_child(toy)
	var color:String=["#d54e49","#efb345","#54a6be","#a463c2"][generation.randi_range(0,3)]
	toy.setup({"at":at,"height":ground,"wind":wind,"kite":kite,"color":color},actor,0)
	var start:=Vector3(at.x,ground+1.6,at.y) if kite else Vector3(at.x+sin(gaze)*.8,ground+.2,at.y+cos(gaze)*.8)
	toy.toy.position=start
	var lamps:=Node3D.new()
	toy.toy.add_child(lamps)
	if not kite:
		for x:float in [-.3,.3]:
			for z:float in [-.3,.3]:
				var led:=toy._box(lamps,Vector3(.06,.05,.06),Color("#ff2b2b") if z<0 else Color("#2bff5a"))
				led.position=Vector3(x,0,z)
	toy.toy.scale=Vector3.ONE*(1.35 if kite else 1.25)
	flyers.append({"at":at,"actor":actor,"toy":toy,"kite":kite,"gaze":gaze,"y":ground,"lamps":lamps,"pack":false,"fallen":-1.0,
		"seed":generation.randf_range(0,9),"time":generation.randf_range(0,60),"max":generation.randf_range(18,26),"length":1.5,
		"position":start,"velocity":Vector3.ZERO,"target":start,"zoom":false,"zoom_t":generation.randf_range(6,12)})

func _move(f:Dictionary,delta:float,observer:Vector2) -> bool:
	var actor:Node3D=f.actor
	var toy:Node3D=f.toy.toy
	var distance:=observer.distance_squared_to(f.at)
	if not is_instance_valid(actor):return true
	if actor.defeated and f.fallen<0:f.fallen=0.0
	if not actor.defeated:actor.visible=distance<130*130
	f.toy.visible=distance<200*200
	f.time+=delta
	if f.fallen>=0:
		f.fallen+=delta
		var p:Vector3=f.position
		var floor_y:float=park.terrain.land_height(p.x,p.z)+(.1 if f.kite else .12)
		if f.kite:
			f.toy.string_mesh.hide()
			if p.y>floor_y:
				p+=Vector3(sin(wind)*2.5,-3.0,cos(wind)*2.5)*delta
				toy.rotation.x+=delta*.8
		else:
			f.lamps.hide()
			if p.y>floor_y:
				f.velocity.y-=12*delta
				p+=f.velocity*delta
				toy.rotation.z+=delta*3
		p.y=maxf(floor_y,p.y)
		f.position=p
		toy.position=p
		return f.fallen>(12 if f.kite else 9)
	if f.kite:return _kite(f,delta)
	return _drone(f,delta)

func _kite(f:Dictionary,delta:float) -> bool:
	f.length=minf(f.max,f.length+3.2*delta) if not f.pack else f.length-delta*5
	if f.length<1.2:return true
	var actor:Node3D=f.actor
	var hand:Vector3=actor.grip.global_position if actor.grip else actor.position+Vector3.UP*1.6
	var t:float=f.time
	var elevation:=.7+sin(t*.37+f.seed)*.12
	var ahead:=Vector3(sin(wind),0,cos(wind))
	var side:=Vector3(-ahead.z,0,ahead.x)
	var sway:=sin(t*.8+f.seed)*3+sin(t*2.1)*.7
	var wanted:Vector3=hand+ahead*f.length*cos(elevation)+side*sway*f.length/f.max+Vector3.UP*(f.length*sin(elevation)+sin(t*1.3)*.6)
	f.position=f.position.lerp(wanted,1-exp(-3*delta))
	f.toy.toy.position=f.position
	if hand.distance_squared_to(f.position)>.001:f.toy.toy.look_at(hand)
	f.toy.toy.rotate_object_local(Vector3.BACK,sin(t*.8+f.seed)*.5)
	var string:Node3D=f.toy.string_mesh
	string.position=(hand+f.position)*.5
	string.look_at(f.position)
	string.scale.z=maxf(.01,hand.distance_to(f.position))
	for i in f.toy.ribbons.size():f.toy.ribbons[i].position.x=sin(t*5-i*.7)*.04*i
	if not park._fallen(actor):
		actor.rotation.y=lerp_angle(actor.rotation.y,wind,1-exp(-3*delta))
		f.toy.pose.fly(true,sin(t*1.7+f.seed)*.15)
	return false

func _drone(f:Dictionary,delta:float) -> bool:
	var actor:Node3D=f.actor
	var t:float=f.time
	f.gaze+=sin(t*.23+f.seed)*.35*delta
	var ahead:=Vector3(sin(f.gaze),0,cos(f.gaze))
	var ground:=Vector3(f.at.x,f.y,f.at.y)
	var max_v:=4.0
	if f.pack:
		f.target=ground+ahead*.7+Vector3.UP*.15
		max_v=3
		if f.position.distance_to(f.target)<.4:return true
	elif f.zoom:
		max_v=14
		f.zoom_t-=delta
		if f.zoom_t<=0:
			f.zoom=false
			f.zoom_t=generation.randf_range(7,15)
	else:
		f.target=ground+ahead*5.5+Vector3.UP*(3.6+sin(t*.7)*.8)
		if t<3:max_v=1.5
		f.zoom_t-=delta
		if f.zoom_t<=0:
			var an:float=f.gaze+generation.randf_range(-1,1)
			f.target=ground+Vector3(sin(an),0,cos(an))*generation.randf_range(14,26)+Vector3.UP*generation.randf_range(8,13)
			f.zoom=true
			f.zoom_t=generation.randf_range(3,4.5)
	var wanted:Vector3=((f.target-f.position)*1.6).limit_length(max_v)
	f.velocity=f.velocity.lerp(wanted,1-exp(-3*delta))
	f.position+=f.velocity*delta
	f.toy.toy.position=f.position
	f.toy.toy.rotation=Vector3(clampf(f.velocity.z*.05,-.45,.45),0,clampf(-f.velocity.x*.05,-.45,.45))
	for disk:Node3D in f.toy.rotors:disk.rotation.y+=delta*40
	var blink:=fmod(t,1)
	f.lamps.visible=blink<.14 or (blink>.3 and blink<.36)
	if not park._fallen(actor):
		actor.rotation.y=lerp_angle(actor.rotation.y,atan2(f.position.x-ground.x,f.position.z-ground.z),1-exp(-3*delta))
		f.toy.pose.fly(false,0)
	return false

func _remove(f:Dictionary) -> void:
	if is_instance_valid(f.actor):f.actor.queue_free()
	f.toy.queue_free()
	flyers.erase(f)

func clear() -> void:
	for f:Dictionary in flyers.duplicate():_remove(f)
	scan=0
	day=0
	previous_hour=-1
