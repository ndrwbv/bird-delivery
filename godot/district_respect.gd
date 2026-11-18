extends RefCounted

const GAIN := {
	"rivalCourier":3,"rivalCar":5,"rivalShop":10,"rivalMascot":2,"rivalFighter":2,
	"helpCrew":6,"honkCrew":3,"defend":8,"defendAlone":4,"thief":3,"helpedCivil":4,"burger":1,
	"ownCourier":-5,"ownCrew":-4,"passCrew":-3,"noDefend":-6,"marcher":-1,"chat":1,
}
const CAP := {"burger":10,"chat":4}
const THRESHOLDS := [20,60,130,250,450]
const TIPS := [1.0,1.03,1.05,1.08,1.10,1.15]
const GARAGE_DISCOUNT := [0.0,0.0,.03,.05,.08,.10]
var shift_gains := {}


func begin() -> void:
	shift_gains.clear()


func add(profile: Dictionary, reason: String) -> int:
	var points := int(GAIN.get(reason,0))
	if CAP.has(reason):
		var already := int(shift_gains.get(reason,0))
		points = mini(points,int(CAP[reason])-already)
		shift_gains[reason] = already+points
	var before := int(profile.get("respect",0))
	profile.respect = maxi(0,before+points)
	return int(profile.respect)-before


static func rank(profile: Dictionary) -> int:
	var points := int(profile.get("respect",0))
	var level := 0
	for threshold: int in THRESHOLDS:
		if points >= threshold:
			level += 1
	return level
