/* ──────────────────────────────────────────────────────────────────────────
   Дворы у многоэтажек: лавочки у подъездов, тропинки и низкие заборчики
   (docs/IDEAS.md блок 6; правила словами — docs/CAREER.md «Дворы у подъездов»).

   Подъезд многоэтажки (жилой дом от 3 этажей, не особняк, не частный, не гараж и не цех):
     • тропинка PATH.W (1,6 м) от дорожки вдоль стены прямо от двери — до общей дорожки; упёрлась
       в асфальт двора — значит, туда и ведёт (это тоже выход); упёрлась в дом, забор или воду —
       тупик, такую не кладём;
     • общая дорожка WALK.W (1,8 м) — вдоль стены с подъездами в WALK.OFF (7,5 м) от неё. Дом,
       проезд или забор режут её на куски. Каждый кусок, к которому ведёт хоть одна дверь, выводим
       в общую сеть: выход LINK.W (1,5 м) от конца (или от середины, если так ближе) до ближайшего
       «где ходят» (pave.js): тротуара, пешеходки, края проезда, чужой дорожки или аллеи — не
       длиннее LINK.MAX (40 м), не сквозь дом, забор, воду, постройку и точку конкурента, на
       тротуар — на метр внахлёст, не на асфальт. Второй конец — тоже в сеть, если до неё ≤
       LINK.MAX2 (15 м), иначе дорожка кончается у крайней двери, без хвоста в газон. Кусок без
       выхода не кладём вовсе (и тропинки его дверей) — тупиков нет;
     • по обе стороны тропинки — низкий заборчик FENCE.H (0,55 м) в FENCE.U (2,9 м) от её оси
       (у FENCE.FLOWERS — 35 % подъездов — вместо него бордюр с цветами), кусками по 2,5 м:
       сбиваются на ходу, как дворовые заборчики (машину чуть тормозит, не держит);
     • лавочка у BENCH.SHARE (80 %) подъездов: сбоку от тропинки, вдоль неё, спинкой к заборчику,
       лицом к тропинке; сторона — жребий по месту подъезда (каждый запуск там же); на выход и
       чужую дорожку не встаёт.
   Зимой: все эти дорожки — цвета-метки YARD.COLOR, сезонный шейдер оставляет их протоптанными
   (snow на них — пятнами, серее), сугробы сезона и снежной зимы на них не ложатся (onYard).
   Заборчик не встаёт на тротуар, пешеходку и чужую дорожку (pave.js) — там кусок пропускаем.
   Между тропинкой и заборчиками — 4 м свободно: туда встаёт пин и подъезжает машина. Заборчик и
   лавочка для пина — как стена (blocks): луч пина через них не идёт, пин не встаёт вплотную.

   Всё — в склейке дворовой мелочи (smashAdd) и в статике дорожек (LITM): новых отрисовок нет.
   Проверка — npm run check «дорожки дворов в сети» (tools/probe-checks/yard-paths.js, DEBUG.NETS).
   ────────────────────────────────────────────────────────────────────────── */

import { onPave } from './pave.js';

export const YARD = {
  MIN_LV: 3,
  STEP: 6,                                       // домов за шаг поздней сборки (latebuild.js): на Деке шаг ~30—60 мс
  PATH: { W: 1.6, FROM: 2.3, MIN: 3 },
  WALK: { OFF: 7.5, W: 1.8, EXT: 4, STEP: 3, ROAD_MAX: 40 },
  FENCE: { U: 2.9, H: 0.55, SEG: 2.5, FROM: 2.9, FLOWERS: 0.35, COLORS: ['#3f7a4a', '#4f6fa8', '#d8d2c8', '#8a3b3b', '#c9803a'] },
  BENCH: { SHARE: 0.8, U: 1.9, N: 3.9 },
  // выход общей дорожки в сеть: ширина, не длиннее MAX м, луч шагами STEP, внахлёст на OVER м,
  // DIRS направлений веером, старты — концы и каждые EVERY м (штраф PEN_MID м), веер — штраф PEN_FAN м
  LINK: { W: 1.5, MAX: 40, MAX2: 15, STEP: 0.7, FROM: 0.7, OVER: 1.5, DEEP: 0.6, DIRS: 16, EVERY: 12, OWN: 1.3, PEN_MID: 3, PEN_FAN: 1 },
  COLOR: '#d3c9b8',          // цвет-метка дворовых дорожек: зимой шейдер (seasons.js) оставляет их протоптанными
};

export const STATS = { ents: 0, multi: 0, doors: 0, paths: 0, doorRoad: 0, doorShort: 0, doorBlock: 0, doorHang: 0,
  walks: 0, walkHang: 0, walkNoDoor: 0, trim: 0, links: 0, linkM: 0, to: {}, fences: 0, flowers: 0, benches: 0, ms: 0 };
const NETS = [];         // для проверки: { doors: [[a, b]], walk, links: [[a, b, куда]] } — сеть одной стены

/* Все дворовые дорожки (тропинки дверей, общие, выходы; и выходы отмосток из game.js) — сетка
   по 10 м: сугробы зимы не ложатся на них (seasons.js, weather.js) */
const NET = new Map();
function netAdd (ax, az, bx, bz, half) {
  const s = [ax, az, bx, bz, half];
  for (let i = Math.floor((Math.min(ax, bx) - half - 4) / CELL); i <= Math.floor((Math.max(ax, bx) + half + 4) / CELL); i++)
    for (let j = Math.floor((Math.min(az, bz) - half - 4) / CELL); j <= Math.floor((Math.max(az, bz) + half + 4) / CELL); j++) {
      const k = i + ',' + j;
      let a = NET.get(k);
      if (!a) NET.set(k, a = []);
      a.push(s);
    }
}
export function addTrail (pts, half) { for (let i = 1; i < pts.length; i++) netAdd(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], half); }
/* на дворовой дорожке ли точка (с запасом m до её края; m ≤ 4) */
export function onYard (x, z, m = 0) {
  const a = NET.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (a) for (const s of a) if (segD(x, z, s[0], s[1], s[2], s[3]) < s[4] + m) return true;
  return false;
}

const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* заборы и лавочки для пина: отрезок каждой вещи в сетке по 10 м */
const CELL = 10, GRID = new Map();
function gridAdd (it) {
  const x0 = Math.floor((Math.min(it.ax, it.bx) - 1) / CELL), x1 = Math.floor((Math.max(it.ax, it.bx) + 1) / CELL);
  const z0 = Math.floor((Math.min(it.az, it.bz) - 1) / CELL), z1 = Math.floor((Math.max(it.az, it.bz) + 1) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = i + ',' + j;
    let a = GRID.get(k);
    if (!a) GRID.set(k, a = []);
    a.push(it);
  }
}
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

/* стоит ли целый заборчик или лавочка ближе r к точке — для пина (game.js pinRay / pinFree) */
export function blocks (x, z, r) {
  const a = GRID.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    const it = a[i];
    if (it.down) continue;
    if (segD(x, z, it.ax, it.az, it.bx, it.bz) < r + it.th) return true;
  }
  return false;
}

/* Расстановка — один раз, после подъездов и дорожек у стен (game.js osmEntrances).
   A: THREE, CITY, HOUSE_GRID, LITM, BENCHES, YARD_PATHS, box, put, smashAdd, groundH, inHouse,
      inBounds, inPoly, nearestRoad, benchOk, DRIVE_MAX, fenceNear (чужой забор ближе r — дорожку не ведём)
   build — разом; steps — те же шаги итератором для поздней сборки (latebuild.js): на Деке весь кусок ~1,3 с,
   шаг — несколько домов (YARD.STEP), меню между шагами отвечает. Места шагов не зависят от времени —
   город тот же при ?nolate и без */
export function build (A) {
  const it = steps(A);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
export function* steps (A) {
  const { THREE, CITY, LITM } = A, t0 = performance.now();
  const onAsphalt = (x, z, m = 0.6) => { const r = A.nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; };
  const fenced = (x, z, r) => !!(A.fenceNear && A.fenceNear(x, z, r));   // чужой забор (пиццерия, стройка, пустырь) — дорожку не ведём
  const bad = (x, z, m) => onAsphalt(x, z, m) || A.inHouse(x, z, 0.3) || A.groundH(x, z) < 0.3;

  // чужие тропинки (до тротуара, аллеи): заборчик их не перегораживает
  const PG = new Map();
  for (const q of A.YARD_PATHS) for (let i = 1; i < q.length; i++) {
    const [ax, az] = q[i - 1], [bx, bz] = q[i];
    const s = { ax, az, bx, bz };
    for (let gx = Math.floor((Math.min(ax, bx) - 2) / CELL); gx <= Math.floor((Math.max(ax, bx) + 2) / CELL); gx++)
      for (let gz = Math.floor((Math.min(az, bz) - 2) / CELL); gz <= Math.floor((Math.max(az, bz) + 2) / CELL); gz++) {
        const k = gx + ',' + gz;
        let a = PG.get(k);
        if (!a) PG.set(k, a = []);
        if (a.length < 40) a.push(s);
      }
  }
  const nearPath = (x, z, r) => { for (const s of PG.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) if (segD(x, z, s.ax, s.az, s.bx, s.bz) < r) return true; return false; };

  // подъезды многоэтажек → стены домов, на которых они стоят
  const walls = new Map();
  for (const e of CITY.entrances) {
    const [x, z, nx, nz] = e;
    STATS.ents++;
    if (!A.inBounds(x, z, -40)) continue;
    const ix = x - nx * 0.6, iz = z - nz * 0.6;
    let hb = null;
    for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) if (A.inPoly(ix, iz, b.p)) { hb = b; break; }
    if (!hb || (hb.k && hb.k !== 'res') || hb.st === 'villa' || hb.st === 'priv') continue;
    const p = hb.p;
    if (hb.lvY === undefined) {
      let s2 = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; s2 += a[0] * c[1] - c[0] * a[1]; }
      const area = Math.abs(s2) / 2;
      hb.lvY = hb.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    }
    if (hb.lvY < YARD.MIN_LV) continue;
    let bi = -1, bd = 3, bu = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < bd) { bd = d; bi = i; bu = t * Math.sqrt(l2); }
    }
    if (bi < 0) continue;
    STATS.multi++;
    let set = walls.get(hb);
    if (!set) walls.set(hb, set = new Map());
    let w = set.get(bi);
    if (!w) set.set(bi, w = { nx, nz, ents: [] });
    w.ents.push({ x, z, u: bu });
  }

  yield 'walls';
  const P = YARD.PATH, W = YARD.WALK, F = YARD.FENCE, B = YARD.BENCH;
  // заборчики ставим в самом конце, когда все тропинки, общие дорожки и выходы к тротуару уже
  // проложены: кусок, на который потом легла чужая дорожка, пропускаем (onPave ниже)
  const FENCES = [], fenceSeg = (...a) => FENCES.push(a);
  const fenceNow = (ax, az, bx, bz, hex, flowers) => {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    if (l < 0.6 || bad(cx, cz, 0.9) || bad(ax, az, 0.6) || bad(bx, bz, 0.6) || nearPath(cx, cz, 1.3)) return;
    if (onPave(cx, cz, 0.3) || onPave(ax, az, 0.15) || onPave(bx, bz, 0.15)) return;     // не на тротуар и чужую дорожку (pave.js)
    const ry = Math.atan2(-(bz - az), bx - ax), ex = (bx - ax) / l, ez = (bz - az) / l, gy = A.groundH(cx, cz), g = [];
    let it;
    if (flowers) {
      A.box(g, l, 0.16, 0.22, '#c9c2b6', cx, gy + 0.08, cz, ry);              // бордюр
      A.box(g, l - 0.1, 0.22, 0.3, '#4f8f3f', cx, gy + 0.27, cz, ry);         // зелень
      const n = Math.max(2, Math.round(l / 0.6));
      for (let k = 0; k < n; k++) {                                          // цветы — кубики, по вершинам дёшево
        const t = (k + 0.5) / n - 0.5, px = cx + ex * t * l, pz = cz + ez * t * l, hs = hash(px, pz, 3);
        A.box(g, 0.2, 0.2, 0.2, ['#e0475a', '#f2c230', '#b65fd0', '#f08a3c', '#f4f1ea'][Math.floor(hs * 5)], px, gy + 0.44 + hs * 0.08, pz, ry + hs);
      }
      it = A.smashAdd('bush', cx, cz, Math.min(1.3, l / 2), g, '#4f8f3f');
      STATS.flowers++;
    } else {
      A.box(g, l, 0.06, 0.05, hex, cx, gy + F.H - 0.05, cz, ry);
      A.box(g, l, 0.06, 0.05, hex, cx, gy + F.H * 0.45, cz, ry);
      for (const o of [-l / 2 + 0.04, l / 2 - 0.04]) A.box(g, 0.07, F.H, 0.07, hex, cx + ex * o, gy + F.H / 2, cz + ez * o);
      it = A.smashAdd('fence', cx, cz, Math.min(1.3, l / 2), g, hex);
      STATS.fences++;
    }
    it.ax = ax; it.az = az; it.bx = bx; it.bz = bz; it.th = 0.05;
    gridAdd(it);
  };

  /* ── выход в общую сеть ──
     Луч от точки дорожки по газону до первого «где ходят» (pave.js): тротуар, пешеходка, край
     дворового проезда, чужая дорожка или аллея. Не сквозь дом, забор, воду, постройку и точку
     конкурента; отмостка чужого дома (полоса у стены) — не выход. Сначала — прямо к ближайшей
     улице с концов, потом — веером из концов и каждых LINK.EVERY м; берём самый короткий. */
  const L = YARD.LINK;
  // чужие заборы (как fenceNear в game.js, только своей сеткой — луч спрашивает сотни тысяч раз)
  const FG = new Map();
  for (const it of A.SMASH || []) {
    if ((it.kind !== 'fence' && it.kind !== 'bigfence') || it.rshop || it.down) continue;
    const x = it.x ?? it.x0, z = it.z ?? it.z0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    let q = FG.get(k);
    if (!q) FG.set(k, q = []);
    q.push(x, z, Math.min(it.r || 1, 1.3));
  }
  const fencedFast = A.SMASH ? (x, z, r) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const q = FG.get(i + ',' + j);
      if (q) for (let k = 0; k < q.length; k += 3) { const dx = q[k] - x, dz = q[k + 1] - z, rr = r + q[k + 2]; if (dx * dx + dz * dz < rr * rr) return true; }
    }
    return false;
  } : fenced;
  const blocked = (x, z) => A.groundH(x, z) < 0.3 || A.inHouse(x, z, 0.6) || fencedFast(x, z, 0.9) ||
    (A.solidAt && A.solidAt(x, z, 0.4)) || (A.rivBlocks && A.rivBlocks(x, z, 0.3));
  // own(x, z) — своя дорожка: её касание выходом не считаем
  function ray (sx, sz, dx, dz, maxL, own) {
    for (let t = L.FROM; t <= maxL; t += L.STEP) {
      const x = sx + dx * t, z = sz + dz * t;
      if (blocked(x, z)) return null;
      if (own(x, z)) continue;
      const k = onPave(x, z, 0);
      if (!k) continue;
      if (k === 'path' && A.inHouse(x, z, 2.6)) continue;          // отмостка у чужой стены — мимо
      // зашли на тротуар или дорожку — ещё чуть вперёд, чтобы лечь внахлёст (до DEEP м от края), но не
      // на асфальт и не насквозь
      if (onAsphalt(x, z, 0.25)) return null;
      let e = t;
      if (!onPave(x, z, -L.DEEP)) for (let q = t + L.STEP / 2; q <= t + L.OVER + 1e-6; q += L.STEP / 2) {
        const qx = sx + dx * q, qz = sz + dz * q, k2 = onPave(qx, qz, 0);
        if (!k2 || k2 === 'road' || onAsphalt(qx, qz, 0.25) || blocked(qx, qz)) break;
        e = q;
        if (onPave(qx, qz, -L.DEEP)) break;
      }
      return { t: e, to: k === 'road' ? 'walk' : k };
    }
    return null;
  }
  function linkFrom (starts, own, MAXL = L.MAX) {
    let best = null;
    const tryRay = (s, dx, dz, pen) => {
      const maxL = Math.min(MAXL, best ? best.t + best.pen - pen : MAXL);
      if (maxL < L.FROM) return;
      const r = ray(s[0], s[1], dx, dz, maxL, own);
      if (r && (!best || r.t + pen < best.t + best.pen)) best = { sx: s[0], sz: s[1], ex: s[0] + dx * r.t, ez: s[1] + dz * r.t, t: r.t, pen, to: r.to, u: s[3] };
    };
    // прямо к ближайшей улице
    for (const s of starts) {
      const r = A.nearestRoad(s[0], s[1], 7, 2);
      if (!r || r.d < 0.5) continue;
      tryRay(s, (s[0] - r.x) / r.d * -1, (s[1] - r.z) / r.d * -1, s[2]);
    }
    // веером — с концов
    for (const s of starts) if (!s[2]) for (let k = 0; k < L.DIRS; k++) {
      const a = k / L.DIRS * Math.PI * 2;
      tryRay(s, Math.cos(a), Math.sin(a), s[2] + L.PEN_FAN);
    }
    return best;
  }
  const segsNear = (segs, x, z, r) => { for (const q of segs) if (segD(x, z, q[0], q[1], q[2], q[3]) < r) return true; return false; };
  const addPath = (pts, half) => {
    A.YARD_PATHS.push(pts); CITY.paths.push(pts);
    for (let i = 1; i < pts.length; i++) netAdd(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], half);
  };
  const BENCHQ = [];

  let nHouse = 0;
  for (const [hb, set] of walls) {
    if (++nHouse % YARD.STEP === 0) yield 'houses';           // шаг поздней сборки — каждые YARD.STEP домов
    const p = hb.p;
    for (const [i, w] of set) {
      const a = p[i], c = p[(i + 1) % p.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 4) continue;
      const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len, nx = w.nx, nz = w.nz;
      const at = (u, n) => [a[0] + ux * u + nx * n, a[1] + uz * u + nz * n];
      w.ents.sort((q, r) => q.u - r.u);
      // 1) тропинки от дверей: докуда доходят и почему встали
      const goal = W.OFF - W.W / 2 + 0.2;            // чуть заходит на общую дорожку
      for (const e of w.ents) {
        let nEnd = P.FROM, stop = 'block';
        for (let n = P.FROM + 0.5; ; n += 0.5) {
          const nn = Math.min(n, goal), [qx, qz] = at(e.u, nn);
          if (onAsphalt(qx, qz, 0.4)) { stop = 'road'; break; }    // упёрлась в проезд двора — туда и ведёт
          if (bad(qx, qz, 0.4) || fenced(qx, qz, 0.8)) break;
          nEnd = nn;
          if (nn >= goal) { stop = 'goal'; break; }
        }
        e.nEnd = nEnd; e.full = stop === 'goal'; e.stop = stop;
        STATS.doors++;
        if (nEnd - P.FROM < P.MIN) { e.stop = 'short'; STATS.doorShort++; }
      }
      // 2) общая дорожка вдоль стены — кусками (дом, проезд, забор режут её)
      const pieces = [];
      if (w.ents.some(e => e.full)) {
        const u0 = Math.max(-W.EXT, w.ents[0].u - W.EXT), u1 = Math.min(len + W.EXT, w.ents[w.ents.length - 1].u + W.EXT);
        let cur = null;
        for (let u = u0; u < u1 - 0.01; u += W.STEP) {
          const u2 = Math.min(u1, u + W.STEP);
          const [x1, z1] = at(u, W.OFF), [x2, z2] = at(u2, W.OFF), [mx, mz] = at((u + u2) / 2, W.OFF);
          if (bad(mx, mz, 0.6) || A.inHouse(mx, mz, 0.6) || A.inHouse(x1, z1, 0.4) || A.inHouse(x2, z2, 0.4) || fenced(mx, mz, 1) || fenced(x1, z1, 0.8) || fenced(x2, z2, 0.8)) { cur = null; continue; }
          if (!cur) pieces.push(cur = { pts: [[x1, z1]], ua: u, ub: u2 });
          cur.pts.push([x2, z2]); cur.ub = u2;
        }
      }
      // 3) каждый кусок, к которому ведёт хоть одна дверь, — выводим в общую сеть
      for (const pc of pieces) {
        const doors = w.ents.filter(e => e.full && e.u >= pc.ua - 0.3 && e.u <= pc.ub + 0.3);
        if (!doors.length) { STATS.walkNoDoor++; continue; }
        const segs = [];
        for (let k = 1; k < pc.pts.length; k++) segs.push([pc.pts[k - 1][0], pc.pts[k - 1][1], pc.pts[k][0], pc.pts[k][1]]);
        for (const e of doors) { const [x1, z1] = at(e.u, P.FROM), [x2, z2] = at(e.u, e.nEnd); segs.push([x1, z1, x2, z2]); }
        const own = (x, z) => segsNear(segs, x, z, L.OWN);
        // откуда: концы куска (без штрафа) и середина через LINK.EVERY м
        const starts = [[...pc.pts[0], 0, pc.ua], [...pc.pts[pc.pts.length - 1], 0, pc.ub]];
        for (let u = pc.ua + L.EVERY; u < pc.ub - L.EVERY / 2; u += L.EVERY) starts.push([...at(u, W.OFF), L.PEN_MID, u]);
        const lk = linkFrom(starts, own);
        if (!lk) { STATS.walkHang++; STATS.doorHang += doors.length; continue; }
        // второй конец: тоже в сеть (короткий выход) — или дорожка кончается у крайней двери, без хвоста в газон
        const links = [lk];
        let ua = pc.ua, ub = pc.ub;
        const dA = doors[0].u - P.W / 2 - 0.1, dB = doors[doors.length - 1].u + P.W / 2 + 0.1;
        for (const [eu, s0] of [[pc.ua, starts[0]], [pc.ub, starts[1]]]) {
          if (Math.abs(eu - lk.u) < 0.01) continue;
          const l2 = linkFrom([s0], own, L.MAX2);
          if (l2) { links.push(l2); continue; }
          if (eu === pc.ua) ua = Math.max(pc.ua, Math.min(dA, lk.u)); else ub = Math.min(pc.ub, Math.max(dB, lk.u));
          STATS.trim++;
        }
        const pts = [at(ua, W.OFF)];
        for (let u = ua + W.STEP; u < ub - 0.5; u += W.STEP) pts.push(at(u, W.OFF));
        pts.push(at(ub, W.OFF));
        // рисуем: кусок, тропинки его дверей, выходы
        LITM.color(YARD.COLOR);
        for (let k = 1; k < pts.length; k++) LITM.ribbon(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], W.W, 0.084);
        addPath(pts, W.W / 2);
        STATS.walks++;
        for (const e of doors) e.on = true;
        for (const l of links) {
          LITM.ribbon(l.sx, l.sz, l.ex, l.ez, L.W, 0.085);
          LITM.disc(l.sx, l.sz, L.W / 2, 0.085, 6);
          LITM.disc(l.ex, l.ez, L.W / 2, 0.085, 6);
          addPath([[l.sx, l.sz], [l.ex, l.ez]], L.W / 2);
          STATS.links++; STATS.to[l.to] = (STATS.to[l.to] || 0) + 1;
          STATS.linkM += l.t;
        }
        NETS.push({ walk: pts, links: links.map(l => [[l.sx, l.sz], [l.ex, l.ez], l.to]), doors: doors.map(e => [at(e.u, P.FROM), at(e.u, e.nEnd)]) });
      }
      // 4) тропинки дверей: до общей дорожки (если она вышла в сеть) или до проезда двора
      for (const e of w.ents) {
        if (e.stop === 'short') continue;
        if (e.stop === 'road') { e.on = true; STATS.doorRoad++; NETS.push({ walk: null, links: [], doors: [[at(e.u, P.FROM), at(e.u, e.nEnd)]] }); }
        else if (!e.on) { if (!e.full) STATS.doorBlock++; continue; }
        const nEnd = e.nEnd;
        LITM.color(YARD.COLOR);
        for (let n = P.FROM; n < nEnd - 0.01; n += 2.5) {
          const [x1, z1] = at(e.u, n), [x2, z2] = at(e.u, Math.min(nEnd, n + 2.5));
          LITM.ribbon(x1, z1, x2, z2, P.W, 0.083);
        }
        addPath([at(e.u, P.FROM), at(e.u, nEnd)], P.W / 2);
        STATS.paths++;
        // заборчики (или бордюр с цветами) по обе стороны тропинки
        const flowers = hash(e.x, e.z, 22) < F.FLOWERS, hex = F.COLORS[Math.floor(hash(a[0], a[1], 23) * F.COLORS.length)];
        const nTo = nEnd - 0.4;
        for (const s of [-1, 1]) {
          const u = e.u + s * F.U;
          // соседний подъезд ближе — его тропинка: не перегораживаем
          if (w.ents.some(o => o !== e && Math.abs(o.u - u) < P.W / 2 + 0.6)) continue;
          const Lf = nTo - F.FROM;
          if (Lf < 1) continue;
          const k = Math.max(1, Math.round(Lf / F.SEG));
          for (let j = 0; j < k; j++) {
            const [ax, az] = at(u, F.FROM + Lf * j / k), [bx, bz] = at(u, F.FROM + Lf * (j + 1) / k);
            fenceSeg(ax, az, bx, bz, hex, flowers);
          }
        }
        // лавочка сбоку от тропинки, вдоль неё, лицом к ней — в конце, когда все дорожки проложены
        if (hash(e.x, e.z, 24) < B.SHARE && nEnd >= B.N + 1.3) {
          const benchSide = hash(e.x, e.z, 21) < 0.5 ? 1 : -1;
          const [bx, bz] = at(e.u + benchSide * B.U, B.N), [b0x, b0z] = at(e.u + benchSide * B.U, B.N - 1.2), [b1x, b1z] = at(e.u + benchSide * B.U, B.N + 1.2);
          BENCHQ.push({ bx, bz, b0x, b0z, b1x, b1z, ry: Math.atan2(-ux * benchSide, -uz * benchSide) });
        }
      }
    }
  }
  for (const q of BENCHQ) {
    if (!A.benchOk(q.bx, q.bz) || nearPath(q.bx, q.bz, 1.1) || onPave(q.bx, q.bz, 0.55)) continue;   // на чужую дорожку и выход к тротуару — нет
    const it = A.smashAdd('bench', q.bx, q.bz, 1.2, benchGeo(A, q.bx, q.bz, q.ry), '#8a6b4e');
    A.BENCHES.push({ x: q.bx, z: q.bz, y: A.groundH(q.bx, q.bz), ry: q.ry, prop: it });
    it.ax = q.b0x; it.az = q.b0z; it.bx = q.b1x; it.bz = q.b1z; it.th = 0.35;
    gridAdd(it);
    STATS.benches++;
  }
  STATS.linkM = Math.round(STATS.linkM);
  STATS.ms = Math.round(performance.now() - t0);
  yield 'benches';
  for (let i = 0; i < FENCES.length; i++) { fenceNow(...FENCES[i]); if (i % 400 === 399) yield 'fences'; }
  return STATS;
}

/* лавочка — как у аллей (world.js benchGeo): сиденье, спинка, две ножки */
function benchGeo (A, x, z, ry) {
  const gy = A.groundH(x, z), parts = [], c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = at(0, 0); A.box(parts, 2.4, 0.16, 0.62, '#8a6b4e', px, gy + 0.6, pz, ry);
  [px, pz] = at(0, -0.27); A.box(parts, 2.4, 0.5, 0.12, '#8a6b4e', px, gy + 0.98, pz, ry);
  for (const k of [-1, 1]) { [px, pz] = at(k * 1.05, -0.05); A.box(parts, 0.14, 0.85, 0.66, '#3b3f46', px, gy + 0.2, pz, ry); }
  return parts;
}

export const DEBUG = { YARD, STATS, NETS, blocks, onYard, get cells () { return GRID.size; }, get net () { return NET.size; } };
