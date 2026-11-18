extends Camera3D

const VIEWS := ["high","near","cab"]
const PREFS := "user://drive_camera.cfg"
var mode := "near"
var input_blocked: Callable
var glance := preload("res://drive_look.gd").new()
var cockpit: Node3D
var filtered_eye := INF
var temporary := false
var eye_time := 0.0
var eye_pitch := 0.0
var impact_time := .45
var impact_strength := 0.0
var impact_direction := Vector3.ZERO

@onready var car: CharacterBody3D = $"../Car"

var heading := 0.0
var aim := Vector3.ZERO
var tether := Vector3.ZERO
var arm := 1.0
var lift := 0.0
var parked_position := Vector3.ZERO
var parked_target := Vector3.ZERO
var parked_heading := 0.0
var parked_distance := 9.5
var show_parked := 1.0
var drove := false
var person: Node3D
var dispatch_view := false
var dispatch_heading := 0.0
var exchange_target: Node3D
var exchange_zoom := 0.0
var query := PhysicsRayQueryParameters3D.new()


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		temporary = temporary or arg in ["--test-profile","--benchmark"] or arg.begins_with("--capture-")
	if not temporary:
		var config := ConfigFile.new()
		if config.load(PREFS)==OK:
			var stored := str(config.get_value("camera","view","near"))
			if stored in VIEWS:
				mode = stored
	get_window().focus_exited.connect(glance.reset)

func set_mode(id: String, save := true) -> void:
	if id not in VIEWS:
		return
	mode = id
	glance.reset()
	filtered_eye = INF
	if cockpit:
		cockpit.hide()
	if save and not temporary:
		var config := ConfigFile.new()
		config.set_value("camera","view",mode)
		config.save(PREFS)

func _unhandled_input(event: InputEvent) -> void:
	if not current or person or not car.active_shift or car.controls_locked or (input_blocked.is_valid() and input_blocked.call()):
		return
	var toggle: bool = (event is InputEventKey and event.pressed and not event.echo and event.physical_keycode==KEY_V) or (event is InputEventJoypadButton and event.pressed and event.button_index==JOY_BUTTON_BACK)
	if toggle:
		set_mode(VIEWS[(VIEWS.find(mode)+1)%3])
		drove = true
		show_parked = 0.0
		get_viewport().set_input_as_handled()
	elif glance.event(event):
		get_viewport().set_input_as_handled()

func _cab(delta: float, pose: Transform3D, pace: float) -> void:
	if not cockpit:
		cockpit = preload("res://drive_cockpit.gd").new()
		car.visual.add_child(cockpit)
	cockpit.show()
	cockpit.step(delta,car)
	var body: Transform3D = car.visual.get_global_transform_interpolated()
	var head := Vector3(-.42,1.44,.07)
	var yaw := glance.angles.x
	head.x -= car.steer_visual/.42*pace*.05
	if yaw<0:
		head.x += smoothstep(1.2,2.4,-yaw)*.24-.09*sin(yaw)
	head.z -= (cos(yaw)-1)*.09
	var eye: Vector3 = body*head
	if is_inf(filtered_eye):
		filtered_eye = eye.y
	eye_time += delta
	filtered_eye = lerpf(filtered_eye,eye.y,1.0-exp(-16.0*delta))
	eye.y += clampf((filtered_eye-eye.y)*.35,-.06,.06)+pace*(sin(eye_time*13.7)*.0025+sin(eye_time*7.1)*.0018)
	position = eye
	var ahead := -pose.basis.z.rotated(Vector3.UP,yaw)
	eye_pitch = lerpf(eye_pitch,car.visual.rotation.x,1.0-exp(-4.0*delta))
	var pitch := eye_pitch+.02+glance.angles.y-pow(sin(minf(absf(yaw),PI*.5)),2.0)*.10
	ahead = Vector3(ahead.x,0,ahead.z).normalized()*cos(pitch)+Vector3.UP*sin(pitch)
	look_at(eye+ahead)
	_drive_fov(lerpf(66.0,72.0,pace),delta)
	_impact_motion(delta)
	near = .045


func kick(speed: float, direction: Vector3) -> void:
	if person:
		return
	var strength := pow(clampf((speed-6.0)/20.0,0.0,1.0),.8)
	var u := impact_time/.055
	var current_strength := impact_strength*u*exp(1.0-u) if impact_time<.45 else 0.0
	if strength<=current_strength:
		return
	impact_time = 0.0
	impact_direction = Vector3(direction.x,0,direction.z).normalized()
	impact_strength = strength

func _impact_motion(delta: float) -> void:
	if impact_time>=.45:
		return
	impact_time += delta
	if impact_time>=.45:
		return
	var t := impact_time/.055
	var k := impact_strength*t*exp(1.0-t)
	var distance := .09 if mode=="cab" else (.45 if mode=="near" else .70)
	position += impact_direction*distance*k
	rotate_object_local(Vector3.RIGHT,-k*(.014 if mode=="cab" else .03))

func _drive_fov(base: float, delta: float) -> void:
	var target := minf(86.0,base+(16.0 if car.boost_active else 0.0))
	fov = lerpf(fov,target,1.0-exp(-3.5*delta))

func set_parked_view(at: Vector3, target: Vector3) -> void:
	parked_position = at
	parked_target = target


func reset_view() -> void:
	impact_time = .45
	person = null
	dispatch_view = false
	exchange_target = null
	glance.reset()
	filtered_eye = INF
	if cockpit:
		cockpit.hide()
	near = .22
	tether = car.position
	var offset := parked_position - car.position
	parked_heading = atan2(offset.x,offset.z)
	parked_distance = Vector2(offset.x, offset.z).length()
	heading = parked_heading
	arm = 1.0
	lift = 0.0
	show_parked = 1.0
	drove = false
	position = parked_position
	aim = parked_target
	look_at(aim)


func follow_person(who: Node3D) -> void:
	if cockpit:
		cockpit.hide()
	glance.reset()
	near = .22
	dispatch_view = false
	exchange_target = null
	person = who
	drove = true
	show_parked = 0.0


func follow_dispatch(who: Node3D) -> void:
	follow_person(who)
	tether = who.position
	dispatch_view = true
	dispatch_heading = 1.41
	heading = dispatch_heading
	var around := Vector3(sin(heading)*4.0,2.3,cos(heading)*4.0)
	position = who.position + around
	aim = who.position + Vector3.UP*1.23
	look_at(aim)


func frame_trunk() -> void:
	dispatch_heading = -0.20


func focus_exchange(who: Node3D) -> void:
	exchange_target = who


func _process(delta: float) -> void:
	var target: Node3D = person if is_instance_valid(person) else car
	var on_foot := target != car
	var pose := target.get_global_transform_interpolated()
	var speed := absf(car.speed)
	var pace := clampf(speed/maxf(1.0,car.tuned_speed),0.0,1.0)
	glance.step(delta,mode=="cab",not on_foot and not car.controls_locked and (not input_blocked.is_valid() or not input_blocked.call()))
	drove = drove or speed > 0.7
	if not drove:
		return
	if mode=="cab" and not on_foot:
		_cab(delta,pose,pace)
		return
	if cockpit and cockpit.visible:
		cockpit.hide()
	near = .22
	show_parked = move_toward(show_parked, 0.0, delta*1.2)
	var opening := smoothstep(0.0,1.0,show_parked)
	var back := -pose.basis.z if on_foot else pose.basis.z
	var target_heading := atan2(back.x, back.z)
	var exchanging := on_foot and is_instance_valid(exchange_target)
	exchange_zoom = move_toward(exchange_zoom,1.0 if exchanging else 0.0,delta*(4.2 if exchanging else 2.9))
	var close_up := smoothstep(0.0,1.0,exchange_zoom)
	if on_foot:
		target_heading = dispatch_heading if dispatch_view else target_heading+close_up*0.73
	elif speed > 4.0 and car.speed > 0.0:
		var travel: Vector3 = car.velocity
		var travel_heading := atan2(-travel.x,-travel.z)
		target_heading = lerp_angle(target_heading, travel_heading, 0.21)
	target_heading = lerp_angle(target_heading,parked_heading,opening)
	var difference := angle_difference(heading,target_heading)
	if on_foot:
		var turn_rate := 4.5 if not dispatch_view else 2.1
		heading += clampf(difference*(1.0-exp(-6.0*delta)),-turn_rate*delta,turn_rate*delta)
	else:
		heading += difference*(1.0-exp(-(3.2 if mode=="near" else 4.5)*delta))
	var orbit := heading + (0.0 if on_foot else glance.angles.x)

	var horizontal := lerpf(6.6,9.2,pace) if mode=="near" else lerpf(12.5,17.0,pace)
	var rise := 3.4-glance.angles.y*6 if mode=="near" else 6.2-glance.angles.y*10
	if on_foot:
		horizontal = 4.0 if dispatch_view else lerpf(6.4,2.85,close_up)
		rise = 2.3 if dispatch_view else lerpf(3.15,1.66,close_up)
	if dispatch_view and dispatch_heading < 0.0:
		horizontal = 4.9
		rise = 2.6
	horizontal = lerpf(horizontal,parked_distance,opening)
	rise = lerpf(rise,parked_position.y-car.position.y,opening)
	tether = tether.lerp(pose.origin,1.0-exp(-(20.0 if mode=="near" and not on_foot else 9.0)*delta))
	tether = pose.origin + (tether-pose.origin).limit_length(1.15)
	var offset := Vector3(sin(orbit)*horizontal,rise,cos(orbit)*horizontal)
	var pivot := tether + Vector3.UP * (1.15 if on_foot else 1.35)
	var desired := tether + offset
	desired.y = maxf(desired.y, car.terrain.at(desired.x,desired.z)+0.85)
	var safe := _arm(pivot,desired)
	var lift_target := 0.0
	if safe < 0.70 and _arm(pivot,desired+Vector3.UP*1.65) > safe+0.12:
		lift_target = 1.65
	lift = lerpf(lift,lift_target,1.0-exp(-5.5*delta))
	if lift > 0.015:
		desired.y += lift
		safe = _arm(pivot,desired)
	var rate := 13.0 if safe < arm else 3.6
	arm = lerpf(arm,safe,1.0-exp(-rate*delta))
	var allowed := minf(arm,safe+0.06)
	position = pivot.lerp(desired,allowed)

	var down_road := -Vector3(sin(orbit),0.0,cos(orbit))
	var look := tether + Vector3.UP*(1.23 if on_foot else 0.95)
	if dispatch_view and dispatch_heading < 0.0:
		look = look.lerp(car.position+Vector3.UP*1.15,0.36)
	if exchanging:
		look = look.lerp(exchange_target.position+Vector3.UP*1.18,close_up*0.47)
	elif not on_foot:
		look += down_road*(9.0 if mode=="near" else 7.0)
		if not car.airborne:
			look.y = lerpf(tether.y,float(car.terrain.at(look.x,look.z)),.6)+(1.0 if mode=="near" else 2.2)
	elif not dispatch_view:
		look += down_road*0.86
	look = look.lerp(parked_target,opening)
	aim = aim.lerp(look,1.0-exp(-9.0*delta))
	look_at(aim)
	var lens := lerpf(61.0,50.0,close_up) if on_foot else (lerpf(68.0,75.0,pace) if mode=="near" else 64.0)
	if on_foot:
		fov = lerpf(fov,lens,1.0-exp(-6.0*delta))
	else:
		_drive_fov(lens,delta)
		_impact_motion(delta)


func _arm(from: Vector3, to: Vector3) -> float:
	query.from = from
	query.to = to
	query.collision_mask = 1
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return 1.0
	return clampf((from.distance_to(hit.position)-0.28)/from.distance_to(to),0.17,1.0)
