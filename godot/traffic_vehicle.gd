extends CharacterBody3D

const ROAD_LAYER := 32
const OBSTACLES := 1 | 2 | 4 | 8 | 16 | ROAD_LAYER

var roads: RefCounted
var signals: Node3D
var edge: RefCounted
var cruise := 12.0
var shuttle := false
var last_stop := Vector2.INF
var service_edge: RefCounted
var line_goal := Vector2.INF
var dwelling := 0.0
var dwell_stop := Vector2.INF
var stop_served := false
var planned_nodes := PackedInt64Array()
var planned_at := 0
var scan_in := 0.0
var scanned_gap := 0.0
var route_complete := false
signal at_stop(vehicle: CharacterBody3D)
signal player_impact(vehicle: CharacterBody3D, strength: float)
var incident := false
var owner_lost := false
var terrain: RefCounted
var route := PackedVector3Array()
var limits := PackedFloat32Array()
var point := 0
var fraction := 0.0
var pace := 0.0
var coast := Vector3.ZERO
var going := false
var brake := false
const NOSE := 2.49
var visual: Node3D
var lamps: MeshInstance3D
var lamp_off: Material
var lamp_on: Material
var ray := PhysicsRayQueryParameters3D.new()


func setup(ground: RefCounted, model: PackedScene, at: Vector2, yaw: float) -> void:
	terrain = ground
	position = _surface(at)
	rotation.y = yaw
	collision_layer = ROAD_LAYER
	collision_mask = OBSTACLES
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	ray.collision_mask = OBSTACLES
	ray.exclude = [get_rid()]
	var box := BoxShape3D.new()
	box.size = Vector3(2.02,1.46,NOSE*2.0)
	var hull := CollisionShape3D.new()
	hull.shape = box
	hull.position.y = 0.88
	add_child(hull)
	visual = model.instantiate() as Node3D
	visual.get_node("PizzaRoofLight").free()
	for part: MeshInstance3D in visual.find_children("*", "MeshInstance3D", true, false):
		part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		part.visibility_range_end = 95.0 if part.name == &"Car_Interior_0" else 250.0
		part.visibility_range_end_margin = 8.0
	add_child(visual)
	set_physics_process(false)


func start_flow(graph: RefCounted, first: RefCounted, lights: Node3D, s: float, unlit: Material, lit: Material, desired: float) -> void:
	roads = graph
	edge = first
	signals = lights
	if not signals.changed_route.is_connected(_road_changed):
		signals.changed_route.connect(_road_changed)
	cruise = desired
	route_complete = false
	stop_served = false
	coast = Vector3.ZERO
	dwelling = 0.0
	route.clear()
	planned_nodes.clear()
	limits.clear()
	var p: Vector2 = first.lane(s)
	var end: Vector2 = first.lane(first.exit)
	follow([[p.x,p.y,cruise],[end.x,end.y,cruise]],0,unlit,lit)
	_extend_flow()
	show()


func aim_for(goal_edge: RefCounted, stop_at: Vector2) -> bool:
	if roads == null or edge == null:
		return false
	var connection: PackedInt64Array = roads.navigation.get_id_path(roads.node_ids[edge.b],roads.node_ids[goal_edge.a])
	if connection.is_empty():
		return false
	planned_nodes = connection
	planned_at = 0
	service_edge = goal_edge
	line_goal = goal_edge.a
	var t := clampf((stop_at-Vector2(goal_edge.a)).dot(goal_edge.dir),goal_edge.entry,goal_edge.exit)
	dwell_stop = goal_edge.lane(t)
	stop_served = false
	return true


func _extend_flow() -> void:
	if route_complete:
		return
	# Keep a short local look-ahead. Trim consumed samples before appending.
	if point > 0:
		route = route.slice(point)
		limits = limits.slice(point)
		point = 0
	for i in 6:
		var next: RefCounted
		if service_edge != null and edge.b == service_edge.a:
			next = service_edge
			service_edge = null
			line_goal = Vector2.INF
		elif planned_at+1 < planned_nodes.size():
			planned_at += 1
			var to: Vector2 = roads.navigation.get_point_position(planned_nodes[planned_at])
			for candidate: RefCounted in roads.exits.get(edge.b,[]):
				if candidate.b == to and not candidate.blocked:
					next = candidate
					break
			if next == null:
				planned_nodes.clear()
		if next == null:
			next = roads.choose_after(edge)
		if next == null:
			route_complete = true
			return
		for p: Vector2 in roads.path_after(edge,next):
			var world := _surface(p)
			if world.distance_squared_to(route[-1]) > 0.0001:
				route.append(world)
				limits.append(cruise)
		edge = next
		if route.size() > 8:
			return


func follow(path: Array, start: int, unlit: Material, lit: Material) -> void:
	for p: Array in path:
		route.append(_surface(Vector2(p[0],p[1])))
		limits.append(float(p[2]))
	point = start
	position = route[point]
	var forward := route[(point+1)%route.size()]-position
	rotation.y = atan2(-forward.x,-forward.z)
	pace = 5.0
	going = true
	lamp_off = unlit
	lamp_on = lit
	if not is_instance_valid(lamps):
		_make_lamps()
	lamps.material_override = lamp_off
	set_physics_process(true)
	reset_physics_interpolation()


func _make_lamps() -> void:
	lamps = MeshInstance3D.new()
	var pair := BoxMesh.new()
	pair.size = Vector3(1.4,0.074,0.034)
	lamps.mesh = pair
	lamps.material_override = lamp_off
	lamps.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lamps.position = Vector3(0.0,0.72,NOSE+0.02)
	add_child(lamps)


func struck(strength: float, shot: Vector3) -> void:
	if strength < 2.7:
		return
	going = false
	coast += shot.normalized()*clampf(strength*0.26,1.0,9.0)
	visual.rotation.z = clampf(shot.normalized().dot(basis.x)*strength*0.004,-0.12,0.12)
	visual.position.y = maxf(-0.10,visual.position.y-minf(0.085,strength*0.003))
	if lamps:
		lamps.material_override = lamp_on
	set_physics_process(true)
	player_impact.emit(self,strength)


func _physics_process(delta: float) -> void:
	if not going:
		if coast.length_squared() < 0.015:
			set_physics_process(false)
			return
		var hit := move_and_collide(coast*delta)
		if hit:
			var normal := hit.get_normal()
			coast = coast.slide(normal)
			coast.y = 0.0
		position.y = terrain.at(position.x,position.z)+0.04
		coast *= exp(-4.8*delta)
		return

	if roads != null and route.size()-point <= 5:
		_extend_flow()
	var want := _speed_ahead()
	if signals != null:
		var here := Vector2(position.x,position.z)
		var nose := Vector2(-basis.z.x,-basis.z.z)
		want *= float(signals.road_speed(here,nose,pace))
		if dwell_stop.is_finite():
			var distance := here.distance_to(dwell_stop)
			if distance < 14.0 and dwelling <= 0.0:
				want = minf(want,maxf(0.5,(distance-1.0)*0.8))
			if distance < 2.8 and not stop_served:
				dwelling = randf_range(4.0,8.0)+1.4
				stop_served = true
				at_stop.emit(self)
	if dwelling > 0.0:
		dwelling = maxf(0.0,dwelling-delta)
		want = 0.0
		if dwelling <= 0.0:
			dwell_stop = Vector2.INF
			line_goal = Vector2.INF
			stop_served = false
	var look := maxf(5.0,3.5+pace*0.73)
	scan_in -= delta
	if scan_in <= 0.0:
		scan_in = 0.1
		scanned_gap = _gap(look)
	else:
		scanned_gap = maxf(0.0,scanned_gap-pace*delta)
	var gap := scanned_gap
	want = minf(want,sqrt(maxf(0.0,gap-1.95)*7.0))
	var slowing := want < pace-0.1
	pace = move_toward(pace,want,(5.8 if slowing else 2.6)*delta)
	var show_brake := slowing or gap < 3.0
	if show_brake != brake:
		brake = show_brake
		lamps.material_override = lamp_on if brake else lamp_off
	_follow_step(pace*delta,delta)


func _follow_step(meters: float, delta: float) -> void:
	var old := point
	var old_fraction := fraction
	var left := meters
	var next := (point+1)%route.size()
	if roads != null and next == 0:
		going = false
		return
	while left > 0.0001:
		var distance := maxf(0.005,route[point].distance_to(route[next]))
		var remaining := distance*(1.0-fraction)
		if left < remaining:
			fraction += left/distance
			break
		left -= remaining
		fraction = 0.0
		point = next
		next = (point+1)%route.size()
		if roads != null and next == 0:
			going = false
			pace = 0.0
			return
	var target := route[point].lerp(route[next],fraction)
	var forward := route[next]-route[point]
	var wanted := atan2(-forward.x,-forward.z)
	rotation.y = rotate_toward(rotation.y,wanted,delta*1.75)
	if signals!=null and signals.lane_shift.is_valid():
		var offset: Vector2 = signals.lane_shift.call(Vector2(target.x,target.z),Vector2(forward.x,forward.z).normalized())
		target.x += offset.x
		target.z += offset.y
	if roads != null:
		target.y = terrain.at(target.x,target.z,position.y)+0.04
	var move := target-position
	var hit := move_and_collide(move)
	if hit:
		point = old
		fraction = old_fraction
		pace = 0.0


func _speed_ahead() -> float:
	var want := limits[point]
	var distance := 0.0
	var i := point
	for n in 12:
		var next := (i+1)%route.size()
		if roads != null and next == 0:
			break
		distance += route[i].distance_to(route[next])
		want = minf(want,sqrt(pow(limits[next],2.0)+6.0*distance))
		if distance > 22.0:
			break
		i = next
	return want


func _gap(distance: float) -> float:
	var forward := -basis.z
	var nearest := distance+7.0
	for lane in [-0.67,0.0,0.67]:
		ray.from = global_position+Vector3.UP*0.66+basis.x*float(lane)+forward*(NOSE-0.20)
		ray.to = ray.from+forward*distance
		var contact := get_world_3d().direct_space_state.intersect_ray(ray)
		if not contact.is_empty():
			var at: Vector3 = contact.position
			nearest = minf(nearest,ray.from.distance_to(at))
	return nearest


func _surface(at: Vector2) -> Vector3:
	return Vector3(at.x,terrain.at(at.x,at.y)+0.04,at.y)


func _road_changed(a: Vector2,b: Vector2) -> void:
	if not going or roads==null:
		return
	var here := Vector2(position.x,position.z)
	var mid := (a+b)*0.5
	if here.distance_squared_to(mid)>180.0*180.0:
		return
	var soon := false
	for i in range(point,route.size()-1):
		var p := Vector2(route[i].x,route[i].z)
		var q := Vector2(route[i+1].x,route[i+1].z)
		if p.distance_squared_to(q)>0.01 and Geometry2D.get_closest_point_to_segment(mid,p,q).distance_to(mid)<12.0:
			soon = true
			break
	if not soon:
		return
	var start: RefCounted = roads.nearest(here,Vector2(-basis.z.x,-basis.z.z))
	if start==null:
		return
	var lane_end: Vector2 = start.lane(start.exit)
	if lane_end.distance_squared_to(here)<1.0:
		return
	edge = start
	route_complete = false
	route = PackedVector3Array([position,_surface(lane_end)])
	limits = PackedFloat32Array([cruise,cruise])
	point = 0
	fraction = 0.0
	planned_nodes.clear()
	if service_edge!=null and dwell_stop.is_finite():
		aim_for(service_edge,dwell_stop)
	_extend_flow()

# Return from the current physical position after being pushed off the route.
func resume_flow(goal: RefCounted = null) -> bool:
	if roads==null or owner_lost:
		return false
	var here := Vector2(position.x,position.z)
	var start: RefCounted = roads.nearest(here,Vector2(-basis.z.x,-basis.z.z))
	if start==null:
		route_complete = true
		return false
	var along := clampf((here-Vector2(start.a)).dot(start.dir)+3.0,start.entry,start.exit)
	var end: Vector2 = start.lane(start.exit)
	var merge: Vector2 = start.lane(along)
	route = PackedVector3Array([position])
	limits = PackedFloat32Array([cruise])
	for p: Vector2 in [merge,end]:
		var world := _surface(p)
		if world.distance_squared_to(route[-1])>.01:
			route.append(world)
			limits.append(cruise)
	edge = start
	point = 0
	fraction = 0
	dwelling = 0
	dwell_stop = Vector2.INF
	planned_nodes.clear()
	planned_at = 0
	service_edge = null
	stop_served = false
	route_complete = false
	coast = Vector3.ZERO
	if goal!=null and start!=goal:
		planned_nodes = roads.navigation.get_id_path(roads.node_ids[start.b],roads.node_ids[goal.a])
		if not planned_nodes.is_empty():
			service_edge = goal
	_extend_flow()
	going = route.size()>1
	if going:
		scan_in = 0.0
		set_physics_process(true)
	return going
