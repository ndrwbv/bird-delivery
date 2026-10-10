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
   • Фары и задние фонари (09.10.2026, группа Ж2): удар у угла машины (в
     передней или задней четверти длины) быстрее LAMP.BREAK м/с (≈ 29 км/ч) —
     фара или фонарь с той стороны разбит: гаснет (тёмное стекло), вылетают
     LAMP.SHARDS осколков — белые и жёлтые спереди, красные (и оранжевые) сзади;
     быстрее LAMP.BOTH м/с (≈ 58 км/ч) — обе на этом конце. Разбитый задний
     фонарь не горит стоп-сигналом и задним ходом (carlights.js kill);
     разбитые фары — светлое пятно на асфальте ночью тусклее (headK), обе — нет.
   • Чинятся вместе с кузовом: новая смена, «ещё раз», возрождение, смена или
     тюнинг машины — машина собирается заново (resetCar в game.js), стёкла,
     фары и фонари целые.
   Кадр: рама, курьер и сиденья — в общей склейке кузова (ни одной лишней
   отрисовки), стёкла — одна отрисовка; трещина и разбитое — правка UV и вершин.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as PIX from './pixfx.js';
import { kill as killLights } from './carlights.js';

export const GLASS = { CRACK: 9, BREAK: 15, SHARDS: 14 };
/* фары: BREAK / BOTH — м/с удара; END — удар в передней / задней такой доле половины длины; SHARDS — осколков на фару */
export const LAMP = { BREAK: 8, BOTH: 16, END: 0.45, SHARDS: 10 };
export const STATS = { cracked: 0, broken: 0, lamps: 0, lampCr: 0 };   // lampCr — задних фонарей в трещинах (cardent.js «следы сзади»)

/* текстура: слева — целое стекло, справа — то же в трещинах. Целое — ровного цвета с одним мягким широким бликом
   (10.10.2026: блик «лесенкой» из пикселей с камеры читался как царапины и полосы на заднем стекле) */
const TEX = new Map();
function tex (tint) {
  const k = tint ? 't' : 'c';
  if (TEX.has(k)) return TEX.get(k);
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  for (let cell = 0; cell < 2; cell++) {
    const o = cell * 64;
    x.fillStyle = tint ? 'rgba(18, 20, 26, 0.82)' : 'rgba(120, 160, 200, 0.38)'; x.fillRect(o, 0, 64, 64);
    // блик: одна широкая мягкая полоса наискось, без лесенки
    x.save(); x.beginPath(); x.rect(o, 0, 64, 64); x.clip();
    x.fillStyle = tint ? 'rgba(90, 100, 120, 0.16)' : 'rgba(230, 245, 255, 0.16)';
    x.beginPath(); x.moveTo(o + 20, 64); x.lineTo(o + 34, 64); x.lineTo(o + 58, 0); x.lineTo(o + 44, 0); x.closePath(); x.fill();
    if (cell) {
      // трещины: из точки удара лучи и кольцо
      x.strokeStyle = 'rgba(245, 250, 255, 0.95)'; x.lineWidth = 1.6; x.lineCap = 'round';
      const cx = o + 26, cy = 28;
      x.beginPath();
      for (const [dx, dy] of [[1, 0], [0.7, 0.7], [-0.2, 1], [-1, 0.3], [-0.6, -0.8], [0.4, -1], [1, -0.4]]) {
        x.moveTo(cx, cy); x.lineTo(cx + dx * 20 + dy * 3, cy + dy * 20 - dx * 3); x.lineTo(cx + dx * 36, cy + dy * 36);
      }
      x.stroke();
      x.beginPath(); x.arc(cx, cy, 10, 0, 7); x.stroke();
      x.fillStyle = 'rgba(255, 255, 255, 0.6)'; x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill();
    }
    x.restore();                                  // трещины не вылезают на соседнюю клетку
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
  // rb — заднее стекло наклонное (классические седаны, cars.js LOOK.rake): верх на rb м ближе к середине (carbody.js, Ж6)
  const rb = Math.min(k.rb || 0, S.cab * 0.3), tilt = rb / (gt - gb);
  // рама: низ до стёкол, верх над ними, четыре угловые стойки и средние
  B(W - 0.12, gb - top, S.cab, frame, 0, (top + gb) / 2, S.cz);
  B(W - 0.12, roof - gt, S.cab - rb, frame, 0, (gt + roof) / 2, S.cz + rb / 2);
  for (const sx of [-1, 1]) {
    B(0.12, gt - gb, 0.14, frame, sx * (W / 2 - 0.12), cy + 0.02, cf - 0.07);
    if (rb) add(new THREE.BoxGeometry(0.12, Math.hypot(gt - gb, rb), 0.14).rotateX(Math.atan(tilt)), frame, sx * (W / 2 - 0.12), cy + 0.02, cb + 0.07 + rb / 2);
    else B(0.12, gt - gb, 0.14, frame, sx * (W / 2 - 0.12), cy + 0.02, cb + 0.07);
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
    { k: 'b', w: W - 0.28, h: gh * 0.9, c: [0, cy + 0.02, cb - 0.01 + rb / 2], n: [0, 0, -1], tz: rb * 0.9 },
    { k: 'l', w: S.cab - 0.3, h: gh * 0.84, c: [W / 2 - 0.05, cy + 0.03, S.cz], n: [1, 0, 0], tb: rb * 0.92 },
    { k: 'r', w: S.cab - 0.3, h: gh * 0.84, c: [-W / 2 + 0.05, cy + 0.03, S.cz], n: [-1, 0, 0], tb: rb * 0.92 },
  ];
  const pos = [], uv = [], idx = [];
  for (const p of panes) {
    const [cx, cy2, cz] = p.c, hw = p.w / 2, hh = p.h / 2, side = p.n[0] !== 0;
    const v = pos.length / 3;
    p.v0 = v;
    const ax = side ? 0 : hw, az = side ? hw : 0;
    // наклон: tz — верх заднего стекла вперёд (низ — назад), tb — верхний задний угол бокового вперёд
    const lo = -(p.tz || 0) / 2, hi = (p.tz || 0) / 2, tb = p.tb || 0;
    pos.push(cx - ax, cy2 - hh, cz - az + lo, cx + ax, cy2 - hh, cz + az + lo, cx + ax, cy2 + hh, cz + az + hi, cx - ax, cy2 + hh, cz - az + hi + tb);
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
  return { mesh, panes, dy, S, rb, roofZ: S.cz + rb / 2, roofLen: S.cab - rb };
}

/* удар по машине: lx, lz — точка удара в осях машины (как в dentCar), force — м/с удара */
export function hit (cg, lx, lz, force, car) {
  if (car && force >= LAMP.BREAK) lampHit(car, lx, lz, force);
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

/* ─────────────── фары и фонари ───────────────
   Где они у модели — по мешу фар (cars.js dress: фары и фонари одной склейкой без света, MeshBasic
   с цветом по вершинам) — вершины у переднего и заднего края по четырём углам. У простой машины
   (без dress) — отдельные меши фар спереди; задние у неё в склейке кузова — не бьются. */
const BROKEN = { f: new THREE.Color(0x2a2c31), r: new THREE.Color(0x3b161b) };
const SHARD = { f: [0xfff4cf, 0xeaf4ff, 0xffffff], r: [0xe0283a, 0xb81e2c, 0xe0283a, 0xffa630] };
function lampsOf (car) {
  const ud = car.userData;
  if (ud.lamps) return ud.lamps;
  const hl = ud.hl || 2, C = {}, v = new THREE.Vector3();
  const at = k => C[k] || (C[k] = { k, st: 0, n: 0, x: 0, y: 0, z: 0, parts: [] });
  const hz = ud.hazard || [];
  for (const m of car.children) {
    if (!m.isMesh || !m.material || !m.material.isMeshBasicMaterial || hz.includes(m)) continue;
    m.updateMatrix();
    const pos = m.geometry.attributes.position;
    if (m.material.vertexColors && m.geometry.attributes.color && !m.material.map) {
      const per = {};
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
        if (Math.abs(v.z) < hl * (1 - LAMP.END)) continue;        // люстра на крыше — не фара
        const k = (v.z > 0 ? 'f' : 'r') + (v.x > 0 ? 'l' : 'r'), c = at(k);
        c.x += v.x; c.y += v.y; c.z += v.z; c.n++;
        (per[k] || (per[k] = [])).push(i);
      }
      for (const k in per) C[k].parts.push({ m, idx: per[k] });
    } else if (!m.material.vertexColors && m.material.color.getHex() === 0xfff1c8 && m.position.z > 0) {
      const k = 'f' + (m.position.x > 0 ? 'l' : 'r'), c = at(k);
      c.x += m.position.x; c.y += m.position.y; c.z += m.position.z; c.n++;
      c.parts.push({ m });
    }
  }
  for (const k in C) { const c = C[k]; c.x /= c.n; c.y /= c.n; c.z /= c.n; }
  return (ud.lamps = C);
}
function lampHit (car, lx, lz, force) {
  const ud = car.userData;
  if (!ud || !ud.hl || Math.abs(lz) < ud.hl * (1 - LAMP.END) * 0.9) return;   // удар в бок посередине — фары целы
  const L = lampsOf(car), end = lz > 0 ? 'f' : 'r';
  const keys = force >= LAMP.BOTH || Math.abs(lx) < 0.12 && force >= LAMP.BREAK * 1.5 ? [end + 'l', end + 'r'] : [end + (lx > 0 ? 'l' : 'r')];
  for (const k of keys) if (L[k] && !L[k].st) breakLamp(car, L[k], end);
}
function breakLamp (car, c, end) {
  c.st = 1; STATS.lamps++;
  for (const p of c.parts) {
    if (!p.idx) { p.m.material.color.copy(BROKEN[end]); continue; }
    const col = p.m.geometry.attributes.color;
    for (const i of p.idx) col.setXYZ(i, BROKEN[end].r, BROKEN[end].g, BROKEN[end].b);
    col.needsUpdate = true;
  }
  killLights(car, c.k);
  // осколки: из фары вперёд (или назад) и в стороны, падают на асфальт
  car.updateMatrixWorld();
  const w = new THREE.Vector3(), n = new THREE.Vector3(0, 0, end === 'f' ? 1 : -1).transformDirection(car.matrixWorld);
  const floor = car.position.y + 0.02, cols = SHARD[end];
  for (let i = 0; i < LAMP.SHARDS; i++) {
    w.set(c.x + (Math.random() - 0.5) * 0.2, c.y + (Math.random() - 0.5) * 0.1, c.z).applyMatrix4(car.matrixWorld);
    const sp = 1 + Math.random() * 2.2;
    PIX.spawn(w.x, w.y, w.z, {
      vx: n.x * sp + (Math.random() - 0.5) * 2.2, vy: 0.8 + Math.random() * 2, vz: n.z * sp + (Math.random() - 0.5) * 2.2,
      s: 0.05 + Math.random() * 0.06, life: 2.5 + Math.random() * 2, hex: cols[(Math.random() * cols.length) | 0], g: 16, floor,
    });
  }
}
/* задние фонари от любого удара (cardent.js «следы сзади»): k — 'rl' / 'rr'.
   crackLamp — трещина: стекло пятнами (светлые трещины, тёмные сколы), 3 осколка, фонарь горит; smashLamp — разбит, как от удара в угол */
const _cw = new THREE.Vector3();
export function crackLamp (car, k) {
  const c = car && lampsOf(car)[k];
  if (!c || c.st || c.cr) return false;
  c.cr = 1; STATS.lampCr++;
  for (const p of c.parts) {
    if (!p.idx) continue;
    const col = p.m.geometry.attributes.color;
    for (const i of p.idx) {
      const h = Math.sin(i * 12.9898 + c.x * 78.233) * 43758.5453;
      const f = h - Math.floor(h);              // пятнами: светлые трещины и тёмные сколы
      if (f < 0.5) col.setXYZ(i, col.getX(i) + (1 - col.getX(i)) * 0.6, col.getY(i) + (0.92 - col.getY(i)) * 0.6, col.getZ(i) + (0.9 - col.getZ(i)) * 0.6);
      else col.setXYZ(i, col.getX(i) * 0.5, col.getY(i) * 0.5, col.getZ(i) * 0.5);
    }
    col.needsUpdate = true;
  }
  car.updateMatrixWorld();
  const floor = car.position.y + 0.02, n = _cw.set(0, 0, -1).transformDirection(car.matrixWorld).clone(), w = _cw;
  for (let i = 0; i < 3; i++) {
    w.set(c.x + (Math.random() - 0.5) * 0.15, c.y, c.z).applyMatrix4(car.matrixWorld);
    PIX.spawn(w.x, w.y, w.z, { vx: n.x * 1.2 + (Math.random() - 0.5), vy: 0.6 + Math.random(), vz: n.z * 1.2 + (Math.random() - 0.5),
      s: 0.04 + Math.random() * 0.04, life: 2 + Math.random() * 1.5, hex: SHARD.r[i % 2], g: 16, floor });
  }
  return true;
}
export function smashLamp (car, k) {
  const c = car && lampsOf(car)[k];
  if (!c || c.st) return false;
  breakLamp(car, c, k[0] === 'f' ? 'f' : 'r');
  return true;
}

/* сколько света у фар: целых передних / найденных (1 — нет данных) — для пятна на асфальте (game.js) */
export function headK (ud) {
  const L = ud && ud.lamps;
  if (!L) return 1;
  let n = 0, ok = 0;
  for (const k of ['fl', 'fr']) if (L[k]) { n++; if (!L[k].st) ok++; }
  return n ? ok / n : 1;
}
/* фары и фонари: «fl0 fr1 rl0 rrc» (1 — разбит, c — в трещинах) — для проверки (__dlv.cgLamps) */
export function lampState (car) {
  if (!car || !car.userData) return '';
  const L = lampsOf(car);
  return Object.keys(L).sort().map(k => k + (L[k].st ? 1 : L[k].cr ? 'c' : 0)).join(' ');   // c — в трещинах
}

/* сколько стёкол целых / в трещинах / разбито — для проверки (__dlv.CG) */
export function state (cg) { return cg ? cg.panes.map(p => p.k + p.st).join(' ') : ''; }
