extends RefCounted

var host: Node3D
var cast: RefCounted
var groups: Array[Dictionary] = []
var next := 8.0
var stage := 0
var announce_in := 4.5


func begin() -> void:
	clear()
	stage = host._protest_stage()
	next = randf_range(5,15)
	announce_in = -1.0 if host.ride or host.quick else 4.5


func clear() -> void:
	for g in groups:
		for m: Dictionary in g.people:
			cast.retire(m.actor)
		if is_instance_valid(g.dust):
			g.dust.queue_free()
	if not groups.is_empty():
		host.end_event("riot")
	groups.clear()


func _announce() -> void:
	var topic: Dictionary = host.protest_topic
	if stage<2 or topic.is_empty():
		return
	var key := "%d/%s/%d"%[host.last_cycle,topic.id,stage]
	if host.profile.data.get("protest_announcement","")==key:
		return
	var title: String = topic.get("kids",topic.title) if not host.garage_zone.adults else topic.title
	var text: String = host.tr(topic.win) if stage==5 else host.tr(host.dialogue.announce[stage]).format({"title":host.tr(title)})
	host.profile.data.protest_announcement = key
	host.notice.emit(text)


func _site(observer: Vector2) -> Vector2:
	var v := Vector2(host.car.velocity.x,host.car.velocity.z)
	var axis := v.normalized() if v.length_squared()>9 else Vector2(-host.car.basis.z.x,-host.car.basis.z.z)
	for i in 30:
		var guess := observer+axis.rotated(randf_range(-1.4,1.4)+(PI if i>18 else 0.0))*randf_range(45,150)
		var e: RefCounted = host.traffic.roads.nearest(guess)
		if e==null or e.bridge or e.rank>4:
			continue
		var foot := Geometry2D.get_closest_point_to_segment(guess,e.a,e.b)
		if foot.distance_to(guess)>35:
			continue
		var normal: Vector2 = e.right if Vector2(e.right).dot(guess-foot)>0 else -e.right
		var p: Vector2 = foot+normal*(e.width*0.5+randf_range(2.3,3.5))
		if p.distance_to(observer)<40 or not host._clear_yard(p,0.5) or not Geometry2D.is_point_in_polygon(p,host.garage_zone.enclosing):
			continue
		if groups.size()>0 and p.distance_to(groups[0].p)<40:
			continue
		return p
	return Vector2.INF


func _spawn(observer: Vector2) -> bool:
	var p := _site(observer)
	if not p.is_finite() or (groups.is_empty() and not host.start_event("riot")):
		return false
	groups.append({"p":p,"n":randi_range(2,3),"built":0,"t":0.0,"life":randf_range(40,70),"say":0.5,"dust_in":1.0,
		"dust":null,"people":[]})
	return true


func hit(who: Node3D, kmh: float) -> void:
	if kmh<20:
		return
	for group in groups:
		for i in group.people.size():
			if group.people[i].actor==who:
				group.people.remove_at(i)
				cast.retire(who,true)
				return


func _add(g: Dictionary) -> void:
	var angle := TAU*int(g.built)/int(g.n)+randf_range(-0.3,0.3)
	var p: Vector2 = g.p+Vector2.from_angle(angle)*(0.85/(2*sin(PI/int(g.n))))
	var index := randi()%5
	var shade: Color = [Color("#d9342c"),Color("#2f6fd8"),Color("#f2c230"),Color("#59b06a")].pick_random()
	var who: Node3D = cast.actor(index,p,shade)
	g.people.append({"actor":who,"rest":randf_range(0.35,1.1),"lean":0.0})
	g.built += 1


func _dust(g: Dictionary) -> void:
	var puff: CPUParticles3D = g.dust
	if not is_instance_valid(puff):
		puff = CPUParticles3D.new()
		puff.one_shot = true
		puff.emitting = false
		puff.amount = 4
		puff.lifetime = 0.7
		puff.direction = Vector3.UP
		puff.spread = 50
		puff.gravity = Vector3.UP*.25
		puff.initial_velocity_min = 0.4
		puff.initial_velocity_max = 1.0
		puff.scale_amount_min = 0.35
		puff.scale_amount_max = 0.75
		var puff_mesh := SphereMesh.new()
		puff_mesh.radius = .32
		puff_mesh.height = .48
		puff_mesh.radial_segments = 6
		puff_mesh.rings = 2
		puff_mesh.material = host._paint(Color("#817c70"))
		puff.mesh = puff_mesh
		puff.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		host.add_child(puff)
		g.dust = puff
	puff.position = Vector3(g.p.x,host.ground.at(g.p.x,g.p.y)+.4,g.p.y)
	puff.restart()


func step(dt: float, observer: Vector2) -> void:
	if announce_in>0:
		announce_in -= dt
		if announce_in<=0:
			_announce()
	if stage!=4 or host.story:
		return
	if groups.size()<2:
		next -= dt
		if next<=0:
			next = randf_range(4,12) if _spawn(observer) else 3.0
	var built := false
	for i in range(groups.size()-1,-1,-1):
		var group := groups[i]
		var distance := observer.distance_to(group.p)
		group.t += dt
		if (group.built==group.n and group.people.is_empty()) or distance>220 or (group.t>group.life and distance>50):
			for m: Dictionary in group.people:
				cast.retire(m.actor)
			if is_instance_valid(group.dust):
				group.dust.queue_free()
			groups.remove_at(i)
			if groups.is_empty():
				host.end_event("riot")
			continue
		if not built and group.built<group.n:
			_add(group)
			built = true
		group.say -= dt
		group.dust_in -= dt
		if group.people.is_empty():
			continue
		if group.say<=0:
			group.say = randf_range(2,3.5)
			var pool: Array = host.dialogue.riot+host.protest_topic.get("chant",[])
			if host.garage_zone.adults:
				pool += host.dialogue.riot_adult
			cast.say(group.people.pick_random().actor,pool.pick_random(),Color("#ed766b"))
		if group.dust_in<=0 and distance<150:
			group.dust_in = randf_range(1.5,3)
			_dust(group)
		for j in group.people.size():
			var m: Dictionary = group.people[j]
			var who: Node3D = m.actor
			who.player.active = distance<72
			if distance>100 or group.people.size()<2 or not host.traffic.people._clear_to_use(who):
				continue
			var other: Dictionary = group.people[(j+1)%group.people.size()]
			var p: Vector2 = cast.at(who)
			var goal: Vector2 = cast.at(other.actor)
			var dir := p.direction_to(goal)
			who.rotation.y = lerp_angle(who.rotation.y,atan2(dir.x,dir.y),1-exp(-6.0*dt))
			m.lean = maxf(0,float(m.lean)-dt*2)
			who.model.rotation.x = -float(m.lean)*.3
			m.rest -= dt
			if m.rest>0:
				continue
			m.rest = randf_range(.35,1.1)+.5
			if p.distance_to(goal)>1.15:
				cast.walk(who,goal-dir*.85,2.4)
			else:
				cast.walk(who,p,1.0)
				who.player.play("exchange",.1,1.8)
				who.player.queue("idle")
				other.lean = 1.0
