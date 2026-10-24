/* Машина о машину (0п38, 24.10.2026; carhit.js, docs/CAREER.md «Чужие машины мнутся и бьются» → «Машина о машину»).
   npm run check -- --only=carhit; или npm run probe -- --eval=tools/probe-checks/car-hit.js --max=0 --timeout=300
   [--q=chshots=/папка — кадры полным размером].
   Каждый случай — дважды: «было» (CHIT.CH.on = false — как до 24.10) и «стало», на разных машинах. Водитель не выходит
   (FW.OUT = 0). 3 с после удара, каждый кадр: насколько кузов толкнутой машины (прямоугольник hl × hw) заходит в кузов
   любой другой машины рядом (поток, стоящие у бордюра и во дворах, автобус) — после шага игры.
   1. «отбросило в стоящую» — стоящую у бордюра отбрасывает ударом (knockCar, 14 м/с) вдоль ряда в соседнюю (в 4,5—9 м);
   2. «толкнул в стоящую» — курьер медленно (газ, ~3 м/с) толкает стоящую у бордюра в соседнюю;
   3. «поток в стоящую» — машину потока ставим в 7 м за стоящей у бордюра по линии ряда (пусто: ни машин, ни твёрдого) и
      отбрасываем ударом (knockCar, 16 м/с — как от курьера на ~60 км/ч) прямо в неё; удар должен случиться (CHIT.ST.hits);
   4. «во дворе» — стоящую во дворе отбрасывает (14 м/с) в соседнюю по карману.
   ok — во всех «стало»: глубже 5 см ни разу (pen ≤ 0,05); отброшенная — та, в которую попали, сдвинута или помята. */
const V = d.V, IN = d.IN, TR = d.TRAFFIC, CHIT = d.CHIT, YC = d.YCARS;
const Q = new URLSearchParams(location.search), SHOTS = Q.get('chshots') || '';
const out = { on: CHIT ? CHIT.CH.on : null, runs: [], st: null, ok: false };
if (!CHIT) return { err: 'нет __dlv.CHIT' };
await onShift();
autopilot(true); await run(4, 2); autopilot(false); IN.gas = 0;
const frame = () => new Promise(r => requestAnimationFrame(r));
const paused = () => !!(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) || !!(d.CH && d.CH.opts && d.CH.opts.length) || (d.S.paused && d.S.state !== 'over');
async function unstall () { if (!paused()) return; autopilot(true); await until(() => !paused(), 5000); autopilot(false); IN.gas = 0; }
const FWC = d.FW && d.FW.FW, OUT0 = FWC ? FWC.OUT : 0;
if (FWC) FWC.OUT = 0;
const used = new Set();
const yardOf = t => !!(t.pk && t.pk.yc);
const all = () => { const s = new Set(TR); if (YC) for (const t of YC.CARS) s.add(t); return [...s].filter(t => !t.gone); };
const fwd = t => [Math.sin(t.h), Math.cos(t.h)];
/* пара в ряд: a — с краю ряда (за ней с другой стороны 9 м пусто), b — следующая */
function rowPair (list) {
  const best = [];
  for (const a of list) {
    if (used.has(a) || Math.hypot(a.x - V.x, a.z - V.z) > 1500) continue;
    const [fx, fz] = fwd(a);
    for (const b of list) {
      if (b === a || used.has(b)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, al = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
      if (Math.abs(al) < 4.5 || Math.abs(al) > 9 || lat > 1) continue;
      const sg = Math.sign(al);
      if (list.some(o => o !== a && o !== b && Math.hypot(o.x - (a.x - fx * sg * 6), o.z - (a.z - fz * sg * 6)) < 4)) continue;
      best.push([a, b, sg, Math.hypot(a.x - V.x, a.z - V.z)]);
      break;
    }
    if (best.length > 30) break;
  }
  return best.sort((p, q) => p[3] - q[3])[0] || null;
}
/* насколько a заходит в любую другую (м; 0 — не заходит) */
function penOf (a) {
  let w = 0, who = null;
  for (const b of all()) {
    if (b === a || Math.abs(b.x - a.x) > 10 || Math.abs(b.z - a.z) > 10) continue;
    const P = CHIT.overlap(a, b);
    if (P && P.pen > w) { w = P.pen; who = b; }
  }
  return [w, who];
}
async function watch (R, a, b, secs, push) {
  let bad = 0, max = 0, n = 0;
  const b0 = b ? [b.x, b.z] : null, a0 = [a.x, a.z], gap0 = b ? +Math.hypot(b.x - a.x, b.z - a.z).toFixed(1) : 0, T0 = performance.now();
  let shot1 = false;
  while (performance.now() - T0 < secs * 1000) {
    if (push) push();
    await frame();
    if (paused()) { await unstall(); continue; }
    d.S.hp = Math.max(d.S.hp, 6);
    const [p] = penOf(a);
    n++; max = Math.max(max, p); if (p > 0.05) bad++;
    if (SHOTS && !shot1 && performance.now() - T0 > 700) { shot1 = true; await shot(SHOTS + '/carhit-' + R.k + '-' + (CHIT.CH.on ? 'new' : 'old') + '.png'); }
  }
  IN.gas = 0;
  Object.assign(R, { frames: n, maxPen: +max.toFixed(2), badFrames: bad });
  R.aMoved = +Math.hypot(a.x - a0[0], a.z - a0[1]).toFixed(2); R.gap = gap0;
  if (b) Object.assign(R, { bMoved: +Math.hypot(b.x - b0[0], b.z - b0[1]).toFixed(2), bDmg: +((b.mesh && b.mesh.userData.dmg) || 0).toFixed(2), bKnock: !!b.knock, aDmg: +((a.mesh && a.mesh.userData.dmg) || 0).toFixed(2) });
}
function cam (x, z, fx, fz) { V.camX = x - fx * 9 + fz * 4; V.camZ = z - fz * 9 - fx * 4; V.camH = Math.atan2(fx, fz); V.camY = d.surfaceAt(x, z) + 5; }
function park (t) { V.x = t.x + 25; V.z = t.z + 25; V.vx = V.vz = 0; }

async function knockRow (k, yard) {
  const list = yard ? (YC ? YC.CARS.filter(t => !t.gone && t.parked && !t.knock) : []) : TR.filter(t => !t.gone && t.parked && !yardOf(t) && !t.lux && !t.knock && !t.mp && t.model !== 'moped' && !t.accident);
  const pr = rowPair(list);
  const R = { k, on: CHIT.CH.on };
  if (!pr) { R.none = 1; out.runs.push(R); return; }
  const [a, b, sg] = pr; used.add(a); used.add(b);
  await unstall();
  const [fx, fz] = fwd(a);
  V.x = a.x - fz * 9; V.z = a.z + fx * 9; V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z);   // курьер — сбоку, не мешает
  cam(a.x, a.z, fx * sg, fz * sg);
  await frame();
  d.knockCar(a, fx * sg, fz * sg, 14);
  await watch(R, a, b, 3);
  out.runs.push(R);
}
async function pushRow (k) {
  const pr = rowPair(TR.filter(t => !t.gone && t.parked && !yardOf(t) && !t.lux && !t.knock && !t.mp && t.model !== 'moped' && !t.accident));
  const R = { k, on: CHIT.CH.on };
  if (!pr) { R.none = 1; out.runs.push(R); return; }
  const [a, b, sg] = pr; used.add(a); used.add(b);
  await unstall();
  const [fx, fz] = fwd(a), ux = fx * sg, uz = fz * sg, hl = a.hl || 2.2;
  V.x = a.x - ux * (hl + 2.6); V.z = a.z - uz * (hl + 2.6); V.h = Math.atan2(ux, uz); V.y = d.surfaceAt(V.x, V.z); V.air = 0;
  cam(a.x, a.z, ux, uz);
  await frame();
  let fr = 0;
  R.trace = [];
  await watch(R, a, b, 4, () => {
    IN.gas = 0.5; const sp = Math.hypot(V.vx, V.vz); if (sp > 3) { V.vx *= 3 / sp; V.vz *= 3 / sp; }
    if (Q.has('chtrace') && fr++ % 20 === 0) R.trace.push([+Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), +(a.h - b.h).toFixed(2), +sp.toFixed(1), +Math.hypot(V.x - a.x, V.z - a.z).toFixed(1), a.hl, b.hl, !!a.still, !!b.still, a.knock]);
  });
  V.vx = V.vz = 0;
  out.runs.push(R);
}
/* стоящая у бордюра с краю ряда — ровно на пути отлёта: машину потока ставим в 7 м за ней по линии ряда (там пусто: ни машин,
   ни твёрдого, ни дома) и бьём вдоль ряда в неё. До 24.10 искали машину потока, у которой «где-то в 4,5—12 м» стоит
   кто-то, и чаще всего попадался автобус: он не сдвигается и не мнётся счётчиком dmg, или уезжал сам — проверка то
   зелёная, то красная (0п52) */
function clearLine (x0, z0, x1, z1, skip) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (const s of d.SOLIDS) {
    if (Math.abs(s.cx - x0) > 14 || Math.abs(s.cz - z0) > 14) continue;
    const vx = s.cx - x0, vz = s.cz - z0, al = vx * ux + vz * uz, lat = Math.abs(-vx * uz + vz * ux), r = Math.max(s.hw, s.hd);
    if (al > -2.5 - r && al < L + r && lat < 1.4 + r) return false;
  }
  for (let q = -2.5; q <= L; q += 1) if (d.inWall(x0 + ux * q, z0 + uz * q, 1.2)) return false;
  for (const o of all()) {
    if (skip.includes(o) || Math.abs(o.x - x0) > 16 || Math.abs(o.z - z0) > 16) continue;
    const vx = o.x - x0, vz = o.z - z0, al = vx * ux + vz * uz, lat = Math.abs(-vx * uz + vz * ux);
    if (al > -5 && al < L + 1 && lat < 2.6) return false;
  }
  return true;
}
async function flowIntoParked (k) {
  const R = { k, on: CHIT.CH.on };
  const flow = TR.filter(t => !t.gone && !t.parked && !t.svc && !t.bus && !t.mp && !t.knock && !t.cb && !t.driver && !t.rival && !t.chase && !t.stalled && !t.wreck && !t.still &&
    t.model !== 'moped' && t.model !== 'dump' && !used.has(t) && t.e && t.mesh && Math.hypot(t.x - V.x, t.z - V.z) < 400)
    .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
  const parked = TR.filter(o => !o.gone && o.parked && !yardOf(o) && !o.lux && !o.knock && !o.mp && o.model !== 'moped' && !o.accident && !used.has(o) && Math.hypot(o.x - V.x, o.z - V.z) < 1500)
    .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z));
  let pick = null;
  for (const t of flow.slice(0, 6)) {
    for (const p of parked) {
      const [fx, fz] = fwd(p);
      for (const sg of [1, -1]) {
        const sx = p.x - fx * sg * 7, sz = p.z - fz * sg * 7;
        if (!clearLine(sx, sz, p.x - fx * sg * 2.4, p.z - fz * sg * 2.4, [t, p])) continue;
        pick = [t, p, sx, sz, fx * sg, fz * sg]; break;
      }
      if (pick) break;
    }
    if (pick) break;
  }
  if (!pick) { R.none = 1; R.flow = flow.length; R.parked = parked.length; out.runs.push(R); return; }
  const [t, p, sx, sz, ux, uz] = pick; used.add(t); used.add(p);
  await unstall();
  if (t.gone || t.knock || p.gone) { R.none = 1; R.lost = 1; out.runs.push(R); return; }
  V.x = sx - uz * 12; V.z = sz + ux * 12; V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z);   // курьер — в стороне
  t.x = sx; t.z = sz; t.h = Math.atan2(ux, uz); t.speed = 0; t.kvx = t.kvz = 0;
  t.mesh.position.set(sx, d.surfaceAt(sx, sz), sz); t.mesh.rotation.set(0, t.h, 0);
  cam(sx, sz, ux, uz);
  const h0 = CHIT.ST.hits;
  d.knockCar(t, ux, uz, 16);                         // как от удара курьера на ~60 км/ч (knockCar — та же функция)
  await watch(R, t, p, 3);
  R.hits = CHIT.ST.hits - h0;                        // удар случился (в «было» — 0: летит сквозь)
  out.runs.push(R);
}
for (const on of [false, true]) {
  CHIT.CH.on = on;
  await knockRow('отбросило в стоящую', false);
  await pushRow('толкнул в стоящую');
  await flowIntoParked('поток в стоящую');
  await knockRow('во дворе', true);
}
CHIT.CH.on = true;
if (FWC) FWC.OUT = OUT0;
out.st = { ...CHIT.ST };
const neu = out.runs.filter(r => r.on && !r.none);
out.ok = neu.length >= 3 && neu.every(r => r.maxPen <= 0.05 && (/толкнул/.test(r.k) || r.bMoved > 0.05 || r.bDmg > 0) && (!/поток/.test(r.k) || r.hits > 0));
return out;
