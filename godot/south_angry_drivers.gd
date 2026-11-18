extends RefCounted

const RAGE := ["ты чё?!","куда прёшь!","я тебя запомнил","страховка есть?","в глаза смотри!","я только с мойки!","у меня тёща в ГАИ!","это машина жены!","кредит ещё не выплачен!","ну всё, я звоню маме"]
const SHOUT := ["эй, стой!","а ну стой!","догоню!","эй, стой!"]
const RED := Color("#ed766b")
var host: Node3D
var cast: RefCounted
var drivers: Array[Dictionary] = []
var chase_cd := 0.0


func clear() -> void:
	for state in drivers:
		_finish(state)
	drivers.clear()
	chase_cd = 0


func struck(v: CharacterBody3D, force: float) -> void:
	if v.owner_lost:
		return
	for state in drivers:
		if state.vehicle==v:
			if state.mode=="chase":
				state.mode = "cool"
				state.timer = 4.0
				v.cruise = state.cruise
				v.pace = 0
			elif state.mode=="recover":
				state.force = maxf(state.force,force)
			return
	if not host.running or v.shuttle or drivers.size()>=5:
		v.pace = 0.0
		v.resume_flow()
		return
	v.incident = true
	drivers.append({"vehicle":v,"mode":"recover","driver":null,"force":force,"time":0.0,
		"timer":0.0,"aim":0.0,"cruise":v.cruise,"hits":0,"attack":"kick","on_hood":false})


func _desk(v: Node3D) -> Vector2:
	return cast.at(v)-Vector2(v.basis.x.x,v.basis.x.z)*1.62+Vector2(v.basis.z.x,v.basis.z.z)*0.20


func _exit_vehicle(s: Dictionary) -> void:
	var v: CharacterBody3D = s.vehicle
	v.going = false
	v.pace = 0
	var p := _desk(v)
	s.driver = cast.actor(int(v.get_instance_id()%3)*2,p)
	var roll := randf()
	s.attack = "kick" if roll<0.45 else ("glass" if roll<0.75 else "hood")
	s.time = 28.0
	s.mode = "walk"
	s.aim = 0.0
	s.timer = 0.45
	cast.say(s.driver,RAGE.pick_random() if randf()<0.20 else "!",RED,2.6)


func _finish(s: Dictionary) -> void:
	if is_instance_valid(s.driver):
		cast.retire(s.driver)
	s.driver = null
	if is_instance_valid(s.vehicle) and not s.vehicle.is_queued_for_deletion():
		var v: CharacterBody3D = s.vehicle
		v.incident = false
		v.cruise = s.cruise
		if not v.owner_lost:
			v.resume_flow()
	s.mode = "done"


func _target(p: Vector2, car: CharacterBody3D, attack: String) -> Vector2:
	var l := car.to_local(Vector3(p.x,car.position.y,p.y))
	var side := 1.0 if l.x>=0 else -1.0
	var loc := Vector3(side*1.68,0,clampf(l.z,-2.8,2.8))
	if attack=="hood":
		loc = Vector3(0,0,-3.34)
	elif attack=="glass":
		loc.z = -0.48
	elif absf(l.z)>2.55:
		loc.x = clampf(l.x,-1.1,1.1)
		loc.z = signf(l.z)*3.05
	var target := car.to_global(loc)
	return Vector2(target.x,target.z)


func _strike(s: Dictionary, high: float) -> void:
	var car: CharacterBody3D = host.car
	var at: Vector3 = s.driver.global_position
	var local := car.to_local(at)
	var glass: bool = s.attack=="glass" and int(s.hits)<3
	var strength := 10.0 if glass else 8.0
	if s.attack=="hood":
		local = Vector3(0,1.16,-1.55)
		strength = 7.0
	elif glass:
		local = Vector3(clampf(local.x,-0.75,0.75),1.35,-1.14)
		if s.hits==2:
			strength = 16.0
	else:
		local = Vector3(clampf(local.x,-1,1),high,clampf(local.z,-2.44,2.44))
	var contact := car.to_global(local)
	car.damage.impact(contact,car.global_position.direction_to(contact),strength)
	s.hits += 1
	if s.hits%3==0:
		host.heart_hit.emit(1.0,contact)
	if glass and s.hits>=3:
		s.attack = "kick"
	host.road_thump.emit(2.2)


func _on_foot(s: Dictionary, dt: float, observer: Vector2) -> void:
	var car: CharacterBody3D = host.car
	var driver: Node3D = s.driver
	var v: CharacterBody3D = s.vehicle
	var p: Vector2 = cast.at(driver)
	s.time -= dt
	s.timer -= dt
	s.aim -= dt
	if s.mode=="climb":
		var clock: float = s.aim
		var fall := absf(car.speed)>5.0
		if s.time<=0 or fall:
			s.mode = "return"
			s.aim = 0
			driver.position.y = host.ground.at(p.x,p.y)
			if fall:
				var push := Vector3(car.velocity.x,0,car.velocity.z).normalized()
				driver.impact(8.0,push,false)
			return
		var climbed := clampf(-clock/0.45,0,1)
		var phase := maxf(0,-clock-0.45)/0.80
		var y := 1.12*climbed+0.6*sin(PI*fmod(phase,1))
		driver.global_position = car.to_global(Vector3(0,y,lerpf(-3.3,-1.55,climbed)))
		if int(phase)>s.hits:
			_strike(s,1.1)
		return
	if s.mode!="return" and (s.time<=0 or p.distance_to(observer)>70):
		s.mode = "return"
		s.aim = 0
	if s.mode=="return":
		var door := _desk(v)
		if p.distance_to(door)<0.9 or (p.distance_to(cast.at(v))<2.9 and s.time < -4.0) or s.time < -36.0:
			_finish(s)
		elif s.aim<=0:
			s.aim = 0.22
			cast.walk(driver,door,2.2)
		return
	if not host.traffic.people._clear_to_use(driver):
		return
	var target := _target(p,car,s.attack)
	var range_m := p.distance_to(target)
	if range_m<0.85:
		if s.mode=="walk":
			cast.walk(driver,p,2.2)
			if s.attack=="hood" and absf(car.speed)<2.0:
				s.mode = "climb"
				s.aim = 0
				driver.walker = false
				return
			if s.attack=="hood":
				s.attack = "kick"
			s.mode = "hit"
			s.timer = 0.42
		var facing := p.direction_to(observer)
		driver.rotation.y = atan2(facing.x,facing.y)
		if s.timer<=0:
			s.timer = 1.05 if s.attack=="glass" else 0.95
			driver.player.play("exchange",0.08,2.2)
			driver.player.queue("idle")
			_strike(s,0.68)
	elif s.aim<=0:
		s.mode = "walk"
		s.aim = 0.16
		cast.walk(driver,target,4.3)


func _pursuit(s: Dictionary, dt: float, observer: Vector2, distance: float) -> void:
	var v: CharacterBody3D = s.vehicle
	var car: CharacterBody3D = host.car
	if s.wait<=0:
		s.time -= dt
	s.lost = s.lost+dt if distance>70 else 0.0
	if s.time<=0 or distance>160 or s.lost>s.loss_limit:
		if distance>40 and not host.quick and not host.ride:
			host.reward(400,"оторвался от погони")
		_finish(s)
		return
	s.speech -= dt
	if s.speech<=0:
		s.speech = randf_range(1.6,2.6)
		cast.say(v,SHOUT.pick_random(),RED)
	s.aim -= dt
	if distance>=40:
		if s.aim<=0:
			s.aim = 2.5
			var target: RefCounted = host.traffic.roads.nearest(observer)
			if target!=null:
				v.resume_flow(target)
		return
	var pos: Vector2 = cast.at(v)
	var still := absf(car.speed)<1.5
	s.still = s.still+dt if still else 0.0
	if absf(car.speed)>3:
		s.wait = 0
	if s.wait>0:
		s.wait -= dt
		if s.wait<=0:
			if randf()<0.5:
				_exit_vehicle(s)
			else:
				_finish(s)
		return
	v.going = false
	v.set_physics_process(false)
	var direction := pos.direction_to(observer)
	var to := observer+Vector2(-car.basis.z.x,-car.basis.z.z)*5.0 if not still else observer-direction*float(s.gap)
	var offset := to-pos
	var bearing := atan2(-offset.x,-offset.y)
	var steer := angle_difference(v.rotation.y,bearing)
	var speed := minf(v.cruise, sqrt(7.0/maxf(0.016,absf(steer)*0.24)))
	if s.still>0.7:
		speed = minf(speed,sqrt(maxf(0.0,distance-float(s.gap))*5.0))
		if distance<=s.gap+1.0 and v.pace<1.6:
			v.pace = 0.0
			s.wait = randf_range(2,4)
			return
	v.pace = move_toward(v.pace,speed,(6.0 if speed<v.pace else 3.8)*dt)
	v.rotation.y = rotate_toward(v.rotation.y,bearing,minf(0.9,v.pace*0.26)*dt)
	var hit := v.move_and_collide(-v.basis.z*v.pace*dt)
	if hit:
		if hit.get_collider()==car:
			car.collision_damage(v.pace,true,hit.get_position(),-hit.get_normal())
			s.mode = "cool"
			s.timer = 4.0
			v.cruise = s.cruise
		else:
			s.aim = 2.5
			var edge: RefCounted = host.traffic.roads.nearest(observer)
			v.resume_flow(edge)
		v.pace = 0
	v.position.y = host.ground.at(v.position.x,v.position.z,v.position.y)+0.04


func hit(actor: Node3D, kmh: float) -> void:
	if kmh<20.0:
		return
	for s in drivers:
		if s.driver==actor and is_instance_valid(s.vehicle):
			s.vehicle.owner_lost = true
			s.vehicle.going = false
			cast.retire(actor,true)
			s.driver = null
			_finish(s)
			return


func step(delta: float, at: Vector2) -> void:
	chase_cd = maxf(0,chase_cd-delta)
	for i in range(drivers.size()-1,-1,-1):
		var s := drivers[i]
		if not is_instance_valid(s.vehicle) or s.vehicle.is_queued_for_deletion():
			if is_instance_valid(s.driver):
				cast.retire(s.driver)
			drivers.remove_at(i)
			continue
		var v: CharacterBody3D = s.vehicle
		var distance: float = cast.at(v).distance_to(at)
		match s.mode:
			"recover":
				if v.coast.length_squared()>0.05:
					continue
				v.pace = 0
				if s.force>6.0 and chase_cd<=0 and distance>=12 and distance<=96 and randf()<0.12:
					chase_cd = 180
					s.merge({"mode":"chase","time":randf_range(25,40),"aim":0.0,"speech":0.0,"wait":0.0,"still":0.0,"gap":randf_range(7.5,10),"lost":0.0,"loss_limit":randf_range(10,20)},true)
					v.cruise = host.car.tuned_speed*0.72
				elif s.force>6 and randf()<0.60:
					_exit_vehicle(s)
				else:
					_finish(s)
			"chase":
				_pursuit(s,delta,at,distance)
			"cool":
				s.timer -= delta
				if s.timer<=0:
					_finish(s)
			"walk","hit","climb","return":
				_on_foot(s,delta,at)
		if s.mode=="done":
			drivers.remove_at(i)
