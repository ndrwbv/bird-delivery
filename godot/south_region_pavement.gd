extends RefCounted

const GROUND := preload("res://south_region_ground.gd")

# Cut raised paving against intersecting carriageways, including courtyard
# drives. A bridge only joins paving on its own level.
static func layout(roads: Array, ground: GROUND) -> Dictionary:
	var surfaces: Array[Dictionary] = []
	var edges: Array[Dictionary] = []
	var ordered := roads.duplicate()
	ordered.sort_custom(func(a: Dictionary,b: Dictionary) -> bool:
		return a.rank < b.rank or (a.rank == b.rank and a.id < b.id))
	for segment: Dictionary in ordered:
		var asphalt: Array[PackedVector2Array] = [segment.road]
		var crossings: Array[Dictionary] = []
		for other: Dictionary in ordered:
			if segment.id == other.id or not _same_level(segment,other,ground):
				continue
			crossings.append(other)
			if other.rank < segment.rank or (other.rank == segment.rank and other.id < segment.id):
				asphalt = _cut_surfaces(asphalt,other.road)
		_add_surface(surfaces,segment,asphalt,&"road")
		for curb: Dictionary in segment.curbs:
			var slab: Array[PackedVector2Array] = [curb.slab]
			var cap: Array[PackedVector2Array] = [curb.cap]
			var inner: Array[PackedVector2Array] = [curb.inner]
			var outer: Array[PackedVector2Array] = [curb.outer]
			for other: Dictionary in crossings:
				slab = _cut_surfaces(slab,other.road)
				cap = _cut_surfaces(cap,other.road)
				inner = _cut_lines(inner,other.road)
				outer = _cut_lines(outer,other.walk)
			_add_surface(surfaces,segment,slab,&"walk")
			_add_surface(surfaces,segment,cap,&"cap")
			for line in inner:
				edges.append({"segment":segment,"line":line,"inner":true})
			for line in outer:
				edges.append({"segment":segment,"line":line,"inner":false})
	return {"surfaces":surfaces,"edges":edges}


static func _same_level(a: Dictionary, b: Dictionary, ground: GROUND) -> bool:
	var a_bounds: Rect2 = a.bounds
	var overlap := a_bounds.intersection(b.bounds)
	if not overlap.has_area():
		return false
	var a_deck: Vector2 = a.deck
	var b_deck: Vector2 = b.deck
	if not is_finite(a_deck.x) and not is_finite(b_deck.x):
		return true
	var at := overlap.get_center()
	var land := ground.land_height(at.x,at.y)
	return absf(GROUND.paving_height(a,at,land)-GROUND.paving_height(b,at,land)) <= 0.70


static func _cut_surfaces(pieces: Array[PackedVector2Array], cutter: PackedVector2Array) -> Array[PackedVector2Array]:
	var result: Array[PackedVector2Array] = []
	var bounds := GROUND.bounds_of(cutter)
	for piece in pieces:
		if not GROUND.bounds_of(piece).intersects(bounds):
			result.append(piece)
			continue
		var clipped := Geometry2D.clip_polygons(piece,cutter)
		# A road may enclose a tiny island in the middle of a larger paved lot.
		# Split the containing polygon on the cutter's axis before subtracting.
		var has_hole := clipped.any(func(poly: PackedVector2Array) -> bool: return Geometry2D.is_polygon_clockwise(poly))
		if not has_hole:
			result.append_array(clipped)
			continue
		var limits := GROUND.bounds_of(piece).grow(1.0)
		var seam := bounds.get_center().x
		for rect: Rect2 in [Rect2(limits.position,Vector2(seam-limits.position.x,limits.size.y)),
				Rect2(seam,limits.position.y,limits.end.x-seam,limits.size.y)]:
			var a := rect.position
			var b := rect.end
			var quad := PackedVector2Array([a,Vector2(b.x,a.y),b,Vector2(a.x,b.y)])
			for half in Geometry2D.intersect_polygons(piece,quad):
				result.append_array(Geometry2D.clip_polygons(half,cutter))
	return result


static func _cut_lines(lines: Array[PackedVector2Array], cutter: PackedVector2Array) -> Array[PackedVector2Array]:
	var result: Array[PackedVector2Array] = []
	var bounds := GROUND.bounds_of(cutter)
	for line in lines:
		if GROUND.bounds_of(line).intersects(bounds,true):
			result.append_array(Geometry2D.clip_polyline_with_polygon(line,cutter))
		else:
			result.append(line)
	return result


static func _add_surface(output: Array[Dictionary], segment: Dictionary, pieces: Array[PackedVector2Array], kind: StringName) -> void:
	for polygon in pieces:
		if polygon.size() >= 3:
			output.append({"segment":segment,"outline":polygon,"bounds":GROUND.bounds_of(polygon),"kind":kind})
