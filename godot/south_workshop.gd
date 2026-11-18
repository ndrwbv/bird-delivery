extends StaticBody3D

signal paid(amount: int)
signal repaired
const RESPECT := preload("res://district_respect.gd")
const NAME := "Мастерская"
const SITE := "res://assets/south-workshop.json"

var car: CharacterBody3D
var panel: CanvasLayer
var hold := 0.0
var offered := false
var busy := false
var profile: RefCounted


func setup(terrain: RefCounted, graph: RefCounted, vehicle: CharacterBody3D, dialogue: CanvasLayer) -> void:
	car = vehicle
	panel = dialogue
	collision_layer = 1
	collision_mask = 0
	var spec: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SITE))
	var at := Vector2(spec.at[0],spec.at[1])
	position = Vector3(at.x,terrain.land_height(at.x,at.y),at.y)
	rotation.y = atan2(float(spec.front[0]),float(spec.front[1]))
	for place: Dictionary in graph.destinations:
		if place.id == "garage":
			graph.register_yard(place,Vector2(spec.park[0],spec.park[1]),Vector2(spec.driveway[0],spec.driveway[1]))
			place.site = spec.at
			break
	var concrete := _paint("#a19b8b")
	var roof := _paint("#4e514b")
	for x in [-2.87,2.87]:
		_slab(Vector3(x,1.58,-4.2),Vector3(.26,3.16,8.4),concrete,true)
	_slab(Vector3(0,1.58,-8.28),Vector3(5.8,3.16,.24),concrete,true)
	_slab(Vector3(0,3.27,-4.1),Vector3(6.2,.28,8.8),roof,true)
	_slab(Vector3(0,2.65,-.02),Vector3(5.8,1.1,.25),concrete,true)
	_slab(Vector3(0,.035,-1.8),Vector3(5.9,.08,12.5),_paint("#68635a"),false)
	var sign := Label3D.new()
	sign.text = tr("АВТОСЕРВИС У ДЯДИ ЖЕНИ")
	sign.position = Vector3(0,2.78,.17)
	sign.modulate = Color("#4c261c")
	sign.outline_size = 0
	sign.pixel_size = .006
	sign.font_size = 33
	add_child(sign)


func reset_offer() -> void:
	if busy:
		car.controls_locked = false
	busy = false
	offered = false
	hold = 0.0


func step(delta: float, account: RefCounted, allowed: bool) -> void:
	if busy:
		return
	var at := to_local(car.global_position)
	if Vector2(at.x,at.z).length_squared() > 18.0*18.0:
		offered = false
	var room := at.z > -7.8 and at.z < 6 and absf(at.x) < (2.5 if at.z < 0 else 3.6) and absf(at.y) < 1.5
	var stopped: bool = absf(car.speed) < .8 and not car.engine.restarting
	hold = hold+delta if room and stopped and allowed and not offered and not panel.visible else 0.0
	if hold > .6:
		profile = account
		busy = true
		offered = true
		car.controls_locked = true
		_offer()


func _offer() -> void:
	var quote: Dictionary = car.engine.repair_quote()
	var condition := roundi(car.engine.condition)
	var resource := roundi(car.engine.ceiling)
	if float(quote.pct) < 1.0:
		var damage: bool = car.hearts < car.hearts_max or car.damage.spatter_count > 0
		var details := tr("Мотор %d %% · ресурс %d %%") % [condition,resource]
		if damage:
			panel.selected.connect(_repair_body,CONNECT_ONE_SHOT)
			panel.offer(tr(NAME),details+"\n"+tr("Могу выправить и отмыть кузов бесплатно."),[tr("Спасибо"),tr("Позже")],-1,1,false)
		else:
			panel.selected.connect(_leave,CONNECT_ONE_SHOT)
			panel.offer(tr(NAME),details+"\n"+tr("Ремонт не требуется."),[tr("Понятно")],-1,0,false)
		return
	var discount: float = RESPECT.GARAGE_DISCOUNT[RESPECT.rank(profile.data)]
	var price := roundi(float(quote.price)*(1.0-discount)/10.0)*10
	var restored := roundi(maxf(20.0,float(car.engine.ceiling)-float(quote.drop)))
	var description := tr("Мотор %d %% · ресурс %d %%\nРемонт до %d %% за %d ₽") % [condition,resource,restored,price]
	if int(profile.data.wallet) < price:
		panel.selected.connect(_leave,CONNECT_ONE_SHOT)
		panel.offer(tr(NAME),description+"\n"+tr("Не хватает денег."),[tr("Понятно")],-1,0,false)
	else:
		panel.selected.connect(_repair_engine.bind(price),CONNECT_ONE_SHOT)
		panel.offer(tr(NAME),description,[tr("Починить"),tr("Потом")],-1,1,false)


func _repair_body(index: int) -> void:
	if busy and index == 0:
		_restore_body()
	_leave(index)


func _repair_engine(index: int, price: int) -> void:
	if busy and index == 0 and int(profile.data.wallet) >= price:
		profile.data.wallet = int(profile.data.wallet)-price
		car.engine.repair()
		paid.emit(price)
		_restore_body()
	_leave(index)


func _restore_body() -> void:
	car.hearts = car.hearts_max
	car.damage.repair()
	repaired.emit()


func _leave(_index: int) -> void:
	if busy:
		car.controls_locked = false
	busy = false


func _slab(at: Vector3, dimensions: Vector3, material: Material, solid: bool) -> void:
	var mesh := BoxMesh.new()
	mesh.size = dimensions
	var block := MeshInstance3D.new()
	block.mesh = mesh
	block.material_override = material
	block.position = at
	add_child(block)
	if solid:
		var box := BoxShape3D.new()
		box.size = dimensions
		var wall := CollisionShape3D.new()
		wall.shape = box
		wall.position = at
		add_child(wall)


func _paint(color: String) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.roughness = .86
	return material
