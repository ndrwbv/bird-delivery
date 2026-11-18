extends Node3D

const UP := .5
const HEIGHT := 5.0
const HOLD := 3.0
const RECHARGE := 40.0
enum Phase { GROUND, ASCEND, HOLDING, DESCEND }
var car: CharacterBody3D
var wings := false
var gun := false
var phase := Phase.GROUND
var age := 0.0
var cooldown := 0.0
var lift_from := 0.0
var target_y := 0.0
var start_pressed := false
var scan := 0.0
var reload_time := 1.2
var ammo := 12
var missiles: Array[Dictionary] = []
var wing_mount := Node3D.new()
var head := Node3D.new()
var yaw := 0.0
var target: Node3D
var hud := CanvasLayer.new()
var label := Label.new()
var dark := StandardMaterial3D.new()
var exhaust := StandardMaterial3D.new()
var plume: Array[MeshInstance3D] = []
var shots_root: Node3D

func setup(vehicle: CharacterBody3D) -> void:
	car = vehicle
	shots_root = vehicle.get_parent()
	add_child(wing_mount)
	add_child(head)
	dark.albedo_color = Color("#50515a")
	dark.metallic = .6
	exhaust.albedo_color = Color("#f3904c")
	exhaust.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for x: float in [-.72,.72]:
		for z: float in [-1.1,1.12]:
			_part(wing_mount,Vector3(x,.34,z),Vector3(.19,.22,.24),dark)
			plume.append(_part(wing_mount,Vector3(x,.10,z),Vector3(.12,.34,.14),exhaust))
	head.position = Vector3(0,1.57,.32)
	_part(head,Vector3.ZERO,Vector3(.39,.22,.37),dark)
	_part(head,Vector3(0,.06,-.29),Vector3(.14,.16,.46),dark)
	add_child(hud)
	hud.layer = 3
	hud.add_child(label)
	label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	label.offset_left = -280
	label.offset_right = -14
	label.offset_top = 134
	label.offset_bottom = 196
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	label.add_theme_font_size_override("font_size",17)
	label.add_theme_color_override("font_outline_color",Color("#221c19"))
	label.add_theme_constant_override("outline_size",4)
	configure(false,false)

func _part(parent: Node3D, p: Vector3, size_: Vector3, material: Material) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size_
	mesh.mesh = shape
	mesh.material_override = material
	mesh.position = p
	parent.add_child(mesh)
	return mesh

func configure(flight: bool, weapon: bool) -> void:
	wings = flight
	gun = weapon
	wing_mount.visible = wings
	head.visible = gun
	hud.visible = wings or gun
	set_process_input(wings)
	if not wings:
		phase = Phase.GROUND
		car.airborne = false
	_update_ui()

func reset_drive(new_shift: bool) -> void:
	car.airborne = false
	phase = Phase.GROUND
	start_pressed = false
	for tracer in missiles:
		tracer.node.queue_free()
	missiles.clear()
	if new_shift:
		ammo = 12
		reload_time = 1.2
		cooldown = 0
		target = null
	_update_ui()

func _input(event: InputEvent) -> void:
	if not wings or not car.active_shift or car.controls_locked or car.sinking>=0: return
	var key: bool = event is InputEventKey and event.pressed and not event.echo and event.physical_keycode in [KEY_Z,KEY_J]
	var pad: bool = event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_X
	if key or pad:
		start_pressed = true
		get_viewport().set_input_as_handled()

func tick(delta: float, driving: bool) -> void:
	if not wings and not gun: return
	if cooldown>0:
		var previous := ceili(cooldown)
		cooldown = maxf(0,cooldown-delta)
		if ceili(cooldown)!=previous: _update_ui()
	if start_pressed:
		start_pressed = false
		if driving and phase==Phase.GROUND and cooldown<=0 and not car.airborne:
			var roof := _ray(car.position+Vector3.UP*.7,car.position+Vector3.UP*6.0)
			if roof.is_empty():
				phase = Phase.ASCEND
				age = 0
				lift_from = car.position.y
				target_y = lift_from+HEIGHT
				car.airborne = true
				_update_ui()
	if gun: _gun_tick(delta,driving)
	hud.visible = driving and (wings or gun)

func height_step(delta: float, support: float) -> bool:
	if phase==Phase.GROUND: return false
	age += delta
	var y := car.position.y
	match phase:
		Phase.ASCEND:
			y = lerpf(lift_from,maxf(target_y,support+2.5),smoothstep(0,UP,age))
			if age>=UP: phase=Phase.HOLDING; age=0
		Phase.HOLDING:
			y = lerpf(y,maxf(target_y,support+2.5),minf(1,6*delta))
			if age>=HOLD: phase=Phase.DESCEND; age=0
		Phase.DESCEND:
			# A ray also sees solid roofs above the sampled road surface.
			var roof := _ray(car.position+Vector3.UP*.12,Vector3(car.position.x,support+.2,car.position.z))
			if not roof.is_empty() and roof.position.y>support+.35:
				y = maxf(y,float(roof.position.y)+.25)
			elif car.surface.water_depth <= .15 or car.surface.frozen:
				y -= maxf(1.2,(y-support)*1.6)*delta
				if y<=support+.02:
					y=support+.035
					phase=Phase.GROUND
					car.airborne=false
					cooldown=RECHARGE
					_update_ui()
	car.position.y = maxf(y,support)
	car.suspension_velocity = 0
	return true

func _ray(from: Vector3, to: Vector3) -> Dictionary:
	var ray := PhysicsRayQueryParameters3D.create(from,to,1,[car.get_rid()])
	return car.get_world_3d().direct_space_state.intersect_ray(ray)

func _gun_tick(delta: float, driving: bool) -> void:
	reload_time = maxf(0,reload_time-delta)
	scan -= delta
	var barrel := head.global_position
	if scan<=0 and driving and ammo>0:
		scan = .25
		var best := 42.0
		target = null
		for rival: Node in get_tree().get_nodes_in_group(&"rival_car"):
			if not rival is Node3D or not rival.has_method(&"arcade_hit") or not rival.is_visible_in_tree(): continue
			var point: Vector3 = rival.global_position + Vector3.UP*.65
			var local: Vector3 = car.to_local(point)
			var distance := barrel.distance_to(point)
			if distance<14 or distance>=best or absf(atan2(local.x,-local.z))>1.95: continue
			if not _ray(barrel,point).is_empty(): continue
			best = distance
			target = rival
	if is_instance_valid(target) and driving and ammo>0:
		var local: Vector3 = car.to_local(target.global_position)
		var want := atan2(-local.x,-local.z)
		yaw = rotate_toward(yaw,want,5*delta)
		head.rotation.y = yaw
		if reload_time<=0 and absf(angle_difference(yaw,want))<.14:
			var aim: Vector3 = target.global_position
			var duration := clampf(barrel.distance_to(aim)/26,.55,1.7)
			if target is CharacterBody3D: aim += target.velocity*duration
			var bullet := _part(shots_root,barrel,Vector3.ONE*.22,exhaust)
			missiles.append({"node":bullet,"start":barrel,"end":aim,"target":target,"age":0.0,"duration":duration})
			ammo -= 1
			reload_time = 7
			_update_ui()
	for i in range(missiles.size()-1,-1,-1):
		var shot := missiles[i]
		shot.age += delta
		var t := minf(1, float(shot.age)/float(shot.duration))
		var end: Vector3 = shot.end
		var start: Vector3 = shot.start
		shot.node.position = start.lerp(end,t)+Vector3.UP*(4*t*(1-t)*(.8+start.distance_to(end)*.12))
		if t>=1:
			if is_instance_valid(shot.target) and end.distance_to(shot.target.global_position)<=3.2:
				shot.target.arcade_hit()
			shot.node.queue_free()
			missiles.remove_at(i)

func _update_ui() -> void:
	for stream in plume: stream.visible = phase!=Phase.GROUND
	var rows := PackedStringArray()
	if wings: rows.append(tr("в небе") if phase!=Phase.GROUND else (tr("заряд ракет")+" %d" % ceili(cooldown) if cooldown>0 else "Z / X · "+tr("полёт")))
	if gun: rows.append(tr("гранаты")+"   %d" % ammo)
	label.text = "\n".join(rows)
