/* Машина о машину (0п38, 24.10.2026; carhit.js, docs/CAREER.md «Чужие машины мнутся и бьются» → «Машина о машину»).
   npm run check -- --only=carhit; или npm run probe -- --eval=tools/probe-checks/car-hit.js --max=0 --timeout=300
   [--q=chshots=/папка — кадры полным размером].
   Каждый случай — дважды: «было» (CHIT.CH.on = false — как до 24.10) и «стало», на разных машинах. Водитель не выходит
   (FW.OUT = 0). 3 с после удара, каждый кадр: насколько кузов толкнутой машины (прямоугольник hl × hw) заходит в кузов
   любой другой машины рядом (поток, стоящие у бордюра и во дворах, автобус) — после шага игры.
   1. «отбросило в стоящую» — стоящую у бордюра отбрасывает ударом (knockCar, 14 м/с) вдоль ряда в соседнюю (в 4,5—9 м);
   2. «толкнул в стоящую» — курьер медленно (газ, ~3 м/с) толкает стоящую у бордюра в соседнюю;
   3. «поток в стоящую» — машину потока отбрасывает ударом (knockCar, 16 м/с — как от курьера на ~60 км/ч) в стоящую в 4,5—12 м (у бордюра, во дворе, автобус);
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
async function flowIntoParked (k) {
  const parked = all().filter(t => !t.knock && !t.mp && !used.has(t) && (t.parked || t.bus || t.stalled));
  const R0 = { flow: 0, parked: parked.length };
  let pick = null;
  for (const t of TR) {
    if (t.gone || t.parked || t.svc || t.bus || t.mp || t.knock || t.driver || t.rival || t.model === 'moped' || t.model === 'dump' || used.has(t) || !t.e) continue;
    if (Math.hypot(t.x - V.x, t.z - V.z) > 1500) continue;
    R0.flow++;
    const p = parked.find(o => { const dd = Math.hypot(o.x - t.x, o.z - t.z); return o !== t && dd > 4.5 && dd < 12; });
    if (p) { pick = [t, p]; break; }
  }
  const R = { k, on: CHIT.CH.on };
  if (!pick) { R.none = 1; Object.assign(R, R0); out.runs.push(R); return; }
  const [t, p] = pick; used.add(t); used.add(p);
  await unstall();
  const dd = Math.hypot(p.x - t.x, p.z - t.z), ux = (p.x - t.x) / dd, uz = (p.z - t.z) / dd;
  V.x = t.x - uz * 12; V.z = t.z + ux * 12; V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z);   // курьер — в стороне
  cam(t.x, t.z, ux, uz);
  await frame();
  d.knockCar(t, ux, uz, 16);                         // как от удара курьера на ~60 км/ч (knockCar — та же функция)
  await watch(R, t, p, 3);
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
out.ok = neu.length >= 3 && neu.every(r => r.maxPen <= 0.05 && (/толкнул/.test(r.k) || r.bMoved > 0.05 || r.bDmg > 0));
return out;
