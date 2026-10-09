/* ──────────────────────────────────────────────────────────────────────────
   Фонари: все сбиваются. Правила словами и числами — docs/CAREER.md
   «Город: что сбивается».

   • Столб (и консоль, и основание) — в склейке сбиваемого (smashAdd, вид
     'lamp'): одна отрисовка на клетку, как заборчики и знаки. Сбил — столб
     схлопывается, вместо него падает целый фонарь (свой меш, только пока
     лежит, LIE секунд), плафон гаснет, пятно света под ним пропадает.
   • Плафон — в склейке LAMPH (горит ночью), пятно света — в LAMP_SPOTS.
     Чьи вершины в склейках — запоминает game.js (mergeChunked, buildNight)
     по метке track: сбил — эти вершины уходят под землю. Источников света
     нет: и плафон, и пятно — просто яркие меши.
   • Виды: 'cobra' — прямоугольный плафон на консоли над дорогой (проспекты),
     'ball' — шар-плафон на макушке столба, 'twin' — два шара на перекладине
     (улицы потише), 'wood' / 'woodball' — деревянный столб частного сектора
     с маленьким прямоугольным или круглым плафоном на короткой консоли,
     'park' — шар на тонком столбике у аллей, 'yard' — короткий фонарь
     над парковкой пиццерии, 'mast' — мачта катка.
   • Где: вдоль всех улиц 1—3 класса (как раньше) и, теперь, вдоль улиц
     частного сектора (4 класс в клетках, где больше всего частных домов).

   Переменных игры модуль не видит: всё приходит объектом A (put, smashAdd,
   groundH, LAMPH, LAMP_SPOTS…). streets(A) — из osmStreetLife,
   lamp(A, o) — из world.js / pizzeria.js / landmarks.js, step(dt) — каждый кадр.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* числа — здесь; в docs/CAREER.md — они же словами */
export const LAMP = {
  STEP: 36,          // м между фонарями вдоль большой улицы (через раз по сторонам)
  STEP_PRIV: 40,     // м в частном секторе (по одной стороне улицы)
  R: 0.45,           // радиус столба для удара
  SLOW: 0.9,         // машина сохраняет 90 % скорости, снеся фонарь
  LIE: 25,           // с лежит упавший фонарь, потом уходит в землю
  FALL_CAP: 10,      // столько падающих/лежащих одновременно, старые убираем
};

const GREY = '#585460', DARK = '#3b3f46', WOOD = '#6e5a45', HEAD = '#fff3c4', WARM = '#ffe2a6';
export const STATS = { city: 0, ball: 0, twin: 0, priv: 0, poorOld: 0, down: 0, skip: { road: 0, house: 0, zebra: 0 } };
const LAMPS = [];
const FALL = [];
let SCENE = null;

/* части фонаря в его координатах: начало — низ столба, вынос консоли — по +X.
   head — где плафон (для пятна света) */
function parts (style) {
  const P = [];
  const B = (w, h, d, hex, x, y, z, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    P.push({ g, hex });
  };
  const Lit = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); P.push({ g, hex: HEAD, glow: 1 }); };
  const Ball = (r, x, y, z, hex = HEAD) => { const g = new THREE.SphereGeometry(r, 8, 6).translate(x, y, z); P.push({ g, hex, glow: 1 }); };
  let head = [0, 0];
  switch (style) {
    case 'cobra':                                   // проспект: высокий столб, консоль над дорогой
      B(0.26, 7.0, 0.26, GREY, 0, 3.2, 0);
      B(2.2, 0.22, 0.22, GREY, 1.0, 6.6, 0);
      Lit(0.9, 0.16, 0.5, 1.9, 6.45, 0);
      head = [1.9, 0]; break;
    case 'ball':                                    // шар-плафон на макушке
      B(0.42, 0.7, 0.42, DARK, 0, 0.35, 0);
      B(0.18, 4.4, 0.18, DARK, 0, 2.6, 0);
      B(0.36, 0.14, 0.36, DARK, 0, 4.82, 0);
      Ball(0.42, 0, 5.25, 0);
      head = [0.8, 0]; break;
    case 'twin':                                    // два шара на перекладине
      B(0.42, 0.7, 0.42, DARK, 0, 0.35, 0);
      B(0.18, 4.5, 0.18, DARK, 0, 2.6, 0);
      B(0.16, 0.14, 1.7, DARK, 0, 4.7, 0);
      Ball(0.34, 0, 5.05, 0.78); Ball(0.34, 0, 5.05, -0.78);
      head = [0.8, 0]; break;
    case 'wood':                                    // частный сектор: деревянный столб, маленький плафон
    case 'woodball':
      B(0.26, 6.6, 0.26, WOOD, 0, 3.0, 0);
      B(1.5, 0.12, 0.12, GREY, 0.7, 5.9, 0, 0.18);
      if (style === 'wood') Lit(0.5, 0.13, 0.3, 1.45, 5.95, 0);
      else { B(0.04, 0.3, 0.04, GREY, 1.4, 5.92, 0); Ball(0.24, 1.4, 5.62, 0, WARM); }
      head = [1.4, 0]; break;
    case 'park':                                    // аллея: тонкий столбик и шар (как было в world.js)
      B(0.34, 0.5, 0.34, '#2f3338', 0, 0.2, 0);
      B(0.14, 3.9, 0.14, DARK, 0, 2.2, 0);
      B(0.5, 0.12, 0.5, '#2f3338', 0, 4.2, 0);
      Ball(0.3, 0, 4.5, 0);
      break;
    case 'yard':                                    // фонарь над парковкой пиццерии
      B(0.22, 5.5, 0.22, GREY, 0, 2.75, 0);
      B(1.0, 0.12, 0.12, GREY, 0.45, 5.5, 0);
      Lit(0.5, 0.2, 0.7, 0.8, 5.4, 0);
      head = [0.8, 0]; break;
    case 'mast':                                    // мачта катка
      B(0.3, 9, 0.3, GREY, 0, 4.5, 0);
      Lit(0.6, 0.3, 1.2, 0.35, 8.8, 0);
      head = [0.35, 0]; break;
  }
  return { P, head };
}

/* поставить фонарь. o: { x, z, style, dx, dz — куда смотрит консоль (к дороге),
   y — низ столба (по умолчанию земля), spot — [x, z] пятна света (по умолчанию
   под плафоном), noSpot — без пятна } */
export function lamp (A, o) {
  if (!SCENE) SCENE = A.scene;
  const { x, z, style = 'cobra' } = o;
  const l = Math.hypot(o.dx || 0, o.dz || 0);
  const dx = l ? o.dx / l : 1, dz = l ? o.dz / l : 0;
  const ry = Math.atan2(-dz, dx);                  // +X фонаря → (dx, dz)
  const y = o.y !== undefined ? o.y : A.groundH(x, z) + (A.curbAt ? A.curbAt(x, z) : 0);
  const rec = { x, z, y, ry, dx, dz, style, down: 0, heads: [], pools: [], it: null, lh: [], spot: null, LH: A.LAMPH };   // lh — номера плафонов в LAMPH до склейки (unlamp)
  const { P, head } = parts(style);
  const L = [];
  for (const p of P) {
    if (p.glow) {
      const g = A.put(A.LAMPH, p.g, p.hex, x, y, z, 0, ry, 0);
      rec.lh.push(A.LAMPH.length - 1);
      g.userData.track = (m, v0, nv) => rec.heads.push([m, v0, nv]);
    } else A.put(L, p.g, p.hex, x, y, z, 0, ry, 0);
  }
  const it = A.smashAdd('lamp', x, z, LAMP.R, L, style === 'wood' || style === 'woodball' ? WOOD : GREY);
  rec.it = it;
  it.slow = LAMP.SLOW;
  it.onDown = (_, nx, nz, force) => knock(rec, nx, nz, force);
  if (!o.noSpot) {
    const s = o.spot ? [o.spot[0], o.spot[1]] : [x + dx * head[0], z + dz * head[0]];
    s.track = (m, v0, nv) => rec.pools.push([m, v0, nv]);
    A.LAMP_SPOTS.push(s);
    rec.spot = s;
  }
  LAMPS.push(rec);
  return rec;
}

/* убрать фонарь до склейки (правки редактора, editlayer.js): из списка фонарей; → { lh — номера его плафонов
   в LAMPH, spot — его пятно в LAMP_SPOTS } — их вынимает вызывающий. Столб (сбиваемое) вынимает он же */
export function unlamp (it) {
  const i = LAMPS.findIndex(r => r.it === it);
  if (i < 0) return null;
  const rec = LAMPS[i];
  LAMPS.splice(i, 1);
  return { lh: rec.lh, spot: rec.spot, LH: rec.LH };
}

/* редактор города (editlayer.js hideNow): плафон и пятно света убранного фонаря — под землю и назад
   (столб прячет сам редактор). on — спрятать */
export function edHide (it, on) {
  const rec = LAMPS.find(r => r.it === it);
  if (!rec) return;
  for (const h of [...rec.heads, ...rec.pools]) {
    const [m, v0, nv] = h, pos = m.geometry.attributes.position, a = pos.array;
    if (!a) continue;
    if (on) { if (!h.orig) h.orig = a.slice(v0 * 3, (v0 + nv) * 3); for (let v = v0; v < v0 + nv; v++) a[v * 3 + 1] = -60; }
    else if (h.orig) { a.set(h.orig, v0 * 3); h.orig = null; }
    pos.needsUpdate = true;
  }
}

/* вершины куска склейки — под землю (как знаки в roadlife.js) */
function hide ([m, v0, nv]) {
  const pos = m.geometry.attributes.position, a = pos.array;
  for (let v = v0; v < v0 + nv; v++) a[v * 3 + 1] = -60;
  pos.needsUpdate = true;
}

const MATS = new Map();
const mat = (hex, glow) => {
  const k = hex + (glow ? 'g' : '');
  if (!MATS.has(k)) MATS.set(k, glow ? new THREE.MeshBasicMaterial({ color: hex }) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  return MATS.get(k);
};
const AX = new THREE.Vector3();

/* снесли: плафон гаснет, пятно пропадает, целый фонарь валится по ходу удара */
function knock (rec, nx, nz) {
  if (rec.down) return;
  rec.down = 1;
  STATS.down++;
  rec.heads.forEach(hide);
  rec.pools.forEach(hide);
  if (!SCENE) return;
  const pivot = new THREE.Group(), inner = new THREE.Group();
  pivot.position.set(rec.x, rec.y, rec.z);
  inner.rotation.y = rec.ry;
  for (const p of parts(rec.style).P) inner.add(new THREE.Mesh(p.g, p.glow ? mat('#c9c2a8', 1) : mat(p.hex)));   // плафон уже не горит
  pivot.add(inner);
  SCENE.add(pivot);
  const l = Math.hypot(nx, nz) || 1;
  // ось — поперёк удара: верх уходит туда, куда толкнули
  const ax = new THREE.Vector3(nz / l, 0, -nx / l);
  FALL.push({ pivot, ax, a: 0, w: 0.6, life: LAMP.LIE, y0: rec.y });
  while (FALL.length > LAMP.FALL_CAP) drop(0);
}

function drop (i) {
  const f = FALL[i];
  f.pivot.parent && f.pivot.parent.remove(f.pivot);
  f.pivot.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  FALL.splice(i, 1);
}

const MAX_A = 1.5;                                  // лёг: почти плашмя, плафон в асфальт
export function step (dt) {
  for (let i = FALL.length - 1; i >= 0; i--) {
    const f = FALL[i];
    if (f.a < MAX_A || f.w) {
      f.w += (1.5 + 10 * Math.sin(f.a)) * dt;       // как палка: чем ниже, тем быстрее
      f.a += f.w * dt;
      if (f.a >= MAX_A) { f.a = MAX_A; f.w = f.w > 1.5 ? -f.w * 0.22 : 0; }   // стукнулся — чуть подпрыгнул
      f.pivot.quaternion.setFromAxisAngle(AX.copy(f.ax), f.a);
    }
    f.life -= dt;
    if (f.life < 3) f.pivot.position.y = f.y0 - (3 - f.life) * 0.4;
    if (f.life <= 0) drop(i);
  }
}

/* ── вдоль улиц ── */
const CELL = 60;
function poorCells (CITY) {
  const cells = new Map();
  for (const b of CITY.buildings || []) {
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    const k = b.k === 'gar' ? 'g' : b.k === 'ind' ? 'i' : b.k === 'priv' || b.st === 'priv' ? 'p' : 'n';
    const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL);
    let c = cells.get(key);
    if (!c) cells.set(key, c = { p: 0, n: 0, g: 0, i: 0 });
    c[k]++;
  }
  // частный сектор — где в клетке и восьми соседних частных домов больше, чем любых
  // других: дома стоят вдоль улиц, и в клетке самой улицы их может не оказаться
  const out = new Set();
  for (const key of cells.keys()) {
    const [i, j] = key.split(',').map(Number);
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++) {
        const k2 = a + ',' + b;
        if (out.has(k2)) continue;
        const t = { p: 0, n: 0, g: 0, i: 0 };
        for (let u = a - 1; u <= a + 1; u++)
          for (let w = b - 1; w <= b + 1; w++) { const c = cells.get(u + ',' + w); if (c) { t.p += c.p; t.n += c.n; t.g += c.g; t.i += c.i; } }
        if (t.p >= 3 && t.p >= t.n && t.p >= t.g && t.p >= t.i) out.add(k2);
      }
  }
  return (x, z) => out.has(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
}

const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* A: CITY, roadWidth, nearestRoad, inHouse, introClear, ZEBRAS + то, что нужно lamp() */
export function streets (A) {
  const cells = poorCells(A.CITY), sector = A.MAP && A.MAP.privSector;
  const poor = sector ? (x, z) => sector(x, z) || cells(x, z) : cells;   // район частного сектора из карты + клетки с частными домами
  const zebra = (px, pz) => A.ZEBRAS.some(q => Math.abs(q.x - px) < 6 && Math.abs(q.z - pz) < 6);
  A.CITY.roads.forEach((r, ri) => {
    if (r.b || r.x) return;                        // на мосту свои перила, фонарям там не место
    const big = r.c <= 3, small = r.c === 4;
    if (!big && !small) return;
    // Столб — на внешнем краю тротуара, консоль — над дорогой. У разделённого
    // проспекта тротуар одной половины — это асфальт другой, поэтому столб,
    // попавший на чужое полотно или в дом, не ставим.
    const hr = hash(ri);
    const style = big ? (r.c <= 2 || hr < 0.45 ? 'cobra' : hr < 0.75 ? 'ball' : 'twin') : hr < 0.5 ? 'wood' : 'woodball';
    const w = A.roadWidth(r) / 2 + (big ? 2.4 : 1.7);
    const step = big ? LAMP.STEP : LAMP.STEP_PRIV;
    const p = r.p;
    let acc = big ? 20 : 12, side = big ? 1 : hr < 0.25 || (hr > 0.5 && hr < 0.75) ? 1 : -1;
    for (let i = 1; i < p.length; i++) {
      const x1 = p[i - 1][0], z1 = p[i - 1][1], x2 = p[i][0], z2 = p[i][1];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1;
      const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      for (let d = 0; d < len; d += 1) {
        acc += 1;
        if (acc < step) continue;
        acc = 0;
        if (big) side = -side;                     // большие — через раз по сторонам, частный сектор — по одной
        const nx = -uz * side, nz = ux * side;     // от осевой к тротуару
        const cx = x1 + ux * d, cz = z1 + uz * d;
        if (small && !poor(cx, cz)) continue;      // улочки 4 класса — только в частном секторе
        const px = cx + nx * w, pz = cz + nz * w;
        const near = A.nearestRoad(px, pz, 7, 1);
        if (near && near.d < near.seg.w / 2 + (big ? 1.2 : 0.9)) { if (small) STATS.skip.road++; continue; }
        if (A.inHouse(px, pz, 1) || A.introClear(px, pz, 9)) { if (small) STATS.skip.house++; continue; }
        if (A.startClear && A.startClear(px, pz)) { STATS.skip.start = (STATS.skip.start || 0) + 1; continue; }   // выезд со стоянки курьеров свободен (game.js START_CLEAR)
        if (zebra(px, pz)) { if (small) STATS.skip.zebra++; continue; }
        lamp(A, { x: px, z: pz, y: A.groundH(px, pz), style, dx: -nx, dz: -nz });
        if (big) {
          STATS.city++;
          if (style !== 'cobra') STATS[style]++;
          if (poor(px, pz)) STATS.poorOld++;     // такие стояли в частном секторе и раньше
        } else STATS.priv++;
      }
    }
  });
}

export const DEBUG = { LAMPS, FALL, STATS, LAMP };
