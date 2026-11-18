extends Node3D

const BANK := preload("res://wildlife_meshes.gd")
const SKIN := preload("res://wildlife_actor.gdshader")
var bank := BANK.new()
var ground: RefCounted
var car: CharacterBody3D
var traffic: Node
var director: Node
var woods := []
var homes := {}
var animals: Array[Dictionary] = []
var rng := RandomNumberGenerator.new()
var timers := PackedFloat32Array([0,0,0,60,40])
var active := false
var day_time := 0.0

func setup(region: Dictionary, terrain: RefCounted, vehicle: CharacterBody3D, roads: Node, events: Node, _sky: Node, _people: Node, _paint: Material, _depot: Vector2) -> void:
	ground = terrain
	car = vehicle
	traffic = roads
	director = events
	for parcel: Dictionary in region.greens:
		if parcel.kind!="green":
			continue
		var p := _polygon(parcel.outline)
		var area := 0.0
		for i in p.size():
			area += p[i].cross(p[i-1])
		if absf(area)*.5>=30000:
			var bounds := Rect2(p[0],Vector2.ZERO)
			for q in p:
				bounds = bounds.expand(q)
			woods.append({"p":p,"bounds":bounds})
	for b: Dictionary in region.buildings:
		if b.kind!="res" or b.get("doors",[]).is_empty():
			continue
		var door: Dictionary = b.doors[0]
		var normal := _xz(door.normal)
		var sill := _xz(door.at)+normal*.62
		var side := Vector2(-normal.y,normal.x)
		var hole := sill+side*3.2
		var key := Vector2i((hole/64.0).floor())
		if not homes.has(key):
			homes[key]=[]
		var polygon := _polygon(b.outline)
		var center := Vector2.ZERO
		for q in polygon:
			center += q
		center /= float(polygon.size())
		homes[key].append({"at":hole,"normal":normal,"side":side,"roof":center,"height":float(b.height),"polygon":polygon})
	if "extra_speed_limits" in traffic.signals:
		traffic.signals.extra_speed_limits.append(traffic_speed)

func begin(number: int, seed_value: int, _adult: bool) -> void:
	clear()
	rng.seed=("%d/fauna/%d"%[seed_value,number]).hash()
	timers=PackedFloat32Array([.4,1.7,.8,rng.randf_range(45,90),rng.randf_range(30,60)])
	active=true

func step(delta: float, _hour: float) -> void:
	bank.upload_one()
	if not active:
		return
	day_time+=delta
	var observer := Vector2(car.position.x,car.position.z)
	for i in timers.size():
		timers[i]-=delta
	if timers[0]<=0:
		timers[0]=rng.randf_range(5,11.7)
		_spawn_forest(true,observer)
	if timers[1]<=0:
		timers[1]=rng.randf_range(4,10)
		_spawn_forest(false,observer)
	if timers[2]<=0:
		timers[2]=1.1
		_spawn_cat(observer)
	if timers[3]<=0 and absf(car.speed)>5:
		timers[3]=rng.randf_range(80,160) if _crossing(observer) else 6.0
	if timers[4]<=0:
		timers[4]=1.0
		for a in animals:
			var d:=observer.distance_to(a.at)
			if a.big and d>=9 and d<=30 and a.mode in ["graze","walk"] and rng.randf()<.3 and director.start_event("moose",12.0):
				a.mode="aim"
				a.wait=1.3
				timers[4]=rng.randf_range(90,180)
				break
	for i in range(animals.size()-1,-1,-1):
		var a:=animals[i]
		var far:=480.0 if a.big else (200.0 if a.cat else 360.0)
		if observer.distance_squared_to(a.at)>far*far:
			a.node.queue_free()
			animals.remove_at(i)
		else:
			_tick(a,delta,observer)

func _spawn_forest(big: bool, observer: Vector2) -> void:
	var count:=0
	for a in animals:
		if not a.cat and a.big==big:
			count+=1
	if count>=3:
		return
	for _i in 24:
		var at:=observer+Vector2.from_angle(rng.randf()*TAU)*rng.randf_range(110 if big else 50,330 if big else 220)
		if _woods(at):
			var id:=("moose" if rng.randf()<.6 else "cow") if big else ("hare" if rng.randf()<.67 else "fox")
			_add(id,at)
			return

func _woods(at: Vector2) -> bool:
	for zone: Dictionary in woods:
		if zone.bounds.has_point(at) and Geometry2D.is_point_in_polygon(at,zone.p):
			return true
	return false

func _spawn_cat(observer: Vector2) -> void:
	var ground_count:=0
	var roof_count:=0
	for a in animals:
		if a.cat and a.roof: roof_count+=1
		elif a.cat: ground_count+=1
	var roof:=roof_count<4 and (roof_count<=ground_count or ground_count>=4)
	if not roof and ground_count>=4:
		return
	var cell:=Vector2i((observer/64).floor())
	for _i in 16:
		var key:=cell+Vector2i(rng.randi_range(-2,2),rng.randi_range(-2,2))
		var sites:Array=homes.get(key,[])
		if sites.is_empty():
			continue
		var site:Dictionary=sites[rng.randi_range(0,sites.size()-1)]
		if roof and (site.height<6.3 or site.height>30):
			continue
		var at:Vector2=site.roof if roof else site.at+site.normal*2.0
		var d:=at.distance_to(observer)
		if d<25 or d>100 or animals.any(func(q): return q.cat and q.site==site and q.roof==roof):
			continue
		var a:=_add("cat%d"%rng.randi_range(0,5),at)
		if not a.is_empty():
			a.site=site
			a.roof=roof
			a.floor=ground.land_height(at.x,at.y)+site.height if roof else ground.at(at.x,at.y)
			a.node.position.y=a.floor
		return

func _crossing(observer: Vector2) -> bool:
	var target:=observer-Vector2(car.basis.z.x,car.basis.z.z)*rng.randf_range(60,150)
	var edges:Array=traffic.roads.around(target,32)
	for j in mini(18,edges.size()):
		var e:RefCounted=edges[rng.randi_range(0,edges.size()-1)]
		var road:=Geometry2D.get_closest_point_to_segment(target,e.a,e.b)
		var side:Vector2=e.right*(.5*e.width+4)
		if road.distance_to(target)>25 or not (_woods(road+side*2) or _woods(road-side*2)):
			continue
		var a:=_add("moose",road-side)
		if a.is_empty(): return false
		a.target=road
		a.opposite=road+side
		a.mode="cross"
		a.wait=30.0
		return true
	return false

func _add(id: String, at: Vector2) -> Dictionary:
	if not bank.meshes.has(id):
		bank.request(id)
		return {}
	var m:=MeshInstance3D.new()
	var mat:=ShaderMaterial.new()
	mat.shader=SKIN
	mat.set_shader_parameter("offset",rng.randf()*TAU)
	m.mesh=bank.meshes[id]
	m.material_override=mat
	var big:=id in ["moose","cow"]
	m.visibility_range_end=380.0 if big else (190.0 if id.begins_with("cat") else 260.0)
	m.visibility_range_end_margin=10
	m.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(m)
	m.position=Vector3(at.x,ground.at(at.x,at.y),at.y)
	m.rotation.y=rng.randf()*TAU
	var a:={"id":id,"at":at,"node":m,"mat":mat,"big":big,"cat":id.begins_with("cat"),"roof":false,"site":{},
		"floor":m.position.y,"mode":"graze","wait":rng.randf_range(3,8),"heading":m.rotation.y,"speed":0.0,
		"target":at,"opposite":at,"cooldown":0.0,"scared":false,"height":0.0}
	animals.append(a)
	return a

func _tick(a: Dictionary, delta: float, observer: Vector2) -> void:
	var at:Vector2=a.at
	var toward:=observer-at
	var distance:=toward.length()
	a.wait-=delta
	a.cooldown=maxf(0,a.cooldown-delta)
	if a.cat:
		_cat(a,toward,distance)
	elif not a.big and distance<14 and a.mode!="flee" and a.cooldown<=0:
		a.mode="flee"
		a.heading=atan2(-toward.x,-toward.y)+rng.randf_range(-.6,.6)
		a.wait=rng.randf_range(1.8,2.6)
	elif a.mode=="aim":
		a.heading=atan2(toward.x,toward.y)
		if a.wait<=0:
			a.mode="charge"
			a.wait=3.5
	elif a.mode in ["cross","stand"]:
		if a.mode=="stand" and a.wait<=0:
			a.target=a.opposite
			a.mode="cross"
		elif a.mode=="cross":
			var offset:Vector2=a.target-at
			a.heading=atan2(offset.x,offset.y)
			if offset.length_squared()<1.44:
				a.mode="walk" if a.target==a.opposite else "stand"
				a.wait=rng.randf_range(2,4)
	elif a.wait<=0:
		_roam(a)
	var velocity:=0.0
	match a.mode:
		"walk": velocity=.7 if a.cat else (.8 if a.big else (1.1 if a.id=="fox" else .9))
		"flee": velocity=6.5 if a.cat else (8.0 if a.id=="hare" else 6.0)
		"cross": velocity=1.3
		"charge": velocity=9.0
		"stagger": velocity=2.2
	if a.big and distance<2.3 and a.cooldown<=0:
		if a.mode=="charge":
			var shove:=toward.normalized()*9.0
			car.velocity+=Vector3(shove.x,0,shove.y)
			car.collision_damage(9.0,false,a.node.global_position,Vector3(shove.x,0,shove.y).normalized())
			a.mode="graze"
			a.wait=10
			a.cooldown=5
		elif absf(car.speed)>3:
			car.collision_damage(minf(16.0,3.0+.12*absf(car.speed)),false,a.node.global_position,Vector3(toward.x,0,toward.y).normalized())
			car.velocity*=.3
			car.speed*=.3
			a.mode="stagger"
			a.wait=5
			a.cooldown=5
	if a.mode=="hidden":
		a.node.hide()
		return
	a.node.show()
	var next:=at+Vector2(sin(a.heading),cos(a.heading))*velocity*delta
	if a.cat and a.roof and not Geometry2D.is_point_in_polygon(next,a.site.polygon):
		a.heading+=PI
		next=at
	a.at=next
	if not a.roof and next.distance_squared_to(at)>.000001:
		a.floor=ground.at(next.x,next.y)+.02
	a.node.position=Vector3(next.x,a.floor,next.y)
	a.node.rotation.y=lerp_angle(a.node.rotation.y,a.heading,1-exp(-7*delta))
	if not is_equal_approx(a.speed,velocity):
		a.speed=velocity
		a.mat.set_shader_parameter("stride",minf(.64,velocity*.38))
		a.mat.set_shader_parameter("cadence",3.0+velocity*1.4)

func _roam(a: Dictionary) -> void:
	if a.mode=="graze":
		a.mode="walk"
		a.wait=rng.randf_range(4,10)
		a.heading+=rng.randf_range(-1.2,1.2)
	else:
		a.mode="graze"
		a.wait=rng.randf_range(3,8)

func _cat(a: Dictionary, offset: Vector2, distance: float) -> void:
	if a.site.is_empty(): return
	if a.mode=="hidden":
		if a.wait<=0 and distance>12:
			a.mode="graze"
			a.at=a.site.at+a.site.normal*.6
			a.wait=rng.randf_range(3,6)
		return
	if not a.roof and (distance<(22 if absf(car.speed)>11 else 12) or a.scared) and a.mode!="flee":
		a.mode="flee"
		a.target=a.site.at
		a.scared=false
	if a.mode=="flee":
		var to:Vector2=a.target-a.at
		a.heading=atan2(to.x,to.y)
		if to.length_squared()<.36:
			a.mode="hidden"
			a.wait=rng.randf_range(20,60)
	elif a.wait<=0:
		_roam(a)
		if not a.roof and a.at.distance_to(a.site.at)>7:
			var back:Vector2=a.site.at-a.at
			a.heading=atan2(back.x,back.y)
	elif a.roof and distance<30 and a.mode=="graze":
		a.heading=atan2(offset.x,offset.y)

func traffic_speed(at: Vector2, direction: Vector2, _speed: float) -> float:
	var value:=1.0
	for a in animals:
		if not a.big: continue
		var delta:Vector2=a.at-at
		var along:=delta.dot(direction)
		if along>0 and along<30 and absf(delta.cross(direction))<1.4:
			value=minf(value,clampf((along-3.0)/14.0,0,1))
	return value

func honk() -> void:
	var at:=Vector2(car.position.x,car.position.z)
	for a in animals:
		var offset:Vector2=a.at-at
		if offset.length_squared()>400: continue
		if a.cat:
			a.scared=true
		elif a.big and a.mode in ["stand","cross","graze"]:
			a.heading=atan2(offset.x,offset.y)
			a.mode="stagger"
			a.wait=2.0

func clear() -> void:
	active=false
	for a in animals:
		a.node.queue_free()
	animals.clear()

func _exit_tree() -> void:
	if is_instance_valid(traffic) and "extra_speed_limits" in traffic.signals:
		traffic.signals.extra_speed_limits.erase(traffic_speed)
	bank.dispose()

static func _xz(point: Array) -> Vector2:
	return Vector2(point[0],point[1])

static func _polygon(raw: Array) -> PackedVector2Array:
	var out:=PackedVector2Array()
	for point: Array in raw: out.append(_xz(point))
	return out
