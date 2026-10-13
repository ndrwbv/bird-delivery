/* Настоящая модель машины → в стиль игры (проба, ветка test/real-car, 13.10.2026).
   node tools/realcar.mjs <папка с scene.gltf> [выход=public/models/<модель>] [модель=vaz2107]   (как добавить машину — docs/CARS3D.md)
   • все узлы запекаются в оси игры: +z — вперёд, +y — вверх, +x — левый борт (водитель); метры
   • четыре колеса вырезаются из днища отдельными частями (pivot — ось колеса): в игре крутятся,
     передние поворачивают; их почти не ужимаем — остаются круглыми
   • остальное — меньше треугольников (meshoptimizer, своя доля на часть), нормали и тангенты
     выкинуты — в игре гранёный свет (flatShading), как у всех машин
   • текстуры — только цвет: 2K → 64—256 px, крапинки сглажены, насыщеннее, палитра 8—12 цветов, без сглаживания
     (в игре — NearestFilter, крупный пиксель)
   Выход: car.json (части, смещения), car.bin (вершины, UV, индексы), <часть>.png */
import { NodeIO } from '@gltf-transform/core';
import { weld, transformPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2], OUT = process.argv[3] || 'public/models/' + (process.argv[4] || 'vaz2107');
if (!SRC) { console.log('node tools/realcar.mjs <папка с scene.gltf> [выход] [модель]'); process.exit(1); }

/* Модели (папка public/models/<имя>): PART — части модели по именам узлов, WHEEL — колёса в днище, K — единицы → метры.
   keep — доля треугольников, err — допустимая ошибка (доля размера), tex — сторона текстуры (0 — без картинки),
   colors — цветов в палитре, median — сгладить крапинки, hue/sat/bri — цвет;
   paint — краска маской: красно-оранжевые пиксели → серый оттенок + прозрачность-метка, в игре × цвет машины
   (перекраска в гараже); остальное (хром, резина, фары) — как есть. Новая машина — новая запись (docs/CARS3D.md) */
const MODELS = {
  vaz2107: {
    K: 0.01,                                      // модель в сантиметрах
    PART: {
      Car_CarBody_0: { keep: 0.5, err: 0.006, tex: 64, colors: 6, median: 9, paint: { hue: [330, 45], sat: 0.3 } },
      Car_Details_0: { keep: 0.4, err: 0.01, tex: 256, colors: 12, sat: 1.2, bri: 1.1 },   // номера и фары — мельче не читаются
      Car_Details_Transparent_0: { keep: 1, tex: 128, sat: 1.2, bri: 1.1, alpha: 0.5 },
      Car_Bottom_0: { keep: 0.15, err: 0.03, tex: 64, colors: 8, sat: 1.1, bri: 1.05 },
      Car_Interior_0: { keep: 0.8, err: 0.004, tex: 64, colors: 8, sat: 1.2, bri: 1.15, cut: 0.15 },   // cut — торпедо модели (z > 0,15 м в осях модели = 0,4 м от середины машины) — своё в игре
      Car_Windows_0: { keep: 1, tex: 0 },          // стёкла — без картинки: в игре светлые и прозрачные, по одному на сторону (трескаются)
    },
    /* колёса «Семёрки»: ось на высоте радиуса, база 2,41 м; в колесо — треугольники днища целиком внутри R */
    WHEEL: { from: 'Car_Bottom_0', r: 0.29, R: 0.36, x: 0.55, z: 1.206, xc: 0.72, keep: 0.3, err: 0.006 },
  },
};
const MODEL = process.argv[4] || 'vaz2107', CFG = MODELS[MODEL];
if (!CFG) { console.log('нет модели', MODEL, '— есть:', Object.keys(MODELS).join(', ')); process.exit(1); }
const PART = CFG.PART, WHEEL = CFG.WHEEL;
const COLORS = 12, MEDIAN = 3, K = CFG.K;           // палитра по умолчанию; MEDIAN — сгладить крапинки (автор 13.10: «текстуру попроще»)                      // модель в сантиметрах → метры

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
  if (!tex || !P.tex) return null;
  if (texFile[name]) return texFile[name];   // одна картинка на часть
  const file = name.replace(/^Car_|_0$/g, '').toLowerCase() + '.png';
  let img = sharp(Buffer.from(tex.getImage())).resize(P.tex, P.tex, { kernel: 'lanczos3' }).median(P.median || MEDIAN);
  if (P.paint) {
    // краска: оттенок в hue[0]…hue[1] и насыщенность > sat — серый по яркости (самая яркая краска — белый) и метка alpha 255
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hsv = i => { const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]; };
    const isPaint = ([h, sa, v]) => (P.paint.hue[0] > P.paint.hue[1] ? h >= P.paint.hue[0] || h <= P.paint.hue[1] : h >= P.paint.hue[0] && h <= P.paint.hue[1]) && sa > P.paint.sat && v > 0.12;
    const vs = [];
    for (let i = 0; i < data.length; i += 4) { const c = hsv(i); if (isPaint(c)) vs.push(c[2]); }
    vs.sort((a, b) => a - b);
    const vref = vs[Math.floor(vs.length * 0.9)] || 1;
    for (let i = 0; i < data.length; i += 4) {
      const c = hsv(i);
      if (isPaint(c)) { const g = Math.round(255 * Math.min(1, 0.55 + 0.45 * c[2] / vref)); data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255; }
      else data[i + 3] = 0;
    }
    img = sharp(data, { raw: info });
    console.log('краска:', vs.length, 'из', data.length / 4, 'пикселей');
  } else img = img.modulate({ saturation: P.sat || 1, brightness: P.bri || 1, hue: P.hue || 0 });
  await img.png({ palette: true, colours: P.colors || COLORS, dither: 0 }).toFile(path.join(OUT, file));
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
    if (P.cut !== undefined) {
      // торпедо модели — грубое: всё, что дальше P.cut от середины машины вперёд, выкинуть (своё торпедо — в игре)
      const keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        const z = (pos[idx[t] * 3 + 2] + pos[idx[t + 1] * 3 + 2] + pos[idx[t + 2] * 3 + 2]) / 3;
        if (z <= P.cut) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      console.log('торпедо модели — долой:', (idx.length - keep.length) / 3, 'треугольников');
      rest = keep;
    }
    if (WHEEL && name === WHEEL.from) {
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
    if (name === 'Car_Windows_0') {
      // стёкла: по нормали треугольника — бок (L / R) или лобовое / заднее (F / B); UV — плоская проекция 0…1
      // (на неё в игре ложатся трещины и кровь)
      const G = { winF: [], winB: [], winL: [], winR: [] };
      const v = (i, k) => pos[i * 3 + k];
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const ux = v(b, 0) - v(a, 0), uy = v(b, 1) - v(a, 1), uz = v(b, 2) - v(a, 2), wx = v(c, 0) - v(a, 0), wy = v(c, 1) - v(a, 1), wz = v(c, 2) - v(a, 2);
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.hypot(nx, ny, nz) || 1;
        const mx = (v(a, 0) + v(b, 0) + v(c, 0)) / 3, mz = (v(a, 2) + v(b, 2) + v(c, 2)) / 3;
        const k = Math.abs(nx / nl) > 0.6 ? (mx > 0 ? 'winL' : 'winR') : (mz > (box.min[2] + box.max[2]) / 2 ? 'winF' : 'winB');
        G[k].push(a, b, c);
      }
      for (const k in G) {
        const g = simplify(pos, uv, G[k], 1, 0);
        const side = k === 'winL' || k === 'winR', lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (let i = 0; i < g.pos.length; i += 3) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], g.pos[i + j]); hi[j] = Math.max(hi[j], g.pos[i + j]); }
        for (let i = 0, q = 0; i < g.pos.length; i += 3, q += 2) {
          const h = side ? 2 : 0;
          g.uv[q] = (g.pos[i + h] - lo[h]) / (hi[h] - lo[h] || 1);
          g.uv[q + 1] = (g.pos[i + 1] - lo[1]) / (hi[1] - lo[1] || 1);
        }
        console.log(k.padEnd(28), 'треугольников', emit(k, null, mat, { alpha: 0.14 }, g, null));
      }
      continue;
    }
    const g = simplify(pos, uv, rest, P.keep, P.err || 0.004);
    console.log(name.padEnd(28), 'треугольников', rest.length / 3, '→', emit(name, file, mat, P, g, null));
  }
}
fs.writeFileSync(path.join(OUT, 'car.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'car.json'), JSON.stringify({ box, parts }, null, 1));
console.log('рамка', box, 'bin', off, 'байт');
