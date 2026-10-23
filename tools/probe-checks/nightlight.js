/* Свет ночью на земле (nightlight.js, 11бж): кадры ночью — улица с фонарями, двор, частный сектор, магазины, мачта.
   В npm run check не входит.
   npm run probe -- --eval=tools/probe-checks/nightlight.js --size=deck --max=0 --timeout=300 --seed=7 --q="nshots=/папка&ntag=after"
   «Было» — та же сборка с ?oldnight: --q="oldnight&nshots=/папка&ntag=before". nh — час мира (23).
   Ответ: STATS (сколько пятен, окон, витрин, мешей, вершин), места кадров, вызовы отрисовки в кадре (calls) и из них — пятна света (light). */
const Q = new URLSearchParams(location.search), DIR = Q.get('nshots') || '', TAG = Q.get('ntag') || 'x', H = +(Q.get('nh') || 23);
await onShift();
autopilot(false);
if (d.S.state === 'brief') { d.acceptOrder(); await until(x => x.S.state === 'drive', 4000); }
d.CITYOPEN.unlockAll(); d.districtLocks();
{ const st = document.createElement('style'); st.textContent = '#phone{display:none!important}'; document.head.appendChild(st); }   // накладная заказа не закрывает кадр
const R = d.renderer;
let calls = 0, nl = 0, nlN = 0; const r0 = R.render.bind(R);
// вызовы пятен света: новые (nightlight / nightglare) и прежние (сложение с картинкой-кругом)
const rbd = R.renderBufferDirect;
R.renderBufferDirect = function (c, sc, g, m, o, gr) { if (o && (o.name === 'nightlight' || o.name === 'nightglare' || (m && m.blending === 2 && m.map && !o.isSprite && o.renderOrder === 2))) nlN++; return rbd.call(this, c, sc, g, m, o, gr); };
let CAM = null;                                      // своя камера сверху: [x, y, z, куда x, y, z] (двор, мачта)
R.render = (s, c) => { if (CAM && s === d.scene) { c.position.set(CAM[0], CAM[1], CAM[2]); c.lookAt(CAM[3], CAM[4], CAM[5]); c.updateMatrixWorld(); } nlN = 0; r0(s, c); if (s === d.scene) { calls = R.info.render.calls; nl = nlN; } };
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); d.ENV.rain = 0; d.ENV.rainWant = 0; };
const put = (x, z, h) => { const V = d.V; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z); if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; } };
const settle = async (x, z, h, n = 50) => { for (let k = 0; k < n; k++) { if (d.S.state === 'brief') d.acceptOrder(); hold(); put(x, z, h); await wait(50); } };
const L = d.SL.LAMPS, S = d.LAMP_SPOTS;
const near = (x, z, r) => S.some(s => Math.hypot(s[0] - x, s[1] - z) < r);
const hx = d.V.x, hz = d.V.z;                        // пиццерия — от неё ищем места поближе
const byDist = (a, f) => a.filter(f).sort((p, q) => Math.hypot(p.x - hx, p.z - hz) - Math.hypot(q.x - hx, q.z - hz));
const P = [];
const lampAt = (style, k = 0) => {
  const r = byDist(L, l => l.style === style && !l.down)[k];
  if (!r) return;
  tp(r.x + r.dx * 3, r.z + r.dz * 3);
  // вдоль улицы: машина в 12 м до фонаря, смотрит вдоль
  const fx = -r.dz, fz = r.dx, x = d.V.x - fx * 14, z = d.V.z - fz * 14;
  P.push([style, x, z, Math.atan2(fx, fz)]);
};
lampAt('cobra', 3); lampAt('cobra', 12); lampAt('cast'); lampAt('wood', 2); lampAt('conc', 2);
const up = (nm, x, z, h, hy = 18, back = 16) => { const g = d.groundH(x, z); P.push([nm, x, z, h, [x - Math.sin(h) * back, g + hy, z - Math.cos(h) * back, x + Math.sin(h) * 6, g, z + Math.cos(h) * 6]]); };
const ms = byDist(L, l => l.style === 'mast')[0];
{ const w = byDist(L, l => l.style === 'wood' && !l.down)[8]; if (w) { tp(w.x, w.z); up('woodtop', d.V.x, d.V.z, Math.atan2(-w.dz, w.dx), 26, 26); } }
if (ms) up('mast', ms.x + ms.dx * 14, ms.z + ms.dz * 14, Math.atan2(ms.dx, ms.dz), 22, 22);
// двор: подъезд в 80—700 м от пиццерии, фонарей ближе 35 м нет; машина в 14 м от двери носом к ней, и вид сверху на двор
const GE = (d.GEN_ENTR || []).filter(e => { const q = Math.hypot(e[0] - hx, e[1] - hz); return q > 80 && q < 700 && !near(e[0], e[1], 35); }).sort((p, q) => Math.hypot(p[0] - hx, p[1] - hz) - Math.hypot(q[0] - hx, q[1] - hz));
for (const k of [3, 11]) { const e = GE[k]; if (!e) continue; P.push(['yard' + k, e[0] + e[2] * 14, e[1] + e[3] * 14, Math.atan2(-e[2], -e[3])]); }
if (GE[5]) { const e = GE[5], x = e[0] + e[2] * 10, z = e[1] + e[3] * 10, g = d.groundH(x, z); P.push(['yardtop', x, z, Math.atan2(-e[2], -e[3]), [x + e[2] * 22, g + 24, z + e[3] * 22, x, g, z]]); }
// магазины: машина в 15 м от витрины, смотрит на неё
const SA = (d.NLIT && d.NLIT.STATS.shopAt) || [];
const sh = SA.slice().sort((p, q) => Math.hypot(p[0] - hx, p[1] - hz) - Math.hypot(q[0] - hx, q[1] - hz));
for (const k of [1, 6]) { const s = sh[k]; if (s) P.push(['shop' + k, s[0] + s[2] * 15, s[1] + s[3] * 15, Math.atan2(-s[2], -s[3])]); }
const out = { STATS: d.NLIT ? { ...d.NLIT.STATS, shopAt: SA.length } : null, places: [], calls: [], light: [] };
for (const [nm, x, z, h, cm] of P) {
  CAM = cm || null;
  await settle(x, z, h);
  out.places.push([nm, +x.toFixed(1), +z.toFixed(1), +h.toFixed(2)]); out.calls.push(calls); out.light.push(nl);
  if (DIR) await shot(DIR + '/' + out.places.length + '-' + nm + '-' + TAG + '.png');
}
CAM = null;
return out;
