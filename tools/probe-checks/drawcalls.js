/* Кто делает вызовы отрисовки (17.10.2026, статика города по клеткам): смена на автопилоте, раз в ~0,5 с — кадр с подсчётом
   по слоям. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/drawcalls.js --cpu=3 --size=deck --max=0 --timeout=300 --seed=21
   --q=dcsecs=40 — секунд смены (30). Ответ: calls — вызовов в кадре в среднем (все кадры), render — отрисовка, мс (среднее / p95),
   cull — CULL.step, мс в среднем; stat — вызовов статики в кадре (неподвижное в мировых координатах: склейки, слои клеток)
   по материалу (тип + слой шейдера), mov — подвижное по хозяину (верхний предок на сцене) и материалу; cells — клеток 200 м
   статики в кадре и сколько у клетки слоёв (вызовов) в среднем. --q=dcplaces=12 — не ехать, а постоять в 12 местах × 4 стороны
   (places: вызовов в кадре в среднем и по местам) — для «до/после» на одном и том же городе (--seed). Флаги игры для сравнения
   одной сборкой: ?nobox (без коробок, cull.js), ?nojoint (сугробы, листья, деревья — тремя мешами), ?noflatm (вывески
   отдельно от разметки), ?mwall (матрицы и у спрятанного), ?nolitj (реквизит своей склейкой), ?nolampm (плафоны своей склейкой),
   ?farold (дальнее CULL.step по-старому), ?nolix (клетки без общих вершин), ?nosmj (мелочь дворов своей склейкой). Птицы — InstancedMesh с единичной матрицей: попадают в stat. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('dcsecs') || 30), PLACES = +(Q.get('dcplaces') || 0);
const R = d.renderer, r0 = R.render, T = d.THREE;
await onShift();
if (PLACES) { d.CITYOPEN.unlockAll(); d.districtLocks(); } else autopilot(true);
await wait(4000);
const ID = new T.Matrix4();
const matKey = m => {
  if (!m) return '?';
  if (Array.isArray(m)) return 'multi:' + m.map(matKey).join('+');
  let k = m.type.replace('Material', '');
  try { const c = m.customProgramCacheKey && m.customProgramCacheKey(); if (c && c !== '' && !/^function/.test(c)) k += ':' + String(c).slice(0, 40); } catch (e) {}
  if (m.name) k += '#' + m.name;
  return k;
};
const own = new Map([[d.TRAFFIC, 'traffic'], [d.PEOPLE, 'people'], [d.PEDS, 'peds'], [d.PROPS, 'props']]);
const top = o => { let p = o; while (p.parent && p.parent !== d.scene) p = p.parent; return p; };
const ownerOf = (() => {
  const C = new WeakMap();
  return o => {
    const t = top(o); let c = C.get(t);
    if (c) return c;
    c = t.name || (t.userData && t.userData.lite ? 'liteCar' : t.isGroup ? 'group' + t.children.length : t.type);
    for (const [arr, n] of own) if (arr.some(x => x && (x === t || x.mesh === t || x.g === t || x.grp === t || x.pivot === t || x.group === t))) { c = n; break; }
    C.set(t, c); return c;
  };
})();
const isStatic = o => !o.matrixAutoUpdate && o.matrixWorld.equals(ID);
let counting = false, CF = 0;
const ST = {}, MV = {}, CELL = {};
let frameCells = null;
const P0 = T.Object3D.prototype.onBeforeRender;
T.Object3D.prototype.onBeforeRender = function (r, s, c, g, m) {
  if (!counting || s !== d.scene) return;
  if (isStatic(this)) {
    const k = matKey(m); ST[k] = (ST[k] || 0) + 1;
    const bs = g && g.boundingSphere;
    if (bs) { const ck = Math.floor(bs.center.x / 200) + ',' + Math.floor(bs.center.z / 200); frameCells[ck] = (frameCells[ck] || 0) + 1; }
  } else {
    const k = ownerOf(this) + ' | ' + matKey(m); MV[k] = (MV[k] || 0) + 1;
  }
};
let calls = 0, cn = 0, rd = [], cullT = 0, cullN = 0, farT = 0;
const PF = d.crashlog.PROF; PF.fn = (n, ms) => { if (n === 'cullstep') { cullT += ms; cullN++; } else if (n === 'cull') farT += ms; };
let nextCount = performance.now() + 500, cellAcc = { n: 0, layers: 0 };
R.render = function (s, c) {
  const doC = s === d.scene && performance.now() > nextCount;
  if (doC) { counting = true; frameCells = {}; }
  const t = performance.now(); r0.call(R, s, c);
  if (s === d.scene) { rd.push(performance.now() - t); calls += R.info.render.calls; cn++; }
  if (doC) { counting = false; CF++; nextCount = performance.now() + 500; const v = Object.values(frameCells); cellAcc.n += v.length; cellAcc.layers += v.reduce((a, b) => a + b, 0); }
};
/* --q=dcplaces=12: вместо езды — места (старт у пиццерии и узлы улиц через равный шаг по списку NODES), в каждом 4 стороны
   света; машина стоит, камера за ней. Город с --seed одинаковый — места те же в сборках «до» и «после» */
const PL = [];
if (PLACES) {
  const hold = () => { d.V.vx = d.V.vz = 0; for (const k in d.IN) if (typeof d.IN[k] === 'number') d.IN[k] = 0; };
  const NS = d.NODES, step = Math.max(1, Math.floor(NS.length / PLACES));
  const spots = [[d.V.x, d.V.z]];
  for (let i = Math.floor(step / 2); spots.length < PLACES && i < NS.length; i += step) spots.push([NS[i].x, NS[i].z]);
  for (const [x, z] of spots) for (let h = 0; h < 4; h++) {
    tp(x, z, h * Math.PI / 2);
    const t1 = performance.now(); while (performance.now() - t1 < 1500) { hold(); await wait(50); }
    const c0 = calls, n0 = cn; nextCount = 0;
    const t2 = performance.now(); while (performance.now() - t2 < 600) { hold(); await wait(50); }
    PL.push(Math.round((calls - c0) / Math.max(1, cn - n0)));
  }
} else await wait(SECS * 1000);
R.render = r0; T.Object3D.prototype.onBeforeRender = P0; PF.fn = null;
const f = Math.max(1, CF), avg = o => Object.entries(o).map(([k, v]) => [k, +(v / f).toFixed(1)]).sort((a, b) => b[1] - a[1]);
const sum = o => +(Object.values(o).reduce((a, b) => a + b, 0) / f).toFixed(1);
const s = rd.slice().sort((a, b) => a - b);
return { places: PLACES ? { avg: Math.round(PL.reduce((a, b) => a + b, 0) / (PL.length || 1)), each: PL } : undefined, frames: cn, counted: CF, calls: Math.round(calls / (cn || 1)), render: [+(rd.reduce((a, b) => a + b, 0) / (rd.length || 1)).toFixed(2), +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2)],
  cull: cullN ? +(cullT / cn).toFixed(3) : null, cullFar: +(farT / (cn || 1)).toFixed(3),
  statTotal: sum(ST), movTotal: sum(MV), cells: [+(cellAcc.n / f).toFixed(1), +(cellAcc.layers / Math.max(1, cellAcc.n)).toFixed(1)],
  stat: avg(ST).slice(0, 40), mov: avg(MV).slice(0, 40), crash: d.crashlog.count() };
