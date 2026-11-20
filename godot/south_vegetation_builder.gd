extends RefCounted

const CATALOG := preload("res://south_planting_catalog.gd")
const TINTS := [
	Color(1.0,1.08,.84), Color(.83,1.03,.78), Color(1.16,1.10,.73),
	Color(.78,.97,1.09), Color(1.05,.86,.73), Color.WHITE, Color.WHITE,
]
const BROAD := 0
const CONIFER := 1
const DEAD := 2
const SHRUB := 3
const GRASS := 4
const STONE := 5
const LEAF := 6
const NEEDLE := 7
const BAND_FAR := 0
const BAND_NEAR := 1
const INSTANCE_FLOATS := 20
const FAR_FACTOR := 2

var planting: CATALOG
var result := {}


func prepare(key: Vector2i, band: int) -> void:
	var far := band == BAND_FAR
	var factor := FAR_FACTOR if far else 1
	var center := tile_center(key,factor)
	var buffers: Array[Array] = []
	for _i in (3 if far else 8):
		buffers.append([])
	var low := INF
	var high := -INF
	var bytes := planting.bytes
	for dz in factor:
		for dx in factor:
			var source := key*factor+Vector2i(dx,dz)
			if not planting.tiles.has(source):
				continue
			var rows: Vector3i = planting.tiles[source]
			var corner := Vector2(source)*CATALOG.TILE-center
			var end := rows.y if far else rows.z
			for row in range(rows.x,end,CATALOG.PLANT_BYTES):
				var kind := int(bytes[row+7])
				var tree := row < rows.y
				var anchor := bytes[row+10] != 0
				if far and not anchor:
					continue
				var at := Vector3(bytes.decode_u16(row)*.01+corner.x,bytes.decode_s16(row+2)*.01,
					bytes.decode_u16(row+4)*.01+corner.y)
				low = minf(low,at.y)
				high = maxf(high,at.y)
				var size := float(bytes[row+6])*.01
				var yaw := float(bytes[row+8])*TAU/256.0
				var rotation := Basis(Vector3.UP,yaw)
				if not tree:
					var layer := SHRUB+kind-CATALOG.SHRUB
					if layer == STONE:
						at.y += .08
					_append(buffers,layer,Transform3D(rotation.scaled(Vector3.ONE*size),at),Color.WHITE,1.0)
					continue
				var width := float(bytes[row+11])/80.0
				var pose := Transform3D(rotation.scaled(Vector3(width,size,width)),at)
				var stem := float(bytes[row+9])*.01/maxf(.08,.30*width)
				var layer := BROAD
				var tint: Color = TINTS[mini(kind,6)]
				if kind == CATALOG.SPRUCE:
					layer = CONIFER
				elif kind == CATALOG.DRY:
					layer = DEAD
				if far or not anchor:
					_append(buffers,layer,pose,tint,stem)
				# Only detail supported by the same canopy backbone is added nearby.
				if not far and layer != DEAD:
					_append(buffers,LEAF+layer,pose,tint,stem)
	var bounds := AABB()
	if is_finite(low):
		var extent := CATALOG.TILE*factor*.5+19.0
		bounds = AABB(Vector3(-extent,low-.60,-extent),Vector3(extent*2,high-low+29.0,extent*2))
	var packed: Array[PackedFloat32Array] = []
	for buffer in buffers:
		packed.append(PackedFloat32Array(buffer))
	result = {"center":center,"buffers":packed,"bounds":bounds}


static func tile_center(key: Vector2i,factor: int) -> Vector2:
	return (Vector2(key)+Vector2(.5,.5))*CATALOG.TILE*factor


static func _append(buffers: Array[Array], layer: int, pose: Transform3D, tint: Color, stem: float) -> void:
	var a := pose.basis.x
	var b := pose.basis.y
	var c := pose.basis.z
	var p := pose.origin
	buffers[layer].append_array([a.x,b.x,c.x,p.x,a.y,b.y,c.y,p.y,a.z,b.z,c.z,p.z,
		tint.r,tint.g,tint.b,1.0,stem,0.0,0.0,0.0])
