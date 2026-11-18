extends RefCounted

const THIEF := ["ААА!","УКРАЛ ПИЦЦУ!","ХАХАХАХ","МОЯ!","МОЯ!","НЯМ-НЯМ","БУДУ КУШАТЬ","ПИЦЦА!"]
const OWNER := ["отдай…","мою пиццу…","отдай мою пиццу…"]
const RED := Color("#ed766b")
const BLUE := Color("#86b1f5")

var host: Node3D
var cast: RefCounted
var thief: Node3D
var owner: Node3D
var edge: RefCounted
var side := 1.0
var fleeing := false
var next := 45.0
var life := 90.0
var owner_exit := 0.0
var lines := Vector2i.ZERO
var talk := Vector2.ZERO
var aim_in := 0.0


func begin() -> void:
	clear()
	next = randf_range(35,60)


func clear() -> void:
	cast.retire(thief)
	cast.retire(owner)
	thief = null
	owner = null
	edge = null


func _sidewalk() -> Vector2:
	return edge.b+edge.right*(edge.width*0.5+1.25)*side


func _spawn(observer: Vector2) -> bool:
	var local: Array = host.traffic.roads.around(observer,150.0)
	if local.is_empty():
		return false
	for attempt in 20:
		var e: RefCounted = local.pick_random()
		if e.bridge or e.length<12.0:
			continue
		side = 1 if randf()<0.5 else -1
		var p: Vector2 = e.a.lerp(e.b,randf_range(0.1,0.65))+e.right*(e.width*0.5+1.65)*side
		var distance := p.distance_to(observer)
		if distance<60 or distance>150 or not host._clear_yard(p,0.3):
			continue
		edge = e
		thief = cast.actor(0,p,Color("#1b1a1f"))
		owner = cast.actor(randi()%5,p-Vector2(e.dir)*3.0)
		cast.prop(thief.model,Vector3(0.24,0.22,0.24),Vector3(0,1.57,0.01),Color("#2b2a30"))
		cast.prop(thief.model,Vector3(0.19,0.038,0.02),Vector3(0,1.60,0.14),Color("#fff3d6"))
		var box: Node3D = cast.prop(thief.model,Vector3(0.39,0.057,0.40),Vector3(0,1.12,0.26),Color("#ceb384"))
		cast.prop(box,Vector3(0.40,0.017,0.41),Vector3.UP*0.035,Color("#e6cc9e"))
		cast.prop(box,Vector3(0.25,0.005,0.062),Vector3.UP*0.046,Color("#9d4032"))
		cast.say(thief,THIEF[0],RED)
		cast.say(owner,OWNER[0],BLUE)
		lines = Vector2i.ZERO
		talk = Vector2(1.1,1.5)
		owner_exit = 0
		life = 90
		fleeing = false
		aim_in = 0
		cast.walk(thief,_sidewalk(),3.2)
		return true
	return false


func _finish(caught: bool) -> void:
	cast.retire(thief,caught)
	thief = null
	edge = null
	next = randf_range(60,110)
	if owner!=null:
		cast.walk(owner,cast.at(owner),1.0)
		cast.say(owner,"спасибо!!!" if caught else "эх…",Color("#80c690") if caught else BLUE,4.0 if caught else 3.0)
		owner_exit = 4.0 if caught else 3.0
		if caught:
			owner._emote(5)


func hit(person: Node3D, kmh: float) -> void:
	if kmh<=10.8:
		return
	if person==thief:
		_finish(true)
		host.reward(2400,"похититель пиццы наказан","thief")
	elif person==owner:
		cast.retire(owner,true)
		owner = null


func step(dt: float, observer: Vector2, calm: bool) -> void:
	if thief==null:
		if owner!=null:
			owner_exit -= dt
			if owner_exit<=0:
				cast.retire(owner)
				owner = null
		if not calm:
			next -= dt
			if next<=0.0 and not _spawn(observer):
				next = 3.0
		return
	var p: Vector2 = cast.at(thief)
	var distance := p.distance_to(observer)
	life -= dt
	if life<=0.0 or distance>330.0:
		_finish(false)
		return
	talk.x -= dt
	talk.y -= dt
	if talk.x<=0:
		lines.x = (lines.x+1)%THIEF.size()
		cast.say(thief,THIEF[lines.x],RED)
		talk.x = 1.1
	if owner!=null and talk.y<=0:
		lines.y = (lines.y+1)%OWNER.size()
		cast.say(owner,OWNER[lines.y],BLUE)
		talk.y = 1.5
	aim_in -= dt
	if aim_in>0:
		return
	aim_in = 0.15
	if distance<20.0:
		var away := observer.direction_to(p)
		cast.walk(thief,p+away*8,5.2)
		fleeing = true
	else:
		if fleeing:
			edge = host.traffic.roads.nearest(p)
			fleeing = false
		if edge==null:
			_finish(false)
			return
		if thief.reverse or p.distance_squared_to(_sidewalk())<1.2:
			var next_edge: RefCounted = host.traffic.roads.choose_after(edge)
			if next_edge!=null:
				edge = next_edge
		cast.walk(thief,_sidewalk(),3.2)
	if owner!=null:
		var forward := Vector2(sin(thief.rotation.y),cos(thief.rotation.y))
		var target := p-forward*3
		var d: float = cast.at(owner).distance_to(target)
		if d>12 and not host._clear_yard(target,0.3):
			target = p-forward
		cast.walk(owner,target,minf(d*2.2,5.6))
