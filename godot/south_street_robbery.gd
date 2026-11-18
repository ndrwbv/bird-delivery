extends RefCounted

const GANG := ["Слышь, телефон дай позвонить!","Сумку сюда, быстро!","Ты чё, не с нашего района?","Карманы вывернул, сука!","Чё ты дёргаешься?"]
const KIDS := ["Дай позвонить!","Сумку давай!","Ты с какого района?","Деньги есть?","Чё ты дёргаешься?"]
const HELP := ["Помогите!","Отстаньте!","Да нет у меня ничего!","Люди, помогите!"]
const THANKS := ["Спасибо, выручил!","Дай бог тебе здоровья!","Век не забуду!","Ох, спасибо, сынок!"]
const TRACK := ["#25405c","#302931","#36513e","#51505a"]
var host: Node3D
var cast: RefCounted
var state := ""
var victim: Node3D
var crowd: Array[Node3D] = []
var bag: MeshInstance3D
var next := 35.0
var count := 0
var point := Vector2.ZERO
var normal := Vector2.RIGHT
var age := 0.0
var witness := 0.0
var talk := Vector2.ZERO
var push_in := 0.0
var to_spawn := 0
var index := 0


func begin() -> void:
	clear()
	next = randf_range(25,45)
	count = 0


func clear() -> void:
	if victim!=null:
		cast.retire(victim)
	for p in crowd:
		cast.retire(p)
	victim = null
	bag = null
	crowd.clear()
	if not state.is_empty():
		host.end_event("thugs")
	state = ""
	to_spawn = 0
	next = randf_range(45,80)


func _site(p: Vector2, nose: Vector2) -> bool:
	for i in 40:
		var ray := nose.rotated(randf_range(-1.1,1.1)*(2.5 if i>25 else 1.0))
		var q := p+ray*randf_range(70,140)
		if not host.garage_zone.contains(q):
			continue
		var e: RefCounted = host.traffic.roads.nearest(q)
		if e==null or e.bridge or e.rank>4:
			continue
		var center := Geometry2D.get_closest_point_to_segment(q,e.a,e.b)
		if q.distance_to(center)>35:
			continue
		var side: Vector2 = e.right if (q-center).dot(e.right)>=0 else -e.right
		q = center+side*(e.width*0.5+randf_range(2.4,3.4))
		if q.distance_to(p)<55 or not Geometry2D.is_point_in_polygon(q,host.garage_zone.enclosing) or not host._clear_yard(q,1.8):
			continue
		point = q
		normal = side
		return true
	return false


func _start() -> void:
	count += 1
	state = "press"
	age = 0
	witness = 0
	talk = Vector2(0.6,1.4)
	push_in = randf_range(1.1,2.2)
	victim = cast.actor(randi()%5,point)
	victim.rotation.y = atan2(-normal.x,-normal.y)
	bag = cast.prop(victim.grip.cash,Vector3(0.22,0.28,0.11),Vector3(0,-0.15,0),Color("#8a493d"))
	to_spawn = randi_range(2,4)
	index = 0


func _add_one() -> void:
	var dir := -normal.rotated((index-(to_spawn-1)*0.5)*(1.05 if to_spawn>3 else 1.3))
	var p := point+dir*randf_range(0.95,1.3)
	var who: Node3D = cast.actor([0,2,4][index%3],p,Color(TRACK[index]))
	who.rotation.y = atan2(-dir.x,-dir.y)
	cast.prop(who.model,Vector3(0.29,0.09,0.31),Vector3(0,1.68,0),Color("#26313d"))
	crowd.append(who)
	index += 1


func _resolve(rescued: bool) -> void:
	if state!="press":
		return
	index = to_spawn
	state = "flee" if rescued else "robbed"
	age = 0
	var observer: Vector2 = cast.at(host.car)
	for who in crowd:
		var p: Vector2 = cast.at(who)
		var away := observer.direction_to(p) if rescued else normal.rotated(PI*0.5)
		cast.walk(who,p+away*40.0+Vector2(randf_range(-8,8),randf_range(-8,8)),5.5 if rescued else 1.6)
	if not crowd.is_empty():
		cast.say(crowd[0],["Шухер!","Валим, пацаны!","Атас!"].pick_random() if rescued else "Спасибо за сумочку!",Color("#ed766b"))
	if rescued:
		var tip := 0
		if victim!=null:
			cast.say(victim,THANKS.pick_random(),Color("#80c690"))
			victim._emote(4)
			if randf()<0.5:
				tip = roundi(randf_range(300,1200)/50)*50
		host.reward(tip,"спас прохожего!","helpedCivil")
		if tip<=0:
			host.notice.emit(host.tr("спас прохожего!"))
	elif victim!=null:
		cast.say(victim,"Сумку отняли…",Color("#86b1f5"))
		if not crowd.is_empty() and is_instance_valid(bag):
			bag.reparent(crowd[0].grip.cash,false)


func honk() -> void:
	if state=="press" and point.distance_to(cast.at(host.car))<=25.0:
		_resolve(true)


func hit(who: Node3D, kmh: float) -> void:
	if kmh<20:
		return
	if who==victim:
		cast.retire(victim,true)
		victim = null
		_resolve(false)
	elif crowd.has(who):
		crowd.erase(who)
		cast.retire(who,true)
		_resolve(true)


func step(delta: float, at: Vector2) -> void:
	if state.is_empty():
		if not host.garage_zone.late() or count>=4:
			return
		next -= delta
		if next>0:
			return
		next = 2.0
		if host.garage_zone.gang not in ["","wait"] or not host.can_event("thugs"):
			return
		var v := Vector2(host.car.velocity.x,host.car.velocity.z)
		var nose := v.normalized() if v.length_squared()>9.0 else Vector2(-host.car.basis.z.x,-host.car.basis.z.z)
		if _site(at,nose) and host.start_event("thugs"):
			_start()
		return
	age += delta
	var dist := at.distance_to(point)
	if dist>230 or (state=="flee" and age>9.0) or (state=="robbed" and age>12.0):
		clear()
		return
	if state!="press":
		return
	if index<to_spawn:
		_add_one()
	if dist<8.5 and absf(host.car.speed)*3.6>=25:
		for who in crowd:
			if at.distance_to(cast.at(who))<7:
				_resolve(true)
				return
	if dist<10 and absf(host.car.speed)<2:
		witness += delta
		if witness>=2.5:
			_resolve(true)
			return
	else:
		witness = maxf(0,witness-delta)
	if age>35.0:
		_resolve(false)
		return
	talk -= Vector2.ONE*delta
	push_in -= delta
	if not crowd.is_empty():
		if push_in<=0:
			push_in = randf_range(1.1,2.2)
			var man: Node3D = crowd.pick_random()
			if host.traffic.people._clear_to_use(man):
				man.player.play("exchange",0.12,1.7)
				man.player.queue("idle")
		if talk.x<=0:
			talk.x = randf_range(2.4,3.8)
			cast.say(crowd.pick_random(),GANG.pick_random() if host.garage_zone.adults else KIDS.pick_random(),Color("#ed766b"))
	if victim!=null and talk.y<=0:
		talk.y = randf_range(2.6,4.0)
		cast.say(victim,HELP.pick_random(),Color("#86b1f5"))
