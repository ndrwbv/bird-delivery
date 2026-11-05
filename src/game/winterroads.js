import { corridorModes } from './snow/roads.js';

/* Зимнее полотно: на одних улицах песок, на других снег с колеёй.
   Цвет и рыхлые места строятся из одних и тех же отрезков; запрос колеса — по клеткам 32 м.
   Меш скрывается вне снежного сезона в seasons.js. */

export const WINTER_ROAD = {
  CELL: 32,
  SAND_MAIN: 0.16,            // песок — редкая лёгкая посыпка, не сплошное покрытие
  SAND_LOCAL: 0.12,
  SOFT_ACC: 0.3,              // рыхлый снег ощущается, но не останавливает машину
  SOFT_DRAG: 0.25,            // лёгкое сопротивление качению, 1/с
  SOFT_SIDE: 0.22,            // небольшая потеря бокового сцепления
  WHEEL_SPIN: 3.0,            // добавочная видимая прокрутка колеса, м/с
};

export const ST = { snow: 0, clear: 0, sand: 0, tracks: 0, soft: 0, crushed: 0, edges: 0, crossings: 0, sprays: 0, exampleSoft: null, exampleSand: null, exampleClear: null, exampleRut: null, exampleJunction: null };
const GRID = new Map();
const SAND_GRID = new Map();
const SNOW_GRID = new Map();
const RUT_GRID = new Map();
const ROAD_GRID = new Map(), MOUND_GRID = new Map();
const EMPTY = [];
let MODES = new Map();
const RUT_BASE = 0.12, RUT_FLOOR = 0.045, RUT_RIDGE = 0.15;
const SPOTS = { soft: [], sand: [], clear: [], rut: [], junction: [] };
let sprayT = 0, spraySide = 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function hash (x, z, salt = 0) {
  let h = Math.imul(Math.round(x * 4) + salt * 907, 0x9e3779b1) ^ Math.imul(Math.round(z * 4) - salt * 173, 0x85ebca6b);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const key = (i, j) => i + ',' + j;
const hasRuts = road => road.c === 5 || road.c === 7;
function roadMode (road) {
  const connected = MODES.get(road);
  if (connected) return connected;
  const pts = road.p, mid = road.mid0 ? road.mid0[1] : road.m0 || pts[(pts.length / 2) | 0];
  const roll = hash(mid[0], mid[1], road.c + 31);
  const sandShare = road.c <= 3 ? WINTER_ROAD.SAND_MAIN : road.c === 7 ? 0.05 : WINTER_ROAD.SAND_LOCAL;
  const clearShare = road.c <= 3 ? 0.55 : road.c === 4 ? 0.38 : road.c === 5 ? 0.2 : 0.08;
  const sand = roll < sandShare, clear = !sand && roll < sandShare + clearShare;
  // Даже во дворе колея есть не везде; на посыпанном и расчищенном нет.
  const rut = hasRuts(road) && !sand && !clear && hash(mid[0], mid[1], 179) < (road.c === 7 ? 0.65 : 0.48);
  return { sand, clear, rut };
}
const laneCenter = (lane, count, w) => (lane + 0.5 - count / 2) * w / count;
const smooth = t => t * t * (3 - 2 * t);
const rutFade = (progress, total, fade, breaks) => {
  let factor = fade ? smooth(clamp(Math.min(progress, total - progress) / fade, 0, 1)) : 1;
  for (const b of breaks) factor = Math.min(factor, smooth(clamp((Math.abs(progress - b.at) - b.core) / b.ramp, 0, 1)));
  return factor;
};

function indexBox (grid, p, x0, z0, x1, z1) {
  for (let i = Math.floor(x0 / WINTER_ROAD.CELL); i <= Math.floor(x1 / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor(z0 / WINTER_ROAD.CELL); j <= Math.floor(z1 / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = grid.get(k);
      if (list) list.push(p); else grid.set(k, [p]);
    }
}

function registerRoad (p) {
  const margin = p.w / 2 + 10;
  indexBox(ROAD_GRID, p, Math.min(p.a[0], p.b[0]) - margin, Math.min(p.a[1], p.b[1]) - margin,
    Math.max(p.a[0], p.b[0]) + margin, Math.max(p.a[1], p.b[1]) + margin);
}

// И CPU, и дальняя геометрия используют один профиль настоящей выемки.
function rutProfile (off, w, count = 1) {
  const step = Math.min(0.78, w / (count * 2.6));
  const outer = Math.min(0.35, step * 0.48), inner = Math.min(0.13, outer * 0.45);
  let h = RUT_BASE;
  for (let lane = 0; lane < count; lane++) for (const side of [-1, 1]) {
    const d = Math.abs(off - laneCenter(lane, count, w) - side * step);
    if (d < inner) h = Math.min(h, RUT_FLOOR + (RUT_BASE - RUT_FLOOR) * 0.12 * (d / inner) ** 2);
    else if (d < outer) h = RUT_FLOOR + (RUT_RIDGE - RUT_FLOOR) * smooth((d - inner) / (outer - inner));
    else if (d < outer + 0.16) h = Math.max(h, RUT_BASE + (RUT_RIDGE - RUT_BASE) * (1 - smooth((d - outer) / 0.16)));
  }
  return h;
}

const MOUND_T = [0, 0.16, 0.34, 0.52, 0.74, 0.9, 1];
const MOUND_RISE = [0, 0.35, 0.78, 1, 0.72, 0.24, 0];
const MOUND_TAPER = [0.03, 0.42, 0.86, 1, 0.8, 0.38, 0.03];
function moundWobble (p, i) {
  const along = p.d0 + (p.d1 - p.d0) * MOUND_T[i];
  return (hash(p.x + p.ux * along, p.z + p.uz * along, 142) - 0.5) * p.width * 0.15;
}
function moundAt (p, x, z, y) {
  const dx = x - p.x, dz = z - p.z, along = dx * p.ux + dz * p.uz;
  if (along < p.d0 || along > p.d1 || p.source?.broken || Math.abs(p.surfaceY(x, z) - y) > 0.3) return 0;
  const t = (along - p.d0) / (p.d1 - p.d0 || 1);
  let i = 1; while (i < MOUND_T.length - 1 && MOUND_T[i] < t) i++;
  const f = (t - MOUND_T[i - 1]) / (MOUND_T[i] - MOUND_T[i - 1]);
  const taper = MOUND_TAPER[i - 1] + (MOUND_TAPER[i] - MOUND_TAPER[i - 1]) * f;
  const rise = MOUND_RISE[i - 1] + (MOUND_RISE[i] - MOUND_RISE[i - 1]) * f;
  const wobble = moundWobble(p, i - 1) * (1 - f) + moundWobble(p, i) * f;
  const across = Math.abs(-dx * p.uz + dz * p.ux - p.off - wobble);
  const edge = clamp(1 - across / Math.max(0.01, p.width * taper / 2), 0, 1);
  return edge > 0 ? p.base + p.height * rise * edge : 0;
}

/** Начальный снег на видимом дорожном полотне. surfaceY — выбранная твёрдая
 * опора (земля/мост), чтобы дорога сверху не меняла снег под мостом.
 * Никаких аллокаций; out переиспользуется вызывающим кодом. */
export function sampleSurface (x, z, surfaceY, out = {}) {
  out.onRoad = false; out.baseY = surfaceY; out.thickness = 0; out.compaction = 0;
  out.roadThickness = 0; out.sand = 0; out.dirt = 0; out.wetness = 0; out.rut = 0; out.heading = 0; out.coverage = 0; out.bridge = false; out.moundMask = 0;
  const k = key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL));
  const list = ROAD_GRID.get(k);
  if (!list) return out;
  let winner = null, best = -Infinity, bestOff = 0, bestAlong = 0, base = surfaceY, clearance = 1;
  for (const p of list) {
    const dx = x - p.a[0], dz = z - p.a[1], along = dx * p.ux + dz * p.uz, off = -dx * p.uz + dz * p.ux;
    if (along < -0.1 || along > p.len + 0.1) continue;
    const y = p.surfaceY(x, z);
    // Road material lift is ~0.14 m above the old vehicle support.
    if (Number.isFinite(surfaceY) && Math.abs(y - surfaceY) > 0.55) continue;
    if (Math.abs(off) > p.w / 2 + 0.03) continue;
    const score = (8 - p.road.c) * 10000 + (p.clear ? 1000 : p.sand ? 500 : 0) + p.w;
    if (score > best || (score === best && p.corridor < winner.corridor)) {
      winner = p; best = score; bestOff = off; bestAlong = along; base = y;
    }
  }
  if (!winner) return out;
  for (const q of list) {
    if (!q.clear || q.road.c > winner.road.c || Math.abs(q.surfaceY(x, z) - base) > 0.3) continue;
    const dx = x - q.a[0], dz = z - q.a[1], along = dx * q.ux + dz * q.uz;
    if (along < -0.1 || along > q.len + 0.1) continue;
    const off = -dx * q.uz + dz * q.ux;
    clearance = Math.min(clearance, smooth(clamp((Math.abs(off) - q.w / 2) / 8, 0, 1)));
  }
  const p = winner, edge = smooth(clamp((p.w / 2 - Math.abs(bestOff)) / 0.45, 0, 1));
  const grain = 0.5 + 0.25 * Math.sin(x * 0.33 + z * 0.17) + 0.25 * Math.sin(z * 0.61 - x * 0.13);
  let h = p.clear ? 0.002 * grain : p.sand ? 0.055 : p.rutRoad ? RUT_BASE : p.road.c <= 3 ? 0.065 : 0.09;
  let rut = 0;
  if (p.rutRoad) {
    const f = rutFade(p.along + bestAlong, p.total, p.fade, p.breaks);
    const profile = rutProfile(bestOff, p.w, p.count);
    h += (profile - RUT_BASE) * f;
    rut = clamp((RUT_BASE - profile) / (RUT_BASE - RUT_FLOOR), 0, 1) * f;
  }
  if (!p.clear) h = (0.003 + (h - 0.003) * clearance) * (0.75 + grain * 0.25);
  out.roadThickness = h;
  const moundMask = p.clear ? smooth(clamp((Math.abs(bestOff) - p.w / 2 + 1.15) / 0.6, 0, 1)) : clearance;
  let moundHeight = 0;
  // Не пропускаем боковой вал поперёк очищенной главной оси.
  if (!p.clear || Math.abs(bestOff) > p.w / 2 - 1.15) {
    for (const mound of MOUND_GRID.get(k) || EMPTY) moundHeight = Math.max(moundHeight, moundAt(mound, x, z, base));
  }
  h = Math.max(h, moundHeight * moundMask);
  out.onRoad = true; out.baseY = base; out.thickness = Math.max(0, h);
  out.compaction = moundHeight > h * 0.8 ? 0.12 : p.clear ? 0.9 : Math.min(0.88, (p.sand ? 0.6 : 0.28) + rut * 0.5 + (1 - clearance) * 0.38);
  out.sand = p.sand ? edge * 0.65 : 0; out.dirt = p.clear ? 0.1 : 0.05 + rut * 0.1 + (1 - clearance) * 0.16;
  out.rut = rut; out.heading = Math.atan2(p.ux, p.uz); out.bridge = !!p.road.b;
  out.coverage = p.clear ? 0 : edge * clearance;
  out.moundMask = moundMask;
  return out;
}

const COVER_SAMPLE = {};

/* Явный dev-стенд выбирает место рядом с пиццерией. Голый ?winterspot
   оставляет обычный старт смены. */
export function nearestSpot (kind, x, z, maxDistance = 450) {
  const list = SPOTS[kind];
  if (!list) return null;
  let best = null, dist = maxDistance * maxDistance;
  let longRut = null, longDist = dist;
  for (const p of list) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < dist) { best = p; dist = d; }
    if (kind === 'rut' && p.span >= 40 && d < longDist) { longRut = p; longDist = d; }
  }
  return longRut || best;
}

function rutSegment (cx, cz, ux, uz, length, width, count, depth, along, total, fade, breaks) {
  const p = { cx, cz, ux, uz, hl: length / 2, hw: width / 2, count, depth, along, total, fade, breaks };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * p.hw, rz = Math.abs(uz) * p.hl + Math.abs(nz) * p.hw;
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = RUT_GRID.get(k);
      if (list) list.push(p); else RUT_GRID.set(k, [p]);
    }
}

/* Внутри парной колеи колёса держат направление лучше. На главной улице
   эффект слабее: машины там чаще разбивают и разравнивают снежные бортики. */
export function rutAt (x, z, h, snow) {
  if (snow <= 0.45) return 0;
  const list = RUT_GRID.get(key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
  if (!list) return 0;
  const fx = Math.sin(h), fz = Math.cos(h);
  let best = 0;
  for (const p of list) {
    const dx = x - p.cx, dz = z - p.cz;
    const d = dx * p.ux + dz * p.uz, off = -dx * p.uz + dz * p.ux;
    if (Math.abs(d) > p.hl + 0.5 || Math.abs(off) > p.hw) continue;
    const align = Math.abs(fx * p.ux + fz * p.uz);
    if (align < 0.8) continue;
    const lane = Math.round(off / (p.hw * 2 / p.count) + p.count / 2 - 0.5);
    if (lane < 0 || lane >= p.count) continue;
    const center = laneCenter(lane, p.count, p.hw * 2);
    const inside = clamp((0.55 - Math.abs(off - center)) / 0.35, 0, 1);
    const progress = p.along + d + p.hl;
    const fade = rutFade(progress, p.total, p.fade, p.breaks);
    best = Math.max(best, inside * fade * p.depth * align);
  }
  return best * clamp((snow - 0.45) / 0.35, 0, 1);
}

function sandSection (cx, cz, ux, uz, length, width, along = 0, total = length) {
  const p = { cx, cz, ux, uz, hl: length / 2, hw: width / 2, along, total };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * p.hw, rz = Math.abs(uz) * p.hl + Math.abs(nz) * p.hw;
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = SAND_GRID.get(k);
      if (list) list.push(p); else SAND_GRID.set(k, [p]);
    }
}

function snowSection (cx, cz, ux, uz, length, width, along, total, fadeStart, fadeEnd) {
  const p = { cx, cz, ux, uz, hl: length / 2, hw: width / 2, along, total, fadeStart, fadeEnd };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * p.hw, rz = Math.abs(uz) * p.hl + Math.abs(nz) * p.hw;
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = SNOW_GRID.get(k);
      if (list) list.push(p); else SNOW_GRID.set(k, [p]);
    }
}

export function snowAt (x, z) {
  if (ROAD_GRID.size) return sampleSurface(x, z, NaN, COVER_SAMPLE).coverage;
  const list = SNOW_GRID.get(key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
  if (!list) return 0;
  let best = 0;
  for (const p of list) {
    const dx = x - p.cx, dz = z - p.cz;
    const a = dx * p.ux + dz * p.uz, b = Math.abs(-dx * p.uz + dz * p.ux);
    if (Math.abs(a) > p.hl + 0.05 || b > p.hw + 0.05) continue;
    const progress = p.along + a + p.hl;
    const edge = smooth(clamp((p.hw - b) / 0.9, 0, 1));
    const start = p.fadeStart ? smooth(clamp(progress / p.fadeStart, 0, 1)) : 1;
    const end = p.fadeEnd ? smooth(clamp((p.total - progress) / p.fadeEnd, 0, 1)) : 1;
    best = Math.max(best, edge * start * end);
  }
  return best;
}

export function sandAt (x, z, snow) {
  if (snow <= 0.45) return 0;
  const list = SAND_GRID.get(key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
  if (!list) return 0;
  let best = 0;
  for (const p of list) {
    const dx = x - p.cx, dz = z - p.cz;
    const a = Math.abs(dx * p.ux + dz * p.uz), b = Math.abs(-dx * p.uz + dz * p.ux);
    if (a >= p.hl || b >= p.hw) continue;
    const progress = p.along + dx * p.ux + dz * p.uz + p.hl;
    best = Math.max(best, Math.min(1, progress / 10, (p.total - progress) / 10, (p.hw - b) / 0.8));
  }
  return best * clamp((snow - 0.45) / 0.35, 0, 1);
}

export function sandUnderCar (x, z, h, snow) {
  if (snow <= 0.45) return 0;
  const fx = Math.sin(h), fz = Math.cos(h), sx = fz, sz = -fx;
  let sand = sandAt(x, z, snow);
  for (const fore of [-1.45, 1.45]) for (const side of [-0.82, 0.82])
    sand = Math.max(sand, sandAt(x + fx * fore + sx * side, z + fz * fore + sz * side, snow));
  return sand;
}

function softPatch (cx, cz, ux, uz, length, offset, width, strength, surfaceY) {
  const p = { cx, cz, ux, uz, hl: length / 2, offset, hw: width / 2, strength, surfaceY, ranges: [], broken: false };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * (Math.abs(offset) + p.hw);
  const rz = Math.abs(uz) * p.hl + Math.abs(nz) * (Math.abs(offset) + p.hw);
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = GRID.get(k);
      if (list) list.push(p); else GRID.set(k, [p]);
    }
  ST.soft++;
  if (strength > 0.8) {
    const spot = { x: cx - uz * offset, z: cz + ux * offset, h: Math.atan2(ux, uz) };
    SPOTS.soft.push(spot);
    if (!ST.exampleSoft) ST.exampleSoft = spot;
  }
  return p;
}

/* Сугроб и его вершины держим отдельно от неподвижного дорожного полотна.
   После наезда осаживаем тот же меш, чтобы снег не оставался висеть в машине. */
function softMound (M, p, x, z, ux, uz, d0, d1, off, width, base, height, surfaceY) {
  M.front(true).track((mesh, first, count) => p.ranges.push({ mesh, first, count }));
  mound(M, x, z, ux, uz, d0, d1, off, width, base, height, surfaceY, p);
  M.front(false);
}

export function scatter (V, speed, snow, emit) {
  if (snow <= 0.45 || speed < 1.2) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
  const contacts = [[V.x, V.z]];
  for (const fore of [-1.45, 1.45]) for (const side of [-0.82, 0.82])
    contacts.push([V.x + fx * fore + sx * side, V.z + fz * fore + sz * side]);
  for (const [x, z] of contacts) {
    const list = GRID.get(key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
    if (!list) continue;
    for (const p of list) {
      if (p.broken) continue;
      const dx = x - p.cx, dz = z - p.cz;
      const along = Math.abs(dx * p.ux + dz * p.uz), across = Math.abs(-dx * p.uz + dz * p.ux - p.offset);
      if (along > p.hl + 0.15 || across > p.hw + 0.15) continue;
      p.broken = true; p.strength = 0; ST.crushed++;
      for (const { mesh, first, count } of p.ranges) {
        const pos = mesh.geometry.attributes.position;
        if (!pos.array) continue;
        for (let i = first; i < first + count; i++)
          pos.setY(i, p.surfaceY(pos.getX(i), pos.getZ(i)) + 0.072);
        pos.needsUpdate = true;
      }
      const px = p.cx - p.uz * p.offset, pz = p.cz + p.ux * p.offset;
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9 + hash(px, pz, i) * 0.2;
        emit('puff', px, V.y + 0.2, pz, 0xeaf2f4, 0.18 + hash(px, pz, i + 20) * 0.17, 0.75,
          { vx: Math.cos(a) * (1.4 + speed * 0.12), vy: 0.8 + hash(px, pz, i + 30),
            vz: Math.sin(a) * (1.4 + speed * 0.12), life: 0.45, max: 0.45, grow: 1.7, gravity: 4 });
      }
    }
  }
}

/* 0…1: рыхлый снег под машиной. Только видимые снежные пятна; песок не вязкий. */
export function softAt (x, z, snow) {
  if (snow <= 0.45) return 0;
  const list = GRID.get(key(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
  if (!list) return 0;
  let best = 0;
  for (const p of list) {
    const dx = x - p.cx, dz = z - p.cz;
    const a = Math.abs(dx * p.ux + dz * p.uz), b = Math.abs(-dx * p.uz + dz * p.ux - p.offset);
    if (a >= p.hl || b >= p.hw) continue;
    // Мягкий край: при съезде с колеи тяга меняется плавно.
    best = Math.max(best, p.strength * clamp((p.hl - a) / 2, 0, 1) * clamp((p.hw - b) / 0.35, 0, 1));
  }
  return best * clamp((snow - 0.45) / 0.35, 0, 1);
}

/* Проверяем колёса, а не центр кузова: рыхлый вал у края дороги должен
   подхватить машину, когда в него попала одна сторона. */
export function softUnderCar (x, z, h, snow) {
  if (snow <= 0.45) return 0;
  const fx = Math.sin(h), fz = Math.cos(h), sx = fz, sz = -fx;
  let soft = softAt(x, z, snow);
  for (const fore of [-1.45, 1.45]) for (const side of [-0.82, 0.82])
    soft = Math.max(soft, softAt(x + fx * fore + sx * side, z + fz * fore + sz * side, snow));
  return soft;
}

/* Небольшой выброс рыхлого снега из-под буксующего колеса. */
export function spray (V, gas, soft, dt, emit) {
  if (!gas || soft < 0.25) { sprayT = 0; return; }
  sprayT -= dt;
  if (sprayT > 0) return;
  sprayT = 0.2 / soft;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx, side = spraySide = -spraySide;
  const x = V.x - fx * 1.35 + sx * side * 0.82, z = V.z - fz * 1.35 + sz * side * 0.82;
  emit('puff', x, V.y + 0.14, z, 0xeaf2f4, 0.22 + soft * 0.2, 0.7,
    { vx: -fx * 1.3 + sx * side * 1.1, vy: 0.8, vz: -fz * 1.3 + sz * side * 1.1,
      life: 0.4, max: 0.4, grow: 1.5 });
  ST.sprays++;
}

/* Поперечный профиль: две (или четыре) настоящие борозды с поднятым снегом
   по бокам. Основание под ними остаётся, но дно борозды лежит выше него. */
function fadedSnowColor (hex, factor) {
  const n = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16), base = 0xf0f5f5;
  const channel = shift => Math.round(((base >> shift) & 255) + (((n >> shift) & 255) - ((base >> shift) & 255)) * factor);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function ruts (M, x, z, ux, uz, len, w, surfaceY, count, depth, along, total, fade, breaks = []) {
  const nx = -uz, nz = ux, step = Math.min(0.78, w / (count * 2.6));
  const outer = Math.min(0.35, step * 0.48), inner = Math.min(0.13, outer * 0.45);
  const ridge = RUT_RIDGE, floor = RUT_FLOOR;
  const nodes = [{ off: -w / 2, h: RUT_BASE, color: 0xf0f5f5 }];
  const add = (off, h, color) => { nodes.push({ off, h, color }); };
  for (let lane = 0; lane < count; lane++) for (const side of [-1, 1]) {
    const off = laneCenter(lane, count, w) + side * step;
    add(off - outer - 0.16, RUT_BASE, 0xf0f5f5);
    add(off - outer, ridge, 0xf1f5f5);
    add(off - inner, floor, 0xd8e2e5);
    add(off, floor, 0xc5d3d7);
    add(off + inner, floor, 0xd8e2e5);
    add(off + outer, ridge, 0xf1f5f5);
    add(off + outer + 0.16, RUT_BASE, 0xf0f5f5);
    ST.tracks++;
  }
  add(w / 2, RUT_BASE, 0xf0f5f5);
  const sections = [[0]];
  for (let d = 4; d < len - 0.5; d += 4) sections.push([d]);
  sections.push([len]);
  for (const sec of sections) {
    const d = sec[0], progress = along + d;
    sec.push(rutFade(progress, total, fade, breaks));
  }
  const sampled = {};
  const point = (sec, node) => {
    const d = sec[0], off = node.off;
    const px = x + ux * d + nx * off, pz = z + uz * d + nz * off;
    const base = surfaceY(px, pz, d);
    sampleSurface(px, pz, base, sampled);
    return [px, (sampled.onRoad ? sampled.baseY + sampled.roadThickness : base), pz];
  };
  for (let j = 1; j < sections.length; j++) for (let i = 1; i < nodes.length; i++) {
    const a = point(sections[j - 1], nodes[i - 1]), b = point(sections[j], nodes[i - 1]);
    const c = point(sections[j], nodes[i]), d = point(sections[j - 1], nodes[i]);
    const c0 = fadedSnowColor(nodes[i - 1].color, sections[j - 1][1]);
    const c1 = fadedSnowColor(nodes[i - 1].color, sections[j][1]);
    const c2 = fadedSnowColor(nodes[i].color, sections[j][1]);
    const c3 = fadedSnowColor(nodes[i].color, sections[j - 1][1]);
    M.tri3(...a, ...b, ...c, c0, c1, c2);
    M.tri3(...a, ...c, ...d, c0, c2, c3);
  }
}

/* Плавная маска песка — один байт на вершину. В материале она даёт
   мелкую зернистую примесь, не геометрические треугольники на дороге. */
export function addSandAttribute (group, THREE) {
  const sampled = {};
  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position, mask = new Uint8Array(pos.count), cover = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      sampleSurface(x, z, pos.getY(i) - 0.09, sampled);
      mask[i] = Math.round(sampled.sand * 255);
      cover[i] = Math.round(sampled.coverage * 255);
    }
    const a = new THREE.BufferAttribute(mask, 1, true);
    a.onUpload(function () { this.array = null; });
    mesh.geometry.setAttribute('roadSand', a);
    const b = new THREE.BufferAttribute(cover, 1, true);
    b.onUpload(function () { this.array = null; });
    mesh.geometry.setAttribute('roadBlend', b);
  }
}

/* Сугроб клином с неровной вершиной, а не пятно краски на асфальте. */
function mound (M, x, z, ux, uz, d0, d1, off, width, base, height, surfaceY, source = null) {
  const nx = -uz, nz = ux, h = height * (0.85 + hash(x + ux * d0, z + uz * d0, 141) * 0.3);
  const ts = MOUND_T, rise = MOUND_RISE, taper = MOUND_TAPER;
  const p = { x, z, ux, uz, d0, d1, off, width, base, height: h, surfaceY, source };
  const ax = x + ux * d0 + nx * off, az = z + uz * d0 + nz * off;
  const bx = x + ux * d1 + nx * off, bz = z + uz * d1 + nz * off;
  indexBox(MOUND_GRID, p, Math.min(ax, bx) - width, Math.min(az, bz) - width, Math.max(ax, bx) + width, Math.max(az, bz) + width);
  const point = (i, side) => {
    const along = d0 + (d1 - d0) * ts[i];
    const waviness = (hash(x + ux * along, z + uz * along, 142) - 0.5) * width * 0.15;
    const lateral = off + waviness + side * width * taper[i] / 2;
    const px = x + ux * along + nx * lateral, pz = z + uz * along + nz * lateral;
    return [px, surfaceY(px, pz, along) + base + (side === 0 ? rise[i] * h : 0), pz];
  };
  const sampled = {};
  for (let i = 1; i < ts.length; i++) for (const side of [-1, 1]) {
    const a = point(i - 1, side), b = point(i, side), c = point(i, 0), d = point(i - 1, 0);
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
    sampleSurface(cx, cz, surfaceY(cx, cz), sampled);
    if (sampled.onRoad && sampled.moundMask < 0.05) continue;
    if (sampled.onRoad && sampled.moundMask < 1) for (const q of [a, b, c, d]) {
      const floor = surfaceY(q[0], q[2]);
      q[1] = floor + (q[1] - floor) * sampled.moundMask;
    }
    M.color(side < 0 ? '#dbe7e9' : '#edf3f3');
    M.tri(...a, ...b, ...c); M.tri(...a, ...c, ...d);
  }
}

function roadSheet (M, p) {
  const sampled = {}, nx = -p.uz, nz = p.ux;
  const point = (d, off) => {
    const x = p.a[0] + p.ux * d + nx * off, z = p.a[1] + p.uz * d + nz * off;
    const base = p.surfaceY(x, z);
    sampleSurface(x, z, base, sampled);
    return [x, (sampled.onRoad ? sampled.baseY + sampled.roadThickness : base), z];
  };
  M.color('#edf2f3');
  // Малые секции у концов не дают интерполяции закрасить пересекающую улицу.
  for (let d = 0; d < p.len; ) {
    const step = d < 16 || p.len - d < 20 ? 2 : 6, end = Math.min(p.len, d + step);
    const bands = Math.max(4, Math.ceil(p.w / 0.75));
    for (let band = 0; band < bands; band++) {
      const lo = (band / bands - 0.5) * p.w, hi = ((band + 1) / bands - 0.5) * p.w;
      const a = point(d, lo), b = point(end, lo), c = point(end, hi), e = point(d, hi);
      M.tri(...a, ...b, ...c); M.tri(...a, ...c, ...e);
    }
    d = end;
  }
}

/* Строим поверх полотна. Сначала вся снежная основа, затем непрерывная
   колея: снег соседней улицы не должен перекрывать её на стыке. */
export function build ({ M, rutM, softM, roads, roadWidth, yOf, groundH, junction }) {
  GRID.clear();
  SAND_GRID.clear();
  SNOW_GRID.clear();
  RUT_GRID.clear();
  ROAD_GRID.clear(); MOUND_GRID.clear();
  MODES = corridorModes(roads, roadWidth);
  for (const list of Object.values(SPOTS)) list.length = 0;
  ST.snow = ST.clear = ST.sand = ST.tracks = ST.soft = ST.crushed = ST.edges = ST.crossings = ST.sprays = 0;
  ST.exampleSoft = ST.exampleSand = ST.exampleClear = ST.exampleRut = ST.exampleJunction = null;
  // Все общие узлы, включая стык двух отрезков без формального перекрёстка:
  // во дворе колея должна сойти на нет перед обычной улицей.
  const junctionAxes = new Map();
  const modes = new Map();
  for (const road of roads) {
    if (road.x || road.b || road.c === 6 || road.c > 7) continue;
    const pts = road.p, w = roadWidth(road);
    if (w < 3 || pts.length < 2) continue;
    modes.set(road, roadMode(road));
    const total = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= pts.length) continue;
        const dx = pts[j][0] - p[0], dz = pts[j][1] - p[1], len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const k = key(p[0], p[1]), score = (8 - road.c) * 100000 + w * 100 + Math.min(total, 10000) * 0.01;
        let entry = junctionAxes.get(k);
        if (!entry) { entry = { roads: new Set(), score: -Infinity }; junctionAxes.set(k, entry); }
        entry.roads.add(road);
        if (score > entry.score) Object.assign(entry, { road, ux: dx / len, uz: dz / len, w, score });
      }
    }
  }
  for (const [k, entry] of junctionAxes) if (entry.roads.size < 2) junctionAxes.delete(k);
  const snowFadeAt = (road, i, pts) => {
    const p = pts[i], next = pts[i === 0 ? 1 : i - 1];
    const ax = next[0] - p[0], az = next[1] - p[1], al = Math.hypot(ax, az);
    const shared = junctionAxes.get(key(p[0], p[1]));
    if (shared) for (const other of shared.roads) {
      if (other === road || modes.get(other)?.clear) continue;
      const oi = other.p.findIndex(q => q[0] === p[0] && q[1] === p[1]);
      if (oi < 0) continue;
      for (const j of [oi - 1, oi + 1]) {
        if (j < 0 || j >= other.p.length) continue;
        const bx = other.p[j][0] - p[0], bz = other.p[j][1] - p[1], bl = Math.hypot(bx, bz);
        if (al && bl && Math.abs((ax * bx + az * bz) / (al * bl)) > 0.9) return 0;
      }
    }
    // Конец полилинии сам по себе не означает очищенную дорогу.
    return shared && [...shared.roads].some(other => modes.get(other)?.clear) ? 12 : 0;
  };
  const coveredJunctions = new Map();
  const segments = [];
  for (const road of roads) {
    if (road.x || road.b || road.c === 6 || road.c > 7) continue;
    const w = roadWidth(road), pts = road.p;
    if (w < 3 || pts.length < 2) continue;
    const { sand, clear, rut: rutRoad } = modes.get(road);
    const total = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const count = 1, depth = 0.145;
    const fade = 0;
    const snowStart = clear ? 0 : Math.min(snowFadeAt(road, 0, pts), total / 3);
    const snowEnd = clear ? 0 : Math.min(snowFadeAt(road, pts.length - 1, pts), total / 3);
    const breaks = [];
    let progress = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], main = junctionAxes.get(key(p[0], p[1]));
      if (rutRoad && main && main.road !== road) {
        let alignment = 0;
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= pts.length) continue;
          const dx = pts[j][0] - p[0], dz = pts[j][1] - p[1], len = Math.hypot(dx, dz);
          if (len > 0.01) alignment = Math.max(alignment, Math.abs((dx * main.ux + dz * main.uz) / len));
        }
        if (!modes.get(main.road)?.rut || alignment < 0.95) {
          const core = alignment < 0.95 ? Math.min(24, (main.w / 2 + 1) / Math.max(0.4, Math.sqrt(1 - alignment * alignment))) : 0;
          breaks.push({ at: progress, core, ramp: 10 });
          ST.crossings++;
          const spot = { x: p[0] - main.ux * 18, z: p[1] - main.uz * 18, h: Math.atan2(main.ux, main.uz) };
          SPOTS.junction.push(spot);
          if (!ST.exampleJunction) ST.exampleJunction = spot;
        }
      }
      if (rutRoad && (i === 0 || i === pts.length - 1)) {
        let continues = false;
        const here = i === 0 ? pts[1] : pts[i - 1];
        const ax = here[0] - p[0], az = here[1] - p[1], alen = Math.hypot(ax, az);
        if (main) for (const other of main.roads) {
          if (other === road || !modes.get(other)?.rut) continue;
          const oi = other.p.findIndex(q => q[0] === p[0] && q[1] === p[1]);
          if (oi < 0) continue;
          for (const j of [oi - 1, oi + 1]) {
            if (j < 0 || j >= other.p.length) continue;
            const bx = other.p[j][0] - p[0], bz = other.p[j][1] - p[1], blen = Math.hypot(bx, bz);
            if (alen && blen && Math.abs((ax * bx + az * bz) / (alen * blen)) >= 0.95) continues = true;
          }
        }
        if (!continues && (!main || main.road === road)) breaks.push({ at: progress, core: 0, ramp: Math.min(10, total / 3) });
      }
      // Острый поворот того же полилинейного проезда: бортики не должны
      // крестом наложиться на углу, где машина разворачивает колёса.
      if (rutRoad && i > 0 && i + 1 < pts.length) {
        const ax = p[0] - pts[i - 1][0], az = p[1] - pts[i - 1][1];
        const bx = pts[i + 1][0] - p[0], bz = pts[i + 1][1] - p[1];
        const cosine = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
        if (cosine < 0.7) breaks.push({ at: progress, core: 0, ramp: 7 });
      }
      if (i + 1 < pts.length) progress += Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]);
    }
    // На большой карте миллиметры разницы глубины исчезают. Снег выше полотна,
    // а каждый видимый слой выше предыдущего на сантиметры.
    const y = yOf(road) + 0.06;
    const surfaceY = (x, z) => groundH(x, z) + yOf(road);
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len, uz = dz / len;
      // Геометрия строится после регистрации всей сети, чтобы одна улица
      // знала про очищенную ось пересекающей её дороги.
      if (!clear) snowSection((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w, along, total, snowStart, snowEnd);
      if (clear) ST.clear++; else ST.snow++;
      const coverJunction = p => {
        if (clear || !junction(p[0], p[1])) return false;
        const k = key(p[0], p[1]), old = coveredJunctions.get(k) || 0;
        const shared = junctionAxes.get(k);
        if (shared && [...shared.roads].some(r => modes.get(r)?.clear)) return false;
        if (old < w / 2) {
          M.color('#f0f5f5'); M.disc(p[0], p[1], w / 2, y, 10);
          coveredJunctions.set(k, w / 2);
        }
        return true;
      };
      coverJunction(a); coverJunction(b);
      const segment = { a, b, ux, uz, len, w, surfaceY, sand, clear, road, rutRoad, count, depth, fade, breaks, total, along,
        corridor: modes.get(road)?.corridor || String(road.c) };
      segments.push(segment); registerRoad(segment);
      along += len;
    }
  }
  for (const segment of segments) {
    const { a, b, ux, uz, len, w, surfaceY, sand, clear, road, rutRoad, count, depth, fade, breaks, total, along } = segment;
    if (!clear && !rutRoad) roadSheet(M, segment);
    if (rutRoad) {
      ruts(rutM, a[0], a[1], ux, uz, len, w, surfaceY, count, depth, along, total, fade, breaks);
      rutSegment((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w, count,
        clamp(depth / 0.145, 0, 1), along, total, fade, breaks);
      if (len > 22 && along > 8 && total - along - len > 8) {
        const spot = { x: (a[0] + b[0]) / 2 - uz * laneCenter(0, count, w),
          z: (a[1] + b[1]) / 2 + ux * laneCenter(0, count, w), h: Math.atan2(ux, uz), span: len };
        SPOTS.rut.push(spot);
        if (!ST.exampleRut) ST.exampleRut = spot;
      }
    }
      if (clear && len > 22) {
        const spot = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, h: Math.atan2(ux, uz) };
        SPOTS.clear.push(spot);
        if (!ST.exampleClear) ST.exampleClear = spot;
      }
      if (sand) {
        sandSection((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w - 0.5, along, total);
        if (len > 20) {
          const spot = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, h: Math.atan2(ux, uz) };
          SPOTS.sand.push(spot);
          if (!ST.exampleSand) ST.exampleSand = spot;
        }
        ST.sand++;
      }
      // Сгребённая к бордюру снежная кромка: кусками, чтобы она не была ровной линией.
      for (let d = 2; d < len - 4; d += 16) {
        if (hash(a[0] + ux * d, a[1] + uz * d, 81) < 0.56) continue;
        const side = hash(a[0] + ux * d, a[1] + uz * d, 82) < 0.5 ? -1 : 1;
        const end = Math.min(len - 1, d + 4 + hash(a[0] + ux * d, a[1] + uz * d, 83) * 3);
        const off = side * (w / 2 - 0.4), width = 0.65 + 0.35 * hash(a[0] + ux * d, a[1] + uz * d, 84);
        mound(softM, a[0], a[1], ux, uz, d, end, off, width, 0.072, 0.11, surfaceY);
        ST.edges++;
        // Иногда рыхлый язык выходит из вала в проезжую часть. Он виден и замедляет колесо.
        if (!sand && !clear && hash(a[0] + ux * d, a[1] + uz * d, 85) > 0.82) {
          const slen = Math.min(7, end - d), s0 = d + (end - d - slen) / 2;
          const soff = side * Math.max(0.2, w / 2 - 1.15), sw = Math.min(2.1, w / 2);
          const patch = softPatch(a[0] + ux * (s0 + slen / 2), a[1] + uz * (s0 + slen / 2), ux, uz, slen, soff, sw, 0.65, surfaceY);
          softMound(softM, patch, a[0], a[1], ux, uz, s0, s0 + slen, soff, sw, 0.072, 0.18, surfaceY);
        }
      }
      // На непосыпанных улицах небольшие снежные полосы пересекают колею.
      if (!sand && !clear && len > 18) for (let d = 9; d < len - 7; d += 28) {
        if (hash(a[0] + ux * d, a[1] + uz * d, 91) < 0.82) continue;
        const slen = Math.min(5 + hash(a[0] + ux * d, a[1] + uz * d, 92) * 5, len - d);
        const soff = (hash(a[0] + ux * d, a[1] + uz * d, 93) - 0.5) * Math.max(0, w - 3);
        const sw = Math.min(2.4, w - 1);
        const patch = softPatch(a[0] + ux * (d + slen / 2), a[1] + uz * (d + slen / 2), ux, uz, slen, soff, sw, 0.85, surfaceY);
        softMound(softM, patch, a[0], a[1], ux, uz, d, d + slen, soff, sw, 0.072, 0.21, surfaceY);
      }
  }
  return ST;
}

/* Мостовые настилы идут над рельефом; обычный ribbon() лёг бы под мостом. */
export function bridge ({ M, softM, road, points, width }) {
  if (road.c > 5 || points.length < 2) return;
  const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);
  const { sand, clear } = roadMode(road);
  if (sand) {
    const a = points[0], b = points[points.length - 1], len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    sandSection((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, (b[0] - a[0]) / len, (b[2] - a[2]) / len, len, width - 0.5);
  }
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ux = dx / len, uz = dz / len;
    const surfaceY = (x, z, d = (x - a[0]) * ux + (z - a[2]) * uz) => a[1] + (b[1] - a[1]) * d / len + 0.14;
    const segment = { a: [a[0], a[2]], b: [b[0], b[2]], ux, uz, len, w: width, surfaceY, sand, clear, road,
      rutRoad: false, count: 1, depth: 0, fade: 0, breaks: [], total, along, corridor: roadMode(road).corridor || 'bridge' };
    registerRoad(segment);
    if (!clear) {
      roadSheet(M, segment);
      snowSection((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, ux, uz, len, width, along, total, 12, 12);
      ST.snow++;
    } else ST.clear++;
    // Мосты относятся к уличной сети, дворовая колея на них не выходит.
    along += len;
    if (sand) ST.sand++;
    if (hash(a[0], a[2], 111) > 0.25) for (const side of [-1, 1]) {
      const off = side * (width / 2 - 0.55);
      mound(softM, a[0], a[2], ux, uz, 0, len, off, 1.15, 0.072, 0.17, surfaceY);
      ST.edges++;
    }
    if (!sand && !clear && hash(a[0], a[2], 112) > 0.8) {
      const off = (hash(a[0], a[2], 113) - 0.5) * Math.max(0, width - 3);
      const patch = softPatch((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, ux, uz, len, off, 2.2, 0.85, surfaceY);
      softMound(softM, patch, a[0], a[2], ux, uz, 0, len, off, 2.2, 0.072, 0.21, surfaceY);
    }
  }
}
