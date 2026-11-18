extends RefCounted

var street: Array[Vector4] = []
var yard: Array[Vector4] = []
var fresh: Array[Vector4] = []
var fresh_width := {}
var yard_spots: Array[Vector2] = []
var long_roads: Array[Dictionary] = []
var street_meters := 0.0
var yard_meters := 0.0
var _boundary := PackedVector2Array()
var _houses := {}


func setup(region: Dictionary) -> void:
	for xy: Array in region.boundary:
		_boundary.append(Vector2(xy[0],xy[1]))
	var named := {}
	for road: Dictionary in region.roads:
		var rank := int(road["class"])
		if road.has("deck_y") or (rank > 5 and rank != 7):
			continue
		var points := PackedVector2Array()
		for xy: Array in road.points:
			points.append(Vector2(xy[0],xy[1]))
		var road_meters := 0.0
		for i in range(1,points.size()):
			var a := points[i-1]
			var b := points[i]
			var length := a.distance_to(b)
			road_meters += length
			if rank == 7 and length > 12.0:
				yard_spots.append((a+b)*0.5)
			if length <= 25.0:
				continue
			var segment := Vector4(a.x,a.y,b.x,b.y)
			if rank == 7:
				yard.append(segment)
				yard_meters += length
			else:
				street.append(segment)
				street_meters += length
				if rank <= 4:
					fresh.append(segment)
					fresh_width[segment] = float(road.width)
		if rank <= 3 and not str(road.name).is_empty():
			named[road.name] = float(named.get(road.name,0.0))+road_meters
			long_roads.append({"name":road.name,"points":points,"width":float(road.width)})
	for i in range(long_roads.size()-1,-1,-1):
		if named[long_roads[i].name] < 600.0:
			long_roads.remove_at(i)
	for building: Dictionary in region.buildings:
		var outline := PackedVector2Array()
		var area := Rect2()
		for xy: Array in building.outline:
			var p := Vector2(xy[0],xy[1])
			area = Rect2(p,Vector2.ZERO) if outline.is_empty() else area.expand(p)
			outline.append(p)
		area = area.grow(1.5)
		var lo := Vector2i((area.position/48.0).floor())
		var hi := Vector2i((area.end/48.0).floor())
		for z in range(lo.y,hi.y+1):
			for x in range(lo.x,hi.x+1):
				var key := Vector2i(x,z)
				if not _houses.has(key):
					_houses[key] = []
				_houses[key].append(outline)
	for i in range(yard_spots.size()-1,-1,-1):
		if not offroad_clear(yard_spots[i]):
			yard_spots.remove_at(i)


func in_district(p: Vector2) -> bool:
	return Geometry2D.is_point_in_polygon(p,_boundary)


func offroad_clear(p: Vector2) -> bool:
	if not in_district(p):
		return false
	for outline: PackedVector2Array in _houses.get(Vector2i((p/48.0).floor()),[]):
		if Geometry2D.is_point_in_polygon(p,outline):
			return false
		for i in outline.size():
			if p.distance_squared_to(Geometry2D.get_closest_point_to_segment(p,outline[i-1],outline[i])) < 2.25:
				return false
	return true


func long_spots(every: float) -> PackedVector2Array:
	var spots := PackedVector2Array()
	var side := 1.0
	for road in long_roads:
		var points: PackedVector2Array = road.points
		var next := every*randf_range(0.3,1.0)
		var along := 0.0
		for i in range(1,points.size()):
			var segment := points[i]-points[i-1]
			var length := segment.length()
			if length < 0.5:
				continue
			var axis := segment/length
			while next <= along+length:
				var p := points[i-1]+axis*(next-along)
				next += every+randf_range(-50.0,50.0)
				if in_district(p):
					spots.append(p+axis.orthogonal()*road.width*0.25*side)
					side = -side
			along += length
	return spots


func random_on(segments: Array[Vector4], inset := 0.25) -> Vector2:
	var v: Vector4 = segments.pick_random()
	return Vector2(v.x,v.y).lerp(Vector2(v.z,v.w),randf_range(inset,1.0-inset))
