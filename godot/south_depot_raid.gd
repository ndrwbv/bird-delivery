extends Node3D

signal tables_smashed

const COLOR := [Color("#4fc3f7"),Color("#ffcc1a")]
const CRY := [["роллы — сила!","пицца — прошлый век!","васаби вам в тесто!","это наш район!"],
	["слава королеве!","бургер — король!","пицца — не еда!","это наш район!"]]
var host: Node3D
var cast: RefCounted
var furniture: Node3D
var depot := Vector2.ZERO
var door := Vector2.ZERO
var toward_street := Vector2.RIGHT
var planned := -1.0
var left := 0.0
var came := false
var ko := 0
var brand := 0
var total := 0
var built := 0
var live := false
var lost := false
var broken := false
var talk := 0.0
var stand := 0.0
var cooldown := 0.0
var people: Array[Dictionary] = []
var shards: MultiMeshInstance3D
var tree: Node3D
var crown: MeshInstance3D
var flash := 0.0
var fire_in := 1.0
var placed_at := Vector2.ZERO
var marker_label: Label3D


func setup(events: Node3D) -> void:
	host = events
	cast = host.cast
	depot = host.street_works.depot
	var district: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south.json"))
	door = Vector2(district.dispatch.door[0],district.dispatch.door[1])
	toward_street = depot.direction_to(door)
	placed_at = door+toward_street*2.5+Vector2(-toward_street.y,toward_street.x)*3.1


func begin() -> void:
	clear()
	if host.quick or host.ride or int(host.profile.data.get("shifts",0))<4:
		return
	if bool(host.profile.data.get("depot_turret",false)):
		_ornament()
	var data: Dictionary = host.profile.data
	if int(data.get("raid_shift",-1))==int(host.number):
		lost = bool(data.get("raid_lost",false))
		if lost:
			_shatter()
		if not bool(data.get("raid_finished",false)):
			planned = float(data.get("raid_at",-1.0))
		return
	var since := int(data.get("raid_since",0))
	planned = randf_range(50,130) if since+1>=5 or randf()<0.3 else -1.0
	data.raid_since = 0 if planned>=0 else since+1
	data.raid_shift = host.number
	data.raid_lost = false
	data.raid_finished = false
	data.raid_at = planned


func clear() -> void:
	if live:
		host.end_event("raid")
	for m in people:
		cast.retire(m.actor)
	people.clear()
	if is_instance_valid(shards):
		shards.queue_free()
	if is_instance_valid(tree):
		tree.queue_free()
	if is_instance_valid(marker_label):
		marker_label.queue_free()
	tree = null
	crown = null
	shards = null
	marker_label = null
	live = false
	lost = false
	broken = false
	planned = -1
	stand = 0
	cooldown = 0
	fire_in = 1
	flash = 0
	total = 0
	built = 0


func load_delay() -> float:
	return 4.0 if lost else 0.0


func marker() -> Vector2:
	return door if live else Vector2.INF


func start() -> bool:
	if live or not host.start_event("raid"):
		return false
	planned = -1
	live = true
	came = false
	ko = 0
	brand = randi()%2
	total = randi_range(4,6)
	built = 0
	left = 75.0
	talk = 1.0
	stand = 0
	marker_label = host._label(self,0.009)
	marker_label.text = tr("Налёт на точку!")
	marker_label.modulate = Color("#ffd15b")
	marker_label.visibility_range_end = 260.0
	marker_label.position = _ground(door,4.4)
	marker_label.show()
	host.notice.emit(tr("Налёт на точку! Гони!"))
	return true


func _ground(p: Vector2, h: float) -> Vector3:
	return Vector3(p.x,host.ground.at(p.x,p.y)+h,p.y)


func _add() -> void:
	var i := built
	built += 1
	var side := 1.0 if i%2==0 else -1.0
	var edge := Vector2(-toward_street.y,toward_street.x)
	var p := door+toward_street*4.0+edge*side*randf_range(26,34)
	var nearest: RefCounted = host.traffic.roads.nearest(p)
	if nearest!=null:
		var road := Geometry2D.get_closest_point_to_segment(p,nearest.a,nearest.b)
		var normal := road.direction_to(door)
		var q: Vector2 = road+normal*(nearest.width*0.5+1.8)
		if host._clear_yard(q,0.3):
			p = q
	var target := door+toward_street*1.4 if i==0 else depot+toward_street.rotated(side*(0.35+ceili(i*0.5)*0.42))*depot.distance_to(door)
	var actor: Node3D = cast.actor([0,2,4][i%3],p,COLOR[brand])
	cast.prop(actor.model,Vector3(0.29,0.08,0.30),Vector3(0,1.67,0),COLOR[brand])
	people.append({"actor":actor,"goal":target,"phase":"in","charge":randf()<0.5,"time":0.0,"adjust":0.0,"hit_in":0.6})
	cast.walk(actor,target,3.8)


func _flee(m: Dictionary, say: bool) -> void:
	if m.phase=="flee":
		return
	m.phase = "flee"
	m.time = 0
	var p: Vector2 = cast.at(m.actor)
	var dir := door.direction_to(p).rotated(randf_range(-0.6,0.6))
	cast.walk(m.actor,p+dir*50,6.0)
	if say:
		cast.say(m.actor,["атас!","валим!","мама!","я пошутил!"].pick_random(),Color("#ed766b"))


func honk() -> void:
	if not live or cooldown>0:
		return
	cooldown = 1.2
	var p: Vector2 = cast.at(host.car)
	for m in people:
		if m.phase in ["smash","in"] and p.distance_to(cast.at(m.actor))<18 and randf()<0.50:
			_flee(m,true)


func hit(who: Node3D, kmh: float) -> void:
	for i in people.size():
		var m := people[i]
		if m.actor!=who:
			continue
		if kmh>=20:
			if live and m.phase!="flee":
				ko += 1
			cast.retire(who,true)
			people.remove_at(i)
		elif kmh>3.6 and live:
			m.phase = "charge"
			m.charge = true
		return


func _damage_tables() -> void:
	if broken:
		return
	broken = true
	if is_instance_valid(furniture):
		furniture.smash_tables(depot,17.0)
	tables_smashed.emit()


func _shatter() -> void:
	if is_instance_valid(shards):
		return
	var tri := PrismMesh.new()
	tri.size = Vector3(0.17,0.017,0.22)
	tri.material = host._paint(Color("#9fc2c4"))
	var mesh := MultiMesh.new()
	mesh.transform_format = MultiMesh.TRANSFORM_3D
	mesh.mesh = tri
	mesh.instance_count = 18
	for i in 18:
		var p := door+toward_street*randf_range(0.36,3.2)+Vector2(-toward_street.y,toward_street.x)*randf_range(-1.9,1.9)
		mesh.set_instance_transform(i,Transform3D(Basis(Vector3.UP,randf()*TAU),_ground(p,0.035)))
	shards = MultiMeshInstance3D.new()
	shards.multimesh = mesh
	shards.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shards)


func _finish(won: bool) -> void:
	live = false
	planned = -1
	host.end_event("raid")
	host.profile.data.raid_finished = true
	host.profile.data.raid_lost = not won
	if is_instance_valid(marker_label):
		marker_label.hide()
	if won:
		if came:
			host.reward(3000+300*ko,"Отбил точку!","defend")
		else:
			host.respect_earned.emit("defendAlone")
			host.notice.emit(tr("Ёлка отбила точку."))
	else:
		lost = true
		_damage_tables()
		_shatter()
		host.respect_earned.emit("noDefend")
		host.money_changed.emit(-2500,tr("Точку разгромили. Ремонт"))
	for m in people:
		_flee(m,false)


func _ornament() -> void:
	if is_instance_valid(tree):
		return
	tree = Node3D.new()
	add_child(tree)
	tree.position = _ground(placed_at,0.0)
	cast.prop(tree,Vector3(0.27,0.55,0.27),Vector3.UP*0.26,Color("#774c30"))
	for i in 3:
		var foliage := CylinderMesh.new()
		foliage.radial_segments = 12
		foliage.rings = 0
		foliage.top_radius = 0.06
		foliage.bottom_radius = 0.84-i*0.16
		foliage.height = 0.94
		foliage.material = host._paint(Color("#24684b") if i%2==0 else Color("#347c51"))
		var model := MeshInstance3D.new()
		model.mesh = foliage
		model.position.y = 0.77+i*.48
		tree.add_child(model)
	for i in 12:
		var a := i*2.42
		var r := 0.71-float(i)/12*.47
		var at := Vector3(cos(a)*r,0.57+i*.11,sin(a)*r)
		cast.prop(tree,Vector3.ONE*.10,at,[Color("#f25a4c"),Color("#f5be2f"),Color("#63b0e8")][i%3])
	crown = cast.prop(tree,Vector3(.27,.27,.15),Vector3.UP*2.38,Color("#f1cc48"))
	crown.rotation.z = PI*.25


func _guard(dt: float) -> void:
	if not is_instance_valid(tree):
		return
	flash = maxf(0,flash-dt)
	crown.scale = Vector3.ONE*(1.6 if flash>0 else 1.0)
	fire_in -= dt
	if fire_in>0:
		return
	var best := 28.0
	var index := -1
	for i in people.size():
		if people[i].phase=="flee":
			continue
		var d: float = placed_at.distance_to(cast.at(people[i].actor))
		if d<best:
			best = d
			index = i
	if index<0:
		return
	fire_in = 3.0*randf_range(0.85,1.15)
	flash = 0.16
	if randf()<0.65:
		var actor: Node3D = people[index].actor
		var from: Vector2 = placed_at.direction_to(cast.at(actor))
		actor.impact(7.0,Vector3(from.x,0,from.y),false)
		cast.retire(actor,true)
		people.remove_at(index)


func _people(dt: float, at: Vector2, nearby: bool) -> void:
	var target_count := 0
	var near_horn := false
	for i in range(people.size()-1,-1,-1):
		var m := people[i]
		var who: Node3D = m.actor
		var p: Vector2 = cast.at(who)
		var d := at.distance_to(p)
		who.visible = nearby
		who.player.active = nearby and d<72
		m.time += dt
		m.adjust -= dt
		m.hit_in -= dt
		if m.phase=="flee":
			if m.time>8:
				cast.retire(who)
				people.remove_at(i)
			continue
		target_count += 1
		near_horn = near_horn or d<18
		if d<4.5 and absf(host.car.speed)*3.6>=25:
			var fwd := Vector2(-host.car.basis.z.x,-host.car.basis.z.z)
			if fwd.dot(p-at)<0 or absf(fwd.cross(p-at))>1.65:
				_flee(m,true)
				continue
		if d<26 and m.charge:
			m.phase = "charge"
		elif d>32 and m.phase=="charge":
			m.phase = "in"
		if m.phase=="in" and (p.distance_to(m.goal)<0.8 or m.time>16):
			m.phase = "smash"
			cast.walk(who,p,1.0)
		elif m.phase=="charge" and m.adjust<=0:
			m.adjust = 0.18
			var car: CharacterBody3D = host.car
			var local := car.to_local(who.position)
			var nearest := Vector3(clampf(local.x,-1.04,1.04),0,clampf(local.z,-2.49,2.49))
			var q := car.to_global(nearest)
			var edge := Vector2(q.x,q.z)
			if p.distance_to(edge)>0.9:
				cast.walk(who,edge+edge.direction_to(p)*.53,4.2)
			else:
				cast.walk(who,p,1.0)
				if m.hit_in<=0:
					m.hit_in = 1.4
					who.player.play("exchange",0.08,1.8)
					who.player.queue("idle")
					if randf()<0.55:
						host.heart_hit.emit(0.5,q)
		elif m.phase=="smash" and m.hit_in<=0 and nearby:
			m.hit_in = randf_range(0.6,1.2)
			who.player.play("exchange",0.08,1.8)
			who.player.queue("idle")
	if not live:
		return
	stand = stand+dt if near_horn and absf(host.car.speed)<3 else 0.0
	if stand>1.5:
		honk()
		stand = -2.0
	if target_count==0 and built==total:
		_finish(true)
	elif left<=0:
		_finish(false)


func step(dt: float, at: Vector2) -> void:
	if not live and planned>=0 and host.elapsed>=planned and at.distance_to(door)>150:
		start()
	if not live and people.is_empty():
		return
	cooldown = maxf(0,cooldown-dt)
	var distance := at.distance_to(door)
	var nearby := distance<260
	if live:
		left -= dt
		came = came or distance<70
		if built<total:
			_add()
		if not broken and left<75.0*(1.0-0.35):
			_damage_tables()
		if nearby and not people.is_empty():
			talk -= dt
			if talk<=0:
				talk = randf_range(1.6,2.6)
				var m: Dictionary = people.pick_random()
				if m.phase in ["smash","charge"]:
					cast.say(m.actor,CRY[brand].pick_random(),COLOR[brand])
		_guard(dt)
	_people(dt,at,nearby)
