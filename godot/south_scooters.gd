extends Node3D

signal struck(person: Node3D, direction: Vector3, speed: float)
const MODEL := preload("res://south_scooter_model.gd")
const SWEEP := preload("res://pedestrian_contact.gd")
const WALKER := preload("res://pedestrian.gd")
const COUNT := 16
const CURB := .9
const RELOCATE := 480.0

class Rider:
	var deck: MeshInstance3D
	var people: Array[Node3D] = []
	var pose: RefCounted
	var edge: RefCounted
	var forward := true
	var side := 1
	var at := Vector2.ZERO
	var facing := 0.0
	var lean := 0.0
	var speed := 5.0
	var station := 0.0
	var path := PackedVector2Array()
	var progress := 0
	var crossing := {}
	var cross_wait := 0.0
	var respawn := 0.0
	var push := 0.0
	var dodge := Vector2.ZERO
	var height := 0.0
	var ground_target := 0.0
	var ground_wait := 0.0

var car: CharacterBody3D
var ground: RefCounted
var traffic: Node3D
var factory: Callable
var riders: Array[Rider] = []
var decks: Array[ArrayMesh] = []
var paint:=StandardMaterial3D.new()
var fallen: Array[Dictionary] = []
var debris: Array[Dictionary] = []
var cached_at:=Vector2.INF
var nearby: Array = []
var valid_sides := {}
var spawn_in := 0.0
var rng:=RandomNumberGenerator.new()

func setup(vehicle: CharacterBody3D, terrain: RefCounted, flow: Node3D, make_person: Callable) -> void:
	car=vehicle
	ground=terrain
	traffic=flow
	factory=make_person
	paint.vertex_color_use_as_albedo=true
	paint.roughness=.9
	for i in MODEL.PALETTE.size():
		decks.append(MODEL.deck(i))
	traffic.signals.extra_speed_limits.append(_traffic_limit)
	rng.randomize()

func step(delta: float, customer := Vector2.INF) -> void:
	var observer:=Vector2(car.position.x,car.position.z)
	if observer.distance_squared_to(cached_at)>80*80:
		nearby=traffic.roads.around(observer,405.0)
		cached_at=observer
	spawn_in-=delta
	if riders.size()<COUNT and spawn_in<=0:
		var rider:=Rider.new()
		if _place(rider,observer,30.0,380.0,customer):
			_mount(rider)
			riders.append(rider)
		spawn_in=.09
	for r in riders:
		if r.respawn>0:
			r.respawn-=delta
			if r.respawn<=0:
				if _place(r,observer,120,400,customer): _mount(r)
				else: r.respawn=.65
			continue
		var distance:=r.at.distance_squared_to(observer)
		if distance>RELOCATE*RELOCATE:
			if _place(r,observer,120,380,customer):
				_show(r,0,true)
			continue
		_ride(r,delta,observer)
	_wrecks(delta)

func _place(r: Rider, at: Vector2, near: float, far: float, customer: Vector2) -> bool:
	if nearby.is_empty():return false
	var arterial:=rng.randf()<.7
	for i in 36:
		var edge: RefCounted=nearby[rng.randi_range(0,nearby.size()-1)]
		if edge.length<5 or edge.bridge or (arterial and i<16 and edge.rank>3):
			continue
		var side:=1 if rng.randf()<.5 else -1
		if not _side_ok(edge,side):continue
		var station:=rng.randf_range(.15,.85)*float(edge.length)
		var spot:=_point(edge,station,side)
		var dist:=spot.distance_to(at)
		if dist<near or dist>far or spot.distance_squared_to(customer)<14*14:continue
		r.edge=edge
		r.forward=true
		r.side=side
		r.station=station
		r.at=spot
		r.height=ground.at(spot.x,spot.y,ground.land_height(spot.x,spot.y))
		r.facing=atan2(edge.dir.x,edge.dir.y)
		r.lean=0
		r.crossing={}
		r.path.clear()
		r.progress=0
		r.dodge=Vector2.ZERO
		r.ground_wait=0
		r.cross_wait=rng.randf_range(8,40)
		return true
	return false

func _side_ok(edge: RefCounted, side: int) -> bool:
	var known: Dictionary = valid_sides.get(edge,{})
	if known.has(side):return known[side]
	var on_other:=0
	for t: float in [.25,.5,.75]:
		var p:=_point(edge,float(edge.length)*t,side)
		for other: Dictionary in ground.road_cells.get(Vector2i((p/48).floor()),[]):
			if other.bounds.has_point(p) and Geometry2D.is_point_in_polygon(p,other.road):
				on_other+=1
				break
	known[side]=on_other<2
	valid_sides[edge]=known
	return on_other<2

func _point(edge: RefCounted, station: float, side: int) -> Vector2:
	return edge.a+edge.dir*station+edge.right*side*(float(edge.width)*.5+CURB)

func _mount(r: Rider) -> void:
	r.deck=MeshInstance3D.new()
	r.deck.mesh=decks[rng.randi_range(0,decks.size()-1)]
	r.deck.material_override=paint
	r.deck.visibility_range_end=470.0
	add_child(r.deck)
	var two:=rng.randf()<.25
	for i in (2 if two else 1):
		var p: Node3D=factory.call(rng.randi_range(0,4),r.at,r.at,0.0)
		p.set_meta(&"scooter_rider",true)
		var pose:=MODEL.seated_rider(p,i>0)
		if i==0:r.pose=pose
		r.people.append(p)
	r.speed=rng.randf_range(4.5,6.8)*(.8 if two else 1.0)
	r.push=rng.randf_range(1,6)
	_show(r,0,true)

func _ride(r: Rider, dt: float, observer: Vector2) -> void:
	var before:=r.at
	var move:=dt*r.speed
	r.cross_wait-=dt
	if not r.crossing.is_empty():
		var phase:=int(r.crossing.phase)
		if r.progress==0 and phase>=0 and traffic.signals.light(phase)!=2:
			return
		r.progress=1
		var end:=_point(r.edge,r.station,-r.side)
		r.at=r.at.move_toward(end,move*1.7)
		if r.at.is_equal_approx(end):
			r.side=-r.side
			r.crossing={}
			r.cross_wait=rng.randf_range(25,80)
			r.progress=0
	elif r.progress<r.path.size():
		var next:=r.path[r.progress]
		r.at=r.at.move_toward(next,move)
		if r.at.is_equal_approx(next):r.progress+=1
	else:
		var sign_:=1 if r.forward else -1
		var next_station:=clampf(r.station+sign_*move,0,r.edge.length)
		if not _cross(r,sign_,next_station):
			r.station=next_station
			r.at=_point(r.edge,r.station,r.side)
			if r.station<=.001 or r.station>=float(r.edge.length)-.001:
				_corner(r)
	if not r.at.is_equal_approx(before):
		var direction:=before.direction_to(r.at)
		var turn:=angle_difference(r.facing,atan2(direction.x,direction.y))
		r.facing+=turn*minf(1,dt*9)
		r.lean=lerpf(r.lean,clampf(-turn*2.5,-.35,.35),1-exp(-6*dt))
	var dodge:=Vector2.ZERO
	var away:=r.at-observer
	if absf(car.speed)<3.0 and away.length_squared()<13.0 and absf(r.height-car.position.y)<1.9:
		dodge=away.normalized()*maxf(0,3.6-away.length())
	r.dodge=r.dodge.lerp(dodge,1-exp(-6*dt))
	_show(r,dt,false)

func _cross(r: Rider, direction: int, next: float) -> bool:
	if r.cross_wait>0:return false
	for zebra: Dictionary in traffic.signals.zebra_cells.get(Vector2i((r.at/80).floor()),[]):
		if absf(r.edge.dir.dot(zebra.dir))<.85:continue
		var delta: Vector2=zebra.p-r.edge.a
		var along: float=delta.dot(r.edge.dir)
		if absf(delta.cross(r.edge.dir))>2.6 or (along-r.station)*direction<0 or (next-along)*direction<0:continue
		r.cross_wait=rng.randf_range(25,80)
		if not _side_ok(r.edge,-r.side):return false
		r.station=along
		r.at=_point(r.edge,along,r.side)
		r.progress=0
		r.path.clear()
		r.crossing=zebra
		return true
	return false

func _corner(r: Rider) -> void:
	var node: Vector2=r.edge.b if r.forward else r.edge.a
	var before: Vector2=r.edge.a if r.forward else r.edge.b
	var dir: Vector2=r.edge.dir if r.forward else -r.edge.dir
	var prefer:=r.side if r.forward else -r.side
	var best: RefCounted
	var straight: RefCounted
	var best_turn:=-INF
	var straight_angle:=.6
	for peer: Vector2 in traffic.roads.neighbors.get(node,[]):
		if peer==before:continue
		var edge: RefCounted=traffic.roads.lookup(node,peer)
		if not edge:edge=traffic.roads.lookup(peer,node)
		if not edge or edge.bridge or not _side_ok(edge,prefer if edge.a==node else -prefer):continue
		var direction:=node.direction_to(peer)
		var angle:=dir.angle_to(direction)
		if angle*prefer>best_turn:
			best_turn=angle*prefer
			best=edge
		if edge.rank<=3 and absf(angle)<straight_angle:
			straight_angle=absf(angle)
			straight=edge
	if best and straight and best.rank>3 and rng.randf()<.7:best=straight
	if not best:
		r.forward=not r.forward
		return
	r.edge=best
	r.forward=best.a==node
	r.side=prefer if r.forward else -prefer
	var trim:=minf(2.5,float(best.length)*.22)
	r.station=trim if r.forward else float(best.length)-trim
	var end:=_point(best,r.station,r.side)
	var elbow:=_point(best,0 if r.forward else best.length,r.side)
	var from:=r.at
	r.path.clear()
	for t:float in [.25,.50,.75,1.]:
		r.path.append(from.lerp(elbow,t).lerp(elbow.lerp(end,t),t))
	r.progress=0

func _show(r: Rider, dt: float, reset: bool) -> void:
	var p:=r.at+r.dodge
	var distance:=p.distance_squared_to(Vector2(car.position.x,car.position.z))
	r.ground_wait-=dt
	if reset or r.ground_wait<=0:
		r.ground_target=ground.at(p.x,p.y,r.height)
		r.ground_wait=.11 if distance>150*150 else (.05 if distance>70*70 else 0.0)
	r.height=r.ground_target if reset or r.ground_wait==0.0 else lerpf(r.height,r.ground_target,1.0-exp(-18*dt))
	var place:=Vector3(p.x,r.height,p.y)
	r.deck.rotation=Vector3(0,r.facing,r.lean)
	r.deck.position=place
	for i in r.people.size():
		r.people[i].position=place-r.deck.basis.z*(.42*i)
		r.people[i].rotation=r.deck.rotation
		if reset:r.people[i].reset_physics_interpolation()
	if reset:r.deck.reset_physics_interpolation()
	if dt>0 and distance<50*50:
		r.push-=dt
		if r.push<-.9:
			r.push=rng.randf_range(3,9)
			MODEL.push_leg(r.pose,0)
		elif r.push<0:
			MODEL.push_leg(r.pose,sin(-r.push/.9*PI))

func sweep(start: Vector3, stop: Vector3, motion: Vector3) -> void:
	if motion.length_squared()<9:return
	var at:=Vector2(start.x,start.z)
	var reach:=4.0+start.distance_to(stop)
	for r in riders:
		if r.respawn>0 or not is_instance_valid(r.deck):continue
		var p:=r.deck.position
		if absf(p.y-(start.y+stop.y)*.5)>1.65 or at.distance_squared_to(Vector2(p.x,p.z))>reach*reach:continue
		var sample:=SWEEP.from_sweep(start,stop,car.basis,motion,p,.36)
		if sample.is_empty() or float(sample.speed)<3:continue
		_hit(r,sample,motion)

func _hit(r: Rider, sample: Dictionary, motion: Vector3) -> void:
	var direction: Vector3=sample.direction
	var heading:=Vector3(sin(r.facing),0,cos(r.facing))
	var fling: Vector3=(direction+.25*heading).normalized()
	for p in r.people:
		p.model.position.y=0
		p.set_physics_process(true)
		p.player.active=true
		p.collider.collision_layer=4
		var damage: int=p.impact(sample.speed,fling,false,sample.offset,maxf(.72,sample.lift))
		if damage==WALKER.Hit.DOWN:
			p.set_meta(&"knockdown_recorded",true)
			struck.emit(p,fling,sample.speed)
		else:
			p.from=r.at
			p.to=r.at+Vector2(heading.x,heading.z)*8
			p.walker=true
		fallen.append({"actor":p,"t":30.0 if damage==WALKER.Hit.DOWN else 16.0})
	r.people.clear()
	r.pose=null
	r.respawn=rng.randf_range(14,22)
	r.crossing={}
	debris.append({"deck":r.deck,"v":motion*.55+Vector3(rng.randf_range(-2,2),rng.randf_range(2.5,4.5),rng.randf_range(-2,2)),
		"spin":Vector3(rng.randf_range(-7,7),rng.randf_range(-9,9),0),"side":1.0 if rng.randf()<.5 else -1.0,"grounded":false,"rest":false,"t":25.0})
	r.deck=null

func _wrecks(dt: float) -> void:
	for i in range(fallen.size()-1,-1,-1):
		var f:=fallen[i]
		f.t-=dt
		if f.t<=0:
			if is_instance_valid(f.actor):f.actor.queue_free()
			fallen.remove_at(i)
	for i in range(debris.size()-1,-1,-1):
		var d:=debris[i]
		d.t-=dt
		var deck: MeshInstance3D=d.deck
		if d.t<=0:
			deck.queue_free()
			debris.remove_at(i)
			continue
		if d.t<1.0:deck.scale=Vector3.ONE*maxf(.001,d.t)
		if d.rest:continue
		d.v.y-=19.0*dt
		if d.grounded:
			d.v.x*=exp(-3.5*dt)
			d.v.z*=exp(-3.5*dt)
			d.spin*=exp(-5.0*dt)
			deck.rotation.z=lerp_angle(deck.rotation.z,float(d.side)*PI*.5,1.0-exp(-9*dt))
		deck.position+=Vector3(d.v)*dt
		deck.rotation+=Vector3(d.spin)*dt
		var floor_y:float=ground.at(deck.position.x,deck.position.z,deck.position.y)+.10
		if deck.position.y<=floor_y:
			deck.position.y=floor_y
			d.grounded=true
			d.v.y=-d.v.y*.3 if d.v.y < -2 else 0.0
			if Vector2(d.v.x,d.v.z).length()<.05 and d.v.y==0:
				deck.rotation=Vector3(0,deck.rotation.y,float(d.side)*PI*.5)
				d.rest=true

func _traffic_limit(at: Vector2, dir: Vector2, _speed: float) -> float:
	var gain:=1.0
	for r in riders:
		if r.crossing.is_empty() or r.progress==0:continue
		var separation:=r.at-at
		var ahead:=separation.dot(dir)
		if ahead>0 and ahead<23 and absf(separation.cross(dir))<2.1:
			gain=minf(gain,clampf((ahead-2.5)/9.0,0,1))
	return gain

func clear() -> void:
	for r in riders:
		if is_instance_valid(r.deck):r.deck.queue_free()
		for p in r.people:
			if is_instance_valid(p):p.queue_free()
	for f in fallen:
		if is_instance_valid(f.actor):f.actor.queue_free()
	for d in debris:
		if is_instance_valid(d.deck):d.deck.queue_free()
	riders.clear()
	fallen.clear()
	debris.clear()
	nearby.clear()
	cached_at=Vector2.INF
	spawn_in=0.0

func _exit_tree() -> void:
	if is_instance_valid(traffic) and is_instance_valid(traffic.signals):
		traffic.signals.extra_speed_limits.erase(_traffic_limit)
	clear()
