extends RefCounted

const GROUND := preload("res://south_region_ground.gd")
const CELL := 32.0
const STEP := .8
const MAX_HEIGHT := 6.5
const MIN_WIDTH := 3.2
var ground: RefCounted
var cells := {}


func setup(buildings: Array, surface: RefCounted) -> void:
	ground = surface
	cells.clear()
	for building: Dictionary in buildings:
		var height := float(building.height)
		if height > MAX_HEIGHT:
			continue
		var outline := GROUND.outline_of(building.outline)
		if outline.size() < 3:
			continue
		var bounds := GROUND.bounds_of(outline)
		if minf(bounds.size.x,bounds.size.y) < MIN_WIDTH:
			continue
		var low := INF
		var high := -INF
		for vertex in outline:
			var y: float = ground.land_height(vertex.x,vertex.y)
			low = minf(low,y)
			high = maxf(high,y)
		var roof := high+maxf(2.5,height)
		if roof-low > MAX_HEIGHT:
			continue
		var entry := {"roof":roof,"outline":outline,"bounds":bounds}
		var a := _cell(bounds.position)
		var b := _cell(bounds.end)
		for x in range(a.x,b.x+1):
			for z in range(a.y,b.y+1):
				var id := Vector2i(x,z)
				if not cells.has(id):
					cells[id] = []
				cells[id].append(entry)


func support(x: float, z: float, height: float, fallback: float) -> float:
	var at := Vector2(x,z)
	var y := fallback
	for entry: Dictionary in cells.get(_cell(at),[]):
		if height+STEP >= float(entry.roof) and entry.bounds.has_point(at) and Geometry2D.is_point_in_polygon(at,entry.outline):
			y = maxf(y,float(entry.roof))
	return y


func _cell(at: Vector2) -> Vector2i:
	return Vector2i((at/CELL).floor())
