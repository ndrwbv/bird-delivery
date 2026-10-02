/* Заказы только в открытых районах (для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/orders-open.js).
   Открыто 1…8 районов, работаешь в новейшем и в первом; смены без езды (ORD.simShift) на
   разных номерах заказа за карьеру. Каждый адрес: его район и район ближайшей дороги —
   открыты (< DIST.opened()), и адрес — в районе, где работаешь.
   Адрес заказа — ключ ORD.POOL (keyOf: x/4 и z/4 в base36); нет в пуле — раскодируем ключ. */
const DI = d.DIST, ORD = d.ORD, N = DI.list().length, LIFES = [0, 12, 40, 90], PER = 90;
if (!N) return { skip: 'на этой карте нет районов' };
const dec = k => { const [a, b] = k.split('.'); return { x: parseInt(a, 36) * 4, z: parseInt(b, 36) * 4 }; };
let total = 0, unmapped = 0, shifts = 0;
const bad = [];
const t0 = performance.now();
for (let n = 1; n <= N; n++) {
  d.Store.set('dlv-dist-open', n);
  for (const w of [...new Set([n - 1, 0])]) {
    DI.set(w);
    for (const life of LIFES) {
      const out = ORD.simShift(PER, 9, 23.5, life);
      shifts++;
      const pool = new Map(ORD.POOL.map(p => [p.key, p]));
      for (const o of out) for (const k of o.keys) {
        total++;
        let p = pool.get(k);
        if (!p) { unmapped++; p = dec(k); }
        const di = DI.at(p.x, p.z), r = d.nearestRoad(p.x, p.z, 60, 1), rd = r ? DI.at(r.x, r.z) : di, op = DI.opened();
        if (di >= op || rd >= op || di !== w) bad.push({ open: n, work: w, life, key: k, at: di, road: rd, type: o.type });
      }
    }
  }
}
return { ok: !bad.length, total, bad: bad.length, sample: bad.slice(0, 5), unmapped, shifts, ms: Math.round(performance.now() - t0) };
