extends RefCounted

const CAB_LEFT := deg_to_rad(125.0)
const CAB_RIGHT := deg_to_rad(160.0)
const SIDE := deg_to_rad(110.0)
var angles := Vector2.ZERO
var released := Vector2.ZERO
var return_time := .5
var input_source := ""
var pad_device := -1
var cab := false

func event(ev: InputEvent) -> bool:
	if ev is InputEventJoypadMotion:
		if ev.axis in [JOY_AXIS_RIGHT_X,JOY_AXIS_RIGHT_Y] and absf(ev.axis_value)>.16:
			pad_device = ev.device
	elif ev is InputEventMouseButton and ev.button_index == MOUSE_BUTTON_RIGHT:
		if ev.pressed:
			input_source = "mouse"
		elif input_source=="mouse":
			_release()
		return true
	elif ev is InputEventMouseMotion and input_source=="mouse":
		angles -= ev.relative*.0055
		_limit()
		return true
	return false

func reset() -> void:
	angles = Vector2.ZERO
	input_source = ""
	return_time = .5

func _release() -> void:
	released = angles
	return_time = 0.0
	input_source = ""

func _limit() -> void:
	angles.x = clampf(angles.x,-CAB_RIGHT if cab else -PI,CAB_LEFT if cab else PI)
	angles.y = clampf(angles.y,-.22,.28)

func step(delta: float, mode: bool, enabled: bool) -> void:
	cab = mode
	if not enabled and not input_source.is_empty():
		_release()
	var stick := Vector2.ZERO
	if enabled and pad_device >= 0:
		stick = Vector2(Input.get_joy_axis(pad_device,JOY_AXIS_RIGHT_X),Input.get_joy_axis(pad_device,JOY_AXIS_RIGHT_Y))
	if stick.length()>.16 and input_source!="mouse":
		input_source = "pad"
		var angle := atan2(stick.x,-stick.y)
		var a := absf(angle)
		var limit := (CAB_RIGHT if angle>=0 else CAB_LEFT) if cab else PI
		var target := SIDE*a/(PI*.5) if a<=PI*.5 else lerpf(SIDE,limit,(a-PI*.5)/(PI*.5))
		target *= (-1.0 if angle>=0 else 1.0)*minf(1.0,stick.length()/.8)
		var pitch := -stick.y*.28*cos(angle) if stick.y<0 and a<PI*.5 else 0.0
		angles = angles.lerp(Vector2(target,pitch),1.0-exp(-12*delta))
		_limit()
	elif input_source == "pad":
		_release()
	if input_source.is_empty() and return_time<.5:
		return_time = minf(.5,return_time+delta)
		var t := return_time*2.
		angles = released*(1.0-t*t*t*(t*(t*6.0-15.0)+10.0))
