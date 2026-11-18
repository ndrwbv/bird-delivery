extends Node3D

const RING := preload("res://south_bribe_ring.gd")
const SLOTS := [Vector2(1.75,0.6),Vector2(0,3.0),Vector2(0,-3.1),Vector2(-1.75,0.4)]
var host: Node3D
var car: CharacterBody3D
var ring := RING.new()
var cells := PackedByteArray()
var first := Vector2.ZERO
var size := Vector2i.ZERO
var cell_size := 8.0
var enclosing := PackedVector2Array()
var adults := true
var gang := ""
var men: Array[Node3D] = []
var knocked := {}
var mafia: Node3D
var mafia_state := ""
var mafia_time := 0.0
var mafia_life := 0.0
var next_hit := 0.0
var seen_mafia := false
var rolled := false
var requested := false
var paid_eligible := false
var cooldown := 0.0
var age := 0.0
var anchor := Vector2.ZERO
var max_speed := 0.5
var anchor_yaw := 0.0
var side := 1.0
var goal := Vector2.ZERO
var order_gone := false
var adjust := 0.0
var bubble: Label3D
var bubble_actor: Node3D
var bubble_t := 0.0
var effect: MeshInstance3D
var effect_timer := 0.0


func setup(controller: Node3D) -> void:
	host = controller
	car = host.car
	adults = not OS.has_feature("kids") and not OS.get_cmdline_user_args().has("--kids")
	var raw: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-danger.json"))
	first = Vector2(raw.x,raw.z)
	size = Vector2i(raw.nx,raw.nz)
	cell_size = float(raw.cell)
	cells = Marshalls.base64_to_raw(raw.get("values"))
	for p: Array in host.region.boundary:
		enclosing.append(Vector2(p[0],p[1]))
	var canvas := CanvasLayer.new()
	canvas.layer = 17
	add_child(canvas)
	canvas.add_child(ring)
	ring.resolved.connect(_answer)
	bubble = Label3D.new()
	bubble.font_size = 30
	bubble.pixel_size = 0.005
	bubble.outline_size = 8
	bubble.width = 580
	bubble.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bubble.hide()
	add_child(bubble)


func late() -> bool:
	return not host.quick and not host.ride and int(host.profile.data.get("counted",0))>=4


func contains(p: Vector2) -> bool:
	if not late():
		return false
	var k := Vector2i(((p-first)/cell_size).floor())
	if k.x<0 or k.y<0 or k.x>=size.x or k.y>=size.y:
		return false
	var progress := clampf(float(host.profile.data.get("gang_donated",0))/640000.0,0,1)
	var cut := 1+roundi((1.0-progress)*249.0)
	var v := int(cells[k.x*size.y+k.y])
	return v>0 and v<cut


func begin() -> void:
	clear()
	seen_mafia = false
	cooldown = 0.0


func order(at: Vector2, is_story: bool) -> void:
	if gang=="wait":
		_depart("")
	goal = at
	rolled = false
	requested = false
	paid_eligible = not is_story
	order_gone = is_instance_valid(mafia)


func delivered() -> void:
	paid_eligible = false
	order_gone = is_instance_valid(mafia)
	if gang=="wait":
		_approach()
	elif gang.is_empty() and requested and host.start_event("gang"):
		_make_group(true)
		_approach()


func _at(node: Node3D) -> Vector2:
	return Vector2(node.position.x,node.position.z)


func _site(origin: Vector2, low: float, high: float, azimuth: float) -> Vector2:
	var best := Vector2.INF
	var score := -INF
	for i in 20:
		var p := origin+Vector2.from_angle(azimuth+randf_range(-1.2,1.2))*randf_range(low,high)
		if not Geometry2D.is_point_in_polygon(p,enclosing):
			continue
		var inside := false
		for hull: PackedVector2Array in host.footprints.get(Vector2i((p/64.0).floor()),[]):
			if Geometry2D.is_point_in_polygon(p,hull):
				inside = true
				break
		if inside:
			continue
		var road: Dictionary = host._road_at(p,16)
		var good := road.is_empty() or float(road.d)>=float(road.width)*0.5+0.5
		var q := float(good)*2.0+randf()*0.5
		if q>score:
			score = q
			best = p
	return best


func _actor(at: Vector2, idx: int) -> Node3D:
	var a: Node3D = host.factory.call(idx,at,at,0.0)
	a.rotation.y = randf()*TAU
	return a


func _piece(parent: Node3D, dims: Vector3, p: Vector3, color: Color) -> MeshInstance3D:
	var model: MeshInstance3D = host._box(dims,color)
	model.position = p
	parent.add_child(model)
	return model


func _make_group(near: bool) -> void:
	var n := 3 if randf()<0.5 else 4
	var phi := randf()*TAU
	var origin := _at(car) if near else goal
	for i in n:
		var at := _site(origin,3.5 if near else 4.5,6.5 if near else 7.0,phi+i*0.64)
		if not at.is_finite():
			continue
		var man := _actor(at,[0,2,4,0][i])
		_piece(man.model,Vector3(0.30,0.08,0.31),Vector3(0,1.67,0),Color("#1d2531"))
		men.append(man)


func _approach() -> void:
	requested = false
	if _leader()==null:
		_clear_gang()
		return
	gang = "come"
	age = 0.0
	adjust = 0.0
	anchor = _at(car)
	anchor_yaw = car.rotation.y
	max_speed = absf(car.speed)
	var right := Vector2(car.basis.x.x,car.basis.x.z)
	side = 1.0 if right.dot(_at(_leader())-anchor)>=0.0 else -1.0
	_say(_leader(),"Тормози, курьер!")


func _leader() -> Node3D:
	for man in men:
		if is_instance_valid(man) and not knocked.has(man) and not man.defeated:
			return man
	return null


func _slot(i: int) -> Vector2:
	var axes: Vector2 = SLOTS[i%4]
	return _at(car)+Vector2(car.basis.x.x,car.basis.x.z)*axes.x*side-Vector2(car.basis.z.x,car.basis.z.z)*axes.y


func _move_to(man: Node3D, target: Vector2, pace: float) -> void:
	if not is_instance_valid(man) or not host.traffic.people._clear_to_use(man):
		return
	var p := _at(man)
	if p.distance_squared_to(target)>0.22:
		host.traffic.people._walk(man,p,target,pace)
	elif man.walker:
		host.traffic.people._walk(man,p,p,pace)


func _hold(dt: float) -> void:
	max_speed = maxf(0.5,max_speed-14.0*dt)
	var horizontal := Vector2(car.velocity.x,car.velocity.z)
	if horizontal.length()>max_speed:
		horizontal = horizontal.limit_length(max_speed)
		car.velocity.x = horizontal.x
		car.velocity.z = horizontal.y
	if max_speed>0.5:
		anchor = _at(car)
		anchor_yaw = car.rotation.y
		return
	var at := anchor+(_at(car)-anchor).limit_length(0.35)
	car.position.x = at.x
	car.position.z = at.y
	car.rotation.y = anchor_yaw+clampf(angle_difference(anchor_yaw,car.rotation.y),-0.12,0.12)


func _say(actor: Node3D, line: String, duration := 2.8) -> void:
	if not is_instance_valid(actor):
		return
	bubble.text = tr(line)
	bubble_actor = actor
	bubble_t = duration
	bubble.show()


func _answer(won: bool) -> void:
	if gang!="ring":
		return
	if won:
		host.notice.emit(tr("отбился — без мзды"))
	else:
		var sum := mini(10000,maxi(0,int(host.profile.data.wallet)))
		if sum>0:
			host.money_changed.emit(-sum,tr("мзда"))
		host.notice.emit(tr("Мзда") + "  −%d ₽" % sum)
	_depart("Другое дело. Катайся." if not won else "Всё-всё, уходим!")


func _depart(line: String) -> void:
	var lead := _leader()
	if lead!=null and not line.is_empty():
		_say(lead,line)
	for man in men:
		if not is_instance_valid(man) or knocked.has(man):
			continue
		var p := _at(man)
		_move_to(man,p+(_at(car).direction_to(p)).rotated(randf_range(-0.4,0.4))*30.0,2.0)
	gang = "leave"
	cooldown = 45.0
	age = 0.0


func _clear_gang() -> void:
	ring.cancel()
	for man in men:
		if is_instance_valid(man):
			host.cast.retire(man,knocked.has(man))
	men.clear()
	knocked.clear()
	if not gang.is_empty():
		host.end_event("gang")
	gang = ""
	requested = false


func _clear_mafia() -> void:
	if is_instance_valid(mafia):
		mafia.queue_free()
	if not mafia_state.is_empty():
		host.end_event("mafia")
	mafia = null
	mafia_state = ""


func clear() -> void:
	_clear_gang()
	_clear_mafia()
	if is_instance_valid(effect):
		effect.queue_free()
	effect = null
	bubble_actor = null
	if is_instance_valid(bubble):
		bubble.hide()
	paid_eligible = false


func _try_order(hour: float) -> void:
	if not late() or not paid_eligible or rolled or not host.factory.is_valid():
		return
	rolled = true
	var danger := contains(goal)
	var chance := (1.0 if hour>=18.0 else 0.6)*(1.0-0.5*clampf(float(host.profile.data.get("gang_donated",0))/640000.0,0,1))
	if cooldown<=0.0 and gang.is_empty() and danger and randf()<chance and host.can_event("gang"):
		requested = true
		if _at(car).distance_to(goal)>=60.0 and host.start_event("gang"):
			gang = "wait"
			_make_group(false)
			if men.is_empty():
				_clear_gang()
	if not seen_mafia and not is_instance_valid(mafia) and host.order_index>=3 and _at(car).distance_to(goal)>=60.0 and randf()<(0.25 if danger else 0.06):
		var p := _site(goal,6,9,randf()*TAU)
		if p.is_finite() and host.start_event("mafia"):
			seen_mafia = true
			order_gone = false
			mafia_state = "idle"
			mafia_time = 0.0
			mafia_life = 75.0
			mafia = _actor(p,2)
			_piece(mafia.model,Vector3(0.34,0.09,0.32),Vector3(0,1.72,0),Color("#1b1b20"))
			_piece(mafia.model,Vector3(0.48,0.042,0.41),Vector3(0,1.69,0),Color("#1b1b20"))
			_piece(mafia.model,Vector3(0.27,0.053,0.04),Vector3(0,1.51,0.12),Color("#151519"))


func person_hit(actor: Node3D, kmh: float) -> void:
	if actor==mafia:
		if kmh>=20.0:
			get_tree().call_group(&"local_achievements",&"add","mafia")
			host.money_changed.emit(2500,tr("уложил мафиози"))
			host.cast.retire(mafia,true)
			mafia = null
			_clear_mafia()
		elif kmh>3.6:
			mafia_state = "threat"
			next_hit = 0.6
	elif men.has(actor) and kmh>=20.0:
		knocked[actor] = true
		if _leader()==null:
			cooldown = 45.0
			_clear_gang()


func _mafia_step(dt: float) -> void:
	var p := _at(mafia)
	var d := p.distance_to(_at(car))
	mafia_time += dt
	mafia_life -= dt
	if (order_gone or mafia_life<=0.0) and d>60:
		_clear_mafia()
		return
	if mafia_life<=0.0 and mafia_state not in ["threat","leave"]:
		mafia_state = "leave"
		mafia_time = 0.0
		_move_to(mafia,p+_at(car).direction_to(p)*26.0,1.65)
	match mafia_state:
		"idle":
			if d<15:
				mafia_time = 0.0
				mafia_state = "warn"
				var line := "пиздуй отсюда, а то порешу" if adults else "вали отсюда, а то пожалеешь"
				_say(mafia,line)
				host.notice.emit("«"+tr(line)+"»")
		"warn":
			if d>19:
				mafia_state = "idle"
			elif d<15 and mafia_time>4.0:
				mafia_state = "threat"
				next_hit = 0.25
				_say(mafia,"я предупреждал")
		"threat":
			if d>30:
				mafia_state = "idle"
				return
			next_hit -= dt
			if next_hit<=0.0:
				next_hit = randf_range(0.85,1.15)
				_flash()
				if randf()<0.65:
					host.heart_hit.emit(0.5,car.global_position)
		"leave":
			if mafia_time>6.0:
				_clear_mafia()


func _flash() -> void:
	if not is_instance_valid(effect):
		effect = host._box(Vector3(0.1,0.12,0.1),Color("#ffe79d"))
		add_child(effect)
	effect.position = mafia.position+Vector3.UP*1.24-mafia.basis.z*0.3
	effect_timer = 0.07
	effect.show()


func step(dt: float, hour: float) -> void:
	cooldown = maxf(0.0,cooldown-dt)
	_try_order(hour)
	if is_instance_valid(mafia):
		_mafia_step(dt)
	if is_instance_valid(effect) and effect.visible:
		effect_timer -= dt
		effect.visible = effect_timer>0.0
	if bubble.visible:
		bubble_t -= dt
		if is_instance_valid(bubble_actor) and bubble_t>0:
			bubble.position = bubble_actor.position+Vector3.UP*2.75
		else:
			bubble.hide()
	if gang.is_empty() or gang=="wait":
		return
	age += dt
	if gang in ["come","talk","ring"]:
		_hold(dt)
	var lead := _leader()
	match gang:
		"come":
			if lead==null:
				_clear_gang()
				return
			adjust -= dt
			if adjust<=0.0:
				adjust = 0.18
				for i in men.size():
					if not knocked.has(men[i]):
						_move_to(men[i],_slot(i),5.5)
			if _at(lead).distance_to(_slot(0))<0.6 or age>4.0:
				gang = "talk"
				age = 0.0
				_say(lead,"Слышь, курьер. Это наш район. Хочешь тут ездить — плати. {money}, и катайся спокойно.".format({"money":"10 000 ₽"}),4.0)
		"talk":
			if age>=4.0:
				gang = "ring"
				ring.begin(adults)
		"ring":
			ring.advance(dt)
		"leave":
			if age>=6.0:
				_clear_gang()
