extends Node3D

const VEHICLE := preload("res://traffic_vehicle.gd")
const SEMERKA := preload("res://assets/semerka.glb")
const ROADS := preload("res://south_traffic_roads.gd")
const SIGNALS := preload("res://south_traffic_signals.gd")
const AMBULANCE := preload("res://south_ambulance.gd")
const PEOPLE := preload("res://south_street_people.gd")
const BY_HOUR := [8,6,5,4,4,6,10,18,28,26,22,21,22,22,21,21,23,27,28,27,20,16,13,10]

signal vehicle_struck(vehicle: CharacterBody3D, strength: float)
signal ordinary_vehicle_spawned(vehicle: CharacterBody3D)

var damage:=preload("res://south_traffic_damage.gd").new()
var terrain: RefCounted
var observer: Node3D
var off := StandardMaterial3D.new()
var on := StandardMaterial3D.new()
var roads := ROADS.new()
var signals := SIGNALS.new()
var people := PEOPLE.new()
var ambulance := AMBULANCE.new()
var moving: Array[CharacterBody3D] = []
var parked: Array[Dictionary] = []
var active_parking := {}
var population_timer := 0.0
var clock_hour := 12.0
var initial := true


func setup(ground: RefCounted, start: Vector2, region: Dictionary = {}, player: Node3D = null, factory := Callable()) -> void:
	terrain = ground
	add_child(damage)
	damage.setup(self)
	observer = player if player else get_parent().get_node_or_null("Car")
	if region.is_empty():
		region = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-region.json"))
	off.albedo_color = Color("#532b23")
	on.albedo_color = Color("#e64420")
	on.emission_enabled = true
	on.emission = Color("#ef2f19")
	on.emission_energy_multiplier = 1.55
	roads.setup(region.roads)
	add_child(signals)
	signals.setup(terrain,region.core_bounds)
	people.setup(factory,roads,signals,region)
	_parking_catalog(region,start)
	# Stream the models over subsequent physics ticks. The initial meshes are
	# already shared resources. Switches of district do not rebuild the graph.


func _parking_catalog(region: Dictionary, start: Vector2) -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-parking.json"))
	for p: Array in data.parked:
		var at := Vector2(p[0],p[1])
		if at.distance_squared_to(start) > 81.0:
			parked.append({"at":at,"yaw":float(p[2])})
	for lot: Dictionary in region.parking_lots:
		var center := Vector2(lot.at[0],lot.at[1])
		if people.core.has_point(center):
			continue
		var outline := PackedVector2Array()
		var longest := Vector2.ZERO
		for xy: Array in lot.outline:
			outline.append(Vector2(xy[0],xy[1]))
		for i in outline.size():
			var side := outline[i]-outline[i-1]
			if side.length_squared() > longest.length_squared():
				longest = side
		var aisle := longest.normalized()
		var front := Vector2(-aisle.y,aisle.x)
		var size_factor := clampi(floori(longest.length()/5.5),1,8)
		for slot in size_factor:
			var p := center+aisle*(float(slot)-float(size_factor-1)*0.5)*3.4
			if Geometry2D.is_point_in_polygon(p+front*2.6,outline) and Geometry2D.is_point_in_polygon(p-front*2.6,outline):
				parked.append({"at":p,"yaw":atan2(-front.x,-front.y)})


func _physics_process(delta: float) -> void:
	if not is_instance_valid(observer):
		return
	var at := Vector2(observer.position.x,observer.position.z)
	damage.step(delta)
	signals.tick(delta)
	people.tick(delta,at)
	ambulance.step(delta,self,at)
	population_timer -= delta
	if population_timer > 0.0:
		return
	var h := posmod(floori(clock_hour),24)
	var target := roundi(lerpf(BY_HOUR[h],BY_HOUR[(h+1)%24],fposmod(clock_hour,1.0)))
	population_timer = 0.3 if absi(moving.size()-target) > 6 else 1.2
	var evicted := false
	for i in range(moving.size()-1,-1,-1):
		var vehicle := moving[i]
		if vehicle.wreck:continue
		var p := Vector2(vehicle.position.x,vehicle.position.z)
		if p.distance_squared_to(at) > 520.0*520.0 or (moving.size() > target and not vehicle.incident and _out_of_view(vehicle.position,at)):
			moving.remove_at(i)
			vehicle.queue_free()
			evicted = true
			break
		if (vehicle.route_complete or vehicle.owner_lost) and not vehicle.going and _out_of_view(vehicle.position,at):
			moving.remove_at(i)
			vehicle.queue_free()
			evicted = true
			break
		if vehicle.shuttle and not vehicle.dwell_stop.is_finite():
			_next_stop(vehicle)
	if not evicted and moving.size() < target:
		_spawn_flow(at)
	_stream_parking(at)
	initial = initial and moving.size() < mini(8,target)


func report_incident(at: Vector2) -> void:
	ambulance.report(at)


func _out_of_view(p: Vector3, at: Vector2) -> bool:
	if at.distance_squared_to(Vector2(p.x,p.z)) < 230.0*230.0:
		return false
	var camera := get_viewport().get_camera_3d()
	return camera == null or not camera.is_position_in_frustum(p)


func _clear(p: Vector2, observer_at: Vector2, parking_yaw := INF) -> bool:
	if p.distance_squared_to(observer_at) < 81.0:
		return false
	for vehicle in moving:
		if p.distance_squared_to(Vector2(vehicle.position.x,vehicle.position.z)) < 14.0*14.0:
			return false
	for vehicle: CharacterBody3D in active_parking.values():
		var delta := p-Vector2(vehicle.position.x,vehicle.position.z)
		if is_finite(parking_yaw):
			if delta.length_squared() < 31.0 and _parking_overlaps(delta,parking_yaw,vehicle.rotation.y):
				return false
		elif delta.length_squared() < 3.5*3.5:
			return false
	return true


func _parking_overlaps(delta: Vector2, first_yaw: float, second_yaw: float) -> bool:
	# Steam parking rows use 2.7 m between cars side by side. Check the actual
	# oriented Seven footprints, including a handspan of clearance at each side.
	var first_side := Vector2(cos(first_yaw),-sin(first_yaw))
	var first_length := Vector2(-first_side.y,first_side.x)
	var second_side := Vector2(cos(second_yaw),-sin(second_yaw))
	var second_length := Vector2(-second_side.y,second_side.x)
	for axis: Vector2 in [first_side,first_length,second_side,second_length]:
		var side_width := 1.08*(absf(axis.dot(first_side))+absf(axis.dot(second_side)))
		var car_length := 2.55*(absf(axis.dot(first_length))+absf(axis.dot(second_length)))
		if absf(delta.dot(axis)) >= side_width+car_length:
			return false
	return true


func _spawn_flow(at: Vector2) -> void:
	var options := roads.around(at,380.0)
	if options.is_empty():
		return
	for k in 48:
		var e: RefCounted = options.pick_random()
		if e.blocked or e.exit-e.entry < 9.0:
			continue
		var distance := randf_range(e.entry,e.exit-4.0)
		var p: Vector2 = e.lane(distance)
		var d := p.distance_to(at)
		if d < (48.0 if initial else 140.0) or d > 380.0 or not _clear(p,at):
			continue
		var world := Vector3(p.x,terrain.at(p.x,p.y),p.y)
		var camera := get_viewport().get_camera_3d()
		if not initial and d < 230.0 and camera != null and camera.is_position_in_frustum(world):
			continue
		var vehicle := _instance(p,0.0)
		var night := clock_hour < 6.0
		var taxi := randf() < (0.5 if night else 0.2)
		var cruise := randf_range(12.0,17.0) if taxi else randf_range(9.0,14.0)
		vehicle.start_flow(roads,e,signals,distance,off,on,cruise*(1.3 if night else 1.0))
		vehicle.player_impact.connect(vehicle_struck.emit)
		moving.append(vehicle)
		var has_shuttle := false
		for v in moving:
			if v.shuttle:
				has_shuttle = true
				break
		if not has_shuttle and not people.shelters.is_empty() and _next_stop(vehicle):
			vehicle.shuttle = true
			vehicle.cruise = randf_range(8.5,11.0)
			vehicle.at_stop.connect(_serve_stop)
		vehicle.traffic_body = not vehicle.shuttle
		vehicle.ordinary = not taxi and not vehicle.shuttle
		if vehicle.ordinary:
			ordinary_vehicle_spawned.emit(vehicle)
		return


func _next_stop(vehicle: CharacterBody3D) -> bool:
	var at := Vector2(vehicle.position.x,vehicle.position.z)
	var nearest: Array[Dictionary] = []
	for stop in people.shelters:
		var d := at.distance_squared_to(stop.road)
		if d > 60.0*60.0 and d < 1600.0*1600.0 and stop.road != vehicle.last_stop:
			nearest.append({"distance":d,"stop":stop})
	nearest.sort_custom(func(a,b):return a.distance<b.distance)
	for candidate in nearest:
		var target: Dictionary = candidate.stop
		var edge: RefCounted = _edge_for_stop(target)
		if edge == null or not vehicle.aim_for(edge,target.road):
			continue
		vehicle.last_stop = target.road
		return true
	return false


func _edge_for_stop(stop: Dictionary) -> RefCounted:
	var best: RefCounted
	var nearest := 10.0*10.0
	for e in roads.around(stop.road,22.0):
		var wanted_side: Vector2 = stop.at-stop.road
		if wanted_side.dot(e.right) < 0.0:
			continue
		var p := Geometry2D.get_closest_point_to_segment(stop.road,e.a,e.b)
		var d := p.distance_squared_to(stop.road)
		if d < nearest:
			best = e
			nearest = d
	return best


func _serve_stop(vehicle: CharacterBody3D) -> void:
	for stop in people.shelters:
		if stop.road == vehicle.last_stop:
			people.board(stop,vehicle)
			return


func _stream_parking(at: Vector2) -> void:
	var spawned := false
	for i in parked.size():
		var spec := parked[i]
		var d := at.distance_squared_to(spec.at)
		if damage.hidden_parking.has(i):
			if d>310.0*310.0:damage.hidden_parking.erase(i)
			continue
		if active_parking.has(i):
			var vehicle: CharacterBody3D = active_parking[i]
			if d > 310.0*310.0 and not vehicle.wreck:
				vehicle.queue_free()
				active_parking.erase(i)
		elif not spawned and d < 210.0*210.0 and _clear(spec.at,at,spec.yaw):
			active_parking[i] = _instance(spec.at,spec.yaw)
			active_parking[i].traffic_body=true
			spawned = true


func _instance(at: Vector2, yaw: float) -> CharacterBody3D:
	var vehicle := VEHICLE.new()
	add_child(vehicle)
	vehicle.setup(terrain,SEMERKA,at,yaw)
	return vehicle


func set_road_closed(a: Vector2,b: Vector2,closed: bool) -> void:
	var site := roads.lookup(a,b)
	if site==null or site.blocked==closed:
		return
	roads.set_closed(a,b,closed)
	if closed:
		signals.changed_route.emit(a,b)
