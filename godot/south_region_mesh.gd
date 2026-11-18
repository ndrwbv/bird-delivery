extends RefCounted

const GROUND := preload("res://south_region_ground.gd")
const TILE := 96.0

enum Surface { SOIL, SIDEWALK, ROAD, WALL, ROOF, WATER, RAIL, GARAGE, FACTORY }

var ground: GROUND
var terrain_bounds: Rect2
var core_outline: PackedVector2Array
var water_y: float
var roads_by_tile := {}
var house_blocks := {}
var greens_by_tile := {}
var surface_arrays: Array


func setup(data: Dictionary, sampler: GROUND) -> void:
	ground = sampler
	terrain_bounds = Rect2(ground.origin, Vector2(ground.columns-1, ground.rows-1)*ground.step)
	core_outline = _corners(ground.core)
	water_y = data.water_y
	for segment: Dictionary in ground.road_sections:
		segment.layer = Surface.ROAD
		_bin(roads_by_tile,segment.bounds,segment)
	for stream: Dictionary in data.get("streams", []):
		_index_path(stream.points, float(stream.width)*0.5, Surface.WATER)
	for rail: Dictionary in data.get("rails", []):
		_index_path(rail.points, 1.55, Surface.RAIL)
	for house: Dictionary in data.buildings:
		var outline := GROUND.outline_of(house.outline)
		if outline.size() < 3:
			continue
		var bounds := GROUND.bounds_of(outline)
		if ground.core.encloses(bounds):
			continue
		var entry := {"outline":outline, "bounds":bounds, "height":float(house.height), "kind":str(house.kind),
				"color":Color.from_string(str(house.color), Color("aaa28f")).srgb_to_linear()}
		var outside := _outer_parts(bounds)
		if outside.is_empty():
			continue
		var owner := outside[0]
		for part in outside:
			if part.get_area() > owner.get_area():
				owner = part
		var block := Vector2i(((owner.get_center()-ground.origin)/(TILE*3.0)).floor())
		_add_to(house_blocks,block,entry)
	for green: Dictionary in data.get("greens", []):
		var outline := GROUND.outline_of(green.outline)
		if outline.size() >= 3:
			var limits := GROUND.bounds_of(outline)
			_bin(greens_by_tile, limits, {"outline":outline, "bounds":limits, "kind":str(green.kind)})


func tile_at(p: Vector2) -> Vector2i:
	return Vector2i(((p-ground.origin)/TILE).floor())


func tile_rect(key: Vector2i) -> Rect2:
	return Rect2(ground.origin+Vector2(key)*TILE, Vector2(TILE,TILE))


static func _corners(area: Rect2) -> PackedVector2Array:
	var a := area.position
	var b := area.end
	return PackedVector2Array([a, Vector2(b.x,a.y), b, Vector2(a.x,b.y)])


static func _add_to(index: Dictionary, key: Vector2i, record: Dictionary) -> void:
	if not index.has(key):
		index[key] = []
	index[key].append(record)


func _bin(index: Dictionary, bounds: Rect2, record: Dictionary) -> void:
	var first := tile_at(bounds.position)
	var last := tile_at(bounds.end)
	for z in range(first.y,last.y+1):
		for x in range(first.x,last.x+1):
			_add_to(index, Vector2i(x,z), record)


func _index_path(raw: Array, half: float, layer: int) -> void:
	for segment in GROUND.sections(raw,half,half):
		if not ground.core.encloses(segment.bounds):
			segment.layer = layer
			_bin(roads_by_tile,segment.bounds,segment)


# Four disjoint rectangles cut an exact hole for the close-up city.
func _outer_parts(area: Rect2) -> Array[Rect2]:
	var cut := area.intersection(ground.core)
	var result: Array[Rect2] = []
	if not cut.has_area():
		result.append(area)
		return result
	var a := area.position
	var b := area.end
	var c := cut.position
	var d := cut.end
	for piece: Rect2 in [Rect2(a,Vector2(b.x-a.x,c.y-a.y)), Rect2(a.x,d.y,b.x-a.x,b.y-d.y),
			Rect2(a.x,c.y,c.x-a.x,d.y-c.y), Rect2(d.x,c.y,b.x-d.x,d.y-c.y)]:
		if piece.has_area():
			result.append(piece)
	return result


# Keep the coarse grid aligned across chunks. Extra samples join the detailed ground at the seam.
func _lines(low: float, high: float, origin: float, step: float) -> Array[float]:
	var result: Array[float] = [low]
	var next := origin+(floorf((low-origin)/step)+1.0)*step
	while next < high-0.001:
		result.append(next)
		next += step
	result.append(high)
	return result


# One worker owns surface_arrays until the main thread joins it.
# SurfaceTool only populates CPU arrays here. Scene nodes, GPU and physics resources stay on the main thread.
func prepare(key: Vector2i) -> void:
	var area := tile_rect(key).intersection(terrain_bounds)
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	var roads: Array = roads_by_tile.get(key, [])
	var greens: Array = greens_by_tile.get(key, [])
	for part in _outer_parts(area):
		_land(mesh, part, roads, greens)
	mesh.index()
	surface_arrays = mesh.commit_to_arrays()


# Only 218 outer footprints. Keep their shells visible and solid through travel and teleports.
func make_house_block(key: Vector2i) -> Dictionary:
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	var walls := PackedVector3Array()
	for house: Dictionary in house_blocks[key]:
		_house(mesh,walls,house)
	mesh.index()
	return {"surface":mesh.commit_to_arrays(), "walls":walls}


func _land(mesh: SurfaceTool, area: Rect2, roads: Array, greens: Array) -> void:
	var spacing := ground.step
	if area.intersects(ground.core.grow(GROUND.SEAM_METERS)):
		spacing = minf(spacing,4.0)
	if area.intersects(ground.shore_bounds):
		spacing = minf(spacing,ground.shore_step)
	var xs := _lines(area.position.x, area.end.x, ground.origin.x, spacing)
	var zs := _lines(area.position.y, area.end.y, ground.origin.y, spacing)
	var low := INF
	for j in range(zs.size()-1):
		for i in range(xs.size()-1):
			var cell := Rect2(xs[i],zs[j],xs[i+1]-xs[i],zs[j+1]-zs[j])
			var corners := _corners(cell)
			var pts := PackedVector3Array()
			for p in corners:
				var y := ground.land_height(p.x,p.y)
				pts.append(Vector3(p.x,y,p.y))
				low = minf(low,y)
			var center := cell.get_center()
			var color := Color(0.082,0.146,0.043)
			for green: Dictionary in greens:
				var green_bounds: Rect2 = green.bounds
				if green_bounds.has_point(center) and Geometry2D.is_point_in_polygon(center,green.outline):
					if green.kind == "wood" or green.kind == "forest":
						color = Color(0.053,0.105,0.032)
					else:
						color = Color(0.093,0.161,0.047)
					break
			_face(mesh, pts[0],pts[1],pts[2],color,Surface.SOIL)
			_face(mesh, pts[0],pts[2],pts[3],color,Surface.SOIL)
			for road: Dictionary in roads:
				if cell.intersects(road.bounds):
					_road_on_face(mesh, road, pts[0],pts[1],pts[2])
					_road_on_face(mesh, road, pts[0],pts[2],pts[3])
	if low < water_y:
		var water := PackedVector3Array()
		for p in _corners(area):
			water.append(Vector3(p.x,water_y,p.y))
		_face(mesh,water[0],water[1],water[2],Color(0.046,0.102,0.121),Surface.WATER)
		_face(mesh,water[0],water[2],water[3],Color(0.046,0.102,0.121),Surface.WATER)


func _road_on_face(mesh: SurfaceTool, road: Dictionary, a: Vector3, b: Vector3, c: Vector3) -> void:
	var triangle := PackedVector2Array([Vector2(a.x,a.z), Vector2(b.x,b.z), Vector2(c.x,c.z)])
	var normal := (b-a).cross(c-a)
	var layers := [Surface.SIDEWALK, Surface.ROAD] if road.layer == Surface.ROAD else [road.layer]
	for layer: int in layers:
		var driving := layer == Surface.ROAD
		var polygon: PackedVector2Array = road.road if driving else road.walk
		var fragments := Geometry2D.intersect_polygons(triangle, polygon)
		var rank := int(road.rank)
		var lift := GROUND.road_lift(driving,rank)
		var color := Color(0.109,0.113,0.111) if driving else Color(0.225,0.217,0.196)
		if layer == Surface.WATER:
			lift = 0.035
			color = Color(0.046,0.102,0.121)
		elif layer == Surface.RAIL:
			lift = 0.051
			color = Color(0.155,0.135,0.112)
		elif rank >= 6 and driving:
			color = Color(0.146,0.143,0.128)
		for patch in fragments:
			for i in range(1,patch.size()-1):
				for p: Vector2 in [patch[0],patch[i],patch[i+1]]:
					var y := a.y-(normal.x*(p.x-a.x)+normal.z*(p.y-a.z))/normal.y
					var axis: Vector2 = road.axis
					var relative: Vector2 = p-road.at
					var uv := Vector2(relative.dot(axis)+float(road.along),axis.cross(relative))
					var deck: Vector2 = road.deck
					if is_finite(deck.x):
						y = maxf(y,lerpf(deck.x,deck.y,clampf(relative.dot(axis)/float(road.length),0.0,1.0)))
					var marked := driving and rank <= 4 and float(road.half) >= 3.5
					_vertex(mesh,Vector3(p.x,y+lift*ground.seam_lift(p),p.y),color,layer,uv,1.0 if marked else 0.0)


static func _vertex(mesh: SurfaceTool, p: Vector3, color: Color, layer: int,
		uv := Vector2.ZERO, style := 0.0) -> void:
	mesh.set_color(color)
	mesh.set_uv(uv)
	mesh.set_uv2(Vector2(layer,style))
	mesh.add_vertex(p)


static func _face(mesh: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, color: Color, layer: int) -> void:
	_vertex(mesh,a,color,layer)
	_vertex(mesh,b,color,layer)
	_vertex(mesh,c,color,layer)


func _house(mesh: SurfaceTool, walls: PackedVector3Array, house: Dictionary) -> void:
	var outline: PackedVector2Array = house.outline
	var limits: Rect2 = house.bounds
	var cut := limits.intersects(ground.core)
	var base := INF
	var roof := -INF
	for p in outline:
		var y := ground.land_height(p.x,p.y)
		base = minf(base,y-0.45)
		roof = maxf(roof,y)
	roof += maxf(2.5,float(house.height))
	var color: Color = house.color
	var layer := Surface.WALL
	if house.kind == "gar":
		layer = Surface.GARAGE
	elif house.kind == "ind":
		layer = Surface.FACTORY
	for i in outline.size():
		var a := outline[i]
		var b := outline[(i+1)%outline.size()]
		var edge := PackedVector2Array([a,b])
		var segments: Array[PackedVector2Array] = [edge]
		if cut:
			segments = Geometry2D.clip_polyline_with_polygon(edge,core_outline)
		for section in segments:
			if section.size() >= 2:
				_wall(mesh,walls,section[0],section[-1],a,base,roof,color,layer)
	var indices := Geometry2D.triangulate_polygon(outline)
	for j in range(0,indices.size(),3):
		var face := PackedVector2Array([outline[indices[j]],outline[indices[j+1]],outline[indices[j+2]]])
		var pieces: Array[PackedVector2Array] = [face]
		if cut:
			# Clip each ear separately and preserve the open interior along the core edge.
			pieces.clear()
			for part in _outer_parts(GROUND.bounds_of(face)):
				pieces.append_array(Geometry2D.intersect_polygons(face,_corners(part)))
		for piece in pieces:
			for k in range(1,piece.size()-1):
				var a := Vector3(piece[0].x,roof,piece[0].y)
				var b := Vector3(piece[k].x,roof,piece[k].y)
				var c := Vector3(piece[k+1].x,roof,piece[k+1].y)
				_face(mesh,a,b,c,Color(0.101,0.098,0.088),Surface.ROOF)
				walls.append_array(PackedVector3Array([a,b,c]))


func _wall(mesh: SurfaceTool, walls: PackedVector3Array, a: Vector2, b: Vector2,
		start: Vector2, base: float, roof: float, color: Color, layer: int) -> void:
	var vertices := PackedVector3Array([Vector3(a.x,base,a.y),Vector3(b.x,base,b.y),
			Vector3(b.x,roof,b.y),Vector3(a.x,roof,a.y)])
	var length_a := start.distance_to(a)
	var length_b := start.distance_to(b)
	var coords := PackedVector2Array([Vector2(length_a,0),Vector2(length_b,0),
			Vector2(length_b,roof-base),Vector2(length_a,roof-base)])
	for k: int in [0,1,2,0,2,3]:
		_vertex(mesh,vertices[k],color,layer,coords[k],roof-base)
		walls.append(vertices[k])
