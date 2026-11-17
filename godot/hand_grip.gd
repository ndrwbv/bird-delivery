extends Node3D

const JOINTS := "res://assets/actor-hands.json"

var skeleton: Skeleton3D
var left := -1
var right := -1
var cash := Node3D.new()
var single_hand := false
var left_offset := Vector3.ZERO


func setup(actor: Node3D) -> void:
	skeleton = actor.find_children("*","Skeleton3D",true,false)[0]
	var hands: Array = JSON.parse_string(FileAccess.get_file_as_string(JOINTS))
	left = skeleton.find_bone(hands[0])
	right = skeleton.find_bone(hands[1])
	add_child(cash)
	skeleton.skeleton_updated.connect(update_pose)
	update_pose()


func support_on_left(enabled: bool) -> void:
	if enabled and not single_hand:
		left_offset = position-_wrist(left)
	single_hand = enabled
	update_pose()


func update_pose() -> void:
	var a := _wrist(left)
	var b := _wrist(right)
	position = a+left_offset if single_hand else (a+b)*0.5+Vector3(0.0,0.042,0.055)
	cash.position = b-position+Vector3(0.012,0.018,0.020)


func _wrist(index: int) -> Vector3:
	return get_parent_node_3d().to_local(skeleton.to_global(skeleton.get_bone_global_pose(index).origin))
