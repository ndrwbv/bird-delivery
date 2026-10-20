"""glb (Quaternius, со скелетом) → компактная модель для игры: вершины в позе покоя (оси модели, Y вверх),
номер краски на вершину, 4 кости и веса, кости — имя, родитель, положение и поворот в покое.
python3 glb2q.py out.js name=file.glb ...  → JS-модуль: export const QDATA = { name: base64, ... }
Формат base64 (little-endian):
  u32 nJ, u32 nV, u32 nI, u32 nPal
  nPal × (u8 len, utf8 name, 3×f32 rgb)
  nJ × (u8 len, utf8 name, i16 parent, 3×f32 pos, 4×f32 quat)
  6×f32 bbox min/max
  nV × 3×i16 pos (квантовано по bbox)
  nV × u8 краска
  nV × 4×u8 кости
  nV × 4×u8 веса (сумма 255)
  nI × u16 (или u32, если nV > 65535) индексы
"""
import sys, json, struct, base64
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    o = 20 + n
    bn = struct.unpack('<I', b[o:o + 4])[0]
    binc = b[o + 8:o + 8 + bn]
    return j, binc

def acc(j, binc, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or dt.itemsize * nc
    cnt = a['count']
    raw = np.frombuffer(binc, dtype=np.uint8, count=stride * (cnt - 1) + dt.itemsize * nc, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(cnt, dt.itemsize * nc), strides=(stride, 1)).copy()
    arr = out.view(dt).reshape(cnt, nc)
    if a.get('normalized'):
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr

def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def local(nd):
    if 'matrix' in nd: return np.array(nd['matrix']).reshape(4, 4).T
    M = np.eye(4)
    R = qmat(nd.get('rotation', [0, 0, 0, 1])); S = np.diag(nd.get('scale', [1, 1, 1]))
    M[:3, :3] = R @ S; M[:3, 3] = nd.get('translation', [0, 0, 0])
    return M

def mat2quat(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2; w = .25 * s; x = (R[2, 1] - R[1, 2]) / s; y = (R[0, 2] - R[2, 0]) / s; z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; w = (R[2, 1] - R[1, 2]) / s; x = .25 * s; y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; w = (R[0, 2] - R[2, 0]) / s; x = (R[0, 1] + R[1, 0]) / s; y = .25 * s; z = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; w = (R[1, 0] - R[0, 1]) / s; x = (R[0, 2] + R[2, 0]) / s; y = (R[1, 2] + R[2, 1]) / s; z = .25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)

def convert(path):
    j, binc = load(path)
    nodes = j['nodes']
    par = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []): par[c] = i
    G = {}
    def glob(i):
        if i in G: return G[i]
        M = local(nodes[i])
        if i in par: M = glob(par[i]) @ M
        G[i] = M; return M
    skin = j['skins'][0]
    joints = list(skin['joints'])
    # все скины в файле — с одним и тем же списком костей (у Quaternius так); иначе — переложим по узлам
    jset = {n: k for k, n in enumerate(joints)}
    jw = [glob(n) for n in joints]
    # кости: положение и поворот в осях модели, без масштаба (у арматуры ×100 — вершины считаем полными матрицами)
    JP = []; JQ = []; JPar = []
    for k, n in enumerate(joints):
        M = jw[k]; R = M[:3, :3]
        sc = np.linalg.norm(R, axis=0)
        JP.append(M[:3, 3]); JQ.append(mat2quat(R / sc));
        p = par.get(n); JPar.append(jset[p] if p in jset else -1)
    pal = []; palI = {}
    def pidx(mi):
        m = j['materials'][mi] if mi is not None else {'name': 'none'}
        name = m.get('name', 'm%d' % mi)
        if name not in palI:
            palI[name] = len(pal)
            pal.append((name, m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [.8, .8, .8, 1])[:3]))
        return palI[name]
    P = []; C = []; SI = []; SW = []; IDX = []; v0 = 0
    for ni, nd in enumerate(nodes):
        if 'mesh' not in nd: continue
        sk = j['skins'][nd['skin']] if 'skin' in nd else None
        remap = np.array([jset[n] for n in sk['joints']]) if sk else None
        ibm = acc(j, binc, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1) if sk else None
        for pr in j['meshes'][nd['mesh']]['primitives']:
            A = pr['attributes']
            pos = acc(j, binc, A['POSITION']).astype(np.float64)
            n = len(pos)
            if sk:
                ji = acc(j, binc, A['JOINTS_0']).astype(np.int64); wi = acc(j, binc, A['WEIGHTS_0']).astype(np.float64)
                wi = wi / np.maximum(wi.sum(1, keepdims=True), 1e-9)
                JM = np.array([glob(sk['joints'][k]) @ ibm[k] for k in range(len(sk['joints']))])
                ph = np.c_[pos, np.ones(n)]
                out = np.zeros((n, 3))
                for c in range(4):
                    Mi = JM[ji[:, c]]
                    out += wi[:, c:c + 1] * np.einsum('nij,nj->ni', Mi, ph)[:, :3]
                pos = out
                SI.append(remap[ji]); SW.append(wi)
            else:
                M = glob(ni); pos = (np.c_[pos, np.ones(n)] @ M.T)[:, :3]
                SI.append(np.zeros((n, 4), np.int64)); SW.append(np.tile([1, 0, 0, 0], (n, 1)))
            P.append(pos); C.append(np.full(n, pidx(pr.get('material'))))
            ind = acc(j, binc, pr['indices']).reshape(-1) if 'indices' in pr else np.arange(n)
            IDX.append(ind.astype(np.int64) + v0); v0 += n
    P = np.concatenate(P); C = np.concatenate(C); SI = np.concatenate(SI); SW = np.concatenate(SW); IDX = np.concatenate(IDX)
    # вершины без веса на кость (веса ≈0) → кость с наибольшим весом; веса в u8 с суммой 255
    W8 = np.floor(SW * 255).astype(np.int64)
    W8[np.arange(len(W8)), SW.argmax(1)] += 255 - W8.sum(1)
    mn = P.min(0); mx = P.max(0); span = np.maximum(mx - mn, 1e-9)
    Q = np.round((P - mn) / span * 65535 - 32768).astype(np.int16)
    b = bytearray()
    b += struct.pack('<4I', len(joints), len(P), len(IDX), len(pal))
    for name, rgb in pal:
        e = name.encode(); b += struct.pack('<B', len(e)) + e + struct.pack('<3f', *rgb)
    for k, nidx in enumerate(joints):
        e = nodes[nidx].get('name', 'j%d' % k).encode()
        b += struct.pack('<B', len(e)) + e + struct.pack('<h', JPar[k]) + struct.pack('<3f', *JP[k]) + struct.pack('<4f', *JQ[k])
    b += struct.pack('<6f', *mn, *mx)
    b += Q.astype('<i2').tobytes()
    b += C.astype(np.uint8).tobytes()
    b += SI.astype(np.uint8).tobytes()
    b += W8.astype(np.uint8).tobytes()
    b += IDX.astype('<u2' if len(P) <= 65535 else '<u4').tobytes()
    # куда смотрит лицо: глаза впереди центра головы по z
    eye = [i for i, (nm, _) in enumerate(pal) if nm.lower().startswith('eye')]
    face = None
    if eye:
        ev = P[np.isin(C, [i for i, (nm, _) in enumerate(pal) if nm.lower() in ('eye', 'eyes')])]
        if len(ev): face = (ev.mean(0) - P[P[:, 1] > mx[1] - 0.25 * span[1]].mean(0)).round(3).tolist()
    info = dict(joints=len(joints), verts=len(P), tris=len(IDX) // 3, h=round(float(span[1]), 3), min=mn.round(3).tolist(), max=mx.round(3).tolist(), face=face, bytes=len(b), pal=[p[0] for p in pal])
    return base64.b64encode(bytes(b)).decode(), info

if __name__ == '__main__':
    out = sys.argv[1]
    parts = []
    for a in sys.argv[2:]:
        name, path = a.split('=', 1)
        s, info = convert(path)
        print(name, info)
        parts.append('  %s: \'%s\',' % (name, s))
    open(out, 'w').write('/* Люди Quaternius (CC0, quaternius.com, через poly.pizza) — сжатые модели для qpeople.js; собрано скриптом из .glb */\nexport const QDATA = {\n' + '\n'.join(parts) + '\n};\n')

