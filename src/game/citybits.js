/* Городские объекты, которых нет в Москве, а в Северске есть: забор по
   периметру закрытого города и КПП на выездах, железная дорога с
   переездами, скатные крыши частного сектора, купола церкви, вывески ТЦ.
   Всё строится из того же, что и остальной город (склейки LITM / FLATM,
   ящики в LIT), поэтому кадр от них почти не тяжелеет. Переменных игры
   модуль не видит — всё нужное приходит в api (см. cityApi в game.js). */
import { t } from '../i18n/index.js';

/* ── надпись на табличке: холст → материал ── */
function signMat (A, lines, bg, fg, w = 256, h = 96) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const lh = (h - 16) / lines.length;
  lines.forEach((s, i) => {
    let fs = Math.floor(lh * (i === 0 ? 0.8 : 0.5));
    x.font = 'bold ' + fs + 'px sans-serif';
    while (fs > 8 && x.measureText(s).width > w - 20) { fs--; x.font = 'bold ' + fs + 'px sans-serif'; }
    x.fillText(s, w / 2, 8 + lh * (i + 0.5));
  });
  const tex = new A.THREE.CanvasTexture(c);
  tex.colorSpace = A.THREE.SRGBColorSpace;
  tex.magFilter = A.THREE.NearestFilter;
  return new A.THREE.MeshBasicMaterial({ map: tex, side: A.THREE.DoubleSide });
}

/* ── забор по периметру ──
   Бетонные плиты в рост с «колючкой» поверху, как вокруг настоящих ЗАТО.
   Кусками по три метра — так забор ложится на рельеф, а швы между плитами
   видно. Держит машину не забор, а граница карты (border), забор — вид. */
export function buildFence (A, lines) {
  const H = 2.6, STEP = 3;
  for (const pl of lines || []) {
    for (let i = 1; i < pl.length; i++) {
      const [x1, z1] = pl[i - 1], [x2, z2] = pl[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.5) continue;
      const n = Math.max(1, Math.round(L / STEP));
      for (let k = 0; k < n; k++) {
        const ax = x1 + (x2 - x1) * k / n, az = z1 + (z2 - z1) * k / n;
        const bx = x1 + (x2 - x1) * (k + 1) / n, bz = z1 + (z2 - z1) * (k + 1) / n;
        const ga = A.groundH(ax, az), gb = A.groundH(bx, bz), g = Math.min(ga, gb);
        A.LITM.color(k % 7 === 3 ? '#aca99f' : '#bdb9ae');
        A.LITM.wall(ax, az, bx, bz, g - 0.4, g + H);
        // шов между плитами и колючая проволока поверху
        A.FLATM.color('#7f7b73');
        A.FLATM.quad(ax, g, az, ax, g, az, ax, g + H, az, ax + (bx - ax) * 0.02, g + H, az + (bz - az) * 0.02, 0, 0, 1);
        A.FLATM.color('#3b3a3f');
        A.FLATM.quad(ax, g + H + 0.15, az, bx, g + H + 0.15, bz, bx, g + H + 0.35, bz, ax, g + H + 0.35, az, 0, 0, 1);
      }
    }
  }
}

/* ── КПП ──
   Будка с окнами на дорогу, козырёк, табличка «КПП», шлагбаум поперёк
   полотна (закрыт — дальше пропускной режим), бетонные блоки, прожектор и
   охранник у будки. Проезд закрыт препятствием: из закрытого города без
   пропуска не выехать. */
let KPP_SIGN = null;
export function buildKpp (A, k) {
  const THREE = A.THREE;
  const [x, z] = k.p;
  const ux = k.ux || 1, uz = k.uz || 0, nx = -uz, nz = ux;      // u — вдоль дороги, n — поперёк
  const ry = Math.atan2(ux, uz), y = A.groundH(x, z);
  const r = A.nearestRoad(x, z, 7, 1);
  const w = Math.max(8, (r ? r.seg.w : 8) + 2);
  // будка на обочине справа
  const bx = x + nx * (w / 2 + 2.4), bz = z + nz * (w / 2 + 2.4), by = A.groundH(bx, bz);
  A.box(A.LIT, 3.2, 2.7, 3.2, '#e6e1d5', bx, by + 1.35, bz, ry);
  A.box(A.LIT, 4.2, 0.25, 4.2, '#5b6470', bx, by + 2.85, bz, ry);                 // плоская крыша с выносом
  A.box(A.LIT, 3.3, 0.35, 3.3, '#3f7a4a', bx, by + 0.18, bz, ry);                 // цоколь
  // окна на дорогу и в обе стороны вдоль неё
  for (const [ox, oz] of [[-nx, -nz], [ux, uz], [-ux, -uz]])
    A.put(A.FLAT, new THREE.PlaneGeometry(2.2, 1.1), '#8fb0cc', bx + ox * 1.62, by + 1.7, bz + oz * 1.62, 0, Math.atan2(ox, oz), 0);
  // табличка «КПП» над будкой
  if (!KPP_SIGN) KPP_SIGN = signMat(A, [t('КПП'), t('проезд по пропускам')], '#f4f1ea', '#1f4f9a');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), KPP_SIGN);
  sign.position.set(bx - nx * 1.7, by + 3.7, bz - nz * 1.7);
  sign.rotation.y = Math.atan2(-nx, -nz);
  A.scene.add(sign);
  A.box(A.LIT, 0.14, 1.2, 0.14, '#585460', bx - nx * 1.7, by + 3.1, bz - nz * 1.7);
  // шлагбаум: столбик у будки, стрела поперёк всего полотна, красно-белая
  const px = x + nx * (w / 2 + 0.6), pz = z + nz * (w / 2 + 0.6), py = A.groundH(px, pz);
  A.box(A.LIT, 0.4, 1.3, 0.4, '#d8d3c8', px, py + 0.65, pz);
  const seg = Math.ceil(w / 1.2);
  for (let i = 0; i < seg; i++) {
    const o = w / 2 + 0.6 - (i + 0.5) * w / seg;
    A.box(A.LIT, 0.16, 0.16, w / seg, i % 2 ? '#f2eee6' : '#d9342c', x + nx * o, py + 1.1, z + nz * o, Math.atan2(nx, nz));
  }
  // бетонные блоки за шлагбаумом и препятствие поперёк проезда
  for (let o = -w / 2 + 1.2; o < w / 2; o += 2.6)
    A.box(A.LIT, 2.2, 0.8, 0.9, '#bdb6ab', x + nx * o + ux * 3.5, y + 0.4, z + nz * o + uz * 3.5, Math.atan2(nx, nz));
  A.obb(x + ux * 1.5, z + uz * 1.5, w / 2 + 0.8, 2.4, Math.atan2(nz, nx));
  // прожектор на мачте
  A.box(A.LIT, 0.2, 6, 0.2, '#585460', bx + ux * 2.5, by + 3, bz + uz * 2.5);
  A.put(A.LAMPH, new THREE.BoxGeometry(0.8, 0.3, 0.5), '#fff3c4', bx + ux * 2.5 - nx * 0.4, by + 6, bz + uz * 2.5 - nz * 0.4, 0, ry, 0);
  A.LAMP_SPOTS.push([x, z]);
  // охранник у будки — в зелёной форме и кепке, смотрит на дорогу
  const g = A.makeHuman(null, { shirt: '#4f6a3a', pants: '#3b4a2e', cap: '#3b4a2e' });
  g.position.set(bx - nx * 2.2 + ux * 1.4, by, bz - nz * 2.2 + uz * 1.4);
  g.rotation.y = Math.atan2(-nx, -nz);
  A.scene.add(g);
  return { x, z, guard: g };
}

/* ── железная дорога ──
   Щебёночная насыпь, шпалы и два рельса. Шпалы — плоские полосы в общей
   склейке (их тысячи), рельсы чуть выше полотна дороги, поэтому видны на
   переездах. Тупики и подъездные пути в промзону — те же линии поуже. */
export function buildRails (A, rails, levelx) {
  let km = 0;
  for (const r of rails || []) {
    const narrow = r.k === 'tram';
    const bw = narrow ? 2.6 : 3.6, gauge = narrow ? 1.524 * 0.95 : 1.524;
    const p = r.p;
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.2) continue;
      km += L / 1000;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
      if (!narrow) { A.LITM.color('#9d9386'); A.LITM.ribbon(x1, z1, x2, z2, bw, 0.11); A.LITM.disc(x2, z2, bw / 2, 0.11, 6); }
      // шпалы через 0.9 м
      A.FLATM.color(narrow ? '#6b6258' : '#5e4a3a');
      for (let d = (0.9 - acc % 0.9) % 0.9; d < L; d += 0.9) {
        const cx = x1 + ux * d, cz = z1 + uz * d;
        A.FLATM.ribbon(cx - nx * 1.3, cz - nz * 1.3, cx + nx * 1.3, cz + nz * 1.3, 0.24, 0.17);
      }
      acc += L;
      // рельсы
      A.LITM.color('#77737a');
      for (const s of [-1, 1]) {
        const o = s * gauge / 2;
        A.LITM.ribbon(x1 + nx * o, z1 + nz * o, x2 + nx * o, z2 + nz * o, 0.09, 0.24);
      }
    }
  }
  // переезды: столбы со шлагбаумами (подняты), «Андреевский крест» и лампы
  for (const q of levelx || []) {
    const [x, z] = q;
    const r = A.nearestRoad(x, z, 7, 1);
    if (!r) continue;
    const s = r.seg, L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
    const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L, nx = -uz, nz = ux, w = s.w;
    for (const sd of [-1, 1]) {
      const bx = x + ux * 6 * sd + nx * (w / 2 + 1) * sd, bz = z + uz * 6 * sd + nz * (w / 2 + 1) * sd, by = A.groundH(bx, bz);
      A.box(A.LIT, 0.22, 2.4, 0.22, '#f2eee6', bx, by + 1.2, bz);
      // крест «Внимание, поезд» — две белые с красным доски
      for (const a of [0.7, -0.7]) A.put(A.LIT, new A.THREE.BoxGeometry(1.4, 0.22, 0.05), '#f2eee6', bx, by + 2.6, bz, 0, Math.atan2(ux, uz) + Math.PI / 2, a);
      A.box(A.LIT, 0.5, 0.25, 0.25, '#d9342c', bx, by + 2.0, bz);
      // стрела шлагбаума поднята вертикально, в полоску
      for (let i = 0; i < 4; i++) A.box(A.LIT, 0.14, 0.9, 0.14, i % 2 ? '#f2eee6' : '#d9342c', bx - nx * 0.3 * sd, by + 1.4 + i * 0.9, bz - nz * 0.3 * sd);
    }
  }
  return km;
}

/* ── двускатная крыша ──
   Для частного сектора и сталинок с крышей: конёк вдоль длинной стороны
   описанного прямоугольника, скаты и фронтоны. Контур не прямоугольник —
   вместо двускатной шатровая (её строит сам фасад). */
export function gableRoof (A, p, h, wallHex, roofHex, hipped) {
  if (p.length < 4 || p.length > 6) return false;
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, area2 = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    area2 += q[0] * r[1] - r[0] * q[1];
    const a = q[0] * ux + q[1] * uz, b = q[0] * nx + q[1] * nz;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const fill = Math.abs(area2) / 2 / ((a1 - a0) * (b1 - b0) || 1);
  if (fill < 0.82) return false;                     // не прямоугольник — пусть будет шатёр
  const ov = 0.45;                                   // вынос кровли за стену
  a0 -= ov; a1 += ov; b0 -= ov; b1 += ov;
  const W = b1 - b0, rise = Math.min(4.5, W * (hipped ? 0.3 : 0.42)), bm = (b0 + b1) / 2;
  const P = (a, b) => [a * ux + b * nx, a * uz + b * nz];
  const hip = hipped ? Math.min(W * 0.5, (a1 - a0) * 0.3) : 0;
  const [p00x, p00z] = P(a0, b0), [p10x, p10z] = P(a1, b0), [p11x, p11z] = P(a1, b1), [p01x, p01z] = P(a0, b1);
  const [r0x, r0z] = P(a0 + hip, bm), [r1x, r1z] = P(a1 - hip, bm);
  const y0 = h - 0.15, yt = h + rise;
  A.LITM.color(roofHex);
  A.LITM.quad(p00x, y0, p00z, p10x, y0, p10z, r1x, yt, r1z, r0x, yt, r0z, -nx, 0.9, -nz);
  A.LITM.quad(p11x, y0, p11z, p01x, y0, p01z, r0x, yt, r0z, r1x, yt, r1z, nx, 0.9, nz);
  if (hipped) {
    A.LITM.tri(p01x, y0, p01z, p00x, y0, p00z, r0x, yt, r0z, -ux, 0.9, -uz);
    A.LITM.tri(p10x, y0, p10z, p11x, y0, p11z, r1x, yt, r1z, ux, 0.9, uz);
  } else {
    A.LITM.color(wallHex);                           // фронтоны — цвета стен
    A.LITM.tri(p01x, y0, p01z, p00x, y0, p00z, r0x, yt, r0z, -ux, 0, -uz);
    A.LITM.tri(p10x, y0, p10z, p11x, y0, p11z, r1x, yt, r1z, ux, 0, uz);
  }
  return true;
}

/* ── церковь ──
   Над храмом — барабан с луковичной главой и крестом, на вытянутом храме —
   ещё колокольня с шатром на дальнем от улицы торце. Главы золотые или
   синие со звёздами — по хешу, одна и та же от запуска к запуску. */
export function churchTop (A, p, h, cx, cz, area, seed) {
  const THREE = A.THREE;
  const R = Math.max(1.6, Math.min(4.2, Math.sqrt(area) * 0.16));
  const dome = seed % 3 === 0 ? '#3f5fb0' : '#e2b53e';
  A.put(A.LIT, new THREE.CylinderGeometry(R, R, R * 1.6, 12), '#f3eee3', cx, h + R * 0.8, cz);
  for (let i = 0; i < 8; i++) {                                      // окна барабана
    const a = i / 8 * Math.PI * 2;
    A.put(A.FLAT, new THREE.PlaneGeometry(R * 0.35, R * 0.7), '#6f8fb0', cx + Math.cos(a) * (R + 0.02), h + R * 0.85, cz + Math.sin(a) * (R + 0.02), 0, -a + Math.PI / 2, 0);
  }
  // луковица: сфера, вытянутая вверх, и шпиль
  const onion = new THREE.SphereGeometry(R * 1.12, 12, 8);
  onion.scale(1, 1.25, 1);
  A.put(A.LIT, onion, dome, cx, h + R * 1.6 + R * 1.1, cz);
  A.put(A.LIT, new THREE.ConeGeometry(R * 0.45, R * 1.4, 10), dome, cx, h + R * 1.6 + R * 2.6, cz);
  // крест
  const ty = h + R * 1.6 + R * 3.5;
  A.box(A.LIT, 0.14, 2.2, 0.14, '#e2b53e', cx, ty, cz);
  A.box(A.LIT, 1.1, 0.12, 0.12, '#e2b53e', cx, ty + 0.4, cz);
  A.box(A.LIT, 0.7, 0.1, 0.1, '#e2b53e', cx, ty - 0.35, cz, 0.35);
  // колокольня — если храм вытянутый
  let far = null, fd = 0;
  for (const q of p) { const d = Math.hypot(q[0] - cx, q[1] - cz); if (d > fd) { fd = d; far = q; } }
  if (far && fd > R * 3) {
    const bx = cx + (far[0] - cx) * 0.72, bz = cz + (far[1] - cz) * 0.72, s = R * 0.72;
    A.box(A.LIT, s * 2, s * 3, s * 2, '#f3eee3', bx, h + s * 1.5, bz);
    A.put(A.LIT, new THREE.ConeGeometry(s * 1.2, s * 3.2, 8), '#5f7f5a', bx, h + s * 3 + s * 1.6, bz);
    A.box(A.LIT, 0.12, 1.6, 0.12, '#e2b53e', bx, h + s * 6.4, bz);
    A.box(A.LIT, 0.8, 0.1, 0.1, '#e2b53e', bx, h + s * 6.6, bz);
  }
}

/* ── торговый центр ──
   Вывеска с названием над входом, во всю длину самой широкой стены
   к улице, в цветах из подсказок генератора карты (malls[].style). */
export function mallSign (A, wall, h, name, style) {
  const THREE = A.THREE;
  const st = style || {};
  const mat = signMat(A, [name], st.sign || '#1f4f9a', st.text || '#ffffff', 512, 96);
  const W = Math.min(wall.len * 0.7, 26);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W * 96 / 512), mat);
  m.position.set(wall.mx + wall.ox * 0.2, h - W * 96 / 512 / 2 - 0.4, wall.mz + wall.oz * 0.2);
  m.rotation.y = Math.atan2(wall.ox, wall.oz);
  A.scene.add(m);
}
