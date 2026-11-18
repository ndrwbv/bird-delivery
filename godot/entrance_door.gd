extends Node3D

var leaf := Node3D.new()
var opening: Tween
var entering := 0


func setup(at: Vector3, facing: Vector3, trim: Material, panel: Material, metal: Material) -> void:
	position = at
	rotation.y = atan2(facing.x,facing.z)
	var interior := StandardMaterial3D.new()
	interior.albedo_color = Color("#261d14")
	interior.emission_enabled = true
	interior.emission = Color("#794d25")
	interior.emission_energy_multiplier = 0.32
	_face(self,Vector3(1.29,2.16,0.05),Vector3(0.0,0.0,-0.033),interior)
	for side in [-1.0,1.0]:
		_face(self,Vector3(0.12,2.26,0.13),Vector3(side*0.675,0.0,0.0),trim)
	_face(self,Vector3(1.47,0.11,0.13),Vector3(0.0,1.075,0.0),trim)
	add_child(leaf)
	leaf.position = Vector3(-0.605,-0.025,0.058)
	_face(leaf,Vector3(1.21,2.10,0.062),Vector3(0.605,0.0,0.029),panel)
	_face(leaf,Vector3(0.36,0.055,0.05),Vector3(0.86,0.085,0.078),metal)
	_face(leaf,Vector3(0.30,0.14,0.035),Vector3(0.605,0.83,0.074),metal)
	_face(self,Vector3(0.082,0.22,0.048),Vector3(-0.63,0.055,0.083),metal)


func passage() -> Vector3:
	return to_global(Vector3(0.0,-1.1,-0.34))


func begin_entry() -> void:
	entering += 1
	if entering == 1:
		set_open(true)


func end_entry() -> void:
	entering = maxi(0,entering-1)
	if entering == 0:
		set_open(false)

func set_open(active: bool) -> void:
	if opening:
		opening.kill()
	opening = create_tween().set_trans(Tween.TRANS_SINE)
	opening.tween_property(leaf,"rotation:y",-1.44 if active else 0.0,0.28)


func _face(parent: Node3D, size: Vector3, at: Vector3, paint: Material) -> void:
	var slab := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size
	shape.material = paint
	slab.mesh = shape
	slab.position = at
	parent.add_child(slab)
