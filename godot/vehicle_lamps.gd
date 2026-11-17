extends Node3D

var brake_lamps: Array[MeshInstance3D] = []
var reverse_lamps: Array[MeshInstance3D] = []
var headlamps: Array[MeshInstance3D] = []
var beams: Array[SpotLight3D] = []
var rear_glow: OmniLight3D
var damage_levels := PackedInt32Array([0,0,0,0])


func _ready() -> void:
	var amber_white := Color("#fff2ce")
	var brake_red := Color("#f63526")
	var cool_white := Color("#f1f1dc")
	for side in [-1.0,1.0]:
		headlamps.append(_lamp(Vector3(side*0.59,0.79,-2.292),Vector2(0.26,0.115),amber_white))
		brake_lamps.append(_lamp(Vector3(side*0.62,0.85,2.22),Vector2(0.32,0.076),brake_red))
		reverse_lamps.append(_lamp(Vector3(side*0.46,0.75,2.22),Vector2(0.10,0.064),cool_white))
		var beam := SpotLight3D.new()
		beam.position = Vector3(side*0.59,0.83,-2.52)
		beam.rotation.x = -0.138
		beam.rotation.y = -side*0.045
		beam.spot_range = 45.0
		beam.spot_angle = 27.0
		beam.spot_attenuation = 0.81
		beam.light_color = amber_white
		add_child(beam)
		beams.append(beam)
	rear_glow = OmniLight3D.new()
	rear_glow.position = Vector3(0.0,0.66,2.43)
	rear_glow.omni_range = 3.2
	rear_glow.light_color = brake_red
	add_child(rear_glow)
	update_lamps(false,false,false)


func update_lamps(head: bool, brake: bool, reverse: bool) -> void:
	var rear_energy := 0.0
	for i in 2:
		var front := _strength(i)
		var rear := _strength(i+2)
		headlamps[i].visible = head and front > 0.0
		headlamps[i].material_override.emission_energy_multiplier = front
		brake_lamps[i].visible = (brake or head) and rear > 0.0
		brake_lamps[i].material_override.emission_energy_multiplier = rear*(1.4 if brake else 0.50)
		reverse_lamps[i].visible = reverse and rear > 0.0
		beams[i].visible = head and front > 0.0
		beams[i].light_energy = front*6.1
		rear_energy += rear
	rear_glow.visible = (brake or head) and rear_energy > 0.0
	rear_glow.light_energy = rear_energy*(0.56 if brake else 0.17)


func _strength(index: int) -> float:
	match damage_levels[index]:
		1: return 0.55 if sin(Time.get_ticks_msec()*0.037+index*7.3) > -0.89 else 0.0
		2: return 0.0
	return 1.0


func _lamp(at: Vector3, area: Vector2, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(area.x,area.y,0.047)
	var paint := StandardMaterial3D.new()
	paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	paint.albedo_color = color
	paint.emission_enabled = true
	paint.emission = color
	paint.emission_energy_multiplier = 0.70
	node.mesh = box
	node.material_override = paint
	node.position = at
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	return node
