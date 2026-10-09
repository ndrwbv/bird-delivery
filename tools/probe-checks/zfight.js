/* Мерцание стыков (группа О3, 09.10.2026): куски плоского на земле (полотно, тротуары, дорожки, газоны —
   всё, что кладётся Mesher.dtri) разного цвета, которые перекрываются и лежат на одной высоте (разница меньше
   window.__TH, по умолчанию 0,05 мм) — на стыке они «дерутся» в кадре. В npm run check не входит (долго).
   Запуск: npm run probe -- --q=zfight --eval=tools/probe-checks/zfight.js --max=0 --timeout=300
   (?zfight пишет журнал window.__ZF при сборке города; кто положил кусок — --q=zfight=tag и несжатая
   сборка, где видны имена функций: npx vite build --mode web --outDir папка --minify false, потом
   probe --dir=папка; так сборка города идёт ~1 мин).
   Ответ: сколько пар, и группы «высота/высота цвет/цвет кто & кто ×сколько dcРазница [где]».
   __TH=0.0015 — показать и почти совпадающие (до 1,5 мм), __DC — с какой разницы цвета считать (5 из 255). */
if (window.__TH === undefined) window.__TH = 0.00005;
// куски плоского на рельефе разного цвета, лежащие почти на одной высоте и перекрывающиеся
const Z = window.__ZF; if (!Z) return 'нет журнала (?zfight)';
const N = Z.length / 11, TH = +(window.__TH || 0.0015), CS = 8, EPS = 0.08;
const G = new Map();
let skipped = 0;
for (let t = 0; t < N; t++) {
  const o = t * 11;
  const x0 = Math.min(Z[o], Z[o + 2], Z[o + 4]), x1 = Math.max(Z[o], Z[o + 2], Z[o + 4]);
  const z0 = Math.min(Z[o + 1], Z[o + 3], Z[o + 5]), z1 = Math.max(Z[o + 1], Z[o + 3], Z[o + 5]);
  if (x1 - x0 > 300 || z1 - z0 > 300) { skipped++; continue; }
  for (let i = Math.floor(x0 / CS); i <= Math.floor(x1 / CS); i++) for (let j = Math.floor(z0 / CS); j <= Math.floor(z1 / CS); j++) {
    const k = i * 100003 + j; let a = G.get(k); if (!a) G.set(k, a = []); a.push(t);
  }
}
const axes = (o, out) => { for (let e = 0; e < 3; e++) { const ax = Z[o + e * 2], az = Z[o + e * 2 + 1], bx = Z[o + ((e + 1) % 3) * 2], bz = Z[o + ((e + 1) % 3) * 2 + 1]; out.push(-(bz - az), bx - ax); } };
const proj = (o, nx, nz) => { let mn = Infinity, mx = -Infinity; for (let e = 0; e < 3; e++) { const v = Z[o + e * 2] * nx + Z[o + e * 2 + 1] * nz; if (v < mn) mn = v; if (v > mx) mx = v; } return [mn, mx]; };
const overlap = (a, b) => {
  const A = [], oa = a * 11, ob = b * 11; axes(oa, A); axes(ob, A);
  for (let q = 0; q < A.length; q += 2) { const l = Math.hypot(A[q], A[q + 1]); if (l < 1e-9) continue; const nx = A[q] / l, nz = A[q + 1] / l; const [a0, a1] = proj(oa, nx, nz), [b0, b1] = proj(ob, nx, nz); if (a1 - EPS < b0 || b1 - EPS < a0) return false; }
  return true;
};
const bary = (o, x, z) => { const ax = Z[o], az = Z[o + 1], bx = Z[o + 2], bz = Z[o + 3], cx = Z[o + 4], cz = Z[o + 5];
  const dd = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(dd) < 1e-12) return null;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / dd, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / dd; return [l1, l2, 1 - l1 - l2]; };
const inside = (o, x, z) => { const b = bary(o, x, z); return b && b[0] > 0.01 && b[1] > 0.01 && b[2] > 0.01; };
const common = (oa, ob) => { const cand = [[(Z[oa] + Z[oa + 2] + Z[oa + 4]) / 3, (Z[oa + 1] + Z[oa + 3] + Z[oa + 5]) / 3], [(Z[ob] + Z[ob + 2] + Z[ob + 4]) / 3, (Z[ob + 1] + Z[ob + 3] + Z[ob + 5]) / 3]];
  for (let e = 0; e < 3; e++) for (let f = 0; f < 3; f++) cand.push([(Z[oa + e * 2] * 0.6 + Z[ob + f * 2] * 0.4), (Z[oa + e * 2 + 1] * 0.6 + Z[ob + f * 2 + 1] * 0.4)]);
  for (const c of cand) if (inside(oa, c[0], c[1]) && inside(ob, c[0], c[1])) return c; return null; };
const rgb = k => [k >> 16, (k >> 8) & 255, k & 255];
const colAt = (o, x, z) => { const b = bary(o, x, z), A = rgb(Z[o + 7]), B = rgb(Z[o + 8]), C = rgb(Z[o + 9]); return [0, 1, 2].map(i => A[i] * b[0] + B[i] * b[1] + C[i] * b[2]); };
const hex = c => c < 0 ? 'grad' : '#' + c.toString(16).padStart(6, '0');
const R = new Map();
for (const [k, a] of G) {
  
  for (let p = 0; p < a.length; p++) for (let q = p + 1; q < a.length; q++) {
    const A = a[p], B = a[q], oa = A * 11, ob = B * 11;
    if (Math.floor(Z[oa + 10] / 10000) !== Math.floor(Z[ob + 10] / 10000)) continue;                     // разные склейки (LITM / FLATM)
    const dl = Math.abs(Z[oa + 6] - Z[ob + 6]); if (dl >= TH) continue;
    const ca = Z[oa + 7], cb = Z[ob + 7];
    if (ca === cb && ca === Z[oa + 8] && ca === Z[oa + 9] && cb === Z[ob + 8] && cb === Z[ob + 9]) continue;
    if (!overlap(A, B)) continue;
    // пару считаем один раз — в клетке левого-нижнего угла пересечения рамок
    const ix = Math.max(Math.min(Z[oa], Z[oa + 2], Z[oa + 4]), Math.min(Z[ob], Z[ob + 2], Z[ob + 4]));
    const iz = Math.max(Math.min(Z[oa + 1], Z[oa + 3], Z[oa + 5]), Math.min(Z[ob + 1], Z[ob + 3], Z[ob + 5]));
    if (Math.floor(ix / CS) * 100003 + Math.floor(iz / CS) !== k) continue;
    const P = common(oa, ob); if (!P) continue;
    const c1 = colAt(oa, P[0], P[1]), c2 = colAt(ob, P[0], P[1]);
    const dc = Math.max(Math.abs(c1[0] - c2[0]), Math.abs(c1[1] - c2[1]), Math.abs(c1[2] - c2[2]));
    if (dc < +(window.__DC || 5)) continue;
    const la = Z[oa + 6], lb = Z[ob + 6];
    const key = (la <= lb ? [la, lb, ca, cb] : [lb, la, cb, ca]);
    const kk = key[0].toFixed(4) + '/' + key[1].toFixed(4) + ' ' + hex(key[2]) + '/' + hex(key[3]) + ' ' + ((window.__ZFT || [])[Z[oa + 10] % 10000] || "?") + ' & ' + ((window.__ZFT || [])[Z[ob + 10] % 10000] || "?");
    let r = R.get(kk); if (!r) R.set(kk, r = { n: 0, at: [] });
    r.n++; r.dc = Math.max(r.dc || 0, dc); if (r.at.length < 3) r.at.push([Math.round(P[0]), Math.round(P[1])]);
  }
}
const top = [...R.entries()].sort((a, b) => b[1].n - a[1].n);
return { tris: N, skipped, groups: top.length, pairs: top.reduce((s, e) => s + e[1].n, 0), top: top.slice(0, +(window.__TOP || 60)).map(([k, v]) => k + ' ×' + v.n + ' dc' + Math.round(v.dc) + ' ' + JSON.stringify(v.at)) };
