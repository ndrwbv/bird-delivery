/* Люди и ремонт в кадре (11.10.2026, ближний человек — 2 вызова, ремонт — склейка): вызовы отрисовки и JS кадра в людных
   местах. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/crowds.js --cpu=3 --size=deck --max=0 --timeout=400
   --q=csecs=10 — секунд на этап (8); --q=conly=bar,fest — только эти. Этапы (машина стоит в 8—12 м носом к месту, камера за ней):
   company — компания с кальяном у подъезда (hookah.js), fest — фестиваль кальянщиков на парковке ТЦ (festivals.js),
   bar — толпа у бара ночью (game.js CROWDS), works — ремонт поперёк улицы (roadlife.js), lane — ремонт полосы.
   Ответ по этапу: calls — вызовов в кадре (среднее / p95), js — JS кадра (p50 / p95 / доля > 16,7 мс), render — отрисовка
   (среднее / p95), by — вызовов в кадре по хозяевам (люди, ремонт, остальное; секунда с подсчётом — отдельно, вне замера
   времени), near / far — людей в кадре ближней и дальней моделью (дальше 45 м — одним мешем), perNear — вызовов на ближнего,
   dist — от машины до места, м. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('csecs') || 8);
const ONLY = (Q.get('conly') || '').split(',').filter(Boolean);
const R = d.renderer, r0 = R.render, T = d.THREE;
await onShift(); autopilot(false);
d.CITYOPEN.unlockAll(); d.districtLocks();          // весь город открыт: иначе машину из закрытого района выносит назад
await wait(2000);
const out = {};
let calls = [], js = [], rds = [];
let acc = 0, lastT = -1, rd = 0, count = null;
R.render = function (s, c) {
  const t = performance.now(); r0.call(R, s, c);
  if (s === d.scene) { rd += performance.now() - t; calls.push(R.info.render.calls); }
  if (s === d.scene && CNT) { CNT.frames++; CNT.nN += CNT.near.size; CNT.nF += CNT.far.size; CNT.near.clear(); CNT.far.clear(); }
};
const raf = window.requestAnimationFrame;
window.requestAnimationFrame = cb => raf(t => { if (t !== lastT) { if (lastT >= 0) { js.push(acc); rds.push(rd); } acc = 0; rd = 0; lastT = t; } const s = performance.now(); cb(t); acc += performance.now() - s; });
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length || 1, q = p => +(s[Math.min(n - 1, Math.floor(p * n))] || 0).toFixed(1);
  return { p50: q(0.5), p95: q(0.95), avg: +(a.reduce((x, y) => x + y, 0) / n).toFixed(1), 'o16,7%': +(100 * a.filter(v => v > 16.7).length / n).toFixed(1) }; };
// по хозяевам: человек — предок с userData.look, ремонт — группа из RL.WORKS
const CAT = new WeakMap();
const catOf = o => {
  let c = CAT.get(o);
  if (c) return c;
  const works = new Set(d.RL.WORKS.map(w => w.grp));
  c = 'other';
  for (let p = o; p; p = p.parent) { if (p.userData && p.userData.look) { c = p; break; } if (works.has(p)) { c = 'works'; break; } }
  CAT.set(o, c);
  return c;
};
const P0 = T.Object3D.prototype.onBeforeRender;
let CNT = null;                                    // подсчёт по хозяевам: в кадре — множества людей, после кадра — в сумму
async function countCalls (ms) {
  const C = CNT = { by: { human: 0, works: 0, other: 0 }, near: new Set(), far: new Set(), nN: 0, nF: 0, nearCalls: 0, frames: 0 };
  T.Object3D.prototype.onBeforeRender = function (r, s) {
    if (s !== d.scene) return;
    const c = catOf(this);
    if (c === 'works' || c === 'other') { C.by[c]++; return; }
    C.by.human++;
    if (this === c.userData.lod) C.far.add(c); else { C.near.add(c); C.nearCalls++; }
  };
  await wait(ms);
  T.Object3D.prototype.onBeforeRender = P0; CNT = null;
  const f = Math.max(1, C.frames), r1 = v => +(v / f).toFixed(1);
  return { by: { human: r1(C.by.human), works: r1(C.by.works), other: r1(C.by.other) }, near: r1(C.nN), far: r1(C.nF), perNear: C.nN ? +(C.nearCalls / C.nN).toFixed(2) : 0 };
}
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; };
const face = (x, z, dist) => {
  tp(x, z); phase.at = [x, z];
  const V = d.V; V.h = Math.atan2(x - V.x, z - V.z);
  const fx = Math.sin(V.h), fz = Math.cos(V.h);
  V.x = x - fx * dist; V.z = z - fz * dist; V.y = d.groundH(V.x, V.z);
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
};
async function phase (name, setup) {
  if (ONLY.length && !ONLY.includes(name)) return;
  let ok = true;
  try { ok = (await setup()) !== false; } catch (e) { out[name] = { err: String(e) }; return; }
  if (!ok) { out[name] = { skipped: true }; return; }
  const t1 = performance.now();
  while (performance.now() - t1 < 2500) { hold(); await wait(50); }      // город вокруг достроился, люди родились
  calls = []; js = []; rds = [];
  const t0 = performance.now();
  while (performance.now() - t0 < SECS * 1000) { hold(); await wait(50); }
  const c = st(calls), j = st(js), r = st(rds), n = calls.length;
  const cc = await countCalls(1000);
  const tg = phase.at ? Math.round(Math.hypot(phase.at[0] - d.V.x, phase.at[1] - d.V.z)) : null;
  out[name] = { calls: [c.avg, c.p95], js: [j.p50, j.p95, j['o16,7%']], render: [r.avg, r.p95], frames: n, ...cc, dist: tg };
  phase.at = null;
}
const DAY = d.ECON.tOfHour(13), NIGHT = d.ECON.tOfHour(23.5);
await phase('company', async () => {
  d.ENV.t = DAY;
  const s = d.HOOKAH.nearest();
  if (!s) return false;
  face(s.b.x, s.b.z, 9);
  await until(() => s.live, 8000);
  face(s.b.x, s.b.z, 9);
  return !!s.live;
});
await phase('fest', async () => {
  d.ENV.t = DAY;
  d.FEST.stop();
  const i = d.FEST.start('hookah', 0);
  if (!i) return false;
  const [x, z] = i.outside, [cx, cz] = i.center, l = Math.hypot(cx - x, cz - z) || 1;
  face(cx, cz, Math.min(18, l + 6));
  return true;
});
await phase('bar', async () => {
  d.FEST.stop();
  d.ENV.t = NIGHT;
  const bars = d.PUB_SPOTS.filter(p => p.kind === 'bar');
  if (!bars.length) return false;
  const V = d.V, sp = bars.slice().sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
  face(sp.x, sp.z, 11);
  await until(() => d.CROWDS.some(c => c.sp === sp), 8000);
  face(sp.x, sp.z, 11);
  return d.CROWDS.some(c => c.sp === sp);
});
const works = async lane => {
  d.ENV.t = DAY;
  const W = d.RL.WORKS;
  for (const w of W) w.t = -1e9;                   // прежние — вон (stepWorks уберёт как положено)
  await wait(300);
  let w = null;
  for (let k = 0; k < 40 && !w; k++) {
    const n0 = W.length;
    if (lane) d.RL.spawnLane(); else d.RL.spawnSomewhere();
    if (W.length > n0) { const q = W[W.length - 1]; if (!!q.lane === lane) w = q; else { q.t = -1e9; await wait(150); } }   // не тот — уберётся (рядом с ним новый не встанет)
  }
  if (!w) return false;
  const V = d.V;
  tp(w.x, w.z);
  V.x = w.x - w.ux * 12; V.z = w.z - w.uz * 12; V.h = Math.atan2(w.x - V.x, w.z - V.z); V.y = d.groundH(V.x, V.z);
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
  phase.at = [w.x, w.z];
  return true;
};
await phase('works', () => works(false));
await phase('lane', () => works(true));
R.render = r0; window.requestAnimationFrame = raf; T.Object3D.prototype.onBeforeRender = P0;
out.hsk = d.HSK || null;
out.crash = d.crashlog.count();
return out;
