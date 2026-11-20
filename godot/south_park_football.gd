extends Node3D

signal scored(at:Vector3)
const RADIUS:=.24
var terrain:RefCounted
var car:CharacterBody3D
var sky:Node
var people:Node
var paint:Material
var make_actor:Callable
var pitches:Array[Dictionary]=[]
var matches:Array[Dictionary]=[]
var scan:=0.0
var active:=false
var rng:=RandomNumberGenerator.new()
var ball_mesh:=SphereMesh.new()
var ball_paint:=StandardMaterial3D.new()
var markings_paint:=StandardMaterial3D.new()
var frame_paint:=StandardMaterial3D.new()
var post:=BoxMesh.new()

func setup(_region:Dictionary, ground:RefCounted, vehicle:CharacterBody3D, traffic:Node, _events:Node, atmosphere:Node,
		recipients:Node, material:Material, _base:Vector2) -> void:
	terrain=ground
	car=vehicle
	sky=atmosphere
	people=recipients
	paint=material
	make_actor=traffic.people.create_person
	ball_mesh.radius=RADIUS
	ball_mesh.height=2*RADIUS
	ball_mesh.radial_segments=10
	ball_mesh.rings=5
	ball_paint.albedo_color=Color("#f4f4ee")
	markings_paint.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	markings_paint.albedo_color=Color("#eae9d9")
	frame_paint.albedo_color=Color("#f4f4ee")
	post.size=Vector3.ONE
	var data:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_park.json"))
	var yards: Dictionary = _region.get("yard_spaces",{})
	for spec:Dictionary in data.pitches+yards.get("pitches",[]):
		var axis:=Vector2(spec.axis[0],spec.axis[1]).normalized()
		pitches.append({"at":Vector2(spec.at[0],spec.at[1]),"axis":axis,"side":Vector2(-axis.y,axis.x),
			"l":float(spec.length)*.5,"w":float(spec.width)*.5,"goal":minf(3.6,float(spec.width)*.3),
			"baked":spec.baked,"arena":null,"frames":[]})

func begin(number:int,seed_value:int,_adult:bool) -> void:
	clear()
	rng.seed=("%d/football/%d"%[seed_value,number]).hash()
	active=true
	scan=0

func step(delta:float,_hour:float) -> void:
	if not active: return
	var observer:=Vector2(car.position.x,car.position.z)
	scan-=delta
	if scan<=0:
		scan=1
		_scan(observer)
	for m in matches:
		if m.pitch.at.distance_squared_to(observer)>=139.0*139.0:
			_set_suspended(m,true)
			continue
		_set_suspended(m,false)
		if m.players.size()<6:
			m.spawn-=delta
			if m.spawn<=0:
				_player(m,m.players.size())
				m.spawn=.08
		_ball(m,observer,delta)
		_teams(m,delta)

func _set_suspended(m:Dictionary,suspended:bool) -> void:
	if m.get("suspended",false)==suspended: return
	m.suspended=suspended
	m.ball.visible=not suspended
	for player:Dictionary in m.players:
		var actor:Node3D=player.node
		if is_instance_valid(actor) and not player.fell:
			actor.visible=not suspended
			if suspended:
				actor.player.pause()
			else:
				actor.player.play()

func _scan(observer:Vector2) -> void:
	var day:bool=sky.night<.45 and sky.wet<.5
	var closest:Dictionary={}
	var best:=135.0*135.0
	for pitch in pitches:
		var d:=observer.distance_squared_to(pitch.at)
		if not pitch.baked:
			if d<205.0*205.0 and not is_instance_valid(pitch.arena): _field(pitch)
			elif d>255.0*255.0 and is_instance_valid(pitch.arena):
				pitch.arena.queue_free()
				pitch.arena=null
				pitch.frames.clear()
		var m:Dictionary=pitch.get("match",{})
		if not m.is_empty():
			if d>220.0*220.0 or not day: _stop(m)
		elif day and d<best:
			closest=pitch
			best=d
	if closest.is_empty(): return
	if matches.size()>=2:
		# Prefer the yard the player is actually approaching.
		var farthest:Dictionary={}
		var farthest_distance:=sqrt(best)+21.0
		for match_:Dictionary in matches:
			var at:Vector2=match_.pitch.at
			var distance:=at.distance_to(observer)
			if distance>farthest_distance:
				farthest_distance=distance
				farthest=match_
		if not farthest.is_empty(): _stop(farthest)
	if matches.size()<2: _start(closest)

func _world(s:Dictionary,a:float,b:float) -> Vector2:
	return s.at+s.axis*a+s.side*b

func _point(s:Dictionary,a:float,b:float,h:float) -> Vector3:
	var p:=_world(s,a,b)
	return Vector3(p.x,terrain.land_height(p.x,p.y)+h,p.y)

func _stripe(mesh:SurfaceTool,s:Dictionary,start:Vector2,end:Vector2) -> void:
	var across:Vector2=(end-start).normalized().orthogonal()*.065
	var steps:=maxi(1,ceili(start.distance_to(end)/2.0))
	for i in steps:
		var a:=start.lerp(end,float(i)/steps)
		var b:=start.lerp(end,float(i+1)/steps)
		for p:Vector2 in [a-across,b+across,a+across,a-across,b-across,b+across]:
			mesh.set_normal(Vector3.UP)
			mesh.add_vertex(_point(s,p.x,p.y,.075))

func _field(s:Dictionary) -> void:
	var root:=Node3D.new()
	add_child(root)
	var surface:=SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for sign_value in [-1,1]:
		var a:float=s.l*sign_value
		var b:float=s.w*sign_value
		_stripe(surface,s,Vector2(a,-s.w),Vector2(a,s.w))
		_stripe(surface,s,Vector2(-s.l,b),Vector2(s.l,b))
		var boxline:float=sign_value*(s.l-minf(6,s.l/3.0))
		var spread:float=minf(9,s.w*1.1)*.5
		_stripe(surface,s,Vector2(a,-spread),Vector2(boxline,-spread))
		_stripe(surface,s,Vector2(boxline,-spread),Vector2(boxline,spread))
		_stripe(surface,s,Vector2(boxline,spread),Vector2(a,spread))
		var posts:=Node3D.new()
		var center:=_point(s,a,0,0)
		posts.position=center
		posts.rotation.y=-atan2(s.axis.y,s.axis.x)
		root.add_child(posts)
		for local_z:float in [-s.goal*.5,s.goal*.5]:
			_part(posts,Vector3(0,1,local_z),Vector3(.12,2,.12))
		_part(posts,Vector3(0,2,0),Vector3(.12,.12,s.goal+.12))
		s.frames.append({"node":posts,"at":Vector2(center.x,center.z),"hit":false})
	_stripe(surface,s,Vector2(0,-s.w),Vector2(0,s.w))
	var radius:=minf(3,s.w*.4)
	for i in 12:
		_stripe(surface,s,Vector2.from_angle(i*TAU/12)*radius,Vector2.from_angle((i+1)*TAU/12)*radius)
	var markings:=MeshInstance3D.new()
	markings.mesh=surface.commit()
	markings.material_override=markings_paint
	markings.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(markings)
	s.arena=root

func _part(root:Node3D,at:Vector3,size_:Vector3) -> void:
	var mesh:=MeshInstance3D.new()
	mesh.mesh=post
	mesh.material_override=frame_paint
	mesh.position=at
	mesh.scale=size_
	root.add_child(mesh)

func _start(s:Dictionary) -> void:
	var ball:=MeshInstance3D.new()
	ball.mesh=ball_mesh
	ball.material_override=ball_paint
	add_child(ball)
	var m:Dictionary={"pitch":s,"players":[],"score":[0,0],"ball":ball,"at":Vector2.ZERO,"v":Vector2.ZERO,
		"height":RADIUS,"up":0.0,"out":0.0,"spawn":0.0,"inside":true}
	s.match=m
	matches.append(m)
	_reset(m)

func _reset(m:Dictionary) -> void:
	m.at=m.pitch.at
	m.height=RADIUS
	m.v=Vector2.ZERO
	m.up=0.0
	m.out=0.0

func _player(m:Dictionary,i:int) -> void:
	var s:Dictionary=m.pitch
	var team:=0 if i<3 else 1
	var home:=Vector2((1 if team else -1)*s.l*2*[.35,.15,.2][i%3],[0,-.5,.5][i%3]*s.w)
	var at:=_world(s,home.x,home.y)
	var p:Dictionary=people.worker(rng.randi())
	p.shirt=1 if team else 0
	var actor:Node3D=make_actor.call(int(p.model),at,at,0)
	var shirt:Material=people.clothing(p,paint)
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false): mesh.material_override=shirt
	var player:AnimationPlayer=actor.player
	player.get_animation("walk").loop_mode=Animation.LOOP_LINEAR
	m.players.append({"at":at,"node":actor,"team":team,"home":home,"cd":0.0,"shock":0.0,
		"pace":rng.randf_range(.86,1.15),"fell":false,"running":false})

func _ball(m:Dictionary,observer:Vector2,delta:float) -> void:
	var s:Dictionary=m.pitch
	m.up-=18*delta
	m.height+=m.up*delta
	if m.height<RADIUS:
		m.height=RADIUS
		m.up=-m.up*.45 if absf(m.up)>2 else 0.0
	m.at+=m.v*delta
	m.v*=exp(-(.3 if m.height>.3 else 1.2)*delta)
	var relative:Vector2=m.at-s.at
	var a:float=relative.dot(s.axis)
	var b:float=relative.dot(s.side)
	m.inside=absf(a)<s.l+1.5 and absf(b)<s.w+1.5
	if m.inside:
		m.out=0
		if absf(a)>s.l and absf(b)<s.goal*.5 and m.height<2:
			_goal(m,0 if a>0 else 1)
		else:
			var va:float=m.v.dot(s.axis)
			var vb:float=m.v.dot(s.side)
			if absf(a)>s.l+1.2 and a*va>0: va=-va*.6
			if absf(b)>s.w+1.2 and b*vb>0: vb=-vb*.6
			m.v=s.axis*va+s.side*vb
	else:
		m.out+=delta
		if m.out>4: _reset(m)
	var car_v:=Vector2(car.velocity.x,car.velocity.z)
	if car_v.length_squared()>4:
		if observer.distance_squared_to(m.at)<2.2*2.2:
			m.v=car_v*1.3+Vector2(rng.randf_range(-2,2),rng.randf_range(-2,2))
			m.up=minf(9,car_v.length()*.35)
		if not s.baked:
			for frame:Dictionary in s.frames:
				if frame.hit or observer.distance_squared_to(frame.at)>16: continue
				var hull:Vector3=car.to_local(frame.node.position)
				if absf(hull.x)>1.0+s.goal*.5 or absf(hull.z)>2.5: continue
				frame.hit=true
				var knock:Tween=frame.node.create_tween()
				knock.tween_property(frame.node,"rotation:z",signf(car_v.dot(s.axis))*PI*.49,.34).set_trans(Tween.TRANS_SINE)
	m.ball.position=Vector3(m.at.x,terrain.land_height(m.at.x,m.at.y)+m.height,m.at.y)
	m.ball.rotation.x+=m.v.length()*delta*3

func _teams(m:Dictionary,delta:float) -> void:
	var s:Dictionary=m.pitch
	var closest:Array=[null,null]
	var dists:=[INF,INF]
	for p:Dictionary in m.players:
		if not is_instance_valid(p.node): continue
		var actor:Node3D=p.node
		var down:bool=actor.defeated or actor.knockdown>0 or actor.stunned>0 or actor.recovery>0 or actor.ragdoll!=null
		if down and not p.fell:
			for other:Dictionary in m.players: other.shock=2.5
		p.fell=down
		p.shock=maxf(0,p.shock-delta)
		if down or p.shock>0: continue
		var d:float=p.at.distance_squared_to(m.at)
		if d<dists[p.team]:
			closest[p.team]=p
			dists[p.team]=d
	var rel:Vector2=m.at-s.at
	var shift_a:=clampf(rel.dot(s.axis)*.35,-s.l*.4,s.l*.4)
	var shift_b:=clampf(rel.dot(s.side)*.3,-s.w*.4,s.w*.4)
	for p:Dictionary in m.players:
		if not is_instance_valid(p.node) or p.fell: continue
		var actor:Node3D=p.node
		actor.show()
		var chasing:bool=m.inside and closest[p.team]!=null and closest[p.team].node==actor
		var target:Vector2=m.at if chasing else _world(s,p.home.x+shift_a,p.home.y+shift_b)
		var rest:Vector2=target-p.at
		var move:bool=p.shock<=0 and rest.length_squared()>.09
		if move:
			var pace:float=(4.6 if chasing else 2.6)*p.pace
			p.at=p.at.move_toward(target,pace*delta)
			actor.position=Vector3(p.at.x,terrain.land_height(p.at.x,p.at.y),p.at.y)
			actor.rotation.y=lerp_angle(actor.rotation.y,atan2(rest.x,rest.y),1-exp(-10*delta))
		if move!=p.running:
			actor.player.play(&"walk" if move else &"idle",.1,1.7 if move else 1.0)
			p.running=move
		p.cd-=delta
		if p.shock>0 or p.cd>0 or p.at.distance_squared_to(m.at)>=.64 or m.height>=.6: continue
		var goal:=_world(s,(-1 if p.team else 1)*s.l,rng.randf_range(-s.goal,s.goal))
		m.v=m.at.direction_to(goal)*rng.randf_range(7,12)
		m.up=rng.randf_range(2,4) if rng.randf()<.3 else 0.0
		p.cd=.8

func _goal(m:Dictionary,team:int) -> void:
	m.score[team]+=1
	for p:Dictionary in m.players:
		if p.team!=team or not is_instance_valid(p.node) or p.node.defeated: continue
		var line:=Label3D.new()
		line.text="%s %d:%d"%[tr("ГОООЛ!"),m.score[0],m.score[1]]
		line.billboard=BaseMaterial3D.BILLBOARD_ENABLED
		line.position.y=2.5
		line.modulate=Color("#64bb70")
		line.pixel_size=.009
		line.font_size=24
		p.node.add_child(line)
		var tween:=line.create_tween()
		tween.tween_interval(2.5)
		tween.tween_callback(line.queue_free)
		scored.emit(p.node.position)
		break
	_reset(m)

func _stop(m:Dictionary) -> void:
	for p:Dictionary in m.players:
		if is_instance_valid(p.node) and not p.node.defeated: p.node.queue_free()
	m.ball.queue_free()
	m.pitch.erase("match")
	matches.erase(m)

func clear() -> void:
	for m:Dictionary in matches.duplicate(): _stop(m)
	for s in pitches:
		if is_instance_valid(s.arena): s.arena.queue_free()
		s.arena=null
		s.frames=[]
	active=false
