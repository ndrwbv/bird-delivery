extends RefCounted

signal stalled
signal started
signal condition_warning(percent: int)

# econ.js BREAK, cars.js stallStep and motor.js VAZ profile, Steam v0.36.0.
const STALL_CURVE := [Vector2(100,0),Vector2(70,0),Vector2(60,0.05),Vector2(50,0.125),
	Vector2(35,0.3),Vector2(20,0.5),Vector2(0,0.75)]
const GEARS := [0.21,0.38,0.56,0.77,1.0]
const IDLE := 850.0
const RED := 6000.0

var condition := 100.0
var ceiling := 100.0
var km := 0.0
var repairs := 0
var shift_number := 1
var riding := false
var pending := -1.0
var dead := false
var restarting := false
var marker := 0.0
var zone := Vector2.ZERO
var hits := 0
var stalled_time := 0.0
var direction := 1.0
var press_delay := 0.0
var odometer := 0.0
var gear := 1
var rpm := IDLE
var shift_time := 0.0
var crank_time := 0.0
var pushing := 0.0
var blip_delay := 0.0


func snapshot() -> Dictionary:
	return {"c":condition,"r":ceiling,"km":km,"n":repairs}


func restore(saved: Dictionary) -> void:
	ceiling = clampf(float(saved.get("r",100.0)),20.0,100.0)
	condition = clampf(float(saved.get("c",100.0)),0.0,ceiling)
	km = maxf(0.0,float(saved.get("km",0.0)))
	repairs = maxi(0,int(saved.get("n",0)))


func begin_shift(number: int) -> void:
	shift_number = number
	riding = number <= 0
	dead = false
	restarting = false
	pending = -1.0
	gear = 1
	rpm = 0.0
	crank_time = 0.62
	pushing = 0.0
	shift_time = 0.0


func begin_order() -> void:
	pending = randf_range(4.0,30.0) if randf() < stall_chance() else -1.0


func stall_chance() -> float:
	if riding or km < 30.0 or shift_number < 5:
		return 0.0
	for i in range(1,STALL_CURVE.size()):
		var low: Vector2 = STALL_CURVE[i]
		var high: Vector2 = STALL_CURVE[i-1]
		if condition >= low.x:
			return remap(condition,low.x,high.x,low.y,high.y)
	return 0.75


func hit(impact: float) -> void:
	if not riding and impact > 0.0:
		_wear(clampf(0.2+(impact-10.0)*0.05,0.2,1.5),0.0,0.0)


func _wear(loss: float, ceiling_loss: float, distance: float) -> void:
	var previous := condition
	ceiling = snappedf(maxf(20.0,ceiling-ceiling_loss),0.01)
	condition = snappedf(clampf(condition-loss,0.0,ceiling),0.01)
	km = snappedf(km+distance,0.01)
	for threshold: int in [70,50,30]:
		if previous >= threshold and condition < threshold:
			condition_warning.emit(roundi(condition))
			break


func repair_quote() -> Dictionary:
	var pct := snappedf(maxf(0.0,ceiling-condition),0.1)
	return {"pct":pct,"price":roundi((1500.0+150.0*pct)/100.0)*100,
		"drop":snappedf(minf(8.0,4.0+0.08*pct),0.1)}


func repair() -> void:
	var quote := repair_quote()
	if float(quote.pct) < 1.0:
		return
	ceiling = snappedf(maxf(20.0,ceiling-float(quote.drop)),0.01)
	condition = ceiling
	repairs += 1


func pothole(severity := 1.0) -> void:
	if not dead and randf() < stall_chance()*0.25*severity:
		_stall()


func _stall() -> void:
	dead = true
	restarting = false
	stalled_time = 0.0
	press_delay = 0.0
	hits = 0
	direction = 1.0
	marker = 0.0
	pending = -1.0
	stalled.emit()


func _new_zone() -> void:
	zone.y = maxf(0.1,0.26-(100.0-condition)*0.0015)
	for i in 6:
		zone.x = 0.06+randf()*(0.88-zone.y)
		if absf(zone.x+zone.y*0.5-marker) > 0.22:
			break


func press_starter() -> bool:
	if not restarting or press_delay > 0.0:
		return false
	press_delay = 0.11
	if marker < zone.x-0.01 or marker > zone.x+zone.y+0.01:
		return false
	hits += 1
	if hits == 3:
		dead = false
		restarting = false
		rpm = maxf(rpm,IDLE*1.7)
		started.emit()
	else:
		_new_zone()
	return true


func step(delta: float, speed: float, driving: bool) -> void:
	var pace := absf(speed)
	if driving and not riding:
		odometer += pace*delta
		if odometer >= 100.0:
			var distance := odometer/1000.0
			_wear(distance*0.4,distance*0.07,distance)
			odometer = 0.0
		if not dead and pending > 0.0 and pace > 7.0:
			pending -= delta
			if pending <= 0.0:
				_stall()
	if not dead:
		return
	stalled_time += delta
	if not restarting and (pace < 1.2 or stalled_time > 2.4):
		restarting = true
		_new_zone()
	if restarting:
		press_delay = maxf(0.0,press_delay-delta)
		marker += direction*(1.05+minf(0.5,hits*0.08))*delta
		if marker > 1.0:
			marker = 2.0-marker
			direction = -1.0
		elif marker < 0.0:
			marker = -marker
			direction = 1.0


# Automatic gears affect revs and sound. Traction and torque are calculated in driveStep.
func gearbox(delta: float, speed: float, vmax: float, load: bool, brake: bool, boost: bool, air: bool) -> void:
	var pace := absf(speed)
	var target := 0.0
	shift_time = maxf(0.0,shift_time-delta)
	blip_delay = maxf(0.0,blip_delay-delta)
	if crank_time > 0.0:
		crank_time = maxf(0.0,crank_time-delta)
		if crank_time == 0.0:
			rpm = IDLE*1.9
	elif not dead:
		if speed < -0.5:
			gear = 0
			target = IDLE+(RED-IDLE)*clampf(pace/12.0,0.0,1.0)*0.75
		else:
			gear = maxi(1,gear)
			var wheel := RED*pace/(float(GEARS[gear-1])*vmax*1.08)
			if shift_time <= 0.0:
				if gear < GEARS.size() and wheel >= RED*(0.92 if load else 0.72):
					gear += 1
					if load and pace > 3.0:
						shift_time = 0.16
				elif gear > 1 and wheel < RED*0.36 and pace/(float(GEARS[gear-2])*vmax*1.08) < 0.85:
					gear -= 1
					if brake and pace > 4.0 and blip_delay <= 0.0:
						rpm = minf(RED*0.9,rpm+(RED-IDLE)*0.15)
						blip_delay = 0.35
			target = maxf(IDLE,RED*pace/(float(GEARS[gear-1])*vmax*1.08))
			pushing = pushing+delta if load and pace < 1.2 else 0.0
			if load and gear == 1:
				target = maxf(target,IDLE+(RED-IDLE)*lerpf(0.42,1.02,clampf((pushing-0.35)/0.9,0.0,1.0)))
			if load and air:
				target = RED*1.02
			target = minf(RED*1.02,target*(1.06 if boost else 1.0))
	var rate := 6.0 if load else 4.5
	if dead:
		rate = 2.6
	elif shift_time > 0.0:
		rate = 18.0
	elif target > rpm:
		rate = 7.0 if load else 5.0
	rpm = lerpf(rpm,target,1.0-exp(-rate*delta))
