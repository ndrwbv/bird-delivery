extends RefCounted

enum Surface { PAVEMENT, GRASS, DIRT }

var samples: PackedByteArray
var x0 := 0.0
var z0 := 0.0
var step := 1.0
var columns := 0
var rows := 0


func setup(spec: Dictionary, bytes: PackedByteArray) -> void:
	x0 = spec.x
	z0 = spec.z
	step = spec.step
	columns = int(spec.width)
	rows = int(spec.depth)
	samples = bytes


func at(x: float, z: float, _previous_height := INF) -> float:
	var gx := clampf((x - x0) / step, 0.0, columns - 1.0)
	var gz := clampf((z - z0) / step, 0.0, rows - 1.0)
	var ix := mini(floori(gx), columns - 2)
	var iz := mini(floori(gz), rows - 2)
	var offset := (iz * columns + ix) * 3
	var row := columns * 3
	var a := lerpf(samples.decode_s16(offset), samples.decode_s16(offset + 3), gx - ix)
	var b := lerpf(samples.decode_s16(offset + row), samples.decode_s16(offset + row + 3), gx - ix)
	return lerpf(a, b, gz - iz) * 0.01


func material_at(x: float, z: float) -> int:
	var ix := clampi(roundi((x - x0) / step), 0, columns - 1)
	var iz := clampi(roundi((z - z0) / step), 0, rows - 1)
	return samples[(iz * columns + ix) * 3 + 2]


func wheel_height(x: float, z: float, _previous_height := INF) -> float:
	var y := at(x, z)
	if material_at(x, z) != Surface.PAVEMENT:
		y += sin(x * 2.73 + z * 1.31) * sin(z * 1.95 - x * 0.73) * 0.046
	return y
