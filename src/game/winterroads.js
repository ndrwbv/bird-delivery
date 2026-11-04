/* Зимнее полотно: на одних улицах песок, на других снег с колеёй.
   Цвет и рыхлые места строятся из одних и тех же отрезков; запрос колеса — по клеткам 32 м.
   Меш скрывается вне снежного сезона в seasons.js. */

export const WINTER_ROAD = {
  CELL: 32,
  SAND_MAIN: 0.5,             // доля посыпанных улиц классов 0–3
  SAND_LOCAL: 0.3,            // классы 4–5 посыпают реже
  SOFT_ACC: 0.78,             // потеря тяги в рыхлом снегу
  SOFT_DRAG: 2.0,             // сопротивление качению, 1/с
  SOFT_SIDE: 0.55,            // потеря бокового сцепления
  WHEEL_SPIN: 5.0,            // добавочная видимая прокрутка колеса, м/с
};

export const ST = { snow: 0, sand: 0, tracks: 0, soft: 0, edges: 0, sprays: 0, exampleSoft: null, exampleSand: null, exampleRut: null };
const GRID = new Map();
const SAND_GRID = new Map();
const RUT_GRID = new Map();
let sprayT = 0, spraySide = 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function hash (x, z, salt = 0) {
  let h = Math.imul(Math.round(x * 4) + salt * 907, 0x9e3779b1) ^ Math.imul(Math.round(z * 4) - salt * 173, 0x85ebca6b);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const key = (i, j) => i + ',' + j;
const laneCount = w => w >= 18 ? 4 : w >= 12.5 ? 3 : w >= 8.5 ? 2 : 1;
const laneCenter = (lane, count, w) => (lane + 0.5 - count / 2) * w / count;

function rutSegment (cx, cz, ux, uz, length, width, count, depth, along, total, fade) {
  const p = { cx, cz, ux, uz, hl: length / 2, hw: width / 2, count, depth, along, total, fade };
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
    const fade = p.fade ? clamp(Math.min(progress, p.total - progress) / p.fade, 0, 1) : 1;
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

function softPatch (cx, cz, ux, uz, length, offset, width, strength) {
  const p = { cx, cz, ux, uz, hl: length / 2, offset, hw: width / 2, strength };
  const nx = -uz, nz = ux;
  const rx = Math.abs(ux) * p.hl + Math.abs(nx) * (Math.abs(offset) + p.hw);
  const rz = Math.abs(uz) * p.hl + Math.abs(nz) * (Math.abs(offset) + p.hw);
  for (let i = Math.floor((cx - rx) / WINTER_ROAD.CELL); i <= Math.floor((cx + rx) / WINTER_ROAD.CELL); i++)
    for (let j = Math.floor((cz - rz) / WINTER_ROAD.CELL); j <= Math.floor((cz + rz) / WINTER_ROAD.CELL); j++) {
      const k = key(i, j), list = GRID.get(k);
      if (list) list.push(p); else GRID.set(k, [p]);
    }
  ST.soft++;
  if (!ST.exampleSoft && strength > 0.8) ST.exampleSoft = { x: cx - uz * offset, z: cz + ux * offset, h: Math.atan2(ux, uz) };
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
function ruts (M, x, z, ux, uz, len, w, surfaceY, count, depth, along, total, fade) {
  const nx = -uz, nz = ux, step = Math.min(0.78, w / (count * 2.6));
  const outer = Math.min(0.48, step * 0.63), inner = outer * 0.45;
  const ridge = 0.13 + depth * 0.8, floor = Math.max(0.08, 0.13 - depth * 0.4);
  const nodes = [{ off: -w / 2, h: 0.13 }], colors = [];
  const add = (off, h, color) => { nodes.push({ off, h }); colors.push(color); };
  for (let lane = 0; lane < count; lane++) for (const side of [-1, 1]) {
    const off = laneCenter(lane, count, w) + side * step;
    add(off - outer, ridge, '#e8eeec');
    add(off - inner, floor + (ridge - floor) * 0.2, '#d7e0df');
    add(off, floor, '#c9d5d5');
    add(off + inner, floor + (ridge - floor) * 0.2, '#c9d5d5');
    add(off + outer, ridge, '#d7e0df');
    ST.tracks++;
  }
  add(w / 2, 0.13, '#e8eeec');
  const sections = [[0]];
  for (let d = 4; d < len - 0.5; d += 4) sections.push([d]);
  sections.push([len]);
  for (const sec of sections) {
    const d = sec[0], progress = along + d;
    sec.push(fade ? clamp(Math.min(progress, total - progress) / fade, 0, 1) : 1,
      (hash(x + ux * d, z + uz * d, 161) - 0.5) * 0.13,
      0.92 + hash(x + ux * d, z + uz * d, 162) * 0.16);
  }
  const point = (sec, node) => {
    const [d, f, sway, rise] = sec, off = node.off + (Math.abs(node.off) < w / 2 - 0.01 ? sway : 0);
    const px = x + ux * d + nx * off, pz = z + uz * d + nz * off;
    return [px, surfaceY(px, pz, d) + 0.075 + (node.h - 0.075) * f * rise, pz];
  };
  for (let j = 1; j < sections.length; j++) for (let i = 1; i < nodes.length; i++) {
    const a = point(sections[j - 1], nodes[i - 1]), b = point(sections[j], nodes[i - 1]);
    const c = point(sections[j], nodes[i]), d = point(sections[j - 1], nodes[i]);
    M.color(colors[i - 1]);
    M.tri(...a, ...b, ...c); M.tri(...a, ...c, ...d);
  }
}

/* Плавная маска песка — один байт на вершину. В материале она даёт
   мелкую зернистую примесь, не геометрические треугольники на дороге. */
export function addSandAttribute (group, THREE) {
  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position, mask = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) mask[i] = Math.round(sandAt(pos.getX(i), pos.getZ(i), 1) * 255);
    const a = new THREE.BufferAttribute(mask, 1, true);
    a.onUpload(function () { this.array = null; });
    mesh.geometry.setAttribute('roadSand', a);
  }
}

/* Сугроб клином с неровной вершиной, а не пятно краски на асфальте. */
function mound (M, x, z, ux, uz, d0, d1, off, width, base, height, surfaceY) {
  const nx = -uz, nz = ux, h = height * (0.85 + hash(x + ux * d0, z + uz * d0, 141) * 0.3);
  const ts = [0, 0.23, 0.5, 0.78, 1], rise = [0, 0.65, 1, 0.72, 0];
  const point = (i, side) => {
    const along = d0 + (d1 - d0) * ts[i], lateral = off + side * width / 2;
    const px = x + ux * along + nx * lateral, pz = z + uz * along + nz * lateral;
    return [px, surfaceY(px, pz, along) + base + (side === 0 ? rise[i] * h : 0), pz];
  };
  for (let i = 1; i < ts.length; i++) for (const side of [-1, 1]) {
    const a = point(i - 1, side), b = point(i, side), c = point(i, 0), d = point(i - 1, 0);
    M.color(side < 0 ? '#c9d7dc' : '#e1e9eb');
    M.tri(...a, ...b, ...c); M.tri(...a, ...c, ...d);
  }
}

/* Строим поверх полотна. Сначала вся снежная основа, затем непрерывная
   колея: снег соседней улицы не должен перекрывать её на стыке. */
export function build ({ M, roads, roadWidth, yOf, groundH, junction }) {
  GRID.clear();
  SAND_GRID.clear();
  RUT_GRID.clear();
  ST.snow = ST.sand = ST.tracks = ST.soft = ST.edges = ST.sprays = 0;
  ST.exampleSoft = ST.exampleSand = ST.exampleRut = null;
  const coveredJunctions = new Map();
  const segments = [];
  for (const road of roads) {
    if (road.x || road.b || road.c === 6 || road.c > 7) continue;
    const w = roadWidth(road), pts = road.p;
    if (w < 3 || pts.length < 2) continue;
    const mid = road.mid0 ? road.mid0[1] : road.m0 || pts[(pts.length / 2) | 0];
    const kind = hash(mid[0], mid[1], road.c + 31);
    const sand = kind < (road.c <= 3 ? WINTER_ROAD.SAND_MAIN : road.c === 7 ? 0.12 : WINTER_ROAD.SAND_LOCAL);
    const total = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const count = laneCount(w), depth = road.c <= 1 ? 0.035 : road.c === 2 ? 0.05 : road.c === 3 ? 0.075 : road.c === 4 ? 0.105 : 0.145;
    const fade = (road.c === 7 || (road.c >= 5 && total < 55)) ? Math.min(9, total / 3) : 0;
    // На большой карте миллиметры разницы глубины исчезают. Снег выше полотна,
    // а каждый видимый слой выше предыдущего на сантиметры.
    const y = yOf(road) + 0.06;
    const surfaceY = (x, z) => groundH(x, z) + yOf(road);
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const line = (d0, d1, off, width, color, lift = 0) => {
        M.color(color);
        M.ribbon(a[0] + ux * d0 + nx * off, a[1] + uz * d0 + nz * off,
          a[0] + ux * d1 + nx * off, a[1] + uz * d1 + nz * off, width, y + lift);
      };
      // Базовая снежная корка до самого узла: иначе разрыв выглядел чёрным прямоугольником.
      for (let d = 0; d < len; d += 6) {
        const end = Math.min(len, d + 6);
        if (sand) for (let band = 0; band < 4; band++)
          line(d, end, (band - 1.5) * w / 4, w / 4, '#dce2e3');
        else line(d, end, 0, w, '#dce2e3');
      }
      ST.snow++;
      const coverJunction = p => {
        if (!junction(p[0], p[1])) return false;
        const k = key(p[0], p[1]), old = coveredJunctions.get(k) || 0;
        if (old < w / 2) {
          M.color('#dce2e3'); M.disc(p[0], p[1], w / 2, y, 10);
          coveredJunctions.set(k, w / 2);
        }
        return true;
      };
      coverJunction(a); coverJunction(b);
      segments.push({ a, b, ux, uz, len, w, surfaceY, sand, road, count, depth, fade, total, along });
      along += len;
    }
  }
  for (const { a, b, ux, uz, len, w, surfaceY, sand, road, count, depth, fade, total, along } of segments) {
      ruts(M, a[0], a[1], ux, uz, len, w, surfaceY, count, depth, along, total, fade);
      rutSegment((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w, count,
        clamp(depth / 0.145, 0, 1), along, total, fade);
      if (!ST.exampleRut && road.c >= 4 && len > 22 && along > 8 && total - along - len > 8)
        ST.exampleRut = { x: (a[0] + b[0]) / 2 - uz * laneCenter(0, count, w),
          z: (a[1] + b[1]) / 2 + ux * laneCenter(0, count, w), h: Math.atan2(ux, uz) };
      if (sand) {
        sandSection((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uz, len, w - 0.5, along, total);
        if (!ST.exampleSand && len > 20) ST.exampleSand = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, h: Math.atan2(ux, uz) };
        ST.sand++;
      }
      // Сгребённая к бордюру снежная кромка: кусками, чтобы она не была ровной линией.
      for (let d = 2; d < len - 4; d += 14) {
        if (hash(a[0] + ux * d, a[1] + uz * d, 81) < 0.32) continue;
        const side = hash(a[0] + ux * d, a[1] + uz * d, 82) < 0.5 ? -1 : 1;
        const end = Math.min(len - 1, d + 7 + hash(a[0] + ux * d, a[1] + uz * d, 83) * 5);
        const off = side * (w / 2 - 0.55), width = 0.95 + 0.55 * hash(a[0] + ux * d, a[1] + uz * d, 84);
        mound(M, a[0], a[1], ux, uz, d, end, off, width, 0.15, 0.24, surfaceY);
        ST.edges++;
        // Иногда рыхлый язык выходит из вала в проезжую часть. Он виден и замедляет колесо.
        if (!sand && hash(a[0] + ux * d, a[1] + uz * d, 85) > 0.82) {
          const slen = Math.min(7, end - d), s0 = d + (end - d - slen) / 2;
          const soff = side * Math.max(0.2, w / 2 - 1.15), sw = Math.min(2.1, w / 2);
          mound(M, a[0], a[1], ux, uz, s0, s0 + slen, soff, sw, 0.18, 0.24, surfaceY);
          softPatch(a[0] + ux * (s0 + slen / 2), a[1] + uz * (s0 + slen / 2), ux, uz, slen, soff, sw, 0.65);
        }
      }
      // На непосыпанных улицах небольшие снежные полосы пересекают колею.
      if (!sand && len > 18) for (let d = 9; d < len - 7; d += 28) {
        if (hash(a[0] + ux * d, a[1] + uz * d, 91) < 0.82) continue;
        const slen = Math.min(5 + hash(a[0] + ux * d, a[1] + uz * d, 92) * 5, len - d);
        const soff = (hash(a[0] + ux * d, a[1] + uz * d, 93) - 0.5) * Math.max(0, w - 3);
        const sw = Math.min(2.4, w - 1);
        mound(M, a[0], a[1], ux, uz, d, d + slen, soff, sw, 0.18, 0.28, surfaceY);
        softPatch(a[0] + ux * (d + slen / 2), a[1] + uz * (d + slen / 2), ux, uz, slen, soff, sw, 0.85);
      }
  }
  return ST;
}

/* Мостовые настилы идут над рельефом; обычный ribbon() лёг бы под мостом. */
export function bridge ({ M, road, points, width }) {
  if (road.c > 5 || points.length < 2) return;
  const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0);
  const count = laneCount(width), depth = road.c <= 1 ? 0.035 : road.c === 2 ? 0.05 : road.c === 3 ? 0.075 : road.c === 4 ? 0.105 : 0.145;
  const mid = road.mid0 ? road.mid0[1] : road.m0 || road.p[(road.p.length / 2) | 0];
  const sand = hash(mid[0], mid[1], road.c + 31) < (road.c <= 3 ? WINTER_ROAD.SAND_MAIN : WINTER_ROAD.SAND_LOCAL);
  if (sand) {
    const a = points[0], b = points[points.length - 1], len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    sandSection((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, (b[0] - a[0]) / len, (b[2] - a[2]) / len, len, width - 0.5);
  }
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const line = (off, w, color, lift = 0) => {
      M.color(color);
      M.ribbon3(a[0] + nx * off, a[1] + 0.2 + lift, a[2] + nz * off,
        b[0] + nx * off, b[1] + 0.2 + lift, b[2] + nz * off, w);
    };
    const surfaceY = (x, z, d) => a[1] + (b[1] - a[1]) * d / len + 0.14;
    if (sand) for (let band = 0; band < 4; band++) line((band - 1.5) * width / 4, width / 4, '#dce2e3');
    else line(0, width, '#dce2e3');
    ST.snow++;
    ruts(M, a[0], a[2], ux, uz, len, width, surfaceY, count, depth, along, total, 0);
    along += len;
    if (sand) ST.sand++;
    if (hash(a[0], a[2], 111) > 0.25) for (const side of [-1, 1]) {
      const off = side * (width / 2 - 0.55);
      mound(M, a[0], a[2], ux, uz, 0, len, off, 1.15, 0.15, 0.24, surfaceY);
      ST.edges++;
    }
    if (!sand && hash(a[0], a[2], 112) > 0.8) {
      const off = (hash(a[0], a[2], 113) - 0.5) * Math.max(0, width - 3);
      mound(M, a[0], a[2], ux, uz, 0, len, off, 2.2, 0.18, 0.28, surfaceY);
      softPatch((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, ux, uz, len, off, 2.2, 0.85);
    }
  }
}
