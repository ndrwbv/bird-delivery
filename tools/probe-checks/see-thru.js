/* Деревья между камерой и машиной тают (seethru.js, 0п47) и удар: камера «клюёт», крошки на асфальт (11би). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/see-thru.js --size=deck --max=0 --timeout=400 --q="shots=/папка&stseason=2.4"
   stseason — сезон (2.4 — разгар зимы, 0.4 — разгар лета; по умолчанию — как выпало), stn — сколько мест (2), stoff — с какого дерева.
   Машина стоит носом от дерева в 6,5 м перед ним — камера сзади за деревом. Кадры «до» (__dlv.SEE.off) и «после» в видах
   «сзади, высоко» и «сзади, близко»; потом удар о стену на 60 км/ч: сдвиг камеры по кадрам, крошек лежит через 3 с. */
const Q = new URLSearchParams(location.search), DIR = Q.get('shots') || '', SEA = Q.get('stseason'), N = +(Q.get('stn') || 2), OFF0 = +(Q.get('stoff') || 0);
const V = d.V, cam = d.cam;
await ride();
d.S.paused = false;
await until(() => d.LATE && !d.LATE.busy(), 90000);
if (SEA) d.season.set(+SEA);
const hold = (x, z, h) => {
  V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z); V.vx = V.vz = 0; V.hero = 0;
  for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0;
  d.ENV.t = d.ECON.tOfHour(13);
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
};
const clear = (x, z) => !d.inWall(x, z, 1.2);
/* места: дерево позади машины, от машины назад на 14 м — ни стены, ни дома (камера не подходит) */
const trees = d.SOLIDS.filter(s => s.tree && !s.shrub && !s.edGone);
const spots = [];
for (let i = OFF0; i < trees.length && spots.length < N; i += 37) {
  const t = trees[i];
  for (let a = 0; a < 8; a++) {
    const h = a * Math.PI / 4, fx = Math.sin(h), fz = Math.cos(h);
    const x = t.cx + fx * 6.5, z = t.cz + fz * 6.5;
    let ok = clear(x, z) && clear(x + fx * 3, z + fz * 3);
    for (let b = 2; b <= 14 && ok; b += 1) if (b < 5.5 || b > 7.5) ok = clear(x - fx * b, z - fz * b);
    // другое дерево ближе 2,5 м к машине — не то место
    if (ok && d.SOLIDS.some(o => o.tree && o !== t && Math.hypot(o.cx - x, o.cz - z) < 2.5)) ok = false;
    if (ok) { spots.push({ x, z, h, tx: t.cx, tz: t.cz }); break; }
  }
}
const out = { season: d.SEAS ? d.SEAS.seasonName ? d.SEAS.seasonName() : null : null, trees: trees.length, spots: [] };
for (let si = 0; si < spots.length; si++) {
  const p = spots[si], rec = { x: +p.x.toFixed(1), z: +p.z.toFixed(1) };
  if (SEA) d.season.set(+SEA);
  for (const m of ['high', 'near']) {
    d.CAMV.set(m, false);
    for (const off of [true, false]) {
      d.SEE.off = off;
      for (let k = 0; k < 40; k++) { hold(p.x, p.z, p.h); await wait(50); }
      // дерево между камерой и машиной? (расстояние ствола до луча камера → машина)
      const cx = cam.position.x, cz = cam.position.z, dx = V.x - cx, dz = V.z - cz, L = Math.hypot(dx, dz);
      const tt = ((p.tx - cx) * dx + (p.tz - cz) * dz) / L, q = Math.abs((p.tx - cx) * dz - (p.tz - cz) * dx) / L;
      rec[m + (off ? 'Off' : 'On')] = { w: +d.SEE.w.toFixed(2), camBack: +L.toFixed(1), treeAt: +tt.toFixed(1), treeOff: +q.toFixed(2) };
      if (DIR) await shot(DIR + '/see-' + si + '-' + m + '-' + (off ? 'before' : 'after') + '.png');
    }
  }
  out.spots.push(rec);
}
d.SEE.off = false;
/* удар: машина на 60 км/ч носом в стену дома — камера по кадрам. Место: от дороги вперёд 10—13 м свободно, дальше — дом */
d.CAMV.set(Q.get('sthit') || 'high', false);
const C = d.CRASH;
let hitRec = null;
for (let i = 0; i < d.RSEG.length && !hitRec; i += 7) {
  const s = d.RSEG[i];
  if (s.b || s.arch) continue;
  const x = (s.x1 + s.x2) / 2, z = (s.z1 + s.z2) / 2, ux = s.x2 - s.x1, uz = s.z2 - s.z1, l = Math.hypot(ux, uz);
  if (l < 20) continue;
  for (const sg of [1, -1]) {
    const ax = -uz / l * sg, az = ux / l * sg;   // поперёк улицы
    let free = 0;
    while (free < 20 && clear(x + ax * free, z + az * free)) free += 0.5;
    if (free < 10 || free > 16 || !d.inWall(x + ax * (free + 1), z + az * (free + 1), 0)) continue;
    let ok = true;
    for (let b = 1; b <= 16 && ok; b++) ok = clear(x - ax * b, z - az * b);
    if (ok) { hitRec = { x, z, h: Math.atan2(ax, az), free }; break; }
  }
}
if (hitRec) {
  if (SEA) d.season.set(+SEA);
  const sp = 60 / 3.6, c0 = C.CR.spawned;
  for (let k = 0; k < 30; k++) { hold(hitRec.x, hitRec.z, hitRec.h); await wait(50); }
  V.vx = Math.sin(V.h) * sp; V.vz = Math.cos(V.h) * sp; d.IN.gas = 1;
  const trace = [];
  let t0 = performance.now(), hit = -1, n0 = d.JOLT.n;
  while (performance.now() - t0 < 2500) {
    await new Promise(r => requestAnimationFrame(r));
    const fx = Math.sin(V.h), fz = Math.cos(V.h);
    const rel = (cam.position.x - V.x) * fx + (cam.position.z - V.z) * fz;   // камера вдоль хода от машины
    if (d.JOLT.n !== n0 && hit < 0) hit = trace.length;
    trace.push([+((performance.now() - t0) / 1000).toFixed(3), +rel.toFixed(2), +Math.hypot(V.vx, V.vz).toFixed(1), +(d.JOLT.t || 0).toFixed(3), +(d.JOLT.d || 0).toFixed(3)]);
    if (hit >= 0 && trace.length - hit > 30) break;
  }
  d.IN.gas = 0;
  if (DIR && hit >= 0) { /* кадр крошек */ for (let k = 0; k < 30; k++) { V.vx = V.vz = 0; await wait(50); } await shot(DIR + '/crumbs.png'); }
  await wait(2500);
  out.hit = { at: [Math.round(hitRec.x), Math.round(hitRec.z)], jolt: d.JOLT.last, joltN: d.JOLT.n - n0, crumbs: C.CR.spawned - c0, crumbLast: C.CR.last, lying: C.CR.alive.filter(t => t > 0).length,
    trace: hit >= 0 ? trace.slice(Math.max(0, hit - 3), hit + 16) : trace.slice(-10) };
}
return out;
