extends RefCounted

# Shared live inputs for winterroads.js / snow.grip (all are fractions).
var winter := preload("res://south_winter_road.gd").new()
var wind := Vector2.ZERO
var snow := 0.0
var snow_cover := 1.0
var loose_snow := 0.0
var grit := 0.0
var rut := 0.0
var frozen := false
var ice := false
var wade := 0.0
var sand := 0.0
var water_depth := 0.0
var wading_beach := false
var ice_height := -INF
var ice_load := 0.0
var ice_stage := 0
var ground_grip := 1.0
var _beach := Vector2.INF
var _shore := Vector2(0.459,0.888).normalized()
var _streams := {}
var _sea := -INF
var _grip_timer := 0.0


func setup(region: Dictionary) -> void:
	winter.setup(Vector2(region.origin[0],region.origin[1]))
	_streams.clear()
	var beach_data: Array = region.get("beach",[])
	if beach_data.size() >= 2:
		_beach = Vector2(beach_data[0],beach_data[1])
	_sea = float(region.get("water_y",-INF))
	for stream: Dictionary in region.get("streams",[]):
		var half := float(stream.width)*0.5
		for i in range(1,stream.points.size()):
			var a := Vector2(stream.points[i-1][0],stream.points[i-1][1])
			var b := Vector2(stream.points[i][0],stream.points[i][1])
			if a.is_equal_approx(b):
				continue
			var bounds := Rect2(a,Vector2.ZERO).expand(b).grow(half)
			var section := Vector4(a.x,a.y,b.x,b.y)
			var first := Vector2i((bounds.position/48.0).floor())
			var last := Vector2i((bounds.end/48.0).floor())
			for z in range(first.y,last.y+1):
				for x in range(first.x,last.x+1):
					var key := Vector2i(x,z)
					if not _streams.has(key):
						_streams[key] = []
					_streams[key].append([section,half*half])


func step(at: Vector3, terrain: RefCounted, delta: float) -> void:
	var p := Vector2(at.x,at.z)
	wading_beach = false
	sand = _sand(p)
	wade = 0.0
	ice_height = -INF
	water_depth = 0.0
	ice = false
	for entry: Array in _streams.get(Vector2i((p/48.0).floor()),[]):
		var ends: Vector4 = entry[0]
		var near := Geometry2D.get_closest_point_to_segment(p,Vector2(ends.x,ends.y),Vector2(ends.z,ends.w))
		if p.distance_squared_to(near) >= float(entry[1]):
			continue
		var land: float = terrain.land_height(p.x,p.y)
		# The release excludes the road crossing and a bridge deck from wading.
		if terrain.material_at(p.x,p.y) != 0 and at.y-land < 0.6:
			ice = frozen and absf(at.y-land-0.058) < 0.4
			wade = 0.0 if frozen else 0.45
		break
	if is_finite(_sea):
		var ground: float = terrain.land_height(p.x,p.y)
		if ground < _sea-0.02 and terrain.at(p.x,p.y,at.y)-ground < 0.6:
			water_depth = _sea-ground
			if frozen:
				ice_height = _sea
				ice = absf(at.y-_sea) < 0.4
	_grip_timer -= delta
	if _grip_timer <= 0.0:
		_grip_timer = 0.2
		ground_grip = 0.85 if terrain.material_at(p.x,p.y) == 1 else 1.0
		if ice:
			ground_grip = 0.4


func breaks_ice(delta: float, speed: float, at_y: float) -> bool:
	if ice_height == -INF or at_y > ice_height+1.2 or water_depth < 0.5:
		ice_load = maxf(0.0,ice_load-0.2*delta)
	else:
		var rate := minf(0.6,0.10+0.22*(water_depth-0.5))
		ice_load += rate*(1.6 if absf(speed) < 2.0 else 1.0)*delta
	ice_stage = clampi(floori(ice_load*4.0),0,4)
	return ice_load >= 1.0


func water_level() -> float:
	return _sea


func wetness(rain: float) -> float:
	return minf(1.0,rain+snow*0.32*snow_cover*(1.0-0.45*grit)*(1.0-0.18*rut))


func _sand(p: Vector2) -> float:
	if p.distance_squared_to(_beach) > 110.0*110.0:
		return 0.0
	var offset := p-_beach
	var along := offset.dot(_shore)
	var inland := offset.dot(Vector2(_shore.y,-_shore.x))
	wading_beach = absf(along) <= 70.0 and inland > -62.0 and inland < 0.0
	if absf(along) > 70.0 or inland < -62.0:
		return 0.0
	var seed_value := sin(floorf(along/9.0)*12.9898+3.0*78.233+7.0*37.719)*43758.5453
	var edge := 22.0+(fposmod(seed_value,1.0)-0.5)*4.0+sin(along*0.11)*1.5
	var rounded := absf(along)-53.0
	if rounded > 0.0:
		edge -= 35.2*(1.0-sqrt(maxf(0.0,1.0-pow(rounded/16.0,2))))
	if inland > edge+1.0:
		return 0.0
	var strength := clampf((edge+1.0-inland)/3.0,0.0,1.0)
	if inland < -1.5/0.045:
		strength = 1.8
	return strength*(1.0-0.5*snow)
