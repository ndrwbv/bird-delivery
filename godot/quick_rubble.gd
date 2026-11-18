extends RefCounted

const MAX_BATCHES := 13
var groups: Array[Dictionary] = []
var root: Node3D
var ground: RefCounted
var car: CharacterBody3D
var paint := StandardMaterial3D.new()
var block := BoxMesh.new()

func setup(parent: Node3D, floor_source: RefCounted, vehicle: CharacterBody3D) -> void:
	root = parent
	ground = floor_source
	car = vehicle
	paint.vertex_color_use_as_albedo = true
	paint.roughness = 1.0

func burst(origin: Vector3, house: Dictionary, crater: float, rng: RandomNumberGenerator) -> void:
	if groups.size() >= MAX_BATCHES:
		_drop(0)
	var big := not house.is_empty() or crater>0
	var count := 46 if not house.is_empty() else (28 if big else 12)
	var group := Node3D.new()
	root.add_child(group)
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.use_colors = true
	batch.mesh = block
	batch.instance_count = count
	var image := MultiMeshInstance3D.new()
	image.multimesh = batch
	image.material_override = paint
	image.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	group.add_child(image)
	var pieces: Array[Dictionary] = []
	for i in count:
		var extent := rng.randf_range(.18,2.2 if big else .81)
		var scale := Vector3(1,.57,1.15)*extent
		if not house.is_empty():
			scale = [Vector3(1,.57,1.15),Vector3(1,.18,1.15),Vector3(.22,.22,1.7),Vector3(.55,.32,.4)][i%4]*extent
		var pos := origin
		if not house.is_empty():
			var poly: PackedVector2Array = house.outline
			var edge := rng.randi_range(0,poly.size()-1)
			var p := poly[edge-1].lerp(poly[edge],rng.randf())
			pos = Vector3(p.x,rng.randf_range(house.cut,house.base+house.height),p.y)
		var velocity := Vector3(rng.randf_range(-13,13),rng.randf_range(1 if big else 5,12 if big else 16),rng.randf_range(-13,13))
		var piece := {"p":pos,"v":velocity,"s":scale,"angle":rng.randf()*TAU,"spin":rng.randf_range(-7,7),
			"body":null,"sleep":false,"solid":maxf(scale.x,scale.z)*.9>=1.13,"kick":0.0}
		pieces.append(piece)
		batch.set_instance_color(i,[Color("#887168"),Color("#a69991"),Color("#514943"),Color("#885547")][i%4])
		batch.set_instance_transform(i,Transform3D(Basis().scaled(scale),pos))
	groups.append({"node":group,"mesh":batch,"pieces":pieces,"age":0.0,"origin":origin})

func tick(delta: float, protected: Array[Vector2]) -> void:
	for n in range(groups.size()-1,-1,-1):
		var g := groups[n]
		g.age += delta
		var range_sq := car.position.distance_squared_to(g.origin)
		if range_sq>185*185 or (g.age>28 and range_sq>24*24):
			_drop(n)
			continue
		for i in g.pieces.size():
			var q: Dictionary = g.pieces[i]
			q.kick = maxf(0,float(q.kick)-delta)
			var p: Vector3 = q.p
			var extent: Vector3 = q.s
			var separation := p-car.position
			if not q.solid and q.kick<=0 and absf(separation.y)<1.25 and car.velocity.length_squared()>1.21:
				var local := car.global_basis.transposed()*separation
				if absf(local.x)<.95+extent.x*.5 and absf(local.z)<2.05+extent.z*.5:
					var kick := clampf(car.velocity.length()*.27,1.4,8)
					q.v = car.velocity.normalized()*kick+Vector3.UP*(1.2+kick*.32)
					q.sleep = false
					q.kick = .45
			if q.sleep:
				continue
			var v: Vector3 = q.v
			p += v*delta
			v.y -= 16*delta
			q.angle += float(q.spin)*delta
			var floor_y := float(ground.at(p.x,p.z))+extent.y*.5
			if p.y<=floor_y and v.y<=0:
				p.y = floor_y
				if absf(v.y)>.9:
					v = Vector3(v.x*.46,-v.y*.25,v.z*.46)
				else:
					v = Vector3.ZERO
					q.sleep = true
				if q.sleep and q.solid:
					var clear := true
					for loc in protected:
						if loc.distance_squared_to(Vector2(p.x,p.z))<12*12: clear = false; break
					if clear:
						var body := StaticBody3D.new()
						body.collision_layer = 1
						body.collision_mask = 0
						var shape := BoxShape3D.new()
						shape.size = extent
						var collision := CollisionShape3D.new()
						collision.shape = shape
						body.add_child(collision)
						body.position = p
						body.rotation.y = float(q.angle)
						g.node.add_child(body)
						q.body = body
			q.p = p
			q.v = v
			g.mesh.set_instance_transform(i,Transform3D(Basis(Vector3.UP,float(q.angle))*Basis().scaled(extent),p))

func clear_doors(points: Array[Vector2]) -> void:
	for g in groups:
		for q: Dictionary in g.pieces:
			if not is_instance_valid(q.body): continue
			for p in points:
				if p.distance_squared_to(Vector2(q.p.x,q.p.z))<144.0:
					q.body.queue_free()
					q.body = null
					break

func _drop(index: int) -> void:
	var group := groups[index]
	group.node.queue_free()
	groups.remove_at(index)

func clear() -> void:
	groups.clear()
