extends StaticBody3D

const PART := preload("res://south_worksite_mesh.gd")
const DIR := "res://assets/evening-club/"
const OPEN_COLORS := {"wallM":"ffffff","floorM":"3a1238","ceilM":"1c0820","sideM":"5a1a62","glassM":"ff9ad8","signMat":"ffffff","tubeA":"ff4fb0","tubeB":"b46cff","edgeM":"ff4fb0"}
const CLOSED_COLORS := {"wallM":"141218","floorM":"0e0c10","ceilM":"0c0a0e","sideM":"121016","glassM":"1c2630","signMat":"3a3036","tubeA":"2a1a26","tubeB":"221a2a","edgeM":"1a1018"}
var director: Node3D
var info: Dictionary
var center: Vector2
var room_file: FileAccess
var meshes := {}
var surfaces := {}
var actors: Array[Dictionary] = []
var guests: Array[Dictionary] = []
var beams: Array[MeshInstance3D] = []
var textures := {}
var pool: MeshInstance3D
var crowd := Node3D.new()
var sensor := VisibleOnScreenNotifier3D.new()
var collider := CollisionShape3D.new()
var section := 0
var ready_room := false
var open := false
var elapsed := 0.0
var flicker := 2.0
var tube := 0.0
var light_phase := false
var language := ""
var streaming := {}

func setup(host: Node3D) -> void:
	director = host
	collision_layer = 0
	collision_mask = 0
	hide()
	if not host.garage_zone.adults:
		return
	info = JSON.parse_string(FileAccess.get_file_as_string(DIR+"room.json"))
	center = Vector2(info.center[0],info.center[1])
	position = Vector3(info.at[0],host.ground.at(info.at[0],info.at[1])+float(info.floor),info.at[1])
	rotation.y = info.yaw
	add_child(crowd)
	sensor.aabb = AABB(Vector3(-float(info.width)*0.5,0,0),Vector3(info.width,5.9,4.6))
	add_child(sensor)
	var shape := BoxShape3D.new()
	shape.size = Vector3(info.width,3.8,4.6)
	collider.shape = shape
	collider.position = Vector3(0,1.9,2.3)
	add_child(collider)
	crowd.hide()

func _paint(key: String) -> StandardMaterial3D:
	if surfaces.has(key):
		return surfaces[key]
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	if key!="architecture":
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if key in ["glassM","poolM","beam"]:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if key=="poolM" or key=="beam":
		material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		material.albedo_color = Color("#ff4fb04d") if key=="poolM" else Color("#ff6ad029")
	surfaces[key] = material
	return material

func _texture(key: String) -> Texture2D:
	if textures.has(key):
		return textures[key]
	var path := DIR+key+".png"
	var texture: Texture2D
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image!=null:
			image.generate_mipmaps()
			texture = ImageTexture.create_from_image(image)
	elif ResourceLoader.exists(path):
		texture = load(path)
	textures[key] = texture
	return texture

func _language() -> void:
	var next := "ru" if TranslationServer.get_locale().begins_with("ru") else "en"
	if language!=next:
		language = next
		_paint("signMat").albedo_texture = _texture("sign-"+language)

func _section() -> void:
	if room_file==null:
		room_file = FileAccess.open(DIR+"room.bin",FileAccess.READ)
	if section<info.parts.size():
		var key: String = info.parts[section]
		var mesh := PART.next(room_file,_paint(key))
		meshes[key] = mesh
		if key not in ["guest","arm"]:
			var view := PART.instance(self,mesh)
			if key=="poolM":
				pool = view
				pool.hide()
		section += 1
		return
	room_file = null
	for plane in info.planes:
		var quad := QuadMesh.new()
		quad.size = Vector2(plane.size[0],plane.size[1])
		quad.material = _paint(plane.key)
		PART.instance(self,quad,_vec(plane.at))
	_language()
	_paint("wallM").albedo_texture = _texture("wall")
	for q in info.guests:
		var person := PART.instance(crowd,meshes.guest,_vec(q.at))
		var arm := PART.instance(person,meshes.arm,Vector3(0.3,0.95,0))
		guests.append({"node":person,"arm":arm,"up":0.0,"phase":float(q.ph)})
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.9
	cone.height = 3.2
	cone.radial_segments = 12
	cone.cap_bottom = false
	for point in info.beams:
		var beam := PART.instance(crowd,cone,_vec(point))
		beam.material_override = _paint("beam").duplicate()
		beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		beams.append(beam)
	ready_room = true
	_switch_hours(open)

static func _vec(p: Array) -> Vector3:
	return Vector3(p[0],p[1],p[2])

func _stream_actor() -> void:
	if actors.size()>=info.people.size():
		return
	var spec: Dictionary = info.people[actors.size()]
	if streaming.is_empty():
		var file := FileAccess.open(DIR+str(spec.file),FileAccess.READ)
		var base := PART.arrays_in(file)
		base[Mesh.ARRAY_NORMAL] = null
		var mesh := ArrayMesh.new()
		mesh.blend_shape_mode = Mesh.BLEND_SHAPE_MODE_RELATIVE
		streaming = {"file":file,"mesh":mesh,"base":base,"frames":[]}
	if streaming.frames.size()<int(spec.frames)-1:
		var data := PART.block(streaming.file)
		var frame := []
		frame.resize(Mesh.ARRAY_MAX)
		frame[Mesh.ARRAY_VERTEX] = data.decode_var(4)
		streaming.mesh.add_blend_shape("Pose%d"%streaming.frames.size())
		streaming.frames.append(frame)
		return
	var mesh: ArrayMesh = streaming.mesh
	var shapes: Array[Array] = []
	shapes.assign(streaming.frames)
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,streaming.base,shapes)
	mesh.surface_set_material(0,_paint("body"))
	var pivot := Node3D.new()
	crowd.add_child(pivot)
	pivot.position = Vector3(spec.x,0.5,1.05)
	var figure := PART.instance(pivot,mesh,Vector3(0,0,0.3))
	actors.append({"pivot":pivot,"figure":figure,"spec":spec,"last":[-1,-1]})
	streaming.clear()

func _switch_hours(now_open: bool) -> void:
	open = now_open
	if not ready_room:
		return
	crowd.visible = open
	pool.visible = open
	var palette := OPEN_COLORS if open else CLOSED_COLORS
	for key in palette:
		var color := Color(str(palette[key]))
		if key=="glassM":
			color.a = 0.12 if open else 0.85
		_paint(key).albedo_color = color

func reset() -> void:
	hide()
	collision_layer = 0
	elapsed = 0
	flicker = 2
	tube = 0
	_switch_hours(false)

func step(dt: float, observer: Vector2, hour: float) -> void:
	if info.is_empty():
		return
	var distance := center.distance_squared_to(observer)
	visible = distance<420.0*420.0
	collision_layer = 1 if visible else 0
	if not visible:
		return
	var now_open := hour>=17.0 or hour<6.0
	if now_open!=open:
		_switch_hours(now_open)
	if not ready_room:
		_section()
		return
	_language()
	if not open:
		return
	elapsed += dt
	flicker -= dt
	if flicker<=0:
		flicker = randf_range(3,7)
	var light := 0.35 if flicker<0.32 and int(flicker*30)%2==0 else 1.0
	_paint("signMat").albedo_color = Color(light,light,light)
	tube -= dt
	if tube<=0:
		tube = 0.45
		light_phase = not light_phase
		_paint("tubeA").albedo_color = Color("#ff4fb0") if light_phase else Color("#5a1a48")
		_paint("tubeB").albedo_color = Color("#4a2a6a") if light_phase else Color("#b46cff")
	if distance<210.0*210.0:
		_stream_actor()
	if distance<=150.0*150.0 and sensor.is_on_screen():
		_animate(dt)

func _animate(dt: float) -> void:
	for q in actors:
		var spec: Dictionary = q.spec
		var k := elapsed+float(spec.phase)
		var figure: MeshInstance3D = q.figure
		match spec.mode:
			"spin":
				q.pivot.rotate_y(dt*1.1)
				figure.rotation = Vector3(0,PI*0.5,sin(k*2)*0.12-0.15)
			"climb":
				q.pivot.rotate_y(dt*0.5)
				figure.position = Vector3(0,(sin(k*0.55)*0.5+0.5)*1.1,0.2)
				figure.rotation.z = sin(k*1.5)*0.08
			"sway":
				q.pivot.rotation.y = sin(k*0.4)*0.6
				figure.position = Vector3(0,absf(sin(k*2.4))*0.05,0.35)
				figure.rotation = Vector3(0,sin(k*0.8)*0.4,sin(k*2.4)*0.12)
		var frames := int(spec.frames)
		if frames>1:
			var pos := fposmod(elapsed,float(spec.period))/float(spec.period)*frames
			var i := floori(pos)
			for old: int in q.last:
				if old>=0:
					figure.set_blend_shape_value(old,0.0)
			var next := posmod(i+1,frames)-1
			if i>0:
				figure.set_blend_shape_value(i-1,1.0-fmod(pos,1.0))
			if next>=0:
				figure.set_blend_shape_value(next,fmod(pos,1.0))
			q.last[0] = i-1
			q.last[1] = next
	for guest in guests:
		guest.phase += dt
		if guest.up<=0 and randf()<dt*0.15:
			guest.up = randf_range(1.2,2.2)
		guest.up -= dt
		guest.arm.rotation.x = -2.6+sin(float(guest.phase)*8)*0.25 if guest.up>0 else 0.0
		guest.node.rotation.z = sin(float(guest.phase)*1.7)*0.03
	for i in beams.size():
		beams[i].rotation.z = sin(elapsed*0.9+i*2)*0.35
		beams[i].material_override.albedo_color = Color.from_hsv(0.8+sin(elapsed*0.5+i)*0.12,0.8,1,0.16)
