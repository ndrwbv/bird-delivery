extends SceneTree

## Bake drivable doorstep approaches against the same road graph and geometry as the Mac scene.
const GRID := 24.0
var obstacles := {}
var graph := preload("res://south_region_routes.gd").new()
var ground := preload("res://south_region_ground.gd").new()
var water_y := 0.0

func _initialize() -> void:
	var region: Dictionary = _json("south-region")
	var core: Dictionary = _json("south")
	core.deliveries.append(_json("south-warmup"))
	graph.setup(region,core)
	var detail := preload("res://terrain_height.gd").new()
	detail.setup(_json("south-ground"),FileAccess.get_file_as_bytes("res://assets/south-ground.bin"))
	ground.setup(region,core.bounds,detail,true,false)
	water_y = region.water_y
	for obstacle: Dictionary in _json("south-obstacles"):
		_add_obstacle(_v(obstacle.at),obstacle.w,obstacle.d,obstacle.angle)
	for slot: Array in _json("south-parking").parked:
		_add_obstacle(Vector2(slot[0],slot[1]),1.05,2.4,-float(slot[2]))
	var houses := {}
	for building: Dictionary in region.buildings:
		houses[int(building.id)] = building
	var yards := {}
	for place: Dictionary in graph.destinations:
		if place.kind != "address" or int(place.building_id) == 119208348:
			continue
		var building: Dictionary = houses[int(place.building_id)]
		if building.kind not in ["res","priv"]:
			continue
		var best := _choose(building)
		if not best.is_empty():
			yards[str(int(building.id))] = best
	var file := FileAccess.open("res://assets/south-yards.json",FileAccess.WRITE)
	if file == null:
		push_error("Cannot write south-yards.json")
		quit(1)
		return
	file.store_string(JSON.stringify(yards,"",true,true)+"\n")
	var workshop := _workshop(_v(region.garage))
	if workshop.is_empty():
		push_error("No accessible workshop near the original site")
		quit(1)
		return
	var workshop_file := FileAccess.open("res://assets/south-workshop.json",FileAccess.WRITE)
	if workshop_file == null:
		quit(1)
		return
	workshop_file.store_string(JSON.stringify(workshop)+"
")
	print("Prepared ",yards.size()," curb and courtyard stops and the workshop")
	quit()

func _workshop(here: Vector2) -> Dictionary:
	for ring in range(0,123,3):
		var rays := maxi(1,roundi(TAU*ring/4.0))
		for ray in rays:
			var center := here+Vector2.from_angle(TAU*ray/rays)*ring
			var snap: Dictionary = graph._nearest(center)
			var lane: Vector2 = snap.at
			var distance := center.distance_to(lane)
			if distance < 14 or distance > 39:
				continue
			var front := center.direction_to(lane)
			var gate := center+front*4.2
			var parking := gate+front*3.5
			if not _drive_clear(lane,parking,-front) or not _bay_clear(gate,front):
				continue
			return {"at":[gate.x,gate.y],"front":[front.x,front.y],"park":[parking.x,parking.y],"driveway":[lane.x,lane.y]}
	return {}


func _bay_clear(gate: Vector2, front: Vector2) -> bool:
	var side := front.orthogonal()
	var feet := ground.land_height(gate.x,gate.y)
	for depth in range(-9,6):
		var mid := gate+front*depth
		if not graph.walk_clear(mid-side*3.5,mid+side*3.5):
			return false
		for lateral in range(-3,4):
			var point := mid+side*lateral
			if ground.material_at(point.x,point.y) == preload("res://south_region_ground.gd").PAVEMENT:
				return false
			if absf(ground.land_height(point.x,point.y)-feet) > .65:
				return false
			for box: Dictionary in obstacles.get(_cell(point),[]):
				var local: Vector2 = (point-box.at).rotated(-float(box.angle)).abs()
				if local.x < box.half.x+.45 and local.y < box.half.y+.45:
					return false
	return true


func _choose(building: Dictionary) -> Dictionary:
	var best_score := INF
	var best := {}
	var doors: Array = building.get("doors",[]).duplicate()
	if building.has("door") and building.has("approach"):
		var normal := (_v(building.approach)-_v(building.door)).normalized()
		doors.append({"at":building.door,"normal":[normal.x,normal.y]})
	for door: Dictionary in doors:
		var normal := _v(door.normal)
		var wait := _v(door.at) + normal*1.45
		var options := {}
		# A different side of a corner may face a completely different street.
		for offset in [Vector2.ZERO, normal*12, normal*26,normal.orthogonal()*14,-normal.orthogonal()*14]:
			var road: Dictionary = graph._nearest(wait+offset)
			if not road.is_empty():
				options[road.edge] = road
		for snap: Dictionary in options.values():
			var lane: Vector2 = snap.at
			var toward := (lane-wait).normalized()
			var span := lane.distance_to(wait)
			if span>76 or span<2 or toward.dot(normal)<-.1:
				continue
			var stop := wait + toward*minf(span,6.5)
			var score := lane.distance_to(stop) + (1.0 - toward.dot(normal))*4.0
			if score >= best_score or not graph.walk_clear(wait,stop) or not _drive_clear(lane,stop,toward):
				continue
			best_score = score
			best = {"entrance":{"at":door.at,"front":door.normal},"customer":[wait.x,wait.y],"stop":[stop.x,stop.y],"driveway":[lane.x,lane.y]}
	return best

func _drive_clear(start: Vector2, finish: Vector2, facing: Vector2) -> bool:
	var span := start.distance_to(finish)
	var side := facing.orthogonal()*1.22
	var end := finish-facing*2.45
	for lateral in [Vector2.ZERO,side,-side]:
		if not graph.walk_clear(start+lateral,end+lateral):
			return false
	var previous: Vector2 = start
	var last_y: float = ground.at(start.x,start.y)
	var steps := maxi(1,ceili(span/1.5))
	for i in range(steps+1):
		var center := start.lerp(end,float(i)/steps)
		var y: float = ground.at(center.x,center.y,last_y)
		if y < water_y+.40 or (i>0 and absf(y-last_y) > .28*center.distance_to(previous)+.18):
			return false
		previous = center
		last_y = y
		for box: Dictionary in obstacles.get(_cell(center),[]):
			var point: Vector2 = (center-box.at).rotated(-float(box.angle)).abs()
			var gap: Vector2 = (point-box.half).max(Vector2.ZERO)
			if gap.length_squared() <= 1.3*1.3:
				return false
	return true

func _add_obstacle(at: Vector2,w: float,d: float,angle: float) -> void:
	var extent := Vector2.ONE*(Vector2(w,d).length()+1.3)
	var lo := _cell(at-extent)
	var hi := _cell(at+extent)
	var box := {"at":at,"half":Vector2(w,d),"angle":angle}
	for x in range(lo.x,hi.x+1):
		for y in range(lo.y,hi.y+1):
			var key := Vector2i(x,y)
			if not obstacles.has(key):
				obstacles[key] = []
			obstacles[key].append(box)

func _cell(at: Vector2) -> Vector2i:
	return Vector2i((at/GRID).floor())

func _v(p: Array) -> Vector2:
	return Vector2(p[0],p[1])

func _json(label: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string("res://assets/"+label+".json"))
