extends RefCounted

# The five exported Quaternius people use the same 62 named joints. Apply the
# rotation around the model's lateral axis, keeping each bound joint's own rest axes.
var skeleton: Skeleton3D
var joints := {}
var rests := {}
var axes := {}
var fore_axes := {}

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
		if joint==9 or joint==32: fore_axes[joint]=(frame.inverse()*Vector3.BACK).normalized()

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

func exercise(bar: bool, fraction: float) -> void:
	for joint: int in joints:
		var angle := 0.0
		match joint:
			9,32: angle = -2.95+fraction*.48 if bar else .12+.75*(1.0-fraction)
			10,33: angle = -.12-fraction*.96 if bar else -.24-.88*(1.0-fraction)
			54,56: angle = .25+.1*fraction if bar else .23
			55,57: angle = .12 if bar else .9
		skeleton.set_bone_pose_rotation(joints[joint],Quaternion(axes[joint],angle)*rests[joint])

func fly(kite: bool, flutter: float) -> void:
	for joint: int in [9,10,32,33]:
		if not joints.has(joint): continue
		var angle := -.88
		if kite:
			angle = -1.9+flutter if joint==32 else -.4
		if joint==10 or joint==33:
			angle = -.25 if kite else -.6
		skeleton.set_bone_pose_rotation(joints[joint],Quaternion(axes[joint],angle)*rests[joint])

func gesture(item: String,phase: float) -> void:
	var lift:=.5+.5*sin(phase*1.5)
	var shoulder:=-.35-lift*.25
	var elbow:=-.4-lift*1.0
	if item=="fan":
		shoulder=-.65
		elbow=-.75+.4*sin(phase*5.0)
	elif item=="phone":
		shoulder=-1.0
		elbow=-1.45
	for joint: int in [32,33]:
		if joints.has(joint):
			skeleton.set_bone_pose_rotation(joints[joint],Quaternion(axes[joint],shoulder if joint==32 else elbow)*rests[joint])

func hold_hand(right: bool,phase: float) -> void:
	var joint:=32 if right else 9
	if not joints.has(joint):return
	var bind:int=joints[joint]
	var grasp:=Quaternion(fore_axes[joint],-.42 if right else .42)
	skeleton.set_bone_pose_rotation(bind,grasp*Quaternion(axes[joint],-.12+.10*sin(phase*6.5))*rests[joint])

func tennis(swing:float,stride:float) -> void:
	for joint:int in joints:
		var angle:=0.0
		match joint:
			9:angle=-.35
			32:angle=-.55 if swing<0 else -.4-sin(swing*PI)*1.7
			33:angle=-.25
			54:angle=stride
			56:angle=-stride
		var rotation_:=Quaternion(axes[joint],angle)
		if joint==32:rotation_=Quaternion(fore_axes[joint],.25 if swing<0 else .6-1.2*swing)*rotation_
		skeleton.set_bone_pose_rotation(joints[joint],rotation_*rests[joint])

func chauffeur(watch:bool) -> void:
	for joint:int in [9,10,32,33]:
		if not joints.has(joint):continue
		var angle:=-1.5 if watch and joint==9 else (.35 if joint in [9,32] else -.2)
		var rotation_:=Quaternion(axes[joint],angle)
		if joint==9:rotation_=Quaternion(fore_axes[joint],.5 if watch else .12)*rotation_
		skeleton.set_bone_pose_rotation(joints[joint],rotation_*rests[joint])
