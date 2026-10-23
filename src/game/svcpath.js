/* ──────────────────────────────────────────────────────────────────────────
   Путь машин с маршрутом — курьеры (свои и конкуренты) и скорая (svcRoute в game.js).
   Правила словами — docs/CAREER.md «Свои курьеры и конкуренты».

   До 17.10.2026 путь искали поиском в ширину от БЛИЖАЙШЕГО УЗЛА графа улиц — по прямой,
   хоть он за домом на соседней улице; и по всем проездам во дворы (класс 7), что жмутся
   к стенам и ныряют в арки. Машина от точки на своей улице ехала по прямой к тому узлу —
   сквозь дом, и в конце так же от последнего узла к цели. Теперь:
     • старт и финиш — концы того куска улицы, на котором стоит машина и цель (а не ближайший
       узел), — первая и последняя прямая идут вдоль улицы;
     • кратчайший по длине путь (A*), только по улицам (класс ≤ DRIVE_MAX) — без проездов во
       дворы; кусок улицы, что режет дом (не арка) осевой или правым бортом на своей полосе, — не
       едем (проверка раз на кусок, запоминается);
     • закрыто ремонтом (roadlife.js), за линией закрытого города, в закрытый район — не едем;
     • не нашлось — null: game.js берёт прежний поиск (лучше доехать как раньше, чем стоять).
   Переменных игры модуль не видит — всё приходит в init.
   ────────────────────────────────────────────────────────────────────────── */

import { unwind } from './routechain.js';

let A = null;
export const CFG = { off: false, norc: false };  // отладка: off — по-старому (замер до/после); norc — без цепочек (сравнить пути)
export const STATS = { calls: 0, ok: 0, same: 0, fail: 0, ms: 0, max: 0, cut: 0, edges: 0, pops: 0, wall: 0, jump: 0, warmed: 0, at: [] };   // wall — кадров «упёрся в стену», jump — перенос на улицу (game.js svcWall)
let G = null, PR = null, SG = null, HK = [], HV = [], gen = 0;

/* api: { NODES, edgeOf(a, b), segCut(ax, az, bx, bz) — режет дом?, DRIVE_MAX, RC — цепочки узлов (routechain.js, только с ?smooth;
   нет — поиск по узлам, как был) } */
let PO = null;
export function init (api) { A = api; }

function push (k, v) {
  HK.push(k); HV.push(v);
  let i = HK.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (HK[p] <= HK[i]) break;
    const tk = HK[p], tv = HV[p]; HK[p] = HK[i]; HV[p] = HV[i]; HK[i] = tk; HV[i] = tv;   // без [a, b] = [b, a]: тот выделяет массив
    i = p;
  }
}
let TOP = 0;
function pop () {
  const v = HV[0]; TOP = HK[0];
  const lk = HK.pop(), lv = HV.pop();
  if (HK.length) {
    HK[0] = lk; HV[0] = lv;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < HK.length && HK[l] < HK[m]) m = l;
      if (r < HK.length && HK[r] < HK[m]) m = r;
      if (m === i) break;
      const tk = HK[m], tv = HV[m]; HK[m] = HK[i]; HV[m] = HV[i]; HK[i] = tk; HV[i] = tv;
      i = m;
    }
  }
  return v;
}

/* кусок улицы режет дом? — осевая (в обе стороны) или правый край машины на своей полосе (полоса — как в
   game.js lanePath: min(1,9 м, ширина / 4) от осевой, плюс 1 м — полкузова): дом или гараж, что залез на
   полотно, задевает бортом. Раз на ребро, дальше из памяти */
function cuts (e, u, v) {
  if (e.svcCut === undefined) {
    const N = A.NODES, U = N[u], W = N[v];
    let c = e.svcAxis;
    if (c === undefined) {
      c = A.segCut(U.x, U.z, W.x, W.z) ? 1 : 0;
      e.svcAxis = c;
      const r = A.edgeOf(v, u);
      if (r) r.svcAxis = c;
    }
    if (!c) {
      const o = Math.min(1.9, (e.w || 6) / 4) + 1, ox = e.rx * o, oz = e.rz * o;
      c = A.segCut(U.x + ox, U.z + oz, W.x + ox, W.z + oz) ? 1 : 0;
    }
    e.svcCut = c;
    STATS.edges++; if (c) STATS.cut++;
  }
  return e.svcCut === 1;
}

/* в спокойные кадры (game.js после отрисовки, wk — сколько занял кадр, мс): заранее проверить все куски улиц «режет ли
   дом» — раньше это делал первый путь курьера через новый край города, разом: на «Деке» 7—11 мс в одном кадре (18.10.2026).
   Не больше ~0,4 мс за кадр и только если кадр сам короче 12 мс; весь город — за несколько секунд смены */
let WI = 0, WJ = 0;
export function warm (wk) {
  if (!A || CFG.off || WI < 0 || !(wk < 12) || !A.NODES.length) return;
  const N = A.NODES, MAXC = A.DRIVE_MAX, t0 = performance.now();
  while (WI < N.length) {
    const nb = N[WI].nb || [];
    while (WJ < nb.length) {
      const v = nb[WJ++], e = A.edgeOf(WI, v);
      if (e && e.svcCut === undefined && !(e.c > MAXC)) cuts(e, WI, v);
      if (performance.now() - t0 > 0.4) return;
    }
    WI++; WJ = 0;
  }
  WI = -1; STATS.warmed = 1;
}

/* r0, r1 — точки на улице у старта и у цели (nearestRoad: { x, z, seg }).
   Возвращает узлы пути (NODES[…]) от конца куска старта до конца куска цели; [] — тот же кусок;
   null — не нашлось (тогда game.js — по-старому) */
export function route (r0, r1) {
  if (!A || !r0 || !r1 || CFG.off) return null;
  const s0 = r0.seg, s1 = r1.seg;
  if (s0.na === undefined || s0.nb === undefined || s1.na === undefined || s1.nb === undefined) return null;
  STATS.calls++;
  if ((s0.na === s1.na && s0.nb === s1.nb) || (s0.na === s1.nb && s0.nb === s1.na)) {
    // тот же кусок: прямо по нему (цель за спиной — машина доворачивает сама)
    STATS.same++; return [];
  }
  const t0 = performance.now();
  const N = A.NODES, n = N.length, MAXC = A.DRIVE_MAX;
  if (!G || G.length !== n) { G = new Float64Array(n); PR = new Int32Array(n); SG = new Uint32Array(n); }
  gen++;
  HK.length = 0; HV.length = 0;
  const ex = r1.x, ez = r1.z;
  const h = k => { const dx = N[k].x - ex, dz = N[k].z - ez; return Math.sqrt(dx * dx + dz * dz); };   // не Math.hypot: в горячем цикле он не встраивается
  const relax = (k, g, p) => {
    if (SG[k] === gen && G[k] <= g) return;
    SG[k] = gen; G[k] = g; PR[k] = p;
    push(g + h(k), k);
  };
  const RC = CFG.norc ? null : A.RC;
  if (RC && (!PO || PO.length !== n)) PO = new Array(n).fill(null);
  const relaxC = (k, g, p, o) => {
    if (SG[k] === gen && G[k] <= g) return;
    SG[k] = gen; G[k] = g; PR[k] = p; PO[k] = o;
    push(g + h(k), k);
  };
  if (RC) { relaxC(s0.na, Math.hypot(N[s0.na].x - r0.x, N[s0.na].z - r0.z), -1, null); relaxC(s0.nb, Math.hypot(N[s0.nb].x - r0.x, N[s0.nb].z - r0.z), -1, null); }
  else {
    relax(s0.na, Math.hypot(N[s0.na].x - r0.x, N[s0.na].z - r0.z), -1);
    relax(s0.nb, Math.hypot(N[s0.nb].x - r0.x, N[s0.nb].z - r0.z), -1);
  }
  const ta = s1.na, tb = s1.nb;
  let best = Infinity, bn = -1, pops = 0, via = null;
  while (HK.length) {
    const u = pop(), g = G[u];
    if (TOP > g + h(u) + 1e-6) continue;           // устаревшая запись
    if (TOP >= best) break;
    pops++;
    if (u === ta || u === tb) {
      const c = g + Math.hypot(N[u].x - ex, N[u].z - ez);
      if (c < best) { best = c; bn = u; via = null; }
    }
    const U = N[u];
    if (RC) {
      // плавные улицы: по цепочкам узлов с двумя соседями разом (routechain.js), проверки — на каждом куске, как ниже
      for (const o of RC.OUT[u]) {
        if (o.c < 0) {
          const v = o.to, W = N[v], e = o.e;
          if ((W.out || W.lock) && v !== ta && v !== tb) continue;
          if (!e || e.closed || e.c > MAXC || cuts(e, u, v)) continue;
          relaxC(v, g + e.len, u, null);
          continue;
        }
        const S = RC.SEQ[o.c], E = o.dir > 0 ? RC.EF[o.c] : RC.EB[o.c];
        let pv = u, gg = g, ok = true;
        for (let k = o.p0 + o.dir; ; k += o.dir) {
          const v = S[k], W = N[v], e = E[o.dir > 0 ? k - 1 : k];
          if ((W.out || W.lock) && v !== ta && v !== tb) { ok = false; break; }
          if (!e || e.closed || e.c > MAXC || cuts(e, pv, v)) { ok = false; break; }
          gg += e.len;
          if (k === o.end) break;
          if (v === ta || v === tb) {                               // конец куска цели — внутри цепочки
            const c = gg + Math.hypot(W.x - ex, W.z - ez);
            if (c < best) { best = c; bn = v; via = { u, o, q: k }; }
          }
          pv = v;
        }
        if (ok) relaxC(o.to, gg, u, o);
      }
      continue;
    }
    for (const v of U.nb) {
      const W = N[v];
      if ((W.out || W.lock) && v !== ta && v !== tb) continue;   // за линию закрытого города и в закрытый район не ведём
      const e = A.edgeOf(u, v);
      if (!e || e.closed || e.c > MAXC) continue;                 // ремонт поперёк; проезды во дворы — не для курьеров
      if (cuts(e, u, v)) continue;                                // кусок сквозь дом
      relax(v, g + e.len, u);
    }
  }
  const ms = performance.now() - t0;
  STATS.ms += ms; STATS.max = Math.max(STATS.max, ms); STATS.pops = Math.max(STATS.pops, pops);
  if (bn < 0) { STATS.fail++; return null; }
  STATS.ok++;
  if (RC) return unwind(RC, PR, PO, bn, via).map(k => N[k]);
  const out = [];
  for (let k = bn; k !== -1; k = PR[k]) out.push(N[k]);
  out.reverse();
  return out;
}

export const DEBUG = { STATS, CFG, route };
