/* ──────────────────────────────────────────────────────────────────────────
   Жизнь дороги: то, что делает улицу похожей на улицу.

   • Китайский кроссовер (cnCar) — угловатый, с большой решёткой и узкими
     LED-полосами во всю ширину спереди и сзади; ночью полосы горят, а
     перед машинами потока — пятно фар (одним InstancedMesh на всех).
   • Небольшие знаки на столбах (buildSigns): 40/60, «пешеходный переход»
     у зебр, «уступи дорогу» / «главная» на нерегулируемых перекрёстках,
     «въезд запрещён» и «одностороннее» у односторонних улиц, остановки,
     «дети» у школ и садов. Столбы — в склейке сбиваемого (smashAdd),
     таблички — один меш с одной текстурой; сбили столб — табличку прячем.
   • Высокие чёрные заборы (buildFences) вокруг части частных домов, школ
     и новостроек: двор с калиткой-въездом со стороны улицы, через дороги,
     дорожки и чужие дома не идут; препятствие — машина упирается.
   • Пробки за авариями (jams): поток стоит за аварией во всех перекрытых
     полосах, хвост длиннее (дозаводим машины в очередь), сигналят, иногда
     водитель выходит посмотреть. На радаре и карте — красный кусок улицы.
     Авария убралась — пробка рассасывается, лишние машины уходят.
   • Ремонт (works): на маршруте курьера закрыт кусок улицы — блоки, щиты
     «ДОРОГА ЗАКРЫТА», «РЕМОНТ», яма, конусы, дорожники. Проехать нельзя,
     а навигатор ведёт прямо туда (routeNodes не трогаем) — ищи объезд.
     Трафик туда не сворачивает, а кто уже едет — разворачивается.
   • Ремонт полосы (lane): закрыта только правая полоса — клин конусов,
     блоки, щит со стрелкой, латают асфальт. Где в эту сторону две полосы и
     больше — поток перестраивается в соседнюю и ползёт; где одна — объезжают
     по встречке по очереди, пропуская встречных. Навигатор ведёт как вёл.
     Полоса или вся улица — жребий при каждом новом ремонте.

   Всё, что нужно из игры, приходит объектом api (roadApi в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import * as MOPEDS from './mopeds.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
/* жребий по месту: один и тот же дом огорожен всегда одинаково */
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

export const RL = { ms: {}, n: { signs: 0, poles: 0, fences: 0, panels: 0, jams: 0, works: 0 }, fenceAt: [] };
/* ?noroadlife — без всего этого: замер «до» в tools/perf-подобных прогонах */
const RL_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noroadlife');

/* ═════════════════ китайский кроссовер ═════════════════ */
/* Кузов собирает makeCar, здесь — то, что делает его «китайцем»: клин
   капота, огромная решётка с планками, плавающая чёрная крыша, рейлинги,
   спойлер и LED-полосы. Полосы — MeshBasic без цветов по вершинам: в
   лёгкой машине (liteTemplate) они уходят в «плоскую» часть, которой
   game.js даёт LED_MAT — она не темнеет ночью. */
export const LED_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });
LED_MAT.userData.glow = 1;
export function cnCar (g, add, o) {
  const { S, W, hl, top, y0, bodyHex } = o;
  add(new THREE.BoxGeometry(W - 0.1, 0.1, 0.5).rotateX(0.22), bodyHex, 0, top + 0.04, hl - 0.25);   // нос ниже — острее
  add(new THREE.BoxGeometry(W * 0.76, 0.34, 0.06), '#16171b', 0, y0 + 0.04, hl + 0.1);                 // решётка во всю морду
  for (const dy of [-0.1, 0, 0.1]) add(new THREE.BoxGeometry(W * 0.72, 0.025, 0.07), '#646873', 0, y0 + 0.04 + dy, hl + 0.11);
  add(new THREE.BoxGeometry(W * 0.88, 0.09, 0.06), '#16171b', 0, y0 - 0.2, hl + 0.1);                  // нижний воздухозаборник
  add(new THREE.BoxGeometry(W - 0.2, 0.05, S.cab - 0.14), '#141519', 0, top + S.ch + 0.125, S.cz);    // чёрная крыша
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.07, S.cab - 0.34), '#141519', (W / 2 - 0.22) * s, top + S.ch + 0.18, S.cz);
  add(new THREE.BoxGeometry(W - 0.3, 0.05, 0.3), '#141519', 0, top + S.ch + 0.1, S.cz - S.cab / 2 - 0.04);
  add(new THREE.BoxGeometry(W + 0.02, 0.13, 0.04), '#141519', 0, top - 0.03, -hl - 0.01);             // чёрная полоса под красным LED
  const strip = (w, hex, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, 0.05), new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(0, y, z);
    g.add(m);
  };
  strip(W - 0.1, 0xeef8ff, top - 0.04, hl + 0.03);
  strip(W - 0.06, 0xff2438, top - 0.03, -hl - 0.04);
}

/* ═════════════════ знаки ═════════════════ */
const K = { S40: 0, S60: 1, ZEB: 2, GIVE: 3, MAIN: 4, NOENT: 5, BUS: 6, KIDS: 7, ONEW: 8 };
// форма для тыльной стороны: 12 — круг, 13 — треугольник вниз, 14 — квадрат, 15 — ромб, 11 — треугольник вверх
const BACK = [12, 12, 14, 13, 15, 12, 14, 11, 14];
function signAtlas () {
  const C = 64, c = document.createElement('canvas');
  c.width = c.height = C * 4;
  const x = c.getContext('2d');
  const cell = (i, f) => { x.save(); x.translate((i % 4) * C, ((i / 4) | 0) * C); f(); x.restore(); };
  const circle = (r, fill) => { x.beginPath(); x.arc(32, 32, r, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
  const tri = (up, fill, r = 29) => {
    x.beginPath();
    if (up) { x.moveTo(32, 32 - r); x.lineTo(32 + r * 0.95, 32 + r * 0.72); x.lineTo(32 - r * 0.95, 32 + r * 0.72); }
    else { x.moveTo(32, 32 + r); x.lineTo(32 + r * 0.95, 32 - r * 0.72); x.lineTo(32 - r * 0.95, 32 - r * 0.72); }
    x.closePath(); x.fillStyle = fill; x.fill();
  };
  const square = (fill, r = 28) => { x.fillStyle = fill; x.fillRect(32 - r, 32 - r, r * 2, r * 2); };
  const diamond = (fill, r) => { x.beginPath(); x.moveTo(32, 32 - r); x.lineTo(32 + r, 32); x.lineTo(32, 32 + r); x.lineTo(32 - r, 32); x.closePath(); x.fillStyle = fill; x.fill(); };
  const man = (cx, cy, k, col) => {              // человечек: голова, туловище, ноги шагом
    x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 3 * k; x.lineCap = 'round';
    x.beginPath(); x.arc(cx, cy - 9 * k, 3.2 * k, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx, cy - 5 * k); x.lineTo(cx - 1 * k, cy + 3 * k);
    x.lineTo(cx - 5 * k, cy + 10 * k); x.moveTo(cx - 1 * k, cy + 3 * k); x.lineTo(cx + 4 * k, cy + 10 * k);
    x.moveTo(cx, cy - 3 * k); x.lineTo(cx + 5 * k, cy + 1 * k); x.moveTo(cx, cy - 3 * k); x.lineTo(cx - 5 * k, cy); x.stroke();
  };
  const num = s => cell(s === '40' ? 0 : 1, () => {
    circle(30, '#d9342c'); circle(22, '#ffffff');
    x.fillStyle = '#16171b'; x.font = 'bold 24px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, 32, 34);
  });
  num('40'); num('60');
  cell(K.ZEB, () => { square('#2f5fc4'); tri(true, '#ffffff', 22); x.fillStyle = '#16171b'; for (let i = 0; i < 4; i++) x.fillRect(19 + i * 7, 44, 4, 4); man(32, 34, 1.05, '#16171b'); });
  cell(K.GIVE, () => { tri(false, '#d9342c', 30); tri(false, '#ffffff', 19); });
  cell(K.MAIN, () => { diamond('#ffffff', 30); diamond('#16171b', 26); diamond('#ffffff', 24); diamond('#f2c21b', 17); });
  cell(K.NOENT, () => { circle(30, '#d9342c'); x.fillStyle = '#ffffff'; x.fillRect(12, 27, 40, 10); });
  cell(K.BUS, () => {
    square('#2f5fc4'); x.fillStyle = '#ffffff';
    x.beginPath(); x.roundRect(14, 16, 36, 28, 5); x.fill();
    x.fillStyle = '#2f5fc4'; x.fillRect(18, 20, 28, 9);
    x.beginPath(); x.arc(22, 46, 4, 0, Math.PI * 2); x.arc(42, 46, 4, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
  });
  cell(K.KIDS, () => { tri(true, '#d9342c', 31); tri(true, '#ffffff', 22); man(27, 40, 0.8, '#16171b'); man(37, 42, 0.62, '#16171b'); });
  cell(K.ONEW, () => {
    square('#2f5fc4'); x.fillStyle = '#ffffff';
    x.fillRect(28, 26, 8, 24); x.beginPath(); x.moveTo(32, 12); x.lineTo(45, 28); x.lineTo(19, 28); x.closePath(); x.fill();
  });
  const G = '#8d929b';
  cell(11, () => tri(true, G, 31)); cell(12, () => circle(30, G)); cell(13, () => tri(false, G, 30)); cell(14, () => square(G)); cell(15, () => diamond(G, 30));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  return tex;
}

const SG = { poles: [], grid: new Map(), mesh: null, mat: null, pos: null, checkT: 0 };
const SGC = 20;                                   // клетка сетки столбов, м
const sgKey = (x, z) => Math.floor(x / SGC) + ',' + Math.floor(z / SGC);

/* поставить табличку kind в точке x,z лицом к (fx, fz) — к тем, кому она адресована */
/* повтор: тот же знак тем же лицом на той же улице ближе 60 м (переход — 220, скорость — 250) — не ставим */
const REP = new Map();
const repList = (street, kind) => {
  let m = REP.get(street);
  if (!m) REP.set(street, m = new Map());
  let l = m.get(kind);
  if (!l) m.set(kind, l = []);
  return l;
};
function placeSign (A, kind, x, z, fx, fz, street) {
  const rep = street ? repList(street, kind) : null, rd = kind === K.S40 || kind === K.S60 ? 250 : kind === K.ZEB ? 220 : 60;
  if (rep && rep.some(q => q[2] * fx + q[3] * fz > 0.7 && Math.abs(q[0] - x) < rd && Math.abs(q[1] - z) < rd && Math.hypot(q[0] - x, q[1] - z) < rd)) return false;
  if (!putSign(A, kind, x, z, fx, fz)) return false;
  if (rep) rep.push([x, z, fx, fz]);
  return true;
}
function putSign (A, kind, x, z, fx, fz) {
  const ci = Math.floor(x / SGC), cj = Math.floor(z / SGC);
  for (let i = ci - 1; i <= ci + 1; i++)
    for (let j = cj - 1; j <= cj + 1; j++)
      for (const p of SG.grid.get(i + ',' + j) || []) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < 1.6 && p.signs.length < 2 && p.fx * fx + p.fz * fz > 0.7 && !p.signs.some(s => s.kind === kind)) { p.signs.push({ kind }); return true; }
        if (d < 2.4) return false;
      }
  if (!A.inBounds(x, z, 6) || A.groundH(x, z) < 0.3) return false;
  const r = A.nearestRoad(x, z, 7, 1);
  if (r && (r.d < r.seg.w / 2 + 0.5 || r.seg.b)) return false;
  const rb = A.nearestRoad(x, z, 5, 1);
  if (rb && rb.seg.b && rb.d < rb.seg.w / 2 + 10) return false;       // у моста и под ним — нет
  if (A.inHouse(x, z, 0.7)) return false;
  const p = { x, z, fx, fz, signs: [{ kind }], it: null, v0: 0, vn: 0, down: 0 };
  SG.poles.push(p);
  const k = sgKey(x, z);
  if (!SG.grid.has(k)) SG.grid.set(k, []);
  SG.grid.get(k).push(p);
  return true;
}

function buildSigns (A) {
  const { NODES, edgeOf, edgeRun, ZEBRAS, SIG_GROUPS, CITY } = A;
  const sigNodes = new Set();
  for (const g of SIG_GROUPS) for (const n of g.nodes) sigNodes.add(n);
  const at = (e, d, side, off) => {             // точка у ребра: d — от узла a вдоль, side — справа (1) / слева (-1)
    const N = NODES[e.a];
    return [N.x + e.ux * d + e.rx * off * side, N.z + e.uz * d + e.rz * off * side];
  };
  const OFF = e => e.w / 2 + 1.05;
  // зебры: справа по ходу — лицом к подъезжающим, с обеих сторон
  for (const zb of ZEBRAS) {
    if (zb.sig || zb.e.c > 4) continue;           // во дворах и на тихих улочках переход без знака — иначе лес столбов
    const e = zb.e, back = edgeOf(e.b, e.a), off = zb.w / 2 + 1.05, rx = -zb.uz, rz = zb.ux;
    const fwd = e.ok, bwd = back && back.ok;
    const st = e.road.n || e.road;
    if (fwd) placeSign(A, K.ZEB, zb.x + rx * off - zb.ux * 1.2, zb.z + rz * off - zb.uz * 1.2, -zb.ux, -zb.uz, st);
    if (bwd) placeSign(A, K.ZEB, zb.x - rx * off + zb.ux * 1.2, zb.z - rz * off + zb.uz * 1.2, zb.ux, zb.uz, st);
  }
  for (let n = 0; n < NODES.length; n++) {
    const N = NODES[n];
    if (!A.inBounds(N.x, N.z, 20)) continue;
    const deg = N.nb.length;
    // перекрёсток без светофора: второстепенная уступает, главная — ромб
    if (deg >= 3 && !sigNodes.has(n)) {
      let minC = 9, maxC = 0;
      for (const m of N.nb) { const e = edgeOf(m, n); if (e.c <= 5) { minC = Math.min(minC, e.c); maxC = Math.max(maxC, e.c); } }
      if (maxC > minC)
        for (const m of N.nb) {
          const e = edgeOf(m, n);
          if (!e.ok || e.c > 5 || edgeRun(e) < 14) continue;
          const main = e.c === minC;
          if (main && hash(N.x, N.z, 1) > 0.55) continue;
          const [x, z] = at(e, e.len - e.tB - 2.5, 1, OFF(e));
          placeSign(A, main ? K.MAIN : K.GIVE, x, z, -e.ux, -e.uz, e.road.n || e.road);
        }
    }
    if (deg < 3) continue;
    for (const m of N.nb) {
      const e = edgeOf(n, m), back = edgeOf(m, n);
      if (e.c > 5 || e.road.b) continue;
      // въезд против одностороннего — «кирпич»; по шерсти — «одностороннее»
      if (!e.ok && back.ok) {
        const [x, z] = at(e, e.tA + 1.6, 1, OFF(e));
        placeSign(A, K.NOENT, x, z, -e.ux, -e.uz, e.road.n || e.road);
        continue;
      }
      if (e.ok && e.oneway && hash(N.x, N.z, 2 + m) < 0.35) {
        const [x, z] = at(e, e.tA + 4, 1, OFF(e));
        placeSign(A, K.ONEW, x, z, -e.ux, -e.uz, e.road.n || e.road);
      }
      // ограничение скорости сразу за перекрёстком
      if (e.ok && e.c <= 4 && e.len > 90 && hash(N.x, N.z, 7 + m) < 0.06) {
        const k = e.c <= 1 ? K.S60 : e.c >= 3 ? K.S40 : hash(N.x, N.z, 9) < 0.5 ? K.S60 : K.S40;
        const [x, z] = at(e, e.tA + 11, 1, OFF(e));
        placeSign(A, k, x, z, -e.ux, -e.uz, e.road.n || e.road);
      }
    }
  }
  // остановки: синий знак на краю тротуара, по ходу впереди будки
  for (const s of CITY.stops || []) {
    const road = A.nearestRoad(s.p[0], s.p[1], A.DRIVE_MAX, 1);
    if (!road || road.d > 26 || road.seg.b) continue;
    const sg = road.seg, l = Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) || 1;
    let ux = (sg.x2 - sg.x1) / l, uz = (sg.z2 - sg.z1) / l;
    const dx = s.p[0] - road.x, dz = s.p[1] - road.z, dl = Math.hypot(dx, dz) || 1;
    if (-uz * dx + ux * dz < 0) { ux = -ux; uz = -uz; }         // едем так, чтобы остановка была справа
    const o = sg.w / 2 + 1.0;
    const be = sg.na !== undefined && sg.nb !== undefined ? edgeOf(sg.na, sg.nb) : null;
    placeSign(A, K.BUS, road.x + dx / dl * o + ux * 3.4, road.z + dz / dl * o + uz * 3.4, -ux, -uz, be ? be.road.n || be.road : sg.name);
  }
  // «дети» у школ и садов: с обеих сторон улицы метров за тридцать
  const KIDS = /школ|детск|сад\b|сад |гимназ|лице|school|kinder/i;
  for (const b of CITY.buildings) {
    if (b.k !== 'pub' || !b.n || !KIDS.test(b.n)) continue;
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    const road = A.nearestRoad(cx, cz, 5, 2);
    if (!road || road.d > 70 || road.seg.na === undefined || road.seg.nb === undefined) continue;
    const e0 = edgeOf(road.seg.na, road.seg.nb);
    if (!e0) continue;
    for (const e of [e0, edgeOf(e0.b, e0.a)]) {
      if (!e || !e.ok) continue;
      const N = NODES[e.a], d = (road.x - N.x) * e.ux + (road.z - N.z) * e.uz - 28;
      if (d < e.tA + 2) continue;
      const [x, z] = at(e, d, 1, OFF(e));
      placeSign(A, K.KIDS, x, z, -e.ux, -e.uz, e.road.n || e.road);
    }
  }
  // столбы — в сбиваемое, таблички — одной склейкой
  const P = [], U = [], I = [];
  const quad = (cx, cy, cz, fx, fz, s, cellI) => {
    const rx = fz * s / 2, rz = -fx * s / 2, h = s / 2, vi = P.length / 3;
    P.push(cx - rx, cy - h, cz - rz, cx + rx, cy - h, cz + rz, cx + rx, cy + h, cz + rz, cx - rx, cy + h, cz - rz);
    const u0 = (cellI % 4) / 4, v1 = 1 - ((cellI / 4) | 0) / 4, v0 = v1 - 0.25, du = 0.5 / 256, dv = 0.5 / 256;
    U.push(u0 + du, v0 + dv, u0 + 0.25 - du, v0 + dv, u0 + 0.25 - du, v1 - dv, u0 + du, v1 - dv);
    I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  };
  A.SM_WORD.sign = t('знак');
  for (const p of SG.poles) {
    const base = A.groundH(p.x, p.z) + A.curbAt(p.x, p.z);
    const L = [];
    A.put(L, new THREE.BoxGeometry(0.08, 2.62, 0.08), '#9aa0a8', p.x, base + 1.3, p.z);
    A.smashAdd('sign', p.x, p.z, 0.5, L, '#9aa0a8');
    p.it = A.SMASH[A.SMASH.length - 1];
    p.v0 = P.length / 3;
    p.signs.forEach((s, i) => {
      const y = base + (i ? 1.46 : 2.2), sz = s.kind === K.MAIN ? 0.66 : 0.74;
      quad(p.x + p.fx * 0.07, y, p.z + p.fz * 0.07, p.fx, p.fz, sz, s.kind);
      quad(p.x + p.fx * 0.055, y, p.z + p.fz * 0.055, -p.fx, -p.fz, sz, BACK[s.kind]);
      RL.n.signs++;
    });
    p.vn = P.length / 3 - p.v0;
    RL.n.poles++;
  }
  if (!P.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeBoundingSphere();
  SG.mat = new THREE.MeshBasicMaterial({ map: signAtlas(), alphaTest: 0.5 });
  SG.mesh = new THREE.Mesh(g, SG.mat);
  SG.pos = g.attributes.position;
  A.scene.add(SG.mesh);
}

/* сбитый столб: табличку — под землю (столб прячет сама склейка сбиваемого) */
function stepSigns (dt, A) {
  if (!SG.mesh || (SG.checkT -= dt) > 0) return;
  SG.checkT = 0.25;
  const V = A.V, ci = Math.floor(V.x / SGC), cj = Math.floor(V.z / SGC);
  let dirty = false;
  for (let i = ci - 1; i <= ci + 1; i++)
    for (let j = cj - 1; j <= cj + 1; j++)
      for (const p of SG.grid.get(i + ',' + j) || []) {
        if (p.down || !p.it || !p.it.down) continue;
        p.down = 1;
        const a = SG.pos.array;
        for (let v = p.v0; v < p.v0 + p.vn; v++) a[v * 3 + 1] = -60;
        dirty = true;
      }
  if (dirty) SG.pos.needsUpdate = true;
  // ночью светоотражающая плёнка — не лампочка: чуть темнее
  const n = A.ENV ? A.ENV.night : 0;
  SG.mat.color.setScalar(lerp(1, 0.55, n));
}

/* ═════════════════ высокие чёрные заборы ═════════════════ */
function fenceTex () {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#17181c';
  x.fillRect(0, 0, 4, 64); x.fillRect(76, 0, 4, 64);                 // столбы по краям секции
  x.fillRect(0, 9, 80, 3); x.fillRect(0, 54, 80, 3);                  // две перекладины
  for (let i = 0; i < 8; i++) {
    const bx = 7 + i * 9.4;
    x.fillRect(bx, 4, 2.4, 60);
    x.beginPath(); x.moveTo(bx - 1, 5); x.lineTo(bx + 1.2, 0); x.lineTo(bx + 3.4, 5); x.closePath(); x.fill();   // пика
  }
  x.fillStyle = '#3a3c44'; for (let i = 0; i < 8; i++) x.fillRect(7.6 + i * 9.4, 12, 0.8, 42);                  // блик на прутке
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

function buildFences (A) {
  const { CITY, inHouse, nearestRoad, groundH, obb } = A;
  const PIZ = A.PIZZA;
  // дорожки — по клеткам: забор их не перекрывает, в этом месте калитка
  const PC = 16, PG = new Map();
  for (const p of CITY.paths || [])
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i];
      for (let a = Math.floor(Math.min(x1, x2) / PC); a <= Math.floor(Math.max(x1, x2) / PC); a++)
        for (let b = Math.floor(Math.min(z1, z2) / PC); b <= Math.floor(Math.max(z1, z2) / PC); b++) {
          const k = a + ',' + b;
          if (!PG.has(k)) PG.set(k, []);
          PG.get(k).push([x1, z1, x2, z2]);
        }
    }
  const nearPath = (x, z, r) => {
    for (const [x1, z1, x2, z2] of PG.get(Math.floor(x / PC) + ',' + Math.floor(z / PC)) || []) {
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1, q = clamp(((x - x1) * dx + (z - z1) * dz) / l2, 0, 1);
      if (Math.hypot(x - x1 - dx * q, z - z1 - dz * q) < r) return true;
    }
    return false;
  };
  const near = (list, x, z, r) => list.some(q => Math.abs(q[0] - x) < r && Math.abs(q[1] - z) < r);
  const TAKEN = new Set(), tk = (x, z) => Math.round(x) + ',' + Math.round(z);
  const ENTR = CITY.entrances || [];
  // ответ по точке — в кэш по полметра: стороны и секции спрашивают одно и то же
  const BADC = new Map();
  // hm — запас от стен: у самого фасада (отступ меньше полуметра) свой дом не в счёт
  const bad = (x, z, hm = 0.5) => {
    if (TAKEN.has(tk(x, z))) return true;
    const key = Math.round(x * 2) * 100003 + Math.round(z * 2);
    let v = BADC.get(key);
    if (v === undefined) {
      v = !A.inBounds(x, z, 10) || groundH(x, z) < 0.3;
      if (!v) { const r = nearestRoad(x, z, 7, 1); v = !!r && r.d < r.seg.w / 2 + (r.seg.c <= 5 ? 2.85 : 0.9); }   // не через улицу, тротуар и проезд
      if (!v) v = nearPath(x, z, 1.3) || near(A.PARKED, x, z, 3) || near(ENTR, x, z, 2);
      BADC.set(key, v);
    }
    return v || inHouse(x, z, hm);
  };
  // сторона вплотную к фасаду у самого тротуара: полотно и тротуар по-прежнему нельзя,
  // а запас от бордюра — поменьше (пешеходы идут в полутора метрах от него)
  const badTight = (x, z) => {
    if (TAKEN.has(tk(x, z)) || !A.inBounds(x, z, 10) || groundH(x, z) < 0.3) return true;
    const r = nearestRoad(x, z, 7, 1);
    if (r && r.d < r.seg.w / 2 + (r.seg.c <= 5 ? 2.2 : 0.9)) return true;
    return nearPath(x, z, 1.3) || near(A.PARKED, x, z, 3) || near(ENTR, x, z, 1.2) || inHouse(x, z, 0);
  };
  const KIDS = /школ|детск|сад\b|сад |гимназ|лице|school|kinder/i;
  const P = [], N = [], U = [], I = [];
  let houses = 0;
  for (const b of CITY.buildings) {
    if ((houses >= 200 || RL.n.panels > 7000) && !b.rich) continue;      // особняки (world.js) — за забором всегда
    const p = b.p;
    let cx = 0, cz = 0;
    for (const q of p) { cx += q[0] / p.length; cz += q[1] / p.length; }
    const h = hash(cx, cz, 5);
    const kids = b.k === 'pub' && b.n && KIDS.test(b.n);
    const want = b.rich ? 1 : b.k === 'priv' ? 0.6 : kids ? 1 : b.k === 'pub' && (b.lv || 0) <= 4 ? 0.35 : b.k === 'res' ? ((b.lv || 0) >= 12 || (b.lv || 0) <= 3 ? 0.4 : 0.2) : 0;
    if (h >= want) continue;
    if (PIZ && Math.hypot(cx - PIZ.x, cz - PIZ.z) < 80) continue;
    // прямоугольник наименьшей площади вокруг дома
    let R = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l < 1) continue;
      const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of p) {
        const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      const area = (u1 - u0) * (v1 - v0);
      if (!R || area < R.area) R = { ux, uz, u0, u1, v0, v1, area };
    }
    if (!R || R.u1 - R.u0 > 90 || R.v1 - R.v0 > 90 || R.u1 - R.u0 < 4 || R.v1 - R.v0 < 4) continue;
    if ((CITY.pois || []).some(q => A.inPoly(q.p[0], q.p[1], p) || Math.hypot(q.p[0] - cx, q.p[1] - cz) < 6)) continue;   // магазин в доме — двор открытый
    const X = (u, v) => [u * R.ux - v * R.uz, u * R.uz + v * R.ux];
    const M = b.rich ? 6 : b.k === 'priv' ? 4 : kids ? 10 : 7;
    // отступ каждой стороны: самый широкий, при котором линия ничего не задевает
    const sideBad = (fixU, c0, a0, a1, hm) => {   // fixU: сторона вдоль v при u = c0, иначе вдоль u при v = c0
      let nb = 0;
      for (let s = a0; s <= a1 + 0.01; s += 2) { const [x, z] = fixU ? X(c0, s) : X(s, c0); if (bad(x, z, hm)) nb++; }
      return nb;
    };
    // Отступ каждой стороны — самый широкий, при котором линия ничего не задевает.
    // Дом у самого тротуара (частный сектор) — забор по краю тротуара, хоть в
    // тридцати сантиметрах от фасада: иначе сторона к улице выпадала целиком.
    const m = [0, 0, 0, 0], tight = [0, 0, 0, 0];   // u0, u1, v0, v1
    const cand = [M, M * 0.75, M * 0.55, 2.4, 1.8, 1.3, 0.9, 0.6, 0.35];
    for (let sd = 0; sd < 4; sd++) {
      let best = 1.8, bn = Infinity;
      for (const mm of cand) {
        const hm = Math.min(0.5, mm * 0.6);
        const nb = sd < 2 ? sideBad(true, sd ? R.u1 + mm : R.u0 - mm, R.v0 - M, R.v1 + M, hm) : sideBad(false, sd === 3 ? R.v1 + mm : R.v0 - mm, R.u0 - M, R.u1 + M, hm);
        if (nb < bn) { bn = nb; best = mm; }
        if (!nb) break;
      }
      m[sd] = best;
      // и так задевает — фасад стоит на краю тротуара: забор в линию фасада, от углов дома к боковым
      if (bn > 0) { m[sd] = 0.08; tight[sd] = 1; }
    }
    const U0 = R.u0 - m[0], U1 = R.u1 + m[1], V0 = R.v0 - m[2], V1 = R.v1 + m[3];
    const sides = [[U0, V0, U1, V0], [U1, V0, U1, V1], [U1, V1, U0, V1], [U0, V1, U0, V0]];
    // въезд — со стороны, ближней к улице
    let gate = 0, gd = Infinity;
    sides.forEach(([a0, b0, a1, b1], i) => {
      const [x, z] = X((a0 + a1) / 2, (b0 + b1) / 2), r = nearestRoad(x, z, 5, 2), len = Math.hypot(a1 - a0, b1 - b0);
      const sd = i === 0 ? 2 : i === 1 ? 1 : i === 2 ? 3 : 0;         // вдоль фасада въезда нет — ворота на соседней стороне
      if (r && len > 7 && !tight[sd] && r.d < gd) { gd = r.d; gate = i; }
    });
    let panels = 0;
    const runs = [], mine = [], sidePanels = [0, 0, 0, 0];
    sides.forEach(([a0, b0, a1, b1], si) => {
      const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / 2.5));
      let run = null;
      for (let k = 0; k < n; k++) {
        const q0 = k / n, q1 = (k + 1) / n, qm = (q0 + q1) / 2;
        const [x1, z1] = X(lerp(a0, a1, q0), lerp(b0, b1, q0)), [x2, z2] = X(lerp(a0, a1, q1), lerp(b0, b1, q1));
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        const sd = si === 0 ? 2 : si === 1 ? 1 : si === 2 ? 3 : 0, hm = Math.min(0.5, m[sd] * 0.6);    // side 0 — v0, 1 — u1, 2 — v1, 3 — u0
        const B = tight[sd] ? badTight : (x, z) => bad(x, z, hm);
        const skip = (si === gate && Math.abs(qm - 0.5) * len < 2.7) || B(mx, mz) || B(lerp(x1, x2, 0.1), lerp(z1, z2, 0.1)) || B(lerp(x1, x2, 0.9), lerp(z1, z2, 0.9));
        if (skip) { if (run) { runs.push(run); run = null; } continue; }
        if (!run) run = { x1, z1, x2, z2 }; else { run.x2 = x2; run.z2 = z2; }
        const y1 = groundH(x1, z1) - 0.06, y2 = groundH(x2, z2) - 0.06, vi = P.length / 3;
        const dx = x2 - x1, dz = z2 - z1, dl = Math.hypot(dx, dz) || 1, nx = -dz / dl, nz = dx / dl;
        P.push(x1, y1, z1, x2, y2, z2, x2, y2 + 2.05, z2, x1, y1 + 2.05, z1);
        for (let v = 0; v < 4; v++) N.push(nx, 0, nz);
        U.push(0, 0, 1, 0, 1, 1, 0, 1);
        I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        mine.push(tk(mx, mz), tk(x1, z1), tk(x2, z2));
        panels++; sidePanels[si]++;
      }
      if (run) runs.push(run);
    });
    for (const r of runs) {
      const dx = r.x2 - r.x1, dz = r.z2 - r.z1, l = Math.hypot(dx, dz);
      if (l > 0.5) obb((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2, l / 2, 0.12, Math.atan2(dz, dx));
    }
    for (const k of mine) TAKEN.add(k);            // чужой забор поверх этого не встанет
    if (panels) RL.n.openSides = (RL.n.openSides || 0) + sidePanels.filter(v => !v).length;   // стороны без единой секции — для отладки
    if (panels) { houses++; RL.n.panels += panels; const [a0, b0, a1, b1] = sides[gate], [gx, gz] = X((a0 + a1) / 2, (b0 + b1) / 2); RL.fenceAt.push([Math.round(cx), Math.round(cz), b.k, Math.round(gx), Math.round(gz)]); }
  }
  RL.n.fences = houses;
  if (!P.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeBoundingSphere();
  A.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide })));
}

export function build (A) {
  if (RL_OFF) return;
  const t0 = performance.now();
  buildSigns(A);
  const t1 = performance.now();
  buildFences(A);
  RL.ms.signs = Math.round(t1 - t0);
  RL.ms.fences = Math.round(performance.now() - t1);
}

/* ═════════════════ препятствия на время ═════════════════
   Сетку препятствий game.js строит один раз (indexSolids); свои временные
   кладём в неё и вынимаем сами, не перестраивая всю. */
function addSolid (A, s) {
  const C = A.SCELL;
  for (let i = Math.floor((s.cx - s.ex) / C); i <= Math.floor((s.cx + s.ex) / C); i++)
    for (let j = Math.floor((s.cz - s.ez) / C); j <= Math.floor((s.cz + s.ez) / C); j++) {
      const k = i + ',' + j;
      let a = A.SOLID_GRID.get(k);
      if (!a) A.SOLID_GRID.set(k, a = []);
      a.push(s);
    }
}
function delSolid (A, s) {
  const i0 = A.SOLIDS.indexOf(s);
  if (i0 >= 0) A.SOLIDS.splice(i0, 1);
  for (const a of A.SOLID_GRID.values()) { const k = a.indexOf(s); if (k >= 0) a.splice(k, 1); }
}

/* ═════════════════ пробки за авариями ═════════════════ */
const JAMS = [];
const JAM_BY = new Map();                   // направленное ребро → пробка
const LOOK_LINES = () => [t('ну чё там?'), t('опять авария…'), t('надолго встали'), t('кто там встал?!'), t('пропустите!'), t('гаишников вызвали?')];

function makeJam (A, a) {
  const road = A.nearestRoad(a.x, a.z, 5, 1);
  if (!road || road.seg.na === undefined || road.seg.nb === undefined) return null;
  let e = A.edgeOf(road.seg.na, road.seg.nb);
  if (!e) return null;
  // сторона, где встали машины: едем так, чтобы она была справа; на односторонней — куда можно
  const c0 = a.cars[0];
  if (c0 && (c0.x - a.x) * e.rx + (c0.z - a.z) * e.rz < 0) e = A.edgeOf(e.b, e.a);
  if (!e) return null;
  if (!e.ok) { const r = A.edgeOf(e.b, e.a); if (!r || !r.ok) return null; e = r; }
  const N = A.NODES[e.a];
  const along = (a.x - N.x) * e.ux + (a.z - N.z) * e.uz;
  const off = c0 ? (c0.x - a.x) * e.rx + (c0.z - a.z) * e.rz : Math.max(1.6, e.w / 4), lanes = new Set(), nl = A.laneCount(e);
  for (let k = 0; k < nl; k++) if (Math.abs(A.laneOff(e, k) - off) < 2.5) lanes.add(k);
  if (!lanes.size) lanes.add(0);
  // рёбра назад от аварии: очередь не кончается на перекрёстке
  const chain = [];
  for (let q = e; chain.length < 3;) {
    let p = null;
    for (const m of A.NODES[q.a].nb) {
      if (m === q.b) continue;
      const c = A.edgeOf(m, q.a);
      if (c && c.ok && c.c <= 5 && c.ux * q.ux + c.uz * q.uz > 0.6 && c !== e && !chain.includes(c)) { p = c; break; }
    }
    if (!p) break;
    chain.push(p); q = p;
  }
  const rear = Math.min(along, ...a.cars.map(c => (c.x - N.x) * e.ux + (c.z - N.z) * e.uz));      // задняя из двух — по ходу потока
  const J = { a, e, chain, sStop: rear - e.tA - 5.6, lanes, stops: new Map(), edges: new Set([e, ...chain]), pieces: [], extras: [], men: [],
    honkT: rand(1, 3), outT: rand(4, 9), outN: 0, age: 0, done: 0, doneT: 0 };
  const st = jamAt(A, J, 0);
  if (st) J.stops.set(st[0], st[1]);
  // хвост на радаре: от аварии на семьдесят метров назад, по кускам рёбер
  for (let v = 9; v >= -81; v -= 2) {
    const b = jamAt(A, J, v);
    if (!b) break;
    const last = J.pieces[J.pieces.length - 1];
    if (last && last.e === b[0]) last.s0 = b[1]; else J.pieces.push({ e: b[0], s0: b[1], s1: b[1] });
  }
  if (Math.hypot(a.x - A.V.x, a.z - A.V.z) < 330) fillJam(A, J);
  return J;
}

/* точка очереди: v метров от стоп-точки (назад — минус) → [ребро, s] */
function jamAt (A, J, v) {
  let e = J.e, s = J.sStop + v;
  for (let k = 0; s < 1; k++) {
    const p = J.chain[k];
    if (!p) return null;
    s += A.edgeRun(p) - 3;            // дуга перекрёстка — метра три
    e = p;
  }
  return [e, Math.min(s, A.edgeRun(e) - 0.5)];
}

/* дозаводим очередь: по перекрытым полосам назад от аварии */
function fillJam (A, J) {
  for (const lane of J.lanes)
    for (let k = 0; k < 7 && J.extras.length < 12; k++) {
      const b = jamAt(A, J, -0.5 - k * 6.6);
      if (!b) break;
      const [e, s] = b, ln = Math.min(lane, A.laneCount(e) - 1);
      const N = A.NODES[e.a], o = A.laneOff(e, ln), d = e.tA + s;
      const x = N.x + e.ux * d + e.rx * o, z = N.z + e.uz * d + e.rz * o;
      if (A.TRAFFIC.some(q => Math.abs(q.x - x) < 5.5 && Math.abs(q.z - z) < 5.5)) continue;
      const c = A.newCar(true);                  // лёгкая модель: припаркованная, но едет
      c.parked = false;
      Object.assign(c, { e, s, lane: ln, turn: null, speed: 0, gy: undefined, rlJam: J });
      A.scene.add(c.mesh);
      A.TRAFFIC.push(c);
      A.poseTraffic(c, 0);
      J.extras.push(c);
    }
}

function stepJams (dt, A) {
  const V = A.V;
  for (const a of A.ACCIDENTS) {
    if (a.rl !== undefined) continue;
    a.rl = makeJam(A, a);
    if (a.rl) { JAMS.push(a.rl); for (const e of a.rl.edges) JAM_BY.set(e, a.rl); RL.n.jams++; }
  }
  for (let i = JAMS.length - 1; i >= 0; i--) {
    const J = JAMS[i];
    J.age += dt;
    if (!J.done && !A.ACCIDENTS.includes(J.a)) {
      J.done = 1;
      for (const e of J.edges) if (JAM_BY.get(e) === J) JAM_BY.delete(e);
    }
    const dV = Math.hypot(J.a.x - V.x, J.a.z - V.z);
    if (!J.done && dV < 110) {
      // сигналят: то один, то другой, два коротких
      if ((J.honkT -= dt) <= 0) {
        J.honkT = rand(0.7, 2.4);
        const q = A.TRAFFIC.filter(c => J.edges.has(c.e) && !c.turn && c.speed < 0.6 && !c.parked);
        if (q.length && A.Snd) {
          const c = pick(q), d = Math.hypot(c.x - V.x, c.z - V.z);
          if (d < 90) {
            const f = c.rlHorn || (c.rlHorn = rand(330, 470)), v = 0.07 * (1 - d / 90);
            A.Snd.blip(f, 0.13, 'square', v);
            if (Math.random() < 0.6) setTimeout(() => A.Snd.blip(f, 0.22, 'square', v), 170);
          }
        }
      }
      // водитель вышел посмотреть, что там впереди
      if (J.outN < 2 && J.age > 3 && (J.outT -= dt) <= 0) {
        J.outT = rand(8, 16);
        const q = A.TRAFFIC.filter(c => J.edges.has(c.e) && !c.turn && c.speed < 0.3 && !c.parked && !c.rlOut && !c.wreck && !c.knock && !c.taxi && (c.e !== J.e || c.s < J.sStop - 4));
        if (q.length) { manOut(A, J, pick(q)); J.outN++; }
      }
    }
    stepMen(dt, A, J);
    if (J.done) {
      J.doneT += dt;
      // лишние машины уходят, когда их не видно
      for (const c of J.extras) {
        if (c.gone || c.wreck || c.knock || c.driver || c.rlOut) continue;
        const d = Math.hypot(c.x - A.cam.position.x, c.z - A.cam.position.z);
        if (d > 140 || (J.doneT > 90 && d > 60)) A.svcGone(c);
      }
      J.extras = J.extras.filter(c => !c.gone);
      if (!J.extras.length && !J.men.length) JAMS.splice(i, 1);
    }
  }
}

function manOut (A, J, c) {
  const hx = Math.sin(c.h), hz = Math.cos(c.h), lx = hz, lz = -hx;          // слева по ходу — дверь водителя
  const x = c.x + lx * 1.25, z = c.z + lz * 1.25;
  const grp = A.makeHuman(null);
  grp.position.set(x, A.groundH(x, z), z);
  A.scene.add(grp);
  c.rlOut = 1;
  J.men.push({ grp, c, x, z, bx: x, bz: z, tx: x + hx * rand(3, 5) + lx * 0.5, tz: z + hz * rand(3, 5) + lz * 0.5, st: 'go', T: 0, ph: 0, h: c.h, bubble: null });
}

function stepMen (dt, A, J) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let i = J.men.length - 1; i >= 0; i--) {
    const m = J.men[i], u = m.grp.userData, c = m.c;
    const carOk = c && !c.gone && !c.wreck && !c.knock;
    if ((J.done || !carOk) && m.st !== 'back') m.st = 'back';
    let walk = false;
    if (m.st === 'go' || m.st === 'back') {
      const tx = m.st === 'go' ? m.tx : (carOk ? c.x + Math.cos(c.h) * 1.25 : m.bx), tz = m.st === 'go' ? m.tz : (carOk ? c.z - Math.sin(c.h) * 1.25 : m.bz);
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz), v = (m.st === 'back' && J.done ? 2.4 : 1.3) * dt;
      if (d < 0.25) {
        if (m.st === 'go') { m.st = 'look'; m.T = rand(5, 8); m.bubble = A.sayBubble(m.grp, pick(LOOK_LINES()), '#4f7fd6', 2.6); }
        else { A.dropMesh(m.grp); if (c) c.rlOut = 0; J.men.splice(i, 1); continue; }
      } else { m.x += dx / d * Math.min(v, d); m.z += dz / d * Math.min(v, d); m.h = Math.atan2(dx, dz); walk = true; }
    } else if (m.st === 'look') {
      m.h = c ? c.h : m.h;
      if ((m.T -= dt) <= 0) { m.st = 'back'; if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; } }
    }
    m.ph += dt * (walk ? 9 : 0);
    if (u.legL) { u.legL.rotation.x = walk ? Math.sin(m.ph) * 0.5 : 0; u.legR.rotation.x = walk ? -Math.sin(m.ph) * 0.5 : 0; }
    if (u.armR) u.armR.rotation.x = m.st === 'look' ? -2.5 : walk ? -Math.sin(m.ph) * 0.4 : 0;     // ладонь козырьком
    if (u.armL) u.armL.rotation.x = walk ? Math.sin(m.ph) * 0.4 : 0;
    m.grp.rotation.y = m.h;
    m.grp.position.set(m.x, A.groundH(m.x, m.z) + A.curbAt(m.x, m.z), m.z);
    // наезд — как на прохожего
    if (sp > 3) {
      const dx = m.x - V.x, dz = m.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < 2.4 && Math.abs(dx * fz - dz * fx) < 1.25) {
        A.dropMesh(m.grp);
        A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, V.vx, V.vz);
        if (A.onRunOver) A.onRunOver('driver');
        if (c) c.rlOut = 0;
        J.men.splice(i, 1);
      }
    }
  }
}

/* ═════════════════ ремонт: улицу закрыли ═════════════════ */
const WORKS = [];
const CLOSED = new Map();                      // направленное ребро → { sBar, w }
const WK = { cd: 25, checkT: 0, anyT: rand(60, 110) };
let WK_TEX = null, WK_MAT = null, CONE_GEO = null, SHOVEL_GEO = null;
function worksTex () {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const fit = (s, cx, y, max, f0) => { let f = f0; x.font = 'bold ' + f + 'px sans-serif'; while (f > 10 && x.measureText(s).width > max) { f--; x.font = 'bold ' + f + 'px sans-serif'; } x.fillText(s, cx, y); };
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 64);
  x.strokeStyle = '#d9342c'; x.lineWidth = 8; x.strokeRect(5, 5, 246, 54);
  x.fillStyle = '#d9342c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  fit(t('ДОРОГА ЗАКРЫТА'), 128, 33, 226, 26);
  x.fillStyle = '#ff9a1a'; x.fillRect(0, 64, 256, 64);
  x.fillStyle = '#16171b'; x.fillRect(0, 64, 256, 5); x.fillRect(0, 123, 256, 5);
  x.save(); x.translate(38, 97);
  x.beginPath(); x.moveTo(0, -25); x.lineTo(26, 21); x.lineTo(-26, 21); x.closePath();
  x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#d9342c'; x.stroke();
  x.fillStyle = '#16171b';
  x.beginPath(); x.arc(-2, -6, 3.4, 0, Math.PI * 2); x.fill();
  x.fillRect(-4, -2, 5, 11); x.fillRect(-6, 9, 3, 8); x.fillRect(0, 9, 3, 8);
  x.fillRect(1, 0, 12, 2.5); x.fillRect(11, 0, 2.5, 10); x.fillRect(8, 9, 9, 3);
  x.beginPath(); x.moveTo(-15, 17); x.lineTo(-6, 10); x.lineTo(-2, 17); x.fill();
  x.restore();
  x.fillStyle = '#16171b';
  fit(t('РЕМОНТ'), 156, 97, 180, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/* путь в обход закрытого ребра: Дейкстра в радиусе километра */
function detourLen (A, ia, ib, e) {
  const { NODES } = A, M = NODES[ia], dist = new Map([[ia, 0]]), done = new Set(), heap = [[0, ia]];
  let pops = 0;
  while (heap.length && pops++ < 6000) {
    let bi = 0;
    for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[bi][0]) bi = k;
    const [d, n] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
    if (done.has(n)) continue;
    done.add(n);
    if (n === ib) return d;
    if (d > 1500) return Infinity;
    const Nn = NODES[n];
    for (const m of Nn.nb) {
      if ((n === ia && m === ib) || (n === ib && m === ia)) continue;
      const q = A.edgeOf(n, m);
      if (!q || q.c > 5) continue;
      const Nm = NODES[m];
      if (Math.abs(Nm.x - M.x) > 900 || Math.abs(Nm.z - M.z) > 900) continue;
      const nd = d + q.len;
      if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); heap.push([nd, m]); }
    }
  }
  return Infinity;
}

/* годится ли ребро под ремонт */
function worksOk (A, e, ia, ib) {
  const room = e.len - e.tA - e.tB;
  if (!e || e.c > 5 || e.road.b || room < 28) return null;
  const Na = A.NODES[e.a], sMid = e.tA + room / 2;
  const x = Na.x + e.ux * sMid, z = Na.z + e.uz * sMid;
  if (!A.inBounds(x, z, 30)) return null;
  const tg = A.S.target;
  if (tg && Math.hypot(tg.x - x, tg.z - z) < 55) return null;
  if (A.PIZZA && Math.hypot(A.PIZZA.x - x, A.PIZZA.z - z) < 60) return null;
  if (A.ACCIDENTS.some(a => Math.hypot(a.x - x, a.z - z) < 70)) return null;
  if (WORKS.some(w => Math.hypot(w.x - x, w.z - z) < 90)) return null;
  // на месте работ не должно стоять припаркованных и чужих машин с маршрутом
  if (A.TRAFFIC.some(q => (q.parked || q.svc || q.accident) && Math.abs((q.x - x) * e.ux + (q.z - z) * e.uz) < 12 && Math.abs((q.x - x) * e.rx + (q.z - z) * e.rz) < e.w / 2 + 3)) return null;
  if (detourLen(A, ia, ib, e) > 1400) return null;
  return { x, z, sMid };
}

function spawnOnRoute (A) {
  const V = A.V, tg = A.S.target;
  const path = A.routeNodes(V.x, V.z, tg.x, tg.z);
  if (path.length < 3) return false;
  let acc = Math.hypot(path[0].x - V.x, path[0].z - V.z);
  const cands = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const P = path[i], Q = path[i + 1], a0 = acc;
    acc += Math.hypot(Q.x - P.x, Q.z - P.z);
    if (i === 0 || a0 < 85) continue;
    if (a0 > 420) break;
    const ia = A.NODE_IDX.get(P.x + ',' + P.z), ib = A.NODE_IDX.get(Q.x + ',' + Q.z);
    if (ia === undefined || ib === undefined) continue;
    const e = A.edgeOf(ia, ib);
    if (e) cands.push({ e, ia, ib, pref: Math.abs(a0 - 200) });
  }
  cands.sort((p, q) => p.pref - q.pref);
  if (Math.random() < LANE_P)
    for (const c of cands.slice(0, 8)) {
      const ok = laneOk(A, c.e);
      if (ok) { spawnLane(A, c.e, ok); return true; }
    }
  for (const c of cands.slice(0, 8)) {
    const ok = worksOk(A, c.e, c.ia, c.ib);
    if (ok) { spawnWorks(A, c.e, ok); return true; }
  }
  return false;
}
function spawnSomewhere (A) {
  const lane = Math.random() < LANE_P;
  for (let k = 0; k < 12; k++) {
    const ia = A.nodeNear(A.V.x, A.V.z, 160, 360), N = A.NODES[ia];
    if (!N || !N.nb.length) continue;
    const ib = pick(N.nb), e = A.edgeOf(ia, ib);
    if (!e) continue;
    if (lane) { const ol = laneOk(A, e); if (ol) { spawnLane(A, e, ol); return true; } if (k < 8) continue; }
    const ok = worksOk(A, e, ia, ib);
    if (ok) { spawnWorks(A, e, ok); return true; }
  }
  return false;
}

function spawnWorks (A, e, at) {
  const { groundH, box, put } = A;
  const r = A.edgeOf(e.b, e.a), { x: cx, z: cz, sMid } = at;
  const ux = e.ux, uz = e.uz, nx = e.rx, nz = e.rz, W = e.w + 0.4, ryA = Math.atan2(ux, uz);
  const room = e.len - e.tA - e.tB, HL = Math.min(6, room / 2 - 4);
  const P = (a, o) => [cx + ux * a + nx * o, cz + uz * a + nz * o];
  const L = [], FL = [], signQ = [], solids = [];
  const W8 = { e, r, x: cx, z: cz, ux, uz, W, HL, t: rand(160, 240), warned: 0, grp: new THREE.Group(), solids, men: [], cones: [], blink: null };
  const sign = (x, z, y, fx, fz, w, h, low) => signQ.push([x, y, z, fx, fz, w, h, low]);
  // за полотном — синий забор стройки до ближайшего дома или чужой улицы, до двенадцати метров
  const reach = (k, s) => {
    let o = W / 2;
    for (; o < W / 2 + 12; o += 1) {
      const [x, z] = P(HL * k, (o + 1) * s);
      if (A.inHouse(x, z, 0.6) || groundH(x, z) < 0.3) break;
      const q = A.nearestRoad(x, z, 7, 1);
      const own = q && ((q.seg.na === e.a && q.seg.nb === e.b) || (q.seg.na === e.b && q.seg.nb === e.a));
      if (q && !own && q.d < q.seg.w / 2 + 0.6) break;          // чужую улицу и проезд не перегораживаем
    }
    return o;
  };
  for (const k of [-1, 1]) {
    const [bx, bz] = P(HL * k, 0), by = groundH(bx, bz);
    // пластиковые блоки красно-белые поперёк полотна
    const n = Math.max(3, Math.ceil(W / 1.25));
    for (let i = 0; i < n; i++) {
      const o = (i + 0.5) / n * W - W / 2, [x, z] = P(HL * k, o);
      box(L, W / n - 0.08, 0.8, 0.5, i % 2 ? '#f2eee6' : '#d9342c', x, groundH(x, z) + 0.4, z, ryA);
      if (i % 3 === 1) box(FL, 0.18, 0.14, 0.18, '#ffb020', x, groundH(x, z) + 0.88, z, ryA);    // мигалки
    }
    // полосатый щит на стойках и «ДОРОГА ЗАКРЫТА» над ним
    const [px, pz] = P(HL * k + 0.5 * k, 0), py = groundH(px, pz), m = Math.max(3, Math.round(W / 1.4));
    for (let i = 0; i < m; i++) {
      const o = (i + 0.5) / m * W - W / 2, [x, z] = P(HL * k + 0.5 * k, o);
      box(L, W / m, 0.42, 0.12, i % 2 ? '#f2eee6' : '#d9342c', x, groundH(x, z) + 1.35, z, ryA);
    }
    for (const s of [-1, 1]) { const [x, z] = P(HL * k + 0.5 * k, (W / 2 - 0.2) * s); box(L, 0.16, 2.9, 0.16, '#585460', x, groundH(x, z) + 1.45, z, ryA); }
    box(L, 0.14, 2.9, 0.14, '#585460', px, py + 1.45, pz, ryA);
    sign(px + ux * 0.1 * k, pz + uz * 0.1 * k, py + 2.45, ux * k, uz * k, 2.6, 0.65, false);
    solids.push(A.obb(bx + ux * 0.25 * k, bz + uz * 0.25 * k, W / 2 + 0.3, 0.6, Math.atan2(nz, nx)));
    // забор стройки за краями полотна: машина не объедет по тротуару
    for (const s of [-1, 1]) {
      const o1 = reach(k, s);
      if (o1 <= W / 2 + 0.5) continue;
      const len = o1 - W / 2, np = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < np; i++) {
        const o = W / 2 + (i + 0.5) * len / np, [x, z] = P(HL * k, o * s), y = groundH(x, z) + A.curbAt(x, z);
        box(L, len / np - 0.06, 1.9, 0.07, '#3f6fb5', x, y + 1.0, z, ryA);
        box(L, 0.09, 2.05, 0.12, '#8d929b', x + nx * s * len / np / 2, y + 1.0, z + nz * s * len / np / 2, ryA);
      }
      const [mx, mz] = P(HL * k, (W / 2 + len / 2) * s);
      solids.push(A.obb(mx, mz, len / 2 + 0.2, 0.3, Math.atan2(nz, nx)));
    }
    // «РЕМОНТ» — на подъезде, справа по ходу к работам
    const [sx, sz] = P((HL + 9) * k, -(W / 2 + 0.9) * k), sy = groundH(sx, sz) + A.curbAt(sx, sz);
    box(L, 0.1, 2.5, 0.1, '#9aa0a8', sx, sy + 1.25, sz, ryA);
    sign(sx + ux * 0.08 * k, sz + uz * 0.08 * k, sy + 2.2, ux * k, uz * k, 1.7, 0.43, true);
    // конусы перед блоками
    for (const o of [-0.32, 0, 0.32]) W8.cones.push(cone(A, W8, ...P((HL + 2.2) * k, o * W)));
  }
  // яма: чёрный провал в асфальте, отвалы земли по краям, доски, бочка
  const pw = Math.min(W * 0.55, 5.5), py = groundH(cx, cz);
  box(L, pw + 0.5, 0.06, 3.6, '#5b4a3e', cx, py + 0.19, cz, ryA);
  box(L, pw, 0.07, 3.0, '#241c18', cx, py + 0.21, cz, ryA);
  for (const s of [-1, 1]) {
    const [x, z] = P(rand(-1, 1), s * (pw / 2 + 0.9));
    put(L, new THREE.IcosahedronGeometry(0.9, 0), '#6e5646', x, groundH(x, z) + 0.35, z);
    put(L, new THREE.IcosahedronGeometry(0.6, 0), '#7d6452', x + ux * 1.1, groundH(x, z) + 0.3, z + uz * 1.1);
  }
  { const [x, z] = P(-HL + 1.6, W / 2 - 1.1); box(L, 0.7, 0.9, 0.7, '#2b2a30', x, groundH(x, z) + 0.45, z, ryA); }
  { const [x, z] = P(HL - 1.8, -(W / 2 - 1.3)); box(L, 1.0, 0.75, 0.7, '#e0a526', x, groundH(x, z) + 0.4, z, ryA); box(L, 0.9, 0.08, 0.6, '#2b2a30', x, groundH(x, z) + 0.8, z, ryA); }
  const stat = new THREE.Mesh(A.mergeGeos(L), WK_MAT || (WK_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  W8.grp.add(stat);
  if (FL.length) { W8.blink = new THREE.Mesh(A.mergeGeos(FL), new THREE.MeshBasicMaterial({ vertexColors: true })); W8.grp.add(W8.blink); }
  // таблички — одним мешем
  {
    const Pp = [], Uu = [], Ii = [];
    for (const [x, y, z, fx, fz, w, h, low] of signQ) {
      const rx = fz * w / 2, rz = -fx * w / 2, vi = Pp.length / 3, v0 = low ? 0 : 0.5, v1 = low ? 0.5 : 1;
      Pp.push(x - rx, y - h / 2, z - rz, x + rx, y - h / 2, z + rz, x + rx, y + h / 2, z + rz, x - rx, y + h / 2, z - rz);
      Uu.push(0, v0, 1, v0, 1, v1, 0, v1);
      Ii.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Uu, 2));
    g.setIndex(Ii);
    g.computeBoundingSphere();
    W8.grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: WK_TEX || (WK_TEX = worksTex()), side: THREE.DoubleSide })));
  }
  // дорожники копают у ямы
  SHOVEL_GEO = SHOVEL_GEO || (() => { const S = []; box(S, 0.05, 1.1, 0.05, '#8a6b4e', 0, -0.35, 0.05); box(S, 0.26, 0.3, 0.04, '#6e6a72', 0, -0.95, 0.12); return A.mergeGeos(S); })();
  const nMen = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < nMen; i++) {
    const s = i % 2 ? 1 : -1, [x, z] = P(rand(-1.4, 1.4), s * (pw / 2 + 0.35));
    const grp = A.makeHuman(null, { cap: '#ff8a00', shirt: '#ff8a00', pants: '#2f3540' });
    const u = grp.userData;
    if (u.armR) { const sh = new THREE.Mesh(SHOVEL_GEO, WK_MAT); sh.rotation.x = 0.4; u.armR.add(sh); }
    grp.rotation.y = Math.atan2(-nx * s, -nz * s);
    grp.position.set(x, groundH(x, z) + 0.18, z);
    A.scene.add(grp);
    W8.men.push({ grp, x, z, ph: rand(0, 6), dead: 0 });
  }
  A.scene.add(W8.grp);
  for (const s of solids) addSolid(A, s);
  // трафик: на это ребро больше не сворачивают, кто стоит на месте работ — в другое место
  e.closed = 1; if (r) r.closed = 1;
  CLOSED.set(e, { sBar: sMid - HL - e.tA, w: W, len: HL * 2 });
  if (r) CLOSED.set(r, { sBar: (e.len - sMid) - HL - r.tA, w: W, len: HL * 2 });
  for (const q of A.TRAFFIC)
    if ((q.e === e || q.e === r) && !q.parked && !q.svc && Math.abs((q.x - cx) * ux + (q.z - cz) * uz) < HL + 3) A.placeTraffic(q, 120, 340);
  for (const q of A.TRAFFIC) if (q.svc && q.goal) q.repath = 1;
  for (const list of A.walkersAll())
    for (const p of list || []) {
      if (!p || p.dead || !p.w) continue;
      const dx = p.x - cx, dz = p.z - cz;
      if (Math.abs(dx * ux + dz * uz) < HL + 1.5 && Math.abs(dx * nx + dz * nz) < W / 2 + 14) A.walkSpawn(p, 60, 300);
    }
  WORKS.push(W8);
  RL.n.works++;
}

function cone (A, W8, x, z) {
  if (!CONE_GEO) {
    const L = [];
    A.put(L, new THREE.CylinderGeometry(0.05, 0.24, 0.72, 6), '#ff6a13', 0, 0.36, 0);
    A.put(L, new THREE.CylinderGeometry(0.14, 0.18, 0.12, 6), '#f4f1ea', 0, 0.42, 0);
    A.put(L, new THREE.BoxGeometry(0.5, 0.05, 0.5), '#2b2a30', 0, 0.02, 0);
    CONE_GEO = A.mergeGeos(L);
  }
  const m = new THREE.Mesh(CONE_GEO, WK_MAT || (WK_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const y = A.groundH(x, z) + 0.16;
  m.position.set(x, y, z);
  W8.grp.add(m);
  return { m, x, z, y, vx: 0, vy: 0, vz: 0, fly: 0, spin: 0 };
}

function removeWorks (A, W8) {
  A.scene.remove(W8.grp);
  W8.grp.traverse(o => {
    if (!o.isMesh || o.geometry === CONE_GEO || o.geometry === SHOVEL_GEO) return;
    o.geometry.dispose();
    if (o.material !== WK_MAT) o.material.dispose();          // текстура табличек общая — её material.dispose не трогает
  });
  for (const m of W8.men) if (!m.dead) A.dropMesh(m.grp);
  for (const s of W8.solids) delSolid(A, s);
  if (W8.lane) { LANES.delete(W8.e); if (W8.opp) LANES.delete(W8.opp); return; }
  W8.e.closed = 0; if (W8.r) W8.r.closed = 0;
  CLOSED.delete(W8.e); if (W8.r) CLOSED.delete(W8.r);
}

/* ═════════════════ ремонт одной полосы ═════════════════ */
const LANES = new Map();                       // направленное ребро → { lane, to, s0, s1, pull, r, run } или { opp } у встречки
const LANE_P = 0.55;                           // доля ремонтов «в одну полосу»
let ARROW_TEX = null;
function arrowTex () {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#16171b'; x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#ffd21f'; x.fillRect(4, 4, 120, 56);
  x.fillStyle = '#16171b';
  for (let i = 0; i < 3; i++) {               // «<<<» — объезд левее
    const cx = 28 + i * 34;
    x.beginPath(); x.moveTo(cx - 14, 32); x.lineTo(cx + 6, 10); x.lineTo(cx + 18, 10); x.lineTo(cx - 2, 32); x.lineTo(cx + 18, 54); x.lineTo(cx + 6, 54); x.closePath(); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/* годится ли ребро: две полосы в эту сторону — или одна, но со встречкой для объезда */
function laneOk (A, e) {
  if (!e || !e.ok || e.c > 5 || !e.road || e.road.b || e.closed || LANES.has(e) || CLOSED.has(e)) return null;
  const run = A.edgeRun(e), n = A.laneCount(e), r = A.edgeOf(e.b, e.a);
  if (run < 42) return null;
  if (n < 2 && (e.oneway || !r || r.closed || LANES.has(r))) return null;
  const L = Math.min(46, run - 22), s0 = (run - L) / 2, s1 = s0 + L;
  const N = A.NODES[e.a], sm = e.tA + (s0 + s1) / 2, o = A.laneOff(e, 0);
  const x = N.x + e.ux * sm + e.rx * o, z = N.z + e.uz * sm + e.rz * o;
  if (!A.inBounds(x, z, 30) || Math.hypot(A.V.x - x, A.V.z - z) < 60) return null;
  const tg = A.S.target;
  if (tg && Math.hypot(tg.x - x, tg.z - z) < 45) return null;
  if (A.PIZZA && Math.hypot(A.PIZZA.x - x, A.PIZZA.z - z) < 60) return null;
  if (A.ACCIDENTS.some(a => Math.hypot(a.x - x, a.z - z) < 70)) return null;
  if (WORKS.some(w => Math.hypot(w.x - x, w.z - z) < 90)) return null;
  if (A.TRAFFIC.some(q => (q.parked || q.svc || q.accident) && Math.abs((q.x - x) * e.ux + (q.z - z) * e.uz) < L / 2 + 14 && Math.abs((q.x - x) * e.rx + (q.z - z) * e.rz) < e.w / 2 + 3)) return null;
  return { x, z, s0, s1, n, r, run };
}
function spawnLane (A, e, at) {
  const { groundH, box } = A, { s0, s1, n, r, run } = at;
  const N = A.NODES[e.a], lw = (e.oneway ? e.w : e.w / 2) / n;
  const o0 = A.laneOff(e, 0), oIn = o0 - lw / 2, oOut = o0 + lw / 2;          // граница с соседней полосой и бордюр
  const P = (s, o) => [N.x + e.ux * (e.tA + s) + e.rx * o, N.z + e.uz * (e.tA + s) + e.rz * o];
  const ryA = Math.atan2(e.ux, e.uz), ryN = Math.atan2(e.rz, e.rx), taper = 12;
  const L = [], FL = [], solids = [], signQ = [];
  const W8 = { e, r: null, lane: 1, opp: null, x: at.x, z: at.z, ux: e.ux, uz: e.uz, W: lw, HL: (s1 - s0) / 2, t: rand(150, 230), warned: 1,
    grp: new THREE.Group(), solids, men: [], cones: [], blink: null };
  // конусы: клин от бордюра к границе полосы, вдоль неё и обратно на выезде
  for (let s = s0 - taper; s <= s1 + 4.5; s += 3) {
    const o = s < s0 ? (oOut - 0.35) + (oIn + 0.3 - (oOut - 0.35)) * ((s - (s0 - taper)) / taper)
      : s > s1 ? (oIn + 0.3) + (oOut - 0.35 - oIn - 0.3) * ((s - s1) / 4.5) : oIn + 0.3;
    W8.cones.push(cone(A, W8, ...P(s, o)));
  }
  // блоки поперёк полосы — в начале и в конце; на въезде мигалки и щит «объезд левее»
  for (const s of [s0 + 0.4, s1 - 0.4]) {
    const m = Math.max(2, Math.round((lw - 0.6) / 1.2));
    for (let i = 0; i < m; i++) {
      const o = oIn + 0.4 + (i + 0.5) / m * (lw - 0.7), [x, z] = P(s, o);
      box(L, (lw - 0.7) / m - 0.08, 0.8, 0.5, i % 2 ? '#f2eee6' : '#d9342c', x, groundH(x, z) + 0.4, z, ryA);
      if (s < s1 - 1) box(FL, 0.18, 0.14, 0.18, '#ffb020', x, groundH(x, z) + 0.88, z, ryA);
    }
    const [mx, mz] = P(s, o0 + 0.05);
    solids.push(A.obb(mx, mz, (lw - 0.7) / 2, 0.3, ryN));
  }
  {
    const [x, z] = P(s0 - 1.4, o0), y = groundH(x, z);
    for (const d of [-0.6, 0.6]) { const [px, pz] = P(s0 - 1.4, o0 + d); box(L, 0.08, 1.5, 0.08, '#585460', px, groundH(px, pz) + 0.75, pz, ryA); }
    signQ.push([x - e.ux * 0.06, y + 1.75, z - e.uz * 0.06, -e.ux, -e.uz, 1.6, 0.8, 'arrow']);
    // «РЕМОНТ» — у бордюра перед клином
    const [sx, sz] = P(s0 - taper - 8, oOut + 0.7), sy = groundH(sx, sz) + A.curbAt(sx, sz);
    box(L, 0.1, 2.5, 0.1, '#9aa0a8', sx, sy + 1.25, sz, ryA);
    signQ.push([sx - e.ux * 0.08, sy + 2.2, sz - e.uz * 0.08, -e.ux, -e.uz, 1.7, 0.43, 'low']);
  }
  // латают: срезанный асфальт вдоль полосы, яма с отвалом, бочка
  const sp = (s0 + s1) / 2, patchL = s1 - s0 - 6;
  { const [x, z] = P(sp, o0); box(L, lw - 1.0, 0.04, patchL, '#2c292e', x, groundH(x, z) + 0.18, z, ryA); }
  const sPit = sp + rand(-patchL / 4, patchL / 4);
  { const [x, z] = P(sPit, o0), y = groundH(x, z);
    box(L, lw - 1.4, 0.06, 2.8, '#5b4a3e', x, y + 0.2, z, ryA); box(L, lw - 1.9, 0.07, 2.3, '#241c18', x, y + 0.22, z, ryA);
    solids.push(A.obb(x, z, (lw - 1.4) / 2, 1.4, ryN)); }
  { const [x, z] = P(sPit + 2.4, oOut - 0.8); A.put(L, new THREE.IcosahedronGeometry(0.7, 0), '#6e5646', x, groundH(x, z) + 0.3, z); }
  { const [x, z] = P(s1 - 3.5, o0 + 0.3); box(L, 0.7, 0.9, 0.7, '#e0a526', x, groundH(x, z) + 0.45, z, ryA); }
  const stat = new THREE.Mesh(A.mergeGeos(L), WK_MAT || (WK_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  W8.grp.add(stat);
  if (FL.length) { W8.blink = new THREE.Mesh(A.mergeGeos(FL), new THREE.MeshBasicMaterial({ vertexColors: true })); W8.grp.add(W8.blink); }
  for (const kind of ['arrow', 'low']) {
    const Pp = [], Uu = [], Ii = [];
    for (const [x, y, z, fx, fz, w, h, k] of signQ) {
      if (k !== kind) continue;
      const rx = fz * w / 2, rz = -fx * w / 2, vi = Pp.length / 3;
      Pp.push(x - rx, y - h / 2, z - rz, x + rx, y - h / 2, z + rz, x + rx, y + h / 2, z + rz, x - rx, y + h / 2, z - rz);
      if (kind === 'low') Uu.push(0, 0, 1, 0, 1, 0.5, 0, 0.5); else Uu.push(0, 0, 1, 0, 1, 1, 0, 1);
      Ii.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Uu, 2));
    g.setIndex(Ii);
    g.computeBoundingSphere();
    const map = kind === 'arrow' ? (ARROW_TEX || (ARROW_TEX = arrowTex())) : (WK_TEX || (WK_TEX = worksTex()));
    W8.grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })));
  }
  // дорожники: один-два с лопатами у ямы
  SHOVEL_GEO = SHOVEL_GEO || (() => { const S = []; box(S, 0.05, 1.1, 0.05, '#8a6b4e', 0, -0.35, 0.05); box(S, 0.26, 0.3, 0.04, '#6e6a72', 0, -0.95, 0.12); return A.mergeGeos(S); })();
  for (let i = 0; i < 1 + (Math.random() < 0.6 ? 1 : 0); i++) {
    const s = i ? -1 : 1, [x, z] = P(sPit + s * 1.9, o0 + rand(-0.4, 0.4));
    const grp = A.makeHuman(null, { cap: '#ff8a00', shirt: '#ff8a00', pants: '#2f3540' });
    const u = grp.userData;
    if (u.armR) { const sh = new THREE.Mesh(SHOVEL_GEO, WK_MAT); sh.rotation.x = 0.4; u.armR.add(sh); }
    grp.rotation.y = Math.atan2(-e.ux * s, -e.uz * s);
    grp.position.set(x, groundH(x, z) + 0.18, z);
    A.scene.add(grp);
    W8.men.push({ grp, x, z, ph: rand(0, 6), dead: 0 });
  }
  A.scene.add(W8.grp);
  for (const q of solids) addSolid(A, q);
  // поток: две полосы — перестроиться в соседнюю; одна — объезд по встречке по очереди, встречка жмётся к бордюру
  if (n >= 2) LANES.set(e, { lane: 0, to: 1, s0: s0 - taper, s1: s1 + 2, run });
  else {
    LANES.set(e, { lane: 0, to: -1, s0: s0 - taper, s1: s1 + 3, run, r, pull: -(e.w / 4) - 1.25 });
    LANES.set(r, { opp: 1, s0: run - s1 - 4, s1: run - s0 + taper + 2, pull: 0.55 });
    W8.opp = r;
  }
  // кто уже стоит в закрытой полосе на месте работ — в другое место
  for (const q of A.TRAFFIC)
    if (q.e === e && !q.parked && !q.svc && q.lane === 0 && q.s > s0 - 3 && q.s < s1 + 3) A.placeTraffic(q, 120, 340);
  WORKS.push(W8);
  RL.n.works++;
  RL.n.lanes = (RL.n.lanes || 0) + 1;
}
/* машина потока у сужения: вернуть 0…1 — во сколько раз сбавить */
function laneHold (c, dt) {
  const Z = LANES.get(c.e);
  if (!Z) return 1;
  if (Z.opp) {
    if (c.s > Z.s0 - 25 && c.s < Z.s1) { c.pull = damp(c.pull || 0, Z.pull, 1.5, dt); c.rlPull = 2; return 0.7; }
    return 1;
  }
  if (c.s < Z.s0 - 45 || c.s > Z.s1) return 1;
  if (Z.to >= 0) {
    if (c.lane === Z.lane) {
      const d0 = API.laneOff(c.e, c.lane) - API.laneOff(c.e, Z.to);
      c.lane = Z.to;
      c.pull = c.s > Z.s0 ? 0 : (c.pull || 0) + d0;     // родилась прямо в зоне — сразу в соседней, иначе плавно
      c.rlPull = 1;
    }
    return c.s > Z.s0 - 20 ? 0.5 : 0.75;
  }
  let slow = c.s > Z.s0 - 18 ? 0.45 : 0.8;
  const inZone = c.s > Z.s0 - 2;
  if (!inZone && !c.rlGo) {
    // встречный в сужении — ждём у клина
    const rs0 = Z.run - Z.s1 - 6, rs1 = Z.run - Z.s0 + 8;
    const busy = API.TRAFFIC.some(q => q.e === Z.r && !q.parked && !q.turn && q.s > rs0 && q.s < rs1);
    if (busy) slow = Math.min(slow, clamp((Z.s0 - (c.hl || 2.2) - 2.5 - c.s) / 8, 0, 1));
    else if (c.s > Z.s0 - 18) c.rlGo = 1;
  }
  if (c.rlGo || inZone) { c.pull = damp(c.pull || 0, Z.pull, 1.8, dt); c.rlPull = 3; }
  return slow;
}
/* после сужения — плавно назад в свою полосу */
function pullBack (c, dt) {
  const Z = LANES.get(c.e);
  if (Z && ((Z.opp && c.s > Z.s0 - 25 && c.s < Z.s1) || (Z.to < 0 && c.s > Z.s0 - 45 && c.s < Z.s1))) return;
  c.pull = damp(c.pull || 0, 0, 1.3, dt);
  if (Math.abs(c.pull) < 0.03) { c.pull = 0; c.rlPull = 0; c.rlGo = 0; }
}

function stepWorks (dt, A) {
  const V = A.V, S = A.S, live = ['drive', 'back', 'side'].includes(S.state);
  if (S.state === 'title' || S.state === 'over') { while (WORKS.length) removeWorks(A, WORKS.pop()); return; }
  // на маршруте с заказом — всегда один ремонт в паре сотен метров
  if ((WK.checkT -= dt) <= 0) {
    WK.checkT = 1;
    WK.cd -= 1;
    const nearOne = WORKS.some(w => Math.hypot(w.x - V.x, w.z - V.z) < 450);
    if (live && S.target && !A.calmStart() && !nearOne && WK.cd <= 0 && WORKS.length < 3) {
      if (spawnOnRoute(A)) WK.cd = rand(35, 70); else WK.cd = 4;
    }
    // и изредка — просто где-то рядом
    if ((WK.anyT -= 1) <= 0) {
      WK.anyT = rand(90, 160);
      if ((live || S.ride) && !A.calmStart() && WORKS.length < 2) spawnSomewhere(A);
    }
  }
  const T = A.tG, blink = Math.floor(T * 2.2) % 2 === 0, sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let i = WORKS.length - 1; i >= 0; i--) {
    const W8 = WORKS[i], d = Math.hypot(W8.x - V.x, W8.z - V.z);
    W8.t -= dt;
    if ((W8.t <= 0 && d > 110) || W8.t < -240) { removeWorks(A, W8); WORKS.splice(i, 1); continue; }
    const vis = d < 200;
    W8.grp.visible = vis;
    if (!vis) { for (const m of W8.men) if (!m.dead) m.grp.visible = false; continue; }
    if (W8.blink) W8.blink.visible = blink;
    // едет к ремонту — предупреждаем: навигатор про него не знает
    if (!W8.warned && d < 70 && ((W8.x - V.x) * fx + (W8.z - V.z) * fz) > d * 0.5) {
      W8.warned = 1;
      A.toast(t('дорогу закрыли на ремонт · навигатор не в курсе — ищи объезд'));
    }
    // дорожники: лопатой вниз-вверх, иногда передых; наезд — как на прохожего
    for (const m of W8.men) {
      if (m.dead) continue;
      const g = m.grp, u = g.userData;
      g.visible = d < 150;
      m.ph += dt * 3.1;
      const k = Math.sin(m.ph), rest = Math.sin(m.ph * 0.13) > 0.8;
      if (u.armR) u.armR.rotation.x = rest ? -0.2 : -0.75 + k * 0.55;
      if (u.armL) u.armL.rotation.x = rest ? 0 : -0.5 + k * 0.35;
      g.rotation.x = rest ? 0 : 0.12 + k * 0.1;
      if (sp > 3) {
        const dx = m.x - V.x, dz = m.z - V.z;
        if (Math.abs(dx * fx + dz * fz) < 2.3 && Math.abs(dx * fz - dz * fx) < 1.25) {
          m.dead = 1; A.dropMesh(g);
          A.gibHuman({ x: m.x, z: m.z, grp: g }, V.vx, V.vz);
          if (A.onRunOver) A.onRunOver();
        }
      }
    }
    // конусы разлетаются от удара
    for (const c of W8.cones) {
      if (!c.fly && sp > 2.5 && Math.hypot(c.x - V.x, c.z - V.z) < 1.5) {
        c.fly = 1; c.vx = V.vx * 0.8 + rand(-1.5, 1.5); c.vz = V.vz * 0.8 + rand(-1.5, 1.5); c.vy = rand(3, 5.5); c.spin = rand(-9, 9);
        if (A.Snd) A.Snd.noise(0.08, 0.1);
      }
      if (c.fly === 1) {
        c.vy -= 20 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
        const gy = A.groundH(c.x, c.z) + 0.16;
        if (c.y <= gy && c.vy < 0) { c.y = gy; c.vy = -c.vy * 0.3; c.vx *= 0.5; c.vz *= 0.5; if (Math.abs(c.vy) < 0.8) { c.fly = 2; c.m.rotation.x = Math.PI / 2; } }
        c.m.position.set(c.x, c.y, c.z);
        c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.6 * dt;
      }
    }
  }
}

/* ═════════════════ трафик: пробка и ремонт на ребре ═════════════════
   Вызывается из updateTraffic для каждой машины потока: вернуть 0…1 —
   во сколько раз сбавить. Здесь же разворот у закрытой улицы. */
let API = null;
export function hold (c, dt) {
  if (c.rlOut) return 0;                      // водитель вышел
  if (c.mp && API && !MOPEDS.lane(c, dt, API)) return 0;     // мопед: правый край полосы, межполосье в пробке; без седока — стоит
  if (c.turn || !c.e) return 1;
  if (c.rlPull && API) pullBack(c, dt);          // ремонт полосы позади — назад в свою полосу
  if (!JAM_BY.size && !CLOSED.size && !LANES.size) return 1;
  let slow = 1;
  const e = c.e, J = JAM_BY.get(e);
  if (J && !J.done && API && !(c.mp && c.mp.weave > 0)) {    // мопед между рядами пробку объезжает
    const lane = Math.min(c.lane, API.laneCount(e) - 1), stop = J.stops.get(e);   // стоп-точка — перед аварией или на ребре до неё
    if (stop !== undefined && c.s < stop + 2) {
      if (J.lanes.has(lane)) slow = clamp((stop - c.s) / 7, 0, 1);
      else if (c.s > stop - 25) slow = 0.35;                             // соседняя полоса ползёт, глазея
    }
  }
  const C = CLOSED.get(e);
  if (C && API) {
    const stop = C.sBar - (c.hl || 2.2) - 2.2;
    if (c.s < stop + 1.5) {
      slow = Math.min(slow, clamp((stop - c.s) / 8, 0, 1));
      if (c.speed < 0.5 && stop - c.s < 3) {
        if ((c.rlWait = (c.rlWait || 0) + dt) > 1.2) uturn(c);
      } else c.rlWait = 0;
    } else if (c.s < C.sBar + C.len + 1) API.placeTraffic(c, 120, 340);     // оказалась на месте работ
  }
  if (LANES.size && API) slow = Math.min(slow, laneHold(c, dt));
  return slow;
}
/* развернуться у ремонта: встать на встречное ребро и доехать до полосы дугой */
function uturn (c) {
  const A = API, e = c.e, r = A.edgeOf(e.b, e.a);
  c.rlWait = 0;
  RL.n.uturns = (RL.n.uturns || 0) + 1;
  if (!r) { A.placeTraffic(c, 120, 340); return; }
  c.jx = c.x; c.jz = c.z; c.jh = c.h; c.rejoin = 1;
  c.e = r; c.turn = null; c.lane = 0; c.pull = 0; c.speed = 0;
  c.s = clamp(A.edgeRun(e) - c.s, 0, A.edgeRun(r) * 0.98);
}

/* ═════════════════ скорая и курьеры-соперники ═════════════════
   У них свой маршрут (lanePath в game.js). Навигатор курьера про ремонт не
   знает, а они — местные: путь в обход закрытых рёбер. Не нашёлся — null,
   и game.js берёт обычный routeNodes; тогда у щитов встают (svcHold). */
export function svcNodes (x0, z0, x1, z1) {
  if (!CLOSED.size || !API) return null;
  const A = API, N = A.NODES, a = A.nearestNode(x0, z0), b = A.nearestNode(x1, z1);
  if (a === b) return [N[a]];
  const prev = new Int32Array(N.length).fill(-1), seen = new Uint8Array(N.length), q = [a];
  seen[a] = 1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (cur === b) break;
    for (const nb of N[cur].nb) {
      if (seen[nb]) continue;
      const e = A.edgeOf(cur, nb);
      if (e && e.closed) continue;
      seen[nb] = 1; prev[nb] = cur; q.push(nb);
    }
  }
  if (!seen[b]) return null;
  const path = [];
  for (let k = b; k !== -1; k = prev[k]) { path.unshift(N[k]); if (k === a) break; }
  return path;
}
/* щиты впереди по курсу — тормозим перед ними; встали — ищем путь заново.
   Протиснуться «призраком» (ghost) сквозь блоки не даём: это отдельно от ahead. */
export function svcHold (t, dt) {
  if (!WORKS.length) return 1;
  let slow = 1;
  const hx = Math.sin(t.h), hz = Math.cos(t.h);
  for (const W of WORKS) {
    if (W.lane) continue;                                      // ремонт полосы — проезд есть
    const dx = t.x - W.x, dz = t.z - W.z;
    if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
    const a = dx * W.ux + dz * W.uz, l = dx * W.e.rx + dz * W.e.rz;
    if (Math.abs(l) > W.W / 2 + 1.5 || Math.abs(a) < W.HL - 0.5) continue;     // сбоку или уже внутри — пусть выезжает
    if (-Math.sign(a) * (hx * W.ux + hz * W.uz) < 0.3) continue;                // едет не к щитам
    const gap = Math.abs(a) - W.HL - (t.hl || 2.2) - 1.5;
    if (gap > 18) continue;
    slow = Math.min(slow, clamp(gap / 7, 0, 1));
    if (t.speed < 0.6 && gap < 3) { if ((t.rlWait = (t.rlWait || 0) + dt) > 1) { t.rlWait = 0; t.repath = 1; } }
  }
  return slow;
}

/* ═════════════════ пешеходы у забора стройки ═════════════════
   По тротуару закрытой улицы идут до синего забора и поворачивают назад —
   сквозь него не ходят. Вызывается из walkerStep для идущих по тротуару. */
export function walkGuard (p) {
  if (!CLOSED.size || !API || !p.w || p.cross) return;
  const W = p.w, e = API.edgeOf(W.a, W.b);
  if (!e || !e.closed) return;
  const C = CLOSED.get(e);
  if (!C) return;
  const A0 = API.NODES[W.a], al = (p.x - A0.x) * e.ux + (p.z - A0.z) * e.uz, fl = C.sBar + e.tA - 0.8;
  if (al > fl || al < fl - 2.2) return;
  W.a = e.b; W.b = e.a; W.side = -W.side;                  // та же сторона улицы, обратным ходом
  API.walkLeg(p, p.x, p.z);
}

/* ═════════════════ фары потока ночью ═════════════════ */
const GLOW = { mesh: null, mat: null, max: 32 };
const GM = new THREE.Matrix4(), GQ = new THREE.Quaternion(), GP = new THREE.Vector3(), GS = new THREE.Vector3(1, 1, 1), GY = new THREE.Vector3(0, 1, 0);
function stepGlow (dt, A) {
  const night = A.ENV ? A.ENV.night : 0;
  if (!GLOW.mesh) {
    if (night < 0.1) return;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 40, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(235,245,255,1)'); g.addColorStop(0.5, 'rgba(225,235,255,.4)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    GLOW.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    GLOW.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(4, 8.5).rotateX(-Math.PI / 2).translate(0, 0, 6.2), GLOW.mat, GLOW.max);
    GLOW.mesh.frustumCulled = false; GLOW.mesh.renderOrder = 3; GLOW.mesh.count = 0;
    A.scene.add(GLOW.mesh);
  }
  GLOW.mat.opacity = clamp((night - 0.2) * 0.8, 0, 0.5);
  GLOW.mesh.visible = GLOW.mat.opacity > 0.02;
  if (!GLOW.mesh.visible) return;
  const cx = A.cam.position.x, cz = A.cam.position.z;
  let n = 0;
  for (const c of A.TRAFFIC) {
    if (n >= GLOW.max) break;
    if (c.parked || c.wreck || c.knock || c.gone || !c.mesh.visible) continue;
    if (Math.abs(c.x - cx) > 110 || Math.abs(c.z - cz) > 110) continue;
    GP.set(c.x, (c.gy || 0) + 0.22, c.z);
    GQ.setFromAxisAngle(GY, c.h);
    const gk = c.model === 'cn' ? 1.12 : c.model === 'moped' ? 0.45 : 1;
    GS.set(gk, 1, gk);
    GM.compose(GP, GQ, GS);
    GLOW.mesh.setMatrixAt(n++, GM);
  }
  GLOW.mesh.count = n;
  GLOW.mesh.instanceMatrix.needsUpdate = true;
}

/* ═════════════════ шаг и рисование на радаре/карте ═════════════════ */
export function step (dt, A) {
  if (RL_OFF) return;
  API = A;
  stepSigns(dt, A);
  stepJams(dt, A);
  stepWorks(dt, A);
  stepGlow(dt, A);
  MOPEDS.step(dt, A);
}

/* хвост пробки на радаре и карте: куски рёбер, посчитанные в makeJam */
function jamPolys (A, fn) {
  for (const J of JAMS) {
    if (J.done) continue;
    for (const { e, s0, s1 } of J.pieces) {
      const N = A.NODES[e.a], o = e.w / 4, d0 = e.tA + s0, d1 = e.tA + s1;
      fn(N.x + e.ux * d0 + e.rx * o, N.z + e.uz * d0 + e.rz * o, N.x + e.ux * d1 + e.rx * o, N.z + e.uz * d1 + e.rz * o, e.w);
    }
  }
}
export function drawRadar (ctx, tr, s) {
  if (!API || !JAMS.length) return;
  ctx.strokeStyle = '#e8323c'; ctx.lineCap = 'round';
  jamPolys(API, (x1, z1, x2, z2, w) => {
    ctx.lineWidth = Math.max(2, w * 0.5 * s);
    const [a, b] = tr(x1, z1), [c, d] = tr(x2, z2);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  });
  ctx.lineCap = 'butt';
}
export function drawMap (x, fmX, fmZ, s) {
  if (!API || !JAMS.length) return;
  x.strokeStyle = '#e8323c'; x.lineCap = 'round';
  jamPolys(API, (x1, z1, x2, z2) => {
    x.lineWidth = 7 * s;
    x.beginPath(); x.moveTo(fmX(x1), fmZ(z1)); x.lineTo(fmX(x2), fmZ(z2)); x.stroke();
  });
  x.lineCap = 'butt';
}

/* для отладки: __dlv.RL */
export const DEBUG = { MOPEDS: MOPEDS.DEBUG, RL, JAMS, WORKS, CLOSED, LANES, SG, spawnLane: () => { if (!API) return false; for (let k = 0; k < 40; k++) { const ia = API.nodeNear(API.V.x, API.V.z, 70, 220), N = API.NODES[ia]; if (!N || !N.nb.length) continue; const e = API.edgeOf(ia, pick(N.nb)), ok = laneOk(API, e); if (ok) { spawnLane(API, e, ok); return ok; } } return false; }, spawnOnRoute: () => API && spawnOnRoute(API), spawnSomewhere: () => API && spawnSomewhere(API) };
