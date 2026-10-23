/* Плавные улицы (11ч, roadsmooth.js): сводка города — сравнить «было / стало».
   npm run probe -- --eval=tools/probe-checks/smooth-summary.js --max=0            — как сейчас
   npm run probe -- --eval=tools/probe-checks/smooth-summary.js --max=0 --q=smooth — со скруглением
   Числа и отпечатки (хеш координат): узлы, рёбра, зебры, группы светофоров, дома с адресом, подъезды, остановки,
   фонари, деревья; BUILD_T — время кусков стройки. Без ?smooth отпечатки должны совпасть с замером «до» бит в бит. */
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 60000);
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const r2 = v => Math.round(v * 100) / 100;
const fp = (a, f) => fnv(a.map(f).join(';'));
const T = d.BUILD_T || {};
const kinds = (d.TREES && d.TREES.STATS && d.TREES.STATS.kinds) || {};
const stops = (d.BUS && d.BUS.STOPS) || [];
const lamps = (d.SL && d.SL.LAMPS) || [];
const addr = d.HOUSES.filter(h => h.addr);
return {
  smooth: d.SMOOTH ? { on: d.SMOOTH.STATS.on, STATS: d.SMOOTH.STATS } : null,
  n: {
    nodes: d.NODES.length, edges: d.EDGES.size, zebras: d.ZEBRAS.length, sigGroups: d.SIG_GROUPS.length,
    houses: d.HOUSES.length, housesAddr: addr.length, entr: d.GEN_ENTR.length, spots: d.SPOTS.length,
    stops: stops.length, lamps: lamps.length, trees: Object.values(kinds).reduce((s, v) => s + v, 0),
  },
  fp: {
    nodes: fp(d.NODES, q => r2(q.x) + ',' + r2(q.z)),
    zebras: fp(d.ZEBRAS, q => r2(q.x) + ',' + r2(q.z)),
    houses: fp(d.HOUSES, q => r2(q.x) + ',' + r2(q.z) + ',' + (q.addr || '')),
    entr: fp(d.GEN_ENTR, q => q.map(r2).join(',')),
    spots: fp(d.SPOTS, q => r2(q.x) + ',' + r2(q.z)),
    stops: fp(stops, q => q.n + ',' + (q.e ? q.e.a + '-' + q.e.b : '') + ',' + r2(q.x || 0) + ',' + r2(q.z || 0)),
    lamps: fp(lamps, q => r2(q.x !== undefined ? q.x : q[0]) + ',' + r2(q.z !== undefined ? q.z : q[1])),
    trees: fnv(JSON.stringify(kinds)),
  },
  T: { roads: T.roads, curbs: T.curbs, marks: T.marks, mapfix: T.mapfix, houses: T.houses, entr: T.entr, walks: T.walks, trees: T.trees, rings: T.rings, mesh: T.mesh, tris: T.tris },
};
