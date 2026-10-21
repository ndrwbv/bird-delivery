"""glb (Quaternius) → семейства моделей для qpeople.js.
python3 glb2q2.py out.js FAM:walkClip,runClip:name=file.glb,name=file.glb ...
Семейство — модели с одним скелетом: кости и анимации ходьбы/бега — с первой модели, части (голова, тело, ноги,
ступни) — у каждой своя. Формат base64 (little-endian):
  u32 nJ, nM, nC
  nJ × (str name, i16 parent, 3f pos, 4f quat)                        — покой, оси модели
  nC × (str name, u32 nF, f32 fps, f32 speed, nF×nJ×(4f quat, 3f pos))  — местные повороты/сдвиги костей по кадрам
  nM × (str name, u32 nP, nP × part)
  part: str type, u32 nV, nI, nPal, nPal×(str, 3f), 3f eye, 6f bbox, nV×3 i16 pos, nV u8 mat, nV×4 u8 si, nV×4 u8 sw, nI × u16|u32
"""
import sys, json, struct, base64
import numpy as np
sys.path.insert(0, sys.argv[0].rsplit('/', 1)[0])
from glb2q import load, acc, local, mat2quat, qmat

def S(s): e = s.encode(); return struct.pack('<B', len(e)) + e

def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])
def slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0: b = -b; d = -d
    if d > .9995: r = a + t * (b - a); return r / np.linalg.norm(r)
    th = np.arccos(d); return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / np.sin(th)

class Model:
    def __init__(self, path):
        self.j, self.bin = load(path); j = self.j
        self.nodes = j['nodes']; self.par = {}
        for i, nd in enumerate(self.nodes):
            for c in nd.get('children', []): self.par[c] = i
        self.G = {}
        self.joints = list(j['skins'][0]['joints']); self.jset = {n: k for k, n in enumerate(self.joints)}
    def glob(self, i):
        if i in self.G: return self.G[i]
        M = local(self.nodes[i]); M = self.glob(self.par[i]) @ M if i in self.par else M
        self.G[i] = M; return M

def rest(m):
    out = []
    for k, n in enumerate(m.joints):
        M = m.glob(n); R = M[:3, :3]; sc = np.linalg.norm(R, axis=0)
        p = m.par.get(n)
        out.append((m.nodes[n].get('name', 'j%d' % k), m.jset[p] if p in m.jset else -1, M[:3, 3], mat2quat(R / sc), sc.mean()))
    return out

def clip(m, R, name, fps=30):
    j = m.j
    an = next((a for a in j.get('animations', []) if a['name'].endswith(name)), None)
    if an is None: raise SystemExit('нет клипа %s, есть: %s' % (name, [a['name'] for a in j.get('animations', [])]))
    tr = {}
    T = 0
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]; t = acc(j, m.bin, s['input']).reshape(-1); v = acc(j, m.bin, s['output'])
        tr[(ch['target']['node'], ch['target']['path'])] = (t, v, s.get('interpolation', 'LINEAR'))
        T = max(T, t[-1])
    nF = max(2, int(round(T * fps)))
    nJ = len(m.joints)
    out = np.zeros((nF, nJ, 7), np.float32)
    def sample(key, tt, dflt, q=False):
        if key not in tr: return np.array(dflt, float)
        t, v, ip = tr[key]
        if tt <= t[0]: return v[0].astype(float)
        if tt >= t[-1]: return v[-1].astype(float)
        i = np.searchsorted(t, tt) - 1; a = (tt - t[i]) / (t[i + 1] - t[i])
        if ip == 'STEP': return v[i].astype(float)
        return slerp(v[i].astype(float), v[i + 1].astype(float), a) if q else v[i] * (1 - a) + v[i + 1] * a
    foot = [k for k, (nm, *_ ) in enumerate(R) if nm.startswith('Foot')]
    fpos = np.zeros((nF, len(foot), 3))
    order = sorted(range(nJ), key=lambda k: depth(R, k))
    for f in range(nF):
        tt = f / nF * T
        Wq = [None] * nJ; Wp = [None] * nJ
        for k in order:
            n = m.joints[k]; nd = m.nodes[n]
            q = sample((n, 'rotation'), tt, nd.get('rotation', [0, 0, 0, 1]), True); q = q / np.linalg.norm(q)
            p = sample((n, 'translation'), tt, nd.get('translation', [0, 0, 0]))
            pk = R[k][1]
            if pk < 0:
                P = m.glob(m.par[n]); Rp = P[:3, :3]; sc = np.linalg.norm(Rp, axis=0)
                q = qmul(mat2quat(Rp / sc), q); p = P[:3, :3] @ p + P[:3, 3]
                Wq[k] = q; Wp[k] = p
            else:
                p = p * R[k][4]
                Wq[k] = qmul(Wq[pk], q); Wp[k] = Wp[pk] + qmat(Wq[pk]) @ p
            out[f, k, :4] = q; out[f, k, 4:] = p
        for i, k in enumerate(foot): fpos[f, i] = Wp[k]
    # скорость шага: ступня на земле едет назад со скоростью тела
    sp = []
    for i in range(len(foot)):
        y = fpos[:, i, 1]; z = fpos[:, i, 2]; low = y < y.min() + 0.15 * (y.max() - y.min() + 1e-9)
        dz = np.abs(np.diff(np.r_[z, z[0]])) * nF / T
        sp += list(dz[low])
    speed = float(np.median(sp)) if sp else 1.0
    return nF, nF / T, speed, out

def depth(R, k):
    d = 0
    while R[k][1] >= 0: k = R[k][1]; d += 1
    return d

def part_type(nm):
    n = nm.lower()
    for t, keys in (('hatb', ('hatb',)), ('hatu', ('hatu',)), ('head', ('head',)), ('body', ('body',)), ('legs', ('legs', 'pants')), ('feet', ('feet',))):
        if any(n.endswith(x) for x in keys): return t
    if n.startswith('female') or n.startswith('basehuman') or n.startswith('woman'): return 'all'
    return None

def parts(m, R0):
    j = m.j; out = []
    jmap = {}
    for k, n in enumerate(m.joints): jmap[n] = k
    for ni, nd in enumerate(m.nodes):
        if 'mesh' not in nd: continue
        typ = part_type(nd.get('name', '') or j['meshes'][nd['mesh']].get('name', ''))
        if not typ: continue
        sk = j['skins'][nd['skin']]
        remap = np.array([FAMI[m.nodes[n].get('name')] for n in sk['joints']])   # по имени кости — в порядке семейства
        ibm = acc(j, m.bin, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        JM = np.array([m.glob(sk['joints'][k]) @ ibm[k] for k in range(len(sk['joints']))])
        pal = []; palI = {}; P = []; C = []; SI = []; SW = []; IDX = []; v0 = 0
        for pr in j['meshes'][nd['mesh']]['primitives']:
            A = pr['attributes']; pos = acc(j, m.bin, A['POSITION']).astype(np.float64); n = len(pos)
            ji = acc(j, m.bin, A['JOINTS_0']).astype(np.int64); wi = acc(j, m.bin, A['WEIGHTS_0']).astype(np.float64)
            wi = wi / np.maximum(wi.sum(1, keepdims=True), 1e-9)
            ph = np.c_[pos, np.ones(n)]; o = np.zeros((n, 3))
            for c in range(4): o += wi[:, c:c + 1] * np.einsum('nij,nj->ni', JM[ji[:, c]], ph)[:, :3]
            if REPOSE is not None:   # файл в другой позе покоя (Blender — «руки в стороны»): вершины — в позу семейства
                ph2 = np.c_[o, np.ones(n)]; o2 = np.zeros((n, 3))
                for c in range(4): o2 += wi[:, c:c + 1] * np.einsum('nij,nj->ni', REPOSE[remap[ji[:, c]]], ph2)[:, :3]
                o = o2
            mi = pr.get('material'); mt = j['materials'][mi] if mi is not None else {'name': 'none'}
            nm = mt.get('name', 'm');
            if nm not in palI: palI[nm] = len(pal); pal.append((nm, mt.get('pbrMetallicRoughness', {}).get('baseColorFactor', [.8, .8, .8, 1])[:3]))
            P.append(o); C.append(np.full(n, palI[nm])); SI.append(remap[ji]); SW.append(wi)
            ind = acc(j, m.bin, pr['indices']).reshape(-1) if 'indices' in pr else np.arange(n)
            IDX.append(ind.astype(np.int64) + v0); v0 += n
        P = np.concatenate(P); C = np.concatenate(C); SI = np.concatenate(SI); SW = np.concatenate(SW); IDX = np.concatenate(IDX)
        W8 = np.floor(SW * 255).astype(np.int64); W8[np.arange(len(W8)), SW.argmax(1)] += 255 - W8.sum(1)
        eyes = [i for i, (nm, _) in enumerate(pal) if nm.lower() in ('eye', 'eyes')]
        ev = P[np.isin(C, eyes)] if eyes else np.zeros((0, 3))
        eye = ev.mean(0) if len(ev) else np.zeros(3)
        mn = P.min(0); mx = P.max(0); span = np.maximum(mx - mn, 1e-9)
        Q = np.round((P - mn) / span * 65535 - 32768).astype(np.int16)
        b = bytearray(S(typ)) + struct.pack('<3I', len(P), len(IDX), len(pal))
        for nm, rgb in pal: b += S(nm) + struct.pack('<3f', *rgb)
        b += struct.pack('<3f', *eye) + struct.pack('<6f', *mn, *mx)
        b += Q.astype('<i2').tobytes() + C.astype(np.uint8).tobytes() + SI.astype(np.uint8).tobytes() + W8.astype(np.uint8).tobytes()
        b += IDX.astype('<u2' if len(P) <= 65535 else '<u4').tobytes()
        out.append((typ, len(P), len(IDX) // 3, b))
    return out

REPOSE = None
out = sys.argv[1]; fams = []
for spec in sys.argv[2:]:
    fam, clips, files = spec.split(':', 2)
    files = [f.split('=', 1) for f in files.split(',')]
    m0 = Model(files[0][1]); R0 = rest(m0); FAMI = {r[0]: k for k, r in enumerate(R0)}
    b = bytearray(struct.pack('<3I', len(R0), len(files), len(clips.split(','))))
    for nm, p, pos, q, sc in R0: b += S(nm) + struct.pack('<h', p) + struct.pack('<3f', *pos) + struct.pack('<4f', *q)
    for cn in clips.split(','):
        nF, fps, sp, data = clip(m0, R0, cn)
        print(fam, 'clip', cn, 'frames', nF, 'fps', round(fps, 1), 'speed', round(sp, 3))
        b += S(cn) + struct.pack('<I2f', nF, fps, sp) + data.astype('<f4').tobytes()
    for name, path in files:
        m = Model(path); R = rest(m)
        RN = {r[0]: r for r in R}
        def T4(pos, q): M = np.eye(4); M[:3, :3] = qmat(q); M[:3, 3] = pos; return M
        REPOSE = np.array([T4(r[2], r[3]) @ np.linalg.inv(T4(RN[r[0]][2], RN[r[0]][3])) if r[0] in RN else np.eye(4) for r in R0]) if name == 'winter' else None
        diff = max(float(np.abs(RN[r[0]][2] - r[2]).max()) for r in R0 if r[0] in RN) if all(r[0] in RN for r in R0) else -1
        ps = parts(m, R0)
        print(fam, name, 'rest diff', round(diff, 4), [(t, v, tr) for t, v, tr, _ in ps])
        b += S(name) + struct.pack('<I', len(ps))
        for *_, pb in ps: b += pb
    fams.append((fam, base64.b64encode(bytes(b)).decode(), len(b)))
open(out, 'w').write('/* Люди Quaternius (CC0, quaternius.com, через poly.pizza) — семейства моделей для qpeople.js: кости, ходьба и бег, части. Собрано скриптом из .glb */\nexport const QDATA = {\n' + '\n'.join("  %s: '%s'," % (f, s) for f, s, _ in fams) + '\n};\n')
print('bytes', [(f, n) for f, _, n in fams])
