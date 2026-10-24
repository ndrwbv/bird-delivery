/* ──────────────────────────────────────────────────────────────────────────
   Водители в машинах потока (0п69, 24.10.2026; автор: «машины ездят пустые, а должны в них всегда ездить люди»).
   Правило словами — docs/CAREER.md «Чужие машины мнутся и бьются» → «Водитель».

   • Коробочные машины потока — стёкла непрозрачные: водитель нарисован на стёклах силуэтом (carbody.js silhouette),
     у каждой едущей; стоящие — пустые (0п39). Ничего не стоит: та же склейка кузова.
   • «Семёрки» потока (realcar.js trafficCar) — стёкла тонированные, салона нет. В FD.MAX ближних едущих ближе FD.R м
     сажаем человека Quaternius в позе «сидит» (как водитель подробной копии, foewreck.js FW.SEAT), а их стёкла светлеют
     (FD.A_NEAR — вплотную, обратно к тонировке к FD.R): через стекло видно, что за рулём человек. Дальше FD.R — стёкла
     тёмные, как были (пустоты не видно), человека нет — экономим. Люди — из своего запаса: отъехала — человек
     пересаживается в другую ближнюю, новых не собираем (не больше одного за FD.TICK).
   • Ударили (подробная копия, foewreck.js сажает своего), вышел водитель (t.driver), авария, сгорела, убрали — человек
     из машины уходит.

     init(api)  — game.js: { traffic, makeHuman(), dropMesh(g), center() — откуда мерить (камера), seat — FW.SEAT, mob }
     step(dt)   — каждый кадр (раз в FD.TICK)
   ────────────────────────────────────────────────────────────────────────── */
export const FD = { R: 42, HYST: 6, MAX: 10, MAX_MOB: 6, TICK: 0.25, A_NEAR: 0.38, NEAR: 0.5 };
export const ST = { seated: 0, built: 0, lost: 0, swaps: 0, empty: 0, emptyBox: 0 };

let A = null, acc = 0;
const ON = new Map();                              // машина → { g, mesh }
const FREE = [];                                   // люди без машины (не на сцене)
const CANDS = [], CP = [];                     // ближние без водителя: { t, d } — своё поле у машины не заводим (форма объекта, game.js carObj)
export function init (api) { A = api; }

const okReal = t => {
  if (!t || t.parked || t.gone || t.wreck || t.driver || t.noDriver || t.accident || t.svc || t.rival || t.bus || t.mp || t.bcar || t.hb || t.tow) return false;
  const u = t.mesh && t.mesh.userData, R = u && u.real;
  return !!(u && u.realLite && R && R.traffic && !R.det && !R.detail && t.mesh.parent);
};

/* стёкла этой машины (свои материалы у каждой — realcar.js trafficCar): a — прозрачность, null — вернуть как было */
function tint (t, a) {
  const R = t.mesh.userData.real;
  if (!R || !R.glass) return;
  for (const o of R.glass) {
    const mt = o.material;
    if (!mt || mt.map || !/^real:win/.test(o.name)) continue;   // треснутое — не трогаем
    if (mt.userData.a0 === undefined) mt.userData.a0 = mt.opacity;
    mt.opacity = a === null ? mt.userData.a0 : Math.min(mt.userData.a0, a);
  }
}

function seat (t) {
  let g = FREE.pop();
  if (!g) {
    g = A.makeHuman();
    if (!g || !g.userData || !g.userData.q) { if (g) A.dropMesh(g); return false; }   // коробочные люди (?qp=0) — без водителя
    ST.built++;
  } else ST.swaps++;
  const S = A.seat, h = g.userData;
  if (g.parent) g.parent.remove(g);
  g.position.set(S.X, S.Y, S.Z);
  g.rotation.set(0, 0, 0);
  h.legL.rotation.x = S.LEG; h.legR.rotation.x = S.LEG;
  h.armL.rotation.x = S.ARM; h.armR.rotation.x = S.ARM;
  g.visible = true;
  t.mesh.add(g);
  const u = t.mesh.userData;
  (u.men || (u.men = [])).push(g);                 // game.js dropMen: сгорела / выброшена — человек уходит вместе с ней
  u._pose = undefined;
  ON.set(t, { g, mesh: t.mesh });
  return true;
}

function unseat (t, r) {
  const u = r.mesh.userData, g = r.g;
  ON.delete(t);
  if (g.parent !== r.mesh) { A.dropMesh(g); ST.lost++; return; }   // машину перекрасили / выбросили — человек уже отдан (dropMen)
  r.mesh.remove(g);
  if (u.men) { const i = u.men.indexOf(g); if (i >= 0) u.men.splice(i, 1); }
  if (t.mesh === r.mesh) tint(t, null);
  FREE.push(g);
}

export function step (dt) {
  if (!A || (acc += dt) < FD.TICK) return;
  acc = 0;
  const c = A.center(), cx = c.x, cz = c.z, R2 = FD.R * FD.R, K2 = (FD.R + FD.HYST) ** 2, max = A.mob ? FD.MAX_MOB : FD.MAX;
  CANDS.length = 0;
  for (const [t, r] of ON) {
    const dx = r.mesh.position.x - cx, dz = r.mesh.position.z - cz;
    if (t.mesh !== r.mesh || r.g.parent !== r.mesh || !okReal(t) || dx * dx + dz * dz > K2) unseat(t, r);
  }
  let box = 0;
  for (const t of A.traffic) {
    if (!t || t.parked || t.gone || !t.mesh) continue;
    const u = t.mesh.userData;
    if (u.lite && !u.realLite) { if (!u.sil && !t.svc && !t.rival && !t.bus && !t.mp) box++; continue; }
    if (ON.has(t) || !okReal(t)) continue;
    const dx = t.mesh.position.x - cx, dz = t.mesh.position.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < R2) { const q = CP[CANDS.length] || (CP[CANDS.length] = { t: null, d: 0 }); q.t = t; q.d = d2; CANDS.push(q); }
  }
  CANDS.sort((a, b) => a.d - b.d);
  let built = 0, empty = 0;
  for (const q of CANDS) {
    const t = q.t; q.t = null;
    if (ON.size >= max) { empty++; continue; }
    if (!FREE.length && built) { empty++; continue; }   // новый человек — не больше одного за раз
    if (!FREE.length) built++;
    if (!seat(t)) empty++;
  }
  // стёкла светлее, чем ближе: видно водителя
  for (const [t] of ON) {
    const p = t.mesh.position, d = Math.hypot(p.x - cx, p.z - cz), k = Math.min(1, Math.max(0, (d - FD.R * FD.NEAR) / (FD.R * (1 - FD.NEAR))));
    tint(t, FD.A_NEAR + (0.88 - FD.A_NEAR) * k);
  }
  ST.seated = ON.size; ST.empty = empty; ST.emptyBox = box;
}

export const DEBUG = { FD, ST, of: t => (ON.get(t) || {}).g || null, free: () => FREE.length };
