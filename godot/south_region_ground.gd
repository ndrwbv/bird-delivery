extends RefCounted

const ROAD_CELL := 48.0
const SEAM_METERS := 24.0
const PAVEMENT := 0
const GRASS := 1
const SHORE_PATH := "res://assets/south-beach-height.json"
const SHORE_BLEND := 12.0

var core: Rect2
var detail: RefCounted
var origin: Vector2
var step: float
var columns: int
var rows: int
var heights: PackedFloat32Array
var shore_bounds := Rect2()
var shore_step := 4.0
var shore_columns := 0
var shore_rows := 0
var shore_heights := PackedFloat32Array()
var road_cells := {}
var road_sections: Array[Dictionary] = []


func setup(data: Dictionary, bounds: Array, detail_ground: RefCounted) -> void:
	detail = detail_ground
	core = Rect2(Vector2(bounds[0], bounds[1]), Vector2(bounds[2]-bounds[0], bounds[3]-bounds[1]))
	var spec: Dictionary = data.terrain
	origin = Vector2(spec.x, spec.z)
	step = spec.step
	columns = int(spec.width)
	rows = int(spec.depth)
	heights = PackedFloat32Array(spec.heights)
	_load_shore()
	for road: Dictionary in data.roads:
		var half := float(road.width)*0.5
		for segment in sections(road.points,half,half+sidewalk_width(road),road):
			var area: Rect2 = segment.bounds
			if core.encloses(area):
				continue
			road_sections.append(segment)
			var first := Vector2i((area.position / ROAD_CELL).floor())
			var last := Vector2i((area.end / ROAD_CELL).floor())
			for z in range(first.y, last.y+1):
				for x in range(first.x, last.x+1):
					var key := Vector2i(x,z)
					if not road_cells.has(key):
						road_cells[key] = []
					road_cells[key].append(segment)


func _load_shore() -> void:
	var shore: Variant = JSON.parse_string(FileAccess.get_file_as_string(SHORE_PATH))
	if not shore is Dictionary or int(shore.width)<2 or int(shore.depth)<2:
		return
	shore_columns = int(shore.width)
	shore_rows = int(shore.depth)
	shore_step = float(shore.step)
	shore_heights = PackedFloat32Array(shore.heights)
	if shore_heights.size()==shore_columns*shore_rows and shore_step>0.0:
		shore_bounds = Rect2(Vector2(shore.x,shore.z),Vector2(shore_columns-1,shore_rows-1)*shore_step)


static func sidewalk_width(road: Dictionary) -> float:
	return 2.75 if int(road["class"]) <= 5 else 1.0


static func outline_of(raw: Array) -> PackedVector2Array:
	var result := PackedVector2Array()
	for point: Array in raw:
		var p := Vector2(point[0],point[1])
		if result.is_empty() or result[-1] != p:
			result.append(p)
	if result.size() > 1 and result[0] == result[-1]:
		result.resize(result.size()-1)
	return result


static func bounds_of(points: PackedVector2Array) -> Rect2:
	var area := Rect2(points[0], Vector2.ZERO)
	for point in points:
		area = area.expand(point)
	return area


static func sections(raw: Array, half: float, sidewalk: float, road := {}) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var points := outline_of(raw)
	if raw.size() > 2 and raw[0] == raw[-1]:
		points.append(points[0])
	if points.size() < 2:
		return result
	var rank := int(road.get("class",7))
	var deck: Array = road.get("deck_y", [])
	var normals := PackedVector2Array()
	var first := (points[1]-points[0]).normalized().orthogonal()
	normals.append(first)
	for i in range(1,points.size()-1):
		var before := (points[i]-points[i-1]).normalized().orthogonal()
		var after := (points[i+1]-points[i]).normalized().orthogonal()
		var bisector := (before+after).normalized()
		if bisector.is_zero_approx():
			bisector = after
		normals.append(bisector / maxf(0.6, bisector.dot(after)))
	normals.append((points[-1]-points[-2]).normalized().orthogonal())
	var along := 0.0
	for i in range(1,points.size()):
		var a := points[i-1]
		var b := points[i]
		var n := normals[i-1]
		var m := normals[i]
		var paving := PackedVector2Array([a+n*sidewalk,b+m*sidewalk,b-m*sidewalk,a-n*sidewalk])
		var limits := bounds_of(paving)
		var asphalt := PackedVector2Array([a+n*half,b+m*half,b-m*half,a-n*half])
		result.append({"bounds":limits,"walk":paving,"road":asphalt,
				"at":a,"axis":(b-a).normalized(),"along":along,"rank":rank,"half":half,"length":a.distance_to(b),
				"deck":Vector2(deck[i-1],deck[i]) if deck.size() == points.size() else Vector2(INF,INF)})
		along += a.distance_to(b)
	return result


func _raw(x: float, z: float) -> float:
	var base := _sample_grid((x-origin.x)/step,(z-origin.y)/step,columns,rows,heights)
	var p := Vector2(x,z)
	if not shore_bounds.has_point(p):
		return base
	var inside := p-shore_bounds.position
	var to_edge := minf(minf(inside.x,inside.y),minf(shore_bounds.size.x-inside.x,shore_bounds.size.y-inside.y))
	var sampled := _sample_grid(inside.x/shore_step,inside.y/shore_step,shore_columns,shore_rows,shore_heights)
	return lerpf(base,sampled,smoothstep(0.0,SHORE_BLEND,to_edge))


static func _sample_grid(x: float,z: float,width: int,depth: int, values: PackedFloat32Array) -> float:
	var gx := clampf(x,0,width-1)
	var gz := clampf(z,0,depth-1)
	var ix := mini(floori(gx),width-2)
	var iz := mini(floori(gz),depth-2)
	var u := gx-ix
	var v := gz-iz
	var i := iz * width + ix
	var a := values[i]
	var b := values[i+1]
	var c := values[i+width]
	var d := values[i+width+1]
	# Both the mesh and this sampler split from (0,0) to (1,1).
	if u >= v:
		return a + (b-a)*u + (d-b)*v
	return a + (d-c)*u + (c-a)*v


func land_height(x: float, z: float) -> float:
	var p := Vector2(x,z)
	var edge := p.clamp(core.position, core.end)
	if edge == p:
		return detail.at(x,z)
	var y := _raw(x,z)
	var distance := edge.distance_to(p)
	if distance >= SEAM_METERS:
		return y
	var correction: float = detail.at(edge.x,edge.y) - _raw(edge.x,edge.y)
	return y + correction * (1.0-smoothstep(0.0, SEAM_METERS, distance))


# The original selects bridge or underpass by the traveller's previous height.
# The bit of asphalt baked into the core edge already includes the road lift.
func _surface(x: float, z: float, previous_height: float) -> Vector2:
	var p := Vector2(x,z)
	var land := land_height(x,z)
	var top := land
	var material := GRASS
	var key := Vector2i((p/ROAD_CELL).floor())
	for segment: Dictionary in road_cells.get(key, []):
		var area: Rect2 = segment.bounds
		if not area.has_point(p) or not Geometry2D.is_point_in_polygon(p,segment.walk):
			continue
		var roadway := Geometry2D.is_point_in_polygon(p,segment.road)
		var base := land
		var deck: Vector2 = segment.deck
		if is_finite(deck.x):
			var axis: Vector2 = segment.axis
			var start: Vector2 = segment.at
			var station := clampf((p-start).dot(axis)/float(segment.length),0.0,1.0)
			base = maxf(land,lerpf(deck.x,deck.y,station))
			if base-land >= 1.8 and is_finite(previous_height) and absf(previous_height-base) >= 2.5:
				continue
		var lift := road_lift(roadway,int(segment.rank)) * seam_lift(p)
		top = maxf(top,base+lift)
		material = PAVEMENT
	return Vector2(top,material)


static func road_lift(roadway: bool, rank: int) -> float:
	return (0.14 if roadway else 0.09) + (7-rank)*0.004


func seam_lift(p: Vector2) -> float:
	# Leave a few millimetres between both surfaces even on the common border.
	return lerpf(0.06,1.0,smoothstep(0.0,SEAM_METERS,p.distance_to(p.clamp(core.position,core.end))))


func at(x: float, z: float, previous_height := INF) -> float:
	var p := Vector2(x,z)
	if p.clamp(core.position,core.end) == p:
		return detail.at(x,z)
	return _surface(x,z,previous_height).x


func material_at(x: float, z: float) -> int:
	var p := Vector2(x,z)
	if p.clamp(core.position,core.end) == p:
		return detail.material_at(x,z)
	return int(_surface(x,z,INF).y)


func wheel_height(x: float, z: float, previous_height := INF) -> float:
	var p := Vector2(x,z)
	if p.clamp(core.position,core.end) == p:
		return detail.wheel_height(x,z)
	var surface := _surface(x,z,previous_height)
	if int(surface.y) != PAVEMENT:
		surface.x += sin(x*2.73+z*1.31) * sin(z*1.95-x*0.73) * 0.046
	return surface.x
