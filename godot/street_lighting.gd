extends Node3D

const SOURCE := "res://assets/south-streetlight"

var width := 0
var depth := 0
var bounds := Vector4.ZERO
var pixels: PackedByteArray
var sums: PackedByteArray
var losses: PackedByteArray
var image: Image
var field: ImageTexture
var lenses := MultiMeshInstance3D.new()
var lens_paint := StandardMaterial3D.new()
var patches: Dictionary = {}
var indices: Dictionary = {}
var scales: Dictionary = {}
var materials: Array[ShaderMaterial] = []
var last_night := -1.0


func setup(furniture: Node3D) -> void:
	var spec: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SOURCE+".json"))
	width = int(spec.width)
	depth = int(spec.depth)
	bounds = Vector4(spec.x,spec.z,width*float(spec.cell),depth*float(spec.cell))
	var bytes := FileAccess.get_file_as_bytes(SOURCE+".bin")
	var stride := width*depth*2
	pixels = bytes.slice(0,stride)
	sums = bytes.slice(stride,stride*2)
	losses = bytes.slice(stride*2)
	image = Image.create_from_data(width,depth,false,Image.FORMAT_RG8,pixels)
	field = ImageTexture.create_from_image(image)
	_make_lenses(spec.fixtures)
	furniture.prop_lost.connect(_light_lost)


func bind(material: ShaderMaterial) -> void:
	materials.append(material)
	material.set_shader_parameter(&"street_field",field)
	material.set_shader_parameter(&"street_field_bounds",bounds)
	material.set_shader_parameter(&"street_night",maxf(last_night,0.0))


func update_lights(night: float) -> void:
	if night == last_night:
		return
	last_night = night
	for material in materials:
		material.set_shader_parameter(&"street_night",night)
	lenses.visible = night > 0.02
	lens_paint.albedo_color = Color("#b5a590").lerp(Color("#ffe6ba"),night)


func _make_lenses(fixtures: Array) -> void:
	var lens := SphereMesh.new()
	lens.radius = 1.0
	lens.height = 2.0
	lens.radial_segments = 10
	lens.rings = 5
	lens_paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	lens.material = lens_paint
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = lens
	instances.instance_count = fixtures.size()
	for i in fixtures.size():
		var lamp: Dictionary = fixtures[i]
		var id := int(lamp.id)
		patches[id] = lamp.patch
		indices[id] = i
		scales[id] = float(lamp.scale)
		var at := Vector3(lamp.head[0],lamp.head[1],lamp.head[2])
		var axes := Basis.IDENTITY.scaled(Vector3(0.18,0.13,0.18))
		if lamp.street:
			var aim := Vector3(at.x-float(lamp.base[0]),0.0,at.z-float(lamp.base[2]))
			var yaw := atan2(-aim.z,aim.x)
			axes = Basis(Vector3.UP,yaw)*Basis.IDENTITY.scaled(Vector3(0.29,0.062,0.15))
			at.y -= 0.12
		instances.set_instance_transform(i,Transform3D(axes,at))
	lenses.multimesh = instances
	lenses.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lenses.hide()
	add_child(lenses)


func _light_lost(id: int) -> void:
	if not patches.has(id):
		return
	var patch: Array = patches[id]
	var left := int(patch[0])
	var top := int(patch[1])
	var columns := int(patch[2])
	var rows := int(patch[3])
	var entry := int(patch[4])
	for row in range(top,top+rows):
		for col in range(left,left+columns):
			var sample := (row*width+col)*2
			var remainder := sums.decode_u16(sample)-int(losses[entry])
			sums.encode_u16(sample,maxi(0,remainder))
			pixels[sample] = clampi(remainder,0,255)
			entry += 1
	image.set_data(width,depth,false,Image.FORMAT_RG8,pixels)
	field.update(image)
	patches.erase(id)
	lenses.multimesh.set_instance_transform(int(indices[id]),Transform3D(Basis.IDENTITY,Vector3.DOWN*1000.0))
