extends MeshInstance3D

const GROUND := preload("res://south_region_ground.gd")
const OVERVIEW := preload("res://south_region_overview.gdshader")
const ROAD_PIXEL := 3.0

var ready_tiles: Image
var ready_texture: ImageTexture


# The first view after a teleport already has continuous relief, shoreline and the road network.
# An R8 bitmap discards only those 96 m tiles for which the full road geometry is ready.
func setup(ground: GROUND, bounds: Rect2, tile_size: float, water_y: float) -> void:
	var tile_count := Vector2i((bounds.size/tile_size).ceil())
	ready_tiles = Image.create_empty(tile_count.x,tile_count.y,false,Image.FORMAT_R8)
	ready_texture = ImageTexture.create_from_image(ready_tiles)
	var height_image := Image.create_from_data(ground.columns,ground.rows,false,Image.FORMAT_RF,
			ground.heights.to_byte_array())
	var road_size := Vector2i((bounds.size/ROAD_PIXEL).ceil())
	var road_map := Image.create_empty(road_size.x,road_size.y,false,Image.FORMAT_R8)
	var scale := Vector2(road_size)/bounds.size
	for segment: Dictionary in ground.road_sections:
		_fill_road(road_map,segment.road,bounds.position,scale)
	var material := ShaderMaterial.new()
	material.shader = OVERVIEW
	material.set_shader_parameter(&"elevation", ImageTexture.create_from_image(height_image))
	material.set_shader_parameter(&"roads", ImageTexture.create_from_image(road_map))
	material.set_shader_parameter(&"complete_tiles", ready_texture)
	material.set_shader_parameter(&"area",Vector4(bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y))
	material.set_shader_parameter(&"core",Vector4(ground.core.position.x,ground.core.position.y,ground.core.end.x,ground.core.end.y))
	material.set_shader_parameter(&"tile_size",tile_size)
	material.set_shader_parameter(&"water_y",water_y)
	var surface := PlaneMesh.new()
	surface.size = bounds.size
	surface.subdivide_width = ceili(float(ground.columns-1)/2.0)-1
	surface.subdivide_depth = ceili(float(ground.rows-1)/2.0)-1
	mesh = surface
	material_override = material
	position = Vector3(bounds.get_center().x,0,bounds.get_center().y)
	custom_aabb = AABB(Vector3(-bounds.size.x*0.5,-128,-bounds.size.y*0.5),Vector3(bounds.size.x,256,bounds.size.y))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func mark(key: Vector2i, detailed: bool) -> void:
	ready_tiles.set_pixel(key.x,key.y,Color.WHITE if detailed else Color.BLACK)


func upload() -> void:
	ready_texture.update(ready_tiles)


static func _fill_road(image: Image, world: PackedVector2Array, origin: Vector2, scale: Vector2) -> void:
	var points := PackedVector2Array()
	for p in world:
		points.append((p-origin)*scale)
	var bounds := GROUND.bounds_of(points)
	var first := maxi(0,floori(bounds.position.y))
	var last := mini(image.get_height()-1,ceili(bounds.end.y))
	for row in range(first,last+1):
		var y := row+0.5
		var left := INF
		var right := -INF
		for i in points.size():
			var a := points[i-1]
			var b := points[i]
			if (a.y > y) == (b.y > y):
				continue
			var x := lerpf(a.x,b.x,(y-a.y)/(b.y-a.y))
			left = minf(left,x)
			right = maxf(right,x)
		if right >= left:
			var x0 := clampi(floori(left),0,image.get_width()-1)
			var x1 := clampi(ceili(right),x0+1,image.get_width())
			image.fill_rect(Rect2i(x0,row,x1-x0,1),Color.WHITE)
