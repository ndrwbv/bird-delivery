/* ──────────────────────────────────────────────────────────────────────────
   Пиццерия-шар (docs/IDEAS.md, блок 6; правила — docs/CAREER.md «Город: как выглядит»).

   Пиццерия — не первый этаж жилого дома, а отдельное здание: оранжевый шар
   (DOME.R = 9 м) на стеклянном барабане-вестибюле (DRUM = 6,4 м, высота
   DRUM_H = 4,4 м), всего ~19 м с мачтой — как шесть этажей. Белая «шапка»
   наверху, два светящихся пояса, круглые окна, логотип (птица с куском пиццы)
   на боку шара к улице, стеклянный тамбур со стойкой выдачи и вывеской,
   крутящийся логотип на мачте с красным огоньком. Вокруг — площадь из плитки
   с оранжевым кольцом, дорожка к улице, два столика под зонтиками и парковка
   курьеров (pizzeria.js courierLot). Днём стекло голубое, ночью — тёплое,
   шар светится изнутри, под ним горят светильники и пятна света на плитке.

   Место (site): рядом с прежней точкой пиццерии района — ближайшее к улице,
   где у неё стоял дом (по кольцам от точки на улице, до DOME.SEARCH м):
     • край шара — в DOME.GAP (2—8 м) от края полотна улицы (не двора,
       класс ≤ 4), тамбур смотрит на улицу;
     • под шаром (он нависает над барабаном), площадью и дорожкой — ни дома, ни дороги/дорожки, ни
       забора/стены/рельсов, ни парковки, ни воды и спортплощадки;
       перепад высот под шаром — не больше DOME.SLOPE;
     • в том же районе, что и прежний дом;
     • рядом с шаром помещается парковка курьеров.
   Не нашлось — пиццерия остаётся в доме (старый фасад, game.js dodoFacade).

   Шар — препятствие (кольцо стен по цоколю + тамбур) и «дом» для всего,
   что расставляется после (деревья, лавочки, гаражи, ельник не встают в него).
   Переменных игры модуль не видит — всё приходит в api (pizzaApi в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { courierLot, lotBase } from './pizzeria.js';
import { seasonMat } from './seasons.js';

export const DOME = { R: 9, DRUM: 6.4, DRUM_H: 4.4, GAP: [2, 8], SEARCH: 200, STEP: 4, SLOPE: 1.6, PLAZA: 2.4, PORCH: 2.4, SPIN: 0.35 };

const ORANGE = '#ff7a1a', BRAND = '#f0522a', CREAM = '#fff3d6', WHITE = '#f4f1ea', GLOW = '#fff0c0';
const DOMES = [];                       // { x, z, R, gy, logo }
let DOME_MAT = null, LOGO_MAT = null, BLINK = null, SIGN_TEX = null, GLASS = null;
const ST = { tries: 0, ms: 0, night: -1, t: 0 };
const C_DAY = new THREE.Color('#a9d3e2'), C_NIGHT = new THREE.Color('#ffd28a');

/* ── рисунки кодом: логотип (птица с куском пиццы) и вывеска ── */
function bird (x, cx, cy, s) {
  x.fillStyle = '#ffd23f';
  x.beginPath(); x.ellipse(cx, cy, 9 * s, 7 * s, 0, 0, 7); x.fill();                 // тело
  x.beginPath(); x.arc(cx + 7 * s, cy - 6 * s, 5 * s, 0, 7); x.fill();                // голова
  x.fillStyle = '#ff8a2b';
  x.beginPath(); x.moveTo(cx + 11 * s, cy - 7 * s); x.lineTo(cx + 16 * s, cy - 5 * s); x.lineTo(cx + 11 * s, cy - 3 * s); x.fill();   // клюв
  x.fillStyle = '#f2b43a';
  x.beginPath(); x.moveTo(cx - 3 * s, cy - 2 * s); x.lineTo(cx - 12 * s, cy - 9 * s); x.lineTo(cx - 6 * s, cy + 3 * s); x.fill();     // крыло
  x.fillStyle = '#1b1a1f'; x.beginPath(); x.arc(cx + 8 * s, cy - 7 * s, 1.2 * s, 0, 7); x.fill();
}
function slice (x, cx, cy, s) {
  x.fillStyle = '#ffcf5a'; x.strokeStyle = '#c8741e'; x.lineWidth = 2 * s;
  x.beginPath(); x.moveTo(cx, cy - 7 * s); x.lineTo(cx + 9 * s, cy + 8 * s); x.lineTo(cx - 9 * s, cy + 8 * s); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#e04836';
  for (const [a, b] of [[0, 0], [-3, 5], [4, 5]]) { x.beginPath(); x.arc(cx + a * s, cy + b * s, 1.6 * s, 0, 7); x.fill(); }
}
function canvasTex (c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function logoMat () {
  if (LOGO_MAT) return LOGO_MAT;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = WHITE; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill();
  x.fillStyle = BRAND; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.fill();
  bird(x, 112, 120, 5.2);
  slice(x, 176, 150, 2.6);
  LOGO_MAT = new THREE.MeshBasicMaterial({ map: canvasTex(c), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
  return LOGO_MAT;
}
function signMat (brand) {
  if (!SIGN_TEX) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const x = c.getContext('2d');
    x.fillStyle = BRAND; x.beginPath(); x.roundRect ? x.roundRect(0, 0, 512, 112, 28) : x.rect(0, 0, 512, 112); x.fill();
    x.strokeStyle = CREAM; x.lineWidth = 5; x.beginPath(); x.roundRect ? x.roundRect(8, 8, 496, 96, 22) : x.rect(8, 8, 496, 96); x.stroke();
    bird(x, 62, 60, 2.9);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const txt = String(brand || '').toUpperCase();
    let fs = 54;
    do { x.font = 'bold ' + fs + 'px sans-serif'; fs -= 2; } while (x.measureText(txt).width > 370 && fs > 18);
    x.fillText(txt, 300, 60);
    SIGN_TEX = canvasTex(c);
  }
  return new THREE.MeshBasicMaterial({ map: SIGN_TEX });
}

/* ── место под шар ── */
const isIn = (x, z, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
/* препятствия рядом с точкой (стены, заборы, рельсы): сетка до индекса игры — его ещё нет */
function solidGrid (A, ox, oz, R) {
  const G = new Map(), C = 10;
  for (const s of A.SOLIDS) {
    if (Math.abs(s.cx - ox) > R || Math.abs(s.cz - oz) > R) continue;
    for (let i = Math.floor((s.cx - s.ex - 1) / C); i <= Math.floor((s.cx + s.ex + 1) / C); i++)
      for (let j = Math.floor((s.cz - s.ez - 1) / C); j <= Math.floor((s.cz + s.ez + 1) / C); j++) {
        const k = i * 100003 + j;
        let a = G.get(k); if (!a) G.set(k, a = []);
        a.push(s);
      }
  }
  return (x, z, r) => {
    for (const s of G.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) || []) {
      const dx = x - s.cx, dz = z - s.cz;
      if (Math.abs(dx * s.cs + dz * s.sn) < s.hw + r && Math.abs(-dx * s.sn + dz * s.cs) < s.hd + r) return true;
    }
    return false;
  };
}
/* площадки, куда шар не ставим: парковки, вода, спорт и детские площадки */
function areaGrid (A, ox, oz, R) {
  const list = [];
  const take = p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    if (x1 < ox - R || x0 > ox + R || z1 < oz - R || z0 > oz + R) return;
    list.push({ p, x0, x1, z0, z1 });
  };
  for (const l of A.CITY.lots || []) take(l.p);
  for (const g of A.CITY.green || []) if (g.k === 'water' || g.k === 'pitch' || g.k === 'play') take(g.p);
  return (x, z) => list.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && isIn(x, z, q.p));
}

export function site (A, f, lots) {
  const t0 = performance.now(), D = DOME, R = D.R;
  const Rb = R;                                                // шар нависает над барабаном: под ним — пусто
  const r0 = f.road || A.nearestRoad(f.mx, f.mz, 4, 3);
  if (!r0) return null;
  const ox = r0.x, oz = r0.z, want = A.distAt ? A.distAt(f.cx === undefined ? f.mx : f.cx, f.cz === undefined ? f.mz : f.cz) : 0;
  const solid = solidGrid(A, ox, oz, D.SEARCH + 60), area = areaGrid(A, ox, oz, D.SEARCH + 60);
  const free = (x, z, m) => {
    if (!A.inBounds(x, z, 6) || A.inHouse(x, z, m)) return false;
    if (A.groundH(x, z) < 0.3) return false;
    const r = A.nearestRoad(x, z, 9, 1);
    if (r && r.d < r.seg.w / 2 + m) return false;
    return !solid(x, z, m) && !area(x, z);
  };
  // кольца площади: центр, тело шара, край цоколя, край площади
  const RINGS = [[0, 1], [Rb * 0.5, 6], [Rb, 14], [Rb + 1.6, 16], [Rb + D.PLAZA, 20]];
  for (let rad = 0; rad <= D.SEARCH; rad += D.STEP) {
    const n = Math.max(1, Math.round(rad * 2 * Math.PI / D.STEP));
    for (let i = 0; i < n; i++) {
      ST.tries++;
      const a = i / n * Math.PI * 2, cx = ox + Math.cos(a) * rad, cz = oz + Math.sin(a) * rad;
      const road = A.nearestRoad(cx, cz, 4, 3);                   // улица, не дворовый проезд
      if (!road) continue;
      const edge = road.d - road.seg.w / 2 - Rb;
      if (edge < D.GAP[0] || edge > D.GAP[1]) continue;
      if (A.inHouse(cx, cz, Rb)) continue;
      if (want !== undefined && A.distAt && A.distAt(cx, cz) !== want) continue;
      const fx = (road.x - cx) / road.d, fz = (road.z - cz) / road.d, rx = fz, rz = -fx;
      let ok = true, hMin = Infinity, hMax = -Infinity;
      for (const [rr, m] of RINGS) {
        for (let k = 0; k < m && ok; k++) {
          const b = k / m * Math.PI * 2, x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr;
          if (!free(x, z, rr > Rb + 1 ? 0.4 : 0.8)) ok = false;
          else if (rr <= Rb) { const h = A.groundH(x, z); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
        }
        if (!ok) break;
      }
      if (!ok || hMax - hMin > D.SLOPE) continue;
      // тамбур и дорожка к улице
      for (let v = Rb; v < road.d - road.seg.w / 2 - 0.5 && ok; v += 1.5)
        for (const u of [-2.2, 0, 2.2]) if (!free(cx + fx * v + rx * u, cz + fz * v + rz * u, 0.3)) { ok = false; break; }
      if (!ok) continue;
      // парковка курьеров рядом помещается
      const g = { mx: cx, mz: cz, road };
      const block = (x, z) => Math.hypot(x - cx, z - cz) < Rb + D.PLAZA + 0.5;
      if (lots && !lotBase(A, g, lots, block)) continue;
      ST.ms += performance.now() - t0;
      return { x: cx, z: cz, fx, fz, rx, rz, road, Rb, gy: A.groundH(cx, cz), dist: rad };
    }
  }
  ST.ms += performance.now() - t0;
  return null;
}

/* ── сам шар ── */
export function build (A, f, opt = {}) {
  const S = site(A, f, opt.lots || 0);
  if (!S) return null;
  const D = DOME, R = D.R, RD = D.DRUM, HD = D.DRUM_H, { x: cx, z: cz, fx, fz, rx, rz, road } = S;
  const gy = S.gy, cy = gy + HD + Math.sqrt(R * R - RD * RD) - 0.3;   // шар сидит на стеклянном барабане
  const ry = Math.atan2(fx, fz);                               // «перёд» модели (+Z) — к улице
  const at = (u, v) => [cx + rx * u + fx * v, cz + rz * u + fz * v];
  const { put, LIT, FLAT, LAMPH, LITM, FLATM } = A;

  // площадь из светлой плитки с оранжевым кольцом и дорожка к улице
  const PR = R + D.PLAZA;
  LITM.color('#d9d3c9'); LITM.disc(cx, cz, PR, 0.13, 32);
  FLATM.color(BRAND);
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2, b = (i + 1) / 40 * Math.PI * 2, rr = PR - 0.7;
    FLATM.ribbon(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, 0.35, 0.15);
  }
  {
    const [x1, z1] = at(0, PR - 0.5), ed = road.d - road.seg.w / 2;
    const [x2, z2] = at(0, Math.max(PR, ed + 0.3));
    LITM.color('#d9d3c9'); LITM.ribbon(x1, z1, x2, z2, 4.2, 0.13);
  }
  // цоколь и стеклянный барабан-вестибюль: днём голубое стекло, ночью тёплый свет (step)
  put(LIT, new THREE.CylinderGeometry(RD + 0.5, RD + 0.7, 0.45, 28), '#e6e1d8', cx, gy + 0.15, cz);
  if (!GLASS) GLASS = new THREE.MeshBasicMaterial({ color: '#a9d3e2' });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(RD, RD, HD, 28, 1, true).translate(cx, gy + HD / 2 + 0.3, cz), GLASS);
  A.scene.add(drum);
  for (let i = 0; i < 14; i++) {                                // белые стойки по стеклу
    const a = i / 14 * Math.PI * 2;
    A.box(LIT, 0.22, HD, 0.22, WHITE, cx + Math.sin(a) * (RD + 0.05), gy + HD / 2 + 0.3, cz + Math.cos(a) * (RD + 0.05), a);
  }
  put(LIT, new THREE.CylinderGeometry(RD + 0.45, RD + 0.45, 0.5, 28), WHITE, cx, gy + HD + 0.3, cz);   // карниз барабана

  // шар: свой материал (ночью светится), снег сверху — как у города (seasons.js)
  if (!DOME_MAT) DOME_MAT = seasonMat(new THREE.MeshLambertMaterial({ color: ORANGE, flatShading: true, emissive: new THREE.Color(ORANGE), emissiveIntensity: 0 }), 0.4);
  const top = Math.PI * 0.14, bot = Math.acos(-(cy - gy - HD - 0.2) / R);
  A.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 26, 16, 0, Math.PI * 2, top, bot - top).translate(cx, cy, cz), DOME_MAT));
  // «шапка»: светлое стекло наверху
  put(LIT, new THREE.SphereGeometry(R + 0.02, 26, 3, 0, Math.PI * 2, 0, top + 0.01), CREAM, cx, cy, cz);
  // светящиеся пояса: по экватору и над ним
  for (const [k, th] of [[0.5, 0.12], [0, 0.22]]) {
    const y = cy + R * k, rr = Math.sqrt(R * R - (R * k) ** 2) + 0.06;
    put(LAMPH, new THREE.TorusGeometry(rr, th, 4, 52), GLOW, cx, y, cz, Math.PI / 2, 0, 0);
  }
  // логотип на боку шара — к улице; иллюминаторы — по кругу
  const onBall = (al, ph, out) => {
    const aw = al + ry, nx = Math.cos(ph) * Math.sin(aw), ny = Math.sin(ph), nz = Math.cos(ph) * Math.cos(aw);
    return [cx + nx * (R + out), cy + ny * (R + out), cz + nz * (R + out), -ph, aw];
  };
  {
    const [x, y, z, rxx, ryy] = onBall(0, -0.28, 0.08);
    const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), logoMat());
    m.position.set(x, y, z); m.rotation.set(rxx, ryy, 0, 'YXZ');
    A.scene.add(m);
  }
  // иллюминаторы — стекло как у барабана: днём голубое, ночью тёплое (одна склейка на шар)
  const win = [], E3 = new THREE.Euler(), M = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) {
    const al = (i + 0.5) / 12 * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(al), Math.cos(al))) < 0.5) continue;
    const [x, y, z, rxx, ryy] = onBall(al, 0.24, 0.04);
    M.makeRotationFromEuler(E3.set(rxx, ryy, 0, 'YXZ')).setPosition(x, y, z);
    win.push(new THREE.CircleGeometry(0.8, 12).toNonIndexed().applyMatrix4(M));
    const [x2, y2, z2] = onBall(al, 0.24, 0.06);
    put(LIT, new THREE.TorusGeometry(0.88, 0.1, 3, 12), WHITE, x2, y2, z2, rxx, ryy, 0);
  }
  if (win.length) {
    const n = win.reduce((a, g) => a + g.attributes.position.count, 0), arr = new Float32Array(n * 3);
    let o = 0;
    for (const g of win) { arr.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    A.scene.add(new THREE.Mesh(g, GLASS));
  }

  // тамбур: белая рама, тёплое стекло со стойкой выдачи, стеклянная дверь
  const V0 = RD - 1.6, V1 = RD + D.PORCH, VW = 6.2, VH = 3.6, vm = (V0 + V1) / 2, vd = V1 - V0;
  { const [x, z] = at(0, vm); A.box(LIT, VW + 0.5, 0.45, vd + 0.5, WHITE, x, gy + VH + 0.2, z, ry); }
  { const [x, z] = at(0, V1 + 0.2); A.box(LIT, VW + 0.5, 0.18, 0.08, BRAND, x, gy + VH + 0.12, z, ry); }
  for (const s of [-1, 1]) {
    const [x, z] = at(s * (VW / 2), vm); A.box(LIT, 0.35, VH, vd, WHITE, x, gy + VH / 2, z, ry);
    const [x2, z2] = at(s * (VW / 2 + 0.18), V1 - 1.2);
    put(FLAT, new THREE.PlaneGeometry(1.8, VH - 0.5), '#9fc9da', x2, gy + VH / 2, z2, 0, ry + s * Math.PI / 2, 0);
  }
  { const [x, z] = at(0, V1); put(LAMPH, new THREE.PlaneGeometry(VW - 0.4, VH - 0.3), '#ffe2a8', x, gy + VH / 2, z, 0, ry, 0); }
  { const [x, z] = at(-0.9, V1 + 0.02); put(LAMPH, new THREE.PlaneGeometry(3.4, 0.9), '#8a5a3a', x, gy + 1.0, z, 0, ry, 0); }     // стойка
  for (let i = 0; i < 4; i++) { const [x, z] = at(-2.0 + i * 0.75, V1 + 0.03); put(LAMPH, new THREE.PlaneGeometry(0.6, 0.12), BRAND, x, gy + 1.55 + (i % 2) * 0.13, z, 0, ry, 0); }
  { const [x, z] = at(-2.4, V1 + 0.03); put(LAMPH, new THREE.PlaneGeometry(1.0, 0.8), '#ff8a2b', x, gy + 2.6, z, 0, ry, 0); }      // отсвет печи
  { const [x, z] = at(1.9, V1 + 0.04); put(FLAT, new THREE.PlaneGeometry(1.9, 2.7), '#7fb3c8', x, gy + 1.36, z, 0, ry, 0); }       // дверь
  { const [x, z] = at(1.9, V1 + 0.05); put(FLAT, new THREE.PlaneGeometry(0.06, 2.6), WHITE, x, gy + 1.36, z, 0, ry, 0); }
  // вывеска на тамбуре
  {
    const [x, z] = at(0, V1 + 0.1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(VW + 0.2, (VW + 0.2) * 112 / 512), signMat(opt.brand));
    m.position.set(x, gy + VH + 1.05, z); m.rotation.y = ry;
    A.scene.add(m);
    const [bx, bz] = at(0, V1 - 0.05);
    A.box(LIT, VW + 0.2, (VW + 0.2) * 112 / 512 + 0.1, 0.12, WHITE, bx, gy + VH + 1.05, bz, ry);
  }
  // мачта с крутящимся логотипом и мигающим огоньком
  const topY = cy + R;
  put(LIT, new THREE.CylinderGeometry(0.12, 0.16, 3.4, 6), '#585460', cx, topY + 1.5, cz);
  const logo = new THREE.Group();
  logo.position.set(cx, topY + 4.6, cz); logo.rotation.y = ry;
  logo.add(new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), logoMat()));
  A.scene.add(logo);
  if (!BLINK) BLINK = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), BLINK);
  bl.position.set(cx, topY + 6.9, cz); A.scene.add(bl);
  put(LIT, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 4), '#585460', cx, topY + 6.4, cz);

  // светильники под шаром: днём — белые плафоны, ночью — пятна света на плитке
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8 + ry;
    const x = cx + Math.sin(a) * (R + 0.6), z = cz + Math.cos(a) * (R + 0.6);
    put(LAMPH, new THREE.BoxGeometry(0.5, 0.3, 0.5), GLOW, x, gy + 0.45, z, 0, a, 0);
    A.LAMP_SPOTS.push([cx + Math.sin(a) * (R - 0.5), cz + Math.cos(a) * (R - 0.5)]);
  }
  A.LAMP_SPOTS.push(at(0, V1 + 2.5));

  // столики под зонтиками по бокам от входа — сбиваются, как дворовая мелочь
  for (const s of [-1, 1]) {
    const [tx, tz] = at(s * (VW / 2 + 3.4), V1 + 1.2);
    if (A.inHouse(tx, tz, 0.6) || A.onRoad(tx, tz, 1.2)) continue;
    const ty = A.groundH(tx, tz) + 0.13, g = [];
    put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), WHITE, tx, ty + 0.75, tz);
    put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), '#585460', tx, ty + 0.38, tz);
    put(g, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), '#585460', tx, ty + 1.1, tz);
    put(g, new THREE.ConeGeometry(1.4, 0.55, 8), s > 0 ? BRAND : CREAM, tx, ty + 2.35, tz);
    for (const a of [0, Math.PI]) put(g, new THREE.BoxGeometry(0.45, 0.5, 0.45), '#c8c2b8', tx + Math.cos(a + ry) * 0.9, ty + 0.25, tz - Math.sin(a + ry) * 0.9);
    A.smashAdd('table', tx, tz, 1.2, g, WHITE);
  }

  // препятствие: кольцо стен по барабану и тамбур; «дом» (под всем шаром) — для того, что ставится после
  const N = 14, foot = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2, rw = RD + 0.5;
    const x1 = cx + Math.cos(a) * rw, z1 = cz + Math.sin(a) * rw, x2 = cx + Math.cos(b) * rw, z2 = cz + Math.sin(b) * rw;
    A.obb((x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) / 2 + 0.3, 0.6, Math.atan2(z2 - z1, x2 - x1));
  }
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; foot.push([cx + Math.cos(a) * (R + 0.3), cz + Math.sin(a) * (R + 0.3)]); }
  { const [x, z] = at(0, vm + 0.15); A.obb(x, z, VW / 2 + 0.3, vd / 2 + 0.15, -ry); }
  A.addFoot(foot);
  A.addFoot([at(-VW / 2 - 0.3, V0), at(VW / 2 + 0.3, V0), at(VW / 2 + 0.3, V1 + 0.3), at(-VW / 2 - 0.3, V1 + 0.3)]);
  DOMES.push({ x: cx, z: cz, R: R + 0.3, gy, logo, ry, dist: S.dist });

  // парковка курьеров — у улицы, сбоку от шара
  const g = { mx: cx, mz: cz, road };
  const slots = opt.lots ? courierLot(A, g, opt.lots) : null;

  // подъезжать — в ближнюю к шару полосу улицы
  const ddx = cx - road.x, ddz = cz - road.z, dl = Math.hypot(ddx, ddz) || 1;
  const off = Math.min(opt.lane || 3.2, Math.max(0, dl - 4));
  const [wx, wz] = at(0, V1 + 0.8);                          // окно выдачи: отсюда вылетает коробка
  const sa = ry + Math.PI * 0.62, sx = cx + Math.sin(sa) * (R + 1.6), sz = cz + Math.cos(sa) * (R + 1.6);
  return {
    x: road.x + ddx / dl * off, z: road.z + ddz / dl * off,
    bx: cx, bz: cz, by: gy, wx, wz, wy: gy + 2.4, slots, smoke: { x: sx, z: sz },
    dome: { x: cx, z: cz, R, moved: Math.round(S.dist) },
  };
}

/* в шаре или его площади (для деревьев и ельника) */
export function blocks (x, z, m = 0) {
  for (const d of DOMES) if (Math.abs(x - d.x) < d.R + 4 + m && Math.abs(z - d.z) < d.R + 4 + m && Math.hypot(x - d.x, z - d.z) < d.R + DOME.PLAZA - 0.6 + m) return true;
  return false;
}

/* кадр: логотип крутится, огонёк мигает, ночью шар светится изнутри */
export function step (dt, A) {
  if (!DOMES.length) return;
  ST.t += dt;
  for (const d of DOMES) d.logo.rotation.y += dt * DOME.SPIN;
  const nt = A.ENV ? A.ENV.night : 0;
  if (BLINK) BLINK.color.setRGB(ST.t % 1.4 < 0.5 ? 1 : 0.25, ST.t % 1.4 < 0.5 ? 0.25 : 0.06, ST.t % 1.4 < 0.5 ? 0.2 : 0.05);
  if (Math.abs(nt - ST.night) > 0.02 && DOME_MAT) {
    ST.night = nt;
    DOME_MAT.emissiveIntensity = 0.38 * nt;
    if (GLASS) GLASS.color.copy(C_DAY).lerp(C_NIGHT, Math.min(1, nt * 1.3));
  }
}

export const DEBUG = {
  DOMES, DOME,
  get stats () { return { domes: DOMES.length, tries: ST.tries, ms: Math.round(ST.ms), moved: DOMES.map(d => Math.round(d.dist)) }; },
};
