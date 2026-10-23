/* Плавные улицы (11ч, этап 4): адреса, подъезды и фасады без и с ?smooth — что поменялось.
   npm run probe -- --eval=tools/probe-checks/smooth-addr.js --max=0 > a.json
   npm run probe -- --eval=tools/probe-checks/smooth-addr.js --max=0 --q=smooth > b.json
   node tools/smooth-addr-diff.cjs a.json b.json
   houses — по адресу: same / moved (сдвинулся, смотрит туда же) / turned (фасад на соседнюю стену) / flipped (на противоположную);
   entr, spots — точки: same (ближе 5 см), near (до 5 м), gone / added. */
const fs = require('fs');
const rd = f => { const t = fs.readFileSync(f, 'utf8').split('\n').find(l => l.startsWith('{"smooth"')); return JSON.parse(t); };
const A = rd(process.argv[2]), B = rd(process.argv[3]);
// дома: по адресу
const hb = new Map(); for (const h of B.houses) { if (!hb.has(h[0])) hb.set(h[0], []); hb.get(h[0]).push(h); }
const out = { houses: { a: A.houses.length, b: B.houses.length, same: 0, moved: 0, turned: 0, flipped: 0, missing: 0, list: [] } };
for (const h of A.houses) {
  const c = (hb.get(h[0]) || []).sort((p, q) => Math.hypot(p[1] - h[1], p[2] - h[2]) - Math.hypot(q[1] - h[1], q[2] - h[2]))[0];
  if (!c) { out.houses.missing++; continue; }
  const dpos = Math.hypot(c[1] - h[1], c[2] - h[2]), dot = (c[3] * h[3] + c[4] * h[4]) / (Math.hypot(c[3], c[4]) * Math.hypot(h[3], h[4]) || 1);
  if (dpos < 0.05 && Math.abs(c[3] - h[3]) < 0.011 && Math.abs(c[4] - h[4]) < 0.011) { out.houses.same++; continue; }
  const k = dot < -0.5 ? 'flipped' : dot < 0.95 ? 'turned' : 'moved';
  out.houses[k]++;
  if (out.houses.list.length < 40) out.houses.list.push({ addr: h[0], k, at: [Math.round(h[1]), Math.round(h[2])], to: [Math.round(c[1]), Math.round(c[2])], dpos: +dpos.toFixed(1), deg: Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI) });
}
// точки: совпадение ближе 0,05 м
const pts = (P, Q, tag) => {
  const g = new Map(), key = (x, z) => Math.floor(x / 5) + ',' + Math.floor(z / 5);
  Q.forEach((q, i) => { const k = key(q[0], q[1]); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
  const used = new Set(); let same = 0, near = 0; const gone = [];
  for (const p of P) {
    let bi = -1, bd = Infinity;
    const i0 = Math.floor(p[0] / 5), j0 = Math.floor(p[1] / 5);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const ix of g.get(i + ',' + j) || []) { if (used.has(ix)) continue; const d = Math.hypot(Q[ix][0] - p[0], Q[ix][1] - p[1]); if (d < bd) { bd = d; bi = ix; } }
    if (bi >= 0 && bd < 0.05) { same++; used.add(bi); } else if (bi >= 0 && bd < 5) { near++; used.add(bi); } else gone.push(p.slice(0, 2).map(Math.round));
  }
  const added = Q.filter((q, i) => !used.has(i)).map(q => q.slice(0, 2).map(Math.round));
  return { a: P.length, b: Q.length, same, near, gone: gone.length, added: added.length, goneAt: gone.slice(0, 12), addedAt: added.slice(0, 12) };
};
out.entr = pts(A.entr, B.entr);
out.spots = pts(A.spots, B.spots);
console.log(JSON.stringify(out, null, 1));
