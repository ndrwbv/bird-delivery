extends CharacterBody3D

# The first district uses the stock Семёрка tuning (econ.js, handling 3).
const DAMAGE := preload("res://car_damage.gd")
const ROOF_PAINT := preload("res://actor_color.gdshader")
const LAMPS := preload("res://vehicle_lamps.gd")
const MAX_SPEED := 44.0
const ACCELERATION := 29.0
const BRAKES := 38.0
const MAX_REVERSE := 15.0
const STEERING_RATE := 2.86
const STEERING_RETURN := 1.75
const MIN_TURN_RADIUS := 6.4
const WHEEL_RADIUS := 0.35
const WHEELBASE := 2.90
const TRACK := 1.73

@onready var visual: Node3D = $Visual
@onready var model: Node3D = $Visual/Semerka
@onready var contact_shadow: MeshInstance3D = $ContactShadow
@onready var wheels: Array[Node3D] = [
	model.get_node("wheelLF"), model.get_node("wheelRF"),
	model.get_node("wheelLB"), model.get_node("wheelRB"),
]

var terrain: RefCounted
var controls_locked := false
var hit_handler: Callable
var person_handler: Callable
var person_kick := 0.0
var rear_slip := 0.0
var nitro := 0.50
var hearts := 7.0
var shield_time := 0.0
var beast_time := 0.0
var knock_cooldown := 0.0
var headlamps := false
var lamps := LAMPS.new()
var damage := DAMAGE.new()
var wet := 0.0
var speed := 0.0
var steering := 0.0
var wheel_roll := 0.0
var suspension_velocity := 0.0
var yaw_rate := 0.0
var brake_load := 0.0
var skid := 0.0
var wheel_at: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]
var wheel_rest: Array[Vector3] = []


func _ready() -> void:
	visual.add_child(lamps)
	var roof_light := model.get_node("PizzaRoofLight") as MeshInstance3D
	var paint := ShaderMaterial.new()
	paint.shader = ROOF_PAINT
	roof_light.material_override = paint
	visual.add_child(damage)
	damage.lamps = lamps
	damage.setup(model)
	for wheel in wheels:
		wheel_rest.append(wheel.position)


func park(at: Vector2, yaw: float) -> void:
	position = Vector3(at.x, terrain.at(at.x, at.y) + 0.04, at.y)
	rotation = Vector3(0.0, yaw, 0.0)
	speed = 0.0
	if hearts <= 0.0:
		hearts = 7.0
		nitro = 0.5
		damage.repair()
	velocity = Vector3.ZERO
	steering = 0.0
	rear_slip = 0.0
	yaw_rate = 0.0
	person_kick = 0.0
	suspension_velocity = 0.0
	brake_load = 0.0
	skid = 0.0
	visual.rotation = Vector3.ZERO
	_update_wheels(0.0, 0.0)
	reset_physics_interpolation()


func _physics_process(delta: float) -> void:
	var driving := not controls_locked and hearts > 0.0
	var throttle := Input.get_action_strength(&"accelerate") if driving else 0.0
	var brake := Input.get_action_strength(&"reverse") if driving else 0.0
	var steer := Input.get_axis(&"steer_left", &"steer_right") if driving else 0.0
	var handbrake := not driving or Input.is_action_pressed(&"handbrake")
	var boosting := driving and Input.is_action_pressed(&"nitro")
	var beast := beast_time > 0.0
	var top_speed := MAX_SPEED*(1.6 if beast else 1.0)
	var thrust := ACCELERATION*(1.8 if beast else 1.0)
	shield_time = maxf(0.0,shield_time-delta)
	beast_time = maxf(0.0,beast_time-delta)
	knock_cooldown = maxf(0.0,knock_cooldown-delta)
	var forward := -basis.z
	var right := basis.x
	var longitudinal := forward.dot(velocity)
	var lateral := right.dot(velocity)
	var old_speed := speed
	var loose := 0.0
	for tire in wheel_at:
		loose += 0.25 if terrain.material_at(tire.x,tire.z) != 0 else 0.0

	if throttle > 0.0 or brake > 0.0 or absf(longitudinal) > 1.2:
		var grade := (wheel_at[0].y+wheel_at[1].y-wheel_at[2].y-wheel_at[3].y)/(2.0*WHEELBASE)
		longitudinal -= clampf(grade,-0.3,0.3)*24.0*delta
	longitudinal += thrust*throttle*maxf(0.25,1.0-longitudinal/top_speed)*delta
	var ceiling := top_speed+14.0
	if boosting and beast:
		ceiling = MAX_SPEED*2.0
		longitudinal += thrust*maxf(0.2,1.0-longitudinal/ceiling)*delta
	elif boosting and nitro > 0.0:
		var burn := minf(delta,nitro/0.2)
		nitro -= burn*0.2
		longitudinal += 55.0*burn
	elif longitudinal > top_speed:
		longitudinal -= (longitudinal-top_speed)*1.4*delta
	if brake > 0.0:
		var retard := BRAKES*(1.0-wet*0.25) if longitudinal > 0.4 else ACCELERATION*0.5
		longitudinal -= retard*brake*delta
	longitudinal = clampf(longitudinal,-MAX_REVERSE,ceiling)
	longitudinal -= longitudinal*(0.3+(1.1 if handbrake else 0.0))*delta
	if not driving:
		longitudinal = move_toward(longitudinal,0.0,12.0*delta)

	steering = _step_steering(steering,steer,delta)
	var pace := absf(longitudinal)
	var slip_angle := atan2(lateral,maxf(1.0,pace))
	if handbrake and longitudinal > 5.0:
		rear_slip = minf(1.0,rear_slip+5.0*delta)
	else:
		var recovery := 2.5
		if steering*slip_angle > 0.15*absf(slip_angle):
			recovery = 6.0
		elif throttle > 0.0 and absf(slip_angle) > deg_to_rad(12.0) and longitudinal > 8.0:
			recovery = 0.7
		rear_slip = maxf(0.0,rear_slip-recovery*delta)
	var base_grip := lerpf(8.5,5.5,wet)*0.928
	var corner_grip := 1.0-0.18*clampf((longitudinal-8.0)/10.0,0.0,1.0)*absf(steering)
	var grip := lerpf(maxf(base_grip*corner_grip,minf(base_grip,6.0)),1.5,rear_slip)
	lateral *= exp(-grip*lerpf(1.0,0.85,loose)*delta)

	var turn_gain := minf(pace/8.0,1.0)/(1.0+pace*0.014*1.2)
	var limit := pace/MIN_TURN_RADIUS
	yaw_rate = clampf(-steering*2.3*0.9*turn_gain,-limit,limit)*signf(longitudinal)
	if handbrake:
		yaw_rate *= 1.5
	if rear_slip > 0.0 and longitudinal > 1.0 and yaw_rate*slip_angle > 0.0:
		yaw_rate *= clampf((55.0-absf(rad_to_deg(slip_angle)))/8.0,0.0,1.0)
	rotation.y += yaw_rate*delta

	var previous := position
	velocity = forward*longitudinal+right*lateral
	if absf(person_kick) > 0.01:
		var fade := exp(-delta/0.11)
		var yaw := person_kick*0.11*(1.0-fade)
		person_kick *= fade
		rotation.y += yaw
		velocity = velocity.rotated(Vector3.UP,yaw*0.6)
	_drive_motion(delta)
	speed = -basis.z.dot(velocity)
	var actual := (position-previous)/delta
	brake_load = lerpf(brake_load,clampf((speed-old_speed)/delta,-18.0,12.0),1.0-exp(-7.0*delta))
	skid = absf(actual.dot(basis.x))+(2.8*rear_slip if absf(speed) > 2.5 else 0.0)
	_update_wheels(delta,-basis.z.dot(actual))
	damage.bounce_parts(position,rotation.y,delta)
	lamps.update_lamps(headlamps,brake > 0.0 and old_speed > 0.2,speed < -0.35)


func _step_steering(current: float, target: float, delta: float) -> float:
	if current*target < 0.0:
		var time_to_center := absf(current)/(STEERING_RATE*STEERING_RETURN)
		if delta < time_to_center:
			return move_toward(current,0.0,STEERING_RATE*STEERING_RETURN*delta)
		delta -= time_to_center
		current = 0.0
	var rate := STEERING_RATE*STEERING_RETURN if absf(target) < absf(current) else STEERING_RATE
	return move_toward(current,target,rate*delta)


func person_bump() -> void:
	var pace := velocity.length()
	if pace < 0.5:
		return
	velocity *= 1.0-minf(0.30,0.08+0.7/pace)
	var turn := deg_to_rad(randf_range(4.0,9.0))
	person_kick += turn*(1.0 if randf() < 0.5 else -1.0)/0.11


func _drive_motion(delta: float) -> void:
	var start := position
	var approach_velocity := velocity
	var motion := velocity*delta
	for attempt in 5:
		if motion.length_squared() < 0.00000001:
			break
		var contact := move_and_collide(motion,false,0.012)
		if contact == null:
			break
		var normal := contact.get_normal()
		normal.y = 0.0
		normal = normal.normalized()
		var approach := maxf(0.0,-velocity.dot(normal))
		var retention := -1.0
		if hit_handler.is_valid():
			retention = hit_handler.call(contact,approach,velocity)
		if retention >= 0.0:
			velocity *= retention
			motion = contact.get_remainder()*retention
		else:
			velocity = (velocity+normal*approach)*0.92
			motion = contact.get_remainder().slide(normal)*0.92
			motion.y = 0.0
			if approach > 3.0:
				yaw_rate *= 0.48
	if person_handler.is_valid() and (position-start).length_squared() > 0.0001:
		person_handler.call(start,position,approach_velocity)


func _update_wheels(delta: float, rolling: float) -> void:
	var support: Array[float] = []
	for i in wheels.size():
		var sample := position + basis * wheel_rest[i]
		sample.y = terrain.wheel_height(sample.x, sample.z)
		wheel_at[i] = sample
		support.append(sample.y)
	var average := (support[0]+support[1]+support[2]+support[3])*0.25
	var pitch := atan2((support[0]+support[1]-support[2]-support[3])*0.5, WHEELBASE)
	var roll := atan2((support[1]+support[3]-support[0]-support[2])*0.5, TRACK)
	if delta > 0.0:
		suspension_velocity += ((average+0.035-position.y)*142.0 - suspension_velocity*19.0)*delta
		position.y = clampf(position.y + suspension_velocity*delta, average-0.10, average+0.23)
		var blend := 1.0-exp(-8.0*delta)
		visual.rotation.x = lerpf(visual.rotation.x, clampf(pitch,-0.17,0.17)+clampf(brake_load*0.0038,-0.055,0.045), blend)
		visual.rotation.z = lerpf(visual.rotation.z, clampf(roll,-0.105,0.105)+clampf(-yaw_rate*absf(rolling)*0.0024,-0.052,0.052), blend)
	wheel_roll = fposmod(wheel_roll-rolling/WHEEL_RADIUS*delta, TAU)
	for i in wheels.size():
		var wheel_yaw := -steering*0.42 if i < 2 else 0.0
		wheels[i].basis = Basis(Vector3.UP,wheel_yaw)*Basis(Vector3.RIGHT,wheel_roll)
		var base := wheel_rest[i]
		var wheel_floor := (visual.basis * base).y + position.y - base.y
		wheels[i].position.y = base.y + clampf(support[i]-wheel_floor,-0.16,0.15)
	contact_shadow.rotation = Vector3(pitch,0.0,roll)
	contact_shadow.position.y = average + 0.095 - position.y


func collect_road_bonus(type: int) -> void:
	match type:
		0: nitro = minf(1.0,nitro+0.5)
		1:
			hearts = minf(7.0,hearts+1.0)
			damage.set_hearts(hearts)
		2: shield_time = 10.0
		3: beast_time = 15.0


func collision_damage(impact: float, other_car: bool, contact: Vector3, normal: Vector3) -> void:
	if shield_time > 0.0:
		return
	damage.impact(contact,normal,impact)
	if knock_cooldown > 0.0:
		return
	var impulse := 0.0
	if other_car and impact >= 8.5:
		impulse = 0.5 if impact < 12.5 else maxf(0.8,(impact-5.0)*0.14)
	elif not other_car and impact >= 15.0:
		impulse = (impact-13.0)*0.16
	if impulse > 0.0:
		hearts = maxf(0.0,hearts-(1.0 if impulse >= 1.5 else 0.5))
		knock_cooldown = 0.9
		damage.set_hearts(hearts)
