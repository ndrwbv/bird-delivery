/* ──────────────────────────────────────────────────────────────────────────
   Драки людей — по-настоящему (0п91, автор 24.10.2026: «люди должны драться более естественно… чтобы они прям
   руками доставали друг до друга»). Общие кирпичики для всех, кто бьётся: компании сетей (crews.js), водители после
   аварии (game.js updateAccidents), восстание (protests.js riotStep). Правила — docs/CAREER.md «Драки людей».

   Что в кирпичиках:
     • дистанция удара — BRAWL.REACH (0,72 м между осями двоих): кулак модели Quaternius в клипе «удар» достаёт на
       ~0,65 м от оси тела (замер: рука 0,56 в единицах модели × 1,07), у коробочного человека прямая рука — 0,6;
     • удар — клип художника «punch» (qAnim) с попаданием на HIT_AT клипа; у коробочного — взмах правой рукой;
     • «получил» — отшатнулся: тело отклоняется назад (LEAN) и отлетает на STAG_D по линии удара, затем встаёт;
     • упал и остался лежать (die): взрослая — лежит мёртвым клипом «death» (+ кровь и лужа), детская — сидит на земле,
       держится за голову. Лежащего убирают вместе со сценой (как сбитых).
   Боец — любой объект с { grp } (и { x, z }, если его надо сдвигать); состояние — в m.bw.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { qHas, qPose } from './qpeople.js';
import { stain } from './hits.js';

export const BRAWL = {
  REACH: 0.72,        // м между осями двоих в момент удара (рука достаёт)
  COME: 0.78,         // м — ближе этого подошедший уже не идёт
  PUNCH_T: 0.62,      // с — один удар от замаха до возврата (клип художника — 0,83 с; быстрее — драка, а не бокс)
  HIT_AT: 0.68,       // доля клипа — когда кулак у цели (замер: рука вытянута на 0,7)
  STAG_T: 0.5,        // с — «получил»: отшатывается и приходит в себя
  STAG_D: 0.3,        // м — на сколько отлетает от удара
  LEAN: 0.3,          // рад — наклон назад
  CD: [0.35, 1.1],    // с — пауза между своими ударами (у каждого своя — «вразнобой»)
  FALL_T: 0.9,        // с — падает (клип «death» — секунда)
  FIGHT_T: [15, 40],  // с — сколько длится драка, пока один не упадёт (econ.js CREW.FIGHT_T — то же для компаний)
};

const ease = k => k * k * (3 - 2 * k);
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const BX = new THREE.Box3();

export function bw (m) {
  return m.bw || (m.bw = { f: -1, hit: 0, cd: rand(0, BRAWL.CD[1]), st: 0, vx: 0, vz: 0, dir: 0, lie: 0, lieK: 0, lift: undefined, kind: '' });
}

/* повернуться лицом к точке; h — текущий курс (рад), возвращает новый; dt — шаг, k — скорость */
export function face (h, fromX, fromZ, toX, toZ, dt, k = 10) {
  return h + wrap(Math.atan2(toX - fromX, toZ - fromZ) - h) * Math.min(1, dt * k);
}

/* можно бить: достаёт до соперника (по осям), не отшатывается, не лежит, кончилась пауза */
export function ready (m, foe, dt) {
  const b = bw(m);
  if (b.cd > 0) b.cd -= dt;
  if (b.lie || b.st > 0 || b.f >= 0 || b.cd > 0) return false;
  return Math.hypot(foe.x - m.x, foe.z - m.z) <= BRAWL.REACH + 0.15;
}
export function start (m) {
  const b = bw(m);
  b.f = 0; b.hit = 0; b.cd = rand(BRAWL.CD[0], BRAWL.CD[1]);
}

/* драка кончилась для него (убежал, встал): сбросить удар и отшатывание */
export function stop (m) {
  const b = m.bw;
  if (!b || b.lie) return;
  b.f = -1; b.st = 0; b.walk = 0;
  const g = m.grp, u = g.userData;
  if (u.qAnim && u.qAnim.c === 'punch') u.qAnim = null;
  g.rotation.x = 0;
}

/* соперник получил: отшатнулся от (fx, fz) — откуда ударили; power — сила (1 — обычный) */
export function hurt (m, fx, fz, power = 1) {
  const b = bw(m);
  if (b.lie) return;
  const dx = m.x - fx, dz = m.z - fz, l = Math.hypot(dx, dz) || 1;
  b.st = BRAWL.STAG_T; b.stK = power;
  b.vx = dx / l * BRAWL.STAG_D * power / (BRAWL.STAG_T * 0.5); b.vz = dz / l * BRAWL.STAG_D * power / (BRAWL.STAG_T * 0.5);
}

/* упал и остался лежать: kind 'dead' (взрослая) | 'sit' (детская — сел, держится за голову) */
export function die (m, kind) {
  const b = bw(m);
  b.lie = 1; b.lieK = 0; b.lift = undefined; b.kind = kind; b.st = 0; b.f = -1; b.y0 = m.grp.position.y;
  m.grp.userData.qAnim = null;
}
export const lying = m => !!(m.bw && m.bw.lie);

/* лужа под упавшим — взрослая (детская hits.stain сама ничего не рисует) */
export function pool (m) { stain(m.x, m.z, rand(0.7, 1.1)); }

/* кадр бойца: идущий удар, отшатывание (сдвигает m.x / m.z сам, если sx — true; иначе — только возвращает смещение
   в m.bw.vx/vz для вызывающего), лежание. Звать после того, как вызывающий поставил grp на место (позиция и курс).
   Возвращает 'hit' в кадр, когда кулак долетел до цели, иначе null */
export function animate (m, dt, move = true) {
  const b = bw(m), g = m.grp, u = g.userData, q = qHas(g, 'punch');
  if (b.lie) { lieStep(m, b, g, u, dt); return null; }
  let out = null;
  g.rotation.order = 'YXZ';
  // отшатывание: отлетает и клонится назад, потом приходит в себя
  if (b.st > 0) {
    b.st -= dt;
    const k = Math.max(0, b.st / BRAWL.STAG_T), env = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (b.stK || 1);
    if (move && k > 0.5) { m.x += b.vx * dt; m.z += b.vz * dt; }
    g.rotation.x = -BRAWL.LEAN * env;
    if (b.st <= 0) { g.rotation.x = 0; b.st = 0; }
  } else if (g.rotation.x) g.rotation.x = 0;
  // удар
  if (b.f >= 0) {
    b.f += dt / BRAWL.PUNCH_T;
    if (!b.hit && b.f >= BRAWL.HIT_AT) { b.hit = 1; out = 'hit'; }
    if (b.f >= 1) { b.f = -1; if (q) u.qAnim = null; }
    else if (q) u.qAnim = { c: 'punch', f: b.f };
    else {                                        // коробочный: замах назад — прямая рука на HIT_AT — назад в стойку
      const k = b.f < BRAWL.HIT_AT ? ease(b.f / BRAWL.HIT_AT) : 1 - ease((b.f - BRAWL.HIT_AT) / (1 - BRAWL.HIT_AT));
      u.armR.rotation.x = -1.0 - 0.57 * k;
    }
  } else if (u.qAnim && u.qAnim.c === 'punch') u.qAnim = null;
  u.armL.rotation.x = -1.1;                        // стойка: кулаки перед собой (правая — своим взмахом, пока бьёт коробочный)
  if (b.f < 0) u.armR.rotation.x = -1.0;
  return out;
}

function lieStep (m, b, g, u, dt) {
  b.lieK = Math.min(1, b.lieK + dt / BRAWL.FALL_T);
  const k = ease(b.lieK), base = b.y0;
  if (b.kind === 'sit') {                         // детская: села на землю, голова в руках
    u.legL.rotation.x = u.legR.rotation.x = -1.55 * k;
    u.armL.rotation.x = u.armR.rotation.x = -2.5 * k;
    u.head.rotation.x = 0.5 * k;
    g.position.y = base - (u.skin && u.skin.userData.q ? 0 : 0.45) * k;   // у модели таз опускает сама поза «сидит»
    return;
  }
  if (g.userData.skin && qHas(g, 'death')) {      // модель Quaternius: клип «death», лёг — самая низкая точка на земле
    u.qAnim = { c: 'death', f: k };
    g.rotation.order = 'YXZ'; g.rotation.x = 0;
    if (b.lieK >= 1 && b.lift === undefined && u.skin) {
      g.updateMatrixWorld(true); qPose(u.skin);
      BX.makeEmpty(); BX.expandByObject(u.skin, true);
      b.lift = BX.isEmpty() ? 0 : Math.max(-0.3, Math.min(0.3, base + 0.01 - BX.min.y));
    }
    g.position.y = base + (b.lift || 0) * k;
    return;
  }
  g.rotation.order = 'YXZ';                       // коробочный: на спину
  g.rotation.x = -Math.PI / 2 * k;
  u.legL.rotation.x = 0.25 * k; u.legR.rotation.x = -0.15 * k;
  u.armL.rotation.x = -2.6 * k; u.armR.rotation.x = -2.2 * k;
  g.position.y = base + 0.16 * k;
}
