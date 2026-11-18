extends RefCounted

# The five exported Quaternius people use the same 62 named joints. Apply the
# rotation around the model's lateral axis, keeping each bound joint's own rest axes.
var skeleton: Skeleton3D
var joints := {}
var rests := {}
var axes := {}

func setup(model: Node3D) -> void:
	skeleton = model.find_children("*","Skeleton3D",true,false)[0]
	for joint in [9,10,32,33,54,55,56,57]:
		var bone := skeleton.find_bone("Joint_%d"%joint)
		if bone < 0:
			continue
		var parent := skeleton.get_bone_parent(bone)
		var frame := skeleton.get_bone_global_rest(parent).basis.orthonormalized()
		joints[joint] = bone
		rests[joint] = skeleton.get_bone_pose_rotation(bone)
		axes[joint] = (frame.inverse()*Vector3.RIGHT).normalized()

func sit(amount: float, wave := 0.0) -> void:
	for joint: int in joints:
		var angle := 0.0
		match joint:
			54,56: angle = -1.45
			55,57: angle = 1.4
			9,32: angle = -0.55
			10,33: angle = -0.28
		if joint == 32:
			angle += wave
		skeleton.set_bone_pose_rotation(joints[joint],Quaternion(axes[joint],angle*amount)*rests[joint])
