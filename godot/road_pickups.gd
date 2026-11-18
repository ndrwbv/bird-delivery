extends Node3D

const COLORS := [Color("#187dae"),Color("#e9554c"),Color("#498fc4")]
const COOLDOWN := [16.0,28.0,28.0]

var ground: RefCounted
var car: CharacterBody3D
var items: Array[Dictionary] = []
var phase := 0.0


func setup(terrain: RefCounted, vehicle: CharacterBody3D, start: Vector2) -> void:
	ground = terrain
	car = vehicle
	var roads: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-traffic-routes.json"))
	var used: Array[Vector2] = []
	for i in roads.size()*2:
		var circuit: Array = roads[i%roads.size()]
		var start_index := (i*13+int(circuit.size()*0.3))%circuit.size()
		for a in circuit.size():
			var candidate: Array = circuit[(start_index+a)%circuit.size()]
			var at := Vector2(candidate[0],candidate[1])
			if at.distance_squared_to(start) < 28.0*28.0 or not _spaced(at,used):
				continue
			if ground.material_at(at.x,at.y) != 0:
				continue
			used.append(at)
			var type := 0 if i%4 != 3 else 1+int(i/4)%3
			if type < COLORS.size():
				_add(at,type)
			break


func _spaced(at: Vector2, placed: Array[Vector2]) -> bool:
	for other in placed:
		if at.distance_squared_to(other) < 44.0*44.0:
			return false
	return true


func _add(at: Vector2, type: int) -> void:
	var root := Node3D.new()
	add_child(root)
	root.position = Vector3(at.x,ground.at(at.x,at.y),at.y)
	var animated := Node3D.new()
	root.add_child(animated)
	var paint := _paint(COLORS[type])
	if type == 0:
		var can := CylinderMesh.new()
		can.height = 0.63
		can.top_radius = 0.21
		can.bottom_radius = 0.22
		can.radial_segments = 10
		_mesh(animated,can,paint,Vector3.ZERO)
		var lid := CylinderMesh.new()
		lid.radial_segments = 10
		lid.top_radius = 0.205
		lid.bottom_radius = 0.205
		lid.height = 0.026
		_mesh(animated,lid,_paint(Color("#bcc4c0")),Vector3.UP*0.32)
		var icon := Label3D.new()
		icon.text = "ϟ"
		icon.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		icon.modulate = Color("#fff18b")
		icon.font_size = 64
		icon.pixel_size = 0.008
		icon.position.z = 0.22
		animated.add_child(icon)
	else:
		var bonus := BoxMesh.new()
		bonus.size = Vector3.ONE*0.5
		_mesh(animated,bonus,_paint(Color("#f4eee0")) if type == 1 else paint,Vector3.ZERO)
		if type == 1:
			var cross := BoxMesh.new()
			cross.size = Vector3(0.33,0.085,0.018)
			var cross_paint := _paint(COLORS[type])
			_mesh(animated,cross,cross_paint,Vector3(0.0,0.0,0.255))
			var bar := _mesh(animated,cross,cross_paint,Vector3(0.0,0.0,0.255))
			bar.rotation.z = PI*0.5
	var hoop := TorusMesh.new()
	hoop.inner_radius = 0.62
	hoop.outer_radius = 0.74
	hoop.rings = 24
	hoop.ring_segments = 6
	_mesh(root,hoop,paint,Vector3.UP*0.07).scale.y = 0.19
	items.append({"root":root,"model":animated,"type":type,"again":0.0})


func _process(delta: float) -> void:
	phase = fposmod(phase+delta,TAU)
	for i in items.size():
		var item := items[i]
		var root: Node3D = item.root
		if item.again > 0.0:
			item.again -= delta
			if item.again <= 0.0:
				root.show()
			else:
				continue
		var model: Node3D = item.model
		var at := root.position-car.position
		if at.length_squared() < 70.0*70.0:
			model.rotation.y = phase
			model.position.y = 0.90+sin(phase*2.0+i)*0.18
		if car.controls_locked:
			continue
		var from_car := car.basis.inverse()*at
		if absf(from_car.x) < 1.35 and absf(from_car.z) < 2.7 and absf(from_car.y) < 1.0:
			car.collect_road_bonus(item.type)
			item.again = COOLDOWN[int(item.type)]
			root.hide()


func _paint(color: Color) -> StandardMaterial3D:
	var paint := StandardMaterial3D.new()
	paint.albedo_color = color
	paint.emission_enabled = true
	paint.emission = color
	paint.emission_energy_multiplier = 0.42
	return paint


func _mesh(parent: Node3D, shape: Mesh, paint: Material, at: Vector3) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = shape
	instance.material_override = paint
	instance.position = at
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(instance)
	return instance
