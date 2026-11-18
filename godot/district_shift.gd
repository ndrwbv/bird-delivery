extends RefCounted

const DEPOT_RADIUS := 7.0
const FINAL_WINDOW := 75.0
const T0 := 0.06
const HOURS := [Vector2(.06,9),Vector2(.66,18),Vector2(.75,21),Vector2(.96,29),Vector2(1.06,33)]
var profile: RefCounted
var number := 1
var duration := 239.85
var elapsed := 0.0
var env_time := T0
var day_end := .82875
var slow := .65
var sun_rate := 0.0
var level := 1
var orders := 0
var delivered := 0
var missed := 0
var money := 0
var pace := "normal"
var lunch_tips := false
var meal_taken := false
var fee := 0
var tips := 0
var pay := 0
var penalties := 0
var hits := 0
var hits_at_start := 0
var deadline := 0.0
var settled := false
var return_fined := false
var depot_time := -1.0
var latest_payment := 0


func begin(career: RefCounted) -> void:
	profile = career
	number = int(profile.data.shifts) + 1
	var daytime := number >= 2 and (number - 2) % 3 == 0
	day_end = .60 if daytime else .82875
	slow = .85 if daytime else (.65 if number <= 3 else (1.0 if number <= 8 else 1.3))
	duration = (day_end - T0) * 480.0 * slow
	var weighted := .01 / 1.5 + minf(.55, day_end - .07)
	weighted += clampf(day_end - .62, 0, .15) / 1.5 + maxf(0, day_end - .77) / 2.0
	sun_rate = weighted / duration
	level = 1
	for threshold in [3, 8, 15, 25]:
		if int(profile.data.xp) >= threshold:
			level += 1
	if int(profile.data.get("skill_shift", 0)) != number:
		profile.data.skill = float(profile.data.skill) * .8
		profile.data.skill_shift = number


func tick(delta: float) -> void:
	elapsed += delta
	if elapsed >= duration and elapsed - delta < duration:
		env_time = day_end
		return
	if elapsed >= duration:
		if day_end < .62:
			env_time = minf(.615, env_time + delta * .15 / (480.0 * slow))
		else:
			env_time = fmod(env_time + delta / (480.0 * slow), 1.0)
	else:
		var tempo := 1.5 if env_time < .07 or env_time >= .62 else 1.0
		if env_time >= .77:
			tempo = 2.0
		env_time += delta * sun_rate * tempo


func clock_text() -> String:
	var t := env_time + 1.0 if env_time < T0 else env_time
	for i in range(1, HOURS.size()):
		var a: Vector2 = HOURS[i-1]
		var b: Vector2 = HOURS[i]
		if t <= b.x:
			var minutes := floori(lerpf(a.y,b.y,inverse_lerp(a.x,b.x,t)) * 60.0 + .0001) % 1440
			return "%02d:%02d" % [minutes / 60, minutes % 60]
	return "09:00"


func accept(order: Dictionary) -> void:
	orders += 1
	var distance := float(order.meters)
	fee = roundi((640.0 + 1.12 * distance) * (1.0 + .03 * level) / 10.0) * 10
	if pace == "tight":
		fee = roundi(fee * 1.1 / 10) * 10
	var wave := floori((orders - 1) / 3.0)
	var slack := lerpf(maxf(1.3, 2.0 - .18 * wave), maxf(1.12, 1.32 - .05 * wave), ((orders - 1) % 3) * .5) - .03 * (level - 1)
	var skill_time := lerpf(1.2, 1.0, clampf(float(profile.data.skill) / 5.0, 0, 1))
	deadline = maxf(16, distance / 19.0 * slack + 9.0) * skill_time * (1.25 if pace == "generous" else (.92 if pace == "tight" else 1.0))
	settled = false
	return_fined = false
	hits_at_start = hits
	depot_time = -1.0
	latest_payment = 0


func settle(tips_allowed: bool, failed: bool, story: bool) -> void:
	if settled:
		return
	settled = true
	if failed:
		missed += 1
		fine(fee)
	else:
		var late := deadline <= 0
		var base := roundi(fee * .45) if late else fee
		var chance := .25 + (.25 if pace == "generous" else (-.05 if pace == "tight" else 0.0))
		var multiplier := 1.5 if pace == "generous" else 1.0
		if lunch_tips:
			chance += .2
			multiplier *= 1.3
		var tip := roundi(fee * randf_range(.1, .4) * multiplier / 10.0) * 10 if tips_allowed and not late and not story and randf() < chance else 0
		delivered += 1
		pay += base
		tips += tip
		latest_payment = base + tip
		money += latest_payment
		profile.data.wallet = int(profile.data.wallet) + latest_payment
		profile.data.xp = int(profile.data.xp) + 1
		var gain := .7 if tips_allowed and hits_at_start == hits else (.3 if hits - hits_at_start <= 1 else -.5)
		profile.data.skill = clampf(float(profile.data.skill) + (-2.5 if late else gain), 0, 10)
		if story:
			profile.data.gennady_paid = true


func fine(amount: int) -> void:
	var loss := mini(int(profile.data.wallet), amount)
	profile.data.wallet = int(profile.data.wallet) - loss
	penalties += loss
	money = maxi(0, money - loss)


func wait_for_dispatch(delta: float, near: bool) -> bool:
	if near and depot_time < 0:
		depot_time = 0
	if depot_time >= 0:
		depot_time += delta
	return depot_time >= .8


func finish(full: bool) -> Dictionary:
	var bonus := 1500 + 300 * delivered if full else 0
	var stars := 1 if full and delivered > 0 and hits == 0 else 0
	profile.data.wallet = int(profile.data.wallet) + bonus
	profile.data.stars = int(profile.data.stars) + stars
	profile.data.shifts = number
	var receipt := {"shift_number": number, "delivered": delivered, "missed": missed, "pay": pay,
		"tips": tips, "bonus": bonus, "penalties": penalties, "earned": money + bonus, "balance": profile.data.wallet,
		"hits": hits, "stars": stars, "reason": "Время смены вышло" if full else "Смена окончена", "minutes": floori(elapsed / 60)}
	var best: Dictionary = profile.data.get("best", {})
	if int(receipt.earned) > int(best.get("earned", 0)):
		profile.data.best = {"earned": receipt.earned, "delivered": delivered}
	profile.save()
	return receipt
