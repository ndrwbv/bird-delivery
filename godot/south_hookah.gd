extends Node3D

var yard:Node
var spots:Array[Dictionary]=[]
var occupied:Dictionary={}
var groups:Array[Dictionary]=[]
var timer:=0.0
var material_cache:Dictionary={}
var puff_mesh:=SphereMesh.new()
var smoke:=StandardMaterial3D.new()
var groups_bank:Dictionary={}

func setup(courtyard:Node,benches:Dictionary,selected:Array) -> void:
	yard=courtyard
	for place:Dictionary in selected:
		var b:Dictionary=benches[int(place.id)]
		spots.append({"bench":b,"size":int(place.n),"rest":0.0})
	puff_mesh.radius=.22
	puff_mesh.height=.37
	puff_mesh.radial_segments=6
	puff_mesh.rings=3
	smoke.albedo_color=Color(.84,.83,.8,.48)
	smoke.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	smoke.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	smoke.vertex_color_use_as_albedo=true
	puff_mesh.material=smoke

func step(delta:float,pos:Vector2) -> void:
	timer-=delta
	if timer<=0:
		timer=.5
		for s in spots:
			var b:Dictionary=s.bench
			s.rest=maxf(0,s.rest-.5)
			var d:=pos.distance_squared_to(b.at)
			var id:=int(b.id)
			var broken:bool=yard.bench_broken(id)
			if occupied.has(id):
				var group:Dictionary=occupied[id]
				if d>320*320 or group.scatter>=14:_remove(group)
				elif broken and group.scatter<0:_scatter(group)
			elif d<230*230 and not broken and s.rest<=0 and not _taken(id):_spawn(s)
	var seated:=false
	for g:Dictionary in groups:
		if g.ppl.size()<g.spec.size and not seated and g.scatter<0:
			_seat(g)
			seated=true
		var d:=pos.distance_squared_to(g.at)
		if g.scatter>=0:g.scatter+=delta
		if d>115*115:continue
		if absf(yard.car.speed)>3 and not g.tipped and pos.distance_squared_to(Vector2(g.prop.position.x,g.prop.position.z))<1.6*1.6:
			g.tipped=true
			g.prop.rotation.z=1.4
			g.prop.position.y-=.15
			_puff(g.prop.position+Vector3.UP*.4,Vector3.UP)
		if g.scatter>=0:
			for p:Dictionary in g.ppl:
				if not _free(p):continue
				var actor:Node3D=p.actor
				var at:=Vector2(actor.position.x,actor.position.z)
				yard._walk(p,at+p.run*4,1.5,delta)
			continue
		g.next-=delta
		var breathing:bool=g.next<=0
		if breathing:g.next=yard.rng.randf_range(2.2,5)
		var turn:int=yard.rng.randi_range(0,maxi(0,g.ppl.size()-1)) if breathing else -1
		for i in g.ppl.size():
			var p:Dictionary=g.ppl[i]
			if not _free(p):continue
			p.phase+=delta
			if i==turn:p.drag=1.6
			if p.drag<=0:continue
			var before:float=p.drag
			p.drag=maxf(0,p.drag-delta)
			p.pose.gesture("cig",1.5*(1.6-p.drag))
			if before>.7 and p.drag<=.7 and d<100*100:
				var face:Vector3=p.actor.basis.z
				_puff(p.actor.position+Vector3.UP*(1.25 if p.seat else 1.6)+face*.4,face)

func _taken(id:int) -> bool:
	for sc:Dictionary in yard.scenes:
		if sc.kind=="bench" and int(sc.spot.id)==id:return true
	return false

func _spawn(s:Dictionary) -> void:
	var b:Dictionary=s.bench
	var at:Vector2=b.at+Vector2(sin(b.face),cos(b.face))*1.05
	var prop:=MeshInstance3D.new()
	var key:="adult" if yard.adult else "kids"
	if not groups_bank.has(key):groups_bank[key]=_hookah(yard.adult)
	prop.mesh=groups_bank[key]
	prop.position=Vector3(at.x,yard.terrain.land_height(at.x,at.y),at.y)
	prop.rotation.y=b.face
	add_child(prop)
	var g:Dictionary={"at":b.at,"spec":s,"kind":"hookah","ppl":[],"down":false,"prop":prop,
		"scatter":-1.0,"tipped":false,"next":yard.rng.randf_range(1,4)}
	occupied[int(b.id)]=g
	groups.append(g)

func _seat(g:Dictionary) -> void:
	var b:Dictionary=g.spec.bench
	var i:int=g.ppl.size()
	var seat:Vector2=[Vector2(-.5,0),Vector2(.5,0),Vector2(.95,.9)][i] if int(g.spec.size)>1 else Vector2.ZERO
	var at:Vector2=b.at+seat.rotated(-b.face)
	var p:Dictionary={"home":at,"face":b.face if i<2 else atan2(g.prop.position.x-at.x,g.prop.position.z-at.y),"item":"","seat":i<2,"drag":0.0}
	yard._spawn(g,p)

func _free(p:Dictionary) -> bool:
	if not is_instance_valid(p.actor):return false
	var a:Node3D=p.actor
	return not a.defeated and a.stunned<=0 and a.knockdown<=0 and a.recovery<=0 and a.ragdoll==null

func _scatter(g:Dictionary) -> void:
	g.scatter=0.0
	g.down=true
	for p:Dictionary in g.ppl:
		if not _free(p):continue
		var direction:Vector2=p.home-g.at
		if direction.length_squared()<.04:direction=Vector2.from_angle(g.spec.bench.face)
		p.run=direction.normalized().rotated(yard.rng.randf_range(-.6,.6))
		if p.seat:
			p.seat=false
			p.actor.model.position.y=0
			p.pose.sit(0)
			p.actor.impact(4.0,Vector3(p.run.x,0,p.run.y),false)

func _puff(at:Vector3,facing:Vector3) -> void:
	var cloud:=CPUParticles3D.new()
	cloud.one_shot=true
	cloud.emitting=false
	cloud.amount=6
	cloud.lifetime=3.4
	cloud.explosiveness=.90
	cloud.mesh=puff_mesh
	cloud.direction=(facing+Vector3.UP*.55).normalized()
	cloud.spread=20
	cloud.initial_velocity_min=.6
	cloud.initial_velocity_max=1.2
	cloud.scale_amount_min=.48
	cloud.scale_amount_max=1.1
	cloud.gravity=Vector3(0,.1,0)
	var ramp:=Gradient.new()
	ramp.set_color(0,Color(1,1,1,.8))
	ramp.set_color(1,Color(1,1,1,0))
	cloud.color_ramp=ramp
	cloud.position=at
	add_child(cloud)
	cloud.finished.connect(cloud.queue_free)
	cloud.emitting=true

func _piece(mesh:PrimitiveMesh,tone:String,at:Vector3,rx:=0.0) -> Array:
	if not material_cache.has(tone):
		var mat:=StandardMaterial3D.new()
		mat.albedo_color=Color(tone)
		material_cache[tone]=mat
	var transform_=Transform3D(Basis(Vector3.RIGHT,rx),at)
	var result:=SurfaceTool.new()
	result.append_from(mesh,0,transform_)
	return [result.commit_to_arrays(),material_cache[tone]]

func _sphere(radius:float) -> SphereMesh:
	var mesh:=SphereMesh.new()
	mesh.radius=radius
	mesh.height=radius*2
	mesh.radial_segments=10
	mesh.rings=6
	return mesh

func _cylinder(top:float,bottom:float,height:float) -> CylinderMesh:
	var mesh:=CylinderMesh.new()
	mesh.top_radius=top
	mesh.bottom_radius=bottom
	mesh.height=height
	mesh.radial_segments=8
	mesh.rings=0
	return mesh

func _box(size_:Vector3) -> BoxMesh:
	var mesh:=BoxMesh.new()
	mesh.size=size_
	return mesh

func _hookah(is_adult:bool) -> ArrayMesh:
	var parts:Array=[]
	if is_adult:
		parts.append(_piece(_sphere(.2),"#3fa8c9",Vector3(0,.2,0)))
		parts.append(_piece(_cylinder(.035,.05,.55),"#c9a24d",Vector3(0,.62,0)))
		parts.append(_piece(_cylinder(.14,.14,.02),"#c9a24d",Vector3(0,.82,0)))
		parts.append(_piece(_cylinder(.07,.045,.1),"#a0522d",Vector3(0,.89,0)))
		parts.append(_piece(_box(Vector3(.06,.03,.06)),"#ff6a1c",Vector3(0,.955,0)))
		for k in 5:parts.append(_piece(_cylinder(.02,.02,.24),"#2b2a30",Vector3(0,.55-k*.04+k*k*.03,-.12-k*.18),1.1-k*.25))
	else:
		parts.append(_piece(_cylinder(.2,.16,.36),"#c9873a",Vector3(0,.3,0)))
		parts.append(_piece(_cylinder(.12,.14,.10),"#a8692a",Vector3(0,.07,0)))
		parts.append(_piece(_box(Vector3(.1,.03,.03)),"#a8692a",Vector3(0,.22,-.22)))
		parts.append(_piece(_cylinder(.04,.04,.16),"#5a4a3a",Vector3(0,.56,0)))
		parts.append(_piece(_sphere(.11),"#f4f1ea",Vector3(0,.68,0)))
	var mesh:=ArrayMesh.new()
	for part:Array in parts:
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,part[0])
		mesh.surface_set_material(mesh.get_surface_count()-1,part[1])
	return mesh

func _remove(g:Dictionary) -> void:
	var dead:=false
	for p:Dictionary in g.ppl:
		if is_instance_valid(p.actor):
			if p.actor.defeated:dead=true
			else:p.actor.queue_free()
	if dead:g.spec.rest=30.0
	g.prop.queue_free()
	occupied.erase(int(g.spec.bench.id))
	groups.erase(g)

func clear() -> void:
	for g:Dictionary in groups.duplicate():_remove(g)
	for s in spots:s.rest=0.0
	for node:Node in get_children():
		if node is CPUParticles3D:node.queue_free()
	timer=0
