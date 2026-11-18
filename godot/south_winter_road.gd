extends RefCounted

const FILE := "res://assets/south-winter-roads.bin"
const WHEEL_TARGET := 0.88
const WHEEL_SIDES := [-0.89,0.89,-0.89,0.89]
const WHEEL_ALONG := [1.4,1.4,-1.45,-1.45]
var from_cell := Vector2i.ZERO
var size := Vector2i.ZERO
var directory := PackedByteArray()
var file: FileAccess
var cache := {}
var marks := {}
var last := PackedVector2Array([Vector2.INF,Vector2.INF,Vector2.INF,Vector2.INF])
var support := PackedFloat32Array([0,0,0,0])
var city_origin := Vector2.ZERO
var result := Vector4.ZERO # softness, grit, directional rut, snow film
var _depth := 0.0
var _compact := 0.0
var _sand := 0.0
var _rut := 0.0
var _deform := false

class Section:
	var a: Vector2
	var axis: Vector2
	var length: float
	var width: float
	var lanes: int
	var rank: int
	var mode: int
	var bridge: bool
	var score: float
	var corridor: int
	var gaps: PackedFloat32Array

	func _init(r: Array) -> void:
		a = Vector2(r[0],r[1])
		var end := Vector2(r[2],r[3])
		length = a.distance_to(end)
		axis = a.direction_to(end)
		width = r[4]
		lanes = int(r[5])
		rank = int(r[6])
		mode = int(r[7])
		bridge = bool(r[8])
		score = (8-rank)*10000+(1000 if mode==2 else (500 if mode==1 else 0))+width
		corridor = int(r[9])
		gaps = PackedFloat32Array(r[10])

class Bank:
	var a: Vector2
	var axis: Vector2
	var length: float
	var width: float
	var base: float
	var height: float
	var phase: float
	var bridge: bool

	func _init(r: Array) -> void:
		a = Vector2(r[0],r[1])
		axis = Vector2(r[2],r[3]).normalized()
		length = r[4]
		width = r[5]
		base = r[6]
		height = r[7]
		phase = r[8]
		bridge = bool(r[9])

	func depth_at(p: Vector2) -> float:
		var dx := p-a
		var d := dx.dot(axis)
		if d <= 0.0 or d >= length:
			return 0.0
		var t := d/length
		var ends := smoothstep(0.0,minf(2.3,length*0.5),minf(d,length-d))
		var mid := width*0.08*sin(t*TAU+phase)*sin(t*PI)
		var lateral := (axis.cross(dx)-mid)/maxf(0.001,width*0.5*sqrt(ends))
		if absf(lateral) >= 1.0:
			return 0.0
		var h := (base+height*(0.91+0.09*sin(t*PI*3.0+phase)))*ends
		return h*pow(1.0-lateral*lateral,2)

class TireTile:
	var bytes := PackedByteArray()

	func _init() -> void:
		bytes.resize(64*64)


class Cell:
	var roads: Array[Section] = []
	var banks: Array[Bank] = []


func setup(origin: Vector2) -> void:
	city_origin = origin


func _open_catalog() -> void:
	file = FileAccess.open(FILE,FileAccess.READ)
	if file == null:
		return
	var info := file.get_buffer(16)
	from_cell = Vector2i(info.decode_s32(0),info.decode_s32(4))
	size = Vector2i(info.decode_s32(8),info.decode_s32(12))
	directory = file.get_buffer(size.x*size.y*8)


func _cell(p: Vector2) -> Cell:
	var key := Vector2i((p/32.0).floor())
	if cache.has(key):
		return cache[key]
	var c := Cell.new()
	if file == null and directory.is_empty():
		_open_catalog()
	var local := key-from_cell
	if file != null and local.x>=0 and local.y>=0 and local.x<size.x and local.y<size.y:
		var i := (local.y*size.x+local.x)*8
		var len_bytes := directory.decode_u32(i+4)
		if len_bytes > 0:
			file.seek(directory.decode_u32(i))
			var lines: Array = JSON.parse_string(file.get_buffer(len_bytes).get_string_from_utf8())
			for r: Array in lines[0]:
				c.roads.append(Section.new(r))
			for b: Array in lines[1]:
				c.banks.append(Bank.new(b))
	if cache.size()>=48:
		cache.erase(cache.keys()[0])
	cache[key] = c
	return c


# Ground and each elevated road have separate contact footprints. Tire compaction
# is stored in 8 m tiles with the release's 12.5 cm samples and 0.24 m footprint.
func _pressed(p: Vector2, bridge: bool, weight: float) -> float:
	var gx := floori(p.x*8.0)
	var gz := floori(p.y*8.0)
	var key := Vector3i(floori(gx/64.0),floori(gz/64.0),int(bridge))
	var k := posmod(gz,64)*64+posmod(gx,64)
	var tile: TireTile = marks.get(key)
	if tile == null:
		if weight <= 0.0:
			return 0.0
		tile = TireTile.new()
		if marks.size() >= 64:
			marks.erase(marks.keys()[0])
		marks[key] = tile
	var compact := float(tile.bytes[k])/255.0
	if weight > 0.0 and compact < WHEEL_TARGET:
		compact = lerpf(maxf(compact,_compact),WHEEL_TARGET,weight)
		tile.bytes[k] = roundi(compact*255.0)
	return compact


func _track(p: Vector2, direction: Vector2, i: int, bridge: bool, delta: float) -> void:
	var distance := p.distance_to(last[i])
	if not last[i].is_finite() or distance > 12.0:
		distance = 0.0
	var steps := maxi(1,ceili(distance/0.125))
	var from := p if distance <= 0.0 else last[i]
	var weight := 1.0-exp(-32.0*delta)
	var side := Vector2(direction.y,-direction.x)*0.085
	for s in steps:
		var path := from.lerp(p,float(s+1)/steps)
		_pressed(path,bridge,weight)
		_pressed(path+side,bridge,weight)
		_pressed(path-side,bridge,weight)


func _hash(x: int, z: int) -> float:
	var h := ((x*374761393)^(z*668265263))&0xffffffff
	h = ((h^(h>>13))*1274126177)&0xffffffff
	return float((h^(h>>16))&0xffffffff)/4294967295.0


func _noise(p: Vector2, scale_value: float) -> float:
	var q := p/scale_value
	var c := Vector2i(q.floor())
	var t := q-Vector2(c)
	t = t*t*(Vector2(3,3)-2.0*t)
	return lerpf(lerpf(_hash(c.x,c.y),_hash(c.x+1,c.y),t.x),
		lerpf(_hash(c.x,c.y+1),_hash(c.x+1,c.y+1),t.x),t.y)


func _surface(p: Vector2, forward: Vector2, c: Cell, material: int, bridge: bool) -> void:
	var best: Section
	var best_off := 0.0
	var best_along := 0.0
	var score := -INF
	for r in c.roads:
		if r.bridge != bridge or r.score<score or (best!=null and r.score==score and r.corridor>=best.corridor):
			continue
		var d := p-r.a
		var along := d.dot(r.axis)
		var off := r.axis.cross(d)
		if along < -0.1 or along>r.length+0.1 or absf(off)>r.width*0.5+0.03:
			continue
		score = r.score
		best = r
		best_off = off
		best_along = along
	var mask := 1.0
	_sand = 0.0
	_rut = 0.0
	_deform = material != 0
	_depth = 0.30
	_compact = 0.0
	if best != null:
		var clear := 1.0
		if best.mode != 2:
			for r in c.roads:
				if r.mode!=2 or r.rank>best.rank or r.bridge!=bridge:
					continue
				var d := p-r.a
				var along := d.dot(r.axis)
				if along >= -0.1 and along <= r.length+0.1:
					clear = minf(clear,smoothstep(0.0,8.0,absf(r.axis.cross(d))-r.width*0.5))
		var edge := best.width*0.5-absf(best_off)
		var lane := clampi(floori((best_off/best.width+0.5)*best.lanes),0,best.lanes-1)
		var lane_middle := (float(lane)+0.5-best.lanes*0.5)*best.width/best.lanes
		var wheel := minf(0.78,best.width/(best.lanes*2.8))
		var tread := 1.0-smoothstep(0.06,0.30,absf(absf(best_off-lane_middle)-wheel))
		var fade := 1.0
		for i in range(0,best.gaps.size(),3):
			fade = minf(fade,smoothstep(0.0,best.gaps[i+2],absf(best_along-best.gaps[i])-best.gaps[i+1]))
		tread *= fade
		_rut = tread*maxf(0.0,(absf(best.axis.dot(forward))-0.8)*5.0)
		_sand = smoothstep(0.0,0.45,edge)*0.65 if best.mode == 1 else 0.0
		_depth = 0.002 if best.mode == 2 else 0.026*clear
		_compact = 0.78+tread*0.15
		_deform = false
		mask = smoothstep(0.0,0.7,1.6-edge)*(1.0 if best.mode==2 else clear)
	elif material == 0:
		_depth = 0.08+0.04*_noise(p+city_origin,3.0)
		_compact = 0.65
	else:
		_depth += 0.12*_noise(p+city_origin+Vector2(19,-7),4.0)+0.025*_noise(p+city_origin,1.2)
	if mask < 0.0001:
		return
	var mound := 0.0
	for bank in c.banks:
		if bank.bridge == bridge:
			mound = maxf(mound,bank.depth_at(p)*mask)
	if mound > (_depth+0.004 if best!=null else (0.008 if material==0 else _depth)):
		_depth = mound
		_compact = 0.12
		_deform = true


func sample(car_position: Vector3, forward: Vector2, terrain: RefCounted, snow: float, delta: float, grounded: bool, wheel_rest: Array[Vector3]) -> void:
	result = Vector4.ZERO
	support.fill(0.0)
	var season := smoothstep(0.04,0.9,snow)
	if season<=0.0001 or not grounded:
		last.fill(Vector2.INF)
		return
	var at := Vector2(car_position.x,car_position.z)
	var side := Vector2(-forward.y,forward.x)
	var bridge: bool = car_position.y-terrain.land_height(at.x,at.y)>1.8
	for i in 4:
		var local := Vector2(WHEEL_SIDES[i],WHEEL_ALONG[i])
		if wheel_rest.size()==4:
			local = Vector2(wheel_rest[i].x,-wheel_rest[i].z)
		var p := at+side*local.x+forward*local.y
		var c := _cell(p)
		_surface(p,forward,c,terrain.material_at(p.x,p.y),bridge)
		var original := _compact
		var compact := maxf(_compact,_pressed(p,bridge,0.0)) if _deform else _compact
		var mass := _depth*(120.0+330.0*original)*season
		var thickness := mass/(120.0+330.0*compact)
		var loose := thickness*(1.0-compact)
		result.x += minf(1.0,loose/0.18)*(1.0-compact)*0.25
		result.y += _sand*0.25
		result.z += _rut*0.25
		result.w += minf(1.0,thickness/0.025)*0.25
		support[i] = minf(0.16,mass/(120.0+330.0*maxf(WHEEL_TARGET,compact))*(1.0-minf(0.7,loose)))
		if _deform:
			_track(p,forward,i,bridge,delta)
		last[i] = p
