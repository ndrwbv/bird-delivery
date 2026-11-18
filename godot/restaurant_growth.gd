extends RefCounted

const AT := [0,8,20,40,70]
const PAY := [.95,1.0,1.04,1.08,1.12]
const TIPS := [-.05,0.0,.03,.06,.10]
const SIZE := [-1,0,0,0,1]
const COURIERS := [1,2,3,4,4]


static func count(profile: Dictionary) -> int:
	return int(profile.get("south_growth",profile.get("deliveries",0)))


static func stage(profile: Dictionary) -> int:
	var delivered := count(profile)
	var value := 0
	for i in range(1,AT.size()):
		if delivered >= AT[i]:
			value = i
	return value


static func received(profile: Dictionary) -> int:
	var before := stage(profile)
	profile.south_growth = count(profile)+1
	var now := stage(profile)
	return now+1 if now>before else 0
