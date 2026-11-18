extends Node3D

# The original centre already has its seats baked into street_furniture.
# Outside it, stream only the five original bench forms on nearby blocks.
const CELL:=80
var yard:Node
var sectors:Dictionary={}
var active:Dictionary={}
var pending:Array[Dictionary]=[]
var styles:Array
var meshes:Dictionary={}
var broken:Dictionary={}
var shape:=BoxShape3D.new()
var last:=Vector2i(99999,99999)

func setup(courtyard:Node,benches:Dictionary,models:Array) -> void:
	yard=courtyard
	styles=models
	shape.size=Vector3(2.45,1.02,.61)
	for id:int in benches:
		if id>=0:continue
		var spot:Dictionary=benches[id]
		var cell:=Vector2i((spot.at/CELL).floor())
		if not sectors.has(cell):sectors[cell]=[]
		sectors[cell].append(spot)

func step(pos:Vector2) -> void:
	var cell:=Vector2i((pos/CELL).floor())
	if cell!=last:
		last=cell
		_refresh(cell,pos)
	for i in mini(pending.size(),2):_add(pending.pop_back())

func _refresh(cell:Vector2i,pos:Vector2) -> void:
	pending.clear()
	for id:int in active.keys():
		var seat:Dictionary=active[id]
		if maxi(absi(seat.cell.x-cell.x),absi(seat.cell.y-cell.y))>2:
			seat.root.queue_free()
			active.erase(id)
	for x in range(-2,3):
		for z in range(-2,3):
			for spot:Dictionary in sectors.get(cell+Vector2i(x,z),[]):
				if not active.has(int(spot.id)):pending.append(spot)
	pending.sort_custom(func(a,b):return pos.distance_squared_to(a.at)>pos.distance_squared_to(b.at))

func _add(spot:Dictionary) -> void:
	var id:=int(spot.id)
	var body:=StaticBody3D.new()
	body.collision_layer=8
	body.collision_mask=0
	body.set_meta(&"summer_prop",_impact.bind(id))
	body.set_meta(&"daily_prop","bench")
	body.position=Vector3(spot.at.x,yard.terrain.land_height(spot.at.x,spot.at.y),spot.at.y)
	body.rotation.y=spot.face
	add_child(body)
	var collision:=CollisionShape3D.new()
	collision.shape=shape
	collision.position.y=.5
	body.add_child(collision)
	var model:=MeshInstance3D.new()
	var style:=int(spot.style)
	if not meshes.has(style):meshes[style]=yard._prop(styles[style])
	model.mesh=meshes[style]
	model.material_override=yard.props_paint
	model.visibility_range_end=185
	body.add_child(model)
	var entry:Dictionary={"root":body,"col":collision,"mesh":model,"cell":Vector2i((spot.at/CELL).floor())}
	active[id]=entry
	if broken.has(id):
		collision.disabled=true
		model.transform=broken[id]

func _impact(_contact:KinematicCollision3D,approach:float,motion:Vector3,id:int) -> float:
	if broken.has(id):return 1.0
	if approach<=.4 or not active.has(id):return -1.0
	var seat:Dictionary=active[id]
	seat.col.disabled=true
	var push:Vector3=seat.root.basis.inverse()*Vector3(motion.x,0,motion.z).normalized()
	if push.length_squared()<.01:push=Vector3.BACK
	var tilt:=Basis(Vector3.UP.cross(push).normalized(),1.42)
	var mesh:MeshInstance3D=seat.mesh
	# The bottom of the fallen seat rests on the ground at the point of impact.
	var bounds:=mesh.mesh.get_aabb()
	var low:=INF
	for i in 8:low=minf(low,(tilt*bounds.get_endpoint(i)).y)
	var destination:=Transform3D(tilt,push*clampf(approach*.13,.35,2.1)-Vector3.UP*low)
	broken[id]=destination
	var tween:=mesh.create_tween()
	tween.tween_property(mesh,"transform",destination,.34).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	return .91

func clear() -> void:
	for seat:Dictionary in active.values():seat.root.queue_free()
	active.clear()
	pending.clear()
	broken.clear()
	last=Vector2i(99999,99999)
