extends Node3D

const POSE := preload("res://delivery_actor_pose.gd")
const WORDS := ["аут!", "было в линию!", "подача!", "пятнадцать — ноль", "гейм!", "сетка!"]
const ENGLISH := ["out!", "on the line!", "serve!", "fifteen–love", "game!", "net!"]
const HALF_SINGLES := 23.77 * .5 - .5
var yard:Node
var site:Dictionary
var center:Vector2
var along:Vector2
var terrain_root:Node3D
var fence:StaticBody3D
var net_mesh:MeshInstance3D
var net_arrays:Array=[]
var net_material:=ShaderMaterial.new()
var panels:Array[Dictionary]=[]
var broken:Dictionary={}
var population:Array[Dictionary]=[]
var queue:Array[Vector2]=[]
var ball:MeshInstance3D
var racket_meshes:Array[ArrayMesh]=[]
var shot:Dictionary={}
var shots_left:=0
var visit:=false
var scan:=0.0
var wait:=0.0
var elapsed:=0.0

func setup(courtyard:Node) -> void:
	yard=courtyard
	site=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_tennis.json"))
	center=Vector2(site.at[0],site.at[1])
	along=Vector2(site.axis[0],site.axis[1])
	net_material.shader=preload("res://summer_tennis.gdshader")

func _point(a:float,b:float) -> Vector2:
	return center+along*a+Vector2(-along.y,along.x)*b

func _v(p:Array) -> Vector3:
	return Vector3(p[0],p[1],p[2])

func _detail(mesh:Mesh,paint:Material) -> MeshInstance3D:
	var node:=MeshInstance3D.new()
	node.mesh=mesh
	node.material_override=paint
	node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	terrain_root.add_child(node)
	return node

func _load_court() -> void:
	terrain_root=Node3D.new()
	add_child(terrain_root)
	var surface:=SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for polygon:Dictionary in site.floor:
		var corners:Array=polygon.p
		for i in range(1,corners.size()-1):
			var a:=_v(corners[0])
			var b:=_v(corners[i])
			var c:=_v(corners[i+1])
			# Keep the front of triangles above the terrain, regardless of the marking direction.
			var tri:Array=[a,b,c] if (b-a).cross(c-a).y<0 else [a,c,b]
			for vertex:Vector3 in tri:
				surface.set_color(Color(polygon.color).srgb_to_linear())
				surface.set_normal(Vector3.UP)
				surface.add_vertex(vertex)
	_detail(surface.commit(),yard.props_paint)
	var parts:Array=[]
	for box:Dictionary in site.boxes:
		var s:Array=box.size
		var at:Array=box.at
		parts.append([s[0],s[1],s[2],box.color,at[0],at[1],at[2],0,box.yaw,0])
	_detail(yard._prop(parts),yard.props_paint)
	var posts:=StaticBody3D.new()
	posts.collision_layer=1
	posts.collision_mask=0
	terrain_root.add_child(posts)
	for entry:Dictionary in site.posts:
		var col:=CollisionShape3D.new()
		var geometry:=BoxShape3D.new()
		geometry.size=Vector3(entry.size[0],1.0,entry.size[1])
		col.shape=geometry
		col.position=_v(entry.at)+Vector3.UP*.5
		posts.add_child(col)
	for sign:Dictionary in site.sign:
		var label:=Label3D.new()
		var english:=TranslationServer.get_locale().begins_with("en")
		label.text=("TENNIS COURT\nUnder repair since 1994" if english else "ТЕННИСНЫЙ КОРТ\nремонт с 1994 г.") if int(sign.variant)==1 else ("NO DOGS\nNo cars either" if english else "С СОБАКАМИ НЕ ВХОДИТЬ\nи на машинах тоже")
		label.font_size=32
		label.pixel_size=.0036
		label.outline_size=5
		label.modulate=Color("#efe9da")
		label.position=_v(sign.at)+Vector3(sign.n[0],0,sign.n[1])*.035
		label.rotation.y=atan2(sign.n[0],sign.n[1])
		terrain_root.add_child(label)
	var nets:Dictionary=site.nets
	var vertices:=PackedVector3Array()
	var uv:=PackedVector2Array()
	var colors:=PackedColorArray()
	for i in nets.points.size():
		vertices.append(_v(nets.points[i]))
		uv.append(Vector2(nets.uv[2*i],nets.uv[2*i+1]))
		colors.append(Color(nets.colors[3*i],nets.colors[3*i+1],nets.colors[3*i+2]))
	net_arrays.resize(Mesh.ARRAY_MAX)
	net_arrays[Mesh.ARRAY_VERTEX]=vertices
	net_arrays[Mesh.ARRAY_TEX_UV]=uv
	net_arrays[Mesh.ARRAY_COLOR]=colors
	fence=StaticBody3D.new()
	fence.collision_layer=8
	fence.collision_mask=0
	fence.set_meta(&"summer_prop",_impact)
	terrain_root.add_child(fence)
	for raw:Dictionary in nets.panels:
		var start:=int(raw.start)
		var a:=vertices[start]
		var b:=vertices[start+1]
		var top:=vertices[start+2]
		var low:=minf(a.y,b.y)
		for j in range(start,start+int(raw.count)):low=minf(low,vertices[j].y)
		var height:=maxf(.2,top.y-low)
		var middle:=(a+b)*.5
		var col:=CollisionShape3D.new()
		var shape:=BoxShape3D.new()
		shape.size=Vector3(Vector2(a.x-b.x,a.z-b.z).length(),height,.08)
		col.shape=shape
		col.position=Vector3(middle.x,low+height*.5,middle.z)
		col.rotation.y=atan2(a.z-b.z,b.x-a.x)
		fence.add_child(col)
		panels.append({"at":Vector2(raw.at[0],raw.at[1]),"r":raw.radius,"col":col,"first":start*3/2,"count":int(raw.count)*3/2})
	net_mesh=_detail(null,net_material)
	_update_nets()
	for hue:String in ["#d9342c","#3f7fd6","#e0b13f","#f4f1ea"]:
		racket_meshes.append(yard._prop([[.035,.26,.035,"#2b2a30",0,-.1,0,0,0,0],[.27,.32,.025,hue,0,-.4,0,0,0,0]]))
	var sphere:=SphereMesh.new()
	sphere.radius=.11
	sphere.height=.22
	sphere.radial_segments=8
	sphere.rings=4
	var paint:=StandardMaterial3D.new()
	paint.albedo_color=Color("#d8f23a")
	ball=_detail(sphere,paint)
	ball.hide()

func _update_nets() -> void:
	var indices:=PackedInt32Array()
	for i in panels.size():
		if broken.has(i):continue
		var panel:Dictionary=panels[i]
		for j in range(panel.first,panel.first+panel.count):indices.append(int(site.nets.index[j]))
	if indices.is_empty():
		net_mesh.hide()
		return
	net_arrays[Mesh.ARRAY_INDEX]=indices
	var geometry:=ArrayMesh.new()
	geometry.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,net_arrays)
	net_mesh.mesh=geometry
	net_mesh.show()

func _impact(contact:KinematicCollision3D,approach:float,_motion:Vector3) -> float:
	return _break_panel(contact.get_collider_shape_index(),approach)

func _break_panel(index:int,approach:float) -> float:
	if index<0 or index>=panels.size():return -1.0
	if broken.has(index):return 1.0
	if approach<=.4:return -1.0
	broken[index]=true
	panels[index].col.disabled=true
	_update_nets()
	return .91

func step(delta:float,pos:Vector2) -> void:
	var dist_sq:=pos.distance_squared_to(center)
	scan-=delta
	if scan<=0:
		scan=1.0
		if not terrain_root and dist_sq<245*245:_load_court()
		if terrain_root:terrain_root.visible=dist_sq<285*285
		var bad_weather:bool=yard.sky.night>.45 or yard.sky.wet>.5
		if dist_sq>210*210:
			visit=false
			_stop()
		elif bad_weather:
			_stop()
		if not visit and dist_sq<150*150:
			visit=true
			if not bad_weather and yard.rng.randf()<.55:_start()
	if not terrain_root:return
	if not queue.is_empty():_spawn(queue.pop_front())
	if population.is_empty():return
	elapsed+=delta
	if population.size()>=2 and queue.is_empty():_play(delta)
	for p in population:
		var actor:Node3D=p.actor
		if not _ready_player(p):continue
		var target:float=p.tb if shot.get("to")==p.get("id") else p.b0+sin(elapsed*.7+p.phase)*.4
		var next:=move_toward(float(p.b),target,(4.0 if shot.get("to")==p.id else 1.2)*delta)
		var run:=absf(next-p.b)/maxf(delta,.001)
		p.b=next
		var at:=_point(p.a,next)
		actor.position=Vector3(at.x,yard.terrain.land_height(at.x,at.y)+.08,at.y)
		p.phase+=delta*(12 if run>.3 else 3)
		if p.swing>=0:p.swing=-1.0 if p.swing+delta/.45>=1 else p.swing+delta/.45
		if dist_sq<60*60:p.pose.tennis(p.swing,sin(p.phase)*.7 if run>.3 else 0.0)

func _ready_player(p:Dictionary) -> bool:
	return is_instance_valid(p.actor) and not p.actor.defeated and p.actor.knockdown<=0 and p.actor.recovery<=0 and p.actor.stunned<=0

func _start() -> void:
	if not terrain_root:_load_court()
	if not queue.is_empty() or not population.is_empty():return
	if yard.rng.randf()<.4:
		queue.assign([Vector2(-HALF_SINGLES,-2.6),Vector2(-HALF_SINGLES,2.6),Vector2(HALF_SINGLES,2.6),Vector2(HALF_SINGLES,-2.6)])
	else:queue.assign([Vector2(-HALF_SINGLES-1,0),Vector2(HALF_SINGLES+1,0)])
	wait=0
	elapsed=0

func _spawn(local:Vector2) -> void:
	var at:=_point(local.x,local.y)
	var person:Dictionary=yard.people.worker(yard.rng.randi())
	var actor:Node3D=yard.create_actor.call(int(person.model),at,at,0)
	var clothing:Material=yard.people.clothing(person,yard.paint)
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false):mesh.material_override=clothing
	actor.player.play(&"idle")
	actor.player.advance(0)
	actor.player.pause()
	actor.rotation.y=atan2(-along.x*signf(local.x),-along.y*signf(local.x))
	var grip:=BoneAttachment3D.new()
	actor.skeleton.add_child(grip)
	grip.bone_idx=actor.grip.right
	var racket:=MeshInstance3D.new()
	racket.mesh=racket_meshes[yard.rng.randi_range(0,3)]
	racket.material_override=yard.props_paint
	grip.add_child(racket)
	var pose:=POSE.new()
	pose.setup(actor.model)
	population.append({"id":population.size(),"actor":actor,"a":local.x,"b":local.y,"b0":local.y,"tb":local.y,
		"side":signf(local.x),"swing":-1.0,"phase":yard.rng.randf()*TAU,"pose":pose})

func _serve(from:Dictionary,serve:bool) -> void:
	var opponents:Array[Dictionary]=[]
	for p in population:
		if p.side!=from.side and _ready_player(p):opponents.append(p)
	if opponents.is_empty():
		_end_rally()
		return
	var to:=opponents[yard.rng.randi_range(0,opponents.size()-1)]
	to.tb=clampf(to.b0+yard.rng.randf_range(-2.2,2.2),-5.085,5.085)
	shot={"from":from.id,"to":to.id,"start":Vector2(from.a,from.b),
		"bounce":Vector2(-from.side*yard.rng.randf_range(3.5,10.385),clampf(to.tb+yard.rng.randf_range(-1.2,1.2),-5.085,5.085)),
		"time":0.0,"T":yard.rng.randf_range(1.1,1.4) if serve else yard.rng.randf_range(1.0,1.6),
		"h1":yard.rng.randf_range(.8,2.2),"h2":yard.rng.randf_range(.5,1.2)}
	from.swing=0.0
	ball.show()

func _play(delta:float) -> void:
	if shot.is_empty():
		wait-=delta
		if wait>0:return
		var eligible:Array[Dictionary]=[]
		for p in population:
			if _ready_player(p):eligible.append(p)
		if eligible.size()>1:
			shots_left=yard.rng.randi_range(3,13)
			_serve(eligible[yard.rng.randi_range(0,eligible.size()-1)],true)
		else:wait=1
		return
	shot.time+=delta
	var k:float=shot.time/shot.T
	var local:Vector2
	var h:float
	var from:Dictionary=population[shot.from]
	if shot.has("net"):
		var q:=minf(1,k*2)
		local=shot.start.lerp(shot.net,q)
		h=lerpf(1.1,.5,q)+1.2*q*(1-q) if q<1 else maxf(.1,.5-(shot.time-shot.T*.5)*3)
		if shot.time>shot.T*.5+.5:
			if yard.rng.randf()<.5 and _ready_player(from):_say(from.actor)
			_end_rally()
			return
	elif k<.66:
		var q:=k/.66
		local=shot.start.lerp(shot.bounce,q)
		h=lerpf(1,.08,q)+4*shot.h1*q*(1-q)
	else:
		var to:Dictionary=population[shot.to]
		var q:=minf(1,(k-.66)/.34)
		local=shot.bounce.lerp(Vector2(to.a,to.b),q)
		h=lerpf(.08,.95,q)+4*shot.h2*q*(1-q)
		if q>.8 and to.swing<0:to.swing=0.0
		if q>=1:
			shots_left-=1
			if not _ready_player(to):
				_end_rally()
				return
			elif shots_left<=0:
				shot={"from":to.id,"start":Vector2(to.a,to.b),"net":Vector2(0,clampf(to.b+yard.rng.randf_range(-2,2),-4,4)),"T":1.2,"time":0.0}
				to.swing=0.0
			else:_serve(to,false)
	var xy:=_point(local.x,local.y)
	ball.position=Vector3(xy.x,yard.terrain.land_height(xy.x,xy.y)+.08+h,xy.y)

func _say(actor:Node3D) -> void:
	var line:=Label3D.new()
	var i:int=yard.rng.randi_range(0,WORDS.size()-1)
	line.text=ENGLISH[i] if TranslationServer.get_locale().begins_with("en") else tr(WORDS[i])
	line.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	line.font_size=22
	line.pixel_size=.008
	line.position.y=2.4
	actor.add_child(line)
	var tween:=line.create_tween()
	tween.tween_interval(2.2)
	tween.tween_callback(line.queue_free)

func _end_rally() -> void:
	shot.clear()
	wait=yard.rng.randf_range(1.8,3.2)
	if ball:ball.hide()

func _stop() -> void:
	if population.is_empty() and queue.is_empty():return
	_end_rally()
	for p in population:
		if is_instance_valid(p.actor):p.actor.queue_free()
	population.clear()
	queue.clear()

func clear() -> void:
	_stop()
	visit=false
	scan=0
	if not broken.is_empty():
		for index:int in broken:panels[index].col.disabled=false
		broken.clear()
		if net_mesh:_update_nets()
	if terrain_root:terrain_root.hide()
