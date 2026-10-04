/* ──────────────────────────────────────────────────────────────────────────
   Точки конкурентов (docs/IDEAS.md, блок 9; правила — docs/CAREER.md
   «Респект и войны брендов» → «Точки конкурентов, маскоты, их курьеры»).

   • Две чужие сети: «Вселенная суши» (голубая) и «Королева Бургеров»
     (жёлто-синяя). В каждом районе — по точке каждой сети, где хватает
     места — по второй (RIV.PER_DIST). Место — пустырь у улицы тем же
     отбором, что стройки (construction.js freeLots), участок ~24 × 23 м,
     от стен домов ≥ WALL, от наших пиццерий ≥ PIZZA, от строек, костров и
     котлов — по общему списку занятых (CONSTR.claim). Район без пустыря —
     1 точка у ТЦ (MALL_R) прежним отбором (finder).
     Жребий — по месту (хэш): карта та же — точки те же.
   • Точка: павильон с витриной и вывеской (рисунок кодом), на крыше —
     ролл-планета с кольцом или бургер в короне; перед ним к улице —
     терраса: столики с гостями (инстансами), зонтики, кадки с цветами,
     стела у тротуара, меню-доска. Зимой (seasons.js warmth ≥ WINTER)
     терраса застеклена (рамы и крыша + стёкла), зонтиков нет; летом открыта.
   • Сломать точку: сбить SHOP_HITS вещей одной точки (столики, зонтики,
     кадки, стелу, доску, стёкла) — RESPECT rivalShop, не чаще раза в смену
     с одной точки. Гости сбитого столика разбегаются. Новая смена — всё
     стоит на месте.
   • Маскоты (2—3 у точки): у суши — ходячие роллы и онигири с палочками,
     у бургерной — бургер в короне со скипетром. Бродят у террасы, машут
     курьеру. Сбил — RESPECT rivalMascot (раз в MASCOT_COOL с у одного):
     во взрослой разлетается на ингредиенты и возвращается через
     MASCOT_BACK с, в детской — кувыркается, встаёт и ворчит.
   • Курьеры конкурентов: голубые мопеды «Вселенной суши» с коробом-роллом
     (mopeds.js, бренд sushi) и машины-бургеры «Королевы Бургеров» (машина
     потока, родившаяся у бургерной). Ездят от своей точки к адресам и
     обратно (поворот к цели — nextEdge). Сбил мопед-суши — rivalCourier,
     взорвал машину-бургер — rivalCar.
   Перф: павильоны — в общей статике (LIT/LITM/LAMPH), вывески — по мешу на
   сеть, стёкла зимы — два меша на город, сбиваемое — в склейках smashAdd,
   гости и маскоты — инстансами (2 + 7 отрисовок на город). Маскоты живут
   и считаются только у точек ближе NEAR м.

   Из game.js: build(api) — при сборке города (до деревьев и smashBuild),
   step(dt) — каждый кадр, nextEdge(t, e) — поворот курьера к цели,
   onRespawn(t) — машина потока стала обычной, reset() — новая смена,
   blocks(x, z, m) — участок точки (деревья и лавочки не встают).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { warmth } from './seasons.js';
import * as RESPECT from './respect.js';
import * as MOPEDS from './mopeds.js';
import * as CONSTR from './construction.js';

export const RIV = {
  PER_DIST: 2, MAX: 26, NODIST: 6,     // точек сети в районе; всего; без районов на карте
  GAP_ANY: 160, GAP_SAME: 520, GAP_2ND: 700,   // м: между любыми точками; одной сети; вторая точка сети в районе
  W: 16, D: 12, TER: 9, SIDE: 3,      // павильон вдоль улицы и вглубь, терраса, поля по бокам, м
  SET: 3.4,                            // терраса — в стольких м от края полотна (точка у ТЦ)
  H: 5.6, ROOF: 1.7,                   // высота павильона; во столько раз крупнее фигура на крыше
  WALL: 18,                            // м: участок на пустыре — не ближе к стене любого дома
  HOUSE: 2, ENTR: 16, PIZZA: 160, POI: 11, SLOPE: 1.2, STEP: 24, MALL_R: 320,
  NEAR: 200, FAR: 260,                 // м: маскоты — у точек ближе; дальше — спят
  MASCOTS: [2, 3], MASCOT_BACK: 40, MASCOT_COOL: 25,
  SHOP_HITS: 3,                        // сбил столько вещей одной точки — «разнёс точку»
  WINTER: 0.5,                         // warmth() ≥ — терраса застеклена
  SUSHI: 2, SUSHI_NEAR: 3, SUSHI_R: 600,   // мопедов-суши в городе; ещё, если точка суши ближе SUSHI_R
  BCAR_MAX: 2, BCAR_R: 550, BCAR_P: 0.35,  // машин-бургеров; родилась ближе BCAR_R к бургерной — с шансом BCAR_P
  JOB_R: [90, 560],                    // адреса курьеров конкурентов — в стольких м от точки
  WHO_R: 45,                           // м: сбил «ты», если был ближе
};

/* сети: цвета павильона, зонтиков, маскоты */
const CH = {
  sushi: { key: 'sushi', name: N_('Вселенная суши'), main: '#2fa8e0', dark: '#163e6e', wall: '#f2f8fb', trim: '#2fa8e0', base: '#163e6e', umb: ['#2fa8e0', '#ffffff'], mascots: ['roll', 'oni', 'roll'], say: '#2f8fd0' },
  burger: { key: 'burger', name: N_('Королева Бургеров'), main: '#f6c21c', dark: '#1f4fa8', wall: '#1f4fa8', trim: '#f6c21c', base: '#14306a', umb: ['#f6c21c', '#1f4fa8'], mascots: ['burger', 'burger', 'burger'], say: '#d9a10e' },
};
const LINES = {
  sushi: [N_('ролл — это любовь!'), N_('палочки — сила!'), N_('суши быстрее пиццы!'), N_('во Вселенной вкуснее'), N_('рис не прощает')],
  burger: [N_('да здравствует Королева!'), N_('пицца — плоский бургер'), N_('бургер — король еды!'), N_('корона не жмёт'), N_('двойной сыр — двойная честь')],
  up: { sushi: [N_('я ещё заверну!'), N_('палочки целы…')], burger: [N_('корону не трожь!'), N_('я ещё вернусь! с картошкой!')] },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

let A = null;
const SHOPS = [];        // точки: { chain, x, z, ux, uz, nx, nz, gy, dist, items, guests, mascots, hits, paid, jobs }
const ST = { tried: 0, tested: 0, ms: 0, why: {}, items: 0, guests: 0, shopHits: 0, broke: 0, mascotHits: 0, couriers: 0, cars: 0, bcars: 0, sushi: 0, season: '' };

/* ═════════════ вывески и логотипы (кодом) ═════════════ */
function circle (x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
function rrect (x, x0, y0, w, h, r, col) { x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(x0, y0, w, h, r) : x.rect(x0, y0, w, h); x.fill(); }
/* ролл-планета с кольцом и звёздами: в квадрате 100×100 от (0, 0) */
function logoSushi (x) {
  for (let i = 0; i < 7; i++) circle(x, 8 + i * 14, 8 + (i * 41) % 26, 2.2, '#ffffff');
  x.strokeStyle = '#9be3ff'; x.lineWidth = 6;
  x.beginPath(); x.ellipse(50, 56, 46, 13, -0.35, Math.PI * 0.95, Math.PI * 2.05); x.stroke();
  circle(x, 50, 56, 30, '#1d3b2c'); circle(x, 50, 56, 24, '#ffffff'); circle(x, 50, 56, 11, '#f07a5a'); circle(x, 46, 52, 4, '#7fd06a');
  x.beginPath(); x.ellipse(50, 56, 46, 13, -0.35, Math.PI * 0.05, Math.PI * 0.95); x.stroke();
}
/* бургер в короне */
function logoBurger (x) {
  x.fillStyle = '#ffd84a'; x.beginPath();
  for (const [a, b] of [[28, 26], [34, 8], [42, 20], [50, 2], [58, 20], [66, 8], [72, 26]]) x.lineTo(a, b);
  x.closePath(); x.fill();
  rrect(x, 18, 28, 64, 22, 14, '#e8a54a');
  rrect(x, 14, 50, 72, 8, 4, '#5fb04a');
  rrect(x, 16, 58, 68, 6, 3, '#ffcf3a');
  rrect(x, 16, 64, 68, 12, 6, '#7a3f22');
  rrect(x, 18, 76, 64, 14, 7, '#e8a54a');
}
const SIGN_W = 1024, SIGN_H = 192;
function signCanvas (ch) {
  const c = document.createElement('canvas');
  c.width = SIGN_W; c.height = SIGN_H;
  const x = c.getContext('2d');
  const bg = ch.key === 'sushi' ? '#163e6e' : '#1f4fa8', fg = ch.key === 'sushi' ? '#ffffff' : '#ffd84a', rim = ch.main;
  rrect(x, 0, 0, SIGN_W, SIGN_H, 40, rim);
  rrect(x, 10, 10, SIGN_W - 20, SIGN_H - 20, 32, bg);
  x.save(); x.translate(26, 14); x.scale(1.64, 1.64);
  (ch.key === 'sushi' ? logoSushi : logoBurger)(x);
  x.restore();
  const txt = t(ch.name).toUpperCase();
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 96;
  do { x.font = '900 ' + fs + 'px Arial, "Helvetica Neue", sans-serif'; fs -= 2; } while (x.measureText(txt).width > SIGN_W - 250 && fs > 24);
  x.fillText(txt, (SIGN_W + 190) / 2, SIGN_H / 2 + 4);
  return c;
}
/* все вывески сети — одним мешем с одной текстурой */
const SIGNQ = { sushi: [], burger: [] };   // [x, y, z, ux, uz, w, h] — плоскость лицом в (−uz, ux)… задаётся нормалью
function signQuad (key, cx, cy, cz, ax, az, w, h) { SIGNQ[key].push([cx, cy, cz, ax, az, w, h]); }
function buildSigns () {
  for (const key of ['sushi', 'burger']) {
    const Q = SIGNQ[key];
    if (!Q.length) continue;
    const P = [], U = [], I = [];
    for (const [cx, cy, cz, ax, az, w, h] of Q) {
      const o = P.length / 3, hx = ax * w / 2, hz = az * w / 2;
      P.push(cx - hx, cy - h / 2, cz - hz, cx + hx, cy - h / 2, cz + hz, cx + hx, cy + h / 2, cz + hz, cx - hx, cy + h / 2, cz - hz);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(signCanvas(CH[key]));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
    m.matrixAutoUpdate = false; m.name = 'rival-signs-' + key;
    A.scene.add(m);
  }
}

/* ═════════════ поиск места ═════════════ */
function inPoly (x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function grid (cell) {
  const m = new Map();
  return {
    add (x0, z0, x1, z1, v) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
          const k = i + ',' + j;
          let a = m.get(k);
          if (!a) m.set(k, a = []);
          a.push(v);
        }
    },
    at: (x, z) => m.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)),
    near (x, z, R, fn) {
      for (let i = Math.floor((x - R) / cell); i <= Math.floor((x + R) / cell); i++)
        for (let j = Math.floor((z - R) / cell); j <= Math.floor((z + R) / cell); j++) {
          const a = m.get(i + ',' + j);
          if (a) for (const v of a) if (fn(v) === false) return false;
        }
      return true;
    },
  };
}
function segD (x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  const q = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
  return Math.hypot(x - x1 - dx * q, z - z1 - dz * q);
}
const WT = () => RIV.W + RIV.SIDE * 2, DT = () => RIV.TER + RIV.D + 1.2;

function finder () {
  const C = A.CITY;
  const POLY = grid(100);
  const addP = p => { if (!p || p.length < 3) return; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } POLY.add(x0, z0, x1, z1, { p, x0, z0, x1, z1 }); };
  for (const g of C.green || []) addP(g.p);
  for (const l of C.lots || []) addP(l.p);
  for (const l of C.garlots || []) addP(l);
  for (const m of C.malls || []) addP(m.p);
  const LINE = grid(32);
  const addL = pts => { for (let i = 1; i < pts.length; i++) { const [x1, z1] = pts[i - 1], [x2, z2] = pts[i]; LINE.add(Math.min(x1, x2) - 3, Math.min(z1, z2) - 3, Math.max(x1, x2) + 3, Math.max(z1, z2) + 3, [x1, z1, x2, z2]); } };
  for (const p of C.paths || []) addL(p);
  for (const r of C.rails || []) addL(r.p);
  for (const s of C.streams || []) addL(s.p);
  const SOL = grid(30);
  for (const s of A.SOLIDS) SOL.add(s.cx - s.ex, s.cz - s.ez, s.cx + s.ex, s.cz + s.ez, s);
  const ENT = grid(50);
  for (const e of (C.entrances || []).concat(A.GEN_ENTR || [])) ENT.add(e[0], e[1], e[0], e[1], e);
  const POI = grid(50);
  for (const p of C.pois || []) { const q = p.w || p.p; if (q) POI.add(q[0], q[1], q[0], q[1], q); }
  for (const k of C.kpp || []) POI.add(k.p[0], k.p[1], k.p[0], k.p[1], k.p);
  for (const s of C.stops || []) POI.add(s.p[0], s.p[1], s.p[0], s.p[1], s.p);
  const piz = (A.PIZZERIAS || []).map(p => [p.bx || p.x || 0, p.bz || p.z || 0]);

  const inPolys = (x, z) => { const a = POLY.at(x, z); if (a) for (const b of a) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inPoly(x, z, b.p)) return true; return false; };
  const nearLine = (x, z, m) => { const a = LINE.at(x, z); if (a) for (const s of a) if (segD(x, z, s[0], s[1], s[2], s[3]) < m) return true; return false; };
  const inSolid = (x, z, r) => {
    const a = SOL.at(x, z);
    if (a) for (const s of a) {
      const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
      if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
    }
    return false;
  };
  const no = k => { ST.why[k] = (ST.why[k] || 0) + 1; return false; };
  /* участок: (fx, fz) — середина переднего края (к улице), ось вдоль улицы (ux, uz), вглубь — (nx, nz) */
  function test (s) {
    const { fx, fz, ux, uz, nx, nz } = s, W = WT(), D = DT();
    const P = (a, b) => [fx + ux * a + nx * b, fz + uz * a + nz * b];
    let h0 = Infinity, h1 = -Infinity;
    const pts = [[0, D / 2], [-W / 2, 0], [W / 2, 0], [W / 2, D], [-W / 2, D]];
    for (let a = -W / 2 - 1; a <= W / 2 + 1.01; a += 2.5) for (let b = -1; b <= D + 1.01; b += 2.5) pts.push([a, b]);
    for (const [a, b] of pts) {
      const [px, pz] = P(a, b);
      if (!A.inBounds(px, pz, 50)) return no('bounds');
      if (A.inHouse(px, pz, RIV.HOUSE)) return no('house');
      const gy = A.groundH(px, pz);
      if (gy < 0.5) return no('water');
      h0 = Math.min(h0, gy); h1 = Math.max(h1, gy);
      if (h1 - h0 > RIV.SLOPE) return no('slope');
      if (inPolys(px, pz)) return no('poly');
      if (nearLine(px, pz, 2.2)) return no('path');
      if (inSolid(px, pz, 1)) return no('solid');
      const r = A.nearestRoad(px, pz, 7, 1);
      if (r && r.d < r.seg.w / 2 + 1.2) return no('road');
    }
    // улица у террасы — та самая и прямая
    for (const a of [-W / 2, 0, W / 2]) {
      const [px, pz] = P(a, 0), r = A.nearestRoad(px, pz, 5, 1);
      if (!r || r.d > r.seg.w / 2 + RIV.SET + 2) return no('curve');
    }
    // подъезды (пины заказов), двери магазинов, остановки
    const cx = fx + nx * D / 2, cz = fz + nz * D / 2, R = Math.hypot(W, D) / 2;
    const rectD = (x, z) => { const dx = x - cx, dz = z - cz, la = Math.abs(dx * ux + dz * uz) - W / 2, lb = Math.abs(dx * nx + dz * nz) - D / 2; return Math.hypot(Math.max(0, la), Math.max(0, lb)); };
    if (!ENT.near(cx, cz, R + RIV.ENTR, e => !(rectD(e[0], e[1]) < RIV.ENTR))) return no('entr');
    if (!POI.near(cx, cz, R + RIV.POI, p => !(rectD(p[0], p[1]) < RIV.POI))) return no('poi');
    for (const p of piz) if (Math.hypot(p[0] - cx, p[1] - cz) < RIV.PIZZA) return no('pizza');
    s.gy = (h0 + h1) / 2; s.cx = cx; s.cz = cz;
    return true;
  }
  return { test };
}

function mallCenters () {
  const C = A.CITY, out = [];
  for (const m of C.malls || []) {
    let p = m.p;
    if (!p && m.id !== undefined) { const b = (C.buildings || []).find(q => q.id === m.id); p = b && b.p; }
    if (!p || !p.length) continue;
    let x = 0, z = 0;
    for (const q of p) { x += q[0] / p.length; z += q[1] / p.length; }
    out.push([x, z]);
  }
  return out;
}

/* стены домов: отрезки контуров в сетке — расстояние от участка до ближайшей стены */
function wallGrid () {
  const G = grid(40);
  for (const b of A.CITY.buildings || []) {
    const p = b.p;
    if (!p || p.length < 2) continue;
    for (let i = 0; i < p.length; i++) {
      const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length];
      G.add(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), [x1, z1, x2, z2]);
    }
  }
  return G;
}
/* от прямоугольника (центр x, z; ось u; полуразмеры hw, hd) до ближайшей стены, не дальше R */
function rectWall (G, x, z, ux, uz, hw, hd, R) {
  const nx = -uz, nz = ux;
  const L = (px, pz) => { const dx = px - x, dz = pz - z; return [dx * ux + dz * uz, dx * nx + dz * nz]; };
  const ptRect = (a, b) => Math.hypot(Math.max(0, Math.abs(a) - hw), Math.max(0, Math.abs(b) - hd));
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  let best = R;
  const seen = new Set();
  G.near(x, z, Math.hypot(hw, hd) + R, sg => {
    if (seen.has(sg)) return; seen.add(sg);
    const [a1, b1] = L(sg[0], sg[1]), [a2, b2] = L(sg[2], sg[3]);
    let d = Math.min(ptRect(a1, b1), ptRect(a2, b2));
    for (const [ca, cb] of corners) d = Math.min(d, segD(ca, cb, a1, b1, a2, b2));
    // отрезок пересекает прямоугольник: середина или пересечение с осями — грубо, по 8 точкам
    if (d > 0) for (let k = 1; k < 8; k++) { const q = k / 8; d = Math.min(d, ptRect(a1 + (a2 - a1) * q, b1 + (b2 - b1) * q)); }
    if (d < best) best = d;
  });
  return best;
}

/* точки на пустырях: тот же отбор, что у строек (construction.js freeLots) — участок под всю
   точку с полями, от стен домов ≥ WALL, от наших пиццерий ≥ PIZZA, от строек, костров и котлов
   (общий список занятых) — край + 15 м. Районы без пустыря — 1 точка у ТЦ (mallSites). */
function findSites () {
  const G = wallGrid(), LW = WT() + 2, LD = DT() + 1;
  const piz = (A.PIZZERIAS || []).map(p => [p.bx || p.x || 0, p.bz || p.z || 0]);
  const D = !!A.distAt, cap = D ? RIV.MAX : RIV.NODIST;
  const ok = c => {
    for (const p of piz) if (Math.hypot(p[0] - c.x, p[1] - c.z) < RIV.PIZZA) return false;
    return rectWall(G, c.x, c.z, c.ux, c.uz, LW / 2, LD / 2, RIV.WALL) >= RIV.WALL;
  };
  const lots = CONSTR.freeLots({ W: LW, D: LD, max: cap, gap: RIV.GAP_ANY, salt: 31, per: 2, cap: RIV.PER_DIST * 2, ok, claim: false });
  ST.lots = lots.length;
  const per = new Map(), sites = [];
  const far = (c, chain, gapSame) => sites.every(s => s.chain !== chain || Math.hypot(s.cx - c.cx, s.cz - c.cz) > gapSame);
  for (const l of lots) {
    const nx = -l.uz, nz = l.ux, fx = l.x - nx * LD / 2, fz = l.z - nz * LD / 2;
    const c = { fx, fz, ux: l.ux, uz: l.uz, nx, nz, gy: l.gy, cx: fx + nx * DT() / 2, cz: fz + nz * DT() / 2, h: hash(l.x, l.z, 17), lot: 1 };
    const di = D ? l.dist : 0;
    const ns = per.get(di + ':sushi') || 0, nb = per.get(di + ':burger') || 0;
    const order = ns < nb ? ['sushi', 'burger'] : nb < ns ? ['burger', 'sushi'] : c.h < 0.5 ? ['sushi', 'burger'] : ['burger', 'sushi'];
    let chain = null;
    for (const k of order) { const n = per.get(di + ':' + k) || 0; if (n < RIV.PER_DIST && far(c, k, n ? RIV.GAP_2ND : RIV.GAP_SAME)) { chain = k; break; } }
    if (!chain) continue;
    c.dist = di; c.chain = chain;
    per.set(di + ':' + chain, (per.get(di + ':' + chain) || 0) + 1);
    sites.push(c);
    CONSTR.claim(l.x, l.z, Math.hypot(LW, LD) / 2);
  }
  mallSites(sites);
  return sites;
}

/* районы без пустыря — по 1 точке у ТЦ, прежним отбором (у улицы, без домов на участке) */
function mallSites (sites) {
  const F = finder(), malls = mallCenters();
  if (!malls.length) return;
  const have = new Set(sites.map(s => s.dist));
  const cands = [];
  for (const r of A.CITY.roads) {
    if (r.c < 2 || r.c > 4 || r.b || r.x) continue;
    const w = A.roadWidth(r);
    let acc = RIV.STEP / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 1) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      for (; acc < L; acc += RIV.STEP) {
        const px = x1 + ux * acc, pz = z1 + uz * acc;
        for (const sd of [1, -1]) {
          const vx = ux * sd, vz = uz * sd, nx = -vz, nz = vx, off = w / 2 + RIV.SET;
          const fx = px + nx * off, fz = pz + nz * off;
          let dm = Infinity;
          for (const m of malls) dm = Math.min(dm, Math.hypot(m[0] - fx, m[1] - fz));
          if (dm > RIV.MALL_R) continue;
          const pr = dm / RIV.MALL_R + hash(px, pz, sd > 0 ? 11 : 13) * 0.3;
          cands.push({ fx, fz, ux: vx, uz: vz, nx, nz, pr, h: hash(px, pz, 17) });
        }
      }
      acc -= L;
    }
  }
  ST.tried = cands.length;
  cands.sort((a, b) => a.pr - b.pr);
  const D = !!A.distAt, cap = D ? RIV.MAX : RIV.NODIST, n0 = sites.length;
  const far = c => sites.every(s => Math.hypot(s.cx - c.cx, s.cz - c.cz) > RIV.GAP_ANY);
  const busy = CONSTR.claimed(), R = Math.hypot(WT(), DT()) / 2;
  for (const c of cands) {
    if (sites.length >= cap) break;
    c.cx = c.fx + c.nx * DT() / 2; c.cz = c.fz + c.nz * DT() / 2;
    const di = D ? A.distAt(c.cx, c.cz) : 0;
    if (have.has(di) || !far(c) || !busy.every(a => Math.hypot(a.x - c.cx, a.z - c.cz) > R + a.r + 15)) continue;
    ST.tested++;
    if (!F.test(c)) continue;
    c.dist = di; c.chain = c.h < 0.5 ? 'sushi' : 'burger'; c.mall = 1;
    have.add(di);
    sites.push(c);
    CONSTR.claim(c.cx, c.cz, R);
  }
  ST.mall = sites.length - n0;
}

/* ═════════════ постройка точки ═════════════ */
let GLASS_P = [], GLASS_F = [], GLASS_ITEMS = [];   // стёкла зимы: геометрии стёкол (сбиваются) и рам с крышей
let GLASS_MESH = null, FRAME_MESH = null, GLASS_ORIG = null;
const SEAT = [];         // гости: { shop, x, y, z, ry, c, k, table }

function build1 (s, idx) {
  const ch = CH[s.chain], { ux, uz, nx, nz } = s, gy = s.gy, W = RIV.W, D = RIV.D, TER = RIV.TER, SIDE = RIV.SIDE, H = RIV.H;
  const P = (a, b) => [s.fx + ux * a + nx * b, s.fz + uz * a + nz * b];
  const ry = Math.atan2(-nx, -nz);              // «перёд» (+Z модели) — к улице
  const ryU = Math.atan2(ux, uz);               // ось z модели — вдоль улицы
  const { put, LIT, LITM, LAMPH } = A;
  const B = (w, h, d, hex, a, y, b, list = LIT) => { const [x, z] = P(a, b); A.box(list, w, h, d, hex, x, y, z, ry); };
  const shop = { i: idx, mall: s.mall || 0, chain: s.chain, name: ch.name, x: s.cx, z: s.cz, fx: s.fx, fz: s.fz, ux, uz, nx, nz, gy, ry, dist: s.dist, items: [], umbs: [], tables: [], hits: 0, paid: 0, mascots: [], near: false, jobs: [], roam: [] };

  // площадка из плитки под всем участком и деревянная терраса
  {
    const [x1, z1] = P(0, -1.2), [x2, z2] = P(0, DT() + 0.2);
    LITM.color(s.chain === 'sushi' ? '#d7dde0' : '#ddd5c4'); LITM.ribbon(x1, z1, x2, z2, WT() + 0.4, 0.12);
  }
  B(W - 0.2, 0.5, TER, '#a87b52', 0, gy - 0.1, TER / 2);                       // настил
  for (let a = -W / 2 + 0.6; a < W / 2 - 0.3; a += 1.2) B(0.06, 0.02, TER - 0.1, '#8d6440', a, gy + 0.16, TER / 2);   // доски
  B(W, 0.12, 0.14, ch.trim, 0, gy + 0.12, 0.05);                                // кант по краю

  // павильон: цоколь, стены, полоса цвета сети, крыша с бортом
  const b0 = TER, bm = TER + D / 2;
  B(W + 0.3, 0.6, D + 0.3, ch.base, 0, gy, bm);
  B(W, H, D, ch.wall, 0, gy + H / 2 + 0.2, bm);
  B(W + 0.08, 0.35, D + 0.08, ch.trim, 0, gy + 0.55, bm);
  B(W + 0.5, 0.35, D + 0.5, ch.dark, 0, gy + H + 0.35, bm);                     // карниз
  B(W + 0.5, 0.5, 0.25, ch.trim, 0, gy + H + 0.75, b0 - 0.12);                  // борт крыши спереди
  // витрина к террасе: тёплое стекло во всю стену, рамы, дверь
  {
    const [x, z] = P(0, b0 - 0.03);
    put(LAMPH, new THREE.PlaneGeometry(W - 1.2, 3.2), s.chain === 'sushi' ? '#d9f1ff' : '#ffe2a8', x, gy + 2.2, z, 0, ry, 0);
    for (let a = -W / 2 + 0.6; a <= W / 2 - 0.59; a += (W - 1.2) / 6) B(0.14, 3.3, 0.08, ch.dark, a, gy + 2.2, b0 - 0.06);
    B(W - 1.0, 0.16, 0.1, ch.dark, 0, gy + 3.85, b0 - 0.06);
    B(W - 1.0, 0.16, 0.1, ch.dark, 0, gy + 0.62, b0 - 0.06);
    B(1.8, 2.7, 0.06, s.chain === 'sushi' ? '#8fc9e6' : '#cfa86a', W / 2 - 2, gy + 1.7, b0 - 0.09);   // дверь
    // внутри у стекла — стойка и «меню» над ней
    const [mx, mz] = P(-2, b0 - 0.05);
    put(LAMPH, new THREE.PlaneGeometry(5.4, 0.8), ch.dark, mx, gy + 3.3, mz, 0, ry, 0);
    for (let i = 0; i < 5; i++) { const [qx, qz] = P(-4.2 + i * 1.1, b0 - 0.06); put(LAMPH, new THREE.PlaneGeometry(0.85, 0.42), ch.main, qx, gy + 3.3, qz, 0, ry, 0); }
    // боковые окна
    for (const sd of [-1, 1]) {
      const [x2, z2] = P(sd * (W / 2 + 0.03), bm);
      put(LAMPH, new THREE.PlaneGeometry(D - 2.6, 2.0), s.chain === 'sushi' ? '#d9f1ff' : '#ffe2a8', x2, gy + 2.5, z2, 0, ry + sd * Math.PI / 2, 0);
    }
  }
  // вывеска над витриной — текстурой сети
  {
    // ось «право» вывески — против ux: лицевая сторона смотрит к улице (−n)
    const [x, z] = P(0, b0 - 0.42), sw = Math.min(W - 1.5, 13), sh = sw * SIGN_H / SIGN_W, sy = gy + 4.0 + sh / 2;
    signQuad(s.chain, x, sy, z, -ux, -uz, sw, sh);
    B(sw + 0.2, sh + 0.12, 0.12, ch.dark, 0, sy, b0 - 0.33);
  }

  // фигура на крыше
  const rx = s.fx + nx * bm, rz = s.fz + nz * bm, ty = gy + H + 0.55, K = RIV.ROOF;
  // фигура — в своих осях, потом ×K и на крышу
  const fig = [], putF = (_, geo, hex, x, y, z, ax = 0, ay = 0, az = 0) => put(fig, geo, hex, x, y, z, ax, ay, az);
  {
  const put = putF, rx = 0, rz = 0, ty = 0;
  if (s.chain === 'sushi') {
    // ролл-планета с кольцом, палочки воткнуты, звёзды
    put(LIT, new THREE.CylinderGeometry(1.5, 1.5, 1.7, 18), '#1d3b2c', rx, ty + 1.05, rz);
    put(LIT, new THREE.CylinderGeometry(1.36, 1.36, 0.06, 18), '#f8f6ef', rx, ty + 1.92, rz);
    put(LIT, new THREE.CylinderGeometry(0.58, 0.58, 0.08, 12), '#f07a5a', rx, ty + 1.95, rz);
    put(LIT, new THREE.BoxGeometry(0.3, 0.08, 0.3), '#7fd06a', rx + 0.7, ty + 1.95, rz + 0.3);
    put(LIT, new THREE.TorusGeometry(2.4, 0.13, 4, 36), ch.main, rx, ty + 1.1, rz, Math.PI / 2 - 0.35, ry, 0);
    for (const o of [-0.25, 0.25]) put(LIT, new THREE.BoxGeometry(0.1, 3.0, 0.1), '#d8b07a', rx + ux * o, ty + 2.6, rz + uz * o, 0, ryU, 0.35);
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; put(LIT, new THREE.OctahedronGeometry(0.22, 0), '#ffd84a', rx + Math.cos(a) * 3.2, ty + 0.4 + (i % 3) * 0.9, rz + Math.sin(a) * 3.2); }
    put(LIT, new THREE.BoxGeometry(0.2, 0.9, 0.2), '#585460', rx, ty + 0.2, rz);
  } else {
    // бургер в короне
    const R = 1.9;
    const L = [[R, 0.55, '#e8a84f', 0.3], [R * 1.02, 0.36, '#7a4526', 0.75], [R * 1.06, 0.12, '#5fbf4a', 1.0], [R * 0.94, 0.12, '#e04836', 1.12]];
    for (const [r, h, c, y] of L) put(LIT, new THREE.CylinderGeometry(r, r * 1.03, h, 18), c, rx, ty + y, rz);
    put(LIT, new THREE.BoxGeometry(R * 1.75, 0.07, R * 1.75), '#ffd34d', rx, ty + 0.96, rz, 0, ry + 0.5, 0);
    put(LIT, new THREE.SphereGeometry(R, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', rx, ty + 1.18, rz);
    for (let i = 0; i < 9; i++) { const a = i * 2.4; put(LIT, new THREE.SphereGeometry(0.09, 5, 4), '#fff3d6', rx + Math.cos(a) * R * 0.62, ty + 1.18 + R * 0.74, rz + Math.sin(a) * R * 0.62); }
    put(LIT, new THREE.CylinderGeometry(0.8, 0.8, 0.45, 12, 1, true), '#f2c230', rx, ty + 1.18 + R + 0.12, rz);
    for (let i = 0; i < 5; i++) { const a = i * 1.257; put(LIT, new THREE.ConeGeometry(0.17, 0.5, 4), '#f2c230', rx + Math.cos(a) * 0.76, ty + 1.18 + R + 0.55, rz + Math.sin(a) * 0.76); }
    put(LIT, new THREE.SphereGeometry(0.16, 6, 5), '#e04836', rx + ux * 0.8 - nx * 0.05, ty + 1.18 + R + 0.15, rz + uz * 0.8 - nz * 0.05);
  }
  }
  for (const g of fig) { g.scale(K, K, K); g.translate(rx, ty, rz); LIT.push(g); }

  // препятствие и «дом» — павильон
  {
    const [x, z] = P(0, bm);
    A.obb(x, z, W / 2 + 0.15, D / 2 + 0.15, -ry);
    A.addFoot([P(-W / 2 - 0.2, b0 - 0.1), P(W / 2 + 0.2, b0 - 0.1), P(W / 2 + 0.2, b0 + D + 0.2), P(-W / 2 - 0.2, b0 + D + 0.2)], 'rival');
  }

  // ── сбиваемое: столики, зонтики, кадки, стела, доска ──
  const item = (kind, a, b, r, g, hex) => {
    const [x, z] = P(a, b);
    const it = A.smashAdd(kind, x, z, r, g, hex);
    it.rshop = shop; it.onDown = onItemDown;
    shop.items.push(it);
    ST.items++;
    return it;
  };
  const cols = 4, rows = 3, ta = (W - 2.6) / (cols - 1), tb = (TER - 2.6) / (rows - 1);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = -W / 2 + 1.3 + i * ta, b = 1.3 + j * tb, [x, z] = P(a, b), y = gy + 0.16, g = [];
    put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), '#f4f1ea', x, y + 0.75, z);
    put(g, new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), '#585460', x, y + 0.38, z);
    put(g, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 8), '#585460', x, y + 0.02, z);
    // еда на столе: суши — доска с роллами, бургер — бургеры и стаканы
    if (s.chain === 'sushi') {
      put(g, new THREE.BoxGeometry(0.5, 0.04, 0.18), '#c9955a', x, y + 0.8, z, 0, ry, 0);
      for (const o of [-0.15, 0, 0.15]) put(g, new THREE.CylinderGeometry(0.06, 0.06, 0.07, 6), '#1d3b2c', x + ux * o, y + 0.85, z + uz * o);
    } else {
      for (const o of [-0.18, 0.18]) put(g, new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), '#e8a84f', x + ux * o, y + 0.83, z + uz * o);
      put(g, new THREE.CylinderGeometry(0.05, 0.04, 0.16, 6), '#e04836', x + nx * 0.2, y + 0.86, z + nz * 0.2);
    }
    const seats = [];
    const nSeat = 2 + ((hash(x, z, 3) * 2) | 0);       // 2—3 стула
    for (let k = 0; k < nSeat; k++) {
      const ang = ry + Math.PI / 2 + k * (Math.PI * 2 / nSeat) + (i + j) * 0.4, sx = x + Math.sin(ang) * 0.85, sz = z + Math.cos(ang) * 0.85;
      put(g, new THREE.BoxGeometry(0.42, 0.06, 0.42), ch.dark, sx, y + 0.45, sz, 0, ang, 0);
      put(g, new THREE.BoxGeometry(0.42, 0.45, 0.05), ch.dark, sx + Math.sin(ang) * 0.2, y + 0.68, sz + Math.cos(ang) * 0.2, 0, ang, 0);
      for (const [p, q] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
        const cs = Math.cos(ang), sn = Math.sin(ang);
        put(g, new THREE.BoxGeometry(0.04, 0.45, 0.04), '#585460', sx + p * cs + q * sn, y + 0.22, sz - p * sn + q * cs);
      }
      seats.push([sx, sz, ang + Math.PI]);              // гость смотрит на стол
    }
    const it = item('table', a, b, 1.1, g, '#f4f1ea');
    it.guests = [];
    for (const [sx, sz, gr] of seats) if (hash(sx, sz, 5) < 0.86) {
      const q = { shop, x: sx, y: y, z: sz, ry: gr, k: SEAT.length, table: it, on: 1 };
      SEAT.push(q); it.guests.push(q);
    }
    shop.tables.push(it);
    // зонтик — отдельной вещью: зимой его нет
    const ug = [], [ux2, uz2] = P(a, b);
    put(ug, new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), '#585460', ux2, y + 1.15, uz2);
    put(ug, new THREE.ConeGeometry(1.5, 0.55, 8), ch.umb[(i + j) % 2], ux2, y + 2.4, uz2);
    put(ug, new THREE.CylinderGeometry(1.5, 1.5, 0.12, 8, 1, true), ch.umb[(i + j + 1) % 2], ux2, y + 2.1, uz2);
    const u = item('umbrella', a + 0.01, b + 0.01, 0.5, ug, ch.umb[(i + j) % 2]);
    shop.umbs.push(u);
  }
  // кадки с цветами по краю террасы (проход посередине)
  for (let a = -W / 2 + 0.6; a <= W / 2 - 0.59; a += 1.3) {
    if (Math.abs(a) < 1.4) continue;
    const [x, z] = P(a, 0.35), y = gy + 0.16, g = [];
    put(g, new THREE.BoxGeometry(1.1, 0.5, 0.45), s.chain === 'sushi' ? '#f4f8fa' : '#1f4fa8', x, y + 0.25, z, 0, ry, 0);
    put(g, new THREE.IcosahedronGeometry(0.42, 0), '#4f8f3f', x, y + 0.72, z);
    put(g, new THREE.IcosahedronGeometry(0.16, 0), s.chain === 'sushi' ? '#ff8ab0' : '#ffd84a', x + ux * 0.25, y + 0.98, z + uz * 0.25);
    item('planter', a, 0.35, 0.8, g, '#4f8f3f');
  }
  // стела у тротуара: столб и короб с логотипом (цветами)
  {
    const a = (W / 2 + SIDE * 0.55) * (hash(s.fx, s.fz, 8) < 0.5 ? -1 : 1), b = -0.4, [x, z] = P(a, b), y = gy, g = [];
    put(g, new THREE.BoxGeometry(0.22, 3.4, 0.22), '#585460', x, y + 1.7, z);
    put(g, new THREE.BoxGeometry(1.6, 1.2, 0.3), ch.dark, x, y + 3.6, z, 0, ry, 0);
    const F = (geo, hex, ly) => put(g, geo, hex, x - nx * 0.17, y + ly, z - nz * 0.17, Math.PI / 2, ry, 0);
    if (s.chain === 'sushi') {
      F(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 14), '#1d3b2c', 3.6);
      F(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 14), '#ffffff', 3.6);
      F(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), '#f07a5a', 3.6);
    } else {
      for (const [hex, ly, w] of [['#e8a84f', 3.85, 0.9], ['#5fbf4a', 3.66, 1.0], ['#7a4526', 3.52, 0.95], ['#e8a84f', 3.36, 0.9]]) put(g, new THREE.BoxGeometry(w, 0.14, 0.06), hex, x - nx * 0.17, y + ly, z - nz * 0.17, 0, ry, 0);
    }
    put(g, new THREE.BoxGeometry(1.7, 0.12, 0.34), ch.main, x, y + 4.26, z, 0, ry, 0);
    item('sign', a, b, 0.7, g, ch.main);
  }
  // меню-доска у входа на террасу
  {
    const [x, z] = P(1.9, -0.6), y = gy, g = [];
    put(g, new THREE.BoxGeometry(0.7, 1.0, 0.05), '#2b2a30', x, y + 0.55, z, -0.18, ry, 0);
    put(g, new THREE.BoxGeometry(0.55, 0.12, 0.06), ch.main, x - nx * 0.04, y + 0.85, z - nz * 0.04, -0.18, ry, 0);
    put(g, new THREE.BoxGeometry(0.45, 0.05, 0.06), '#f4f1ea', x - nx * 0.04, y + 0.6, z - nz * 0.04, -0.18, ry, 0);
    put(g, new THREE.BoxGeometry(0.45, 0.05, 0.06), '#f4f1ea', x - nx * 0.04, y + 0.45, z - nz * 0.04, -0.18, ry, 0);
    item('board', 1.9, -0.6, 0.5, g, '#2b2a30');
  }

  // ── зимняя застеклённая терраса: рамы, крыша и стёкла (стёкла сбиваются) ──
  {
    const HG = 2.7, y = gy + 0.16, fr = '#e8ecef';
    const pane = (a0, b0_, a1, b1_) => {
      const [x0, z0] = P(a0, b0_), [x1, z1] = P(a1, b1_), L = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, r2 = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      const g = new THREE.PlaneGeometry(L - 0.08, HG - 0.1).toNonIndexed();
      g.rotateY(r2); g.translate(mx, y + HG / 2, mz);
      GLASS_P.push({ g, x: mx, z: mz, shop });
      A.put(GLASS_F, A.boxGeo(0.09, HG, 0.09), fr, x0, y + HG / 2, z0);
    };
    const nP = 8, pw = W / nP;
    for (let i = 0; i < nP; i++) pane(-W / 2 + i * pw, 0, -W / 2 + (i + 1) * pw, 0);
    for (const sd of [-1, 1]) {
      const n2 = 5, pd = TER / n2;
      for (let i = 0; i < n2; i++) pane(sd * W / 2, i * pd, sd * W / 2, (i + 1) * pd);
    }
    { const [x, z] = P(W / 2, 0); A.put(GLASS_F, A.boxGeo(0.09, HG, 0.09), fr, x, y + HG / 2, z); }
    const [cx, cz] = P(0, TER / 2);
    A.box(GLASS_F, W + 0.2, 0.16, TER + 0.1, fr, cx, y + HG + 0.08, cz, ry);              // крыша
    A.box(GLASS_F, W + 0.3, 0.1, TER + 0.2, ch.trim, cx, y + HG + 0.2, cz, ry);
    const [fx2, fz2] = P(0, 0);
    A.box(GLASS_F, W + 0.1, 0.12, 0.12, fr, fx2, y + 0.06, fz2, ry);                        // нижняя обвязка
  }

  // места для маскотов: тротуар перед террасой и поля по бокам
  for (let a = -WT() / 2 + 0.6; a <= WT() / 2 - 0.6; a += 1.5) for (const b of [-2.0, -1.1]) shop.roam.push(P(a, b));
  for (const sd of [-1, 1]) for (let b = 0.5; b < TER + D - 0.5; b += 1.5) shop.roam.push(P(sd * (W / 2 + SIDE * 0.55), b));
  shop.roam = shop.roam.filter(([x, z]) => { const r = A.nearestRoad(x, z, 7, 1); return !(r && r.d < r.seg.w / 2 + 1.0) && !A.inHouse(x, z, 0.5); });
  const nm = RIV.MASCOTS[0] + ((hash(s.fx, s.fz, 21) * (RIV.MASCOTS[1] - RIV.MASCOTS[0] + 1)) | 0);
  for (let k = 0; k < nm && shop.roam.length; k++) shop.mascots.push(newMascot(shop, ch.mascots[k % ch.mascots.length]));

  { const r = A.nearestRoad(s.fx, s.fz, 10, 3); shop.door = r ? [r.x, r.z] : [s.fx, s.fz]; }
  SHOPS.push(shop);
}

/* ── сбили вещь точки ── */
function saveOrig (it) {
  if (!it.mesh) return;
  const a = it.mesh.geometry.attributes.position.array;
  if (!it.orig) it.orig = a.slice(it.v0 * 3, (it.v0 + it.nv) * 3);
}
function unhide (it) {
  if (!it.orig || !it.mesh) { it.down = 0; return; }
  const pos = it.mesh.geometry.attributes.position;
  pos.array.set(it.orig, it.v0 * 3);
  pos.needsUpdate = true;
  it.down = 0;
}
/* спрятать без обломков (зонтик зимой) */
function hideQuiet (it) {
  if (!it.mesh) return;
  saveOrig(it);
  const pos = it.mesh.geometry.attributes.position, a = pos.array, gy = A.groundH(it.x, it.z);
  for (let i = it.v0; i < it.v0 + it.nv; i++) { a[i * 3] = it.x; a[i * 3 + 1] = gy - 1; a[i * 3 + 2] = it.z; }
  pos.needsUpdate = true;
  it.down = 1;
}
function onItemDown (it) {
  saveOrig(it);
  const shop = it.rshop;
  if (it.guests) for (const q of it.guests) if (q.on) { q.on = 0; q.fled = 1; GUESTS_DIRTY = 1; }
  if (it.guests && it.guests.length && A.puff) A.puff(it.x, 0.8, it.z, false, 1.2);
  hitShop(shop);
}
function hitShop (shop) {
  shop.hits++;
  ST.shopHits++;
  if (shop.hits >= RIV.SHOP_HITS && !shop.paid && youNear(shop.x, shop.z, 60)) {
    shop.paid = 1;
    ST.broke++;
    respect('rivalShop');
  }
}
const youNear = (x, z, r = RIV.WHO_R) => A && Math.hypot(A.V.x - x, A.V.z - z) < r;
function respect (why) {
  if (A.S && A.S.freeRun) return;                          // свободная езда — без респекта
  try { RESPECT.gain(why); } catch (e) { /* респект не обязателен */ }
}

/* ═════════════ гости за столиками — инстансами ═════════════ */
let G_BODY = null, G_HEAD = null, GUESTS_DIRTY = 1;
const SHIRTS = ['#d9342c', '#2f6fb0', '#3a9a5a', '#e8892e', '#8a4ab0', '#f4f1ea', '#2b2a30', '#e8c64a', '#c85a8a', '#4ab0b0'];
const SKINS = ['#f1c7a5', '#e3b08a', '#d9a57e', '#c48d64', '#a8744f'];
function guestGeo () {
  const b = [];
  for (const s of [-1, 1]) {
    A.put(b, A.boxGeo(0.16, 0.15, 0.46), '#4a4a52', 0.11 * s, 0.5, 0.2);      // бёдра на стуле
    A.put(b, A.boxGeo(0.14, 0.46, 0.14), '#4a4a52', 0.11 * s, 0.24, 0.42);    // голени
    A.put(b, A.boxGeo(0.12, 0.12, 0.42), '#ffffff', 0.3 * s, 0.98, 0.2);      // руки к столу
  }
  A.put(b, A.boxGeo(0.46, 0.6, 0.26), '#ffffff', 0, 0.86, 0);
  const h = [];
  A.put(h, A.boxGeo(0.26, 0.28, 0.26), '#ffffff', 0, 1.32, 0.02);
  A.put(h, A.boxGeo(0.28, 0.08, 0.28), '#3a2a20', 0, 1.48, 0);
  return [A.mergeGeos(b), A.mergeGeos(h)];
}
function buildGuests () {
  if (!SEAT.length) return;
  const [bg, hg] = guestGeo(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  G_BODY = new THREE.InstancedMesh(bg, mat, SEAT.length);
  G_HEAD = new THREE.InstancedMesh(hg, mat, SEAT.length);
  G_BODY.frustumCulled = G_HEAD.frustumCulled = false;
  G_BODY.name = 'rival-guests';
  const c = new THREE.Color();
  for (const q of SEAT) {
    G_BODY.setColorAt(q.k, c.set(SHIRTS[(hash(q.x, q.z, 1) * SHIRTS.length) | 0]));
    G_HEAD.setColorAt(q.k, c.set(SKINS[(hash(q.x, q.z, 2) * SKINS.length) | 0]));
  }
  ST.guests = SEAT.length;
  A.scene.add(G_BODY, G_HEAD);
  poseGuests();
}
const GM = new THREE.Matrix4(), GR = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function poseGuests () {
  if (!G_BODY) return;
  for (const q of SEAT) {
    if (!q.on) { G_BODY.setMatrixAt(q.k, ZERO); G_HEAD.setMatrixAt(q.k, ZERO); continue; }
    GR.makeRotationY(q.ry + (q.nod || 0) * 0.15);
    GM.copy(GR).setPosition(q.x, q.y, q.z);
    G_BODY.setMatrixAt(q.k, GM); G_HEAD.setMatrixAt(q.k, GM);
  }
  G_BODY.instanceMatrix.needsUpdate = true; G_HEAD.instanceMatrix.needsUpdate = true;
  GUESTS_DIRTY = 0;
}

/* ═════════════ стёкла зимы ═════════════ */
function buildGlass () {
  if (!GLASS_P.length) return;
  // рамы и крыша — один меш (как статика, свой — чтобы прятать летом)
  FRAME_MESH = new THREE.Mesh(A.mergeGeos(GLASS_F), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  FRAME_MESH.name = 'rival-winter-frames';
  FRAME_MESH.geometry.computeBoundingSphere();
  A.scene.add(FRAME_MESH);
  // стёкла — один прозрачный меш, каждое стекло — сбиваемая вещь (smashMesh)
  const n = GLASS_P.reduce((s, q) => s + q.g.attributes.position.count, 0), arr = new Float32Array(n * 3);
  let o = 0;
  const v0s = [];
  for (const q of GLASS_P) { v0s.push(o / 3); arr.set(q.g.attributes.position.array, o); o += q.g.attributes.position.array.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  GLASS_MESH = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#cfeefc', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  GLASS_MESH.name = 'rival-winter-glass';
  GLASS_MESH.renderOrder = 2;
  A.scene.add(GLASS_MESH);
  GLASS_ORIG = arr.slice();
  GLASS_P.forEach((q, i) => {
    const it = A.smashMesh('glass', q.x, q.z, 0.9, GLASS_MESH, v0s[i], q.g.attributes.position.count, '#cfeefc');
    it.rshop = q.shop; it.onDown = onGlassDown; it.glass = 1;
    GLASS_ITEMS.push(it);
  });
  GLASS_P = null; GLASS_F = null;
}
function onGlassDown (it) {
  if (A.Snd && A.Snd.blip) A.Snd.blip(1800, 0.08, 'triangle', 0.05);
  hitShop(it.rshop);
}
function glassRestore (on) {
  if (!GLASS_MESH) return;
  const pos = GLASS_MESH.geometry.attributes.position;
  pos.array.set(GLASS_ORIG); pos.needsUpdate = true;
  for (const it of GLASS_ITEMS) it.down = on ? 0 : 1;      // летом стёкол нет — и сбивать нечего
  GLASS_MESH.visible = FRAME_MESH.visible = !!on;
}

/* лето / зима: стёкла и зонтики */
let WINTER = null;
function applySeason (force) {
  const w = warmth() >= RIV.WINTER;
  if (w === WINTER && !force) return;
  WINTER = w;
  ST.season = w ? 'winter' : 'summer';
  glassRestore(w);
  for (const s of SHOPS) for (const u of s.umbs) {
    if (w) { if (!u.down) { hideQuiet(u); u.sea = 1; } }
    else if (u.sea) { unhide(u); u.sea = 0; }
  }
}

/* ═════════════ маскоты — инстансами ═════════════ */
const MK = { roll: [], oni: [], burger: [] };   // маскоты по виду (номер в своём InstancedMesh)
const MASC = [];
let MI = null;           // { body: {roll, oni, burger}, leg, arm, chop, scep }
const MSPEC = {
  roll: { hip: 0.5, sh: [0.55, 1.2], arm: '#1d3b2c', item: 'chop', h: 2.0 },
  oni: { hip: 0.5, sh: [0.62, 1.1], arm: '#f4f1ea', item: 'chop', h: 2.2 },
  burger: { hip: 0.6, sh: [0.86, 1.3], arm: '#e8a84f', item: 'scep', h: 2.7 },
};
function newMascot (shop, kind) {
  const m = { shop, kind, k: MK[kind].length, st: 'walk', T: 0, x: 0, z: 0, y: 0, ry: 0, tx: 0, tz: 0, ph: rand(0, 6), wave: 0, vx: 0, vy: 0, vz: 0, spin: 0, cool: 0, root: null, say: null, sayT: 0, gone: 0 };
  const [x, z] = shop.roam[(hash(shop.fx, shop.fz, 30 + MASC.length) * shop.roam.length) | 0];
  m.x = m.tx = x; m.z = m.tz = z;
  MK[kind].push(m);
  MASC.push(m);
  return m;
}
function mascotGeos () {
  const P = A.put, bx = A.boxGeo;
  // ролл: нори снаружи, рис и лосось сверху, глаза спереди
  const r = [];
  P(r, new THREE.CylinderGeometry(0.52, 0.52, 1.15, 14), '#1d3b2c', 0, 1.08, 0);
  P(r, new THREE.CylinderGeometry(0.47, 0.47, 0.05, 14), '#f8f6ef', 0, 1.66, 0);
  P(r, new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), '#f07a5a', 0, 1.68, 0);
  P(r, bx(0.12, 0.05, 0.12), '#7fd06a', 0.22, 1.69, 0.1);
  for (const s of [-1, 1]) { P(r, new THREE.SphereGeometry(0.12, 8, 6), '#ffffff', 0.2 * s, 1.25, 0.47); P(r, new THREE.SphereGeometry(0.06, 6, 5), '#1b1410', 0.2 * s, 1.25, 0.57); }
  P(r, bx(0.22, 0.05, 0.04), '#e04836', 0, 1.0, 0.52);
  // онигири: треугольник риса с полосой нори
  const o = [];
  const tri = new THREE.CylinderGeometry(0.78, 0.78, 0.55, 3);
  tri.rotateX(Math.PI / 2); tri.rotateZ(Math.PI);
  P(o, tri, '#f8f6ef', 0, 1.18, 0);
  P(o, bx(0.7, 0.45, 0.6), '#1d3b2c', 0, 0.82, 0.0);
  for (const s of [-1, 1]) { P(o, new THREE.SphereGeometry(0.11, 8, 6), '#ffffff', 0.2 * s, 1.3, 0.28); P(o, new THREE.SphereGeometry(0.055, 6, 5), '#1b1410', 0.2 * s, 1.3, 0.37); }
  P(o, new THREE.SphereGeometry(0.06, 6, 4), '#ff9aa8', -0.34, 1.16, 0.26); P(o, new THREE.SphereGeometry(0.06, 6, 4), '#ff9aa8', 0.34, 1.16, 0.26);
  // бургер в короне (как маскот Дня угнетения бургеров, festivals.js — поменьше)
  const b = [], k = 0.82;
  for (const [rr, h, c, y] of [[0.95, 0.42, '#e8b563', 0.9], [1.0, 0.3, '#7a4526', 1.27], [1.0, 0.1, '#ffd34d', 1.47], [1.02, 0.14, '#5fbf4a', 1.59], [0.9, 0.14, '#e04836', 1.73]])
    P(b, new THREE.CylinderGeometry(rr * k, rr * k * 1.03, h * k, 14), c, 0, 0.1 + y * k, 0);
  P(b, new THREE.SphereGeometry(1.0 * k, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#e8a84f', 0, 0.1 + 1.8 * k, 0);
  for (let i = 0; i < 7; i++) P(b, new THREE.SphereGeometry(0.05, 5, 4), '#fff3d6', Math.cos(i * 2.1) * 0.53, 0.1 + 2.55 * k, Math.sin(i * 2.1) * 0.53);
  for (const s of [-1, 1]) { P(b, new THREE.SphereGeometry(0.14, 8, 6), '#ffffff', 0.26 * s, 0.1 + 2.15 * k, 0.68); P(b, new THREE.SphereGeometry(0.07, 6, 5), '#1b1410', 0.26 * s, 0.1 + 2.15 * k, 0.8); }
  P(b, new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10, 1, true), '#f2c230', 0, 0.1 + 2.9 * k, 0);
  for (let i = 0; i < 5; i++) P(b, new THREE.ConeGeometry(0.08, 0.24, 4), '#f2c230', Math.cos(i * 1.257) * 0.34, 0.1 + 3.08 * k, Math.sin(i * 1.257) * 0.34);
  // нога, рука (от плеча вниз), палочки, скипетр
  const leg = []; P(leg, bx(0.16, 0.55, 0.16), '#2b2a30', 0, -0.27, 0); P(leg, bx(0.2, 0.1, 0.3), '#2b2a30', 0, -0.52, 0.05);
  const arm = []; P(arm, bx(0.11, 0.55, 0.11), '#ffffff', 0, -0.27, 0); P(arm, new THREE.SphereGeometry(0.09, 6, 5), '#ffffff', 0, -0.56, 0);
  const chop = []; for (const s of [-1, 1]) P(chop, bx(0.035, 0.9, 0.035), '#d8b07a', 0.04 * s, -0.5, 0.25, 1.2, 0, 0);
  const scep = []; P(scep, bx(0.06, 0.9, 0.06), '#f2c230', 0, -0.5, 0.2, 1.2, 0, 0); P(scep, new THREE.SphereGeometry(0.12, 8, 6), '#e04836', 0, -0.48, 0.66);
  return { roll: A.mergeGeos(r), oni: A.mergeGeos(o), burger: A.mergeGeos(b), leg: A.mergeGeos(leg), arm: A.mergeGeos(arm), chop: A.mergeGeos(chop), scep: A.mergeGeos(scep) };
}
function buildMascots () {
  if (!MASC.length) return;
  const G = mascotGeos(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const im = (g, n) => { const m = new THREE.InstancedMesh(g, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO); A.scene.add(m); return m; };
  const nChop = MK.roll.length + MK.oni.length, nScep = MK.burger.length;
  MI = { body: { roll: im(G.roll, MK.roll.length), oni: im(G.oni, MK.oni.length), burger: im(G.burger, MK.burger.length) },
    leg: im(G.leg, MASC.length * 2), arm: im(G.arm, MASC.length * 2), chop: im(G.chop, nChop), scep: im(G.scep, nScep) };
  MI.leg.name = 'rival-mascots';
  const c = new THREE.Color();
  let ci = 0, si = 0;
  MASC.forEach((m, i) => {
    m.i = i;
    for (const j of [0, 1]) MI.arm.setColorAt(i * 2 + j, c.set(MSPEC[m.kind].arm));
    if (MSPEC[m.kind].item === 'chop') m.it = ci++; else m.it = si++;
  });
  if (MI.arm.instanceColor) MI.arm.instanceColor.needsUpdate = true;
}
/* скелет маскота — пустые Object3D (в сцене, пока точка рядом: на них пузырь реплики) */
function rig (m) {
  const S = MSPEC[m.kind], root = new THREE.Group(), body = new THREE.Object3D();
  root.add(body);
  const hips = [], shs = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Object3D(); h.position.set(0.2 * s, S.hip, 0); body.add(h); hips.push(h);
    const a = new THREE.Object3D(); a.position.set(S.sh[0] * s, S.sh[1], 0); body.add(a); shs.push(a);
  }
  const item = new THREE.Object3D(); shs[1].add(item);
  root.userData = { body, hips, shs, item };
  return root;
}
const MM = new THREE.Matrix4();
function poseMascot (m) {
  const u = m.root.userData, i = m.i, it = MSPEC[m.kind].item === 'chop' ? MI.chop : MI.scep;
  m.root.position.set(m.x, m.y, m.z);
  m.root.rotation.set(0, m.ry, 0);
  m.root.updateMatrixWorld(true);
  MI.body[m.kind].setMatrixAt(m.k, u.body.matrixWorld);
  for (const j of [0, 1]) { MI.leg.setMatrixAt(i * 2 + j, u.hips[j].matrixWorld); MI.arm.setMatrixAt(i * 2 + j, u.shs[j].matrixWorld); }
  it.setMatrixAt(m.it, u.item.matrixWorld);
}
function hideMascot (m) {
  const i = m.i, it = MSPEC[m.kind].item === 'chop' ? MI.chop : MI.scep;
  MI.body[m.kind].setMatrixAt(m.k, ZERO);
  for (const j of [0, 1]) { MI.leg.setMatrixAt(i * 2 + j, ZERO); MI.arm.setMatrixAt(i * 2 + j, ZERO); }
  it.setMatrixAt(m.it, ZERO);
}
function say (m, text) {
  if (!m.root || !A.sayBubble) return;
  if (m.say && m.say.parent) { m.say.parent.remove(m.say); m.say.material.dispose(); }
  m.say = A.sayBubble(m.root, text, CH[m.shop.chain].say, MSPEC[m.kind].h + 0.6);
  m.sayT = 3;
}
function mascotFree (x, z) {
  if (A.inHouse(x, z, 0.4)) return false;
  const r = A.nearestRoad(x, z, 7, 1);
  return !(r && r.d < r.seg.w / 2 + 0.9);
}
function stepMascot (m, dt, V, sp, fx, fz, dC) {
  const u = m.root.userData;
  if (m.cool > 0) m.cool -= dt;
  if (m.sayT > 0 && (m.sayT -= dt) <= 0 && m.say) { if (m.say.parent) m.say.parent.remove(m.say); m.say.material.dispose(); m.say = null; }
  if (m.st === 'gone') {                               // взрослая: лопнул; новый — когда ты отъехал
    if ((m.T -= dt) <= 0 && dC > 50) {
      const [x, z] = pick(m.shop.roam);
      m.x = m.tx = x; m.z = m.tz = z; m.st = 'idle'; m.T = 1; m.gone = 0;
    } else return;
  }
  if (m.st === 'tumble') {                             // детская: катится колесом, встаёт
    m.T -= dt; m.vy -= 18 * dt;
    m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
    const fl = A.groundH(m.x, m.z);
    if (m.y < fl) { m.y = fl; m.vy = Math.abs(m.vy) * 0.4; m.vx *= 0.7; m.vz *= 0.7; }
    u.body.rotation.z += m.spin * dt; m.spin *= 0.985;
    if (m.T <= 0) {
      u.body.rotation.z = 0; m.y = fl; m.st = 'walk';
      let best = m.shop.roam[0], bd = Infinity;
      for (const p of m.shop.roam) { const d = Math.hypot(p[0] - m.x, p[1] - m.z); if (d < bd) { bd = d; best = p; } }
      m.tx = best[0]; m.tz = best[1];
      if (dC < 80) say(m, t(pick(LINES.up[m.shop.chain])));
    }
    poseMascot(m);
    return;
  }
  m.ph += dt;
  const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
  const near = dC < 28;
  if (m.st === 'walk') {
    if (d < 0.3) { m.st = 'idle'; m.T = rand(1.5, 4); }
    else {
      const v = Math.min(d, 1.1 * dt), nx2 = m.x + dx / d * v, nz2 = m.z + dz / d * v;
      if (mascotFree(nx2, nz2)) { m.x = nx2; m.z = nz2; } else { m.st = 'idle'; m.T = 0.5; }
      m.ry = Math.atan2(dx, dz);
    }
  } else if ((m.T -= dt) <= 0) {
    const p = pick(m.shop.roam);
    m.tx = p[0]; m.tz = p[1]; m.st = 'walk';
  }
  if (near && m.st === 'idle') m.ry = Math.atan2(V.x - m.x, V.z - m.z);   // смотрит на курьера и машет
  m.y = A.groundH(m.x, m.z);
  const walk = m.st === 'walk', sw = walk ? Math.sin(m.ph * 8) * 0.55 : 0;
  u.hips[0].rotation.x = sw; u.hips[1].rotation.x = -sw;
  u.body.position.y = walk ? Math.abs(Math.sin(m.ph * 8)) * 0.06 : 0;
  u.body.rotation.z = walk ? Math.sin(m.ph * 8) * 0.05 : Math.sin(m.ph * 1.5) * 0.03;
  // машут: правой (с палочками / скипетром) — всегда, когда стоит; обеими — когда курьер рядом
  const wv = Math.sin(m.ph * (near ? 9 : 5));
  u.shs[1].rotation.set(walk ? -sw * 0.6 : -2.6 + wv * 0.25, 0, walk ? 0 : -0.35 + wv * 0.35);
  u.shs[0].rotation.set(walk ? sw * 0.6 : near ? -2.6 - wv * 0.25 : 0.1, 0, walk ? 0 : near ? 0.35 - wv * 0.35 : 0.15);
  if (dC < 55 && !m.say && Math.random() < dt * 0.06) say(m, t(pick(LINES[m.shop.chain])));
  poseMascot(m);
  // наезд
  if (sp < 3) return;
  const ex = m.x - V.x, ez = m.z - V.z;
  if (Math.abs(ex * fx + ez * fz) > A.CAR_L + 0.7 || Math.abs(ex * fz - ez * fx) > A.CAR_W + 0.7) return;
  hitMascot(m, sp);
}
const PIECES = { roll: [['cyl', 0.5, 0.35, 0x1d3b2c], ['cyl', 0.45, 0.06, 0xf8f6ef], ['box', 0.3, 0.2, 0xf8f6ef], ['box', 0.25, 0.2, 0xf8f6ef], ['cyl', 0.2, 0.1, 0xf07a5a], ['box', 0.12, 0.1, 0x7fd06a]],
  oni: [['box', 0.6, 0.4, 0xf8f6ef], ['box', 0.4, 0.3, 0xf8f6ef], ['box', 0.3, 0.3, 0xf8f6ef], ['box', 0.6, 0.05, 0x1d3b2c], ['box', 0.2, 0.2, 0xf8f6ef]],
  burger: [['cyl', 0.8, 0.3, 0xe8b563], ['cyl', 0.8, 0.25, 0x7a4526], ['box', 1.2, 0.08, 0xffd34d], ['cyl', 0.8, 0.1, 0x5fbf4a], ['cyl', 0.7, 0.1, 0xe04836], ['cap', 0.8, 0, 0xe8a84f], ['cyl', 0.35, 0.18, 0xf2c230]] };
function hitMascot (m, sp) {
  const V = A.V;
  ST.mascotHits++;
  if (m.cool <= 0) { m.cool = RIV.MASCOT_COOL; respect('rivalMascot'); }
  try { A.Snd.squish(); A.Snd.blip(140, 0.25, 'square', 0.08); } catch (e) { /* звук не обязателен */ }
  if (A.ADULT) {
    // разлетается на ингредиенты
    if (m.kind === 'burger' && A.gibBurger) A.gibBurger(m.x, m.z);
    for (const [k, a, b, c] of PIECES[m.kind]) {
      const geo = k === 'box' ? new THREE.BoxGeometry(a, b, a * 0.8) : k === 'cap' ? new THREE.SphereGeometry(a, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(a, a, b, 10);
      const piece = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      piece.position.set(m.x, m.y + rand(0.6, 1.8), m.z);
      A.fxAdd(piece, { vx: V.vx * 0.5 + rand(-6, 6), vy: rand(6, 12), vz: V.vz * 0.5 + rand(-6, 6), life: 3, max: 3, gravity: 18, spin: rand(-8, 8) }, m.y);
    }
    if (m.say && m.say.parent) { m.say.parent.remove(m.say); m.say.material.dispose(); m.say = null; }
    m.st = 'gone'; m.gone = 1; m.T = RIV.MASCOT_BACK;
    hideMascot(m);
  } else {
    const k = Math.min(1.4, sp / 12);
    m.vx = V.vx * 0.8 * k + rand(-2, 2); m.vz = V.vz * 0.8 * k + rand(-2, 2); m.vy = 6 + sp * 0.2;
    m.spin = 9 * (Math.random() < 0.5 ? -1 : 1); m.st = 'tumble'; m.T = 2.6;
  }
}

/* ═════════════ курьеры конкурентов ═════════════ */
const BCAR_HEX = '#1f4fa8';
let BCAR_TPL = null;
function bcarTpl () {
  if (BCAR_TPL) return BCAR_TPL;
  const g = [], l = [], P = A.put, bx = A.boxGeo;
  // машинка-бургер — круглая, как бургер (вид сверху — круг R): колёса снизу, нижняя булка с синей
  // полосой сети, котлета, сыр уголками, салат волной, помидор, верхняя булка-купол с кунжутом
  // и тёмным окном спереди, корона на макушке. Хитбокс — как у машины потока (hl)
  const R = 1.6, cyl = (r1, r2, h, n = 24) => new THREE.CylinderGeometry(r1, r2, h, n);
  for (const z of [0.95, -0.95]) for (const s of [-1, 1]) {
    P(g, cyl(0.4, 0.4, 0.32, 12), '#1d1c20', s * 1.02, 0.4, z, 0, 0, Math.PI / 2);
    P(g, cyl(0.18, 0.18, 0.34, 8), '#c8c8cc', s * 1.02, 0.4, z, 0, 0, Math.PI / 2);
  }
  P(g, cyl(R * 0.95, R * 0.85, 0.5), '#e8a84f', 0, 0.78, 0);              // нижняя булка
  P(g, cyl(R * 0.97, R * 0.95, 0.14), BCAR_HEX, 0, 0.66, 0);              // полоса сети
  P(g, cyl(R * 1.04, R * 1.04, 0.34), '#7a4526', 0, 1.2, 0);              // котлета
  P(g, bx(R * 1.75, 0.06, R * 1.75), '#ffd34d', 0, 1.39, 0, 0, Math.PI / 4, 0);   // сыр квадратом, уголки свисают
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; P(g, new THREE.ConeGeometry(0.13, 0.36, 3), '#ffd34d', Math.cos(a) * R * 1.2, 1.24, Math.sin(a) * R * 1.2, Math.PI, 0, 0); }
  P(g, cyl(R * 1.08, R * 1.08, 0.08), '#5fbf4a', 0, 1.45, 0);             // салат
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; P(g, new THREE.SphereGeometry(0.16, 5, 3), '#5fbf4a', Math.cos(a) * R * 1.08, 1.43 - (i % 2) * 0.05, Math.sin(a) * R * 1.08); }
  P(g, cyl(R * 0.98, R * 0.98, 0.1), '#e04836', 0, 1.52, 0);              // помидор
  const top = new THREE.SphereGeometry(R, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  top.scale(1, 0.8, 1);
  P(g, top, '#e8a84f', 0, 1.57, 0);                                         // верхняя булка
  const win = new THREE.SphereGeometry(R * 1.015, 12, 4, Math.PI / 2 - 0.75, 1.5, 0.62, 0.5);
  win.scale(1, 0.8, 1);
  P(g, win, '#22303e', 0, 1.57, 0);                                         // окно спереди (+z)
  for (let i = 0; i < 22; i++) {                                            // кунжут по куполу, не на окне
    const a = i * 2.4, th = 0.25 + (i % 4) * 0.22, x = Math.cos(a) * Math.sin(th) * R, z = Math.sin(a) * Math.sin(th) * R;
    if (z > 0.7 && Math.abs(x) < 1.1 && th > 0.5) continue;
    P(g, new THREE.SphereGeometry(0.07, 5, 4), '#fff3d6', x, 1.57 + Math.cos(th) * R * 0.8, z);
  }
  P(g, cyl(0.42, 0.42, 0.24, 10), '#f2c230', 0, 1.57 + R * 0.8 + 0.08, 0);   // корона
  for (let i = 0; i < 5; i++) P(g, new THREE.ConeGeometry(0.09, 0.26, 4), '#f2c230', Math.cos(i * 1.257) * 0.4, 1.57 + R * 0.8 + 0.3, Math.sin(i * 1.257) * 0.4);
  for (const s of [-1, 1]) {
    P(l, bx(0.34, 0.18, 0.05), '#fff6d8', s * 0.6, 0.8, R * 0.93);
    P(l, bx(0.3, 0.14, 0.05), '#e0262a', s * 0.6, 0.8, -R * 0.93);
  }
  BCAR_TPL = { lit: A.mergeGeos(g), flat: A.mergeGeos(l) };
  return BCAR_TPL;
}
function makeBcar () {
  const T = bcarTpl(), g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(T.lit.clone(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  g.add(new THREE.Mesh(T.flat.clone(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  g.userData = { lite: false, hl: 2.2, wheels: [], steer: [], panels: [], glass: [], hazard: [], dmg: 0, bodyHex: '#e8a84f', model: 'bcar' };
  return g;
}
function nearestShop (x, z, chain) {
  let best = null, bd = Infinity;
  for (const s of SHOPS) { if (chain && s.chain !== chain) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return [best, bd];
}
/* адрес курьера: подъезд в JOB_R от точки (список — при первом заказе: подъезды города собраны позже точек) */
function jobOf (shop) {
  if (!shop.jobsAt) {
    shop.jobsAt = 1;
    const E = A.CITY.entrances || [];
    for (let i = 0; i < E.length && shop.jobs.length < 80; i++) {
      const d = Math.hypot(E[i][0] - shop.x, E[i][1] - shop.z);
      if (d > RIV.JOB_R[0] && d < RIV.JOB_R[1] && hash(E[i][0], E[i][1], 9) < 0.35) shop.jobs.push([E[i][0], E[i][1]]);
    }
  }
  return shop.jobs.length ? pick(shop.jobs) : [shop.door[0], shop.door[1]];
}
const okCar = t => !t.parked && !t.svc && !t.chase && !t.taxi && !t.gone && !t.accident && !t.rival && !t.knock && !t.wreck && !t.hb && !t.dump && t.model !== 'moped' && t.mesh && t.mesh.userData.lite;
function toBcar (t, shop) {
  const old = t.mesh, m = makeBcar();
  m.position.copy(old.position); m.rotation.copy(old.rotation);
  A.scene.remove(old);
  old.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  A.scene.add(m);
  t.mesh = m; t.model = 'bcar'; t.hl = 2.2; t.cruise = rand(9, 12.5);
  t.hbRoll = 1; t.cnRoll = 1;                   // ни коневозкой, ни самосвалом не станет
  t.bcar = { home: shop };
  t.rvGoal = jobOf(shop) || [shop.door[0], shop.door[1]];
  t.rvHome = shop;
  t.onBoom = () => { ST.cars++; if (youNear(t.x, t.z, 150)) respect('rivalCar'); };
  ST.bcars++;
}
function stepBcars () {
  const TR = A.TRAFFIC;
  let n = 0;
  for (const t of TR) if (t.bcar && !t.gone) n++;
  for (const t of TR) {
    if (t.rvRoll) continue;
    t.rvRoll = 1;
    if (n >= RIV.BCAR_MAX || !okCar(t)) continue;
    const [s, d] = nearestShop(t.x, t.z, 'burger');
    if (!s || d > RIV.BCAR_R) continue;
    if (Math.random() < RIV.BCAR_P || DEBUG.force > 0) { if (DEBUG.force > 0) DEBUG.force--; toBcar(t, s); n++; }
  }
}
/* мопеды-суши: от точки к адресам и обратно */
function placeAt (c, x, z) {
  const r = A.nearestRoad(x, z, 10, 3);
  if (!r || r.seg.na === undefined) return false;
  let e = A.edgeOf(r.seg.na, r.seg.nb);
  if (!e || !e.ok || e.c > 5 || e.closed || e.lock) { e = A.edgeOf(r.seg.nb, r.seg.na); if (!e || !e.ok || e.c > 5 || e.closed || e.lock) return false; }
  const N = A.NODES[e.a];
  c.e = e; c.turn = null; c.lane = 0; c.pull = 0; c.rejoin = 0; c.stopT = 0; c.gy = undefined;
  c.s = clamp((r.x - N.x) * e.ux + (r.z - N.z) * e.uz - e.tA, 0, A.edgeRun(e) * 0.9);
  A.poseTraffic(c, 0);
  return true;
}
let SUSHI_T = 0;
function stepSushi (dt) {
  if ((SUSHI_T -= dt) > 0) return;
  SUSHI_T = 1.5;
  const V = A.V;
  let n = 0;
  for (const c of A.TRAFFIC) if (c.mp && c.mp.br.rival === 'sushi' && !c.gone && !c.mp.gone) n++;
  ST.sushi = n;
  const [s, d] = nearestShop(V.x, V.z, 'sushi');
  const want = RIV.SUSHI + (s && d < RIV.SUSHI_R ? RIV.SUSHI_NEAR : 0);
  if (n >= want || !MOPEDS.spawnBrand) return;
  const c = MOPEDS.spawnBrand(A, 'sushi');
  if (!c) return;
  // у своей точки, если она не на глазах; иначе — в кольце вокруг, как весь трафик
  const atShop = s && d < RIV.SUSHI_R && d > 110 && placeAt(c, s.door[0], s.door[1]);
  if (!atShop) A.placeTraffic(c, 120, 330);
  const home = s && d < RIV.SUSHI_R + 300 ? s : nearestShop(c.x, c.z, 'sushi')[0];
  c.rvHome = home;
  c.rvGoal = home ? (atShop ? jobOf(home) : Math.random() < 0.5 ? [home.door[0], home.door[1]] : jobOf(home)) : null;
}
/* у цели — следующая: от адреса — к точке, от точки — к новому адресу */
function stepGoals () {
  for (const c of A.TRAFFIC) {
    if (!c.rvGoal || c.gone || !c.rvHome) continue;
    const g = c.rvGoal;
    if (Math.abs(g[0] - c.x) > 45 || Math.abs(g[1] - c.z) > 45) continue;
    const h = c.rvHome, atHome = Math.hypot(g[0] - h.door[0], g[1] - h.door[1]) < 5;
    c.rvGoal = atHome ? (jobOf(h) || g) : [h.door[0], h.door[1]];
    c.rvTrips = (c.rvTrips || 0) + 1;
  }
}
/* мопед-суши слетел (mopeds.js fall): сбил ты — респект */
function onSushiFall (c) {
  if (c.mp.rvHit) return;
  c.mp.rvHit = 1;
  ST.couriers++;
  if (youNear(c.x, c.z)) respect('rivalCourier');
}

/* поворот курьера конкурента на перекрёстке — к цели; null — как все */
export function nextEdge (t, e) {
  const g = t.rvGoal;
  if (!g || !A) return null;
  const N = A.NODES, b = N[e.b];
  const dx = g[0] - b.x, dz = g[1] - b.z, l = Math.hypot(dx, dz) || 1;
  let best = null, bs = -Infinity;
  for (const c of b.nb) {
    if (c === e.a) continue;
    const n = A.edgeOf(e.b, c);
    if (!n.ok || n.c > 5 || n.closed || n.lock) continue;
    if (!A.inBounds(N[c].x, N[c].z, -40)) continue;
    const s = (n.ux * dx + n.uz * dz) / l + Math.random() * 0.5 + (n.c <= 3 ? 0.1 : 0);
    if (s > bs) { bs = s; best = n; }
  }
  return best;
}
export function onRespawn (t) {
  if (t.bcar) t.onBoom = null;
  t.bcar = null; t.rvGoal = null; t.rvHome = null; t.rvRoll = 0;
}

/* участок точки (деревья, лавочки не встают) */
export function blocks (x, z, m = 0) {
  for (const s of SHOPS) {
    const dx = x - s.fx, dz = z - s.fz;
    if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
    const a = dx * s.ux + dz * s.uz, b = dx * s.nx + dz * s.nz;
    if (Math.abs(a) < WT() / 2 + m && b > -1.5 - m && b < DT() + m) return true;
  }
  return false;
}

/* ═════════════ сборка, кадр, новая смена ═════════════ */
export function build (api) {
  A = api;
  const t0 = performance.now();
  if (MOPEDS.MP) MOPEDS.MP.onRival = onSushiFall;
  const sites = findSites();
  sites.forEach((s, i) => build1(s, i));
  buildSigns();
  buildGlass();
  buildGuests();
  buildMascots();
  ST.ms = Math.round(performance.now() - t0);
  DEBUG.list = SHOPS.map(s => ({ chain: s.chain, x: Math.round(s.x), z: Math.round(s.z), dist: s.dist, mascots: s.mascots.length, tables: s.tables.length }));
}

let SEA_T = 0, TOUCHED = 0;
export function step (dt) {
  if (!A || !SHOPS.length) return;
  if (!TOUCHED) { TOUCHED = 1; applySeason(true); }      // склейки сбиваемого собраны — можно прятать зонтики
  if ((SEA_T -= dt) <= 0) { SEA_T = 2; applySeason(false); }
  const V = A.V, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  // маскоты: только у точек рядом
  let dirty = false;
  for (const s of SHOPS) {
    const d = Math.hypot(s.x - V.x, s.z - V.z);
    if (!s.near && d < RIV.NEAR) {
      s.near = true;
      for (const m of s.mascots) { m.root = rig(m); A.scene.add(m.root); }
    } else if (s.near && d > RIV.FAR) {
      s.near = false;
      for (const m of s.mascots) {
        if (m.say && m.say.parent) { m.say.parent.remove(m.say); m.say.material.dispose(); m.say = null; }
        A.scene.remove(m.root); m.root = null; hideMascot(m);
      }
      dirty = true;
    }
    if (!s.near) continue;
    dirty = true;
    for (const m of s.mascots) {
      stepMascot(m, dt, V, sp, fx, fz, Math.hypot(m.x - V.x, m.z - V.z));
      if (m.st === 'gone') hideMascot(m);
    }
  }
  if (dirty && MI) for (const k of ['leg', 'arm', 'chop', 'scep']) MI[k].instanceMatrix.needsUpdate = true;
  if (dirty && MI) for (const k in MI.body) MI.body[k].instanceMatrix.needsUpdate = true;
  if (GUESTS_DIRTY) poseGuests();
  // курьеры конкурентов
  stepBcars();
  stepSushi(dt);
  stepGoals();
}

/* новая смена: точки — как новые, гости за столиками, маскоты на местах */
export function reset () {
  if (!A) return;
  for (const s of SHOPS) {
    for (const it of s.items) if (it.down && !it.sea) unhide(it);
    s.hits = 0; s.paid = 0;
    for (const m of s.mascots) if (m.st === 'gone' || m.st === 'tumble') { const [x, z] = pick(s.roam); Object.assign(m, { x, z, tx: x, tz: z, st: 'idle', T: 1, gone: 0, cool: 0 }); if (m.root) m.root.userData.body.rotation.z = 0; }
  }
  for (const q of SEAT) { q.on = 1; q.fled = 0; }
  GUESTS_DIRTY = 1;
  applySeason(true);
}

/* для probe: d.RIV.list — точки; force = 2 — две следующие машины потока у бургерной станут машинами-бургерами */
export const DEBUG = {
  RIV, ST, SHOPS, MASC, SEAT, force: 0, list: [],
  get stats () {
    const by = {};
    for (const s of SHOPS) { const k = s.dist + ''; by[k] = by[k] || { sushi: 0, burger: 0 }; by[k][s.chain]++; }
    return { shops: SHOPS.length, sushi: SHOPS.filter(s => s.chain === 'sushi').length, burger: SHOPS.filter(s => s.chain === 'burger').length, byDist: by, mascots: MASC.length, guests: SEAT.length, items: ST.items, ms: ST.ms, season: ST.season, tried: ST.tried, tested: ST.tested, lots: ST.lots, mall: ST.mall, why: ST.why };
  },
  mascots: () => MASC.filter(m => m.root).map(m => ({ kind: m.kind, x: +m.x.toFixed(2), z: +m.z.toFixed(2), st: m.st, chain: m.shop.chain })),
  couriers: () => (A ? A.TRAFFIC.filter(c => !c.gone && (c.bcar || (c.mp && c.mp.br.rival))).map(c => ({ kind: c.bcar ? 'bcar' : 'sushi', x: Math.round(c.x), z: Math.round(c.z), sp: +(c.speed || 0).toFixed(1), goal: c.rvGoal ? [Math.round(c.rvGoal[0]), Math.round(c.rvGoal[1])] : null, trips: c.rvTrips || 0 })) : []),
  /* м от участка точки (с полями) до ближайшей стены дома: [сеть, район, м, у ТЦ] */
  walls: () => { const G = wallGrid(); return SHOPS.map(s => [s.chain, s.dist, +rectWall(G, s.x, s.z, s.ux, s.uz, WT() / 2, DT() / 2, 300).toFixed(1), s.mall ? 1 : 0]); },
  season: () => applySeason(true),
  respect: () => ({ v: RESPECT.get(), log: RESPECT.DEBUG.log.slice(-8) }),
  reset: () => reset(),
};
