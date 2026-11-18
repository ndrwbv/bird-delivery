extends RefCounted

var create_person: Callable
var streets: RefCounted
var signals: Node3D
var walkers: Array[Dictionary] = []
var shelters: Array[Dictionary] = []
var waiting := 0
var passengers: Array[Dictionary] = []
var sequence := 50
var refresh := 0.0
var core := Rect2()


func setup(factory: Callable, graph: RefCounted, lights: Node3D, region: Dictionary) -> void:
	create_person = factory
	streets = graph
	signals = lights
	var bounds: Array = region.core_bounds
	core = Rect2(Vector2(bounds[0],bounds[1]),Vector2(bounds[2]-bounds[0],bounds[3]-bounds[1]))
	for stop: Dictionary in region.stops:
		shelters.append({"at":Vector2(stop.at[0],stop.at[1]),"normal":Vector2(stop.normal[0],stop.normal[1]),
			"road":Vector2(stop.road[0],stop.road[1]),"seen":false,"people":[]})


func _spawn(a: Vector2, b: Vector2, phase: float) -> Node3D:
	sequence += 1
	return create_person.call(sequence,a,b,phase)


func _walk(person: Node3D, a: Vector2, b: Vector2, speed: float) -> void:
	person.from = a
	person.to = b
	person.progress = 0.0
	person.reverse = false
	person.walker = a.distance_squared_to(b) > 0.25
	person.pace = speed
	person.standing_offset = Vector3.ZERO
	if person.walker:
		person.player.get_animation("walk").loop_mode = Animation.LOOP_LINEAR
		person.player.play(&"walk",0.18,speed)
	else:
		person.player.play(&"idle",0.18)


func _clear_to_use(person: Node3D) -> bool:
	return not person.defeated and person.knockdown <= 0.0 and person.stunned <= 0.0 and person.ragdoll == null and person.recovery <= 0.0


func tick(delta: float, at: Vector2) -> void:
	if not create_person.is_valid():
		return
	_passengers(delta,at)
	for i in range(walkers.size()-1,-1,-1):
		var item := walkers[i]
		var person: Node3D = item.person
		var p := Vector2(person.position.x,person.position.z)
		if p.distance_squared_to(at) > 210.0*210.0:
			if item.has("zebra"):
				item.zebra.occupied = false
			person.queue_free()
			walkers.remove_at(i)
			continue
		if not _clear_to_use(person):
			if item.has("zebra"):
				item.zebra.occupied = p.distance_squared_to(item.zebra.p) < pow(float(item.zebra.width)*0.5,2)
			continue
		if item.has("zebra"):
			_cross_step(item,person,p,delta)
	refresh -= delta
	if refresh > 0.0:
		return
	refresh = 0.45
	for shelter in shelters:
		var d := at.distance_squared_to(shelter.at)
		if d < 110.0*110.0 and not shelter.seen:
			shelter.seen = true
			_fill_stop(shelter)
		elif d > 170.0*170.0 and shelter.seen:
			for p: Node3D in shelter.people:
				p.queue_free()
			waiting -= shelter.people.size()
			shelter.people.clear()
			shelter.seen = false
	if walkers.size() >= 16:
		return
	var nearby: Array = streets.around(at,160.0)
	if nearby.is_empty():
		return
	for attempt in 12:
		var e: RefCounted = nearby.pick_random()
		var side := 1.0 if randf() < 0.5 else -1.0
		var offset: Vector2 = e.right*(e.width*0.5+1.25)*side
		var center: Vector2 = e.a.lerp(e.b,randf_range(0.1,0.9))
		var p := center+offset
		if p.distance_squared_to(at) < 28.0*28.0 or p.distance_squared_to(at) > 160.0*160.0 or core.has_point(p):
			continue
		var z := _near_crossing(center,at)
		if not z.is_empty() and walkers.size()%3 == 0:
			var across := Vector2(-float(z.dir.y),float(z.dir.x))*side
			var a: Vector2 = z.p+across*(float(z.width)*0.5+1.0)
			var person := _spawn(a,a,0.0)
			person.rotation.y = atan2(-across.x,-across.y)
			walkers.append({"person":person,"zebra":z,"side":across,"status":0,"delay":randf_range(0.0,4.0)})
			return
		var a: Vector2 = e.a+offset+e.dir*minf(e.length*0.3,e.entry+0.5)
		var b: Vector2 = e.b+offset-e.dir*minf(e.length*0.3,e.length-e.exit+0.5)
		if a.distance_squared_to(b) < 8.0*8.0:
			continue
		walkers.append({"person":_spawn(a,b,randf())})
		return


func _near_crossing(center: Vector2, observer: Vector2) -> Dictionary:
	var key := Vector2i((center/80.0).floor())
	for z: Dictionary in signals.zebra_cells.get(key,[]):
		if center.distance_squared_to(z.p) > 45.0*45.0 or observer.distance_squared_to(z.p) < 28.0*28.0:
			continue
		var used := false
		for w in walkers:
			if w.get("zebra",{}).get("p",Vector2.INF) == z.p:
				used = true
				break
		if not used:
			return z
	return {}


func _cross_step(item: Dictionary, person: Node3D, p: Vector2, delta: float) -> void:
	var z: Dictionary = item.zebra
	if item.status == 0:
		item.delay -= delta
		if item.delay <= 0.0 and (z.phase < 0 or signals.light(z.phase) == 2):
			var other: Vector2 = z.p-item.side*(float(z.width)*0.5+1.0)
			_walk(person,p,other,randf_range(1.1,1.55))
			item.status = 1
	elif item.status == 1:
		var side: Vector2 = item.side
		z.occupied = absf((p-Vector2(z.p)).dot(side)) <= z.width*0.5+0.5
		if person.reverse or p.distance_squared_to(person.to) < 0.18:
			z.occupied = false
			var onward: Vector2 = person.to+z.dir*randf_range(10.0,22.0)
			_walk(person,p,onward,person.pace)
			item.erase("zebra")


func board(shelter: Dictionary, vehicle: CharacterBody3D) -> void:
	if not create_person.is_valid() or not shelter.seen:
		return
	var direction := Vector2(-vehicle.basis.z.x,-vehicle.basis.z.z)
	var right := Vector2(-direction.y,direction.x)
	var door := Vector2(vehicle.position.x,vehicle.position.z)+right*1.45
	var draw := randf()
	var exiting := 0 if draw < 0.25 else (1 if draw < 0.60 else (2 if draw < 0.85 else 3))
	for i in exiting:
		var a := door+direction*(i-1)*0.65
		var b: Vector2 = shelter.at+direction*randf_range(-7.0,7.0)
		var person := _spawn(a,b,0.0)
		passengers.append({"person":person,"goal":b,"boards":false,"ttl":14.0})
	for person: Node3D in shelter.people:
		if _clear_to_use(person):
			var a := Vector2(person.position.x,person.position.z)
			_walk(person,a,door,1.3)
			passengers.append({"person":person,"goal":door,"boards":true,"ttl":13.0})
		else:
			walkers.append({"person":person})
	waiting -= shelter.people.size()
	shelter.people.clear()
	if randf() < 0.35:
		var start: Vector2 = shelter.at+direction*randf_range(10.0,20.0)
		var runner := _spawn(start,door,0.0)
		_walk(runner,start,door,4.3)
		passengers.append({"person":runner,"goal":door,"boards":randf()<0.55,"ttl":6.0})


func _passengers(delta: float, observer: Vector2) -> void:
	for i in range(passengers.size()-1,-1,-1):
		var item := passengers[i]
		var person: Node3D = item.person
		var p := Vector2(person.position.x,person.position.z)
		item.ttl -= delta
		if not _clear_to_use(person):
			walkers.append({"person":person})
			passengers.remove_at(i)
		elif p.distance_squared_to(observer) > 170.0*170.0:
			person.queue_free()
			passengers.remove_at(i)
		elif person.reverse or p.distance_squared_to(item.goal) < 0.6 or item.ttl < 0.0:
			if item.boards and p.distance_squared_to(item.goal) < 2.5:
				person.queue_free()
			else:
				# A late runner remains at the stop. A passenger walks on along the pavement.
				_walk(person,p,p+Vector2(1.0,0.0).rotated(person.rotation.y)*3.0,1.3)
				walkers.append({"person":person})
			passengers.remove_at(i)


func _fill_stop(shelter: Dictionary) -> void:
	var draw := randf()
	var total := 0 if draw < 0.2 else (1 if draw < 0.55 else (2 if draw < 0.85 else 3))
	for i in mini(total,6-waiting):
		var normal: Vector2 = shelter.normal
		var p: Vector2 = shelter.at+Vector2(-normal.y,normal.x)*randf_range(-2.4,2.4)
		var person := _spawn(p,p,0.0)
		person.rotation.y = atan2(-normal.x,-normal.y)+randf_range(-0.5,0.5)
		shelter.people.append(person)
		waiting += 1
