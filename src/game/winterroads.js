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
const ROAD_GRID = new Map(), CLEAR_GRID = new Map(), MOUND_GRID = new Map();
const BANKS = [];
const EMPTY = [];
let MODES = new Map(), ROAD_GROUND = null;
const ROAD_SNOW = 0xb5c0c6, ROAD_TRACK = 0x87939a;
const ROAD_LIFT = 0.026;
const lanesOn = (road, w) => {
  const width = road.w0 || w, stated = Number(road.l);
  if (road.o) return stated > 0 ? stated : Math.max(1, Math.round(width / 3.3));
  return width < 7 ? 1 : stated > 0 ? Math.max(2, stated) : width >= 12.5 ? 4 : 2;
};
const SPOTS = { soft: [], sand: [], clear: [], rut: [], junction: [] };
let sprayT = 0, spraySide = 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function hash (x, z, salt = 0) {
  let h = Math.imul(Math.round(x * 4) + salt * 907, 0x9e3779b1) ^ Math.imul(Math.round(z * 4) - salt * 173, 0x85ebca6b);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const key = (i, j) => i + ',' + j;
const cellKey = (i, j) => i >= -32768 && i <= 32767 && j >= -32768 && j <= 32767
  ? (i << 16) | (j & 65535) : key(i, j);
function roadMode (road) {
  const connected = MODES.get(road);
  if (connected) return connected;
  const pts = road.p, mid = road.mid0 ? road.mid0[1] : road.m0 || pts[(pts.length / 2) | 0];
  const roll = hash(mid[0], mid[1], road.c + 31);
  const sandShare = road.c <= 3 ? WINTER_ROAD.SAND_MAIN : road.c === 7 ? 0.05 : WINTER_ROAD.SAND_LOCAL;
  const clearShare = road.c <= 3 ? 0.55 : road.c === 4 ? 0.38 : road.c === 5 ? 0.2 : 0.08;
  const sand = roll < sandShare, clear = !sand && roll < sandShare + clearShare;
  return { sand, clear };
}
const laneCenter = (lane, count, w) => (lane + 0.5 - count / 2) * w / count;
const smooth = t => t * t * (3 - 2 * t);
const rutFade = (progress, total, fade, breaks) => {
  let factor = fade ? smooth(clamp(Math.min(progress, total - progress) / fade, 0, 1)) : 1;
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    factor = Math.min(factor, smooth(clamp((Math.abs(progress - b.at) - b.core) / b.ramp, 0, 1)));
  }
  return factor;
};

function indexBox (grid, p, x0, z0, x1, z1) {
  for (let i = Math.floor(x0 / WINTER_ROAD.CELL); i <= Math.floor(x1 / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor(z0 / WINTER_ROAD.CELL); j <= Math.floor(z1 / WINTER_ROAD.CELL); j++) {
      const k = cellKey(i, j), list = grid.get(k);
      if (list) list.push(p); else grid.set(k, [p]);
    }
}

function registerRoad (p) {
  p.score = (8 - p.road.c) * 10000 + (p.clear ? 1000 : p.sand ? 500 : 0) + p.w;
  const margin = p.w / 2 + 10;
  const x0 = Math.min(p.a[0], p.b[0]) - margin, z0 = Math.min(p.a[1], p.b[1]) - margin;
  const x1 = Math.max(p.a[0], p.b[0]) + margin, z1 = Math.max(p.a[1], p.b[1]) + margin;
  indexBox(ROAD_GRID, p, x0, z0, x1, z1);
  if (p.clear) indexBox(CLEAR_GRID, p, x0, z0, x1, z1);
}

function treadAt (off, width, lanes) {
  const lane = clamp(Math.floor((off / width + 0.5) * lanes), 0, lanes - 1);
  const wheel = Math.min(0.78, width / (lanes * 2.8));
  const d = Math.abs(Math.abs(off - laneCenter(lane, lanes, width)) - wheel);
  return 1 - smooth(clamp((d - 0.06) / 0.24, 0, 1));
}

// The rendered shoulder and wheel contact share the same rounded profile.
function bankEnds(p, t) {
  const length = p.d1 - p.d0;
  return smooth(clamp(Math.min(t, 1 - t) * length / Math.min(2.3, length / 2), 0, 1));
}
function bankWidth(p, t) { return p.width * 0.5 * Math.sqrt(bankEnds(p, t)); }
function bankAxis(p, t) { return p.off + p.width * 0.08 * Math.sin(t * Math.PI * 2 + p.phase) * Math.sin(Math.PI * t); }
function bankHeight(p, t) {
  return (p.base + p.height * (0.91 + 0.09 * Math.sin(t * Math.PI * 3 + p.phase))) * bankEnds(p, t);
}
function bankRise(p, t, lateral) {
  const section = Math.max(0, 1 - lateral * lateral);
  return bankHeight(p, t) * section * section;
}
function moundAt (p, x, z) {
  const dx = x - p.x, dz = z - p.z, along = dx * p.ux + dz * p.uz;
  if (along <= p.d0 || along >= p.d1 || p.source?.broken) return 0;
  const t = (along - p.d0) / (p.d1 - p.d0);
  const q = (-dx * p.uz + dz * p.ux - bankAxis(p, t)) / Math.max(0.001, bankWidth(p, t));
  if (Math.abs(q) >= 1) return 0;
  return bankRise(p, t, q);
}

export function bankDepth (x, z, floor, bridge, mask) {
  if (mask <= 0) return 0;
  const list = MOUND_GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
  let depth = 0;
  for (const p of list || EMPTY) {
    if (p.bridge !== bridge || bridge && Math.abs(p.surfaceY(x, z) - floor) > 0.3) continue;
    depth = Math.max(depth, moundAt(p, x, z));
  }
  return depth * mask;
}

/** Начальный снег на видимом дорожном полотне. surfaceY — выбранная твёрдая
 * опора (земля/мост), чтобы дорога сверху не меняла снег под мостом.
 * Никаких аллокаций; out переиспользуется вызывающим кодом. */
export function sampleSurface (x, z, surfaceY, out = {}, bridge, terrainBase, coverageOnly = false, sampledGround) {
  out.onRoad = false; out.baseY = surfaceY; out.thickness = 0; out.compaction = 0;
  out.roadThickness = 0; out.sand = 0; out.dirt = 0; out.wetness = 0; out.rut = 0; out.heading = 0; out.coverage = 0; out.bridge = false; out.moundMask = 0; out.edgeDistance = Infinity;
  const k = cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL));
  const list = ROAD_GRID.get(k);
  if (!list) return out;
  let winner = null, best = -Infinity, bestOff = 0, bestAlong = 0, base = surfaceY, clearance = 1;
  const height = terrainBase || ROAD_GROUND;
  let ground = sampledGround;
  // У обычных полос общая высота грунта в точке. У моста свой настил.
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (bridge !== undefined && !!p.road.b !== bridge) continue;
    const score = p.score;
    if (!(score > best || (score === best && winner && p.corridor < winner.corridor))) continue;
    const dx = x - p.a[0], dz = z - p.a[1], along = dx * p.ux + dz * p.uz, off = -dx * p.uz + dz * p.ux;
    if (along < -0.1 || along > p.len + 0.1 || Math.abs(off) > p.w / 2 + 0.03) continue;
    const y = height && p.surfaceLift !== undefined ? (ground ??= height(x, z)) + p.surfaceLift : p.surfaceY(x, z);
    // Road material lift is ~0.14 m above the old vehicle support.
    if (Number.isFinite(surfaceY) && Math.abs(y - surfaceY) > 0.55) continue;
    winner = p; best = score; bestOff = off; bestAlong = along; base = y;
  }
  if (!winner) return out;
  const clear = winner.clear ? EMPTY : CLEAR_GRID.get(k) || EMPTY;
  for (let i = 0; clearance > 0 && i < clear.length; i++) {
    const q = clear[i];
    if (q.road.c > winner.road.c || !!q.road.b !== !!winner.road.b) continue;
    const dx = x - q.a[0], dz = z - q.a[1], along = dx * q.ux + dz * q.uz;
    const off = -dx * q.uz + dz * q.ux;
    if (along < -0.1 || along > q.len + 0.1 || Math.abs(off) > q.w / 2 + 8) continue;
    const y = height && q.surfaceLift !== undefined ? (ground ??= height(x, z)) + q.surfaceLift : q.surfaceY(x, z);
    if (Math.abs(y - base) > 0.3) continue;
    clearance = Math.min(clearance, smooth(clamp((Math.abs(off) - q.w / 2) / 8, 0, 1)));
  }
  const p = winner, edgeDistance = p.w / 2 - Math.abs(bestOff);
  const edge = smooth(clamp(edgeDistance / 0.45, 0, 1));
  out.coverage = p.clear ? 0 : edge * clearance;
  if (coverageOnly) return out;
  const rut = treadAt(bestOff, p.w, p.count) * rutFade(p.along + bestAlong, p.total, 0, p.breaks);
  const layer = p.clear ? 0.002 : ROAD_LIFT * clearance;
  const moundMask = smooth(clamp((1.6 - edgeDistance) / 0.7, 0, 1)) * (p.clear ? 1 : clearance);
  out.onRoad = true; out.baseY = base; out.thickness = layer;
  out.roadThickness = layer; out.edgeDistance = edgeDistance;
  out.compaction = 0.78 + rut * 0.15;
  out.sand = p.sand ? edge * 0.65 : 0; out.dirt = 0.16 + rut * 0.19;
  out.rut = rut; out.heading = p.heading; out.bridge = !!p.road.b;
  out.moundMask = moundMask;
  return out;
}

const COVER_SAMPLE = {};

/* Явный dev-стенд выбирает место рядом с пиццерией. Голый ?winterspot
   оставляет обычный старт смены. */
export function nearestSpot (kind, x, z, maxDistance = 450) {
  const list = SPOTS[kind === 'lanes' ? 'rut' : kind];
  if (!list) return null;
  let best = null, dist = maxDistance * maxDistance;
  let longRut = null, longDist = dist;
  for (const p of list) {
    if (kind === 'lanes' && p.lanes < 2) continue;
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
      const k = cellKey(i, j), list = RUT_GRID.get(k);
      if (list) list.push(p); else RUT_GRID.set(k, [p]);
    }
}

/* Внутри парной колеи колёса держат направление лучше. На главной улице
   эффект слабее: машины там чаще разбивают и разравнивают снежные бортики. */
export function rutAt (x, z, h, snow) {
  if (snow <= 0.45) return 0;
  const list = RUT_GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
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
      const k = cellKey(i, j), list = SAND_GRID.get(k);
      if (list) list.push(p); else SAND_GRID.set(k, [p]);
    }
}

function snowSection (cx, cz, ux, uz, length, width, along, total, fadeStart, fadeEnd) {
  const p = { cx, cz, ux, uz, hl: length / 2, hw: width / 2, along, total, fadeStart, fadeEnd };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * p.hw, rz = Math.abs(uz) * p.hl + Math.abs(nz) * p.hw;
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = cellKey(i, j), list = SNOW_GRID.get(k);
      if (list) list.push(p); else SNOW_GRID.set(k, [p]);
    }
}

export function snowAt (x, z) {
  if (ROAD_GRID.size) return sampleSurface(x, z, NaN, COVER_SAMPLE).coverage;
  const list = SNOW_GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
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
  const list = SAND_GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
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
      const k = cellKey(i, j), list = GRID.get(k);
      if (list) list.push(p); else GRID.set(k, [p]);
    }
  ST.soft++;
  if (strength > 0.8) {
    const wheelLine = offset - Math.sign(offset) * 0.89, ahead = p.hl + 2.5;
    const spot = { x: cx - uz * wheelLine - ux * ahead, z: cz + ux * wheelLine - uz * ahead, h: Math.atan2(ux, uz) };
    SPOTS.soft.push(spot);
    if (!ST.exampleSoft) ST.exampleSoft = spot;
  }
  return p;
}

export function scatter (V, speed, snow, emit) {
  if (snow <= 0.45 || speed < 1.2) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
  const contacts = [[V.x, V.z]];
  for (const fore of [-1.45, 1.45]) for (const side of [-0.82, 0.82])
    contacts.push([V.x + fx * fore + sx * side, V.z + fz * fore + sz * side]);
  for (const [x, z] of contacts) {
    const list = GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
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
          pos.setY(i, p.floor(pos.getX(i), pos.getZ(i)) + 0.02);
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
  const list = GRID.get(cellKey(Math.floor(x / WINTER_ROAD.CELL), Math.floor(z / WINTER_ROAD.CELL)));
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

/* Зимняя дорога — тонкий неподвижный слой цвета. Две полоски на каждую
   автомобильную полосу, без выемок и физики на самом полотне. */
function mixHex (a, b, f) {
  const chan = shift => Math.round(((a >> shift) & 255) * (1 - f) + ((b >> shift) & 255) * f);
  return chan(16) << 16 | chan(8) << 8 | chan(0);
}
function roadSheet (M, p, countTracks = true, bridge) {
  const { a, ux, uz, len, w, count, clear, total, along, breaks } = p;
  const nodes = [], width = w / count, wheel = Math.min(0.78, width / 2.8);
  if (!clear) nodes.push({ off: -w / 2, track: 0 });
  const stripes = [];
  for (let lane = 0; lane < count; lane++) for (const side of [-1, 1]) {
    const off = laneCenter(lane, count, w) + side * wheel;
    const half = Math.min(clear ? 0.20 : 0.29, width * 0.12);
    const band = [{ off: off - half, track: 0 }, { off, track: 1 }, { off: off + half, track: 0 }];
    if (clear) stripes.push(band); else nodes.push(...band);
    if (countTracks) ST.tracks++;
  }
  if (!clear) { nodes.push({ off: w / 2, track: 0 }); stripes.push(nodes); }
  const sampled = {};
  const makeSection = () => stripes.map(band => band.map(() => ({ x: 0, z: 0, y: 0, colour: 0, covered: 0 })));
  function section (d, vertices) {
    const phase = rutFade(along + d, total, 0, breaks);
    for (let j = 0; j < stripes.length; j++) for (let i = 0; i < stripes[j].length; i++) {
      const node = stripes[j][i], v = vertices[j][i];
      v.x = a[0] + ux * d - uz * node.off;
      v.z = a[1] + uz * d + ux * node.off;
      // Уличное полотно и поиск соседнего полотна используют один рельеф.
      const ground = p.surfaceLift === undefined ? undefined : ROAD_GROUND(v.x, v.z);
      const base = ground === undefined ? p.surfaceY(v.x, v.z, d) : ground + p.surfaceLift;
      v.y = base + (clear ? 0.013 : ROAD_LIFT);
      const grain = 0.9 + hash(v.x, v.z, 205) * 0.1;
      const mix = node.track * phase * grain;
      v.colour = clear ? mixHex(0x565f67, 0x707b82, mix) : mixHex(ROAD_SNOW, ROAD_TRACK, mix);
      v.covered = clear ? phase : sampleSurface(v.x, v.z, base, sampled, bridge, undefined, true, ground).coverage;
    }
  }
  let prev = makeSection(), next = makeSection();
  section(0, prev);
  for (let d = 0; d < len;) {
    const end = Math.min(len, d + (d < 14 || len - d < 18 ? 3 : 8));
    section(end, next);
    for (let band = 0; band < stripes.length; band++) for (let i = 1; i < stripes[band].length; i++) {
      const q = prev[band][i - 1], r = next[band][i - 1], s = next[band][i], t = prev[band][i];
      if (Math.max(q.covered, r.covered, s.covered, t.covered) < 0.01) continue;
      M.tri3(q.x,q.y,q.z, r.x,r.y,r.z, s.x,s.y,s.z, q.colour,r.colour,s.colour);
      M.tri3(q.x,q.y,q.z, s.x,s.y,s.z, t.x,t.y,t.z, q.colour,s.colour,t.colour);
    }
    const swap = prev; prev = next; next = swap; d = end;
  }
}

/* Плавная маска песка — один байт на вершину. В материале она даёт
   мелкую зернистую примесь, не геометрические треугольники на дороге. */
export function addSandAttribute (mesh, THREE, terrainBase) {
  const sampled = {};
  const pos = mesh.geometry.attributes.position, mask = new Uint8Array(pos.count), cover = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    sampleSurface(x, z, pos.getY(i) - 0.09, sampled, undefined, terrainBase);
    mask[i] = Math.round(sampled.sand * 255);
    cover[i] = Math.round(Math.max(sampled.coverage, sampled.roadThickness < 0.003 ? sampled.rut * 0.72 : 0) * 255);
  }
  const a = new THREE.BufferAttribute(mask, 1, true);
  a.onUpload(function () { this.array = null; });
  mesh.geometry.setAttribute('roadSand', a);
  const b = new THREE.BufferAttribute(cover, 1, true);
  b.onUpload(function () { this.array = null; });
  mesh.geometry.setAttribute('roadBlend', b);
}

/* Округлый вал у обочины. Сечения сужаются и опускаются к обоим концам. */
function mound (M, x, z, ux, uz, d0, d1, off, width, base, height, surfaceY, source = null, bridge = false) {
  const nx = -uz, nz = ux, h = height * (0.85 + hash(x + ux * d0, z + uz * d0, 141) * 0.3);
  const p = { x, z, ux, uz, d0, d1, off, width, base, height: h, surfaceY, source, bridge, phase: hash(x, z, 142) * 6.28 };
  const ax = x + ux * d0 + nx * off, az = z + uz * d0 + nz * off;
  const bx = x + ux * d1 + nx * off, bz = z + uz * d1 + nz * off;
  const bounds = [Math.min(ax, bx) - width, Math.min(az, bz) - width, Math.max(ax, bx) + width, Math.max(az, bz) + width];
  indexBox(MOUND_GRID, p, ...bounds);
  BANKS.push({ M, p, bounds });
}

/* Мощение и заборы к этому моменту уже построены. Дальняя форма
   сугроба лежит на той же опоре, что ближняя сетка и колесо. */
export function* finishBanks (groundH, groundReceiver, fences, curbCover, legacy, stream = null) {
  let banks = BANKS.splice(0);
  if (stream && !legacy) {
    const cells = new Map();
    const cellOf = ([x0, z0, x1, z1]) =>
      Math.floor((x0 + x1) / (2 * stream.size)) + ',' + Math.floor((z0 + z1) / (2 * stream.size));
    for (const bank of banks) {
      const key = cellOf(bank.bounds);
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = { bounds: bank.bounds.slice(), banks: [] });
      const [x0, z0, x1, z1] = bank.bounds;
      const b = cell.bounds;
      b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], z0);
      b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], z1);
      cell.banks.push(bank);
    }
    const queued = new Set();
    for (const [key, cell] of cells) {
      if (stream.defer(cell.bounds, M => drawBanks(cell.banks, groundH, groundReceiver, fences, curbCover, false, M))) queued.add(key);
    }
    banks = banks.filter(bank => !queued.has(cellOf(bank.bounds)));
  }
  yield* drawBanks(banks, groundH, groundReceiver, fences, curbCover, legacy);
}

function* drawBanks (banks, groundH, groundReceiver, fences, curbCover, legacy, writer = null) {
  const cols = [-1, -0.58, 0, 0.58, 1], road = {}, receiver = {};
  const crossSection = cols.map(q => Math.max(0, 1 - q * q));
  const row = () => cols.map(() => new Float64Array(7));
  let prev = row(), next = row();
  const batchSize = writer ? 2 : 48;
  let built = 0;
  for (const { M: original, p } of banks) {
    const M = writer || original;
    const { x, z, ux, uz, d0, d1, surfaceY, source, bridge } = p;
    M.flag(bridge ? 255 : 0);
    const floorAt = (px, pz) => {
      const y = bridge ? surfaceY(px, pz) : groundH(px, pz);
      sampleSurface(px, pz, y, road, bridge);
      receiver.baseY = y; receiver.materialId = 0;
      return bridge ? y : groundReceiver(px, pz, y, road, receiver);
    };
    if (source && legacy) {
      M.front(true).track((mesh, first, count) => source.ranges.push({ mesh, first, count }));
      source.floor = floorAt;
    }
    const points = (t, out) => {
      const along = d0 + (d1 - d0) * t;
      const center = bankAxis(p, t), width = bankWidth(p, t), height = bankHeight(p, t);
      for (let i = 0; i < cols.length; i++) {
        const off = center + width * cols[i];
        const px = x + ux * along - uz * off, pz = z + uz * along + ux * off;
        const floor = floorAt(px, pz), section = crossSection[i], rise = height * section * section;
        const cover = bridge || rise === 0 ? 1 : Math.min(fences.cover(px, pz), curbCover(px, pz));
        const depth = rise * (road.onRoad && road.bridge === bridge ? road.moundMask : 1) * cover;
        const v = out[i];
        v[0] = px; v[1] = floor + depth - 0.018 * (1 - Math.min(1, depth / 0.075)); v[2] = pz;
        v[3] = floor; v[4] = depth; v[5] = receiver.materialId;
        v[6] = receiver.materialId === 1 ? mixHex(ROAD_SNOW, 0xe7eff2, smooth(clamp((depth - 0.035) / 0.17, 0, 1))) : 0xe7eff2;
      }
    };
    const tri = (a, b, c) => {
      if (Math.max(a[4], b[4], c[4]) < 0.006) return;
      if (!bridge) {
        const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
        const d = fences.distance(cx, cz);
        if (Number.isFinite(d) && d < Math.max(Math.hypot(a[0] - cx, a[2] - cz),
          Math.hypot(b[0] - cx, b[2] - cz), Math.hypot(c[0] - cx, c[2] - cz))) return;
        const span = Math.max(a[3], b[3], c[3]) - Math.min(a[3], b[3], c[3]);
        const mixed = a[5] !== b[5] || a[5] !== c[5];
        if (span > (mixed ? 0.065 : 0.20)) return;
        if (span > 0.055 && (a[3] + b[3] + c[3]) / 3 - floorAt(cx, cz) > 0.055) return;
      }
      M.tri3(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[6], b[6], c[6]);
    };
    points(0, prev);
    const rows = Math.max(5, Math.min(16, Math.ceil((d1 - d0) / 1.3)));
    for (let i = 1; i <= rows; i++) {
      points(i / rows, next);
      for (let k = 1; k < cols.length; k++) {
        const a = prev[k - 1], b = next[k - 1], c = next[k], d = prev[k];
        tri(a, b, c); tri(a, c, d);
      }
      const used = prev; prev = next; next = used;
    }
    if (source && legacy) M.front(false);
    if (++built % batchSize === 0) yield 'snow banks';
  }
}

/* Строим поверх полотна. Сначала вся снежная основа, затем непрерывная
   колея: снег соседней улицы не должен перекрывать её на стыке. */
export function build ({ M, rutM, softM, roads, roadWidth, yOf, groundH, junction, sendRoadSheets }) {
  GRID.clear();
  SAND_GRID.clear();
  SNOW_GRID.clear();
  RUT_GRID.clear();
  ROAD_GRID.clear(); CLEAR_GRID.clear(); MOUND_GRID.clear(); BANKS.length = 0;
  ROAD_GROUND = groundH;
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
    const { sand, clear } = modes.get(road);
    const rutRoad = true;
    const total = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const count = lanesOn(road, w), depth = 0.145;
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
        if (alignment < 0.95) {
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
          if (other === road || !modes.has(other)) continue;
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
    const bankGaps = breaks.map(({ at, core }) => [at - core - 2.4, at + core + 2.4]).sort((a, b) => a[0] - b[0]);
    // На большой карте миллиметры разницы глубины исчезают. Снег выше полотна,
    // а каждый видимый слой выше предыдущего на сантиметры.
    const surfaceLift = yOf(road), y = surfaceLift + 0.06;
    const surfaceY = (x, z) => groundH(x, z) + surfaceLift;
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
          M.color('#b5c0c6'); M.disc(p[0], p[1], w / 2, y, 10);
          coveredJunctions.set(k, w / 2);
        }
        return true;
      };
      coverJunction(a); coverJunction(b);
      const segment = { a, b, ux, uz, len, w, surfaceY, surfaceLift, sand, clear, road, rutRoad, count, depth, fade, breaks, bankGaps, total, along,
        corridor: modes.get(road)?.corridor || String(road.c), heading: Math.atan2(ux, uz) };
      segments.push(segment); registerRoad(segment);
      along += len;
    }
  }
  const deferred = sendRoadSheets?.(segments.map(segment => {
    const { a, b, ux, uz, len, w, surfaceLift, sand, clear, count, total, along, breaks, corridor, road } = segment;
    return { a, b, ux, uz, len, w, surfaceLift, sand, clear, count, total, along, breaks, corridor, road: { c: road.c } };
  }), () => {
    // The bridges may already have registered their receivers by the
    // time the worker fails. The original street pass only sees streets.
    for (const segment of segments) roadSheet(rutM, segment, false, false);
  });
  for (const segment of segments) {
    const { a, b, ux, uz, len, w, surfaceY, sand, clear, road, rutRoad, count, depth, fade, breaks, bankGaps, total, along } = segment;
    if (deferred) ST.tracks += Math.ceil(count) * 2;
    else roadSheet(rutM, segment);
    if (!clear) {
      rutSegment((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w, count,
        clamp(depth / 0.145, 0, 1), along, total, fade, breaks);
      if (len > 24 && rutFade(along + len / 2, total, 0, breaks) > 0.4) {
        const spot = { x: (a[0] + b[0]) / 2 - uz * laneCenter(0, count, w),
          z: (a[1] + b[1]) / 2 + ux * laneCenter(0, count, w), h: Math.atan2(ux, uz), span: len, lanes: count };
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
      // Длинный грейдерный вал идёт между въездами, с короткими просветами.
      const bankRange = (first, last) => {
        for (let d = first; d + 4.5 < last;) {
          const cx = a[0] + ux * d, cz = a[1] + uz * d;
          const end = Math.min(last, d + 12 + 6 * hash(cx, cz, 83));
          for (const side of [-1, 1]) {
            if (hash(cx, cz, 81 + side) < 0.18) continue;
            // Keep the bank's footprint on the road receiver through the
            // bend and leave the vertical curb face clear.
            const off = side * (w / 2 - 0.73), width = 0.95 + 0.25 * hash(cx, cz, 84 + side);
            const height = 0.25 + 0.23 * hash(cx, cz, 85 + side);
            const middle = (d + end) / 2;
            const patch = softPatch(a[0] + ux * middle, a[1] + uz * middle, ux, uz, end - d, off, width, 0.85, surfaceY);
            mound(softM, a[0], a[1], ux, uz, d, end, off, width, 0.075, height, surfaceY, patch);
            ST.edges++;
          }
          d = end + 1 + 1.4 * hash(cx, cz, 88);
        }
      };
      let start = 1.1;
      const finish = len - 0.65;
      for (const [a, b] of bankGaps) {
        if (b - along <= start) continue;
        if (a - along >= finish) break;
        bankRange(start, a - along);
        start = b - along;
      }
      bankRange(start, finish);
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
      rutRoad: true, count: lanesOn(road, width), depth: 0, fade: 0, breaks: [], total, along, heading: Math.atan2(ux, uz), corridor: roadMode(road).corridor || 'bridge' };
    registerRoad(segment);
    roadSheet(M, segment);
    if (!clear) {
      snowSection((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, ux, uz, len, width, along, total, 12, 12);
      ST.snow++;
    } else ST.clear++;
    // Мосты относятся к уличной сети, дворовая колея на них не выходит.
    along += len;
    if (sand) ST.sand++;
    if (hash(a[0], a[2], 111) > 0.25) for (const side of [-1, 1]) {
      const off = side * (width / 2 - 0.55);
      mound(softM, a[0], a[2], ux, uz, 0, len, off, 1.15, 0.072, 0.17, surfaceY, null, true);
      ST.edges++;
    }

  }
}


// Called in the worker's own module instance. The game's street and
// bridge registries remain on the main thread.
export function drawStreetSheets (segments, groundH, sink) {
  ROAD_GRID.clear(); CLEAR_GRID.clear();
  ROAD_GROUND = groundH;
  for (const segment of segments) registerRoad(segment);
  for (const segment of segments) {
    segment.surfaceY = (x, z) => groundH(x, z) + segment.surfaceLift;
    roadSheet(sink, segment);
  }
}
