extends RefCounted

const HULL := Vector2(0.92,2.33)


static func from_sweep(start: Vector3, stop_at: Vector3, heading: Basis, motion: Vector3,
					   position: Vector3, radius: float) -> Dictionary:
	var inverse := heading.transposed()
	var offset := inverse*(position-start)
	var travel := inverse*(stop_at-start)
	var expanded := HULL+Vector2.ONE*radius
	var entered := Vector2(-INF,-INF)
	var exited := Vector2(INF,INF)
	for axis in 2:
		var component := axis*2
		var velocity := travel[component]
		if absf(velocity) < 0.00001:
			if absf(offset[component]) > expanded[axis]:
				return {}
			continue
		var leading := signf(velocity)*expanded[axis]
		entered[axis] = (offset[component]-leading)/velocity
		exited[axis] = (offset[component]+leading)/velocity
	var when := maxf(entered.x,entered.y)
	if when > 1.0 or minf(exited.x,exited.y) < maxf(0.0,when):
		return {}
	var side := entered.x > entered.y
	var lateral := clampf((offset.x-travel.x*clampf(when,0.0,1.0))/HULL.x,-1.0,1.0)
	var face := Vector3(signf(travel.x),0.0,0.0) if side else Vector3(0.0,0.0,signf(travel.z))
	var normal := heading*face
	var speed := maxf(0.0,motion.dot(normal))
	if speed < 0.82:
		return {}
	var direction := normal*0.79+motion.normalized()*0.21
	if not side:
		direction += heading.x*lateral*absf(lateral)*0.42
	var contact := -normal*radius*0.73
	contact += heading.x*lateral*0.16 if not side else Vector3.ZERO
	contact.y = 0.39 if side else 0.51-absf(lateral)*0.085
	var lift := 0.14 if side else (1.0 if face.z < 0.0 else 0.38)*(1.0-absf(lateral)*0.52)
	return {"speed":speed,"direction":direction.normalized(),"offset":contact,"lift":lift}
