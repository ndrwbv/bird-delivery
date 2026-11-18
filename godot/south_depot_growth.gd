extends Node3D

const GROWTH := preload("res://restaurant_growth.gd")
const PART := preload("res://south_worksite_mesh.gd")
const POSE := preload("res://delivery_actor_pose.gd")
const DEBRIS := preload("res://street_debris.gd")
const DIR := "res://assets/depot-growth/"
const GUESTS := [0,1,3,5,6]
const QUEUE := [0,0,0,2,4]
const TABLES := [0,0,2,2,2]
const BUILD := 300.0
const DROP := 420.0
const BULBS := [Color("#ff4b3e"),Color("#ffd23f"),Color("#5bd66a"),Color("#4aa8ff")]

var host: Node3D
var furniture: Node3D
var atmosphere: Node
var info: Dictionary
var painted := StandardMaterial3D.new()
var neon := ShaderMaterial.new()
var skin := StandardMaterial3D.new()
var decorations := Node3D.new()
var poster := MeshInstance3D.new()
var poster_paint := StandardMaterial3D.new()
var baked_poster: Node3D
var bulbs: Array[StandardMaterial3D] = []
var balloons: Array[MeshInstance3D] = []
var tables: Array[StaticBody3D] = []
var table_broken := [false,false]
var known_actors := {}
var actors: Array[Dictionary] = []
var station := {}
var mesh_file: FileAccess
var model_cache := {}
var stage := -1
var elapsed := 0.0
var flicker := 0.0
var brightness := 1.0
var language := ""
var profile_key := ""
var pending_meshes: Array[String] = []
var wanted_people: Array[int] = []
var serving := false
var scraps: Array[Node3D] = []
var animation_elapsed := 0.0

func setup(director: Node3D, props: Node3D) -> void:
	host = director
	furniture = props
	atmosphere = host.get_parent().get_node_or_null("Atmosphere")
	info = JSON.parse_string(FileAccess.get_file_as_string(DIR+"scene.json"))
	position = Vector3(info.origin[0],info.origin[1],info.origin[2])
	rotation.y = info.yaw
	painted.vertex_color_use_as_albedo = true
	painted.roughness = .9
	skin.vertex_color_use_as_albedo = true
	skin.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	neon.shader = preload("res://south_depot_letters.gdshader")
	for _shade in BULBS:
		var paint := skin.duplicate() as StandardMaterial3D
		bulbs.append(paint)
	add_child(decorations)
	var face := QuadMesh.new()
	face.size = Vector2(1.2,.75)
	poster.mesh = face
	poster.position = Vector3(-1.9,1.7,10.36)
	poster.material_override = poster_paint
	poster_paint.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	poster_paint.cull_mode = BaseMaterial3D.CULL_DISABLED
	decorations.add_child(poster)
	baked_poster = host.get_parent().get_node_or_null("City/"+str(info.posterBlock))
	furniture.prop_lost.connect(_table_lost)
	host.raid.tables_smashed.connect(_raid)
	hide()

func _texture() -> void:
	var lang := "en" if TranslationServer.get_locale().begins_with("en") else "ru"
	if lang==language:
		return
	language = lang
	var path := DIR+"poster-"+lang+".png"
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		image.generate_mipmaps()
		poster_paint.albedo_texture = ImageTexture.create_from_image(image)
	else:
		poster_paint.albedo_texture = load(path)

func _mesh(key: String) -> ArrayMesh:
	if not model_cache.has(key):
		if not mesh_file:
			mesh_file = FileAccess.open(DIR+"decor.bin",FileAccess.READ)
		mesh_file.seek(int(info.offsets[key]))
		var material: Material = painted
		if key=="letters":
			material = neon
		elif key.begins_with("garland"):
			material = bulbs[int(key.right(1))]
		model_cache[key] = PART.next(mesh_file,material)
	return model_cache[key]

func _point(raw: Array) -> Vector3:
	var point := to_global(Vector3(raw[0],0,raw[1]))
	point.y = host.ground.at(point.x,point.z)+.13
	return point

func _local_floor(raw: Array) -> Vector3:
	return to_local(_point(raw))

func _make(key: String) -> void:
	if station.has(key):
		return
	var mesh := _mesh(key)
	if key.begins_with("table"):
		var i := int(key.right(1))
		var item := StaticBody3D.new()
		item.collision_layer = 8
		item.collision_mask = 0
		item.position = _local_floor(info.tables[i])-Vector3.UP*.13
		var shape := CylinderShape3D.new()
		shape.radius = 1.2
		shape.height = 1.3
		var hull := CollisionShape3D.new()
		hull.shape = shape
		hull.position.y = .8
		item.add_child(hull)
		item.set_meta(&"summer_prop",_impact.bind(i))
		item.set_meta(&"daily_prop","table")
		add_child(item)
		var view := PART.instance(item,mesh)
		view.name = "TableMesh"
		tables.resize(2)
		tables[i] = item
		station[key] = item
	elif key=="balloons":
		for p: Array in info.balloons:
			balloons.append(PART.instance(decorations,mesh,_local_floor(p)))
		station[key] = balloons
	else:
		station[key] = PART.instance(decorations,mesh,Vector3.UP*.45 if key=="letters" else Vector3.ZERO)

func _stage(next: int) -> void:
	stage = next
	wanted_people.clear()
	pending_meshes.clear()
	var ranks := {"guest":0,"queue":0,"band":0}
	for i in info.people.size():
		var kind: String = info.people[i].kind
		var count: int = ranks[kind]
		ranks[kind] = count+1
		var limit: int = GUESTS[stage] if kind=="guest" else (QUEUE[stage] if kind=="queue" else (3 if stage==4 else 0))
		if count<limit:
			wanted_people.append(i)
	for j in range(actors.size()-1,-1,-1):
		if actors[j].id not in wanted_people or actors[j].displaced:
			_forget(actors[j])
			actors.remove_at(j)
	for key: String in info.models:
		if key in ["trumpet","accordion","drum"]:
			continue
		var needed: bool = key=="letters" or (key=="balloons" and stage==4) or (key.begins_with("garland") and stage>=3) or (key.begins_with("table") and TABLES[stage]>0)
		if station.has(key):
			if key=="balloons":
				for b in balloons:
					b.visible = needed
			elif key.begins_with("table"):
				var id := int(key.right(1))
				var table := tables[id]
				table.visible = needed and not table_broken[id]
				table.collision_layer = 8 if table.visible else 0
			else:
				station[key].visible = needed
		elif needed:
			pending_meshes.append(key)
	poster.visible = stage<=1
	if stage>0:
		brightness = 1.0

func _spawn_person(id: int) -> void:
	var row: Dictionary = info.people[id]
	var point := _point(row.at)
	var kind: String = row.kind
	var who: Node3D = host.cast.actor((id*3+1)%5,Vector2(point.x,point.z),Color("#ff7a1a") if kind=="band" else Color.TRANSPARENT)
	who.rotation.y = rotation.y+float(row.yaw)+PI
	who.position = point
	who.player.play(&"idle")
	who.player.advance(0)
	who.player.pause()
	who.hit_points = 1
	who.shove_speed = 20.0/3.6
	var pose := POSE.new()
	pose.setup(who.model)
	var s := {"id":id,"actor":who,"pose":pose,"kind":kind,"yaw":who.rotation.y,"phase":randf()*6.0,"rest":randf_range(.3,1.2),
		"instrument":null,"note":null,"note_age":0.0,"sitting":false,"table":int(row.get("table",-1)),"displaced":false}
	if kind=="guest" and not furniture.down.has(s.table):
		s.sitting = true
		who.model.position.y = -.42
		pose.sit(1.0)
	elif kind=="band":
		var gear := PART.instance(who,_mesh(row.instrument))
		gear.rotation.y = PI
		gear.scale = Vector3.ONE*.95
		s.instrument = gear
		s.note = host._label(who,.008)
		s.note.text = "♫"
		s.note.modulate = Color("#ffcf61")
		s.note.position.y = 2.3
	actors.append(s)
	known_actors[id] = true

func _forget(s: Dictionary) -> void:
	known_actors.erase(s.id)
	if is_instance_valid(s.actor):
		s.actor.collider.collision_layer = 0
		s.actor.hide()
		s.actor.queue_free()

func _stand(s: Dictionary, away: Vector2) -> void:
	if s.displaced:
		return
	s.displaced = true
	s.sitting = false
	var who: Node3D = s.actor
	if who.knockdown>0 or who.defeated:
		return
	who.model.position.y = 0
	who.player.play(&"idle",.12)
	if away.length_squared()>.01:
		var at := Vector2(who.position.x,who.position.z)+away
		who.position = Vector3(at.x,host.ground.at(at.x,at.y)+.13,at.y)
		who.from = at
		who.to = at

func _table_lost(id: int) -> void:
	for s in actors:
		if s.sitting and s.table==id:
			var outside := Vector2(s.actor.position.x-position.x,s.actor.position.z-position.z).normalized()
			_stand(s,outside*.85)

func _impact(_contact: KinematicCollision3D, approach: float, motion: Vector3, i: int) -> float:
	if table_broken[i]:
		return 1.0
	if approach<=.4:
		return -1.0
	_break(i,motion)
	return .91

func _break(i: int, push: Vector3) -> void:
	if table_broken[i]:
		return
	table_broken[i] = true
	if i>=tables.size() or not is_instance_valid(tables[i]):
		return
	var entry := tables[i]
	entry.collision_layer = 0
	entry.hide()
	var piece := DEBRIS.new()
	piece.name = "UmbrellaDebris"
	add_child(piece)
	var mesh := _mesh("table"+str(i))
	furniture.impact_ground.cover(entry.global_position,14.0)
	piece.setup(mesh,painted,entry.position,push,"table")
	scraps.append(piece)
	for j in range(scraps.size()-1,-1,-1):
		if not is_instance_valid(scraps[j]):
			scraps.remove_at(j)

func _raid() -> void:
	if stage>=2 or (stage<0 and GROWTH.stage(host.profile.data)>=2):
		for i in 2:
			if i<tables.size() and is_instance_valid(tables[i]):
				var at := tables[i].global_position-global_position
				_break(i,Vector3(at.x,0,at.z).normalized()*8)
			else:
				table_broken[i] = true

func _arm(pose: RefCounted, side: int, angle: float, sideways := 0.0) -> void:
	var rest: Quaternion = pose.rests[side]
	var axis: Vector3 = pose.axes[side]
	var cross_axis: Vector3 = pose.fore_axes[side]
	pose.skeleton.set_bone_pose_rotation(pose.joints[side],Quaternion(cross_axis,sideways)*Quaternion(axis,angle)*rest)

func _animate_people(dt: float) -> void:
	for s in actors:
		var who: Node3D = s.actor
		if who.defeated or who.knockdown>0 or who.stunned>0:
			_stand(s,Vector2.ZERO)
			continue
		if s.displaced:
			continue
		s.phase += dt
		if s.kind=="guest" and s.sitting:
			_arm(s.pose,32,-.7-maxf(0,sin(s.phase*1.3))*1.1)
		elif s.kind=="queue":
			who.rotation.y = s.yaw+sin(s.phase*.7)*.25
		elif s.kind=="band":
			who.model.rotation.z = sin(s.phase*4.0)*.05
			match str(info.people[s.id].instrument):
				"accordion":
					var sway := sin(s.phase*3.0)*.3
					_arm(s.pose,9,-1.0,-.3-sway)
					_arm(s.pose,32,-1.0,.3+sway)
					s.instrument.scale.x = .95*(1.0+sin(s.phase*3.0)*.25)
				"trumpet":
					_arm(s.pose,9,-1.5)
					_arm(s.pose,32,-1.4+sin(s.phase*9.0)*.08)
				"drum":
					_arm(s.pose,9,-1.1+maxf(0,sin(s.phase*10.0))*.5)
					_arm(s.pose,32,-1.1+maxf(0,sin(s.phase*10.0+PI))*.5)
			s.rest -= dt
			s.note_age = maxf(0.0,s.note_age-dt)
			if s.rest<=0:
				s.rest = randf_range(.9,1.6)
				s.note_age = .65
			s.note.visible = s.note_age>0
			s.note.position.y = 2.3+(.65-s.note_age)*.65

func step(dt: float, hour: float, profile_data := {}) -> void:
	var car: CharacterBody3D = host.car
	var profile: Dictionary = host.profile.data if profile_data.is_empty() else profile_data
	var active_key := str(profile.get("save_id",""))
	if profile_key!=active_key:
		clear()
		table_broken = [false,false]
		profile_key = active_key
	var distance := Vector2(car.position.x-position.x,car.position.z-position.z).length_squared()
	if distance>DROP*DROP:
		if serving:
			_unload()
		return
	if not serving:
		if distance>=BUILD*BUILD:
			return
		serving = true
		if is_instance_valid(baked_poster):
			baked_poster.hide()
		decorations.show()
		show()
	var level := GROWTH.stage(profile)
	if stage!=level:
		_stage(level)
	if not pending_meshes.is_empty():
		var key: String = pending_meshes.pop_front()
		_make(key)
		if key.begins_with("table") and table_broken[int(key.right(1))]:
			var item := tables[int(key.right(1))]
			item.hide()
			item.collision_layer = 0
	elif distance<BUILD*BUILD:
		for id in wanted_people:
			if not known_actors.has(id):
				_spawn_person(id)
				break
	if poster.visible:
		_texture()
	elapsed += dt
	var night: float = atmosphere.night if atmosphere else clampf((absf(hour-12.0)-6.0)/4.0,0,1)
	if stage==0:
		flicker -= dt
		if flicker<=0:
			var off := randf()<.45
			flicker = randf_range(.05,.25) if off else randf_range(.2,1.6)
			brightness = .22 if off else 1.0
	neon.set_shader_parameter(&"level",brightness)
	neon.set_shader_parameter(&"glow",.12+.6*night+(.22 if stage>=2 else 0.0)+(.12*sin(elapsed*2.4) if stage==4 else 0.0))
	if distance<BUILD*BUILD:
		animation_elapsed += dt
		if distance<75.0*75.0 or animation_elapsed>=.12:
			_animate_people(animation_elapsed)
			animation_elapsed = 0
		for b in balloons:
			if b.visible:
				b.rotation = Vector3(0,sin(elapsed*.8)*.2,sin(elapsed*1.3)*.04)
		if stage>=3:
			var bright := posmod(floori(elapsed*2.5),4)
			for i in bulbs.size():
				var value := 1.0 if i==bright else .55+.25*night
				bulbs[i].albedo_color = Color(value,value,value)

func _unload() -> void:
	for s in actors:
		_forget(s)
	actors.clear()
	wanted_people.clear()
	pending_meshes.clear()
	decorations.hide()
	for table in tables:
		if is_instance_valid(table):
			table.collision_layer = 0
	hide()
	stage = -1
	serving = false
	animation_elapsed = 0

func clear() -> void:
	_unload()
	for piece in scraps:
		if is_instance_valid(piece):
			piece.queue_free()
	scraps.clear()
	if is_instance_valid(baked_poster):
		baked_poster.show()
