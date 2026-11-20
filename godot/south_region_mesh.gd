extends RefCounted

const GROUND := preload("res://south_region_ground.gd")
const PAVING := preload("res://south_region_pavement.gd")
const BUILDINGS := preload("res://south_region_buildings.gd")
const ENTRANCES := preload("res://south_region_entrances.gd")
const TILE := 96.0

enum Surface { SOIL, SIDEWALK, ROAD, WALL, ROOF, WATER, RAIL, GARAGE, FACTORY, TRIM, CURB }

var ground: GROUND
var terrain_bounds: Rect2
var core_outline: PackedVector2Array
var water_y: float
var roads_by_tile := {}
var house_blocks := {}
var paths_by_tile := {}
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
				"doors":house.get("doors",[]), "seed":fposmod(float(house.id)*0.6180339887,1.0),
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
			_bin(paths_by_tile,segment.bounds,segment)


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
	var streets := PAVING.layout(roads_by_tile.get(key, []),ground)
	var paths: Array = paths_by_tile.get(key, [])
	var greens: Array = greens_by_tile.get(key, [])
	for part in _outer_parts(area):
		_land(mesh,part,streets.surfaces,paths,greens)
		for curb: Dictionary in streets.edges:
			_curb_faces(mesh,part,curb)
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


func _land(mesh: SurfaceTool, area: Rect2, paving: Array, paths: Array, greens: Array) -> void:
	var spacing := ground.step if ground.relief.is_empty() else GROUND.RELIEF_STEP
	if area.intersects(ground.core.grow(GROUND.SEAM_METERS)):
		spacing = minf(spacing,4.0)
	if area.intersects(ground.shore_bounds):
		spacing = minf(spacing,ground.shore_step)
	var xs := _lines(area.position.x, area.end.x, ground.origin.x, spacing)
	var zs := _lines(area.position.y, area.end.y, ground.origin.y, spacing)
	var vertices := PackedVector3Array()
	var low := INF
	for z in zs:
		for x in xs:
			var y := ground.land_height(x,z)
			vertices.append(Vector3(x,y,z))
			low = minf(low,y)
	for j in range(zs.size()-1):
		for i in range(xs.size()-1):
			var cell := Rect2(xs[i],zs[j],xs[i+1]-xs[i],zs[j+1]-zs[j])
			var k := j*xs.size()+i
			var a := vertices[k]
			var b := vertices[k+1]
			var c := vertices[k+xs.size()+1]
			var d := vertices[k+xs.size()]
			var center := cell.get_center()
			# The soil shader uses blue for growth, like the baked starting block.
			var color := Color(0.5,0.5,0.53)
			for green: Dictionary in greens:
				var green_bounds: Rect2 = green.bounds
				if green_bounds.has_point(center) and Geometry2D.is_point_in_polygon(center,green.outline):
					if green.kind == "wood" or green.kind == "forest":
						color.b = 0.38
					elif green.kind in ["pitch","play"]:
						color.r = 0.0
						color.b = 0.66
					else:
						color.b = 0.64
					break
			_face(mesh,a,b,c,color,Surface.SOIL)
			_face(mesh,a,c,d,color,Surface.SOIL)
	for strip: Dictionary in paving:
		var kind: StringName = strip.kind
		var layer := Surface.ROAD if kind == &"road" else (Surface.CURB if kind == &"cap" else Surface.SIDEWALK)
		_pave_grid(mesh,strip.segment,strip.outline,strip.bounds,layer,xs,zs,vertices)
	for path: Dictionary in paths:
		_pave_grid(mesh,path,path.walk,path.bounds,int(path.layer),xs,zs,vertices)
	if low < water_y:
		var water := PackedVector3Array()
		for p in _corners(area):
			water.append(Vector3(p.x,water_y,p.y))
		_face(mesh,water[0],water[1],water[2],Color(0.046,0.102,0.121),Surface.WATER)
		_face(mesh,water[0],water[2],water[3],Color(0.046,0.102,0.121),Surface.WATER)


func _pave_grid(mesh: SurfaceTool, segment: Dictionary, polygon: PackedVector2Array, bounds: Rect2, layer: int,
		xs: Array[float], zs: Array[float], vertices: PackedVector3Array) -> void:
	var x0 := maxi(0,xs.bsearch(bounds.position.x)-1)
	var z0 := maxi(0,zs.bsearch(bounds.position.y)-1)
	var x1 := mini(xs.size()-1,xs.bsearch(bounds.end.x))
	var z1 := mini(zs.size()-1,zs.bsearch(bounds.end.y))
	for j in range(z0,z1):
		for i in range(x0,x1):
			var k := j*xs.size()+i
			var a := vertices[k]
			var b := vertices[k+1]
			var c := vertices[k+xs.size()+1]
			var d := vertices[k+xs.size()]
			_pave_face(mesh,segment,polygon,layer,a,b,c)
			_pave_face(mesh,segment,polygon,layer,a,c,d)


func _pave_face(mesh: SurfaceTool, segment: Dictionary, polygon: PackedVector2Array, layer: int,
		a: Vector3, b: Vector3, c: Vector3) -> void:
	var triangle := PackedVector2Array([Vector2(a.x,a.z),Vector2(b.x,b.z),Vector2(c.x,c.z)])
	var normal := (b-a).cross(c-a)
	var fragments := Geometry2D.intersect_polygons(triangle,polygon)
	var driving := layer == Surface.ROAD
	var rank := int(segment.rank)
	var lift := GROUND.road_lift(driving,rank)
	var color := Color(0.082,0.088,0.092) if driving else Color(0.27,0.245,0.210)
	match layer:
		Surface.CURB:
			lift += .007
			color = Color(.34,.32,.282)
		Surface.WATER:
			lift = .035
			color = Color(.046,.102,.121)
		Surface.RAIL:
			lift = .051
			color = Color(.155,.135,.112)
		Surface.ROAD:
			if segment.get("lot",false):
				color = Color(.14,.129,.111,.52)
			elif segment.curbs.is_empty():
				color = Color(.165,.145,.115,.28)
			elif rank >= 6:
				color = Color(.12,.119,.109)
	var axis: Vector2 = segment.axis
	var half := float(segment.half)
	var marked := driving and rank <= 4 and half >= 3.5
	for patch in fragments:
		for i in range(1,patch.size()-1):
			for p: Vector2 in [patch[0],patch[i],patch[i+1]]:
				var sampled := a.y-(normal.x*(p.x-a.x)+normal.z*(p.y-a.z))/normal.y
				var y := GROUND.paving_height(segment,p,sampled)
				var relative: Vector2 = p-segment.at
				var uv := Vector2(relative.dot(axis)+float(segment.along),axis.cross(relative))
				_vertex(mesh,Vector3(p.x,y+lift*ground.seam_lift(p),p.y),color,layer,uv,half if marked else -half)


func _curb_faces(mesh: SurfaceTool, area: Rect2, curb: Dictionary) -> void:
	var line: PackedVector2Array = curb.line
	if not GROUND.bounds_of(line).intersects(area,true):
		return
	var segment: Dictionary = curb.segment
	var rank := int(segment.rank)
	var top := GROUND.road_lift(false,rank)+.007
	var bottom := GROUND.road_lift(true,rank)-.025 if curb.inner else -.045
	var color := Color(.27,.248,.211) if curb.inner else Color(.218,.197,.161)
	for piece in Geometry2D.intersect_polyline_with_polygon(line,_corners(area)):
		for i in range(1,piece.size()):
			var a: Vector2 = piece[i-1]
			var b: Vector2 = piece[i]
			var steps := maxi(1,ceili(a.distance_to(b)/1.6))
			for part in steps:
				var start := a.lerp(b,float(part)/steps)
				var finish := a.lerp(b,float(part+1)/steps)
				var p := _curb_at(segment,start,top)
				var q := _curb_at(segment,finish,top)
				var r := _curb_at(segment,start,bottom)
				var t := _curb_at(segment,finish,bottom)
				var axis: Vector2 = segment.axis
				var offset := float(segment.along)
				var u := (start-Vector2(segment.at)).dot(axis)+offset
				var v := (finish-Vector2(segment.at)).dot(axis)+offset
				_vertex(mesh,p,color,Surface.CURB,Vector2(u,top))
				_vertex(mesh,q,color,Surface.CURB,Vector2(v,top))
				_vertex(mesh,t,color,Surface.CURB,Vector2(v,bottom))
				_vertex(mesh,p,color,Surface.CURB,Vector2(u,top))
				_vertex(mesh,t,color,Surface.CURB,Vector2(v,bottom))
				_vertex(mesh,r,color,Surface.CURB,Vector2(u,bottom))


func _curb_at(segment: Dictionary, p: Vector2, lift: float) -> Vector3:
	var base := GROUND.paving_height(segment,p,ground.land_height(p.x,p.y))
	return Vector3(p.x,base+lift*ground.seam_lift(p),p.y)


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
	var wall_height := maxf(2.5,float(house.height))
	roof += wall_height
	var color: Color = house.color
	var layer := BUILDINGS.wall_type(house)
	var profile := BUILDINGS.roof_profile(house,layer)
	var regular_windows := layer not in [Surface.GARAGE,Surface.FACTORY]
	var window_pitch := BUILDINGS.bay_width(layer)
	for i in outline.size():
		var a := outline[i]
		var b := outline[(i+1)%outline.size()]
		var span := a.distance_to(b)
		var bay_scale := 3.15*maxf(1.0,roundf(span/window_pitch))/maxf(span,0.01)
		color.a = fposmod(float(house.seed)+i*0.381966,1.0)
		var edge := PackedVector2Array([a,b])
		var segments: Array[PackedVector2Array] = [edge]
		if cut:
			segments = Geometry2D.clip_polyline_with_polygon(edge,core_outline)
		for section in segments:
			if section.size() >= 2:
				_wall(mesh,walls,section[0],section[-1],a,base,roof,color,layer,wall_height,bay_scale if regular_windows else 1.0,span)
				if not profile.is_empty():
					_gable(mesh,walls,BUILDINGS.roof_edge(section[0],section[-1],profile),profile,roof,color,layer)
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
			for slope in BUILDINGS.roof_halves(piece,profile):
				for k in range(1,slope.size()-1):
					var a := _roof_vertex(slope[0],roof,profile)
					var b := _roof_vertex(slope[k],roof,profile)
					var c := _roof_vertex(slope[k+1],roof,profile)
					var roof_color := Color(.094,.061,.044) if not profile.is_empty() else Color(.101,.098,.088)
					_face(mesh,a,b,c,roof_color,Surface.ROOF)
					walls.append_array(PackedVector3Array([a,b,c]))

	BUILDINGS.accents(mesh,house,layer,roof-wall_height,roof,ground)
	ENTRANCES.add_to(mesh,ground,house.doors,Surface.TRIM)


func _roof_vertex(p: Vector2, roof: float, profile: Dictionary) -> Vector3:
	return Vector3(p.x,roof+BUILDINGS.roof_rise(p,profile),p.y)


func _gable(mesh: SurfaceTool, walls: PackedVector3Array, edge: PackedVector2Array, profile: Dictionary,
		roof: float, color: Color, layer: int) -> void:
	for i in range(1,edge.size()):
		var a := _roof_vertex(edge[i-1],roof,profile)
		var b := _roof_vertex(edge[i],roof,profile)
		if maxf(a.y,b.y) < roof+.01:
			continue
		var low := Vector3(a.x,roof,a.z)
		var high := Vector3(b.x,roof,b.z)
		for p: Vector3 in [low,high,b,low,b,a]:
			var x := Vector2(p.x,p.z).distance_to(edge[0])
			_vertex(mesh,p,color,layer,Vector2(x,p.y-roof+0.93),-4.25)
			walls.append(p)


func _wall(mesh: SurfaceTool, walls: PackedVector3Array, a: Vector2, b: Vector2,
		start: Vector2, base: float, roof: float, color: Color, layer: int,
		wall_height: float, bay_scale: float, span: float) -> void:
	var vertices := PackedVector3Array([Vector3(a.x,base,a.y),Vector3(b.x,base,b.y),
			Vector3(b.x,roof,b.y),Vector3(a.x,roof,a.y)])
	var length_a := start.distance_to(a)*bay_scale
	var length_b := start.distance_to(b)*bay_scale
	var floor_y := base-roof+wall_height
	var coords := PackedVector2Array([Vector2(length_a,floor_y),Vector2(length_b,floor_y),
			Vector2(length_b,wall_height),Vector2(length_a,wall_height)])
	var style := -wall_height if layer not in [Surface.GARAGE,Surface.FACTORY] and span < 2.25 else wall_height
	for k: int in [0,1,2,0,2,3]:
		_vertex(mesh,vertices[k],color,layer,coords[k],style)
		walls.append(vertices[k])
