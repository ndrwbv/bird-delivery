extends MultiMeshInstance3D

const TRACK_MATERIAL := preload("res://tire_tracks.gdshader")
const MAX_SEGMENTS := 768
const SPACING := 0.46

var car: CharacterBody3D
var terrain: RefCounted
var previous: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO]
var active := [false,false]
var cursor := 0


func setup(vehicle: CharacterBody3D, ground: RefCounted) -> void:
	car = vehicle
	terrain = ground
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_custom_data = true
	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE
	var paint := ShaderMaterial.new()
	paint.shader = TRACK_MATERIAL
	plane.material = paint
	multimesh.mesh = plane
	multimesh.instance_count = MAX_SEGMENTS
	multimesh.visible_instance_count = 0
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	process_physics_priority = 8


func break_tracks() -> void:
	active = [false,false]


func _physics_process(_delta: float) -> void:
	if absf(car.speed) < 0.8 or car.controls_locked:
		break_tracks()
		return
	for i in 2:
		var p: Vector3 = car.wheel_at[i+2]
		p.y = terrain.at(p.x,p.z)
		var loose: bool = terrain.material_at(p.x,p.z) != 0
		var drawing: bool = loose or car.skid > 1.5
		if drawing and active[i]:
			var span := p - previous[i]
			if span.length() > SPACING:
				if span.length() < 2.6:
					_add_segment(previous[i],p,loose)
				previous[i] = p
		else:
			previous[i] = p
		active[i] = drawing


func _add_segment(a: Vector3, b: Vector3, loose: bool) -> void:
	var axis := b-a
	var sideways := Vector3.UP.cross(axis).normalized()
	var up := axis.normalized().cross(sideways)
	var basis := Basis(sideways*(0.23 if loose else 0.18),up,axis*1.1)
	var center := (a+b)*0.5 + Vector3.UP*(0.041 if loose else 0.032)
	multimesh.set_instance_transform(cursor,Transform3D(basis,center))
	multimesh.set_instance_custom_data(cursor,Color(1.0 if loose else 0.0,0.0,0.0,1.0))
	cursor += 1
	multimesh.visible_instance_count = maxi(multimesh.visible_instance_count,cursor)
	cursor %= MAX_SEGMENTS
