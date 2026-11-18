extends Node3D

const ATLAS:="res://assets/summer_graffiti.png"
var yard:Node
var walls:Array[Dictionary]=[]
var active:Array[Dictionary]=[]
var material:=ShaderMaterial.new()
var scan:=0.0
var world_seed:=-1
var image_task:Thread

func setup(owner_yard:Node,data:Array) -> void:
	yard=owner_yard
	material.shader=preload("res://summer_graffiti.gdshader")
	image_task=Thread.new()
	image_task.start(_read_sheet)
	for raw:Dictionary in data:
		var at:=Vector2(raw.at[0],raw.at[1])
		var normal:=Vector2(raw.n[0],raw.n[1]).normalized()
		walls.append({"at":at,"normal":normal,"side":Vector2(normal.y,-normal.x),"width":raw.w,"height":raw.h,
			"ground":raw.y,"kind":raw.kind,"canvas":null,"painter":null,"seen":false,"old":false,"ink":0.0,"tile":0,"cd":0.0})

func _read_sheet() -> Resource:
	if not OS.has_feature("editor") and ResourceLoader.exists(ATLAS):return ResourceLoader.load(ATLAS)
	var source:=Image.load_from_file(ATLAS)
	if source and not source.is_empty():return source
	return ResourceLoader.load(ATLAS) if ResourceLoader.exists(ATLAS) else null

func step(delta:float,pos:Vector2) -> void:
	if image_task and not image_task.is_alive():
		var source:Resource=image_task.wait_to_finish()
		image_task=null
		if source is Image:material.set_shader_parameter("sheet",ImageTexture.create_from_image(source))
		elif source is Texture2D:material.set_shader_parameter("sheet",source)
	scan-=delta
	if scan<=0:
		scan=1
		_check_walls(pos)
	for wall:Dictionary in active.duplicate():_paint(wall,pos,delta)

func _check_walls(observer:Vector2) -> void:
	var closest:Dictionary={}
	var best:=INF
	var show_old:=3
	for w in walls:
		var d:float=observer.distance_to(w.at)
		w.cd=maxf(0,w.cd-1)
		if is_instance_valid(w.canvas):w.canvas.visible=d<220
		if d>230:
			if w.painter!=null:_end(w)
			continue
		if not w.seen:
			w.seen=true
			w.tile=yard.rng.randi_range(0,15)
			w.duration=yard.rng.randf_range(28,40) if w.tile%4 in [0,3] else (yard.rng.randf_range(14,20) if w.tile%4==2 else yard.rng.randf_range(8,13))
			w.old=yard.rng.randf()<(.35 if w.kind in ["gar","arch"] else .15)
		if d>200:continue
		if w.ink>0 and not is_instance_valid(w.canvas):_canvas(w)
		if w.old and show_old>0:
			w.ink=1.0
			_canvas(w)
			w.old=false
			show_old-=1
		if w.ink>=1 or w.old or w.cd>0 or w.painter!=null or d<35 or d>150:continue
		var score:float=d+yard.rng.randf_range(0,60)-(35 if w.kind=="arch" else 0)
		if score<best:
			best=score
			closest=w
	if not closest.is_empty() and active.size()<3 and yard.sky.wet<.2 and yard.rng.randf()<.5:_start(closest)

func _canvas(w:Dictionary) -> void:
	if not is_instance_valid(w.canvas):
		var panel:=MeshInstance3D.new()
		var mesh:=QuadMesh.new()
		mesh.size=Vector2(w.width,w.height)
		panel.mesh=mesh
		panel.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		panel.material_override=material
		var p:Vector2=w.at+w.normal*.11
		panel.position=Vector3(p.x,w.ground+w.height*.5,p.y)
		panel.rotation.y=atan2(w.normal.x,w.normal.y)
		add_child(panel)
		w.canvas=panel
		panel.set_instance_shader_parameter("tile",w.tile)
	w.canvas.set_instance_shader_parameter("coverage",w.ink)

func _start(w:Dictionary) -> void:
	_canvas(w)
	var at:Vector2=w.at+w.normal*.95
	var p:Dictionary={"home":at,"face":atan2(-w.normal.x,-w.normal.y),"item":"can","seat":false}
	var group:Dictionary={"ppl":[],"kind":"artist","down":false}
	yard._spawn(group,p)
	w.painter=p
	w.mode="paint"
	w.elapsed=0
	w.upload=0
	w.run=w.normal
	active.append(w)

func _paint(w:Dictionary,observer:Vector2,delta:float) -> void:
	var p:Dictionary=w.painter
	if not is_instance_valid(p.actor) or p.actor.defeated:
		_end(w)
		return
	var actor:Node3D=p.actor
	if actor.stunned>0 or actor.knockdown>0 or actor.ragdoll!=null or actor.recovery>0:
		w.mode="flee"
		w.elapsed=0.0
		return
	w.elapsed+=delta
	var at:=Vector2(actor.position.x,actor.position.z)
	var d:=at.distance_to(observer)
	actor.visible=d<130
	match w.mode:
		"paint":
			var speed:float=absf(yard.car.speed)
			if (d<18 and speed>9) or (d<8 and speed>3) or yard.sky.wet>.25:
				_flee(w,observer)
				return
			w.ink=minf(1,w.ink+delta/w.duration)
			w.upload-=delta
			if w.upload<=0 or w.ink>=1:
				w.canvas.set_instance_shader_parameter("coverage",w.ink)
				w.upload=.12
			var target:Vector2=w.at+w.normal*.95+w.side*(float(w.ink)-.5)*w.width
			at=at.lerp(target,1-exp(-1.6*delta))
			actor.position=Vector3(at.x,yard.terrain.land_height(at.x,at.y),at.y)
			if d<70:p.pose.gesture("fan",w.elapsed*1.8)
			if w.ink>=1:
				w.mode="admire"
				w.elapsed=0.0
		"admire":
			if w.elapsed>3.0:
				w.mode="leave"
				w.elapsed=0.0
		"leave","flee":
			yard._walk(p,at+w.run*8,4.2 if w.mode=="flee" else 1.25,delta)
			if w.elapsed>5.0:_end(w)

func _flee(w:Dictionary,observer:Vector2) -> void:
	var away:Vector2=w.at-observer
	w.run=(away.normalized()+w.normal).normalized() if away.length_squared()>.01 else w.normal
	w.mode="flee"
	w.elapsed=0
	w.cd=yard.rng.randf_range(30,60)

func scare(at:Vector2,radius:float) -> void:
	for w in active:
		if w.mode=="paint" and at.distance_squared_to(w.at)<radius*radius:_flee(w,at)

func _end(w:Dictionary) -> void:
	var p:Dictionary=w.painter
	if is_instance_valid(p.actor) and not p.actor.defeated:p.actor.queue_free()
	w.painter=null
	w.cd=maxf(5,w.cd)
	active.erase(w)

func begin(seed_value:int) -> void:
	if world_seed==seed_value:return
	world_seed=seed_value
	for w in walls:
		w.ink=0.0
		w.seen=false
		w.old=false
		w.cd=0

func clear() -> void:
	for w:Dictionary in active.duplicate():_end(w)
	for w in walls:
		if is_instance_valid(w.canvas):w.canvas.queue_free()
		w.canvas=null
	scan=0

func _exit_tree() -> void:
	if image_task:image_task.wait_to_finish()
