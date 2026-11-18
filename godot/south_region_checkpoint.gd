extends Node3D

const GROUND := preload("res://south_region_ground.gd")
const CUBE_FACES := [
	0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,4,7, 0,7,3,
	1,2,6, 1,6,5, 0,1,5, 0,5,4, 3,7,6, 3,6,2
]

var axis: Vector3
var side: Vector3
var mesh := SurfaceTool.new()
var body := StaticBody3D.new()


# Dimensions, offsets and colours from buildKpp() in src/game/citybits.js.
func setup(gate: Dictionary, ground: GROUND, material: Material) -> void:
	var p := Vector2(gate.at[0],gate.at[1])
	var direction := Vector2(gate.axis[0],gate.axis[1]).normalized()
	var width := float(gate.width)
	axis = Vector3(direction.x,0,direction.y)
	side = Vector3(-direction.y,0,direction.x)
	var center := Vector3(p.x,ground.at(p.x,p.y),p.y)
	var booth := center + side*(width*0.5+2.4)
	booth.y = ground.at(booth.x,booth.z)
	var hinge := center + side*(width*0.5+0.6)
	hinge.y = ground.at(hinge.x,hinge.z)
	body.collision_layer = 1
	body.collision_mask = 0
	add_child(body)
	mesh.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(booth+Vector3.UP*1.35,Vector3(3.2,2.7,3.2),"e6e1d5")
	_box(booth+Vector3.UP*2.85,Vector3(4.2,0.25,4.2),"5b6470")
	_box(booth+Vector3.UP*0.18,Vector3(3.3,0.35,3.3),"3f7a4a")
	_solid(booth+Vector3.UP*1.35,Vector3(3.2,2.7,3.2))
	_box(booth-side*1.61+Vector3.UP*1.7,Vector3(0.045,1.1,2.2),"8fb0cc")
	for facing: float in [-1.0,1.0]:
		_box(booth+axis*1.61*facing+Vector3.UP*1.7,Vector3(2.2,1.1,0.045),"8fb0cc")
	var sign := booth-side*1.7+Vector3.UP*3.7
	_box(sign,Vector3(0.10,1.3,3.4),"1f4f9a")
	_box(sign-Vector3.UP*0.6,Vector3(0.14,1.2,0.14),"585460")
	var lettering := Label3D.new()
	lettering.text = tr("КПП")+"\n"+tr("проезд по пропускам")
	lettering.font_size = 27
	lettering.pixel_size = 0.010
	lettering.outline_size = 2
	lettering.position = sign-side*0.057
	lettering.rotation.y = atan2(-side.x,-side.z)
	lettering.visibility_range_end = 105.0
	add_child(lettering)
	_box(hinge+Vector3.UP*0.65,Vector3(0.4,1.3,0.4),"d8d3c8")
	var stripes := ceili(width/1.2)
	for i in stripes:
		var span := width/stripes
		var stripe := hinge-side*(float(i)+0.5)*span+Vector3.UP*1.1
		_box(stripe,Vector3(span,0.16,0.16),"f2eee6" if i%2 else "d9342c")
	var offset := -width*0.5+1.2
	while offset < width*0.5:
		_box(center+side*offset+axis*3.5+Vector3.UP*0.4,Vector3(0.9,0.8,2.2),"bdb6ab")
		offset += 2.6
	_solid(center+axis*1.5+Vector3.UP*0.75,Vector3(width+1.6,1.5,4.8))
	_box(booth+axis*2.5+Vector3.UP*3.0,Vector3(0.2,6.0,0.2),"585460")
	_box(booth+axis*2.5-side*0.4+Vector3.UP*6.0,Vector3(0.8,0.3,0.5),"fff3c4")
	var structure := MeshInstance3D.new()
	structure.mesh = mesh.commit()
	structure.material_override = material
	structure.visibility_range_end = 760.0
	add_child(structure)


func _box(center: Vector3, size: Vector3, hex: String) -> void:
	var vertices := PackedVector3Array()
	for z: float in [-0.5,0.5]:
		for corner: Vector2 in [Vector2(-0.5,-0.5),Vector2(0.5,-0.5),Vector2(0.5,0.5),Vector2(-0.5,0.5)]:
			vertices.append(center+side*corner.x*size.x+Vector3.UP*corner.y*size.y+axis*z*size.z)
	var color := Color(hex).srgb_to_linear()
	for i: int in CUBE_FACES:
		mesh.set_color(color)
		mesh.set_uv2(Vector2(9,0))
		mesh.add_vertex(vertices[i])


func _solid(center: Vector3, size: Vector3) -> void:
	var shape := BoxShape3D.new()
	shape.size = size
	var obstacle := CollisionShape3D.new()
	obstacle.shape = shape
	obstacle.position = center
	obstacle.rotation.y = atan2(axis.x,axis.z)
	body.add_child(obstacle)
