extends SceneTree

const GROUND := preload("res://south_region_ground.gd")
const EDGE := preload("res://south_region_edge.gd")
const SPACING := 13.0

var ground := GROUND.new()
var edge := EDGE.new()
var roads := preload("res://south_region_routes.gd").new()
var random := RandomNumberGenerator.new()
var region: Dictionary
var core: Rect2
var unavailable := {}
var trees: Array[Array] = []
var occupied := {}


func _initialize() -> void:
	region = _read("south-region")
	var center: Dictionary = _read("south")
	var detail := preload("res://terrain_height.gd").new()
	detail.setup(_read("south-ground"),FileAccess.get_file_as_bytes("res://assets/south-ground.bin"))
	ground.setup(region,center.bounds,detail)
	core = ground.core.grow(4)
	edge.setup(region.boundary)
	roads.setup(region,center)
	random.seed = 241107
	for place: Dictionary in region.stops + region.parking_lots:
		_reserve(_v(place.at), _v(place.get("entry",place.at)), 11.0)
	for drive: Dictionary in _read("south-yards").values():
		_reserve(_v(drive.driveway), _v(drive.stop), 4.5)
	for key in ["beach","garage"]:
		var point := _v(region[key])
		_reserve(point,point,42.0)
	var shop := _read("south-workshop")
	_reserve(_v(shop.driveway),_v(shop.at),10.0)
	for gate: Dictionary in region.gates:
		_reserve(_v(gate.at),_v(gate.at),26.0)

	for path: Dictionary in region.roads:
		_street(path)
	for park: Dictionary in region.greens:
		if park.kind in ["park","wood","forest"]:
			_park(park)
	var output := FileAccess.open("res://assets/south-outer-trees.json",FileAccess.WRITE)
	if output == null:
		quit(1)
		return
	output.store_string(JSON.stringify(trees)+"\n")
	print("Prepared ",trees.size()," trees beyond the detailed block")
	quit()


func _street(path: Dictionary) -> void:
	if int(path["class"]) not in [2,3,4] or path.has("deck_y"):
		return
	var along := random.randf_range(8,18)
	for i in range(1,path.points.size()):
		var from := _v(path.points[i-1])
		var to := _v(path.points[i])
		var span := to.distance_to(from)
		var axis := from.direction_to(to)
		var verge := axis.orthogonal()*(float(path.width)*.5+3.8)
		while along < span:
			if along >= 3.5 and span-along >= 3.5:
				var center := from+axis*along
				_plant(center+verge,false)
				_plant(center-verge,false)
			along += SPACING
		along -= span


func _park(park: Dictionary) -> void:
	var outline := GROUND.outline_of(park.outline)
	var bounds := GROUND.bounds_of(outline)
	var woods: bool = park.kind in ["wood","forest"]
	var gap := 15.0 if woods else 22.0
	for j in ceili(bounds.size.y/gap):
		for i in ceili(bounds.size.x/gap):
			var point := bounds.position+(Vector2(i,j)+Vector2(random.randf(),random.randf()))*gap
			if Geometry2D.is_point_in_polygon(point,outline):
				_plant(point,woods and random.randf()<.46)


func _reserve(from: Vector2,to: Vector2,radius: float) -> void:
	var area := Rect2(from,Vector2.ZERO).expand(to).grow(radius)
	var low := _cell(area.position)
	var high := _cell(area.end)
	for z in range(low.y,high.y+1):
		for x in range(low.x,high.x+1):
			var key := Vector2i(x,z)
			if not unavailable.has(key):
				unavailable[key] = []
			unavailable[key].append([from,to,radius*radius])


func _plant(point: Vector2, evergreen: bool) -> void:
	if core.has_point(point) or not Geometry2D.is_point_in_polygon(point,edge.polygon):
		return
	var y := ground.land_height(point.x,point.y)
	if y < float(region.water_y)+.6 or ground.material_at(point.x,point.y) == GROUND.PAVEMENT:
		return
	# Keep space for doors, turns and sidewalks. The trunk must be clear in both axes.
	if not roads.walk_clear(point-Vector2(3,0),point+Vector2(3,0)) or not roads.walk_clear(point-Vector2(0,3),point+Vector2(0,3)):
		return
	var cell := _cell(point)
	for lane: Array in unavailable.get(cell,[]):
		var near: Vector2 = lane[0] if lane[0] == lane[1] else Geometry2D.get_closest_point_to_segment(point,lane[0],lane[1])
		if point.distance_squared_to(near) < float(lane[2]):
			return
	for dx in [-1,0,1]:
		for dz in [-1,0,1]:
			for neighbor: Vector2 in occupied.get(cell+Vector2i(dx,dz),[]):
				if point.distance_squared_to(neighbor) < 64:
					return
	if not occupied.has(cell):
		occupied[cell] = []
	occupied[cell].append(point)
	trees.append([snappedf(point.x,.01),snappedf(y,.01),snappedf(point.y,.01),snappedf(random.randf_range(0.8,1.65),.01),
		5 if evergreen else random.randi_range(0,4),snappedf(random.randf()*TAU,.01)])


func _cell(at: Vector2) -> Vector2i:
	return Vector2i((at/16).floor())


func _v(point: Array) -> Vector2:
	return Vector2(point[0],point[1])


func _read(name_: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://assets/"+name_+".json"))
