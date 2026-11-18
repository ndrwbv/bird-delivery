extends Node3D

var wheel: Node3D
var needles: Array[Node3D] = []
var smooth_speed := 0.0
var smooth_rpm := 0.0

func _ready() -> void:
	var black := _material(Color("#29282a"))
	var wood := _material(Color("#5f4537"))
	var steel := _material(Color("#515155"))
	var orange := _material(Color("#e66c37"))
	var dash := BoxMesh.new()
	dash.size = Vector3(1.67,.17,.36)
	_mesh(self,dash,black,Vector3(0,1.095,-.81))
	var cover := BoxMesh.new()
	cover.size = Vector3(.49,.19,.11)
	_mesh(self,cover,wood,Vector3(-.42,1.18,-.62))
	for i in 2:
		var gauge := Node3D.new()
		add_child(gauge)
		gauge.position = Vector3(-.535+.225*i,1.188,-.556)
		gauge.rotation.x = -.22
		var face := QuadMesh.new()
		face.size = Vector2(.165,.165)
		var ink := _material(Color.WHITE)
		ink.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ink.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		var path := "res://assets/game_menu/dial-"+("speed" if i==0 else "rpm")+".png"
		ink.albedo_texture = ImageTexture.create_from_image(Image.load_from_file(path))
		_mesh(gauge,face,ink,Vector3.ZERO)
		var axle := Node3D.new()
		gauge.add_child(axle)
		axle.position.z = .002
		var needle := BoxMesh.new()
		needle.size = Vector3(.003,.057,.003)
		_mesh(axle,needle,orange,Vector3(0,.028,0))
		needles.append(axle)
	var mount := Node3D.new()
	add_child(mount)
	mount.position = Vector3(-.425,1.03,-.29)
	mount.rotation.x = -.40
	wheel = Node3D.new()
	mount.add_child(wheel)
	var rim := TorusMesh.new()
	rim.inner_radius = .166
	rim.outer_radius = .193
	rim.rings = 40
	rim.ring_segments = 8
	var steering := _mesh(wheel,rim,black,Vector3.ZERO)
	steering.rotation.x = PI*.5
	for direction in [-1,1]:
		var spoke := BoxMesh.new()
		spoke.size = Vector3(.157,.025,.026)
		var arm := _mesh(wheel,spoke,steel,Vector3(direction*.095,-.022,0))
		arm.rotation.z = direction*-.20
	var horn := BoxMesh.new()
	horn.size = Vector3(.118,.078,.037)
	_mesh(wheel,horn,black,Vector3(0,0,.014))

func _material(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = .86
	return m

func _mesh(parent: Node3D, geometry: Mesh, material: Material, at: Vector3) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = geometry
	part.material_override = material
	part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(part)
	part.position = at
	return part

func step(delta: float, car: CharacterBody3D) -> void:
	smooth_speed = lerpf(smooth_speed,absf(car.speed)*3.6,1.0-exp(-9.0*delta))
	smooth_rpm = lerpf(smooth_rpm,car.engine.rpm,1.0-exp(-9.0*delta))
	needles[0].rotation.z = 2.356-clampf(smooth_speed/200.0,0,1.03)*4.712
	needles[1].rotation.z = 2.356-clampf(smooth_rpm/8000.0,0,1.03)*4.712
	wheel.rotation.z = -car.steer_visual*5.0
