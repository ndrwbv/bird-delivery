"""Добавочные клипы художника для qpeople.js (23.10.2026) — без пересборки qpeople.data.js.
python3 clipadd.py ../../src/game/qpeople.clips.js "M:Interact:worker.glb" "F:Interact:qJ2gsTUBHL.glb"
Файл модели — тот же, что первым шёл в семейство при сборке glb2q2.py (с него кости и ходьба): скрипт сверяет
кости с qpeople.data.js (имена, порядок, места покоя) и бросает, если не та модель.
Формат base64 (little-endian): u32 nJ, u32 nC, nC × (str name, u32 nF, f32 fps, f32 speed, nF×nJ×(4f quat, 3f pos)) —
как клипы в qpeople.data.js. У семейства A (цельные женщины) клипа Interact нет — наклон там делает игра своими костями.
"""
import sys, re, base64, struct
import numpy as np
HERE = sys.argv[0].rsplit('/', 1)[0] if '/' in sys.argv[0] else '.'
sys.path.insert(0, HERE)
src = open(HERE + '/glb2q2.py').read().split('REPOSE = None')[0].replace("sys.path.insert(0, sys.argv[0].rsplit('/', 1)[0])", '')
exec(src)

data_js = open(HERE + '/../../src/game/qpeople.data.js').read()
DATA = dict(re.findall(r"  (\w): '([^']+)'", data_js))

def joints(fam):
    b = base64.b64decode(DATA[fam]); o = 12
    nJ = struct.unpack_from('<I', b, 0)[0]; J = []
    for _ in range(nJ):
        n = b[o]; o += 1; nm = b[o:o + n].decode(); o += n + 2
        J.append((nm, np.array(struct.unpack_from('<3f', b, o)))); o += 28
    return J

out = sys.argv[1]; fams = []
for spec in sys.argv[2:]:
    fam, names, path = spec.split(':', 2)
    m = Model(path); R = rest(m); J = joints(fam)
    if [r[0] for r in R] != [j[0] for j in J] or max(float(np.abs(R[k][2] - J[k][1]).max()) for k in range(len(J))) > 1e-4:
        raise SystemExit('%s: кости не те, что у семейства %s в qpeople.data.js' % (path, fam))
    b = bytearray(struct.pack('<2I', len(R), len(names.split(','))))
    for cn in names.split(','):
        nF, fps, sp, d = clip(m, R, cn)
        print(fam, 'clip', cn, 'frames', nF, 'fps', round(fps, 1))
        b += S(cn) + struct.pack('<I2f', nF, fps, sp) + d.astype('<f4').tobytes()
    fams.append((fam, base64.b64encode(bytes(b)).decode()))
open(out, 'w').write('/* Добавочные клипы людей Quaternius (CC0) для qpeople.js: наклон «Interact» (поднять с земли). Собрано tools/quaternius/clipadd.py */\nexport const QCLIPS = {\n' + '\n'.join("  %s: '%s'," % f for f in fams) + '\n};\n')
print('bytes', [(f, len(s)) for f, s in fams])
