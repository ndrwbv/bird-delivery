extends Node3D

# Stair layout and dimensions from stairs3d.js. All four flats use their original left-to-right order.
const FLOORS := 9
const HEIGHT := 2.8
const RUN := 2.7
const FACE_Z := -1.6
const LEFT := -8.1
const TARGET := 10
var assets: Dictionary
const DOOR_COLORS := ["#70442b", "#493c33", "#643a36", "#404f51"]

var camera := Camera3D.new()
var feet := Vector3(-0.32, 0, -0.05)
var yaw := PI + atan2(0.37, 0.83) + 0.5
var pitch := 0.0
var breath := 1.0
var exhausted := false
var eye_height := 1.58
var travelled := 0.0
var nearby_flat := 0
var hinges: Array[Node3D] = []
var actor := Sprite3D.new()
var hall_light := OmniLight3D.new()
var cabinet_light := OmniLight3D.new()
var door_shade := StandardMaterial3D.new()
var bulb_material := StandardMaterial3D.new()
var base_pose := Vector3.ZERO
var base_yaw := 0.0
var base_pitch := 0.0
var boxes: Dictionary = {}
var paints: Dictionary = {}
var portrait_state := ""
var unit_box := BoxMesh.new()
var floors_built := 0

func _ready() -> void:
	var settings := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#171914")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#e6ded0")
	env.ambient_light_energy = 0.65
	settings.environment = env
	add_child(settings)
	var light := DirectionalLight3D.new()
	light.light_energy = 0.65
	light.rotation_degrees = Vector3(-48, -27, 0)
	add_child(light)
	camera.fov = 68
	camera.near = 0.035
	add_child(camera)
	camera.current = true
	_update_camera(1.0)

func build_slice() -> bool:
	# Space the nine floors over several frames while the first-person view is hidden.
	var started := Time.get_ticks_usec()
	while floors_built < FLOORS:
		_make_floor(floors_built)
		floors_built += 1
		if Time.get_ticks_usec() - started >= 1400:
			return false
	_make_flat()
	_commit_boxes()
	return true

func sound_clip(id: String) -> AudioStream:
	return assets[id]

static func door_x(slot: int) -> float:
	return -1.2 - (3 - slot) * 1.85

func _make_floor(f: int) -> void:
	var y := f * HEIGHT
	_box(Vector3(LEFT, y - 0.14, -1.66), Vector3(0.08, y, 1.55), "#8b8072")
	_box(Vector3(LEFT - 0.12, y, -1.68), Vector3(LEFT, y + HEIGHT, 1.58), "#c0bba6")
	_box(Vector3(LEFT, y, 1.54), Vector3(4.2, y + 1.18, 1.67), "#56715d")
	_box(Vector3(LEFT, y + 1.18, 1.54), Vector3(4.2, y + HEIGHT, 1.67), "#c8c0ac")
	# A light-blue window faces the building's exterior at every half-landing.
	_box(Vector3(4.12, y, -1.68), Vector3(4.21, y + HEIGHT, 1.68), "#ada695")
	_box(Vector3(4.04, y + 1.62, -0.87), Vector3(4.11, y + 2.65, 0.86), "#6e91a2")
	_box(Vector3(4.0, y + 1.59, -0.95), Vector3(4.12, y + 1.65, 0.91), "#eadfcb")
	_box(Vector3(4.01, y + 1.62, -0.035), Vector3(4.11, y + 2.65, 0.035), "#e1d8bf")
	var cursor := LEFT
	for slot in 4:
		var x := door_x(slot)
		_landing_wall(cursor, x - 0.75, y)
		cursor = x + 0.75
		_box(Vector3(x - 0.78, y + 2.46, FACE_Z - 0.1), Vector3(x + 0.78, y + HEIGHT, FACE_Z), "#c5bdab")
		var hinge := Node3D.new()
		hinge.position = Vector3(x - 0.75, y, FACE_Z)
		add_child(hinge)
		hinges.append(hinge)
		_part(hinge, Vector3(0.75, 1.23, 0), Vector3(1.49, 2.46, 0.055), DOOR_COLORS[slot])
		_part(hinge, Vector3(1.32, 1.0, 0.055), Vector3(0.12, 0.045, 0.065), "#b7a37b")
		_part(hinge, Vector3(0.75, 1.65, 0.035), Vector3(0.35, 0.16, 0.02), "#44382c")
		_label(hinge, str(f * 4 + slot + 1), Vector3(0.75, 1.65, 0.052), 0.0027)
		if f * 4 + slot + 1 != TARGET:
			_box(Vector3(x-0.76, y, FACE_Z-0.63), Vector3(x+0.76, y+2.46, FACE_Z-0.60), "#3b322a")
		_box(Vector3(x - 0.54, y + 0.002, FACE_Z + 0.03), Vector3(x + 0.54, y + 0.016, FACE_Z + 0.42), "#55473a")
	_landing_wall(cursor, 4.14, y)
	_label(self, tr("Этаж %d") % (f + 1), Vector3(-0.03, y + 1.67, FACE_Z + 0.025), 0.006)
	if f == 0:
		_photo(assets["gennady-chairman"], Vector3(4.10, y + 2.94, -1.17), -PI/2, Vector2(0.67, 1.1))
	if f == FLOORS - 1:
		_box(Vector3(LEFT, y + HEIGHT, -1.70), Vector3(4.20, y + HEIGHT + 0.1, 1.70), "#c5bfac")
		return
	_box(Vector3(RUN, y + 1.24, -1.58), Vector3(4.12, y + 1.4, 1.55), "#8f8576")
	for n in 9:
		var rise := (n + 1) * 1.4 / 9.0
		_box(Vector3(n * 0.3, y + rise - 0.24, 0.12), Vector3((n + 1) * 0.3, y + rise, 1.45), "#9b9182")
		_box(Vector3(RUN - (n + 1) * 0.3, y + 1.4 + rise - 0.24, -1.5), Vector3(RUN - n * 0.3, y + 1.4 + rise, -0.17), "#9b9182")
	for k in 4:
		var q := k / 3.0
		_box(Vector3(RUN*q, y+1.4*q, 0.10), Vector3(RUN*q+0.035, y+1.4*q+0.83, 0.14), "#555946")
		_box(Vector3(RUN*q, y+HEIGHT-1.4*q, -0.18), Vector3(RUN*q+0.035, y+HEIGHT-1.4*q+0.83, -0.14), "#555946")
	_rail(Vector3(0, y+0.83, 0.12), Vector3(RUN, y+2.23, 0.12))
	_rail(Vector3(RUN, y+2.23, -0.16), Vector3(0, y+HEIGHT+0.83, -0.16))

func _landing_wall(a: float, b: float, y: float) -> void:
	_box(Vector3(a, y, FACE_Z - 0.16), Vector3(b, y + 1.20, FACE_Z), "#587964")
	_box(Vector3(a, y + 1.20, FACE_Z - 0.16), Vector3(b, y + HEIGHT, FACE_Z), "#c5bdab")

func _make_flat() -> void:
	var x := door_x(1)
	var y := 2 * HEIGHT
	var left := x - 1.15
	var right := x + 1.15
	_box(Vector3(left, y - 0.05, -9.65), Vector3(right, y, FACE_Z), "#865e40")
	_box(Vector3(left, y + 2.58, -9.65), Vector3(right, y + 2.64, FACE_Z), "#d8cbb5")
	for side in [left, right]:
		_box(Vector3(side - 0.035, y, -4.9), Vector3(side + 0.035, y + 2.58, FACE_Z), "#b39b76")
		_box(Vector3(side - 0.045, y, -9.65), Vector3(side + 0.045, y + 2.58, -6.2), "#5b4c3c")
		_box(Vector3(side - 0.05, y, -4.9), Vector3(side + 0.05, y + 0.13, FACE_Z), "#714e33")
		for i in 12:
			var z := FACE_Z - 0.24 - i * 0.25
			_box(Vector3(side - 0.042, y + 0.16, z), Vector3(side + 0.042, y + 2.48, z + 0.013), "#a8916b")
	_box(Vector3(left, y, -9.66), Vector3(right, y + 2.60, -9.6), "#302b25")
	_box(Vector3(left + 0.04, y+0.04, -3.20), Vector3(left + 0.49, y + 0.78, -2.32), "#785433")
	_box(Vector3(left + 0.02, y + 0.78, -3.23), Vector3(left + 0.53, y + 0.83, -2.28), "#aa7f51")
	_box(Vector3(x-0.4,y+0.012,-2.55), Vector3(x+0.4,y+0.019,-1.97), "#622c36")
	_box(Vector3(x-0.34,y+0.020,-2.50), Vector3(x+0.34,y+0.022,-2.02), "#a9624d")
	_box(Vector3(x-0.28,y+0.024,-2.43), Vector3(x+0.28,y+0.026,-2.09), "#85404a")
	for i in 2:
		var z := -3.09 + i*0.39
		_box(Vector3(left+0.49,y+0.14,z),Vector3(left+0.505,y+0.67,z+0.3),"#946a45")
		_box(Vector3(left+0.505,y+0.42,z+0.12),Vector3(left+0.53,y+0.45,z+0.18),"#d0ad68")
	_box(Vector3(left+0.19,y+0.83,-2.82),Vector3(left+0.35,y+1.06,-2.785),"#5f3f29")
	_photo(assets["family-dacha"],Vector3(left+0.27,y+0.95,-2.782),0,Vector2(0.12,0.19))
	_photo(assets["family-room"],Vector3(left+0.05,y+1.72,-2.90),PI/2,Vector2(0.56,0.42))
	_box(Vector3(right-0.06,y+1.18,-3.69),Vector3(right,y+2.08,-2.87),"#513822")
	_box(Vector3(right-0.07,y+1.24,-3.62),Vector3(right-0.052,y+2.02,-2.94),"#82989a")
	for i in 2:
		_box(Vector3(left+0.18+0.20*i,y+0.012,-2.46),Vector3(left+0.31+0.20*i,y+0.10,-2.08),"#36291c")
	for board in [1.18,1.69]:
		_box(Vector3(left+0.015,y+board,-4.45),Vector3(left+0.34,y+board+0.04,-3.15),"#775336")
	for i in 9:
		var z := -4.37 + i*0.13
		var level := 1.73 if i%2 else 1.22
		_box(Vector3(left+0.09,y+level,z),Vector3(left+0.24,y+level+0.12+i%4*0.05,z+0.07), ["#655446","#3d5a5c","#aa8a5b","#645041"][i%4])
	_box(Vector3(right - 0.10, y + 1.86, -3.12), Vector3(right, y + 2.03, -2.18), "#755234")
	for i in 4:
		var z := -2.28 - 0.22 * i
		_box(Vector3(right-0.15, y+1.84, z), Vector3(right-0.07, y+1.95, z+0.03), "#b19c70")
	_box(Vector3(left + 0.03, y + 2.20, -3.03), Vector3(left + 0.27, y + 2.32, -2.82), "#f9dfaa")
	for lamp in [hall_light, cabinet_light]:
		add_child(lamp)
		lamp.light_color = Color("#ffd49a")
		lamp.omni_range = 3.6
	hall_light.position = Vector3(x, y + 2.28, -3.44)
	cabinet_light.position = Vector3(left + 0.39, y + 2.16, -2.91)
	_box(Vector3(x-0.018,y+2.23,-3.37),Vector3(x+0.018,y+2.60,-3.33),"#866941")
	var glass := SphereMesh.new()
	glass.radius = 0.085
	glass.height = 0.17
	glass.radial_segments = 12
	glass.rings = 5
	bulb_material.albedo_color = Color("#f2dcc0")
	bulb_material.emission_enabled = true
	bulb_material.emission = Color("#ffcf89")
	glass.material = bulb_material
	for i in 4:
		var a := (i+0.5)*PI/2
		var globe := MeshInstance3D.new()
		globe.mesh = glass
		globe.position = Vector3(x+0.21*cos(a), y+2.23, -3.35+0.21*sin(a))
		_box(Vector3(minf(x,globe.position.x)-0.016,y+2.19,minf(-3.35,globe.position.z)-0.016),
			Vector3(maxf(x,globe.position.x)+0.016,y+2.22,maxf(-3.35,globe.position.z)+0.016),"#866941")
		add_child(globe)
	var shadow := MeshInstance3D.new()
	var screen := QuadMesh.new()
	screen.size = Vector2(1.52,2.5)
	door_shade.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	door_shade.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	door_shade.render_priority = 2
	screen.material = door_shade
	shadow.mesh = screen
	shadow.position = Vector3(x,y+1.25,FACE_Z-0.12)
	add_child(shadow)
	actor.texture = assets.idle
	actor.position = Vector3(x - 0.016, y + 0.9, FACE_Z - 0.88)
	actor.pixel_size = 1.76 / float(actor.texture.get_height())
	actor.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	actor.shaded = false
	actor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(actor)
	set_lamp(0.0)

func _box(a: Vector3, b: Vector3, color: String) -> void:
	if (b - a).x <= 0.0:
		return
	var transform_data := Transform3D(Basis.IDENTITY.scaled(b-a), (a+b)*0.5)
	if not boxes.has(color):
		boxes[color] = []
	boxes[color].append(transform_data)

func _rail(a: Vector3, b: Vector3) -> void:
	var segment := b - a
	var shape := Basis(Vector3.FORWARD, -atan2(segment.y, segment.x)) * Basis.from_scale(Vector3(segment.length(), 0.055, 0.055))
	if not boxes.has("#67503e"):
		boxes["#67503e"] = []
	boxes["#67503e"].append(Transform3D(shape, (a+b)*0.5))

func _material(color: String) -> StandardMaterial3D:
	if not paints.has(color):
		var paint := StandardMaterial3D.new()
		paint.albedo_color = Color(color)
		paint.roughness = 0.90
		paints[color] = paint
	return paints[color]

func _commit_boxes() -> void:
	for color: String in boxes:
		var transforms: Array = boxes[color]
		var batch := MultiMesh.new()
		batch.transform_format = MultiMesh.TRANSFORM_3D
		batch.mesh = unit_box
		batch.instance_count = transforms.size()
		for i in transforms.size():
			batch.set_instance_transform(i, transforms[i])
		var node := MultiMeshInstance3D.new()
		node.multimesh = batch
		node.material_override = _material(color)
		add_child(node)
	boxes.clear()

func _part(parent: Node3D, at: Vector3, size: Vector3, color: String) -> void:
	var node := MeshInstance3D.new()
	node.mesh = unit_box
	node.material_override = _material(color)
	node.position = at
	node.scale = size
	parent.add_child(node)

func _label(parent: Node3D, value: String, at: Vector3, pixel: float) -> void:
	var label := Label3D.new()
	label.text = value
	label.pixel_size = pixel
	label.font_size = 42
	label.modulate = Color("#f6e7c8")
	label.visibility_range_end = 13.0
	label.position = at
	parent.add_child(label)

func _photo(texture: Texture2D, at: Vector3, angle: float, dimensions: Vector2) -> void:
	var sheet := QuadMesh.new()
	sheet.size = dimensions
	var paint := StandardMaterial3D.new()
	paint.albedo_texture = texture
	paint.roughness = 1.0
	var node := MeshInstance3D.new()
	node.mesh = sheet
	node.material_override = paint
	node.position = at
	node.rotation.y = angle
	add_child(node)

# Select the nearest actual step within a single riser of the current sole.
func surface_at(x: float, z: float, current: float) -> float:
	if z < -1.44 or z > 1.40:
		return INF
	var storey := clampi(floori((current + 0.23) / HEIGHT), 0, FLOORS - 1)
	var start := maxi(storey - 1, 0)
	var best := INF
	var distance := 0.231
	for f in range(start, mini(storey + 2, FLOORS)):
		var y := f * HEIGHT
		var possible: Array[float] = []
		if x >= LEFT-0.1 and x <= 0.08:
			possible.append(y)
		if f < FLOORS-1:
			if x >= RUN-0.08 and x <= 4.23:
				possible.append(y+1.4)
			if x >= 0 and x <= RUN and z >= 0.20 and z <= 1.37:
				possible.append(y+mini(9, floori(x / 0.3)+1)*1.4/9.0)
			if x >= 0 and x <= RUN and z >= -1.42 and z <= -0.25:
				possible.append(y+1.4+mini(9, floori((RUN-x)/0.3)+1)*1.4/9.0)
		for candidate in possible:
			var diff := absf(candidate-current)
			if diff < distance:
				distance = diff
				best = candidate
	return best

func move_player(direction: Vector2, sprint: bool, dt: float) -> void:
	var fast := sprint and not exhausted and direction.length_squared() > 0.005
	var desired := camera.basis.x * direction.x + Vector3(-sin(yaw),0,-cos(yaw)) * direction.y
	var motion := Vector2(desired.x,desired.z).limit_length() * (3.6 if fast else 2.2) * dt
	var before := feet
	if not _step(motion):
		if not _step(Vector2(motion.x, 0)):
			_step(Vector2(0, motion.y))
	var distance := Vector2(feet.x-before.x, feet.z-before.z).length()
	travelled += distance
	breath = clampf(breath + (-0.24 if fast and distance > 0.01 else 0.14) * dt, 0, 1)
	if breath <= 0.0:
		exhausted = true
	elif breath >= 0.25:
		exhausted = false
	var f := roundi(feet.y / HEIGHT)
	nearby_flat = 0
	if absf(feet.y / HEIGHT-f) <= 0.025 and feet.z < -0.45:
		for slot in 4:
			if absf(feet.x-door_x(slot)) < 0.78:
				nearby_flat = f*4 + slot + 1
				break
	_update_camera(dt)

func _step(motion: Vector2) -> bool:
	var x := feet.x + motion.x
	var z := feet.z + motion.y
	var height := surface_at(x,z,feet.y)
	if is_inf(height):
		return false
	feet = Vector3(x,height,z)
	return true

func _update_camera(dt: float) -> void:
	eye_height = lerpf(eye_height,feet.y+1.58,1.0-exp(-14.0*dt))
	camera.position = Vector3(feet.x,eye_height,feet.z)
	camera.rotation = Vector3(pitch,yaw,0)

func look_by(dx: float, dy: float) -> void:
	yaw -= dx
	pitch = clampf(pitch-dy, -0.55, 0.55)

func return_to_entry() -> void:
	feet = Vector3(-0.32, 0, -0.05)
	yaw = PI + atan2(0.37, 0.83) + 0.5
	pitch = 0.0
	breath = 1.0
	exhausted = false
	travelled = 0.0
	nearby_flat = 0
	eye_height = 1.58
	_update_camera(1.0)

func open_door(flat: int, amount: float) -> void:
	if flat >= 1 and flat <= hinges.size():
		hinges[flat-1].rotation.y = -1.65 * amount if flat==TARGET else 1.65 * amount

func begin_closeup() -> void:
	base_pose = camera.position
	base_yaw = yaw
	base_pitch = pitch

func frame_door(t: float, retreat := 0.0) -> void:
	var k := smoothstep(0.0,0.75,t)
	var give_way := smoothstep(0.8,1.5,t) * (1.0 - smoothstep(3.1,4.0,t))
	var goal := Vector3(door_x(1),2*HEIGHT+1.52,FACE_Z+1.2+0.7*give_way+0.75*retreat)
	camera.position = base_pose.lerp(goal,k)
	camera.rotation = Vector3(lerpf(base_pitch,-0.06,k),lerp_angle(base_yaw,0.0,k),0)

func set_lamp(amount: float) -> void:
	hall_light.light_energy = 0.12 + 1.65 * amount
	cabinet_light.light_energy = 0.20 + 1.15 * amount
	bulb_material.emission_energy_multiplier = 0.08+1.7*amount
	door_shade.albedo_color = Color(0.018,0.014,0.009,0.91*(1.0-amount))
	actor.modulate = Color.WHITE * lerpf(0.42,1.0,amount)
	actor.modulate.a = 1.0

func set_actor(state: String, elapsed: float) -> void:
	if state != portrait_state:
		portrait_state = state
		actor.texture = assets.get(state, assets.idle)
	var wave := sin(elapsed*TAU/3.5)
	actor.scale = Vector3(1.0+wave*0.002,1.0+wave*0.003,1.0)
