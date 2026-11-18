extends RefCounted

const LIMIT := 24
var figures: Array[Dictionary] = []
var parent: Node3D
var terrain: RefCounted
var human: PackedScene
var crust := StandardMaterial3D.new()

func setup(root: Node3D, floor_source: RefCounted) -> void:
	parent = root
	terrain = floor_source
	human = load("res://assets/pedestrian-0.glb")
	crust.albedo_color = Color("#422b20")
	crust.roughness = 1.0

func emerge(point: Vector2, radius: float, now: float, rng: RandomNumberGenerator) -> void:
	var spin := rng.randf()*TAU
	for i in (4 if radius>7 else 3):
		if figures.size()>=LIMIT:
			_drop(0)
		var angle := spin+i*1.46
		figures.append({"node":null,"point":point,"radius":radius,"direction":Vector2(sin(angle),cos(angle)),
			"born":now+1.5+i*.9,"offset":Vector2.ZERO,"velocity":Vector2.ZERO,"y":0.0,"dy":0.0})

func blast(p: Vector2, radius: float) -> void:
	for figure in figures:
		if not is_instance_valid(figure.node): continue
		var d := Vector2(figure.node.position.x,figure.node.position.z)-p
		if d.length() >= radius: continue
		var force := (1-d.length()/radius)*16.0
		figure.velocity = d.normalized()*force
		figure.dy = force*.46

func tick(time: float,delta: float,car: Vector2) -> void:
	for i in range(figures.size()-1,-1,-1):
		var figure := figures[i]
		var age := time-float(figure.born)
		if age>70 or car.distance_squared_to(figure.point)>190*190:
			_drop(i)
			continue
		if age<0: continue
		if not is_instance_valid(figure.node):
			var node := human.instantiate() as Node3D
			parent.add_child(node)
			for mesh: MeshInstance3D in node.find_children("*","MeshInstance3D",true,false):
				mesh.material_override = crust
				mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			var animation := node.find_child("AnimationPlayer",true,false) as AnimationPlayer
			if animation and animation.has_animation("walk"):
				animation.play("walk")
			node.rotation.y = atan2(figure.direction.x,figure.direction.y)
			figure.node = node
		var climb := minf(1,age/3.8)
		var distance := float(figure.radius)*(.12+climb)+maxf(0,age-3.8)*1.48
		figure.offset += figure.velocity*delta
		figure.velocity *= exp(-2.5*delta)
		figure.y = maxf(0,float(figure.y)+float(figure.dy)*delta)
		figure.dy = float(figure.dy)-18*delta if figure.y>0 else 0.0
		var p: Vector2 = figure.point+figure.direction*distance+figure.offset
		figure.node.position = Vector3(p.x,float(terrain.at(p.x,p.y))+float(figure.y),p.y)
		figure.node.rotation.x = -.9 if figure.y>.1 else .62*(1-climb)

func _drop(i: int) -> void:
	if is_instance_valid(figures[i].node):
		figures[i].node.queue_free()
	figures.remove_at(i)

func clear() -> void:
	figures.clear()
