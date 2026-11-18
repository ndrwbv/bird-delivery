extends RefCounted

const POSE := preload("res://delivery_actor_pose.gd")
const HIDDEN := Basis(Vector3.ZERO,Vector3.ZERO,Vector3.ZERO)
var active: Array[Dictionary] = []

func step(world: StaticBody3D, observer: Vector2) -> void:
	for i in range(active.size()-1,-1,-1):
		var guest := active[i]
		if guest.gone or observer.distance_squared_to(guest.point)>33.0*33.0:
			_drop(guest)
			active.remove_at(i)
	if active.size()>=8 or not world.host.factory.is_valid():
		return
	var spawned := 0
	for site in world.sites:
		var p: Vector3 = site.root.position
		if observer.distance_squared_to(Vector2(p.x,p.z))>55.0*55.0:
			continue
		for guest in site.guests:
			if guest.gone or guest.person!=null or guest.point.distance_squared_to(observer)>28.0*28.0:
				continue
			var actor: Node3D = world.host.cast.actor(int(guest.variant)%5,guest.point)
			actor.player.pause()
			actor.rotation.y = guest.yaw
			actor.global_position = Vector3(guest.point.x,site.root.position.y+guest.pose.origin.y,guest.point.y)
			actor.model.position.y = -0.49
			actor.shape_node.set_deferred("disabled",true)
			var pose := POSE.new()
			pose.setup(actor.model)
			pose.sit(1.0)
			guest.person = actor
			guest.model.set_instance_transform(guest.slot,Transform3D(HIDDEN,guest.pose.origin))
			active.append(guest)
			spawned += 1
			if spawned>=2 or active.size()>=8:
				return

func leave(guest: Dictionary) -> void:
	guest.gone = true
	if guest.person!=null:
		_drop(guest)
		active.erase(guest)
	guest.model.set_instance_transform(guest.slot,Transform3D(HIDDEN,guest.pose.origin))

func _drop(guest: Dictionary) -> void:
	if is_instance_valid(guest.person):
		guest.person.hide()
		guest.person.queue_free()
	guest.person = null
	if not guest.gone:
		guest.model.set_instance_transform(guest.slot,guest.pose)

func clear() -> void:
	for guest in active:
		_drop(guest)
	active.clear()
