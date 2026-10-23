/* Машина не застревает в несбиваемых кустах (0п16, автор 23.10.2026: «зимой влетаешь под куст — и не выехать»).
   npm run probe -- --eval=tools/probe-checks/bush-stuck.js --max=0 --timeout=400
   Зима (как в меню по умолчанию; --q=bsea=1 — лето). Твёрдые кусты (сирень, шиповник — у подъездов, во дворах,
   на кругах, в палисадниках; game.js tree → shrub) по всему городу, через равные промежутки списка, до bn штук
   (--q=bn=150, 0 — все): машину ставят серединой в куст с курсом наугад, без скорости и без руля, 2 с игры —
   нос, корма и середина кузова (как в driveStep: круги ±1,21 м, запас 1 м) уже не задевают куст (touched — ещё
   задевает). Задевает — газ 1 с, потом задний ход 1,5 с: не сдвинулась ни на метр — «застряла» (stuck, провал). Печатает: сколько кустов, застряла, сколько раз выводило вбок / вдоль (unstuck.js STATS). */
const q = new URLSearchParams(location.search);
const BN = q.has('bn') ? +q.get('bn') : 150;
await onShift();
if (q.has('bsea')) { d.setSeason(+q.get('bsea')); await run(0.5); }
const all = d.SOLIDS.filter(s => s.shrub && s.hw > 0);
const step = BN > 0 ? Math.max(1, all.length / BN) : 1, pick = [];
for (let i = 0; i < all.length && (BN <= 0 || pick.length < BN); i += step) pick.push(all[Math.floor(i)]);
const AX = 1.21, R = 1.0;
const touch = s => {
  const V = d.V, fx = Math.sin(V.h), fz = Math.cos(V.h);
  let w = 0;
  for (const k of [1, 0, -1]) {
    const cx = V.x + fx * AX * k, cz = V.z + fz * AX * k, dx = cx - s.cx, dz = cz - s.cz;
    const a = s.hw + R - Math.abs(dx * s.cs + dz * s.sn), b = s.hd + R - Math.abs(-dx * s.sn + dz * s.cs);
    if (a > 0.02 && b > 0.02) w = Math.max(w, Math.min(a, b));
  }
  return w;
};
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const stuck = [];
let touched = 0;
for (const s of pick) {
  const V = d.V;
  V.x = s.cx + (rnd() - 0.5) * 0.6; V.z = s.cz + (rnd() - 0.5) * 0.6; V.vx = V.vz = 0; V.h = rnd() * 6.283;
  V.y = d.surfaceAt(V.x, V.z);
  await run(2 / 3, 3);                       // 2 с игры
  const w = touch(s);
  if (w > 0) touched++;
  // ещё задевает — может ли выехать: газ 1 с, потом задний ход 1,5 с; сдвинулась на метр — выехала
  let out = w <= 0;
  if (!out) {
    const IN = d.IN, x0 = V.x, z0 = V.z;
    IN.gas = 1; await run(1 / 3, 3); IN.gas = 0;
    out = Math.hypot(V.x - x0, V.z - z0) > 1;
    if (!out) { IN.brake = 1; await run(0.5, 3); IN.brake = 0; out = Math.hypot(V.x - x0, V.z - z0) > 1; }
    V.vx = V.vz = 0;
  }
  if (!out) stuck.push({ x: Math.round(s.cx), z: Math.round(s.cz), pen: +w.toFixed(2), state: d.S.state,
    car: [+(V.x - s.cx).toFixed(2), +(V.z - s.cz).toFixed(2), +V.h.toFixed(2)], edge: d.SOFTEDGE ? +d.SOFTEDGE.at(s.cx, s.cz).left.toFixed(0) : null, paused: !!d.S.paused,
    near: q.has('bdbg') ? d.SOLIDS.filter(o => o !== s && Math.abs(o.cx - s.cx) < 6 && Math.abs(o.cz - s.cz) < 6).map(o => [+(o.cx - s.cx).toFixed(1), +(o.cz - s.cz).toFixed(1), +o.hw.toFixed(1), +o.hd.toFixed(1), +Math.atan2(o.sn, o.cs).toFixed(2)]) : undefined });
}
const st = d.UNSTUCK ? { ...d.UNSTUCK } : null;
return { ok: pick.length > 0 && stuck.length === 0, shrubs: all.length, tested: pick.length, touched, stuck: stuck.length, sample: stuck.slice(0, 8), unstuck: st };
