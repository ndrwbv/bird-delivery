extends MultiMeshInstance3D

const FUND := preload("res://district_donations.gd")
const CELL := 40.0
const RANGE := 124.0

var car: CharacterBody3D
var terrain: RefCounted
var profile: RefCounted
var danger: Callable
var land := {}
var hit := {}
var flying: Array[Dictionary] = []
var visible_heaps: Array[Dictionary] = []
var previous := Vector2.INF
var last_chunk := Vector2i.MAX
var thrown_mesh := BoxMesh.new()


func setup(region: Dictionary, ground: RefCounted, route: RefCounted, vehicle: CharacterBody3D, is_dangerous: Callable) -> void:
	car = vehicle
	terrain = ground
	danger = is_dangerous
	var mesh := BoxMesh.new()
	mesh.size = Vector3(1.0,1.0,1.0)
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.roughness = .93
	mesh.material = material
	thrown_mesh.size = Vector3(.18,.12,.14)
	var discarded := StandardMaterial3D.new()
	discarded.albedo_color = Color("#af9a6c")
	thrown_mesh.material = discarded
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = mesh
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var colors := [Color("#453931"),Color("#b7aa92"),Color("#72634c"),Color("#48524e")]
	var rng := RandomNumberGenerator.new()
	for entrance: Array in region.entrances:
		var at := Vector2(entrance[0],entrance[1])
		var front := Vector2(entrance[2],entrance[3])
		rng.seed = hash(Vector2i((at*20.0).round()))
		var draw := rng.randf()
		if draw >= .8:
			continue
		var side := 1.0 if rng.randf()<.5 else -1.0
		var point := at+front*rng.randf_range(1.8,3.2)+front.orthogonal()*side*rng.randf_range(3.4,4.6)
		var height: float = terrain.land_height(point.x,point.y)
		if height < float(region.water_y)+.3 or not route.walk_clear(point-Vector2(.5,0),point+Vector2(.5,0)):
			continue
		var cell := _cell(point)
		if not land.has(cell):
			land[cell] = []
		var heap := {"id":at,"at":point,"y":height,"roll":draw,"poses":[],"colors":[]}
		for i in 5:
			var offset := Vector2.from_angle(rng.randf()*TAU)*rng.randf_range(0.06,.5)
			var size := Vector3(rng.randf_range(.14,.38),rng.randf_range(.08,.20),rng.randf_range(.17,.39))
			var axis := Basis(Vector3.UP,rng.randf()*TAU).scaled(size)
			heap.poses.append(Transform3D(axis,Vector3(point.x+offset.x,height+size.y*.45,point.y+offset.y)))
			heap.colors.append(colors[rng.randi_range(0,colors.size()-1)])
		land[cell].append(heap)
	hide()


func begin(owner: RefCounted) -> void:
	clear()
	profile = owner
	show()


func clear() -> void:
	profile = null
	hit.clear()
	last_chunk = Vector2i.MAX
	previous = Vector2.INF
	for bit: Dictionary in flying:
		bit.node.queue_free()
	flying.clear()
	hide()


func _physics_process(delta: float) -> void:
	if profile == null:
		return
	var from := previous
	previous = Vector2(car.position.x,car.position.z)
	var chunk := _cell(previous)
	if last_chunk != chunk:
		last_chunk = chunk
		_show_near(previous)
	if from.is_finite() and previous.distance_squared_to(from)<280 and not car.airborne and absf(car.speed)>.8:
		var clean := clampf(float(profile.data.get("trash_donated",0))/FUND.TRASH_GOAL,0,1)
		for x in range(chunk.x-1,chunk.x+2):
			for z in range(chunk.y-1,chunk.y+2):
				for heap: Dictionary in land.get(Vector2i(x,z),[]):
					if _exists(heap,clean) and absf(car.position.y-float(heap.y)) < .9 and _hits(from,previous,heap.at):
						hit[heap.id] = true
						car.velocity *= .86
						_scatter(heap)
						_show_near(previous)
						break
	for i in range(flying.size()-1,-1,-1):
		var bit: Dictionary = flying[i]
		bit.time -= delta
		bit.velocity.y -= 9.8*delta
		var node: Node3D = bit.node
		node.position += bit.velocity*delta
		node.rotation += bit.rotate*delta
		if bit.time <= 0:
			node.queue_free()
			flying.remove_at(i)
		elif node.position.y <= terrain.land_height(node.position.x,node.position.z)+.08:
			node.position.y = float(terrain.land_height(node.position.x,node.position.z))+.08
			bit.velocity *= Vector3(.55,-.23,.55)


func _show_near(at: Vector2) -> void:
	var radius := ceili(RANGE/CELL)
	var clean := clampf(float(profile.data.get("trash_donated",0))/FUND.TRASH_GOAL,0,1)
	visible_heaps.clear()
	for x in range(last_chunk.x-radius,last_chunk.x+radius+1):
		for z in range(last_chunk.y-radius,last_chunk.y+radius+1):
			for heap: Dictionary in land.get(Vector2i(x,z),[]):
				if at.distance_squared_to(heap.at)<RANGE*RANGE and _exists(heap,clean):
					visible_heaps.append(heap)
	multimesh.instance_count = visible_heaps.size()*5
	var i := 0
	for heap: Dictionary in visible_heaps:
		for piece in 5:
			multimesh.set_instance_transform(i,heap.poses[piece])
			multimesh.set_instance_color(i,heap.colors[piece])
			i += 1


func _exists(heap: Dictionary, clean: float) -> bool:
	if hit.has(heap.id):
		return false
	var chance := float(heap.roll)
	var remaining := 1.0-clean
	return chance < .34*remaining or (chance < .80*remaining and danger.call(heap.at))


func _hits(from: Vector2, end: Vector2, heap: Vector2) -> bool:
	if end.distance_squared_to(from) <= 0.0001:
		return false
	var direction := from.direction_to(end)
	var near := Geometry2D.get_closest_point_to_segment(heap,from-direction*1.8,end+direction*1.8)
	return heap.distance_squared_to(near)<1.22*1.22


func _scatter(heap: Dictionary) -> void:
	var away := car.velocity.limit_length(9.0)
	for pose: Transform3D in heap.poses:
		if flying.size() >= 25:
			return
		var bit := MeshInstance3D.new()
		bit.mesh = thrown_mesh
		bit.position = pose.origin
		bit.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(bit)
		var impulse := away*.26+Vector3(randf_range(-1.4,1.4),randf_range(.9,1.8),randf_range(-1.4,1.4))
		flying.append({"node":bit,"velocity":impulse,"rotate":Vector3(4,5,-3),"time":1.5})


func _cell(point: Vector2) -> Vector2i:
	return Vector2i((point/CELL).floor())
