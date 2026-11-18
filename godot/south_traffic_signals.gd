extends Node3D

signal changed_route(a: Vector2, b: Vector2)

var march_speed := Callable()
var lane_shift := Callable()
var extra_speed_limits: Array[Callable] = []

const TIME := [14.0,2.5,2.0,11.0,2.5,2.0]
const ACTIVE := [0,0,-1,1,1,-1]
const LIGHT := [0,1,2,0,1,2] # green, yellow, red

var phase := 0
var elapsed := 0.0
var signals := {}
var zebras: Array[Dictionary] = []
var zebra_cells := {}
var lamps: Array[Dictionary] = []


func setup(ground: RefCounted, core: Array) -> void:
	var raw: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-crossings.json"))
	var core_area := Rect2(Vector2(core[0],core[1]),Vector2(core[2]-core[0],core[3]-core[1]))
	var stripes: Array[Transform3D] = []
	var poles: Array[Transform3D] = []
	var cases: Array[Transform3D] = []
	var lenses := [[],[],[],[],[],[]]
	for value: Array in raw.crossings:
		var zebra := _read(value)
		zebra.occupied = false
		zebras.append(zebra)
		_index(zebra_cells,zebra)
		# The detailed central mesh already has the white stripes.
		var p: Vector2 = zebra.p
		if core_area.has_point(p):
			continue
		var axis: Vector2 = zebra.dir
		var right := Vector2(-axis.y,axis.x)
		var width: float = zebra.width
		var bars := maxi(2,floori(width/0.95))
		for i in bars:
			var q := p+right*((i+0.5)/bars-0.5)*width
			var y: float = ground.at(q.x,q.y)+0.035
			stripes.append(Transform3D(Basis(Vector3.UP,atan2(axis.x,axis.y)),Vector3(q.x,y,q.y)))
	for value: Array in raw.signals:
		var light := _read(value)
		_index(signals,light)
		var axis: Vector2 = light.dir
		var roadside := Vector2(-axis.y,axis.x)*(float(light.width)*0.5+0.65)
		var q: Vector2 = light.p+roadside
		var y: float = ground.at(q.x,q.y)
		var basis := Basis(Vector3.UP,atan2(axis.x,axis.y))
		poles.append(Transform3D(basis,Vector3(q.x,y+1.65,q.y)))
		cases.append(Transform3D(basis,Vector3(q.x,y+3.23,q.y)))
		for i in 3:
			var v := Vector3(q.x-axis.x*0.16,y+2.96+i*0.255,q.y-axis.y*0.16)
			lenses[int(light.phase)*3+i].append(Transform3D(basis,v))
	_shapes(stripes,Vector3(0.44,0.016,3.4),Color("#e4e4d9"))
	_shapes(poles,Vector3(0.09,3.30,0.09),Color("#646a65"))
	_shapes(cases,Vector3(0.34,0.85,0.28),Color("#272923"))
	for i in lenses.size():
		var color: Color = [Color("#54ed70"),Color("#ffc736"),Color("#ef3c32")][i%3]
		var mesh := SphereMesh.new()
		mesh.radius = 0.10
		mesh.height = 0.20
		mesh.radial_segments = 8
		mesh.rings = 4
		var paint := StandardMaterial3D.new()
		paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mesh.material = paint
		_batch(mesh,lenses[i])
		lamps.append({"paint":paint,"color":color})
	_lights()


func _read(value: Array) -> Dictionary:
	return {"p":Vector2(value[0],value[1]),"dir":Vector2(value[2],value[3]).normalized(),
		"width":float(value[4]),"phase":int(value[5])}


func _index(index: Dictionary, data: Dictionary) -> void:
	var at: Vector2 = data.p
	# Duplicate into adjacent cells once, so a traffic tick visits a single array.
	var lo := Vector2i(((at-Vector2.ONE*40.0)/80.0).floor())
	var hi := Vector2i(((at+Vector2.ONE*40.0)/80.0).floor())
	for z in range(lo.y,hi.y+1):
		for x in range(lo.x,hi.x+1):
			var key := Vector2i(x,z)
			if not index.has(key):
				index[key] = []
			index[key].append(data)


func _shapes(transforms: Array, size_value: Vector3, color: Color) -> void:
	var shape := BoxMesh.new()
	shape.size = size_value
	var paint := StandardMaterial3D.new()
	paint.albedo_color = color
	shape.material = paint
	_batch(shape,transforms)


func _batch(mesh: Mesh, transforms: Array) -> void:
	if transforms.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i,transforms[i])
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)


func tick(delta: float) -> void:
	elapsed += delta
	if elapsed >= TIME[phase]:
		elapsed -= TIME[phase]
		phase = (phase+1)%TIME.size()
		_lights()


func light(group: int) -> int:
	return LIGHT[phase] if ACTIVE[phase] == group else 2


func _lights() -> void:
	for i in lamps.size():
		var color: Color = lamps[i].color
		lamps[i].paint.albedo_color = color if light(floori(i/3.0)) == i%3 else color.darkened(0.90)


func road_speed(at: Vector2, dir: Vector2, speed: float) -> float:
	var gain := float(march_speed.call(at,dir)) if march_speed.is_valid() else 1.0
	for limit in extra_speed_limits:
		if limit.is_valid():
			gain = minf(gain,float(limit.call(at,dir,speed)))
	var key := Vector2i((at/80.0).floor())
	for post: Dictionary in signals.get(key,[]):
		var state := light(post.phase)
		if state == 0 or dir.dot(post.dir) < 0.80:
			continue
		var delta: Vector2 = post.p-at
		if absf(delta.cross(dir)) > float(post.width)*0.5+0.2:
			continue
		var remaining := delta.dot(dir)
		if remaining > -0.5 and remaining < 34.0 and not (state == 1 and remaining < 5.0 and speed > 6.0):
			gain = minf(gain,clampf((remaining-0.6)/9.0,0.0,1.0))
	for zebra: Dictionary in zebra_cells.get(key,[]):
		if not zebra.occupied or absf(dir.dot(zebra.dir)) < 0.8:
			continue
		var offset: Vector2 = zebra.p-at
		var remaining := offset.dot(dir)
		if absf(offset.cross(dir)) < float(zebra.width)*0.5+0.2 and remaining >= 1.5:
			gain = minf(gain,clampf((remaining-4.0)/10.0,0.0,1.0))
	return gain
