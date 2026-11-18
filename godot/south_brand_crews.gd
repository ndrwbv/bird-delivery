extends RefCounted

const PIZZA := Color("#ff8a1c")
const SUSHI := Color("#1a8cff")
const BURGER := Color("#ffd000")
const PALE := Color("#ffd0c6")
var host: Node3D
var cast: RefCounted
var groups: Array[Dictionary] = []
var next := 20.0
var stand := 0.0
var horn_cd := 0.0


func clear() -> void:
	for group in groups:
		_remove(group)
	groups.clear()
	next = 20.0
	stand = 0.0
	horn_cd = 0.0


func _remove(g: Dictionary) -> void:
	if g.fight and not g.over:
		host.end_event("crew")
	for m: Dictionary in g.people:
		cast.retire(m.actor)


func _site(observer: Vector2) -> Vector2:
	var heading := Vector2(-host.car.basis.z.x,-host.car.basis.z.z)
	for k in 14:
		var ray := heading.rotated(randf_range(-1.3,1.3)+(PI if k>8 else 0.0))
		var probe := observer+ray*randf_range(90,260)
		var e: RefCounted = host.traffic.roads.nearest(probe)
		if e==null or e.bridge:
			continue
		var center := Geometry2D.get_closest_point_to_segment(probe,e.a,e.b)
		if center.distance_to(probe)>40:
			continue
		var side: Vector2 = e.right if Vector2(e.right).dot(probe-center)>=0 else -e.right
		var p: Vector2 = center+side*(e.width*0.5+2.8)
		if p.distance_to(observer)<72 or not Geometry2D.is_point_in_polygon(p,host.garage_zone.enclosing) or not host._clear_yard(p,0.3):
			continue
		var crowded := false
		for g in groups:
			if p.distance_to(g.p)<70:
				crowded = true
				break
		if not crowded:
			return p
	return Vector2.INF


func _start(observer: Vector2) -> void:
	var p := _site(observer)
	if not p.is_finite():
		return
	var fight: bool = randf()<0.35 and host.start_event("crew")
	var head := randi_range(1,2)
	var victim := 0
	if fight and randf()>=0.6:
		if randf()<0.5:
			victim = head
			head = 0
		else:
			victim = 1 if head==2 else 2
	var people := randi_range(3,5)
	var same: int = [0,0,1,2].pick_random()
	groups.append({"p":p,"fight":fight,"brand":same,"seen":false,"victim":victim,"head":head,"n":people,
		"nv":2 if people==5 else 1,"life":randf_range(15,40),"over":false,"bye":8.0,
		"talk":randf_range(0.5,2),"people":[],"added":0,"terminal":-1.0})


func _add(g: Dictionary) -> void:
	var i := int(g.added)
	g.added += 1
	var victim: bool = i<int(g.nv)
	var role := ("vic" if victim else "att") if g.fight else "hang"
	var brand: int = (g.victim if victim else g.head) if g.fight else g.brand
	var angle := TAU*i/int(g.n)+randf_range(-0.2,0.2)
	var r := randf_range(1.1,1.5)
	if g.fight:
		angle = randf()*TAU if victim else TAU*(i-int(g.nv))/(int(g.n)-int(g.nv))+randf_range(-0.3,0.3)
		r = randf_range(0.2,0.8) if victim else 2.2
	var p: Vector2 = g.p+Vector2.from_angle(angle)*r
	var shade: Color = [PIZZA,SUSHI,BURGER][brand]
	var actor: Node3D = cast.actor(randi()%5,p,shade)
	cast.prop(actor.model,Vector3(0.26,0.065,0.28),Vector3(0,1.68,0),shade)
	actor.rotation.y = atan2(float(g.p.x)-p.x,float(g.p.y)-p.y)
	g.people.append({"actor":actor,"brand":brand,"role":role,"time":randf_range(0.35,1.1),"lean":0.0})


func _finish(g: Dictionary, how: String) -> void:
	if g.over:
		return
	g.over = true
	g.added = g.n
	host.end_event("crew")
	var local_help: bool = int(g.victim)==0 and not host.ride and not host.quick
	if local_help and how in ["ko","honk"]:
		host.reward(400 if how=="ko" else 200,"Птица Пицца благодарит!","helpCrew" if how=="ko" else "honkCrew")
	elif local_help and g.seen:
		host.respect_earned.emit("passCrew")
	var fallen := false
	for m: Dictionary in g.people:
		var person: Node3D = m.actor
		if m.role=="att":
			var p: Vector2 = cast.at(person)
			var dir: Vector2 = cast.at(host.car).direction_to(p)
			cast.walk(person,p+dir.rotated(randf_range(-0.4,0.4))*40,4.2)
		elif how=="time" and not fallen:
			fallen = true
			var p: Vector2 = cast.at(person)
			cast.walk(person,p,1.0)
			if host.garage_zone.adults:
				person.impact(6.0,Vector3(sin(person.rotation.y),0,cos(person.rotation.y)),false)
				person.defeated = true
				person.knockdown = 30.0
			else:
				person.model.position.y = -0.52
			g.terminal = host.elapsed+8
		elif local_help and how in ["ko","honk"]:
			cast.say(person,["спасибо, брат!","ты лучший!","с нас пицца!"].pick_random(),Color("#a4e6b2"))
			person._emote(3)


func honk() -> void:
	if horn_cd>0:
		return
	horn_cd = 1.2
	var p: Vector2 = cast.at(host.car)
	for g in groups:
		if g.fight and not g.over and p.distance_to(g.p)<25:
			_finish(g,"honk")


func hit(who: Node3D, kmh: float) -> void:
	if kmh<20:
		return
	for g in groups:
		for i in g.people.size():
			var m: Dictionary = g.people[i]
			if m.actor!=who:
				continue
			if not host.ride and not host.quick:
				host.respect_earned.emit("ownCrew" if m.brand==0 else "rivalFighter")
			g.people.remove_at(i)
			cast.retire(who,true)
			if g.fight and not g.over and m.role=="att" and g.added>=g.n:
				var left := false
				for other: Dictionary in g.people:
					if other.role=="att":
						left = true
						break
				if not left:
					_finish(g,"ko")
			return


func _talk(g: Dictionary) -> void:
	if g.people.is_empty():
		return
	var speaker: Dictionary = g.people.pick_random()
	var brand: String = ["pizza","sushi","burger"][int(speaker.brand)]
	var line: String
	var data: Dictionary = host.dialogue.crews
	if not g.fight:
		line = data.chat[brand].pick_random()
	elif speaker.role=="vic":
		line = data.help.pick_random()
	elif host.garage_zone.adults and randf()<0.35:
		line = data.adult.pick_random()
	else:
		line = data.cry[brand].pick_random()
	cast.say(speaker.actor,line,PALE if g.fight else Color("#ffdfae"))


func _animate(g: Dictionary, dt: float) -> void:
	var target: Node3D
	for m: Dictionary in g.people:
		if m.role=="vic":
			target = m.actor
			break
	if target==null:
		return
	for m: Dictionary in g.people:
		var actor: Node3D = m.actor
		if not host.traffic.people._clear_to_use(actor):
			continue
		m.lean = maxf(0.0,float(m.lean)-dt*2)
		actor.model.rotation.x = -float(m.lean)*0.30
		if m.role!="att":
			continue
		m.time -= dt
		if m.time>0:
			continue
		m.time = randf_range(0.35,1.1)+0.5
		var p: Vector2 = cast.at(actor)
		var goal: Vector2 = cast.at(target)
		var dir := p.direction_to(goal)
		actor.rotation.y = atan2(dir.x,dir.y)
		if goal.distance_to(p)>1.12:
			cast.walk(actor,goal-dir*0.88,1.6)
		else:
			cast.walk(actor,p,1.6)
			actor.player.play("exchange",0.08,2.2)
			actor.player.queue("idle")
			for victim: Dictionary in g.people:
				if victim.actor==target:
					victim.lean = 0.75
					break


func step(dt: float, observer: Vector2, calm: bool) -> void:
	horn_cd = maxf(0,horn_cd-dt)
	if not calm:
		next -= dt
	if next<=0:
		next = randf_range(25,50)
		if groups.size()<3:
			_start(observer)
	var one := false
	var near_dispute := false
	for i in range(groups.size()-1,-1,-1):
		var g := groups[i]
		var d := observer.distance_to(g.p)
		if not g.over and g.added<g.n and not one:
			_add(g)
			one = true
		if g.over:
			g.bye -= dt
		if d>340 or (g.over and g.bye<=0) or (g.added==g.n and g.people.is_empty()):
			_remove(g)
			groups.remove_at(i)
			continue
		if g.fight and not g.over:
			g.life -= dt
			g.seen = g.seen or d<60
			near_dispute = near_dispute or d<25
			if g.life<=0:
				_finish(g,"time")
			elif d<170:
				_animate(g,dt)
		if d<60 and not g.over:
			g.talk -= dt
			if g.talk<=0:
				g.talk = randf_range(3,5) if g.fight else randf_range(4,8)
				_talk(g)
		for m: Dictionary in g.people:
			m.actor.visible = d<170
			m.actor.player.active = d<72 and not m.actor.defeated
	stand = stand+dt if near_dispute and absf(host.car.speed)<3 else 0.0
	if stand>1.5:
		stand = 0
		host.honk()
