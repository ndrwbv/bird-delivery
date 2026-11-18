extends RefCounted

const DEAD_ENDS := preload("res://south_dead_ends.gd")

class Edge:
	var a: Vector2
	var b: Vector2
	var dir: Vector2
	var right: Vector2
	var width: float
	var rank: int
	var bridge := false
	var blocked := false
	var offset: float
	var length: float
	var entry: float
	var exit: float

	func lane(meters: float) -> Vector2:
		return a+dir*meters+right*offset

var edges: Array[Edge] = []
var exits := {}
var cells := {}
var neighbors := {}
var max_width := {}
var navigation := AStar2D.new()
var node_ids := {}


func setup(data: Array) -> void:
	for road: Dictionary in data:
		if int(road["class"]) > 5:
			continue
		for i in range(1,road.points.size()):
			var a := Vector2(road.points[i-1][0],road.points[i-1][1])
			var b := Vector2(road.points[i][0],road.points[i][1])
			if a.distance_squared_to(b) < 0.25:
				continue
			var width := float(road.width)
			_junction(a,b,width)
			_junction(b,a,width)
			var way := int(road.oneway)
			if way >= 0:
				_edge(a,b,road,way)
			if way <= 0:
				_edge(b,a,road,way)
	# Navigation and moving traffic allow the same return along a one-way dead end.
	var directions := {}
	for e in edges:
		directions[Vector2i(node_ids[e.a],node_ids[e.b])] = true
	for pair: Vector2i in DEAD_ENDS.reverse_edges(directions):
		var a := navigation.get_point_position(pair.x)
		var b := navigation.get_point_position(pair.y)
		for original: Edge in exits.get(b,[]):
			if original.b == a:
				var attributes := {"width":original.width,"class":original.rank}
				if original.bridge:
					attributes.deck_y = true
				_edge(a,b,attributes,0)
				original.offset = 0.0 if original.width < 7.0 else original.width*(0.375 if original.width >= 12.5 else 0.25)
				break
	for edge in edges:
		edge.entry = _trim(edge.a,edge.length)
		edge.exit = edge.length-_trim(edge.b,edge.length)
		var n := maxi(1,ceili(edge.length/50.0))
		for i in n:
			var p := edge.a.lerp(edge.b,(i+0.5)/n)
			var key := Vector2i((p/100.0).floor())
			if not cells.has(key):
				cells[key] = []
			if not cells[key].has(edge):
				cells[key].append(edge)


func _junction(a: Vector2, b: Vector2, width: float) -> void:
	if not neighbors.has(a):
		neighbors[a] = []
		var id := navigation.get_available_point_id()
		node_ids[a] = id
		navigation.add_point(id,a)
	if not neighbors[a].has(b):
		neighbors[a].append(b)
	max_width[a] = maxf(float(max_width.get(a,0.0)),width)


func _edge(a: Vector2, b: Vector2, road: Dictionary, way: int) -> void:
	if not exits.has(a):
		exits[a] = []
	for existing: Edge in exits[a]:
		if existing.b == b:
			return
	var e := Edge.new()
	e.a = a
	e.b = b
	e.length = a.distance_to(b)
	e.dir = (b-a)/e.length
	e.right = Vector2(-e.dir.y,e.dir.x)
	e.width = road.width
	e.rank = int(road["class"])
	e.bridge = road.has("deck_y")
	if way == 0:
		e.offset = 0.0 if e.width < 7.0 else e.width*(0.375 if e.width >= 12.5 else 0.25)
	else:
		var lanes := maxi(1,roundi(e.width/3.3))
		e.offset = e.width*0.5-e.width/lanes*0.5
	edges.append(e)
	exits[a].append(e)
	navigation.connect_points(node_ids[a],node_ids[b],false)


func _trim(at: Vector2, length: float) -> float:
	var options: Array = neighbors[at]
	var width: float = max_width[at]
	if options.size() >= 3:
		return minf(width*0.5+1.2,length*0.42)
	if options.size() == 2 and -(at.direction_to(options[0])).dot(at.direction_to(options[1])) < 0.96:
		return minf(minf(6.0,width*0.5),length*0.42)
	return 0.0


func around(at: Vector2, radius: float) -> Array[Edge]:
	var found: Array[Edge] = []
	var seen := {}
	var lo := Vector2i(((at-Vector2.ONE*radius)/100.0).floor())
	var hi := Vector2i(((at+Vector2.ONE*radius)/100.0).floor())
	for z in range(lo.y,hi.y+1):
		for x in range(lo.x,hi.x+1):
			for edge: Edge in cells.get(Vector2i(x,z),[]):
				if not seen.has(edge):
					seen[edge] = true
					found.append(edge)
	return found


func lookup(a: Vector2, b: Vector2) -> Edge:
	for e: Edge in exits.get(a,[]):
		if e.b==b:
			return e
	return null


func nearest(at: Vector2, heading := Vector2.ZERO) -> Edge:
	var best: Edge
	var score := INF
	for e in around(at,36.0):
		if e.blocked:
			continue
		var p := Geometry2D.get_closest_point_to_segment(at,e.a,e.b)
		var d := p.distance_squared_to(at)+(1.0-e.dir.dot(heading))*5.0
		if d<score:
			score = d
			best = e
	return best


func set_closed(a: Vector2,b: Vector2,closed: bool) -> void:
	for pair: Array in [[a,b],[b,a]]:
		var e := lookup(pair[0],pair[1])
		if e==null or e.blocked==closed:
			continue
		e.blocked = closed
		if closed:
			navigation.disconnect_points(node_ids[e.a],node_ids[e.b],false)
		else:
			navigation.connect_points(node_ids[e.a],node_ids[e.b],false)


func short_detour(e: Edge) -> bool:
	if e==null or e.blocked or e.bridge:
		return false
	var ap: int = node_ids[e.a]
	var bp: int = node_ids[e.b]
	set_closed(e.a,e.b,true)
	var forward := navigation.get_point_path(ap,bp)
	var backward := PackedVector2Array()
	if lookup(e.b,e.a)!=null:
		backward = navigation.get_point_path(bp,ap)
	set_closed(e.a,e.b,false)
	if forward.size()<2 or (lookup(e.b,e.a)!=null and backward.size()<2):
		return false
	for path: PackedVector2Array in [forward,backward]:
		var distance := 0.0
		for i in range(1,path.size()):
			distance += path[i].distance_to(path[i-1])
			if distance>1400.0:
				return false
	return true


func choose_after(edge: Edge) -> Edge:
	var options: Array = exits.get(edge.b,[])
	if options.is_empty():
		return null
	var chosen: Edge
	var reverse: Edge
	var weight := 0.0
	for e: Edge in options:
		if e.blocked:
			continue
		if e.b == edge.a:
			reverse = e
			continue
		var w := 0.35+maxf(0.0,edge.dir.dot(e.dir))*2.2+(0.6 if e.rank <= 3 else 0.0)
		weight += w
		if randf()*weight < w:
			chosen = e
	return chosen if chosen != null else reverse


func path_after(edge: Edge, next: Edge) -> PackedVector2Array:
	var path := PackedVector2Array()
	var a := edge.lane(edge.exit)
	var b := next.lane(next.entry)
	var chord := b-a
	if chord.length_squared() > 0.02:
		# Cubic tangents keep the car within its lanes through a junction.
		var handle := minf(chord.length()*0.55,7.0)
		var c := a+edge.dir*handle
		var d := b-next.dir*handle
		var steps := clampi(ceili(chord.length()/1.6),2,16)
		for i in range(1,steps+1):
			path.append(a.bezier_interpolate(c,d,b,float(i)/steps))
	path.append(next.lane(next.exit))
	return path
