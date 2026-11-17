extends Camera3D

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


func set_parked_view(at: Vector3, target: Vector3) -> void:
	parked_position = at
	parked_target = target


func reset_view() -> void:
	person = null
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
	drove = drove or speed > 0.7
	if not drove:
		return
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
	var turn_rate := 4.5 if on_foot and not dispatch_view else 2.1
	heading += clampf(difference*(1.0-exp(-6.0*delta)),-turn_rate*delta,turn_rate*delta)

	var pace := clampf(speed/24.0,0.0,1.0)
	var horizontal := lerpf(6.4,8.6,pace)
	var rise := lerpf(3.15,3.8,pace)
	if on_foot:
		horizontal = 4.0 if dispatch_view else lerpf(6.4,2.85,close_up)
		rise = 2.3 if dispatch_view else lerpf(3.15,1.66,close_up)
	if dispatch_view and dispatch_heading < 0.0:
		horizontal = 4.9
		rise = 2.6
	horizontal = lerpf(horizontal,parked_distance,opening)
	rise = lerpf(rise,parked_position.y-car.position.y,opening)
	tether = tether.lerp(pose.origin, 1.0-exp(-9.0*delta))
	tether = pose.origin + (tether-pose.origin).limit_length(1.15)
	var offset := Vector3(sin(heading)*horizontal,rise,cos(heading)*horizontal)
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

	var down_road := -Vector3(sin(heading),0.0,cos(heading))
	var look := tether + Vector3.UP*(1.23 if on_foot else 0.95)
	if dispatch_view and dispatch_heading < 0.0:
		look = look.lerp(car.position+Vector3.UP*1.15,0.36)
	if exchanging:
		look = look.lerp(exchange_target.position+Vector3.UP*1.18,close_up*0.47)
	elif not on_foot:
		look += down_road*lerpf(2.5,4.8,pace)
	elif not dispatch_view:
		look += down_road*0.86
	look = look.lerp(parked_target,opening)
	aim = aim.lerp(look,1.0-exp(-9.0*delta))
	look_at(aim)
	var lens := lerpf(61.0,50.0,close_up) if on_foot else lerpf(61.0,66.0,pace)
	fov = lerpf(fov,lens,1.0-exp(-6.0*delta))


func _arm(from: Vector3, to: Vector3) -> float:
	query.from = from
	query.to = to
	query.collision_mask = 1
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		return 1.0
	return clampf((from.distance_to(hit.position)-0.28)/from.distance_to(to),0.17,1.0)
