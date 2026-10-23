/* Правки редактора города применены (для npm run check; можно и так: npm run probe -- --eval=tools/probe-checks/edits.js).
   src/maps/<карта>/edits.json (docs/SANDBOX.md «Редактор города», src/game/editlayer.js):
     • каждое «поставить» стоит в городе: дерево — ствол (SOLIDS .tree), лавочка — реквизит, коробка — твёрдый
       прямоугольник, остальное — сбиваемое (SMASH) в 0,4 м от точки;
     • каждое «убрать» — этого вида в 0,35 м от точки нет: дерево — ствола, щит — щита (billboards.js), ельник и
       мелочь газона — в собранной клетке (forest.js, lawnprops.js собирают её тут же), остальное — сбиваемого;
     • «убрать» хоть что-то нашло (иначе — правка устарела: город поменялся), «поставить» игра не отказала;
     • дома (houses): убранного нет в городе (ни дома, ни адреса), у остальных — этажи и цвет стен из правки,
       мурал «нет» — без мурала; мурал «есть», который не влез (нет глухой стены, дом низкий), и номер дома, которого
       нет в карте, — предупреждение. */
const E = d.EDL, ed = E.edits || {}, R = 0.4;
const near = (x, z, ax, az, r = R) => Math.hypot(x - ax, z - az) < r;
const tree = (x, z, r) => d.SOLIDS.some(s => s.tree && near(s.cx, s.cz, x, z, r));
const smash = (k, x, z, r) => d.SMASH.some(s => s.kind === k && !s.down && near(s.x, s.z, x, z, r));
const bench = (x, z, r) => smash('bench', x, z, r) || d.PROPS.some(p => p.kind === 'bench' && near(p.x, p.z, x, z, r));
const board = (x, z, r) => ((d.BB && d.BB.list) || []).some(b => near(b[0], b[1], x, z, r + 0.6));   // DEBUG.list — округлено до метра
const SMK = { bin: 'bin', tyres: 'bin', sandpile: 'sand', beater: 'fence', lamp: 'lamp' };
const out = { add: (ed.add || []).length, remove: (ed.remove || []).length, missing: [], still: [], refused: E.STATS.refused, stale: [] };
for (const a of ed.add || []) {
  const ok = a.kind === 'tree' ? tree(a.x, a.z) : a.kind === 'bench' ? bench(a.x, a.z) : a.kind === 'box' ? E.BOXES.some(b => b.id === a.id) : smash(SMK[a.kind] || a.kind, a.x, a.z);
  if (!ok) out.missing.push([a.id, a.kind, Math.round(a.x), Math.round(a.z)]);
}
for (const r of ed.remove || []) {
  const r0 = E.R_MATCH - 0.01, P = E.PROV[r.kind];
  const here = r.kind === 'tree' ? tree(r.x, r.z, r0) : r.kind === 'bench' ? bench(r.x, r.z, r0) : r.kind === 'board' ? board(r.x, r.z, r0)
    : E.LAZY[r.kind] ? (P ? P.has(r.x, r.z, r0) > 0 : false) : smash(r.kind, r.x, r.z, r0);
  if (here) out.still.push([r.kind, Math.round(r.x), Math.round(r.z)]);
  if (!(E.hits(r) > 0)) out.stale.push([r.kind, Math.round(r.x), Math.round(r.z)]);
}
const HS = E.HOUSES || { list: [], dropped: [], missing: [] }, BS = d.MAP.data.buildings, byId = new Map(BS.map(b => [String(b.id), b]));
out.houses = { n: (HS.list || []).length, bad: [], noMural: [], unknown: HS.missing || [] };
for (const h of HS.list || []) {
  const b = byId.get(String(h.id)), dropped = (HS.dropped || []).some(q => String(q.id) === String(h.id));
  if (h.drop) { if (b || !dropped) out.houses.bad.push([h.id, 'не убран']); continue; }
  if (!b) continue;                                                         // нет в карте — unknown
  if (h.lv && b.lv !== Math.max(E.HOUSE_LV[0], Math.min(E.HOUSE_LV[1], Math.round(h.lv)))) out.houses.bad.push([h.id, 'этажей ' + b.lv + ' вместо ' + h.lv]);
  if (h.col && b._hex !== String(h.col).toLowerCase()) out.houses.bad.push([h.id, 'цвет ' + b._hex + ' вместо ' + h.col]);
  if (h.mural === 0 && b._mural) out.houses.bad.push([h.id, 'мурал остался']);
  if (h.mural === 1 && !b._mural) out.houses.noMural.push([h.id, b._muralNo || 'не тот дом']);
}
out.ok = !out.missing.filter(m => !out.refused.includes(m[0])).length && !out.still.length && !out.houses.bad.length;
return out;
