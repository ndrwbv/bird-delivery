extends Node3D

signal startled
const SKY_BIRDS := 12
const PIGEONS := 15
const CELL := 54.0
var terrain: RefCounted
var car: CharacterBody3D
var traffic: Node
var sky: Node
var roofs := {}
var places := {}
var flocks: Array[Dictionary] = []
var groups: Array[Dictionary] = []
var body := MultiMeshInstance3D.new()
var wings := MultiMeshInstance3D.new()
var rng := RandomNumberGenerator.new()
var active := false
var time := 0.0

func setup(region: Dictionary, ground: RefCounted, vehicle: CharacterBody3D, roads: Node, _events: Node, atmosphere: Node,
		_people: Node, _paint: Material, _base: Vector2) -> void:
	terrain = ground
	car = vehicle
	traffic = roads
	sky = atmosphere
	for b: Dictionary in region.buildings:
		var polygon := PackedVector2Array()
		var h := -INF
		for p: Array in b.outline:
			var v := Vector2(p[0],p[1])
			polygon.append(v)
			h = maxf(h,terrain.land_height(v.x,v.y))
		if polygon.size()<3:
			continue
		var rect := Rect2(polygon[0],Vector2.ZERO)
		for p in polygon:
			rect = rect.expand(p)
		var from := Vector2i((rect.position/CELL).floor())
		var to := Vector2i((rect.end/CELL).floor())
		var building := {"rect":rect,"p":polygon,"height":h+float(b.height)}
		for z in range(from.y,to.y+1):
			for x in range(from.x,to.x+1):
				var key := Vector2i(x,z)
				if not roofs.has(key): roofs[key] = []
				roofs[key].append(building)
	for p: Array in region.spots:
		var at := Vector2(p[0],p[1])
		var key := Vector2i((at/CELL).floor())
		if not places.has(key): places[key] = []
		places[key].append(at)
	var torso := BoxMesh.new()
	torso.size=Vector3(.16,.14,.42)
	_make_batch(body,torso)
	var wing := BoxMesh.new()
	wing.size=Vector3(.46,.03,.2)
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for side in [-1.0,1.0]:
		builder.append_from(wing,0,Transform3D(Basis(Vector3.BACK,.35*side),Vector3(.26*side,.06,0)))
	_make_batch(wings,builder.commit())
	hide()

func _make_batch(view: MultiMeshInstance3D, shape: Mesh) -> void:
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo=true
	material.roughness=1.0
	var batch := MultiMesh.new()
	batch.transform_format=MultiMesh.TRANSFORM_3D
	batch.use_colors=true
	batch.mesh=shape
	batch.instance_count=SKY_BIRDS+PIGEONS
	for i in batch.instance_count:
		batch.set_instance_color(i,Color("#5b5e66") if i<SKY_BIRDS else Color("#8a8f9c"))
	view.multimesh=batch
	view.material_override=material
	view.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(view)

func begin(number: int, seed_value: int, _adult: bool) -> void:
	clear()
	rng.seed=("%d/birds/%d"%[seed_value,number]).hash()
	var at:=Vector2(car.position.x,car.position.z)
	for i in 2:
		var center:=at+Vector2(rng.randf_range(-80,80),rng.randf_range(-80,80))
		flocks.append({"center":center,"above":rng.randf_range(42,60),"land":terrain.land_height(center.x,center.y),
			"radius":rng.randf_range(30,50),"angle":rng.randf()*TAU,"speed":rng.randf_range(.25,.4)*(1 if i else -1),
			"lift":PackedFloat32Array([0,0,0,0,0,0]),"check":0.0,"roofs":PackedFloat32Array([0,0,0,0,0,0])})
	for i in 3:
		var group:={"at":at,"flying":false,"time":0.0,"birds":[]}
		_land(group,at)
		groups.append(group)
	active=true
	step(0.0,0.0)
	show()

func step(delta: float, _hour: float) -> void:
	if not active:
		return
	time+=delta
	var at:=Vector2(car.position.x,car.position.z)
	for i in flocks.size():
		var flock:=flocks[i]
		flock.center=Vector2(flock.center).lerp(at,1-exp(-.08*delta))
		flock.angle+=flock.speed*delta
		flock.check-=delta
		var sample:bool=flock.check<=0
		if sample:
			flock.check=.24
			flock.land=terrain.land_height(flock.center.x,flock.center.y)
		for j in 6:
			var sign_:float=signf(flock.speed)
			var a:float=flock.angle-j*.09*sign_
			var point:Vector2=flock.center+Vector2(cos(a),sin(a))*(flock.radius+(2 if j%2 else -2)*ceilf(j*.5))
			var y:float=flock.land+flock.above
			if sample: flock.roofs[j]=_roof(point)
			flock.lift[j]=lerpf(flock.lift[j],maxf(0.0,float(flock.roofs[j])+8-y),1-exp(-1.5*delta))
			var top:=Vector3(point.x,y+flock.lift[j]+sin(time*1.3+j)*1.2,point.y)
			_draw(i*6+j,top,-a+(PI if sign_<0 else 0),0.,2.2 if sky.night<.8 else 0.,1.2*sin(time*9+j))
	for i in groups.size():
		var g:=groups[i]
		var distance:float=at.distance_to(g.at)
		if not g.flying and distance>260:
			_land(g,at)
			distance=at.distance_to(g.at)
		if not g.flying and ((distance<13 and absf(car.speed)>2) or distance<5):
			_takeoff(g,at)
		if g.flying:
			g.time+=delta
			if g.time>9 and (distance>70 or g.time>40):
				_land(g,at)
		for j in g.birds.size():
			var b:Dictionary=g.birds[j]
			var pitch:=maxf(0,sin(time*3.4+b.phase))*.49
			var flap:=.2
			if g.flying and not b.perched:
				var next:Vector3=b.p+b.v*delta
				var top:=_roof(Vector2(next.x,next.z))
				if next.y<top+.3:
					if top-b.p.y<1.5:
						next.y=top+.07
						b.perched=true
					else:
						next=b.p+Vector3.UP*maxf(6,b.v.y)*delta
				else:
					b.v.y=maxf(1.5,b.v.y-1.5*delta)
				b.p=next
				pitch=-.3
				flap=sin(time*22+b.phase)*1.3
			_draw(SKY_BIRDS+i*5+j,b.p,b.yaw,pitch,.9,flap)

func _roof(at: Vector2) -> float:
	var highest:=-999.0
	for b:Dictionary in roofs.get(Vector2i((at/CELL).floor()),[]):
		if b.rect.has_point(at) and Geometry2D.is_point_in_polygon(at,b.p):
			highest=maxf(highest,b.height)
	return highest

func _land(g: Dictionary, at: Vector2) -> void:
	var choice:=Vector2.INF
	var key:=Vector2i((at/CELL).floor())
	for _attempt in 26:
		var list:Array=places.get(key+Vector2i(rng.randi_range(-3,3),rng.randi_range(-3,3)),[])
		if list.is_empty(): continue
		var p:Vector2=list[rng.randi_range(0,list.size()-1)]
		var distance:=at.distance_to(p)
		if distance>=50 and distance<=170:
			choice=p
			break
	if not choice.is_finite():
		var target:=at+Vector2.from_angle(rng.randf()*TAU)*rng.randf_range(50,150)
		var roads:Array=traffic.roads.around(target,55)
		if roads.is_empty():
			choice=target
		else:
			var e:RefCounted=roads[rng.randi_range(0,roads.size()-1)]
			choice=e.lane((e.entry+e.exit)*.5)+e.right*(.5*e.width+1.0)
	g.at=choice
	g.flying=false
	g.time=0.0
	g.birds.clear()
	for i in 5:
		var p:=choice+Vector2(rng.randf_range(-1.6,1.6),rng.randf_range(-1.6,1.6))
		g.birds.append({"p":Vector3(p.x,terrain.at(p.x,p.y)+.09,p.y),"v":Vector3.ZERO,"yaw":rng.randf()*TAU,
			"phase":rng.randf()*TAU,"perched":false})

func _takeoff(g: Dictionary, at: Vector2) -> void:
	g.flying=true
	g.time=0.0
	for b:Dictionary in g.birds:
		var direction:Vector2=(Vector2(b.p.x,b.p.z)-at).normalized()*rng.randf_range(4,7)
		b.v=Vector3(direction.x+rng.randf_range(-2,2),rng.randf_range(4,7),direction.y+rng.randf_range(-2,2))
		b.yaw=atan2(b.v.x,b.v.z)
	startled.emit()

func _draw(i: int, at: Vector3, yaw: float, pitch: float, size_: float, flap: float) -> void:
	var basis_:=Basis.from_euler(Vector3(pitch,yaw,0)).scaled(Vector3.ONE*size_)
	body.multimesh.set_instance_transform(i,Transform3D(basis_,at))
	wings.multimesh.set_instance_transform(i,Transform3D(basis_*Basis.from_scale(Vector3(1,flap,1)),at))

func clear() -> void:
	active=false
	flocks.clear()
	groups.clear()
	hide()
