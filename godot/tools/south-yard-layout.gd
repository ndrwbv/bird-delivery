extends RefCounted

const GROUND := preload("res://south_region_ground.gd")
const ROUTES := preload("res://south_region_routes.gd")
const PATH := "res://assets/south-yard-spaces.json"

# Select the mapped enclaves by location. Their footprint follows the city data.
const OPEN_YARDS := {
	Vector2(-130,458):"vacant",
	Vector2(-192,678):"meadow",
	Vector2(-213,749):"vacant",
	Vector2(214,-624):"meadow",
	Vector2(5,-666):"vacant",
	Vector2(436,-388):"meadow",
	Vector2(-703,547):"vacant",
}
const COURTYARD_PLAY := {
	Vector2(-479,-37):"pitch",
	Vector2(-609,103):"gym",
	Vector2(570,203):"gym",
	Vector2(472,289):"pitch",
	Vector2(-349,465):"gym",
	Vector2(-926,-313):"gym",
}


static func create(region: Dictionary, center: Dictionary, ground: GROUND, park: Dictionary) -> Dictionary:
	var output := {"lots":[],"pitches":[],"gym":[]}
	var roads := ROUTES.new()
	roads.setup(region,center)
	for patch: Dictionary in region.greens:
		if patch.kind not in ["green","play"]:
			continue
		var outline := GROUND.outline_of(patch.outline)
		if outline.size() < 3:
			continue
		var at := Vector2.ZERO
		for p in outline:
			at += p
		at /= outline.size()
		if ground.core.grow(4.0).has_point(at):
			continue
		if patch.kind == "green":
			var type := _near_tag(at,OPEN_YARDS)
			if not type.is_empty():
				output.lots.append({"kind":type,"outline":patch.outline})
			continue
		var type := _near_tag(at,COURTYARD_PLAY)
		if type.is_empty():
			continue
		var axis := _long_axis(outline)
		if type == "pitch":
			var spot := _recreation_spot(outline,at,axis,Vector2(11.0,6.4),ground,roads,park.pitches+output.pitches)
			if is_finite(spot.x):
				output.pitches.append({"at":[spot.x,spot.y],"axis":[axis.x,axis.y],"length":20.0,"width":10.5,
					"baked":false,"courtyard":true})
				continue
		var pad := _recreation_spot(outline,at,axis,Vector2(3.1,2.4),ground,roads,park.gym+output.gym)
		if is_finite(pad.x):
			var color := "#916647" if pad.x < -400 else "#54758a"
			output.gym.append({"at":[pad.x,pad.y],"axis":[axis.x,axis.y],"color":color,"baked":false})
	return output


static func _near_tag(at: Vector2, options: Dictionary) -> String:
	for near: Vector2 in options:
		if at.distance_squared_to(near) < 8.0*8.0:
			return options[near]
	return ""


static func _long_axis(outline: PackedVector2Array) -> Vector2:
	var axis := Vector2.RIGHT
	var size := 0.0
	for i in outline.size():
		var side := outline[i]-outline[i-1]
		if side.length_squared() > size:
			size = side.length_squared()
			axis = side.normalized()
	return axis


static func _recreation_spot(outline: PackedVector2Array, middle: Vector2, axis: Vector2, half: Vector2,
		ground: GROUND, roads: ROUTES, neighbors: Array) -> Vector2:
	var side := axis.orthogonal()
	for lateral: float in [0.0,-3.0,3.0,-7.0,7.0,-11.0,11.0]:
		for along: float in [0.0,-4.0,4.0,-9.0,9.0,-14.0,14.0]:
			var at := middle+axis*along+side*lateral
			if _available(at,axis,side,half,outline,ground,roads,neighbors):
				return at
	return Vector2(INF,INF)


static func _available(at: Vector2, axis: Vector2, side: Vector2, half: Vector2, outline: PackedVector2Array,
		ground: GROUND, roads: ROUTES, neighbors: Array) -> bool:
	for other: Dictionary in neighbors:
		if at.distance_squared_to(Vector2(other.at[0],other.at[1])) < 31.0*31.0:
			return false
	var altitude := ground.land_height(at.x,at.y)
	for z: float in [-1.0,0.0,1.0]:
		var row := at+side*half.y*z
		if not roads.walk_clear(row-axis*half.x,row+axis*half.x):
			return false
		for x: float in [-1.0,-.5,0.0,.5,1.0]:
			var p := row+axis*half.x*x
			if not Geometry2D.is_point_in_polygon(p,outline) or ground.material_at(p.x,p.y) == GROUND.PAVEMENT:
				return false
			if absf(ground.land_height(p.x,p.y)-altitude) > 1.26:
				return false
	return true
