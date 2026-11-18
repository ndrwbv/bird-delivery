extends Node3D

const ROADS := preload("res://south_pickup_roads.gd")
const MODELS := "res://assets/south-road-bonuses.glb"
const COLORS := [Color("#6fd3ff"),Color("#ff4d6d"),Color("#8f9bff"),Color("#ffc93c")]
const PACE := {"generous":Vector4(1.7,1.6,0.6,0.5),"normal":Vector4.ONE,
	"tight":Vector4(0.75,0.7,1.3,1.4)}
enum { COFFEE, HEAL, SHIELD, HEART }

var ground: RefCounted
var car: CharacterBody3D
var depot := Vector2.ZERO
var roads := ROADS.new()
var items: Array[Dictionary] = []
var bodies: Array[MultiMesh] = []
var rings: Array[MultiMesh] = []
var star: MultiMesh
var pace := Vector4.ONE
var spawn_in := 4.0
var heal_in := 9.0
var life_in := -1.0
var collected_heart := false


func setup(terrain: RefCounted, vehicle: CharacterBody3D, start: Vector2, region: Dictionary = {}) -> void:
	ground = terrain
	car = vehicle
	depot = start
	if region.is_empty():
		region = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-region.json"))
	roads.setup(region)
	var models: Node
	if FileAccess.file_exists(MODELS):
		var gltf := GLTFDocument.new()
		var state := GLTFState.new()
		if gltf.append_from_file(MODELS,state) == OK:
			models = gltf.generate_scene(state)
	else:
		var imported := ResourceLoader.load(MODELS) as PackedScene
		if imported:
			models = imported.instantiate()
	if models == null:
		push_error("Не удалось прочитать модели дорожных бонусов")
		set_physics_process(false)
		return
	for title in ["Coffee","Heal","Shield","Heart"]:
		var source := models.find_child(title,true,false) as MeshInstance3D
		bodies.append(_batch(source.mesh))
	star = _batch((models.find_child("Star",true,false) as MeshInstance3D).mesh)
	models.free()
	for color: Color in COLORS:
		var ring := TorusMesh.new()
		ring.inner_radius = 1.6
		ring.outer_radius = 2.1
		ring.rings = 18
		ring.ring_segments = 4
		var paint := StandardMaterial3D.new()
		paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		paint.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		paint.albedo_color = Color(color,0.6)
		ring.material = paint
		rings.append(_batch(ring))
	car.shift_started.connect(begin_shift)


func _batch(mesh: Mesh) -> MultiMesh:
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.mesh = mesh
	# Max 140 coffees × 1.7, plus 26 × 1.7 non-fixed. Allocate only once.
	batch.instance_count = 288
	batch.visible_instance_count = 0
	var renderer := MultiMeshInstance3D.new()
	renderer.multimesh = batch
	renderer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(renderer)
	return batch


func begin_shift(mode: String) -> void:
	items.clear()
	pace = PACE.get(mode,Vector4.ONE)
	spawn_in = 4.0
	heal_in = 9.0
	collected_heart = false
	life_in = randf_range(50.0,150.0) if not car.engine.riding and randf() < 0.55 else -1.0
	var street_count := roads.street_meters/220.0
	var yard_count := roads.yard_meters/440.0
	var cap := 140.0/maxf(140.0,street_count+yard_count)*pace.x
	var nx := roundi(street_count*cap)
	var ny := roundi(yard_count*cap)
	var placed := 0
	for p in roads.long_spots(maxf(220.0,300.0/pace.x)):
		if _coffee_clear(p):
			_add(p,COFFEE,true)
			placed += 1
	nx = maxi(0,nx-placed)
	for i in nx:
		_scatter_coffee(roads.street)
	for i in ny:
		_scatter_coffee(roads.yard)
	var goal := roundi((nx+ny)*0.45*pace.y/pace.x)
	var n := 0
	for i in 1200:
		if n >= goal or roads.yard_spots.is_empty():
			break
		var p: Vector2 = roads.yard_spots.pick_random()
		if _spaced(p,false,48.0):
			var kind: int = [HEAL,SHIELD,HEAL,HEAL][n%4]
			_add(p,kind,true)
			n += 1
	_render_items()


func _spaced(p: Vector2, coffee: bool, meters: float) -> bool:
	for item in items:
		if (item.kind == COFFEE) != coffee or (coffee and item.again > 0.0):
			continue
		if p.distance_squared_to(item.p) < meters*meters:
			return false
	return true


func _coffee_clear(p: Vector2) -> bool:
	return p.distance_squared_to(depot) >= 625.0 and roads.in_district(p) and _spaced(p,true,38.0)


func _scatter_coffee(segments: Array[Vector4], near := Vector2.INF, min_d := 0.0, max_d := INF) -> void:
	if segments.is_empty():
		return
	for i in 60:
		var p := roads.random_on(segments)
		if near.is_finite():
			var d := p.distance_squared_to(near)
			if d < min_d*min_d or d > max_d*max_d:
				continue
		if _coffee_clear(p):
			_add(p,COFFEE,not near.is_finite())
			return


func _add(p: Vector2, kind: int, fixed: bool) -> void:
	items.append({"p":p,"height":ground.at(p.x,p.y),"kind":kind,"fixed":fixed,"again":0.0,
		"phase":randf_range(0.0,6.0),"spin":0.0})


func _in_front(p: Vector2, at: Vector2, from: float, to: float) -> bool:
	var offset := p-at
	var distance := offset.length()
	var forward := -car.basis.z
	return distance >= from and distance <= to and offset.dot(Vector2(forward.x,forward.z)) >= distance*0.2


func _ahead(at: Vector2, kind: int) -> bool:
	for i in (50 if kind == HEART else 40):
		var p := Vector2.INF
		var yard := (i%3 != 2 if kind == HEART else i < 25) and not roads.yard_spots.is_empty()
		if yard:
			p = roads.yard_spots.pick_random()
		elif not roads.fresh.is_empty():
			var q: Vector4 = roads.fresh.pick_random()
			var a := Vector2(q.x,q.y)
			var b := Vector2(q.z,q.w)
			p = a.lerp(b,randf_range(0.2,0.8))
			if kind == HEART:
				var width := float(roads.fresh_width.get(q,6.0))
				p += (b-a).normalized().orthogonal()*(width*0.5+2.5)*(1.0 if randf()<0.5 else -1.0)
		if not p.is_finite():
			continue
		if kind == HEART:
			if not _in_front(p,at,90.0,260.0) or p.distance_squared_to(depot) < 900.0:
				continue
		elif not _in_front(p,at,60.0,240.0):
			continue
		if not yard and not roads.offroad_clear(p):
			continue
		_add(p,kind,false)
		return true
	return false


func _physics_process(delta: float) -> void:
	if not is_instance_valid(car) or not car.active_shift:
		return
	var at := Vector2(car.position.x,car.position.z)
	var live: bool = not car.controls_locked and car.hearts > 0.0
	var fresh_coffee := 0
	var fresh_heal := false
	for i in range(items.size()-1,-1,-1):
		var item := items[i]
		var p: Vector2 = item.p
		var d := at.distance_squared_to(p)
		if not item.fixed and item.kind != HEART and d > 420.0*420.0:
			items.remove_at(i)
			continue
		if item.again > 0.0:
			item.again = maxf(0.0,float(item.again)-delta)
		if item.again > 0.0:
			continue
		if live and d <= 3.4*3.4 and absf(float(item.height)-car.position.y) <= 3.0:
			car.collect_road_bonus(item.kind)
			if item.fixed:
				item.again = (16.0 if item.kind == COFFEE else 28.0)*pace.z
			else:
				if item.kind == HEART:
					collected_heart = true
				items.remove_at(i)
			continue
		if not item.fixed:
			fresh_coffee += int(item.kind == COFFEE)
			fresh_heal = fresh_heal or item.kind == HEAL
		if absf(p.x-at.x) < 460.0 and absf(p.y-at.y) < 460.0:
			item.phase = fposmod(float(item.phase)+delta,TAU*10.0)
			item.spin = fposmod(float(item.spin)+delta*2.2,TAU)
	if live:
		heal_in -= delta
		if heal_in <= 0.0:
			heal_in = randf_range(9.0,15.0)*pace.w
			if car.hearts < car.hearts_max and not fresh_heal:
				_ahead(at,HEAL)
		spawn_in -= delta
		if spawn_in <= 0.0:
			spawn_in = randf_range(3.0,6.0)*pace.w
			if fresh_coffee < 26.0*maxf(1.0,pace.x):
				_scatter_coffee(roads.fresh,at,50.0,200.0)
		if life_in >= 0.0:
			life_in -= delta
			if life_in <= 0.0:
				life_in = -1.0 if _ahead(at,HEART) else 1.0
	_render_items()


func _render_items() -> void:
	var at := Vector2(car.position.x,car.position.z)
	var count := PackedInt32Array([0,0,0,0])
	for item in items:
		var p: Vector2 = item.p
		if item.again > 0.0 or absf(p.x-at.x) >= 460.0 or absf(p.y-at.y) >= 460.0:
			continue
		var kind: int = item.kind
		var index := count[kind]
		if index >= bodies[kind].instance_count:
			continue
		var y: float = item.height
		var phase: float = item.phase
		var spin := Basis(Vector3.UP,float(item.spin))
		if kind == COFFEE:
			spin *= Basis(Vector3.BACK,0.25)
		var body := Transform3D(spin,Vector3(p.x,y+1.6+sin(phase*2.4)*0.25,p.y))
		bodies[kind].set_instance_transform(index,body)
		if kind == SHIELD:
			star.set_instance_transform(index,body)
		var size_factor := 1.0+sin(phase*3.2)*0.12
		var ring := Basis.from_scale(Vector3(size_factor,0.04,size_factor))
		rings[kind].set_instance_transform(index,Transform3D(ring,Vector3(p.x,y+0.25,p.y)))
		count[kind] += 1
	for i in count.size():
		bodies[i].visible_instance_count = count[i]
		rings[i].visible_instance_count = count[i]
	star.visible_instance_count = count[SHIELD]
