extends "res://south_crew_vehicle.gd"

signal destroyed(vehicle: Node3D)
signal displaced(vehicle: Node3D)
var player_car: CharacterBody3D
var hp := 120.0
var ram := 0.0
var cut := 0.0
var grazed := false
var last_damage := -1.0
var played := 0.0


func arcade_hit() -> void:
	if hp<=0:
		return
	hp = 0
	destroyed.emit(self)


func player_collided(force: float, at: Vector3, normal: Vector3) -> bool:
	if not is_instance_valid(player_car):
		return false
	var mine := -player_car.velocity.dot(normal)
	var theirs := (-basis.z*pace).dot(normal)
	grazed = ram<=0 and (force<20 or theirs>mine)
	if not grazed:
		var previous: float = player_car.hearts
		player_car.collision_damage(force,true,at,normal)
		if ram>0 and player_car.hearts<previous-0.5:
			player_car.hearts = previous-0.5
			player_car.damage.set_hearts(player_car.hearts)
	return true


func struck(force: float, shot: Vector3) -> void:
	if hp<=0 or grazed or force<=5:
		grazed = false
		return
	super.struck(force,shot)
	ram = 0
	cut = 0
	if played-last_damage<0.5:
		return
	last_damage = played
	hp -= force*2.4
	if hp<=0:
		destroyed.emit(self)
	else:
		displaced.emit(self)


func _physics_process(delta: float) -> void:
	played += delta
	if hp<=0:
		return
	if cut>0:
		cut = maxf(0,cut-delta)
		pace = move_toward(pace,0,28*delta)
		if is_instance_valid(lamps):
			lamps.material_override = lamp_on
		if going:
			_follow_step(pace*delta,delta)
		return
	if ram<=0:
		super._physics_process(delta)
		return
	var toward := player_car.global_position-global_position
	rotation.y = rotate_toward(rotation.y,atan2(-toward.x,-toward.z),3*delta)
	var speed_limit: float = signals.road_speed(Vector2(position.x,position.z),Vector2(-basis.z.x,-basis.z.z),pace)
	pace = lerpf(pace,cruise*1.2*speed_limit,1-exp(-8.0*delta))
	var contact := move_and_collide(-basis.z*pace*delta)
	if contact:
		if contact.get_collider()==player_car:
			var normal := -contact.get_normal()
			var strength := maxf(0.0,(player_car.velocity+basis.z*pace).dot(-normal))
			player_collided(strength,contact.get_position(),normal)
		ram = 0
	else:
		position.y = terrain.at(position.x,position.z,position.y)+0.04
		ram = maxf(0,ram-delta)
	if ram<=0:
		displaced.emit(self)
