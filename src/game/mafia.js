/* ──────────────────────────────────────────────────────────────────────────
   Мафиози у адреса (docs/ORDERS.md «Мафиози»). Только в карьере.

   Кто: мужчина в чёрном костюме и шляпе, белая рубашка, золотая цепь, тёмные
   очки — узнаётся по одежде; лицо и цвет кожи — как у всех прохожих (случайные).

   Когда (MAFIA ниже): на новый адрес смены бросаем жребий —
     адрес в бандитском районе (ZN.gangZones)   — CHANCE_GANG (25 %);
     иначе, со второго района (DIST.cur() ≥ 1)   — CHANCE (6 %);
     первый район вне бандитских кругов          — никогда.
   Не больше PER_SHIFT (1) за смену, не раньше FROM_STOP-го (3-го) адреса смены,
   не в обучении, не в сюжете, не в свободной езде.
   Стоит в OFF_MIN–OFF_MAX (6–9 м) от клиента на тротуаре — сам адрес не перекрыт,
   но он внутри радиуса угрозы: риск — подлететь, отдать и свалить за 4 с, или ждать,
   пока он сам уйдёт (LIFE, 75 с).

   Что делает:
     подъехал ближе WARN_R (15 м) — облачко: взрослая «пиздуй отсюда, а то порешу»,
       детская «вали отсюда, а то пожалеешь»;
     не уехал из радиуса за GRACE (4 с) — стреляет (взрослая: пистолет, вспышка,
       трассер) или кидается помидорами и ботинками (детская), раз в RATE (1 с);
       попал (HIT 65 %) — −½ сердца; дальше STOP_R (30 м) — перестаёт;
       вернулся в 15 м — снова сначала предупреждение и 4 с;
     сбить — как любого прохожего: быстрее KO_KMH (20 км/ч) — бонус KO_PAY (2 500 ₽);
       медленнее — твёрдый: машина его толкает (не сквозь), тормознуло, и сразу стреляет.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import * as ZN from './zones.js';
import * as DIST from './districts.js';
import { makePerson } from './people.js';
import { TIER } from './hits.js';

export const MAFIA = {
  CHANCE_GANG: 0.25, CHANCE: 0.06, PER_SHIFT: 1, FROM_STOP: 3,
  OFF_MIN: 6, OFF_MAX: 9, LIFE: 75,
  WARN_R: 15, GRACE: 4, STOP_R: 30, RATE: 1, HIT: 0.65, DMG: 0.4,     // DMG 0.4 → полсердца (game.js hitHearts)
  KO_KMH: TIER.FALL, KO_PAY: 2500,                                   // KO_KMH — 20 км/ч, как у прохожих
};

const rand = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inGang = (x, z) => ZN.gangZones().some(g => (x - g.x) ** 2 + (z - g.z) ** 2 < g.r * g.r);

let A = null;
const M = { man: null, stop: null, session: -1, shown: 0, stops: 0, force: false, fx: [], stats: { spawned: 0, shots: 0, hits: 0, ko: 0 } };

/* ── внешность ── */
const lam = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
function suit () {
  const person = makePerson({ fem: false });
  if (person.look) Object.assign(person.look, { top: 'long', bottom: 'pants', head: 'hat', headC: '#17171b', glasses: 'sun', glassC: '#121214', pack: null, fat: false, shoes: '#0e0d0c' });
  const grp = A.makeHuman(person, { shirt: '#1b1b20', pants: '#1b1b20', fat: false, fem: false });
  const u = grp.userData;
  // белая рубашка с расстёгнутым воротом и золотая цепь поверх
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.3, 0.012), lam('#f4f1ea'));
  shirt.position.set(0, 1.13, 0.142);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.013), lam('#f4f1ea'));
  neck.position.set(0, 1.27, 0.143);
  const chainM = new THREE.MeshLambertMaterial({ color: '#f0c43a', emissive: '#5a4210' });
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.022, 0.014), chainM);
  chain.position.set(0, 1.19, 0.15);
  const pend = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.014), chainM);
  pend.position.set(0, 1.15, 0.151);
  grp.add(shirt, neck, chain, pend);
  // в руке: взрослая — пистолет, детская — ничего (кидается тем, что под рукой)
  let gun = null;
  if (A.ADULT) {
    gun = new THREE.Group();
    const m = lam('#151517');
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), m);
    barrel.position.set(0, -0.62, 0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.12), m);
    grip.position.set(0, -0.54, 0.06);
    gun.add(barrel, grip);
    u.armR.add(gun);
  }
  A.scene.add(grp);
  return { grp, u, person, gun, x: 0, z: 0, h: 0, ph: 0, dead: 0, st: 'idle', t: 0, life: MAFIA.LIFE, near: 0, fireT: 0, bubble: null, bubT: 0, aim: 0, kick: 0, stun: 0 };
}

function say (m, text, col) {
  if (!A.sayBubble || m.dead) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || '#1b1b20', 2.8);
  m.bubT = 3;
}

/* ── где встать: в 6–9 м от клиента, не в доме и не на проезжей части ── */
function placeNear (tx, tz) {
  for (let k = 0; k < 24; k++) {
    const an = Math.random() * Math.PI * 2, d = rand(MAFIA.OFF_MIN, MAFIA.OFF_MAX);
    const x = tx + Math.sin(an) * d, z = tz + Math.cos(an) * d;
    if (A.inHouse(x, z, 0.8) || !A.inBounds(x, z, 5)) continue;
    if (A.onRoad && A.onRoad(x, z) && k < 20) continue;
    return [x, z];
  }
  return null;
}

export function spawn (x, z) {
  if (!A) return null;
  clear();
  let at = null;
  if (x !== undefined) at = [x, z];
  else {
    const tg = A.S.target || { x: A.V.x + Math.sin(A.V.h) * 25, z: A.V.z + Math.cos(A.V.h) * 25 };
    at = placeNear(tg.x, tg.z);
  }
  if (!at) return null;
  const m = suit();
  m.x = at[0]; m.z = at[1];
  m.h = Math.random() * Math.PI * 2;
  M.man = m;
  M.stats.spawned++;
  return m;
}

export function clear () {
  const m = M.man;
  if (!m) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
  if (!m.dead) A.dropMesh(m.grp);
  M.man = null;
}

/* ── жребий на новый адрес ── */
function roll () {
  const S = A.S, o = S.order;
  if (!o || !o.ord || o.tut || S.free || S.ride || S.freeRun) return;
  const st = o.stops[o.idx];
  if (!st || st === M.stop) return;
  M.stop = st;
  const ses = DIST.session();
  if (ses !== M.session) { M.session = ses; M.shown = 0; M.stops = 0; }
  M.stops++;
  if (st.story || (st.pay && st.pay.story)) return;
  const tg = S.target;
  if (!tg || M.man) return;
  let p = 0;
  if (M.force) p = 1;
  else if (M.shown >= MAFIA.PER_SHIFT || M.stops < MAFIA.FROM_STOP) return;
  else if (inGang(tg.x, tg.z)) p = MAFIA.CHANCE_GANG;
  else if (DIST.cur() >= 1) p = MAFIA.CHANCE;
  if (!chance(p)) return;
  // на глазах из воздуха не появляется
  if (!M.force && Math.hypot(tg.x - A.V.x, tg.z - A.V.z) < 60) return;
  M.force = false;
  const at = placeNear(tg.x, tg.z);
  if (!at) return;
  spawn(at[0], at[1]);
  M.shown++;
}

/* ── выстрел / бросок ── */
const FLASH_GEO = new THREE.SphereGeometry(0.12, 6, 4);
const TOMATO_GEO = new THREE.SphereGeometry(0.13, 7, 5);
const SHOE_GEO = new THREE.BoxGeometry(0.12, 0.1, 0.28);
function muzzle (m) {
  const p = new THREE.Vector3(0, -0.76, 0.02);
  (m.gun || m.u.armR).localToWorld(p);
  return p;
}
function fire (m) {
  const V = A.V, hit = chance(MAFIA.HIT);
  const tx = hit ? V.x + rand(-0.6, 0.6) : V.x + rand(-3.5, 3.5), tz = hit ? V.z + rand(-0.6, 0.6) : V.z + rand(-3.5, 3.5);
  M.stats.shots++;
  m.kick = 1;
  if (A.ADULT) {
    const p = muzzle(m);
    const fl = new THREE.Mesh(FLASH_GEO, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 1, depthWrite: false }));
    fl.position.copy(p);
    A.scene.add(fl);
    const ty = (V.y || A.groundH(V.x, V.z)) + (hit ? 0.9 : 0.2);
    const g = new THREE.BufferGeometry().setFromPoints([p.clone(), new THREE.Vector3(tx, ty, tz)]);
    const tr = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9 }));
    A.scene.add(tr);
    M.fx.push({ o: fl, life: 0.07 }, { o: tr, life: 0.06, geo: g });
    if (A.Snd) { A.Snd.noise(0.1, 0.34); A.Snd.blip(160, 0.07, 'square', 0.16); }
    if (hit) land(true, tx, tz);
    else if (A.sparks) A.sparks(tx, 0.1, tz, 4);
  } else {
    // детская: помидор или ботинок по дуге, долетает за 0,6 с
    const tomato = chance(0.6);
    const o = new THREE.Mesh(tomato ? TOMATO_GEO : SHOE_GEO, lam(tomato ? '#e0322c' : '#4a3426'));
    const p = new THREE.Vector3(0, -0.6, 0); m.u.armR.localToWorld(p);
    o.position.copy(p);
    A.scene.add(o);
    // упреждение: куда машина доедет за время полёта (наполовину)
    const T = 0.6, ax = tx + (V.vx || 0) * T * 0.5, az = tz + (V.vz || 0) * T * 0.5;
    M.fx.push({ o, life: T, fly: { x0: p.x, y0: p.y, z0: p.z, x1: ax, z1: az, T, t: 0, tomato }, geoKeep: true });
    if (A.Snd) A.Snd.blip(520, 0.08, 'triangle', 0.1);
  }
}
/* попало в машину или упало рядом */
function land (hit, x, z, tomato) {
  const V = A.V;
  const onCar = hit || Math.hypot(x - V.x, z - V.z) < 2.2;
  if (onCar) {
    M.stats.hits++;
    if (A.hurt) A.hurt(MAFIA.DMG);
    if (A.ADULT) { if (A.sparks) A.sparks(V.x, 1, V.z, 6); if (A.Snd) A.Snd.blip(900, 0.04, 'square', 0.12); }
    else if (tomato) splat(V.x, (V.y || A.groundH(V.x, V.z)) + 1.2, V.z, 9);
    else if (A.puff) A.puff(V.x, 1.2, V.z);
  } else if (!A.ADULT) {
    if (tomato) splat(x, A.groundH(x, z) + 0.2, z, 6);
    else if (A.puff) A.puff(x, 0.2, z);
  }
}
/* помидор всмятку: красные брызги */
const DROP_GEO = new THREE.BoxGeometry(0.09, 0.09, 0.09);
function splat (x, y, z, n) {
  if (A.Snd) A.Snd.noise(0.08, 0.14);
  for (let i = 0; i < n; i++) {
    const o = new THREE.Mesh(DROP_GEO, new THREE.MeshBasicMaterial({ color: chance(0.7) ? 0xd8261e : 0xff6a4a }));
    o.position.set(x, y, z);
    A.scene.add(o);
    M.fx.push({ o, life: rand(0.5, 0.8), vel: [rand(-3, 3), rand(1.5, 4), rand(-3, 3)] });
  }
}
function fxStep (dt) {
  for (let i = M.fx.length - 1; i >= 0; i--) {
    const f = M.fx[i];
    f.life -= dt;
    if (f.fly) {
      const q = f.fly; q.t += dt;
      const k = Math.min(1, q.t / q.T), gy = A.groundH(q.x1, q.z1) + 0.6;
      f.o.position.set(q.x0 + (q.x1 - q.x0) * k, q.y0 + (gy - q.y0) * k + Math.sin(k * Math.PI) * 2.2, q.z0 + (q.z1 - q.z0) * k);
      f.o.rotation.x += dt * 9; f.o.rotation.z += dt * 6;
      if (k >= 1) { land(false, q.x1, q.z1, q.tomato); f.life = 0; }
    } else if (f.vel) {
      f.vel[1] -= 14 * dt;
      f.o.position.x += f.vel[0] * dt; f.o.position.y += f.vel[1] * dt; f.o.position.z += f.vel[2] * dt;
    } else if (f.o.material) f.o.material.opacity = Math.max(0, f.life / 0.07);
    if (f.life <= 0) {
      A.scene.remove(f.o);
      if (f.o.material) f.o.material.dispose();
      if (f.geo) f.geo.dispose();
      M.fx.splice(i, 1);
    }
  }
}

/* ── шаг ── */
function manStep (m, dt) {
  const V = A.V, S = A.S, sp = Math.hypot(V.vx, V.vz), u = m.u;
  const d = Math.hypot(V.x - m.x, V.z - m.z);
  m.t += dt; m.life -= dt;
  if (m.bubble && (m.bubT -= dt) <= 0) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }

  // заказ ушёл дальше, а мы далеко — или простоял своё — уходит со сцены
  if ((m.life <= 0 || (M.stop && A.S.order && A.S.order.stops[A.S.order.idx] !== M.stop) || !A.S.order) && d > 60) { clear(); return; }
  if (m.life <= 0 && m.st !== 'shoot') m.st = 'leave';

  if (m.st === 'idle' || m.st === 'warn') {
    if (d < MAFIA.WARN_R) {
      if (m.st === 'idle') {
        m.st = 'warn'; m.t = 0;
        const line = A.ADULT ? t('пиздуй отсюда, а то порешу') : t('вали отсюда, а то пожалеешь');
        say(m, line, '#1b1b20');
        if (A.toast) A.toast('«' + line + '»');
      } else if (m.t > MAFIA.GRACE) {
        m.st = 'shoot'; m.fireT = 0.25;
        say(m, A.ADULT ? t('я предупреждал') : t('ну, держи!'), '#d9342c');
      }
    } else if (m.st === 'warn' && d > MAFIA.WARN_R + 4) m.st = 'idle';
  } else if (m.st === 'shoot') {
    if (d > MAFIA.STOP_R || S.state === 'over' || S.state === 'dying') {
      m.st = 'idle';
      if (d > MAFIA.STOP_R) say(m, t('и не возвращайся'), '#1b1b20');
    } else if (m.stun <= 0 && (m.fireT -= dt) <= 0) { m.fireT = MAFIA.RATE * rand(0.85, 1.15); fire(m); }
  }

  // поза: стоит, руки сложены; целится — правая рука на машину
  const aimOn = m.st === 'shoot' || m.st === 'warn';
  m.aim = damp(m.aim, m.st === 'shoot' ? 1 : 0, 8, dt);
  m.kick = Math.max(0, m.kick - dt * 6);
  m.stun = Math.max(0, m.stun - dt);
  let walk = false;
  if (m.st === 'leave') {
    // уходит прочь от машины и пропадает за 40 м
    const an = Math.atan2(m.x - V.x, m.z - V.z);
    m.x += Math.sin(an) * 1.4 * dt; m.z += Math.cos(an) * 1.4 * dt;
    if (A.pushOut) A.pushOut(m, 0.45);
    m.h = damp(m.h, m.h + wrap(an - m.h), 6, dt);
    walk = true;
    if (d > 45) { clear(); return; }
  } else if (aimOn || d < 40) m.h = damp(m.h, m.h + wrap(Math.atan2(V.x - m.x, V.z - m.z) - m.h), 5, dt);
  m.ph += dt * (walk ? 7 : 1.5);
  const sw = walk ? Math.sin(m.ph) * 0.7 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (A.ADULT) {
    u.armR.rotation.x = walk ? -sw * 0.6 : -0.25 - m.aim * 1.35 - m.kick * 0.35;
    u.armL.rotation.x = walk ? sw * 0.6 : m.st === 'warn' ? -0.9 + Math.sin(m.t * 6) * 0.25 : -0.2;   // грозит пальцем
  } else {
    u.armR.rotation.x = walk ? -sw * 0.6 : m.st === 'shoot' ? -2.6 + Math.min(1, m.kick * 1.5) * 2.2 : -0.25;   // замах — бросок
    u.armL.rotation.x = walk ? sw * 0.6 : m.st === 'warn' ? -0.9 + Math.sin(m.t * 6) * 0.25 : -0.2;
  }
  m.grp.position.set(m.x, A.groundH(m.x, m.z) + (A.curbAt ? A.curbAt(m.x, m.z) : 0), m.z);
  m.grp.rotation.y = m.h;

  // наезд — как у всех прохожих: прямоугольник кузова (CAR_L + 0,5 × CAR_W + 0,35), не уже.
  // Быстрее KO_KMH (20 км/ч, hits.js TIER.FALL) — сбит: лежит / разорвало — решает скорость (hits.js).
  // Медленнее — он твёрдый: машина его толкает, а не проезжает сквозь (раньше при ударе медленнее
  // 40 км/ч машину гасило до четверти скорости, она ползла меньше 7 км/ч — и проверка не работала).
  const fx = Math.sin(V.h), fz = Math.cos(V.h), ex = m.x - V.x, ez = m.z - V.z;
  const al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  const HL = (A.CAR_L || 2.2) + 0.5, HW = (A.CAR_W || 1) + 0.35;
  m.bumpT = Math.max(0, (m.bumpT || 0) - dt);
  if (Math.abs(al) < HL && Math.abs(ac) < HW) {
    if (sp * 3.6 >= MAFIA.KO_KMH) {
      m.dead = 1;
      if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
      A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, V.vx, V.vz);
      A.dropMesh(m.grp);
      if (A.onRunOver) A.onRunOver();
      M.stats.ko++;
      if (A.reward) A.reward(MAFIA.KO_PAY, A.ADULT ? t('завалил мафиози') : t('уложил мафиози'));
      M.man = null;
      return;
    }
    // вытолкнуть из-под кузова — в ближайшую сторону: вбок или вперёд/назад от бампера
    const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
    if (outW <= outL) { const k = ac >= 0 ? outW : -outW; m.x += fz * k; m.z -= fx * k; }
    else { const k = al >= 0 ? outL : -outL; m.x += fx * k; m.z += fz * k; }
    if (A.pushOut) A.pushOut(m, 0.45);
    if (m.bumpT <= 0 && sp > 1) {
      m.bumpT = 1;
      if (A.bump) A.bump();
      m.stun = 0.5;
      if (m.st !== 'shoot') { m.st = 'shoot'; m.fireT = 0.6; }
      say(m, A.ADULT ? t('ты чё, бессмертный?') : t('ах ты так?!'), '#d9342c');
    }
  }
}

export function step (dt, api) {
  if (api) A = api;
  if (!A || !A.CAREER) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.MAFIA) window.__dlv.MAFIA = DEBUG;
  const S = A.S;
  if (!S || S.state === 'title' || S.state === 'over') { clear(); fxStep(dt); return; }
  if (S.state === 'drive') roll();
  if (M.man) manStep(M.man, dt);
  fxStep(dt);
}

/* для отладки: __dlv.MAFIA.spawn() — у текущего клиента (или впереди машины), next() — на следующем адресе наверняка */
export const DEBUG = { M, MAFIA, spawn: (x, z) => spawn(x, z), next: () => { M.force = true; M.stop = null; return true; }, clear };
