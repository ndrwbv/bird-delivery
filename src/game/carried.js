/* ──────────────────────────────────────────────────────────────────────────
   Вещи в руках при ударе (автор 23.10.2026: 0п23 «сбил человека с пиццей — коробка висит в воздухе на месте руки»,
   0аз «улетает без портфеля»; «вообще вещи в руках при ударе выпадают»).

   Удар машиной (hits.js hit — отлетел или сбит; hits.js fall — упал и встал) — всё, что у человека в руках, вылетает:
     • коробка с пиццей (p.hold — висит на группе человека перед ним);
     • предметы на руках-костях (бутылка, портфель, сумочка, пакет, лопата, телефон…) — то, что повешено на кость
       отдельным мешем (у людей-моделей — всё). Вшитое в меш тела коробочного человека (holdFixed) — не выпадает.
   Вещь летит с частью скорости машины (FLY), кувыркается, отскакивает от земли и стен (game.js bounceBody), ложится
   плашмя на верх асфальта / тротуара / сугроба (hits.js topAt). Лежит LIE с, потом тает.
   Упал и встал (fall): поднявшись, человек идёт к своим вещам (ближе PICK.R м, сначала ближняя), наклоняется — клип
   художника «Interact» (qpeople.clips.js; у цельных женщин и коробочных людей — наклон своими костями), берёт вещь в
   руки и уносит дальше (клиент с пиццей — домой или на лавочку, как раньше). Не дошёл за PICK.GIVE с — бросает.
   Погиб — вещи лежат.
   Отладка: __dlv.HITS.CARRY (LOOSE — что лежит, STATS — сколько выпало / подобрано). */

import { makeBox } from './pizzabox.js';

export const PICK = { R: 14, GIVE: 9, SPEED: 1.5, REACH: 0.75, BEND: 1.2, GRAB: 0.5, LERP: 0.35, TILT: 0.95 };
export const FLY = { K: 0.55, SIDE: 1.6, UP: [2.2, 4.2], SPIN: [6, 12], G: 19 };
export const LIE = 30;
const LOOSE = [], LERPS = [];
export const STATS = { LOOSE, dropped: 0, picked: 0, gaveUp: 0 };

let A = null, BX = null, V3 = null;
/* api — тот же, что у hits.js (THREE, scene, groundH, curbAt, bounce, pushOut, HUMAN_VC), и topAt — верх слоя */
export function init (api) { A = api; }

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const snap = (a, step) => Math.round(a / step) * step;

/* в руке ли предмет: не надпись, видим, с мешем внутри (пустая метка «откуда пуля» — нет) */
function isItem (o) {
  if (!o || o.isSprite || o.isBone || !o.visible || (o.userData && o.userData.noDrop)) return false;
  let mesh = false;
  o.traverse(m => { if (m.isMesh && !m.isSkinnedMesh) mesh = true; });
  return mesh;
}

/* выронить всё из рук. p — { x, z, grp, hold? }; keep — человек жив и потом подберёт (p.drops). Вернёт, сколько выпало */
export function drop (p, vx, vz, keep) {
  const g = p && p.grp;
  if (!A || !g) return 0;
  const u = g.userData || {}, list = [];
  if (p.hold && p.hold.parent === g && isItem(p.hold)) list.push([p.hold, 'hold']);
  for (const c of g.children) if (c !== p.hold && c.userData && c.userData.pbox && isItem(c)) list.push([c, 'box']);
  for (const arm of [u.armL, u.armR]) if (arm) for (const c of arm.children) if (isItem(c)) list.push([c, 'arm']);
  if (!keep && p.drops) { for (const L of p.drops) L.owner = null; p.drops = null; }
  if (!list.length) return 0;
  if (!BX) { BX = new A.THREE.Box3(); V3 = new A.THREE.Vector3(); }
  g.updateMatrixWorld(true);
  const sp = Math.hypot(vx, vz) || 1;
  for (const [o, key] of list) {
    const par = o.parent;
    const L = { o, key, par, lp: o.position.clone(), lq: o.quaternion.clone(), ls: o.scale.clone(), owner: keep ? p : null,
      piv: new A.THREE.Group(), rest: 0, life: LIE, t: 0, y: 0 };
    for (let i = LERPS.length - 1; i >= 0; i--) if (LERPS[i].o === o) LERPS.splice(i, 1);   // только что поднял — снова из рук
    // ось вращения — середина вещи, оси — её собственные (лёг — плашмя на грань)
    BX.setFromObject(o);
    BX.getCenter(L.piv.position);
    o.matrixWorld.decompose(V3, L.piv.quaternion, new A.THREE.Vector3());
    L.piv.rotation.order = 'YXZ';
    L.piv.rotation.setFromQuaternion(L.piv.quaternion, 'YXZ');
    A.scene.add(L.piv);
    L.piv.updateMatrixWorld(true);
    L.piv.attach(o);
    const side = rand(-1, 1) * FLY.SIDE;
    L.vx = vx * FLY.K + (-vz / sp) * side; L.vz = vz * FLY.K + (vx / sp) * side;
    L.vy = rand(FLY.UP[0], FLY.UP[1]) + Math.min(3, sp * 0.08);
    L.sx = rand(FLY.SPIN[0], FLY.SPIN[1]) * (Math.random() < 0.5 ? -1 : 1); L.sz = rand(-FLY.SPIN[0], FLY.SPIN[0]);
    LOOSE.push(L);
    if (key === 'hold') p.hold = null;
    if (keep) (p.drops || (p.drops = [])).push(L);
    STATS.dropped++;
  }
  return list.length;
}

/* лежащая вещь — на верх слоя, плашмя */
function lowest (o) { BX.setFromObject(o); return BX.min.y; }
function floorAt (x, z, y) { return A.topAt(x, z, y); }

function disposeItem (L) {
  A.scene.remove(L.piv);
  L.piv.traverse(m => {
    if (!m.isMesh) return;
    if (m.geometry && !(m.geometry.userData && m.geometry.userData.keep)) m.geometry.dispose();
    for (const mt of [].concat(m.material)) if (mt && mt !== A.HUMAN_VC && !(mt.userData && mt.userData.keep)) mt.dispose();
  });
}

export function update (dt) {
  if (!A) return;
  for (let i = LOOSE.length - 1; i >= 0; i--) {
    const L = LOOSE[i], o = L.piv;
    L.t += dt;
    if (!L.rest) {
      L.vy -= FLY.G * dt;
      o.position.x += L.vx * dt; o.position.y += L.vy * dt; o.position.z += L.vz * dt;
      o.rotation.x += L.sx * dt; o.rotation.z += L.sz * dt;
      if (A.bounce) {                                 // о дом, забор, машину — отскок, как тело (game.js bounceBody)
        const B = BO; B.x = o.position.x; B.z = o.position.z; B.y = o.position.y - A.groundH(o.position.x, o.position.z); B.vx = L.vx; B.vz = L.vz;
        if (A.bounce(B)) { o.position.x = B.x; o.position.z = B.z; L.vx = B.vx; L.vz = B.vz; L.sx = -L.sx * 0.6; }
      }
      const g0 = A.groundH(o.position.x, o.position.z);
      if (o.position.y < g0 + 2.5) {
        const fl = floorAt(o.position.x, o.position.z, o.position.y), lo = lowest(o);
        if (lo < fl + 0.01) {
          o.position.y += fl + 0.01 - lo;
          L.vy = L.vy < 0 ? -L.vy * 0.3 : L.vy; L.vx *= 0.5; L.vz *= 0.5; L.sx *= 0.45; L.sz *= 0.45;
          if (Math.hypot(L.vx, L.vz) < 0.5 && Math.abs(L.vy) < 1) {
            L.rest = 1;
            const st = L.o.userData.pbox ? Math.PI : Math.PI / 2;   // коробка с пиццей — плашмя, не на ребре
            o.rotation.x = snap(o.rotation.x, st); o.rotation.z = snap(o.rotation.z, st);
            o.updateMatrixWorld(true);
            o.position.y += floorAt(o.position.x, o.position.z, o.position.y) + 0.01 - lowest(o);
            L.y = o.position.y;
          }
        }
      }
    }
    if (L.claim) continue;                            // хозяин уже наклонился за ней
    L.life -= dt;
    if (L.life < 1) o.scale.setScalar(Math.max(0.001, L.life));
    if (L.life <= 0) { disposeItem(L); LOOSE.splice(i, 1); if (L.owner && L.owner.drops) L.owner.drops = L.owner.drops.filter(q => q !== L); }
  }
  // поднял — вещь из руки «доезжает» на своё место (коробку у людей-моделей ставит qpeople.js — на кисти)
  for (let i = LERPS.length - 1; i >= 0; i--) {
    const Q = LERPS[i], o = Q.o;
    Q.t += dt;
    const k = Math.min(1, dt / Math.max(0.01, PICK.LERP - Q.t + dt));
    o.position.lerp(Q.lp, k); o.quaternion.slerp(Q.lq, k); o.scale.lerp(Q.ls, k);
    if (Q.t >= PICK.LERP || o.parent !== Q.par) { if (o.parent === Q.par) { o.position.copy(Q.lp); o.quaternion.copy(Q.lq); o.scale.copy(Q.ls); } LERPS.splice(i, 1); }
  }
}
const BO = { x: 0, z: 0, y: 0, vx: 0, vz: 0, nx: 0, nz: 0, t: null, thin: false };

/* ── встал после падения: подобрать своё. true — ещё занят (идёт к вещи или наклонился); false — всё, дальше как раньше.
   Зовёт hits.js fallStep, когда человек поднялся и у него есть p.drops ── */
export function pickStep (p, dt) {
  const g = p.grp, u = g && g.userData;
  if (!u || !p.drops || !p.drops.length) return false;
  let K = p.pk;
  if (!K || !K.L || LOOSE.indexOf(K.L) < 0) {
    // ближняя из своих, что лежит не дальше PICK.R и ещё на месте
    let best = null, bd = PICK.R;
    for (const L of p.drops) {
      if (LOOSE.indexOf(L) < 0 || (L.par !== g && L.par.parent !== g)) continue;
      const d = Math.hypot(L.piv.position.x - p.x, L.piv.position.z - p.z);
      if (d < bd) { bd = d; best = L; }
    }
    if (!best) { pickDone(p); return false; }
    K = p.pk = { L: best, ph: 'walk', t: 0, give: PICK.GIVE, ph2: Math.random() * 6 };
  }
  const L = K.L, o = L.piv;
  K.t += dt;
  if (K.ph === 'walk') {
    if (!L.rest && K.t < 2.5) { stand(p, u, dt); return true; }   // ещё летит / катится — подождать
    const dx = o.position.x - p.x, dz = o.position.z - p.z, d = Math.hypot(dx, dz);
    if (d > PICK.REACH) {
      const k = Math.min(1, PICK.SPEED * dt / d);
      p.x += dx * k; p.z += dz * k;
      if (A.pushOut) A.pushOut(p, 0.4);
      g.rotation.y = damp(g.rotation.y, Math.atan2(dx, dz), 9, dt);
      K.ph2 += dt * 7;
      g.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z) + Math.abs(Math.sin(K.ph2)) * 0.03, p.z);
      const sw = Math.sin(K.ph2) * 0.75;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
      if (u.parts && u.parts[2]) u.parts[2].rotation.x = 0;
      if ((K.give -= dt) <= 0) { giveUp(p, L); return true; }
      return true;
    }
    K.ph = 'bend'; K.t = 0; K.yaw = Math.atan2(dx, dz);
    K.T = (u.skin && u.skin.userData.q && u.skin.userData.q.F.clips.interact) ? u.skin.userData.q.F.clips.interact.T : PICK.BEND;
    L.claim = 1;
  }
  // наклон: клип художника «Interact» (люди-модели M и F) или своими костями — туловище вперёд, руки к земле
  const f = Math.min(1, K.t / K.T);
  g.rotation.y = damp(g.rotation.y, K.yaw, 9, dt);
  g.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z), p.z);
  for (const b of [u.legL, u.legR, u.armL, u.armR]) b.rotation.set(0, 0, 0);
  const hasClip = u.skin && u.skin.userData.q && u.skin.userData.q.F.clips.interact;
  if (hasClip) u.qAnim = { c: 'interact', f, bend: PICK.TILT * Math.sin(f * Math.PI) };   // клип тянет руку, наклон — сверху
  else {
    const k = Math.sin(f * Math.PI);
    if (u.parts && u.parts[2]) u.parts[2].rotation.x = 0.95 * k;
    u.head.rotation.x = 0.4 * k;
    u.armL.rotation.x = u.armR.rotation.x = -0.55 * k;
    u.legL.rotation.x = u.legR.rotation.x = -0.25 * k;
  }
  if (!K.got && f >= PICK.GRAB) { K.got = 1; grab(p, L); }
  if (f >= 1) { u.qAnim = null; if (u.parts && u.parts[2]) u.parts[2].rotation.x = 0; u.head.rotation.x = 0; p.pk = null; }
  return true;
}
function stand (p, u, dt) {
  for (const b of [u.legL, u.legR, u.armL, u.armR]) b.rotation.x = damp(b.rotation.x, 0, 8, dt);
  p.grp.position.set(p.x, A.groundH(p.x, p.z) + A.curbAt(p.x, p.z), p.z);
}
/* взял: вещь — обратно на свою кость (коробка — на группу, в руки), доезжает на своё место */
function grab (p, L) {
  const i = LOOSE.indexOf(L);
  if (i >= 0) LOOSE.splice(i, 1);
  p.drops = p.drops.filter(q => q !== L);
  L.par.attach(L.o);
  A.scene.remove(L.piv);
  LERPS.push({ o: L.o, par: L.par, lp: L.lp, lq: L.lq, ls: L.ls, t: 0 });
  if (L.key === 'hold') p.hold = L.o;
  STATS.picked++;
}
function giveUp (p, L) {
  L.claim = 0; L.owner = null;
  p.drops = p.drops.filter(q => q !== L);
  p.pk = null;
  STATS.gaveUp++;
}
function pickDone (p) {
  const u = p.grp && p.grp.userData;
  if (p.drops) for (const L of p.drops) { L.owner = null; L.claim = 0; }
  p.drops = null; p.pk = null;
  if (u) { u.qAnim = null; if (u.parts && u.parts[2]) u.parts[2].rotation.x = 0; if (u.head) u.head.rotation.x = 0; }
  p.resnap = true;                                  // мог отойти с тротуара за вещью — обратно на свою дорожку
}
/* человек пропал (погиб, ушёл из мира) — его вещи больше никто не ждёт */
export function forget (p) { if (p && p.drops) { for (const L of p.drops) { L.owner = null; L.claim = 0; } p.drops = null; p.pk = null; } }

function damp (a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-k * dt));
}

/* отладка: коробка с пиццей (probe: дать человеку в руки), drop/pickStep — как из hits.js */
export const DEBUG = { LOOSE, LERPS, STATS, PICK, FLY, box: () => makeBox(A.THREE), drop: (p, vx, vz, keep) => drop(p, vx, vz, keep) };
