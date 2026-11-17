extends Node3D

const PAINT := preload("res://car_paint.gdshader")
const GLASS := preload("res://car_glass.gdshader")
const PART := preload("res://car_part_debris.gd")
const PANE_NODES := ["winF","winB","winL","winR"]
const PANEL_NODES := ["Car_CarBody_0","Car_Details_0","Car_Details_Transparent_0"]
const WRECK_THRESHOLD := [0.30,0.85,1.50]

var body: Node3D
var floor: Node3D
var lamps: Node3D
var meshes: Array[MeshInstance3D] = []
var materials: Array[ShaderMaterial] = []
var panes: Array[ShaderMaterial] = []
var profiles: Array
var score := PackedFloat32Array()
var wanted := PackedInt32Array()
var stage := PackedInt32Array()
var pane_hits := PackedInt32Array([0,0,0,0])
var pane_drawn := PackedInt32Array([0,0,0,0])
var bumper_backing: Dictionary = {}
var hinges := PackedVector4Array()
var poses := PackedVector4Array()
var dent_points := PackedVector4Array()
var dent_forces := PackedVector4Array()
var blood_marks := PackedVector4Array()
var soot := PackedVector4Array()
var spatter_count := 0
var spatter_next := 0
var detached := 0
var hp := 7.0
var last_hit := Vector3.ZERO
var last_normal := Vector3.ZERO
var last_speed := 0.0
var time_to_dent := 0.0
var loose := false
var trunk_open := 0.0:
	set(value):
		if not is_equal_approx(trunk_open,value):
			trunk_open = value
			_update_access()
var driver_door_open := 0.0:
	set(value):
		if not is_equal_approx(driver_door_open,value):
			driver_door_open = value
			_update_access()
var spring_position := PackedFloat32Array()
var spring_velocity := PackedFloat32Array()
var previous_position := Vector3.ZERO
var previous_velocity := Vector3.ZERO
var previous_heading := 0.0
var previous_turn := 0.0
var motion_known := false
var smoke: CPUParticles3D


func setup(model: Node3D) -> void:
	body = model
	profiles = JSON.parse_string(FileAccess.get_file_as_string("res://assets/car-parts.json"))
	for name in PANEL_NODES:
		_configure_mesh(model.get_node(name),name.ends_with("Transparent_0"),-1)
	for i in PANE_NODES.size():
		_configure_mesh(model.get_node(PANE_NODES[i]),true,i)
	var size := profiles.size()+1
	score.resize(size)
	wanted.resize(size)
	stage.resize(size)
	hinges.resize(size)
	poses.resize(size)
	spring_position.resize(size)
	spring_velocity.resize(size)
	for i in profiles.size():
		var pivot := _vector(profiles[i].hinge)
		hinges[i+1] = Vector4(pivot.x,pivot.y,pivot.z,0)
	dent_points.resize(8)
	dent_forces.resize(8)
	blood_marks.resize(12)
	soot.resize(2)
	_refresh()
	set_process(false)


func _configure_mesh(mesh: MeshInstance3D, glass: bool, pane: int) -> void:
	var src := mesh.mesh.surface_get_material(0) as StandardMaterial3D
	var shader := ShaderMaterial.new()
	shader.shader = GLASS if glass else PAINT
	if glass:
		shader.set_shader_parameter(&"surface_texture",src.albedo_texture)
		shader.set_shader_parameter(&"tint",src.albedo_color)
		shader.set_shader_parameter(&"pane",pane)
		if pane >= 0:
			panes.append(shader)
	else:
		shader.set_shader_parameter(&"body_texture",src.albedo_texture)
		shader.set_shader_parameter(&"enamel",src.albedo_color)
		shader.set_shader_parameter(&"body_panel",mesh.name == &"Car_CarBody_0")
	mesh.material_override = shader
	meshes.append(mesh)
	materials.append(shader)


func repair() -> void:
	score.fill(0.0)
	wanted.fill(0)
	stage.fill(0)
	poses.fill(Vector4.ZERO)
	pane_hits.fill(0)
	pane_drawn.fill(0)
	for backing: MeshInstance3D in bumper_backing.values():
		backing.queue_free()
	bumper_backing.clear()
	dent_points.fill(Vector4.ZERO)
	dent_forces.fill(Vector4.ZERO)
	blood_marks.fill(Vector4.ZERO)
	soot.fill(Vector4.ZERO)
	detached = 0
	spatter_count = 0
	spatter_next = 0
	loose = false
	motion_known = false
	spring_position.fill(0.0)
	spring_velocity.fill(0.0)
	set_hearts(7.0)
	_refresh()


func impact(contact: Vector3, normal: Vector3, strength: float) -> void:
	if strength <= 4.0 or time_to_dent > 0.0:
		return
	time_to_dent = 0.12
	set_process(true)
	last_hit = body.to_local(contact)
	last_speed = strength
	last_normal = normal
	var power := clampf((strength-4.0)/18.0,0.0,1.0)
	var end := absf(last_hit.z)/2.50 >= absf(last_hit.x)/1.07
	var rear := end and last_hit.z > 0.0
	_dent(last_hit,power,end)
	if not rear:
		_dent(Vector3(last_hit.x*0.43,0.60,2.50),power*0.55,true)
	for i in profiles.size():
		var p: Dictionary = profiles[i]
		var id := i+1
		var at := _vector(p.at)
		var distance := Vector2(at.x-last_hit.x,at.z-last_hit.z).length()
		var near := 1.0-clampf((distance-0.9)/1.5,0.0,1.0)
		var add := power*near*(1.5 if p.rear and rear else 1.0)
		if p.rear and not rear:
			add = maxf(add,power*0.35)
		score[id] += add
		var next := 0
		for edge in WRECK_THRESHOLD.size():
			if score[id] >= WRECK_THRESHOLD[edge]:
				next = edge+1
		if near >= 0.70 and strength >= 24.0:
			next = 3
		if p.kind == "bumper" and end and at.z*last_hit.z > 0.0:
			next = maxi(next,3 if strength >= 22.0 else 2 if strength >= 17.0 else 0)
		if p.kind == "lamp":
			if near >= 0.70:
				next = maxi(next,2 if strength >= 16.0 else 1 if strength >= 8.0 else 0)
			next = mini(next,2)
		wanted[id] = maxi(wanted[id],next)
	var glass_term := 3 if strength >= 22.0 else 2 if strength >= 15.0 else 1 if strength >= 9.0 else 0
	if glass_term > 0:
		var pane := (1 if rear else 0) if end else (2 if last_hit.x < 0.0 else 3)
		pane_hits[pane] = mini(3,pane_hits[pane]+glass_term)
	_sync()
	_refresh()


func _dent(contact: Vector3, power: float, end: bool) -> void:
	var sign := signf(contact.z if end else contact.x)
	var center := Vector3(clampf(contact.x,-1.07,1.07),0.72,clampf(contact.z,-2.50,2.50))
	if end: center.z = sign*2.50
	else: center.x = sign*1.07
	var direction := Vector3(0.0,0.0,-sign) if end else Vector3(-sign,0.0,0.0)
	var slot := 0
	for i in dent_points.size():
		var current := dent_points[i]
		if current.w > 0.0 and center.distance_to(Vector3(current.x,current.y,current.z)) < 0.45:
			slot = i
			break
		if dent_forces[i].w < dent_forces[slot].w:
			slot = i
	dent_points[slot] = Vector4(center.x,center.y,center.z,0.45+0.60*power)
	dent_forces[slot] = Vector4(direction.x,0.0,direction.z,minf(0.5,dent_forces[slot].w+0.30*power))


func stain(at: Vector3, speed: float) -> void:
	var hit := body.to_local(at)
	hit.x = clampf(hit.x,-1.07,1.07)
	hit.y = clampf(hit.y,0.42,1.26)
	hit.z = clampf(hit.z,-2.45,2.35)
	var front := hit.z < -1.45
	for i in clampi(roundi(speed*0.56),3,11):
		var point := hit+Vector3(randf_range(-0.40,0.40),randf_range(-0.08,0.4),randf_range(-0.34,0.34))
		if front and i%4 == 0:
			point = Vector3(hit.x*0.75+randf_range(-0.3,0.3),randf_range(1.14,1.43),randf_range(-0.97,-0.67))
		blood_marks[spatter_next] = Vector4(point.x,point.y,point.z,randf_range(0.12,0.37))
		spatter_next = (spatter_next+1)%blood_marks.size()
		spatter_count = mini(spatter_count+1,blood_marks.size())
	_refresh()


func set_hearts(hearts: float) -> void:
	hp = hearts
	_sync()
	_refresh()
	if hp > 3.0 and not is_instance_valid(smoke):
		return
	if not is_instance_valid(smoke):
		smoke = _make_smoke()
		add_child(smoke)
		smoke.position = Vector3(0.0,0.96,-1.70)
	smoke.emitting = hp <= 3.0
	smoke.speed_scale = clampf(1.45-hp*0.22,0.70,1.45)


func _sync() -> void:
	var lost := (7.0-hp)/7.0
	var cap := 3 if lost >= 0.5 or hp <= 1.0 else 2 if lost >= 1.0/3.0 else 1
	var max_off := 2 if lost >= 0.75 or hp <= 1.0 else 1 if lost >= 0.5 else 0
	var order := range(1,stage.size())
	order.sort_custom(func(a:int,b:int): return score[a]>score[b])
	for id: int in order:
		var next := mini(wanted[id],cap)
		if next == 3 and detached >= max_off:
			next = 2
		if next <= stage[id]:
			continue
		stage[id] = next
		if next == 3:
			var p: Dictionary = profiles[id-1]
			var at := _vector(p.at)
			soot[detached] = Vector4(at.x,at.y,at.z,0.68)
			detached += 1
			_throw_part(id)
			if id in [7,8]:
				_bumper_shell(id)
		elif id >= 9 and next == 2:
			var at := _vector(profiles[id-1].at)
			_chips(body.to_global(at),Color("#ffeeba") if id < 11 else Color("#b22a2b"),10)
		elif next == 2 and id <= 8:
			loose = true
			set_process(true)
	for pane in panes.size():
		var next := mini(pane_hits[pane],2 if cap == 1 else 3)
		if next == 3 and pane_drawn[pane] < 3:
			var locations := [Vector3(0.0,1.27,-0.83),Vector3(0.0,1.32,1.38),Vector3(-0.82,1.28,0.03),Vector3(0.82,1.28,0.03)]
			_chips(body.to_global(locations[pane]),Color("#a7cbdd"),14)
		pane_drawn[pane] = next
		panes[pane].set_shader_parameter(&"crack",next)
	if is_instance_valid(lamps):
		lamps.damage_levels = PackedInt32Array([stage[9],stage[10],stage[11],stage[12]])
	_update_section_pose()


func _process(delta: float) -> void:
	time_to_dent = maxf(0.0,time_to_dent-delta)
	set_process(time_to_dent > 0.0)


func bounce_parts(position: Vector3, heading: float, delta: float) -> void:
	if not loose:
		return
	if not motion_known:
		motion_known = true
		previous_position = position
		previous_heading = heading
		return
	var velocity := (position-previous_position)/delta
	var turn := angle_difference(previous_heading,heading)/delta
	var valid := Vector2(velocity.x,velocity.z).length() < 80.0
	var acceleration := (velocity-previous_velocity)/delta if valid else Vector3.ZERO
	var angular := (turn-previous_turn)/delta if valid else 0.0
	previous_position = position
	previous_velocity = velocity if valid else Vector3.ZERO
	previous_heading = heading
	previous_turn = turn if valid else 0.0
	var axes := Basis(Vector3.UP,heading)
	var forward := acceleration.dot(-axes.z)
	var sideways := acceleration.dot(axes.x)
	for id in range(1,9):
		if stage[id] != 2:
			continue
		var kind: String = profiles[id-1].kind
		var cap := 0.035
		var push := randf_range(-0.5,0.5)*velocity.length()*0.04+acceleration.y*0.012
		match kind:
			"hood":
				cap = 0.07
				push += forward*0.05
			"trunk":
				cap = 0.09
				push -= forward*0.05
			"door":
				cap = 0.20
				push += (sideways*0.05+angular*0.025)*signf(hinges[id].x)
		spring_velocity[id] += (55.0*push-55.0*spring_position[id]-3.5*spring_velocity[id])*delta
		spring_position[id] += spring_velocity[id]*delta
		var bounded := clampf(spring_position[id],-cap*0.6,cap)
		if bounded != spring_position[id]:
			spring_velocity[id] *= -0.3
			spring_position[id] = bounded
	_update_section_pose()
	for material in materials:
		material.set_shader_parameter(&"section_pose",poses)


func _update_access() -> void:
	var angles := Vector2(-trunk_open*1.08,-driver_door_open*0.87)
	for material in materials:
		material.set_shader_parameter(&"access_open",angles)


func _update_section_pose() -> void:
	for id in range(1,stage.size()):
		var step := stage[id]
		var bounce := spring_position[id] if step == 2 else 0.0
		var wobble := 0.0
		var rotation := Vector3.ZERO
		match profiles[id-1].kind:
			"hood","trunk":
				wobble = (0.044 if step == 1 else 0.117+bounce)
				rotation = Vector3(wobble*(1.0 if id == 2 else -1.0),0.0,0.035)
			"door":
				wobble = (0.045 if step == 1 else 0.24+bounce)
				rotation = Vector3(-0.035,wobble*signf(hinges[id].x),0.0)
			"bumper":
				rotation.z = (0.04 if step == 1 else 0.1+bounce)*signf(last_hit.x+0.02)
		poses[id] = Vector4(rotation.x,rotation.y,rotation.z,float(step))


func _refresh() -> void:
	for material in materials:
		material.set_shader_parameter(&"dent_points",dent_points)
		material.set_shader_parameter(&"dent_forces",dent_forces)
		material.set_shader_parameter(&"section_pose",poses)
		material.set_shader_parameter(&"section_hinge",hinges)
		material.set_shader_parameter(&"blood_marks",blood_marks)
		material.set_shader_parameter(&"blood_count",spatter_count)
		material.set_shader_parameter(&"soot_marks",soot)
		material.set_shader_parameter(&"soot_count",detached)


func _throw_part(id: int) -> void:
	if not is_instance_valid(floor):
		return
	var model := ArrayMesh.new()
	var hull := PackedVector3Array()
	for source in meshes:
		var src := source.mesh.surface_get_arrays(0)
		if src[Mesh.ARRAY_TEX_UV2] == null:
			continue
		var tags: PackedVector2Array = src[Mesh.ARRAY_TEX_UV2]
		var vertices: PackedVector3Array = src[Mesh.ARRAY_VERTEX]
		var uv: PackedVector2Array = src[Mesh.ARRAY_TEX_UV]
		var indices: PackedInt32Array = src[Mesh.ARRAY_INDEX]
		var normals: PackedVector3Array = src[Mesh.ARRAY_NORMAL]
		var p := PackedVector3Array()
		var n := PackedVector3Array()
		var u := PackedVector2Array()
		for index in indices:
			if int(tags[index].x*16.0) != id:
				continue
			p.append(vertices[index])
			n.append(normals[index])
			u.append(uv[index])
		if p.is_empty():
			continue
		var array := []
		array.resize(Mesh.ARRAY_MAX)
		array[Mesh.ARRAY_VERTEX] = p
		array[Mesh.ARRAY_NORMAL] = n
		array[Mesh.ARRAY_TEX_UV] = u
		model.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,array)
		model.surface_set_material(model.get_surface_count()-1,source.mesh.surface_get_material(0))
		hull.append_array(p)
	if hull.size() < 4:
		return
	floor.cover(body.global_position,13.0)
	var piece := PART.new()
	floor.get_parent().add_child(piece)
	piece.configure(model,body.global_transform,hull,-last_normal*last_speed*0.26+Vector3.UP*1.65)
	piece.add_to_group("DetachedCarPanel")



func _bumper_shell(id: int) -> void:
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color("#343434")
	metal.roughness = 0.89
	var box := BoxMesh.new()
	box.size = Vector3(1.62,0.14,0.055)
	box.material = metal
	var backing := MeshInstance3D.new()
	backing.mesh = box
	backing.position = Vector3(0.0,0.53,-2.15 if id == 7 else 2.31)
	body.add_child(backing)
	bumper_backing[id] = backing


func _chips(at: Vector3, tint: Color, amount: int) -> void:
	if not is_instance_valid(floor):
		return
	var shards := CPUParticles3D.new()
	shards.emitting = false
	shards.one_shot = true
	shards.explosiveness = 1.0
	shards.amount = amount
	shards.lifetime = 0.67
	shards.spread = 72.0
	shards.direction = (last_normal+Vector3.UP*0.85).normalized()
	shards.initial_velocity_min = 1.0
	shards.initial_velocity_max = 5.0
	shards.gravity = Vector3(0.0,-10.0,0.0)
	shards.angle_min = -170.0
	shards.angle_max = 170.0
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.05,0.063,0.021)
	var paint := StandardMaterial3D.new()
	paint.albedo_color = tint
	paint.roughness = 0.46
	mesh.material = paint
	shards.mesh = mesh
	floor.get_parent().add_child(shards)
	shards.global_position = at
	shards.finished.connect(shards.queue_free)
	shards.emitting = true


func _vector(values: Array) -> Vector3:
	return Vector3(values[0],values[1],values[2])


func _make_smoke() -> CPUParticles3D:
	var clouds := CPUParticles3D.new()
	clouds.emitting = false
	clouds.amount = 23
	clouds.lifetime = 1.45
	clouds.direction = Vector3(0.08,1.0,0.25)
	clouds.spread = 27.0
	clouds.initial_velocity_min = 0.76
	clouds.initial_velocity_max = 1.85
	clouds.gravity = Vector3(0.0,0.57,0.0)
	clouds.scale_amount_min = 0.59
	clouds.scale_amount_max = 1.65
	var fade := Gradient.new()
	fade.set_color(0,Color(0.33,0.31,0.29,0.66))
	fade.set_color(1,Color(0.17,0.165,0.16,0.0))
	clouds.color_ramp = fade
	var puff := SphereMesh.new()
	puff.radius = 0.21
	puff.height = 0.42
	puff.radial_segments = 7
	puff.rings = 4
	var ash := StandardMaterial3D.new()
	ash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ash.vertex_color_use_as_albedo = true
	puff.material = ash
	clouds.mesh = puff
	return clouds
