/* ──────────────────────────────────────────────────────────────────────────
   Стёкла твоей машины (08.10.2026, группа Е7 docs/IDEAS.md).

   • Салон не сплошной: рама (низ, верх, стойки) и полупрозрачные стёкла —
     внутри видно курьера в оранжевой куртке и кепке за рулём (кубики) и
     спинки сидений. Только у машины игрока (makeCar opts.see): у машин
     потока салон по-прежнему сплошной.
   • Четыре стекла (лобовое, заднее, два боковых) — один меш с пиксельной
     текстурой на две клетки: целое и в трещинах. Удар (dentCar) у стекла:
       быстрее GLASS.CRACK м/с (≈ 32 км/ч) — ближнее к удару стекло в трещинах;
       быстрее GLASS.BREAK м/с (≈ 54 км/ч) или второй удар по треснувшему —
       разбилось: стекла нет (пустая рама), вылетают GLASS.SHARDS пиксельных
       осколков (пул pixfx.js), падают на асфальт и лежат несколько секунд.
   • Чинятся вместе с кузовом: новая смена, «ещё раз», возрождение, смена или
     тюнинг машины — машина собирается заново (resetCar в game.js), стёкла целые.
   Кадр: рама, курьер и сиденья — в общей склейке кузова (ни одной лишней
   отрисовки), стёкла — одна отрисовка; трещина и разбитое — правка UV и вершин.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as PIX from './pixfx.js';

export const GLASS = { CRACK: 9, BREAK: 15, SHARDS: 14 };
export const STATS = { cracked: 0, broken: 0 };

/* текстура: слева — целое стекло (блик пикселями), справа — то же в трещинах; NearestFilter — пиксели */
const TEX = new Map();
function tex (tint) {
  const k = tint ? 't' : 'c';
  if (TEX.has(k)) return TEX.get(k);
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  for (let cell = 0; cell < 2; cell++) {
    const o = cell * 32;
    x.fillStyle = tint ? 'rgba(18, 20, 26, 0.82)' : 'rgba(120, 160, 200, 0.38)'; x.fillRect(o, 0, 32, 32);
    x.fillStyle = tint ? 'rgba(90, 100, 120, 0.5)' : 'rgba(230, 245, 255, 0.55)';   // блик по диагонали
    for (let i = 0; i < 8; i++) x.fillRect(o + 4 + i * 2, 22 - i * 2, 3, 2);
    if (cell) {
      // трещины: из точки удара лучи пикселями и кольцо
      x.fillStyle = 'rgba(245, 250, 255, 0.95)';
      const cx = o + 13, cy = 14;
      for (const [dx, dy] of [[1, 0], [0.7, 0.7], [-0.2, 1], [-1, 0.3], [-0.6, -0.8], [0.4, -1], [1, -0.4]]) {
        for (let r = 1; r < 18; r++) x.fillRect(Math.round(cx + dx * r + (r % 3 === 0 ? 1 : 0)), Math.round(cy + dy * r), 1, 1);
      }
      for (let a = 0; a < 6.28; a += 0.35) x.fillRect(Math.round(cx + Math.cos(a) * 5), Math.round(cy + Math.sin(a) * 5), 1, 1);
      x.fillStyle = 'rgba(255, 255, 255, 0.6)'; x.fillRect(cx - 1, cy - 1, 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  TEX.set(k, m);
  return m;
}

/* салон вместо сплошной коробки: зовёт makeCar (game.js) при opts.see.
   add — в склейку кузова; k: S, W, top, cy, gh, frame, tint, dy. Возвращает состояние стёкол */
export function cabin (g, add, k) {
  const { S, W, top, cy, gh, frame, tint, dy } = k;
  const gb = cy + 0.02 - gh / 2, gt = cy + 0.02 + gh / 2, roof = top + S.ch, cf = S.cz + S.cab / 2, cb = S.cz - S.cab / 2;
  const B = (w, h, d, hex, x, y, z) => add(new THREE.BoxGeometry(w, h, d), hex, x, y, z);
  // рама: низ до стёкол, верх над ними, четыре угловые стойки и средние
  B(W - 0.12, gb - top, S.cab, frame, 0, (top + gb) / 2, S.cz);
  B(W - 0.12, roof - gt, S.cab, frame, 0, (gt + roof) / 2, S.cz);
  for (const sx of [-1, 1]) {
    for (const z of [cf - 0.07, cb + 0.07]) B(0.12, gt - gb, 0.14, frame, sx * (W / 2 - 0.12), cy + 0.02, z);
    if (S.cab > 1.7) B(0.09, gt - gb, 0.1, frame, sx * (W / 2 - 0.1), cy + 0.02, S.cz + S.cab * 0.08);
  }
  // пол салона тёмный, торпедо, спинки сидений
  B(W - 0.32, 0.02, S.cab - 0.2, '#2b2a30', 0, gb + 0.01, S.cz);
  B(W - 0.34, 0.1, 0.28, '#26252a', 0, gb + 0.05, cf - 0.2);
  const dz = cf - Math.min(0.78, S.cab * 0.38);                          // где сидит водитель (от лобового)
  for (const sx of [-1, 1]) B(0.42, 0.12, 0.1, '#3a3640', sx * W * 0.22, gb + 0.06, dz - 0.2);   // низкие: курьера сзади не закрывают
  // курьер слева (водитель — слева по ходу, +x): плечи в куртке, голова, кепка с козырьком, руки к рулю
  const q = Math.min(1, gh / 0.42), dx = W * 0.22, by = gb - 0.1;   // сидит пониже: сверху-сбоку голову не прячет верх рамы
  B(0.42 * q, 0.2 * q, 0.26 * q, '#f0522a', dx, by + 0.1 * q, dz);                       // плечи
  B(0.2 * q, 0.19 * q, 0.2 * q, '#e2b48c', dx, by + 0.29 * q, dz + 0.01);                // голова
  B(0.22 * q, 0.06 * q, 0.22 * q, '#f0522a', dx, by + 0.41 * q, dz);                     // кепка
  B(0.2 * q, 0.025 * q, 0.11 * q, '#c93f1f', dx, by + 0.39 * q, dz + 0.15 * q);          // козырёк
  for (const s of [-1, 1]) B(0.07 * q, 0.07 * q, 0.3 * q, '#f0522a', dx + s * 0.15 * q, by + 0.14 * q, dz + 0.17 * q);   // руки
  B(0.26 * q, 0.26 * q, 0.03, '#1b1a1f', dx, by + 0.17 * q, dz + 0.36 * q);              // руль

  // стёкла: четыре квадрата одним мешем (вершины и UV на стекло — 4 подряд)
  const panes = [
    { k: 'f', w: W - 0.28, h: gh, c: [0, cy + 0.02, cf + 0.01], n: [0, 0, 1] },
    { k: 'b', w: W - 0.28, h: gh * 0.9, c: [0, cy + 0.02, cb - 0.01], n: [0, 0, -1] },
    { k: 'l', w: S.cab - 0.3, h: gh * 0.84, c: [W / 2 - 0.05, cy + 0.03, S.cz], n: [1, 0, 0] },
    { k: 'r', w: S.cab - 0.3, h: gh * 0.84, c: [-W / 2 + 0.05, cy + 0.03, S.cz], n: [-1, 0, 0] },
  ];
  const pos = [], uv = [], idx = [];
  for (const p of panes) {
    const [cx, cy2, cz] = p.c, hw = p.w / 2, hh = p.h / 2, side = p.n[0] !== 0;
    const v = pos.length / 3;
    p.v0 = v;
    const ax = side ? 0 : hw, az = side ? hw : 0;
    pos.push(cx - ax, cy2 - hh, cz - az, cx + ax, cy2 - hh, cz + az, cx + ax, cy2 + hh, cz + az, cx - ax, cy2 + hh, cz - az);
    uv.push(0, 0, 0.5, 0, 0.5, 1, 0, 1);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    p.st = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, tex(tint));
  mesh.renderOrder = 1;
  g.add(mesh);                                    // занижение (dy) makeCar добавит сам, как всем детям
  return { mesh, panes, dy, S };
}

/* удар по машине: lx, lz — точка удара в осях машины (как в dentCar), force — м/с удара */
export function hit (cg, lx, lz, force, car) {
  if (!cg || !(force >= GLASS.CRACK)) return;
  const S = cg.S, cf = S.cz + S.cab / 2, cb = S.cz - S.cab / 2;
  const k = lz > cf ? 'f' : lz < cb ? 'b' : lx > 0 ? 'l' : 'r';
  const p = cg.panes.find(q => q.k === k);
  if (!p || p.st === 2) return;
  if (force >= GLASS.BREAK || p.st === 1) breakPane(cg, p, car);
  else crack(cg, p);
}

function crack (cg, p) {
  p.st = 1; STATS.cracked++;
  const uv = cg.mesh.geometry.attributes.uv, a = uv.array, o = p.v0 * 2;
  // своя точка трещины на каждом стекле: клетка справа, чуть сдвинутая
  const sh = (p.v0 % 3) * 0.04;
  a.set([0.5 + sh, 0, 1, 0, 1, 1, 0.5 + sh, 1], o);
  uv.needsUpdate = true;
}

function breakPane (cg, p, car) {
  p.st = 2; STATS.broken++;
  const pos = cg.mesh.geometry.attributes.position, a = pos.array;
  const [cx, cy, cz] = p.c;
  for (let i = p.v0; i < p.v0 + 4; i++) { a[i * 3] = cx; a[i * 3 + 1] = cy; a[i * 3 + 2] = cz; }
  pos.needsUpdate = true;
  if (!car) return;
  // осколки: кубики из места стекла — наружу и по ходу машины, падают на асфальт
  car.updateMatrixWorld();
  const w = new THREE.Vector3(), n = new THREE.Vector3(p.n[0], 0, p.n[2]).transformDirection(car.matrixWorld);
  const floor = car.position.y + 0.02;
  for (let i = 0; i < GLASS.SHARDS; i++) {
    const side = p.n[0] !== 0, t = (Math.random() - 0.5) * p.w, u = (Math.random() - 0.5) * p.h;
    w.set(cx + (side ? 0 : t), cy + u + cg.dy, cz + (side ? t : 0)).applyMatrix4(car.matrixWorld);
    const sp = 1.5 + Math.random() * 2.5;
    PIX.spawn(w.x, w.y, w.z, {
      vx: n.x * sp + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2.5, vz: n.z * sp + (Math.random() - 0.5) * 2,
      s: 0.06 + Math.random() * 0.07, life: 2.5 + Math.random() * 2, hex: Math.random() < 0.5 ? 0xcfeaff : 0xa8d0ec, g: 16, floor,
    });
  }
}

/* сколько стёкол целых / в трещинах / разбито — для проверки (__dlv.CG) */
export function state (cg) { return cg ? cg.panes.map(p => p.k + p.st).join(' ') : ''; }
