extends Node3D

const POSE := preload("res://delivery_actor_pose.gd")
var site: Dictionary
var time:=0.0
var toy:=Node3D.new()
var string_mesh:MeshInstance3D
var remote:MeshInstance3D
var ribbons:Array[Node3D]=[]
var rotors:Array[Node3D]=[]
var pose:=POSE.new()

func setup(data:Dictionary,actor:Node3D,phase:float) -> void:
	site=data
	time=phase
	add_child(toy)
	pose.setup(actor.model)
	var color:=Color(site.color)
	if site.kite:
		var cloth:=SurfaceTool.new()
		cloth.begin(Mesh.PRIMITIVE_TRIANGLES)
		for v:Vector3 in [Vector3(0,.9,0),Vector3(-.6,.1,0),Vector3(0,-.8,0),Vector3(0,.9,0),Vector3(0,-.8,0),Vector3(.6,.1,0)]:
			cloth.set_normal(Vector3.BACK)
			cloth.add_vertex(v)
		var sail:=_mesh(toy,cloth.commit(),color)
		sail.material_override.cull_mode=BaseMaterial3D.CULL_DISABLED
		for i in 5:
			var bow:=_box(toy,Vector3(.22,.08,.02),Color("#f4f1ea") if i%2 else color)
			bow.position.y=-.95-i*.45
			ribbons.append(bow)
		string_mesh=_box(self,Vector3(.014,.014,1),Color("#f2f2f2"))
		actor.rotation.y=site.wind
	else:
		_box(toy,Vector3(.34,.09,.34),Color("#2b2f36"))
		for angle:float in [PI/4,-PI/4]:
			_box(toy,Vector3(.62,.03,.05),Color("#3a3f48")).rotation.y=angle
		var rotor:=CylinderMesh.new()
		rotor.top_radius=.15
		rotor.bottom_radius=.15
		rotor.height=.01
		rotor.radial_segments=8
		rotor.rings=0
		for x:float in [-.22,.22]:
			for z:float in [-.22,.22]:
				var disk:=_mesh(toy,rotor,Color("#c9ced6"))
				disk.position=Vector3(x,.05,z)
				rotors.append(disk)
		_box(toy,Vector3(.11,.048,.06),color).position=Vector3(0,-.05,.17)
		remote=_box(actor,Vector3(.2,.05,.12),Color("#30343a"))
		remote.position=Vector3(0,1.05,.38)
	advance(0,actor,false)

func _mesh(parent:Node3D,geometry:Mesh,color:Color) -> MeshInstance3D:
	var mesh:=MeshInstance3D.new()
	mesh.mesh=geometry
	var material:=StandardMaterial3D.new()
	material.albedo_color=color
	mesh.material_override=material
	mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mesh)
	return mesh

func _box(parent:Node3D,size_:Vector3,color:Color) -> MeshInstance3D:
	var box:=BoxMesh.new()
	box.size=size_
	return _mesh(parent,box,color)

func advance(delta:float,actor:Node3D,fallen:bool) -> void:
	time+=delta
	var t:=time
	var at:=Vector3(site.at.x,site.height,site.at.y)
	if site.kite:
		var ahead:=Vector3(sin(site.wind),0,cos(site.wind))
		var side:=Vector3(ahead.z,0,-ahead.x)
		var to:=at+ahead*(18+sin(t*.21)*4)+side*(sin(t*.47)*4+sin(t*1.3)*.8)
		to.y+=22+sin(t*.33)*4+sin(t*1.1)*.6
		toy.position=to
		toy.rotation=Vector3(.35,site.wind+PI,sin(t*1.3)*.35)
		for i in ribbons.size(): ribbons[i].position.x=sin(t*3-i*.8)*.12*(i+1)
		var hand:=actor.position+ahead*.45+Vector3.UP*(.4 if fallen else 1.85)
		var target:=to-Vector3.UP*.75
		string_mesh.position=(hand+target)*.5
		string_mesh.look_at(target)
		string_mesh.scale.z=target.distance_to(hand)
		if not fallen: pose.fly(true,sin(t*1.3)*.12)
	else:
		var offset:=Vector3(sin(t*.31)*10,9+sin(t*.23)*4+sin(t*5.1)*.05,sin(t*.62)*5)
		toy.position=at+offset
		toy.rotation=Vector3(cos(t*.62)*6.2*delta,sin(t*.2)*1.2,-cos(t*.31)*6.2*delta)
		for disk in rotors: disk.rotation.y+=delta*40
		if not fallen:
			pose.fly(false,0)
			actor.rotation.y=atan2(offset.x,offset.z)

func _exit_tree() -> void:
	if is_instance_valid(remote): remote.queue_free()
