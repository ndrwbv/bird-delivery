extends CharacterBody3D

const ROAD_LAYER := 32
const OBSTACLES := 1 | 2 | 4 | 8 | 16 | ROAD_LAYER

var terrain: RefCounted
var route := PackedVector3Array()
var limits := PackedFloat32Array()
var point := 0
var fraction := 0.0
var pace := 0.0
var coast := Vector3.ZERO
var going := false
var brake := false
const NOSE := 2.49
var visual: Node3D
var lamps: MeshInstance3D
var lamp_off: Material
var lamp_on: Material
var ray := PhysicsRayQueryParameters3D.new()


func setup(ground: RefCounted, model: PackedScene, at: Vector2, yaw: float) -> void:
	terrain = ground
	position = _surface(at)
	rotation.y = yaw
	collision_layer = ROAD_LAYER
	collision_mask = OBSTACLES
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	ray.collision_mask = OBSTACLES
	ray.exclude = [get_rid()]
	var box := BoxShape3D.new()
	box.size = Vector3(2.02,1.46,NOSE*2.0)
	var hull := CollisionShape3D.new()
	hull.shape = box
	hull.position.y = 0.88
	add_child(hull)
	visual = model.instantiate() as Node3D
	visual.get_node("PizzaRoofLight").free()
	for part: MeshInstance3D in visual.find_children("*", "MeshInstance3D", true, false):
		part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		part.visibility_range_end = 95.0 if part.name == &"Car_Interior_0" else 250.0
		part.visibility_range_end_margin = 8.0
	add_child(visual)
	set_physics_process(false)


func follow(path: Array, start: int, unlit: Material, lit: Material) -> void:
	for p: Array in path:
		route.append(_surface(Vector2(p[0],p[1])))
		limits.append(float(p[2]))
	point = start
	position = route[point]
	var forward := route[(point+1)%route.size()]-position
	rotation.y = atan2(-forward.x,-forward.z)
	pace = 5.0
	going = true
	lamp_off = unlit
	lamp_on = lit
	lamps = MeshInstance3D.new()
	var pair := BoxMesh.new()
	pair.size = Vector3(1.4,0.074,0.034)
	lamps.mesh = pair
	lamps.material_override = lamp_off
	lamps.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lamps.position = Vector3(0.0,0.72,NOSE+0.02)
	add_child(lamps)
	set_physics_process(true)
	reset_physics_interpolation()


func struck(strength: float, shot: Vector3) -> void:
	if strength < 2.7:
		return
	going = false
	coast += shot.normalized()*clampf(strength*0.26,1.0,9.0)
	visual.rotation.z = clampf(shot.normalized().dot(basis.x)*strength*0.004,-0.12,0.12)
	visual.position.y -= minf(0.085,strength*0.003)
	if lamps:
		lamps.material_override = lamp_on
	set_physics_process(true)


func _physics_process(delta: float) -> void:
	if not going:
		if coast.length_squared() < 0.015:
			set_physics_process(false)
			return
		var hit := move_and_collide(coast*delta)
		if hit:
			var normal := hit.get_normal()
			coast = coast.slide(normal)
			coast.y = 0.0
		position.y = terrain.at(position.x,position.z)+0.04
		coast *= exp(-4.8*delta)
		return

	var want := _speed_ahead()
	var look := maxf(5.0,3.5+pace*0.73)
	var gap := _gap(look)
	want = minf(want,sqrt(maxf(0.0,gap-1.95)*7.0))
	var slowing := want < pace-0.1
	pace = move_toward(pace,want,(5.8 if slowing else 2.6)*delta)
	var show_brake := slowing or gap < 3.0
	if show_brake != brake:
		brake = show_brake
		lamps.material_override = lamp_on if brake else lamp_off
	_follow_step(pace*delta,delta)


func _follow_step(meters: float, delta: float) -> void:
	var old := point
	var old_fraction := fraction
	var left := meters
	var next := (point+1)%route.size()
	while left > 0.0001:
		var distance := maxf(0.005,route[point].distance_to(route[next]))
		var remaining := distance*(1.0-fraction)
		if left < remaining:
			fraction += left/distance
			break
		left -= remaining
		fraction = 0.0
		point = next
		next = (point+1)%route.size()
	var target := route[point].lerp(route[next],fraction)
	var forward := route[next]-route[point]
	var wanted := atan2(-forward.x,-forward.z)
	rotation.y = rotate_toward(rotation.y,wanted,delta*1.75)
	var move := target-position
	var hit := move_and_collide(move)
	if hit:
		point = old
		fraction = old_fraction
		pace = 0.0


func _speed_ahead() -> float:
	var want := limits[point]
	var distance := 0.0
	var i := point
	for n in 12:
		var next := (i+1)%route.size()
		distance += route[i].distance_to(route[next])
		want = minf(want,sqrt(pow(limits[next],2.0)+6.0*distance))
		if distance > 22.0:
			break
		i = next
	return want


func _gap(distance: float) -> float:
	var forward := -basis.z
	var nearest := distance+7.0
	for lane in [-0.67,0.0,0.67]:
		ray.from = global_position+Vector3.UP*0.66+basis.x*float(lane)+forward*(NOSE-0.20)
		ray.to = ray.from+forward*distance
		var contact := get_world_3d().direct_space_state.intersect_ray(ray)
		if not contact.is_empty():
			var at: Vector3 = contact.position
			nearest = minf(nearest,ray.from.distance_to(at))
	return nearest


func _surface(at: Vector2) -> Vector3:
	return Vector3(at.x,terrain.at(at.x,at.y)+0.04,at.y)
