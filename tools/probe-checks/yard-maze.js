/* Дворы сложнее (yardmaze.js): клиенты дворов достижимы на машине и навигатор не ведёт сквозь заборы, клумбы и лесочки
   (для npm run check; можно и так: npm run probe -- --eval=tools/probe-checks/yard-maze.js).
   Адреса заказов (SPOTS, по координатам, каждый k-й — по всему городу, N штук; --q=ymn=2000 — больше):
     • reach — от клиента по клеткам навигатора (routeyard.js: стены — дома, твёрдое (заборы, клумбы, стволы), вода;
       сбиваемое — дорого, но можно) до точки улицы в окне 60—240 м: strict — строгим заходом (запас 1 м от твёрдого),
       soft — только мягким (щель), none — не доехать (клиент заперт). Сравнивать с ?nomaze — без лабиринта;
     • cost — «метры» по клеткам до лучшей улицы (газон дороже асфальта, забор — ×8): насколько дворы стали петлять;
     • thru — маршрут навигатора от пиццерии к адресу (d.roadPath, хвост по клеткам — сразу) задевает твёрдое лабиринта
       (YMAZE.segHits без запаса — пересекает забор, клумбу, лесок; концы 1,5 м не в счёт): должно быть 0.
   ok — thru = 0 и заперто не больше 0,5 % адресов (без лабиринта, --q=nomaze, — 0 из 700 при --seed=21; сравнивать так). */
const Q0 = new URLSearchParams(location.search), N = +(Q0.get('ymn') || 700);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 30000);
const Y = d.YMAZE, RY = d.RYARD;
const pool = d.SPOTS.slice().sort((a, b) => a.x - b.x || a.z - b.z);
const step = Math.max(1, Math.floor(pool.length / N)), spots = [];
for (let i = 0; i < pool.length && spots.length < N; i += step) spots.push(pool[i]);
// точки улиц: по рёбрам графа через 4 м, сетка 40 м
const SG = new Map(), C = 40, key = (i, j) => i * 100003 + j;
const NODES = d.NODES;
for (let a = 0; a < NODES.length; a++) for (const b of NODES[a].nb || []) {
  if (b < a) continue;
  const P = NODES[a], Qn = NODES[b], L = Math.hypot(Qn.x - P.x, Qn.z - P.z), m = Math.max(1, Math.ceil(L / 4));
  for (let k = 0; k <= m; k++) {
    const x = P.x + (Qn.x - P.x) * k / m, z = P.z + (Qn.z - P.z) * k / m, kk = key(Math.floor(x / C), Math.floor(z / C));
    let arr = SG.get(kk); if (!arr) SG.set(kk, arr = []); arr.push(x, z);
  }
}
const goalsIn = (x, z, R) => {
  const out = [];
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
    const a = SG.get(key(i, j)); if (!a) continue;
    for (let k = 0; k < a.length; k += 2) if (Math.abs(a[k] - x) < R - 3 && Math.abs(a[k + 1] - z) < R - 3) out.push(a[k], a[k + 1]);
  }
  return out;
};
const reach = (x, z) => {
  let dmin = Infinity;
  const g0 = goalsIn(x, z, 240);
  for (let k = 0; k < g0.length; k += 2) dmin = Math.min(dmin, Math.hypot(g0[k] - x, g0[k + 1] - z));
  if (dmin === Infinity) return { far: 1 };
  let R = Math.min(240, Math.max(60, dmin + 80));
  for (;;) {
    const goals = goalsIn(x, z, R), F = RY.field(0, x, z, R, 0, goals);
    let best = Infinity;
    for (let k = 0; k < goals.length; k += 2) best = Math.min(best, F.at(goals[k], goals[k + 1]));
    const S = RY.SLOTS[0];
    if (best < Infinity) return { cost: best, soft: S.soft ? 1 : 0, fine: S.C < 2 ? 1 : 0 };
    if (R >= 240) return { none: 1 };
    R = Math.min(240, R * 2.5);
  }
};
const DUMP = Q0.has('ymdump') ? [] : null;
const R = { n: 0, strict: 0, soft: 0, fine: 0, none: 0, far: 0, cost: 0, thru: 0, thruN: 0, none_at: [], thru_at: [], ms: 0 };
const t0 = performance.now();
for (const s of spots) {
  const r = reach(s.x, s.z);
  R.n++;
  if (DUMP) DUMP.push(r.cost === undefined ? -1 : Math.round(r.cost));
  if (r.far) { R.far++; continue; }
  if (r.none) { R.none++; if (R.none_at.length < 8) R.none_at.push([Math.round(s.x), Math.round(s.z)]); continue; }
  if (r.soft) R.soft++; else R.strict++;
  if (r.fine) R.fine++;
  R.cost += r.cost;
}
R.cost = +(R.cost / Math.max(1, R.n - R.none - R.far)).toFixed(1);
R.ms = Math.round(performance.now() - t0);
// через двор: от адреса к другому адресу в 50—130 м (машиной по клеткам) — во сколько раз длиннее прямой (газон ×1,4);
// lineCut — у скольких пар прямую перекрывает лабиринт (забор, клумба, изгородь, лесок)
const PG = new Map();
for (const s of pool) { const k = key(Math.floor(s.x / C), Math.floor(s.z / C)); let a = PG.get(k); if (!a) PG.set(k, a = []); a.push(s); }
R.pairs = 0; R.ratio = 0; R.pairNone = 0; R.lineCut = 0;
for (let i = 0; i < spots.length; i += 2) {
  const s = spots[i];
  let t = null;
  for (let di = -3; di <= 3 && !t; di++) for (let dj = -3; dj <= 3 && !t; dj++) {
    for (const q of PG.get(key(Math.floor(s.x / C) + di, Math.floor(s.z / C) + dj)) || []) { const dd = Math.hypot(q.x - s.x, q.z - s.z); if (dd > 50 && dd < 130) { t = q; break; } }
  }
  if (!t) continue;
  const dd = Math.hypot(t.x - s.x, t.z - s.z), F = RY.field(0, s.x, s.z, Math.min(240, dd + 60), 0, [t.x, t.z]), c = F.at(t.x, t.z);
  R.pairs++;
  if (Y && Y.segHits(s.x, s.z, t.x, t.z, 0)) R.lineCut++;
  if (c === Infinity) { R.pairNone++; continue; }
  R.ratio += c / dd;
  if (DUMP) DUMP.push('p' + Math.round(c));
}
R.ratio = +(R.ratio / Math.max(1, R.pairs - R.pairNone)).toFixed(3);
// маршрут навигатора от пиццерии — не сквозь твёрдое лабиринта
if (Y && Y.FEN.length) {
  const pz = d.PZ_CUR || (d.PIZZERIAS || []).find(Boolean) || pool[0];
  d.RT.sync = true;
  for (let i = 0; i < spots.length; i += 2) {
    const s = spots[i];
    d.RT.key = NaN; d.RT.head = null; d.RT.headFail = null; d.RT.hjob = null;
    const pts = d.roadPath(pz.x, pz.z, s.x, s.z, 0, false);
    if (pts.length < 3) continue;
    R.thruN++;
    // последний кусок к клиенту (улица → двор) — по нему и судим
    for (let k = Math.max(1, pts.length - 12); k < pts.length; k++) {
      const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
      if (Y.segHits(ax, az, bx, bz, 0)) { R.thru++; if (R.thru_at.length < 6) R.thru_at.push([Math.round(s.x), Math.round(s.z), k, pts.length]); break; }
    }
  }
  d.RT.sync = false; d.RT.key = NaN;
}
const st = Y ? Y.ST : null;
return { ok: R.thru === 0 && R.none <= Math.max(1, Math.round(R.n * 0.005)), ...R, dump: DUMP && DUMP.join(','), maze: st && { solidM: st.fen.solidM, smashM: st.fen.smashM, beds: st.beds, hedges: st.hedges, groves: st.groves, groveTrees: st.groveTrees, ms: st.ms } };
