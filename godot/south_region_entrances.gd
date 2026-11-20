extends RefCounted

const GROUND := preload("res://south_region_ground.gd")

# The door leaf stays close to the wall so the animated delivery door can
# cover it. The canopy, door surround and entrance landing stay visible.
static func add_to(mesh: SurfaceTool, ground: GROUND, doors: Array, layer: int) -> void:
	for door: Dictionary in doors:
		var at := Vector2(door.at[0],door.at[1])
		if ground.core.grow(3.5).has_point(at):
			continue
		var front := Vector2(door.normal[0],door.normal[1]).normalized()
		if front.is_zero_approx():
			continue
		var edge := at+front*0.4
		var height := ground.at(edge.x,edge.y)
		var frame := Transform3D(Basis(Vector3.UP,atan2(front.x,front.y)),Vector3(at.x,height,at.y))
		var stone := Color(0.27,0.234,0.184)
		var trim := Color(0.142,0.111,0.078)
		var shade := fposmod(at.x*0.347+at.y*0.219,1.0)
		var metal := Color(0.075,0.108,0.095).lerp(Color(0.181,0.112,0.070),shade)
		var grand := bool(door.get("grand",false))
		var canopy_width := 2.9 if grand else 2.1
		var canopy_depth := 1.42 if grand else 0.86
		var step_depth := 1.27 if grand else 0.93
		box(mesh,frame,Vector3(0,.04,step_depth*.5),Vector3(canopy_width,.28,step_depth),stone*.78,layer)
		box(mesh,frame,Vector3(0,.17,step_depth*.36),Vector3(canopy_width*.88,.19,step_depth*.72),stone,layer)
		box(mesh,frame,Vector3(0,1.10,.018),Vector3(1.23,2.10,.036),metal,layer)
		for side: float in [-1.0,1.0]:
			box(mesh,frame,Vector3(side*.67,1.26,.12),Vector3(.13,2.20,.26),trim,layer)
			box(mesh,frame,Vector3(side*.81,2.48,.21),Vector3(.10,.25,.40),trim,layer)
		box(mesh,frame,Vector3(0,2.33,.13),Vector3(1.49,.16,.24),trim,layer)
		box(mesh,frame,Vector3(0,2.63,canopy_depth*.44),Vector3(canopy_width,.17,canopy_depth),stone,layer)
		box(mesh,frame,Vector3(.36,1.19,.037),Vector3(.24,.06,.019),stone,layer)
		box(mesh,frame,Vector3(-.74,1.33,.27),Vector3(.09,.19,.041),metal*.61,layer)
		box(mesh,frame,Vector3(.59,2.46,.16),Vector3(.34,.16,.037),stone*.79,layer)


static func box(mesh: SurfaceTool, frame: Transform3D, at: Vector3, size: Vector3, color: Color, layer: int) -> void:
	var h := size*0.5
	var corners := PackedVector3Array([
		at+Vector3(-h.x,-h.y,h.z),at+Vector3(h.x,-h.y,h.z),
		at+Vector3(h.x,h.y,h.z),at+Vector3(-h.x,h.y,h.z),
		at+Vector3(-h.x,-h.y,-h.z),at+Vector3(h.x,-h.y,-h.z),
		at+Vector3(h.x,h.y,-h.z),at+Vector3(-h.x,h.y,-h.z)])
	# The rear touches the facade. The exposed underside also serves balcony slabs.
	for i: int in [0,1,2,0,2,3, 0,3,7,0,7,4, 1,5,6,1,6,2, 3,2,6,3,6,7, 0,4,5,0,5,1]:
		mesh.set_uv(Vector2(corners[i].x,corners[i].y))
		mesh.set_uv2(Vector2(layer,0.0))
		mesh.set_color(color)
		mesh.add_vertex(frame*corners[i])
