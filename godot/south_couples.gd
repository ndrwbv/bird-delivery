extends RefCounted

var yard:Node
var roads:RefCounted
var signals:Node
var groups:Array[Dictionary]=[]
var scan:=0.0
var active:=false

func setup(courtyard:Node,traffic:Node) -> void:
	yard=courtyard
	roads=traffic.roads
	signals=traffic.signals

func begin() -> void:
	clear()
	active=true

func step(delta:float,observer:Vector2) -> void:
	if not active:return
	scan-=delta
	if scan<=0:
		scan=1.0
		for g:Dictionary in groups.duplicate():
			if observer.distance_squared_to(g.at)>230.0*230.0:_remove(g)
		if groups.size()<4 and yard.rng.randf()<.6:_spawn(observer)
	for g in groups:_move(g,observer,delta)

func _spawn(observer:Vector2) -> void:
	var nearby:Array=roads.around(observer,190)
	if nearby.is_empty():return
	for attempt in 18:
		var e:RefCounted=nearby[yard.rng.randi_range(0,nearby.size()-1)]
		if e.rank>5 or e.length<14 or e.bridge:continue
		var side:=1.0 if yard.rng.randf()<.5 else -1.0
		var at:Vector2=e.a+e.dir*yard.rng.randf_range(3,e.length-3)+e.right*(e.width*.5+1.45)*side
		var d:=at.distance_to(observer)
		if d<45 or d>170:continue
		var g:Dictionary={"at":at,"edge":e,"side":side,"goal":e.b+e.right*(e.width*.5+1.45)*side,
			"heading":atan2(e.dir.x,e.dir.y),"speed":yard.rng.randf_range(1,1.3),"ppl":[],"kind":"couple","down":false,
			"chat":0.0,"next_chat":yard.rng.randf_range(10,35),"heart":yard.rng.randf_range(4,10),"hands":yard.rng.randf()<.65,
			"cross":{},"next_cross":yard.rng.randf_range(20,90),"shock":0.0,"react":"","elapsed":0.0,"phase":0.0,"alone":false}
		var female:bool=yard.rng.randf()<.5
		var opposite:bool=yard.rng.randf()<.82
		for i in 2:
			var local:Vector2=e.right*(.42 if i==1 else -.42)
			var p:Dictionary={"home":at+local,"face":g.heading,"item":"","seat":false,"gender":female if i==0 or not opposite else not female}
			yard._spawn(g,p)
		groups.append(g)
		return

func _move(g:Dictionary,observer:Vector2,delta:float) -> void:
	var live:Array[Dictionary]=[]
	var down:=false
	var dead_at:Vector2=g.at
	for p:Dictionary in g.ppl:
		if not is_instance_valid(p.actor) or p.actor.defeated:
			if is_instance_valid(p.actor):dead_at=Vector2(p.actor.position.x,p.actor.position.z)
			continue
		live.append(p)
		if p.actor.stunned>0 or p.actor.knockdown>0 or p.actor.recovery>0 or p.actor.ragdoll!=null:down=true
	if live.is_empty():return
	if live.size()==1 and not g.alone:
		g.alone=true
		g.hands=false
		g.dead_at=dead_at
		g.react=("flee" if yard.rng.randf()<.55 else "freeze") if yard.adult else "kneel"
		g.elapsed=0
		var text:=tr("А-а-а! Помогите!") if g.react=="flee" else (tr("Нет!..") if g.react=="freeze" else tr("Ты как?!"))
		_label(live[0].actor,text,Color("#c23a4a"),2.6)
	if down:return
	var distance:=observer.distance_squared_to(g.at)
	for p in live:p.actor.visible=distance<130*130
	if not g.react.is_empty():
		_react(g,live[0],delta)
		return
	g.phase+=delta
	var crossing:Dictionary=g.cross
	if not crossing.is_empty() and crossing.phase>=0 and not g.get("crossing",false):
		if signals.light(crossing.phase)!=2:return
		g.crossing=true
	if crossing.is_empty() and (g.chat>0 or g.shock>0):
		g.chat=maxf(0,g.chat-delta)
		g.shock=maxf(0,g.shock-delta)
		for i in live.size():
			var p:=live[i]
			if p.actor.player.current_animation!=&"idle":p.actor.player.play(&"idle",.15)
			if live.size()==2:
				var opposite:Node3D=live[1-i].actor
				var offset:Vector3=opposite.position-p.actor.position
				p.actor.rotation.y=lerp_angle(p.actor.rotation.y,atan2(offset.x,offset.z),1-exp(-6*delta))
		if live.size()==2:_heart(g,live[0],distance,delta,true)
		return
	if g.at.distance_to(g.goal)<.18:_next(g)
	g.next_chat-=delta
	g.next_cross-=delta
	if g.next_chat<=0 and g.cross.is_empty() and live.size()==2:
		g.chat=yard.rng.randf_range(4,9)
		g.next_chat=yard.rng.randf_range(25,60)
		return
	if g.next_cross<=0 and g.cross.is_empty():
		_zebra(g)
		g.next_cross=yard.rng.randf_range(20,90)
	var direct:Vector2=g.at.direction_to(g.goal)
	g.at=g.at.move_toward(g.goal,g.speed*delta*(1.25 if not g.cross.is_empty() else 1.0))
	g.heading=lerp_angle(g.heading,atan2(direct.x,direct.y),1-exp(-6*delta))
	var side:=Vector2(cos(g.heading),-sin(g.heading))
	for i in live.size():
		var p:=live[i]
		var at:Vector2=g.at+(side*(.42 if i==1 else -.42) if live.size()==2 else Vector2.ZERO)
		var actor:Node3D=p.actor
		actor.position=Vector3(at.x,yard.terrain.land_height(at.x,at.y),at.y)
		actor.rotation.y=g.heading
		actor.model.position.y=0
		if actor.player.current_animation!=&"walk":
			actor.player.play(&"walk",.18,g.speed)
			actor.player.seek(fmod(g.phase,actor.player.current_animation_length),true)
		if g.hands and distance<60*60:p.pose.hold_hand(i==0,g.phase)
	if g.hands:_heart(g,live[0],distance,delta,false)
	if not g.cross.is_empty():
		var z:Dictionary=g.cross
		z.occupied=absf((g.at-z.p).dot(Vector2(-z.dir.y,z.dir.x)))<z.width*.5+.4

func _zebra(g:Dictionary) -> void:
	var key:=Vector2i((g.at/80.0).floor())
	for z:Dictionary in signals.zebra_cells.get(key,[]):
		if g.at.distance_squared_to(z.p)>11*11 or z.occupied:continue
		var across:=Vector2(-z.dir.y,z.dir.x)
		var sign_value:float=signf((g.at-z.p).dot(across))
		if sign_value==0:continue
		g.cross=z
		g.crossing=false
		g.side*=-1
		g.goal=z.p-across*sign_value*(z.width*.5+1.45)
		return

func _next(g:Dictionary) -> void:
	var current:RefCounted=g.edge
	if not g.cross.is_empty():
		g.cross.occupied=false
		g.cross={}
		g.goal=current.b+current.right*(current.width*.5+1.45)*g.side
		return
	var choices:Array=roads.exits.get(current.b,[])
	var next:RefCounted=null
	var best:=-INF
	for candidate:RefCounted in choices:
		if candidate.blocked or candidate.bridge:continue
		var weight:float=current.dir.dot(candidate.dir)+yard.rng.randf_range(-.3,.3)
		if weight>best:
			best=weight
			next=candidate
	if next==null:
		var start:Vector2=current.a+current.right*(current.width*.5+1.45)*g.side
		var end:Vector2=current.b+current.right*(current.width*.5+1.45)*g.side
		g.goal=start if g.at.distance_to(end)<g.at.distance_to(start) else end
		return
	if current.dir.dot(next.dir)<-.8:g.side*=-1
	g.edge=next
	g.goal=next.b+next.right*(next.width*.5+1.45)*g.side

func _react(g:Dictionary,p:Dictionary,delta:float) -> void:
	g.elapsed+=delta
	var actor:Node3D=p.actor
	var at:=Vector2(actor.position.x,actor.position.z)
	var away:Vector2=at-g.dead_at
	match g.react:
		"flee":
			if g.elapsed>.9:
				if away.length_squared()<.02:away=Vector2.from_angle(g.heading)
				yard._walk(p,at+away.normalized()*8,4.2,delta)
		"kneel":
			if away.length_squared()>.81 and g.elapsed<4:yard._walk(p,g.dead_at,2.4,delta)
			else:
				actor.player.pause()
				p.pose.sit(.65)
				actor.model.position.y=-.36
		"freeze":
			actor.player.play("idle",.15)
	if g.elapsed>(6.5 if g.react=="kneel" else (6.0 if g.react=="flee" else 3.5)):
		g.at=Vector2(actor.position.x,actor.position.z)
		g.react=""
		p.pose.sit(0)
		actor.model.position.y=0

func _heart(g:Dictionary,p:Dictionary,sd:float,delta:float,chat:bool) -> void:
	g.heart-=delta
	if g.heart>0:return
	g.heart=yard.rng.randf_range(3,7) if chat else yard.rng.randf_range(9,20)
	if sd<(70*70 if chat else 60*60):_label(p.actor,"♥",Color("#f75d86"),1.0)

func _label(actor:Node3D,text:String,color:Color,seconds:float) -> void:
	var line:=Label3D.new()
	line.text=text
	line.modulate=color
	line.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	line.position.y=2.25
	line.font_size=26
	line.pixel_size=.009
	actor.add_child(line)
	var tween:=line.create_tween()
	tween.tween_interval(seconds)
	tween.tween_callback(line.queue_free)

func scare(at:Vector2,radius:float) -> void:
	for g in groups:
		if at.distance_squared_to(g.at)<radius*radius:g.shock=yard.rng.randf_range(2.0,4.0)

func _remove(g:Dictionary) -> void:
	if not g.cross.is_empty():g.cross.occupied=false
	for p:Dictionary in g.ppl:
		if is_instance_valid(p.actor) and not p.actor.defeated:p.actor.queue_free()
	groups.erase(g)

func clear() -> void:
	for g:Dictionary in groups.duplicate():_remove(g)
	scan=0
	active=false
