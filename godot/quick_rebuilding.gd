extends RefCounted

# The fourth level from hellafter.js uses the local building footprint.
# Per-material MultiMeshes keep a tower with many rails and poles to four draws.
var pieces := {"concrete":[],"wood":[],"steel":[],"brick":[]}

func build(host: Node3D, group: Node3D, house: Dictionary) -> void:
	var outline: PackedVector2Array = house.outline
	var start := float(house.base)
	var cut := float(house.cut)-start
	var top := minf(float(house.height)-.5,cut+7.1)
	if top<=cut:
		return
	var longest := Vector2.RIGHT
	for i in outline.size():
		var a := outline[i]
		var b := outline[(i+1)%outline.size()]
		if a.distance_squared_to(b)>longest.length_squared():
			longest = b-a
		var edge := b-a
		var length := edge.length()
		if length<.6:
			continue
		var n := maxi(1,ceili(length/4.8))
		var direction := edge.normalized()
		var yaw := -atan2(direction.y,direction.x)
		var mid := (a+b)*.5
		var center: Vector2 = house.p
		var out := (mid-center).normalized()
		var floor_ := cut+.22
		while floor_<top:
			var wall := minf(2.8,top-floor_)
			for j in n:
				var at := a.lerp(b,float(j)/n)
				_part("concrete",at,start+floor_+wall*.5,Vector3(.30,wall,.35),yaw)
				if (j+roundi(floor_))%3!=0:
					var w := length/n
					_part("brick",at+direction*w*.5,start+floor_+minf(.65,wall*.5),Vector3(w*.8,minf(wall,1.15),.24),yaw)
			_part("concrete",mid,start+floor_,Vector3(length,.24,.65),yaw)
			floor_ += 3.05
		var scaffold := 1.8
		while scaffold<top:
			_part("wood",mid+out*.85,start+scaffold,Vector3(length,.08,.12),yaw)
			_part("concrete",mid+out*.85,start+scaffold-.12,Vector3(length,.08,.70),yaw)
			scaffold += 2.9
		_part("steel",a.lerp(b,.31)+out*.9,start+cut+2.3,Vector3(length*.33,3.7,.04),yaw)
	var forward := longest.normalized()
	var axis_side := forward.orthogonal()
	var min_x := INF
	var max_x := -INF
	for point in outline:
		var x := (point-Vector2(house.p)).dot(forward)
		min_x = minf(min_x,x)
		max_x = maxf(max_x,x)
	var half := maxf(1,(max_x-min_x)*.5)
	var pivot: Vector2 = house.p+forward*(half*.39)
	var h := top+7
	var boom := minf(36,half*2.25)
	var yaw := -atan2(forward.y,forward.x)
	for x: float in [-.32,.32]:
		for z: float in [-.32,.32]:
			_part("wood",pivot+forward*x+axis_side*z,start+h*.5,Vector3(.11,h,.11),yaw)
	var level := 1.
	while level<h:
		_part("wood",pivot,start+level,Vector3(.82,.09,.82),yaw)
		level+=1.3
	var mast := pivot-forward*boom*.18
	_part("wood",mast,start+h-.1,Vector3(boom,.18,.7),yaw)
	_part("wood",mast,start+h+.65,Vector3(boom,.10,.10),yaw)
	for j in ceili(boom*.5):
		_part("wood",pivot+forward*(-boom*.68+j*2),start+h+.28,Vector3(.07,2.1,.07),yaw,1.19 if j%2 else -1.19)
	_part("steel",pivot+forward*.7,start+h-.8,Vector3(1.2,1.1,.95),yaw)
	_part("concrete",pivot+forward*boom*.25,start+h-.4,Vector3(1.6,.65,.9),yaw)
	_part("wood",pivot-forward*boom*.63,start+h-2.8,Vector3(.045,5,.045),yaw)
	_part("concrete",pivot-forward*boom*.63,start+h-5.5,Vector3(1.4,.2,.8),yaw)
	for medium: String in pieces:
		var transforms: Array[Transform3D] = []
		transforms.assign(pieces[medium])
		host._batch(group,transforms,medium)

func _part(key: String, at: Vector2, y: float, size: Vector3, yaw: float, rake := 0.0) -> void:
	var basis := Basis(Vector3.UP,yaw)*Basis(Vector3.BACK,rake)
	pieces[key].append(Transform3D(basis.scaled_local(size),Vector3(at.x,y,at.y)))
