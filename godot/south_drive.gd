extends Node3D

const REGION_WORLD := preload("res://south_region_world.gd")
const REGION_ROUTES := preload("res://south_region_routes.gd")
const REGION_MAP := preload("res://south_region_map_ui.gd")
const REGION_EDGE := preload("res://south_region_edge.gd")
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
var terrain: RefCounted
var strip := preload("res://delivery_route_strip.gd").new()
var region_world := REGION_WORLD.new()
var region_routes := REGION_ROUTES.new()
var region_map := REGION_MAP.new()
var region_edge := REGION_EDGE.new()
var region_data: Dictionary
var waypoint: Dictionary = {}
var gps_path: Array = []
var gps_stop: Array = []
var last_gps_at := Vector2.ZERO
var gps_timer := 0.0
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
var profile := preload("res://career_profile.gd").new()
var career: RefCounted
var quick_runs := preload("res://quick_runs.gd").new()
var beach := preload("res://south_beach.gd").new()
var book := preload("res://south_order_book.gd").new()
var achievements := preload("res://local_achievements.gd").new()
var audio := preload("res://game_audio.gd").new()
var events := preload("res://south_events.gd").new()
var hud_elapsed := 0.0
var rescues := 0
var manifest := preload("res://order_manifest.gd").new()
var staff := preload("res://south_staff_ride.gd").new()
var crew := preload("res://south_crew.gd").new()
var recipient_book := preload("res://delivery_recipients.gd").new()
var garage := preload("res://semerka_garage.gd").new()
var choices := preload("res://shift_choices.gd").new()
var menu := preload("res://game_menu.gd").new()
var papers := preload("res://shift_papers.gd").new()
var clock_hud := preload("res://shift_clock_hud.gd").new()
var visitor := preload("res://gennady_visit.gd").new()
var arrival := preload("res://story_arrival.gd").new()
var actor_paint := ShaderMaterial.new()
var frame_paint := StandardMaterial3D.new()
var door_paint := StandardMaterial3D.new()
var steel_paint := StandardMaterial3D.new()
var current: Dictionary = {}
var invoice: Dictionary = {}
var playing := false
var free_roam := false
var story_order := false
var ending_after_return := false
var health_before := 7.0
var late_charges: Array[Dictionary] = []
var last_tip := 0
var session_shifts := 0
var destination := -1
var back_to_depot := false
var depot := Vector3.ZERO
var marker: Node3D
var marker_label: Label3D
var stop := Vector3.ZERO
var last_input_pad := false


func _ready() -> void:
	map_data = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	var warmup: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-warmup.json"))
	map_data.deliveries.append(warmup)
	var ground: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-ground.json"))
	var detail := TERRAIN.new()
	detail.setup(ground,FileAccess.get_file_as_bytes("res://assets/south-ground.bin"))
	region_data = JSON.parse_string(FileAccess.get_file_as_string("res://assets/south-region.json"))
	# X operates the optional flight kit; the prototype also bound it to a reset.
	for binding: InputEvent in InputMap.action_get_events(&"reset_car"):
		if binding is InputEventJoypadButton and binding.button_index == JOY_BUTTON_X:
			InputMap.action_erase_event(&"reset_car",binding)
	add_child(region_world)
	region_world.setup(region_data, map_data.bounds, detail, car)
	terrain = region_world.ground
	add_child(strip)
	strip.setup(terrain)
	region_routes.setup(region_data, map_data)
	book.setup(region_data, map_data, region_routes)
	add_child(beach)
	beach.setup(terrain,book,region_data,car)
	map_data.deliveries = []
	var temporary := false
	for arg in OS.get_cmdline_user_args():
		temporary = temporary or arg == "--benchmark" or arg.begins_with("--capture-") or arg == "--test-profile"
	profile.open(temporary)
	career = profile
	if not profile.data.has("seed"):
		profile.data.seed = randi()

	region_edge.setup(region_data.boundary)
	car.surface.setup(region_data)
	car.drowned.connect(_drowned)
	car.region_edge = region_edge
	courier.region_edge = region_edge
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
	traffic.setup(terrain,_v2(map_data.spawn),region_data,car,_person.bind(actor_paint))
	add_child(crew)
	crew.setup(traffic,_v2(map_data.spawn))
	var pickups := PICKUPS.new()
	add_child(pickups)
	pickups.setup(terrain,car,_v2(map_data.spawn),region_data)
	add_child(delivery)
	delivery.setup(car,courier,chase,terrain)
	add_child(dispatch)
	dispatch.setup(car,terrain,map_data.dispatch)
	delivery.arrived.connect(_pay_for_order)
	delivery.payment_started.connect(_show_payment)
	add_child(arrival)
	arrival.setup(car, courier, chase, terrain, region_routes, region_data.gennady)
	add_child(visitor)
	arrival.at_door.connect(_enter_apartment)
	arrival.returned.connect(_begin_return.bind(false))
	visitor.stair_time.connect(_stairs_tick)
	visitor.completed.connect(_story_completed)
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
	marker.hide()
	hud.configure(map_data, region_data)
	add_child(region_map)
	region_map.setup(region_data, map_data, region_routes)
	region_map.waypoint_changed.connect(_set_waypoint)
	add_child(achievements)
	achievements.setup(adult, temporary)
	achievements.bind_vehicle(car)
	add_child(audio)
	audio.setup(car)
	add_child(events)
	events.setup(car,terrain,traffic,region_data,profile,_person.bind(actor_paint))
	events.road_thump.connect(func(k:float): audio.cue("thud",car.position,k))
	add_child(quick_runs)
	quick_runs.setup(car, terrain, region_data, traffic)
	quick_runs.repeat_requested.connect(_repeat_quick)
	quick_runs.conditions_requested.connect(_quick_conditions)
	quick_runs.menu_requested.connect(_main_menu)
	add_child(papers)
	papers.setup(region_data, map_data)
	papers.next_shift_requested.connect(_enter_career)
	papers.free_drive_requested.connect(_free_drive)
	add_child(clock_hud)
	add_child(choices)
	add_child(recipient_book)
	add_child(staff)
	staff.setup(car,terrain,book,recipient_book,actor_paint,_v2(map_data.dispatch.door))
	staff.route_changed.connect(_staff_route)
	staff.notice.connect(clock_hud.notice)
	staff.money_earned.connect(_staff_pay)
	staff.stars_earned.connect(_staff_stars)
	staff.finished.connect(func(_ok:bool): _finish_shift(true))
	add_child(garage)
	garage.setup(car,adult)
	garage.closed.connect(_garage_closed)
	garage.next_shift_requested.connect(_enter_career)
	papers.set_spending_enabled(adult)
	papers.garage_requested.connect(_open_garage)
	papers.bet_requested.connect(_open_bet)
	papers.main_menu_requested.connect(_leave_receipt)
	add_child(menu)
	menu.setup()
	menu.bind_map(region_map)
	menu.bind_audio(audio)
	menu.bind_achievements(achievements)
	menu.bind_profile(profile,achievements,quick_runs)
	menu.profile_changed.connect(_profile_changed)
	menu.visibility_changed.connect(_audio_context)
	region_map.visibility_changed.connect(_audio_context)
	menu.bind_graphics(chase, $Sun)
	var threshold := _v2(map_data.dispatch.door)
	menu.set_shift_location(Vector3(threshold.x, terrain.at(threshold.x,threshold.y),threshold.y), depot)
	menu.garage_requested.connect(_open_garage)
	menu.quick_requested.connect(_start_quick)
	menu.records_requested.connect(_records)
	menu.set_available_modes(PackedStringArray(["normal","hell","afterhell"]))
	menu.career_requested.connect(_enter_career)
	menu.free_drive_requested.connect(_free_drive)
	menu.finish_shift_requested.connect(_finish_shift.bind(false))
	menu.main_menu_requested.connect(_main_menu)
	menu.map_requested.connect(_open_map)
	menu.quit_requested.connect(_quit_from_menu)
	if temporary:
		_start_shift()
	else:
		_main_menu()
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
	if visitor.active() or papers.blocking() or menu.active() or choices.visible or quick_runs.results_open() or garage.active() or achievements.active():
		return
	if event.is_action_pressed(&"district_map"):
		_open_map()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed(&"ui_cancel") or (event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_P) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_START):
		menu.open_pause({"shift_number": shift.number, "delivered": shift.delivered, "earned": shift.money, "balance": profile.data.wallet,
			"clock": shift.clock_text(), "free_drive": free_roam}, invoice if playing and not back_to_depot else {})
		get_viewport().set_input_as_handled()


func _audio_context() -> void:
	var scene := "drive"
	if menu.active():
		scene = "drive" if playing or free_roam else "menu"
	elif visitor.active():
		scene = "interior"
	elif papers.blocking() or quick_runs.results_open():
		scene = "shiftend"
	audio.set_context(scene,$Atmosphere.night > .5,get_tree().paused)
	audio.set_environment($Atmosphere.season,$Atmosphere.weather,$Atmosphere.night,$Atmosphere.precipitation.rain,$Atmosphere.holiday)


func _staff_pay(amount: int) -> void:
	shift.pay += amount
	shift.money += amount
	profile.data.wallet = int(profile.data.wallet) + amount
	hud.show_payment(amount,int(profile.data.wallet))
	_checkpoint()


func _staff_stars(count: int) -> void:
	profile.data.stars = int(profile.data.stars)+count
	_checkpoint()


func _staff_route(at: Vector2, address: String, route: Array) -> void:
	waypoint = {}
	gps_stop = [at.x,at.y]
	gps_path = route
	hud.set_navigation(route,gps_stop)
	strip.set_route(route,false,bool(profile.data.get("road_path",true)))
	hud.mission.text = "РАЗВОЗ СМЕНЫ"
	hud.address.text = address
	hud.homebound = false
	marker.position = Vector3(at.x,terrain.at(at.x,at.y)+.1,at.y)
	marker_label.text = address
	marker.show()


func _open_map() -> void:
	region_map.open_at(Vector2(car.position.x, car.position.z), waypoint, gps_path, gps_stop)


func _open_garage() -> void:
	garage.open(career)


func _open_bet() -> void:
	garage.open_bet(career,shift.number,shift.money)


func _garage_closed() -> void:
	if papers.blocking():
		papers.refresh_balance(int(career.data.wallet))
	else:
		_main_menu()


func _leave_receipt() -> void:
	papers.dismiss()
	_main_menu()


func _start_quick(id: String) -> void:
	var options := menu.quick_options()
	options.mode = id
	_begin_quick(options)


func _repeat_quick() -> void:
	_begin_quick(quick_runs.original_options)


func _begin_quick(options: Dictionary) -> void:
	var sandbox := quick_runs.begin(career,options)
	if sandbox == null:
		_main_menu()
		return
	profile = sandbox
	_start_shift()


func _quick_conditions() -> void:
	menu.open_quick(int(career.data.shifts))


func _records() -> void:
	quick_runs.show_records(career.data.get("best", {}))


func _enter_career() -> void:
	profile = career
	if int(profile.data.shifts) >= 1 and not profile.data.has("road_path"):
		papers.dismiss()
		choices.selected.connect(_road_preference, CONNECT_ONE_SHOT)
		choices.offer("Ирина Сергеевна", "Оставить путь на дороге?", ["Оставить","Убрать"])
	else:
		_start_shift()


func _road_preference(index: int) -> void:
	profile.data.road_path = index == 0
	profile.save()
	_start_shift()


func _profile_changed() -> void:
	profile = career
	car.apply_equipment(garage.loadout(career))
	_main_menu()


func _main_menu() -> void:
	staff.clear()
	crew.clear()
	achievements.set_records(career.data,int(quick_runs.state.get_value("quick","best",0)))
	events.finish()
	quick_runs.abort()
	profile = career
	playing = false
	free_roam = false
	car.active_shift = false
	clock_hud.hide()
	marker.hide()
	menu.open_start(int(profile.data.shifts) > 0, int(profile.data.shifts))


func _drowned() -> void:
	if playing:
		_offer_rescue()
	elif free_roam:
		_reset_car()


func _offer_rescue() -> void:
	if choices.visible:
		return
	var done := int(profile.data.shifts)
	var sale := rescues == 0 and done >= int(profile.data.get("last_rescue_sale", -3)) + 3
	var cost := 1000 if sale else 3000 * int(pow(2, rescues))
	var prompt := "Семёрка разбита. В кошельке %d ₽" % int(profile.data.wallet)
	if int(profile.data.wallet) < cost:
		choices.selected.connect(func(_index: int): _finish_shift(false,"dead"), CONNECT_ONE_SHOT)
		choices.offer("Пиццерия",prompt,["Закончить смену"],4.0,0)
	else:
		choices.selected.connect(_rescue_picked.bind(cost,sale), CONNECT_ONE_SHOT)
		choices.offer("Пиццерия",prompt,["Воскреснуть за %d ₽" % cost,"Закончить смену"],9.0,1)


func _rescue_picked(index: int, cost: int, sale: bool) -> void:
	if index != 0:
		_finish_shift(false,"dead")
		return
	profile.data.wallet = int(profile.data.wallet) - cost
	if sale:
		profile.data.last_rescue_sale = int(profile.data.shifts)
	rescues += 1
	var safe := region_routes.route_between(Vector2(car.position.x,car.position.z),_v2(map_data.spawn))
	var at := _v2(safe[0]) if not safe.is_empty() else _v2(map_data.spawn)
	if car.sinking >= 0 or car.surface.water_depth > .15:
		at = _v2(map_data.spawn)
	car.park(at,car.rotation.y)
	car.hearts = car.hearts_max
	car.damage.repair()
	health_before = car.hearts
	tire_tracks.break_tracks()
	chase.reset_view()
	hud.show_payment(0,int(profile.data.wallet))
	_checkpoint()


func _quit_from_menu() -> void:
	if playing:
		_checkpoint()
	get_tree().quit()


func _physics_process(delta: float) -> void:
	if not playing:
		if free_roam:
			events.step(delta,true,shift.hour())
		if free_roam and Input.is_action_just_pressed(&"reset_car"):
			_reset_car()
		return
	if clock_hud.intro >= 0:
		if clock_hud.advance_chat(delta):
			car.controls_locked = false
			_issue_order()
		return
	var action := Engine.get_physics_frames() > maxi(maxi(menu.consumed_physics_frame, choices.consumed_physics_frame), maxi(region_map.closed_on_frame, papers.consumed_physics_frame)) + 1 and Input.is_action_just_pressed(&"deliver")
	if visitor.active():
		return
	if car.engine.restarting:
		action = false
	if arrival.phase != arrival.Phase.IDLE:
		arrival.step(delta)
		return
	shift.tick(delta)
	traffic.clock_hour = shift.hour()
	if not quick_runs.active():
		crew.step(delta,not profile.data.gennady_paid,_v2(current.stop) if not current.is_empty() else Vector2.INF)
	events.step(delta, not dispatch.active() and not papers.active(), traffic.clock_hour)
	$Atmosphere.set_clock(shift.env_time)
	if not late_charges.is_empty() and shift.elapsed >= float(late_charges[0].due):
		var notice: Dictionary = late_charges.pop_front()
		var fine_amount: int = int(notice.amount)
		shift.fine(fine_amount)
		clock_hud.notice("Ирина Сергеевна   Опоздал. Пицца на замену   −%d ₽" % fine_amount)
		hud.show_payment(0, int(profile.data.wallet))
		_checkpoint()
	if car.hearts < health_before:
		shift.hits += 1
	health_before = car.hearts
	hud_elapsed += delta
	if hud_elapsed >= .12:
		hud_elapsed = 0
		_audio_context()
		clock_hud.update_clock(shift.number, shift.clock_text(), shift.deadline, not dispatch.active() and (back_to_depot or not shift.settled), ceili(car.hearts))
	if car.hearts <= 0:
		_offer_rescue()
		return
	if staff.step(delta,not back_to_depot,Vector2(car.position.x-depot.x,car.position.z-depot.z).length() <= SHIFT.DEPOT_RADIUS):
		return
	if not playing:
		return
	if Input.is_action_just_pressed(&"reset_car"):
		_reset_car()
		if not current.is_empty() and not back_to_depot and not story_order and delivery.reset_order():
			_begin_return(false)
	if dispatch.active():
		dispatch.step(delta)
		return
	if not shift.settled or back_to_depot:
		shift.deadline -= delta
	if back_to_depot:
		var at := Vector2(car.position.x-depot.x, car.position.z-depot.z)
		if shift.deadline < 0 and not shift.return_fined and not current.get("tutorial", false):
			shift.return_fined = true
			shift.fine(maxi(150, roundi(shift.fee * .01) * 10))
			profile.data.skill = maxf(0, float(profile.data.skill) - .5)
			hud.show_payment(0, int(profile.data.wallet))
			_checkpoint()
		if shift.wait_for_dispatch(delta, at.length() <= SHIFT.DEPOT_RADIUS and absf(car.position.y - terrain.at(car.position.x, car.position.z)) <= 1.0):
			if ending_after_return or (shift.elapsed >= shift.duration and (shift.number > 1 or profile.data.gennady_paid)):
				_finish_shift(true)
			elif not quick_runs.active() and not shift.meal_taken and shift.env_time >= .06 + 5.0 / 15.0 and shift.elapsed < shift.duration - (SHIFT.FINAL_WINDOW if shift.number == 1 else 0.0):
				_offer_meal()
			else:
				_issue_order()
		return
	if story_order:
		if Vector2(car.position.x, car.position.z).distance_to(_v2(region_data.gennady.door)) <= 38:
			var box: Node3D = dispatch.bag.duplicate()
			add_child(box)
			if arrival.try_begin(box):
				marker.hide()
				papers.dismiss()
			else:
				box.queue_free()
		return
	delivery.step(delta, action, stop)
	marker.visible = delivery.pin_alpha() > 0
	if delivery.stage == HANDOFF.Stage.RETURNING:
		clock_hud.panel.hide()
	if delivery.done:
		_begin_return(delivery.failed)


func _offer_meal() -> void:
	shift.meal_taken = true
	choices.selected.connect(_meal_picked, CONNECT_ONE_SHOT)
	choices.offer("Ирина Сергеевна", "Женя, время обеда. Выбери что-нибудь, потом поедешь.",
		["Починить машину", "«Директорская»", "Холодная пепперони"])


func _meal_picked(index: int) -> void:
	match index:
		0:
			car.hearts = car.hearts_max
			car.damage.repair()
			car.engine.repair()
		1: shift.lunch_tips = true
		2:
			car.hearts_max += 1
			car.hearts += 1
	health_before = car.hearts
	_issue_order()


func _start_shift() -> void:
	manifest = preload("res://order_manifest.gd").new()
	late_charges.clear()
	papers.dismiss()
	clock_hud.show()
	_remove_order()
	map_data.deliveries.clear()
	destination = -1
	back_to_depot = false
	ending_after_return = false
	free_roam = false
	playing = true
	shift = quick_runs.make_shift() if quick_runs.active() else SHIFT.new()
	shift.begin(profile)
	staff.begin(shift.number,int(profile.data.seed))
	beach.begin(shift.number,int(profile.data.seed))
	rescues = 0
	achievements.begin_shift()
	events.begin_shift(shift.number,shift.duration,false,quick_runs.active())
	if quick_runs.active():
		shift.pace = "normal"
		$Atmosphere.start_quick(quick_runs.conditions.season,quick_runs.conditions.weather,int(profile.data.seed))
	else:
		shift.pace = ["generous","normal","tight"][session_shifts % 3]
		session_shifts += 1
		$Atmosphere.start_career(shift.number,int(profile.data.seed),not events.can_event("hurricane"))
		profile.data.season = $Atmosphere.season
		crew.begin(profile.data,shift.number,clampi(1 + shift.tier,1,5))
	car.apply_equipment(garage.loadout(profile))
	car.begin_shift(shift.number, shift.pace, profile.data.get("engine", {}))
	if not quick_runs.active() and shift.number == 1 and profile.data.gennady_paid:
		var chapter: Dictionary = profile.data.get("final_summary", {})
		for key: String in chapter:
			shift.set(key, chapter[key])
		_finish_shift(true)
		return
	_reset_car()
	health_before = car.hearts
	car.controls_locked = true
	hud.show_payment(0, int(profile.data.wallet))
	if quick_runs.active():
		car.controls_locked = false
		_issue_order()
	else:
		clock_hud.opening()
	profile.save()


func _issue_order() -> void:
	var final_due: bool = shift.number == 1 and not profile.data.gennady_paid and shift.duration - shift.elapsed < SHIFT.FINAL_WINDOW
	var order := {}
	if not final_due and shift.orders > 0:
		order = beach.order_if_due(shift.orders+1,shift.hour(),events.tension,$Atmosphere)
	if order.is_empty():
		order = book.next_order(shift.orders == 0, final_due, profile.data.recent, shift.level, shift.orders+1)
	if order.is_empty():
		push_error("В районе отсутствует доступный путь из пиццерии и обратно")
		_finish_shift(false)
		return
	manifest.prepare(order, shift, book)
	car.engine.begin_order()
	shift.accept(order, manifest)
	order.quick = quick_runs.active()
	_activate_order(order)
	profile.remember(order.name)
	_show_invoice()
	dispatch.begin()
	_checkpoint()


func _activate_order(order: Dictionary) -> void:
	_remove_order()
	map_data.deliveries.append(order)
	destination = map_data.deliveries.size() - 1
	current = order
	recipient_book.prepare(order,profile.data,shift.number,shift.orders,adult)
	if quick_runs.active():
		quick_runs.protect_order(order)
	story_order = bool(order.get("story", false))
	events.order(shift.orders,shift.duration-shift.elapsed,_v2(order.stop),story_order)
	back_to_depot = false
	ending_after_return = story_order
	waypoint = {}
	var at := _v2(order.stop)
	stop = Vector3(at.x, terrain.at(at.x, at.y) + .10, at.y)
	marker.position = stop
	marker.show()
	if story_order:
		visitor.prepare()
	else:
		var door: Node3D
		var customer := _make_customer(order)
		if order.get("beach",false):
			beach.place(customer,order)
		else:
			door = _make_entrance(order)
			entrances.append(door)
		customers.append(customer)
		delivery.play_order(customer, door)
		for i in range(1, int(order.get("people",1))):
			var group_member := order.duplicate()
			var front := _v2(order.entrance.front)
			var side := Vector2(-front.y,front.x) * (1.05 * ceilf(i / 2.0) * (1.0 if i%2 else -1.0))
			var spot := _v2(order.customer) + side
			group_member.customer = [spot.x,spot.y]
			var person := _make_customer(group_member, i)
			customers.append(person)
			delivery.add_recipient(person)
	hud.set_order(shift.orders - 1, order, true)
	_set_waypoint({}, [])


func _remove_order() -> void:
	for actor in customers + entrances:
		if is_instance_valid(actor):
			actor.queue_free()
	entrances.clear()
	customers.clear()
	delivery.target = null
	delivery.door = null
	clock_hud.panel.hide()
	current = {}


func _show_invoice() -> void:
	var person: Dictionary = current.recipients[0]
	var recipient := str(person.label)
	invoice = {"number": shift.orders, "recipient": recipient, "address": current.name, "items": manifest.invoice_items(current), "kind": manifest.kind, "avatar": recipient_book.portrait(person),
		"fee": manifest.total_fee, "route": current.from_home, "stop": current.stop, "clock": shift.clock_text(), "pad": last_input_pad,
		"health": "♥ %d/%d" % [ceili(car.hearts), ceili(car.hearts_max)], "balance": profile.data.wallet, "flat": 10 if story_order else 0}
	if story_order:
		invoice.entrance = 1
		invoice.floor = 3
	audio.cue("order")
	papers.show_invoice(invoice)


func _pay_for_order() -> void:
	if shift.settled:
		return
	var tips_before := shift.tips
	var cold: float = .6 * (1 - car.hearts / car.hearts_max)
	if car.damage.stage.size() > 8:
		if car.damage.stage[2] >= 3:
			cold += .5
		elif car.damage.stage[2] == 2:
			cold += .2
		if car.damage.stage[8] >= 3:
			cold += .25
	var late := shift.deadline <= 0
	for customer in customers:
		if customer.has_method("set_delivery_result"):
			customer.set_delivery_result(late, not delivery.tips_allowed, cold >= .25, cold >= .6)
	manifest.all_on_time = manifest.all_on_time and not late
	if manifest.kind == "urgent" and late:
		shift.refuse_urgent()
	else:
		shift.settle((story_order or delivery.tips_allowed) and cold < .25, false, story_order)
		if manifest.kind == "multi" and manifest.remaining.is_empty() and manifest.all_on_time:
			var extra := roundi(manifest.total_fee * .1)
			shift.pay += extra
			shift.money += extra
			shift.latest_payment += extra
			profile.data.wallet = int(profile.data.wallet) + extra
	if shift.deadline <= 0 and not story_order and manifest.kind != "urgent" and not current.get("tutorial",false):
		late_charges.append({"due": shift.elapsed + 6.0, "amount": maxi(150, roundi(shift.fee * .12 / 10) * 10)})
	if not (manifest.kind == "urgent" and late):
		events.delivered()
		achievements.deliver({"n":shift.people, "on_time":not late, "left": shift.deadline / maxf(1.0, shift.issued_deadline), "free": bool(current.get("tutorial", false)),
			"last":manifest.remaining.is_empty(), "stops":manifest.stops, "bundle":manifest.kind == "multi", "all_on_time": manifest.all_on_time,
			"urgent":manifest.kind == "urgent", "hour": shift.hour(), "semerka":true})
	last_tip = shift.tips - tips_before
	if story_order:
		var chapter := {}
		for key in ["pay","money","tips","penalties","delivered","missed","hits","elapsed"]:
			chapter[key] = shift.get(key)
		profile.data.final_summary = chapter
	_checkpoint()
	hud.show_payment(shift.latest_payment, int(profile.data.wallet))


func _show_payment() -> void:
	audio.cue("coin",car.position)
	papers.dismiss()
	clock_hud.show_pay(shift.latest_payment - last_tip, last_tip, shift.deadline <= 0, int(profile.data.wallet))


func _enter_apartment() -> void:
	audio.cue("door-open")
	var amount := roundi(shift.fee * .45) if shift.deadline <= 0 else shift.fee
	visitor.start(amount, adult, shift.deadline <= 0)
	_audio_context()


func _stairs_tick(delta: float) -> void:
	shift.tick(delta)
	shift.deadline -= delta
	visitor.set_deadline(shift.deadline)
	visitor.late_order = shift.deadline <= 0
	visitor.payment = roundi(shift.fee * .45) if visitor.late_order else shift.fee


func _story_completed() -> void:
	_pay_for_order()
	arrival.walk_out()


func _set_bundle_leg(order: Dictionary) -> void:
	var here := Vector2(car.position.x,car.position.z)
	var leg: Array = region_routes.route_between(here,_v2(order.stop))
	order.from_home = leg
	order.route = leg
	shift.next_stop(order)
	_activate_order(order)
	profile.remember(order.name)
	clock_hud.panel.hide()
	clock_hud.notice("Следующий адрес   %s" % order.name)
	_checkpoint()


func _begin_return(failed: bool) -> void:
	if back_to_depot:
		return
	if not failed and not manifest.remaining.is_empty():
		var next := manifest.take_next(0)
		_set_bundle_leg(next)
		return
	back_to_depot = true
	delivery.done = false
	papers.dismiss()
	clock_hud.panel.hide()
	if failed and not shift.settled:
		shift.settle(false, true, false)
		hud.show_payment(0, int(profile.data.wallet))
	shift.deadline = float(current.back_meters) / 19.0 * 1.8 + 8.0
	hud.return_to_depot(current.back_home, map_data.spawn, failed)
	waypoint = {}
	_set_waypoint({}, [])
	marker.position = depot
	marker.show()
	marker_label.text = "Закрыть смену у пиццерии" if ending_after_return else "Вернитесь в пиццерию"
	_checkpoint()


func _checkpoint() -> void:
	profile.data.engine = car.engine.snapshot()
	profile.save()


func _finish_shift(full: bool, kind := "quit") -> void:
	if not playing:
		return
	playing = false
	events.finish()
	staff.clear()
	car.active_shift = false
	profile.data.erase("final_summary")
	profile.data.engine = car.engine.snapshot()
	dispatch.finish()
	if quick_runs.active():
		marker.hide()
		clock_hud.hide()
		papers.dismiss()
		car.controls_locked = true
		quick_runs.finish(shift, "time" if full else kind)
		profile = career
		return
	achievements.finish_shift({"full":full, "delivered":shift.delivered, "hits":shift.hits})
	var ranking := crew.finish(profile.data,full,shift.delivered,shift.money)
	var win := int(ranking.get("win",0))
	shift.money += win
	profile.data.wallet = int(profile.data.wallet) + win
	var receipt := shift.finish(full)
	receipt.win = win
	receipt.rank = int(ranking.get("rank",1))
	receipt.rating = "%d место" % int(ranking.get("career_rank",1))
	receipt.rows = ranking.get("rows",[])
	crew.clear()
	_show_receipt(receipt)


func _show_receipt(receipt: Dictionary) -> void:
	car.controls_locked = true
	marker.hide()
	clock_hud.hide()
	papers.show_receipt(receipt)
	_audio_context()


func _free_drive() -> void:
	playing = false
	staff.clear()
	crew.clear()
	free_roam = true
	events.begin_shift(0,0,true)
	car.apply_equipment(garage.loadout(profile))
	car.begin_shift(0,"normal",profile.data.get("engine",{}))
	profile.save()
	papers.dismiss()
	_remove_order()
	back_to_depot = false
	destination = map_data.deliveries.size()
	clock_hud.hide()
	marker.hide()
	car.controls_locked = false
	hud.free_drive(shift.delivered, shift.money)
	_set_waypoint({}, [])


func _vehicle_contact(contact: KinematicCollision3D, approach: float, motion: Vector3) -> float:
	var collider := contact.get_collider() as Node3D
	audio.impact("metal" if collider is NPC_CAR else "wall",approach,contact.get_position())
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
		if result == WALKER.Hit.DOWN and traffic.has_method("report_incident"):
			traffic.report_incident(Vector2(person.position.x, person.position.z))
		if result >= WALKER.Hit.FALL:
			car.person_bump()
			if adult and result == WALKER.Hit.DOWN:
				_blood_hit(person,direction,sample.speed)


func _blood_hit(person: Node3D, direction: Vector3, speed: float) -> void:
	var source: Node3D = person.bleed_from()
	var at := source.global_position
	blood.burst(at,direction.normalized(),speed,source)
	car.damage.stain(at,speed)


func _process(delta: float) -> void:
	if menu.active() or papers.blocking():
		return
	var pose := car.get_global_transform_interpolated()
	var at := Vector2(pose.origin.x,pose.origin.z)
	var forward := Vector2(-pose.basis.z.x,-pose.basis.z.z)
	_update_gps(at, delta)
	var meters := 0.0
	if marker.visible:
		var eye: Vector3 = courier.position if courier.active else pose.origin
		_update_marker()
		meters = Vector2(eye.x,eye.z).distance_to(Vector2(marker.position.x,marker.position.z))
		marker_label.visible = meters < 115.0
	hud.update_drive(at,forward,absf(car.speed)*3.6,meters,_delivery_hint(),last_input_pad,courier.active and not dispatch.active())


func _set_waypoint(place: Dictionary, path: Array) -> void:
	if playing and not back_to_depot and not shift.settled and not place.is_empty() and not manifest.remaining.is_empty():
		for i in manifest.remaining.size():
			if manifest.remaining[i].name == place.get("name",""):
				var next: Dictionary = manifest.remaining[i]
				manifest.remaining[i] = current
				_set_bundle_leg(next)
				return
	waypoint = place
	last_gps_at = Vector2(car.position.x, car.position.z)
	if not place.is_empty():
		gps_path = path
		gps_stop = place.stop
	else:
		gps_stop = []
		if back_to_depot:
			gps_stop = map_data.spawn
		elif playing and not current.is_empty():
			gps_stop = map_data.deliveries[destination].stop
		gps_path = [] if gps_stop.is_empty() else region_routes.route_between(last_gps_at, _v2(gps_stop))
	hud.set_navigation(gps_path, gps_stop if not gps_path.is_empty() else [])
	strip.set_route(gps_path,back_to_depot,playing and bool(profile.data.get("road_path",true)))


func _update_gps(at: Vector2, delta: float) -> void:
	if gps_stop.is_empty():
		return
	gps_timer += delta
	if gps_timer < 1.0:
		return
	gps_timer = 0.0
	if not waypoint.is_empty() and at.distance_to(_v2(gps_stop)) < 7.0:
		_set_waypoint({}, [])
		return
	if at.distance_squared_to(last_gps_at) < 24.0 * 24.0:
		return
	last_gps_at = at
	for i in range(1, gps_path.size()):
		var near := Geometry2D.get_closest_point_to_segment(at, _v2(gps_path[i-1]), _v2(gps_path[i]))
		if at.distance_squared_to(near) < 20.0 * 20.0:
			return
	var path := region_routes.route_between(at, _v2(gps_stop)) if waypoint.is_empty() else region_routes.route_to(at, waypoint)
	if not path.is_empty():
		gps_path = path
		hud.set_navigation(gps_path, gps_stop)
		strip.set_route(gps_path,back_to_depot,playing and bool(profile.data.get("road_path",true)))


func _delivery_hint() -> String:
	if dispatch.active():
		return "Погрузка в багажник"
	if back_to_depot or not playing or current.is_empty():
		return ""
	if story_order:
		return "Калинина, 96   •   подъезд 1, этаж 3"
	if delivery.stage == HANDOFF.Stage.HANDOFF:
		return "Клиент принимает заказ"
	if delivery.stage == HANDOFF.Stage.CASH:
		return "Клиент рассчитывается"
	return ""


func _reset_car() -> void:
	car.park(_v2(map_data.spawn),map_data.angle)
	tire_tracks.break_tracks()
	chase.reset_view()


func _update_marker() -> void:
	if not current.is_empty() and not back_to_depot:
		marker_label.text = current.name


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
	var bounds: Array = map_data.bounds
	var clip := Vector4(bounds[0], bounds[1], bounds[2], bounds[3])
	for material in [city_material, prop_material, flat_material, ground_material, window_material]:
		material.set_shader_parameter(&"core_bounds", clip)
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
				replacement.set_shader_parameter(&"core_bounds", clip)
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
	frame_paint.albedo_color = Color("#74654e")
	door_paint.albedo_color = Color("#485647")
	door_paint.roughness = 0.74
	steel_paint.albedo_color = Color("#b1a99b")
	steel_paint.metallic = .36


func _make_entrance(order: Dictionary) -> Node3D:
	var location := _v2(order.entrance.at)
	var facing := _v2(order.entrance.front)
	var edge := location + facing * .4
	var height: float = terrain.at(edge.x, edge.y)
	var door := ENTRANCE.new()
	add_child(door)
	door.setup(Vector3(location.x+facing.x*.07,height+1.1,location.y+facing.y*.07),
		Vector3(facing.x,0,facing.y),frame_paint,door_paint,steel_paint)
	return door


func _make_people() -> void:
	actor_paint.shader = ACTOR_COLOR
	street_lights.bind(actor_paint)
	add_child(courier)
	courier.setup(COURIER_SCENE,actor_paint,terrain,chase)
	for i in map_data.walkers.size():
		var spec: Array = map_data.walkers[i]
		_person(i,_v2(spec[0]),_v2(spec[1]),spec[2],actor_paint)


func _make_customer(order: Dictionary, index := 0) -> Node3D:
	var wait := _v2(order.customer)
	var person: Dictionary = order.recipients[index]
	var customer := _person(int(person.model),wait,wait,0.0,recipient_book.clothing(person,actor_paint))
	var street := _v2(order.stop) - wait
	customer.rotation.y = atan2(street.x,street.y)
	customer.set_active(true)
	return customer


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
