extends Node3D

const SIZE:=88.0
const FILE:="res://assets/summer_balconies.bin"
var yard:Node
var catalog:Dictionary={}
var files:FileAccess
var types:Array[ArrayMesh]=[]
var walls:=ShaderMaterial.new()
var sectors:Dictionary={}
var pending:Array[Vector2i]=[]
var active:Array[Dictionary]=[]
var last:=Vector2i(100000,100000)
var scan:=0.0
var cool:=0.0
var enabled:=false
var last_night:=-1.0

func setup(service:Node) -> void:
	yard=service
	files=FileAccess.open(FILE,FileAccess.READ)
	catalog=JSON.parse_string(FileAccess.get_file_as_string("res://assets/summer_balconies.json"))
	walls.shader=preload("res://summer_balconies.gdshader")
	if yard.paint is ShaderMaterial:
		for key:StringName in [&"street_field",&"street_field_bounds",&"street_night"]:
			var value:Variant=yard.paint.get_shader_parameter(key)
			if value!=null:walls.set_shader_parameter(key,value)
	for kind in 3:types.append(_geometry(kind))

func _geometry(kind:int) -> ArrayMesh:
	var cube:=BoxMesh.new()
	cube.size=Vector3.ONE
	var arr:=cube.get_mesh_arrays()
	var tool:=SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var palette:=Color(1,0,0)
	_piece(tool,arr,Vector3(0,-.08,.525),Vector3(2.75,.16,1.05),Color("#a9a49c").srgb_to_linear())
	if kind==2:
		_piece(tool,arr,Vector3(0,.97,1),Vector3(2.65,.065,.07),palette)
		for x:float in [-1.3,1.3]:
			_piece(tool,arr,Vector3(x,.97,.5),Vector3(.055,.065,1),palette)
		for i in 11:_piece(tool,arr,Vector3(-1.27+i*.253,.47,1),Vector3(.035,.95,.035),palette)
	else:
		_piece(tool,arr,Vector3(0,.48,1),Vector3(2.65,.97,.07),palette)
		for x:float in [-1.29,1.29]:_piece(tool,arr,Vector3(x,.48,.5),Vector3(.07,.97,1),palette)
		if kind==0:
			_piece(tool,arr,Vector3(0,1.88,1),Vector3(2.58,1.78,.052),Color("#72868a").srgb_to_linear())
			for x:float in [-1.31,-.44,.44,1.31]:_piece(tool,arr,Vector3(x,1.87,1.04),Vector3(.055,1.84,.06),Color("#e8e5e1").srgb_to_linear())
			_piece(tool,arr,Vector3(0,2.82,.51),Vector3(2.75,.09,1.10),Color("#aba9a0").srgb_to_linear())
	return tool.commit()

func _piece(tool:SurfaceTool,cube:Array,offset:Vector3,extent:Vector3,color:Color) -> void:
	var vertices:PackedVector3Array=cube[Mesh.ARRAY_VERTEX]
	var normals:PackedVector3Array=cube[Mesh.ARRAY_NORMAL]
	for i in cube[Mesh.ARRAY_INDEX]:
		tool.set_normal(normals[i])
		tool.set_color(color)
		tool.add_vertex(offset+vertices[i]*extent)

func begin() -> void:
	clear()
	enabled=true
	scan=0
	cool=0

func step(delta:float,pos:Vector2) -> void:
	if not enabled:return
	var cell:=Vector2i((pos/SIZE).floor())
	if cell!=last:
		last=cell
		_refresh(cell,pos)
	if not pending.is_empty():_load_near(pending.pop_front())
	scan-=delta
	cool-=delta
	if scan<=0:
		scan=.6
		if absf(yard.sky.night-last_night)>.015:
			last_night=yard.sky.night
			walls.set_shader_parameter("street_night",last_night)
		_people(cell,pos)
	for p:Dictionary in active.duplicate():_animate(p,pos,delta)

func _key(cell:Vector2i) -> String:
	return "%d/%d"%[cell.x,cell.y]

func _refresh(cell:Vector2i,pos:Vector2) -> void:
	pending.clear()
	for k:Vector2i in sectors.keys():
		if absi(k.x-cell.x)>3 or absi(k.y-cell.y)>3:
			sectors[k].root.queue_free()
			sectors.erase(k)
	for dx in range(-2,3):
		for dz in range(-2,3):
			var k:=cell+Vector2i(dx,dz)
			if catalog.has(_key(k)) and not sectors.has(k):pending.append(k)
	pending.sort_custom(func(a,b):return pos.distance_squared_to((Vector2(a)+Vector2(.5,.5))*SIZE)<pos.distance_squared_to((Vector2(b)+Vector2(.5,.5))*SIZE))

func _read(section:Array) -> PackedFloat32Array:
	if int(section[1])<=0:return PackedFloat32Array()
	files.seek(int(section[0]))
	return files.get_buffer(int(section[1])).to_float32_array()

func _load_near(k:Vector2i) -> void:
	if not files:return
	var data:Array=catalog[_key(k)]
	var section:=Node3D.new()
	add_child(section)
	var near_people:=_read(data[3])
	sectors[k]={"root":section,"people":near_people}
	for kind in 3:
		var buffer:=_read(data[kind])
		if buffer.is_empty():continue
		var batch:=MultiMesh.new()
		batch.transform_format=MultiMesh.TRANSFORM_3D
		batch.use_custom_data=true
		batch.mesh=types[kind]
		batch.instance_count=buffer.size()/16
		batch.buffer=buffer
		var block:=MultiMeshInstance3D.new()
		block.multimesh=batch
		block.material_override=walls
		block.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		block.visibility_range_end=215
		block.visibility_range_end_margin=20
		section.add_child(block)

func _people(cell:Vector2i,pos:Vector2) -> void:
	var cap:=2-int(yard.sky.night>.55)-int(yard.sky.wet>.5)
	if cool>0 or active.size()>=cap:return
	var view:=get_viewport().get_camera_3d()
	var score:=INF
	var choice:Dictionary={}
	for dx in range(-1,2):
		for dz in range(-1,2):
			var key:=cell+Vector2i(dx,dz)
			if not sectors.has(key):continue
			var data:PackedFloat32Array=sectors[key].people
			for i in range(0,data.size(),7):
				var at:=Vector2(data[i],data[i+2])
				var d:=at.distance_to(pos)
				if d<10 or d>50:continue
				var y:=data[i+1]
				if view and not view.is_position_in_frustum(Vector3(at.x,y+1,at.y)):continue
				var busy:=false
				for p in active:
					if p.key==key and p.index==i:busy=true
				if busy:continue
				var sc:float=d+yard.rng.randf()*25
				if sc>=score:continue
				score=sc
				var normal:=Vector2(data[i+3],data[i+4])
				var tangent:=Vector2(normal.y,-normal.x)*data[i+5]
				choice={"key":key,"index":i,"height":y,"yaw":atan2(normal.x,normal.y),"normal":normal,
					"door":at+normal*.15+tangent*.6,"rail":at+normal*.62+tangent*.25,"hash":data[i+6]}
	if not choice.is_empty():
		_spawn(choice)
		cool=yard.rng.randf_range(10,25)

func _spawn(p:Dictionary) -> void:
	var group:Dictionary={"ppl":[],"kind":"balcony","down":false}
	p.smoke=yard.adult and _hash(p.rail,70)<.5
	p.seat=false
	p.item="cig" if p.smoke else ""
	p.home=p.door
	p.face=p.yaw
	yard._spawn(group,p)
	p.actor.collider.collision_layer=0
	p.actor.position.y=p.height
	p.stay=yard.rng.randf_range(12,30)
	p.wave=0.0
	p.waved=false
	p.puff=yard.rng.randf_range(2,5)
	p.state="out"
	active.append(p)

func _animate(p:Dictionary,pos:Vector2,delta:float) -> void:
	var actor:Node3D=p.actor
	var at:=Vector2(actor.position.x,actor.position.z)
	var distance:=pos.distance_to(at)
	if distance>70:
		_drop(p)
		return
	if p.state!="stand":
		var target:Vector2=p.door if p.state=="in" else p.rail
		if at.distance_to(target)<=.045:
			if p.state=="in":_drop(p)
			else:
				actor.player.play(&"idle",.1)
				actor.player.pause()
				actor.rotation.y=p.yaw
				p.state="stand"
			return
		var forward:=at.direction_to(target)
		at=at.move_toward(target,.8*delta)
		actor.position=Vector3(at.x,p.height,at.y)
		actor.rotation.y=lerp_angle(actor.rotation.y,atan2(forward.x,forward.y),1-exp(-8*delta))
		if actor.player.current_animation!=&"walk":actor.player.play(&"walk",.13,.75)
		return
	p.stay-=delta
	var camera:=get_viewport().get_camera_3d()
	var seen:=not camera or camera.is_position_in_frustum(actor.position+Vector3.UP)
	if p.stay<=0 and (not seen or distance>30):
		p.state="in"
		return
	p.phase+=delta
	if p.smoke:
		p.puff-=delta
		if p.puff<=-1.3:
			if distance<40:yard.hookah._puff(actor.position+Vector3.UP*1.6+actor.basis.z*.3,actor.basis.z)
			p.puff=yard.rng.randf_range(4,8)
		p.pose.gesture("cig",1.05 if p.puff<0 else -1.05)
	else:
		if not p.waved and distance<26:
			p.waved=true
			if _hash(p.rail,71)<.6:p.wave=yard.rng.randf_range(1.6,2.6)
		if p.wave>0:
			p.wave-=delta
			p.pose.fly(true,sin(p.phase*11)*.33)
		else:p.pose.gesture("fan",-1.0)

func _hash(rail:Vector2,salt:int) -> float:
	return fposmod(sin((rail.x+3181.0)*12.9898+(rail.y+2071.0)*78.233+salt*37.719)*43758.5453,1.0)

func _drop(p:Dictionary) -> void:
	if is_instance_valid(p.actor):p.actor.queue_free()
	active.erase(p)

func clear() -> void:
	for p:Dictionary in active.duplicate():_drop(p)
	for s:Dictionary in sectors.values():s.root.queue_free()
	sectors.clear()
	pending.clear()
	last=Vector2i(100000,100000)
	enabled=false
