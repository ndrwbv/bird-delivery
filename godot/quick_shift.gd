extends "res://district_shift.gd"

var length_id := "medium"

func begin(career: RefCounted) -> void:
	super.begin(career)
	day_end = .82875
	slow = float({"short":.65,"medium":1.0,"long":1.3}.get(length_id,1.0))
	duration = (day_end - T0) * 480.0 * slow
	sun_rate = (.01/1.5 + .55 + .15/1.5 + (day_end-.77)/2.0) / duration

func settle(tips_allowed: bool, failed: bool, _story: bool) -> void:
	var career_xp := int(profile.data.xp)
	super.settle(tips_allowed,failed,false)
	profile.data.xp = career_xp
