extends RefCounted

const DETAILS := preload("res://south_region_entrances.gd")
const GROUND := preload("res://south_region_ground.gd")

enum Wall { PANEL = 3, GARAGE = 7, INDUSTRIAL = 8, BRICK = 11, PLASTER = 12, WOOD = 13, CIVIC = 14 }
const GLASS := 15
const TRIM := 9


static func wall_type(house: Dictionary) -> int:
	var height := float(house.height)
	match str(house.kind):
		"gar":
			return Wall.GARAGE
		"ind":
			return Wall.INDUSTRIAL
		"priv":
			return Wall.WOOD
		"pub","off","shop","mall":
			return Wall.CIVIC
	if height < 8.5:
		return Wall.WOOD if float(house.seed) < .57 else Wall.PLASTER
	var color: Color = house.color
	if color.r > color.g*1.55 and color.r > color.b*1.42:
		return Wall.BRICK
	if height < 21.0:
		return Wall.BRICK if float(house.seed) < .48 else Wall.PLASTER
	return Wall.PANEL if float(house.seed) < .83 else Wall.PLASTER


static func bay_width(layer: int) -> float:
	match layer:
		Wall.BRICK:
			return 2.65
		Wall.WOOD:
			return 2.9
		Wall.CIVIC:
			return 4.4
		_:
			return 3.15


static func roof_profile(house: Dictionary, layer: int) -> Dictionary:
	# Keep the low roofs used by driving tricks flat at their physical height.
	if layer != Wall.WOOD or float(house.height) <= 6.5:
		return {}
	var outline: PackedVector2Array = house.outline
	var axis := Vector2.RIGHT
	var longest := 0.0
	for i in outline.size():
		var side := outline[i]-outline[i-1]
		if side.length_squared() > longest:
			longest = side.length_squared()
			axis = side.normalized()
	var normal := axis.orthogonal()
	var low := INF
	var high := -INF
	for at in outline:
		var offset := at.dot(normal)
		low = minf(low,offset)
		high = maxf(high,offset)
	var width := (high-low)*.5
	if width < 1.2 or width > 12.0:
		return {}
	return {"normal":normal,"ridge":(low+high)*.5,"width":width,"rise":minf(2.95,width*.62)}


static func roof_rise(p: Vector2, profile: Dictionary) -> float:
	if profile.is_empty():
		return 0.0
	return maxf(0.0,1.0-absf(_roof_side(p,profile))/float(profile.width))*float(profile.rise)


static func roof_halves(polygon: PackedVector2Array, profile: Dictionary) -> Array[PackedVector2Array]:
	if profile.is_empty():
		return [polygon]
	var result: Array[PackedVector2Array] = []
	for sign_: float in [-1.0,1.0]:
		var half := PackedVector2Array()
		for i in polygon.size():
			var a := polygon[i-1]
			var b := polygon[i]
			var da := _roof_side(a,profile)*sign_
			var db := _roof_side(b,profile)*sign_
			if (da < 0.0) != (db < 0.0):
				half.append(a.lerp(b,da/(da-db)))
			if db >= 0.0:
				half.append(b)
		if half.size() >= 3:
			result.append(half)
	return result


static func roof_edge(a: Vector2,b: Vector2,profile: Dictionary) -> PackedVector2Array:
	if profile.is_empty():
		return PackedVector2Array([a,b])
	var da := _roof_side(a,profile)
	var db := _roof_side(b,profile)
	if da*db < 0.0:
		return PackedVector2Array([a,a.lerp(b,da/(da-db)),b])
	return PackedVector2Array([a,b])


static func _roof_side(at: Vector2, profile: Dictionary) -> float:
	var normal: Vector2 = profile.normal
	return at.dot(normal)-float(profile.ridge)


static func accents(mesh: SurfaceTool, house: Dictionary, layer: int, wall_base: float, roof: float,
		ground: GROUND) -> void:
	var outline: PackedVector2Array = house.outline
	var seed := float(house.seed)
	var height := float(house.height)
	var winding := -1.0 if Geometry2D.is_polygon_clockwise(outline) else 1.0
	var concrete := Color("#b6a794").srgb_to_linear()
	var palette: Color = house.color
	for i in outline.size():
		var a := outline[i]
		var b := outline[(i+1)%outline.size()]
		var span := a.distance_to(b)
		if span < 2.4:
			continue
		var axis := a.direction_to(b)
		var outward := Vector2(axis.y,-axis.x)*winding
		var mid := (a+b)*.5
		if ground.core.grow(1.0).intersects(GROUND.bounds_of(PackedVector2Array([a,b])),true):
			continue
		var frame := _frame(mid,roof,outward)
		if layer == Wall.BRICK or layer == Wall.WOOD or layer == Wall.CIVIC:
			var eaves := concrete if layer != Wall.WOOD else Color("#544539").srgb_to_linear()
			DETAILS.box(mesh,frame,Vector3(0,0,.08),Vector3(span,.22,.33),eaves,TRIM)
		if layer == Wall.CIVIC and span >= 6.0:
			var awning := Color("#766651").srgb_to_linear().lerp(palette,.37)
			var low_frame := _frame(mid,wall_base,outward)
			DETAILS.box(mesh,low_frame,Vector3(0,3.12,.36),Vector3(span-.8,.27,.79),awning,TRIM)
			continue
		if height >= 10.0 and layer in [Wall.PANEL,Wall.BRICK,Wall.PLASTER]:
			_balcony_rows(mesh,house,ground,a,b,outward,wall_base,layer,concrete)


static func _balcony_rows(mesh: SurfaceTool, house: Dictionary, ground: GROUND, a: Vector2, b: Vector2,
		outward: Vector2, base: float, layer: int, concrete: Color) -> void:
	var span := a.distance_to(b)
	var bays := maxi(1,roundi(span/bay_width(layer)))
	if bays < 4:
		return
	var seed := float(house.seed)
	var floors := floori(float(house.height)/3.15)
	var palette: Color = house.color
	var rail := Color("#333e3c").srgb_to_linear().lerp(palette,0.18)
	var stride := 3 if layer == Wall.PANEL else 4
	var offset := 1+floori(seed*float(stride-1))
	for bay in range(offset,bays-1,stride):
		var at := a.lerp(b,(float(bay)+.5)/bays)
		if ground.core.grow(1.8).has_point(at):
			continue
		var frame := _frame(at,base,outward)
		var width := minf(span/bays*.87,2.55 if layer == Wall.PANEL else 1.92)
		var projection := .93 if layer == Wall.PANEL else .72
		for floor_ in range(1,floors):
			var balcony_y := float(floor_)*3.15+0.57
			var slab_color := concrete.lerp(palette,0.24)
			DETAILS.box(mesh,frame,Vector3(0,balcony_y-.10,projection*.47),Vector3(width,.20,projection),slab_color,TRIM)
			var enclosed := layer == Wall.PANEL and fposmod(floor_*0.381+seed+.17*bay,1.0)>.48
			if enclosed:
				var glass := Color("#728687").srgb_to_linear().lerp(palette,.09)
				var sash := Color("#ddded1").srgb_to_linear()
				DETAILS.box(mesh,frame,Vector3(0,balcony_y+1.64,projection-.025),Vector3(width,1.33,.062),glass,GLASS)
				DETAILS.box(mesh,frame,Vector3(0,balcony_y+2.34,projection*.48),Vector3(width,.10,projection),slab_color,TRIM)
				for side: float in [-1.0,1.0]:
					DETAILS.box(mesh,frame,Vector3(side*width*.48,balcony_y+1.56,projection*.50),
						Vector3(.075,1.48,projection),glass,GLASS)
				for bar: float in [-.48,-.16,.16,.48]:
					DETAILS.box(mesh,frame,Vector3(width*bar,balcony_y+1.64,projection+.025),
						Vector3(.055,1.43,.053),sash,TRIM)
			if layer == Wall.PANEL:
				DETAILS.box(mesh,frame,Vector3(0,balcony_y+.46,projection-.026),Vector3(width,.93,.074),
					rail.lerp(palette,.18+.21*seed),TRIM)
				for side: float in [-1.0,1.0]:
					DETAILS.box(mesh,frame,Vector3(side*width*.46,balcony_y+.46,projection*.49),
						Vector3(.07,.93,projection),rail,TRIM)
			else:
				DETAILS.box(mesh,frame,Vector3(0,balcony_y+.92,projection),Vector3(width,.075,.075),rail,TRIM)
				for bar: float in [-.48,-.31,-.15,0,.15,.31,.48]:
					DETAILS.box(mesh,frame,Vector3(width*bar,balcony_y+.44,projection),
						Vector3(.034,.89,.034),rail,TRIM)


static func _frame(at: Vector2, y: float, front: Vector2) -> Transform3D:
	return Transform3D(Basis(Vector3.UP,atan2(front.x,front.y)),Vector3(at.x,y,at.y))
