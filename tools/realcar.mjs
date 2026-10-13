/* Настоящая модель машины → в стиль игры (проба, ветка test/real-car, 13.10.2026).
   node tools/realcar.mjs <папка с scene.gltf> [выход=public/models/vaz2107]
   • все узлы запекаются в оси игры: +z — вперёд, +y — вверх, +x — левый борт (водитель); метры
   • четыре колеса вырезаются из днища отдельными частями (pivot — ось колеса): в игре крутятся,
     передние поворачивают; их почти не ужимаем — остаются круглыми
   • остальное — меньше треугольников (meshoptimizer, своя доля на часть), нормали и тангенты
     выкинуты — в игре гранёный свет (flatShading), как у всех машин
   • текстуры — только цвет: 2K → 128—256 px, насыщеннее, палитра ~24 цвета, без сглаживания
     (в игре — NearestFilter, крупный пиксель)
   Выход: car.json (части, смещения), car.bin (вершины, UV, индексы), <часть>.png */
import { NodeIO } from '@gltf-transform/core';
import { weld, transformPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2], OUT = process.argv[3] || 'public/models/vaz2107';
if (!SRC) { console.log('node tools/realcar.mjs <папка с scene.gltf> [выход]'); process.exit(1); }

/* keep — доля треугольников, err — допустимая ошибка (доля размера), tex — сторона текстуры,
   hue/sat/bri — цвет (к оранжевому пиццерии), alpha — прозрачность (у стёкол своя карта — тут ровная) */
const PART = {
  Car_CarBody_0: { keep: 0.5, err: 0.006, tex: 256, hue: 8, sat: 1.35, bri: 1.12 },
  Car_Details_0: { keep: 0.4, err: 0.01, tex: 256, sat: 1.2, bri: 1.1 },
  Car_Details_Transparent_0: { keep: 1, tex: 128, sat: 1.2, bri: 1.1, alpha: 0.5 },
  Car_Bottom_0: { keep: 0.15, err: 0.03, tex: 128, sat: 1.1, bri: 1.05 },
  Car_Interior_0: { keep: 0.8, err: 0.004, tex: 128, sat: 1.2, bri: 1.15 },
  Car_Windows_0: { keep: 1, tex: 128, sat: 1, bri: 1.6, alpha: 0.28 },
};
/* колёса «Семёрки»: ось на высоте радиуса, база 2,41 м; в колесо — треугольники днища целиком внутри R */
const WHEEL = { r: 0.29, R: 0.36, x: 0.55, z: 1.206, xc: 0.72, keep: 0.3, err: 0.006 };
const COLORS = 24, K = 0.01;                      // модель в сантиметрах → метры

await MeshoptSimplifier.ready;
const doc = await new NodeIO().read(path.join(SRC, 'scene.gltf'));
await doc.transform(weld());

fs.mkdirSync(OUT, { recursive: true });
const parts = [], chunks = [];
let off = 0;
const push = (ta) => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength); const o = off; chunks.push(b); off += b.length; while (off % 4) { chunks.push(Buffer.alloc(1)); off++; } return o; };
const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };

/* ужать: индексы → meshopt → только нужные вершины */
function simplify (pos, uv, idx, keep, err) {
  let ix = Uint32Array.from(idx);
  if (keep < 1) ix = MeshoptSimplifier.simplify(ix, pos, 3, Math.max(3, Math.floor(ix.length * keep / 3) * 3), err, [])[0];
  const map = new Map(), P = [], U = [], I = new Uint32Array(ix.length);
  for (let i = 0; i < ix.length; i++) {
    let v = map.get(ix[i]);
    if (v === undefined) { v = map.size; map.set(ix[i], v); P.push(pos[ix[i] * 3], pos[ix[i] * 3 + 1], pos[ix[i] * 3 + 2]); U.push(uv[ix[i] * 2], uv[ix[i] * 2 + 1]); }
    I[i] = v;
  }
  return { pos: new Float32Array(P), uv: new Float32Array(U), idx: I };
}

const texFile = {};
async function texture (name, mat, P) {
  const tex = mat && mat.getBaseColorTexture();
  if (!tex) return null;
  if (texFile[name]) return texFile[name];
  const file = name.replace(/^Car_|_0$/g, '').toLowerCase() + '.png';
  await sharp(Buffer.from(tex.getImage())).resize(P.tex, P.tex, { kernel: 'lanczos3' })
    .modulate({ saturation: P.sat || 1, brightness: P.bri || 1, hue: P.hue || 0 })
    .png({ palette: true, colours: COLORS, dither: 0 }).toFile(path.join(OUT, file));
  return (texFile[name] = file);
}

function emit (name, file, mat, P, g, pivot) {
  const a = mat ? mat.getBaseColorFactor()[3] : 1;
  const ix = g.pos.length / 3 > 65535 ? g.idx : new Uint16Array(g.idx);
  parts.push({
    name, file, pivot, blend: !!(mat && mat.getAlphaMode() === 'BLEND'), alpha: P.alpha !== undefined ? P.alpha : a,
    pos: [push(g.pos), g.pos.length], uv: [push(g.uv), g.uv.length], idx: [push(ix), ix.length, ix.BYTES_PER_ELEMENT],
  });
  return g.idx.length / 3;
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName(), P = PART[name] || { keep: 0.5, tex: 128 };
  for (const prim of mesh.listPrimitives()) {
    transformPrimitive(prim, node.getWorldMatrix());
    const src = prim.getAttribute('POSITION').getArray(), uv = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
    const idx = prim.getIndices().getArray(), mat = prim.getMaterial();
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) pos[i] = src[i] * K;
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], pos[i + k]); box.max[k] = Math.max(box.max[k], pos[i + k]); }
    const file = await texture(name, mat, P);
    let rest = idx;
    if (name === 'Car_Bottom_0') {
      // колёса: треугольник целиком в цилиндре радиуса R вокруг оси колеса — колесо
      const W = { LF: [], RF: [], LB: [], RB: [] }, R = [];
      const where = v => {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        if (Math.abs(x) < WHEEL.x) return null;
        const zc = z > 0 ? WHEEL.z : -WHEEL.z;
        return Math.hypot(y - WHEEL.r, z - zc) < WHEEL.R ? (x > 0 ? 'L' : 'R') + (z > 0 ? 'F' : 'B') : null;
      };
      for (let t = 0; t < idx.length; t += 3) {
        const k = where(idx[t]);
        if (k && k === where(idx[t + 1]) && k === where(idx[t + 2])) W[k].push(idx[t], idx[t + 1], idx[t + 2]);
        else R.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      for (const k in W) {
        const g = simplify(pos, uv, W[k], WHEEL.keep, WHEEL.err);
        const pv = [(k[0] === 'L' ? 1 : -1) * WHEEL.xc, WHEEL.r, (k[1] === 'F' ? 1 : -1) * WHEEL.z];
        for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] -= pv[0]; g.pos[i + 1] -= pv[1]; g.pos[i + 2] -= pv[2]; }
        console.log(('wheel' + k).padEnd(28), 'треугольников', W[k].length / 3, '→', emit('wheel' + k, file, mat, P, g, pv));
      }
      rest = R;
    }
    const g = simplify(pos, uv, rest, P.keep, P.err || 0.004);
    console.log(name.padEnd(28), 'треугольников', rest.length / 3, '→', emit(name, file, mat, P, g, null));
  }
}
fs.writeFileSync(path.join(OUT, 'car.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'car.json'), JSON.stringify({ box, parts }, null, 1));
console.log('рамка', box, 'bin', off, 'байт');
