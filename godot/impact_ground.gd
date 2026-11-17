extends Node3D

const FLOOR_LAYER := 64
const TILE_SIZE := 16
const KEEP_SECONDS := 33.0

var terrain: RefCounted
var tiles: Dictionary = {}
var timer := 0.0


func setup(ground: RefCounted) -> void:
	terrain = ground
	set_process(false)


func cover(at: Vector3, reach: float) -> void:
	var first := _key(at-Vector3(reach,0.0,reach))
	var last := _key(at+Vector3(reach,0.0,reach))
	for z in range(first.y,last.y+1):
		for x in range(first.x,last.x+1):
			var cell := Vector2i(x,z)
			if not tiles.has(cell):
				tiles[cell] = {"body":_make_tile(cell),"left":KEEP_SECONDS}
			else:
				tiles[cell].left = KEEP_SECONDS
	set_process(true)


func _process(delta: float) -> void:
	timer += delta
	if timer < 1.0:
		return
	for key: Vector2i in tiles.keys():
		tiles[key].left -= timer
		if tiles[key].left <= 0.0:
			tiles[key].body.queue_free()
			tiles.erase(key)
	timer = 0.0
	set_process(not tiles.is_empty())


func _key(at: Vector3) -> Vector2i:
	return Vector2i(floori(at.x/TILE_SIZE),floori(at.z/TILE_SIZE))


func _make_tile(tile: Vector2i) -> StaticBody3D:
	var start := tile*TILE_SIZE
	var size := TILE_SIZE+1
	var heights := PackedFloat32Array()
	heights.resize(size*size)
	for z in size:
		for x in size:
			heights[z*size+x] = terrain.at(start.x+x,start.y+z)+0.012
	var shape := HeightMapShape3D.new()
	shape.map_width = size
	shape.map_depth = size
	shape.map_data = heights
	var body := StaticBody3D.new()
	body.collision_layer = FLOOR_LAYER
	body.collision_mask = 0
	body.position = Vector3(start.x+0.5*TILE_SIZE,0.0,start.y+0.5*TILE_SIZE)
	var collider := CollisionShape3D.new()
	collider.shape = shape
	body.add_child(collider)
	add_child(body)
	return body
