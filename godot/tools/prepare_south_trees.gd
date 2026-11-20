extends SceneTree
## Bake the outer district's relief and planting from the same protected sites.

const GROUND := preload("res://south_region_ground.gd")
const PLANTING := preload("res://south_planting_catalog.gd")
const YARD_LAYOUT := preload("res://tools/south-yard-layout.gd")
const CELL := 32.0
const SEARCH := 16.0
const TREE_CELL := 8.0
const TREE_GAP := 5.15
const SURVEY_STEP := 4.25

var ground := GROUND.new()
var random := RandomNumberGenerator.new()
var contours := FastNoiseLite.new()
var banks := FastNoiseLite.new()
var habitat := FastNoiseLite.new()
var region: Dictionary
var core: Rect2
var boundary: PackedVector2Array
var obstacles := {}
var greens := {}
var occupied := {}
var open_yards := {}
var yard_layout := {}
var summer_park: Dictionary
var dry_count := 0
var stands := {}
var tree_count := 0
var cover_count := 0
var relief := PackedByteArray()


func _initialize() -> void:
	region = _read("south-region")
	var center: Dictionary = _read("south")
	var detail := preload("res://terrain_height.gd").new()
	detail.setup(_read("south-ground"),FileAccess.get_file_as_bytes("res://assets/south-ground.bin"))
	ground.setup(region,center.bounds,detail,false)
	core = ground.core.grow(4.0)
	boundary = GROUND.outline_of(region.boundary)
	random.seed = 241107
	_noise(contours,319,0.032)
	_noise(banks,822,0.091)
	_noise(habitat,740,0.022)
	summer_park = _read("summer_park")
	yard_layout = YARD_LAYOUT.create(region,center,ground,summer_park)
	for yard: Dictionary in yard_layout.lots:
		var outline := GROUND.outline_of(yard.outline)
		_bin(open_yards,GROUND.bounds_of(outline),{"poly":outline,"kind":yard.kind})
	_protect_sites()
	_bake_relief()
	for path: Dictionary in region.roads:
		_street(path)
		_verge(path)
	for house: Dictionary in region.buildings:
		_facade(house)
	_plant_open_land()
	var height_file := FileAccess.open(GROUND.RELIEF_PATH,FileAccess.WRITE)
	if height_file == null:
		quit(1)
		return
	height_file.store_buffer(relief)
	height_file.close()
	if not PLANTING.save(stands):
		quit(1)
		return
	var yard_file := FileAccess.open(YARD_LAYOUT.PATH,FileAccess.WRITE)
	if yard_file == null:
		quit(1)
		return
	yard_file.store_string(JSON.stringify(yard_layout)+"\n")
	yard_file.close()
	print("Godot South scenery: ",tree_count," trees (",dry_count," dry), ",cover_count," understory groups, ",
		relief.size()," relief samples")
	print("Courtyards: ",yard_layout.lots.size()," meadows and vacant lots, ",yard_layout.pitches.size(),
		" football fields and ",yard_layout.gym.size()," workout courts")
	quit()


func _protect_sites() -> void:
	for section: Dictionary in ground.road_sections:
		_reserve(section.walk,0.48)
	for stream: Dictionary in region.streams:
		_protect_path(stream.points,float(stream.width)*0.5+3.0)
	for rail: Dictionary in region.rails:
		_protect_path(rail.points,3.2)
	for house: Dictionary in region.buildings:
		_reserve(GROUND.outline_of(house.outline),1.25)
		for door: Dictionary in house.get("doors",[]):
			var at := _v(door.at)
			_lane(at,at+_v(door.normal)*3.5,1.6)
		if house.has("door"):
			_lane(_v(house.door),_v(house.approach),2.0)
	for yard: Dictionary in _read("south-yards").values():
		_lane(_v(yard.driveway),_v(yard.stop),3.5)
		_lane(_v(yard.stop),_v(yard.customer),1.5)
	for lot: Dictionary in region.parking_lots:
		_reserve(GROUND.outline_of(lot.outline),1.2)
		_lane(_v(lot.entry),_v(lot.at),4.5)
	for stop: Dictionary in region.stops:
		_lane(_v(stop.at),_v(stop.road),3.2)
	for green: Dictionary in region.greens:
		var poly := GROUND.outline_of(green.outline)
		if poly.size() < 3:
			continue
		if green.kind in ["pitch","play"]:
			_reserve(poly,1.6)
		else:
			_bin(greens,GROUND.bounds_of(poly),{"poly":poly,"kind":green.kind})
	var beach := _v(region.beach)
	_lane(beach,beach,37.0)
	var shore: Dictionary = _read("summer_shore")
	for item: Dictionary in shore.avoid:
		var at := Vector2(item.x,item.z)
		_lane(at,at,float(item.r)+0.45)
	var shop: Dictionary = _read("south-workshop")
	_lane(_v(shop.driveway),_v(shop.at),10.0)
	var tennis := _v(_read("summer_tennis").at)
	_lane(tennis,tennis,25.0)
	var park := summer_park
	for key in ["gym","kites"]:
		for feature: Dictionary in park.get(key,[]):
			var at := _v(feature.at)
			_lane(at,at,7.0)
	for facility: Dictionary in yard_layout.gym:
		var at := _v(facility.at)
		_lane(at,at,5.3)
	for pitch: Dictionary in park.pitches+yard_layout.pitches:
		var at := _v(pitch.at)
		var lengthwise := _v(pitch.axis)*float(pitch.length)*0.5
		var across := _v(pitch.axis).orthogonal()*float(pitch.width)*0.5
		_reserve(PackedVector2Array([at-lengthwise-across,at+lengthwise-across,
			at+lengthwise+across,at-lengthwise+across]),2.2)
	for ramp: Dictionary in _read("south-ramps"):
		var at := _v(ramp.at)
		_lane(at-_v(ramp.axis)*8.0,at+_v(ramp.axis)*14.0,4.5)
	for gate: Dictionary in region.gates:
		var at := _v(gate.at)
		_lane(at,at,13.0)
	for bench: Dictionary in _read("summer_yards").spots:
		var at := _v(bench.at)
		_lane(at,at,2.3)


func _bake_relief() -> void:
	var count := ground.relief_size
	relief.resize(count.x*count.y)
	relief.fill(128)
	for z in count.y:
		for x in count.x:
			var p := ground.origin + Vector2(x,z)*GROUND.RELIEF_STEP
			if ground.core.has_point(p):
				continue
			var height := ground.land_height(p.x,p.y)
			if height < float(region.water_y)+0.85:
				continue
			var room := _clearance(p)
			if room <= 0.0:
				continue
			var seam := smoothstep(3.0,GROUND.SEAM_METERS,p.distance_to(p.clamp(core.position,core.end)))
			var swell := contours.get_noise_2dv(p)*2.9 + banks.get_noise_2dv(p)*1.21
			var delta := swell*smoothstep(0.0,8.0,room)*seam*smoothstep(0.85,3.8,height-float(region.water_y))
			relief[z*count.x+x] = clampi(roundi(delta/GROUND.RELIEF_UNIT)+128,0,255)
	# Plant transforms follow the exact quantized height sampled in the game.
	ground.relief.resize(relief.size())
	for i in relief.size():
		ground.relief[i] = (relief[i]-128)*GROUND.RELIEF_UNIT


func _street(path: Dictionary) -> void:
	if path.has("deck_y"):
		return
	var edge := float(path.width)*0.5+GROUND.sidewalk_width(path)
	var interval := 6.6
	var along := random.randf_range(1.0,interval)
	for i in range(1,path.points.size()):
		var from := _v(path.points[i-1])
		var to := _v(path.points[i])
		var span := to.distance_to(from)
		var axis := from.direction_to(to)
		while along < span:
			var center := from+axis*along
			for side: float in [-1.0,1.0]:
				var out := axis.orthogonal()*side
				for offset: float in [1.7,2.6,3.9]:
					if _plant(center+out*(edge+offset),0.11,TREE_GAP,1.25):
						break
				_plant(center+axis*3.15+out*(edge+7.0),0.18,TREE_GAP,1.21)
			along += interval*random.randf_range(0.84,1.14)
		along -= span


func _facade(house: Dictionary) -> void:
	var outline := GROUND.outline_of(house.outline)
	if outline.size() < 3 or core.encloses(GROUND.bounds_of(outline)):
		return
	var winding := 0.0
	for i in outline.size():
		winding += outline[i-1].cross(outline[i])
	for i in outline.size():
		var a := outline[i-1]
		var b := outline[i]
		var axis := a.direction_to(b)
		var outward := Vector2(axis.y,-axis.x)*signf(winding)
		var width := a.distance_to(b)
		for along in range(3,floori(width)-2,6):
			for offset: float in [2.9,4.3,5.8]:
				if _plant(a+axis*along+outward*offset,0.12,TREE_GAP,1.10):
					break


func _verge(path: Dictionary) -> void:
	if path.has("deck_y"):
		return
	var offset := float(path.width)*.5+GROUND.sidewalk_width(path)+1.02
	var along := 1.5
	for i in range(1,path.points.size()):
		var a := _v(path.points[i-1])
		var b := _v(path.points[i])
		var axis := a.direction_to(b)
		var length := a.distance_to(b)
		while along < length:
			for side: float in [-1.0,1.0]:
				var p := a+axis*along+axis.orthogonal()*offset*side
				if _inside(p) and _clearance(p) > .38:
					var y := ground.land_height(p.x,p.y)
					if y > float(region.water_y)+0.75:
						_record(p,y,random.randf_range(.22,.43),PLANTING.GRASS)
			along += 2.85
		along -= length


func _plant_open_land() -> void:
	var bounds := GROUND.bounds_of(boundary)
	var grid := (bounds.size/SURVEY_STEP).ceil()
	for z in int(grid.y):
		for x in int(grid.x):
			var center := bounds.position+(Vector2(x,z)+Vector2(.5,.5))*SURVEY_STEP
			if not _inside(center):
				continue
			var density := habitat.get_noise_2dv(center)
			var woods := _green_at(center) in ["park","forest","wood"]
			var evergreen := 0.34 if woods else lerpf(0.10,0.28,smoothstep(-0.2,0.55,density))
			var p := center+Vector2(random.randf_range(-1.05,1.05),random.randf_range(-1.05,1.05))
			_plant(p,evergreen,TREE_GAP+0.7*(1.0-density),1.17)
			# Complete the gaps between rows except in deliberately open yards.
			_plant(center,evergreen,6.9,1.13)
			_understory(center,p,density)


func _understory(center: Vector2, scatter: Vector2, density: float) -> void:
	if not _inside(scatter):
		return
	var edge := _clearance(scatter)
	if edge < 0.34:
		return
	var height := ground.land_height(scatter.x,scatter.y)
	if height < float(region.water_y)+0.90:
		return
	var pick := random.randf()
	var clearing := _open_at(scatter)
	if clearing == "vacant" and pick > .44:
		return
	if not clearing.is_empty():
		_record(scatter,height,random.randf_range(.29,.76),PLANTING.GRASS if pick > .12 else PLANTING.STONE)
		return
	if pick < 0.40 and edge > 1.16 and _tree_room(scatter,1.45):
		_record(scatter,height,minf(edge*.59,random.randf_range(0.79,1.64)),PLANTING.SHRUB)
	elif pick < 0.43 and density < 0.05 and edge > 1.3:
		_record(scatter,height,random.randf_range(0.46,1.22),PLANTING.STONE)
	else:
		_record(scatter,height,minf(edge*.77,random.randf_range(0.60,1.32)),PLANTING.GRASS)
	var border := center.lerp(scatter,0.35)
	if edge > 1.1 and density > -0.27 and random.randf() < 0.35 and _clearance(border) > .9:
		_record(border,ground.land_height(border.x,border.y),random.randf_range(0.53,0.84),PLANTING.GRASS)


func _plant(p: Vector2, conifer_chance: float, gap: float, size: float) -> bool:
	if not _inside(p) or not _tree_room(p,gap):
		return false
	var room := _clearance(p)
	if room < .96:
		return false
	var y := ground.land_height(p.x,p.y)
	if y < float(region.water_y)+1.15:
		return false
	var clearing := _open_at(p)
	if not clearing.is_empty():
		return false
	var habitat_value := habitat.get_noise_2dv(p)
	var dry_chance := .045+.105*(1.0-smoothstep(-.60,.17,habitat_value))
	var kind := PLANTING.DRY if random.randf() < dry_chance else (
		PLANTING.SPRUCE if random.randf() < conifer_chance else random.randi_range(0,4))
	var height := clampf(size*random.randf_range(1.18,1.98),1.18,2.55)
	var width := minf(height*random.randf_range(.69,1.16),.75+room*.24)
	var age := random.randf()
	var bark := random.randf_range(.13,.22)
	if age > .26:
		bark = random.randf_range(.24,.39)
	if age > .77:
		bark = random.randf_range(.40,.58)
	if kind == PLANTING.DRY:
		dry_count += 1
	_record(p,y,height,kind,bark,width)
	var key := _tree_cell(p)
	if not occupied.has(key):
		occupied[key] = []
	occupied[key].append(p)
	return true


func _inside(p: Vector2) -> bool:
	return not core.has_point(p) and Geometry2D.is_point_in_polygon(p,boundary)


func _green_at(p: Vector2) -> String:
	for patch: Dictionary in greens.get(_cell(p),[]):
		if Geometry2D.is_point_in_polygon(p,patch.poly):
			return patch.kind
	return ""


func _open_at(p: Vector2) -> String:
	for patch: Dictionary in open_yards.get(_cell(p),[]):
		if Geometry2D.is_point_in_polygon(p,patch.poly):
			return patch.kind
	return ""


func _tree_room(p: Vector2, gap: float) -> bool:
	var cell := _tree_cell(p)
	for dz in [-1,0,1]:
		for dx in [-1,0,1]:
			for other: Vector2 in occupied.get(cell+Vector2i(dx,dz),[]):
				if p.distance_squared_to(other) < gap*gap:
					return false
	return true


func _clearance(p: Vector2) -> float:
	var distance := SEARCH
	for entry: Dictionary in obstacles.get(_cell(p),[]):
		var shape: PackedVector2Array = entry.shape
		var bounds: Rect2 = entry.bounds
		if not bounds.has_point(p):
			continue
		if shape.size() >= 3 and Geometry2D.is_point_in_polygon(p,shape):
			return 0.0
		var closest := p.distance_squared_to(shape[0])
		for i in range(1,shape.size()+1):
			var a := shape[i-1]
			var b := shape[i%shape.size()]
			if a != b:
				closest = minf(closest,p.distance_squared_to(Geometry2D.get_closest_point_to_segment(p,a,b)))
		distance = minf(distance,sqrt(closest)-float(entry.pad))
		if distance <= 0.0:
			return 0.0
	return distance


func _protect_path(points: Array, radius: float) -> void:
	for i in range(1,points.size()):
		_lane(_v(points[i-1]),_v(points[i]),radius)


func _lane(a: Vector2,b: Vector2,radius: float) -> void:
	_reserve(PackedVector2Array([a,b]),radius)


func _reserve(shape: PackedVector2Array, pad: float) -> void:
	if shape.is_empty():
		return
	var area := GROUND.bounds_of(shape).grow(SEARCH+pad)
	_bin(obstacles,area,{"bounds":area,"shape":shape,"pad":pad})


func _bin(index: Dictionary, area: Rect2, entry: Dictionary) -> void:
	var low := _cell(area.position)
	var high := _cell(area.end)
	for z in range(low.y,high.y+1):
		for x in range(low.x,high.x+1):
			var key := Vector2i(x,z)
			if not index.has(key):
				index[key] = []
			index[key].append(entry)


func _record(p: Vector2,y: float,scale: float,kind: int,bark := 0.0,width := 0.0) -> void:
	var key := PLANTING.tile_at(p)
	if not stands.has(key):
		stands[key] = []
	stands[key].append([p.x,y,p.y,scale,kind,random.randf()*TAU,bark,tree_count+cover_count,width])
	if PLANTING.is_tree(kind):
		tree_count += 1
	else:
		cover_count += 1


func _noise(layer: FastNoiseLite, seed_: int, frequency: float) -> void:
	layer.seed = seed_
	layer.frequency = frequency
	layer.fractal_type = FastNoiseLite.FRACTAL_NONE


func _tree_cell(at: Vector2) -> Vector2i:
	return Vector2i((at/TREE_CELL).floor())


func _cell(at: Vector2) -> Vector2i:
	return Vector2i((at/CELL).floor())


func _v(point: Array) -> Vector2:
	return Vector2(point[0],point[1])


func _read(name_: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string("res://assets/"+name_+".json"))

