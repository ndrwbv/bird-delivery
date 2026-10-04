/* ──────────────────────────────────────────────────────────────────────────
   Пустыри с назначением, тропинки и лужи (трек «Наполнение мира», шаги 3 и 5;
   правила словами — docs/CAREER.md «Пустыри: у каждого своё назначение»
   и «Тропинки, вытоптанное и лужи»).

   Шаг 5. Большие пустыри у улиц — тем же отбором, что стройки
   (construction.js freeLots: не дом, не дорога, не парк, ровно, от подъездов
   не ближе 22 м), сперва большие участки BIG, потом малые SMALL; занятые
   участки (стройки, точки конкурентов, костры) обходятся, свои занимаются
   (claim). Назначение — по месту и площади, жребий от координат:
     • огород — если сзади или сбоку дом («под окнами»): грядки, парнички из
       плёнки, сарайчик, ванна-бочка, пугало, забор из чего попало (сетка,
       шифер, старые двери, штакетник); днём — огородница;
     • стихийная парковка — у гаражей и на окраине квартала: битые ржавые
       машины без колёс на кирпичах (капот открыт, двери нет, горелая),
       покрышки, табличка «Продам. Торг», ноги из-под машины;
     • свалка плит и песка — бетонные плиты стопками, кольца колодцев, кучи
       песка и щебня, арматура;
     • футбольная коробка — в плотном квартале: площадка (асфальт или земля),
       ворота, бортики, сетки за воротами; днём играют (футбол game.js);
     • собачья площадка — сетка-рабица, барьеры, горка, кольцо, слалом,
       бревно; днём собачники и собаки;
     • ларьки — малые участки у остановок: шаурма, овощи, цветы, ремонт
       обуви, пресса, пиво (в детской — квас), столики, урна; днём покупатели.
   Сбивается то, что логично: заборы, парнички, столики, бочки, кучи песка,
   снаряды — как дворовая мелочь (smashAdd); машины-развалюхи, плиты,
   кольца, сарайчики, ларьки — стены (obb).

   Шаг 3. Тропинки наискосок (trails, после дворов): от подъездов — к
   остановкам, ларькам, гаражам, коробкам и к соседним домам, если путь не
   через дом, дорогу, воду и стену; полосы голой земли поверх газона
   по рельефу (LITM, как дорожки дворов). Вытоптано у лавочек, у ворот
   коробок, у ларьков. Лужи — на тропинках, у лавочек и на пустырях: три
   яруса, сколько видно — по сезону (весна и осень — больше, зимой —
   нет, в жару — почти нет) и после дождя.

   Перф: всё стоящее — в склейках (LIT, LITM, smashAdd), лужи — 3 меша на
   город, вывески — 1 меш; люди и собаки — только у 3 ближних пустырей
   ближе NPC_R днём.

   Из game.js: build(api) — при сборке города (после строек, конкурентов и
   костров), trails() — после дворов и лавочек, step(dt) — каждый кадр.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as CONSTR from './construction.js';
import * as HITS from './hits.js';
import * as SEAS from './seasons.js';
import * as WTH from './weather.js';
import { onPave } from './pave.js';

export const WASTE = {
  BIG: { W: 36, D: 26, MAX: 46, GAP: 140, PER: 3, CAP: 9, SALT: 51 },     // большой участок, м; сколько; не ближе друг к другу
  SMALL: { W: 22, D: 15, MAX: 40, GAP: 120, PER: 3, CAP: 8, SALT: 61 },   // малый
  QUOTA: 0.13,                                     // штраф за каждое уже выданное то же назначение (разнообразие)
  NPC_R: 150, NPC_DROP: 210, NPC_LOTS: 3,          // люди и собаки: ближе стольких м, не больше стольких пустырей разом
  DOG_SP: [3.5, 6.5],                              // м/с — бег собаки
};
export const TRAIL = { SHARE: 0.55, MIN: 16, MAX: 120, W: [0.9, 1.35], EDGE: 1.9, STEP: 2, BENCH: 0.75, MAX_N: 1400 };
export const PUD = { TIER: [0.12, 0.45, 0.75], R: [0.55, 1.5], TRAIL: 0.4, BENCH: 0.2 };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

let A = null;
const LOTS = [];
const STATS = { lots: 0, kinds: {}, trails: 0, trailM: 0, spots: 0, puddles: [0, 0, 0], smash: 0, solids: 0, npcLive: 0, dogs: 0, people: 0, hitDogs: 0, ms: 0, trailMs: 0, tried: 0 };
const PUDS = [[], [], []];                         // лужи по ярусам: [x, z, r, seed]
const SPOTS = [];                                   // вытоптанные пятна: { x, z, r } — для луж

/* ═════════════ вывески: атлас ═════════════ */
const SIGNS = [
  { k: 'shaw', t: N_('ШАУРМА'), bg: '#c8322a', fg: '#fff3c4' },
  { k: 'veg', t: N_('ОВОЩИ-ФРУКТЫ'), bg: '#3f8a3a', fg: '#ffffff' },
  { k: 'flow', t: N_('ЦВЕТЫ 24 ЧАСА'), bg: '#efe8da', fg: '#b8266a' },
  { k: 'shoe', t: N_('РЕМОНТ ОБУВИ · КЛЮЧИ'), bg: '#2f4f8a', fg: '#ffffff' },
  { k: 'press', t: N_('ПРЕССА · ЛОТО'), bg: '#f2c23a', fg: '#1d1d1b' },
  { k: 'beer', t: N_('ПИВО · РАКИ'), kid: N_('КВАС'), bg: '#6a3a1a', fg: '#ffd27a' },
  { k: 'sale', t: N_('ПРОДАМ. ТОРГ'), bg: '#ece6d2', fg: '#2a2a2a' },
  { k: 'dogs', t: N_('ВЫГУЛ СОБАК'), bg: '#2f6e3a', fg: '#ffffff' },
];
const SW = 512, SH = 128, SCOLS = 4, SROWS = 2;
let SIGN_P = [], SIGN_UV = [], SIGN_I = [];
function signAtlas () {
  const c = document.createElement('canvas');
  c.width = SW * SCOLS; c.height = SH * SROWS;
  const x = c.getContext('2d');
  SIGNS.forEach((s, i) => {
    const ox = (i % SCOLS) * SW, oy = ((i / SCOLS) | 0) * SH;
    x.fillStyle = s.bg; x.fillRect(ox, oy, SW, SH);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 8; x.strokeRect(ox + 4, oy + 4, SW - 8, SH - 8);
    const txt = t(!A.ADULT && s.kid ? s.kid : s.t);
    let fs = 78;
    x.font = `900 ${fs}px Arial, "Helvetica Neue", sans-serif`;
    while (fs > 22 && x.measureText(txt).width > SW - 40) { fs -= 2; x.font = `900 ${fs}px Arial, "Helvetica Neue", sans-serif`; }
    x.fillStyle = s.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, ox + SW / 2, oy + SH / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
/* вывеска: прямоугольник w × h, центр (x, y, z), лицом туда, куда смотрит (fx, fz) */
function signQuad (k, x, y, z, fx, fz, w, h) {
  const i = SIGNS.findIndex(s => s.k === k);
  const rx = fz, rz = -fx;                          // правая рука того, кто смотрит на вывеску (против (fx, fz))
  const v0 = SIGN_P.length / 3, hw = w / 2, hh = h / 2;
  const ox = x + fx * 0.02, oz = z + fz * 0.02;
  SIGN_P.push(ox - rx * hw, y - hh, oz - rz * hw, ox + rx * hw, y - hh, oz + rz * hw, ox + rx * hw, y + hh, oz + rz * hw, ox - rx * hw, y + hh, oz - rz * hw);
  SIGN_I.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  const c = i % SCOLS, r = (i / SCOLS) | 0, e = 2;
  const u0 = (c * SW + e) / (SW * SCOLS), u1 = ((c + 1) * SW - e) / (SW * SCOLS), vv1 = 1 - (r * SH + e) / (SH * SROWS), vv0 = 1 - ((r + 1) * SH - e) / (SH * SROWS);
  SIGN_UV.push(u0, vv0, u1, vv0, u1, vv1, u0, vv1);
}

/* ═════════════ участок: свои оси ═════════════
   a — вдоль улицы (ux, uz), b — вглубь (nx, nz); передний край — b = −D/2 */
function frame (s) {
  const { x, z, ux, uz } = s, nx = -uz, nz = ux;
  const ry = Math.atan2(-uz, ux), oy = Math.atan2(uz, ux);
  const P = (a, b) => [x + ux * a + nx * b, z + uz * a + nz * b];
  const G = (a, b) => { const [px, pz] = P(a, b); return A.groundH(px, pz); };
  const geo = (w, h, d, rx, rz) => { const g = A.boxGeo(w, h, d); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); return g; };
  const c = {
    s, P, G, ry, oy, nx, nz,
    /* неподвижное — в склейку LIT; y — от земли в точке (a, b); r — поворот в осях участка */
    B (w, h, d, hex, a, y, b, r = 0, rx = 0, rz = 0) { const [px, pz] = P(a, b); A.put(A.LIT, geo(w, h, d, rx, rz), hex, px, A.groundH(px, pz) + y, pz, 0, ry + r, 0); },
    G3 (list, gg, hex, a, y, b, r = 0) { const [px, pz] = P(a, b); A.put(list, gg, hex, px, A.groundH(px, pz) + y, pz, 0, ry + r, 0); },
    /* то же — в список вещи, которая сбивается */
    Bg (list, w, h, d, hex, a, y, b, r = 0, rx = 0, rz = 0) { const [px, pz] = P(a, b); A.put(list, geo(w, h, d, rx, rz), hex, px, A.groundH(px, pz) + y, pz, 0, ry + r, 0); },
    smash (kind, a, b, r, list, hex) {
      const [px, pz] = P(a, b);
      if ((kind === 'fence' || kind === 'bigfence') && onPave(px, pz, 0.2)) return { kind, x: px, z: pz, down: 1 };   // заборы и снаряды — не на тротуар и дорожку (pave.js)
      STATS.smash++; return A.smashAdd(kind, px, pz, r, list, hex);
    },
    wall (a, b, hw, hd, r = 0) { const [px, pz] = P(a, b); STATS.solids++; A.obb(px, pz, hw, hd, oy - r); },
    /* земля участка: прямоугольник и пятно по рельефу (LITM) */
    rect (a0, b0, a1, b1, hex, lift = 0.05) {
      const [ax, az] = P(a0, b0), [bx, bz] = P(a1, b0), [cx, cz] = P(a1, b1), [dx, dz] = P(a0, b1);
      A.LITM.color(hex); A.LITM.dtri(ax, az, bx, bz, cx, cz, lift); A.LITM.dtri(ax, az, cx, cz, dx, dz, lift);
    },
    blob (a, b, ra, rb, hex, lift = 0.055, k = 0) { const [px, pz] = P(a, b); blobAt(px, pz, ra, rb, Math.atan2(uz, ux), hex, lift, k); },
  };
  return c;
}
/* пятно неровного края: n точек, радиус гуляет ±25 % */
function blobAt (x, z, ra, rb, ang, hex, lift, k = 0) {
  const n = 9, cs = Math.cos(ang), sn = Math.sin(ang), pts = [];
  for (let i = 0; i < n; i++) {
    const q = i / n * Math.PI * 2, j = 0.78 + hash(x, z, k + i) * 0.44;
    const la = Math.cos(q) * ra * j, lb = Math.sin(q) * rb * j;
    pts.push([x + la * cs - lb * sn, z + la * sn + lb * cs]);
  }
  A.LITM.color(hex);
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; A.LITM.dtri(x, z, q[0], q[1], p[0], p[1], lift); }
}

/* ═════════════ заборы из чего попало ═════════════
   секция L м между точками (a0, b0) — (a1, b1); вид — sort */
const DOOR = ['#7a4a2e', '#4f6fa8', '#e8e4dc', '#4f7a52', '#8a3b3b', '#c9a24a'];
function fenceSeg (c, a0, b0, a1, b1, sort, k) {
  const L = Math.hypot(a1 - a0, b1 - b0), am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
  { const [px, pz] = c.P(am, bm); if (onPave(px, pz, 0.2)) return; }   // на тротуар и дорожку секцию не ставим (pave.js)
  const r = -Math.atan2(b1 - b0, a1 - a0);           // вдоль отрезка в осях участка
  const ea = (a1 - a0) / L, eb = (b1 - b0) / L;
  const g = [];
  const at = (q, y, w, h, d, hex, rz = 0, off = 0) => c.Bg(g, w, h, d, hex, am + ea * q - eb * off, y, bm + eb * q + ea * off, r, 0, rz);
  let kind = 'fence', hex = '#9aa3a8';
  if (sort === 'net') {                              // сетка-рабица на трубах
    at(-L / 2, 0.8, 0.07, 1.6, 0.07, '#6e7377');
    for (const y of [0.15, 0.6, 1.05]) at(0, y, L, 0.035, 0.025, '#9aa3a8');      // сетка — проволокой, сквозь неё видно
    const nv = Math.max(2, Math.round(L / 0.5));
    for (let i = 1; i < nv; i++) at(-L / 2 + i * L / nv, 0.78, 0.025, 1.45, 0.025, '#9aa3a8');
    at(0, 1.55, L, 0.05, 0.05, '#6e7377');
  } else if (sort === 'slate') {                      // шифер
    kind = 'bigfence'; hex = '#9aa0a2';
    at(0, 0.9, L - 0.05, 1.7, 0.05, ['#9aa0a2', '#8d9496', '#a5a8a6'][k % 3]);
    for (const q of [-0.36, 0, 0.36]) at(q * L, 0.9, 0.1, 1.7, 0.08, '#7d8486');
    at(-L / 2, 0.95, 0.1, 1.9, 0.1, '#6b5a44', 0, 0.08);
  } else if (sort === 'door') {                       // старые двери стоймя
    kind = 'bigfence'; hex = DOOR[k % DOOR.length];
    const n = Math.max(1, Math.round(L / 1.0)), w = L / n;
    for (let i = 0; i < n; i++) {
      const q = -L / 2 + w * (i + 0.5), col = DOOR[(k + i * 3) % DOOR.length], tilt = (hash(a0 + i, b0, k) - 0.5) * 0.12;
      at(q, 1.0, w - 0.06, 2.0, 0.06, col, tilt);
      at(q + w * 0.3, 1.0, 0.07, 0.07, 0.1, '#2a2622', tilt);           // ручка
    }
  } else {                                            // штакетник
    hex = '#8a6b4e';
    at(0, 0.35, L, 0.08, 0.05, '#7a5a3e'); at(0, 1.0, L, 0.08, 0.05, '#7a5a3e');
    const n = Math.max(2, Math.round(L / 0.42));
    for (let i = 0; i < n; i++) at(-L / 2 + (i + 0.5) * L / n, 0.65, 0.1, 1.3 - (i % 2) * 0.08, 0.03, (k + i) % 7 ? '#a07a52' : '#c9b08a', 0, 0.04);
  }
  c.smash(kind, am, bm, 1.3, g, hex);
}
/* забор по прямоугольнику участка; ворота — gate м посередине переднего края; sorts — из чего */
function fenceRect (c, a0, b0, a1, b1, sorts, gate, salt) {
  const sides = [[a0, b0, a1, b0, true], [a1, b0, a1, b1], [a1, b1, a0, b1], [a0, b1, a0, b0]];
  let k = 0;
  for (const [x0, y0, x1, y1, front] of sides) {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / 2.5)), st = L / n;
    const ea = (x1 - x0) / L, eb = (y1 - y0) / L;
    for (let i = 0; i < n; i++) {
      const q0 = st * i, q1 = st * (i + 1), qm = (q0 + q1) / 2 - L / 2;
      if (front && Math.abs(qm) < gate / 2) continue;
      const h = hash(c.s.x + i, c.s.z + k, salt);
      // одна и та же «порода» тянется по 2—4 секции — как настоящий забор из того, что нашлось
      const sort = sorts[Math.floor(hash(c.s.x + Math.floor(i / 3), c.s.z + k, salt + 1) * sorts.length)];
      fenceSeg(c, x0 + ea * q0, y0 + eb * q0, x0 + ea * q1, y0 + eb * q1, sort, (h * 97) | 0);
    }
    k++;
  }
}

/* ═════════════ огород ═════════════ */
const CROPS = [
  { soil: '#5b4532', top: '#3f7a36', h: 0.32 },      // картошка
  { soil: '#5f4a36', top: '#8fc65a', h: 0.22 },      // капуста
  { soil: '#594230', top: '#6fa84a', h: 0.42 },      // лук, укроп
  { soil: '#5b4532', top: '#4a8a3a', h: 0.16, dot: '#d23a2a' },   // клубника
  { soil: '#614b35', top: '#2f6a2c', h: 0.55, dot: '#e0472a' },   // помидоры на подвязке
];
function garden (c) {
  const { W, D } = c.s, h = k => hash(c.s.x, c.s.z, k);
  const n = W > 28 ? 3 + (h(1) < 0.4 ? 1 : 0) : 2, pw = W / n;
  c.rect(-W / 2, -D / 2, W / 2, D / 2, '#8c9a5e', 0.045);                    // межа: сухая трава
  fenceRect(c, -W / 2, -D / 2, W / 2, D / 2, ['net', 'slate', 'door', 'picket'], 3, 71);
  for (let p = 0; p < n; p++) {
    const a0 = -W / 2 + p * pw + 0.8, a1 = a0 + pw - 1.6, b0 = -D / 2 + 2.6, b1 = D / 2 - 1.4;
    c.rect(a0, b0, a1, b1, '#6e5a42', 0.05);                               // вскопано
    if (p) fenceSeg(c, a0 - 0.8, -D / 2 + 1.6, a0 - 0.8, D / 2 - 0.6, h(10 + p) < 0.5 ? 'picket' : 'net', p * 7);   // межа между участками
    const gh = h(20 + p) < 0.65, gw = Math.min(3.2, (a1 - a0) * 0.5);
    const bedA1 = gh ? a1 - gw - 0.6 : a1;
    const nb = Math.max(1, Math.floor((bedA1 - a0 + 0.6) / 1.6));
    for (let i = 0; i < nb; i++) {
      const crop = CROPS[Math.floor(h(30 + p * 5 + i) * CROPS.length)];
      const a = a0 + 0.5 + i * 1.6, len = b1 - b0 - 1.2, bm = (b0 + b1) / 2;
      c.B(0.95, 0.16, len, crop.soil, a, 0.08, bm);
      const segs = 2 + (i % 2);
      for (let j = 0; j < segs; j++) {
        const sl = len / segs - 0.5, sb = b0 + 0.6 + (j + 0.5) * len / segs;
        c.B(0.62, crop.h, sl, crop.top, a, 0.16 + crop.h / 2, sb);
        if (crop.dot) c.B(0.66, 0.08, sl * 0.6, crop.dot, a, 0.16 + crop.h * 0.7, sb);
      }
    }
    if (gh) {                                                                  // парничок из плёнки на дугах
      const ga = a1 - gw / 2, gb = (b0 + b1) / 2 + 0.6, gl = Math.min(6, b1 - b0 - 1.5), g = [];
      const film = h(40 + p) < 0.5 ? '#dfe9e4' : '#e8efe0';
      for (const sd of [-1, 1]) c.Bg(g, 0.04, 1.1, gl, film, ga + sd * gw / 2, 0.55, gb);
      for (const sd of [-1, 1]) c.Bg(g, gw * 0.62, 0.04, gl, film, ga + sd * gw * 0.26, 1.42, gb, 0, 0, sd * 0.62);
      for (const sd of [-1, 1]) c.Bg(g, gw, 1.7, 0.04, film, ga, 0.85, gb + sd * gl / 2);
      for (let r = 0; r < 4; r++) c.Bg(g, gw + 0.06, 0.05, 0.05, '#8a8f8a', ga, 1.12, gb - gl / 2 + r * gl / 3);
      c.Bg(g, 0.05, 0.05, gl, '#8a8f8a', ga, 1.78, gb);
      c.smash('bigfence', ga, gb, 2.2, g, '#dfe9e4');
    }
  }
  // сарайчик в дальнем углу — стена; ванна-бочка, пугало, компост
  const sa = (h(50) < 0.5 ? -1 : 1) * (W / 2 - 2.2), sb = D / 2 - 2.0;
  c.B(2.4, 2.1, 2.0, '#7a5a3e', sa, 1.05, sb);
  c.B(2.8, 0.08, 2.5, '#8d9496', sa, 2.25, sb + 0.1, 0, 0.18);
  c.B(0.8, 1.7, 0.05, DOOR[(h(51) * DOOR.length) | 0], sa, 0.9, sb - 1.03);
  c.wall(sa, sb, 1.2, 1.0);
  { const g = [], ba = -sa * 0.6, bb = D / 2 - 1.6;                           // ванна вместо бочки
    c.Bg(g, 1.7, 0.6, 0.78, '#ecebe6', ba, 0.38, bb); c.Bg(g, 1.5, 0.04, 0.6, '#5f7f96', ba, 0.66, bb);
    for (const s of [-0.6, 0.6]) c.Bg(g, 0.12, 0.16, 0.12, '#8a8a8a', ba + s, 0.06, bb);
    c.smash('bin', ba, bb, 1.0, g, '#ecebe6'); }
  { const g = [], pa = (h(52) - 0.5) * W * 0.5, pb = 0.5;                       // пугало
    c.Bg(g, 0.08, 2.1, 0.08, '#6b5a44', pa, 1.05, pb); c.Bg(g, 1.4, 0.07, 0.07, '#6b5a44', pa, 1.55, pb);
    c.Bg(g, 0.55, 0.6, 0.3, ['#c8322a', '#3f6fb0', '#e8892e'][(h(53) * 3) | 0], pa, 1.45, pb);
    c.Bg(g, 0.32, 0.3, 0.32, '#9aa0a2', pa, 2.05, pb);                          // ведро вместо головы
    c.smash('fence', pa, pb, 0.8, g, '#6b5a44'); }
  { const g = [], ka = -sa, kb = -D / 2 + 1.6;                                 // бочка с водой
    c.G3(g, new THREE.CylinderGeometry(0.36, 0.36, 0.9, 10), h(54) < 0.5 ? '#3f6fb0' : '#8a4a2a', ka * 0.8, 0.45, kb);
    c.smash('bin', ka * 0.8, kb, 0.6, g, '#3f6fb0'); }
  c.s.npc = [{ t: 'garden', a: -W / 2 + pw * 0.5, b: 0, h: 0 }];
}

/* ═════════════ битые машины ═════════════ */
const RUST = ['#b8b0a0', '#7a8a6a', '#a85a3a', '#5a6a8a', '#c8c0a8', '#8a2a2a', '#3f5f4a', '#d8d2c0'];
function wreck (c, a, b, r, k, legs, sale) {
  const h = q => hash(c.s.x + a, c.s.z + b, q + k);
  const burnt = h(1) < 0.14;
  const col = burnt ? '#2b2724' : RUST[(h(2) * RUST.length) | 0], rust = burnt ? '#4a3a30' : '#8a4a2a', win = '#2f3a44';
  // в осях машины: x — поперёк (1,65), z — вдоль (4,1), нос — +z
  const cs = Math.cos(r), sn = Math.sin(r);
  const at = (lx, lz) => [a + lx * cs + lz * sn, b - lx * sn + lz * cs];
  const P = (w, hh, d, hex, lx, y, lz, rx = 0, rz = 0) => { const [pa, pb] = at(lx, lz); c.B(w, hh, d, hex, pa, y, pb, r, rx, rz); };
  for (const [x, z] of [[-0.6, -1.3], [0.6, -1.3], [-0.6, 1.3], [0.6, 1.3]]) P(0.3, 0.32, 0.3, '#a8503a', x, 0.16, z);   // кирпичи
  const tilt = (h(3) - 0.5) * 0.06;
  P(1.65, 0.62, 4.1, col, 0, 0.63, 0, tilt, 0);
  P(1.48, 0.52, 2.0, col, 0, 1.2, -0.25, tilt, 0);
  P(1.52, 0.34, 1.72, win, 0, 1.22, -0.25);                                     // окна полосой
  P(1.38, 0.42, 0.06, h(4) < 0.3 ? '#151515' : win, 0, 1.2, 0.78);              // лобовое (бывает выбито)
  for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) P(0.04, 0.38, 0.72, '#1e1c1c', s * 0.83, 0.5, z);   // пустые арки
  for (let i = 0; i < 3; i++) P(0.3 + h(10 + i) * 0.4, 0.18, 0.3 + h(13 + i) * 0.5, rust, (h(16 + i) - 0.5) * 1.5, 0.95 + i * 0.01, (h(19 + i) - 0.5) * 3.4);   // ржавчина
  if (h(5) < 0.4) P(1.5, 0.05, 1.1, col, 0, 1.45, 1.75, -0.95);                // капот открыт
  else P(1.5, 0.04, 1.0, rust, 0, 0.95, 1.5);
  if (h(6) < 0.35) P(0.05, 0.5, 0.95, '#1a1816', 0.84, 0.85, 0.15);            // нет двери
  if (h(7) < 0.25) P(1.5, 0.05, 0.8, col, 0, 1.25, -2.0, 0.9);                  // багажник
  if (sale) { const [pa, pb] = at(0, 0.82), [px, pz] = c.P(pa, pb); const fx = Math.sin(c.ry + r), fz = Math.cos(c.ry + r); signQuad('sale', px, c.G(pa, pb) + 1.2, pz, fx, fz, 0.9, 0.24); }
  if (legs) {                                                                   // ноги из-под машины
    for (const s of [-0.16, 0.16]) { P(0.9, 0.16, 0.18, '#2f4a7a', 1.15, 0.1, s - 0.4); P(0.14, 0.2, 0.22, '#1d1a18', 1.62, 0.12, s - 0.4); }
  }
  const [pa, pb] = at(0, 0);
  c.wall(pa, pb, 0.85, 2.1, r);
}
function wrecks (c) {
  const { W, D } = c.s, h = k => hash(c.s.x, c.s.z, k);
  c.rect(-W / 2, -D / 2, W / 2, D / 2, '#8b857a', 0.045);                     // щебёнка
  for (const s of [-1.1, 1.1]) c.rect(s - 0.4, -D / 2 - 2, s + 0.4, D / 2 - 3, '#6e665a', 0.05);   // колея
  c.blob(0, -D / 2 + 3, 2.6, 1.6, '#6a6255', 0.052, 3);
  SPOTS.push({ x: c.P(0, -D / 2 + 3)[0], z: c.P(0, -D / 2 + 3)[1], r: 2.4 });
  const rows = D >= 22 ? [-D / 2 + 6, D / 2 - 4.5] : [0];
  let k = 0, legs = (h(1) * 6) | 0, sale = (h(2) * 6) | 0;
  for (const b of rows) {
    const n = Math.floor((W - 6) / 3.4);
    for (let i = 0; i < n; i++) {
      const a = -W / 2 + 3 + 1.7 + i * 3.4;
      if (Math.abs(a) < 2.2 && b < 0) continue;                                // проезд по колее
      if (hash(c.s.x + i, c.s.z + b, 5) < 0.3) continue;
      const r = (b < 0 ? 0 : Math.PI) + (hash(c.s.x + i, c.s.z + b, 6) - 0.5) * 0.5;
      wreck(c, a, b, r, i * 13 + (b < 0 ? 0 : 7), k === legs, k === sale);
      k++;
    }
  }
  // покрышки стопкой
  for (let i = 0; i < 2; i++) {
    const g = [], ta = (i ? 1 : -1) * (W / 2 - 1.6), tb = -D / 2 + 2.0 + h(8 + i) * 4, n = 2 + ((h(10 + i) * 3) | 0);
    for (let j = 0; j < n; j++) c.G3(g, new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10), '#1f1d1d', ta + (j % 2) * 0.05, 0.12 + j * 0.25, tb);
    c.smash('bin', ta, tb, 0.6, g, '#1f1d1d');
  }
  STATS.wrecks = (STATS.wrecks || 0) + k;
}

/* ═════════════ плиты и песок ═════════════ */
function slabs (c) {
  const { W, D } = c.s, h = k => hash(c.s.x, c.s.z, k);
  c.rect(-W / 2, -D / 2, W / 2, D / 2, '#a69a7c', 0.045);
  c.blob(-W / 4, D / 6, W / 5, D / 4, '#9a8d6e', 0.05, 5);
  const ns = W > 28 ? 3 : 2;
  for (let i = 0; i < ns; i++) {                                                 // стопки плит
    const a = -W / 2 + 5 + i * (W - 10) / Math.max(1, ns - 1) * (ns > 1 ? 1 : 0), b = D / 2 - 4 - (i % 2) * 3.5, r = (h(10 + i) - 0.5) * 0.4;
    const big = h(20 + i) < 0.6, sw = big ? 6 : 3, n = 2 + ((h(30 + i) * 5) | 0);
    for (let j = 0; j < n; j++) c.B(sw, 0.22, 1.5, j % 2 ? '#aaa59c' : '#b9b5ad', a + (hash(a, j, 1) - 0.5) * 0.3, 0.13 + j * 0.24, b + (hash(a, j, 2) - 0.5) * 0.25, r + (hash(a, j, 3) - 0.5) * 0.08);
    for (const s of [-1, 1]) c.B(0.12, 0.1, 1.6, '#6b5a44', a + s * sw * 0.3, 0.02, b, r);   // прокладки
    c.wall(a, b, sw / 2, 0.8, r);
    if (i === 0) c.B(sw, 0.22, 1.5, '#a8a49c', a, 0.9, b - 1.5, r, 0.55);         // плита прислонена
  }
  const nr = 2 + ((h(40) * 3) | 0);
  for (let i = 0; i < nr; i++) {                                                // кольца колодцев
    const a = (h(41 + i) - 0.5) * (W - 8), b = -D / 2 + 5 + h(45 + i) * (D * 0.35), lying = h(50 + i) < 0.4;
    if (lying) {
      const gg = new THREE.CylinderGeometry(1.0, 1.0, 0.9, 12); gg.rotateZ(Math.PI / 2);
      c.G3(A.LIT, gg, '#b0aca4', a, 1.0, b, h(55 + i) * 3);
      c.wall(a, b, 0.5, 1.0, h(55 + i) * 3);
    } else {
      for (let j = 0; j < (h(60 + i) < 0.5 ? 1 : 2); j++) {
        c.G3(A.LIT, new THREE.CylinderGeometry(1.0, 1.0, 0.9, 12), '#b0aca4', a, 0.45 + j * 0.92, b);
        c.G3(A.LIT, new THREE.CylinderGeometry(0.86, 0.86, 0.02, 12), '#3a3632', a, 0.91 + j * 0.92, b);
      }
      c.wall(a, b, 1.0, 1.0);
    }
  }
  const piles = [['#d9b36a', 2.4, 1.5], ['#8e8a80', 2.0, 1.2], ['#d9b36a', 1.8, 1.1]];
  for (let i = 0; i < (W > 28 ? 3 : 2); i++) {                                   // кучи песка и щебня
    const [hex, r, hh] = piles[i], a = (i - 1) * W * 0.3 + (h(70 + i) - 0.5) * 3, b = (h(75 + i) - 0.5) * 3, g = [];
    c.G3(g, new THREE.ConeGeometry(r, hh, 9), hex, a, hh / 2, b);
    c.smash('sand', a, b, r * 0.8, g, hex);
  }
  { const g = [], a = W / 2 - 3, b = -D / 2 + 3;                                  // связка арматуры
    for (let i = 0; i < 6; i++) c.Bg(g, 0.05, 0.05, 6, '#5b3a2a', a + (i % 3) * 0.08, 0.06 + ((i / 3) | 0) * 0.07, b, 0.3);
    c.smash('fence', a, b, 1.0, g, '#5b3a2a'); }
}

/* ═════════════ футбольная коробка ═════════════ */
function football (c) {
  const { W, D } = c.s, h = k => hash(c.s.x, c.s.z, k);
  const L = Math.min(W - 9, 26), Wb = Math.min(D - 9, 15), bc = 0.8;
  const [cx, cz] = c.P(0, bc);
  if (!A.pitch || !A.pitch(cx, cz, c.oy, L, Wb)) return false;
  const asph = h(1) < 0.55;
  c.rect(-L / 2 - 2.6, bc - Wb / 2 - 2.6, L / 2 + 2.6, bc + Wb / 2 + 2.6, asph ? '#6d6e70' : '#9b8a6c', 0.045);
  for (const s of [-1, 1]) {                                                     // вытоптано у ворот
    c.blob(s * (L / 2 - 1.6), bc, 2.2, 1.8, asph ? '#5f6062' : '#86765a', 0.05, 7 + s);
    const [px, pz] = c.P(s * (L / 2 - 1.6), bc); SPOTS.push({ x: px, z: pz, r: 2 });
    // сетка за воротами: столбы и проволока
    const a = s * (L / 2 + 2.3);
    for (const q of [-4.5, 0, 4.5]) c.B(0.1, 4, 0.1, '#5a6066', a, 2, bc + q);
    for (const y of [1.3, 2.5, 3.7]) c.B(0.03, 0.04, 9, '#8f979c', a, y, bc);
    for (let q = -4.5; q <= 4.5; q += 1.5) c.B(0.03, 3.8, 0.03, '#8f979c', a, 1.95, bc + q);
  }
  { const g = [], b = bc + Wb / 2 + 2.6;                                         // лавка болельщиков
    c.Bg(g, 3.2, 0.12, 0.45, '#8a6b4e', 0, 0.48, b); for (const s of [-1.3, 1.3]) c.Bg(g, 0.12, 0.45, 0.4, '#4a4a50', s, 0.22, b);
    c.smash('table', 0, b, 1.4, g, '#8a6b4e'); }
  return true;
}

/* ═════════════ собачья площадка ═════════════ */
function dogs (c) {
  const { W, D } = c.s;
  const a0 = -W / 2 + 1, a1 = W / 2 - 1, b0 = -D / 2 + 1.5, b1 = D / 2 - 1;
  c.rect(a0, b0, a1, b1, '#8f9a5c', 0.045);
  for (let i = 0; i < 4; i++) {
    const a = (hash(c.s.x, c.s.z, 80 + i) - 0.5) * (W - 8), b = (hash(c.s.x, c.s.z, 85 + i) - 0.5) * (D - 6);
    c.blob(a, b, 2.4 + i * 0.6, 1.8 + i * 0.4, '#9a8a68', 0.05, 90 + i);
    const [px, pz] = c.P(a, b); SPOTS.push({ x: px, z: pz, r: 2 });
  }
  fenceRect(c, a0, b0, a1, b1, ['net'], 2.2, 81);
  { const [px, pz] = c.P(2.6, b0 - 0.05); signQuad('dogs', px, c.G(2.6, b0) + 1.95, pz, -c.nx, -c.nz, 1.8, 0.45);
    c.B(1.9, 0.55, 0.04, '#e8e4dc', 2.6, 1.95, b0 + 0.02); }
  const S = (kind, a, b, r, fn, hex) => { const [px, pz] = c.P(a, b); if (onPave(px, pz, 0.3)) return; const g = []; fn(g); c.smash(kind, a, b, r, g, hex); };   // не на тротуар и дорожку (pave.js)
  const stripe = ['#d9342c', '#f4f1ea'];
  for (const [a, b] of [[-W / 4, -D / 6], [-W / 4 + 3, D / 6]]) S('fence', a, b, 1.0, g => {   // барьеры
    for (const s of [-0.7, 0.7]) c.Bg(g, 0.08, 0.9, 0.08, '#e8e4dc', a, 0.45, b + s);
    for (let i = 0; i < 4; i++) c.Bg(g, 0.07, 0.07, 0.36, stripe[i % 2], a, 0.62, b - 0.54 + i * 0.36);
  }, '#d9342c');
  S('table', W / 5, -D / 8, 1.6, g => {                                          // горка-домик
    const a = W / 5, b = -D / 8;
    c.Bg(g, 1.0, 0.06, 2.0, '#c9803a', a, 0.55, b - 0.75, 0, 0.62); c.Bg(g, 1.0, 0.06, 2.0, '#3f6fa8', a, 0.55, b + 0.75, 0, -0.62);
  }, '#c9803a');
  S('fence', W / 5, D / 4, 0.9, g => {                                           // кольцо
    const a = W / 5, b = D / 4;
    for (const s of [-0.7, 0.7]) c.Bg(g, 0.08, 1.5, 0.08, '#4a4a50', a, 0.75, b + s);
    const tor = new THREE.TorusGeometry(0.45, 0.07, 5, 12); tor.rotateY(Math.PI / 2);
    c.G3(g, tor, '#f2b21c', a, 0.95, b);
  }, '#f2b21c');
  S('fence', -W / 8, D / 3, 1.6, g => {                                          // слалом
    for (let i = 0; i < 6; i++) c.Bg(g, 0.06, 1.0, 0.06, i % 2 ? '#3f6fa8' : '#f2b21c', -W / 8 - 3 + i * 1.2, 0.5, D / 3);
  }, '#f2b21c');
  S('table', W / 3, D / 10, 1.6, g => {                                          // бревно
    c.Bg(g, 3.2, 0.26, 0.26, '#8a6b4e', W / 3, 0.62, D / 10); for (const s of [-1.2, 1.2]) c.Bg(g, 0.2, 0.5, 0.5, '#6b5a44', W / 3 + s, 0.25, D / 10);
  }, '#8a6b4e');
  S('table', -W / 2 + 4, D / 2 - 2.6, 1.4, g => {                                // лавка
    c.Bg(g, 2.6, 0.12, 0.5, '#8a6b4e', -W / 2 + 4, 0.5, D / 2 - 2.6); c.Bg(g, 2.6, 0.5, 0.1, '#8a6b4e', -W / 2 + 4, 0.85, D / 2 - 2.35);
    for (const s of [-1.1, 1.1]) c.Bg(g, 0.12, 0.5, 0.45, '#4a4a50', -W / 2 + 4 + s, 0.24, D / 2 - 2.6);
  }, '#8a6b4e');
  c.s.npc = [{ t: 'owner', a: -W / 2 + 4, b: D / 2 - 3.6, h: 0 }, { t: 'owner', a: W / 2 - 5, b: -D / 2 + 4, h: 0 },
    { t: 'dog' }, { t: 'dog' }, { t: 'dog' }];
  c.s.inner = [a0 + 1, b0 + 1, a1 - 1, b1 - 1];
}

/* ═════════════ ларьки ═════════════ */
const KIOSK = ['shaw', 'veg', 'flow', 'shoe', 'press', 'beer'];
const KCOL = ['#e8e2d4', '#3f6fb0', '#c8322a', '#3f8a3a', '#e8a33a', '#5a4a8a'];
function kiosks (c) {
  const { W, D } = c.s, h = k => hash(c.s.x, c.s.z, k);
  const n = W > 20 ? 3 : 2, b = -D / 2 + 4.2;
  c.rect(-W / 2 + 1, -D / 2, W / 2 - 1, b + 2.5, '#77777a', 0.045);           // асфальт перед ларьками
  c.blob(0, b - 2.6, W / 3, 1.6, '#86766a', 0.05, 11);
  const used = new Set();
  const s0 = (h(1) * KIOSK.length) | 0;
  for (let i = 0; i < n; i++) {
    let k = (s0 + i * 2) % KIOSK.length;
    if (i === 0 && h(2) < 0.6) k = 0;                                           // шаурма — почти везде
    while (used.has(k)) k = (k + 1) % KIOSK.length;
    used.add(k);
    const kind = KIOSK[k], col = KCOL[(h(3 + i) * KCOL.length) | 0];
    const a = (i - (n - 1) / 2) * 4.6, KW = 3.2, KD = 2.4;
    c.B(KW, 2.5, KD, col, a, 1.25, b + KD / 2);
    c.B(KW + 0.3, 0.12, KD + 0.4, '#5a5a60', a, 2.62, b + KD / 2);
    c.B(KW - 0.5, 1.0, 0.06, '#3f5a72', a, 1.45, b - 0.01);                     // витрина
    c.B(KW - 0.3, 0.08, 0.5, '#d8d2c8', a, 0.92, b - 0.25);                      // прилавок
    for (let j = 0; j < 4; j++) c.B((KW + 0.2) / 4, 0.06, 0.9, j % 2 ? '#f4f1ea' : col === '#e8e2d4' ? '#c8322a' : col, a - (KW + 0.2) * 3 / 8 + j * (KW + 0.2) / 4, 2.12, b - 0.42, 0, -0.35);   // козырёк
    c.B(KW, 0.55, 0.05, '#f4f1ea', a, 2.35 + 0.02, b - 0.02);
    { const [px, pz] = c.P(a, b - 0.05); signQuad(kind, px, c.G(a, b) + 2.37, pz, -c.nx, -c.nz, KW - 0.1, 0.5); }
    if (kind === 'shaw') {                                                     // вертел за стеклом и на прилавке
      c.G3(A.LIT, new THREE.CylinderGeometry(0.16, 0.24, 0.7, 8), '#a8623a', a - 0.8, 1.3, b - 0.25);
    } else if (kind === 'veg') {
      for (let j = 0; j < 4; j++) { c.B(0.5, 0.3, 0.4, '#a07a52', a - 1.1 + j * 0.7, 0.15, b - 1.0); c.B(0.44, 0.08, 0.34, ['#d23a2a', '#e8892e', '#6fa84a', '#e8c23a'][j], a - 1.1 + j * 0.7, 0.32, b - 1.0); }
    } else if (kind === 'flow') {
      for (let j = 0; j < 5; j++) { c.B(0.3, 0.4, 0.3, '#3a5a8a', a - 1.2 + j * 0.6, 0.2, b - 0.9); c.B(0.34, 0.3, 0.34, ['#d23a6a', '#f4f1ea', '#e8c23a', '#c8322a', '#9a5ad2'][j], a - 1.2 + j * 0.6, 0.55, b - 0.9); }
    }
    c.wall(a, b + KD / 2, KW / 2, KD / 2);
  }
  for (let i = 0; i < 2; i++) {                                                 // столики и урна
    const g = [], a = (i ? 1 : -1) * (W / 2 - 3), tb = b - 1.6;
    c.Bg(g, 0.08, 1.05, 0.08, '#5a5a60', a, 0.52, tb); c.Bg(g, 0.7, 0.05, 0.7, '#e8e4dc', a, 1.07, tb); c.Bg(g, 0.5, 0.04, 0.5, '#5a5a60', a, 0.02, tb);
    c.smash('table', a, tb, 0.7, g, '#e8e4dc');
  }
  { const g = []; c.G3(g, new THREE.CylinderGeometry(0.26, 0.22, 0.75, 8), '#4e5a4a', W / 2 - 1.6, 0.37, b - 0.4); c.smash('bin', W / 2 - 1.6, b - 0.4, 0.5, g, '#4e5a4a'); }
  const [px, pz] = c.P(0, b - 2.6); SPOTS.push({ x: px, z: pz, r: 2.5 });
  c.s.front = c.P(0, -D / 2 - 0.5);
  c.s.npc = [{ t: 'eater', a: -W / 2 + 3, b: b - 2.2, h: 0 }, { t: 'eater', a: (h(9) - 0.5) * 3, b: b - 1.1, h: 0 }];
}

/* ═════════════ назначение ═════════════ */
const GEN = { garden, wrecks, slabs, football, dogs, kiosks };
const BIG_KINDS = ['garden', 'wrecks', 'slabs', 'football', 'dogs'];
const SMALL_KINDS = ['garden', 'dogs', 'kiosks', 'slabs'];
let ENTG = null;
function entGrid () {
  ENTG = new Map();
  for (const e of new Set(A.CITY.entrances.concat(A.GEN_ENTR || []))) { const k = Math.floor(e[0] / 50) + ',' + Math.floor(e[1] / 50); if (!ENTG.has(k)) ENTG.set(k, []); ENTG.get(k).push(e); }
}
function entNear (x, z, R) {
  let n = 0;
  for (let i = Math.floor((x - R) / 50); i <= Math.floor((x + R) / 50); i++)
    for (let j = Math.floor((z - R) / 50); j <= Math.floor((z + R) / 50); j++) {
      const a = ENTG.get(i + ',' + j);
      if (a) for (const e of a) if (Math.hypot(e[0] - x, e[1] - z) < R) n++;
    }
  return n;
}
let GARS = null;
function features (s) {
  const c = frame(s), { W, D } = s;
  let back = 0;
  for (const a of [-W / 3, 0, W / 3]) for (const b of [D / 2 + 7, D / 2 + 13]) { const [px, pz] = c.P(a, b); if (A.inHouse(px, pz, 0)) back++; }
  for (const sd of [-1, 1]) { const [px, pz] = c.P(sd * (W / 2 + 9), 0); if (A.inHouse(px, pz, 0)) back += 1.5; }
  const dens = Math.min(1, entNear(s.x, s.z, 150) / 30);
  let stop = 0;
  for (const st of A.CITY.stops || []) { const p = st.p || st; const d = Math.hypot(p[0] - s.x, p[1] - s.z); if (d < 160) stop = Math.max(stop, 1 - d / 160); }
  let gar = 0;
  for (const g of GARS) { const d = Math.hypot(g[0] - s.x, g[1] - s.z); if (d < 260) gar = Math.max(gar, 1 - d / 260); }
  return { back: Math.min(1, back / 3), dens, stop, gar };
}
function score (kind, f, used) {
  const base = {
    garden: 0.25 + 1.0 * f.back,
    wrecks: 0.25 + 0.7 * f.gar + 0.3 * (1 - f.dens),
    slabs: 0.25 + 0.35 * (1 - f.dens) + 0.2 * f.gar,
    football: 0.3 + 0.55 * f.dens,
    dogs: 0.3 + 0.4 * f.dens,
    kiosks: 0.2 + 0.9 * f.stop + 0.2 * f.dens,
  }[kind];
  return base - WASTE.QUOTA * (used[kind] || 0);
}

export function build (api) {
  A = api;
  const t0 = performance.now();
  entGrid();
  GARS = (A.CITY.garlots || []).filter(p => p && p.length > 2).map(p => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; });
  const used = {};
  const tex = signAtlas();
  for (const [cfg, kinds] of [[WASTE.BIG, BIG_KINDS], [WASTE.SMALL, SMALL_KINDS]]) {
    const lots = CONSTR.freeLots({ W: cfg.W, D: cfg.D, max: cfg.MAX, gap: cfg.GAP, salt: cfg.SALT, per: cfg.PER, cap: cfg.CAP, claim: false });
    STATS.tried += lots.length;
    for (const s of lots) {
      const f = features(s);
      const order = kinds.map(k => ({ k, v: score(k, f, used) + hash(s.x, s.z, 7 + kinds.indexOf(k)) * 0.35 })).sort((p, q) => q.v - p.v);
      let ok = null;
      for (const { k } of order) {
        const c = frame(s);
        s.kind = k; s.npc = null;
        const r = GEN[k](c);
        if (r === false) continue;
        ok = k; break;
      }
      if (!ok) continue;
      used[ok] = (used[ok] || 0) + 1;
      s.f = f; s.gy = A.groundH(s.x, s.z);
      const c = frame(s);
      CONSTR.claim(s.x, s.z, Math.hypot(s.W, s.D) / 2);
      if (A.addFoot) A.addFoot([c.P(-s.W / 2 - 0.5, -s.D / 2 - 0.5), c.P(s.W / 2 + 0.5, -s.D / 2 - 0.5), c.P(s.W / 2 + 0.5, s.D / 2 + 0.5), c.P(-s.W / 2 - 0.5, s.D / 2 + 0.5)], 'waste');
      s.live = false; s.mobs = []; s.i = LOTS.length;
      LOTS.push(s);
    }
  }
  // вывески одним мешем
  if (SIGN_P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(SIGN_P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(SIGN_UV, 2));
    g.setIndex(SIGN_I);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    m.matrixAutoUpdate = false;
    A.scene.add(m);
  }
  STATS.lots = LOTS.length; STATS.kinds = used;
  STATS.ms = Math.round(performance.now() - t0);
}

/* ═════════════ тропинки, вытоптанное, лужи ═════════════ */
const TRAIL_HEX = ['#8f7a5a', '#94805e', '#87735a'], EDGE_HEX = '#a3a072';
export function trails () {
  if (!A) return;
  const t0 = performance.now();
  const C = A.CITY;
  entGrid();                                        // свои подъезды (GEN_ENTR) к этому времени уже в CITY.entrances
  // стены (заборы, гаражи) — своей сеткой: SOLID_GRID игры соберётся позже
  const SOL = new Map(), SC = 30;
  for (const s of A.SOLIDS) for (let i = Math.floor((s.cx - s.ex) / SC); i <= Math.floor((s.cx + s.ex) / SC); i++) for (let j = Math.floor((s.cz - s.ez) / SC); j <= Math.floor((s.cz + s.ez) / SC); j++) {
    const k = i + ',' + j; if (!SOL.has(k)) SOL.set(k, []); SOL.get(k).push(s);
  }
  const inSolid = (x, z, r) => {
    const a = SOL.get(Math.floor(x / SC) + ',' + Math.floor(z / SC));
    if (a) for (const s of a) { const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs; if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true; }
    return false;
  };
  const onRoad = (x, z, m) => { const r = A.nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; };
  const bad = (x, z) => A.inHouse(x, z, 0.6) || onRoad(x, z, 0.7) || A.groundH(x, z) < 0.5 || inSolid(x, z, 0.4) || !A.inBounds(x, z, 30);
  // цели: остановки, ларьки, гаражи, коробки, площадки
  const TG = new Map(), TC = 60;
  const addT = (x, z, k) => { const key = Math.floor(x / TC) + ',' + Math.floor(z / TC); if (!TG.has(key)) TG.set(key, []); TG.get(key).push({ x, z, k }); };
  for (const st of C.stops || []) { const p = st.p || st; addT(p[0], p[1], 'stop'); }
  for (const g of GARS || []) addT(g[0], g[1], 'gar');
  for (const s of LOTS) if (s.front) addT(s.front[0], s.front[1], 'kiosk');
  for (const p of A.PITCHES || []) addT(p.cx + p.nx * (p.W / 2 + 2.5), p.cz + p.nz * (p.W / 2 + 2.5), 'pitch');
  for (const g of C.green || []) if (g.k === 'play' && g.p && g.p.length > 2) { let x = 0, z = 0; for (const q of g.p) { x += q[0]; z += q[1]; } addT(x / g.p.length, z / g.p.length, 'play'); }
  const near = (x, z, R) => {
    const out = [];
    for (let i = Math.floor((x - R) / TC); i <= Math.floor((x + R) / TC); i++) for (let j = Math.floor((z - R) / TC); j <= Math.floor((z + R) / TC); j++) {
      const a = TG.get(i + ',' + j); if (a) for (const q of a) { const d = Math.hypot(q.x - x, q.z - z); if (d > TRAIL.MIN && d < R) out.push({ q, d }); }
    }
    return out.sort((p, q) => p.d - q.d);
  };
  // конец у цели: отступить от дороги и стены к началу
  const settle = (sx, sz, tx, tz) => {
    const L = Math.hypot(tx - sx, tz - sz), ex = (sx - tx) / L, ez = (sz - tz) / L;
    for (let d = 0; d < Math.min(14, L - 4); d += 1) { const x = tx + ex * d, z = tz + ez * d; if (!bad(x, z)) return [x, z]; }
    return null;
  };
  const DONE = [];
  const dup = (sx, sz, tx, tz) => DONE.some(p => (Math.hypot(p[0] - sx, p[1] - sz) < 7 && Math.hypot(p[2] - tx, p[3] - tz) < 7) || (Math.hypot(p[0] - tx, p[1] - tz) < 7 && Math.hypot(p[2] - sx, p[3] - sz) < 7));
  const clearLine = pts => {
    for (let i = 1; i < pts.length; i++) {
      const [x1, z1] = pts[i - 1], [x2, z2] = pts[i], L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / TRAIL.STEP));
      for (let j = (i === 1 ? 1 : 0); j <= n; j++) { const q = j / n; if (bad(x1 + (x2 - x1) * q, z1 + (z2 - z1) * q)) return false; }
    }
    return true;
  };
  const draw = (pts, seed) => {
    const w = TRAIL.W[0] + (TRAIL.W[1] - TRAIL.W[0]) * hash(seed, 1, 3), hex = TRAIL_HEX[(hash(seed, 2, 3) * 3) | 0];
    A.LITM.color(EDGE_HEX);
    for (let i = 1; i < pts.length; i++) A.LITM.ribbon(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w + TRAIL.EDGE * 0.6, 0.066);
    A.LITM.color(hex);
    for (let i = 1; i < pts.length; i++) A.LITM.ribbon(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, 0.072);
    for (let i = 1; i < pts.length - 1; i++) A.LITM.disc(pts[i][0], pts[i][1], w / 2, 0.072, 6);
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    STATS.trails++; STATS.trailM += m;
    // лужа в низинке тропинки
    if (hash(seed, 5, 3) < PUD.TRAIL) {
      const q = 0.25 + hash(seed, 6, 3) * 0.5, i = Math.min(pts.length - 1, 1 + Math.floor(q * (pts.length - 1)));
      const [x1, z1] = pts[i - 1], [x2, z2] = pts[i];
      puddle((x1 + x2) / 2, (z1 + z2) / 2, w * 0.9 + hash(seed, 7, 3) * 0.6, seed);
    }
  };
  // изгиб: середина в сторону на 6—12 % длины
  const bend = (sx, sz, tx, tz, seed) => {
    const L = Math.hypot(tx - sx, tz - sz), k = (hash(seed, 9, 3) - 0.5) * 0.24 * L, nx = -(tz - sz) / L, nz = (tx - sx) / L;
    const pts = [[sx, sz]];
    const n = Math.max(2, Math.min(6, Math.round(L / 16)));
    for (let i = 1; i < n; i++) { const q = i / n, b = Math.sin(q * Math.PI) * k; pts.push([sx + (tx - sx) * q + nx * b, sz + (tz - sz) * q + nz * b]); }
    pts.push([tx, tz]);
    return pts;
  };
  const ents = C.entrances;
  // подъезды: сначала к целям (остановка, ларёк, гаражи, коробка), потом наискосок к соседнему дому
  for (const e of ents) {
    if (STATS.trails >= TRAIL.MAX_N) break;
    const seed = e[0] * 0.37 + e[1] * 0.11;
    if (hash(e[0], e[1], 77) > TRAIL.SHARE) continue;
    const ox = e[2] || 0, oz = e[3] || 0, ol = Math.hypot(ox, oz) || 1;
    const sx = e[0] + ox / ol * 8.5, sz = e[1] + oz / ol * 8.5;
    if (bad(sx, sz)) continue;
    let done = false;
    for (const { q } of near(sx, sz, TRAIL.MAX).slice(0, 4)) {
      const end = settle(sx, sz, q.x, q.z);
      if (!end || Math.hypot(end[0] - sx, end[1] - sz) < TRAIL.MIN || dup(sx, sz, end[0], end[1])) continue;
      const pts = bend(sx, sz, end[0], end[1], seed);
      if (!clearLine(pts)) continue;
      draw(pts, seed); DONE.push([sx, sz, end[0], end[1]]); done = true; break;
    }
    if (done || hash(e[0], e[1], 78) > 0.5) continue;
    // к подъезду соседнего дома, 30—90 м, не через дом
    let best = null;
    for (let i = Math.floor((sx - 90) / 50); i <= Math.floor((sx + 90) / 50) && !best; i++) for (let j = Math.floor((sz - 90) / 50); j <= Math.floor((sz + 90) / 50) && !best; j++) {
      const a = ENTG.get(i + ',' + j); if (!a) continue;
      for (const f of a) {
        if (f === e) continue;
        const fl = Math.hypot(f[2] || 0, f[3] || 0) || 1, fx = f[0] + (f[2] || 0) / fl * 8.5, fz = f[1] + (f[3] || 0) / fl * 8.5, d = Math.hypot(fx - sx, fz - sz);
        if (d < 30 || d > 90 || dup(sx, sz, fx, fz) || bad(fx, fz)) continue;
        if ((fx - sx) * ox + (fz - sz) * oz < 0) continue;                       // идут от двери, а не за угол дома
        const pts = bend(sx, sz, fx, fz, seed + 1);
        if (clearLine(pts)) { best = pts; break; }
      }
    }
    if (best) { draw(best, seed + 1); const l = best[best.length - 1]; DONE.push([sx, sz, l[0], l[1]]); }
  }
  // вытоптано у лавочек; лужа рядом — иногда
  for (const b of A.BENCHES || []) {
    if (hash(b.x, b.z, 31) > TRAIL.BENCH) continue;
    const fx = Math.sin(b.ry || 0), fz = Math.cos(b.ry || 0), x = b.x + fx * 1.25, z = b.z + fz * 1.25;
    if (onRoad(x, z, 0.3)) continue;
    blobAt(x, z, 1.5, 0.95, Math.atan2(-fz, fx), '#9a8662', 0.07, 13);
    SPOTS.push({ x, z, r: 1.4 });
    if (hash(b.x, b.z, 32) < PUD.BENCH) puddle(x + fx * 0.8, z + fz * 0.8, 0.7, b.x + b.z);
  }
  for (const s of SPOTS) if (hash(s.x, s.z, 33) < 0.45) puddle(s.x + (hash(s.x, s.z, 34) - 0.5) * s.r, s.z + (hash(s.x, s.z, 35) - 0.5) * s.r, PUD.R[0] + hash(s.x, s.z, 36) * (PUD.R[1] - PUD.R[0]), s.x * 3 + s.z);
  STATS.spots = SPOTS.length;
  buildPuddles();
  STATS.trailM = Math.round(STATS.trailM);
  STATS.trailMs = Math.round(performance.now() - t0);
}
function puddle (x, z, r, seed) {
  const h = hash(seed, 11, 5), tier = h < 0.3 ? 0 : h < 0.65 ? 1 : 2;
  PUDS[tier].push([x, z, r, seed]);
}
const PMESH = [];
let PMAT = null;
function buildPuddles () {
  PMAT = new THREE.MeshLambertMaterial({ color: 0x4f6272, emissive: 0x1a2630, side: THREE.DoubleSide });
  for (let tier = 0; tier < 3; tier++) {
    const L = PUDS[tier];
    STATS.puddles[tier] = L.length;
    if (!L.length) { PMESH.push(null); continue; }
    const pos = [], idx = [];
    for (const [x, z, r, seed] of L) {
      const n = 8, v0 = pos.length / 3, ang = hash(seed, 2, 9) * 6.28, ell = 0.6 + hash(seed, 3, 9) * 0.4;
      pos.push(x, A.groundH(x, z) + 0.095, z);
      for (let i = 0; i < n; i++) {
        const q = i / n * Math.PI * 2, j = 0.75 + hash(seed, 10 + i, 9) * 0.5, la = Math.cos(q) * r * j, lb = Math.sin(q) * r * ell * j;
        const px = x + la * Math.cos(ang) - lb * Math.sin(ang), pz = z + la * Math.sin(ang) + lb * Math.cos(ang);
        pos.push(px, A.groundH(px, pz) + 0.095, pz);
      }
      for (let i = 0; i < n; i++) idx.push(v0, v0 + 1 + ((i + 1) % n), v0 + 1 + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, PMAT);
    m.matrixAutoUpdate = false; m.visible = false;
    A.scene.add(m);
    PMESH.push(m);
  }
}
/* сколько мокро: сезон (весна, осень) и дождь, что недавно прошёл; 0 … 1 */
let WET = 0, RAIN_ACC = 0, wetT = 0;
function wetness (dt) {
  const s = ((SEAS.seasonValue() % 4) + 4) % 4;
  let base = s < 1 ? 0.18 : s < 2 ? 0.35 + (s - 1) * 0.5 : s < 2.95 ? 0.1 : s < 3.6 ? 1 : 1 - (s - 3.6) * 1.8;
  const E = A.ENV || {};
  RAIN_ACC = clamp(RAIN_ACC + ((E.rain || 0) > 0.3 ? dt / 25 : -dt / 160), 0, 1);
  let w = Math.max(base, RAIN_ACC);
  try { if (WTH.id() === 'heat') w *= 0.2; } catch (e) {}
  if (SEAS.snowAmt() > 0.35) w = 0;                 // зимой лужи под снегом
  return w;
}

/* ═════════════ люди и собаки ═════════════ */
const LINES = {
  garden: [N_('Куда по грядкам?!'), N_('Не дави мне огурцы!'), N_('Своё, не магазинное!')],
  owner: [N_('Он не кусается!'), N_('Фу! Нельзя!'), N_('Рядом! Ко мне!')],
  eater: [N_('Мне с собой, без лука'), N_('Две шавы, братан'), N_('Тут лучшая в городе')],
};
let DOG_GEO = null, DOG_MAT = null;
function dogGeo () {
  if (DOG_GEO) return DOG_GEO;
  DOG_GEO = ['#f4f1ea', '#e0c8a0', '#2b2a30', '#b07a4a'].map(col => {
    const g = [], dk = '#3a2a20';
    const b = (w, h, d, hex, x, y, z) => A.put(g, A.boxGeo(w, h, d), hex, x, y, z);
    b(0.28, 0.26, 0.6, col, 0, 0.42, 0); b(0.24, 0.24, 0.26, col, 0, 0.62, 0.38); b(0.12, 0.1, 0.14, dk, 0, 0.57, 0.55);
    for (const s of [-1, 1]) { b(0.07, 0.12, 0.05, col, s * 0.08, 0.78, 0.36); b(0.07, 0.3, 0.07, col, s * 0.09, 0.15, 0.2); b(0.07, 0.3, 0.07, col, s * 0.09, 0.15, -0.2); }
    b(0.06, 0.06, 0.28, col, 0, 0.6, -0.4); b(0.29, 0.05, 0.06, '#c23a3a', 0, 0.56, 0.24);
    return A.mergeGeos(g);
  });
  DOG_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return DOG_GEO;
}
function carHits (x, z, r) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), dx = x - V.x, dz = z - V.z;
  return Math.abs(dx * fx + dz * fz) < A.CAR_L + r && Math.abs(dx * fz - dz * fx) < A.CAR_W + r;
}
function spawnLot (s) {
  const c = frame(s);
  s.live = true; s.mobs = [];
  const V = A.V;
  for (const n of s.npc) {
    if (n.t === 'dog') {
      const geos = dogGeo(), m = new THREE.Mesh(geos[(Math.random() * geos.length) | 0], DOG_MAT);
      const [ia0, ib0, ia1, ib1] = s.inner;
      const a = rand(ia0, ia1), b = rand(ib0, ib1), [x, z] = c.P(a, b);
      m.scale.setScalar(rand(0.8, 1.25));
      A.scene.add(m);
      s.mobs.push({ dog: 1, m, x, z, h: rand(0, 6.28), tx: x, tz: z, sp: rand(...WASTE.DOG_SP), idle: rand(0, 2), ph: rand(0, 6), fly: null, gone: 0, bark: rand(2, 6) });
      STATS.dogs++;
    } else {
      const [x, z] = c.P(n.a + rand(-0.6, 0.6), n.b + rand(-0.4, 0.4));
      const fem = n.t === 'garden' ? Math.random() < 0.75 : Math.random() < 0.5;
      const grp = A.makeHuman(A.makePerson ? A.makePerson({ fem, fat: Math.random() < 0.25 }) : null, { fem });
      const hd = n.t === 'eater' ? Math.atan2(c.nx, c.nz) : Math.atan2(V.x - x, V.z - z);
      grp.position.set(x, A.groundH(x, z), z); grp.rotation.y = hd;
      A.scene.add(grp);
      s.mobs.push({ t: n.t, grp, u: grp.userData, x, z, h: hd, ph: rand(0, 6), dead: 0, fall: null, say: null, sayT: 0, sayCd: rand(2, 6) });
      STATS.people++;
    }
  }
}
function dropMob (o) {
  if (o.dog) { A.scene.remove(o.m); return; }
  if (!o.dead) A.dropMesh(o.grp);
}
function despawnLot (s) { for (const o of s.mobs) dropMob(o); s.mobs = []; s.live = false; }
function humanStep (s, o, dt, sp) {
  const V = A.V;
  if (o.dead) return;
  if (o.fall) { if (HITS.fallStep(o, dt)) return; }
  if (sp > 3 && carHits(o.x, o.z, 0.35)) {
    const kmh = sp * 3.6;
    if (HITS.isFall(kmh)) { if (!o.fall) HITS.fall(o, V.vx, V.vz); return; }
    o.dead = 1;
    A.dropMesh(o.grp);
    A.gibHuman(o, V.vx, V.vz, kmh);
    if (A.runOver) A.runOver();
    return;
  }
  const u = o.u, d = Math.hypot(o.x - V.x, o.z - V.z);
  o.ph += dt;
  if (o.say && (o.sayT -= dt) <= 0) { if (o.say.parent) o.say.parent.remove(o.say); o.say.material.dispose(); o.say = null; }
  if (o.t === 'garden') {                                // полет: руки внизу, голова к грядке
    u.armR.rotation.x = -1.1 + Math.sin(o.ph * 3) * 0.35; u.armL.rotation.x = -0.9 + Math.cos(o.ph * 3) * 0.3; u.head.rotation.x = 0.45;
  } else if (o.t === 'eater') {                          // ест шаурму
    u.armR.rotation.x = -1.5 + Math.max(0, Math.sin(o.ph * 1.3)) * 0.6; u.head.rotation.y = Math.sin(o.ph * 0.4) * 0.3;
  } else {                                                // собачник: зовёт, машет
    u.armR.rotation.x = Math.sin(o.ph * 0.7) > 0.6 ? -2.4 + Math.sin(o.ph * 9) * 0.3 : 0;
    u.head.rotation.y = Math.sin(o.ph * 0.5) * 0.6;
  }
  if (d < 16 && !o.say && (o.sayCd -= dt) <= 0) {
    const L = LINES[o.t];
    if (L) { o.say = A.sayBubble(o.grp, t(L[(Math.random() * L.length) | 0]), o.t === 'garden' ? '#8a3b3b' : '#3f6fa8'); o.sayT = 2.6; o.sayCd = rand(7, 12); }
  }
}
function dogStep (s, o, dt, sp) {
  const V = A.V, c = s.c || (s.c = frame(s));
  if (o.gone) {                                           // сбитая собака удирает с визгом
    o.gone += dt; o.x += Math.sin(o.h) * 7 * dt; o.z += Math.cos(o.h) * 7 * dt;
    if (o.fly) { o.fly.y += o.fly.vy * dt; o.fly.vy -= 18 * dt; o.x += o.fly.vx * dt; o.z += o.fly.vz * dt; if (o.fly.y <= 0) o.fly = null; }
    o.m.position.set(o.x, A.groundH(o.x, o.z) + (o.fly ? o.fly.y : Math.abs(Math.sin(o.gone * 14)) * 0.12), o.z);
    o.m.rotation.y = o.h; o.m.rotation.z = o.fly ? o.gone * 9 : 0;
    if (o.gone > 6) { A.scene.remove(o.m); o.dead = 1; }
    return;
  }
  if (sp > 3 && carHits(o.x, o.z, 0.4)) {
    o.gone = 0.001; o.fly = { vx: V.vx * 0.5, vz: V.vz * 0.5, vy: 5, y: 0 }; o.h = Math.atan2(o.x - V.x, o.z - V.z);
    STATS.hitDogs++;
    if (A.Snd) { A.Snd.blip(980, 0.12, 'square', 0.08); A.Snd.blip(760, 0.18, 'square', 0.06); }
    return;
  }
  const [ia0, ib0, ia1, ib1] = s.inner;
  const dc = Math.hypot(V.x - o.x, V.z - o.z);
  if (dc < 9 && sp > 2) {                                 // машина рядом — отбегает
    const ex = (o.x - V.x) / (dc || 1), ez = (o.z - V.z) / (dc || 1);
    o.tx = o.x + ex * 6; o.tz = o.z + ez * 6; o.idle = 0;
  } else if (o.idle > 0) {
    o.idle -= dt;
    if (o.idle <= 0) { const [x, z] = c.P(rand(ia0, ia1), rand(ib0, ib1)); o.tx = x; o.tz = z; o.sp = rand(...WASTE.DOG_SP); }
  }
  // держится в ограде
  const loc = (x, z) => { const dx = x - s.x, dz = z - s.z; return [dx * s.ux + dz * s.uz, dx * c.nx + dz * c.nz]; };
  let [ta, tb] = loc(o.tx, o.tz); ta = clamp(ta, ia0, ia1); tb = clamp(tb, ib0, ib1); [o.tx, o.tz] = c.P(ta, tb);
  const dx = o.tx - o.x, dz = o.tz - o.z, dl = Math.hypot(dx, dz);
  let run = 0;
  if (dl > 0.4 && o.idle <= 0) {
    const st = Math.min(dl, o.sp * dt);
    o.x += dx / dl * st; o.z += dz / dl * st; run = 1;
    const want = Math.atan2(dx, dz); let dh = want - o.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); o.h += dh * Math.min(1, dt * 10);
  } else if (o.idle <= 0) o.idle = rand(0.6, 2.5);
  o.ph += dt * (run ? 14 : 2);
  o.m.position.set(o.x, A.groundH(o.x, o.z) + (run ? Math.abs(Math.sin(o.ph)) * 0.1 : 0), o.z);
  o.m.rotation.y = o.h; o.m.rotation.z = 0;
  if (dc < 40 && (o.bark -= dt) <= 0) { o.bark = rand(3, 8); if (A.Snd) { A.Snd.blip(520, 0.06, 'square', 0.035); A.Snd.blip(480, 0.06, 'square', 0.03); } }
}
let scanT = 0;
export function step (dt) {
  if (!A) return;
  // лужи: по сезону и дождю — раз в полсекунды
  if ((wetT -= dt) <= 0) {
    wetT = 0.5;
    WET = wetness(0.5);
    for (let i = 0; i < 3; i++) if (PMESH[i]) PMESH[i].visible = WET > PUD.TIER[i];
  }
  if (!LOTS.length) return;
  const V = A.V, E = A.ENV || {}, day = (E.night || 0) < 0.45 && (E.rain || 0) < 0.5;
  if ((scanT -= dt) <= 0) {
    scanT = 0.5;
    let live = 0;
    for (const s of LOTS) if (s.live) {
      const d = Math.hypot(s.x - V.x, s.z - V.z);
      if (d > WASTE.NPC_DROP) despawnLot(s); else live++;
    }
    if (day && live < WASTE.NPC_LOTS) {
      const want = LOTS.filter(s => !s.live && s.npc && s.npc.length && Math.hypot(s.x - V.x, s.z - V.z) < WASTE.NPC_R)
        .sort((p, q) => Math.hypot(p.x - V.x, p.z - V.z) - Math.hypot(q.x - V.x, q.z - V.z));
      for (const s of want) { if (live >= WASTE.NPC_LOTS) break; if (hash(s.x, s.z, 99) < 0.75 || s.kind === 'dogs') { spawnLot(s); live++; } else s.npc = null; }
    }
    STATS.npcLive = live;
  }
  const sp = Math.hypot(V.vx, V.vz);
  for (const s of LOTS) {
    if (!s.live) continue;
    for (const o of s.mobs) {
      if (o.dog) { if (!o.dead) dogStep(s, o, dt, sp); }
      else humanStep(s, o, dt, sp);
      if (!o.dog && !o.dead && !o.fall) o.grp.position.set(o.x, A.groundH(o.x, o.z), o.z);
    }
  }
}

export const DEBUG = {
  WASTE, TRAIL, PUD, STATS, LOTS, PUDS, SPOTS,
  wet: () => ({ WET, RAIN_ACC, tiers: PMESH.map(m => !!(m && m.visible)) }),
  /* куда встать, чтобы увидеть пустырь: точка на улице напротив и курс лицом к участку */
  view: (kind, i = 0) => {
    const s = LOTS.filter(l => l.kind === kind)[i];
    if (!s) return null;
    const nx = -s.uz, nz = s.ux, fx = s.x - nx * (s.D / 2 + 9), fz = s.z - nz * (s.D / 2 + 9);
    return { x: fx, z: fz, h: Math.atan2(nx, nz), lot: [Math.round(s.x), Math.round(s.z)] };
  },
  list: () => LOTS.map(s => ({ k: s.kind, x: Math.round(s.x), z: Math.round(s.z), W: s.W, f: s.f && Object.fromEntries(Object.entries(s.f).map(([k, v]) => [k, +v.toFixed(2)])) })),
};
