extends Node3D

const PRINT := preload("res://protest_notice_atlas.gd")
const FILE := "res://assets/south-protest-sites.bin"
const STAGE_GRAFFITI := [0.0,0.0,0.35,0.5,0.6,0.35]
const CELL := 200.0
const ROW := 12
const VARIANTS := 6
var host: Node3D
var stage := 0
var sheet: SubViewport
var paint: StandardMaterial3D
var models: Array[ArrayMesh] = []
var sites := PackedFloat32Array()
var buckets := {}
var active := {}
var gone := {}
var fallen: Array[Dictionary] = []
var tile := Vector2i(10000,10000)
var pending: Array[Vector2i] = []


func setup(events: Node3D) -> void:
	host = events


func begin() -> void:
	clear()
	stage = host._protest_stage()
	var topic: Dictionary = host.protest_topic
	if topic.is_empty():
		topic = host.dialogue.topics[0]
	var variant := int(host.dialogue.topics.find(topic))
	var file := FileAccess.open(FILE,FileAccess.READ)
	if file==null or file.get_buffer(4).get_string_from_ascii()!="PRT1":
		return
	var n := file.get_32()
	var counts := file.get_buffer(4*n).to_int32_array()
	var index := posmod(variant+maxi(0,int(host.last_cycle)),n)
	var skip := 8+4*n
	for i in index:
		skip += counts[i]*ROW*4
	file.seek(skip)
	sites = file.get_buffer(counts[index]*ROW*4).to_float32_array()
	for i in counts[index]:
		var base := i*ROW
		var cell := Vector2i((Vector2(sites[base],sites[base+1])/CELL).floor())
		if not buckets.has(cell):
			buckets[cell] = []
		buckets[cell].append(base)
	sheet = SubViewport.new()
	sheet.size = Vector2i(1024,1024)
	sheet.transparent_bg = true
	sheet.disable_3d = true
	sheet.gui_disable_input = true
	sheet.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(sheet)
	var pages := PRINT.new()
	pages.stage = stage
	pages.topic = topic
	pages.copy = host.dialogue
	pages.adults = host.garage_zone.adults
	sheet.add_child(pages)
	paint = StandardMaterial3D.new()
	paint.albedo_texture = sheet.get_texture()
	paint.cull_mode = BaseMaterial3D.CULL_DISABLED
	paint.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	paint.alpha_scissor_threshold = 0.32
	paint.roughness = 1
	for i in VARIANTS:
		models.append(_model(i))


func clear() -> void:
	for obj: Node3D in active.values():
		obj.queue_free()
	for slot in fallen:
		slot.mesh.queue_free()
	if is_instance_valid(sheet):
		sheet.queue_free()
	sheet = null
	active.clear()
	buckets.clear()
	sites.clear()
	models.clear()
	pending.clear()
	fallen.clear()
	gone.clear()
	paint = null
	tile = Vector2i(10000,10000)


func _uv(id: int, leaflet: bool) -> Rect2:
	var cell := 16+floori(id*.5) if leaflet else id
	return Rect2(Vector2(float(cell%4)*.25+(float(id%2)*.125 if leaflet else 0.0),floori(cell*.25)*.125),
		Vector2(.125 if leaflet else .25,.125)).grow(-.001)


func _quad(s: SurfaceTool, center: Vector3, n: Vector2, size_value: Vector2, tex: Rect2) -> void:
	var tangent := Vector3(n.y,0,-n.x)*size_value.x*0.5
	var up := Vector3.UP*size_value.y*.5
	var normal := Vector3(n.x,0,n.y)
	var points := [center-tangent+up,center+tangent+up,center+tangent-up,center-tangent-up]
	var uv := [tex.position,Vector2(tex.end.x,tex.position.y),tex.end,Vector2(tex.position.x,tex.end.y)]
	for i: int in [0,1,2,0,2,3]:
		s.set_normal(normal)
		s.set_uv(uv[i])
		s.add_vertex(points[i])


func _model(pattern: int) -> ArrayMesh:
	var data := SurfaceTool.new()
	data.begin(Mesh.PRIMITIVE_TRIANGLES)
	data.set_material(paint)
	var height := 4.6 if stage==5 else 2.6
	for i in 4:
		var n := Vector2.from_angle(i*PI*.5)
		_quad(data,Vector3(n.x*.07,height*.5,n.y*.07),n,Vector2(.14,height),_uv(31,true))
	if stage==5:
		_quad(data,Vector3(.84,4.1,0),Vector2.DOWN,Vector2(1.6,.8),_uv(7,false))
	else:
		for j in 3+pattern%4:
			var n := Vector2.from_angle((j+pattern)*PI*.5)
			var civil := stage<1 or (j+pattern)%5>=3
			var id := 14+(j*5+pattern*3)%16 if civil else (pattern*7+j*3)%14
			_quad(data,Vector3(n.x*.077,1.08+fmod(j*.37+pattern*.17,1),n.y*.077),n,Vector2(.30,.30),_uv(id,true))
	return data.commit()


func _tile(key: Vector2i) -> void:
	var indices: Array = buckets.get(key,[])
	if indices.is_empty():
		return
	var root := Node3D.new()
	add_child(root)
	var grouped := {}
	var walls := SurfaceTool.new()
	walls.begin(Mesh.PRIMITIVE_TRIANGLES)
	walls.set_material(paint)
	var drawn := false
	var collisions := []
	for idx: int in indices:
		if sites[idx+3]>0 and not gone.has(idx):
			var p := Vector2(sites[idx],sites[idx+1])
			var type := mini(VARIANTS-1,floori(sites[idx+8]*VARIANTS))
			if not grouped.has(type):
				grouped[type] = []
			var t := Transform3D(Basis(Vector3.UP,sites[idx+2]),Vector3(p.x,host.ground.at(p.x,p.y),p.y))
			grouped[type].append({"id":idx,"p":p,"t":t})
		if sites[idx+7]<STAGE_GRAFFITI[stage]:
			var p := Vector2(sites[idx+4],sites[idx+5])
			var facing := Vector2(sin(sites[idx+6]),cos(sites[idx+6]))
			var y := float(host.ground.at(p.x,p.y))+1.15
			p += facing*.025
			_quad(walls,Vector3(p.x,y,p.y),facing,Vector2(2.8,1.4),_uv(8+mini(7,floori(sites[idx+10]*8)),false))
			drawn = true
	for pattern: int in grouped:
		var batch := MultiMesh.new()
		batch.transform_format = MultiMesh.TRANSFORM_3D
		batch.mesh = models[pattern]
		batch.instance_count = grouped[pattern].size()
		for j in batch.instance_count:
			var item: Dictionary = grouped[pattern][j]
			batch.set_instance_transform(j,item.t)
			collisions.append({"id":item.id,"p":item.p,"t":item.t,"mesh":models[pattern],"batch":batch,"index":j})
		var item_mesh := MultiMeshInstance3D.new()
		item_mesh.multimesh = batch
		item_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(item_mesh)
	if drawn:
		var wall := MeshInstance3D.new()
		wall.mesh = walls.commit()
		wall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(wall)
	root.set_meta("posts",collisions)
	active[key] = root


func _fall(post: Dictionary, dir: Vector2) -> void:
	var t: Transform3D = post.t
	post.batch.set_instance_transform(post.index,Transform3D(Basis().scaled(Vector3.ONE*0.001),t.origin-Vector3.UP*5))
	gone[post.id] = true
	var model := MeshInstance3D.new()
	model.mesh = post.mesh
	model.transform = t
	model.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(model)
	fallen.append({"mesh":model,"age":0.0,"origin":t,"axis":Vector3(dir.y,0,-dir.x)})


func _contact(at: Vector2) -> void:
	var car: CharacterBody3D = host.car
	var forward := Vector2(-car.basis.z.x,-car.basis.z.z)
	var v := Vector2(car.velocity.x,car.velocity.z)
	var near_key := Vector2i((at/CELL).floor())
	var adjacent := [near_key]
	var offset := at-Vector2(near_key)*CELL
	if offset.x<4 or offset.y<4 or offset.x>CELL-4 or offset.y>CELL-4:
		adjacent.clear()
		for x in range(-1,2):
			for y in range(-1,2):
				adjacent.append(near_key+Vector2i(x,y))
	for key: Vector2i in adjacent:
		if not active.has(key):
			continue
		for item: Dictionary in active[key].get_meta("posts"):
			var p: Vector2 = item.p
			if gone.has(item.id) or at.distance_squared_to(p)>21 or absf(car.position.y-float(item.t.origin.y))>2.2:
				continue
			for end: float in [-1.0,1.0]:
				var normal := at+forward*(2.49*.55*end)-p
				var d := normal.length()
				if d>=1.17:
					continue
				if v.length()>2.5:
					_fall(item,v.normalized())
					car.velocity.x *= 0.92
					car.velocity.z *= 0.92
					v *= 0.92
				else:
					normal = normal/d if d>0.0001 else -forward*end
					car.position.x += normal.x*(1.17-d)
					car.position.z += normal.y*(1.17-d)
					var toward := minf(0.0,v.dot(normal))
					car.velocity -= Vector3(normal.x,0,normal.y)*toward
				break


func step(dt: float, player_at: Vector2) -> void:
	if sites.is_empty():
		return
	var cell := Vector2i((player_at/CELL).floor())
	if cell!=tile:
		tile = cell
		pending.clear()
		for y in range(-1,2):
			for x in range(-1,2):
				var key := cell+Vector2i(x,y)
				if not active.has(key) and buckets.has(key):
					pending.append(key)
		pending.sort_custom(func(a,b):return (a-tile).length_squared()>(b-tile).length_squared())
		for key: Vector2i in active.keys():
			if absi(key.x-cell.x)>2 or absi(key.y-cell.y)>2:
				active[key].queue_free()
				active.erase(key)
	if not pending.is_empty():
		_tile(pending.pop_back())
	_contact(player_at)
	for i in range(fallen.size()-1,-1,-1):
		var post := fallen[i]
		post.age += dt
		if post.age>27:
			post.mesh.queue_free()
			fallen.remove_at(i)
			continue
		var t: Transform3D = post.origin
		t.basis = Basis(post.axis,minf(1.0,float(post.age)/.45)*PI*.5)*t.basis
		t.origin.y -= clampf((float(post.age)-25.0)*.5,0,1)
		post.mesh.transform = t
