/* Камера под аркой и мостом (camroof.js, 0п40, автор 24.10.2026: «в арку заезжаешь — камера должна быть за машиной, а
   сейчас сквозь потолок идёт»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/cam-roof.js --size=deck --max=0 --timeout=400 --q="shots=/папка"
   (`--q=oldroof` — как было). Машина едет по проезду арки (с улицы сквозь тоннель во двор, ~9 м/с) — прямоугольная,
   круглая, с воротами — по улице под мостом (в Солнечном таких нет: все мосты низкие, над ручьями) и под навесом АЗС; виды «сзади, высоко» и «сзади, близко». Каждый кадр:
     over  — на сколько камера выше свода над собой (м; > 0 — сквозь потолок), кадров сквозь потолок;
     sight — кадров, где от камеры до машины — сквозь дом или свод (не через проём);
     jump  — самый большой шаг камеры за кадр (м) и самый резкий поворот взгляда (град за кадр);
     minK / maxK — насколько «под крышей» (camroof.js k) пока машина в тоннеле. */
const Q = new URLSearchParams(location.search), DIR = Q.get('shots') || '', TR = Q.get('trace') ? Q.get('trace').split(':') : null;
const V = d.V, cam = d.cam, R = d.ROOF, IN = d.IN;
const out = { pick: {}, runs: {} };
await ride();
d.S.paused = false;
await run(0.5);

const AR = d.ARCHES.filter(a => a.drive && a.drive.length >= 4);
const pick = {
  rect: AR.find(a => !a.round && !a.gate),
  round: AR.find(a => a.round && !a.gate),
  gate: AR.find(a => a.gate === 'iron') || AR.find(a => a.gate),
};
// мост над улицей: кусок улицы (не моста), над серединой которого настил выше на 5+ м
let under = null;
for (const s of d.RSEG) {
  if (s.b || s.c > 5 || s.arch) continue;
  const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  for (let f = 0.1; f < 0.9 && !under; f += 0.1) {
    const x = s.x1 + (s.x2 - s.x1) * f, z = s.z1 + (s.z2 - s.z1) * f, up = d.surfaceAt(x, z) - d.groundH(x, z);
    if (up > 4.5 && up < 14 && L > 20) under = { s, x, z, up };
  }
  if (under) break;
}
for (const k in pick) if (pick[k]) out.pick[k] = { x: +pick[k].mx.toFixed(1), z: +pick[k].mz.toFixed(1), t: +pick[k].t.toFixed(1), crownUp: +(pick[k].crown - d.groundH(pick[k].mx, pick[k].mz)).toFixed(2), gate: pick[k].gate || null };
if (under) out.pick.bridge = { x: +under.x.toFixed(1), z: +under.z.toFixed(1), deckUp: +under.up.toFixed(2) };

/* ломаная пути: проезд арки (с улицы во двор), перед ним — 25 м по улице назад от первой точки */
function pathOf (pts, pre) {
  const P = pts.map(p => [p[0], p[1]]);
  const dx = P[1][0] - P[0][0], dz = P[1][1] - P[0][1], l = Math.hypot(dx, dz) || 1;
  P.unshift([P[0][0] - dx / l * pre, P[0][1] - dz / l * pre]);
  const acc = [0];
  for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, acc, L: acc[acc.length - 1] };
}
function at (pa, s) {
  const { P, acc } = pa;
  let i = 1;
  while (i < P.length - 1 && acc[i] < s) i++;
  const f = Math.max(0, Math.min(1, (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1)));
  return { x: P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, z: P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f, h: Math.atan2(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) };
}
/* от камеры до машины (1 м над ней) — сквозь дом (не арку) или выше свода? */
function blocked () {
  const ex = V.x, ey = V.y + 1, ez = V.z, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  const L = Math.hypot(ex - cx, ez - cz), n = Math.max(2, Math.ceil(L / 0.25));
  for (let i = 2; i < n - 4; i++) {          // у самой машины не считаем (её кузов)
    const f = i / n, x = cx + (ex - cx) * f, y = cy + (ey - cy) * f, z = cz + (ez - cz) * f;
    const c = R.ceilAt(x, z, V.y);
    if (c < Infinity && y > c) return 'roof';
    if (R.inHouse(x, z) && !R.inArch(x, z) && c === Infinity) return 'house';
  }
  return null;
}
async function drive (name, pa, mode, shotAt) {
  d.CAMV.set(mode, false);
  let s = 0, t0 = null, last = null, lastDir = null;
  const st = { frames: 0, overFrames: 0, over: -99, sight: 0, sightWhy: {}, jump: 0, turn: 0, minK: 1, maxK: 0, inT: 0, minCamUp: 99, camUpIn: [] };
  const sp = 9;
  const p0 = at(pa, 0);
  tp(p0.x, p0.z, p0.h); V.x = p0.x; V.z = p0.z; V.y = d.surfaceAt(V.x, V.z);
  await run(0.6);
  let done = false, shotDone = !shotAt;
  const step = now => {
    if (done) return;
    requestAnimationFrame(step);
    if (t0 === null) { t0 = now; return; }
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    s += sp * dt;
    if (s >= pa.L) { done = true; return; }
    const q = at(pa, s);
    V.x = q.x; V.z = q.z; V.h += Math.atan2(Math.sin(q.h - V.h), Math.cos(q.h - V.h)) * Math.min(1, dt * 8);
    V.vx = Math.sin(V.h) * sp; V.vz = Math.cos(V.h) * sp; IN.gas = 1;
    // камера этого кадра (стоит после шага мира прошлого кадра)
    const c = R.ceilAt(cam.position.x, cam.position.z, V.y);
    st.frames++;
    if (c < Infinity) { const o = cam.position.y - c; st.over = Math.max(st.over, +o.toFixed(2)); if (o > 0) st.overFrames++; }
    const inT = R.ceilAt(V.x, V.z, V.y) < Infinity;
    if (inT) { st.inT++; st.minK = Math.min(st.minK, R.RF.k); st.camUpIn.push(+(cam.position.y - V.y).toFixed(2)); }
    st.maxK = Math.max(st.maxK, R.RF.k);
    const b = blocked(); if (b) { st.sight++; st.sightWhy[b] = (st.sightWhy[b] || 0) + 1; }
    const p = cam.position.clone();
    if (TR && TR[0] === name + '-' + mode && s >= +TR[1] && s <= +TR[2]) (out.trace = out.trace || []).push([+s.toFixed(1), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +R.RF.k.toFixed(2), +(V.camPull || 0).toFixed(2), +(V.camRP || 0).toFixed(2), +(Math.hypot(p.x - V.x, p.z - V.z)).toFixed(2), +V.camH.toFixed(3), +V.h.toFixed(3), +(d.S.shake || 0).toFixed(2)]);
    if (last) { const j = p.distanceTo(last); st.jump = Math.max(st.jump, +j.toFixed(3)); if (j > 0.6) (st.jumps = st.jumps || []).push({ s: +s.toFixed(1), j: +j.toFixed(2), k: +R.RF.k.toFixed(2), dy: +(p.y - last.y).toFixed(2) }); }
    const dir = cam.getWorldDirection(p.clone());
    if (lastDir) st.turn = Math.max(st.turn, +(dir.angleTo(lastDir) * 180 / Math.PI).toFixed(2));
    last = p; lastDir = dir;
    if (!shotDone && inT && R.RF.k > 0.95 && s > shotAt) shotDone = 'go';
  };
  requestAnimationFrame(step);
  while (!done) {
    await wait(50);
    if (shotDone === 'go') { shotDone = true; if (DIR) await shot(DIR + '/' + name + '-' + mode + '.png'); }
  }
  IN.gas = 0; V.vx = V.vz = 0;
  const ups = st.camUpIn; st.camUpIn = ups.length ? { min: Math.min(...ups), max: Math.max(...ups) } : null;
  st.minK = +st.minK.toFixed(2); st.maxK = +st.maxK.toFixed(2);
  return st;
}
for (const k of ['rect', 'round', 'gate']) {
  const a = pick[k];
  if (!a) continue;
  const pa = pathOf(a.drive, 25);
  // кадр — в середине тоннеля: расстояние по пути до середины
  let sMid = 0; { let best = 1e9; for (let s2 = 0; s2 < pa.L; s2 += 0.5) { const q = at(pa, s2), dd = Math.hypot(q.x - a.x, q.z - a.z); if (dd < best) { best = dd; sMid = s2; } } }
  for (const m of ['high', 'near']) out.runs[k + '-' + m] = await drive(k, pa, m, sMid);
}
// со двора на улицу (прямоугольная, наоборот) и мимо арок вдоль фасада в 6 м от устья с улицы (k не должен расти)
if (pick.rect) {
  const a = pick.rect, pa = pathOf(a.drive.slice().reverse(), 25);
  out.runs['rectBack-high'] = await drive('rectBack', pa, 'high', 1e9);
}
for (const a of AR.slice(0, 12)) {
  const P0 = (u, n) => [a.mx + a.ux * u - a.ix * n, a.mz + a.uz * u - a.iz * n];
  const pa = pathOf([P0(-30, 6), P0(0, 6), P0(30, 6)], 0);
  const r = await drive('pass', pa, 'high', 1e9);
  out.pass = out.pass || { maxK: 0, over: 0, n: 0 };
  out.pass.maxK = Math.max(out.pass.maxK, r.maxK); out.pass.over += r.overFrames; out.pass.n++;
}
const fr = d.ROOF.FUEL_ROOFS && d.ROOF.FUEL_ROOFS[0];
if (fr) {
  out.pick.fuel = { x: +fr.x.toFixed(1), z: +fr.z.toFixed(1), roofUp: +(fr.y - d.groundH(fr.x, fr.z)).toFixed(2) };
  const P0 = (u, n) => [fr.x + fr.ux * u + fr.nx * n, fr.z + fr.uz * u + fr.nz * n];
  const pa = pathOf([P0(-30, -4.6), P0(0, -4.6), P0(30, -4.6)], 0);
  for (const m of ['high', 'near']) out.runs['fuel-' + m] = await drive('fuel', pa, m, 30);
}
if (under) {
  const s = under.s, dx = s.x2 - s.x1, dz = s.z2 - s.z1, l = Math.hypot(dx, dz);
  const pa = pathOf([[under.x - dx / l * 30, under.z - dz / l * 30], [under.x, under.z], [under.x + dx / l * 30, under.z + dz / l * 30]], 0);
  for (const m of ['high', 'near']) out.runs['bridge-' + m] = await drive('bridge', pa, m, 29);
}
out.stats = d.ROOF.STATS;
d.CAMV.set('high', false);
return out;
