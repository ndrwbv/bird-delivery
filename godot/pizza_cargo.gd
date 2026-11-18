extends Node3D

const ART := "res://assets/pizza-logo.png"
const HEIGHT := .09
const MAX_COUNT := 8
static var body: BoxMesh
static var lid: PlaneMesh
var trays: Node3D
var label: MeshInstance3D
var count := 0
var wobble := 0.0


func setup(number: int) -> void:
	if body == null:
		_make_materials()
	trays = Node3D.new()
	add_child(trays)
	label = MeshInstance3D.new()
	label.mesh = lid
	add_child(label)
	resize(number)


func resize(number: int) -> void:
	number = clampi(number,1,MAX_COUNT)
	while count > number:
		var upper := trays.get_child(count-1)
		trays.remove_child(upper)
		upper.queue_free()
		count -= 1
	while count < number:
		var tray := MeshInstance3D.new()
		tray.mesh = body
		var tilt := float(count%3)-1.0
		tray.position = Vector3(tilt*.012,count*HEIGHT,float(count%2)*.017)
		tray.rotation.y = tilt*.055
		trays.add_child(tray)
		count += 1
	label.position = trays.get_child(count-1).position+Vector3.UP*(HEIGHT*.5+.001)
	label.rotation.y = trays.get_child(count-1).rotation.y
	trays.rotation.z = 0
	set_process(count > 6)


func _process(delta: float) -> void:
	wobble += delta
	trays.rotation.z = sin(wobble*7.0)*float(count-6)*.032
	label.rotation.z = trays.rotation.z
	label.position = trays.transform*Vector3(0,(count-.5)*HEIGHT+.001,0)


static func _make_materials() -> void:
	var orange := StandardMaterial3D.new()
	orange.albedo_color = Color("#f0522a")
	orange.roughness = .92
	body = BoxMesh.new()
	body.size = Vector3(.36,HEIGHT,.36)
	body.material = orange
	var print := StandardMaterial3D.new()
	if ResourceLoader.exists(ART):
		print.albedo_texture = load(ART)
	else:
		var pixels := Image.load_from_file(ART)
		if pixels:
			print.albedo_texture = ImageTexture.create_from_image(pixels)
	print.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	print.alpha_scissor_threshold = .25
	print.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	print.roughness = .92
	lid = PlaneMesh.new()
	lid.size = Vector2(.22,.22)
	lid.material = print
