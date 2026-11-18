extends Node3D

const HOOKAH:=preload("res://south_hookah.gd")
var hookah:=HOOKAH.new()
var rich:=preload("res://south_rich_pedestrians.gd").new()
var tennis:=preload("res://south_tennis.gd").new()
var seats:=preload("res://south_yard_benches.gd").new()
var balconies:=preload("res://south_balcony_life.gd").new()
var couples:=preload("res://south_couples.gd").new()
var graffiti:=preload("res://south_graffiti.gd").new()
const POSE:=preload("res://delivery_actor_pose.gd")
const TYPES:=["bench","smoke","beer","garage","shashlik","domino","ball"]
var terrain:RefCounted
var car:CharacterBody3D
var sky:Node
var people:Node
var paint:Material
var create_actor:Callable
var data:Dictionary
var bins:Dictionary={}
var scenes:Array[Dictionary]=[]
var prop_meshes:Dictionary={}
var props_paint:=StandardMaterial3D.new()
var items:Dictionary={}
var rng:=RandomNumberGenerator.new()
var scan:=0.0
var spawn_wait:=0.0
var active:=false
var adult:=true
var near_client:Callable
var denied_bench:Callable
var speaking:=0
var ball_mesh:=SphereMesh.new()
var white:=StandardMaterial3D.new()

func setup(_region:Dictionary,ground:RefCounted,vehicle:CharacterBody3D,traffic:Node,_events:Node,atmosphere:Node,
		recipients:Node,material:Material,_base:Vector2) -> void:
	terrain=ground
	car=vehicle
	sky=atmosphere
	people=recipients
	paint=material
	create_actor=traffic.people.create_person
	data=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_yards.json"))
	var benches:Dictionary={}
	for raw:Dictionary in data.spots:
		var point:=Vector2(raw.at[0],raw.at[1])
		var cell:=Vector2i((point/96).floor())
		raw.at=point
		if not bins.has(cell): bins[cell]=[]
		bins[cell].append(raw)
		if raw.kind=="bench":benches[int(raw.id)]=raw
	add_child(rich)
	rich.setup(self,traffic)
	add_child(seats)
	seats.setup(self,benches,data.bench_models)
	add_child(tennis)
	tennis.setup(self)
	add_child(hookah)
	hookah.setup(self,benches,data.hookah)
	add_child(graffiti)
	graffiti.setup(self,data.walls)
	couples.setup(self,traffic)
	add_child(balconies)
	balconies.setup(self)
	props_paint.vertex_color_use_as_albedo=true
	for kind:String in data.props: prop_meshes[kind]=_prop(data.props[kind])
	ball_mesh.radius=.17
	ball_mesh.height=.34
	ball_mesh.radial_segments=8
	ball_mesh.rings=4
	white.albedo_color=Color("#f4f1ea")

func begin(number:int,seed_value:int,is_adult:bool) -> void:
	clear()
	adult=is_adult
	graffiti.begin(seed_value)
	couples.begin()
	balconies.begin()
	rng.seed=("%d/yards/%d"%[seed_value,number]).hash()
	rich.begin(rng.randi())
	scan=0
	active=true

func step(delta:float,_hour:float) -> void:
	if not active: return
	var pos:=Vector2(car.position.x,car.position.z)
	rich.step(delta,pos)
	seats.step(pos)
	tennis.step(delta,pos)
	hookah.step(delta,pos)
	graffiti.step(delta,pos)
	couples.step(delta,pos)
	balconies.step(delta,pos)
	scan-=delta
	if scan<=0:
		scan=1
		_scan(pos)
	spawn_wait-=delta
	for s in scenes:
		if spawn_wait<=0 and not s.waiting.is_empty():
			_spawn(s,s.waiting.pop_front())
			spawn_wait=.07
		var near:=pos.distance_squared_to(s.at)<50*50
		if near: _animate(s,delta,pos)
		elif s.say_left>0: _end_speech(s,delta)

func _scan(pos:Vector2) -> void:
	var mode:="night" if sky.night>.55 else ("rain" if sky.wet>.5 else "sum")
	var cap:=7 if mode=="sum" else 3
	var heads:=0
	var counts:Dictionary={}
	for s:Dictionary in scenes.duplicate():
		var d:=pos.distance_squared_to(s.at)
		var down:bool=s.kind=="bench" and bench_broken(int(s.spot.id))
		if down: _destroy_prop(s)
		if d>215*215 or (data.weights[s.kind].w[mode]<=0 and d>90*90):
			_remove(s)
			continue
		heads+=s.ppl.size()+s.waiting.size()
		counts[s.kind]=counts.get(s.kind,0)+1
	if heads>=30 or scenes.size()>=cap:return
	var available:Dictionary={}
	for kind:String in TYPES:
		var weight:float=data.weights[kind].w[mode]
		if weight>0 and counts.get(kind,0)<(3 if kind in ["bench","smoke"] else 2): available[kind]=weight
	var cell:=Vector2i((pos/96).floor())
	var nearby:Array=[]
	for i in range(-2,3):
		for j in range(-2,3): nearby.append_array(bins.get(cell+Vector2i(i,j),[]))
	for _attempt in 3:
		if available.is_empty():break
		var total:=0.0
		for value:float in available.values(): total+=value
		var roll:=rng.randf()*total
		var kind:String=available.keys().back()
		for key:String in available:
			roll-=available[key]
			if roll<=0:
				kind=key
				break
		available.erase(kind)
		var options:Array[Dictionary]=[]
		var want:="yard"
		if kind in ["garage","bench"]: want=kind
		if kind=="smoke": want="door"
		for spot:Dictionary in nearby:
			if spot.kind!=want or (kind=="ball" and not spot.big):continue
			var d:=pos.distance_squared_to(spot.at)
			if d>150*150 or d<30*30:continue
			if d<70*70:
				var view:=get_viewport().get_camera_3d()
				if absf(car.speed)<2 or not view or not view.is_position_behind(Vector3(spot.at.x,car.position.y,spot.at.y)):continue
			if near_client.is_valid() and near_client.call(spot.at):continue
			if kind=="bench" and (hookah.occupied.has(int(spot.id)) or bench_broken(int(spot.id))):continue
			var separated:=true
			for other in scenes:
				var radius:=70 if other.kind==kind else (16 if kind in ["bench","smoke"] else 30)
				if spot.at.distance_squared_to(other.at)<radius*radius:
					separated=false
					break
			if separated:options.append(spot)
		if not options.is_empty():
			_start(options[rng.randi_range(0,options.size()-1)],kind)
			return

func _start(spot:Dictionary,kind:String) -> void:
	var spot_at:Vector2=spot.at
	var root:=Node3D.new()
	root.position=Vector3(spot_at.x,terrain.land_height(spot_at.x,spot_at.y),spot_at.y)
	root.rotation.y=spot.face
	add_child(root)
	var s:Dictionary={"spot":spot,"at":spot_at,"kind":kind,"root":root,"ppl":[],"waiting":[],"prop":null,"down":false,
		"turn":0,"beat":rng.randf_range(1,2.5),"time":0.0,"talk":rng.randf_range(2,11),"line":null,"say_left":0.0}
	if prop_meshes.has(kind):
		var mesh:=MeshInstance3D.new()
		mesh.mesh=prop_meshes[kind]
		mesh.material_override=props_paint
		root.add_child(mesh)
		s.prop=mesh
	if kind=="ball":
		var ball:=MeshInstance3D.new()
		ball.mesh=ball_mesh
		ball.material_override=white
		root.add_child(ball)
		ball.top_level=true
		ball.global_position=root.position+Vector3.UP*.17
		s.prop=ball
		s.pass_start=0
		s.pass_end=1
		s.pass_time=1.0
		s.duration=1.0
		s.arc=1.0
		s.wait=rng.randf_range(.5,1.5)
	var offsets:Array=[]
	match kind:
		"domino":
			for sd in [-1,1]:
				for x:float in [-.42,.42]:
					offsets.append([Vector2(x,sd*.85),spot.face+(PI if sd>0 else 0),"",true])
		"bench":
			var row:Array=[-.8,0,.8] if rng.randf()<.55 else ([-.55,.55] if rng.randf()<.5 else [-.8,.3])
			for x:float in row: offsets.append([Vector2(x,0),spot.face,"",true])
		"smoke":
			var row:Array=[-.55,.55] if rng.randf()<.45 else [0]
			for x:float in row: offsets.append([Vector2(x,0),spot.face+signf(x)*.9,"cig" if adult else "phone",false])
		"garage":
			for x:float in [-1.3,0,1.3]: offsets.append([Vector2(x,0),spot.face+rng.randf_range(-.5,.5),"bottle" if adult else "cup",false])
		"shashlik":
			offsets.append([Vector2(0,-.75),spot.face,"fan",false])
			var count:=rng.randi_range(2,4)
			for i in count:
				var face:float=(i-(count-1)*.5)*.75+rng.randf_range(-.15,.15)
				offsets.append([Vector2(sin(face),cos(face))*rng.randf_range(1.9,2.4),spot.face+face+PI,"bottle" if adult and rng.randf()<.8 else "cup",false])
		"beer","ball":
			var ball:bool=kind=="ball"
			var count:=(3 if rng.randf()<.6 else 2) if ball else rng.randi_range(3,5)
			var radius:=(2.9 if count==3 else 2.6) if ball else 1.0+count*.14
			var start:=rng.randf()*TAU
			for i in count:
				var angle:=start+TAU*i/count
				var item:="" if ball or rng.randf()>.85 else ("bottle" if adult else "can")
				offsets.append([Vector2(sin(angle),cos(angle))*radius,spot.face+angle+PI,item,false])
	for o:Array in offsets:
		var distance:Vector2=o[0]
		var at:Vector2=spot.at+distance.rotated(-spot.face)
		s.waiting.append({"home":at,"face":o[1],"item":o[2],"seat":o[3]})
	scenes.append(s)

func _spawn(s:Dictionary,p:Dictionary) -> void:
	var person:Dictionary=people.worker(rng.randi())
	if s.kind=="bench" or p.has("gender"):
		var target:bool=p.get("gender",true)
		for i in 12:
			if person.female==target:break
			person=people.worker(rng.randi())
	var actor:Node3D=create_actor.call(int(person.model),p.home,p.home,0)
	var clothes:Material=people.clothing(person,paint)
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false):mesh.material_override=clothes
	actor.rotation.y=p.face
	actor.player.get_animation("walk").loop_mode=Animation.LOOP_LINEAR
	p.actor=actor
	p.pose=POSE.new()
	p.pose.setup(actor.model)
	p.phase=rng.randf()*TAU
	p.clock=0.0
	p.mode="act"
	p.run=Vector2.ZERO
	p.props=_hand_item(actor,p.item)
	s.ppl.append(p)
	_pose(s,p)

func _hand_item(actor:Node3D,kind:String) -> Node3D:
	if kind.is_empty():return null
	if not items.has(kind):
		var geometry:PrimitiveMesh
		var tone:String
		if kind in ["bottle","cup","can"]:
			var tube:=CylinderMesh.new()
			tube.top_radius=.045
			tube.bottom_radius=.055 if kind=="bottle" else .045
			tube.height=.27 if kind=="bottle" else (.16 if kind=="can" else .1)
			tube.radial_segments=8
			tube.rings=0
			geometry=tube
			tone="#435a2c" if kind=="bottle" else "#e04836"
		else:
			var part:=BoxMesh.new()
			part.size=Vector3(.016,.09,.016) if kind=="cig" else (Vector3(.26,.22,.012) if kind=="fan" else Vector3(.07,.13,.015))
			geometry=part
			tone="#f4f1ea" if kind=="cig" else ("#c9a46a" if kind=="fan" else "#1f2328")
		var mat:=StandardMaterial3D.new()
		mat.albedo_color=Color(tone)
		geometry.material=mat
		items[kind]=geometry
	var hand:=BoneAttachment3D.new()
	actor.skeleton.add_child(hand)
	hand.bone_idx=actor.grip.right
	var mesh:=MeshInstance3D.new()
	mesh.mesh=items[kind]
	mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	hand.add_child(mesh)
	return hand

func _prop(parts:Array) -> ArrayMesh:
	var tool:=SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var cube:=BoxMesh.new()
	cube.size=Vector3.ONE
	var arrays:=cube.get_mesh_arrays()
	var verts:PackedVector3Array=arrays[Mesh.ARRAY_VERTEX]
	var norms:PackedVector3Array=arrays[Mesh.ARRAY_NORMAL]
	for part:Array in parts:
		var color:=Color(part[3]).srgb_to_linear()
		var extent:=Vector3(part[0],part[1],part[2])
		var center:=Vector3(part[4],part[5],part[6])
		var rotation_=Basis.from_euler(Vector3(part[7],part[8],part[9]))
		for index:int in arrays[Mesh.ARRAY_INDEX]:
			tool.set_color(color)
			tool.set_normal(rotation_*norms[index])
			tool.add_vertex(center+rotation_*(verts[index]*extent))
	return tool.commit()

func _animate(s:Dictionary,delta:float,pos:Vector2) -> void:
	s.time+=delta
	_end_speech(s,delta)
	var live:Array[Dictionary]=[]
	var speed:=Vector2(car.velocity.x,car.velocity.z)
	for p:Dictionary in s.ppl:
		if not is_instance_valid(p.actor) or p.actor.defeated:continue
		var actor:Node3D=p.actor
		if actor.stunned>0 or actor.knockdown>0 or actor.ragdoll!=null or actor.recovery>0:
			p.mode="back"
			continue
		var at:=Vector2(actor.position.x,actor.position.z)
		var relative:=at-pos
		if p.mode=="act" and speed.length_squared()>25 and relative.length_squared()<256:
			var facing:=speed.normalized()
			if relative.dot(facing)>0 and absf(relative.cross(facing))<3.6:
				_flee(p,relative,1.3,2.2)
		if p.mode=="run":
			p.clock-=delta
			if p.clock<=0:p.mode="back"
			else:_walk(p,at+p.run*10,4.3,delta)
		if p.mode=="back":
			if at.distance_squared_to(p.home)<.045:
				p.mode="act"
				p.actor.rotation.y=p.face
				_pose(s,p)
			else:_walk(p,p.home,1.5,delta)
		if p.mode=="act":
			live.append(p)
			p.phase+=delta
			if p.seat and not s.down:
				var wave:float=-.55*maxf(0,cos(p.phase*4)) if s.kind=="domino" and not live.is_empty() and (live.size()-1)==s.turn else 0.0
				p.pose.sit(1,wave)
			elif not p.item.is_empty() and s.kind!="ball":
				p.pose.gesture(p.item,p.phase)
	if s.kind in ["shashlik","domino"] and not s.down and speed.length_squared()>9 and pos.distance_squared_to(s.at)<10:
		var inside:=car.to_local(s.root.position)
		if absf(inside.x)<1.45 and absf(inside.z)<2.65:
			_destroy_prop(s)
			scare(s.at,12)
	if s.kind=="ball" and not s.down: _pass(s,live,delta)
	s.beat-=delta
	if s.kind=="domino" and s.beat<=0:
		s.turn=(s.turn+1)%4
		s.beat=rng.randf_range(1.85,3.65)
		if rng.randf()<.15:_say(s,live,pos)
	s.talk-=delta
	if s.talk<=0:
		s.talk=rng.randf_range(5,11)
		if s.kind not in ["ball","domino"]:_say(s,live,pos)

func _walk(p:Dictionary,target:Vector2,speed:float,delta:float) -> void:
	var actor:Node3D=p.actor
	var at:=Vector2(actor.position.x,actor.position.z)
	var dir:=at.direction_to(target)
	var point:=at.move_toward(target,speed*delta)
	actor.position=Vector3(point.x,terrain.land_height(point.x,point.y),point.y)
	actor.rotation.y=lerp_angle(actor.rotation.y,atan2(dir.x,dir.y),1-exp(-10*delta))
	actor.model.position.y=0
	if actor.player.current_animation!=&"walk":actor.player.play(&"walk",.1,1.6 if speed>2 else 1.0)

func _pose(s:Dictionary,p:Dictionary) -> void:
	p.actor.model.position.y=-.29 if p.seat and not s.down else 0.0
	if p.seat and not s.down:
		p.actor.player.pause()
		p.pose.sit(1)
	else:
		p.pose.sit(0)
		p.actor.player.play(&"idle",.1)
		if not p.item.is_empty():p.actor.player.pause()

func _pass(s:Dictionary,live:Array[Dictionary],delta:float) -> void:
	s.prop.visible=live.size()>=2
	if live.size()<2:return
	var from:Node3D=live[s.pass_start%live.size()].actor
	var to:Node3D=live[s.pass_end%live.size()].actor
	var a:=from.position+from.basis.z*.5
	var b:=to.position+to.basis.z*.5
	if s.pass_time>=1:
		s.wait-=delta
		s.prop.position=b+Vector3.UP*.17
		if s.wait>0:return
		s.pass_start=s.pass_end%live.size()
		s.pass_end=(s.pass_start+rng.randi_range(1,live.size()-1))%live.size()
		s.pass_time=0.0
		s.duration=rng.randf_range(.8,1.2)
		s.wait=rng.randf_range(.4,1.6)
		s.arc=rng.randf_range(.5,2.2)
		if rng.randf()<.12:_say(s,live,Vector2(car.position.x,car.position.z))
		return
	s.pass_time=minf(1,s.pass_time+delta/s.duration)
	s.prop.position=a.lerp(b,s.pass_time)+Vector3.UP*(.17+sin(s.pass_time*PI)*s.arc)
	s.prop.rotation.x+=delta*9

func _say(s:Dictionary,live:Array[Dictionary],observer:Vector2) -> void:
	var radius:=25 if s.kind=="bench" else 45
	if live.is_empty() or speaking>=3 or s.say_left>0 or observer.distance_squared_to(s.at)>radius*radius:return
	var key:String=s.kind
	if not adult and data.lines.has(key+"K"):key+="K"
	var choices:Array=data.lines[key]
	var line:=Label3D.new()
	var phrase:String=choices[rng.randi_range(0,choices.size()-1)]
	line.text=data.en.get(phrase,phrase) if TranslationServer.get_locale().begins_with("en") else tr(phrase)
	line.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	line.position.y=2.45
	line.pixel_size=.008
	line.font_size=23
	live[rng.randi_range(0,live.size()-1)].actor.add_child(line)
	s.line=line
	s.say_left=2.5
	speaking+=1

func _end_speech(s:Dictionary,delta:float) -> void:
	if s.say_left<=0:return
	s.say_left-=delta
	if s.say_left<=0:
		if is_instance_valid(s.line):s.line.queue_free()
		s.line=null
		speaking=maxi(0,speaking-1)

func _destroy_prop(s:Dictionary) -> void:
	if s.down:return
	s.down=true
	if is_instance_valid(s.prop):s.prop.hide()
	for p:Dictionary in s.ppl:
		if not is_instance_valid(p.actor) or p.actor.defeated:continue
		p.seat=false
		p.actor.model.position.y=0.0
		if p.mode=="act":_pose(s,p)

func _flee(p:Dictionary,away:Vector2,min_time:float,max_time:float) -> void:
	p.mode="run"
	p.clock=rng.randf_range(min_time,max_time)
	p.run=away.normalized() if away.length_squared()>.05 else Vector2.from_angle(rng.randf()*TAU)

func scare(at:Vector2,radius:=26.0) -> void:
	rich.scare(at,radius)
	graffiti.scare(at,radius)
	couples.scare(at,radius)
	for s in scenes:
		if at.distance_squared_to(s.at)>(radius+6)*(radius+6):continue
		for p:Dictionary in s.ppl:
			if is_instance_valid(p.actor) and not p.actor.defeated and p.mode=="act":
				var away:=Vector2(p.actor.position.x,p.actor.position.z)-at
				if away.length_squared()<radius*radius:_flee(p,away,2,3.2)

func _remove(s:Dictionary) -> void:
	_end_speech(s,INF)
	for p:Dictionary in s.ppl:
		if is_instance_valid(p.actor) and not p.actor.defeated:p.actor.queue_free()
	s.root.queue_free()
	scenes.erase(s)

func bench_broken(id:int) -> bool:
	return seats.broken.has(id) or (denied_bench.is_valid() and denied_bench.call(id))

func clear() -> void:
	rich.clear()
	seats.clear()
	tennis.clear()
	hookah.clear()
	graffiti.clear()
	couples.clear()
	balconies.clear()
	for s:Dictionary in scenes.duplicate():_remove(s)
	speaking=0
	active=false
