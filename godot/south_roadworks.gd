extends Node3D

var host: Node3D
var traffic: Node3D
var car: CharacterBody3D
var depot := Vector2.ZERO
var sites: Array[Dictionary] = []
var history := {}
var recent: Array[Dictionary] = []
var reserve := {}
var last_edge: RefCounted
var last := Vector2.INF
var odo := 0.0
var clock := 0.0
var work_in := 25.0
var anywhere := 80.0
var back_window := 0.0
var back_gap := 1
var last_back := ""
var crash_in := 70.0
var cone_shape := CylinderMesh.new()
var cone_color := StandardMaterial3D.new()


func setup(events: Node3D) -> void:
	host = events
	traffic = host.traffic
	car = host.car
	var ordinary: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-original.json"))
	depot = Vector2(ordinary.home[0],ordinary.home[1])
	traffic.signals.extra_speed_limits.append(speed_limit)
	traffic.signals.lane_shift = lane_change
	cone_shape.top_radius = 0.035
	cone_shape.bottom_radius = 0.19
	cone_shape.height = 0.52
	cone_shape.radial_segments = 9
	cone_shape.rings = 0
	cone_color.albedo_color = Color("#f46c22")
	cone_shape.material = cone_color
	back_gap = randi_range(1,2)


func begin() -> void:
	clear()
	clock = 0.0
	work_in = 25.0
	anywhere = randf_range(60.0,110.0)
	crash_in = randf_range(40.0,80.0)


func clear() -> void:
	for i in range(sites.size()-1,-1,-1):
		_remove(i)
	history.clear()
	recent.clear()
	reserve.clear()
	last_edge = null
	last = Vector2.INF
	back_window = 0.0
	odo = 0.0


func _exit_tree() -> void:
	if is_instance_valid(traffic) and is_instance_valid(traffic.signals):
		traffic.signals.extra_speed_limits.erase(speed_limit)
		traffic.signals.lane_shift = Callable()


func delivered() -> void:
	if back_gap>0:
		back_gap -= 1
		return
	if not history.is_empty():
		reserve = history.duplicate()
		back_window = 40.0


func _key(e: RefCounted) -> Vector2i:
	var a: int = traffic.roads.node_ids[e.a]
	var b: int = traffic.roads.node_ids[e.b]
	return Vector2i(mini(a,b),maxi(a,b))


func _seen(p: Vector2) -> bool:
	var c := get_viewport().get_camera_3d()
	return c!=null and c.is_position_in_frustum(Vector3(p.x,host.ground.at(p.x,p.y)+1.0,p.y))


func _track(at: Vector2) -> void:
	if last.is_finite():
		var meters := last.distance_to(at)
		if meters<2.0:
			return
		if meters>80.0:
			history.clear()
			recent.clear()
		else:
			odo += meters
	last = at
	var e: RefCounted = traffic.roads.nearest(at)
	if e==null or e==last_edge or Geometry2D.get_closest_point_to_segment(at,e.a,e.b).distance_to(at)>e.width*0.5+3.0:
		return
	last_edge = e
	var key := _key(e)
	history[key] = odo
	recent.append({"key":key,"km":odo})
	while not recent.is_empty() and odo-float(recent[0].km)>2000.0:
		var old: Dictionary = recent.pop_front()
		if history.get(old.key)==old.km:
			history.erase(old.key)


func _center(e: RefCounted) -> Vector2:
	return e.a+e.dir*(e.entry+e.exit)*0.5


func _allow(e: RefCounted, at: Vector2, gap: float) -> bool:
	if e==null or e.blocked or e.bridge or e.rank>5 or e.exit-e.entry<gap:
		return false
	var p := _center(e)
	if depot.distance_to(p)<65.0 or p.distance_to(host.safe_stop)<65.0 or p.distance_to(at)<70.0:
		return false
	for site in sites:
		if p.distance_to(site.p)<75.0:
			return false
	for actor: CharacterBody3D in traffic.moving:
		if p.distance_squared_to(Vector2(actor.position.x,actor.position.z))<65.0:
			return false
	return true


func _path_edges(at: Vector2, back: bool) -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	if not host.route_provider.is_valid():
		return options
	var path: PackedVector2Array = host.route_provider.call()
	var cached := {}
	if path.size()<2:
		return options
	var start := 0
	var best := INF
	for i in range(1,path.size()):
		if path[i-1]==path[i]:
			continue
		var d := at.distance_squared_to(Geometry2D.get_closest_point_to_segment(at,path[i-1],path[i]))
		if d<best:
			start = i-1
			best = d
	var accumulated := 0.0
	for i in range(start,path.size()-1):
		var a := path[i]
		var b := path[i+1]
		var segment := a.distance_to(b)
		if segment<0.25:
			continue
		var length_to := accumulated
		accumulated += segment
		if accumulated<85.0:
			continue
		if length_to>(900.0 if back else 420.0):
			break
		var steps := maxi(1,ceili(segment/20.0))
		for j in steps:
			var t := (j+0.5)/steps
			var loc := a.lerp(b,t)
			var e: RefCounted = traffic.roads.nearest(loc,a.direction_to(b))
			if e==null or cached.has(e) or (back and not reserve.has(_key(e))):
				continue
			cached[e] = true
			var middle := _center(e)
			if _allow(e,at,12.0 if back else 28.0) and absf(e.dir.dot(a.direction_to(b)))>=0.65 and (not back or (at.distance_to(middle)>=75.0 and (at.distance_to(middle)>=200.0 or not _seen(middle)))):
				options.append({"edge":e,"score":absf(length_to+t*segment-(260.0 if back else 200.0))})
	options.sort_custom(func(a,b):return a.score<b.score)
	return options


func _route_attempt(at: Vector2, back: bool) -> bool:
	var options := _path_edges(at,back)
	var lane := not back and randf()<0.55
	for i in mini(8,options.size()):
		var edge: RefCounted = options[i].edge
		if lane and edge.width>=7 and edge.exit-edge.entry>=42 and (edge.width>=12.5 or traffic.roads.lookup(edge.b,edge.a)!=null):
			return _create("lane",edge,at)
	for i in mini(8,options.size()):
		var edge: RefCounted = options[i].edge
		var kind := "repair"
		if back and edge.width+0.4<=11.2 and (last_back=="repair" or randf()<0.5):
			kind = "crash"
		if _create(kind,edge,at,back):
			if back:
				last_back = kind
			return true
	return false


func _near_attempt(at: Vector2, wreck := false) -> bool:
	var pool: Array = traffic.roads.around(at,360.0)
	if pool.is_empty():
		return false
	for i in 12:
		var e: RefCounted = pool.pick_random()
		var p := _center(e)
		var d := p.distance_to(at)
		if d<160 or d>360 or not _allow(e,at,22.0) or (d<200 and _seen(p)):
			continue
		if wreck:
			return _create("accident",e,at)
		if e.width>=7 and e.exit-e.entry>=42 and (e.width>=12.5 or traffic.roads.lookup(e.b,e.a)!=null):
			return _create("lane",e,at)
		if _create("repair",e,at):
			return true
	return false


func _create(kind: String, e: RefCounted, at: Vector2, back := false) -> bool:
	var closure := kind in ["repair","crash"]
	if closure:
		if not host.request_closure.is_valid() or not traffic.roads.short_detour(e):
			return false
		if not host.request_closure.call(e.a,e.b,true):
			return false
		traffic.set_road_closed(e.a,e.b,true)
	var p := _center(e)
	var hl := minf(6.0,(e.exit-e.entry)*0.5-4.0)
	var ttl := randf_range(180.0,240.0) if back else randf_range(160.0,240.0)
	if kind=="lane":
		hl = minf(46.0,e.exit-e.entry-22.0)*0.5
		ttl = randf_range(150.0,230.0)
	elif kind=="accident":
		ttl = 90.0
	var scene := {"kind":kind,"edge":e,"p":p,"ttl":ttl,"closed":closure,"back":back,"hl":hl,
		"root":Node3D.new(),"workers":[],"queued":[],"warned":false,"age":0.0,"vehicles":[],"blink":[],
		"dispute":randf_range(15.0,40.0),"done":false}
	add_child(scene.root)
	sites.append(scene)
	if closure:
		host.road_closed.emit(e.a,e.b,true)
	if kind=="accident" or kind=="crash":
		_accident(scene)
	else:
		_works(scene)
	return true


func _world(p: Vector2, y: float) -> Vector3:
	return Vector3(p.x,host.ground.at(p.x,p.y)+y,p.y)


func _place(scene: Dictionary, local: Vector2) -> Vector2:
	return scene.p+scene.edge.dir*local.y+scene.edge.right*local.x


func _box(scene: Dictionary, loc: Vector2, y: float, size_value: Vector3, color: Color) -> MeshInstance3D:
	var item: MeshInstance3D = host._box(size_value,color)
	item.position = _world(_place(scene,loc),y)
	item.rotation.y = atan2(scene.edge.dir.x,scene.edge.dir.y)
	scene.root.add_child(item)
	return item


func _barrier(scene: Dictionary, loc: Vector2, width: float) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	body.position = _world(_place(scene,loc),0.54)
	body.rotation.y = atan2(scene.edge.dir.x,scene.edge.dir.y)
	var holder := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(width,1.08,0.30)
	holder.shape = box
	body.add_child(holder)
	scene.root.add_child(body)
	_box(scene,loc,0.78,Vector3(width,0.46,0.14),Color("#f8ede0"))
	var np := maxi(2,roundi(width/0.65))
	for i in np:
		var stripe := _box(scene,loc+Vector2((float(i)+0.5)/np*width-width*0.5,0.09),0.78,Vector3(0.18,0.47,0.035),Color("#cf3a24"))
		stripe.rotate_object_local(Vector3.FORWARD,0.25)
	for s: float in [-1.0,1.0]:
		_box(scene,loc+Vector2(s*width*0.37,0),0.34,Vector3(0.095,0.68,0.14),Color("#413c36"))
	var lamp := _box(scene,loc,1.09,Vector3(0.13,0.13,0.13),Color("#ffb62e"))
	scene.blink.append(lamp)


func _cone(scene: Dictionary, local: Vector2) -> void:
	var mesh := MeshInstance3D.new()
	mesh.mesh = cone_shape
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = _world(_place(scene,local),0.26)
	scene.root.add_child(mesh)


func _works(scene: Dictionary) -> void:
	var e: RefCounted = scene.edge
	var lane: bool = scene.kind=="lane"
	var half: float = scene.hl
	var lane_offset := maxf(1.85,e.offset) if lane else 0.0
	var width: float = minf(3.0,e.width*0.43) if lane else e.width*0.93
	_box(scene,Vector2(lane_offset,0),0.035,Vector3(width*0.78,0.035,half*1.15),Color("#494139"))
	for s: float in [-1.0,1.0]:
		_barrier(scene,Vector2(lane_offset,s*half),width)
		for j in 3:
			_cone(scene,Vector2(lane_offset+s*width*0.52,(float(j)-1.0)*half*0.65))
	var road_edge: float = lane_offset+width*0.54
	for j in 2:
		scene.queued.append(_place(scene,Vector2(road_edge,(j-0.5)*2.9)))
	var sign_y := -half-8.0
	_box(scene,Vector2(e.width*0.5+0.75,sign_y),0.94,Vector3(0.07,1.85,0.07),Color("#7c7e7d"))
	_box(scene,Vector2(e.width*0.5+0.75,sign_y),1.55,Vector3(1.36,0.74,0.09),Color("#f5c72b"))
	var label := Label3D.new()
	label.font_size = 36
	label.pixel_size = 0.005
	label.modulate = Color("#292824")
	label.outline_size = 0
	label.double_sided = true
	label.text = "««" if lane else tr("ОБЪЕЗД")
	label.position = _world(_place(scene,Vector2(e.width*0.5+0.75,sign_y-0.07)),1.54)
	label.rotation.y = atan2(-e.dir.x,-e.dir.y)
	scene.root.add_child(label)


func _accident(scene: Dictionary) -> void:
	var lane: float = 0.0 if scene.closed else maxf(1.8,scene.edge.offset)
	for i in 2:
		var p := _place(scene,Vector2(lane+(-0.48 if i==0 else 0.5),-2.15 if i==0 else 2.15))
		var dir: Vector2 = Vector2(scene.edge.dir).rotated(randf_range(0.20,0.45)*(1.0 if i==0 else -1.0))
		var car_at: CharacterBody3D = traffic._instance(p,atan2(-dir.x,-dir.y))
		scene.vehicles.append(car_at)
		scene.queued.append(_place(scene,Vector2(lane+2.4,0.9 if i==0 else -0.9)))


func _remove(idx: int) -> void:
	var scene := sites[idx]
	sites.remove_at(idx)
	if scene.closed:
		if host.request_closure.is_valid():
			host.request_closure.call(scene.edge.a,scene.edge.b,false)
		traffic.set_road_closed(scene.edge.a,scene.edge.b,false)
		host.road_closed.emit(scene.edge.a,scene.edge.b,false)
	for actor: Node3D in scene.workers:
		if is_instance_valid(actor):
			actor.queue_free()
	for vehicle: Node3D in scene.vehicles:
		if is_instance_valid(vehicle):
			vehicle.queue_free()
	scene.root.queue_free()


func _crew_one(scene: Dictionary) -> void:
	var p: Vector2 = scene.queued.pop_front()
	var i: int = scene.workers.size()
	var actor: Node3D = host.factory.call([2,0][i%2],p,p,0.0)
	actor.rotation.y = atan2(scene.edge.dir.x,scene.edge.dir.y)+(PI if i%2 else 0.0)
	if scene.kind in ["repair","lane"]:
		var vest: MeshInstance3D = host._box(Vector3(0.42,0.34,0.22),Color("#e97722"))
		vest.position = Vector3(0,1.10,0)
		actor.model.add_child(vest)
		var stripe: MeshInstance3D = host._box(Vector3(0.43,0.05,0.224),Color("#f7d85c"))
		stripe.position = Vector3(0,1.04,0)
		actor.model.add_child(stripe)
	scene.workers.append(actor)


func step(delta: float) -> void:
	var at := Vector2(car.position.x,car.position.z)
	clock -= delta
	var track_due := clock<=0.0
	if track_due:
		clock = 0.5
		_track(at)
	var calm: bool = not host.ride and (host.story or not bool(host.profile.data.get("gennady_paid",false)))
	var near := false
	var built := false
	var accidents := 0
	var work_count := 0
	for i in range(sites.size()-1,-1,-1):
		var scene := sites[i]
		var distance := at.distance_to(scene.p)
		if distance<450.0 and scene.kind!="accident":
			near = true
		scene.age += delta
		scene.ttl -= delta
		if not built and not scene.queued.is_empty() and host.factory.is_valid():
			_crew_one(scene)
			built = true
		if scene.kind=="accident":
			accidents += 1
			if scene.age>scene.dispute and not scene.done and scene.workers.size()>=2:
				scene.done = true
				var walker: Node3D = scene.workers[1]
				if traffic.people._clear_to_use(walker):
					var p := Vector2(walker.position.x,walker.position.z)
					traffic.people._walk(walker,p,p+Vector2(scene.edge.right)*14.0,1.5)
		else:
			work_count += 1
		for lamp: Node3D in scene.blink:
			lamp.visible = int(float(scene.age)*2.2)%2==0
		if not scene.warned and distance<95.0:
			scene.warned = true
			host.notice.emit(tr("ДТП на дороге") if scene.kind in ["accident","crash"] else tr("Ремонт дороги — объезд"))
		if scene.back and distance>650.0:
			scene.ttl = minf(scene.ttl,0.0)
		if scene.ttl < -240 or (scene.ttl<=0 and distance>110.0 and (not scene.back or distance>=200.0 or not _seen(scene.p))):
			_remove(i)
	if calm:
		return
	work_in -= delta
	anywhere -= delta
	back_window = maxf(0.0,back_window-delta)
	crash_in -= delta
	if track_due and back_window>0.0 and work_count<3 and _route_attempt(at,true):
		back_window = 0
		back_gap = randi_range(2,3)
	if not near and work_count<3 and work_in<=0 and not host.ride:
		work_in = randf_range(35,70) if _route_attempt(at,false) else 4.0
	if anywhere<=0:
		anywhere = randf_range(90,160)
		if work_count<2:
			_near_attempt(at)
	if crash_in<=0:
		crash_in = randf_range(50,100)
		if accidents<2 and randf()<0.7:
			_near_attempt(at,true)


func lane_change(at: Vector2, nose: Vector2) -> Vector2:
	for site in sites:
		if site.kind!="lane" or nose.dot(site.edge.dir)<0.65:
			continue
		var off: Vector2 = at-site.p
		var along := absf(off.dot(site.edge.dir))
		if along>float(site.hl)+14 or absf(off.dot(site.edge.right)-site.edge.offset)>2.0:
			continue
		return -Vector2(site.edge.right)*minf(3.45,site.edge.width*0.46)*(1.0-smoothstep(site.hl,site.hl+14.0,along))
	return Vector2.ZERO


func speed_limit(at: Vector2, nose: Vector2, _speed: float) -> float:
	for site in sites:
		var off: Vector2 = at-site.p
		if off.length_squared()>55.0*55.0:
			continue
		var along := off.dot(site.edge.dir)
		var lateral := off.dot(site.edge.right)
		if site.kind=="lane":
			if nose.dot(site.edge.dir)>0.65 and absf(along)<=float(site.hl)+17 and absf(lateral)<site.edge.width*0.58:
				return 0.68
		elif site.closed and absf(along)>=site.hl-0.5 and absf(lateral)<site.edge.width*0.5+1.5 and -signf(along)*nose.dot(site.edge.dir)>0.3:
			return clampf((absf(along)-float(site.hl)-2.49-1.5)/7.0,0.0,1.0)
	return 1.0
