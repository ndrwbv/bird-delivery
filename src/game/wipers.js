/* ──────────────────────────────────────────────────────────────────────────
   Дворники своей машины (09.10.2026, группа Ж4 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Дворники».

   • Два тёмных дворника на лобовом стекле (на прямом — у «Семёрки» и
     квадратных; у машин с наклонным лобовым — лежат на наклоне, cars.js ws).
     У машин без багажника (хэтчбеки, джипы, «Буханка») — ещё один на заднем
     стекле: его и видно из камеры сзади. В сухую погоду лежат внизу стекла.
   • Дождь или снегопад сильнее WIPE.ON — машут: туда-обратно за WIPE.SLOW с
     в слабый дождь (и с паузой WIPE.PAUSE с между взмахами), за WIPE.FAST с —
     в ливень. Дождь кончился — доводят взмах и ложатся.
   • Каждый взмах наверху стряхивает вбок несколько капель (пиксели pixfx.js) —
     у седанов из камеры сзади видно хотя бы их: лобовое закрыто крышей.
   Кадр: все дворники — один меш на 24 вершины (одна отрисовка), вершины
   двигаем руками; новых мешей и материалов в кадре нет.
   step(dt, car, wet) — wet 0…1: сила дождя или снегопада (game.js).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as PIX from './pixfx.js';

/* ON — с какой силы дождя машут; SLOW / FAST — с на взмах туда-обратно; PAUSE — пауза в слабый дождь (сила < LIGHT);
   MAX — угол взмаха передних, MAX_B — заднего, рад; DROPS — капель с дворника на взмах */
export const WIPE = { ON: 0.08, LIGHT: 0.35, SLOW: 1.5, FAST: 0.85, PAUSE: 0.7, MAX: 1.75, MAX_B: 2.6, DROPS: 3 };
export const STATS = { on: false, sweeps: 0, a: 0, arms: 0, drops: 0 };

let MAT = null;
const mat = () => MAT || (MAT = new THREE.MeshBasicMaterial({ color: 0x141317, side: THREE.DoubleSide }));

/* стекло: O — середина нижнего края (чуть снаружи), ex — вбок, ey — вверх по стеклу, n — наружу, H — высота, w — ширина.
   back — заднее; sl — наклон ({ run, rise } из cars.js) или нет (прямое стекло carglass.js) */
function glass (cg, back, sl) {
  const p = cg.panes.find(q => q.k === (back ? 'b' : 'f'));
  if (!p) return null;
  const S = cg.S, dy = cg.dy || 0, z0 = back ? S.cz - S.cab / 2 : S.cz + S.cab / 2, sg = back ? -1 : 1;
  const ex = new THREE.Vector3(sg, 0, 0);          // сзади смотрим с другой стороны: зеркально
  if (sl && sl.run > 0) {
    const a = Math.atan2(sl.rise, sl.run), top = p.c[1] - 0.02 - S.ch / 2;
    const ey = new THREE.Vector3(0, Math.sin(a), -sg * Math.cos(a)), n = new THREE.Vector3(0, Math.cos(a), sg * Math.sin(a));
    const O = new THREE.Vector3(0, top + 0.05 + dy, z0 + sg * (sl.run - 0.02)).addScaledVector(n, 0.04).addScaledVector(ey, 0.03);
    return { O, ex, ey, n, H: Math.hypot(sl.run, sl.rise), w: p.w };
  }
  return { O: new THREE.Vector3(0, p.c[1] - p.h / 2 + dy + 0.03, p.c[2] + sg * 0.03), ex, ey: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, sg), H: p.h, w: p.w };
}

function build (car) {
  const ud = car.userData, cg = ud.cg;
  if (!cg) return null;
  const arms = [];
  const F = glass(cg, false, ud.ws);
  if (F) {
    const len = Math.min(F.H * 0.9, F.w * 0.42);
    // опоры: одна ближе к краю, другая у середины; лежат вдоль низа стекла
    arms.push({ F, px: F.w * 0.4, len, k: 1, n: 0 }, { F, px: F.w * 0.04, len, k: 1, n: 0.006 });
  }
  const B = ud.hatch ? glass(cg, true, ud.wsB) : null;
  if (B) arms.push({ F: B, px: 0, len: Math.min(B.H * 0.85, B.w * 0.45), k: WIPE.MAX_B / WIPE.MAX, n: 0 });   // задний — опора посередине
  if (!arms.length) return null;
  const nv = arms.length * 8;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nv * 3), 3));
  const idx = [];
  for (let q = 0; q < arms.length * 2; q++) { const v = q * 4; idx.push(v, v + 1, v + 2, v, v + 2, v + 3); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat());
  mesh.frustumCulled = false;                     // вершины двигаем сами — сфера не пересчитывается
  car.add(mesh);
  STATS.arms = arms.length;
  const W = { mesh, arms, ph: 0, pause: 0, a: -1 };
  pose(W, 0);
  return W;
}

const T = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Vector3(), P = new THREE.Vector3();
function quad (a, v, from, to, wd) {
  for (const [t, s] of [[from, -1], [to, -1], [to, 1], [from, 1]]) {
    T.copy(P).addScaledVector(D, t).addScaledVector(Q, s * wd / 2);
    a.setXYZ(v++, T.x, T.y, T.z);
  }
  return v;
}
/* вдоль дворника (D) и поперёк (Q) на угле phi: 0 — лежит вдоль низа стекла */
function axes (F, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  D.copy(F.ex).multiplyScalar(-c).addScaledVector(F.ey, s);
  Q.copy(F.ex).multiplyScalar(s).addScaledVector(F.ey, c);
}
function pose (W, phi) {
  if (Math.abs(phi - W.a) < 1e-4) return;
  W.a = phi;
  const a = W.mesh.geometry.attributes.position;
  let v = 0;
  for (const m of W.arms) {
    axes(m.F, phi * m.k);
    P.copy(m.F.O).addScaledVector(m.F.ex, m.px).addScaledVector(m.F.n, m.n);
    v = quad(a, v, 0, m.len, 0.03);                                      // поводок
    P.addScaledVector(m.F.n, 0.004);
    v = quad(a, v, m.len * 0.22, m.len, 0.055);                          // щётка
  }
  a.needsUpdate = true;
}

/* наверху взмаха: капли с кончиков — дальше по ходу дворника, наружу и вверх */
const WV = new THREE.Vector3(), WD = new THREE.Vector3();
function drops (car, W) {
  car.updateMatrixWorld();
  const floor = car.position.y + 0.02;
  for (const m of W.arms) {
    axes(m.F, W.a * m.k);
    for (let i = 0; i < WIPE.DROPS; i++) {
      const t = m.len * (0.55 + Math.random() * 0.45);
      WV.copy(m.F.O).addScaledVector(m.F.ex, m.px).addScaledVector(D, t).applyMatrix4(car.matrixWorld);
      WD.copy(Q).multiplyScalar(2 + Math.random() * 1.5).addScaledVector(m.F.n, 0.8 + Math.random()).transformDirection(car.matrixWorld).multiplyScalar(2.4);
      PIX.spawn(WV.x, WV.y, WV.z, { vx: WD.x, vy: WD.y + 0.8 + Math.random(), vz: WD.z, s: 0.04 + Math.random() * 0.03, life: 0.5 + Math.random() * 0.3,
        hex: Math.random() < 0.5 ? 0xcfe6ff : 0xa9cdee, g: 9, floor });
      STATS.drops++;
    }
  }
}

export function step (dt, car, wet) {
  if (!car || !car.userData) return;
  const ud = car.userData;
  if (ud.wipers === undefined) ud.wipers = build(car);
  const W = ud.wipers;
  if (!W) return;
  const on = wet > WIPE.ON;
  STATS.on = on;
  if (!on && W.ph === 0) { pose(W, 0); return; }
  if (W.pause > 0) { W.pause -= dt; if (!on) W.pause = 0; return; }
  const per = on ? WIPE.SLOW + (WIPE.FAST - WIPE.SLOW) * Math.min(1, (wet - WIPE.ON) / (0.8 - WIPE.ON)) : WIPE.FAST;
  const was = W.ph;
  W.ph += dt / per;
  if (was < 0.5 && W.ph >= 0.5 && !PIX.low()) { pose(W, WIPE.MAX); drops(car, W); }
  if (W.ph >= 1) {
    W.ph = on ? W.ph - 1 : 0;
    STATS.sweeps++;
    if (on && wet < WIPE.LIGHT) { W.ph = 0; W.pause = WIPE.PAUSE; }   // слабый дождь — взмах и пауза
  }
  const phi = WIPE.MAX * (1 - Math.cos(W.ph * Math.PI * 2)) / 2;
  STATS.a = +phi.toFixed(2);
  pose(W, phi);
}
