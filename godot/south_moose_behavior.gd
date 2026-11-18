extends RefCounted

const VEHICLE:=preload("res://traffic_vehicle.gd")
const HUMAN:=preload("res://pedestrian.gd")
const LOVE_LINES:=["не мешай!","занято!","отвернись!","проезжай, проезжай"]
const LOVE_EN:=["Give us a minute!","Occupied!","Look away!","Keep driving!"]
var fauna:Node
var clients:Array[Node3D]=[]
var adult:=false
var refresh:=0.0
var butt:=0.0
var pair_time:=0.0
var waiting_drivers:Dictionary={}
var query:=PhysicsShapeQueryParameters3D.new()

func setup(service:Node) -> void:
	fauna=service
	var radius:=SphereShape3D.new()
	radius.radius=31
	query.shape=radius
	query.collision_mask=4|32

func begin(is_adult:bool) -> void:
	waiting_drivers.clear()
	adult=is_adult
	refresh=0
	butt=fauna.rng.randf_range(20,45)
	pair_time=fauna.rng.randf_range(50,100)

func prepare(a:Dictionary) -> void:
	a.chase=0
	a.partner=0
	a.origin=a.at
	a.resume=false
	a.upper=false
	a.said=0.0
	a.beat=0.0
	a.blocked=0.0
	a.neighbors=[]
	a.nudge=0.0

func scan(delta:float,observer:Vector2) -> void:
	refresh-=delta
	if refresh<=0:
		refresh=.2
		var seen:Dictionary={}
		for a:Dictionary in fauna.animals:
			if not a.big:continue
			a.neighbors.clear()
			if observer.distance_squared_to(a.at)>260*260:continue
			query.transform=Transform3D(Basis(),a.node.position+Vector3.UP)
			for found:Dictionary in fauna.get_world_3d().direct_space_state.intersect_shape(query,32):
				var obj:Node3D=found.collider
				if obj is VEHICLE:
					a.neighbors.append(obj.get_instance_id())
					_wait_in_lane(a,obj,seen)
				elif is_instance_valid(obj) and obj.get_parent() is HUMAN:a.neighbors.append(obj.get_parent().get_instance_id())
		for id:int in waiting_drivers.keys():
			if not seen.has(id):waiting_drivers.erase(id)
	butt-=delta
	if butt<=0:
		butt=1.0
		if fauna.rng.randf()<.35:
			for a:Dictionary in fauna.animals:
				if not _ready(a) or a.id!="moose" or a.nudge>0 or observer.distance_squared_to(a.at)>140*140:continue
				var aim:=_target(a)
				if aim:
					charge(a,aim)
					butt=fauna.rng.randf_range(35,75)
					break
	if adult:
		pair_time-=delta
		if pair_time<=0:
			pair_time=10.0
			if fauna.director.can_event("moose") and _pair(observer):
				fauna.director.start_event("moose",12)
				pair_time=fauna.rng.randf_range(120,240)

func _wait_in_lane(a:Dictionary,car:CharacterBody3D,seen:Dictionary) -> void:
	if not car.going or car.pace>.5:return
	var id:=car.get_instance_id()
	if seen.has(id):return
	var nose:=Vector2(-car.basis.z.x,-car.basis.z.z)
	var diff:=Vector2(a.at)-Vector2(car.position.x,car.position.z)
	var along:=nose.dot(diff)
	if along<=0 or along>30 or absf(nose.cross(diff))>2.3:return
	seen[id]=true
	if not waiting_drivers.has(id):waiting_drivers[id]={"wait":1.2,"count":0}
	var driver:Dictionary=waiting_drivers[id]
	driver.wait-=.2
	if driver.wait>0:return
	driver.wait=fauna.rng.randf_range(2.5,4)
	driver.count+=1
	fauna.get_tree().call_group(&"game_audio",&"cue","honk",car.global_position,.65,70.0)
	if driver.count==1:_bubble(a,"!",Color("#d35846"),1.5)
	if driver.count<2 or a.mode in ["aim","charge"]:return
	if driver.count==2 and a.id=="moose" and not car.shuttle and a.partner==0 and fauna.rng.randf()<.5:
		charge(a,car)
	elif a.mode!="cross":shoo(a)

func shoo(a:Dictionary) -> void:
	if a.mode in ["aim","charge","cross"]:return
	if a.partner!=0:_end_pair(a)
	if a.mode=="stand":
		a.target=a.opposite
		a.mode="cross"
		return
	var road:RefCounted=fauna.traffic.roads.nearest(a.at)
	if not road:return
	var center:=Geometry2D.get_closest_point_to_segment(a.at,road.a,road.b)
	var normal:Vector2=road.right
	if normal.dot(Vector2(a.at)-center)<0:normal=-normal
	a.opposite=center+normal*(road.width*.5+6)
	a.target=a.opposite
	a.mode="cross"

func _ready(a:Dictionary) -> bool:
	return a.big and a.partner==0 and a.mode in ["graze","walk"]

func _target(a:Dictionary) -> Node3D:
	var best:=26.0
	var choice:Node3D
	for id:int in a.neighbors:
		var obj:=instance_from_id(id) as Node3D
		if not _valid_target(obj):continue
		var at:=Vector2(obj.position.x,obj.position.z)
		var d:float=a.at.distance_to(at)
		if d>6 and d<best:
			best=d
			choice=obj
	return choice

func _valid_target(obj:Node3D) -> bool:
	if not is_instance_valid(obj) or obj.is_queued_for_deletion():return false
	if obj is VEHICLE:return not obj.shuttle and not obj.incident and obj.coast.length_squared()<1
	return obj is HUMAN and not obj.defeated and obj.knockdown<=0 and obj.recovery<=0 and not clients.has(obj)

func charge(a:Dictionary,target:Node3D) -> void:
	if a.partner!=0:_end_pair(a)
	a.chase=target.get_instance_id()
	a.origin=a.at
	a.resume=a.mode in ["cross","stand"]
	a.mode="aim"
	a.wait=1.3

func _home(a:Dictionary) -> void:
	a.chase=0
	a.mode="cross" if a.resume else "home"
	if a.resume:a.target=a.opposite
	a.resume=false
	a.wait=10.0

func _pair(observer:Vector2) -> bool:
	if not adult:return false
	for a:Dictionary in fauna.animals:
		if not _ready(a):continue
		var d:float=a.at.distance_to(observer)
		if d<25 or d>200:continue
		var other:Dictionary={}
		for b:Dictionary in fauna.animals:
			if b.node!=a.node and _ready(b) and a.at.distance_to(b.at)<40:
				other=b
				break
		if other.is_empty():
			for i in 12:
				var p:Vector2=a.at+Vector2.from_angle(fauna.rng.randf()*TAU)*fauna.rng.randf_range(10,20)
				if not fauna._woods(p):continue
				var road:RefCounted=fauna.traffic.roads.nearest(p)
				if road and Geometry2D.get_closest_point_to_segment(p,road.a,road.b).distance_to(p)<road.width*.5+3:continue
				other=fauna._add("moose" if fauna.rng.randf()<.6 else "cow",p)
				if not other.is_empty():break
		if other.is_empty():continue
		a.partner=other.node.get_instance_id()
		other.partner=a.node.get_instance_id()
		a.mode="wait"
		other.mode="court"
		a.wait=25.0
		other.wait=25.0
		a.said=0.0
		other.said=0.0
		a.beat=0.0
		other.beat=0.0
		return true
	return false

func _lookup(id:int) -> Dictionary:
	for b:Dictionary in fauna.animals:
		if b.big and b.node.get_instance_id()==id:return b
	return {}

func _end_pair(a:Dictionary) -> void:
	var pair:=_lookup(a.partner) if a.partner!=0 else {}
	for p:Dictionary in [a,pair]:
		if p.is_empty():continue
		p.partner=0
		p.mode="graze"
		p.node.rotation.x=0
		p.upper=false
		p.height=0.0
		p.wait=fauna.rng.randf_range(3,7)

func _bubble(a:Dictionary,label:String,tone:Color,time:float) -> void:
	var node:=Label3D.new()
	node.text=label
	node.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	node.modulate=tone
	node.position.y=3.2
	node.font_size=25
	node.pixel_size=.012
	a.node.add_child(node)
	var tween:=node.create_tween()
	tween.tween_property(node,"position:y",3.65,time)
	tween.tween_callback(node.queue_free)

func _love(a:Dictionary,delta:float,observer:Vector2) -> float:
	var b:=_lookup(a.partner)
	if b.is_empty() or b.partner!=a.node.get_instance_id() or a.wait<=0:
		_end_pair(a)
		return 0
	if a.mode=="court":
		var target:Vector2=b.at-Vector2(sin(b.heading),cos(b.heading))*1.5
		var distance:float=a.at.distance_to(target)
		if distance<.35:
			a.mode="love"
			b.mode="love"
			a.upper=true
			a.wait=fauna.rng.randf_range(4,6)
			b.wait=a.wait
			return 0
		var diff:Vector2=target-a.at
		a.heading=atan2(diff.x,diff.y)
		return minf(2.2,distance*1.5)
	if not a.upper:
		a.said-=delta
		a.beat-=delta
		if a.at.distance_squared_to(observer)<16*16 and a.said<=0:
			a.said=6
			var i:int=fauna.rng.randi_range(0,LOVE_LINES.size()-1)
			_bubble(a,LOVE_EN[i] if TranslationServer.get_locale().begins_with("en") else fauna.tr(LOVE_LINES[i]),Color("#c2185b"),2.5)
		if a.mode=="love" and a.beat<=0:
			a.beat=.6
			_bubble(a,"♥",Color("#ee689c"),.75)
	elif a.mode=="love":
		a.heading=b.heading
		a.at=b.at-Vector2(sin(b.heading),cos(b.heading))*1.5
		a.height=.65+.08*sin(a.wait*1.7*TAU)
		a.node.rotation.x=-.42
	return 0

# Returns -1 for ordinary grazing/crossing, otherwise the speed of this state.
func motion(a:Dictionary,delta:float,observer:Vector2) -> float:
	a.nudge=maxf(0,a.nudge-delta)
	if a.partner!=0:return _love(a,delta,observer)
	if a.mode=="home":
		var v:Vector2=a.origin-a.at
		if v.length_squared()<4 or a.wait<=0:
			a.mode="graze"
			a.wait=fauna.rng.randf_range(3,7)
			return 0
		a.heading=rotate_toward(a.heading,atan2(v.x,v.y),2.5*delta)
		return 2.2
	if a.mode not in ["aim","charge"]:return -1.0
	var target:=instance_from_id(a.chase) as Node3D if a.chase else null
	if not is_instance_valid(target) or (target!=fauna.car and not _valid_target(target)):
		_home(a)
		return 0
	var v:=Vector2(target.position.x,target.position.z)-Vector2(a.at)
	var desired:=atan2(v.x,v.y)
	if a.mode=="aim":
		a.heading=rotate_toward(a.heading,desired,3*delta)
		if a.wait<=0:
			a.mode="charge"
			a.wait=3.5
			a.heading=desired
		return 0
	a.heading=rotate_toward(a.heading,desired,.6*delta)
	if a.wait<=0:
		_home(a)
		return 0
	return 9.0

func solid(a:Dictionary,at:Vector2,delta:float) -> Vector2:
	if a.upper:return at
	var nose:=Vector2(sin(a.heading),cos(a.heading))*.75
	var trapped:=false
	for id:int in a.neighbors:
		var obj:=instance_from_id(id) as Node3D
		if not is_instance_valid(obj) or obj.is_queued_for_deletion():continue
		if absf(obj.position.y-a.floor)>3:continue
		var human:=obj is HUMAN
		if human and (obj.defeated or obj.knockdown>0):continue
		var center:=Vector2(obj.position.x,obj.position.z)
		if at.distance_squared_to(center)>18:continue
		var hit:=false
		var normal:=Vector2.ZERO
		var depth:=0.0
		for offset:Vector2 in [nose,-nose]:
			var p:=at+offset
			var closest:=center
			if not human:
				var local:=obj.to_local(Vector3(p.x,obj.position.y,p.y))
				var surface:=obj.to_global(Vector3(clampf(local.x,-.95,.95),0,clampf(local.z,-2.49,2.49)))
				closest=Vector2(surface.x,surface.z)
			var d:=p.distance_to(closest)
			var need:=.97 if human else .62
			if d>=need:continue
			normal=closest.direction_to(p) if d>.001 else center.direction_to(at)
			depth=need-d
			hit=true
			break
		if not hit:continue
		if a.mode=="charge" and _valid_target(obj):
			_strike(obj,-normal,13.0)
			_home(a)
			a.nudge=3.0
			return at+normal*.15
		at+=normal*depth
		trapped=true
		a.blocked+=delta
		if not human and obj.pace>3 and a.cooldown<=0:
			var direction:=Vector2(-obj.basis.z.x,-obj.basis.z.z)
			if direction.dot(normal)*obj.pace>1.5:
				at+=direction*minf(obj.pace*.13,2)
				a.mode="stagger"
				a.wait=5
				a.cooldown=3
		if a.nudge<=0 and a.blocked>(.6 if human else 1.6) and _valid_target(obj):
			if human or a.id=="moose":_strike(obj,-normal,3.0 if human else 8.0)
			a.blocked=0.0
			a.nudge=2.5
	if not trapped:a.blocked=0.0
	return at

func _strike(obj:Node3D,normal:Vector2,force:float) -> void:
	var direction:=Vector3(normal.x,0,normal.y)
	if obj is VEHICLE:
		obj.displace(force,direction)
	else:obj.impact(force,direction,false)

func reset_charge(a:Dictionary) -> void:
	_home(a)
