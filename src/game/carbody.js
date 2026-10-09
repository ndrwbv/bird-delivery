/* ──────────────────────────────────────────────────────────────────────────
   Кузов не из кубиков (09.10.2026, группа Ж6 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Кузов: швы, диски, номера».

   Всё — у всех машин: своей, гаража (витрина) и потока (makeCar в game.js).
   • Силуэт: углы кузова, порогов и бамперов срезаны скосом (бампер «обнимает»
     угол), у капота, крышки багажника и крыши скруглены верхние рёбра; арки
     колёс — полукруглые: тёмная щель над шиной и кромка цвета кузова (у
     джипов и кроссоверов — широкий чёрный пластик). У машин потока салон —
     трапеция: лобовое и заднее стекло наклонные, стойки наклонные, крыша уже
     низа; боковые стёкла — по форме салона, со средней стойкой.
   • Мелочь: на дверях — шов между передней и задней дверью, ручки, молдинг;
     номера спереди и сзади (белая табличка в рамке, «буквы» пикселями) —
     на бампере: мнутся и отваливаются вместе с ним; диски колёс трёх видов —
     колпак (старые седаны), штамповка с дырками (Нива, Буханка, Патриот,
     «пятёрки» потока), литьё со спицами (остальные) — крутятся с колесом;
     у машин потока — зеркала, лючок бензобака, решётка с рёбрами.
   Кадр: ни одной новой отрисовки — всё в той же склейке кузова (цвет по
   вершинам) или в меше панели (двери, бамперы — dressPanel из carrear.js).
   Мелочь — плоскими квадратами, где можно (4 вершины вместо 24).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* скосы (м): CORNER — углы кузова в плане, SILL — порогов, BUMPER — бамперов, HOOD — передние углы капота,
   LID — верхние рёбра капота / крышки, ROOF — рёбра крыши; ARCH — щель над шиной, LIP — кромка арки, FLARE — пластик джипа */
export const BODY = { CORNER: 0.09, SILL: 0.12, BUMPER: 0.11, HOOD: 0.12, LID: 0.04, ROOF: 0.06, ARCH: 0.045, LIP: 0.06, FLARE: 0.1, SEG: 0.3 };
/* наклон салона у машин потока: f / b — на сколько метров верх лобового / заднего стекла ближе к середине, чем низ;
   TUCK — на сколько крыша уже низа салона с каждой стороны */
export const RAKE = { sedan: { f: 0.5, b: 0.44 }, coupe: { f: 0.55, b: 0.5 }, hatch: { f: 0.5, b: 0.16 }, smart: { f: 0.4, b: 0.1 },
  suv: { f: 0.42, b: 0.12 }, cn: { f: 0.5, b: 0.18 }, TUCK: 0.06 };
/* диски по кузову потока; у машин гаража — LOOK.wheel (cars.js) */
export const WHEEL_BY_MODEL = { sedan: 'cap', coupe: 'alloy', hatch: 'steel', smart: 'alloy', suv: 'alloy', cn: 'alloy' };
export const STATS = { built: 0 };

const SEAM = '#1a191e', TIRE = '#221c19', CHROME = '#c9ccd1';

/* ─── коробка со скосами ───
   o.c — скос вертикальных углов (в плане), o.t — скос верхних рёбер, o.ends: 1 — только спереди (+Z), −1 — только сзади;
   o.dense — частая сетка (своя машина: есть что мять, cardent.js). Остаётся BoxGeometry (parameters те же): dentCar
   узнаёт бампер по глубине, tess (cardent.js) видит сегменты и не трогает. */
export function bevBox (w, h, d, o = {}) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const c = Math.min(o.c || 0, hx * 0.8, hz * 0.8), t = Math.min(o.t || 0, hy * 0.8);
  const cx = c || Math.min(t, hx * 0.8), cz = c || Math.min(t, hz * 0.8);
  const nd = v => (v < 0.35 ? 1 : Math.min(16, Math.max(2, Math.round(v / BODY.SEG))));
  const n = (v, cut) => (cut > 0 ? (o.dense ? Math.max(3, nd(v)) : 3) : (o.dense ? nd(v) : 1));
  const geo = new THREE.BoxGeometry(w, h, d, n(w, cx), n(h, t), n(d, cz));
  if (!(c > 0) && !(t > 0)) return geo;
  // сетку раздвигаем так, чтобы предпоследняя линия легла ровно туда, где начинается скос
  const nx = geo.parameters.widthSegments, ny = geo.parameters.heightSegments, nz = geo.parameters.depthSegments;
  const remap = (v, half, cut, segs) => {
    if (!(cut > 0) || segs < 3) return v;
    const u = v / half, a = 1 - 2 / segs, b = 1 - cut / half, au = Math.abs(u);
    return Math.sign(u) * (au <= a ? au * b / a : b + (au - a) * (1 - b) / (1 - a)) * half;
  };
  const A = geo.attributes.position.array;
  for (let i = 0; i < A.length; i += 3) {
    let x = remap(A[i], hx, cx, nx), y = remap(A[i + 1], hy, t, ny), z = remap(A[i + 2], hz, cz, nz);
    const sx = Math.sign(x) || 1, sz = Math.sign(z) || 1, endOk = !o.ends || sz === o.ends;
    // скос угла в плане: точку за линией скоса — на неё
    if (c > 0 && endOk) {
      const ex = Math.abs(x) - (hx - c), ez = Math.abs(z) - (hz - c);
      if (ex > 0 && ez > 0) { const s = (ex / c + ez / c - 1) / (2 / c); if (s > 0) { x -= sx * s; z -= sz * s; } }
    }
    // скос верхних рёбер: по бокам, потом спереди и сзади
    if (t > 0) {
      let ex = Math.abs(x) - (hx - cx), ey = y - (hy - t);
      if (ex > 0 && ey > 0) { const s = (ex / cx + ey / t - 1) / (1 / cx + 1 / t); if (s > 0) { x -= sx * s; y -= s; } }
      const ez = Math.abs(z) - (hz - cz); ey = y - (hy - t);
      if (endOk && ez > 0 && ey > 0) { const s = (ez / cz + ey / t - 1) / (1 / cz + 1 / t); if (s > 0) { z -= sz * s; y -= s; } }
    }
    A[i] = x; A[i + 1] = y; A[i + 2] = z;
  }
  // нормали не пересчитываем: материалы машин — flatShading, нормаль грани берётся из производных
  return geo;
}

/* ─── своя геометрия из треугольников: порядок обхода — по нужной нормали (лицом наружу) ─── */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
function Tris () {
  const pos = [], idx = [];
  // квадрат A B C D — 4 вершины, обход по нужной нормали (nx, ny, nz)
  const quad = (A, B, C, D, nx, ny, nz) => {
    _a.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]); _b.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    _n.crossVectors(_a, _b);
    const o = pos.length / 3;
    pos.push(...A, ...B, ...C, ...D);
    if (_n.x * nx + _n.y * ny + _n.z * nz < 0) idx.push(o, o + 2, o + 1, o, o + 3, o + 2); else idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeVertexNormals();
    return g;
  };
  return { quad, geo, empty: () => !pos.length };
}

/* плоский квадрат лицом в сторону face: '+x' | '-x' | '+z' | '-z' | '+y' */
export function quad (w, h, face) {
  const g = new THREE.PlaneGeometry(w, h);
  if (face === '+x') g.rotateY(Math.PI / 2);
  else if (face === '-x') g.rotateY(-Math.PI / 2);
  else if (face === '-z') g.rotateY(Math.PI);
  else if (face === '+y') g.rotateX(-Math.PI / 2);
  return g;
}

/* ─── арки колёс: полукольца над шиной в плоскости колеса (z, y), выпуклые наружу по x ───
   k: S (spec), W, dy, y0, hex (кузов), flare (цвет пластика или null) */
export function arches (add, k) {
  const { S, W, dy } = k;
  const yBot = k.y0 - S.h / 2 - 0.08 + dy;               // низ порога — ниже арку не тянем
  for (const zc of [S.fz, S.bz]) {
    const ay = S.r;                                     // ось колеса (колёса не поднимаются вместе с кузовом)
    const fl = !!k.flare;
    const rings = [
      { r0: S.r + 0.01, r1: S.r + 0.01 + BODY.ARCH, x0: W / 2, x1: W / 2 + 0.075, hex: '#141217' },          // щель над шиной — только лицо
      { r0: S.r + 0.01 + BODY.ARCH, r1: S.r + 0.01 + BODY.ARCH + (fl ? BODY.FLARE : BODY.LIP), x0: W / 2 - 0.02, x1: W / 2 + (fl ? 0.13 : 0.09), hex: fl ? k.flare : k.hex, edge: true },
    ];
    for (const q of rings) {
      const T = Tris();
      const a0 = Math.asin(Math.max(-0.6, Math.min(0.6, (yBot - ay) / q.r1))), a1 = Math.PI - a0, n = 7;
      for (const s of [-1, 1]) {
        const X0 = s * q.x0, X1 = s * q.x1;
        const P = (r, a, x) => [x, ay + r * Math.sin(a), zc + r * Math.cos(a)];
        for (let i = 0; i < n; i++) {
          const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n, tm = (t0 + t1) / 2;
          T.quad(P(q.r0, t0, X1), P(q.r1, t0, X1), P(q.r1, t1, X1), P(q.r0, t1, X1), s, 0, 0);                       // лицо
          if (q.edge) T.quad(P(q.r1, t0, X0), P(q.r1, t0, X1), P(q.r1, t1, X1), P(q.r1, t1, X0), 0, Math.sin(tm), Math.cos(tm));   // наружная кромка
        }
        if (q.edge) for (const [a, sg] of [[a0, -1], [a1, 1]])                                                         // торцы
          T.quad(P(q.r0, a, X0), P(q.r1, a, X0), P(q.r1, a, X1), P(q.r0, a, X1), 0, sg * Math.cos(a), -sg * Math.sin(a));
      }
      add(T.geo(), q.hex, 0, -dy, 0);                   // add поднимает склейку на dy — здесь уже мировая высота
    }
  }
}

/* ─── колесо: шина и диск одним мешем (крутится целиком). s — сторона (наружу: +1 → +x) ─── */
export function wheel (parts, put, r, s, style) {
  const disc = (rad, seg, hex, x) => put(parts, new THREE.CircleGeometry(rad, seg).rotateY(s * Math.PI / 2), hex, x, 0, 0);
  const f = s * 0.152;
  put(parts, new THREE.CylinderGeometry(r, r, 0.3, 12, 1, true), TIRE, 0, 0, 0, 0, 0, Math.PI / 2);   // протектор (боковина изнутри не видна)
  disc(r, 12, TIRE, s * 0.15);
  if (style === 'steel') {
    // штамповка: тёмно-серый диск, дырки по кругу, колпачок ступицы
    disc(r * 0.62, 10, '#5a5e65', f);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3;
      put(parts, quad(0.06, 0.06, s > 0 ? '+x' : '-x'), '#1b1a1f', f + s * 0.003, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
    }
    disc(r * 0.17, 6, '#8d9299', f + s * 0.005);
  } else if (style === 'cap') {
    // колпак: хромированный диск, тёмное кольцо, прорези, блестящая середина
    disc(r * 0.62, 12, CHROME, f);
    disc(r * 0.46, 12, '#8e939a', f + s * 0.002);
    disc(r * 0.4, 12, '#d8dbdf', f + s * 0.004);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      put(parts, quad(0.05, 0.022, s > 0 ? '+x' : '-x').rotateX(a), '#2a292e', f + s * 0.006, Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
    }
  } else {
    // литьё: светлый обод, тёмное поле, пять спиц, колпачок
    disc(r * 0.66, 12, '#b9bec5', f);
    disc(r * 0.56, 12, '#232328', f + s * 0.002);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      put(parts, quad(0.075, r * 0.5, s > 0 ? '+x' : '-x').rotateX(a), '#c7cbd1', f + s * 0.004, Math.cos(a) * r * 0.29, Math.sin(a) * r * 0.29);
    }
    disc(r * 0.13, 8, '#dfe2e6', f + s * 0.006);
  }
}

/* ─── номер на бампере: детали в осях бампера (центр, лицо — z = ±d/2). back — сзади ─── */
export function plateParts (d, back, o = {}) {
  const s = back ? -1 : 1, z = s * (d / 2) + (o.dz || 0), y = -0.005 + (o.dy || 0), face = back ? '-z' : '+z';
  const out = [];
  out.push([quad(0.53, 0.125, face), '#1b1a1f', 0, y, z + s * 0.008]);   // рамка
  out.push([quad(0.5, 0.105, face), '#ecebe4', 0, y, z + s * 0.012]);    // табличка
  // «буквы» пикселями: буква, три цифры, две буквы | регион; сзади ряд зеркальный (смотрим с другой стороны)
  const X = x => x * (back ? -1 : 1);
  const zz = z + s * 0.015;
  [[-0.19, 0.045], [-0.135, 0.06], [-0.085, 0.06], [-0.035, 0.06], [0.02, 0.045], [0.07, 0.045]].forEach(([x, h]) =>
    out.push([quad(0.032, h, face), '#24232a', X(x), y - (0.06 - h) / 2 + 0.002, zz]));
  out.push([quad(0.006, 0.09, face), '#24232a', X(0.115), y, zz]);
  out.push([quad(0.028, 0.04, face), '#24232a', X(0.15), y + 0.015, zz]);
  out.push([quad(0.028, 0.04, face), '#24232a', X(0.19), y + 0.015, zz]);
  out.push([quad(0.05, 0.012, face), '#d8262e', X(0.17), y - 0.03, zz]);                   // флажок
  return out;
}

/* ─── дверь (панель): шов между дверями, ручки, молдинг. Детали в осях двери (коробка 0,1 × h × len) ─── */
export function doorParts (s, h, len, o = {}) {
  const out = [], xf = s * 0.05, hh = h / 2;
  const split = o.four ? len * 0.06 : null;              // шов чуть впереди середины
  if (split !== null) out.push([quad(0.014, h - 0.02, s > 0 ? '+x' : '-x'), SEAM, xf + s * 0.001, 0, split]);
  // ручки — у заднего края каждой двери, под окном
  const hz = split !== null ? [split + 0.2, -len / 2 + 0.2] : [-len / 2 + 0.24];
  for (const z of hz) {
    out.push([new THREE.BoxGeometry(0.024, 0.034, 0.15), o.handle || '#2b2a30', xf + s * 0.012, hh - 0.09, z]);
    out.push([quad(0.17, 0.05, s > 0 ? '+x' : '-x'), '#141317', xf + s * 0.0015, hh - 0.09, z]);   // тень-углубление под ручкой
  }
  if (o.molding) out.push([quad(len - 0.06, 0.045, s > 0 ? '+x' : '-x'), o.molding, xf + s * 0.002, -hh * 0.2, 0]);
  return out;
}

/* ─── салон машины потока: трапеция с наклонными стойками, стёкла по форме ───
   k: S, W, top, frame, GLASS, rake {f, b}, four (средняя стойка). Вернёт { roofZ, roofLen, roofW, front, back } —
   front/back: { geo, x, y, z } — лобовое и заднее стекло отдельными мешами (мутнеют, dentCar) */
export function cabin (add, k) {
  const { S, W, top, frame, GLASS } = k;
  const cf = S.cz + S.cab / 2, cb = S.cz - S.cab / 2;
  const yb = top - 0.02, yt = top + S.ch, H = yt - yb;
  const rf = Math.min(k.rake.f, S.cab * 0.4), rb = Math.min(k.rake.b, S.cab * 0.3);
  const hb = (W - 0.12) / 2, ht = hb - (k.tuck !== undefined ? k.tuck : RAKE.TUCK);
  const half = y => hb + (ht - hb) * (y - yb) / H;
  const zF = y => cf - rf * (y - yb) / H, zB = y => cb + rb * (y - yb) / H;
  // коробка салона: 8 вершин
  const T = Tris();
  const P = (sx, y, front) => [sx * half(y), y, front ? zF(y) : zB(y)];
  for (const s of [-1, 1]) T.quad(P(s, yb, 1), P(s, yt, 1), P(s, yt, 0), P(s, yb, 0), s, (hb - ht) / H, 0);   // бока
  T.quad(P(-1, yb, 1), P(1, yb, 1), P(1, yt, 1), P(-1, yt, 1), 0, rf, H);                                      // под лобовым
  T.quad(P(-1, yb, 0), P(1, yb, 0), P(1, yt, 0), P(-1, yt, 0), 0, rb, -H);                                     // под задним
  T.quad(P(-1, yt, 1), P(1, yt, 1), P(1, yt, 0), P(-1, yt, 0), 0, 1, 0);                                      // потолок
  add(T.geo(), frame, 0, 0, 0);
  // боковые стёкла: по форме салона, отступ — стойки; средняя стойка у четырёхдверных
  const g0 = Math.max(top + 0.17, k.doorTop + 0.02), g1 = yt - 0.07, ins = 0.09, off = 0.007;
  const G = Tris(), Bp = Tris();
  for (const s of [-1, 1]) {
    const Q = (y, front, dz = 0) => [s * (half(y) + off), y, (front ? zF(y) - ins : zB(y) + ins) + dz];
    G.quad(Q(g0, 1), Q(g1, 1), Q(g1, 0), Q(g0, 0), s, (hb - ht) / H, 0);
    if (k.four) {
      const zm = S.cz + S.cab * 0.06, w = 0.045;
      const R = (y, dz) => [s * (half(y) + off * 2), y, zm + dz];
      Bp.quad(R(g0 - 0.01, -w), R(g0 - 0.01, w), R(g1 + 0.01, w), R(g1 + 0.01, -w), s, (hb - ht) / H, 0);
    }
  }
  add(G.geo(), GLASS, 0, 0, 0);
  if (!Bp.empty()) add(Bp.geo(), frame, 0, 0, 0);
  // лобовое и заднее: квадрат на наклоне, чуть наружу
  const pane = (front) => {
    const r = front ? rf : rb, len = Math.hypot(r, H), nz = (front ? H : -H) / len, ny = r / len;
    const u0 = front ? 0.16 : 0.12, u1 = 0.9;
    const y0 = yb + H * u0, y1 = yb + H * u1, z0 = front ? zF(y0) : zB(y0), z1 = front ? zF(y1) : zB(y1);
    const w0 = half(y0) - 0.07, w1 = half(y1) - 0.07, o = 0.008;
    const E = Tris();
    E.quad([-w0, y0 + ny * o, z0 + nz * o], [w0, y0 + ny * o, z0 + nz * o], [w1, y1 + ny * o, z1 + nz * o], [-w1, y1 + ny * o, z1 + nz * o], 0, ny, nz);
    return E.geo();
  };
  return { roofZ: (zF(yt) + zB(yt)) / 2, roofLen: zF(yt) - zB(yt), roofW: 2 * ht, front: pane(true), back: pane(false), cf, rf };
}

/* ─── мелочь потока в склейку кузова: зеркала, лючок бензобака, рёбра решётки ───
   k: S, W, top, y0, hl, cf, bodyHex, shade, grille (рёбра — у безликих моделей) */
export function trim (add, k) {
  const { S, W, top, hl } = k;
  STATS.built++;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.1), y = top + 0.19, z = k.cf - 0.14;
    add(new THREE.BoxGeometry(0.06, 0.1, 0.15), k.bodyHex, x, y, z);
    add(quad(0.07, 0.075, '-z'), '#7f97ad', x, y, z - 0.077);
  }
  // лючок бензобака — справа сзади (−X)
  add(quad(0.13, 0.13, '-x'), SEAM, -(W / 2) - 0.002, top - 0.12, S.bz + 0.42);
  add(quad(0.11, 0.11, '-x'), k.shade, -(W / 2) - 0.004, top - 0.12, S.bz + 0.42);
  if (k.grille) {
    const gw = W * 0.6 - 0.04;
    for (const oy of [-0.06, 0, 0.06]) add(quad(gw, 0.022, '+z'), '#58535e', 0, top - 0.08 + oy, hl + 0.032);
    add(quad(0.1, 0.06, '+z'), CHROME, 0, top - 0.08, hl + 0.034);   // значок
  }
}
