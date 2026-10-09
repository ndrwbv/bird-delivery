/* ──────────────────────────────────────────────────────────────────────────
   Тупики для потока (09.10.2026). Правила словами — docs/CAREER.md «Движение машин» → «Тупики».

   Беда: в карте (OpenStreetMap) есть односторонние улицы, которые упираются в тупик или в
   улицу, куда потоку нельзя (двор, пешеходка, одностороння навстречу, край карты, закрытый
   район). Машина доезжала до конца, развернуться ей «нельзя» (против шерсти) — и её
   переставляли в другое место прямо на глазах у игрока. Автобусы такие остановки обходили.

   Правило:
   • «ловушка» — направленное ребро, по которому поток может въехать, но с его конца дальше
     некуда: ни вперёд по разрешённой улице, ни назад (обратная сторона закрыта — односторонняя).
     Цепочка односторонних, которая ведёт только в ловушку, — тоже ловушка (до упора);
   • ловушка для потока — двусторонний тупик, как во дворе: машина доезжает до конца,
     разворачивается и едет назад по той же улице (обратная сторона открыта потоку: e.ok,
     e.uturn), до первого перекрёстка, где можно уехать. Полосы на такой улице — как на
     двусторонней (e.two): узкая (уже 7 м) — одна посередине, встречные прижимаются и
     сбавляют (narrow.js), шире — по половине полотна. Разметку и знаки на улице не меняем;
   • закрытый район (lock) — тоже тупик: пересчёт, когда открылся район (districtLocks);
   • ремонт не ставится на улицу, которая единственный выезд с односторонней (blocksExit, roadlife.js);
     если выезда всё же нет (запасной случай) — машина рядом с курьером (ближе HIDE м) стоит у конца
     улицы и ждёт, переставить её можно только дальше HIDE м (game.js startTurn).

   Из game.js: mark(api) — после сборки графа улиц и при каждой смене закрытых районов;
   api — { NODES, EDGES, edgeOf, flowOk(e), inside(x, z, m), lockNear(n), dry }.
   blocksExit(api, e) — ремонт на e оставит чей-то въезд без выезда (тогда roadlife.js его тут не ставит).
   counted(d, x, z, why) — каждая перестановка машины потока (placeTraffic): ближе HIDE м
   к курьеру — ST.tp (должно быть 0 от тупиков), дальше — ST.tpFar. Отладка: __dlv.DEADENDS.
   ?nodeadend — как было (сравнить).
   ────────────────────────────────────────────────────────────────────────── */

export const DEADEND = {
  HIDE: 200,          // м: ближе к курьеру машину потока не переставляем — стоит и ждёт
};

export const ST = {
  traps: 0,           // рёбер-ловушек (направленных)
  opened: 0,          // обратных сторон, открытых потоку для разворота
  ms: 0,              // сколько считали, мс
  list: [],           // места: { n: улица, x, z — конец, len — длина ребра, м, c — класс, end — сам тупик, lock — у закрытого района, edge — у края карты }
  tp: 0,              // перестановок машины потока ближе HIDE м к курьеру
  tpFar: 0,           // перестановок дальше (это нормально: вне кадра)
  why: {},            // ближние перестановки по причинам: turn — некуда ехать с конца ребра, rejoin — после удара, respawn — сгорела, …
  whyFar: {},         // то же дальше HIDE м
  waits: 0,           // раз машина встала у конца улицы, а не исчезла на глазах
  uturns: 0,          // разворотов в конце ловушки
  last: null,         // последняя ближняя перестановка: { x, z, d, why }
  turnAt: [],         // где машине с конца улицы было некуда ехать: [x, z, до курьера] (первые 20)
};

/* можно ли потоку въехать на ребро: то, что не меняется за смену, + закрытые районы (lock);
   ремонт (closed у roadlife) — нет: он временный, на него — ожидание в startTurn;
   за линией закрытого города (MAP.open, узел out) — навсегда, учитываем */
const flowEdge = (api, e) => !!e && e.ok && e.c <= 5 && !e.lock && !api.NODES[e.a].out && !api.NODES[e.b].out && api.flowOk(e) &&
  api.inside(api.NODES[e.b].x, api.NODES[e.b].z, -40);

/* есть ли с конца ребра e выезд вперёд (не назад) на ребро потока, которое не ловушка */
function exits (api, e, trap) {
  for (const c of api.NODES[e.b].nb) {
    if (c === e.a) continue;
    const n = api.edgeOf(e.b, c);
    if (flowEdge(api, n) && !trap.has(n)) return true;
  }
  return false;
}

const OPENED = [];        // обратные стороны, открытые прошлым mark — вернуть перед пересчётом
const TRAPS = [];
export function mark (api) {
  const t0 = performance.now();
  for (const b of OPENED) { b.ok = false; b.uturn = 0; b.two = 0; }
  for (const e of TRAPS) { e.trap = 0; e.two = 0; }
  OPENED.length = 0; TRAPS.length = 0;
  const trap = new Set();
  const all = [];
  for (const e of api.EDGES.values()) if (flowEdge(api, e)) all.push(e);
  // до упора: ловушка — нет выезда вперёд и нельзя назад; цепочка в ловушку — тоже ловушка
  for (let changed = true, guard = 0; changed && guard < 500; guard++) {
    changed = false;
    for (const e of all) {
      if (trap.has(e)) continue;
      const back = api.edgeOf(e.b, e.a);
      if (back && back.ok) continue;              // двусторонняя: из тупика назад и так можно
      if (exits(api, e, trap)) continue;
      trap.add(e); changed = true;
    }
  }
  ST.traps = trap.size; ST.opened = 0; ST.list = [];
  for (const e of trap) {
    // место — конец ловушки: с конца ребра вперёд нет ни одной улицы потока
    let end = true;
    for (const c of api.NODES[e.b].nb) if (c !== e.a && flowEdge(api, api.edgeOf(e.b, c))) { end = false; break; }
    if (!end) continue;
    const B = api.NODES[e.b];
    // длина тупика — от последнего перекрёстка с выездом до конца
    let len = 0, k = e, guard = 0;
    while (k && trap.has(k) && guard++ < 200) {
      len += k.len;
      let prev = null;
      for (const c of api.NODES[k.a].nb) { const p = api.edgeOf(c, k.a); if (c !== k.b && p && trap.has(p)) { prev = p; break; } }
      k = prev;
    }
    ST.list.push({ n: (e.road && e.road.n) || '', x: Math.round(B.x), z: Math.round(B.z), len: Math.round(len), c: e.c,
      lock: api.lockNear(e.b) ? 1 : 0, edge: api.inside(B.x, B.z, 60) ? 0 : 1 });
  }
  // и только потом открываем: обратные стороны — потоку, для разворота
  if (!api.dry) for (const e of trap) {            // ?nodeadend — только посчитать, как было
    const back = api.edgeOf(e.b, e.a);
    e.trap = 1; e.two = 1; TRAPS.push(e);
    if (back && !back.ok) { back.ok = true; back.uturn = 1; back.two = 1; OPENED.push(back); ST.opened++; }
  }
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

/* Ремонт закрывает улицу e в обе стороны. Оставит ли он машинам тупик без разворота: есть въезд в конец
   улицы (поток, обратно нельзя), а выезды оттуда — только эта улица или уже закрытые. Тогда ремонт тут
   не ставим (roadlife.js worksOk) */
export function blocksExit (api, e) {
  const r = api.edgeOf(e.b, e.a), shut = x => x === e || x === r || !!x.closed;
  for (const X of [e.a, e.b]) {
    for (const c of api.NODES[X].nb) {
      const p = api.edgeOf(c, X);                  // въезд в X
      if (!p || shut(p) || !flowEdge(api, p)) continue;
      const back = api.edgeOf(X, c);
      if (back && back.ok && !back.closed) continue;
      let out = false;
      for (const m of api.NODES[X].nb) { if (m === c) continue; const n = api.edgeOf(X, m); if (n && !shut(n) && flowEdge(api, n)) { out = true; break; } }
      if (!out) return true;
    }
  }
  return false;
}

/* перестановка машины потока: d — сколько было до курьера, м; why — откуда */
export function counted (d, x, z, why) {
  if (why === 'turn' && ST.turnAt.length < 20) ST.turnAt.push([Math.round(x), Math.round(z), Math.round(d)]);
  if (d < DEADEND.HIDE) {
    ST.tp++; ST.why[why] = (ST.why[why] || 0) + 1;
    ST.last = { x: Math.round(x), z: Math.round(z), d: Math.round(d), why };
  } else { ST.tpFar++; ST.whyFar[why] = (ST.whyFar[why] || 0) + 1; }
}

export const DEBUG = { DEADEND, ST, mark };
