extends StaticBody3D

signal mascot_struck

const PART := preload("res://south_worksite_mesh.gd")
const MASCOTS := preload("res://south_shop_mascots.gd")
var host: Node3D
var sites: Array[Dictionary] = []
var owners := {}
var paint := StandardMaterial3D.new()
var parts := {}
var boards: Array[Dictionary] = []
var artwork := {}
var language := ""
var mascots := MASCOTS.new()
var terrace := preload("res://south_terrace_guests.gd").new()
var debris: Array[Dictionary] = []
var translation := Translation.new()
var data: Dictionary

func setup(director: Node3D) -> void:
	host = director
	mascots.world = self
	collision_layer = 8
	collision_mask = 0
	data = JSON.parse_string(FileAccess.get_file_as_string(PART.DIRECTORY+"sites.json"))
	translation.locale = "en"
	for ru in data.en:
		translation.add_message(ru,data.en[ru])
	TranslationServer.add_translation(translation)
	paint.vertex_color_use_as_albedo = true
	paint.roughness = 0.95
	for info in data.sites:
		var root := Node3D.new()
		add_child(root)
		root.position = floor_position(info.at)
		sites.append({"info":info,"root":root,"file":null,"cursor":-1,"items":[],"hit":0,"paid":false,"guests":[],"actors":[],"crane":null,"clock":0.0,"aim":0.0})

func _exit_tree() -> void:
	TranslationServer.remove_translation(translation)

func floor_position(coords: Array) -> Vector3:
	return Vector3(coords[0],host.ground.at(coords[0],coords[1]),coords[1])

func step(dt: float, observer: Vector2) -> void:
	var locale := "ru" if TranslationServer.get_locale().begins_with("ru") else "en"
	if language!=locale:
		language = locale
		for board in boards:
			board.view.material_override = _art(board.key)
	mascots.advance_debris(dt)
	var started := Time.get_ticks_usec()
	var surfaces := 0
	for site in sites:
		var root: Node3D = site.root
		var distance := observer.distance_squared_to(Vector2(root.position.x,root.position.z))
		root.visible = distance<800.0*800.0
		if root.visible and site.cursor<int(site.info.items.size())+2:
			# Always stream at least one surface. Avoid building several large meshes in a long frame.
			while surfaces<3 and (surfaces==0 or Time.get_ticks_usec()-started<650):
				if not _load_one(site):
					break
				surfaces += 1
		if site.crane!=null and distance<700.0*700.0:
			site.clock -= dt
			if site.clock<=0:
				if absf(site.crane.rotation.y-float(site.aim))<0.01:
					site.clock = randf_range(4,9)
					site.aim = float(site.info.crane.yaw)+randf_range(-1.6,1.6)
				else:
					site.crane.rotation.y = move_toward(site.crane.rotation.y,site.aim,0.13*dt)
		if site.info.name!="work" and site.cursor>=int(site.info.items.size())+2:
			mascots.step(site,observer,distance,dt)
	terrace.step(self,observer)
	for i in range(debris.size()-1,-1,-1):
		if _advance_debris(debris[i],dt):
			debris.remove_at(i)

func _load_one(site: Dictionary) -> bool:
	var info: Dictionary = site.info
	var idx: int = site.cursor
	if idx==-1:
		site.file = FileAccess.open(PART.DIRECTORY+str(info.file),FileAccess.READ)
		if site.file==null:
			push_error("Missing summer site "+str(info.file))
			site.cursor = info.items.size()+2
			return false
		var mesh := PART.next(site.file,paint)
		if mesh!=null:
			PART.instance(site.root,mesh)
		for wall in info.walls:
			var at := floor_position(wall.at)
			var height := 5.5 if info.name!="work" else (1.1 if wall.w>1 and wall.d>1 else 6.4)
			var box := BoxShape3D.new()
			box.size = Vector3(float(wall.w)*2.0,height,float(wall.d)*2.0)
			_add_shape(box,Transform3D(Basis(Vector3.UP,-float(wall.yaw)),at+Vector3.UP*height*0.5))
		for sign_data in info.get("signs",[]):
			var sign_pos := Vector3(sign_data.at[0],site.root.position.y+float(sign_data.y),sign_data.at[1])
			var yaw := atan2(-float(sign_data.normal[1]),float(sign_data.normal[0]))
			_board(site.root,info.name,sign_pos,yaw,Vector2(sign_data.w,sign_data.h))
		site.cursor = 0
	elif idx<info.items.size():
		var item: Dictionary = info.items[idx]
		var mesh := PART.next(site.file,paint)
		if mesh==null:
			site.cursor = info.items.size()+2
			site.file = null
			return false
		var base := floor_position(item.at)
		var view := PART.instance(site.root,mesh,base-site.root.position)
		var shape: Shape3D
		var local_pose := Transform3D.IDENTITY
		var aabb := mesh.get_aabb()
		var height := maxf(0.3,aabb.size.y)
		local_pose.origin = base+Vector3.UP*(aabb.position.y+height*0.5)
		if item.kind in ["cons_cabin","bigfence"]:
			var box := BoxShape3D.new()
			box.size = Vector3(6.0,height,2.4) if item.kind=="cons_cabin" else Vector3(float(item.radius)*2.0,height,0.15)
			local_pose.basis = Basis(Vector3.UP,item.yaw)
			shape = box
		else:
			var cyl := CylinderShape3D.new()
			cyl.radius = item.radius
			cyl.height = height
			shape = cyl
		var id := _add_shape(shape,local_pose)
		var record := {"spec":item,"id":id,"idx":idx,"view":view,"base":base,"pose":local_pose,"down":false,"site":sites.find(site)}
		owners[id] = record
		site.items.append(record)
		if item.kind=="sign" and info.has("sign"):
			_board(view,"pass-%d"%int(info.sign.index),base+Vector3.UP*2.1,float(info.sign.yaw),Vector2(3.12,2.3))
		site.cursor += 1
	elif idx==info.items.size():
		if info.has("crane"):
			var mesh := PART.next(site.file,paint)
			var pos := Vector3(info.crane.at[0],float(info.crane.y)+site.root.position.y,info.crane.at[1])
			if mesh!=null:
				site.crane = PART.instance(site.root,mesh,pos-site.root.position)
				site.crane.rotation.y = info.crane.yaw
				site.aim = info.crane.yaw
				site.clock = randf_range(2,6)
		site.file = null
		site.cursor += 1
	elif idx==info.items.size()+1:
		# Guest templates are shared by all terraces. Limit each new template to its own tick.
		if info.name!="work":
			for key in data.models:
				if not parts.has(key):
					var file := FileAccess.open(PART.DIRECTORY+str(key)+".bin",FileAccess.READ)
					parts[key] = PART.next(file,paint)
					return true
			_make_guests(site)
		site.cursor += 1
	else:
		return false
	return true

func _art(key: String) -> Material:
	var tag := key+"-"+language
	if artwork.has(tag):
		return artwork[tag]
	var path := PART.DIRECTORY+tag+".png"
	var texture: Texture2D
	if FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image!=null:
			image.generate_mipmaps()
			texture = ImageTexture.create_from_image(image)
	elif ResourceLoader.exists(path):
		texture = load(path)
	var material := StandardMaterial3D.new()
	material.albedo_texture = texture
	material.roughness = 0.86
	artwork[tag] = material
	return material

func _board(parent: Node3D, key: String, pos: Vector3, yaw: float, size: Vector2) -> void:
	var quad := QuadMesh.new()
	quad.size = size
	var panel := PART.instance(parent,quad)
	panel.rotation.y = yaw
	panel.global_position = pos+panel.basis.z*0.03
	panel.material_override = _art(key)
	boards.append({"view":panel,"key":key})

func _add_shape(shape: Shape3D, pose: Transform3D) -> int:
	var owner_id := create_shape_owner(self)
	shape_owner_add_shape(owner_id,shape)
	shape_owner_set_transform(owner_id,pose)
	return owner_id

func _make_guests(site: Dictionary) -> void:
	for variant in 6:
		var seats: Array = site.info.seats.filter(func(s): return int(s.variant)==variant)
		if seats.is_empty():
			continue
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.mesh = parts["guest%d"%variant]
		multi.instance_count = seats.size()
		for i in seats.size():
			var seat: Dictionary = seats[i]
			var o: Vector3 = Vector3(seat.at[0],site.root.position.y+float(seat.y),seat.at[1])-site.root.position
			var pose := Transform3D(Basis(Vector3.UP,seat.yaw),o)
			multi.set_instance_transform(i,pose)
			site.guests.append({"table":int(seat.table),"model":multi,"slot":i,"pose":pose,"point":Vector2(seat.at[0],seat.at[1]),"yaw":seat.yaw,"variant":variant,"gone":false,"person":null})
		var guests := MultiMeshInstance3D.new()
		guests.multimesh = multi
		guests.visibility_range_end = 300
		site.root.add_child(guests)

func impact(contact: KinematicCollision3D, approach: float, motion: Vector3) -> float:
	var index := contact.get_collider_shape_index()
	var id := shape_find_owner(index)
	if not owners.has(id):
		return -1.0
	var prop: Dictionary = owners[id]
	return _knock(prop,approach,motion,contact.get_position())

func _knock(prop: Dictionary, approach: float, motion: Vector3, point: Vector3) -> float:
	if prop.down:
		return 1.0
	var kind: String = prop.spec.kind
	if approach<0.4:
		return -1.0
	if kind=="cons_cabin":
		var entry := _moving(prop)
		var push := Vector3(motion.x,0,motion.z).normalized()*approach*1.15/2.5
		entry.velocity += push
		entry.spin += clampf((point-prop.view.global_position).cross(push).y/3.48,-2.0,2.0)
		return 0.54
	shape_owner_set_disabled(prop.id,true)
	prop.down = true
	_debris_slot()
	var d := {"prop":prop,"velocity":motion.normalized()*minf(20.0,approach)*0.16,"age":0.0,"spin":1.5+minf(25,approach)*0.12,"wall":kind=="bigfence","axis":Vector3.UP.cross(motion).normalized()}
	if kind=="pile":
		prop.view.scale.y = 0.38
	else:
		debris.append(d)
	var site: Dictionary = sites[prop.site]
	if site.info.name!="work":
		site.hit += 1
		if site.hit>=3 and not site.paid:
			site.paid = true
			if not host.ride and not host.quick:
				host.respect_earned.emit("rivalShop")
		if kind=="table":
			for guest in site.guests:
				if guest.table==prop.idx:
					terrace.leave(guest)
	return 0.85 if kind=="pile" else (0.91 if kind in ["bigfence","fence","table"] else 0.98)

func _debris_slot() -> void:
	if debris.size()<40:
		return
	for i in debris.size():
		if debris[i].prop.spec.kind!="cons_cabin":
			debris[i].prop.view.hide()
			debris.remove_at(i)
			return

func _moving(prop: Dictionary) -> Dictionary:
	for entry in debris:
		if entry.prop.id==prop.id:
			return entry
	_debris_slot()
	var entry := {"prop":prop,"velocity":Vector3.ZERO,"spin":0.0}
	debris.append(entry)
	return entry

func _advance_debris(d: Dictionary, dt: float) -> bool:
	var prop: Dictionary = d.prop
	var view: MeshInstance3D = prop.view
	if prop.spec.kind=="cons_cabin":
		var v: Vector3 = d.velocity
		var next_pos := view.global_position+v*dt
		next_pos.y = host.ground.at(next_pos.x,next_pos.z)
		view.global_position = next_pos
		view.rotate_y(float(d.spin)*dt)
		var pose: Transform3D = prop.pose
		pose.origin += next_pos-Vector3(prop.base)
		pose.basis = Basis(Vector3.UP,view.rotation.y)*pose.basis
		shape_owner_set_transform(prop.id,pose)
		d.spin *= exp(-4.0*dt)
		d.velocity = v.move_toward(Vector3.ZERO,9*dt)
		return v.length_squared()<0.0025 and absf(d.spin)<0.03
	d.age += dt
	var lie := 40.0 if d.wall else 3.0
	if d.age<=0.55:
		var axis: Vector3 = d.axis
		d.spin += 9.0*dt
		var angle := minf(float(d.spin)*dt,maxf(0,PI*0.5-0.05-view.basis.get_rotation_quaternion().get_angle()))
		if axis.length_squared()>0.01:
			view.global_rotate(axis,angle)
		view.position += d.velocity*dt
		d.velocity = d.velocity.move_toward(Vector3.ZERO,4.0*dt)
	elif d.age>lie:
		view.position.y -= 1.2*dt
	if d.age>lie+2:
		view.hide()
		return true
	return false

func reset() -> void:
	terrace.clear()
	debris.clear()
	for site in sites:
		site.hit = 0
		site.paid = false
		for prop in site.items:
			if prop.down or prop.spec.kind=="cons_cabin":
				prop.down = false
				prop.view.global_position = prop.base
				prop.view.rotation = Vector3.ZERO
				prop.view.scale = Vector3.ONE
				prop.view.show()
				shape_owner_set_transform(prop.id,prop.pose)
				shape_owner_set_disabled(prop.id,false)
		for guest in site.guests:
			guest.gone = false
			guest.model.set_instance_transform(guest.slot,guest.pose)
		mascots.clear(site)
