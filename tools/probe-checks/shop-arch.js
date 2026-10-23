/* Магазины и арки (для npm run check; можно и так: npm run probe -- --eval=tools/probe-checks/shop-arch.js --q=winlog).
   Нужен ?winlog — окна домов копятся списком (windows.js). Проверяем:
     • 0п17 — у каждого магазина ни одно окно дома не пересекает вывеску, дверь (1,5 × 2,3 м) и витрину первого этажа
       (не уже 3,6 м, от 0,5 до 2,7 м над землёй): окна той же стены (нормаль, плоскость ±0,5 м), нахлёст больше 5 см;
     • 0с — ни вывеска, ни дверь магазина, ни дверь подъезда, ни ворота не стоят в устье арки (с улицы и со двора):
       вдоль стены ближе половины арки + полвещи, поперёк — ближе 1,5 м;
     • 0п25 — у каждой арки проезд сквозь неё: ось тоннеля от 1,5 м перед аркой до 1,5 м за ней — вся на асфальте,
       и от обоих устьев по асфальту (клетки 1 м, не дальше 45 м) можно доехать до настоящей улицы или дворового проезда. */
const R = { shops: 0, shopBad: 0, winBad: 0, by: { sign: 0, door: 0, vitrine: 0 }, sample: [], arches: d.ARCHES.length, archItems: 0, itemsBy: {}, archNoRoad: 0, archSample: [], itemSample: [] };
const WL = d.WIN && d.WIN.log;
if (!WL) return { err: 'нет списка окон: запускать с --q=winlog' };
// окна по клеткам 8 м
const WG = new Map(), C = 8, key = (i, j) => i * 100003 + j;
for (const q of WL) { const k = key(Math.floor(q[0] / C), Math.floor(q[2] / C)); let a = WG.get(k); if (!a) WG.set(k, a = []); a.push(q); }
const winsNear = (x, z, r, out) => {
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (const q of WG.get(key(i, j)) || []) out.push(q);
  return out;
};
for (const s of d.SIGNS) {
  if (s.w === undefined) continue;
  R.shops++;
  const tx = s.nz, tz = -s.nx, rects = [['sign', s.w / 2, s.y0, s.y0 + s.hgt]];
  if (!s.row) rects.push(['door', 0.75, s.gy, s.gy + 2.3], ['vitrine', s.vw / 2, s.gy + 0.5, s.gy + 2.7]);
  let bad = 0;
  for (const q of winsNear(s.x, s.z, 6, [])) {
    if (q[3] * s.nx + q[4] * s.nz < 0.9) continue;
    const dx = q[0] - s.x, dz = q[2] - s.z;
    if (Math.abs(dx * s.nx + dz * s.nz) > 0.5) continue;              // другая стена
    const a = dx * tx + dz * tz, wy0 = q[1] - q[6] / 2, wy1 = q[1] + q[6] / 2;
    for (const [k, half, y0, y1] of rects) {
      if (Math.abs(a) >= half + q[5] / 2 - 0.05 || Math.min(y1, wy1) - Math.max(y0, wy0) <= 0.05) continue;
      bad++; R.winBad++; R.by[k]++;
      if (R.sample.length < 6) R.sample.push([k, s.n, Math.round(s.x), Math.round(s.z), +a.toFixed(1), +(wy0 - s.gy).toFixed(1)]);
    }
  }
  if (bad) R.shopBad++;
}
// 0с: вещи в устье арки
const items = [];
for (const s of d.SIGNS) { items.push(['sign', s.x, s.z, (s.w || 3) / 2, s.n]); if (!s.row) items.push(['shopdoor', s.x, s.z, 0.75, s.n]); }
for (const e of d.CITY.entrances) items.push(['door', e[0], e[1], 0.75]);
for (const e of d.GEN_ENTR) items.push(['door', e[0], e[1], 0.75]);
for (const g of d.CITY.gates || []) items.push(['gate', g[0], g[1], (g[4] || 4) / 2 + 0.3]);
const IG = new Map();
for (const it of items) { const k = key(Math.floor(it[1] / 16), Math.floor(it[2] / 16)); let a = IG.get(k); if (!a) IG.set(k, a = []); a.push(it); }
// асфальт: полотно любой дороги, кроме пешеходки и моста; «настоящая» — не проезд арки
const RS = d.RSEG, RG = new Map(), RC = 32;
RS.forEach(s => {
  if (s.c === 6 || s.b) return;
  const m = s.w / 2 + 1;
  for (let i = Math.floor((Math.min(s.x1, s.x2) - m) / RC); i <= Math.floor((Math.max(s.x1, s.x2) + m) / RC); i++)
    for (let j = Math.floor((Math.min(s.z1, s.z2) - m) / RC); j <= Math.floor((Math.max(s.z1, s.z2) + m) / RC); j++) { const k = key(i, j); let a = RG.get(k); if (!a) RG.set(k, a = []); a.push(s); }
});
const asph = (x, z) => {   // 0 — газон, 1 — проезд арки, 2 — улица или дворовый проезд
  let v = 0;
  for (const s of RG.get(key(Math.floor(x / RC), Math.floor(z / RC))) || []) {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / l2));
    if (Math.hypot(x - s.x1 - dx * t, z - s.z1 - dz * t) < s.w / 2 - 0.2) { if (!s.arch) return 2; v = 1; }
  }
  return v;
};
const reach = (x0, z0) => {   // от точки по асфальту до настоящей дороги, клетки 1 м
  if (!asph(x0, z0)) return false;
  const seen = new Set([0]), open = [[0, 0]];
  while (open.length) {
    const [i, j] = open.shift(), x = x0 + i, z = z0 + j, v = asph(x, z);
    if (v === 2) return true;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + a, nj = j + b, k = ni * 1000 + nj;
      if (seen.has(k) || Math.hypot(ni, nj) > 45 || !asph(x0 + ni, z0 + nj)) continue;
      seen.add(k); open.push([ni, nj]);
    }
  }
  return false;
};
for (const a of d.ARCHES) {
  const ux = a.ux, uz = a.uz, W = 2.6;
  for (const k of [0, 1]) {
    const cx = a.mx + a.ix * a.t * k, cz = a.mz + a.iz * a.t * k;
    for (let i = Math.floor((cx - 8) / 16); i <= Math.floor((cx + 8) / 16); i++)
      for (let j = Math.floor((cz - 8) / 16); j <= Math.floor((cz + 8) / 16); j++)
        for (const it of IG.get(key(i, j)) || []) {
          const dx = it[1] - cx, dz = it[2] - cz;
          if (Math.abs(dx * ux + dz * uz) >= W + it[3] || Math.abs(dx * a.ix + dz * a.iz) >= 1.5) continue;
          R.archItems++; R.itemsBy[it[0]] = (R.itemsBy[it[0]] || 0) + 1;
          if (R.itemSample.length < 6) R.itemSample.push([it[0], it[4] || '', Math.round(it[1]), Math.round(it[2]), k ? 'двор' : 'улица']);
        }
  }
  let ok = true;
  for (let s = -1.5; s <= a.t + 1.5 && ok; s += 1) if (!asph(a.mx + a.ix * s, a.mz + a.iz * s)) ok = false;
  if (ok) ok = reach(a.mx - a.ix * 1.5, a.mz - a.iz * 1.5) && reach(a.mx + a.ix * (a.t + 1.5), a.mz + a.iz * (a.t + 1.5));
  if (!ok) { R.archNoRoad++; if (R.archSample.length < 6) R.archSample.push([Math.round(a.mx), Math.round(a.mz)]); }
}
R.windows = WL.length;
R.ok = !R.shopBad && !R.archItems && !R.archNoRoad && R.arches > 0;
return R;
