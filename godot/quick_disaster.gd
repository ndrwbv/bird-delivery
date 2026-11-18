extends Node3D

signal history_changed

const GROUND := preload("res://quick_ground.gd")
const FIRE_SHADER := preload("res://quick_fire.gdshader")
const SKY_SHADER := preload("res://quick_sky.gdshader")
const PROTECT_DEPOT := 126601195
const MAX_HOUSES := 10
const MAX_SCARS := 48
const MAX_FIRES := 16
var car: CharacterBody3D
var traffic: Node3D
var walkers: Array = []
var terrain: RefCounted
var cut := GROUND.new()
var region: Dictionary
var buildings: Array[Dictionary] = []
var houses_by_id := {}
var roads_by_cell := {}
var rubble := preload("res://quick_rubble.gd").new()
var figures := preload("res://quick_figures.gd").new()
var active := false
var aftermath := false
var damage_nodes := Node3D.new()
var environment: Environment
var sky_before: Sky
var hell_sky: Sky
var rock := SphereMesh.new()
var trail := CylinderMesh.new()
var ring := TorusMesh.new()
var flame := QuadMesh.new()
var box := BoxMesh.new()
var ink := {}
var flash: OmniLight3D
var protected_id := -1
var protected_points: Array[Vector2] = []
var depot := Vector2.ZERO
var clock := 0.0
var next := 0.06
var serial := 0
var random := RandomNumberGenerator.new()
var meteors: Array[Dictionary] = []
var fires: Array[Dictionary] = []
var scars: Array[Dictionary] = []
var opening_scars: Array[Dictionary] = []
var atlas_step := 0.0
var repair_jobs: Array[Dictionary] = []
var damage_houses: Array[Dictionary] = []
var pulses: Array[Dictionary] = []
var struck_traffic := {}
var burned := 0.0
var exposed := 0.0
var burn_tick := 0.0
var car_flames: MeshInstance3D
var initialized := false
var world_root: Node

func setup(vehicle: CharacterBody3D, original: RefCounted, data: Dictionary, flow: Node3D, humans: Array) -> void:
	car = vehicle
	terrain = original
	region = data
	traffic = flow
	walkers = humans
	world_root = vehicle.get_parent()
	add_child(damage_nodes)
	set_physics_process(false)

func _prepare() -> void:
	if initialized:
		return
	initialized = true
	cut.setup(terrain,world_root)
	rubble.setup(damage_nodes,cut,car)
	figures.setup(damage_nodes,cut)
	for raw: Dictionary in region.buildings:
		var poly := PackedVector2Array()
		for xy: Array in raw.outline:
			poly.append(Vector2(xy[0],xy[1]))
		if poly.size()<3:
			continue
		var bounds := Rect2(poly[0],Vector2.ZERO)
		for p: Vector2 in poly:
			bounds = bounds.expand(p)
		var center := bounds.get_center()
		var height := float(raw.height)
		var y: float = terrain.at(center.x,center.y)
		var item := {"id":int(raw.id),"outline":poly,"p":center,"bounds":bounds,"height":height,"base":y,"cut":y+maxf(3.2,height*.43)}
		buildings.append(item)
		houses_by_id[item.id] = item
	for raw: Dictionary in region.roads:
		if raw.has("deck_y"):
			continue
		for i in range(1,raw.points.size()):
			var a := Vector2(raw.points[i-1][0],raw.points[i-1][1])
			var b := Vector2(raw.points[i][0],raw.points[i][1])
			if not a.is_equal_approx(b):
				var segment := {"a":a,"b":b,"width":float(raw.width)}
				var lo := Vector2i((a.min(b)/64.0).floor())
				var hi := Vector2i((a.max(b)/64.0).floor())
				for y in range(lo.y,hi.y+1):
					for x in range(lo.x,hi.x+1):
						var key := Vector2i(x,y)
						if not roads_by_cell.has(key): roads_by_cell[key] = []
						roads_by_cell[key].append(segment)
	rock.radial_segments = 8
	rock.rings = 4
	trail.radial_segments = 6
	trail.top_radius = 0
	trail.bottom_radius = .45
	trail.height = 1
	ring.rings = 30
	ring.ring_segments = 4
	ring.inner_radius = .93
	ring.outer_radius = 1.0
	flame.size = Vector2.ONE
	var fire := ShaderMaterial.new()
	fire.shader = FIRE_SHADER
	flame.material = fire
	for spec: Array in [["rock",Color("#48262b")],["trail",Color("#ff993d")],["warning",Color("#ffba40")],
			["brick",Color("#9e5941")],["coal",Color("#4c3735")],["soil",Color("#56372e")],["steel",Color("#667a7b")],
			["wood",Color("#c68c46")],["patch",Color("#403e39")],["concrete",Color("#787066")],["barrier",Color("#dc6c35")]]:
		var paint := StandardMaterial3D.new()
		paint.albedo_color = spec[1]
		paint.cull_mode = BaseMaterial3D.CULL_DISABLED
		if spec[0] in ["trail","warning"]:
			paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ink[spec[0]] = paint
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = SKY_SHADER
	hell_sky = Sky.new()
	hell_sky.radiance_size = Sky.RADIANCE_SIZE_32
	hell_sky.sky_material = sky_mat
	var we := world_root.find_children("*","WorldEnvironment",true,false)
	if not we.is_empty():
		environment = we[0].environment

func protect_order(order: Dictionary) -> void:
	protected_id = int(order.get("building_id",-1))
	protected_points.clear()
	for key: String in ["door","customer","stop"]:
		var pos: Variant = order.get(key)
		if pos is Array and pos.size()==2:
			protected_points.append(Vector2(pos[0],pos[1]))
	rubble.clear_doors(protected_points)

func begin(id: String, prior: Dictionary) -> void:
	_prepare()
	if active:
		stop()
	active = true
	aftermath = id == "afterhell"
	cut.start(aftermath)
	random.seed = 713
	serial = 0
	next = .06
	clock = 0
	depot = _xz(car.global_position)
	if walkers.is_empty():
		for actor in world_root.get_children():
			if actor is Node3D and actor.has_method("impact") and actor.get("walker") == true:
				walkers.append(actor)
	car.terrain = cut
	set_physics_process(true)
	if aftermath:
		_load_history(prior)
	else:
		if environment:
			sky_before = environment.sky
			environment.sky = hell_sky
		flash = OmniLight3D.new()
		flash.omni_range = 85
		flash.light_color = Color("#ff6027")
		flash.light_energy = 0
		damage_nodes.add_child(flash)
		for offset: float in [48.0,77.0,109.0]:
			var p := _ahead(offset,10)
			var nearest := _nearest_road(p)
			var roadside: Vector2 = nearest.p + nearest.side*(float(nearest.width)*.5+4.0)
			if _safe(roadside,4):
				_fire(roadside,1.0)
	cut.update_at(depot)

func history() -> Dictionary:
	var saved_houses: Array = []
	var saved_scars: Array = []
	for item in damage_houses:
		saved_houses.append(item.house.id)
	for site in scars:
		saved_scars.append(site.shape.history())
	return {"version":1,"houses":saved_houses,"scars":saved_scars}

func _load_history(prior: Dictionary) -> void:
	if prior.get("version")==1 and prior.get("houses") is Array and prior.get("scars") is Array:
		for id in prior.houses.slice(-MAX_HOUSES):
			if houses_by_id.has(int(id)) and int(id)!=PROTECT_DEPOT:
				var house: Dictionary = houses_by_id[int(id)]
				repair_jobs.append({"house":house,"d":depot.distance_squared_to(house.p)})
		for item in prior.scars.slice(-MAX_SCARS):
			if item is Array and item.size()==3:
				var p := Vector2(float(item[0]),float(item[1]))
				if p.is_finite():
					repair_jobs.append({"p":p,"r":clampf(float(item[2]),1.8,9),"d":depot.distance_squared_to(p)})
			elif item is Dictionary and item.get("center") is Array and item.center.size()==2 and item.get("outer") is Array:
				var center := Vector2(float(item.center[0]),float(item.center[1]))
				var outline := PackedVector2Array()
				for pt in item.outer.slice(0,128):
					if pt is Array and pt.size()==2:
						var at := Vector2(float(pt[0]),float(pt[1]))
						if at.is_finite() and at.distance_squared_to(center)<=2500:
							outline.append(at)
				if center.is_finite() and outline.size()>=3 and not Geometry2D.triangulate_polygon(outline).is_empty():
					repair_jobs.append({"p":center,"outer":outline,"kind":str(item.get("kind","crater")),"d":depot.distance_squared_to(center)})
	if not repair_jobs.is_empty():
		# Pop the nearest first. Loading 48 detailed repairs in one physics tick
		# delays the first drive frame even when none of them are in view.
		repair_jobs.sort_custom(func(a: Dictionary,b: Dictionary): return a.d>b.d)
		_restore_repairs()
		return
	for i in 3:
		var target := _house_target()
		if not target.is_empty():
			_hurt_house(target,true)
	for d: float in [28.0,66.0,117.0]:
		var road := _nearest_road(_ahead(d,0))
		_crater(road.p,6.5 if d==66 else 2.6,true)

func _restore_repairs() -> void:
	var until := Time.get_ticks_usec()+1250
	for i in 2:
		if repair_jobs.is_empty():
			return
		var task: Dictionary = repair_jobs.pop_back()
		if task.has("house"):
			_hurt_house(task.house,true)
		elif task.has("outer"):
			var shape := preload("res://quick_scar.gd").new()
			shape.repair(task.p,task.outer,terrain,task.kind)
			_install_scar(shape)
		else:
			_crater(task.p,task.r,true)
		if Time.get_ticks_usec()>=until:
			return


func stop() -> void:
	if not active:
		return
	active = false
	set_physics_process(false)
	car.terrain = terrain
	if environment and not aftermath and environment.sky == hell_sky:
		environment.sky = sky_before
	for vehicle in struck_traffic:
		if not is_instance_valid(vehicle):
			continue
		var saved: Dictionary = struck_traffic[vehicle]
		vehicle.transform = saved.transform
		vehicle.going = saved.going
		vehicle.coast = saved.coast
		vehicle.visual.transform = saved.visual
		vehicle.set_physics_process(saved.physics)
		vehicle.reset_physics_interpolation()
	struck_traffic.clear()
	for child in damage_nodes.get_children():
		damage_nodes.remove_child(child)
		child.queue_free()
	if is_instance_valid(car_flames):
		car_flames.queue_free()
	car_flames = null
	flash = null
	burned = 0
	exposed = 0
	burn_tick = 0
	meteors.clear()
	fires.clear()
	scars.clear()
	repair_jobs.clear()
	opening_scars.clear()
	atlas_step = 0.0
	damage_houses.clear()
	pulses.clear()
	rubble.clear()
	figures.clear()
	cut.stop()
	protected_id = -1
	protected_points.clear()

func _physics_process(delta: float) -> void:
	if not active:
		return
	if aftermath and not repair_jobs.is_empty():
		_restore_repairs()
	_expand_scars(delta)
	cut.update_at(_xz(car.global_position))
	if aftermath:
		return
	clock += delta
	if clock >= next:
		_meteor()
		next = clock + (1.0 if serial == 1 else random.randf_range(1.9,3.3))
	for i in range(meteors.size()-1,-1,-1):
		var m := meteors[i]
		m.age += delta
		var t := minf(1.0,float(m.age)/float(m.duration))
		m.body.position = (m.start as Vector3).lerp(m.end,t)
		m.warning.scale = Vector3.ONE*(float(m.size)*1.42)*(1.12+.12*sin(clock*16))
		if t>=1:
			m.body.queue_free()
			m.warning.queue_free()
			meteors.remove_at(i)
			_impact(m)
	for i in range(pulses.size()-1,-1,-1):
		var p := pulses[i]
		p.t += delta
		p.node.scale = Vector3.ONE*maxf(.1,p.radius*smoothstep(0,1,p.t/.72))
		if p.t>.72:
			p.node.queue_free()
			pulses.remove_at(i)
	if flash:
		flash.light_energy = move_toward(flash.light_energy,0,delta*17)
	_burn(delta)
	rubble.tick(delta,protected_points)
	figures.tick(clock,delta,_xz(car.position))

func _meteor() -> void:
	serial += 1
	var target := {}
	var radius := 0.0
	var size := random.randf_range(1.0,1.75)
	var duration := random.randf_range(1.75,3.1)
	var p := _ahead(random.randf_range(60,119),random.randf_range(-54,54))
	if serial%4 == 2:
		target = _house_target()
		if not target.is_empty():
			p = target.p
			size = random.randf_range(2.8,4.2)
			duration = 5.4 if serial==2 else random.randf_range(3.2,6.7)
	elif serial%4 == 1:
		var crater_size := 6.1 if serial==1 else random.randf_range(5.2,8.4)
		for d: float in [44.,55.,70.,86.,110.,130.]:
			for s: float in [13.,-13.,24.,-24.,35.,-35.]:
				var possible := _ahead(d,s)
				if not _safe(possible,crater_size+2):
					continue
				var road := _nearest_road(possible)
				if possible.distance_to(road.p) < float(road.width)*.5+crater_size*.9:
					continue
				if _near_scar(possible,crater_size*2):
					continue
				p = possible
				radius = crater_size
				break
			if radius>0:
				break
		if radius>0:
			duration = random.randf_range(5.6,7.9)
			size = radius*.59
	elif serial%4 == 3:
		for person in walkers:
			if is_instance_valid(person) and not person.defeated and _xz(person.position).distance_to(p)<30 and _safe(_xz(person.position),4):
				p = _xz(person.position)
				size = .85
				duration = 1.85
				break
	if target.is_empty() and not _safe(p,maxf(3,radius)):
		return
	var y := float(target.base)+float(target.height) if not target.is_empty() else float(terrain.at(p.x,p.y))
	var end := Vector3(p.x,y,p.y)
	var start := end + Vector3(random.randf_range(-58,58),random.randf_range(69,117),random.randf_range(-52,52))
	var body := Node3D.new()
	damage_nodes.add_child(body)
	body.position = start
	var stone := _mesh(body,rock,"rock",Vector3.ZERO,Vector3.ONE*size*1.7)
	stone.rotation = Vector3(random.randf(),random.randf(),random.randf())*TAU
	var tail := _mesh(body,trail,"trail",Vector3.ZERO,Vector3(size,8.5*size,size))
	tail.position = (start-end).normalized()*size*3.0
	tail.quaternion = Quaternion(Vector3.UP,(start-end).normalized())
	var warning := _mesh(damage_nodes,ring,"warning",Vector3(p.x,terrain.at(p.x,p.y)+.14,p.y),Vector3.ONE*size)
	meteors.append({"body":body,"warning":warning,"p":p,"start":start,"end":end,"age":0.0,"duration":duration,"size":size,"r":radius,"house":target})

func _impact(m: Dictionary) -> void:
	var p: Vector2 = m.p
	if not _protected_clear(p,maxf(7,m.r)) or (not m.house.is_empty() and int(m.house.id)==protected_id):
		return
	var radius: float = float(m.r)*4.6+8.0 if m.r>0.0 else (36.0 if not m.house.is_empty() else 8.0+m.size*5.0)
	if m.r>0.0:
		_crater(p,m.r,false)
		var offset := random.randf()*TAU
		for i in 4:
			var angle := offset+i*PI*.5+random.randf_range(-.28,.28)
			var center := p+Vector2.from_angle(angle)*(float(m.r)+random.randf_range(3.1,5.0))
			_fissure(center,angle,random.randf_range(8,12),random.randf_range(.48,.83),random.randf_range(.8,1.5))
		figures.emerge(p,m.r,clock,random)
	elif not m.house.is_empty():
		_hurt_house(m.house,false)
	elif p.distance_squared_to(_xz(car.position))<18225 and not _near_scar(p,10):
		_fissure(p,random.randf()*TAU,random.randf_range(7,13),.52,.95)
	rubble.burst(m.end,m.house,m.r,random)
	figures.blast(p,radius)
	var d := _xz(car.position).distance_to(p)
	if d<radius:
		var away := Vector3(car.position.x-p.x,0,car.position.z-p.y).normalized()
		car.velocity += away*(1.0-d/radius)*8.0
		car.suspension_velocity += (1.0-d/radius)*2.1
	for person in walkers:
		if not is_instance_valid(person) or person.defeated:
			continue
		var offset: Vector2 = _xz(person.position)-p
		if offset.length()<radius:
			var dir := offset.normalized()
			person.impact(2.4,Vector3(dir.x,0,dir.y),false)
	for vehicle in traffic.get_children():
		if not vehicle.has_method("struck"):
			continue
		var offset: Vector2 = _xz(vehicle.position)-p
		if offset.length()<radius:
			if not struck_traffic.has(vehicle):
				struck_traffic[vehicle] = {"transform":vehicle.transform,"visual":vehicle.visual.transform,"going":vehicle.going,
					"coast":vehicle.coast,"physics":vehicle.is_physics_processing()}
			vehicle.struck(maxf(3,16*(1-offset.length()/radius)),Vector3(offset.x,0,offset.y))
	var wave := _mesh(damage_nodes,ring,"warning",Vector3(p.x,terrain.at(p.x,p.y)+.24,p.y),Vector3.ONE*.1)
	pulses.append({"t":0.0,"node":wave,"radius":radius})
	flash.position = m.end+Vector3.UP*2
	flash.light_energy = 6.5
	if m.house.is_empty():
		_fire(p,1.4 if m.r>0 else .74)
	else:
		var house: Dictionary = m.house
		_fire(p,1.8,float(house.cut))
	history_changed.emit()

func _crater(p: Vector2, radius: float, repaired: bool) -> void:
	var shape := preload("res://quick_scar.gd").new()
	var road := _nearest_road(p)
	if repaired:
		var outline := PackedVector2Array()
		for i in 23:
			outline.append(p+Vector2.from_angle(TAU*i/23)*radius)
		shape.repair(p,outline,terrain,"crater")
	else:
		var approach := (Vector2(road.p)-p).normalized() if not road.is_empty() else Vector2.RIGHT
		shape.crater(p,radius,approach,random,terrain)
	_install_scar(shape)

func _fissure(p: Vector2, angle: float, length: float, width: float, depth: float) -> void:
	if not _safe(p,length*.52):
		return
	var shape := preload("res://quick_scar.gd").new()
	shape.fissure(p,angle,length,width,depth,random,terrain)
	_install_scar(shape)

func _install_scar(shape: RefCounted) -> void:
	cut.add_scar(shape)
	var group := Node3D.new()
	damage_nodes.add_child(group)
	_mesh(group,shape.mesh(),"patch" if shape.repaired else "soil",Vector3.ZERO,Vector3.ONE)
	var item := {"p":shape.p,"r":shape.radius,"shape":shape,"node":group,"open":1.0 if shape.repaired else .015}
	scars.append(item)
	if not shape.repaired:
		opening_scars.append(item)
		_pose_scar(item)
	if scars.size()>MAX_SCARS:
		var retired: Dictionary = scars.pop_front()
		retired.node.queue_free()

func _pose_scar(item: Dictionary) -> void:
	var k := smoothstep(0.,1.,float(item.open))
	var center := Vector3(item.p.x,item.shape.center_y,item.p.y)
	item.shape.open_scale = k
	item.node.position = center*(1.-k)
	item.node.scale = Vector3.ONE*k

func _expand_scars(delta: float) -> void:
	if opening_scars.is_empty():
		return
	for i in range(opening_scars.size()-1,-1,-1):
		var item := opening_scars[i]
		item.open = minf(1.,item.open+delta/.65)
		_pose_scar(item)
		if item.open>=1:
			opening_scars.remove_at(i)
	atlas_step -= delta
	if atlas_step<=0 or opening_scars.is_empty():
		cut.dirty = true
		atlas_step = 1./12.

func _hurt_house(house: Dictionary, repaired: bool) -> void:
	for previous in damage_houses:
		if previous.house.id==house.id:
			return
	cut.add_house(house)
	var group := Node3D.new()
	damage_nodes.add_child(group)
	var poly: PackedVector2Array = house.outline
	var triangles := Geometry2D.triangulate_polygon(poly)
	var painter := SurfaceTool.new()
	painter.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in triangles:
		var pt := poly[index]
		painter.add_vertex(Vector3(pt.x,float(house.cut)+.02,pt.y))
	if not triangles.is_empty():
		painter.generate_normals()
		_mesh(group,painter.commit(),"concrete",Vector3.ZERO,Vector3.ONE)
	var members: Array[Transform3D] = []
	var chunks: Array[Transform3D] = []
	for i in poly.size():
		var a := poly[i-1]
		var b := poly[i]
		var edge := b-a
		if edge.length()<1: continue
		var dir := edge.normalized()
		var edge_yaw := -atan2(dir.y,dir.x)
		if repaired:
			var n := ceili(edge.length()/4.6)
			var facade_center: Vector2 = house.p
			var mid := (a+b)*.5
			var outward := (mid-facade_center).normalized()*.76
			for j in range(n+1):
				var where := a.lerp(b,float(j)/n)+outward
				var h := float(house.cut)-float(house.base)+4.2
				members.append(Transform3D(Basis().scaled(Vector3(.11,h,.11)),Vector3(where.x,float(house.base)+h*.5,where.y)))
			for level in range(1,ceili((float(house.cut)-float(house.base)+4)/2.8)):
				var y := float(house.base)+level*2.8
				members.append(Transform3D(Basis(Vector3.UP,edge_yaw)*Basis().scaled(Vector3(edge.length(),.12,.58)),Vector3(mid.x+outward.x,y,mid.y+outward.y)))
		else:
			var where := a.lerp(b,random.randf_range(.1,.9))
			var ground_y: float = terrain.at(where.x,where.y)
			var orientation := Basis.from_euler(Vector3(random.randf_range(-.5,.5),edge_yaw,random.randf_range(-.4,.4)))
			chunks.append(Transform3D(orientation.scaled_local(Vector3(2.8,.7,1.45)),Vector3(where.x,ground_y+.3,where.y)))
	if repaired:
		preload("res://quick_rebuilding.gd").new().build(self,group,house)
	_batch(group,members,"wood")
	_batch(group,chunks,"coal")
	damage_houses.append({"house":house,"node":group})
	if damage_houses.size()>MAX_HOUSES:
		var retired: Dictionary = damage_houses.pop_front()
		retired.node.queue_free()

func _batch(parent: Node3D, transforms: Array[Transform3D], paint: String) -> void:
	if transforms.is_empty(): return
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.mesh = box
	batch.instance_count = transforms.size()
	for i in transforms.size():
		batch.set_instance_transform(i,transforms[i])
	var node := MultiMeshInstance3D.new()
	node.multimesh = batch
	node.material_override = ink[paint]
	parent.add_child(node)

func _fire(p: Vector2, size_: float, fixed_y := INF) -> void:
	if not _protected_clear(p,8): return
	for current in fires:
		if p.distance_squared_to(current.p)<36: return
	var y := fixed_y if is_finite(fixed_y) else float(cut.at(p.x,p.y))
	var height := 9.0*size_
	var fire := _mesh(damage_nodes,flame,"",Vector3(p.x,y+.5*height,p.y),Vector3(5.6*size_,height,1))
	fires.append({"p":p,"y":y,"r":3.6*size_,"node":fire})
	if fires.size()>MAX_FIRES:
		var retired: Dictionary = fires.pop_front()
		retired.node.queue_free()

func _burn(delta: float) -> void:
	var hot := false
	for spot in fires:
		if absf(car.position.y-float(spot.y))<4 and _xz(car.position).distance_squared_to(spot.p)<float(spot.r)*float(spot.r):
			hot = true
			break
	exposed = exposed+delta if hot and not car.controls_locked else 0.0
	burned = 8.0 if exposed>.18 else maxf(0,burned-delta)
	if burned>0:
		if not is_instance_valid(car_flames):
			car_flames = _mesh(car,flame,"",Vector3(0,1.9,-1.1),Vector3(1.9,2.7,1))
		burn_tick += delta
		if burn_tick>=1.1:
			burn_tick -= 1.1
			if car.shield_time <= 0:
				car.hearts = maxf(0,car.hearts-.5)
				car.damage.set_hearts(car.hearts)
	else:
		burn_tick = 0.0
		if is_instance_valid(car_flames):
			car_flames.queue_free()
			car_flames = null

func _near_scar(p: Vector2, r: float) -> bool:
	for scar in scars:
		if p.distance_squared_to(scar.p)<r*r: return true
	return false

func _protected_clear(p: Vector2, extent: float) -> bool:
	if depot.distance_squared_to(p)<pow(extent+20,2): return false
	for location in protected_points:
		if p.distance_squared_to(location)<pow(extent+14,2): return false
	return true

func _safe(p: Vector2, extent: float) -> bool:
	if not _protected_clear(p,extent):
		return false
	if is_instance_valid(car.region_edge) and not Geometry2D.is_point_in_polygon(p,car.region_edge.polygon):
		return false
	for house in buildings:
		var bounds: Rect2 = house.bounds
		if bounds.grow(extent).has_point(p):
			return false
	return true

func _house_target() -> Dictionary:
	var best := {}
	var dist := INF
	var aim := _ahead(100,0)
	for house in buildings:
		if house.id==PROTECT_DEPOT or house.id==protected_id or float(house.height)<8:
			continue
		var p: Vector2 = house.p
		var sq := p.distance_squared_to(_xz(car.position))
		if sq<38*38 or sq>255*255 or not _protected_clear(p,8) or p.distance_squared_to(aim)>=dist: continue
		var unavailable := false
		for hit in damage_houses:
			if hit.house.id==house.id: unavailable=true; break
		for m in meteors:
			if m.house.get("id",-1)==house.id: unavailable=true; break
		if not unavailable:
			dist = p.distance_squared_to(aim)
			best = house
	return best

func _nearest_road(p: Vector2) -> Dictionary:
	var result := {"p":p,"side":Vector2.RIGHT,"width":7.0}
	var nearest := INF
	var cell := Vector2i((p/64.0).floor())
	for z in range(cell.y-1,cell.y+2):
		for x in range(cell.x-1,cell.x+2):
			for s: Dictionary in roads_by_cell.get(Vector2i(x,z),[]):
				var nearest_point := Geometry2D.get_closest_point_to_segment(p,s.a,s.b)
				if p.distance_squared_to(nearest_point)<nearest:
					nearest = p.distance_squared_to(nearest_point)
					var direction: Vector2 = s.b-s.a
					result = {"p":nearest_point,"side":direction.normalized().orthogonal(),"width":s.width}
	return result

func _ahead(distance: float, lateral: float) -> Vector2:
	var view := get_viewport().get_camera_3d()
	var forward := _xz(-car.global_basis.z if view==null else -view.global_basis.z).normalized()
	return _xz(car.global_position)+forward*distance+forward.orthogonal()*lateral

func _xz(p: Vector3) -> Vector2:
	return Vector2(p.x,p.z)

func _mesh(parent: Node3D, shape: Mesh, color: String, p: Vector3, s: Vector3) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	mesh.mesh = shape
	if not color.is_empty(): mesh.material_override = ink[color]
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mesh.position = p
	mesh.scale = s
	parent.add_child(mesh)
	return mesh
