/* Люди Quaternius легче (0п4, 23.10.2026): qpeople.data.js → тот же формат, меньше вершин и треугольников.
   node tools/quaternius/slim.mjs src/game/qpeople.data.js [--err=0.004] [--hat=0.012] [--dry]

   1. Сварка: модели художника выгружены «плоскими» — у каждой грани свои вершины (вершин вдвое больше треугольников).
      Игра красит людей плоской заливкой (свет по грани, нормали вершин не нужны), поэтому одинаковые вершины
      (то же место, та же краска, те же кости и веса) сливаются в одну — вид тот же, вершин ×0,27.
   2. Упрощение (meshoptimizer, как Decimate в Blender, но вершины — из исходных): грани, которые почти в одной
      плоскости, сливаются, пока ошибка не больше --err (единицы модели ≈ метры роста 1,9; цельные женщины A — в своём
      масштабе). Края частей (шея, пояс, щиколотки — стык с частью другой модели) и края краски не двигаются.
      Шапки (hatb, hatu) — грубее (--hat): их сделал Blender с лишними гранями.
   Запускать один раз на свежем выходе glb2q2.py (в шапке файла — пометка «slim», второй раз — отказ). */
import fs from 'fs';
import { MeshoptSimplifier as MS } from 'meshoptimizer';

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const ERR = opt('err', 0.004), HAT = opt('hat', 0.012), DRY = args.includes('--dry');
if (!file) { console.error('node slim.mjs src/game/qpeople.data.js [--err=0.004] [--hat=0.012] [--dry]'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');
if (/slim:/.test(src.slice(0, 400))) { console.error('уже упрощён (пометка slim в шапке) — сначала свежий glb2q2.py'); process.exit(1); }
await MS.ready;

/* ── чтение семейства (формат — glb2q2.py) ── */
function parse (buf) {
  const bin = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  let o = 0;
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; }, f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const raw = n => { const b = bin.slice(o, o + n); o += n; return b; };
  const str = () => { const n = bin[o++], s = Buffer.from(bin.subarray(o, o + n)).toString('utf8'); o += n; return s; };
  const nJ = u32(), nM = u32(), nC = u32();
  for (let i = 0; i < nJ; i++) { str(); o += 2 + 7 * 4; }
  for (let c = 0; c < nC; c++) { str(); const nF = u32(); o += 8 + nF * nJ * 28; }
  const head = bin.slice(0, o);                      // кости и клипы — как есть
  const models = [];
  for (let mI = 0; mI < nM; mI++) {
    const name = str(), nP = u32(), parts = [];
    for (let p = 0; p < nP; p++) {
      const type = str(), nV = u32(), nI = u32(), nPal = u32(), pal = [];
      for (let i = 0; i < nPal; i++) pal.push({ name: str(), rgb: [f32(), f32(), f32()] });
      const eye = [f32(), f32(), f32()], mn = [f32(), f32(), f32()], mx = [f32(), f32(), f32()];
      const qp = new Int16Array(nV * 3); for (let i = 0; i < nV * 3; i++) { qp[i] = dv.getInt16(o, true); o += 2; }
      const mat = raw(nV), si = raw(nV * 4), sw = raw(nV * 4), big = nV > 65535, idx = new Uint32Array(nI);
      for (let i = 0; i < nI; i++) { idx[i] = big ? dv.getUint32(o, true) : dv.getUint16(o, true); o += big ? 4 : 2; }
      parts.push({ type, nV, nI, pal, eye, mn, mx, qp, mat, si, sw, idx });
    }
    models.push({ name, parts });
  }
  if (o !== bin.length) throw new Error('хвост ' + (bin.length - o));
  return { nJ, nM, head, models };
}

/* ── запись части ── */
function writePart (out, p) {
  const S = s => { const e = Buffer.from(s, 'utf8'); out.push(Buffer.from([e.length]), e); };
  const U = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); out.push(b); };
  const Fs = a => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); out.push(b); };
  S(p.type); U(p.nV); U(p.nI); U(p.pal.length);
  for (const c of p.pal) { S(c.name); Fs(c.rgb); }
  Fs(p.eye); Fs(p.mn); Fs(p.mx);
  out.push(Buffer.from(p.qp.buffer, p.qp.byteOffset, p.qp.byteLength), Buffer.from(p.mat), Buffer.from(p.si), Buffer.from(p.sw));
  const big = p.nV > 65535, I = big ? new Uint32Array(p.idx) : new Uint16Array(p.idx);
  out.push(Buffer.from(I.buffer, I.byteOffset, I.byteLength));
}

/* ── сварка + упрощение одной части ── */
function slim (p, err) {
  const key = new Map(), remap = new Uint32Array(p.nV), first = [];
  for (let v = 0; v < p.nV; v++) {
    const k = p.qp[v * 3] + ',' + p.qp[v * 3 + 1] + ',' + p.qp[v * 3 + 2] + ',' + p.mat[v] + ',' + p.si.subarray(v * 4, v * 4 + 4).join('.') + ',' + p.sw.subarray(v * 4, v * 4 + 4).join('.');
    let r = key.get(k);
    if (r === undefined) { r = first.length; key.set(k, r); first.push(v); }
    remap[v] = r;
  }
  const n = first.length, idx = new Uint32Array(p.nI);
  for (let i = 0; i < p.nI; i++) idx[i] = remap[p.idx[i]];
  const pos = new Float32Array(n * 3);
  for (let r = 0; r < n; r++) for (let c = 0; c < 3; c++) pos[r * 3 + c] = p.mn[c] + (p.qp[first[r] * 3 + c] + 32768) / 65535 * (p.mx[c] - p.mn[c]);
  let out = idx;
  if (err > 0) [out] = MS.simplify(idx, pos, 3, 0, err, ['LockBorder', 'ErrorAbsolute']);
  // вершины — только нужные, по порядку первого появления в треугольниках
  const map = new Int32Array(n).fill(-1), keep = [];
  const I = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) { let m = map[out[i]]; if (m < 0) { m = map[out[i]] = keep.length; keep.push(first[out[i]]); } I[i] = m; }
  const nV = keep.length, qp = new Int16Array(nV * 3), mat = new Uint8Array(nV), si = new Uint8Array(nV * 4), sw = new Uint8Array(nV * 4);
  keep.forEach((v, k) => { qp.set(p.qp.subarray(v * 3, v * 3 + 3), k * 3); mat[k] = p.mat[v]; si.set(p.si.subarray(v * 4, v * 4 + 4), k * 4); sw.set(p.sw.subarray(v * 4, v * 4 + 4), k * 4); });
  return { ...p, nV, nI: I.length, qp, mat, si, sw, idx: I, weld: n };
}

const fams = {}, re = /\b([MFA]): '([A-Za-z0-9+/=]+)'/g;
let m, res = src, tot = { t0: 0, t1: 0, v0: 0, v1: 0, b0: 0, b1: 0 };
while ((m = re.exec(src))) fams[m[1]] = m[2];
for (const fam in fams) {
  const buf = Buffer.from(fams[fam], 'base64'), F = parse(buf);
  // масштаб семейства: ошибка — в долях роста 1,9 (у цельных женщин A модель ~4,6 единицы)
  let y0 = Infinity, y1 = -Infinity;
  for (const md of F.models) for (const p of md.parts) { y0 = Math.min(y0, p.mn[1]); y1 = Math.max(y1, p.mx[1]); }
  const k = (y1 - y0) / 1.9;
  const out = [Buffer.from(F.head)];
  for (const md of F.models) {
    const e = Buffer.from(md.name, 'utf8'); out.push(Buffer.from([e.length]), e);
    const b = Buffer.alloc(4); b.writeUInt32LE(md.parts.length); out.push(b);
    const row = [];
    for (const p of md.parts) {
      const q = slim(p, (/^hat/.test(p.type) ? HAT : ERR) * k);
      writePart(out, q);
      row.push(`${p.type} ${p.nI / 3}→${q.nI / 3} тр, ${p.nV}→${q.weld}→${q.nV} в`);
      tot.t0 += p.nI / 3; tot.t1 += q.nI / 3; tot.v0 += p.nV; tot.v1 += q.nV;
    }
    console.log(fam, md.name.padEnd(9), row.join(' · '));
  }
  const nb = Buffer.concat(out).toString('base64');
  tot.b0 += fams[fam].length; tot.b1 += nb.length;
  res = res.replace(fams[fam], nb);
}
console.log(`треугольников ${tot.t0} → ${tot.t1} (×${(tot.t1 / tot.t0).toFixed(2)}), вершин ${tot.v0} → ${tot.v1} (×${(tot.v1 / tot.v0).toFixed(2)}), файл ${(tot.b0 / 1e6).toFixed(2)} → ${(tot.b1 / 1e6).toFixed(2)} МБ`);
if (!DRY) {
  res = res.replace(/(Собрано скриптом из \.glb)/, `$1; slim: сварка + упрощение err=${ERR} hat=${HAT} (tools/quaternius/slim.mjs)`);
  fs.writeFileSync(file, res);
  console.log('записано', file);
}
