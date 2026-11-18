extends Node3D

# Vehicle damage is allocated only when a real contact reaches the release's damage threshold.
# Undamaged traffic keeps the shared imported meshes and materials.
signal wrecked(vehicle:CharacterBody3D)
signal person_struck(actor:Node3D,strength:float,direction:Vector3,result:int)
const HUMAN:=preload("res://pedestrian.gd")
const PAINT:=preload("res://car_paint.gdshader")
const GLASS:=preload("res://car_glass.gdshader")
const PANES:=["winF","winB","winL","winR"]
var traffic:Node
var state:Dictionary={}
var ticking:Dictionary={}
var hidden_parking:Dictionary={}
var blast_people:=PhysicsShapeQueryParameters3D.new()
var elapsed:=0.0
var generator:=RandomNumberGenerator.new()
var flame:SphereMesh
var soot:SphereMesh

func setup(streets:Node) -> void:
	traffic=streets
	generator.randomize()
	var range_:=SphereShape3D.new()
	range_.radius=11.0
	blast_people.shape=range_
	blast_people.collision_mask=4
	flame=_particle_mesh(Color("#ef7b24"),true)
	soot=_particle_mesh(Color("#535057"),false)

func _particle_mesh(tone:Color,light:bool) -> SphereMesh:
	var sphere:=SphereMesh.new()
	sphere.radius=.26
	sphere.height=.52
	sphere.radial_segments=6
	sphere.rings=2
	var paint:=StandardMaterial3D.new()
	paint.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	paint.vertex_color_use_as_albedo=true
	paint.albedo_color=tone
	if light:
		paint.emission_enabled=true
		paint.emission=tone
	sphere.material=paint
	return sphere

func _entry(car:CharacterBody3D) -> Dictionary:
	var id:=car.get_instance_id()
	if state.has(id):return state[id]
	var dents:=PackedVector4Array()
	var pushes:=PackedVector4Array()
	dents.resize(8)
	pushes.resize(8)
	var s:Dictionary={"vehicle":car,"hp":100.0,"next_hit":0.0,"due":INF,"chain":false,"dents":dents,"forces":pushes,
		"paint":[],"pane":[],"cracks":[0,0,0,0],"next_dent":0}
	for name_:String in ["Car_CarBody_0","Car_Details_0","Car_Details_Transparent_0","winF","winB","winL","winR"]:
		var part:MeshInstance3D=car.visual.get_node(name_)
		var source:=part.get_active_material(0) as StandardMaterial3D
		if not source:continue
		var pane:=PANES.find(name_)
		var clear:=pane>=0 or name_=="Car_Details_Transparent_0"
		var material:=ShaderMaterial.new()
		material.shader=GLASS if clear else PAINT
		material.set_shader_parameter(&"surface_texture" if clear else &"body_texture",source.albedo_texture)
		material.set_shader_parameter(&"tint" if clear else &"enamel",source.albedo_color)
		if clear:material.set_shader_parameter(&"pane",pane)
		else:material.set_shader_parameter(&"body_panel",name_=="Car_CarBody_0")
		if pane>=0:s.pane.append(material)
		part.material_override=material
		s.paint.append(material)
	state[id]=s
	car.tree_exiting.connect(_forget.bind(id),CONNECT_ONE_SHOT)
	return s

func _forget(id:int) -> void:
	state.erase(id)
	ticking.erase(id)

func recoiling(car:CharacterBody3D) -> bool:
	if not car.traffic_body or car.wreck:return false
	if not car.going and car.coast.length_squared()>=.015:return true
	var s:Dictionary=state.get(car.get_instance_id(),{})
	return not s.is_empty() and (elapsed<s.next_hit or s.chain)

func player_hit(car:CharacterBody3D,speed:float,contact:Vector3,_normal:Vector3) -> bool:
	if not car or not car.traffic_body or car.shuttle:return false
	if car.wreck or recoiling(car):return true
	if speed<=5:return false
	var s:=_entry(car)
	s.next_hit=elapsed+.5
	_dent(s,speed,contact)
	s.hp-=speed*1.15+maxf(0,speed-22)*2.1
	if s.hp<=0:
		_wreck(s)
		return true
	return false

func _dent(s:Dictionary,speed:float,point:Vector3) -> void:
	var car:CharacterBody3D=s.vehicle
	var at:Vector3=car.visual.to_local(point)
	var end:=absf(at.z)/2.5>=absf(at.x)/1.07
	var side:=signf(at.z if end else at.x)
	var p:=Vector3(clampf(at.x,-1.07,1.07),.72,clampf(at.z,-2.5,2.5))
	if end:p.z=side*2.5
	else:p.x=side*1.07
	var direction:=Vector3(0,0,-side) if end else Vector3(-side,0,0)
	var force:=clampf(speed/26.0,.12,1)
	var slot:int=s.next_dent
	for i in 8:
		var prior:Vector4=s.dents[i]
		if prior.w>0 and Vector3(prior.x,prior.y,prior.z).distance_squared_to(p)<.45*.45:
			slot=i
			break
	s.dents[slot]=Vector4(p.x,p.y,p.z,.45+.60*force)
	s.forces[slot]=Vector4(direction.x,0,direction.z,minf(.5,s.forces[slot].w+force*.3))
	s.next_dent=(slot+1)%8
	for material:ShaderMaterial in s.paint:
		material.set_shader_parameter(&"dent_points",s.dents)
		material.set_shader_parameter(&"dent_forces",s.forces)
	var pane:int=(1 if at.z>0 else 0) if end else (2 if at.x<0 else 3)
	var level:=3 if speed>=22 else (2 if speed>=15 else (1 if speed>=9 else 0))
	if level>0 and s.pane.size()==4:
		s.cracks[pane]=mini(3,s.cracks[pane]+level)
		s.pane[pane].set_shader_parameter(&"crack",s.cracks[pane])

func _wreck(s:Dictionary) -> void:
	var car:CharacterBody3D=s.vehicle
	if car.wreck:return
	car.wreck=true
	car.going=false
	car.pace=0
	car.coast=Vector3.ZERO
	car.dwelling=0
	car.set_physics_process(false)
	s.chain=false
	s.hp=0
	s.due=elapsed+generator.randf_range(11,16)
	ticking[car.get_instance_id()]=true
	for name_:String in ["Car_CarBody_0","Car_Details_0"]:
		var part:MeshInstance3D=car.visual.get_node(name_)
		if part.material_override is ShaderMaterial:part.material_override.set_shader_parameter(&"enamel",Color("#241f26"))
	_fire(car)
	wrecked.emit(car)
	_blast(car)

func _fire(car:Node3D) -> void:
	for is_flame:bool in [true,false]:
		var plume:=CPUParticles3D.new()
		plume.mesh=flame if is_flame else soot
		plume.amount=16 if is_flame else 10
		plume.lifetime=.85 if is_flame else 1.9
		plume.emission_shape=CPUParticles3D.EMISSION_SHAPE_BOX
		plume.emission_box_extents=Vector3(.57,.12,.7)
		plume.direction=Vector3.UP
		plume.spread=22
		plume.gravity=Vector3(.1,1.05,.08)
		plume.initial_velocity_min=1.1
		plume.initial_velocity_max=3.3 if is_flame else 2.15
		plume.scale_amount_min=.42 if is_flame else .7
		plume.scale_amount_max=1.4 if is_flame else 2.2
		plume.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		plume.visibility_range_end=160 if is_flame else 200
		plume.position=Vector3(0,.84,-1.3)
		plume.emitting=true
		car.add_child(plume)
	get_tree().call_group(&"game_audio",&"cue","boom",car.global_position,1.0,220.0)

func _blast(car:Node3D) -> void:
	# The vanilla 11 m blast propagates between cars, with a short fuse to separate the bursts.
	var vehicles:Array=traffic.moving.duplicate()
	vehicles.append_array(traffic.active_parking.values())
	for other:CharacterBody3D in vehicles:
		if other==car or other.wreck or other.shuttle or not other.traffic_body or other.is_queued_for_deletion():continue
		var d:=Vector2(other.position.x-car.position.x,other.position.z-car.position.z)
		var dist:=d.length()
		if dist<.5 or dist>11:continue
		var k:=(1-dist/11)*34.0
		var s:=_entry(other)
		_dent(s,k,car.position+Vector3.UP*.8)
		if k>=6:other.displace(k,Vector3(d.x,0,d.y))
		s.hp-=k*4.6
		if s.hp<=0 and not s.chain:
			s.chain=true
			s.due=elapsed+generator.randf_range(.25,.8)
			ticking[other.get_instance_id()]=true

	var courier:CharacterBody3D=traffic.observer
	if is_instance_valid(courier) and courier.has_method("collision_damage"):
		var offset:=Vector2(courier.position.x-car.position.x,courier.position.z-car.position.z)
		var distance:=offset.length()
		if distance>.3 and distance<11:
			var push:=Vector3(offset.x,0,offset.y)/distance
			courier.velocity+=push*(1.0-distance/11.0)*22.0
			if distance<8.8:courier.collision_damage(20.0,false,car.position+Vector3.UP*.8,push,2.0 if distance<4.4 else 1.0)
	blast_people.transform=Transform3D(Basis(),car.position+Vector3.UP)
	for found:Dictionary in get_world_3d().direct_space_state.intersect_shape(blast_people,64):
		var owner:Node=found.collider.get_parent()
		if not owner is HUMAN or owner.defeated or owner.knockdown>0:continue
		var direction:Vector3=owner.position-car.position
		direction.y=0
		var distance:=direction.length()
		if distance>=11:continue
		direction=direction/distance if distance>.1 else Vector3.RIGHT
		var strength:float=(1-distance/11)*26
		# Vanilla blastPeople sends every standing person inside the circle to
		# runOver. Distance changes the physical impulse, including at the edge.
		var result:int=owner.impact(strength,direction,false,Vector3.UP*.48,.60,true)
		person_struck.emit(owner,strength,direction,result)

func step(delta:float) -> void:
	elapsed+=delta
	if ticking.is_empty():return
	for id:int in ticking.keys():
		if not state.has(id):continue
		var s:Dictionary=state[id]
		if elapsed<s.due:continue
		if s.chain:_wreck(s)
		else:_retire(s.vehicle)

func _retire(car:CharacterBody3D) -> void:
	if car.is_queued_for_deletion():return
	var slot:Variant=traffic.active_parking.find_key(car)
	if slot!=null:
		hidden_parking[slot]=true
		traffic.active_parking.erase(slot)
	traffic.moving.erase(car)
	car.collision_layer=0
	car.collision_mask=0
	car.queue_free()
