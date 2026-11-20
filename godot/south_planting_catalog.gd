extends RefCounted

const PATH := "res://assets/south-outer-planting.bin"
const TILE := 64.0
const HEADER_BYTES := 8
const PLANT_BYTES := 9
const SHRUB := 6
const GRASS := 7
const STONE := 8

var bytes := PackedByteArray()
var tiles := {}


func load_tiles() -> void:
	bytes = FileAccess.get_file_as_bytes(PATH)
	var cursor := 0
	while cursor + HEADER_BYTES <= bytes.size():
		var key := Vector2i(bytes.decode_s16(cursor),bytes.decode_s16(cursor+2))
		var count := bytes.decode_u32(cursor+4)
		cursor += HEADER_BYTES
		var end := cursor+count*PLANT_BYTES
		if end > bytes.size():
			push_error("Truncated South planting tile")
			return
		tiles[key] = Vector2i(cursor,end)
		cursor = end


static func tile_at(p: Vector2) -> Vector2i:
	return Vector2i((p/TILE).floor())


# Tile header: signed X/Z and record count. Plants have centimetre offsets
# from the tile's southwest corner, plus scale, species and angle.
static func save(stands: Dictionary) -> bool:
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	if file == null:
		return false
	var row := PackedByteArray()
	row.resize(PLANT_BYTES)
	for key: Vector2i in stands:
		var plants: Array = stands[key]
		file.store_16(key.x)
		file.store_16(key.y)
		file.store_32(plants.size())
		var corner := Vector2(key)*TILE
		for p: Array in plants:
			row.encode_u16(0,roundi((float(p[0])-corner.x)*100.0))
			row.encode_s16(2,roundi(float(p[1])*100.0))
			row.encode_u16(4,roundi((float(p[2])-corner.y)*100.0))
			row[6] = roundi(float(p[3])*100.0)
			row[7] = int(p[4])
			row[8] = roundi(float(p[5])*256.0/TAU)%256
			file.store_buffer(row)
	return file.get_error() == OK
