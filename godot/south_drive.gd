extends Node3D

const DATA_PATH := "res://assets/south.json"
const RESIDENTIAL_WINDOW := preload("res://residential_window.gdshader")
const STREET_LIGHTING := preload("res://street_lighting.gd")
const LANDSCAPE := preload("res://landscape.gdshader")
const CITY_COLOR := preload("res://city_color.gdshader")
const ACTOR_COLOR := preload("res://actor_color.gdshader")
const TEXTURED_CITY := preload("res://textured_city.gdshader")
const CROWN_COLOR := preload("res://crown_core.gdshader")
const LEAVES := preload("res://district_leaves.gd")
const GRASS_COLOR := preload("res://grass.gdshader")
const SHRUB_COLOR := preload("res://shrub.gdshader")
const SHRUB_LEAVES := preload("res://assets/shrub-leaves.png")
const TERRAIN := preload("res://terrain_height.gd")
const WALKER := preload("res://pedestrian.gd")
const COURIER := preload("res://courier_on_foot.gd")
const PICKUPS := preload("res://road_pickups.gd")
const SHIFT := preload("res://district_shift.gd")
const ENTRANCE := preload("res://entrance_door.gd")
const DISPATCH := preload("res://delivery_dispatch.gd")
const HANDOFF := preload("res://delivery_handoff.gd")
const TRAFFIC := preload("res://district_traffic.gd")
const NPC_CAR := preload("res://traffic_vehicle.gd")
const BLOOD := preload("res://impact_blood.gd")
const RAGDOLL_BODY := preload("res://pedestrian_ragdoll.gd")
const PEDESTRIAN_CONTACT := preload("res://pedestrian_contact.gd")
const IMPACT_GROUND := preload("res://impact_ground.gd")
const FURNITURE := preload("res://street_furniture.gd")
const TIRE_TRACKS := preload("res://tire_tracks.gd")
const COURIER_SCENE := preload("res://assets/courier.glb")
const ACTORS := [
	preload("res://assets/pedestrian-0.glb"), preload("res://assets/pedestrian-1.glb"),
	preload("res://assets/pedestrian-2.glb"), preload("res://assets/pedestrian-3.glb"),
	preload("res://assets/pedestrian-4.glb"),
]

@onready var car: CharacterBody3D = $Car
@onready var chase: Camera3D = $Chase
@onready var hud: CanvasLayer = $HUD

var map_data: Dictionary
var leaves := LEAVES.new()
var terrain := TERRAIN.new()
var street_lights := STREET_LIGHTING.new()
var ground_material := ShaderMaterial.new()
var window_material := ShaderMaterial.new()
var courier := COURIER.new()
var delivery := HANDOFF.new()
var dispatch := DISPATCH.new()
var traffic := TRAFFIC.new()
var blood: Node3D
var contact_box := BoxShape3D.new()
var people_query := PhysicsShapeQueryParameters3D.new()
var adult := not OS.has_feature("kids") and not OS.get_cmdline_user_args().has("--kids")
var impact_ground := IMPACT_GROUND.new()
var furniture := FURNITURE.new()
var tire_tracks := TIRE_TRACKS.new()
var customers: Array[Node3D] = []
var entrances: Array[Node3D] = []
var shift := SHIFT.new()
var destination := 0
var back_to_depot := false
var depot := Vector3.ZERO
var marker: Node3D
var marker_label: Label3D
var stop := Vector3.ZERO
var can_deliver := false
var last_input_pad := false


func _ready() -> void:
	map_data = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	var ground: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-ground.json"))
	terrain.setup(ground,FileAccess.get_file_as_bytes("res://assets/south-ground.bin"))
	car.terrain = terrain
	car.hit_handler = _vehicle_contact
	car.person_handler = _people_contact
	people_query.shape = contact_box
	people_query.collision_mask = 4 | 128 | 512
	var paint := ShaderMaterial.new()
	paint.shader = CITY_COLOR
	add_child(impact_ground)
	impact_ground.setup(terrain)
	if adult:
		blood = BLOOD.new()
		add_child(blood)
		blood.setup(terrain)
	add_child(furniture)
	add_child(street_lights)
	street_lights.setup(furniture)
	street_lights.bind(paint)
	furniture.setup(impact_ground,paint,street_lights.scales)
	car.damage.floor = impact_ground
	add_child(leaves)
	leaves.setup(chase,_v2(map_data.spawn))
	var city_paint := _configure_materials()
	$Atmosphere.configure(car,chase,city_paint,ground_material,window_material,street_lights)
	_make_people()
	_make_entrances()
	add_child(traffic)
	traffic.setup(terrain,_v2(map_data.spawn))
	var pickups := PICKUPS.new()
	add_child(pickups)
	pickups.setup(terrain,car,_v2(map_data.spawn))
	add_child(delivery)
	delivery.setup(car,courier,chase,terrain)
	add_child(dispatch)
	dispatch.setup(car,courier,chase,terrain,map_data.dispatch)
	add_child(tire_tracks)
	tire_tracks.setup(car,terrain)
	_make_marker()
	var start := _v2(map_data.spawn)
	depot = Vector3(start.x,terrain.at(start.x,start.y)+0.1,start.y)
	var heading := Basis(Vector3.UP,float(map_data.angle))
	var front := -heading.z
	chase.set_parked_view(depot-front*5.1+heading.x*3.9+Vector3.UP*3.45,
		depot+front*3.1-heading.x*0.64+Vector3.UP*1.12)
	_reset_car()
	hud.configure(map_data)
	_refresh_order()
	_begin_dispatch()
	for arg in OS.get_cmdline_user_args():
		if arg == "--benchmark":
			var benchmark: Node = load("res://drive_benchmark.gd").new()
			add_child(benchmark)
		elif arg.begins_with("--capture-view="):
			_capture_view(arg.trim_prefix("--capture-view="))
		elif arg.begins_with("--capture-reference="):
			_capture_reference(arg.trim_prefix("--capture-reference="))


func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton or (event is InputEventJoypadMotion and absf(event.axis_value) > 0.3):
		last_input_pad = true
	elif event is InputEventKey and event.pressed:
		last_input_pad = false
	if event.is_action_pressed(&"ui_cancel"):
		get_tree().quit()


func _physics_process(delta: float) -> void:
	var action := Input.is_action_just_pressed(&"deliver")
	if Input.is_action_just_pressed(&"reset_car"):
		dispatch.finish()
		marker.visible = destination < customers.size()
		_reset_car()
		if delivery.reset_order():
			_begin_return(false)
	if dispatch.active():
		if dispatch.step(delta,action):
			marker.show()
		return
	if back_to_depot:
		var at := Vector2(car.position.x-depot.x,car.position.z-depot.z)
		if shift.wait_for_dispatch(delta,at.length() <= SHIFT.DEPOT_RADIUS and absf(car.speed) < 0.9):
			back_to_depot = false
			destination += 1
			_refresh_order()
			if destination < customers.size():
				_reset_car()
				_begin_dispatch()
		return
	if destination >= customers.size():
		return
	var old_stage := delivery.stage
	delivery.step(delta,action,stop)
	if old_stage != delivery.stage:
		marker.visible = delivery.stage not in [HANDOFF.Stage.HANDOFF,HANDOFF.Stage.CASH]
	if delivery.stage == HANDOFF.Stage.RETURNING:
		_pay_for_order()
	if delivery.done:
		_begin_return(delivery.failed)
	else:
		can_deliver = delivery.action_ready(stop)


func _pay_for_order() -> void:
	if shift.settled:
		return
	var before := shift.money
	shift.settle(delivery.tips_allowed,false)
	hud.show_payment(shift.money-before,shift.money)


func _begin_dispatch() -> void:
	marker.hide()
	dispatch.begin()


func _begin_return(failed: bool) -> void:
	back_to_depot = true
	delivery.done = false
	can_deliver = false
	if failed:
		shift.settle(delivery.tips_allowed,true)
		hud.show_payment(0,shift.money)
	else:
		_pay_for_order()
	var spec: Dictionary = map_data.deliveries[destination]
	hud.return_to_depot(spec.back_home,map_data.spawn,failed)
	marker.position = depot
	marker_label.text = "Следующий заказ у пиццерии" if destination+1 < customers.size() else "Закрыть смену у пиццерии"


func _vehicle_contact(contact: KinematicCollision3D, approach: float, motion: Vector3) -> float:
	var collider := contact.get_collider() as Node3D
	if collider is NPC_CAR:
		var impact: float = approach+maxf(0.0,collider.pace*(-collider.basis.z).dot(contact.get_normal()))
		car.collision_damage(impact,true,contact.get_position(),contact.get_normal())
		collider.struck(impact,motion)
		return -1.0
	var retention: float = furniture.impact(contact,approach,motion)
	if retention < 0.70:
		var strength := approach if retention < 0.0 else approach*0.84
		if collider == null or collider.name != &"Architecture" or strength >= 13.0:
			car.collision_damage(strength,false,contact.get_position(),contact.get_normal())
	return retention


func _people_contact(start: Vector3, stop_at: Vector3, motion: Vector3) -> void:
	var speed := motion.length()
	if speed < 3.0:
		return
	var travel := car.basis.inverse()*(stop_at-start)
	contact_box.size = Vector3(2.19+absf(travel.x),1.60,4.75+absf(travel.z))
	people_query.transform = Transform3D(car.basis,(start+stop_at)*0.5+Vector3.UP*0.79)
	var contacts := get_world_3d().direct_space_state.intersect_shape(people_query,32)
	var handled: Dictionary = {}
	for found in contacts:
		var collider := found.collider as Node3D
		if collider == null:
			continue
		var owner := collider.get_parent()
		if owner is RAGDOLL_BODY:
			var rig := owner as RAGDOLL_BODY
			var person := rig.get_parent() as WALKER
			if handled.has(person):
				continue
			handled[person] = true
			if rig.car_hit(collider,collider.global_position,motion,speed):
				if person.ground_hit(speed) and adult:
					_blood_hit(person,motion,speed)
			continue
		if not owner is WALKER:
			continue
		var person := owner as WALKER
		if handled.has(person):
			continue
		handled[person] = true
		if person.knockdown > 0.0:
			if person.ground_hit(speed) and adult:
				_blood_hit(person,motion,speed)
			continue
		var active_client: bool = person == delivery.target and delivery.stage == HANDOFF.Stage.DRIVING
		var sample := PEDESTRIAN_CONTACT.from_sweep(start,stop_at,car.basis,motion,person.global_position,WALKER.BODY_RADIUS)
		if sample.is_empty():
			continue
		var direction: Vector3 = sample.direction
		var result: int = person.impact(sample.speed,direction,active_client,sample.offset,sample.lift)
		if active_client:
			delivery.customer_hit(result)
		if result >= WALKER.Hit.FALL:
			car.person_bump()
			if adult and result == WALKER.Hit.DOWN:
				_blood_hit(person,direction,sample.speed)


func _blood_hit(person: Node3D, direction: Vector3, speed: float) -> void:
	var source: Node3D = person.bleed_from()
	var at := source.global_position
	blood.burst(at,direction.normalized(),speed,source)
	car.damage.stain(at,speed)


func _process(_delta: float) -> void:
	var pose := car.get_global_transform_interpolated()
	var at := Vector2(pose.origin.x,pose.origin.z)
	var forward := Vector2(-pose.basis.z.x,-pose.basis.z.z)
	var meters := 0.0
	if marker.visible:
		var eye: Vector3 = courier.position if courier.active else pose.origin
		_update_marker()
		meters = Vector2(eye.x,eye.z).distance_to(Vector2(marker.position.x,marker.position.z))
		marker_label.visible = meters < 115.0
	hud.update_drive(at,forward,absf(car.speed)*3.6,meters,_delivery_hint(),last_input_pad,courier.active and not dispatch.active())


func _delivery_hint() -> String:
	if dispatch.active():
		var skip := "A" if last_input_pad else "E"
		match dispatch.stage:
			DISPATCH.Stage.RUN: return "Курьер несёт заказ  •  %s пропустить" % skip
			DISPATCH.Stage.LOAD: return "Погрузка в багажник"
			DISPATCH.Stage.WALK: return "Курьер садится за руль"
			DISPATCH.Stage.START: return "Запуск двигателя"
	if back_to_depot or destination >= customers.size():
		return ""
	var button := "A" if last_input_pad else "E"
	match delivery.stage:
		HANDOFF.Stage.DRIVING:
			if can_deliver:
				return button + "  Выйти за заказом"
		HANDOFF.Stage.TAKING: return "Забираем заказ из багажника"
		HANDOFF.Stage.CARRYING: return "К клиенту у подъезда"
		HANDOFF.Stage.HANDOFF: return "Передача заказа"
		HANDOFF.Stage.CASH: return "Клиент рассчитывается"
		HANDOFF.Stage.RETURNING: return (button + "  Сесть за руль") if can_deliver else "Вернитесь к машине"
	return ""


func _reset_car() -> void:
	car.park(_v2(map_data.spawn),map_data.angle)
	tire_tracks.break_tracks()
	chase.reset_view()


func _refresh_order() -> void:
	marker.visible = destination < customers.size()
	can_deliver = false
	if not marker.visible:
		delivery.done = false
		hud.free_drive(shift.delivered,shift.money)
		return
	var order: Dictionary = map_data.deliveries[destination]
	shift.accept(order)
	var parking := _v2(order.stop)
	stop = Vector3(parking.x,terrain.at(parking.x,parking.y)+0.10,parking.y)
	customers[destination].set_active(true)
	delivery.play_order(customers[destination],entrances[destination])
	_update_marker()
	hud.set_order(destination,order,true)


func _update_marker() -> void:
	if back_to_depot:
		return
	var button := "A" if last_input_pad else "E"
	var text: String = map_data.deliveries[destination].name
	match delivery.stage:
		HANDOFF.Stage.DRIVING:
			marker.position = stop
			if can_deliver:
				text = button + "  Выйти с заказом"
		HANDOFF.Stage.TAKING:
			text = "Забираем заказ из багажника"
		HANDOFF.Stage.CARRYING:
			marker.position = customers[destination].position + Vector3.UP*0.10
			text = "Получатель"
		HANDOFF.Stage.HANDOFF:
			text = "Передача заказа"
		HANDOFF.Stage.CASH:
			text = "Клиент рассчитывается"
		HANDOFF.Stage.RETURNING:
			marker.position = car.position + Vector3.UP*0.10
			text = (button + "  Сесть за руль") if can_deliver else "Вернитесь к машине"
	if marker_label.text != text:
		marker_label.text = text


func _configure_materials() -> ShaderMaterial:
	var city_material := ShaderMaterial.new()
	city_material.shader = CITY_COLOR
	city_material.set_shader_parameter(&"grade_surfaces",true)
	var prop_material := ShaderMaterial.new()
	prop_material.shader = CITY_COLOR
	prop_material.set_shader_parameter(&"dynamic_props",true)
	prop_material.set_shader_parameter(&"prop_mask",furniture.mask_texture)
	var flat_material := ShaderMaterial.new()
	flat_material.shader = ACTOR_COLOR
	flat_material.set_shader_parameter(&"flat_city",true)
	ground_material.shader = LANDSCAPE
	window_material.shader = RESIDENTIAL_WINDOW
	var grass_material := ShaderMaterial.new()
	grass_material.shader = GRASS_COLOR
	var crown := ShaderMaterial.new()
	crown.shader = CROWN_COLOR
	var wood := ShaderMaterial.new()
	wood.shader = CITY_COLOR
	wood.set_shader_parameter(&"wood_grain",true)
	for material in [city_material,prop_material,flat_material,ground_material,grass_material,wood]:
		street_lights.bind(material)
	var texture_cache: Dictionary = {}
	for block: MeshInstance3D in $City.get_children()+$Verge.get_children()+$Crowns.get_children():
		var paint: StandardMaterial3D = block.mesh.surface_get_material(0)
		var prop_mesh := paint.resource_name.begins_with("Prop")
		var leaf := paint.resource_name.begins_with("Foliage")
		var trunk := paint.resource_name.begins_with("Wood")
		var verge := paint.resource_name.begins_with("VergeLeaves")
		var solid_crown := paint.resource_name.begins_with("CrownCore")
		if solid_crown:
			block.material_override = crown
		elif verge:
			block.material_override = leaves.verge_paint
		elif leaf:
			block.hide()
		elif trunk:
			block.material_override = wood
		elif paint.resource_name.begins_with("PropColor"):
			block.material_override = prop_material
		elif paint.resource_name.begins_with("Landscape"):
			block.material_override = ground_material
		elif paint.resource_name.begins_with("City"):
			block.material_override = city_material
		elif paint.resource_name.begins_with("Windows"):
			block.material_override = window_material
		elif paint.resource_name.begins_with("Flat"):
			block.material_override = flat_material
		elif paint.albedo_texture:
			if not texture_cache.has(paint):
				var replacement := ShaderMaterial.new()
				replacement.shader = TEXTURED_CITY
				replacement.set_shader_parameter(&"surface_map",paint.albedo_texture)
				replacement.set_shader_parameter(&"punched",paint.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED)
				replacement.set_shader_parameter(&"cutoff",paint.alpha_scissor_threshold)
				if prop_mesh:
					replacement.set_shader_parameter(&"dynamic_props",true)
					replacement.set_shader_parameter(&"prop_mask",furniture.mask_texture)
				texture_cache[paint] = replacement
			block.material_override = texture_cache[paint]
		var casts_shadow := prop_mesh or trunk or verge or solid_crown
		block.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for block: MeshInstance3D in $Occluders.get_children():
		block.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	var shrub := ShaderMaterial.new()
	shrub.shader = SHRUB_COLOR
	shrub.set_shader_parameter(&"leaves",SHRUB_LEAVES)
	for block: MeshInstance3D in $Understory.get_children():
		block.material_override = shrub
		block.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		block.visibility_range_end = 113.0
		block.visibility_range_end_margin = 12.0
	for block: MeshInstance3D in $CurbGrowth.get_children():
		block.material_override = flat_material
		block.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		block.visibility_range_end = 52.0
		block.visibility_range_end_margin = 8.0
	for block: MeshInstance3D in $Grass.get_children():
		block.material_override = grass_material
		block.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		block.visibility_range_end = 75.0
		block.visibility_range_end_margin = 10.0
	return city_material


func _make_entrances() -> void:
	var frame := StandardMaterial3D.new()
	frame.albedo_color = Color("#74654e")
	var panel := StandardMaterial3D.new()
	panel.albedo_color = Color("#485647")
	panel.roughness = 0.74
	var steel := StandardMaterial3D.new()
	steel.albedo_color = Color("#b1a99b")
	steel.metallic = 0.36
	for order: Dictionary in map_data.deliveries:
		var location := _v2(order.entrance.at)
		var facing := _v2(order.entrance.front)
		var edge := location+facing*0.40
		var height: float = terrain.at(edge.x,edge.y)
		var door := ENTRANCE.new()
		add_child(door)
		entrances.append(door)
		door.setup(Vector3(location.x+facing.x*0.07,height+1.1,location.y+facing.y*0.07),
			Vector3(facing.x,0.0,facing.y),frame,panel,steel)


func _make_people() -> void:
	var paint := ShaderMaterial.new()
	paint.shader = ACTOR_COLOR
	street_lights.bind(paint)
	add_child(courier)
	courier.setup(COURIER_SCENE,paint,terrain,chase)
	for i in map_data.walkers.size():
		var spec: Array = map_data.walkers[i]
		_person(i,_v2(spec[0]),_v2(spec[1]),spec[2],paint)
	for i in map_data.deliveries.size():
		var order: Dictionary = map_data.deliveries[i]
		var wait_at := _v2(order.customer)
		var customer := _person(i+2,wait_at,wait_at,0.0,paint)
		var to_street := _v2(order.stop)-wait_at
		customer.rotation.y = atan2(to_street.x,to_street.y)
		customer.set_active(i == 0)
		customers.append(customer)


func _person(index: int, from: Vector2, to: Vector2, phase: float, paint: Material) -> Node3D:
	var actor := WALKER.new()
	add_child(actor)
	actor.setup(ACTORS[index%ACTORS.size()],from,to,phase,terrain)
	actor.camera = chase
	actor.impact_ground = impact_ground
	for mesh in actor.model.find_children("*","MeshInstance3D",true,false):
		mesh.material_override = paint
	return actor


func _make_marker() -> void:
	marker = Node3D.new()
	marker.name = "DeliveryStop"
	add_child(marker)
	var mesh := TorusMesh.new()
	mesh.inner_radius = 3.0
	mesh.outer_radius = 3.20
	mesh.rings = 40
	mesh.ring_segments = 8
	var paint := StandardMaterial3D.new()
	paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	paint.albedo_color = Color("#ffd375")
	var ring := MeshInstance3D.new()
	ring.mesh = mesh
	ring.material_override = paint
	ring.scale.y = 0.23
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	marker.add_child(ring)
	marker_label = Label3D.new()
	marker_label.position.y = 2.45
	marker_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	marker_label.font_size = 36
	marker_label.pixel_size = 0.016
	marker_label.modulate = Color("#ffe3a1")
	marker.add_child(marker_label)


func _capture_reference(file: String) -> void:
	# Reframe the live level on the curve just south of the depot.
	var at := Vector2(-52.40,35.50)
	car.park(at,-0.148)
	var eye := Vector3(-57.0,car.position.y+2.73,41.55)
	var target := Vector3(-54.2,car.position.y+1.63,30.0)
	chase.set_parked_view(eye,target)
	chase.reset_view()
	chase.fov = 64.0
	hud.hide()
	marker.hide()
	await get_tree().create_timer(0.85).timeout
	_capture_view(file)


func _capture_view(file: String) -> void:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(file)


func _v2(values: Array) -> Vector2:
	return Vector2(values[0],values[1])
