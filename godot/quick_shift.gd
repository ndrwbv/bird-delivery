extends "res://district_shift.gd"

var length_id := "medium"

func begin(career: RefCounted) -> void:
	super.begin(career)
	all_day = false
	daytime = false
	start_time = T0
	env_time = T0
	day_end = .82875
	slow = float({"short":.65,"medium":1.0,"long":1.3}.get(length_id,1.0))
	duration = (day_end - T0) * 480.0 * slow
	_schedule()

func settle(tips_allowed: bool, failed: bool, _story: bool, _rich_neighbor := Callable()) -> void:
	var career_xp := int(profile.data.xp)
	super.settle(tips_allowed,failed,false)
	profile.data.xp = career_xp
