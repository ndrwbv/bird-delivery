/* Машины не призраки, лось не сквозь (для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/ghost-cars.js; дольше — --q=gsecs=240).
   1. Смена на автопилоте (gsecs игровых секунд, по умолчанию 45, ускорение ×3), каждые 0,5 с:
      • призраки — видимые машины сцены (кузов с колёсами) ближе 220 м, у которых нет живой машины в
        TRAFFIC (или та на 2 м в стороне от своего кузова): их видно, а столкновения нет. Должно быть 0.
        До 10.10.2026 копилось ~15 за минуту: trafficDensity убирал дальнюю машину, а updateTraffic в том
        же кадре «перерождал» её рядом (respawnTraffic — новый кузов на сцене) и вычёркивал из списка;
      • стоят — машины потока ближе 250 м, стоящие на одном месте дольше STAND (30) с. Причина есть (пробка за
        аварией, красный, ты рядом, впереди стоит другая, лось, водитель вышел) — это нормально; без причины —
        предупреждение (unexplained).
   2. Твёрдые: курьера ставим за стоящей машиной (припаркованная, стоящая в потоке, автобус) носом к ней,
      9 м/с и газ — за 1,2 с центр курьера ни разу не внутри её кузова (pass; соскользнуть вдоль борта — можно).
   3. Лось: переходит «дорогу» поперёк припаркованной машины и автобуса — центр и грудь лося ни разу
      не внутри кузова (pen < 0); самец с разбега бодает машину — её отбрасывает (moved > 1 м). */
const sc = d.scene, V = d.V, TR = d.TRAFFIC, F = window.__fauna;
const Q = new URLSearchParams(location.search), GSECS = +(Q.get('gsecs') || 45), K = 3, STAND = 30;
const carLike = o => o && o.userData && typeof o.userData.hl === 'number' && Array.isArray(o.userData.wheels);
const shown = o => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === sc) return true; } return false; };
const W = new d.THREE.Vector3();
const kind = t => t.bus ? 'bus' : t.mp ? 'moped' : t.parked ? (t.accident ? 'accident' : 'parked') : t.svc || (t.chase ? 'chase' : t.stalled ? 'stalled' : 'flow');
const out = { orphans: 0, orphanSample: [], stand: 0, unexplained: 0, standSample: [], solid: [], moose: {} };

/* ── 1. призраки и вставшие ── */
const orphan = new Map(), st = new Map();
function scan () {
  const live = new Map(); for (const t of TR) if (!t.gone) live.set(t.mesh, t);
  sc.traverse(o => {
    if (!carLike(o) || o === d.car || !shown(o)) return;
    o.getWorldPosition(W);
    if (Math.hypot(W.x - V.x, W.z - V.z) > 220) return;
    const t = live.get(o);
    if (t && Math.hypot(W.x - t.x, W.z - t.z) < 2) return;
    if (!orphan.has(o.uuid)) orphan.set(o.uuid, [Math.round(W.x), Math.round(W.z), o.userData.model, t ? 'desync ' + kind(t) : 'нет машины']);
  });
}
function why (t) {
  const r = [];
  if (t.knock || t.wreck || t.stalled || t.driver || t.rlOut) r.push('авария/водитель');
  if (t.rlJam) r.push('пробка');
  if (t.mooseT > 0) r.push('лось');
  if (t.e && t.e.sig && !t.turn) r.push('светофор');
  if (Math.hypot(V.x - t.x, V.z - t.z) < 15) r.push('курьер');
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  for (const o of TR) {
    if (o === t || o.gone) continue;
    const dx = o.x - t.x, dz = o.z - t.z, f = dx * hx + dz * hz;
    if (f > 0 && f < 16 && Math.abs(-hz * dx + hx * dz) < 2.4 && (Math.abs(o.speed || 0) < 0.3 || o.parked)) { r.push('впереди ' + kind(o)); break; }
  }
  return r;
}
await onShift(); autopilot(true);
let gt = 0, last = Date.now();
const t0 = Date.now();
while (Date.now() - t0 < GSECS * 1000 / K) {
  window.__warp = K;
  await wait(500);
  const now = Date.now(); gt += (now - last) / 1000 * K; last = now;
  scan();
  for (const t of TR) {
    if (t.gone || t.parked || t.svc) continue;
    if (Math.hypot(t.x - V.x, t.z - V.z) > 250) { st.delete(t); continue; }
    if (Math.abs(t.speed || 0) >= 0.3 || t.knock) { st.delete(t); continue; }
    let s = st.get(t); if (!s) st.set(t, s = { t0: gt, x: t.x, z: t.z });
    if (Math.hypot(t.x - s.x, t.z - s.z) > 2) { s.t0 = gt; s.x = t.x; s.z = t.z; }
    if (gt - s.t0 > STAND && !s.rec) {
      const w = why(t);
      s.rec = 1; out.stand++;
      if (!w.length) out.unexplained++;
      if (out.standSample.length < 6) out.standSample.push([kind(t), Math.round(t.x), Math.round(t.z), w.join(', ') || 'без причины']);
    }
  }
}
window.__warp = 1; autopilot(false);
out.orphans = orphan.size; out.orphanSample = [...orphan.values()].slice(0, 5); out.gameSecs = Math.round(gt);

/* окно ждёт ответа (Толик, приглашение, обед) — мир на паузе: закрыть, как автопилот, и дальше */
const stalled = () => !!(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) || !!(d.CH && d.CH.opts && d.CH.opts.length) || (d.S.paused && d.S.state !== 'over');
async function tick (ms) {
  await wait(ms);
  if (!stalled()) return;
  autopilot(true); await until(() => !stalled(), 5000); autopilot(false); d.IN.gas = 0;
}

/* ── 2. стоящие машины твёрдые ── */
const pickCar = f => TR.filter(t => !t.gone && !t.knock && !t.wreck && f(t) && Math.hypot(t.x - V.x, t.z - V.z) < 300)
  .sort((p, q) => Math.hypot(p.x - V.x, p.z - V.z) - Math.hypot(q.x - V.x, q.z - V.z))[0];
const IN = d.IN;
async function ram (t, tag) {
  const hl = t.bus ? t.bus.hl : (t.hl || 2.2), fx = Math.sin(t.h), fz = Math.cos(t.h);
  V.x = t.x - fx * (hl + 4.5); V.z = t.z - fz * (hl + 4.5); V.h = t.h; V.y = d.surfaceAt(V.x, V.z); V.air = 0;
  V.vx = fx * 9; V.vz = fz * 9; V.camX = V.x - fx * 11; V.camZ = V.z - fz * 11; V.camH = V.h; V.camY = V.y + 6;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
  await tick(0);
  const hp0 = d.S.hp, st0 = d.S.state;
  d.S.hp = Math.max(hp0, d.S.hpMax || 6);        // удары проверки не должны кончить смену (конец смены — другой мир)
  let worst = -99; const trc = [];   // [вдоль, вбок, летит ли, скорость курьера, в воздухе] — для разбора провала
  for (let i = 0; i < 40; i++) {
    IN.gas = 1; await wait(30);
    if (d.S.state !== st0) break;
    // насквозь — центр курьера внутри её кузова (за 30 мс курьер проходит ~0,5 м — пролёт сквозь не пропустить)
    const f = (V.x - t.x) * Math.sin(t.h) + (V.z - t.z) * Math.cos(t.h), side = Math.abs(-(V.x - t.x) * Math.cos(t.h) + (V.z - t.z) * Math.sin(t.h));
    worst = Math.max(worst, Math.min(hl - 0.3 - Math.abs(f), (t.bus ? t.bus.W2 : 0.9) - side));
    if (i % 4 === 0) trc.push([+f.toFixed(1), +side.toFixed(1), t.knock, +Math.hypot(V.vx, V.vz).toFixed(1), V.air ? 1 : 0]);
  }
  IN.gas = 0; V.vx = V.vz = 0;
  d.S.hp = hp0;                                    // удары проверки — не в счёт смены
  out.solid.push({ k: tag, pass: worst > 0, f: +worst.toFixed(1), ...(d.S.state !== st0 ? { state: d.S.state } : {}), ...(worst > 0 ? { model: t.model, turn: !!t.turn, trc } : {}) });
}
for (const [tag, f] of [['parked', t => t.parked && !t.lux && t.model !== 'moped'], ['flow', t => !t.parked && !t.svc && !t.bus && !t.mp && Math.abs(t.speed) < 0.5], ['bus', t => !!t.bus]]) {
  const t = pickCar(f);
  if (t) await ram(t, tag);
}

/* ── 3. лось: не сквозь машину и автобус, бодает ── */
const pen = (t, x, z) => {
  const hl = t.bus ? t.bus.hl : (t.hl || 2.2), hw = t.bus ? t.bus.W2 : 0.95;
  const fx = Math.sin(t.h), fz = Math.cos(t.h), dx = x - t.x, dz = z - t.z, a = dx * fx + dz * fz, s = -dx * fz + dz * fx;
  return Math.min(hl - Math.abs(a), hw - Math.abs(s));
};
const noMoose = () => { F.LIST.splice(0).forEach(a => sc.remove(a.g)); d.S.hp = Math.max(d.S.hp, d.S.hpMax || 6); };
async function cross (t, tag, male) {
  const fx = Math.sin(t.h), fz = Math.cos(t.h), rx = -fz, rz = fx, hw = t.bus ? t.bus.W2 : 0.95;
  const sx = t.x + rx * (hw + 5), sz = t.z + rz * (hw + 5), ex = t.x - rx * (hw + 6), ez = t.z - rz * (hw + 6);
  await tick(0); noMoose(); tp(t.x + 40, t.z + 40);
  const a = F.at(sx, sz, Math.atan2(ex - sx, ez - sz));
  a.male = male; a.mode = 'cross'; a.ex = ex; a.ez = ez; a.cx = t.x; a.cz = t.z; a.mid = 0;
  let worst = -9;
  for (let i = 0; i < 120 && F.LIST.includes(a); i++) {
    await tick(50);
    worst = Math.max(worst, pen(t, a.x, a.z), pen(t, a.x + Math.sin(a.h) * 0.75, a.z + Math.cos(a.h) * 0.75));
    if (Math.hypot(a.x - ex, a.z - ez) < 1.5) break;
  }
  out.moose[tag] = { pen: +worst.toFixed(2) };
}
if (F) {
  // рядом (дальние могут быть в закрытом районе — оттуда курьера возвращает), и поперёк неё на 13 м в обе
  // стороны — ни одной другой машины ближе 3,5 м (лось должен упереться именно в эту)
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * k, pz - az - dz * k); };
  const clear = t => { const nx = -Math.cos(t.h) * 13, nz = Math.sin(t.h) * 13; return !TR.some(o => o !== t && !o.gone && segD(o.x, o.z, t.x - nx, t.z - nz, t.x + nx, t.z + nz) < 3.5); };
  const lone = TR.filter(t => t.parked && !t.gone && !t.lux && t.model !== 'moped' && Math.hypot(t.x - V.x, t.z - V.z) < 250 && clear(t))
    .sort((p, q) => Math.hypot(p.x - V.x, p.z - V.z) - Math.hypot(q.x - V.x, q.z - V.z));
  out.moose.lone = lone.length;
  if (lone[0]) await cross(lone[0], 'parked', false);
  const bus = pickCar(t => !!t.bus);
  if (bus) await cross(bus, 'bus', false);
  const t = lone[1] || lone[0];
  if (t && F.butt) {
    await tick(0); noMoose(); tp(t.x + 45, t.z + 45);
    const a = F.at(t.x + Math.sin(t.h + 1.57) * 12, t.z + Math.cos(t.h + 1.57) * 12, 0);
    const pos = new Map(TR.map(o => [o, [o.x, o.z]])), b0 = F.stats.buttCars;
    F.butt(a, { car: t });
    for (let i = 0; i < 100 && F.stats.buttCars === b0; i++) await tick(50);
    await tick(900);
    const c = F.last && F.last.t, p0 = c && pos.get(c);   // боднул по дороге другую — тоже годится
    out.moose.butt = { hit: F.stats.buttCars - b0, target: c === t, moved: p0 ? +Math.hypot(c.x - p0[0], c.z - p0[1]).toFixed(1) : 0 };
  }
  noMoose();
}
out.ok = !out.orphans && out.solid.every(s => !s.pass) && Object.values(out.moose).every(m => m.pen === undefined || m.pen < 0)
  && (!out.moose.butt || out.moose.butt.moved > 1);
return out;
