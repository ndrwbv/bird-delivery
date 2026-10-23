/* Поток машин: плавность и «сквозь друг друга» (23.10.2026, пункты плана 0аг, 0ак).
   npm run probe -- --eval=tools/probe-checks/traffic-flow.js --max=0 --timeout=400 --seed=7
   (--q=tfsecs=25 — секунд на место, по умолчанию 20; tfring=0 — без колец, tfstreet=0 — без улиц; tfcars=45 — машин потока; oldflow — как было до 23.10.2026)

   Курьер стоит на тротуаре у места (4 кольца города и 4 обычные большие улицы), машины вокруг едут сами.
   Каждый кадр — по всем машинам потока ближе 110 м (кроме сбитых, горящих, погони, служб):
     • рывок вбок (latJ) — скорость поперёк своего курса за одно обновление сменилась больше чем на 5 м/с (и сдвиг
       больше 6 см): «едет прямо — кадр влево — кадр прямо»; плавная смена полосы за 1,4—2 с — до ~3 м/с, плавно;
     • рывок курса (headJ) — скорость поворота сменилась больше чем на 4 рад/с (и поворот больше 0,05 рад) за обновление;
     • быстро (lat, head) — вбок быстрее 5 м/с или курс быстрее 3,5 рад/с, пусть и плавно (так машины не ездят);
     • прыжок — за обновление больше 3 м (переставили на глазах).
   Раз в 2 кадра — пересечения: пары машин потока, у которых корпуса (прямоугольник длина × 1,6 м, чуть меньше
   настоящего) перекрылись; событие — пара начала перекрываться, время — сколько секунд перекрыты.
   Ещё: v — средняя скорость машин потока рядом (м/с), stuck — сколько стояли дольше 15 с подряд.
   Цель: рывков (latJ, headJ, jump) 0, пересечений — как можно меньше (было / стало — в отчёте агента). */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('tfsecs') || 20), RINGS = Q.get('tfring') !== '0';
const V = d.V, TR = d.TRAFFIC, TRACE = Q.has('tftrace');   // tftrace — в образцах ещё сглаживание и смена полосы (flowlane.js)
const RING_AT = [[2018, 232], [2640, 97], [5710, 3450], [526, -324]];   // 4 кольца Солнечного (flowlane.js находит их сам: ring у рёбер)
const STREET_AT = [[0, 0], [-300, 900], [-650, 380], [950, 640]];   // большие улицы не у колец
const flowCar = t => !t.gone && !t.parked && !t.still && !t.knock && !t.wreck && !t.chase && !t.svc && !t.driver && t.model !== 'moped';
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/* место: ближайшая к точке большая улица (c ≤ 3); курьер — на тротуар справа от неё, лицом вдоль */
function siteAt (x, z, ring) {
  let best = null, bd = 1e9;
  for (const e of d.EDGES.values()) {
    if (!e.ok || (!ring && e.c > 3)) continue;
    const A = d.NODES[e.a], mx = A.x + e.ux * e.len / 2, mz = A.z + e.uz * e.len / 2, dd = Math.hypot(mx - x, mz - z);
    if (dd < bd) { bd = dd; best = e; }
  }
  const A = d.NODES[best.a], o = best.w / 2 + 3;
  const px = ring ? x : A.x + best.ux * best.len / 2 + best.rx * o, pz = ring ? z : A.z + best.uz * best.len / 2 + best.rz * o;
  return { x: px, z: pz, h: Math.atan2(best.ux, best.uz) };
}
function park (s) {
  V.x = s.x; V.z = s.z; V.h = s.h; V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z); V.air = 0;
  V.camX = V.x - Math.sin(V.h) * 11; V.camZ = V.z - Math.cos(V.h) * 11; V.camH = V.h; V.camY = V.y + 6; V.hero = 0;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
}
/* два прямоугольника (центр, курс, полудлина, полуширина) перекрываются — SAT по четырём осям */
function obb (a, b) {
  const ax = [Math.sin(a.h), Math.cos(a.h)], ay = [Math.cos(a.h), -Math.sin(a.h)], bx = [Math.sin(b.h), Math.cos(b.h)], by = [Math.cos(b.h), -Math.sin(b.h)];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const u of [ax, ay, bx, by]) {
    const ra = a.L * Math.abs(ax[0] * u[0] + ax[1] * u[1]) + a.W * Math.abs(ay[0] * u[0] + ay[1] * u[1]);
    const rb = b.L * Math.abs(bx[0] * u[0] + bx[1] * u[1]) + b.W * Math.abs(by[0] * u[0] + by[1] * u[1]);
    if (Math.abs(dx * u[0] + dz * u[1]) > ra + rb) return false;
  }
  return true;
}
const box = t => ({ x: t.x, z: t.z, h: t.h, L: t.bus ? t.bus.hl - 0.3 : Math.max(1.2, (t.hl || 2.1) - 0.25), W: t.bus ? 1.1 : 0.8 });
const ST = d.FLOWL && d.FLOWL.ST;

/* NEAR машин потока (самые дальние) — на улицы в 90 м от места: иначе у колец за 20 с встречаются 0—2 машины */
const NEAR = +(Q.get('tfnear') || 16);
function seed (s) {
  const E = [...d.EDGES.values()].filter(e => {
    if (!e.ok || e.c > 5 || e.closed || e.lock || e.len - e.tA - e.tB < 6 || ((e.w0 || e.w) < 7 && !e.oneway)) return false;
    const A = d.NODES[e.a]; return Math.hypot(A.x + e.ux * e.len / 2 - s.x, A.z + e.uz * e.len / 2 - s.z) < 90;
  });
  if (!E.length) return 0;
  const L = TR.filter(t => flowCar(t) && !t.bus && !t.turn).sort((a, b) => Math.hypot(b.x - s.x, b.z - s.z) - Math.hypot(a.x - s.x, a.z - s.z)).slice(0, NEAR);
  let k = 0;
  for (const t of L) {
    for (let i = 0; i < 12; i++) {
      const e = E[(Math.random() * E.length) | 0], run = e.len - e.tA - e.tB, sx = Math.random() * run * 0.7;
      const A = d.NODES[e.a], x = A.x + e.ux * (e.tA + sx), z = A.z + e.uz * (e.tA + sx);
      if (TR.some(o => o !== t && !o.gone && Math.hypot(o.x - x, o.z - z) < 9)) continue;
      t.e = e; t.s = sx; t.turn = null; t.lane = 0; t.x = x; t.z = z; t.speed = 0; t.gy = undefined; k++; break;
    }
  }
  return k;
}
async function measure (tag, s) {
  park(s);
  await run(2, 1);
  seed(s);
  await run(4, 1);                                 // разъехались с мест
  park(s);
  const R = { tag, secs: SECS, stuck: 0, stS: [], v: 0, cars: 0, latJ: 0, headJ: 0, lat: 0, head: 0, jump: 0, swap: 0, ov: 0, ovSec: 0, ovGhost: 0, latS: [], ovS: [] };
  const prev = new Map(), pairs = new Set();
  let vSum = 0, vN = 0, fr = 0, carsSum = 0, done = false, last = performance.now(), lc0 = ST ? ST.lc : 0, yi0 = ST ? ST.yield : 0, cut0 = ST ? ST.cut : 0;
  const tick = ts => {                             // ts — время кадра, как у игры (game.js frame(now))
    if (done) return;
    const dtR = Math.min(0.25, Math.max(0, (ts - last) / 1000)) * (window.__warp || 1); last = ts;
    fr++;
    let n = 0;
    const live = [];
    for (const t of TR) {
      if (!flowCar(t) || t.rejoin > 0) { prev.delete(t); continue; }
      if ((t.x - V.x) ** 2 + (t.z - V.z) ** 2 > 110 * 110) { prev.delete(t); continue; }
      n++; live.push(t);
      vSum += t.speed || 0; vN++;
      if ((t.speed || 0) < 0.3) { t._tfst = (t._tfst || 0) + dtR; if (t._tfst > 15 && !t._tfstk) { t._tfstk = 1; R.stuck++; if (R.stS.length < 4) R.stS.push([t.model, Math.round(t.x), Math.round(t.z), t.turn ? 'turn' : 'e', t.yld ? 'Y' : '', t.pT > 0 ? 'P' : '', t.e && t.e.sig ? 'sig' : '', t.rlJam ? 'jam' : '']); } }
      else { t._tfst = 0; t._tfstk = 0; }
      if (t._tf === undefined) t._tf = ID++;
      const m = t.mesh, x = m.position.x, z = m.position.z, h = m.rotation.y;
      let p = prev.get(t);
      if (!p) { prev.set(t, { x, z, h, m, acc: 0 }); continue; }
      p.acc += dtR;
      if (p.m !== m) { R.swap++; p.m = m; }
      const dx = x - p.x, dz = z - p.z;
      if (dx === 0 && dz === 0 && h === p.h) continue;   // в этом кадре не считалась (вдали — раз в N кадров)
      const dt = Math.max(1 / 120, p.acc), hx = Math.sin(p.h), hz = Math.cos(p.h);
      const lat = Math.abs(-hz * dx + hx * dz), dist = Math.hypot(dx, dz), dh = Math.abs(wrap(h - p.h));
      const info = () => [t.model, Math.round(x), Math.round(z), +lat.toFixed(2), +dh.toFixed(2), +dt.toFixed(3), t.turn ? 'turn' : 'edge', t.lane, t.e ? t.e.w : 0, +(t.speed || 0).toFixed(1), ...(TRACE ? [t.fo ? [+t.fo.th.toFixed(2), +t.fo.oh.toFixed(2), +t.fo.tl.toFixed(2), +t.fo.ox.toFixed(2), +t.fo.oz.toFixed(2), +t.fo.lv.toFixed(2), +t.fo.w.toFixed(2)] : 0, t.lc ? [+t.lc.d.toFixed(2), +t.lc.q.toFixed(2), t.lc.cut || 0] : 0, t.yld || 0, [+(t.s || 0).toFixed(2), +(t.pull || 0).toFixed(2), +(t.nar || 0).toFixed(2), t.rejoin || 0, t.taxi ? 1 : 0, +(m.position.x - t.x).toFixed(2), +(m.position.z - t.z).toFixed(2), +dx.toFixed(3), +dz.toFixed(3), t.e ? +t.e.ux.toFixed(3) : 0, t.e ? +t.e.uz.toFixed(3) : 0, +h.toFixed(3)]] : [])];
      const lv = (-hz * dx + hx * dz) / dt, w = wrap(h - p.h) / dt;
      if (dist > 3) { R.jump++; if (R.latS.length < 10) R.latS.push(['jump', ...info()]); }
      else {
        // рывок — скорость вбок или поворота резко сменилась за одно обновление (вбок ±5 м/с, курс ±4 рад/с)
        if (p.lv !== undefined && lat > 0.06 && Math.abs(lv - p.lv) > 5) { R.latJ++; if (R.latS.length < 10) R.latS.push(['latJ', ...info()]); }
        else if (p.w !== undefined && dh > 0.05 && Math.abs(w - p.w) > 4) { R.headJ++; if (R.latS.length < 10) R.latS.push(['headJ', ...info()]); }
        // быстро — вбок быстрее 5 м/с или курс быстрее 3,5 рад/с (не рывок, но так машины не ездят)
        if (lat > 0.06 && lat / dt > 5) R.lat++;
        else if (dh > 0.05 && dh / dt > 3.5) R.head++;
      }
      p.x = x; p.z = z; p.h = h; p.acc = 0; p.lv = lv; p.w = w;
    }
    carsSum += n;
    if (fr % 2 === 0) {
      const B = live.map(box), now2 = new Set();
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = B[i], b = B[j];
        if (Math.abs(a.x - b.x) > 14 || Math.abs(a.z - b.z) > 14 || !obb(a, b)) continue;
        const key = live[i]._tf + ':' + live[j]._tf;
        now2.add(key);
        R.ovSec += 2 * dtR;
        if (!pairs.has(key)) { R.ov++; if (live[i].ghost > 0 || live[j].ghost > 0) R.ovGhost++; if (R.ovS.length < 6) {
          const st = c => [c.model, c.turn ? 'T' + c.turn.q.toFixed(2) + (c.turn.p3 ? 'c' : '') + '>' + c.turn.next.a + '>' + c.turn.next.b + 'L' + c.turn.lane : 'E' + (c.s || 0).toFixed(1), c.e ? c.e.a + '>' + c.e.b : '', c.lane, +(c.speed || 0).toFixed(1), c.ghost > 0 ? 'G' : '', c.lc ? 'lc' : '', c.yld ? 'Y' : '', c.nx ? c.nx.a + '>' + c.nx.b : '', c.taxi ? 'taxi' : '', c.bus ? 'bus' : '', +(c.h).toFixed(2)];
          const fx = Math.sin(a.h), fz = Math.cos(a.h), dx = b.x - a.x, dz = b.z - a.z;
          R.ovS.push([Math.round(a.x), Math.round(a.z), +(dx * fx + dz * fz).toFixed(1), +(-fz * dx + fx * dz).toFixed(1), ...(TRACE ? [st(live[i]), st(live[j])] : [live[i].turn ? 'turn' : 'e', live[j].turn ? 'turn' : 'e', +(live[i].speed || 0).toFixed(1), +(live[j].speed || 0).toFixed(1)])]);
        } }
      }
      pairs.clear(); for (const k of now2) pairs.add(k);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  for (let k = 0; k < SECS; k++) { await wait(1000); park(s); }
  done = true;
  R.cars = Math.round(carsSum / Math.max(1, fr)); R.v = +(vSum / Math.max(1, vN)).toFixed(1); R.ovSec = +R.ovSec.toFixed(1); R.frames = fr;
  if (ST) { R.lc = ST.lc - lc0; R.yield = ST.yield - yi0; R.cut = ST.cut - cut0; }
  return R;
}

let ID = 1;                                        // свой номер машины (_tf) — для пар
await ride();
d.ENV.t = 0.1;                                     // утро (~8:30): поток густой
const DENSE = +(Q.get('tfcars') || 45);             // машин потока вокруг — сколько (по умолчанию 45: часы пик и ещё гуще, чтобы встречались)
if (DENSE) { d.ECON.TRAFFIC.BY_HOUR.fill(DENSE); d.ECON.TRAFFIC.HIDE_R = 60; }
const res = [];
const ONLY = Q.get('tfonly');                       // tfonly=2 — только третье кольцо (с нуля)
if (RINGS) for (const [x, z] of ONLY !== null ? [RING_AT[+ONLY]] : RING_AT) { res.push(await measure('ring', siteAt(x, z, true))); }
if (Q.get('tfstreet') !== '0') for (const [x, z] of STREET_AT) { res.push(await measure('street', siteAt(x, z, false))); }
const sum = tag => { const L = res.filter(r => r.tag === tag), o = { secs: 0, stuck: 0, v: 0, latJ: 0, headJ: 0, lat: 0, head: 0, jump: 0, ov: 0, ovSec: 0, ovGhost: 0, cars: 0, lc: 0, yield: 0, cut: 0 };
  for (const r of L) for (const k in o) o[k] += r[k] || 0; o.cars = Math.round(o.cars / Math.max(1, L.length)); o.v = +(o.v / Math.max(1, L.length)).toFixed(1); o.ovSec = +o.ovSec.toFixed(1); return o; };
return { ring: sum('ring'), street: sum('street'), sites: res, want: d.trafficWant(), fl: ST };
