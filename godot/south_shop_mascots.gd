extends RefCounted

const PART := preload("res://south_worksite_mesh.gd")
const SPEC := {"roll":[0.5,0.55,1.2,"chop","#1d3b2c"],"oni":[0.5,0.62,1.1,"chop","#f4f1ea"],"burger":[0.6,0.86,1.3,"scep","#e8a84f"]}
var world: StaticBody3D
var paint := {}
var ingredient_mesh := {}
var loose: Array[Dictionary] = []

func _actor(site: Dictionary, spec: Dictionary) -> Dictionary:
	var at: Vector3 = world.floor_position(spec.at)
	var rig := Node3D.new()
	site.root.add_child(rig)
	rig.global_position = at
	var body := PART.instance(rig,world.parts[spec.kind])
	var rig_spec: Array = SPEC[spec.kind]
	var legs: Array[MeshInstance3D] = []
	var arms: Array[MeshInstance3D] = []
	if not paint.has(spec.kind):
		var tint := world.paint.duplicate() as StandardMaterial3D
		tint.albedo_color = Color(rig_spec[4])
		paint[spec.kind] = tint
	for side: int in [-1,1]:
		legs.append(PART.instance(body,world.parts.leg,Vector3(0.2*side,rig_spec[0],0)))
		var arm := PART.instance(body,world.parts.arm,Vector3(float(rig_spec[1])*side,rig_spec[2],0))
		arm.material_override = paint[spec.kind]
		arms.append(arm)
	PART.instance(arms[1],world.parts[rig_spec[3]])
	return {"kind":spec.kind,"node":rig,"body":body,"legs":legs,"arms":arms,"phase":randf()*6,"target":Vector2(at.x,at.z),"timer":0.0,
		"walk":true,"cool":0.0,"gone":0.0,"tumble":0.0,"throw":Vector3.ZERO,"say":0.0}

func clear(site: Dictionary) -> void:
	for actor in site.actors:
		actor.node.queue_free()
	site.actors.clear()
	for i in range(loose.size()-1,-1,-1):
		if loose[i].site==site.root:
			loose[i].view.queue_free()
			loose.remove_at(i)

func step(site: Dictionary, observer: Vector2, distance: float, dt: float) -> void:
	if distance>260.0*260.0:
		for actor in site.actors:
			actor.node.hide()
			actor.gone = maxf(0.0,float(actor.gone)-dt)
		return
	if site.actors.is_empty() and distance<200.0*200.0:
		for spec in site.info.mascots:
			site.actors.append(_actor(site,spec))
	for actor in site.actors:
		var rig: Node3D = actor.node
		var pos := Vector2(rig.global_position.x,rig.global_position.z)
		var from_driver := pos.distance_to(observer)
		actor.cool = maxf(0,float(actor.cool)-dt)
		actor.say = maxf(0,float(actor.say)-dt)
		if actor.gone>0 or not rig.visible:
			actor.gone = maxf(0,float(actor.gone)-dt)
			if actor.gone>0:
				continue
			if actor.get("hit",false):
				if from_driver<=50:
					continue
				var start: Array = site.info.roam.pick_random()
				rig.global_position = world.floor_position(start)
				actor.target = Vector2(start[0],start[1])
				actor.hit = false
			rig.show()
		if actor.tumble>0:
			actor.tumble -= dt
			actor.throw.y -= 16.0*dt
			rig.global_position += Vector3(actor.throw)*dt
			var surface: float = world.host.ground.at(rig.global_position.x,rig.global_position.z)
			if rig.global_position.y<surface:
				rig.global_position.y = surface
				actor.throw = Vector3(actor.throw.x*0.7,absf(actor.throw.y)*0.4,actor.throw.z*0.7)
			actor.body.rotate_z(9.0*dt)
			if actor.tumble<=0:
				rig.global_position.y = surface
				actor.body.rotation.z = 0
				world.host.cast.say(rig,world.data.lines.up[site.info.name].pick_random(),Color.WHITE,3.0)
			continue
		actor.phase += dt
		var heading: Vector2 = actor.target-pos
		if actor.walk:
			if heading.length_squared()<0.09:
				actor.walk = false
				actor.timer = randf_range(1.5,4.0)
			else:
				pos = pos.move_toward(actor.target,1.1*dt)
				var road: Dictionary = world.host._road_at(pos,9.0)
				if (not road.is_empty() and float(road.d)<float(road.width)*0.5+0.9) or not world.host._clear_yard(pos,0.4):
					actor.walk = false
					actor.timer = 0.5
				else:
					rig.global_position = Vector3(pos.x,world.host.ground.at(pos.x,pos.y),pos.y)
					rig.rotation.y = atan2(heading.x,heading.y)
		else:
			actor.timer -= dt
			if actor.timer<=0:
				var point: Array = site.info.roam.pick_random()
				actor.target = Vector2(point[0],point[1])
				actor.walk = true
			if from_driver<28:
				rig.rotation.y = atan2(observer.x-pos.x,observer.y-pos.y)
		var wave := sin(float(actor.phase)*(9 if from_driver<28 else 5))
		var swing := sin(float(actor.phase)*8)*0.55 if actor.walk else 0.0
		actor.body.position.y = absf(swing)*0.109
		actor.body.rotation.z = 0.09*swing if actor.walk else sin(float(actor.phase)*1.5)*0.03
		actor.legs[0].rotation.x = swing
		actor.legs[1].rotation.x = -swing
		actor.arms[1].rotation = Vector3(-swing*0.6,0,0) if actor.walk else Vector3(-2.6+wave*0.25,0,-0.35+wave*0.35)
		actor.arms[0].rotation = Vector3(swing*0.6,0,0) if actor.walk else (Vector3(-2.6-wave*0.25,0,0.35-wave*0.35) if from_driver<28 else Vector3(0.1,0,0.15))
		if from_driver<55 and actor.say<=0 and randf()<dt*0.06:
			actor.say = 3.0
			world.host.cast.say(rig,world.data.lines[site.info.name].pick_random(),Color(world.data.brands[site.info.name].say),3.0)
		var car: CharacterBody3D = world.host.car
		if absf(car.speed)<3 or from_driver>4 or absf(car.global_position.y-rig.global_position.y)>2.5:
			continue
		var offset := car.to_local(rig.global_position)
		if absf(offset.z)<3.19 and absf(offset.x)<1.7:
			hit(actor,site,car)

func hit(actor: Dictionary, site: Dictionary, car: CharacterBody3D) -> void:
	if actor.gone>0 or actor.tumble>0:
		return
	if actor.cool<=0:
		actor.cool = 25
		world.mascot_struck.emit()
		if not world.host.ride and not world.host.quick:
			world.host.respect_earned.emit("rivalMascot")
	if not world.host.garage_zone.adults:
		var k := minf(1.4,absf(car.speed)/12)
		actor.tumble = 2.6
		actor.throw = car.velocity*0.8*k+Vector3(randf_range(-2,2),6+absf(car.speed)*0.2,randf_range(-2,2))
		return
	actor.hit = true
	actor.gone = 40
	actor.node.hide()
	for bit: Array in world.data.pieces[actor.kind]:
		var key := str(bit)
		if not ingredient_mesh.has(key):
			var mesh: PrimitiveMesh
			if bit[0]=="box":
				mesh = BoxMesh.new()
				mesh.size = Vector3(bit[1],bit[2],float(bit[1])*0.8)
			elif bit[0]=="cap":
				mesh = SphereMesh.new()
				mesh.radius = bit[1]
				mesh.height = bit[1]
				mesh.is_hemisphere = true
			else:
				mesh = CylinderMesh.new()
				mesh.top_radius = bit[1]
				mesh.bottom_radius = bit[1]
				mesh.height = bit[2]
				mesh.radial_segments = 10
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color.hex((int(bit[3])<<8)+255)
			mesh.material = mat
			ingredient_mesh[key] = mesh
		var view := PART.instance(site.root,ingredient_mesh[key])
		view.global_position = actor.node.global_position+Vector3.UP*randf_range(0.6,1.8)
		loose.append({"view":view,"site":site.root,"floor":actor.node.global_position.y,"v":car.velocity*0.5+Vector3(randf_range(-6,6),randf_range(6,12),randf_range(-6,6)),"spin":randf_range(-8,8),"time":3.0})

func advance_debris(dt: float) -> void:
	for i in range(loose.size()-1,-1,-1):
		var bit := loose[i]
		bit.time -= dt
		if bit.time<=0:
			bit.view.queue_free()
			loose.remove_at(i)
			continue
		bit.v.y -= 18.0*dt
		bit.view.global_position += Vector3(bit.v)*dt
		if bit.view.global_position.y<bit.floor:
			bit.view.global_position.y = bit.floor
			bit.v = Vector3(bit.v.x*0.7,absf(bit.v.y)*0.3,bit.v.z*0.7)
		bit.view.rotate_x(float(bit.spin)*dt)
