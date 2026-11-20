extends RefCounted

const PATH := "res://assets/south-outer-planting.bin"
const MAGIC := 0x32504C53 # SLP2
const TILE := 64.0
const HEADER_BYTES := 12
const PLANT_BYTES := 12
const SHRUB := 6
const GRASS := 7
const STONE := 8
const DRY := 9
const SPRUCE := 5
const FAR_SPACING := 13.0

var bytes := PackedByteArray()
var tiles := {}


func load_tiles() -> void:
	bytes = FileAccess.get_file_as_bytes(PATH)
	if bytes.size() < 4 or bytes.decode_u32(0) != MAGIC:
		push_error("Rebuild the South planting catalogue")
		return
	var cursor := 4
	while cursor + HEADER_BYTES <= bytes.size():
		var key := Vector2i(bytes.decode_s16(cursor),bytes.decode_s16(cursor+2))
		var count := bytes.decode_u32(cursor+4)
		var trees := bytes.decode_u32(cursor+8)
		cursor += HEADER_BYTES
		var end := cursor+count*PLANT_BYTES
		if end > bytes.size() or trees > count:
			push_error("Truncated South planting tile")
			return
		tiles[key] = Vector3i(cursor,cursor+trees*PLANT_BYTES,end)
		cursor = end


static func tile_at(p: Vector2) -> Vector2i:
	return Vector2i((p/TILE).floor())


static func is_tree(kind: int) -> bool:
	return kind < SHRUB or kind == DRY


static func is_anchor(cell: Vector2i, index: int, anchors: Dictionary) -> bool:
	return anchors.has(cell) and int(anchors[cell][0]) == index


# Collect representatives globally so clumps spanning a tile border keep one
# distant tree too. The remaining trees fade in at their own positions.
static func save(stands: Dictionary) -> bool:
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	if file == null:
		return false
	var row := PackedByteArray()
	row.resize(PLANT_BYTES)
	file.store_32(MAGIC)
	var anchors := {}
	for key: Vector2i in stands:
		for p: Array in stands[key]:
			if not is_tree(int(p[4])):
				continue
			var cell := _grove_cell(p)
			var score := float(p[3])*(0.68 if int(p[4]) == DRY else 1.0)
			if not anchors.has(cell) or score > float(anchors[cell][1]):
				anchors[cell] = [int(p[7]),score]
	for key: Vector2i in stands:
		var trees: Array = []
		var plants: Array = []
		for p: Array in stands[key]:
			if is_tree(int(p[4])):
				trees.append(p)
			else:
				plants.append(p)
		file.store_16(key.x)
		file.store_16(key.y)
		file.store_32(trees.size()+plants.size())
		file.store_32(trees.size())
		var corner := Vector2(key)*TILE
		for p: Array in trees+plants:
			row.encode_u16(0,roundi((float(p[0])-corner.x)*100.0))
			row.encode_s16(2,roundi(float(p[1])*100.0))
			row.encode_u16(4,roundi((float(p[2])-corner.y)*100.0))
			row[6] = roundi(float(p[3])*100.0)
			row[7] = int(p[4])
			row[8] = roundi(float(p[5])*256.0/TAU)%256
			row[9] = roundi(float(p[6])*100.0)
			row[10] = int(is_anchor(_grove_cell(p),int(p[7]),anchors))
			row[11] = roundi(float(p[8])*80.0)
			file.store_buffer(row)
	print("Distant forest: ",anchors.size()," representative trees")
	return file.get_error() == OK


static func _grove_cell(p: Array) -> Vector2i:
	return Vector2i((Vector2(p[0],p[2])/FAR_SPACING).floor())
