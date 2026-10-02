/* Сила удара по человеку (docs/CONTENT.md «Сила удара»). Решает скорость машины
   в момент удара, км/ч — как на спидометре:
     медленнее FALL           — упал и встал: полежал ~2 с, поднялся, грозит кулаком; не «сбит»;
     FALL … BURST             — отлетел и лежит. Во взрослой — в аккуратной тёмной луже, которая
                                медленно растекается; иногда (LIMB) отрывает руку или ногу —
                                она летит отдельно. В детской — лежит со звёздочками, встаёт и уходит;
     BURST и быстрее          — во взрослой разрывает на куски (старый gibHuman), в детской —
                                отлетает дальше и лежит дольше, потом тоже встаёт.
   Самокат при ударе отделяется от самокатчика: кувыркается, скользит и лежит на боку.
   Сколько всего одновременно — CAP: лишнее самое старое тает. */

export const TIER = { FALL: 20, HIGH: 55, BURST: 85 };          // км/ч
export const LIMB = { MID: 0.15, HIGH: 0.4 };                   // шанс оторвать руку/ногу: 20–55 и 55–85 км/ч
export const TIME = {
  FALL_LIE: 1.8,        // упал и встал: сколько лежит
  BODY: 30,             // взрослая: сколько лежит тело (потом тает)
  KID_LIE: 3,           // детская: лежит со звёздочками
  KID_LIE_HIGH: 5,      //   … если быстрее BURST
  WALK: 3,              // встал и уходит — сколько секунд видно
  WRECK: 25,            // самокат лежит
};
export const CAP = { BODIES: 12, LIMBS: 12, PUDDLES: 10, WRECKS: 8 };
const PUDDLE_HEX = 0x5a0e16;

let A;
/* api: THREE, scene, box, mergeGeos, HUMAN_VC, groundH, curbAt, groundNormal, emote, puff, pushOut,
   burst (кусками — старый gibHuman), scare, callAmbulance, Snd, adult */
export function init (api) { A = api; }

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const TAU = Math.PI * 2;

export const kmhOf = (vx, vz) => Math.hypot(vx, vz) * 3.6;
export const isFall = kmh => kmh < TIER.FALL;

const BODIES = [], LIMBS = [], PUDDLES = [], WRECKS = [];
export const STATS = { BODIES, LIMBS, PUDDLES, WRECKS };

/* ── упал и встал: живой человек из PEOPLE, его же модель ── */
export function fall (p, vx, vz) {
  const l = Math.hypot(vx, vz) || 1;
  p.fall = { t: 0, yaw: Math.atan2(-vx, -vz), vx: vx / l * 2.6, vz: vz / l * 2.6, mad: 0 };
  A.Snd.noise(0.12, 0.2);
  A.puff(p.x, 0.3, p.z, false, 0.5);
}

/* шаг «упал и встал»; true — ещё лежит/встаёт (остальную логику человека пропускаем) */
export function fallStep (p, dt) {
  const F = p.fall, g = p.grp, u = g.userData;
  const t = (F.t += dt);
  const T1 = 0.35, T2 = T1 + TIME.FALL_LIE, T3 = T2 + 0.6, T4 = T3 + 1.1;
  if (t < T1 + 0.3) {                              // по инерции проезжает по асфальту
    const k = 1 - t / (T1 + 0.3);
    p.x += F.vx * k * dt; p.z += F.vz * k * dt;
    A.pushOut(p, 0.45);
  }
  const a = t < T1 ? ease(t / T1) : t < T2 ? 1 : t < T3 ? 1 - ease((t - T2) / (T3 - T2)) : 0;
  g.rotation.order = 'YXZ';
  g.rotation.set(-Math.PI / 2 * a, F.yaw, 0);     // на спину, головой туда, куда толкнули
  g.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z) + 0.15 * a, p.z);
  u.legL.rotation.x = 0.25 * a; u.legR.rotation.x = -0.15 * a;
  u.armL.rotation.x = -2.6 * a; u.armR.rotation.x = -2.2 * a;
  if (t >= T3) {                                   // встал — грозит кулаком
    if (!F.mad) { F.mad = 1; A.emote(p.x, 2.1, p.z, 'angry', 3); }
    u.armL.rotation.x = 0;
    u.armR.rotation.x = -2.7 + Math.sin(t * 24) * 0.35;
  }
  if (t < T4) return true;
  g.rotation.set(0, F.yaw, 0); g.rotation.order = 'XYZ';
  u.armL.rotation.x = 0; u.armR.rotation.x = 0; u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  p.fall = null;
  return false;
}

/* ── сбит: отлетает. p — { x, z, grp } (grp — модель из makeHuman, её прячет вызывающий).
   o.up — встанет и уйдёт в любой версии (самокатчик на малой скорости), без скорой и счёта.
   o.y0 — с какой высоты летит (самокатчик стоит на деке). Возвращает true — «сбит» (считать). */
export function hit (p, vx, vz, kmh, o = {}) {
  if (kmh == null) kmh = kmhOf(vx, vz);
  if (A.adult && kmh >= TIER.BURST && !o.up) { A.burst(p, vx, vz); return true; }
  const up = o.up || !A.adult;
  const lie = o.up ? TIME.FALL_LIE : !A.adult ? (kmh >= TIER.BURST ? TIME.KID_LIE_HIGH : TIME.KID_LIE) : TIME.BODY;
  const B = throwBody(p, vx, vz, kmh, up, lie, o.y0 || 0);
  if (A.adult && !o.up && kmh >= TIER.FALL && Math.random() < (kmh >= TIER.HIGH ? LIMB.HIGH : LIMB.MID)) tearLimb(B);
  if (!o.up) { A.scare(p.x, p.z); A.callAmbulance(p.x, p.z); }
  return !o.up;
}

function part (list, x, y, z) {
  const m = new A.THREE.Mesh(A.mergeGeos(list), A.HUMAN_VC);
  m.position.set(x, y, z);
  return m;
}

/* тело из шести кусков с шарнирами: таз — центр вращения, ноги и руки качаются */
function buildBody (c) {
  const T = A.THREE, box = A.box;
  const root = new T.Group(), L = [];
  const leg = x => { const l = []; box(l, 0.16, 0.7, 0.16, c.pants, 0, -0.35, 0); return part(l, x, -0.25, 0); };
  const arm = x => { const l = []; box(l, 0.13, 0.55, 0.13, c.shirt, 0, -0.27, 0); box(l, 0.12, 0.1, 0.12, c.skin, 0, -0.58, 0); return part(l, x, 0.57, 0); };
  const tl = []; box(tl, 0.44, 0.6, 0.26, c.shirt, 0, 0, 0);
  const hl = []; box(hl, 0.5, 0.5, 0.3, c.skin, 0, 0, 0); if (c.hair) box(hl, 0.54, 0.14, 0.34, c.hair, 0, 0.28, 0);
  const parts = { legL: leg(-0.12), legR: leg(0.12), torso: part(tl, 0, 0.05, 0), armL: arm(-0.3), armR: arm(0.3), head: part(hl, 0, 0.63, 0) };
  for (const k in parts) { root.add(parts[k]); L.push(parts[k]); }
  root.rotation.order = 'YXZ';
  return { root, parts };
}

function throwBody (p, vx, vz, kmh, up, lie, y0) {
  const c = (p.grp && p.grp.userData.colors) || { skin: '#e0b48c', shirt: '#4a6fa5', pants: '#333' };
  const { root, parts } = buildBody(c);
  const s = (p.grp && p.grp.scale.x) || 1;
  root.scale.setScalar(s);
  const fl = A.groundH(p.x, p.z);
  root.position.set(p.x, fl + (0.95 + y0) * s, p.z);
  const l = Math.hypot(vx, vz) || 1;
  root.rotation.y = Math.atan2(vx / l, vz / l);     // +Z — куда толкнули
  A.scene.add(root);
  const k = clamp(kmh / 50, 0.35, 1.6);
  const B = {
    root, parts, s, t: 0, mode: 'fly', up, lie, life: lie,
    vx: vx * 0.42 + rand(-1.5, 1.5), vy: clamp(2.5 + kmh / 18, 3, 9), vz: vz * 0.42 + rand(-1.5, 1.5),
    spin: rand(5, 9) * k * (Math.random() < 0.5 ? -1 : 1), roll: rand(-3, 3) * k, landed: 0, puddle: null, starT: 0, wx: 0, wz: 0,
  };
  BODIES.push(B);
  if (BODIES.length > CAP.BODIES) for (const q of BODIES) if (q.mode !== 'gone') { fadeBody(q); break; }
  return B;
}

function fadeBody (B) { if (B.mode !== 'fade') { B.mode = 'fade'; B.t = 0; } }

/* оторвать руку или ногу: летит своим кусочком, где упала — маленькая лужица */
function tearLimb (B) {
  const keys = ['armL', 'armR', 'legL', 'legR'];
  const k = keys[Math.floor(Math.random() * 4)];
  const m = B.parts[k];
  B.root.updateMatrixWorld(true);
  A.scene.attach(m);
  B.parts[k] = null;
  LIMBS.push({ m, vx: B.vx * 1.2 + rand(-3, 3), vy: B.vy + rand(0.5, 2.5), vz: B.vz * 1.2 + rand(-3, 3),
    spin: rand(-14, 14), rest: 0, life: TIME.BODY, puddle: null, s: m.scale.x });
  if (LIMBS.length > CAP.LIMBS) { const q = LIMBS.find(q => q.life > 1); if (q) q.life = 1; }
}

/* лужа: тёмно-красный круг под телом, растёт до R за несколько секунд */
let PUD_GEO = null;
function puddle (x, z, R) {
  const T = A.THREE;
  if (!PUD_GEO) PUD_GEO = new T.CircleGeometry(1, 18);
  const mat = new T.MeshBasicMaterial({ color: PUDDLE_HEX, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new T.Mesh(PUD_GEO, mat);
  const nrm = A.groundNormal(x, z), y = A.groundH(x, z), lift = 0.21 + PUDDLES.length * 0.003;
  m.position.set(x + nrm.x * lift, y + nrm.y * lift, z + nrm.z * lift);
  m.lookAt(m.position.x + nrm.x, m.position.y + nrm.y, m.position.z + nrm.z);
  m.scale.set(0.01, 0.01, 1);
  A.scene.add(m);
  const P = { m, mat, t: 0, R, sx: rand(0.85, 1.15), sy: rand(0.85, 1.15), fade: 0 };
  PUDDLES.push(P);
  let live = PUDDLES.filter(q => !q.fade).length;
  for (const q of PUDDLES) { if (live <= CAP.PUDDLES) break; if (!q.fade) { q.fade = 1; live--; } }
  return P;
}

/* ── самокат отдельно: sc — группа самоката из makeScooter, отрываем от человека ── */
export function wreck (sc, vx, vz) {
  // мировое положение собираем сами: модель вдали могла не обновлять матрицы
  const g = sc.parent;
  g.updateMatrix(); sc.updateMatrix();
  const M = new A.THREE.Matrix4().multiplyMatrices(g.matrix, sc.matrix);
  g.remove(sc); A.scene.add(sc);
  M.decompose(sc.position, sc.quaternion, sc.scale);
  sc.matrixAutoUpdate = true;
  sc.rotation.reorder('YXZ');
  const W = { o: sc, vx: vx * 0.55 + rand(-2, 2), vy: rand(2.5, 4.5), vz: vz * 0.55 + rand(-2, 2),
    spinY: rand(-9, 9), spinX: rand(-7, 7), side: Math.random() < 0.5 ? -1 : 1, landed: 0, life: TIME.WRECK, s: sc.scale.x };
  WRECKS.push(W);
  if (WRECKS.length > CAP.WRECKS) { const q = WRECKS.find(q => q.life > 1); if (q) q.life = 1; }
}

function nearest (a, step, off) { return Math.round((a - off) / step) * step + off; }

function dispose (o) {
  A.scene.remove(o);
  o.traverse(m => {
    if (!m.isMesh) return;
    if (m.geometry !== PUD_GEO) m.geometry.dispose();
    if (m.material !== A.HUMAN_VC) m.material.dispose();
  });
}

function stepBody (B, dt) {
  const r = B.root, P = B.parts;
  B.t += dt;
  if (B.mode === 'fly') {
    B.vy -= 19 * dt;
    r.position.x += B.vx * dt; r.position.y += B.vy * dt; r.position.z += B.vz * dt;
    const fl = A.groundH(r.position.x, r.position.z);
    if (!B.landed) {
      r.rotation.x += B.spin * dt; r.rotation.z += B.roll * dt;
      const w = Math.sin(B.t * 16);                  // руками-ногами машет в полёте
      if (P.armL) P.armL.rotation.x = -1.6 + w * 1.2;
      if (P.armR) P.armR.rotation.x = -1.6 - w * 1.2;
      if (P.legL) P.legL.rotation.x = w * 0.8;
      if (P.legR) P.legR.rotation.x = -w * 0.8;
    } else {
      // лёг: на спину или лицом вниз — что ближе
      r.rotation.x = damp(r.rotation.x, B.lx, 10, dt); r.rotation.z = damp(r.rotation.z, B.lz, 10, dt);
    }
    if (r.position.y < fl + 0.18 * B.s) {
      r.position.y = fl + 0.18 * B.s;
      if (!B.landed) { B.landed = 1; B.lx = nearest(r.rotation.x, Math.PI, Math.PI / 2); B.lz = nearest(r.rotation.z, TAU, 0); }
      B.vy *= -0.25; B.vx *= 0.55; B.vz *= 0.55;
      if (Math.hypot(B.vx, B.vz) < 0.7 && Math.abs(B.vy) < 0.9) {
        B.mode = 'lie'; B.t = 0;
        r.position.y = fl + 0.15 * B.s;
        if (A.adult && !B.up) B.puddle = puddle(r.position.x, r.position.z, rand(1.1, 1.5) * B.s);
      }
    }
    return;
  }
  if (B.mode === 'lie') {
    r.rotation.x = damp(r.rotation.x, B.lx, 10, dt); r.rotation.z = damp(r.rotation.z, B.lz, 10, dt);
    if (P.armL) P.armL.rotation.x = damp(P.armL.rotation.x, -2.7, 6, dt);
    if (P.armR) P.armR.rotation.x = damp(P.armR.rotation.x, -0.4, 6, dt);
    if (P.legL) P.legL.rotation.x = damp(P.legL.rotation.x, 0.3, 6, dt);
    if (P.legR) P.legR.rotation.x = damp(P.legR.rotation.x, -0.2, 6, dt);
    if (B.up && (B.starT -= dt) <= 0) { B.starT = 0.7; A.emote(r.position.x, 0.9, r.position.z, 'star', 1); }
    if (B.t >= B.lie) {
      if (B.up) { B.mode = 'rise'; B.t = 0; B.x0 = B.lx - nearest(B.lx, TAU, 0); B.lz = r.rotation.z - nearest(r.rotation.z, TAU, 0); }
      else fadeBody(B);
    }
    return;
  }
  const fl = A.groundH(r.position.x, r.position.z);
  if (B.mode === 'rise') {
    const k = ease(Math.min(1, B.t / 0.7));
    r.rotation.x = B.x0 * (1 - k); r.rotation.z = B.lz * (1 - k);
    r.position.y = fl + (0.15 + 0.8 * k) * B.s;
    for (const n of ['armL', 'armR', 'legL', 'legR']) if (P[n]) P[n].rotation.x *= 1 - k;
    if (B.t >= 0.7) {
      B.mode = 'walk'; B.t = 0;
      const a = r.rotation.y + rand(-1.2, 1.2);    // уходит примерно туда, куда отлетел
      B.wx = Math.sin(a); B.wz = Math.cos(a);
      r.rotation.y = a;
      if (B.lie === TIME.FALL_LIE) A.emote(r.position.x, 2.1, r.position.z, 'angry', 3);
    }
    return;
  }
  if (B.mode === 'walk') {
    const ph = B.t * 7;
    r.position.x += B.wx * 1.4 * dt; r.position.z += B.wz * 1.4 * dt;
    r.position.y = fl + (0.95 + Math.abs(Math.sin(ph)) * 0.04) * B.s;
    r.rotation.z = A.adult ? 0 : Math.sin(B.t * 3) * 0.12;   // в детской ещё пошатывается
    const sw = Math.sin(ph) * 0.8;
    if (P.legL) P.legL.rotation.x = sw;
    if (P.legR) P.legR.rotation.x = -sw;
    if (P.armL) P.armL.rotation.x = -sw * 0.7;
    if (P.armR) P.armR.rotation.x = sw * 0.7;
    if (B.t >= TIME.WALK) { A.puff(r.position.x, 0.6, r.position.z, false, 0.9); B.mode = 'gone'; }
    return;
  }
  if (B.mode === 'fade') {
    const k = Math.max(0.001, 1 - B.t);
    r.scale.setScalar(B.s * k);
    if (B.t >= 1) B.mode = 'gone';
  }
}

export function update (dt) {
  for (let i = BODIES.length - 1; i >= 0; i--) {
    const B = BODIES[i];
    stepBody(B, dt);
    if (B.mode === 'gone') {
      if (B.puddle) B.puddle.fade = 1;
      dispose(B.root); BODIES.splice(i, 1);
    }
  }
  for (let i = LIMBS.length - 1; i >= 0; i--) {
    const L = LIMBS[i], m = L.m;
    if (!L.rest) {
      L.vy -= 19 * dt;
      m.position.x += L.vx * dt; m.position.y += L.vy * dt; m.position.z += L.vz * dt;
      m.rotation.x += L.spin * dt; m.rotation.z += L.spin * 0.6 * dt;
      const fl = A.groundH(m.position.x, m.position.z);
      if (m.position.y < fl + 0.12) {
        m.position.y = fl + 0.12;
        L.vy *= -0.3; L.vx *= 0.5; L.vz *= 0.5; L.spin *= 0.5;
        if (Math.hypot(L.vx, L.vz) < 0.6 && Math.abs(L.vy) < 0.8) {
          L.rest = 1;
          m.rotation.set(Math.PI / 2, m.rotation.y, 0);
          // шарнир на конце куска: центр лужицы — середина руки/ноги
          L.puddle = puddle(m.position.x, m.position.z + 0.3, 0.45);
        }
      }
    }
    L.life -= dt;
    if (L.life < 1) m.scale.setScalar(L.s * Math.max(0.001, L.life));
    if (L.life <= 0) { if (L.puddle) L.puddle.fade = 1; dispose(m); LIMBS.splice(i, 1); }
  }
  for (let i = PUDDLES.length - 1; i >= 0; i--) {
    const P = PUDDLES[i];
    P.t += dt;
    const r = Math.max(0.02, P.R * (1 - Math.exp(-P.t / 3.5)));     // растекается секунд 10
    P.m.scale.set(r * P.sx, r * P.sy, 1);
    if (P.fade) {
      P.mat.opacity -= dt * 0.6;
      if (P.mat.opacity <= 0) { A.scene.remove(P.m); P.mat.dispose(); PUDDLES.splice(i, 1); }
    }
  }
  for (let i = WRECKS.length - 1; i >= 0; i--) {
    const W = WRECKS[i], o = W.o;
    W.vy -= 19 * dt;
    o.position.x += W.vx * dt; o.position.y += W.vy * dt; o.position.z += W.vz * dt;
    o.rotation.y += W.spinY * dt;
    const fl = A.groundH(o.position.x, o.position.z);
    if (!W.landed) { o.rotation.x += W.spinX * dt; o.rotation.z += W.side * 6 * dt; }
    else {
      // лежит на боку и скользит, пока не остановится
      o.rotation.x = damp(o.rotation.x, nearest(o.rotation.x, TAU, 0), 8, dt);
      o.rotation.z = damp(o.rotation.z, W.lz, 8, dt);
      const f = Math.exp(-2.6 * dt);
      W.vx *= f; W.vz *= f; W.spinY *= Math.exp(-3 * dt);
    }
    if (o.position.y < fl + 0.08) {
      o.position.y = fl + 0.08;
      if (!W.landed) { W.landed = 1; W.lz = nearest(o.rotation.z, Math.PI, Math.PI / 2); }
      W.vy = Math.abs(W.vy) > 2 ? -W.vy * 0.3 : 0;
    }
    W.life -= dt;
    if (W.life < 1) o.scale.setScalar(W.s * Math.max(0.001, W.life));
    if (W.life <= 0) { dispose(o); WRECKS.splice(i, 1); }
  }
}
