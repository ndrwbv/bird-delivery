extends Node3D

signal route_changed(stop: Vector2, address: String, path: Array)
signal notice(text: String)
signal money_earned(amount: int)
signal stars_earned(count: int)
signal finished(ok: bool)

enum Phase { IDLE, WAITING, ASK, BOARDING, DRIVING, EXITING }
const CHOICE := preload("res://shift_choices.gd")
const POSE := preload("res://delivery_actor_pose.gd")
const BOOK := preload("res://south_order_book.gd")
const MODELS := [preload("res://assets/pedestrian-0.glb"),preload("res://assets/pedestrian-1.glb"),
	preload("res://assets/pedestrian-2.glb"),preload("res://assets/pedestrian-3.glb"),preload("res://assets/pedestrian-4.glb")]
const ASKS := ["Смена всё, ноги не держат… Подкинешь нас по домам? Мы скинемся.",
	"Всё, отпахали. Подбросишь до дома? Скинемся на бензин.",
	"Кухню закрыли, сил ноль… Довезёшь нас по домам? Мы заплатим.",
	"Полночь уже, автобусы не ходят… Подкинешь нас по домам? Мы скинемся."]
const THANKS := ["Спасибо, ты лучший!","Завтра с меня кофе.","Ой, мой подъезд, тормози."]
const DOORS := [5,6,4]
var phase := Phase.IDLE
var remaining := 0.0
var checked := false
var elapsed_wait := 0.0
var stop_index := 0
var car: CharacterBody3D
var terrain: RefCounted
var book: RefCounted
var recipients: Node
var paint: Material
var kitchen_door: Vector2
var choices := CHOICE.new()
var rng := RandomNumberGenerator.new()
var staff: Array[Dictionary] = []
var trips: Array[Dictionary] = []
var doors := Vector3.ZERO

func setup(vehicle: CharacterBody3D, ground: RefCounted, order_book: RefCounted, people: Node, actor_paint: Material, kitchen: Vector2) -> void:
	car = vehicle
	terrain = ground
	book = order_book
	recipients = people
	paint = actor_paint
	kitchen_door = kitchen
	add_child(choices)
	choices.selected.connect(_answer)

func begin(shift_number: int, seed_value: int) -> void:
	clear()
	checked = false
	rng.seed = ("%d/staff/%d"%[seed_value,shift_number]).hash()

func midnight(eligible: bool) -> bool:
	if checked:
		return phase!=Phase.IDLE
	checked = true
	if not eligible or rng.randf() >= 0.2:
		return false
	for i in rng.randi_range(2,3):
		staff.append({"person":recipients.worker(rng.randi()),"seat":i,"mode":"wait","t":0.0,"model":null})
	phase = Phase.WAITING
	elapsed_wait = 0.0
	notice.emit(tr("Это последний заказ. Довези и заедь в пиццерию: смену надо развезти."))
	return true

func step(delta: float, carrying: bool, at_base: bool) -> bool:
	match phase:
		Phase.IDLE: return false
		Phase.WAITING:
			if carrying:
				return false
			elapsed_wait += delta
			if elapsed_wait>=150.0:
				notice.emit(tr("Не дождались — ушли пешком."))
				_end(false)
				return true
			if not at_base:
				return false
			phase = Phase.ASK
			choices.offer(str(staff[0].person.first)+" · "+tr("Пиццерия"),tr(ASKS[rng.randi_range(0,ASKS.size()-1)]),["Садитесь","Не, я домой"])
		Phase.ASK: pass
		Phase.BOARDING,Phase.DRIVING,Phase.EXITING:
			remaining -= delta
			if remaining<0.0:
				notice.emit(tr("Не успел развезти — дальше они пешком."))
				_end(false)
				return true
			for person in staff:
				_animate(person,delta)
			if phase==Phase.BOARDING and staff.all(func(r): return r.mode=="seated"):
				car.controls_locked = false
				phase = Phase.DRIVING
				notice.emit(tr("Все сели — по домам."))
				_next_route()
			elif phase==Phase.DRIVING:
				var at := Vector2(car.position.x,car.position.z)
				if at.distance_squared_to(trips[stop_index].stop)<=49.0 and Vector2(car.velocity.x,car.velocity.z).length_squared()<=36.0:
					var p := staff[stop_index]
					p.mode = "open_out"
					p.t = 0.0
					phase = Phase.EXITING
					money_earned.emit(1600)
					notice.emit(tr(THANKS[rng.randi_range(0,THANKS.size()-1)])+"   +1 600 ₽")
			elif phase==Phase.EXITING and staff[stop_index].mode in ["leave","left"]:
				stop_index += 1
				if stop_index==trips.size():
					var stars := rng.randi_range(1,3)
					stars_earned.emit(stars)
					_end(true)
				else:
					phase = Phase.DRIVING
					_next_route()
	return true

func _answer(index: int) -> void:
	if phase!=Phase.ASK:
		return
	if index!=0 or not _plan():
		_end(false)
		return
	phase = Phase.BOARDING
	car.velocity = Vector3.ZERO
	car.controls_locked = true
	stop_index = 0
	for r in staff:
		var model := MODELS[int(r.person.model)].instantiate() as Node3D
		add_child(model)
		r.model = model
		r.animation = model.find_child("AnimationPlayer",true,false)
		r.pose = POSE.new()
		r.pose.setup(model)
		var material: Material = recipients.clothing(r.person,paint)
		for mesh in model.find_children("*","MeshInstance3D",true,false):
			mesh.material_override = material
		var slot := int(r.seat)
		var start := kitchen_door+Vector2((slot%2-0.5)*1.3,slot*0.4)
		model.position = _ground(start)
		r.animation.play("walk")
		r.animation.get_animation("walk").loop_mode = Animation.LOOP_LINEAR
		r.mode = "walk"
		r.t = 0.0
	notice.emit(tr("Садитесь — развезу."))

func _plan() -> bool:
	var from := Vector2(car.position.x,car.position.z)
	var meters := 0.0
	var taken := {}
	trips.clear()
	for i in staff.size():
		var pool := []
		for candidate: Dictionary in book.candidates:
			if taken.has(candidate.name):
				continue
			var dist := from.distance_to(_xz(candidate.stop))
			if dist>=(250.0 if i==0 else 150.0) and dist<=(800.0 if i==0 else 500.0):
				pool.append(candidate)
		var chosen := {}
		while not pool.is_empty():
			var candidate: Dictionary = pool.pop_at(rng.randi_range(0,pool.size()-1))
			var stop := _xz(candidate.stop)
			var road: Array = book.routes.route_between(from,stop)
			if road.size()<2:
				continue
			chosen = {"stop":stop,"name":candidate.name,"route":road,"door":_xz(candidate.entrance.at)}
			taken[candidate.name] = true
			meters += BOOK.length_of(road)
			from = stop
			break
		if chosen.is_empty():
			break
		trips.append(chosen)
	if trips.is_empty():
		return false
	staff.resize(trips.size())
	remaining = roundf(meters/19.0*1.5+6*trips.size()+10)
	return true

func _next_route() -> void:
	var target := trips[stop_index]
	route_changed.emit(target.stop,target.name,target.route)

func _animate(r: Dictionary, delta: float) -> void:
	if r.mode in ["seated","left"]:
		return
	r.t += delta
	var i := int(r.seat)
	var row_z := 0.08 if i==0 else 0.92
	var side := 1.0 if i<2 else -1.0
	var exit_z := -0.35 if i==0 else 0.52
	var edge := Vector3(side*1.508,0,exit_z)
	var seat := Vector3(side*0.43,0.17,row_z)
	var model: Node3D = r.model
	match r.mode:
		"walk":
			var at := car.to_global(edge)
			at.y = terrain.at(at.x,at.z)
			# Go around the nearest end when approaching a door on the far side.
			var local := car.to_local(model.global_position)
			if local.x*side < -0.4 and absf(local.z)<2.95:
				at = car.to_global(Vector3(local.x,0,-3.2 if local.z<0 else 3.2))
				at.y = terrain.at(at.x,at.z)
			_walk(model,at,delta)
			if model.global_position.distance_to(car.to_global(edge))<0.75 or r.t>12.0:
				r.animation.stop()
				model.reparent(car)
				model.position = edge
				r.mode = "open_in"
				r.t = 0.0
		"open_in","open_out":
			_set_open(i,minf(1.0,r.t/0.35))
			if r.t>=0.35 or _gone(i):
				r.mode = "enter" if r.mode=="open_in" else "exit"
				r.t = 0.0
		"enter","exit":
			var q := clampf(r.t/1.05,0,1)
			if r.mode=="enter":
				q = 1.0-q
			var near := smoothstep(0,.5,q)
			var far := smoothstep(.5,1,q)
			var sill := Vector3(side*0.96,seat.y,exit_z)
			model.position = seat.lerp(sill,near).lerp(edge,far)
			model.rotation.y = PI-side*PI*.5*near
			r.pose.sit(1.0-far)
			if r.t>=1.05:
				if r.mode=="exit":
					model.reparent(self)
					r.pose.sit(0.0)
					r.animation.play("walk")
					r.mode = "leave"
				else:
					r.mode = "close"
				r.t = 0.0
		"close":
			_set_open(i,1.0-minf(1,r.t/.3))
			if r.t>=.3:
				r.mode = "seated"
		"leave":
			_set_open(i,1.0-clampf((r.t-.5)/.3,0,1))
			var target: Vector2 = trips[i].door
			_walk(model,_ground(target),delta)
			if r.t>=7.0:
				model.queue_free()
				r.mode = "left"

func _walk(model: Node3D, at: Vector3, delta: float) -> void:
	var vec := at-model.global_position
	if vec.length_squared()>0.01:
		model.rotation.y = atan2(vec.x,vec.z)
	model.global_position = model.global_position.move_toward(at,2.1*delta)

func _ground(at: Vector2) -> Vector3:
	return Vector3(at.x,terrain.at(at.x,at.y)+0.02,at.y)

func _gone(i: int) -> bool:
	return car.damage.stage.size()>DOORS[i] and car.damage.stage[DOORS[i]]>=3

func _set_open(i: int, percent: float) -> void:
	var value := 0.0 if _gone(i) else percent*1.1
	if is_equal_approx(doors[i],value):
		return
	doors[i] = value
	for mat: ShaderMaterial in car.damage.materials:
		mat.set_shader_parameter("passenger_open",doors)

func _end(ok: bool) -> void:
	for r in staff:
		if not is_instance_valid(r.get("model")) or r.mode=="left":
			continue
		var actor: Node3D = r.model
		var i := int(r.seat)
		if actor.get_parent()==car:
			actor.reparent(self)
			var side := 1.0 if i<2 else -1.0
			var door := car.to_global(Vector3(side*1.55,0,-.35 if i==0 else .52))
			actor.global_position = _ground(Vector2(door.x,door.z))
		r.pose.sit(0)
		r.animation.play("walk")
		var at := Vector2(actor.global_position.x,actor.global_position.z)
		var direction := (Vector2(trips[i].door)-at).normalized() if i<trips.size() else Vector2.RIGHT
		var goal := _ground(at+direction*minf(9.0,at.distance_to(trips[i].door))) if i<trips.size() else _ground(at+direction*7.0)
		actor.rotation.y = atan2(direction.x,direction.y)
		var walk := create_tween().bind_node(actor)
		walk.tween_property(actor,"global_position",goal,maxf(0.1,actor.global_position.distance_to(goal)/1.5))
		walk.tween_callback(actor.queue_free)
		r.model = null
	clear()
	finished.emit(ok)

func clear() -> void:
	if choices.visible and choices.is_inside_tree():
		choices.hide()
		get_tree().paused = choices.previous_pause
	if phase==Phase.BOARDING and car:
		car.controls_locked = false
	for r in staff:
		if is_instance_valid(r.get("model")):
			r.model.queue_free()
	if car and doors!=Vector3.ZERO:
		for i in 3:
			_set_open(i,0)
	staff.clear()
	trips.clear()
	phase = Phase.IDLE
	remaining = 0.0

static func _xz(point: Array) -> Vector2:
	return Vector2(point[0],point[1])
