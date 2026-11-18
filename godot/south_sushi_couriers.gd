extends RefCounted

const BLUE := Color("#1a8cff")
const BOOT := Color("#123a7a")
const PANTS := [Vector3(10,13,27),Vector3(3,4,5),Vector3(65,50,26)]
var owner: Node3D
var director: Node3D
var shops: Array[Dictionary] = []
var cooldown := 0.0
var uniform := {}
var in_district := {}
var hat: ArrayMesh

func bind(mopeds: Node3D, events: Node3D) -> void:
	owner = mopeds
	director = events
	var cap := SurfaceTool.new()
	cap.begin(Mesh.PRIMITIVE_TRIANGLES)
	mopeds._box(cap,Vector3(.29,.13,.30),Vector3(0,.235,.01),BLUE)
	mopeds._box(cap,Vector3(.22,.03,.20),Vector3(0,.18,-.19),BLUE.darkened(.3))
	hat = mopeds._commit(cap)
	shops.clear()
	for entry in events.worksites.sites:
		var site: Dictionary = entry.info
		if site.name!="sushi":
			continue
		var jobs := PackedVector2Array()
		for point in site.jobs:
			jobs.append(Vector2(point[0],point[1]))
		shops.append({"door":Vector2(site.door[0],site.door[1]),"center":Vector2(site.at[0],site.at[1]),"jobs":jobs})

func rider(index: int, at: Vector2) -> Node3D:
	# These three exported summer models wear long trousers, as does the released sushi uniform.
	var slot := index%3
	var model := slot*2
	var person: Node3D = director.cast.actor(model,at,BLUE)
	for view: MeshInstance3D in person.model.find_children("*","MeshInstance3D",true,false):
		if not view.material_override is ShaderMaterial:
			continue
		if not uniform.has(model):
			var paint := view.material_override.duplicate() as ShaderMaterial
			paint.set_shader_parameter("change_trousers",true)
			paint.set_shader_parameter("original_trousers",PANTS[slot]/255.0)
			var tint := BOOT.srgb_to_linear()
			paint.set_shader_parameter("new_trousers",Vector3(tint.r,tint.g,tint.b))
			uniform[model] = paint
		view.material_override = uniform[model]
	var head := BoneAttachment3D.new()
	head.name = "SushiCap"
	person.skeleton.add_child(head)
	head.bone_name = &"Joint_7"
	var view := MeshInstance3D.new()
	view.mesh = hat
	view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	head.add_child(view)
	return person

func _job(shop: Dictionary) -> Vector2:
	var jobs: PackedVector2Array = shop.jobs
	return jobs[randi()%jobs.size()] if not jobs.is_empty() else Vector2(shop.door)

func notice_fall(bike: RefCounted) -> void:
	if bike.sushi_rewarded:
		return
	bike.sushi_rewarded = true
	if not director.quick and not director.ride:
		director.respect_earned.emit("rivalCourier")

func next_goal(bike: RefCounted) -> void:
	var delta: Vector2 = (bike.sushi_goal-bike.at).abs()
	if delta.x>45.0 or delta.y>45.0:
		return
	var home: Dictionary = shops[bike.shop]
	bike.sushi_goal = _job(home) if bike.sushi_goal.distance_squared_to(home.door)<25.0 else Vector2(home.door)
	bike.trips += 1

func next_edge(bike: RefCounted) -> RefCounted:
	var incoming: RefCounted = bike.edge
	var best: RefCounted
	var score := -INF
	var toward: Vector2 = incoming.b.direction_to(bike.sushi_goal)
	for e in owner.traffic.roads.exits.get(incoming.b,[]):
		if e.b==incoming.a or e.rank>5 or e.blocked:
			continue
		if not in_district.has(e):
			var boundary: PackedVector2Array = owner.car.region_edge.polygon if owner.car.region_edge else PackedVector2Array()
			in_district[e] = boundary.is_empty() or Geometry2D.is_point_in_polygon(e.b,boundary)
		if not in_district[e]:
			continue
		var value: float = e.dir.dot(toward)+randf()*0.5+(0.1 if e.rank<=3 else 0.0)
		if value>score:
			score = value
			best = e
	return best

func tick(dt: float, observer: Vector2) -> void:
	if shops.is_empty() or not director.running:
		return
	cooldown -= dt
	if cooldown>0:
		return
	cooldown = 1.5
	var near_index := 0
	var nearest := INF
	for i in shops.size():
		var d: float = observer.distance_to(shops[i].center)
		if d<nearest:
			nearest = d
			near_index = i
	var amount := 0
	var total := 0
	for bike in owner.bikes:
		if bike.shop>=0:
			total += 1
			amount += int(not bike.rider.defeated)
	if amount>=2+(3 if nearest<600.0 else 0) or total>=7:
		return
	var shop: Dictionary = shops[near_index]
	var e: RefCounted
	var at := Vector2.ZERO
	var from_shop := nearest>110.0 and nearest<600.0
	if from_shop:
		e = owner.traffic.roads.nearest(shop.door)
		if e==null or e.rank>5 or e.blocked:
			from_shop = false
		else:
			var meters := clampf((Vector2(shop.door)-Vector2(e.a)).dot(e.dir),e.entry,maxf(e.entry,float(e.exit)*0.9))
			at = e.lane(meters)
			from_shop = _free(at)
	if not from_shop:
		e = null
		var nearby: Array = owner.traffic.roads.around(observer,330)
		for i in 32:
			if nearby.is_empty():
				return
			var candidate: RefCounted = nearby.pick_random()
			if candidate.rank>5 or candidate.blocked or float(candidate.exit)-float(candidate.entry)<8.0:
				continue
			var pos: Vector2 = candidate.lane(randf_range(candidate.entry,candidate.exit-3))
			var d := pos.distance_to(observer)
			if d>=120 and d<=330 and _free(pos) and owner.traffic._clear(pos,observer) and owner._offscreen(pos):
				at = pos
				e = candidate
				break
	if e==null:
		return
	if nearest>=900:
		for i in shops.size():
			if at.distance_squared_to(shops[i].center)<at.distance_squared_to(shop.center):
				near_index = i
				shop = shops[i]
	var bike: RefCounted = owner._make(at,e.dir,false,near_index)
	bike.edge = e
	bike.pace = randf_range(12.5,16.5)
	bike.cruise = bike.pace
	bike.sushi_goal = _job(shop) if from_shop or randf()<0.5 else Vector2(shop.door)
	bike.path = PackedVector2Array([e.lane(e.exit)])
	owner._place(bike)

func _free(p: Vector2) -> bool:
	for bike in owner.bikes:
		if bike.at.distance_squared_to(p)<4*4:
			return false
	return true
