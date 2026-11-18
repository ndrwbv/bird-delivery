extends Node3D

const POSE := preload("res://delivery_actor_pose.gd")
var person: Node3D
var vehicle: Node3D
var towel := MeshInstance3D.new()
var pose := POSE.new()
var angle := 0.0
var clock := 0.0
var sitting := false

func setup(actor: Node3D, car: Node3D, yaw: float, shade: Color) -> void:
	person = actor
	vehicle = car
	angle = yaw
	var cloth := BoxMesh.new()
	cloth.size = Vector3(.9,.02,1.9)
	var paint := StandardMaterial3D.new()
	paint.albedo_color = shade
	paint.roughness = 1
	cloth.material = paint
	towel.mesh = cloth
	towel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(towel)
	towel.position.y = .065
	towel.rotation.y = yaw
	towel.set_as_top_level(true)
	towel.global_position = actor.global_position+Vector3.UP*.065
	towel.global_rotation.y = yaw
	pose.setup(actor.model)
	person.player.pause()
	_lie()

func _lie() -> void:
	person.model.rotation = Vector3(PI*.5,0,0)
	person.rotation.y = angle
	person.model.position = Vector3(0,.26,-.88)

func _physics_process(delta: float) -> void:
	if person.defeated or person.knockdown>0 or person.stunned>0 or person.received or person.player.current_animation in ["carry","exchange"]:
		pose.sit(0)
		person.model.rotation = Vector3.ZERO
		person.model.position = Vector3.ZERO
		towel.hide()
		set_physics_process(false)
		return
	clock += delta
	var offset := vehicle.global_position-person.global_position
	var near := Vector2(offset.x,offset.z).length_squared() < 196.0
	if near:
		person.rotation.y = atan2(offset.x,offset.z)
		person.model.rotation = Vector3.ZERO
		person.model.position = Vector3.DOWN*.53
		pose.sit(1,-2.05+sin(clock*9)*.35)
	elif sitting:
		pose.sit(0)
		_lie()
	sitting = near
