/* ──────────────────────────────────────────────────────────────────────────
   Звери в лесах (docs/IDEAS.md, блок 5; правила — docs/ORDERS.md «Лоси и звери»).

   Лес — зелёная зона карты (OSM «green») от FOREST_MIN (3 га). Северск окружён
   тайгой: такие зоны — по краям районов и вдоль загородных дорог.

   Лось: большой, тяжёлый, низкополигональный (самцы — с рогами-лопатами).
     Рядом с тобой в лесах — до MOOSE.ON (3) лосей, появляются в MOOSE.R (110–330 м)
     от машины, на опушке: от IN (12 м) в глубь ельника до 0,6·OUT (11 м) на луг, не на дороге
     (опушки рядом нет — где угодно в лесу не дальше EDGE, 80 м, от дороги).
     Ходят медленно (WALK 0,8 м/с), подолгу пасутся. Пасутся на опушке: в лесу — не глубже
     2,5·IN (30 м) от края, на лугу — не дальше OUT (18 м); с шансом OUTP (45 %), тронувшись,
     идут к краю — выходят из леса на луг и возвращаются (forest.js — ельник). На дорогу сами не выходят.
     Уехал дальше FAR (480 м) — лось пропадает, вместо него появится другой.
   «Лось на дороге!» (CROSS): раз в CD (80–160 с), первый — через FIRST (45–90 с) смены,
     если впереди тебя в AHEAD (60–150 м) есть дорога у леса (лес не дальше 25 м от
     обочины): лось выходит из леса и переходит дорогу (1,3 м/с), в половине случаев
     встаёт посреди полосы на 2–4 с. Не нашлось такой дороги — пробуем снова через 6 с.
   Въехал в лося — как в машину (HIT): быстрее 11 км/ч — урон сердцами:
     до 35 км/ч — ½ сердца, до 56 км/ч — 1 сердце, быстрее — 2 сердца; машина теряет
     почти весь ход. Медленнее — просто упёрся, лося не сдвинуть.
     Лось шатается, вокруг головы — звёздочки, и трусит прочь (5 с), потом снова пасётся.
     Ни крови, ни смерти — ни в детской, ни во взрослой версии.
   Бодание (RAM, обе версии): раз в CD (90–180 с), первое — через FIRST (30–60 с) смены,
     раз в TICK (1 с) с шансом P (30 %) рогатый лось, который пасётся в SEE (9–30 м) от
     машины, замечает её (только пока едешь, не у клиента): AIM (1,3 с) стоит, разворачивается
     к машине, опускает рога и фыркает; потом бежит SPEED (9 м/с ≈ 32 км/ч) до RUN (3,5 с),
     доворачивая не быстрее TURN (0,6 рад/с) — отъедь вбок, и промахнётся. Достал — машину
     толкает по ходу лося (вбок PUSH 9 м/с, вдоль кузова 40 % от этого; удар не в
     середину — слегка разворачивает), −½ сердца (как лёгкий удар:
     мятина, звук, искры), лось отступает обратно к своему месту (до HOME 10 с).
     Удар об лося при бодании не считается «сбил лося».
   Любовь (LOVE, только взрослая): раз в CD (120–240 с), первая — через FIRST (50–100 с),
     если есть пасущийся лось в VIEW (25–200 м) от тебя: второй лось (рядом в NEAR 40 м или
     приходит из леса в 10–20 м) подходит сзади и пристраивается — ритмичное покачивание
     DUR (4–6 с), над парой сердечки. Подъехал ближе SHOO (16 м) — пузырь «не мешай!»
     (не чаще раза в 6 с). Задел машиной — всё прекращается. Без анатомии.
   Лиса и заяц (SMALL): до SMALL.ON (3) рядом, в тех же лесах (заяц вдвое чаще лисы).
     Видят машину ближе FLEE (14 м) — удирают; задел — кувыркнулся и убежал, урона нет.

   Перф: модели — общие геометрии и материалы, дальше SHOW (380 м) — спрятаны
   (cull.js не считает матрицы невидимых групп), проверки леса и дороги — раз в 0,4 с.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';

export const FAUNA = {
  FOREST_MIN: 30000,
  MOOSE: { ON: 3, R: [110, 330], EDGE: 80, FAR: 480, SHOW: 380, WALK: 0.8, TROT: 2.2, RESPAWN: [15, 35], RAD: 0.9, IN: 12, OUT: 18, OUTP: 0.45 },
  CROSS: { FIRST: [45, 90], CD: [80, 160], RETRY: 6, AHEAD: [60, 150], NEAR: 25, SPEED: 1.3, STOP: 0.5, STAND: [2, 4] },
  HIT: { MIN: 3, BASE: 3, K: 0.12, MAX: 2, KEEP: 0.3, STAGGER: 5 },
  SMALL: { ON: 3, R: [50, 220], FAR: 360, SHOW: 260, FLEE: 14, HARE: 0.67 },
  RAM: { FIRST: [30, 60], CD: [90, 180], TICK: 1, P: 0.3, SEE: [9, 30], AIM: 1.3, SPEED: 9, TURN: 0.6, RUN: 3.5, REACH: 1.1, PUSH: 9, ALONG: 0.4, HOME: 10 },
  LOVE: { FIRST: [50, 100], CD: [120, 240], RETRY: 10, VIEW: [25, 200], NEAR: 40, COME: 1.5, DUR: [4, 6], RATE: 1.7, WAIT: 25, SHOO: 16, SAY: 6 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let A = null;
const LIST = [];                     // живые звери
let FOR = null;                      // леса: { p, x0, x1, z0, z1 }
const ST = { spawnM: 3, spawnS: 2, cross: -1, hitToast: 0, ram: -1, love: -1 };
const LIVE = ['drive', 'back', 'handover', 'side'];

/* ── модели: коробки с плоским светом, как всё в игре ── */
const GEO = {}, MAT = {};
const box = (w, h, d) => GEO[w + ',' + h + ',' + d] || (GEO[w + ',' + h + ',' + d] = new THREE.BoxGeometry(w, h, d));
const mat = hex => MAT[hex] || (MAT[hex] = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
function part (parent, w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(box(w, h, d), mat(hex));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function legs (g, hx, hz, top, len, w, hex, hoof) {
  const L = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group();
    p.position.set(sx * hx, top, sz * hz);
    part(p, w, len, w * 1.1, hex, 0, -len / 2, 0);
    if (hoof) part(p, w * 1.15, len * 0.12, w * 1.3, hoof, 0, -len + len * 0.06, 0.02);
    g.add(p); L.push(p);
  }
  return L;
}
function mooseModel () {
  const g = new THREE.Group(), male = Math.random() < 0.6;
  const fur = Math.random() < 0.5 ? '#4b3426' : '#3e2b20', leg = '#8a7a66';
  const L = legs(g, 0.3, 0.82, 1.2, 1.2, 0.17, leg, '#2b2420');
  part(g, 0.92, 0.95, 2.2, fur, 0, 1.62, 0);                 // туловище
  part(g, 0.86, 0.42, 0.95, fur, 0, 2.18, 0.5);              // холка-горб
  part(g, 0.3, 0.32, 0.12, fur, 0, 1.72, -1.12);             // хвостик
  const neck = new THREE.Group(); neck.position.set(0, 1.95, 1.0); g.add(neck);
  part(neck, 0.5, 0.58, 0.85, fur, 0, 0.15, 0.32, -0.55);
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.72); neck.add(head);
  part(head, 0.42, 0.44, 0.62, fur, 0, 0, 0.2, 0.55);
  part(head, 0.4, 0.4, 0.42, '#6b4a36', 0, -0.3, 0.55, 0.55);           // горбатая морда
  part(head, 0.12, 0.34, 0.12, fur, 0, -0.42, 0.08);                    // «серьга» под горлом
  part(head, 0.06, 0.06, 0.04, '#111111', 0.2, 0.02, 0.28);
  part(head, 0.06, 0.06, 0.04, '#111111', -0.2, 0.02, 0.28);
  for (const s of [-1, 1]) part(head, 0.1, 0.24, 0.07, fur, s * 0.22, 0.26, -0.02, 0, 0, s * -0.5);
  if (male) for (const s of [-1, 1]) {
    part(head, 0.16, 0.12, 0.12, '#d6c095', s * 0.22, 0.3, -0.05);                      // основание рога
    part(head, 0.8, 0.08, 0.55, '#d6c095', s * 0.62, 0.42, -0.05, 0, 0, s * 0.3);       // лопата
    for (const tz of [0.18, -0.02, -0.24]) part(head, 0.08, 0.26, 0.08, '#d6c095', s * 0.95, 0.62, tz, 0, 0, s * 0.35);   // отростки
  }
  return { g, legs: L, neck, head, step: 1.15, amp: 0.38, male };
}
function foxModel () {
  const g = new THREE.Group(), o = '#d9682a';
  const L = legs(g, 0.1, 0.24, 0.34, 0.34, 0.07, '#2a1d14');
  part(g, 0.26, 0.26, 0.7, o, 0, 0.44, 0);
  part(g, 0.2, 0.12, 0.5, '#f4efe6', 0, 0.33, 0.04);
  const tail = part(g, 0.15, 0.15, 0.55, o, 0, 0.46, -0.55, 0.45);
  part(tail, 0.16, 0.16, 0.14, '#f4efe6', 0, 0, -0.32);
  const neck = new THREE.Group(); neck.position.set(0, 0.52, 0.38); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.06, 0.1); neck.add(head);
  part(head, 0.26, 0.22, 0.24, o, 0, 0, 0);
  part(head, 0.12, 0.1, 0.2, '#f4efe6', 0, -0.05, 0.18);
  part(head, 0.05, 0.05, 0.05, '#111111', 0, -0.02, 0.29);
  for (const s of [-1, 1]) part(head, 0.07, 0.14, 0.05, '#2a1d14', s * 0.08, 0.16, -0.02);
  return { g, legs: L, neck, head, step: 0.5, amp: 0.6 };
}
function hareModel () {
  const g = new THREE.Group(), c = '#9b8a72';
  const L = legs(g, 0.09, 0.16, 0.24, 0.24, 0.07, c);
  part(g, 0.26, 0.28, 0.46, c, 0, 0.36, 0, -0.15);
  part(g, 0.12, 0.12, 0.1, '#f4f4ee', 0, 0.42, -0.26);
  const neck = new THREE.Group(); neck.position.set(0, 0.48, 0.2); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.06, 0.06); neck.add(head);
  part(head, 0.2, 0.2, 0.22, c, 0, 0, 0);
  part(head, 0.05, 0.05, 0.05, '#111111', 0.09, 0.03, 0.06);
  part(head, 0.05, 0.05, 0.05, '#111111', -0.09, 0.03, 0.06);
  for (const s of [-1, 1]) part(head, 0.06, 0.34, 0.08, c, s * 0.06, 0.26, -0.05, -0.25, 0, s * -0.15);
  return { g, legs: L, neck, head, step: 0.45, amp: 0.7, hop: true };
}

/* ── лес: где он и в нём ли точка ── */
function forests () {
  if (FOR) return FOR;
  FOR = [];
  for (const g of A.CITY.green || []) {
    if (g.k !== 'green') continue;
    const p = g.p;
    let a = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i][0] * q[1] - q[0] * p[i][1];
      x0 = Math.min(x0, p[i][0]); x1 = Math.max(x1, p[i][0]); z0 = Math.min(z0, p[i][1]); z1 = Math.max(z1, p[i][1]);
    }
    if (Math.abs(a / 2) >= FAUNA.FOREST_MIN) FOR.push({ p, x0, x1, z0, z1 });
  }
  return FOR;
}
function forestAt (x, z) {
  for (const f of forests()) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && A.inPoly(x, z, f.p)) return f;
  return null;
}
/* на дороге ли (с запасом m от края полотна) */
function onRoad (x, z, m) {
  const r = A.nearestRoad(x, z);
  return !!r && r.d < (r.seg.w || 7) / 2 + m;
}
function okGround (x, z) { return A.inBounds(x, z, 10) && !A.inHouse(x, z, 1.5); }

/* край леса: ближайшая точка контура и расстояние до неё */
function edgeOf (f, x, z) {
  const p = f.p;
  let e = Infinity, px = x, pz = z;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < e) { e = d; px = qx; pz = qz; }
  }
  return { e, px, pz };
}
/* лосю можно сюда: опушка — в лесу не глубже IN·2,5 м от края, на лугу — не дальше OUT м
   (из глубины — только к краю) */
function opushka (f, x, z, x0, z0) {
  const M = FAUNA.MOOSE, e = edgeOf(f, x, z).e;
  if (!A.inPoly(x, z, f.p)) return e < M.OUT;
  return e < M.IN * 2.5 || e < edgeOf(f, x0, z0).e;
}
/* лось — на опушке (docs/ORDERS.md «Лоси и звери»): точка на краю леса в кольце R от машины,
   от IN м в глубь ельника до OUT·0,6 м на луг, не на дороге */
function edgeSpot (R) {
  const M = FAUNA.MOOSE, V = A.V;
  const near = forests().filter(f => f.x1 > V.x - R[1] && f.x0 < V.x + R[1] && f.z1 > V.z - R[1] && f.z0 < V.z + R[1]);
  if (!near.length) return null;
  for (let k = 0; k < 30; k++) {
    const f = near[(Math.random() * near.length) | 0], p = f.p, i = (Math.random() * p.length) | 0;
    const a = p[i], b = p[(i + 1) % p.length], t = Math.random();
    const bx = a[0] + (b[0] - a[0]) * t, bz = a[1] + (b[1] - a[1]) * t, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    if (!A.inPoly(bx + nx * 2, bz + nz * 2, p)) { nx = -nx; nz = -nz; }     // нормаль — в лес
    const o = rand(-M.OUT * 0.6, M.IN), x = bx + nx * o, z = bz + nz * o;
    const d = Math.hypot(x - V.x, z - V.z);
    if (d < R[0] || d > R[1] || !okGround(x, z) || onRoad(x, z, 4)) continue;
    return { x, z, f };
  }
  return null;
}

/* место для зверя: в лесу, в кольце R от машины, не на дороге; лось — у опушки (дорога не дальше EDGE) */
function spot (R, edge) {
  const near = forests().filter(f => f.x1 > A.V.x - R[1] && f.x0 < A.V.x + R[1] && f.z1 > A.V.z - R[1] && f.z0 < A.V.z + R[1]);
  if (!near.length) return null;
  for (let k = 0; k < 24; k++) {
    const a = rand(0, Math.PI * 2), d = rand(R[0], R[1]);
    const x = A.V.x + Math.sin(a) * d, z = A.V.z + Math.cos(a) * d;
    const f = near.find(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && A.inPoly(x, z, q.p));
    if (!f || !okGround(x, z) || onRoad(x, z, 4)) continue;
    if (edge) { const r = A.nearestRoad(x, z); if (!r || r.d > edge) continue; }
    return { x, z, f };
  }
  return null;
}

function add (kind, x, z, f, h) {
  const m = kind === 'moose' ? mooseModel() : kind === 'fox' ? foxModel() : hareModel();
  const a = {
    kind, ...m, x, z, y: A.groundH(x, z), h: h === undefined ? rand(0, Math.PI * 2) : h, f,
    v: 0, mode: 'graze', mt: rand(1, 5), chk: 0, ph: rand(0, 6), kx: 0, kz: 0, roll: 0, stun: 0, hitCd: 0,
    big: kind === 'moose', rad: kind === 'moose' ? FAUNA.MOOSE.RAD : 0.35,
  };
  a.g.rotation.order = 'YXZ';                      // наклон (x) — вдоль тела, после поворота
  a.g.position.set(x, a.y, z); a.g.rotation.y = a.h;
  A.scene.add(a.g);
  LIST.push(a);
  return a;
}
function drop (a) {
  A.scene.remove(a.g);
  LIST.splice(LIST.indexOf(a), 1);
}
export function clear () {
  for (let i = LIST.length - 1; i >= 0; i--) drop(LIST[i]);
  ST.cross = ST.ram = ST.love = -1;
}

/* ── «лось на дороге!»: найти дорогу у леса впереди и выпустить на неё лося ── */
function tryCross () {
  const V = A.V, C = FAUNA.CROSS, fx = Math.sin(V.h), fz = Math.cos(V.h);
  for (let k = 0; k < 6; k++) {
    const d = rand(C.AHEAD[0], C.AHEAD[1]), side = rand(-25, 25);
    const r = A.nearestRoad(V.x + fx * d + fz * side, V.z + fz * d - fx * side);
    if (!r) continue;
    const dx = r.x - V.x, dz = r.z - V.z, dd = Math.hypot(dx, dz);
    if (dd < C.AHEAD[0] * 0.8 || (dx * fx + dz * fz) / dd < 0.5) continue;
    const s = r.seg, L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
    const nx = -(s.z2 - s.z1) / L, nz = (s.x2 - s.x1) / L, sd = Math.random() < 0.5 ? 1 : -1;
    const off = (s.w || 7) / 2 + 6;
    const sx = r.x + nx * off * sd, sz = r.z + nz * off * sd, ex = r.x - nx * off * sd, ez = r.z - nz * off * sd;
    const fA = forestAt(sx, sz) || forestAt(sx + nx * C.NEAR * sd, sz + nz * C.NEAR * sd);
    const fB = forestAt(ex, ez) || forestAt(ex - nx * C.NEAR * sd, ez - nz * C.NEAR * sd);
    if (!fA && !fB) continue;
    if (!okGround(sx, sz) || !okGround(ex, ez)) continue;
    const m = add('moose', sx, sz, fB, Math.atan2(ex - sx, ez - sz));
    m.mode = 'cross'; m.ex = ex; m.ez = ez; m.cx = r.x; m.cz = r.z; m.mid = Math.random() < C.STOP ? 1 : 0;
    A.toast(t('лось на дороге!'));
    return true;
  }
  return false;
}

/* ── шаг одного зверя ── */
function think (a, dt, dCar) {
  const M = FAUNA.MOOSE;
  // маленькие удирают от машины
  if (!a.big && dCar < FAUNA.SMALL.FLEE && a.mode !== 'flee') {
    a.mode = 'flee'; a.mt = rand(1.8, 2.6);
    a.h = Math.atan2(a.x - A.V.x, a.z - A.V.z) + rand(-0.6, 0.6);
  }
  if (a.mode === 'wait' || a.mode === 'court' || a.mode === 'love') { loveStep(a, dt, dCar); return; }
  if (a.mode === 'aim' || a.mode === 'charge' || a.mode === 'home') { ramStep(a, dt); return; }
  if (a.mode === 'cross') {
    const dx = a.ex - a.x, dz = a.ez - a.z, d = Math.hypot(dx, dz);
    a.h = Math.atan2(dx, dz);
    if (a.mid === 1 && Math.hypot(a.x - a.cx, a.z - a.cz) < 1.2) { a.mid = 2; a.mode = 'stand'; a.mt = rand(...FAUNA.CROSS.STAND); a.v = 0; return; }
    a.v = FAUNA.CROSS.SPEED;
    if (d < 1) { a.mode = 'walk'; a.mt = rand(4, 8); a.f = forestAt(a.x, a.z) || a.f; }
    return;
  }
  if ((a.mt -= dt) <= 0) {
    if (a.mode === 'stand') { a.mode = 'cross'; return; }
    if (a.mode === 'stagger' || a.mode === 'flee') { a.mode = 'graze'; a.mt = rand(3, 7); }
    else if (a.mode === 'graze') {
      a.mode = 'walk'; a.mt = rand(4, 10); a.h += rand(-1.2, 1.2);
      // лось выходит из леса на опушку и уходит обратно
      if (a.big && a.f && Math.random() < FAUNA.MOOSE.OUTP) {
        const q = edgeOf(a.f, a.x, a.z), out = A.inPoly(a.x, a.z, a.f.p) ? 1 : -1;
        if (q.e > 0.5) a.h = Math.atan2((q.px - a.x) * out, (q.pz - a.z) * out) + rand(-0.4, 0.4);
      }
    }
    else { a.mode = 'graze'; a.mt = rand(3, 8); }
  }
  if (a.mode === 'stand') { a.v = 0; return; }
  const sp = a.mode === 'walk' ? (a.big ? M.WALK : a.kind === 'fox' ? 1.1 : 0.9)
    : a.mode === 'stagger' ? M.TROT : a.mode === 'flee' ? (a.kind === 'hare' ? 8 : 6) : 0;
  a.v = sp;
  // не выходить из леса и не лезть на дорогу (убегая и шатаясь — можно)
  if (sp > 0 && (a.chk -= dt) <= 0 && a.mode === 'walk') {
    a.chk = 0.4;
    const la = a.big ? 3 : 1.5, nx = a.x + Math.sin(a.h) * la, nz = a.z + Math.cos(a.h) * la;
    if ((a.f && !(a.big ? opushka(a.f, nx, nz, a.x, a.z) : A.inPoly(nx, nz, a.f.p))) || onRoad(nx, nz, 2.5) || A.inHouse(nx, nz, 0.5)) {
      a.h += Math.PI * rand(0.6, 1.4); a.mode = 'graze'; a.mt = rand(1, 3);
    }
  }
  if (a.mode === 'flee' || a.mode === 'stagger') {
    if (A.inHouse(a.x + Math.sin(a.h) * 1.5, a.z + Math.cos(a.h) * 1.5, 0.3)) a.h += Math.PI * rand(0.5, 1.5);
  }
}

/* ── бодание: лось замечает машину, опускает рога и бежит на неё ── */
const turnTo = (h, want, max) => { let d = want - h; d = Math.atan2(Math.sin(d), Math.cos(d)); return h + clamp(d, -max, max); };
function startRam (a) {
  a.mode = 'aim'; a.mt = FAUNA.RAM.AIM; a.v = 0; a.hit = 0; a.x0 = a.x; a.z0 = a.z;   // сюда вернётся
  if (A.emote) A.emote(a.x, 2.8, a.z, 'angry', 2);
  if (A.Snd && A.Snd.noise) { A.Snd.noise(0.35, 0.16); A.Snd.blip(75, 0.3, 'sawtooth', 0.08); }   // фыркнул
}
function tryRam () {
  const R = FAUNA.RAM, V = A.V;
  for (const a of LIST) {
    if (!a.big || !a.male || a.love || (a.mode !== 'graze' && a.mode !== 'walk')) continue;
    const d = Math.hypot(a.x - V.x, a.z - V.z);
    if (d < R.SEE[0] || d > R.SEE[1]) continue;
    startRam(a);
    return true;
  }
  return false;
}
function ramStep (a, dt) {
  const R = FAUNA.RAM, V = A.V, want = Math.atan2(V.x - a.x, V.z - a.z);
  a.mt -= dt;
  if (a.mode === 'aim') {
    a.v = 0; a.h = turnTo(a.h, want, 3 * dt);
    if (a.mt <= 0) { a.mode = 'charge'; a.mt = R.RUN; a.h = want; }
    return;
  }
  if (a.mode === 'charge') {
    a.v = R.SPEED; a.h = turnTo(a.h, want, R.TURN * dt);
    const ahead = A.inHouse(a.x + Math.sin(a.h) * 2, a.z + Math.cos(a.h) * 2, 0.3);
    if (a.mt <= 0 || a.hit || ahead) { a.mode = 'home'; a.mt = R.HOME; }
    return;
  }
  // home: трусцой обратно на своё место
  const dx = a.x0 - a.x, dz = a.z0 - a.z;
  a.h = turnTo(a.h, Math.atan2(dx, dz), 2.5 * dt); a.v = FAUNA.MOOSE.TROT;
  if (Math.hypot(dx, dz) < 2 || a.mt <= 0 || A.inHouse(a.x + Math.sin(a.h) * 1.5, a.z + Math.cos(a.h) * 1.5, 0.3)) { a.mode = 'graze'; a.mt = rand(3, 7); a.v = 0; }
}
function ramHit (a, hx, hz) {
  const R = FAUNA.RAM, V = A.V, dx = Math.sin(a.h), dz = Math.cos(a.h);
  a.hit = 1; a.hitCd = 1.2;
  // вбок — полный толчок (сцепление гасит его за ~0,3 с: машину сдвигает на ~1 м), вдоль кузова — 40 %,
  // иначе удар в зад/нос разгонял бы машину надолго
  const fx = Math.sin(V.h), fz = Math.cos(V.h), along = dx * fx + dz * fz;
  V.vx += (dx - fx * along * (1 - R.ALONG)) * R.PUSH; V.vz += (dz - fz * along * (1 - R.ALONG)) * R.PUSH;
  const tq = (hz - V.z) * dx - (hx - V.x) * dz;      // удар не в центр — машину слегка разворачивает
  V.h += clamp(tq * 0.08, -0.3, 0.3);
  if (A.sparks) A.sparks(hx, 1, hz, 10, dx, dz);
  if (A.ram) A.ram(R.SPEED + 3, hx, hz);              // −½ сердца, мятина, звук удара (game.js hurtCar)
  if (A.Snd && A.Snd.blip) A.Snd.blip(60, 0.25, 'square', 0.12);
  a.kx = -dx * 2; a.kz = -dz * 2;                       // отскочил назад
  if (A.emote) A.emote(a.x, 2.8, a.z, 'star', 3);
  a.mode = 'home'; a.mt = R.HOME;
  ST.rams = (ST.rams || 0) + 1;
  if (ST.hitToast <= 0) { ST.hitToast = 8; A.toast(t('лось боднул машину!')); }
}

/* ── любовь (только взрослая): один лось пристраивается к другому ── */
const LOVE_MODES = ['wait', 'court', 'love'];
function loveEnd (a, burst) {
  for (const m of [a, a.love]) {
    if (!m) continue;
    if (burst && A.emote) A.emote(m.x, 3, m.z, 'heart', 4);
    if (LOVE_MODES.includes(m.mode)) { m.mode = 'graze'; m.mt = rand(3, 7); }
    m.v = 0; m.top = 0; m.love = null;
    if (m.bub) { m.g.remove(m.bub); m.bub = null; }
  }
}
function tryLove () {
  const L = FAUNA.LOVE, V = A.V;
  const free = m => m.big && !m.love && (m.mode === 'graze' || m.mode === 'walk');
  for (const a of LIST) {
    if (!free(a)) continue;
    const d = Math.hypot(a.x - V.x, a.z - V.z);
    if (d < L.VIEW[0] || d > L.VIEW[1]) continue;
    let b = LIST.find(o => o !== a && free(o) && Math.hypot(o.x - a.x, o.z - a.z) < L.NEAR);
    for (let k = 0; k < 12 && !b; k++) {           // рядом никого — второй выходит из леса
      const an = rand(0, Math.PI * 2), r = rand(10, 20), x = a.x + Math.sin(an) * r, z = a.z + Math.cos(an) * r;
      if ((a.f && !A.inPoly(x, z, a.f.p)) || !okGround(x, z) || onRoad(x, z, 3)) continue;
      b = add('moose', x, z, a.f, an + Math.PI);
    }
    if (!b) continue;
    a.mode = 'wait'; a.mt = L.WAIT; a.v = 0; a.love = b;
    b.mode = 'court'; b.mt = L.WAIT; b.love = a; b.said = 0;
    ST.loves = (ST.loves || 0) + 1;
    return true;
  }
  return false;
}
function loveStep (a, dt, dCar) {
  const L = FAUNA.LOVE, p = a.love;
  if (!p || p.love !== a || !LIST.includes(p) || !LOVE_MODES.includes(p.mode)) { loveEnd(a); return; }
  a.mt -= dt; a.said = (a.said || 0) - dt;
  if (a.bub && (a.bubT -= dt) <= 0) { a.g.remove(a.bub); a.bub = null; }
  if (a.mode === 'wait' || (a.mode === 'love' && !a.top)) {
    a.v = 0;
    // подъехал близко — «не мешай!» (пузырь над нижним)
    if (dCar < L.SHOO && a.said <= 0 && A.sayBubble) {
      const L2 = [t('не мешай!'), t('занято!'), t('отвернись!'), t('проезжай, проезжай')];
      if (a.bub) a.g.remove(a.bub);
      a.bub = A.sayBubble(a.g, L2[Math.floor(Math.random() * L2.length)], '#c2185b', 3.7);
      a.bubT = 2.5; a.said = L.SAY;
    }
    if (a.mode === 'love' && (a.heartT = (a.heartT || 0) - dt) <= 0 && a.g.visible && A.emote) { a.heartT = 0.6; A.emote(a.x, 3.3, a.z, 'heart', 1); }
    if (a.mt <= 0) loveEnd(a, a.mode === 'love');
    return;
  }
  if (a.mode === 'court') {
    const tx = p.x - Math.sin(p.h) * L.COME, tz = p.z - Math.cos(p.h) * L.COME, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.35) {
      a.mode = p.mode = 'love'; a.top = 1; p.top = 0;
      a.mt = p.mt = rand(...L.DUR); a.lp = p.lp = 0; a.h = p.h;
      return;
    }
    a.h = d > 2 ? Math.atan2(dx, dz) : turnTo(a.h, Math.atan2(dx, dz), 3 * dt);
    a.v = Math.min(FAUNA.MOOSE.TROT, d * 1.5);
    if (a.mt <= 0) loveEnd(a);
    return;
  }
  // love, верхний: стоит вплотную сзади, ритмично покачивается
  a.v = 0; a.h = p.h;
  a.x = p.x - Math.sin(p.h) * L.COME; a.z = p.z - Math.cos(p.h) * L.COME;
  if (a.mt <= 0) loveEnd(a, true);
}

/* ── машина и зверь ── */
function bump (a) {
  const V = A.V, fx = Math.sin(V.h), fz = Math.cos(V.h), half = (A.CAR_L || 2.2) * 0.75;
  const tt = clamp((a.x - V.x) * fx + (a.z - V.z) * fz, -half, half);
  const cx = V.x + fx * tt, cz = V.z + fz * tt;
  let nx = a.x - cx, nz = a.z - cz;
  const d = Math.hypot(nx, nz), need = (A.CAR_W || 1) + a.rad;
  if (a.mode === 'charge' && !a.hit && d < need + FAUNA.RAM.REACH && Math.abs(V.y - a.y) < 2.5) {
    const k = d > 1e-3 ? 1 / d : 0;
    ramHit(a, cx + nx * k * (A.CAR_W || 1), cz + nz * k * (A.CAR_W || 1));
  }
  if (d >= need || Math.abs(V.y - a.y) > 2.5) return;
  if (d < 1e-3) { nx = fx; nz = fz; } else { nx /= d; nz /= d; }
  const vn = V.vx * nx + V.vz * nz - (a.kx * nx + a.kz * nz);
  const hx = cx + nx * (A.CAR_W || 1), hz = cz + nz * (A.CAR_W || 1);
  if (!a.big) {
    // лиса, заяц: кувырок в сторону, без урона
    if (a.hitCd > 0) return;
    a.hitCd = 1.5;
    const k = Math.max(3, Math.hypot(V.vx, V.vz) * 0.5);
    a.kx = nx * k; a.kz = nz * k; a.roll = 1; a.jump = 1.6;
    a.mode = 'flee'; a.mt = 2.5; a.h = Math.atan2(nx, nz);
    if (A.emote) A.emote(a.x, 0.8, a.z, 'star', 3);
    return;
  }
  // лось — как стена: машину выталкиваем, лось почти не сдвигается
  const push = need - d;
  V.x -= nx * push * 0.85; V.z -= nz * push * 0.85;
  a.x += nx * push * 0.15; a.z += nz * push * 0.15;
  if (vn <= 0) return;
  const H = FAUNA.HIT;
  if (vn > H.MIN && a.hitCd <= 0) {
    a.hitCd = 1.2;
    const dmg = clamp((vn - H.BASE) * H.K, 0.3, H.MAX);
    A.hurt(dmg, vn, hx, hz);
    V.vx -= nx * vn * (1 - H.KEEP); V.vz -= nz * vn * (1 - H.KEEP);
    V.vx *= 0.8; V.vz *= 0.8;
    const k = Math.min(1.5 + vn * 0.18, 5);
    a.kx = nx * k; a.kz = nz * k; a.roll = Math.min(0.55, 0.15 + vn * 0.025) * (Math.random() < 0.5 ? 1 : -1);
    a.mode = 'stagger'; a.mt = H.STAGGER; a.h = Math.atan2(nx, nz) + rand(-0.5, 0.5);
    if (A.emote) A.emote(a.x, 2.6, a.z, 'star', 5);
    if (A.Snd && A.Snd.crash && A.S.hurt <= 0) A.Snd.crash(vn);
    if (ST.hitToast <= 0) { ST.hitToast = 8; A.toast(t('врезался в лося — он тяжёлый, как машина')); }
  } else {
    V.vx -= nx * vn; V.vz -= nz * vn;          // упёрся: дальше не едешь
  }
}

function animate (a, dt) {
  a.ph += dt * (a.v > 0 ? a.v / a.step * Math.PI : 0);
  const sw = a.v > 0 ? Math.sin(a.ph) * a.amp * Math.min(1, a.v / 0.8) : 0;
  a.legs[0].rotation.x = a.legs[3].rotation.x = sw;
  a.legs[1].rotation.x = a.legs[2].rotation.x = -sw;
  // пасётся — голову к траве
  const down = a.mode === 'graze' ? (a.big ? 1.0 : 0.6) : a.mode === 'aim' ? 1.15 : a.mode === 'charge' ? 0.85
    : a.mode === 'stand' || a.mode === 'love' ? -0.15 : 0;
  a.neck.rotation.x += (down - a.neck.rotation.x) * Math.min(1, dt * 2);
  a.roll *= Math.exp(-dt * 1.6);
  const wob = a.mode === 'stagger' ? Math.sin(a.ph * 0.9) * 0.12 : 0;
  a.g.rotation.set(0, a.h, a.roll + wob);
  let y = a.y;
  if (a.hop && a.v > 2) y += Math.abs(Math.sin(a.ph)) * 0.35;
  if (a.jump) {                                // кувырок: дуга вверх за 0,6 с
    a.jy = (a.jy || 0) + dt / 0.6;
    if (a.jy >= 1) { a.jump = 0; a.jy = 0; } else { y += 4 * a.jump * a.jy * (1 - a.jy); a.g.rotation.x = a.jy * Math.PI * 2; }
  }
  if (a.mode === 'love') {
    // ритмичное покачивание; верхний встал на дыбы передними ногами на спину нижнего
    a.lp = (a.lp || 0) + dt * FAUNA.LOVE.RATE * Math.PI * 2;
    const s = Math.sin(a.lp), fx = Math.sin(a.h), fz = Math.cos(a.h);
    if (a.top) {
      a.g.rotation.x = -0.42;
      a.legs[0].rotation.x = a.legs[1].rotation.x = -1.0;
      a.legs[2].rotation.x = a.legs[3].rotation.x = 0.42;
      y += 0.38;
      a.g.position.set(a.x + fx * s * 0.14, y, a.z + fz * s * 0.14);
    } else {
      a.g.rotation.x = s * 0.025;
      a.g.position.set(a.x + fx * s * 0.05, y, a.z + fz * s * 0.05);
    }
    return;
  }
  a.g.position.set(a.x, y, a.z);
}

export function step (dt, api) {
  A = api;
  const S = A.S, V = A.V;
  if (!S || S.state === 'title' || S.state === 'over') { if (LIST.length) clear(); return; }
  const live = LIVE.includes(S.state);
  ST.hitToast -= dt;
  // спавн: держим ON лосей и ON мелких рядом
  if (live) {
    const M = FAUNA.MOOSE, Sm = FAUNA.SMALL;
    if ((ST.spawnM -= dt) <= 0) {
      ST.spawnM = rand(...M.RESPAWN) / 3;
      if (LIST.filter(a => a.big && a.mode !== 'cross').length < M.ON) {
        const p = edgeSpot(M.R) || spot(M.R, M.EDGE);    // на опушке; не нашлось — где раньше
        if (p) add('moose', p.x, p.z, p.f);
      }
    }
    if ((ST.spawnS -= dt) <= 0) {
      ST.spawnS = rand(4, 10);
      if (LIST.filter(a => !a.big).length < Sm.ON) {
        const p = spot(Sm.R, 0);
        if (p) add(Math.random() < Sm.HARE ? 'hare' : 'fox', p.x, p.z, p.f);
      }
    }
    if (ST.cross < 0) ST.cross = rand(...FAUNA.CROSS.FIRST);
    if (Math.hypot(V.vx, V.vz) > 5 && (ST.cross -= dt) <= 0)
      ST.cross = tryCross() ? rand(...FAUNA.CROSS.CD) : FAUNA.CROSS.RETRY;
    const R = FAUNA.RAM;
    if (ST.ram < 0) ST.ram = rand(...R.FIRST);
    if ((ST.ram -= dt) <= 0) ST.ram = S.state === 'drive' && Math.random() < R.P && tryRam() ? rand(...R.CD) : R.TICK;
    if (A.ADULT) {
      const L = FAUNA.LOVE;
      if (ST.love < 0) ST.love = rand(...L.FIRST);
      if ((ST.love -= dt) <= 0) ST.love = tryLove() ? rand(...L.CD) : L.RETRY;
    }
  }
  for (let i = LIST.length - 1; i >= 0; i--) {
    const a = LIST[i];
    const dCar = Math.hypot(a.x - V.x, a.z - V.z);
    if (dCar > (a.big ? FAUNA.MOOSE.FAR : FAUNA.SMALL.FAR)) { drop(a); continue; }
    a.g.visible = dCar < (a.big ? FAUNA.MOOSE.SHOW : FAUNA.SMALL.SHOW);
    a.hitCd -= dt;
    think(a, dt, dCar);
    a.x += (Math.sin(a.h) * a.v + a.kx) * dt;
    a.z += (Math.cos(a.h) * a.v + a.kz) * dt;
    const kd = Math.exp(-dt * 3);
    a.kx *= kd; a.kz *= kd;
    if (dCar < 8) bump(a);
    if (!a.g.visible) continue;
    a.y = A.groundH(a.x, a.z);
    animate(a, dt);
  }
}

/* ── трафик тормозит перед лосем (game.js updateTraffic) ──
   Лось на полосе впереди (ближе YIELD.REACH по ходу и не дальше YIELD.HALF + его ширины вбок) —
   машина сбавляет ход с YIELD.SOFT м до остановки и встаёт так, что до лося остаётся YIELD.GAP м
   между бампером и лосем. Стоит дольше YIELD.WAIT — сигналит (раз в YIELD.HONK с); после
   YIELD.SHOO гудков лось, если он не переходит дорогу, сам уходит с неё. Ушёл с полосы — едет. */
export const YIELD = { REACH: 30, HALF: 1.4, GAP: 3, SOFT: 14, WAIT: 1.2, HONK: [2.5, 4], SHOO: 2 };
export function trafficYield (t, dt) {
  let slow = 1, who = null;
  if (LIST.length) {
    const hx = Math.sin(t.h), hz = Math.cos(t.h), Y = YIELD;
    for (const a of LIST) {
      if (!a.big) continue;
      const dx = a.x - t.x, dz = a.z - t.z;
      if (Math.abs(dx) > Y.REACH || Math.abs(dz) > Y.REACH) continue;
      const fw = dx * hx + dz * hz;
      if (fw <= 0 || fw > Y.REACH || Math.abs(-hz * dx + hx * dz) > Y.HALF + a.rad) continue;
      const k = clamp((fw - (t.hl || 2) - a.rad - Y.GAP) / Y.SOFT, 0, 1);
      if (k < slow) { slow = k; who = a; }
    }
  }
  if (!who || t.speed > 0.5) { if (!who) { t.mooseT = 0; t.mooseN = 0; } return slow; }
  // стоит перед лосем: подождал — сигналит, лось уходит с дороги
  t.mooseT = (t.mooseT || 0) + dt;
  if (t.mooseT > YIELD.WAIT && (t.mooseHonk = (t.mooseHonk || 0) - dt) <= 0) {
    t.mooseHonk = rand(...YIELD.HONK);
    t.mooseN = (t.mooseN || 0) + 1;
    ST.honks = (ST.honks || 0) + 1;
    const V = A.V, d = Math.hypot(t.x - V.x, t.z - V.z);
    if (d < 70 && A.Snd && A.Snd.blip) {
      const v = 0.07 * (1 - d / 70);
      A.Snd.blip(400, 0.16, 'square', v); setTimeout(() => A.Snd.blip(400, 0.28, 'square', v), 200);
    }
    if (A.emote && t.mooseN === 1) A.emote(who.x, 2.8, who.z, 'angry', 1.5);
    if (t.mooseN >= YIELD.SHOO) shoo(who);
  }
  return slow;
}
/* лось уходит с дороги поперёк, в сторону от середины полотна */
function shoo (a) {
  if (a.mode === 'cross' || a.mode === 'aim' || a.mode === 'charge') return;
  if (a.mode === 'stand' && a.ex !== undefined) { a.mode = 'cross'; return; }
  const r = A.nearestRoad(a.x, a.z);
  if (!r) return;
  const s = r.seg, L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
  let nx = -(s.z2 - s.z1) / L, nz = (s.x2 - s.x1) / L;
  if ((a.x - r.x) * nx + (a.z - r.z) * nz < 0) { nx = -nx; nz = -nz; }
  const off = (s.w || 7) / 2 + 6;
  if (a.love) loveEnd(a);
  a.mode = 'cross'; a.mid = 2; a.ex = r.x + nx * off; a.ez = r.z + nz * off; a.cx = r.x; a.cz = r.z;
}

/* отладка: window.__fauna (только dev или ?debug) */
export const DEBUG = {
  LIST, FAUNA, get forests () { return forests().length; }, get cam () { return A && A.cam; },
  cross: () => tryCross(),
  ram: a => { a = a || LIST.find(m => m.big); if (!a) return false; a.male = true; startRam(a); return true; },   // этот лось бодает
  love: () => !!(A && A.ADULT) && tryLove(),        // в детской — всегда false
  get stats () { return { rams: ST.rams || 0, loves: ST.loves || 0, ram: ST.ram, love: ST.love, honks: ST.honks || 0 }; },
  at: (x, z, h) => add('moose', x, z, null, h),        // лось в точке (проверка: трафик тормозит)
  near: (kind = 'moose', d = 25) => { const V = A.V; return add(kind, V.x + Math.sin(V.h) * d, V.z + Math.cos(V.h) * d, null); },
};
if (typeof window !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) window.__fauna = DEBUG;
