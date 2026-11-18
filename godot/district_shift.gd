extends RefCounted

const DONATIONS := preload("res://district_donations.gd")
const RESPECT := preload("res://district_respect.gd")
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
const UNLOCK_AT := [4,9,14,20,26,33,40]
var tier := 0
var level := 1
var orders := 0
var delivered := 0
var missed := 0
var money := 0
var pace := "normal"
var lunch_tips := false
var meal_taken := false
var rim_issued := false
var client_zone := "normal"
var people := 1
var fee := 0
var tips := 0
var pay := 0
var penalties := 0
var client_fine := 0
var knocked := 0
var hits := 0
var hits_at_start := 0
var issued_deadline := 0.0
var deadline := 0.0
var settled := false
var return_fined := false
var depot_time := -1.0
var latest_payment := 0


func begin(career: RefCounted) -> void:
	profile = career
	number = int(profile.data.shifts) + 1
	for threshold in UNLOCK_AT:
		if int(profile.data.get("counted",0)) >= threshold:
			tier += 1
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
	if elapsed + .000001 >= duration and elapsed - delta + .000001 < duration:
		env_time = day_end
		return
	if elapsed + .000001 >= duration:
		if day_end < .62:
			env_time = minf(.615, env_time + delta * .15 / (480.0 * slow))
		else:
			env_time = fmod(env_time + delta / (480.0 * slow), 1.0)
	else:
		var tempo := 1.5 if env_time < .07 or env_time >= .62 else 1.0
		if env_time >= .77:
			tempo = 2.0
		env_time += delta * sun_rate * tempo


func hour() -> float:
	var t := env_time + 1.0 if env_time < T0 else env_time
	for i in range(1, HOURS.size()):
		var a: Vector2 = HOURS[i-1]
		var b: Vector2 = HOURS[i]
		if t <= b.x:
			return lerpf(a.y,b.y,inverse_lerp(a.x,b.x,t))
	return 9.0


func clock_text() -> String:
	var minutes := floori(hour() * 60.0 + .0001) % 1440
	return "%02d:%02d" % [minutes / 60, minutes % 60]


func quote(order: Dictionary) -> int:
	var xp := int(profile.data.xp)
	var courier_level := 1 + int(xp >= 3) + int(xp >= 8) + int(xp >= 15) + int(xp >= 25)
	var factor := 1.0+.03*courier_level
	if order.get("zone","normal") == "gang":
		factor *= 1.4
	if order.get("kind","solo") == "urgent":
		factor *= 2.5
	if order.get("edge",false):
		factor *= 1.4
	var base := roundi((640 + 1.12 * float(order.meters)) * factor / 10.0) * 10
	var people_here := maxi(1,int(order.get("people",1)))
	var boxes := maxi(people_here,int(order.get("boxes",people_here)))
	var portions := float(people_here-1)+.5*float(boxes-people_here)
	base += roundi(portions*roundi(640*factor/10))*10
	var fee_before_event := roundi(base * (1.0 + .05*tier) * (1.1 if pace == "tight" else 1.0) / 10.0) * 10
	return fee_before_event + int(order.get("pz",{}).get("add",0))


func next_stop(order: Dictionary) -> void:
	fee = quote(order)
	people = int(order.get("people",1))
	client_zone = str(order.get("zone","normal"))
	settled = false
	hits_at_start = hits
	latest_payment = 0


func accept(order: Dictionary, manifest: RefCounted = null) -> void:
	orders += 1
	next_stop(order)
	var distance := float(manifest.total_meters) if manifest else float(order.meters)
	var count := int(manifest.stops) if manifest else 1
	var wave := floori((orders - 1) / 3.0)
	var slack := lerpf(maxf(1.3, 2.0 - .18 * wave), maxf(1.12, 1.32 - .05 * wave), ((orders - 1) % 3) * .5) - .03 * (level - 1)
	var skill_time := lerpf(1.2, 1.0, clampf(float(profile.data.skill) / 5.0, 0, 1))
	deadline = maxf(16, distance / 19.0 * slack + 5.0 + count*4)
	if manifest and manifest.kind == "urgent":
		deadline = maxf(20, distance/22.0 + 6)
	elif count > 1:
		deadline = maxf(deadline * manifest.time_factor, distance / 19.0 * 1.05 + 5 + count*4)
	deadline *= (1.0 if order.get("story",false) else skill_time) * (1.25 if pace == "generous" else (.92 if pace == "tight" else 1.0))
	settled = false
	issued_deadline = deadline
	return_fined = false
	hits_at_start = hits
	depot_time = -1.0
	latest_payment = 0


func settle(tips_allowed: bool, failed: bool, story: bool, rich_neighbor := Callable()) -> void:
	if settled:
		return
	settled = true
	if failed:
		missed += 1
		client_fine += fee
		fine(fee)
	else:
		var late := deadline <= 0
		var base := roundi(fee * .45) if late else fee
		var clean := clampf(float(profile.data.get("trash_donated",0))/DONATIONS.TRASH_GOAL,0.0,1.0)
		var regional_tip: float = {"gang":-.05,"rich":.35,"poor":-.10}.get(client_zone,0.0)
		var chance := .25 + .1*clean + regional_tip + (.25 if pace == "generous" else (-.05 if pace == "tight" else 0.0))
		var multiplier: float = RESPECT.TIPS[RESPECT.rank(profile.data)] * (1.5 if pace == "generous" else 1.0)
		if lunch_tips:
			chance += .2
			multiplier *= 1.3
		var tip := 0
		if tips_allowed and not late and not story:
			var rich := client_zone=="rich"
			var ordinary := randf() < chance
			var rich_bonus := not ordinary and not rich and rich_neighbor.is_valid() and int(rich_neighbor.call())>0
			if ordinary or rich_bonus:
				var amount := randf_range(.3,1.0) if rich or rich_bonus else randf_range(.1,.4)
				tip = roundi(fee * amount * multiplier / 10.0) * 10
		delivered += people
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


func refuse_urgent() -> void:
	if settled:
		return
	settled = true
	missed += 1
	fine(maxi(400,roundi(fee * .3 / 10) * 10))
	profile.data.skill = maxf(0, float(profile.data.skill) - 3)


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
	var bonus := roundi((1500 + 300 * delivered) * (1.0 + .05*tier) / 10) * 10 if full else 0
	var stars := 1 if full and delivered > 0 and hits == 0 else 0
	profile.data.wallet = int(profile.data.wallet) + bonus
	profile.data.stars = int(profile.data.stars) + stars
	profile.data.shifts = number
	if delivered >= 3:
		profile.data.counted = int(profile.data.get("counted",0)) + 1
	profile.data.deliveries = int(profile.data.get("deliveries",0)) + delivered
	profile.data.knocked = int(profile.data.get("knocked",0)) + knocked
	var receipt := {"shift_number": number, "delivered": delivered, "missed": missed, "pay": pay,
		"tips": tips, "bonus": bonus, "penalties": penalties, "earned": money + bonus, "balance": profile.data.wallet,
		"hits": hits, "knocked":knocked, "stars": stars,
		"reason": "Время смены вышло" if full else "Смена окончена", "minutes": floori(elapsed / 60)}
	var best: Dictionary = profile.data.get("best", {})
	if int(receipt.earned) > int(best.get("earned", 0)):
		profile.data.best = {"earned": receipt.earned, "delivered": delivered}
	profile.save()
	return receipt
