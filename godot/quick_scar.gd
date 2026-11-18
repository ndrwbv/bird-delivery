extends RefCounted

# One set of triangles supplies both the visible surface and the wheel contacts.
const CELL := 2.0
var p := Vector2.ZERO
var kind := "crater"
var radius := 0.0
var center_y := 0.0
var border := PackedVector2Array()
var outer := PackedVector2Array()
var triangles := PackedVector3Array()
var bins := {}
var repaired := false
var open_scale := 1.0

func crater(center: Vector2, width: float, approach: Vector2, rng: RandomNumberGenerator, base: RefCounted) -> void:
	p = center
	kind = "crater"
	var shape := PackedVector2Array()
	var lifts := PackedVector2Array()
	for i in 23:
		var dir := Vector2.from_angle((i+rng.randf_range(-.18,.18))/23.0*TAU)
		shape.append(dir*width*rng.randf_range(.84,1.12))
		lifts.append(Vector2(rng.randf_range(.46,1.18),smoothstep(.80,.97,dir.dot(approach))))
	var rings: Array[PackedVector3Array] = []
	for data: Vector3 in [Vector3(1.20,.13,.07),Vector3(1,.72,.04),Vector3(.87,-.35,-.17),Vector3(.58,-.82,-.60),Vector3(.34,-1,-1)]:
		var ring := PackedVector3Array()
		for i in shape.size():
			var at := p+shape[i]*data.x
			var lift := lerpf(data.y,data.z,lifts[i].y)
			lift *= lifts[i].x if lift>0 else width*.52*(.83+.17*lifts[i].x)
			ring.append(Vector3(at.x,float(base.at(at.x,at.y))+lift,at.y))
		rings.append(ring)
	_build(rings,base)

func fissure(center: Vector2, angle: float, length: float, width: float, depth: float, rng: RandomNumberGenerator, base: RefCounted) -> void:
	p = center
	kind = "fissure"
	var dir := Vector2.from_angle(angle)
	var side := dir.orthogonal()
	var count := ceili(length/1.65)
	var strip := PackedVector2Array()
	var widths := PackedFloat32Array()
	var jitter := 0.
	for i in range(count+1):
		var t := float(i)/count
		jitter = jitter*.42+rng.randf_range(-.75,.75)
		strip.append(p+dir*((t-.5)*length)+side*jitter)
		widths.append(.055+width*pow(maxf(0.,sin(PI*t)),.76)*rng.randf_range(.54,1.14))
	var rings: Array[PackedVector3Array] = []
	for data: Vector3 in [Vector3(1,.39,.20),Vector3(1,0,.28),Vector3(.86,0,-.38),Vector3(.70,0,-.74),Vector3(.46,0,-1)]:
		var ring := PackedVector3Array()
		for sign_: int in [1,-1]:
			for j in strip.size():
				var i := j if sign_==1 else count-j
				var at := strip[i]+side*((widths[i]*data.x+data.y)*sign_)
				var y := data.z if data.z>0 else data.z*depth*minf(1,widths[i]/width)
				ring.append(Vector3(at.x,float(base.at(at.x,at.y))+y+(i%3-1)*widths[i]*.14,at.y))
		rings.append(ring)
	_build(rings,base)

func repair(center: Vector2, boundary: PackedVector2Array, base: RefCounted, original_kind: String) -> void:
	repaired = true
	kind = original_kind
	p = center
	var rings: Array[PackedVector3Array] = []
	for k: float in [1.04,1.,.86]:
		var ring := PackedVector3Array()
		for point in boundary:
			var at := p+(point-p)*k
			ring.append(_patch_point(at,base))
		rings.append(ring)
	_build(rings,base)

func _patch_point(at: Vector2, base: RefCounted) -> Vector3:
	return Vector3(at.x,float(base.at(at.x,at.y))+.065+sin(at.x*1.7+at.y*.9)*.012,at.y)

func _build(rings: Array[PackedVector3Array], base: RefCounted) -> void:
	center_y = base.at(p.x,p.y)
	for at in rings[0]:
		var point := Vector2(at.x,at.z)
		outer.append(point)
		radius = maxf(radius,point.distance_to(p))
	for at in rings[1]:
		border.append(Vector2(at.x,at.z))
	for band in range(1,rings.size()):
		var a := rings[band-1]
		var b := rings[band]
		for i in a.size():
			var j := (i+1)%a.size()
			_tri(a[i],a[j],b[i])
			_tri(a[j],b[j],b[i])
	var bottom: PackedVector3Array = rings.back()
	var poly := PackedVector2Array()
	for v in bottom:
		poly.append(Vector2(v.x,v.z))
	var indices := Geometry2D.triangulate_polygon(poly)
	for i in range(0,indices.size(),3):
		var a := bottom[indices[i]]
		var b := bottom[indices[i+1]]
		var c := bottom[indices[i+2]]
		if repaired:
			_patch_tri(a,b,c,base,0)
		else:
			_tri(a,b,c)

func _patch_tri(a: Vector3,b: Vector3,c: Vector3,base: RefCounted,level: int) -> void:
	if level>=4 or maxf(a.distance_squared_to(b),maxf(b.distance_squared_to(c),c.distance_squared_to(a)))<=5.76:
		_tri(a,b,c)
		return
	var ab := _patch_point(Vector2(a.x+b.x,a.z+b.z)*.5,base)
	var bc := _patch_point(Vector2(c.x+b.x,c.z+b.z)*.5,base)
	var ca := _patch_point(Vector2(a.x+c.x,a.z+c.z)*.5,base)
	_patch_tri(a,ab,ca,base,level+1)
	_patch_tri(ab,b,bc,base,level+1)
	_patch_tri(ca,bc,c,base,level+1)
	_patch_tri(ab,bc,ca,base,level+1)

func _tri(a: Vector3,b: Vector3,c: Vector3) -> void:
	if (b-a).cross(c-a).y>0:
		var swap := b
		b = c
		c = swap
	var id := triangles.size()
	triangles.append(a)
	triangles.append(b)
	triangles.append(c)
	if not repaired and kind!="crater":
		return
	var lo := Vector2i((Vector2(a.x,a.z).min(Vector2(b.x,b.z)).min(Vector2(c.x,c.z))/CELL).floor())
	var hi := Vector2i((Vector2(a.x,a.z).max(Vector2(b.x,b.z)).max(Vector2(c.x,c.z))/CELL).floor())
	for y in range(lo.y,hi.y+1):
		for x in range(lo.x,hi.x+1):
			var key := Vector2i(x,y)
			if not bins.has(key):
				bins[key]=[]
			bins[key].append(id)

func support(at: Vector2) -> float:
	if open_scale<.001:
		return -INF
	if open_scale<1.:
		at = p+(at-p)/open_scale
	var best := -INF
	for i: int in bins.get(Vector2i((at/CELL).floor()),[]):
		var a := triangles[i]
		var u := triangles[i+1]-a
		var v := triangles[i+2]-a
		var det := u.x*v.z-u.z*v.x
		if absf(det)<.000001:
			continue
		var delta := at-Vector2(a.x,a.z)
		var s := (delta.x*v.z-delta.y*v.x)/det
		var t := (u.x*delta.y-u.z*delta.x)/det
		if s>=-.0002 and t>=-.0002 and s+t<=1.0002:
			best = maxf(best,a.y+s*u.y+t*v.y)
	return lerpf(center_y,best,open_scale) if is_finite(best) else -INF

func mesh() -> ArrayMesh:
	var painter := SurfaceTool.new()
	painter.begin(Mesh.PRIMITIVE_TRIANGLES)
	for pt in triangles:
		painter.add_vertex(pt)
	painter.generate_normals()
	return painter.commit()

func history() -> Dictionary:
	var outline := []
	for point in outer:
		outline.append([snappedf(point.x,.001),snappedf(point.y,.001)])
	return {"kind":kind,"center":[p.x,p.y],"outer":outline}
