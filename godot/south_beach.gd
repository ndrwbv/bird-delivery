extends Node3D

const GUEST := preload("res://south_beach_guest.gd")
const BOOK := preload("res://south_order_book.gd")
const AXIS := Vector2(.459,.888)
const TOWELS := ["#e0503c","#3c8fe0","#f2c230","#f08ab0"]
var car: Node3D
var terrain: RefCounted
var book: RefCounted
var center := Vector2.ZERO
var water_y := 0.0
var rng := RandomNumberGenerator.new()
var last_number := -100
var issued := 0
var options: Array[Dictionary] = []
var sand := MeshInstance3D.new()
var sand_paint := ShaderMaterial.new()

func setup(ground: RefCounted, order_book: RefCounted, region: Dictionary, vehicle: Node3D) -> void:
	terrain = ground
	book = order_book
	car = vehicle
	center = _xz(region.beach)
	water_y = float(region.water_y)
	add_child(sand)
	sand.position = Vector3(center.x,0,center.y)
	sand.visibility_range_end = 280
	sand.visibility_range_end_margin = 12
	sand.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_sand()
	_spots()

func begin(number: int, seed_value: int) -> void:
	issued = 0
	last_number = -100
	rng.seed = ("%d/beach/%d"%[seed_value,number]).hash()

func order_if_due(number: int, hour: float, tension: float, atmosphere: Node) -> Dictionary:
	if number<2 or issued>=3 or number-last_number<4 or hour<10 or hour>20 or tension<0.5:
		return {}
	var season_value: float = fposmod(atmosphere.season_value,4.0)
	if season_value>=1 or atmosphere.snow>=.01 or atmosphere.night>=.45 or atmosphere.wet>=.35:
		return {}
	if options.is_empty() or rng.randf()>=1.0/15.0:
		return {}
	var spot := options[rng.randi_range(0,options.size()-1)]
	var target: Vector2 = spot.at
	var there: Array = book.routes.route_between(book.home,target)
	if there.size()<2:
		return {}
	var road_end := _xz(there.back())
	var safe: bool = road_end.distance_to(target)<=60 and book.routes.walk_clear(road_end,target)
	var back: Array = book.routes.route_between(target,book.home)
	if back.size()<2:
		return {}
	var stop := road_end if safe else target
	if not safe:
		there.append([target.x,target.y])
		back.push_front([target.x,target.y])
	issued += 1
	last_number = number
	return {"name":tr("Пляж на Томи, у воды"),"beach":true,"people":1,"kind":"solo","customer":[target.x,target.y],
		"stop":[stop.x,stop.y],"route":there,"from_home":there,"back_home":back,"meters":BOOK.length_of(there),
		"back_meters":BOOK.length_of(back),"towel_yaw":spot.yaw,"towel_color":TOWELS[rng.randi_range(0,3)],"swim":rng.randi_range(0,7)}

func place(person: Node3D, order: Dictionary) -> void:
	var guest := GUEST.new()
	person.add_child(guest)
	guest.setup(person,car,float(order.towel_yaw),Color(order.towel_color))

func _world(a: float, b: float) -> Vector2:
	var along := AXIS.normalized()
	return center+along*a+Vector2(along.y,-along.x)*b

func _hash(x: float,z: float,k: int) -> float:
	var n := sin(x*12.9898+z*78.233+k*37.719)*43758.5453
	return n-floorf(n)

func _edge(a: float) -> float:
	var end := maxf(0,absf(a)-53.0)
	return 22+(_hash(floorf(a/9),3,7)-.5)*4+sin(a*.11)*1.5-35.2*(1.0-sqrt(maxf(0,1-(end/16.0)**2)))

func _sand() -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for ia in 29:
		var a := -70+ia*5.0
		for ib in 11:
			var b := float(ib)/10
			var along := -32.0+(_edge(a)+32.0)*b
			var p := _world(a,along)
			var dry := smoothstep(-32.0,-26.0,along)
			var tone := Color("#bf8448").lerp(Color("#f6bc74"),dry)
			tone = tone.lerp(Color("#d8ac68"),smoothstep(_edge(a)-3,_edge(a),along)*.7)
			surface.set_color(tone.srgb_to_linear())
			surface.add_vertex(Vector3(p.x-center.x,terrain.land_height(p.x,p.y)+.075,p.y-center.y))
	for i in 28:
		for j in 10:
			var k := i*11+j
			for v in [k,k+11,k+1,k+1,k+11,k+12]:
				surface.add_index(v)
	surface.generate_normals()
	sand_paint.shader = preload("res://beach_sand.gdshader")
	var atmosphere := get_parent().get_node_or_null("Atmosphere")
	if atmosphere:
		atmosphere.season_materials.append(sand_paint)
		sand_paint.set_shader_parameter("season_surface",Vector4(atmosphere.snow,1,0,0))
	surface.set_material(sand_paint)
	sand.mesh = surface.commit()

func _spots() -> void:
	var toward := -Vector2(AXIS.y,-AXIS.x).normalized()
	var base_angle := atan2(toward.x,toward.y)
	for i in 34:
		var a := -58+i*3.5
		for j in 10:
			var b := -24+j*3.5
			var aa := a+(_hash(a,b,11)-.5)*2
			var bb := b+(_hash(a,b,12)-.5)*2
			var at := _world(aa,bb)
			if terrain.land_height(at.x,at.y) >= water_y+.4:
				options.append({"at":at,"yaw":base_angle+(_hash(aa,bb,13)-.5)*.5})

static func _xz(point: Array) -> Vector2:
	return Vector2(point[0],point[1])
