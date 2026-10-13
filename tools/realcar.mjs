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
  /* «Копейка» — «VAZ 2101», Javkal, CC-BY-4.0: кузов, детали и днище — одна часть и одна картинка; колёса — свои части;
     салона нет (торпедо, руль, курьер — свои, realcar.js). Краска — бежевая: светлая и мало насыщенная, ржавчина — пятнами */
  vaz2101: {
    K: 0.01,
    axes: (x, y, z) => [-z, y, x],                // модель на скелете: длина — по x (перед +x), вверх — y, ширина — z; поворот без зеркала
    PART: {
      kopeika_kopeika_0: { keep: 0.6, err: 0.006, tex: 128, colors: 8, median: 7, role: 'body', paint: { hue: [18, 70], sat: [0.05, 0.45], v: 0.5 } },
      kopeika_glass_0: { keep: 1, tex: 0, role: 'glass' },
    },
    WHEELS: { LF: 'w_FD_kopeika_0', RF: 'w_FP_kopeika_0', LB: 'w_RD_kopeika_0', RB: 'w_RP_kopeika_0', keep: 0.8, err: 0.004 },
  },
};
const MODEL = process.argv[4] || 'vaz2107', CFG = MODELS[MODEL];
/* lite — машина потока (5-й аргумент «lite»): без салона, треугольников × LITE.K, колёса на месте (не крутятся),
   стёкла — одной частью, части с одной картинкой — одним куском (одна отрисовка). Выход — car_lite.json / car_lite.bin */
const LITE = process.argv[5] === 'lite' ? { K: 0.4, ERR: 0.05 } : null;   // ERR — допуск упрощения: издалека не видно
if (!CFG) { console.log('нет модели', MODEL, '— есть:', Object.keys(MODELS).join(', ')); process.exit(1); }
const PART = CFG.PART, WHEEL = CFG.WHEEL, WHEELS = CFG.WHEELS;
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
function simplify (pos, uv, idx, keep, err, rough) {   // rough — можно грубо (колёса, днище): кузов грубое рвёт
  if (LITE) { keep *= LITE.K; err = Math.max(err || 0.004, LITE.ERR); }
  let ix = Uint32Array.from(idx);
  const target = Math.max(3, Math.floor(ix.length * keep / 3) * 3);
  if (keep < 1) {
    ix = MeshoptSimplifier.simplify(ix, pos, 3, target, err, [])[0];
    // поток: обычное упрощение упёрлось в швы картинки (колёса «Семёрки») — грубое; на кузове грубое рвёт дыры («прозрачная Копейка»)
    if (LITE && rough && ix.length > target * 1.6) ix = MeshoptSimplifier.simplifySloppy(Uint32Array.from(idx), pos, 3, null, target, err)[0];
  }
  const map = new Map(), P = [], U = [], I = new Uint32Array(ix.length);
  for (let i = 0; i < ix.length; i++) {
    let v = map.get(ix[i]);
    if (v === undefined) { v = map.size; map.set(ix[i], v); P.push(pos[ix[i] * 3], pos[ix[i] * 3 + 1], pos[ix[i] * 3 + 2]); U.push(uv[ix[i] * 2], uv[ix[i] * 2 + 1]); }
    I[i] = v;
  }
  return { pos: new Float32Array(P), uv: new Float32Array(U), idx: I };
}

const texFile = {}, TEX_BY = new Map();
async function texture (name, mat, P) {
  const tex = mat && mat.getBaseColorTexture();
  if (!tex || !P.tex) return null;
  if (texFile[name]) return texFile[name];   // одна картинка на часть
  if (TEX_BY.has(tex)) return (texFile[name] = TEX_BY.get(tex));   // та же картинка у другой части (колёса «Копейки» — с кузовом)
  const file = name.replace(/^Car_|_0$/g, '').toLowerCase() + '.png';
  let img = sharp(Buffer.from(tex.getImage())).resize(P.tex, P.tex, { kernel: 'lanczos3' }).median(P.median || MEDIAN);
  if (P.paint) {
    // краска: оттенок в hue[0]…hue[1] и насыщенность > sat — серый по яркости (самая яркая краска — белый) и метка alpha 255
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hsv = i => { const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]; };
    const sat = [].concat(P.paint.sat), vmin = P.paint.v || 0.12;   // sat — от (или [от, до]), v — не темнее
    const isPaint = ([h, sa, v]) => (P.paint.hue[0] > P.paint.hue[1] ? h >= P.paint.hue[0] || h <= P.paint.hue[1] : h >= P.paint.hue[0] && h <= P.paint.hue[1]) && sa > sat[0] && (sat[1] === undefined || sa <= sat[1]) && v > vmin;
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
  TEX_BY.set(tex, file);
  return (texFile[name] = file);
}

const LITE_G = {};                                // lite: картинка → { pos, uv, idx, ... } — склеить в конце
function emit (name, file, mat, P, g, pivot, role) {
  const a = mat ? mat.getBaseColorFactor()[3] : 1;
  if (LITE) {
    if (pivot) for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] += pivot[0]; g.pos[i + 1] += pivot[1]; g.pos[i + 2] += pivot[2]; }   // колесо — на место
    const glass = /^win/.test(name) || P.role === 'glass';
    const key = glass ? 'glass' : file + '|' + !!(mat && mat.getAlphaMode() === 'BLEND');
    const G = LITE_G[key] || (LITE_G[key] = { name: glass ? 'glass' : name, file: glass ? null : file, blend: glass || !!(mat && mat.getAlphaMode() === 'BLEND'),
      alpha: glass ? 0.14 : (P.alpha !== undefined ? P.alpha : a), role: glass ? 'glass' : (role || P.role || (/CarBody/.test(name) ? 'body' : /Details_0/.test(name) ? 'detail' : null)), pos: [], uv: [], idx: [] });
    if (!glass && (role || P.role) === 'body') G.role = 'body';
    const v0 = G.pos.length / 3;
    G.pos.push(...g.pos); G.uv.push(...g.uv); for (const i of g.idx) G.idx.push(i + v0);
    return g.idx.length / 3;
  }
  const ix = g.pos.length / 3 > 65535 ? g.idx : new Uint16Array(g.idx);
  parts.push({
    name, file, pivot, role: role || P.role || (/CarBody/.test(name) ? 'body' : /Details_0/.test(name) ? 'detail' : null), blend: !!(mat && mat.getAlphaMode() === 'BLEND'), alpha: P.alpha !== undefined ? P.alpha : a,
    pos: [push(g.pos), g.pos.length], uv: [push(g.uv), g.uv.length], idx: [push(ix), ix.length, ix.BYTES_PER_ELEMENT],
  });
  return g.idx.length / 3;
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = mesh.getName() || node.getName(), P = PART[name] || { keep: 0.5, tex: 128 };
  for (const prim of mesh.listPrimitives()) {
    transformPrimitive(prim, node.getWorldMatrix());
    const src = prim.getAttribute('POSITION').getArray(), uv = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
    const idx = prim.getIndices().getArray(), mat = prim.getMaterial();
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) pos[i] = src[i] * K;
    if (CFG.axes) for (let i = 0; i < pos.length; i += 3) { const v = CFG.axes(pos[i], pos[i + 1], pos[i + 2]); pos[i] = v[0]; pos[i + 1] = v[1]; pos[i + 2] = v[2]; }   // свои оси модели → оси игры
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], pos[i + k]); box.max[k] = Math.max(box.max[k], pos[i + k]); }
    if (LITE && (P.role === 'interior' || /Interior/.test(name))) { console.log(name.padEnd(28), '— салон, в потоке не нужен'); continue; }
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
    const wk = WHEELS && Object.keys(WHEELS).find(k => WHEELS[k] === name);
    if (wk) {
      // колесо готовой частью: ось — середина его рамки; L / R и F / B — по месту (а не по имени: у моделей своё «водитель / пассажир»)
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
      const pv = [0, 1, 2].map(k => (lo[k] + hi[k]) / 2);
      const g = simplify(pos, uv, idx, WHEELS.keep, WHEELS.err, true);
      for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] -= pv[0]; g.pos[i + 1] -= pv[1]; g.pos[i + 2] -= pv[2]; }
      const k2 = (pv[0] > 0 ? 'L' : 'R') + (pv[2] > 0 ? 'F' : 'B');
      console.log(('wheel' + k2).padEnd(28), 'ось', pv.map(v => v.toFixed(2)).join(' '), 'треугольников', emit('wheel' + k2, file, mat, P, g, pv, 'wheel'));
      continue;
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
        const g = simplify(pos, uv, W[k], WHEEL.keep, WHEEL.err, true);
        const pv = [(k[0] === 'L' ? 1 : -1) * WHEEL.xc, WHEEL.r, (k[1] === 'F' ? 1 : -1) * WHEEL.z];
        for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] -= pv[0]; g.pos[i + 1] -= pv[1]; g.pos[i + 2] -= pv[2]; }
        console.log(('wheel' + k).padEnd(28), 'треугольников', W[k].length / 3, '→', emit('wheel' + k, file, mat, P, g, pv));
      }
      rest = R;
    }
    if (name === 'Car_Windows_0' || P.role === 'glass') {
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
    const g = simplify(pos, uv, rest, P.keep, P.err || 0.004, WHEEL && name === WHEEL.from);
    console.log(name.padEnd(28), 'треугольников', rest.length / 3, '→', emit(name, file, mat, P, g, null));
  }
}
if (LITE) for (const k in LITE_G) {
  const G = LITE_G[k], n = G.pos.length / 3;
  const ix = n > 65535 ? new Uint32Array(G.idx) : new Uint16Array(G.idx);
  parts.push({ name: G.name, file: G.file, pivot: null, role: G.role, blend: G.blend, alpha: G.alpha,
    pos: [push(new Float32Array(G.pos)), G.pos.length], uv: [push(new Float32Array(G.uv)), G.uv.length], idx: [push(ix), ix.length, ix.BYTES_PER_ELEMENT] });
  console.log('поток:', G.name.padEnd(22), G.file || '—', 'треугольников', G.idx.length / 3);
}
const NAME = LITE ? 'car_lite' : 'car';
fs.writeFileSync(path.join(OUT, NAME + '.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ box, parts }, null, 1));
console.log('рамка', box, 'bin', off, 'байт');
