/* Пиццерия — ламповая: полосатая маркиза с гирляндой тёплых лампочек,
   витрина светится изнутри жёлтым и отсветом печи, у входа столики под
   зонтиками, кашпо с цветами, меловая доска «пицца дня» и лавочка. Рядом
   — парковка курьеров: размеченные места вдоль улицы, низкий заборчик в
   фирменном цвете, табличка и фонарь. Все курьеры (и ты) ждут заказ там.
   С 03.10.2026 пиццерия — отдельный шар (pizzadome.js); ламповый фасад в доме
   (cozyFront) — запасной вариант, если места под шар не нашлось. Парковка — у обоих.
   Переменных игры модуль не видит — всё приходит в api (pizzaApi в game.js). */
import { t } from '../i18n/index.js';
import * as SL from './streetlamps.js';
import { onPave } from './pave.js';

const BRAND = '#f0522a', CREAM = '#fff3d6';

function chalkMat (A) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#2b3a2f'; x.fillRect(0, 0, 96, 128);
  x.strokeStyle = '#8a6b4e'; x.lineWidth = 8; x.strokeRect(0, 0, 96, 128);
  x.fillStyle = '#f4f1ea'; x.textAlign = 'center';
  x.font = 'bold 13px sans-serif'; x.fillText(t('пицца дня'), 48, 30);
  x.font = '11px sans-serif'; x.fillText(t('с грибами'), 48, 52); x.fillText(t('и душой'), 48, 68);
  x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(48, 80); x.lineTo(70, 116); x.lineTo(26, 116); x.closePath(); x.fill();
  x.fillStyle = '#e04836'; for (const [a, b] of [[48, 96], [40, 108], [56, 108]]) { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill(); }
  const tex = new A.THREE.CanvasTexture(c);
  tex.colorSpace = A.THREE.SRGBColorSpace; tex.magFilter = A.THREE.NearestFilter;
  return new A.THREE.MeshBasicMaterial({ map: tex, side: A.THREE.DoubleSide });
}

function lotSignMat (A) {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#1f4f9a'; x.fillRect(0, 0, 192, 96);
  x.fillStyle = '#fff'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('P', 36, 50);
  x.font = 'bold 15px sans-serif'; x.textAlign = 'left';
  x.fillText(t('парковка'), 70, 36); x.fillText(t('курьеров'), 70, 58);
  const tex = new A.THREE.CanvasTexture(c);
  tex.colorSpace = A.THREE.SRGBColorSpace; tex.magFilter = A.THREE.NearestFilter;
  return new A.THREE.MeshBasicMaterial({ map: tex, side: A.THREE.DoubleSide });
}

/* f — фасад пиццерии (dodoFacade): середина стены mx/mz, наружу ox/oz,
   вдоль ux/uz, длина len, улица road. w — ширина вывески и витрины */
export function cozyFront (A, f, gy, w) {
  const THREE = A.THREE;
  const at = (along, out) => [f.mx + f.ux * along + f.ox * out, f.mz + f.uz * along + f.oz * out];
  const ry = Math.atan2(f.ox, f.oz), ryA = Math.atan2(f.ux, f.uz);
  // маркиза в полоску вместо сплошного козырька, с фестонами по краю
  const n = Math.max(6, Math.round(w / 1.2));
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + (i + 0.5) * w / n;
    const [x, z] = at(a, 1.5);
    A.box(A.LIT, w / n + 0.02, 0.35, 3, i % 2 ? CREAM : BRAND, x, gy + 3.7, z, ry);
    const [x2, z2] = at(a, 3.0);
    A.box(A.LIT, w / n * 0.8, 0.35, 0.08, i % 2 ? CREAM : BRAND, x2, gy + 3.35, z2, ry);
  }
  // гирлянда: тёплые лампочки по краю маркизы, ночью горят (LAMPH)
  for (let i = 0; i <= w * 1.6; i++) {
    const a = -w / 2 + i / 1.6, sag = Math.sin((i % 8) / 8 * Math.PI) * 0.18;
    const [x, z] = at(a, 3.08);
    A.put(A.LAMPH, new THREE.BoxGeometry(0.14, 0.14, 0.14), i % 3 ? '#ffe3a0' : '#ffb84d', x, gy + 3.15 - sag, z, 0, 0, 0);
  }
  // тёплая витрина: жёлтый свет, отсвет печи и силуэт стойки с коробками
  const [vx, vz] = at(-1.5, 0.13);
  A.put(A.FLAT, new THREE.PlaneGeometry(w - 5, 2.6), '#ffd9a0', vx, gy + 1.9, vz, 0, ry, 0);
  const [ox, oz] = at(-w / 2 + 3.2, 0.15);
  A.put(A.FLAT, new THREE.PlaneGeometry(1.8, 1.2), '#ff8a2b', ox, gy + 1.4, oz, 0, ry, 0);
  const [cx, cz] = at(-1.5, 0.16);
  A.put(A.FLAT, new THREE.PlaneGeometry(w - 7, 0.9), '#8a5a3a', cx, gy + 1.0, cz, 0, ry, 0);
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = at(-1.5 + (w - 9) / 2 - i * 0.7, 0.17);
    A.put(A.FLAT, new THREE.PlaneGeometry(0.6, 0.12), BRAND, bx, gy + 1.52 + i * 0.13, bz, 0, ry, 0);
  }
  A.LAMP_SPOTS.push(at(0, 3.5));
  // уличные столики под зонтиками и стулья — сбиваются, как дворовая мелочь
  for (const s of [-1, 1]) {
    const [tx, tz] = at(-w / 2 + 3 + (s > 0 ? 5 : 0), 4.6);
    if (A.inHouse(tx, tz, 0.6) || A.onRoad(tx, tz, 1.2)) continue;
    const ty = A.groundH(tx, tz), g = [];
    A.put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 10), '#f4f1ea', tx, ty + 0.75, tz);
    A.put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), '#585460', tx, ty + 0.38, tz);
    A.put(g, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), '#585460', tx, ty + 1.1, tz);
    A.put(g, new THREE.ConeGeometry(1.4, 0.55, 8), s > 0 ? BRAND : CREAM, tx, ty + 2.35, tz);
    for (const a of [0, Math.PI]) A.put(g, new THREE.BoxGeometry(0.45, 0.5, 0.45), '#8a6b4e', tx + Math.cos(a + ryA) * 0.9, ty + 0.25, tz + Math.sin(a + ryA) * 0.9);
    A.smashAdd('table', tx, tz, 1.2, g, '#f4f1ea');
  }
  // кашпо с цветами по краям входа
  for (const s of [-1, 1]) {
    const [px, pz] = at(s * (w / 2 - 0.8), 1.0);
    if (A.inHouse(px, pz, 0.3)) continue;
    const py = A.groundH(px, pz), g = [];
    A.put(g, new THREE.BoxGeometry(1.2, 0.6, 0.6), '#8a6b4e', px, py + 0.3, pz, 0, ry, 0);
    for (let k = 0; k < 5; k++) A.put(g, new THREE.IcosahedronGeometry(0.18, 0), ['#ff5d7a', '#ffd23f', '#e8f0ff', '#ff8ad0', '#6fb05a'][k], px + (k - 2) * 0.22 * Math.cos(ry), py + 0.72, pz - (k - 2) * 0.22 * Math.sin(ry));
    A.smashAdd('bush', px, pz, 0.8, g, '#8a6b4e');
  }
  // меловая доска «пицца дня» у двери
  const [dx, dz] = at(w / 2 - 3.6, 1.2), dy = A.groundH(dx, dz);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), chalkMat(A));
  board.position.set(dx, dy + 0.6, dz); board.rotation.set(-0.18, ry, 0);
  A.scene.add(board);
}

/* Парковка курьеров: ряд мест поперёк тротуара у улицы, сбоку от
   пиццерии. Места — носом к дому, выезд прямо на проезжую часть.
   Возвращает места [{ x, z, h }], h — куда смотрит машина на месте
   (к улице: так и выезжают). */
/* Где встанет парковка: точка на улице (base) и оси. block(x, z) — ещё
   занято (пиццерия-шар, которую только собираются поставить: pizzadome.js) */
export function lotBase (A, f, count, block) {
  const r = f.road, s = r.seg;
  const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
  const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L;
  // «наружу от дороги» — в сторону пиццерии
  let nx = -uz, nz = ux;
  if ((f.mx - r.x) * nx + (f.mz - r.z) * nz < 0) { nx = -nx; nz = -nz; }
  const SW = 3.1, D = 5.6, W = count * SW, off = s.w / 2 + 0.4;
  const ok = (cx, cz) => {
    for (const [a, b] of [[-W / 2, 0], [W / 2, 0], [-W / 2, D], [W / 2, D], [0, D / 2], [-W / 4, D], [W / 4, D]]) {
      const x = cx + ux * a + nx * (off + b), z = cz + uz * a + nz * (off + b);
      if (A.inHouse(x, z, 0.6) || A.onOtherRoad(x, z, s) || (block && block(x, z))) return false;
    }
    return true;
  };
  for (const d of [14, -14, 22, -22, 30, -30, 8, -8, 40, -40, 0]) {
    const cx = r.x + ux * d, cz = r.z + uz * d;
    if (ok(cx, cz)) return { base: [cx, cz], ux, uz, nx, nz, SW, D, W, off };
  }
  return null;
}

export function courierLot (A, f, count) {
  const THREE = A.THREE;
  const lb = lotBase(A, f, count);
  if (!lb) return null;
  const { base, ux, uz, nx, nz, SW, D, W, off } = lb;
  const [bx, bz] = base, gy = A.groundH(bx + nx * (off + D / 2), bz + nz * (off + D / 2));
  const P = (a, b) => [bx + ux * a + nx * (off + b), bz + uz * a + nz * (off + b)];
  // асфальт площадки и разметка мест
  A.LITM.color('#8f949d');
  { const [x1, z1] = P(-W / 2 - 0.3, D / 2), [x2, z2] = P(W / 2 + 0.3, D / 2); A.LITM.ribbon(x1, z1, x2, z2, D + 0.4, 0.16); }
  A.FLATM.color('#f2efe6');
  for (let i = 0; i <= count; i++) {
    const a = -W / 2 + i * SW, [x1, z1] = P(a, 0.4), [x2, z2] = P(a, D - 0.2);
    A.FLATM.ribbon(x1, z1, x2, z2, 0.14, 0.2);
  }
  // птичка на каждом месте — фирменная метка
  A.FLATM.color('#ffd23f');
  for (let i = 0; i < count; i++) { const [x, z] = P(-W / 2 + (i + 0.5) * SW, D - 1.2); A.FLATM.disc(x, z, 0.45, 0.21, 6); }
  // низкий заборчик по трём сторонам в фирменном цвете, со столбиками
  const fence = (a0, b0, a1, b1) => {
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), l = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.round(l / 2.2));
    for (let i = 0; i < m; i++) {
      const cx = x0 + (x1 - x0) * (i + 0.5) / m, cz = z0 + (z1 - z0) * (i + 0.5) / m, y = A.groundH(cx, cz), g = [];
      if (onPave(cx, cz, 0.1)) continue;                 // не поперёк тротуара и дорожки (pave.js)
      const ry = Math.atan2(-(z1 - z0), x1 - x0);
      A.put(g, new THREE.BoxGeometry(l / m, 0.08, 0.06), BRAND, cx, y + 0.9, cz, 0, ry, 0);
      A.put(g, new THREE.BoxGeometry(l / m, 0.08, 0.06), CREAM, cx, y + 0.5, cz, 0, ry, 0);
      A.put(g, new THREE.BoxGeometry(0.09, 1.0, 0.09), '#585460', cx - (x1 - x0) / m / 2, y + 0.5, cz - (z1 - z0) / m / 2);
      A.smashAdd('fence', cx, cz, 1.2, g, BRAND);
    }
  };
  fence(-W / 2 - 0.6, 0.6, -W / 2 - 0.6, D + 0.5);
  fence(W / 2 + 0.6, 0.6, W / 2 + 0.6, D + 0.5);
  fence(-W / 2 - 0.6, D + 0.5, W / 2 + 0.6, D + 0.5);
  // табличка «парковка курьеров» на столбе и фонарь над площадкой
  // столб — сбиваемый (до 08.10.2026 машина проезжала сквозь): медленно — твёрдый, быстрее — валится, табличка пропадает
  const [sx, sz] = P(-W / 2 - 1.2, 0.6), sy = A.groundH(sx, sz);
  const pole = [];
  A.put(pole, new THREE.BoxGeometry(0.12, 2.8, 0.12), '#585460', sx, sy + 1.4, sz);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), lotSignMat(A));
  sign.position.set(sx, sy + 2.6, sz); sign.rotation.y = Math.atan2(-nx, -nz);
  A.scene.add(sign);
  const it = A.smashAdd('sign', sx, sz, 0.5, pole, '#585460');
  it.onDown = () => { sign.visible = false; };
  const [lx, lz] = P(W / 2 + 1.2, D + 0.6), ly = A.groundH(lx, lz);
  SL.lamp(A, { x: lx, z: lz, y: ly, style: 'yard', dx: -nx, dz: -nz, spot: P(W / 2 - 2, D / 2) });   // сбивается (streetlamps.js)
  const h = Math.atan2(-nx, -nz);                                        // носом к улице
  const out = [];
  for (let i = 0; i < count; i++) { const [x, z] = P(-W / 2 + (i + 0.5) * SW, D / 2 + 0.2); out.push({ x, z, h, gy }); }
  return out;
}
