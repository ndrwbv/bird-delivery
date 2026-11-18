extends Node3D

const BLOCK := .12
var ground: RefCounted
var catalog: Array[Dictionary] = []


func setup(terrain: RefCounted) -> void:
	ground = terrain
	var source: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-ramps.json"))
	for raw: Dictionary in source:
		var ramp := {"at":Vector2(raw.at[0],raw.at[1]),"axis":Vector2(raw.axis[0],raw.axis[1]).normalized(),
			"length":float(raw.length),"width":float(raw.width),"height":float(raw.height)}
		_build(ramp)
		catalog.append(ramp)


func info(point: Vector2) -> Dictionary:
	for ramp: Dictionary in catalog:
		var axis: Vector2 = ramp.axis
		var delta: Vector2 = point-ramp.at
		var along := delta.dot(axis)/float(ramp.length)+.5
		if along >= 0.0 and along <= 1.0 and absf(delta.cross(axis)) <= float(ramp.width)*.5:
			return {"lift":along*float(ramp.height),"height":ramp.height,"length":ramp.length,"axis":axis}
	return {}


func lift(point: Vector2) -> float:
	return float(info(point).get("lift",0.0))


func prepare_motion(car: CharacterBody3D, motion: Vector3, above: bool) -> void:
	var direction := Vector2(motion.x,motion.z)
	var at := Vector2(car.position.x,car.position.z)
	for ramp: Dictionary in catalog:
		var wall: StaticBody3D = ramp.wall
		var near: bool = at.distance_squared_to(ramp.at) < 100.0
		var skip: bool = near and (above or lift(at) > 0.0 or direction.dot(ramp.axis) > 0.0 or car.position.y > ramp.top-.5)
		if skip != ramp.get("ignoring_wall",false):
			if skip:
				car.add_collision_exception_with(wall)
			else:
				car.remove_collision_exception_with(wall)
			ramp.ignoring_wall = skip


func _build(ramp: Dictionary) -> void:
	var mesh := SurfaceTool.new()
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.roughness = .89
	mesh.set_material(material)
	var at: Vector2 = ramp.at
	var half := float(ramp.length)*.5
	var width := float(ramp.width)*.5
	var axis: Vector2 = ramp.axis
	var side := axis.orthogonal()
	for i in 12:
		var u0 := lerpf(-half,half,float(i)/12)
		var u1 := lerpf(-half,half,float(i+1)/12)
		var h0 := float(ramp.height)*float(i)/12.0
		var h1 := float(ramp.height)*float(i+1)/12.0
		var color := Color("#e4b72f" if i%2==0 else "#302d35")
		_quad(mesh,_vertex(at+axis*u0-side*width,h0),_vertex(at+axis*u1-side*width,h1),
			_vertex(at+axis*u1+side*width,h1),_vertex(at+axis*u0+side*width,h0),color)
	for k: float in [-1.0,1.0]:
		var start := at-axis*half+side*width*k
		var end := at+axis*half+side*width*k
		var color := Color("#625d56").srgb_to_linear()
		for point: Vector3 in [_vertex(start,0),_vertex(end,0),_vertex(end,ramp.height)]:
			mesh.set_color(color)
			mesh.add_vertex(point)
	var beyond := at+axis*half
	_quad(mesh,_vertex(beyond-side*width,0),_vertex(beyond+side*width,0),
		_vertex(beyond+side*width,ramp.height),_vertex(beyond-side*width,ramp.height),Color("#5d5854"))
	mesh.generate_normals()
	var display := MeshInstance3D.new()
	display.mesh = mesh.commit()
	add_child(display)
	var back := StaticBody3D.new()
	back.collision_layer = 1
	back.collision_mask = 0
	var end := _vertex(beyond,0)
	back.position = end+Vector3.UP*(float(ramp.height)*.45)
	ramp.top = end.y+float(ramp.height)
	back.rotation.y = atan2(axis.x,axis.y)
	var wall := CollisionShape3D.new()
	var obstacle := BoxShape3D.new()
	obstacle.size = Vector3(ramp.width,float(ramp.height)*.88,BLOCK)
	wall.shape = obstacle
	back.add_child(wall)
	add_child(back)
	ramp.wall = back


func _vertex(p: Vector2, rise: float) -> Vector3:
	return Vector3(p.x,float(ground.at(p.x,p.y))+rise+.012,p.y)


func _quad(mesh: SurfaceTool,a:Vector3,b:Vector3,c:Vector3,d:Vector3,tint:Color) -> void:
	var color := tint.srgb_to_linear()
	for point: Vector3 in [a,b,c,a,c,d]:
		mesh.set_color(color)
		mesh.add_vertex(point)
