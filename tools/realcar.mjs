/* Настоящая модель машины → в стиль игры (проба, ветка test/real-car, 13.10.2026).
   node tools/realcar.mjs <папка с scene.gltf> [выход=public/models/vaz2107]
   • все узлы запекаются в оси игры: +z — вперёд, +y — вверх, +x — левый борт (водитель)
   • полигоны — меньше (meshoptimizer, своя доля на часть), нормали и тангенты выкинуты —
     в игре гранёный свет (flatShading), как у всех машин
   • текстуры — только цвет: 2K → 128—256 px, насыщеннее, палитра ~24 цвета, без сглаживания
     (в игре — NearestFilter, крупный пиксель)
   Выход: car.json (части, смещения), car.bin (вершины, UV, индексы), <часть>.png */
import { NodeIO } from '@gltf-transform/core';
import { weld, transformPrimitive, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2], OUT = process.argv[3] || 'public/models/vaz2107';
if (!SRC) { console.log('node tools/realcar.mjs <папка с scene.gltf> [выход]'); process.exit(1); }

/* доля треугольников, что остаётся; tex — сторона текстуры; hue — сдвиг оттенка (к оранжевому пиццерии) */
const PART = {
  Car_CarBody_0: { keep: 0.5, err: 0.006, tex: 256, hue: 8, sat: 1.35, bri: 1.12 },
  Car_Details_0: { keep: 0.4, err: 0.01, tex: 256, sat: 1.2, bri: 1.1 },
  Car_Details_Transparent_0: { keep: 1, tex: 128, sat: 1.2, bri: 1.1, alpha: 0.5 },
  Car_Bottom_0: { keep: 0.15, err: 0.03, tex: 128, sat: 1.1, bri: 1.05 },
  Car_Interior_0: { keep: 0.8, tex: 128, sat: 1.2, bri: 1.15 },
  Car_Windows_0: { keep: 1, tex: 128, sat: 1, bri: 1.6, alpha: 0.28 }   // прозрачность у модели — отдельной картой, тут — ровная,
};
const COLORS = 24, K = 0.01;                    // модель в сантиметрах → метры

await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(path.join(SRC, 'scene.gltf'));
await doc.transform(weld());
const root = doc.getRoot();

fs.mkdirSync(OUT, { recursive: true });
const parts = [], chunks = [];
let off = 0;
const push = (ta) => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength); const o = off; chunks.push(b); off += b.length; while (off % 4) { chunks.push(Buffer.alloc(1)); off++; } return o; };
const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName(), P = PART[name] || { keep: 0.5, tex: 128 };
  for (const prim of mesh.listPrimitives()) {
    transformPrimitive(prim, node.getWorldMatrix());
    const before = prim.getIndices().getCount() / 3;
    if (P.keep < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: P.keep, error: P.err || 0.004 });
    const pos = prim.getAttribute('POSITION').getArray(), uv = prim.getAttribute('TEXCOORD_0').getArray();
    const idx = prim.getIndices().getArray();
    // после узлов модели: +y вверх, перед — +z (салон ближе к заду — капот длиннее багажника), как в игре
    const p = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      p[i] = pos[i] * K; p[i + 1] = pos[i + 1] * K; p[i + 2] = pos[i + 2] * K;
      for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], p[i + k]); box.max[k] = Math.max(box.max[k], p[i + k]); }
    }
    const ix = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    const mat = prim.getMaterial(), tex = mat && mat.getBaseColorTexture();
    let file = null;
    if (tex) {
      file = name.replace(/^Car_|_0$/g, '').toLowerCase() + '.png';
      let img = sharp(Buffer.from(tex.getImage())).resize(P.tex, P.tex, { kernel: 'lanczos3' })
        .modulate({ saturation: P.sat || 1, brightness: P.bri || 1, hue: P.hue || 0 });
      await img.png({ palette: true, colours: COLORS, dither: 0 }).toFile(path.join(OUT, file));
    }
    const a = mat ? mat.getBaseColorFactor()[3] : 1;
    parts.push({
      name, file, blend: !!(mat && mat.getAlphaMode() === 'BLEND'), alpha: P.alpha !== undefined ? P.alpha : a,
      pos: [push(p), p.length], uv: [push(new Float32Array(uv)), uv.length], idx: [push(ix), ix.length, ix.BYTES_PER_ELEMENT],
    });
    console.log(name.padEnd(28), 'треугольников', before, '→', idx.length / 3);
  }
}
fs.writeFileSync(path.join(OUT, 'car.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'car.json'), JSON.stringify({ box, parts }, null, 1));
console.log('рамка', box, 'bin', off, 'байт');
