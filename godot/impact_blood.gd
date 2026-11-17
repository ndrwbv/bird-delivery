extends Node3D

const MAX_DROPS := 128
const MAX_MARKS := 88

var ground: RefCounted
var drops := MultiMesh.new()
var marks := MultiMesh.new()
var particles: Array[Dictionary] = []
var trails: Array[Dictionary] = []
var marker := 0


func setup(terrain: RefCounted) -> void:
	ground = terrain
	var pigment := StandardMaterial3D.new()
	pigment.albedo_color = Color("#87151a")
	pigment.roughness = 0.74
	var drop := SphereMesh.new()
	drop.radius = 1.0
	drop.height = 2.0
	drop.radial_segments = 6
	drop.rings = 3
	drop.material = pigment
	var puddle := SurfaceTool.new()
	puddle.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rim := PackedVector3Array()
	for i in 19:
		var theta := TAU*float(i)/19.0
		var radius := 0.74+0.19*sin(3.0*theta)+0.10*cos(7.0*theta)
		rim.append(Vector3(cos(theta)*radius,0.0,sin(theta)*radius))
	for i in rim.size():
		for point in [Vector3.ZERO,rim[i],rim[(i+1)%rim.size()]]:
			puddle.set_normal(Vector3.UP)
			puddle.add_vertex(point)
	var pool := puddle.commit()
	var dark := pigment.duplicate() as StandardMaterial3D
	dark.albedo_color = Color("#631318")
	dark.cull_mode = BaseMaterial3D.CULL_DISABLED
	pool.surface_set_material(0,dark)
	_draw(drops,drop,MAX_DROPS)
	_draw(marks,pool,MAX_MARKS)
	set_process(false)


func burst(at: Vector3, direction: Vector3, strength: float, source: Node3D = null) -> void:
	var count := clampi(roundi(strength*2.2),9,39)
	for _i in count:
		var scatter := Vector3(randf_range(-0.71,0.71),randf_range(0.12,1.1),randf_range(-0.71,0.71))
		var velocity := (direction*0.55+scatter).normalized()*randf_range(1.9,6.0)
		_drop(at,velocity,randf_range(0.020,0.048))
	if is_instance_valid(source) and trails.size() < 8:
		trails.append({"body":source,"duration":clampf(strength*0.43,2.0,7.0),"delay":0.07,"ticks":0})
	set_process(true)


func _drop(at: Vector3, velocity: Vector3, radius: float) -> void:
	if particles.size() < MAX_DROPS:
		particles.append({"at":at,"v":velocity,"r":radius})


func _process(delta: float) -> void:
	for i in range(trails.size()-1,-1,-1):
		var flow := trails[i]
		if not is_instance_valid(flow.body) or flow.duration <= 0.0:
			trails.remove_at(i)
			continue
		flow.duration -= delta
		flow.delay -= delta
		if flow.delay <= 0.0:
			var body: Node3D = flow.body
			_drop(body.global_position+Vector3.UP*0.15,Vector3(randf_range(-0.35,0.35),0.1,randf_range(-0.35,0.35)),0.028)
			flow.ticks += 1
			if int(flow.ticks)%8 == 0:
				var at := body.global_position
				if at.y-ground.at(at.x,at.z) < 1.03:
					_mark(at,0.20+randf()*0.25)
			flow.delay = randf_range(0.10,0.22)
	for i in range(particles.size()-1,-1,-1):
		var drop := particles[i]
		drop.v.y -= 12.0*delta
		drop.at += drop.v*delta
		if drop.at.y <= ground.at(drop.at.x,drop.at.z):
			_mark(drop.at,float(drop.r)*randf_range(1.75,3.4))
			particles.remove_at(i)
	for i in particles.size():
		var drop := particles[i]
		drops.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*float(drop.r)),drop.at))
	drops.visible_instance_count = particles.size()
	set_process(not particles.is_empty() or not trails.is_empty())


func _mark(at: Vector3, diameter: float) -> void:
	var x: float = ground.at(at.x+0.4,at.z)-ground.at(at.x-0.4,at.z)
	var z: float = ground.at(at.x,at.z+0.4)-ground.at(at.x,at.z-0.4)
	var up := Vector3(-x/0.8,1.0,-z/0.8).normalized()
	var basis := Basis(Quaternion(Vector3.UP,up)).rotated(up,randf()*TAU)
	at.y = ground.at(at.x,at.z)+0.029+marker%5*0.001
	marks.set_instance_transform(marker,Transform3D(basis.scaled(Vector3.ONE*diameter),at))
	marker += 1
	marks.visible_instance_count = maxi(marks.visible_instance_count,marker)
	marker %= MAX_MARKS


func _draw(instances: MultiMesh, mesh: Mesh, count: int) -> void:
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = mesh
	instances.instance_count = count
	instances.visible_instance_count = 0
	var batch := MultiMeshInstance3D.new()
	batch.multimesh = instances
	batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(batch)
