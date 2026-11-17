extends SubViewportContainer

const FRAME := preload("res://retro/retro_frame.gdshader")
@onready var world: Node3D = $World/SouthDrive
var grade := ShaderMaterial.new()
var ps2 := false


func _ready() -> void:
	grade.shader = FRAME
	material = grade
	set_preset(OS.get_cmdline_user_args().has("--ps2"))


func _input(event: InputEvent) -> void:
	if event.is_action_pressed(&"retro_profile"):
		set_preset(not ps2)
		get_viewport().set_input_as_handled()


func set_preset(cleaner: bool) -> void:
	ps2 = cleaner
	stretch_shrink = 2 if ps2 else 3
	grade.set_shader_parameter(&"ps2",ps2)
	RenderingServer.global_shader_parameter_set(&"retro_snap_amount",0.0 if ps2 else 0.82)
	RenderingServer.global_shader_parameter_set(&"retro_affine_amount",0.0 if ps2 else 0.78)
	world.get_node("Atmosphere").set_retro_profile(ps2)
	world.hud.set_graphics_profile("PS2" if ps2 else "PS1")
