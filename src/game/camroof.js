/* ──────────────────────────────────────────────────────────────────────────
   Камера сзади под крышей: арки, мосты, навесы АЗС (0п40, автор 24.10.2026: «в арку заезжаешь — камера должна быть за
   машиной, а сейчас сквозь потолок идёт»). Правила словами — docs/CAREER.md «Камера: три вида» → «Под аркой и мостом».

   В видах «сзади, высоко» (game.js camStep) и «сзади, близко» (camview.js near) камера висит на 6,2 и 3,4 м над
   машиной — выше свода арки (прямоугольная — 4,4 м над землёй, круглая — 4,9) и низа моста над улицей (от 5 м).
   Здесь — «насколько мы под крышей» (k 0…1, плавно): машина под сводом, вот-вот въедет (впереди по ходу), или
   сама камера ещё под ним — камера опускается ниже свода и подтягивается ближе за машину; выехали и камера
   вышла — плавно обратно. Свод сзади, куда отъезжает камера, пока она высоко, — как стена: в него не заходит.
   Сама камера под сводом — всегда ниже его (RF.MARGIN), что бы ни было.

     RF.init({ ARCHES, ARCH_W, BRIDGES, deckAt, ROOFS })   — ROOFS: навесы (АЗС, landmarks.js FUEL_ROOFS)
     RF.begin(dt, V, camX, camZ)       — раз в кадр из вида: → k (0 — как всегда, 1 — под крышей), сглажено
     RF.dist(full, kind) / RF.h(h, kind) — расстояние за машиной и высота над ней под крышей (kind 'high' | 'near')
     RF.back(V, sx, sz, maxD, hRel)    — до какого расстояния назад камера может отойти на высоте hRel над машиной
                                         (свод, который ниже, — как стена); Infinity — ничего
     RF.clampY(x, z, y, lvl)           — камера под сводом — не выше него
     RF.ceilAt(x, z, lvl)              — потолок над точкой (абсолютная высота) для того, кто на высоте lvl; Infinity — нет
   `?oldroof` — как было (камера сквозь свод).
   ────────────────────────────────────────────────────────────────────────── */

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const ROOF = {
  OFF: Q.has('oldroof'),
  MARGIN: 0.75,               // камера под сводом — не выше «свод − 0,75 м» (ближняя граница кадра — 0,4 м)
  MIN_UP: 1.2, MAX_UP: 9,     // потолок считается, если он выше машины на 1,2…9 м (ниже — это мост, по которому едем; выше — камера и так влезает)
  PAD: 0.7,                   // устье: свод «начинается» за 0,7 м до плоскости стены (в ней перемычка, стена толстая)
  SIDE: 0.6,                  // и шире тоннеля на 0,6 м с каждой стороны (камера у стены тоннеля)
  AHEAD: 6, AHEAD_T: 0.9,     // вот-вот въедет: свод впереди по ходу на 6 м + 0,9 с пути
  UP: 3.2, DOWN: 1.4,         // как быстро k растёт (въехали) и спадает (выехали): ~0,7 с и ~1,6 с
  HIGH: { dist: 8.5, h: 3.3 },  // «сзади, высоко» под сводом: 8,5 м за машиной (было 12,5), 3,3 м над ней (было 6,2), не выше свода − 0,75
  NEAR: { dist: 6, h: 3 },      // «сзади, близко»: 6 м (было 6,6), 3 м (было 3,4)
  MOUTH_W: 7, MOUTH_DOT: 0.55,   // к устью: сбоку от оси не дальше 7 м, курс в тоннель не круче ~57°
  MOUTH_NEAR: 5,              // а у самого устья (до 5 м) — хоть немного к нему (с улицы вдоль дома круто поворачивают в арку)
  YAW: 6,                    // под сводом камера догоняет поворот машины быстрее (+6 к своей скорости): в узком тоннеле не отстаёт вбок, в стену
  TURN: 1.6,                  // в повороте «впереди» — по дуге поворота (поворачиваем в арку с улицы), не круче 1,6 рад/с
  CELL: 32,
};
export const STATS = { k: 0, under: 0, ceil: null, frames: 0, clamped: 0 };

let A = null, GRID = null, NA = -1, NB = -1, NR = -1;
export const RF = { k: 0, c: Infinity, w: 0, h0: undefined, under: false, init, begin, dist, h, back, clampY, ceilAt };
export function init (api) { A = api; }

const cellKey = (i, j) => i * 100003 + j;
function addBox (o, x0, z0, x1, z1) {
  const C = ROOF.CELL;
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = cellKey(i, j), a = GRID.get(k);
      if (a) a.push(o); else GRID.set(k, [o]);
    }
}
/* клетки 32 м: арки и куски мостов; город достраивается за меню — пересобираем, когда их стало больше */
function grid () {
  const AR = A.ARCHES, BR = A.BRIDGES, RO = A.ROOFS || [];
  if (GRID && NA === AR.length && NB === BR.length && NR === RO.length) return GRID;
  GRID = new Map(); NA = AR.length; NB = BR.length; NR = RO.length;
  for (const r of RO) { const e = Math.abs(r.ux) * r.hu + Math.abs(r.nx) * r.hn + 1, f = Math.abs(r.uz) * r.hu + Math.abs(r.nz) * r.hn + 1; addBox({ r }, r.x - e, r.z - f, r.x + e, r.z + f); }
  const m = A.ARCH_W / 2 + ROOF.SIDE + 1;
  for (const a of AR) {
    const ex = a.mx + a.ix * a.t, ez = a.mz + a.iz * a.t;
    addBox({ a }, Math.min(a.mx, ex) - m, Math.min(a.mz, ez) - m, Math.max(a.mx, ex) + m, Math.max(a.mz, ez) + m);
  }
  for (const b of BR) addBox({ b }, b.bx0, b.bz0, b.bx1, b.bz1);
  return GRID;
}

/** потолок над (x, z) для того, кто на высоте lvl: свод арки или низ настила моста; Infinity — над головой ничего */
export function ceilAt (x, z, lvl) {
  if (!A) return Infinity;
  const cell = grid().get(cellKey(Math.floor(x / ROOF.CELL), Math.floor(z / ROOF.CELL)));
  if (!cell) return Infinity;
  let c = Infinity;
  const R = A.ARCH_W / 2;
  for (const o of cell) {
    let y = Infinity;
    if (o.a) {
      const a = o.a, dx = x - a.mx, dz = z - a.mz;
      const l = dx * a.ix + dz * a.iz;
      if (l < -ROOF.PAD || l > a.t + ROOF.PAD) continue;
      const w = Math.abs(dx * a.ux + dz * a.uz);
      if (w > R + ROOF.SIDE) continue;
      // круглая — по своду: у стены ниже (пята), прямоугольная — плоский потолок
      y = a.round ? a.top + Math.sqrt(Math.max(0, R * R - Math.min(w, R) * Math.min(w, R))) : a.crown;
    } else if (o.r) {
      const r = o.r, dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx * r.ux + dz * r.uz) > r.hu + ROOF.SIDE || Math.abs(dx * r.nx + dz * r.nz) > r.hn + ROOF.SIDE) continue;
      y = r.y;
    } else {
      const b = o.b;
      if (x < b.bx0 || x > b.bx1 || z < b.bz0 || z > b.bz1) continue;
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
      const t = ((x - b.x1) * dx + (z - b.z1) * dz) / (dx * dx + dz * dz || 1);
      if (t < 0 || t > 1) continue;
      if (Math.hypot(x - b.x1 - dx * t, z - b.z1 - dz * t) > b.ws / 2 + ROOF.SIDE) continue;
      y = A.deckAt(b, t, x, z) - 1.8;                 // низ балок настила (game.js osmBridges)
    }
    if (y - lvl < ROOF.MIN_UP || y - lvl > ROOF.MAX_UP) continue;
    if (y < c) c = y;
  }
  return c;
}

/* подъезжаем к устью арки и едем в него (по ходу не дальше ah, курс в тоннель не круче ~55°, сбоку от оси не дальше
   MOUTH_W): проезд с улицы к арке часто под углом — прямо по курсу свода ещё нет, а камере пора вниз */
function mouthAhead (V, fx, fz, ah, lvl) {
  const C = ROOF.CELL, ci = Math.floor(V.x / C), cj = Math.floor(V.z / C), G = grid();
  let c = Infinity;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const cell = G.get(cellKey(i, j));
    if (!cell) continue;
    for (const o of cell) {
      const a = o.a;
      if (!a || a.crown >= c) continue;
      const dx = V.x - a.mx, dz = V.z - a.mz, l = dx * a.ix + dz * a.iz, w = Math.abs(dx * a.ux + dz * a.uz);
      if (w > ROOF.MOUTH_W) continue;
      const into = fx * a.ix + fz * a.iz;
      const ok = (l < 0 && l > -ah && into > ROOF.MOUTH_DOT) || (l > a.t && l < a.t + ah && into < -ROOF.MOUTH_DOT)
        || (w < ROOF.MOUTH_NEAR && ((l < 0 && l > -ROOF.MOUTH_NEAR && into > 0.2) || (l > a.t && l < a.t + ROOF.MOUTH_NEAR && into < -0.2)));   // у самого устья и хоть немного к нему
      if (!ok || a.crown - lvl < ROOF.MIN_UP || a.crown - lvl > ROOF.MAX_UP) continue;
      c = a.crown;
    }
  }
  return c;
}

/** раз в кадр: под крышей ли мы (машина, впереди по ходу, сама камера) → k 0…1, сглажено */
export function begin (dt, V, camX, camZ) {
  if (!A || ROOF.OFF) return (RF.k = 0);
  const lvl = V.y;
  let c = ceilAt(V.x, V.z, lvl);
  const sp = Math.hypot(V.vx || 0, V.vz || 0);
  // куда едем: по скорости (задним ходом — назад), стоим — по курсу
  const fx = sp > 1 ? V.vx / sp : Math.sin(V.h), fz = sp > 1 ? V.vz / sp : Math.cos(V.h);
  const ah = ROOF.AHEAD + sp * ROOF.AHEAD_T;
  for (let d = 1; d <= ah; d += 1) c = Math.min(c, ceilAt(V.x + fx * d, V.z + fz * d, lvl));
  // поворачиваем (с улицы в арку): ещё и по дуге — куда приедем, если так и держать руль
  const dh = RF.h0 === undefined ? 0 : Math.atan2(Math.sin(V.h - RF.h0), Math.cos(V.h - RF.h0));
  RF.h0 = V.h;
  RF.w += ((dt > 0 ? Math.max(-ROOF.TURN, Math.min(ROOF.TURN, dh / dt)) : 0) - RF.w) * (1 - Math.exp(-10 * dt));
  if (Math.abs(RF.w) > 0.15 && sp > 1) {
    let a = Math.atan2(fx, fz), x = V.x, z = V.z;
    for (let d = 1; d <= ah; d += 1) {
      a += RF.w / sp; x += Math.sin(a); z += Math.cos(a);
      c = Math.min(c, ceilAt(x, z, lvl));
    }
  }
  c = Math.min(c, mouthAhead(V, fx, fz, ah, lvl));
  if (camX !== undefined) c = Math.min(c, ceilAt(camX, camZ, lvl));
  const under = c < Infinity;
  RF.under = under;
  if (under) RF.c = c - lvl;                           // помним высоту свода над машиной — для выезда, пока k спадает
  RF.k += ((under ? 1 : 0) - RF.k) * (1 - Math.exp(-(under ? ROOF.UP : ROOF.DOWN) * dt));
  if (RF.k < 0.002) { RF.k = 0; RF.c = Infinity; }
  STATS.k = +RF.k.toFixed(3); STATS.under = under ? 1 : 0; STATS.ceil = under ? +(c - lvl).toFixed(2) : null; STATS.frames++;
  return RF.k;
}
const smooth = k => k * k * (3 - 2 * k);
/** расстояние за машиной: обычное full → под крышей своё */
export function dist (full, kind) {
  const s = smooth(RF.k);
  return s ? full + ((kind === 'near' ? ROOF.NEAR : ROOF.HIGH).dist - full) * s : full;
}
/** высота над машиной: обычная h → под крышей своя, и не выше свода */
export function h (hh, kind) {
  const s = smooth(RF.k);
  if (!s) return hh;
  const low = Math.min((kind === 'near' ? ROOF.NEAR : ROOF.HIGH).h, RF.c - ROOF.MARGIN);
  return hh + (Math.min(hh, low) - hh) * s;
}
/** камера уходит назад от машины по (−sx, −sz) на высоте hRel над ней: первый свод ниже неё — как стена (м от машины) */
export function back (V, sx, sz, maxD, hRel) {
  if (!A || ROOF.OFF || RF.under) return Infinity;   // въезжаем или камера ещё под сводом — она и так опускается под него
  for (let d = 1; d <= maxD + 1; d += 0.5) {
    const c = ceilAt(V.x - sx * d, V.z - sz * d, V.y);
    if (c < Infinity && c - ROOF.MARGIN < V.y + hRel) return d;
  }
  return Infinity;
}
/** камера под сводом — не выше «свод − MARGIN» */
export function clampY (x, z, y, lvl) {
  if (!A || ROOF.OFF) return y;
  const c = ceilAt(x, z, lvl);
  if (c === Infinity || y <= c - ROOF.MARGIN) return y;
  STATS.clamped++;
  return c - ROOF.MARGIN;
}
