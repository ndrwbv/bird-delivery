extends Node3D

# Steam career.js, crewcast.js, crewrank.js and game.js::updateRivals.
const DRIVER := preload("res://south_crew_vehicle.gd")
const COLORS := ["#344557","#bc684f","#77a38e","#7a728f","#b7a073","#546d78","#8b7764"]
const SPEED := [29.0,27.0,23.0,28.0]
const TIP := [1.0,1.0,1.25,1.1]
const LOAD_TIMES := [Vector2(8,12),Vector2(3,6),Vector2(20,28),Vector2(14,20)]
const DOOR_TIMES := [Vector2(5,8),Vector2(3,5),Vector2(10,14),Vector2(8,12)]
const GROWTH := preload("res://restaurant_growth.gd")
const ROSTER_START := [12000,5600,17600,2400,8400,3920,12320]
var traffic: Node
var depot := Vector2.ZERO
var roster: Array[Dictionary] = []
var working: Array[Dictionary] = []
var goals: Array[RefCounted] = []
var rng := RandomNumberGenerator.new()
var roof: Node3D
var growth := 0
var current_shift := 0
var changed := 0
var active := false
var sheet := preload("res://crew_rank_sheet.gd").new()

func setup(vehicles: Node, base: Vector2) -> void:
	add_child(sheet)
	traffic = vehicles
	depot = base
	var sample := traffic.SEMERKA.instantiate() as Node3D
	roof = sample.get_node_or_null("PizzaRoofLight")
	if roof:
		roof.owner = null
		sample.remove_child(roof)
		roof.hide()
		add_child(roof)
	sample.free()
	for e: RefCounted in traffic.roads.around(depot,650.0):
		var at: Vector2 = e.lane((e.entry+e.exit)*0.5)
		var radius := depot.distance_to(at)
		if e.rank <= 4 and e.exit-e.entry > 12.0 and radius >= 140.0 and radius <= 650.0:
			goals.append(e)
	for i in COLORS.size():
		var name_ := tr("Курьер")+" "+str(i+1)
		var female := i%3==1
		var id := "south-courier-%d" % (i+1)
		var face: int = [1,3][i%2] if female else [0,2,4][i%3]
		roster.append({"id":id,"name":name_,"label":name_,"first":name_,"female":female,
			"avatar":"face","model":face,"shirt":id.hash()%18,"hex":COLORS[i],"pace":i%4})

static func count_for(number: int, level: int) -> int:
	var count := 1
	for at in [2,5,8,11,14]:
		if number-1 >= at:
			count += 1
	return mini(6,maxi(count,int(GROWTH.COURIERS[clampi(level-1,0,4)])))

func begin(profile: Dictionary, number: int, level: int) -> void:
	clear()
	current_shift = number
	growth = clampi(level-1,0,GROWTH.PAY.size()-1)
	rng.seed = ("%d/crew/%d" % [int(profile.get("seed",1)),number]).hash()
	var previous: Array = profile.get("crew_last",[])
	var chosen: Array = []
	if int(profile.get("crew_shift",0)) == number:
		chosen = previous.duplicate()
	else:
		var pool := roster.duplicate()
		for _i in count_for(number,level):
			var total := 0.0
			for member: Dictionary in pool:
				total += 1.0 if previous.has(member.id) else 2.5
			var draw := rng.randf()*total
			for j in pool.size():
				var member: Dictionary = pool[j]
				draw -= 1.0 if previous.has(member.id) else 2.5
				if draw<=0.0 or j==pool.size()-1:
					chosen.append(member.id)
					pool.remove_at(j)
					break
		profile.crew_shift = number
		profile.crew_last = chosen.duplicate()
	for id in chosen:
		for member in roster:
			if id != member.id:
				continue
			var i := working.size()
			var slot := _parking(i)
			if slot.is_empty():
				continue
			working.append({"person":member,"slot":i,"vehicle":null,"home":slot.at,"home_edge":slot.edge,
				"leg":"load","wait":6.0+i*3.5,"done":0,"money":0,"fee":0,"recovery":0.0,"goal":{},"lost":false})
			break
	active = not working.is_empty()
	changed += 1

func _parking(i: int) -> Dictionary:
	var edge := _near_road(depot)
	if edge==null:
		return {}
	var s := clampf((depot-edge.a).dot(edge.dir)-6.5*(i+1),edge.entry,edge.exit)
	var at: Vector2 = edge.lane(s)+edge.right*(2.5+3.0*(i/3))
	# Keep the fleet spaced if the nearest segment is too short for six cars.
	at += edge.dir*float(i%3)*5.5 if edge.exit-edge.entry < 40.0 else Vector2.ZERO
	return {"edge":edge,"at":at}

func _near_road(at: Vector2) -> RefCounted:
	var edge: RefCounted
	var closest := INF
	for e: RefCounted in traffic.roads.around(at,90.0):
		var lane: Vector2 = e.lane(clampf((at-e.a).dot(e.dir),e.entry,e.exit))
		var d := lane.distance_squared_to(at)
		if d < closest:
			edge = e
			closest = d
	return edge

func step(delta: float, calm_first: bool, player_target: Vector2 = Vector2.INF) -> void:
	if not active:
		return
	var used_route := false
	for r in working:
		var vehicle: CharacterBody3D = r.vehicle
		if vehicle == null:
			if used_route:
				continue
			vehicle = DRIVER.new()
			add_child(vehicle)
			var edge: RefCounted = r.home_edge
			vehicle.park(r.home,atan2(-edge.dir.x,-edge.dir.y),traffic,Color(r.person.hex),roof)
			if roof:
				vehicle.visual.get_node("PizzaRoofLight").show()
			vehicle.at_stop.connect(_stopped.bind(r))
			r.vehicle = vehicle
			used_route = true
		if r.leg in ["go","back"]:
			if not vehicle.going and vehicle.active_leg:
				r.recovery += delta
				if r.recovery >= 8.0 and not used_route:
					var goal: Dictionary = r.goal if r.leg=="go" else {"edge":r.home_edge,"at":r.home}
					var start := _near_road(Vector2(vehicle.position.x,vehicle.position.z))
					vehicle.go(start,goal.edge,goal.at,traffic,SPEED[int(r.person.pace)])
					r.recovery = 0.0
					used_route = true
			continue
		if calm_first and r.leg=="load":
			r.wait = maxf(1.0,float(r.wait))
			continue
		r.wait = maxf(0.0,float(r.wait)-delta)
		if r.wait > 0 or used_route:
			continue
		var next: Dictionary
		if r.leg == "door":
			if not r.lost:
				r.money += roundi(float(r.fee)*float(TIP[int(r.person.pace)]))
				r.done += 1
				changed += 1
			r.lost = true
			next = {"at":r.home,"edge":r.home_edge}
		else:
			next = _next_goal(player_target)
		if next.is_empty():
			r.wait = 3.0
			continue
		var start: RefCounted = vehicle.last_edge if vehicle.last_edge else r.home_edge
		var meters: float = vehicle.go(start,next.edge,next.at,traffic,float(SPEED[int(r.person.pace)]))
		used_route = true
		if meters<=0:
			r.wait = 3.0
			continue
		if r.leg == "load":
			r.goal = next
			r.lost = false
			var base_fee := roundi((640+1.12*meters)/10.0)*10
			r.fee = roundi(base_fee*2.0*float(GROWTH.PAY[growth])/10.0)*10
			r.leg = "go"
		else:
			r.leg = "back"

func _next_goal(player_target: Vector2) -> Dictionary:
	if goals.is_empty():
		return {}
	var observer := Vector2(traffic.observer.position.x,traffic.observer.position.z)
	for _trial in 60:
		var e: RefCounted = goals[rng.randi_range(0,goals.size()-1)]
		var at: Vector2 = e.lane(lerpf(e.entry,e.exit,rng.randf_range(0.2,0.8)))
		if at.distance_squared_to(observer)<8100 or (player_target.is_finite() and at.distance_squared_to(player_target)<1600):
			continue
		return {"at":at,"edge":e}
	return {}

func _stopped(_vehicle: Node, r: Dictionary) -> void:
	var next := "door" if r.leg=="go" else "load"
	var span: Vector2 = (DOOR_TIMES if next=="door" else LOAD_TIMES)[int(r.slot)%4]
	r.wait = rng.randf_range(span.x,span.y)
	r.leg = next

func rows(delivered: int, money: int) -> Array:
	var result := []
	for r in working:
		result.append({"name":r.person.name,"hex":r.person.hex,"money":r.money,"deliveries":r.done,"person":r.person,"me":false})
	result.append({"name":tr("Женя"),"money":money,"deliveries":delivered,"me":true})
	result.sort_custom(func(a,b):
		if a.deliveries!=b.deliveries: return a.deliveries>b.deliveries
		if a.money!=b.money: return a.money>b.money
		return a.me and not b.me)
	return result

func career_rows(profile: Dictionary) -> Array:
	var totals: Dictionary = profile.get("crew_totals",{})
	var result := []
	for i in roster.size():
		var r := roster[i]
		result.append({"name":r.name,"money":int(totals.get(r.id,ROSTER_START[i])),"person":r,"me":false})
	result.append({"name":tr("Женя"),"money":int(profile.get("crew_earned",0)),"me":true})
	result.sort_custom(func(a,b): return a.money>b.money if a.money!=b.money else a.me and not b.me)
	return result

func finish(profile: Dictionary, full: bool, delivered: int, earned: int) -> Dictionary:
	if int(profile.get("crew_closed",0))==current_shift:
		return profile.get("crew_result",{}).duplicate(true)
	var ranking := rows(delivered,earned)
	var rank := ranking.find_custom(func(r): return r.me)+1
	var win := 1000+500*working.size() if not working.is_empty() and full and delivered>0 and rank==1 else 0
	var totals: Dictionary = profile.get("crew_totals",{})
	var own := int(profile.get("crew_earned",0))+maxi(0,earned)
	var shifts := int(profile.get("crew_count",0))+1
	var average := maxf(7200.0,float(own)/shifts)
	for i in roster.size():
		var got := 0
		for rider in working:
			if rider.person.id==roster[i].id:
				got = int(rider.money)
				break
		if not full or got<=0:
			got = maxi(got,roundi(average*rng.randf_range(0.6,1.3)/10.0)*10)
		totals[roster[i].id] = int(totals.get(roster[i].id,ROSTER_START[i]))+got
	profile.crew_totals = totals
	profile.crew_earned = own
	profile.crew_count = shifts
	var career := career_rows(profile)
	var place := career.find_custom(func(r): return r.me)+1
	var result := {"rank":rank,"win":win,"rows":ranking,"career_rank":place}
	profile.crew_closed = current_shift
	profile.crew_result = result.duplicate(true)
	return result

func clear() -> void:
	if sheet.is_inside_tree():
		sheet.clear()
	for r in working:
		if is_instance_valid(r.vehicle):
			r.vehicle.queue_free()
	working.clear()
	active = false
