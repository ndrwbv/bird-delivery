extends MeshInstance3D

signal walk_changed(points: PackedVector2Array)

const STEP := 2.5
const HALF_WIDTH := 2.1
const LOOK_AHEAD := 200.0
const BUILD_AHEAD := 245.0
const MAX_POINTS_PER_FRAME := 38
var ground: RefCounted
var roads := {}
var car: Node3D
var atmosphere: Node
var path := PackedVector2Array()
var stations := PackedFloat32Array()
var paint := ShaderMaterial.new()
var old_line := MeshInstance3D.new()
var old_paint: ShaderMaterial
var walk_line := MeshInstance3D.new()
var walk_paint := StandardMaterial3D.new()
var walk := PackedVector2Array()
var errand := false
var map_color := Color.TRANSPARENT
var samples := PackedFloat32Array()
var vertices := PackedVector3Array()
var coordinates := PackedVector2Array()
var pattern := PackedVector2Array()
var indices := PackedInt32Array()
var sample_index := 0
var built_from := 0.0
var active_path := PackedVector2Array()
var active_stations := PackedFloat32Array()
var active_since := 0.0
var old_time := 0.0
var old_end := 0.0
var fork := 0.0
var station := 0.0
var last_position := Vector2.INF
var anchor := Vector2.ZERO
var offset := Vector2.ZERO
var max_offset := 6.0
var build_offset := 6.0
var reference_y := INF
var back := false
var fresh := true
var building := false
var projection_age := 0.0

func setup(terrain: RefCounted, observer: Node3D=null, sky: Node=null, road_index := {}) -> void:
	ground=terrain
	roads=road_index
	car=observer
	atmosphere=sky
	paint.shader=preload("res://delivery_route.gdshader")
	old_paint=paint.duplicate()
	add_child(old_line)
	old_line.material_override=old_paint
	old_line.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(walk_line)
	walk_line.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	walk_paint.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	walk_paint.cull_mode=BaseMaterial3D.CULL_DISABLED
	walk_paint.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	walk_line.material_override=walk_paint
	walk_line.hide()
	material_override=paint
	cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	hide()
	set_process(false)

func set_route(points: Array, to_depot: bool, enabled: bool, side := false) -> void:
	var color:=Color("#3fd15e") if to_depot else (Color("#a15bff") if side else Color("#ff8a2b"))
	if map_color!=color:
		map_color=color
		if is_inside_tree():
			get_tree().call_group(&"delivery_maps",&"set_route_color",color)
	if not enabled or points.size()<2:
		hide()
		old_line.mesh=null
		old_time=0.0
		mesh=null
		active_path.clear()
		path.clear()
		building=false
		set_process(false)
		return
	var new_path:=PackedVector2Array()
	for pair: Array in points:
		var p:=Vector2(pair[0],pair[1])
		if new_path.is_empty() or new_path[-1].distance_squared_to(p)>.05:
			new_path.append(p)
	if new_path.size()<2:
		set_route([],to_depot,false)
		return
	if visible and new_path==path and back==to_depot and errand==side:return
	back=to_depot
	errand=side
	path=new_path
	stations=PackedFloat32Array([0.])
	for i in range(1,path.size()):
		stations.append(stations[i-1]+path[i-1].distance_to(path[i]))
	fresh=true
	_queue_build()
	show()
	set_process(true)

func set_walk(from: Array, to: Array) -> void:
	var next:=PackedVector2Array()
	if from.size()==2 and to.size()==2:
		var start:=Vector2(from[0],from[1])
		var end:=Vector2(to[0],to[1])
		if start.distance_squared_to(end)>.12*.12:
			next=PackedVector2Array([start,end])
	if next==walk:return
	walk=next
	walk_changed.emit(walk)
	walk_line.mesh=null
	walk_line.hide()
	if walk.is_empty():return
	var distance:=walk[0].distance_to(walk[1])
	var direction:=walk[0].direction_to(walk[1])
	var side:=direction.orthogonal()*.38
	var dashes:=ImmediateMesh.new()
	dashes.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in mini(512,ceili(distance/3.5)):
		var d:=i*3.5
		var length:=minf(2.1,distance-d)
		if length<.12:break
		var a:=walk[0]+direction*d
		var b:=a+direction*length
		var ya:float=ground.at(a.x,a.y)+.18
		var yb:float=ground.at(b.x,b.y,ya)+.18
		var left:=Vector3(side.x,0,side.y)
		var start:=Vector3(a.x,ya,a.y)
		var end:=Vector3(b.x,yb,b.y)
		for point:Vector3 in [start+left,start-left,end+left,start-left,end-left,end+left]:
			dashes.surface_add_vertex(point)
	dashes.surface_end()
	walk_line.mesh=dashes

func _position() -> Vector2:
	return Vector2(car.position.x,car.position.z) if car else path[0]

func _project(points: PackedVector2Array, spans: PackedFloat32Array, pos:Vector2, start:=0.0, finish:=INF) -> Vector3:
	var closest:=Vector3(0,0,0)
	var best:=INF
	for i in range(1,points.size()):
		if spans[i]<start:continue
		if spans[i-1]>finish:break
		var foot:=Geometry2D.get_closest_point_to_segment(pos,points[i-1],points[i])
		var d:=foot.distance_squared_to(pos)
		if d<best:
			best=d
			closest=Vector3(foot.x,foot.y,spans[i-1]+foot.distance_to(points[i-1]))
	return closest

func _point_at(d:float) -> Vector2:
	var i:=clampi(stations.bsearch(d),1,path.size()-1)
	return path[i-1].lerp(path[i],clampf(inverse_lerp(stations[i-1],stations[i],d),0,1))

func _queue_build() -> void:
	var near:=_project(path,stations,_position())
	built_from=maxf(0,near.z-3)
	reference_y=car.position.y if car else INF
	build_offset=6.0
	var limit:=minf(stations[-1],built_from+BUILD_AHEAD)
	samples=PackedFloat32Array([built_from])
	var start:=built_from
	for i in range(maxi(1,stations.bsearch(built_from)),stations.size()):
		var end:=minf(limit,stations[i])
		while start+STEP<end-.05:
			start+=STEP
			samples.append(start)
		if end-start>.05:samples.append(end)
		start=end
		if end>=limit:break
	vertices.clear()
	coordinates.clear()
	pattern.clear()
	indices.clear()
	sample_index=0
	building=true

func _emit_points() -> void:
	var n:=mini(samples.size(),sample_index+MAX_POINTS_PER_FRAME)
	while sample_index<n:
		var d:=samples[sample_index]
		var p:=_point_at(d)
		var from:=_point_at(maxf(0,d-.45))
		var to:=_point_at(minf(stations[-1],d+.45))
		var axis:=from.direction_to(to)
		var clearance:=_clearance(p)
		var foot:=clearance<.04
		var half_width:=.38 if foot else minf(clearance,HALF_WIDTH/maxf(.5,axis.dot(p.direction_to(to))))
		var side:=Vector2(-axis.y,axis.x)*half_width
		if d<built_from+14.0:
			build_offset=minf(build_offset,maxf(0,clearance-half_width))
		reference_y=ground.at(p.x,p.y,reference_y)
		for k in 2:
			var rim:=p+side*(1 if k else -1)
			vertices.append(Vector3(rim.x,ground.at(rim.x,rim.y,reference_y)+(.18 if foot else .26),rim.y))
			coordinates.append(Vector2(k,d))
			pattern.append(Vector2(float(foot),d-stations[-1]))
		var j:=sample_index*2
		if j>=2:indices.append_array(PackedInt32Array([j-2,j-1,j,j-1,j+1,j]))
		sample_index+=1
	if sample_index<samples.size():return
	building=false
	if indices.is_empty():return
	var arrays:=[]
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX]=vertices
	arrays[Mesh.ARRAY_TEX_UV]=coordinates
	arrays[Mesh.ARRAY_TEX_UV2]=pattern
	arrays[Mesh.ARRAY_INDEX]=indices
	var ribbon:=ArrayMesh.new()
	ribbon.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var here:=_position()
	var projected:=_project(path,stations,here)
	last_position=here
	station=projected.z
	anchor=Vector2(projected.x,projected.y)
	fork=0
	if mesh and fresh:
		var old:=_project(active_path,active_stations,here)
		var old_station:=old.z
		old_end=old_station+LOOK_AHEAD
		for s in range(4,201,4):
			var at:=_point_at(minf(stations[-1],station+s))
			var other:=_project(active_path,active_stations,at,old_station+s-14,old_station+s+14)
			if at.distance_squared_to(Vector2(other.x,other.y))>2.4*2.4:break
			fork=s
			if station+s>=stations[-1]:break
		if fork<LOOK_AHEAD-4:
			old_line.mesh=mesh
			old_line.material_override=paint.duplicate()
			old_paint=old_line.material_override
			old_time=.4
			old_paint.set_shader_parameter("car_station",old_station+fork-2)
			old_paint.set_shader_parameter("car_offset",Vector2.ZERO)
		else:
			old_line.mesh=null
			old_time=0
	else:
		fork=0 if fresh else LOOK_AHEAD
	mesh=ribbon
	active_path=path
	active_stations=stations
	active_since=0.0 if fork<LOOK_AHEAD-4 else .6
	max_offset=build_offset
	offset=(here-anchor).limit_length(max_offset)
	paint.set_shader_parameter("body",Color("#62c46e") if back else (Color("#9a6ad6") if errand else Color("#e0925c")))
	paint.set_shader_parameter("arrow",Color("#b8ecbc") if back else (Color("#d6c0f4") if errand else Color("#f2c49c")))
	fresh=false
	projection_age=0

func _clearance(p: Vector2) -> float:
	if roads.is_empty():return HALF_WIDTH+6.0
	var widest:=0.0
	for road: Array in roads.get(Vector2i((p/48.0).floor()),[]):
		var nearest:=Geometry2D.get_closest_point_to_segment(p,road[0],road[1])
		widest=maxf(widest,float(road[2])*.5-p.distance_to(nearest)-.20)
	return widest

func _process(dt: float) -> void:
	if building:_emit_points()
	if not mesh:return
	active_since+=dt
	projection_age-=dt
	if projection_age<=0:
		projection_age=.04
		var pos:=_position()
		var moved_far:=pos.distance_squared_to(last_position)>35*35
		var result:=_project(active_path,active_stations,pos) if moved_far else _project(active_path,active_stations,pos,maxf(0,station-18),station+75)
		last_position=pos
		walk_line.visible=not walk.is_empty() and pos.distance_squared_to(walk[0])<LOOK_AHEAD*LOOK_AHEAD
		if walk_line.visible:
			var color:=Color("#ff8a2b")
			color.a=.8*lerpf(1,.6,atmosphere.night) if atmosphere else .8
			walk_paint.albedo_color=color
		anchor=Vector2(result.x,result.y)
		station=result.z
		if not building and (station<built_from or (station>built_from+32 and built_from+BUILD_AHEAD<stations[-1])):
			_queue_build()
	offset=offset.lerp((_position()-anchor).limit_length(max_offset),1-exp(-10*dt))
	paint.set_shader_parameter("car_offset",offset)
	paint.set_shader_parameter("car_station",station)
	paint.set_shader_parameter("far_station",station+LOOK_AHEAD)
	paint.set_shader_parameter("front",station+fork+5+(LOOK_AHEAD+10)*smoothstep(0,.6,active_since))
	paint.set_shader_parameter("opacity",.62*(1.0 if old_time>0 else clampf(active_since/.5,0,1)))
	paint.set_shader_parameter("night_factor",lerpf(1,.6,atmosphere.night) if atmosphere else 1.0)
	if old_time>0:
		old_time=maxf(0,old_time-dt)
		old_paint.set_shader_parameter("front",lerpf(old_end-LOOK_AHEAD+fork,old_end,smoothstep(0,.4,old_time)))
		if old_time==0:old_line.mesh=null
