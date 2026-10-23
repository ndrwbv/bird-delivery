/* Корты (courts.js): поставить машину у корта и посмотреть. В npm run check не входит.
   Кадр:  npm run probe -- --eval=tools/probe-checks/courts.js --q="ctwhere=padel&ctact=play" --shot=out.png --scale=0.5
   ctwhere — osm | sport | yard | padel (какой корт; по умолчанию — первый), ctn — который из них (0);
   ctact — play | shovel | skate (занятие силой; без — как выпадет); cth — час мира (13); ctdist — м от машины до края корта (8);
   ctseason=0.4 — лето (по умолчанию — как выпало: зима); ctside=1 — смотреть с другой стороны.
   Ответ: корты (сколько, где), этот корт, людей на нём. */
const Q = new URLSearchParams(location.search);
const WHERE = Q.get('ctwhere'), N = +(Q.get('ctn') || 0), ACT = Q.get('ctact'), H = +(Q.get('cth') || 13), DIST = +(Q.get('ctdist') || 8), SEA = Q.get('ctseason'), SIDE = +(Q.get('ctside') || 0);
await onShift(); autopilot(false);
if (d.CITYOPEN) d.CITYOPEN.unlockAll();
if (d.districtLocks) d.districtLocks();
await until(() => d.LATE && !d.LATE.busy(), 60000);
if (SEA) d.season.set(+SEA);
d.ENV.t = d.ECON.tOfHour(H);
const C = d.COURTS;
const list = C.LIST.filter(c => !WHERE || c.where === WHERE);
const c = list[N] || C.LIST[0];
if (!c) return { err: 'кортов нет', st: C.ST };
const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; d.ENV.t = d.ECON.tOfHour(H); };
const put = (x, z, h) => {
  const V = d.V; V.x = x; V.z = z; V.h = h; V.y = d.groundH(x, z);
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
};
// машина — сбоку от корта (по короткой оси), носом к середине
const s = SIDE ? 1 : -1, nx = -c.uz, nz = c.ux, back = c.W / 2 + DIST;
const x = c.x + nx * back * s + c.ux * 4, z = c.z + nz * back * s + c.uz * 4, h = Math.atan2(c.x - x, c.z - z);
tp(x, z); put(x, z, h);
if (ACT) C.force(ACT);
for (let k = 0; k < 100; k++) { hold(); put(x, z, h); await wait(50); }
const ppl = c.act ? c.act.ppl.filter(p => !p.dead).length : 0;
return {
  courts: C.count(), st: { ms: C.ST.ms, osm: C.ST.osm, sport: C.ST.sport, yard: C.ST.yard, padel: C.ST.padel, panels: C.ST.panels, holes: C.ST.holes, glass: C.ST.glass },
  court: { kind: c.kind, where: c.where, x: Math.round(c.x), z: Math.round(c.z), L: c.L, W: c.W, ice: c.ice, contrast: !!c.contrast }, act: c.act && c.act.kind, ppl,
  ball: !!(c.act && c.act.ball && c.act.ball.visible), snowy: d.SEAS ? d.SEAS.snowy() : undefined,
  list: C.LIST.map(q => [q.kind, q.where, Math.round(q.x), Math.round(q.z)].join(' ')),
};
