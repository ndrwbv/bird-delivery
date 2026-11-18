extends SubViewportContainer

const CAR := preload("res://assets/semerka.glb")
var view := SubViewport.new()
var camera := Camera3D.new()
var model: Node3D
var paint: StandardMaterial3D
var yaw := -.64
var distance := 6.0
var drag := false

func setup() -> void:
	custom_minimum_size = Vector2(390,272)
	stretch = true
	focus_mode = Control.FOCUS_ALL
	add_child(view)
	view.size = Vector2i(390,272)
	view.own_world_3d = true
	view.gui_disable_input = true
	var studio := WorldEnvironment.new()
	var setting := Environment.new()
	setting.background_mode = Environment.BG_COLOR
	setting.background_color = Color("#e5d7bb")
	setting.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	setting.ambient_light_color = Color.WHITE
	setting.ambient_light_energy = .85
	studio.environment = setting
	view.add_child(studio)
	var floor_mesh := MeshInstance3D.new()
	var floor_plane := PlaneMesh.new()
	floor_plane.size = Vector2(32,32)
	var m := StandardMaterial3D.new()
	m.albedo_color = Color("#d3c0a1")
	floor_plane.material = m
	floor_mesh.mesh = floor_plane
	view.add_child(floor_mesh)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48,31,0)
	light.light_energy = 1.6
	light.shadow_enabled = true
	light.directional_shadow_max_distance = 13
	view.add_child(light)
	model = CAR.instantiate()
	view.add_child(model)
	var body := model.get_node("Car_CarBody_0") as MeshInstance3D
	paint = body.get_active_material(0).duplicate() as StandardMaterial3D
	body.material_override = paint
	view.add_child(camera)
	camera.current = true
	camera.fov = 38
	camera.far = 35
	_render()
	gui_input.connect(_inspect)
	set_process(false)

func tint(color: Color) -> void:
	paint.albedo_color = color
	_render()

func _render() -> void:
	camera.position = Vector3(sin(yaw)*distance,2.3,-cos(yaw)*distance)
	camera.look_at(Vector3(0,.78,0))
	view.render_target_update_mode = SubViewport.UPDATE_ONCE

func rotate_by(angle: float) -> void:
	yaw += angle
	_render()

func _inspect(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			drag = event.pressed
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			distance = clampf(distance+(-.4 if event.button_index==MOUSE_BUTTON_WHEEL_UP else .4),4.9,8)
			_render()
	elif event is InputEventMouseMotion and drag:
		rotate_by(-event.relative.x*.012)
	elif has_focus() and (event.is_action_pressed(&"ui_left") or event.is_action_pressed(&"ui_right")):
		rotate_by(-.24 if event.is_action_pressed(&"ui_left") else .24)
