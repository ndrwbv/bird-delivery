"""Зимняя одежда для моделей Quaternius — в Blender без окна:
  blender -b -P clothes.py -- in.glb out.glb [preview.png]
Из тела модели (длинный рукав) — пуховик: без кистей и головы, раздут по нормалям, подол вниз до середины бедра,
воротник вверх, стёжка полосами; из ступней — сапоги с голенищем до середины икры; шапки — вязаная с помпоном и
ушанка с ушами, на кости головы. Всё — на тех же костях (группы вершин от тела), в out.glb: Coat_Body, Boots_Feet,
Beanie_HatB, Ushanka_HatU + арматура."""
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = a[0], a[1]
PNG = a[2] if len(a) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
pick = lambda *suf: next(o for n, o in mesh.items() if any(n.endswith(s) for s in suf))
BODY, FEET, HEAD = pick('Body'), pick('Feet'), pick('Head')

def mat (name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = (*rgb, 1)
    m.diffuse_color = (*rgb, 1)
    return m

def clone (o, name):
    c = o.copy(); c.data = o.data.copy(); c.name = name; c.data.name = name
    bpy.context.collection.objects.link(c)
    return c

def wscale (o): return o.matrix_world.to_scale()[0]
def to_local (o, v): return o.matrix_world.inverted().to_3x3() @ v   # мировой сдвиг → в осях меша
def top_group (o, v):
    best = (0, None)
    for g in v.groups:
        if g.weight > best[0]: best = (g.weight, o.vertex_groups[g.group].name)
    return best[1] or ''

HAND = ('Fist', 'Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky', 'Finger')
DROP = HAND + ('Head',)   # шею не вырезаем — раздутая, она и есть горло куртки (вырезанная оставляла дыры у плеч)

# ── пуховик из тела ──
coat = clone(BODY, 'Coat_Body')
me = coat.data
drop = {v.index for v in me.vertices if top_group(coat, v).startswith(DROP)}
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context='VERTS')
# сшить разрезанные по граням вершины (плоская модель) — иначе при раздувании грани разойдутся трещинами
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002 / wscale(coat))
# туловище — сгладить (грудь, талия, пресс не проступают: куртка сидит мешком, а не по голому телу)
dl = bm.verts.layers.deform.active
TORSO = ('Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Body', 'Shoulder')
def gname (v):
    it = list(v[dl].items()) if dl else []
    return coat.vertex_groups[max(it, key=lambda kv: kv[1])[0]].name if it else ''
tv = [v for v in bm.verts if gname(v).startswith(TORSO)]
for _ in range(10): bmesh.ops.smooth_vert(bm, verts=tv, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
# раздуть по нормалям: туловище — 5 см, рукава — 3,5 см
bm.normal_update()
k = 1 / wscale(coat)
for v in bm.verts: v.co += v.normal * (0.05 if v in tv else 0.035) * k
M = coat.matrix_world
wz = lambda v: (M @ v.co).z
# края: подол — нижняя петля, воротник — верхняя у шеи (не рукава: у тех x далеко от середины)
bnd = [e for e in bm.edges if e.is_boundary]
cx = sum((M @ v.co).x for v in bm.verts) / len(bm.verts)
mid = [e for e in bnd if all(abs((M @ v.co).x - cx) < 0.2 for v in e.verts)]
zs = sorted(wz(v) for e in mid for v in e.verts) or [0.0]
lo_z = zs[0]
hem = [e for e in mid if all(wz(v) < lo_z + 0.06 for v in e.verts)]   # нет открытого низа (тело закрыто) — без подола
def extrude (edges, dz, grow):
    r = bmesh.ops.extrude_edge_only(bm, edges=edges)
    nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    c = sum((M @ v.co for v in nv), Vector()) / max(1, len(nv))
    for v in nv:
        w = M @ v.co
        w = Vector((c.x + (w.x - c.x) * grow, c.y + (w.y - c.y) * grow, w.z + dz))
        v.co = M.inverted() @ w
    return nv
hemv = extrude(hem, -0.13, 1.05) if hem else []
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # все грани — наружу (вывернутые в игре не видны — дыры)
bm.to_mesh(me); bm.free()
# одна краска (стёжка тёмными гранями выглядела дырами)
me.materials.clear()
me.materials.append(mat('Coat', (0.25, 0.3, 0.35)))
for p in me.polygons: p.material_index = 0

# ── сапоги из ступней: голенище вверх до середины икры, на кости голени ──
boot = clone(FEET, 'Boots_Feet')
me = boot.data; M = boot.matrix_world
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002 / wscale(boot)); bm.normal_update()
t = 0.012 / wscale(boot)
for v in bm.verts: v.co += v.normal * t
bnd = [e for e in bm.edges if e.is_boundary]
if bnd:                                             # открытый верх (щиколотка) — вытянуть край
    zt = max((M @ v.co).z for e in bnd for v in e.verts)
    top = [e for e in bnd if all((M @ v.co).z > zt - 0.05 for v in e.verts)]
    r = bmesh.ops.extrude_edge_only(bm, edges=top)
else:                                               # закрытая обувь — вытянуть верхние грани
    zt = max((M @ v.co).z for v in bm.verts)
    top = [f for f in bm.faces if all((M @ v.co).z > zt - 0.03 for v in f.verts)]
    r = bmesh.ops.extrude_face_region(bm, geom=top)
shaft = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for v in shaft:
    w = M @ v.co; v.co = M.inverted() @ Vector((w.x, w.y, w.z + 0.16))
ids = [v.index for v in shaft]
bm.to_mesh(me); bm.free()
for side in ('L', 'R'):
    g = boot.vertex_groups.get('LowerLeg.' + side) or boot.vertex_groups.new(name='LowerLeg.' + side)
shaft_set = set(ids)
for v in boot.data.vertices:
    if v.index not in shaft_set: continue
    side = 'L' if (M @ v.co).x > 0 else 'R'
    for gg in list(v.groups): boot.vertex_groups[gg.group].remove([v.index])
    boot.vertex_groups['LowerLeg.' + side].add([v.index], 1.0, 'REPLACE')
boot.data.materials.clear(); boot.data.materials.append(mat('Boots', (0.03, 0.025, 0.02)))

# ── шапки: по черепу (кожа головы), на кость головы ──
HM = HEAD.matrix_world
skin_i = [i for i, m in enumerate(HEAD.data.materials) if m and 'skin' in m.name.lower()]
pts = [HM @ HEAD.data.vertices[i].co for p in HEAD.data.polygons if p.material_index in skin_i for i in p.vertices]
if not pts: pts = [HM @ v.co for v in HEAD.data.vertices]
xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
C = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2 + 0.01, max(zs)))
W = max(max(xs) - min(xs), max(ys) - min(ys))
def hat_obj (name, build, mats):
    bm = bmesh.new(); build(bm)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    o.vertex_groups.new(name='Head').add([v.index for v in me.vertices], 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = arm
    return o
def sphere (bm, c, r, sx=1, sy=1, sz=1, seg=10, ring=6, cut=None, mi=0):
    g = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=r)
    vs = g['verts']
    for v in vs: v.co = Vector((c.x + v.co.x * sx, c.y + v.co.y * sy, c.z + v.co.z * sz))
    if cut is not None: bmesh.ops.delete(bm, geom=[v for v in vs if v.co.z < cut - 1e-4], context='VERTS')
    for f in bm.faces:
        if any(v in vs for v in f.verts): f.material_index = mi
def box (bm, c, s, mi=0):
    g = bmesh.ops.create_cube(bm, size=1)
    for v in g['verts']: v.co = Vector((c.x + v.co.x * s.x, c.y + v.co.y * s.y, c.z + v.co.z * s.z))
    for f in bm.faces:
        if all(v in g['verts'] for v in f.verts): f.material_index = mi
R = W * 0.58
def beanie (bm):
    sphere(bm, C - Vector((0, 0, W * 0.18)), R, sz=0.95, cut=C.z - W * 0.18, mi=0)
    sphere(bm, C - Vector((0, 0, W * 0.2)), R * 1.04, sz=0.25, seg=10, ring=4, mi=1)             # отворот
    sphere(bm, C + Vector((0, 0, R * 0.8)), R * 0.3, seg=8, ring=5, mi=1)                         # помпон
def ushanka (bm):
    sphere(bm, C - Vector((0, 0, W * 0.15)), R * 1.08, sz=0.85, cut=C.z - W * 0.15, mi=0)
    sphere(bm, C - Vector((0, 0, W * 0.16)), R * 1.14, sz=0.3, seg=10, ring=4, mi=0)
    for s in (-1, 1): box(bm, C + Vector((s * R * 1.0, 0, -W * 0.45)), Vector((W * 0.12, W * 0.42, W * 0.42)), mi=0)
    box(bm, C + Vector((0, -R * 0.95, -W * 0.08)), Vector((W * 0.9, W * 0.1, W * 0.2)), mi=1)    # отворот спереди (−y — лицо)
fur, fur2 = mat('Fur', (0.2, 0.14, 0.09)), mat('Fur_Dark', (0.12, 0.08, 0.05))
knit, knit2 = mat('Hat', (0.5, 0.05, 0.08)), mat('Hat_Trim', (0.85, 0.85, 0.8))
hb = hat_obj('Beanie_HatB', beanie, [knit, knit2])
hu = hat_obj('Ushanka_HatU', ushanka, [fur, fur2])

# ── в файл: арматура и новая одежда ──
for o in bpy.data.objects: o.select_set(o in (arm, coat, boot, hb, hu))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True)
print('ok', OUT, 'coat', len(coat.data.vertices), 'boots', len(boot.data.vertices), 'hats', len(hb.data.vertices), len(hu.data.vertices), 'W', round(W, 3))

if PNG:   # картинка для проверки: одежда на теле с головой, вид спереди-сбоку
    for o in bpy.data.objects: o.hide_render = o.type == 'MESH' and o not in (coat, boot, hu, HEAD, pick('Legs', 'Pants'))
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.resolution_x = 480; sc.render.resolution_y = 640
    sc.display.shading.color_type = 'MATERIAL'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
    sc.display.shading.show_backface_culling = True
    sc.camera = cam
    for i, (loc, rz) in enumerate((((1.6, -3.2, 1.3), 27), ((-1.6, 3.2, 1.3), 207))):
        cam.location = loc; cam.rotation_euler = (math.radians(84), 0, math.radians(rz))
        sc.render.filepath = PNG.replace('.png', '_%d.png' % i); bpy.ops.render.render(write_still=True)
