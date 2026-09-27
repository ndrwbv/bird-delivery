/* Приметные места города: заправки (из карты, amenity=fuel) и каток
   (хоккейная коробка из карты, если карта его назвала — MAP.landmarks.rink).
   Строятся из того же, что и город: ящики в склейку LIT, свет в LAMPH,
   пятна света в LAMP_SPOTS, стойки — obb. Переменных игры модуль не
   видит — всё приходит в api (landApi в game.js). */
import { t } from '../i18n/index.js';

/* ── заправки ──
   Название и цвета — те же, что на вывеске точки (brands.js переписал
   их созвучными: «Газпромнефтик», «Лукоед»); без сети — просто «АЗС». */

/* надпись на табличке: холст → материал */
function signMat (A, lines, bg, fg, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const lh = h / lines.length;
  lines.forEach((s, i) => {
    let fs = Math.floor(lh * (i === 0 ? 0.62 : 0.5));
    x.font = 'bold ' + fs + 'px sans-serif';
    while (fs > 8 && x.measureText(s).width > w - 16) { fs--; x.font = 'bold ' + fs + 'px sans-serif'; }
    if (i > 0) { x.fillStyle = '#1b2230'; x.fillRect(10, lh * i + 6, w - 20, lh - 12); }
    x.fillStyle = i === 0 ? fg : '#ffcf3a';
    x.fillText(s, w / 2, lh * (i + 0.5));
  });
  const tex = new A.THREE.CanvasTexture(c);
  tex.colorSpace = A.THREE.SRGBColorSpace;
  tex.magFilter = A.THREE.NearestFilter;
  return new A.THREE.MeshBasicMaterial({ map: tex });
}

/* точка в местной системе станции: u — вдоль дороги, n — от дороги */
const at = (F, u, n) => [F.x + F.ux * u + F.nx * n, F.z + F.uz * u + F.nz * n];

/* свободно ли место под площадку: ни дома, ни чужого полотна */
function padFree (A, F, u0, u1, n0, n1) {
  for (let u = u0; u <= u1; u += 2.5)
    for (let n = n0; n <= n1; n += 2.5) {
      const [x, z] = at(F, u, n);
      if (A.inHouse(x, z, 0.5)) return false;
      const r = A.nearestRoad(x, z, 7, 1);
      if (r && r.d < r.seg.w / 2 + 0.4) return false;
    }
  return true;
}

export const FUEL_LOG = [];                        // для отладки: какие АЗС встали и где
function fuelStation (A, poi) {
  const [px, pz] = poi.p;
  const road = A.nearestRoad(px, pz, 5, 3);
  if (!road || road.d > 95 || road.seg.b) { FUEL_LOG.push([poi.n, 'нет дороги', road && Math.round(road.d)]); return false; }
  const s = road.seg, sl = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
  let ux = (s.x2 - s.x1) / sl, uz = (s.z2 - s.z1) / sl;
  let nx = -uz, nz = ux;
  if ((px - road.x) * nx + (pz - road.z) * nz < 0) { nx = -nx; nz = -nz; }
  const n0 = s.w / 2 + (s.g || 0) + 1.2;        // от бордюра (у бульвара — за газоном)
  // сдвигаем вдоль дороги, пока площадка не встанет свободно
  let F = null;
  for (const du of [0, 8, -8, 16, -16, 24, -24]) {
    const c = { x: road.x + ux * du, z: road.z + uz * du, ux, uz, nx, nz };
    if (padFree(A, c, -12, 12, n0, n0 + 19)) { F = c; break; }
  }
  // тесно (своё здание АЗС вплотную к улице) — навес поменьше, без магазинчика
  let small = false;
  if (!F) for (const du of [0, 6, -6, 12, -12, 18, -18]) {
    const c = { x: road.x + ux * du, z: road.z + uz * du, ux, uz, nx, nz };
    if (padFree(A, c, -9, 9, n0, n0 + 13)) { F = c; small = true; break; }
  }
  if (!F) { FUEL_LOG.push([poi.n, 'нет места']); return false; }
  FUEL_LOG.push([poi.n, 'ok', Math.round(F.x), Math.round(F.z)]);
  const brand = poi.n || t('АЗС');
  const [bg, fg] = poi.c || ['#2f9e5b', '#ffffff'];
  const ry = Math.atan2(-uz, ux);                  // местная x — вдоль дороги
  const gy = A.groundH(F.x + nx * (n0 + 9), F.z + nz * (n0 + 9));
  const { box, put, THREE } = A;
  // площадка: бетон, въезд и выезд — прямо с улицы
  const PU = small ? 10 : 13, PD = small ? 14 : 20;
  const pad = [at(F, -PU, n0 - 0.4), at(F, PU, n0 - 0.4), at(F, PU, n0 + PD), at(F, -PU, n0 + PD)];
  A.LITM.color('#c9c6bf');
  A.LITM.poly(pad, 0.1);
  A.LITM.color('#e8e4da');
  for (const u of [-PU, PU]) { const [a1, a2] = at(F, u, n0), [b1, b2] = at(F, u, n0 + PD); A.LITM.ribbon(a1, a2, b1, b2, 0.4, 0.12); }
  // навес на четырёх стойках, полоса бренда по краю, свет снизу
  const cn = n0 + (small ? 7 : 9.5);
  for (const [u, n] of [[-6.5, cn - 3.4], [6.5, cn - 3.4], [-6.5, cn + 3.4], [6.5, cn + 3.4]]) {
    const [x, z] = at(F, u, n);
    box(A.LIT, 0.55, 5.2, 0.55, '#e9e9e6', x, gy + 2.6, z, ry);
    A.obb(x, z, 0.35, 0.35, ry);
  }
  const [cx, cz] = at(F, 0, cn);
  box(A.LIT, 16, 0.8, 10, '#f5f5f2', cx, gy + 5.6, cz, ry);
  box(A.LIT, 16.2, 0.38, 10.2, bg, cx, gy + 5.45, cz, ry);
  for (const dn of [-2.2, 2.2]) {
    const [lx, lz] = at(F, 0, cn + dn);
    put(A.LAMPH, new THREE.BoxGeometry(13, 0.06, 0.45), '#fff7de', lx, gy + 5.17, lz, 0, ry, 0);
    A.LAMP_SPOTS.push([lx, lz]);
  }
  // бренд на торце навеса — со стороны дороги
  const face = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), signMat(A, [brand], bg, fg, 512, 80));
  const [fx, fz] = at(F, 0, cn - 5.12);
  face.position.set(fx, gy + 5.6, fz);
  face.rotation.y = Math.atan2(-nx, -nz);
  A.scene.add(face);
  // две колонки на островках
  for (const u of [-3.2, 3.2]) {
    const [ix, iz] = at(F, u, cn);
    box(A.LIT, 1.1, 0.25, 5.2, '#8f8c85', ix, gy + 0.2, iz, ry);
    box(A.LIT, 0.9, 1.9, 0.6, bg, ix, gy + 1.2, iz, ry);
    box(A.LIT, 0.95, 0.35, 0.65, '#f5f5f2', ix, gy + 2.2, iz, ry);
    for (const dn of [-0.33, 0.33]) {
      const [dx, dz] = at(F, u, cn + dn);
      put(A.LAMPH, new THREE.BoxGeometry(0.6, 0.35, 0.02), '#bfe9ff', dx, gy + 1.65, dz, 0, ry, 0);
    }
    A.obb(ix, iz, 0.55, 2.6, ry);
  }
  // магазинчик за навесом, если в карте нет своего здания
  if (!small && !poi.w && padFree(A, F, -6, 6, n0 + 15, n0 + 20)) {
    const [kx, kz] = at(F, 0, n0 + 17.5);
    box(A.LIT, 11, 3.6, 5, '#efece6', kx, gy + 1.8, kz, ry);
    box(A.LIT, 11.2, 0.5, 5.2, bg, kx, gy + 3.6, kz, ry);
    const [wx, wz] = at(F, 0, n0 + 14.98);
    put(A.LAMPH, new THREE.BoxGeometry(7, 2, 0.05), '#ffe6a8', wx, gy + 1.5, wz, 0, ry, 0);
    A.obb(kx, kz, 5.5, 2.5, ry);
  }
  // стела с ценами у въезда
  const [sx, sz] = at(F, small ? 9.3 : 11.5, n0 + 1);
  box(A.LIT, 0.35, 6.5, 0.35, '#4a4d55', sx, gy + 3.25, sz, ry);
  const mat = signMat(A, [brand, 'АИ-92  54.90', 'АИ-95  59.40', 'ДТ  68.10'], bg, fg, 256, 320);
  const stele = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.3), [mat, mat, mat, mat, mat, mat]);
  stele.position.set(sx, gy + 5, sz);
  stele.rotation.y = ry + Math.PI / 2;             // лицом вдоль дороги — видно на подъезде
  A.scene.add(stele);
  A.obb(sx, sz, 0.3, 0.3, ry);
  return true;
}

export function buildFuel (A, pois) {
  let n = 0;
  for (const p of pois || []) if (p.k === 'fuel' && fuelStation(A, p)) n++;
  return n;
}

/* ── каток ──
   Лёд с разметкой, борта с синей кромкой, ворота, мачты со светом и
   катающиеся по кругу люди. Коробка — многоугольник площадки из карты. */
export function buildRink (A, green, spot) {
  const [qx, qz] = spot;
  let best = null, bd = 60;
  for (const g of green) {
    if (g.k !== 'pitch') continue;
    let cx = 0, cz = 0;
    for (const q of g.p) { cx += q[0] / g.p.length; cz += q[1] / g.p.length; }
    const d = Math.hypot(cx - qx, cz - qz);
    if (d < bd) { bd = d; best = { g, cx, cz }; }
  }
  if (!best) return null;
  const P = best.g.p, cx = best.cx, cz = best.cz;
  // длинная ось — по самой длинной стороне
  let li = 0, ll = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > ll) { ll = l; li = i; }
  }
  const a0 = P[li], b0 = P[(li + 1) % P.length];
  const ux = (b0[0] - a0[0]) / ll, uz = (b0[1] - a0[1]) / ll, nx = -uz, nz = ux;
  let hu = 0, hn = 0;
  for (const q of P) {
    hu = Math.max(hu, Math.abs((q[0] - cx) * ux + (q[1] - cz) * uz));
    hn = Math.max(hn, Math.abs((q[0] - cx) * nx + (q[1] - cz) * nz));
  }
  const ry = Math.atan2(-uz, ux);
  const gy = A.groundH(cx, cz);
  const { box, put, THREE } = A;
  const pt = (u, n) => [cx + ux * u + nx * n, cz + uz * u + nz * n];
  // лёд: светлый, с голубизной; разметка — красная посередине, синие линии зон
  A.LITM.color('#e6f4fb');
  A.LITM.poly([pt(-hu, -hn), pt(hu, -hn), pt(hu, hn), pt(-hu, hn)], 0.14);
  A.FLATM.color('#d8363a');
  { const [x1, z1] = pt(0, -hn + 0.3), [x2, z2] = pt(0, hn - 0.3); A.FLATM.ribbon(x1, z1, x2, z2, 0.35, 0.17); }
  A.FLATM.color('#2f63c8');
  for (const u of [-hu * 0.36, hu * 0.36]) { const [x1, z1] = pt(u, -hn + 0.3), [x2, z2] = pt(u, hn - 0.3); A.FLATM.ribbon(x1, z1, x2, z2, 0.3, 0.17); }
  A.FLATM.color('#d8363a');
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2, r = Math.min(hn * 0.35, 4);
    A.FLATM.ribbon(cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r, 0.18, 0.17);
  }
  // борта: белые щиты с синей кромкой, по периметру
  const side = (u1, n1, u2, n2) => {
    const L = Math.hypot(u2 - u1, n2 - n1), k = Math.max(1, Math.round(L / 3));
    for (let i = 0; i < k; i++) {
      const [x, z] = pt(u1 + (u2 - u1) * (i + 0.5) / k, n1 + (n2 - n1) * (i + 0.5) / k);
      const r2 = Math.abs(u2 - u1) > Math.abs(n2 - n1) ? ry : ry + Math.PI / 2;
      const y = A.groundH(x, z);
      box(A.LIT, L / k + 0.05, 1.1, 0.2, '#f7f7f5', x, y + 0.6, z, r2);
      box(A.LIT, L / k + 0.05, 0.14, 0.3, '#2f63c8', x, y + 1.2, z, r2);
      A.obb(x, z, L / k / 2, 0.2, r2);
    }
  };
  side(-hu, -hn, hu, -hn); side(-hu, hn, hu, hn); side(-hu, -hn, -hu, hn); side(hu, -hn, hu, hn);
  // хоккейные ворота у торцов
  for (const s of [-1, 1]) {
    const [x, z] = pt(s * (hu - 2.2), 0);
    box(A.LIT, 0.12, 1.2, 1.8, '#d8363a', x, gy + 0.75, z, ry);
    box(A.LIT, 0.9, 0.1, 1.8, '#d8363a', x + ux * s * 0.45, gy + 1.35, z + uz * s * 0.45, ry);
  }
  // мачты со светом по углам
  for (const [u, n] of [[-hu - 1, -hn - 1], [hu + 1, -hn - 1], [-hu - 1, hn + 1], [hu + 1, hn + 1]]) {
    const [x, z] = pt(u, n), y = A.groundH(x, z);
    box(A.LIT, 0.3, 9, 0.3, '#585460', x, y + 4.5, z, ry);
    const [lx, lz] = pt(u * 0.9, n * 0.9);
    put(A.LAMPH, new THREE.BoxGeometry(1.2, 0.3, 0.6), '#f4fbff', lx, y + 8.8, lz, 0, ry, 0);
    A.LAMP_SPOTS.push(pt(u * 0.6, n * 0.6));
  }
  // катающиеся: по эллипсу, с наклоном в поворот
  const skaters = [];
  const k = Math.max(4, Math.min(10, Math.round(hu * hn / 40)));
  for (let i = 0; i < k; i++) {
    const g = A.makeHuman(A.makePerson());
    A.scene.add(g);
    skaters.push({ g, a: i / k * Math.PI * 2 + Math.random() * 0.4, ru: hu * (0.55 + Math.random() * 0.25), rn: hn * (0.45 + Math.random() * 0.25), w: (0.25 + Math.random() * 0.15) * (i % 4 === 3 ? -1 : 1), ph: Math.random() * 6 });
  }
  return { cx, cz, ux, uz, nx, nz, gy, skaters };
}

export function stepRink (R, dt, px, pz) {
  if (!R || (R.cx - px) ** 2 + (R.cz - pz) ** 2 > 260 * 260) return;
  for (const s of R.skaters) {
    s.a += s.w * dt; s.ph += dt * 3;
    const cu = Math.cos(s.a) * s.ru, cn = Math.sin(s.a) * s.rn;
    const x = R.cx + R.ux * cu + R.nx * cn, z = R.cz + R.uz * cu + R.nz * cn;
    // касательная: производная по углу, в сторону движения
    const tu = -Math.sin(s.a) * s.ru * Math.sign(s.w), tn = Math.cos(s.a) * s.rn * Math.sign(s.w);
    const tx = R.ux * tu + R.nx * tn, tz = R.uz * tu + R.nz * tn;
    s.g.position.set(x, R.gy + 0.16, z);
    s.g.rotation.y = Math.atan2(tx, tz);
    s.g.rotation.z = -0.12 * Math.sign(s.w);        // наклон в поворот
    const u = s.g.userData, sw = Math.sin(s.ph) * 0.45;
    if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; }
    if (u.armL) { u.armL.rotation.x = -sw * 0.6; u.armR.rotation.x = sw * 0.6; }
  }
}
