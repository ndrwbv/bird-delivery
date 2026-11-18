extends Node3D

const VEHICLE := preload("res://south_rival_car.gd")
const BURGER := Color("#ffd000")
# game.js FOE_SPEC uses a blue sedan. In South this is the same VAZ-2107; the restaurant mopeds have a separate population.
const SUSHI := Color("#1a8cff")
var host: Node3D
var cast: RefCounted
var goals: Array[RefCounted] = []
var crews: Array[Dictionary] = []
var ram_gap := 0.0


func setup(events: Node3D) -> void:
	host = events
	cast = host.cast
	var center: Vector2 = host.street_works.depot
	for e: RefCounted in host.traffic.roads.around(center,660):
		var d := center.distance_to(e.lane((e.entry+e.exit)*0.5))
		if not e.bridge and e.rank<=4 and e.exit-e.entry>8 and d>=140 and d<=650:
			goals.append(e)
	host.traffic.signals.changed_route.connect(_road_changed)


func _road_changed(_a: Vector2,_b: Vector2) -> void:
	for r in crews:
		if r.phase=="go":
			r.route_again = true


func begin(shifts_done: int) -> void:
	clear()
	ram_gap = 0.0
	var n := 2+int(shifts_done>=5)+int(shifts_done>=11)
	for i in n:
		crews.append({"car":null,"guest":null,"phase":"spawn","wait":4.0+i*6,"index":i,"edge":null,"target":Vector2.ZERO,
			"ram_cd":randf_range(25,45),"cut_cd":randf_range(20,35),"route_again":false,"earned":false,
			"box":null,"delivered":false,"label":null})


func _remove_guest(r: Dictionary) -> void:
	if is_instance_valid(r.guest):
		cast.retire(r.guest)
	r.guest = null
	if is_instance_valid(r.box):
		r.box.queue_free()
	r.box = null


func clear() -> void:
	for r in crews:
		_remove_guest(r)
		if is_instance_valid(r.car):
			r.car.queue_free()
	crews.clear()


func _point(edge: RefCounted) -> Vector2:
	var begin := float(edge.entry)
	var end := float(edge.exit)
	var len_: float = edge.length
	if host.traffic.roads.neighbors.get(edge.a,[]).size()>2:
		begin = maxf(16.0,begin)
	if host.traffic.roads.neighbors.get(edge.b,[]).size()>2:
		end = minf(len_-16.0,end)
	if end-begin<1:
		return Vector2.INF
	return edge.lane(randf_range(begin,end))


func _pick(at: Vector2, gap: float, r: Dictionary) -> bool:
	if goals.is_empty():
		return false
	for i in 32:
		var e: RefCounted = goals.pick_random()
		if e.blocked:
			continue
		var target := _point(e)
		if not target.is_finite() or target.distance_to(at)<gap or target.distance_to(host.safe_stop)<40:
			continue
		r.edge = e
		r.target = target
		return true
	return false


func _new_vehicle(r: Dictionary, at: Vector2) -> bool:
	if not _pick(at,160,r):
		return false
	var v := VEHICLE.new()
	add_child(v)
	v.player_car = host.car
	v.park(r.target,atan2(-float(r.edge.dir.x),-float(r.edge.dir.y)),host.traffic,SUSHI if r.index==0 else BURGER,null)
	v.cruise = 26.0 if r.index==0 else (25.0 if r.index==1 else 30.0)
	v.add_to_group("rival_car")
	v.at_stop.connect(_arrive.bind(r))
	v.destroyed.connect(_wreck.bind(r))
	v.displaced.connect(_displaced.bind(r))
	r.car = v
	r.phase = "wait"
	var sign: Label3D = host._label(v,0.0045)
	sign.position.y = 2.38
	sign.text = tr("суши") if r.index==0 else tr("бургеры")
	sign.modulate = SUSHI.lightened(0.4) if r.index==0 else BURGER
	sign.visibility_range_begin = 8.5
	sign.visibility_range_begin_margin = 5.0
	sign.visibility_range_end = 100
	sign.show()
	r.label = sign
	return true


func _arrive(v: Node3D, r: Dictionary) -> void:
	if r.phase!="go" or v!=r.car:
		return
	r.phase = "give"
	r.wait = 2.5
	r.delivered = false
	if is_instance_valid(r.guest):
		r.box = cast.prop(self,Vector3(0.39,0.066,0.4),Vector3.ZERO,Color("#ddb98a"))
		cast.prop(r.box,Vector3(0.12,0.007,0.40),Vector3.UP*.037,Color("#ad4d34"))


func _wreck(v: Node3D, r: Dictionary) -> void:
	if v!=r.car:
		return
	if not host.quick and not host.ride:
		host.respect_earned.emit("rivalCar")
		if not r.earned:
			r.earned = true
			host.rival_defeated.emit()
	r.phase = "out"
	r.wait = 60.0
	v.going = false
	v.ram = 0
	v.cut = 0
	v.remove_from_group("rival_car")
	v.visual.rotation.z = 0.14
	if is_instance_valid(r.label):
		r.label.hide()
	_remove_guest(r)
	host.notice.emit(tr("выбил конкурента!"))


func _displaced(v: Node3D, r: Dictionary) -> void:
	if r.car==v and r.phase=="go":
		r.route_again = true


func _go(r: Dictionary, at: Vector2, again: bool) -> void:
	var v: CharacterBody3D = r.car
	if not again:
		_remove_guest(r)
	if (not again or r.edge==null or r.edge.blocked) and not _pick(at,90,r):
		r.wait = 3
		r.phase = "wait"
		return
	var p := Vector2(v.position.x,v.position.z)
	var e: RefCounted = host.traffic.roads.nearest(p,Vector2(-v.basis.z.x,-v.basis.z.z))
	if e==null or v.go(e,r.edge,r.target,host.traffic,v.cruise)<=0.1:
		r.wait = 3
		r.phase = "wait"
		return
	r.phase = "go"
	r.route_again = false
	if r.guest==null:
		var guest_at: Vector2 = r.target+r.edge.right*(r.edge.width*0.5+1.4-r.edge.offset)
		if host._clear_yard(guest_at,0.3):
			r.guest = cast.actor(randi()%5,guest_at)
			r.guest.rotation.y = atan2(-float(r.edge.right.x),-float(r.edge.right.y))


func hit(who: Node3D, kmh: float) -> void:
	if kmh<20:
		return
	for r in crews:
		if r.guest==who:
			cast.retire(who,true)
			r.guest = null


func _maneuver(r: Dictionary, observer: Vector2, dt: float) -> void:
	var v: CharacterBody3D = r.car
	r.ram_cd -= dt
	r.cut_cd -= dt
	var p := Vector2(v.position.x,v.position.z)
	var dir := Vector2(-v.basis.z.x,-v.basis.z.z)
	var to := observer-p
	var dist := to.length()
	if host.ride or r.index==0 or dist>30 or v.ram>0 or v.cut>0:
		return
	if dist>6 and dist<28 and ram_gap<=0 and r.ram_cd<=0 and absf(dir.angle_to(to))<0.8 and randf()<1.5*dt:
		var start := v.global_position+Vector3.UP*0.9
		var end := Vector3(observer.x,host.car.position.y+0.9,observer.y)
		var ray := PhysicsRayQueryParameters3D.create(start,end,1,[v.get_rid()])
		if not host.get_world_3d().direct_space_state.intersect_ray(ray).is_empty():
			return
		v.ram = 2.6
		r.ram_cd = randf_range(35,60)
		ram_gap = 50.0
	elif r.cut_cd<=0 and absf(host.car.speed)>7:
		var forward := Vector2(-host.car.basis.z.x,-host.car.basis.z.z)
		if (-to).dot(forward)>4 and (-to).dot(forward)<14 and absf(to.cross(forward))<2.4 and dir.dot(forward)>0.85:
			v.cut = 1.3
			r.cut_cd = randf_range(20,35)


func step(dt: float, at: Vector2, calm: bool) -> void:
	ram_gap = maxf(0,ram_gap-dt)
	var routed := false
	for r in crews:
		match r.phase:
			"spawn":
				if not routed:
					routed = true
					if not _new_vehicle(r,at):
						r.phase = "out"
						r.wait = 3.0
			"out":
				r.wait -= dt
				if r.wait<=0:
					if is_instance_valid(r.car):
						r.car.queue_free()
					r.car = null
					r.phase = "spawn"
			"wait":
				if calm:
					continue
				r.wait -= dt
				if r.wait<=0 and not routed:
					routed = true
					_go(r,at,false)
			"go":
				if r.route_again and not routed and r.car.coast.length_squared()<0.08:
					routed = true
					_go(r,at,true)
				if not calm:
					_maneuver(r,at,dt)
			"give":
				r.wait -= dt
				if is_instance_valid(r.guest) and is_instance_valid(r.box) and not r.delivered:
					var flight := clampf((2.5-r.wait)/0.6,0.0,1.0)
					r.box.global_position = (r.car.position+Vector3.UP*1.3).lerp(r.guest.position+Vector3.UP*1.15,flight)+Vector3.UP*(0.35*sin(PI*flight))
					if flight>=1.0:
						r.box.reparent(r.guest.grip,false)
						r.box.position = Vector3.ZERO
						r.guest.player.play("carry",0.12)
						r.guest._emote(3)
						r.delivered = true
				if r.wait<=0:
					r.phase = "wait"
					r.wait = randf_range(0.5,1.5)
