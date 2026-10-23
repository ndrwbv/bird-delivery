/* Жизнь во дворах (yardlife.js): поставить машину у сцены и посмотреть. В npm run check не входит.
   Кадр сцены:  npm run probe -- --eval=tools/probe-checks/yardlife.js --q="ylkind=beer&ylh=13" --shot=out.png --scale=0.5
   Тот же вид без жизни во дворах (сравнить): --q="noyl&ylat=X,Z,H&ylh=13" — X, Z, H из ответа прошлого запуска.
   ylkind — bench | smoke | beer | garage | shashlik | domino | ball | snowman | sled; ylh — час мира (13 — день, 23 — ночь);
   ylseason=0.4 — лето (по умолчанию — как выпало: зима); yldist — метров от машины до сцены (12).
   Ответ: где стоит машина (at — для ylat), сцена (вид, людей), сколько людей модуля ближе 150 м, все люди ближе 150 м. */
const Q = new URLSearchParams(location.search);
const KIND = Q.get('ylkind'), H = +(Q.get('ylh') || 13), AT = Q.get('ylat'), DIST = +(Q.get('yldist') || 12), SEA = Q.get('ylseason');
await onShift(); autopilot(false);
d.CITYOPEN.unlockAll(); d.districtLocks();
if (SEA) d.season.set(+SEA);
d.ENV.t = d.ECON.tOfHour(H);
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); };
const put = (x, z, h) => {
  const V = d.V; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z);
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
};
const humans = (r = 150) => { let n = 0; d.scene.traverse(o => { if (o.userData && o.userData.look && o.parent === d.scene && o.visible && Math.hypot(o.position.x - d.V.x, o.position.z - d.V.z) < r) n++; }); return n; };
const Y = d.YLIFE;
let sc = null;
if (AT) {
  const [x, z, h] = AT.split(',').map(Number);
  tp(x, z); put(x, z, h);
  for (let k = 0; k < 80; k++) { hold(); put(x, z, h); await wait(50); }
} else {
  await wait(1500);
  Y.dropAll();
  for (let k = 0; k < 40 && !sc; k++) {
    Y.force(KIND); hold(); await wait(250);
    sc = Y.SCENES.find(s => s.kind === KIND);
    if (!sc && k % 8 === 7) { const a = Math.random() * 6.28; tp(d.V.x + Math.sin(a) * 120, d.V.z + Math.cos(a) * 120); }
  }
  if (!sc) return { err: 'нет сцены ' + KIND, mode: Y.mode() };
  // машина — на дороге у сцены, носом к ней, сцена в DIST м впереди
  tp(sc.x, sc.z);
  const V = d.V, h = Math.atan2(sc.x - V.x, sc.z - V.z), back = DIST;          // машина может встать и на газон: кадр — ради сцены
  const x = sc.x - Math.sin(h) * back, z = sc.z - Math.cos(h) * back;
  put(x, z, h);
  for (let k = 0; k < 90; k++) { hold(); put(x, z, h); await wait(50); }
}
return { at: [+d.V.x.toFixed(1), +d.V.z.toFixed(1), +d.V.h.toFixed(3)].join(','), scene: sc ? [sc.kind, sc.ppl.filter(p => !p.dead).length] : null,
  mine: Y.off ? 0 : Y.count().mine, all150: humans(), mode: Y.mode(), st: { ...Y.ST } };
