extends "res://traffic_vehicle.gd"

# A courier follows a finite sequence of the traffic graph's own lanes and junction curves.
# The population vehicles share the physics, obstacle sensing and signals used here.
var last_edge: RefCounted
var active_leg := false

func park(at: Vector2, yaw: float, traffic: Node, shade: Color, roof: Node3D) -> void:
	setup(traffic.terrain,traffic.SEMERKA,at,yaw)
	signals = traffic.signals
	if roof:
		visual.add_child(roof.duplicate())
	var body := visual.get_node_or_null("Car_CarBody_0") as MeshInstance3D
	if body:
		var paint := body.get_active_material(0).duplicate() as StandardMaterial3D
		paint.albedo_color = shade
		body.material_override = paint
	at_stop.connect(_stop_at_door)

func go(edge_from: RefCounted, edge_to: RefCounted, end_at: Vector2, traffic: Node, speed: float) -> float:
	if not edge_from or not edge_to:
		return 0.0
	var graph: RefCounted = traffic.roads
	var start := Vector2(position.x,position.z)
	var start_s := clampf((start-edge_from.a).dot(edge_from.dir),edge_from.entry,edge_from.exit)
	var end_s := clampf((end_at-edge_to.a).dot(edge_to.dir),edge_to.entry,edge_to.exit)
	var samples: Array[Vector2] = [start,edge_from.lane(start_s)]
	if edge_from != edge_to or end_s < start_s:
		var ids: PackedInt64Array = graph.navigation.get_id_path(graph.node_ids[edge_from.b],graph.node_ids[edge_to.a])
		if ids.is_empty():
			return 0.0
		var chain: Array[RefCounted] = []
		for i in range(1,ids.size()):
			var a: Vector2 = graph.navigation.get_point_position(ids[i-1])
			var b: Vector2 = graph.navigation.get_point_position(ids[i])
			for candidate: RefCounted in graph.exits[a]:
				if candidate.b == b:
					chain.append(candidate)
					break
		chain.append(edge_to)
		samples.append(edge_from.lane(edge_from.exit))
		var previous := edge_from
		for edge_: RefCounted in chain:
			var bend: PackedVector2Array = graph.path_after(previous,edge_)
			for point_: Vector2 in bend:
				samples.append(point_)
			previous = edge_
		samples.pop_back()
	samples.append(edge_to.lane(end_s))
	var path := []
	var meters := 0.0
	var previous_point := Vector2.INF
	for p in samples:
		if previous_point.is_finite():
			var d := previous_point.distance_to(p)
			if d < 0.1:
				continue
			meters += d
		path.append([p.x,p.y,speed])
		previous_point = p
	if path.size() < 2:
		return 0.0
	last_edge = edge_to
	route.clear()
	limits.clear()
	fraction = 0.0
	scan_in = 0
	scanned_gap = 0
	dwelling = 0.0
	stop_served = false
	dwell_stop = previous_point
	active_leg = true
	follow(path,0,traffic.off,traffic.on)
	return meters

func _stop_at_door(_vehicle: CharacterBody3D) -> void:
	active_leg = false
	going = false
	pace = 0.0
	dwelling = 0.0
	dwell_stop = Vector2.INF
	lamps.material_override = lamp_on

func struck(strength: float, shot: Vector3) -> void:
	super.struck(strength,shot)
