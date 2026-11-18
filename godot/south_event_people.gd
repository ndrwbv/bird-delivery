extends RefCounted

const RECIPIENTS := preload("res://delivery_recipients.gd")
var host: Node3D
var clothes := {}
var resting: Array[Dictionary] = []


func at(who: Node3D) -> Vector2:
	return Vector2(who.position.x,who.position.z)


func actor(index: int, point: Vector2, shirt := Color.TRANSPARENT) -> Node3D:
	var who: Node3D = host.factory.call(index,point,point,0.0)
	if shirt.a <= 0.0:
		return who
	var key := Vector2i(index,shirt.to_rgba32())
	for mesh: MeshInstance3D in who.model.find_children("*","MeshInstance3D",true,false):
		if not mesh.material_override is ShaderMaterial:
			continue
		if not clothes.has(key):
			var paint := mesh.material_override.duplicate() as ShaderMaterial
			var linear := shirt.srgb_to_linear()
			paint.set_shader_parameter("change_shirt",true)
			paint.set_shader_parameter("original_shirt",RECIPIENTS.SHIRT_KEYS[index%RECIPIENTS.SHIRT_KEYS.size()]/255.0)
			paint.set_shader_parameter("new_shirt",Vector3(linear.r,linear.g,linear.b))
			clothes[key] = paint
		mesh.material_override = clothes[key]
	return who


func prop(parent: Node3D, size_value: Vector3, local: Vector3, color: Color) -> MeshInstance3D:
	var obj: MeshInstance3D = host._box(size_value,color)
	parent.add_child(obj)
	obj.position = local
	return obj


func say(who: Node3D, line: String, color: Color, seconds := 2.8) -> void:
	if not is_instance_valid(who):
		return
	var label := who.get_node_or_null("EventSpeech") as Label3D
	if label == null:
		label = host._label(who,0.0044)
		label.name = "EventSpeech"
		label.position.y = 2.48
		label.width = 650.0
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var timer := Timer.new()
		timer.name = "Lifetime"
		timer.one_shot = true
		timer.timeout.connect(label.hide)
		label.add_child(timer)
	label.text = host.tr(line)
	label.modulate = color
	label.visible = true
	label.get_node("Lifetime").start(seconds)


func walk(who: Node3D, dest: Vector2, meters: float) -> void:
	if not is_instance_valid(who) or not host.traffic.people._clear_to_use(who):
		return
	var p := at(who)
	if p.distance_squared_to(dest)<0.16:
		if who.walker:
			host.traffic.people._walk(who,p,p,meters)
		return
	if who.walker and not who.reverse and dest.distance_squared_to(who.to)<0.03 and is_equal_approx(meters,who.pace):
		return
	host.traffic.people._walk(who,p,dest,meters)


func retire(who: Node3D, keep_impact := false) -> void:
	if not is_instance_valid(who) or who.is_queued_for_deletion():
		return
	if keep_impact and resting.size()<12:
		who.walker = false
		resting.append({"actor":who,"left":15.0})
	else:
		who.queue_free()


func tick(delta: float) -> void:
	for i in range(resting.size()-1,-1,-1):
		var slot := resting[i]
		slot.left -= delta
		if slot.left<=0 or not is_instance_valid(slot.actor):
			if is_instance_valid(slot.actor):
				slot.actor.queue_free()
			resting.remove_at(i)


func clear() -> void:
	for slot in resting:
		if is_instance_valid(slot.actor):
			slot.actor.queue_free()
	resting.clear()
