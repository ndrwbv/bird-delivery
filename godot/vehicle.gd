extends CharacterBody3D

signal shift_started(pace: String)
signal drowned
signal wrecked
signal roof_landed

# The first district uses the stock Семёрка tuning (econ.js, handling 3).
const DAMAGE := preload("res://car_damage.gd")
const ROOF_PAINT := preload("res://actor_color.gdshader")
const LAMPS := preload("res://vehicle_lamps.gd")
const ENGINE := preload("res://semerka_engine.gd")
const SURFACE := preload("res://semerka_surface.gd")
const MOTOR_AUDIO := preload("res://semerka_motor_audio.gd")
const STARTER := preload("res://semerka_starter.gd")
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

var engine := ENGINE.new()
var surface := SURFACE.new()
var motor_audio := MOTOR_AUDIO.new()
var starter := STARTER.new()
var armor_level := 0
var tuned_speed := MAX_SPEED
var equipment := preload("res://semerka_addons.gd").new()
var hearts_max := 7.0
var bonus_heart := false
var nitro_efficiency := 1.0
var boost_active := false
var active_shift := true
var airborne := false
var sinking := -1.0
var steer_visual := 0.0
var shield_aura := MeshInstance3D.new()
var region_edge: RefCounted
var terrain: RefCounted
var roofs: RefCounted
var ramps: Node3D
var ramp_state := {}
var ramp_safe := 0.0
var controls_locked := false
var hit_handler: Callable
var person_handler: Callable
var pad_nitro_available: Callable
var person_kick := 0.0
var rear_slip := 0.0
var nitro := 0.50
var hearts := 7.0:
	set(value):
		var lost_last := hearts > 0.0 and value <= 0.0
		hearts = value
		if lost_last:
			wrecked.emit()
var shield_time := 0.0
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
	add_child(equipment)
	equipment.setup(self)
	add_child(motor_audio)
	engine.started.connect(motor_audio.play_starter)
	var layer := CanvasLayer.new()
	layer.layer = 6
	add_child(layer)
	layer.add_child(starter)
	starter.setup(engine)
	var aura := SphereMesh.new()
	aura.radius = 3.1
	aura.height = 6.2
	aura.radial_segments = 16
	aura.rings = 10
	var tint := StandardMaterial3D.new()
	tint.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	tint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tint.albedo_color = Color("8f9bff38")
	shield_aura.mesh = aura
	shield_aura.material_override = tint
	shield_aura.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shield_aura.position.y = 1.1
	shield_aura.hide()
	add_child(shield_aura)
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


func apply_equipment(loadout: Dictionary) -> void:
	var old_max := hearts_max
	armor_level = clampi(int(loadout.get("armor",0)),0,3)
	hearts_max = 7.0 + armor_level + (1.0 if bonus_heart else 0.0)
	hearts = clampf(hearts + (hearts_max - old_max),0,hearts_max)
	tuned_speed = MAX_SPEED*(1.0 + .04*clampi(int(loadout.get("engine",0)),0,3))
	damage.paint_body(Color.from_string(str(loadout.get("paint","#ebe6d8")),Color("#ebe6d8")))
	equipment.configure(bool(loadout.get("wings",false)),bool(loadout.get("gun",false)))


func begin_shift(number: int, pace: String, engine_state: Dictionary = {}) -> void:
	if not engine_state.is_empty():
		engine.restore(engine_state)
	engine.begin_shift(number)
	motor_audio.play_starter()
	active_shift = true
	bonus_heart = false
	sinking = -1.0
	surface.ice_load = 0.0
	hearts_max = 7.0 + armor_level
	equipment.reset_drive(true)
	hearts = hearts_max
	nitro = 1.0 if pace == "generous" and number > 0 else 0.5
	nitro_efficiency = 1.0
	shield_time = 0.0
	knock_cooldown = 0.0
	damage.repair()
	shift_started.emit(pace)


func park(at: Vector2, yaw: float) -> void:
	equipment.reset_drive(false)
	sinking = -1.0
	surface.ice_load = 0.0
	airborne = false
	ramp_state.clear()
	ramp_safe = 0.0
	position = Vector3(at.x, terrain.at(at.x, at.y) + 0.04, at.y)
	rotation = Vector3(0.0, yaw, 0.0)
	speed = 0.0
	if hearts <= 0.0:
		hearts = hearts_max
		nitro = 0.5
		damage.repair()
	velocity = Vector3.ZERO
	steering = 0.0
	steer_visual = 0.0
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
	if sinking >= 0.0:
		sinking += delta
		velocity *= exp(-2.2*delta)
		position += velocity*delta
		var floor_y: float = terrain.land_height(position.x,position.z)
		position.y = maxf(floor_y,surface.water_level()+0.1-maxf(0.0,sinking-0.5)*1.1)
		visual.rotation.x = lerpf(visual.rotation.x,-0.38,1.0-exp(-delta))
		return
	var driving := active_shift and not controls_locked and hearts > 0.0
	equipment.tick(delta,driving)
	var throttle := driving and Input.get_action_raw_strength(&"accelerate") > 0.154
	var brake := driving and Input.get_action_raw_strength(&"reverse") > 0.154
	var stick := Input.get_action_raw_strength(&"steer_right")-Input.get_action_raw_strength(&"steer_left") if driving else 0.0
	var steer := signf(stick)*pow(clampf((absf(stick)-0.12)/0.85,0.0,1.0),1.6)
	var handbrake := not driving or Input.is_action_pressed(&"handbrake")
	var pad_boost: bool = driving and pad_nitro_available.is_valid() and Input.is_action_pressed(&"pad_nitro") and pad_nitro_available.call()
	var boosting := driving and (Input.is_action_pressed(&"nitro") or pad_boost)
	if active_shift and hearts > 0.0:
		engine.step(delta,speed,driving)
	if active_shift and not controls_locked and engine.restarting:
		var starter_pressed := Input.is_action_just_pressed(&"deliver")
		# B is handbrake on a pad. Only keyboard Space also operates the starter.
		starter_pressed = starter_pressed or (Input.is_action_just_pressed(&"handbrake") and Input.is_physical_key_pressed(KEY_SPACE))
		if starter_pressed:
			starter.press()
	starter.step(delta,active_shift and not controls_locked)
	shield_time = maxf(0.0,shield_time-delta)
	knock_cooldown = maxf(0.0,knock_cooldown-delta)
	ramp_safe = maxf(0.0,ramp_safe-delta)
	var forward := -basis.z
	var right := basis.x
	var longitudinal := forward.dot(velocity)
	var lateral := right.dot(velocity)
	var old_speed := speed
	surface.step(position,terrain,delta)
	if surface.snow > 0.0:
		surface.winter.sample(position,Vector2(forward.x,forward.z),terrain,surface.snow,delta,
			not airborne and surface.wade <= 0.0 and not surface.ice,wheel_rest)
		surface.loose_snow = surface.winter.result.x
		surface.grit = surface.winter.result.y
		surface.rut = surface.winter.result.z
		surface.snow_cover = surface.winter.result.w
	if driving and not airborne and ((not surface.frozen and surface.water_depth > (0.75 if surface.wading_beach else 0.15)) or surface.breaks_ice(delta,speed,position.y)):
		sinking = 0.0
		motor_audio.step(delta,engine,false,false)
		drowned.emit()
		return
	var road_wet := surface.wetness(wet)
	var sand := 0.0 if airborne else surface.sand
	var snow := 0.0 if airborne else surface.loose_snow
	var rut := 0.0 if airborne else surface.rut

	if throttle or brake or absf(longitudinal) > 1.2:
		var nose := position+forward*1.4
		var tail := position-forward*1.45
		var grade: float = (terrain.at(nose.x,nose.z,position.y)-terrain.at(tail.x,tail.z,position.y))/2.85
		longitudinal -= grade*24.0*delta
	var burning := boosting and nitro > 0.0 and not engine.dead
	if burning:
		nitro = maxf(0.0, nitro - 0.2 * nitro_efficiency * delta)
		longitudinal += 55.0 * delta
	boost_active = burning
	if throttle and not airborne and not engine.dead:
		longitudinal += ACCELERATION*maxf(0.25,1.0-longitudinal/tuned_speed)*(1.0-0.5*minf(1.0,sand))*(1.0-0.3*snow)*delta
	if brake:
		var retard := BRAKES*(1.0-road_wet*0.25) if longitudinal > 0.4 else (0.0 if engine.dead else ACCELERATION*0.5)
		longitudinal -= retard*delta
	if engine.dead:
		longitudinal -= longitudinal*0.55*delta
	longitudinal = clampf(longitudinal, -MAX_REVERSE, tuned_speed + 14.0)
	if not burning and longitudinal > tuned_speed:
		longitudinal -= (longitudinal - tuned_speed) * 1.4 * delta
	longitudinal -= longitudinal * 0.3 * delta
	if surface.wade > 0.0 and not airborne:
		longitudinal -= longitudinal*5.0*minf(1.4,surface.wade/0.45)*delta
	if handbrake:
		longitudinal -= longitudinal * 1.1 * delta
	longitudinal -= longitudinal*0.8*sand*delta
	longitudinal -= longitudinal*0.25*snow*delta
	if not driving:
		longitudinal = move_toward(longitudinal,0.0,12.0*delta)

	steering = _step_steering(steering,steer,delta)
	var pace := absf(longitudinal)
	var slip_angle := atan2(lateral,maxf(1.0,pace))
	if handbrake and not airborne and longitudinal > 5.0:
		rear_slip = minf(1.0,rear_slip+5.0*delta)
	else:
		var recovery := 2.5
		if steering*slip_angle > 0.15*absf(slip_angle):
			recovery = 6.0
		elif throttle and not airborne and absf(slip_angle) > deg_to_rad(12.0) and longitudinal > 8.0:
			recovery = 0.7
		rear_slip = maxf(0.0,rear_slip-recovery*delta)
	var base_grip := lerpf(8.5,5.5,road_wet)*0.928
	var corner_grip := 1.0-0.18*clampf((longitudinal-8.0)/10.0,0.0,1.0)*absf(steering)
	var grip := lerpf(maxf(base_grip*corner_grip,minf(base_grip,6.0)),1.5,rear_slip)
	lateral *= exp(-grip*surface.ground_grip*(1.0-0.55*minf(1.0,sand))*(1.0-0.22*snow)*(1.0+0.18*rut)*delta)

	var turn_gain := minf(pace/8.0,1.0)/(1.0+pace*0.014*1.2)
	if airborne:
		turn_gain *= 0.15
	var limit := pace/MIN_TURN_RADIUS
	yaw_rate = clampf(-steering*2.3*0.9*turn_gain,-limit,limit)*signf(longitudinal)
	if handbrake:
		yaw_rate *= 1.5
	if rear_slip > 0.0 and longitudinal > 1.0 and yaw_rate*slip_angle > 0.0:
		yaw_rate *= clampf((55.0-absf(rad_to_deg(slip_angle)))/8.0,0.0,1.0)
	rotation.y += yaw_rate*delta

	var previous := position
	velocity = forward*longitudinal+right*lateral
	if not airborne and not surface.wind.is_zero_approx():
		var gust := Vector3(surface.wind.x,0.0,surface.wind.y)
		var force := clampf((velocity.length()-2.0)/8.0,0.0,1.0)*delta
		velocity += (right*gust.dot(right)+forward*gust.dot(forward)*0.25)*force
	if absf(person_kick) > 0.01:
		var fade := exp(-delta/0.11)
		var yaw := person_kick*0.11*(1.0-fade)
		person_kick *= fade
		rotation.y += yaw
		velocity = velocity.rotated(Vector3.UP,yaw*0.6)
	_drive_motion(delta)
	speed = -basis.z.dot(velocity)
	_ramp_step()
	var actual := (position-previous)/delta
	brake_load = lerpf(brake_load,clampf((speed-old_speed)/delta,-18.0,12.0),1.0-exp(-7.0*delta))
	skid = absf(actual.dot(basis.x))+(2.8*rear_slip if absf(speed) > 2.5 else 0.0)
	steer_visual = lerpf(steer_visual,steering*0.42,1.0-exp(-10.0*delta))
	var wheel_spin := snow*3.0 if throttle and not engine.dead else 0.0
	_update_wheels(delta,-basis.z.dot(actual)+wheel_spin)
	var load_motor := not engine.dead and (throttle or burning)
	engine.gearbox(delta,longitudinal,tuned_speed,load_motor,brake,burning,airborne)
	motor_audio.step(delta,engine,load_motor,active_shift and not controls_locked and hearts > 0.0)
	shield_aura.visible = shield_time > 0.0 and (shield_time > 2.0 or floori(shield_time*6.0)%2 == 0)
	damage.bounce_parts(position,rotation.y,delta)
	lamps.update_lamps(headlamps,brake and old_speed > 0.2,speed < -0.35)


func pizza_cooling() -> float:
	var cooling := .6*clampf(1.0-hearts/hearts_max,0.0,1.0)
	var trunk := damage.stage[2]
	cooling += .5 if trunk >= 3 else (.2 if trunk == 2 else 0.0)
	if damage.stage[8] == 3:
		cooling += .25
	return snappedf(minf(1.0,cooling),.01)


func _step_steering(current: float, target: float, delta: float) -> float:
	if current*target < 0.0:
		var time_to_center := absf(current)/(STEERING_RATE*STEERING_RETURN)
		if delta < time_to_center:
			return move_toward(current,0.0,STEERING_RATE*STEERING_RETURN*delta)
		delta -= time_to_center
		current = 0.0
	var rate := STEERING_RATE*STEERING_RETURN if absf(target) < absf(current) else STEERING_RATE
	return move_toward(current,target,rate*delta)


# A wheel contact from the road-condition layer. The release uses the same soft
# response for an ordinary hole and a deep one. No vertical launch or camera kick.
func pothole(front_wheel: bool, severity := 1.0) -> void:
	if airborne or absf(speed) < 3.0:
		return
	var at_speed := minf(1.0,absf(speed)/30.0)
	visual.rotation.x += (1.0 if front_wheel else -1.0)*(0.015+at_speed*0.015)
	velocity *= 1.0-(0.1+at_speed*0.12)
	if active_shift and not controls_locked:
		engine.pothole(severity)


func person_bump() -> void:
	var pace := velocity.length()
	if pace < 0.5:
		return
	velocity *= 1.0-minf(0.30,0.08+0.7/pace)
	var turn := deg_to_rad(randf_range(4.0,9.0))
	person_kick += turn*(1.0 if randf() < 0.5 else -1.0)/0.11


func _drive_motion(delta: float) -> void:
	if region_edge != null:
		velocity = region_edge.limit(position, velocity, delta)
	var start := position
	var approach_velocity := velocity
	var motion := velocity*delta
	if ramps:
		ramps.prepare_motion(self,motion,airborne or ramp_safe > 0.0)
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
	if not airborne and person_handler.is_valid() and (position-start).length_squared() > 0.0001:
		person_handler.call(start,position,approach_velocity)


func _ramp_step() -> void:
	if not ramps or equipment.phase != equipment.Phase.GROUND:
		ramp_state.clear()
		return
	var current: Dictionary = ramps.info(Vector2(position.x,position.z))
	if not airborne and speed > 6.0 and not ramp_state.is_empty() and float(ramp_state.lift)>float(ramp_state.height)*.7 and float(current.get("lift",0.0))<.2:
		var axis: Vector2 = ramp_state.axis
		if axis.dot(Vector2(velocity.x,velocity.z)) > 3.0:
			var boost := minf(1.25,tuned_speed*1.3/maxf(1.0,speed))
			velocity *= boost
			speed *= boost
			suspension_velocity = speed * float(ramp_state.height)/float(ramp_state.length)*1.15
			airborne = true
			ramp_safe = 1.5
	ramp_state = current


func _update_wheels(delta: float, rolling: float) -> void:
	var support: Array[float] = []
	var was_airborne := airborne
	var roof_level: bool = roofs and terrain == roofs.ground and (airborne or position.y-surface.land_y > 1.4)
	for i in wheels.size():
		var sample := position + basis * wheel_rest[i]
		sample.y = terrain.wheel_height(sample.x,sample.z,position.y)+surface.winter.support[i]
		if roof_level:
			sample.y = roofs.support(sample.x,sample.z,position.y,sample.y)
		if ramps:
			sample.y += ramps.lift(Vector2(sample.x,sample.z))
		if surface.ice_height > -INF:
			sample.y = maxf(sample.y,surface.ice_height)
		elif surface.wade > 0.0:
			sample.y -= minf(0.35,surface.wade*0.55)
		wheel_at[i] = sample
		support.append(sample.y)
	var average := (support[0]+support[1]+support[2]+support[3])*0.25
	var pitch := atan2((support[0]+support[1]-support[2]-support[3])*0.5, WHEELBASE)
	var roll := atan2((support[1]+support[3]-support[0]-support[2])*0.5, TRACK)
	if delta > 0.0 and not equipment.height_step(delta,average):
		if position.y-average > .9 or airborne:
			suspension_velocity -= 22.0*delta
			position.y += suspension_velocity*delta
			airborne = position.y-average > .045
			if not airborne:
				ramp_safe = 1.5
				position.y = average+.035
				suspension_velocity = 0.0
		else:
			suspension_velocity += ((average+.035-position.y)*142.0-suspension_velocity*19.0)*delta
			position.y = clampf(position.y+suspension_velocity*delta,average-.10,average+.23)
		var blend := 1.0-exp(-8.0*delta)
		visual.rotation.x = lerpf(visual.rotation.x, clampf(pitch,-0.17,0.17)+clampf(brake_load*0.0038,-0.055,0.045), blend)
		visual.rotation.z = lerpf(visual.rotation.z, clampf(roll,-0.105,0.105)+clampf(-yaw_rate*absf(rolling)*0.0024,-0.052,0.052), blend)
	if was_airborne and not airborne and roof_level and roofs.support(position.x,position.z,position.y,-INF) > -INF:
		roof_landed.emit()
	wheel_roll = fposmod(wheel_roll-rolling/WHEEL_RADIUS*delta, TAU)
	for i in wheels.size():
		var wheel_yaw := -steer_visual if i < 2 else 0.0
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
			hearts = minf(hearts_max,hearts+1.0)
			damage.set_hearts(hearts)
		2: shield_time = 10.0
		3:
			if hearts >= hearts_max and not bonus_heart:
				hearts_max += 1.0
				bonus_heart = true
			hearts = minf(hearts_max,hearts+1.0)
			damage.set_hearts(hearts)


func collision_damage(impact: float, other_car: bool, contact: Vector3, normal: Vector3) -> void:
	if airborne or ramp_safe > 0.0:
		return
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
		engine.hit(impact)
		hearts = maxf(0.0,hearts-(1.0 if impulse >= 1.5 else 0.5))
		knock_cooldown = 0.9
		damage.set_hearts(hearts)
