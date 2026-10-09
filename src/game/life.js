/* ──────────────────────────────────────────────────────────────────────────
   Жизнь улиц: парочки, богачи (и чёрная машина с шофёром), графитисты у
   гаражей и промки, воздушные змеи и дроны в парках.

   Всё заводится только рядом с курьером (как «ночные компании»): раз в
   секунду смотрим, кого убрать — ушёл далеко, — и кого добавить, с потолком
   на каждый вид. Люди — те же makeHuman, уходят через dropMesh. Граффити
   остаются на стенах до конца смены: стена помнит, что на ней нарисовано
   и докуда (спугнули — следующий дорисует). Переменных игры модуль не
   видит — всё нужное приходит в api (LIFE_API в game.js).
   ────────────────────────────────────────────────────────────────────────── */
import { t } from '../i18n/index.js';
import { makePerson } from './people.js';
import { MAP } from './map.js';
import * as SEAS from './seasons.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dampAng = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt));

let A = null, THREE = null, V3 = null, V3b = null;
/* для трафика: кого пропускать на зебре (x, z, dead) */
export const WALKERS = [];
const COUPLES = [], RICH = [], ARTISTS = [], FLYERS = [], LUX = [], WALLS = [], PARKS = [], TAGS = [];
export const STATE = { COUPLES, RICH, ARTISTS, FLYERS, LUX, WALLS, PARKS, TAGS, CAP: null, stats: { tags: 0, spawned: 0, ms: 0, setupMs: 0 } };
let CAP = null;

/* насколько холодно (0…1) — та же кривая, по которой одеваются люди (seasons.js, warm) */
function cold () {
  try { return SEAS.warmth(); } catch (e) { return 0; }
}
const winter = () => cold() > 0.6 || (SEAS.snowy && SEAS.snowy());
const deepWinter = () => cold() > 0.9;

/* ─── общее для людей ─── */
const gy = (x, z) => A.groundH(x, z) + A.curbAt(x, z);
const far = o => Math.hypot(o.x - A.V.x, o.z - A.V.z);
function member (person, o) {
  const grp = A.makeHuman(person, o);
  A.scene.add(grp);
  STATE.stats.spawned++;
  return { grp, u: grp.userData, person, x: 0, z: 0, dead: 0, gone: 0, shock: 0, say: null, sayT: 0, ph: rand(0, 9), crossT: rand(20, 90), speed: 1.2 };
}
function unsay (m) { if (m.say) { if (m.say.parent) m.say.parent.remove(m.say); m.say.material.dispose(); m.say = null; } }
function say (m, text, col, dur = 2.2) { unsay(m); if (!m.gone) { m.say = A.sayBubble(m.grp, text, col || '#5a4a9a', 2.7); m.sayT = dur; } }
function sayStep (m, dt) { if (m.say && (m.sayT -= dt) <= 0) unsay(m); }
function dropMember (m) { unsay(m); if (!m.gone) { A.dropMesh(m.grp); m.gone = 1; } m.dead = 1; }
/* тротуар не нашёлся (глушь, промзона без улиц) — такого не водим: уберём при обходе */
function walkable (p) {
  if (p.w || p.path || p.goTo) return true;
  A.walkSpawn(p, 45, 300);
  if (p.w || p.path) return true;
  p.lost = 1;
  return false;
}
function place (m, bob = 0) { m.grp.position.set(m.x, gy(m.x, m.z) + bob, m.z); }
function walkPose (u, ph, k = 0.8) {
  const sw = Math.sin(ph) * k;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
  u.armL.rotation.z = 0; u.armR.rotation.z = 0;
  return sw;
}
function stand (u, dt, k = 6) {
  for (const m of [u.legL, u.legR, u.armL, u.armR]) { m.rotation.x = damp(m.rotation.x, 0, k, dt); m.rotation.z = damp(m.rotation.z, 0, k, dt); }
  u.head.rotation.x = damp(u.head.rotation.x, 0, k, dt); u.head.rotation.y = damp(u.head.rotation.y, 0, k, dt);
}
/* склейка мелочи (цепь, портфель, баллончик) — один меш с общим материалом людей */
function bits (fn) {
  const L = [];
  fn((w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => A.put(L, new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz));
  return new THREE.Mesh(A.mergeGeos(L), A.HUMAN_VC);
}
/* под колёса: та же коробка, что у компаний и дорожников */
function carHits (x, z, pad = 0) {
  const V = A.V;
  if (V.vx * V.vx + V.vz * V.vz < 9) return false;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), dx = x - V.x, dz = z - V.z;
  return Math.abs(dx * fx + dz * fz) < A.CAR_L + 0.5 + pad && Math.abs(dx * fz - dz * fx) < A.CAR_W + 0.35 + pad;
}
function kill (m) {
  unsay(m);
  m.dead = 1; m.gone = 1;
  A.dropMesh(m.grp);
  A.gibHuman(m, A.V.vx, A.V.vz);            // сам зовёт scare и скорую; в детской — «тряпичная кукла»
  A.onKill();
}
const handWorld = (m, arm = 'armR', y = -0.58) => { m.grp.updateMatrixWorld(true); return m.u[arm].localToWorld(V3.set(0, y, 0.02)); };

/* стоит ли точка на проезжей части (там не останавливаются болтать и целоваться — только на тротуаре) */
function onCarriage (o) {
  const r = A.nearestRoad(o.x, o.z, 5, 1);
  return !!(r && r.d < r.seg.w / 2 + 0.5);
}

/* ═════════════════ парочки ═════════════════
   Идут рядом в ногу по тротуару (центр пары — обычный «пешеход» игры,
   люди — по бокам), часть держится за руки и поглядывает друг на друга,
   иногда останавливаются поболтать. Сбили одного — второй реагирует:
   во взрослой бежит или замирает, в детской — стоит на коленях рядом. */
function spawnCouple () {
  const fa = chance(0.5), fb = chance(0.82) ? !fa : fa;
  const a = member(makePerson({ fem: fa })), b = member(makePerson({ fem: fb }));
  const c = { a, b, x: 0, z: 0, h: 0, ph: rand(0, 9), crossT: rand(20, 90), yard: chance(0.3),
    speed: rand(1.0, 1.3) * Math.min(a.u.pace, b.u.pace), hands: chance(0.65),
    chat: 0, chatT: rand(10, 35), lookT: rand(2, 5), look: 0, heartT: rand(4, 10), shock: 0, react: null, fresh: 1, huddle: winter() };
  // зимой идут медленнее, прижавшись друг к другу, и не останавливаются болтать на морозе
  if (c.huddle) { c.speed *= 0.78; c.hands = true; c.chatT = rand(60, 120); }
  A.walkSpawn(c, 45, 170);
  COUPLES.push(c);
}
const dropCouple = c => { dropMember(c.a); dropMember(c.b); };

function coupleStep (c, dt) {
  const { a, b } = c, pair = !a.dead && !b.dead, solo = pair ? null : !a.dead ? a : !b.dead ? b : null;
  sayStep(a, dt); sayStep(b, dt);
  if (!pair && !solo) return;
  const d = far(c);
  for (const m of [a, b]) if (!m.gone) m.grp.visible = d < 130;
  if (c.react && solo) { reactStep(c, solo, dt); hitCheck(c); return; }
  let ang = NaN, moving = false;
  // на зебре не замирают (испуг, болтовня) — доходят до тротуара быстрым шагом
  if (c.shock > 0 && !c.cross) c.shock -= dt;
  else if (c.chat > 0 && !c.cross) c.chat -= dt;
  else {
    if (c.shock > 0) c.shock -= dt;
    if (pair && (c.chatT -= dt) <= 0 && !c.cross && !c.goTo && !onCarriage(c)) { c.chat = rand(4, 9); c.chatT = rand(25, 60); }
    if (!walkable(c)) return;
    ang = A.walkerStep(c, dt, c.huddle ? 5.2 : 6.5);
    moving = true;
  }
  if (A.dodgeCar) A.dodgeCar(c, dt);             // стоящую машину обходят, а не проходят насквозь
  if (moving) A.pushOut(c, pair ? 0.8 : 0.45);
  if (!Number.isNaN(ang)) c.h = c.fresh ? ang : dampAng(c.h, ang, 6, dt);
  c.fresh = 0;
  const off = pair ? (c.huddle ? 0.3 : 0.42) : 0, rx = Math.cos(c.h), rz = -Math.sin(c.h);
  a.x = c.x - rx * off; a.z = c.z - rz * off; b.x = c.x + rx * off; b.z = c.z + rz * off;
  const alive = pair ? [a, b] : [solo];
  for (const m of alive) place(m, moving ? Math.abs(Math.sin(c.ph)) * 0.04 : 0);
  hitCheck(c);
  if (!moving || !pair) for (const m of alive) m.grp.rotation.z = damp(m.grp.rotation.z, 0, 8, dt);
  if (c.shock > 0) {
    for (const m of alive) {
      if (m.gone) continue;
      if (moving) { m.grp.rotation.y = dampAng(m.grp.rotation.y, c.h, 10, dt); walkPose(m.u, c.ph); }   // испугались на зебре — бегом с поднятыми руками
      A.handsUp(m.u, dt);
      if (!moving) { m.u.legL.rotation.x = damp(m.u.legL.rotation.x, 0, 10, dt); m.u.legR.rotation.x = damp(m.u.legR.rotation.x, 0, 10, dt); }
    }
    return;
  }
  if (c.chat > 0) {
    // лицом друг к другу; один говорит руками, второй кивает
    const T = performance.now() / 1000, who = Math.floor(c.chat / 1.7) % 2;
    a.grp.rotation.y = dampAng(a.grp.rotation.y, c.h + Math.PI / 2, 5, dt);
    b.grp.rotation.y = dampAng(b.grp.rotation.y, c.h - Math.PI / 2, 5, dt);
    [a, b].forEach((m, i) => {
      const u = m.u;
      stand(u, dt);
      if (i === who) { u.armL.rotation.x = -0.55 + Math.sin(T * 5.5 + i) * 0.35; u.armR.rotation.x = -0.25 + Math.sin(T * 3.1) * 0.15; }
      else u.head.rotation.x = Math.sin(T * 4) * 0.12;
    });
    if ((c.heartT -= dt) <= 0) { c.heartT = rand(3, 7); if (d < 70) A.emote(c.x, 2.3, c.z, 'heart', 1); }
    return;
  }
  // идут в ногу: внутренние руки сцеплены и качаются вместе
  const sw = Math.sin(c.ph) * 0.8;
  for (const m of alive) { m.grp.rotation.y = dampAng(m.grp.rotation.y, c.h, 10, dt); walkPose(m.u, c.ph); }
  if (pair && c.hands) {
    a.u.armR.rotation.x = b.u.armL.rotation.x = -0.1 + sw * 0.18;
    a.u.armR.rotation.z = 0.26; b.u.armL.rotation.z = -0.26;
  }
  if (pair && c.huddle) {
    // прижались: внутренние руки — за спину друг другу, корпус наклонён к соседу, головы в плечи
    a.u.armR.rotation.x = b.u.armL.rotation.x = 0.35;
    a.u.armR.rotation.z = 0.5; b.u.armL.rotation.z = -0.5;
    a.grp.rotation.z = damp(a.grp.rotation.z, -0.07, 6, dt); b.grp.rotation.z = damp(b.grp.rotation.z, 0.07, 6, dt);
    a.u.head.rotation.x = b.u.head.rotation.x = 0.15;
  }
  if ((c.lookT -= dt) <= 0) { c.look = pair && !c.look ? 1 : 0; c.lookT = c.look ? rand(1.2, 2.4) : rand(3, 8); }
  a.u.head.rotation.y = damp(a.u.head.rotation.y, c.look ? 0.75 : 0, 6, dt);
  b.u.head.rotation.y = damp(b.u.head.rotation.y, c.look ? -0.75 : 0, 6, dt);
  if (pair && c.hands && (c.heartT -= dt) <= 0) { c.heartT = rand(9, 20); if (d < 60) A.emote(c.x, 2.3, c.z, 'heart', 1); }
}

function hitCheck (c) {
  for (const [m, o] of [[c.a, c.b], [c.b, c.a]]) {
    if (m.dead || !carHits(m.x, m.z)) continue;
    kill(m);
    if (o.dead) continue;
    // второй: к нему на колени (детская) или прочь / замер (взрослая)
    const mode = A.ADULT ? (chance(0.55) ? 'flee' : 'freeze') : 'kneel';
    c.react = { mode, t: 0, phase: 0, x: m.x, z: m.z };
    c.x = o.x; c.z = o.z; c.chat = 0; c.shock = 0; c.cross = null; c.goTo = null;
    const fem = m.u.fem;
    say(o, mode === 'kneel' ? (fem ? t('Милая, ты как?!') : t('Милый, ты как?!')) : mode === 'flee' ? t('А-а-а! Помогите!') : t('Нет!..'), '#c23a4a', 2.6);
  }
}

function reactStep (c, s, dt) {
  const R = c.react, u = s.u, g = s.grp;
  R.t += dt;
  const dx = R.x - c.x, dz = R.z - c.z, d = Math.hypot(dx, dz) || 0.01;
  let bob = 0;
  if (R.mode === 'kneel') {
    if (R.phase === 0) {
      if (d > 0.9 && R.t < 4) {
        c.ph += dt * 13;
        const k = Math.min(1, 3.2 * dt / d);
        c.x += dx * k; c.z += dz * k;
        walkPose(u, c.ph, 1);
        g.rotation.y = dampAng(g.rotation.y, Math.atan2(dx, dz), 10, dt);
        s.x = c.x; s.z = c.z; place(s, Math.abs(Math.sin(c.ph)) * 0.08);
        return;
      }
      R.phase = 1; R.t = 0;
    }
    // на одном колене: бедро вперёд, другая нога назад, руки тянутся, голова вниз
    g.rotation.y = dampAng(g.rotation.y, Math.atan2(dx, dz), 6, dt);
    u.legL.rotation.x = damp(u.legL.rotation.x, -1.25, 8, dt);
    u.legR.rotation.x = damp(u.legR.rotation.x, 1.0, 8, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.9 + Math.sin(R.t * 3) * 0.12, 6, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, -0.9 - Math.sin(R.t * 3) * 0.12, 6, dt);
    u.head.rotation.x = damp(u.head.rotation.x, 0.4, 5, dt);
    bob = -0.36 * g.scale.y * Math.min(1, R.t * 3);
    if (R.t > 6.5) endReact(c, s);
  } else if (R.mode === 'flee') {
    if (R.t < 0.9) {
      A.handsUp(u, dt);
      g.rotation.y = dampAng(g.rotation.y, Math.atan2(dx, dz), 10, dt);
    } else {
      c.ph += dt * 16;
      const k = 4.2 * dt / d;
      c.x -= dx * k; c.z -= dz * k;
      A.pushOut(c, 0.45);
      g.rotation.y = dampAng(g.rotation.y, Math.atan2(-dx, -dz), 10, dt);
      const sw = Math.sin(c.ph) * 1.1;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -2.6 + Math.sin(c.ph) * 0.5; u.armR.rotation.x = -2.6 - Math.sin(c.ph) * 0.5;
      bob = Math.abs(Math.sin(c.ph)) * 0.1;
      if (R.t > 6) endReact(c, s);
    }
  } else {
    A.handsUp(u, dt, 0.85);
    g.rotation.y = dampAng(g.rotation.y, Math.atan2(dx, dz), 8, dt);
    if (R.t > 3.5) endReact(c, s);
  }
  s.x = c.x; s.z = c.z;
  place(s, bob);
}
function endReact (c, s) {
  c.react = null; c.hands = false; c.fresh = 1;
  for (const m of [s.u.legL, s.u.legR, s.u.armL, s.u.armR]) { m.rotation.x = 0; m.rotation.z = 0; }
  s.u.head.rotation.x = 0;
  A.walkBack(c);
}

/* ═════════════════ богачи ═════════════════
   Костюм или шуба, тёмные очки, золотая цепь, портфель или сумочка, у
   кого-то — маленькая собачка на поводке. Иногда у бордюра проезда стоит
   чёрная машина с тонировкой и шофёр ждёт у двери. */
const SUITS = ['#1f2328', '#2b2f3a', '#3a3036', '#2e3a4a', '#4a4540'];
const FURS = ['#8a6a4e', '#e8e0d4', '#4a3a30', '#b89a7a', '#d8c8b0', '#2b2a30'];
const GOLD = '#e8c14a';
const shadeHex = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

function spawnRich () {
  const fem = chance(0.45), person = makePerson({ fem }), L = person.look;
  L.pack = null; L.top = 'jacket';
  L.glasses = chance(0.75) ? 'sun' : 'square'; L.glassC = '#1d1a1f';
  let coat = null;
  if (fem) {
    coat = pick(FURS);
    L.jacket = L.shirt = coat; L.bottom = chance(0.5) ? 'skirt' : 'pants';
    L.skirt = '#2b2a30'; L.pants = '#1f2328'; L.legs = '#2b2a30';
    L.lip = pick(['#c23a4a', '#8a2a3a']); L.shoes = pick(['#1f1c1a', '#8a2a2a']);
    L.head = chance(0.35) ? 'hat' : 'none'; L.headC = coat;
  } else {
    const s = pick(SUITS);
    L.jacket = L.pants = s; L.shirt = '#f4f1ea'; L.bottom = 'pants'; L.shoes = '#1f1c1a';
    L.head = chance(0.2) ? 'hat' : 'none'; L.headC = '#2b2a30';
  }
  const fat = chance(fem ? 0.08 : 0.35);
  const m = member(person, { fat });
  const u = m.u, z = fat ? 0.25 : 0.145, dog = chance(0.4);
  const tie = !fem && chance(0.7), chain = fem || chance(0.5);
  m.grp.add(bits(b => {
    if (chain) {
      const w = fat ? 0.2 : 0.15;
      b(w, 0.025, 0.02, GOLD, -w * 0.38, 1.21, z, 0, 0, -0.55); b(w, 0.025, 0.02, GOLD, w * 0.38, 1.21, z, 0, 0, 0.55);
      b(0.05, 0.06, 0.02, GOLD, 0, 1.14, z + 0.005);
    }
    if (tie) { b(0.08, 0.06, 0.03, '#6b1f2a', 0, 1.24, z - 0.01); b(0.07, 0.34, 0.02, pick(['#8a2a2a', '#2e4a8a', '#b08a2a']), 0, 1.05, z - 0.012); }
    if (coat) {
      const td = fat ? 0.44 : 0.26;
      b(0.54, 0.13, td + 0.14, shadeHex(coat, 1.15), 0, 1.3, 0);             // меховой воротник
      b(0.5, 0.36, td * 1.25, coat, 0, 0.58, 0);                                // длинные полы шубы
    }
  }));
  // в руке: мужчине — портфель, женщине — сумочка (поводок — в левой)
  if (!fem) u.armR.add(bits(b => { b(0.42, 0.3, 0.1, pick(['#3a2a22', '#1f1c1a', '#5a3a22']), 0, -0.74, 0); b(0.14, 0.04, 0.03, '#1f1c1a', 0, -0.57, 0); b(0.3, 0.02, 0.11, GOLD, 0, -0.62, 0); }));
  else (dog ? u.armR : u.armL).add(bits(b => { b(0.26, 0.2, 0.12, pick(['#8a2a2a', '#1f1c1a', '#e8e0d4', '#b08a2a']), 0, -0.5, 0.06); b(0.03, 0.2, 0.03, GOLD, 0, -0.34, 0.06); }));
  m.speed = rand(0.9, 1.15) * u.pace; m.yard = chance(0.2);
  const r = { m, dog: dog ? makeDog() : null, shock: 0, sayT: rand(8, 20), fresh: 1 };
  A.walkSpawn(m, 45, 170);
  if (r.dog) { r.dog.x = m.x; r.dog.z = m.z; }
  RICH.push(r);
}

/* собачка: туловище одним мешем, передние и задние ноги — парами */
const LEASH_MAT = { m: null };
function makeDog () {
  const col = pick(['#f4f1ea', '#e0c8a0', '#2b2a30', '#b07a4a', '#d9d2c2']), dk = shadeHex(col, 0.7);
  const g = new THREE.Group();
  g.add(bits(b => {
    b(0.22, 0.2, 0.44, col, 0, 0.3, 0);
    b(0.2, 0.2, 0.2, col, 0, 0.45, 0.28);
    b(0.11, 0.08, 0.1, dk, 0, 0.41, 0.42); b(0.05, 0.04, 0.03, '#1b1410', 0, 0.44, 0.475);
    b(0.06, 0.1, 0.04, dk, -0.075, 0.58, 0.25); b(0.06, 0.1, 0.04, dk, 0.075, 0.58, 0.25);
    b(0.04, 0.04, 0.04, '#1b1410', -0.05, 0.49, 0.38); b(0.04, 0.04, 0.04, '#1b1410', 0.05, 0.49, 0.38);
    b(0.05, 0.05, 0.22, col, 0, 0.42, -0.28, -0.7);
    b(0.23, 0.05, 0.05, '#c23a3a', 0, 0.42, 0.17);
  }));
  const legs = [];
  for (const zz of [0.15, -0.15]) {
    const pv = new THREE.Group();
    pv.position.set(0, 0.22, zz);
    pv.add(bits(b => { b(0.06, 0.22, 0.06, col, -0.07, -0.1, 0); b(0.06, 0.22, 0.06, col, 0.07, -0.1, 0); }));
    g.add(pv); legs.push(pv);
  }
  g.scale.setScalar(1.15);
  A.scene.add(g);
  if (!LEASH_MAT.m) LEASH_MAT.m = new THREE.LineBasicMaterial({ color: 0xc23a3a });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const leash = new THREE.Line(lg, LEASH_MAT.m);
  leash.frustumCulled = false;
  A.scene.add(leash);
  return { g, legs, leash, x: 0, z: 0, h: 0, ph: 0, sitT: 0 };
}
function dropDog (dg) {
  A.scene.remove(dg.g); A.scene.remove(dg.leash);
  dg.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  dg.leash.geometry.dispose();
}
function dropRich (r) { dropMember(r.m); if (r.dog) { dropDog(r.dog); r.dog = null; } }

const RICH_LINES = /*i18n*/ ['Шофёр, машину!', 'Без сахара, я сказал', 'Продавай всё!', 'Опять пробки…', 'Не наш уровень'];
function richStep (r, dt) {
  const m = r.m, u = m.u, dg = r.dog;
  sayStep(m, dt);
  const d = far(m);
  if (!m.gone) m.grp.visible = d < 130;
  if (dg) dg.g.visible = dg.leash.visible = d < 130;
  if (m.dead) {
    // хозяина нет — собачка сидит на месте, потом убегает
    if (dg) {
      dg.leash.visible = false;
      dg.legs[1].rotation.x = damp(dg.legs[1].rotation.x, -1.2, 6, dt);
      dg.g.position.y = gy(dg.x, dg.z) - 0.08;
      if ((dg.sitT += dt) > 8) { dropDog(dg); r.dog = null; }
    }
    return;
  }
  let ang = NaN, moving = false;
  if (r.shock > 0) { r.shock -= dt; A.handsUp(u, dt); }
  else if (walkable(m)) { ang = A.walkerStep(m, dt, 5.5); A.pushOut(m, 0.45); moving = true; }
  if (!Number.isNaN(ang)) { m.grp.rotation.y = r.fresh ? ang : dampAng(m.grp.rotation.y, ang, 7, dt); r.fresh = 0; }
  place(m, moving ? Math.abs(Math.sin(m.ph)) * 0.03 : 0);
  if (moving) {
    walkPose(u, m.ph, 0.6);
    u.armR.rotation.x *= 0.4;                     // с портфелем рукой не машут
    if (dg) u.armL.rotation.x = -0.35;            // поводок натянут
    u.head.rotation.x = -0.08;                    // нос повыше
  }
  // изредка бросает реплику — если курьер рядом и слышит
  if ((r.sayT -= dt) <= 0) { r.sayT = rand(14, 30); if (d < 40 && !m.say) say(m, t(pick(RICH_LINES)), '#8a6a1a', 2.4); }
  if (!m.gone && carHits(m.x, m.z)) { kill(m); return; }
  if (!dg) return;
  // собачка семенит слева чуть впереди, поводок — от руки к ошейнику
  const h = m.grp.rotation.y, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const tx = m.x - rx * 0.8 + fx * 0.5, tz = m.z - rz * 0.8 + fz * 0.5;
  const ox = dg.x, oz = dg.z;
  dg.x = damp(dg.x, tx, 4, dt); dg.z = damp(dg.z, tz, 4, dt);
  const sp = Math.hypot(dg.x - ox, dg.z - oz) / Math.max(dt, 1e-3);
  if (sp > 0.2) dg.h = dampAng(dg.h, Math.atan2(dg.x - ox, dg.z - oz), 8, dt);
  dg.ph += dt * (4 + sp * 9);
  const k = sp > 0.2 ? 0.7 : 0;
  dg.legs[0].rotation.x = Math.sin(dg.ph) * k; dg.legs[1].rotation.x = -Math.sin(dg.ph) * k;
  dg.g.position.set(dg.x, gy(dg.x, dg.z) + (k ? Math.abs(Math.sin(dg.ph)) * 0.05 : 0), dg.z);
  dg.g.rotation.y = dg.h;
  if (d < 130) {
    const hp = handWorld(m, 'armL', -0.55);
    dg.g.updateMatrixWorld(true);
    const cp = dg.g.localToWorld(V3b.set(0, 0.44, 0.2));
    const a = dg.leash.geometry.attributes.position;
    a.setXYZ(0, hp.x, hp.y, hp.z); a.setXYZ(1, cp.x, cp.y, cp.z); a.needsUpdate = true;
  }
}

/* ── чёрная машина с шофёром ──
   Ставим на проезд (service: дворы, подъезды к домам — трафик по ним не
   ездит, поэтому пробки не будет), у края полотна. Машина — в общем
   списке трафика как припаркованная: её так же мнёт, толкает и взрывает. */
function spawnLux () {
  const V = A.V;
  for (let k = 0; k < 30; k++) {
    const an = rand(0, Math.PI * 2), dd = rand(45, 160);
    const r = A.nearestRoad(V.x + Math.sin(an) * dd, V.z + Math.cos(an) * dd, 7, 1);
    if (!r || r.seg.c < 6 || r.seg.b || r.seg.x || r.d > 25) continue;
    const s = r.seg, L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (L < 9 || r.t < 0.15 || r.t > 0.85) continue;
    const ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L, side = chance(0.5) ? 1 : -1, nx = -uz * side, nz = ux * side;
    const o = s.w / 2 - 0.95, cx = r.x + nx * o, cz = r.z + nz * o;
    const drive = A.nearestRoad(cx, cz, 5, 1);
    if (drive && drive.d < drive.seg.w / 2 + 5) continue;                  // рядом с проезжей — нет
    if (Math.hypot(cx - V.x, cz - V.z) < 35 || !A.inBounds(cx, cz, 15)) continue;
    let bad = false;
    for (const [a, b] of [[2.4, 1], [2.4, -1], [-2.4, 1], [-2.4, -1]]) if (A.inHouse(cx + ux * a + nx * b, cz + uz * a + nz * b, 0.3)) bad = true;
    const px = cx + nx * 1.75 - ux * 0.4, pz = cz + nz * 1.75 - uz * 0.4;   // шофёр — у задней двери, со стороны края
    if (bad || A.inHouse(px, pz, 0.4)) continue;
    const probe = { x: cx, z: cz }; A.pushOut(probe, 1.2);
    if (Math.hypot(probe.x - cx, probe.z - cz) > 0.05) continue;
    if (A.TRAFFIC.some(q => Math.abs(q.x - cx) < 7 && Math.abs(q.z - cz) < 7)) continue;
    const model = pick(['sedan', 'sedan', 'suv']);
    const base = A.newCar(true);
    if (base.mesh.children[0]) base.mesh.children[0].geometry.dispose();       // лёгкая модель не нужна
    const mesh = A.makeCar('#0d0f14', false, model, false, { tint: true, lux: true });
    const car = { ...base, mesh, model, hl: mesh.userData.hl, x: cx, z: cz, h: Math.atan2(ux, uz) + (chance(0.5) ? Math.PI : 0), lux: 1 };
    A.poseOnSlope(car);
    A.scene.add(mesh);
    A.TRAFFIC.push(car);
    const drv = member(null, { shirt: '#1f2328', pants: '#1f2328', cap: '#1b1a1f', fat: false });
    drv.x = px; drv.z = pz; drv.h = Math.atan2(nx, nz) + rand(-0.6, 0.6);
    drv.grp.rotation.y = drv.h;
    place(drv);
    LUX.push({ car, drv, x: cx, z: cz, angry: 0, watchT: rand(4, 10), watch: 0, T: rand(0, 9) });
    return;
  }
}
function dropLux (l) {
  dropMember(l.drv);
  const c = l.car;
  c.gone = 1;                                   // трафик сам вычеркнет из списка
  A.scene.remove(c.mesh);
  c.mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
}
function luxStep (l, dt) {
  const m = l.drv, c = l.car, u = m.u;
  sayStep(m, dt);
  if (m.dead) return;
  const d = far(m);
  m.grp.visible = d < 130;
  l.T += dt;
  // машину шефа задели — возмущается
  if (!l.angry && (c.hp < 100 || c.knock || c.wreck || c.mesh.userData.dmg > 0)) {
    l.angry = 1; m.shock = 2.5;
    say(m, t('Эй! Это машина шефа!'), '#d9342c', 2.6);
    A.emote(m.x, 2.3, m.z, 'angry', 2);
  }
  if (m.shock > 0) { m.shock -= dt; A.handsUp(u, dt); m.grp.rotation.y = dampAng(m.grp.rotation.y, Math.atan2(A.V.x - m.x, A.V.z - m.z), 6, dt); }
  else if (l.watch > 0) {
    // смотрит на часы
    l.watch -= dt;
    u.armL.rotation.x = damp(u.armL.rotation.x, -1.5, 8, dt); u.armL.rotation.z = damp(u.armL.rotation.z, 0.5, 8, dt);
    u.head.rotation.x = damp(u.head.rotation.x, 0.35, 8, dt);
  } else {
    // руки за спиной, поглядывает по сторонам
    u.armL.rotation.x = damp(u.armL.rotation.x, 0.35, 5, dt); u.armR.rotation.x = damp(u.armR.rotation.x, 0.35, 5, dt);
    u.armL.rotation.z = damp(u.armL.rotation.z, 0.12, 5, dt); u.armR.rotation.z = damp(u.armR.rotation.z, -0.12, 5, dt);
    u.head.rotation.x = damp(u.head.rotation.x, 0, 5, dt);
    u.head.rotation.y = Math.sin(l.T * 0.35) * 0.7;
    if ((l.watchT -= dt) <= 0) { l.watchT = rand(8, 16); l.watch = 1.6; }
  }
  place(m);
  if (carHits(m.x, m.z)) kill(m);
}

/* ═════════════════ графитисты ═════════════════
   Стены — у гаражей, промки и сараев во дворах. Человек в капюшоне с
   баллончиком стоит у стены и «рисует»: картинка готова заранее (холст с
   выдуманной подписью из слогов), а на стену она проявляется пятнами по
   ходу руки. Облачко краски — точки общего облака. Резко подъехал —
   убегает, недорисованное остаётся; следующий, кто придёт к этой стене,
   продолжит с того же места. */
const SYL = ['ka', 'zo', 'ri', 'mo', 'te', 'vi', 'lu', 'na', 'ro', 'ki', 'pe', 'do', 'xa', 'yo', 'fi', 'ze', 'ba', 'gu', 'ne', 'ta', 'mi', 'ko', 'ru', 'se', 'wo', 'ja', 'ly', 'om', 'ax', 'ur', 'ek', 'iz', 'ok', 'vu'];
const END = ['', '', '', 'k', 'x', 'z', 'r', 's', 'o', '1', '7', 'er'];
// на всякий случай: ни ругательств, ни чужих слов, ни символики
const BAD = /suk|[hx]u[iyje]|pi[zd]|p[ie]d|eb|yob|job|bl[yj]|naz|fu[ck]|kak|sex|ass|kkk|zig|cum|gay|jew|nig|ss|mud|dur|zop|jop|pop|sr[ae]|kok|dic|tit|vag|anu|shi|666/i;
export function fakeTag () {
  for (let k = 0; k < 40; k++) {
    const s = pick(SYL) + (chance(0.65) ? pick(SYL) : '') + pick(END);
    if (s.length < 3 || s.length > 7 || BAD.test(s) || /(..)\1/.test(s)) continue;
    return s.toUpperCase();
  }
  return 'KOZE';
}
const PAL = [['#ff3d7f', '#ffd23f'], ['#3fd6ff', '#7a4dff'], ['#59e05a', '#fff05a'], ['#ff8a2b', '#ff3d3d'], ['#c77dff', '#ff9de6'], ['#2bd9a8', '#2b7fff'], ['#ffe14d', '#ff6a00'], ['#f4f1ea', '#3fd6ff']];
const FONT = fs => `900 ${fs}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
function star (x, cx, cy, r, col) {
  x.fillStyle = col; x.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r, a = i * Math.PI / 4; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}
function drawGraffiti (cv, style) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  const [c1, c2] = pick(PAL), ink = pick(['#1b1a22', '#2a1440', '#0f2a3a', '#3a0f1a']), text = fakeTag();
  let fs = Math.floor(H * (style === 'tag' ? 0.62 : 0.74));
  x.font = FONT(fs);
  while (fs > 6 && x.measureText(text).width > W * (style === 'tag' ? 0.84 : 0.78)) { fs--; x.font = FONT(fs); }
  x.textBaseline = 'middle'; x.textAlign = 'center'; x.lineJoin = 'round';
  const tw = x.measureText(text).width * (style === 'tag' ? 0.92 : 0.88), x0 = (W - tw) / 2, yc = H * 0.5;
  const letters = [];
  let cx = x0;
  for (const ch of text) {
    const w = x.measureText(ch).width * (style === 'tag' ? 0.92 : 0.88);
    letters.push({ ch, x: cx + w / 2, y: yc + rand(-1, 1) * H * 0.07, r: rand(-0.2, 0.2) * (style === 'tag' ? 1.4 : 1) });
    cx += w;
  }
  const each = fn => { for (const L of letters) { x.save(); x.translate(L.x, L.y); x.rotate(L.r); fn(L.ch); x.restore(); } };
  if (style === 'piece') {
    // тёмное облако-подложка, объём, белый контур, заливка двумя цветами, блики
    x.fillStyle = pick(['#2a1440', '#10304a', '#1b1a22', '#123a22']);
    const n = 6;
    for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(W * (0.1 + i * 0.8 / (n - 1)), H * 0.5 + rand(-0.1, 0.1) * H, H * rand(0.28, 0.4), H * rand(0.34, 0.46), 0, 0, 7); x.fill(); }
    x.fillStyle = ink;
    for (let dd = 3; dd >= 1; dd--) { x.save(); x.translate(dd, dd); each(ch => x.fillText(ch, 0, 0)); x.restore(); }
    x.strokeStyle = '#ffffff'; x.lineWidth = 3; each(ch => x.strokeText(ch, 0, 0));
    const g = x.createLinearGradient(0, yc - fs / 2, 0, yc + fs / 2);
    g.addColorStop(0, c1); g.addColorStop(0.55, c1); g.addColorStop(0.56, c2); g.addColorStop(1, c2);
    x.fillStyle = g; each(ch => x.fillText(ch, 0, 0));
    x.fillStyle = '#ffffff';
    for (const L of letters) x.fillRect((L.x - fs * 0.16) | 0, (L.y - fs * 0.26) | 0, 2, 2);
    star(x, W * rand(0.04, 0.12), H * rand(0.12, 0.3), H * 0.14, '#ffffff');
    if (chance(0.6)) star(x, W * rand(0.86, 0.96), H * rand(0.65, 0.88), H * 0.1, c2);
  } else if (style === 'throw') {
    // «throw-up»: пузатые буквы — толстый тёмный контур и светлая заливка
    x.strokeStyle = ink; x.lineWidth = Math.max(3, fs * 0.2); each(ch => x.strokeText(ch, 0, 0));
    x.fillStyle = chance(0.5) ? '#e4e6ee' : c1; each(ch => x.fillText(ch, 0, 0));
    x.strokeStyle = c2; x.lineWidth = 1; each(ch => x.strokeText(ch, 0, 0));
  } else {
    // тег: одним цветом, наискосок, подчёркивание-росчерк и потёки
    x.fillStyle = chance(0.4) ? ink : c1; each(ch => x.fillText(ch, 0, 0));
    x.strokeStyle = x.fillStyle; x.lineWidth = 2;
    x.beginPath(); x.moveTo(x0, yc + fs * 0.5); x.quadraticCurveTo(W / 2, yc + fs * 0.75, x0 + tw + 3, yc + fs * 0.25); x.stroke();
    for (let i = 0; i < 5; i++) x.fillRect(rand(x0, x0 + tw) | 0, (yc + fs * 0.3) | 0, 1, rand(2, H * 0.3) | 0);
  }
  // корона над первой буквой — классика
  if (chance(0.35)) {
    const L = letters[0], by = L.y - fs * 0.55, w = fs * 0.5;
    x.strokeStyle = style === 'tag' ? x.fillStyle : c2; x.lineWidth = 2; x.beginPath();
    x.moveTo(L.x - w / 2, by); x.lineTo(L.x - w / 2, by - w * 0.5); x.lineTo(L.x - w / 6, by - w * 0.2); x.lineTo(L.x, by - w * 0.6);
    x.lineTo(L.x + w / 6, by - w * 0.2); x.lineTo(L.x + w / 2, by - w * 0.5); x.lineTo(L.x + w / 2, by); x.closePath(); x.stroke();
  }
  return [c1, c2];
}

/* стены: у каждого подходящего дома — одна-две стены, где есть где встать */
function buildWalls () {
  const moscowish = !A.CITY.buildings.some(b => b.k === 'gar');
  for (const b of A.CITY.buildings) {
    const k = b.k, p = b.p, n = p.length;
    let s2 = 0;
    for (let i = 0; i < n; i++) { const a = p[i], c = p[(i + 1) % n]; s2 += a[0] * c[1] - c[0] * a[1]; }
    const area = Math.abs(s2) / 2;
    const ok = k === 'gar' || k === 'ind' || (moscowish && !k && area < 400);   // в Москве гаражей в карте нет — сараи и будки во дворах
    if (!ok || !chance(k === 'gar' ? 0.6 : k === 'ind' ? 0.35 : 0.6)) continue;
    let hLo = Infinity, hHi = -Infinity;
    for (const q of p) { const g = A.groundH(q[0], q[1]); if (g < hLo) hLo = g; if (g > hHi) hHi = g; }
    const lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    const top = k === 'gar' ? hHi + 2.7 : hHi + 3.15 * lv + 1.1;
    const ccw = s2 > 0, cand = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 4.5) continue;
      const ox = (ccw ? dz : -dz) / len, oz = (ccw ? -dx : dx) / len, ux = dx / len, uz = dz / len;
      const w = Math.min(len - 0.8, k === 'ind' ? rand(3, 5) : rand(2.4, 3.4));
      const off = rand(-1, 1) * Math.max(0, (len - w) / 2 - 0.3);
      const mx = (a[0] + c[0]) / 2 + ux * off, mz = (a[1] + c[1]) / 2 + uz * off;
      const sx = mx + ox * 1.0, sz = mz + oz * 1.0;
      if (!A.inBounds(sx, sz, 10) || A.inHouse(sx, sz, 0.4) || A.inHouse(mx + ox * 2.2, mz + oz * 2.2, 0.3)) continue;
      const r = A.nearestRoad(sx, sz, 5, 1);
      if (r && r.d < r.seg.w / 2 + 1.2) continue;
      const y0 = Math.max(A.groundH(sx, sz), hLo) + 0.3;
      const h = Math.min(w * rand(0.42, 0.55), 2.1, top - 0.25 - y0);
      if (h < 1.0) continue;
      cand.push({ x: mx, z: mz, nx: ox, nz: oz, tx: oz, tz: -ox, w, h, y0, k, tag: null, busy: 0, cd: 0, seen: 0 });
    }
    for (let j = 0; j < (k === 'ind' ? 2 : 1) && cand.length; j++) WALLS.push(cand.splice((Math.random() * cand.length) | 0, 1)[0]);
  }
  // сквозные арки во дворы: стена тоннеля изнутри, с одной стороны
  for (const R of A.ARCHES || []) {
    if (R.ux === undefined || R.t < 5 || !chance(0.6)) continue;
    const sd = chance(0.5) ? 1 : -1, hw = 2.6;                  // полширины проезда (ARCH_W / 2)
    const x = R.mx + R.ux * sd * hw + R.ix * R.t / 2, z = R.mz + R.uz * sd * hw + R.iz * R.t / 2;
    const nx = -R.ux * sd, nz = -R.uz * sd, g = A.groundH(x + nx, z + nz);
    const w = Math.min(R.t - 1.4, rand(3, 4.5)), h = Math.min(w * 0.5, 2.0, R.top - 0.5 - (g + 0.3));
    if (h < 1 || !A.inBounds(x, z, 10)) continue;
    WALLS.push({ x, z, nx, nz, tx: nz, tz: -nx, w, h, y0: g + 0.3, k: 'arch', tag: null, busy: 0, cd: 0, seen: 0 });
  }
}

const CELL = 3, PXM = 22;
function makeTag (W, old) {
  const cw = Math.max(16, Math.round(W.w * PXM)), ch = Math.max(8, Math.round(W.h * PXM));
  const fin = document.createElement('canvas');
  fin.width = cw; fin.height = ch;
  const style = old ? pick(['tag', 'tag', 'throw', 'piece']) : pick(['tag', 'throw', 'piece', 'piece']);
  const pal = drawGraffiti(fin, style);
  const img = fin.getContext('2d').getImageData(0, 0, cw, ch).data;
  // пятна, по которым проявляется: полосами слева направо, змейкой сверху вниз
  const cells = [];
  for (let bx = 0; bx < cw; bx += CELL * 2) {
    const col = [];
    for (let yy = 0; yy < ch; yy += CELL)
      for (let xx = bx; xx < Math.min(cw, bx + CELL * 2); xx += CELL) {
        let on = false;
        for (let j = yy; j < Math.min(ch, yy + CELL) && !on; j++) for (let i = xx; i < Math.min(cw, xx + CELL); i++) if (img[(j * cw + i) * 4 + 3] > 60) { on = true; break; }
        if (on) col.push([xx, yy]);
      }
    if ((bx / (CELL * 2)) % 2) col.reverse();
    cells.push(...col);
  }
  const disp = old ? fin : document.createElement('canvas');
  if (!old) { disp.width = cw; disp.height = ch; }
  const tex = new THREE.CanvasTexture(disp);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.h), mat);
  mesh.position.set(W.x + W.nx * 0.11, W.y0 + W.h / 2, W.z + W.nz * 0.11);
  mesh.rotation.y = Math.atan2(W.nx, W.nz);
  A.scene.add(mesh);
  const T = { W, mesh, tex, fin, disp, img, cw, ch, cells, i: old ? cells.length : 0, done: !!old, pal, mistC: pal.map(h => new THREE.Color(h)), dur: style === 'piece' ? rand(28, 40) : style === 'throw' ? rand(14, 20) : rand(8, 13), updT: 0 };
  W.tag = T;
  TAGS.push(T);
  STATE.stats.tags++;
  // больше семидесяти не держим: самые давние и дальние — вон
  if (TAGS.length > 70) {
    const V = A.V;
    let bi = -1, bd = 0;
    for (let i = 0; i < TAGS.length; i++) { const q = TAGS[i], d = Math.hypot(q.W.x - V.x, q.W.z - V.z); if (!q.W.busy && d > bd) { bd = d; bi = i; } }
    if (bi >= 0) dropTag(TAGS.splice(bi, 1)[0]);
  }
  return T;
}
function dropTag (T) {
  A.scene.remove(T.mesh); T.mesh.geometry.dispose(); T.mesh.material.dispose(); T.tex.dispose();
  T.W.tag = null; T.fin = T.disp = T.img = null;
}
/* проявить n пятен; вернуть точку последнего: где сейчас рука */
function paintCells (T, n) {
  const x = T.disp.getContext('2d');
  for (let k = 0; k < n && T.i < T.cells.length; k++, T.i++) { const [cx, cy] = T.cells[T.i]; x.drawImage(T.fin, cx, cy, CELL, CELL, cx, cy, CELL, CELL); }
  if (T.i >= T.cells.length) T.done = true;
}
function cellWorld (T, idx, out) {
  const c = T.cells[clamp(idx, 0, T.cells.length - 1)] || [T.cw / 2, T.ch / 2], W = T.W;
  const u = (c[0] + CELL / 2) / T.cw - 0.5, v = (c[1] + CELL / 2) / T.ch;
  out.u = u * W.w; out.x = W.x + W.tx * out.u + W.nx * 0.12; out.z = W.z + W.tz * out.u + W.nz * 0.12; out.y = W.y0 + (1 - v) * W.h;
  const p = (((c[1] + 1) * T.cw + c[0] + 1) * 4);
  // облако — цвета краски: светлое пятно как есть (в линейный цвет), тёмный контур и подложка — цвет баллончика
  const r = T.img[p] / 255, g = T.img[p + 1] / 255, b = T.img[p + 2] / 255;
  if (r + g + b > 1.2) { out.r = r * r; out.g = g * g; out.b = b * b; }
  else { const C = T.mistC[idx & 1]; out.r = C.r; out.g = C.g; out.b = C.b; }
  return out;
}

/* облачко краски: одно облако точек на всех */
const MIST_N = 200;
let MIST = null;
function mistInit () {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(MIST_N * 3).fill(-1000), col = new Float32Array(MIST_N * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }));
  pts.frustumCulled = false;
  A.scene.add(pts);
  MIST = { pts, pos, col, vel: new Float32Array(MIST_N * 3), life: new Float32Array(MIST_N), next: 0, live: 0 };
}
function mistEmit (x, y, z, vx, vy, vz, r, g, b) {
  const M = MIST, i = M.next;
  M.next = (i + 1) % MIST_N;
  M.pos[i * 3] = x; M.pos[i * 3 + 1] = y; M.pos[i * 3 + 2] = z;
  M.vel[i * 3] = vx; M.vel[i * 3 + 1] = vy; M.vel[i * 3 + 2] = vz;
  M.col[i * 3] = r; M.col[i * 3 + 1] = g; M.col[i * 3 + 2] = b;
  M.life[i] = rand(0.2, 0.4);                                // короткий пшик
  M.live = 1;
}
function mistStep (dt) {
  const M = MIST;
  if (!M.live) return;
  let any = 0;
  for (let i = 0; i < MIST_N; i++) {
    if (M.life[i] <= 0) continue;
    if ((M.life[i] -= dt) <= 0) { M.pos[i * 3 + 1] = -1000; continue; }
    any = 1;
    M.vel[i * 3] *= 0.9; M.vel[i * 3 + 2] *= 0.9; M.vel[i * 3 + 1] = M.vel[i * 3 + 1] * 0.9 + 0.25 * dt;
    M.pos[i * 3] += M.vel[i * 3] * dt; M.pos[i * 3 + 1] += M.vel[i * 3 + 1] * dt; M.pos[i * 3 + 2] += M.vel[i * 3 + 2] * dt;
  }
  M.pts.geometry.attributes.position.needsUpdate = true;
  M.pts.geometry.attributes.color.needsUpdate = true;
  M.live = any;
}

const HOODIES = ['#2b2a30', '#3b4a5a', '#6b2e2e', '#3f5a3a', '#4a3a5a', '#1f2328', '#8a3b22'];
function spawnArtist (W) {
  const person = makePerson({ fem: chance(0.2) }), L = person.look;
  L.head = 'hood'; L.top = 'long'; L.shirt = pick(HOODIES); L.bottom = 'pants';
  L.pants = pick(['#2e4a6b', '#1f2328', '#39405c', '#5a4a3a']); L.shoes = pick(['#f4f1ea', '#1f1c1a', '#8a2a2a']);
  L.pack = chance(0.6) ? pick(['#2b2a30', '#e04836', '#4f7fd6']) : null;
  const m = member(person, { fat: false });
  const T = W.tag || makeTag(W, false), canC = T.pal[0];
  m.can = bits(b => { b(0.08, 0.2, 0.08, canC, 0, -0.62, 0.03); b(0.05, 0.04, 0.05, '#f4f1ea', 0, -0.74, 0.03); });
  m.u.armR.add(m.can);
  W.busy = 1;
  const at = cellWorld(T, T.i, {});
  m.x = W.x + W.tx * at.u + W.nx * 0.95; m.z = W.z + W.tz * at.u + W.nz * 0.95;
  m.speed = rand(1.2, 1.5) * m.u.pace;
  m.grp.rotation.y = Math.atan2(-W.nx, -W.nz);
  place(m);
  ARTISTS.push({ m, W, T, st: 'paint', t: 0, acc: 0, hissT: 0, mistT: 0, hand: {} });
}
function dropArtist (a) { dropMember(a.m); a.W.busy = 0; }

function artistStep (a, dt) {
  const m = a.m, u = m.u, W = a.W, T = a.T;
  sayStep(m, dt);
  if (m.dead) return;
  const d = far(m);
  m.grp.visible = d < 130;
  a.t += dt;
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  if (a.st === 'paint') {
    // резко подъехал — атас
    if ((d < 18 && sp > 9) || (d < 8 && sp > 3) || A.ENV.rainWant) { flee(a); return; }
    const rate = T.cells.length / T.dur;
    a.acc += rate * dt;
    const n = a.acc | 0;
    if (n) { a.acc -= n; paintCells(T, n); }
    if ((a.updT = (a.updT || 0) - dt) <= 0) { a.updT = 0.12; T.tex.needsUpdate = true; }
    const H = cellWorld(T, T.i, a.hand);
    // стоит напротив руки, переступает вдоль стены
    const sx = W.x + W.tx * H.u + W.nx * 0.95, sz = W.z + W.tz * H.u + W.nz * 0.95;
    const ox = m.x;
    m.x = damp(m.x, sx, 1.6, dt); m.z = damp(m.z, sz, 1.6, dt);
    const step = Math.abs(m.x - ox) / Math.max(dt, 1e-3);
    m.ph += dt * step * 6;
    m.grp.rotation.y = dampAng(m.grp.rotation.y, Math.atan2(-W.nx, -W.nz), 6, dt);
    const shoulder = gy(m.x, m.z) + 1.3 * m.grp.scale.y, dy = H.y - shoulder;
    const lat = (H.x - m.x) * W.tx + (H.z - m.z) * W.tz;
    const T2 = performance.now() / 1000;
    u.armR.rotation.x = damp(u.armR.rotation.x, -Math.atan2(0.85, -dy) + Math.sin(T2 * 31) * 0.03, 10, dt);
    u.armR.rotation.z = damp(u.armR.rotation.z, clamp(-Math.atan2(lat, 0.85), -0.7, 0.7), 8, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.25, 5, dt);
    u.head.rotation.x = damp(u.head.rotation.x, clamp(-dy * 0.45, -0.45, 0.5), 5, dt);
    u.legL.rotation.x = Math.sin(m.ph) * 0.3 * Math.min(1, step); u.legR.rotation.x = -u.legL.rotation.x;
    place(m);
    // краска летит из баллончика к стене
    if (d < 70 && (a.mistT -= dt) <= 0) {
      // струя от баллончика к стене и облачко у самой стены — его и видно с дороги
      a.mistT = 0.05;
      const h = handWorld(m, 'armR', -0.76);
      for (let k = 0; k < 2; k++) mistEmit(h.x, h.y, h.z, (H.x - h.x) * rand(2.5, 4) + rand(-0.3, 0.3), (H.y - h.y) * rand(2.5, 4) + rand(-0.2, 0.3), (H.z - h.z) * rand(2.5, 4) + rand(-0.3, 0.3), H.r, H.g, H.b);
      for (let k = 0; k < 2; k++) mistEmit(H.x + W.nx * 0.1, H.y, H.z + W.nz * 0.1, W.nx * rand(0.4, 1.2) + rand(-0.6, 0.6), rand(-0.3, 0.6), W.nz * rand(0.4, 1.2) + rand(-0.6, 0.6), H.r, H.g, H.b);
    }
    if (d < 22 && (a.hissT -= dt) <= 0 && A.Snd) { a.hissT = rand(0.5, 1.2); A.Snd.fx('spray', s => s.noise(0.22, 0.025), { x: m.x, z: m.z, far: 22, near: 2 }); }
    if (T.done) { T.tex.needsUpdate = true; a.st = 'admire'; a.t = 0; W.cd = 60; }
  } else if (a.st === 'admire') {
    // отошёл на шаг, полюбовался
    stand(u, dt);
    const bx = m.x + W.nx, bz = m.z + W.nz;
    if (a.t < 0.8) { m.x = damp(m.x, bx, 2, dt); m.z = damp(m.z, bz, 2, dt); }
    u.head.rotation.x = damp(u.head.rotation.x, -0.1, 5, dt);
    place(m);
    if (a.t > 2.4) { a.st = 'leave'; a.t = 0; W.busy = 0; m.u.armR.remove(m.can); m.can.geometry.dispose(); m.can = null; A.walkBack(m); }
  } else if (a.st === 'flee') {
    m.ph += dt * 16;
    const dx = m.x - V.x, dz = m.z - V.z, l = Math.hypot(dx, dz) || 1;
    m.x += dx / l * 4.6 * dt; m.z += dz / l * 4.6 * dt;
    A.pushOut(m, 0.45);
    m.grp.rotation.y = dampAng(m.grp.rotation.y, Math.atan2(dx, dz), 10, dt);
    walkPose(u, m.ph, 1.1);
    place(m, Math.abs(Math.sin(m.ph)) * 0.1);
    if (a.t > 5) { a.st = 'leave'; a.t = 0; A.walkBack(m); }
  } else {
    // уходит по тротуару; с глаз долой — нет его
    if (!walkable(m)) { a.gone = 1; return; }
    const ang = A.walkerStep(m, dt, 7);
    A.pushOut(m, 0.45);
    if (!Number.isNaN(ang)) m.grp.rotation.y = dampAng(m.grp.rotation.y, ang, 8, dt);
    walkPose(u, m.ph);
    place(m, Math.abs(Math.sin(m.ph)) * 0.04);
    if (a.t > 40 && d > 70) a.gone = 1;
  }
  if (carHits(m.x, m.z)) { kill(m); W.busy = 0; a.gone = 1; }
}
function flee (a) {
  const m = a.m;
  a.st = 'flee'; a.t = 0; a.W.busy = 0; a.W.cd = 45;
  a.T.tex.needsUpdate = true;
  say(m, pick([t('Атас!'), t('Валим!'), t('Шухер!')]), '#d9342c', 1.8);
}

/* ═════════════════ парки: воздушные змеи и дроны ═════════════════
   Только днём и без дождя — и не всегда: волнами (flyWant). Бывают дни и
   часы, когда в парках ни одного, бывает — сразу несколько; безветренный
   день — только дроны. Змей — ромб на нитке, с хвостом, качается на
   ветру; зимой их меньше. Дрон висит перед хозяином, куда тот смотрит,
   мигает огоньками и иногда резко улетает вдаль и возвращается. */
function buildParks () {
  for (const g of A.CITY.green) {
    if (g.k !== 'park' && g.k !== 'green') continue;
    let s2 = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const p = g.p;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      s2 += a[0] * c[1] - c[0] * a[1];
      if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0]; if (a[1] < z0) z0 = a[1]; if (a[1] > z1) z1 = a[1];
    }
    const area = Math.abs(s2) / 2;
    if (area < 2500 || (g.k === 'green' && area > 250000)) continue;       // газончики и лес — нет
    PARKS.push({ p, x0, x1, z0, z1 });
  }
}
let WIND = rand(0, Math.PI * 2);
/* Сколько сейчас хочется змеев и дронов: три синусоиды с несоизмеримыми
   периодами (полторы, четыре и десять минут игры) — волны то чаще, то реже,
   плюс жребий на «сутки»: четверть дней безветренные, десятая — пустые. */
const FLY = { T: rand(0, 5000), day: 0, lastT: -1, ph: [rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)], want: 0, calm: false };
function flyWant (dt) {
  const E = A.ENV;
  if (FLY.lastT >= 0 && E.t < FLY.lastT - 0.5) FLY.day++;
  FLY.lastT = E.t;
  FLY.T += dt;
  const d = FLY.day + FLY.T / 480, h = (Math.sin(Math.floor(d) * 91.7 + 3.1) * 43758.5453) % 1, hd = Math.abs(h);
  FLY.calm = hd < 0.25;
  if (hd > 0.9) { FLY.want = 0; return 0; }
  const P = FLY.ph, T = FLY.T;
  const v = 0.5 * Math.sin(T / 14 + P[0]) + 0.35 * Math.sin(T / 38 + P[1]) + 0.3 * Math.sin(T / 97 + P[2]);
  FLY.want = clamp(Math.round((v - 0.12) * 4.2), 0, CAP.flyers);
  return FLY.want;
}
const KMAT = { kite: null, str: null, tails: new Map(), dBody: null, dRot: null, dLed: null };
function kiteMats () {
  if (KMAT.kite) return;
  KMAT.kite = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  KMAT.str = new THREE.LineBasicMaterial({ color: 0xf4f1ea });
  KMAT.dBody = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  KMAT.dRot = new THREE.MeshBasicMaterial({ color: 0xc8ccd4, transparent: true, opacity: 0.45, depthWrite: false });
  KMAT.dLed = new THREE.MeshBasicMaterial({ vertexColors: true });
}
const tailMat = hex => { let m = KMAT.tails.get(hex); if (!m) KMAT.tails.set(hex, m = new THREE.LineBasicMaterial({ color: hex })); return m; };
function lineOf (n, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const l = new THREE.Line(g, mat);
  l.frustumCulled = false;
  A.scene.add(l);
  return l;
}
function makeKite () {
  const [c1, c2] = pick(PAL), P = [[0, 0.95], [0.62, 0.18], [0, -0.85], [-0.62, 0.18]];
  const pos = [], col = [], C1 = new THREE.Color(c1), C2 = new THREE.Color(c2);
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], C = i % 2 ? C2 : C1;
    pos.push(0, 0, 0, a[0], a[1], 0, b[0], b[1], 0);
    for (let k = 0; k < 3; k++) col.push(C.r, C.g, C.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, KMAT.kite);
  m.scale.setScalar(1.35);
  A.scene.add(m);
  return { mesh: m, str: lineOf(8, KMAT.str), tail: lineOf(10, tailMat(c2)) };
}
function makeDrone () {
  const g = new THREE.Group();
  const L = [];
  const bx = (w, h, d, hex, x, y, z, ry = 0) => A.put(L, new THREE.BoxGeometry(w, h, d), hex, x, y, z, 0, ry, 0);
  bx(0.34, 0.1, 0.34, '#3a3d44', 0, 0, 0); bx(0.14, 0.08, 0.1, '#1b1a1f', 0, -0.08, 0.12);
  bx(0.9, 0.04, 0.06, '#2b2a30', 0, 0.02, 0, Math.PI / 4); bx(0.9, 0.04, 0.06, '#2b2a30', 0, 0.02, 0, -Math.PI / 4);
  for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) bx(0.05, 0.08, 0.05, '#1b1a1f', x, 0.06, z);
  g.add(new THREE.Mesh(A.mergeGeos(L), KMAT.dBody));
  const R = [];
  for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) A.put(R, new THREE.CylinderGeometry(0.17, 0.17, 0.01, 10), '#ffffff', x, 0.11, z);
  const rot = new THREE.Mesh(A.mergeGeos(R), KMAT.dRot);
  g.add(rot);
  const E = [];
  A.put(E, new THREE.BoxGeometry(0.06, 0.05, 0.06), '#ff2b2b', 0.3, 0.0, -0.3); A.put(E, new THREE.BoxGeometry(0.06, 0.05, 0.06), '#ff2b2b', -0.3, 0.0, -0.3);
  A.put(E, new THREE.BoxGeometry(0.06, 0.05, 0.06), '#2bff5a', 0.3, 0.0, 0.3); A.put(E, new THREE.BoxGeometry(0.06, 0.05, 0.06), '#2bff5a', -0.3, 0.0, 0.3);
  const led = new THREE.Mesh(A.mergeGeos(E), KMAT.dLed);
  g.add(led);
  g.scale.setScalar(1.25);
  A.scene.add(g);
  return { g, led, rot };
}
function parkSpot () {
  const V = A.V;
  for (let k = 0; k < 24; k++) {
    const an = rand(0, Math.PI * 2), dd = rand(30, 150), x = V.x + Math.sin(an) * dd, z = V.z + Math.cos(an) * dd;
    const P = PARKS.find(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && A.inPoly(x, z, q.p));
    if (!P || !A.inBounds(x, z, 15) || A.inHouse(x, z, 4)) continue;
    const r = A.nearestRoad(x, z, 7, 1);
    if (r && r.d < r.seg.w / 2 + 3) continue;
    if (FLYERS.some(f => Math.hypot(f.m.x - x, f.m.z - z) < 18)) continue;
    const probe = { x, z }; A.pushOut(probe, 0.8);
    if (Math.hypot(probe.x - x, probe.z - z) > 0.05) continue;
    return [x, z];
  }
  return null;
}
function spawnFlyer (x, z) {
  kiteMats();
  const kite = !FLY.calm && chance(winter() ? 0.12 : 0.55);
  const m = member(makePerson());
  m.x = x; m.z = z; place(m);
  const f = { m, kind: kite ? 'kite' : 'drone', t: rand(0, 60), seed: rand(0, 9), L: 1.5, Lmax: rand(18, 26), pack: 0, fall: null, gaze: rand(0, Math.PI * 2),
    p: new THREE.Vector3(x, gy(x, z) + 1.6, z), v: new THREE.Vector3(), mode: 'hover', zoomT: rand(6, 12), tgt: new THREE.Vector3(), gone: 0 };
  if (kite) Object.assign(f, makeKite());
  else {
    Object.assign(f, makeDrone());
    m.remote = bits(b => { b(0.24, 0.05, 0.14, '#2b2a30', 0.1, -0.58, 0.1); b(0.02, 0.16, 0.02, '#1b1a1f', 0.18, -0.5, 0.14); });
    m.u.armR.add(m.remote);
    f.p.set(x + Math.sin(f.gaze) * 0.8, gy(x, z) + 0.2, z + Math.cos(f.gaze) * 0.8);
  }
  m.grp.rotation.y = kite ? WIND : f.gaze;
  FLYERS.push(f);
}
function dropFlyer (f) {
  dropMember(f.m);
  for (const o of [f.mesh, f.str, f.tail]) if (o) { A.scene.remove(o); o.geometry.dispose(); }
  if (f.g) { A.scene.remove(f.g); f.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
}
const setLine = (l, i, x, y, z) => l.geometry.attributes.position.setXYZ(i, x, y, z);

function flyerStep (f, dt) {
  const m = f.m, u = m.u;
  sayStep(m, dt);
  f.t += dt;
  const d = far(m), vis = d < 200;
  if (!m.gone) m.grp.visible = d < 130;
  if (!m.dead && carHits(m.x, m.z)) { kill(m); f.fall = { t: 0 }; }
  if (f.kind === 'kite') {
    f.mesh.visible = f.tail.visible = vis; f.str.visible = vis && !f.fall;
    const wx = Math.sin(WIND), wz = Math.cos(WIND), sx = -wz, sz = wx;
    if (f.fall) {
      // хозяина нет — змей планирует вниз по ветру и ложится в траву
      f.fall.t += dt;
      const fl = A.groundH(f.p.x, f.p.z) + 0.1;
      if (f.p.y > fl) { f.p.x += wx * 2.5 * dt; f.p.z += wz * 2.5 * dt; f.p.y = Math.max(fl, f.p.y - 3 * dt); f.mesh.rotation.x += dt * 0.8; }
      f.mesh.position.copy(f.p);
      if (f.fall.t > 12) f.gone = 1;
    } else {
      if (f.pack) { f.L -= dt * 5; if (f.L < 1.2) { f.gone = 1; return; } }
      else f.L = Math.min(f.Lmax, f.L + dt * 3.2);
      const hp = handWorld(m, 'armR', -0.58);
      const el = 0.7 + Math.sin(f.t * 0.37 + f.seed) * 0.12, L = f.L;
      const sway = Math.sin(f.t * 0.8 + f.seed) * 3 + Math.sin(f.t * 2.1) * 0.7;
      const tx = hp.x + wx * L * Math.cos(el) + sx * sway * (L / f.Lmax), tz = hp.z + wz * L * Math.cos(el) + sz * sway * (L / f.Lmax);
      const ty = hp.y + L * Math.sin(el) + Math.sin(f.t * 1.3) * 0.6;
      f.p.x = damp(f.p.x, tx, 3, dt); f.p.y = damp(f.p.y, ty, 3, dt); f.p.z = damp(f.p.z, tz, 3, dt);
      f.mesh.position.copy(f.p);
      f.mesh.lookAt(hp);
      f.mesh.rotateZ(Math.sin(f.t * 0.8 + f.seed) * 0.5);
      // нитка с провисом
      for (let i = 0; i < 8; i++) {
        const s = i / 7, sag = Math.sin(Math.PI * s) * 0.05 * L;
        setLine(f.str, i, hp.x + (f.p.x - hp.x) * s, hp.y + (f.p.y - hp.y) * s - sag, hp.z + (f.p.z - hp.z) * s);
      }
      f.str.geometry.attributes.position.needsUpdate = true;
      // хозяин смотрит на змея, руки вверх, подёргивает нитку
      m.grp.rotation.y = dampAng(m.grp.rotation.y, WIND, 3, dt);
      const tug = Math.sin(f.t * 1.7 + f.seed) * 0.15;
      u.armR.rotation.x = damp(u.armR.rotation.x, -2.05 + tug, 6, dt); u.armL.rotation.x = damp(u.armL.rotation.x, -1.8 + tug, 6, dt);
      u.armR.rotation.z = damp(u.armR.rotation.z, -0.1, 6, dt); u.armL.rotation.z = damp(u.armL.rotation.z, 0.1, 6, dt);
      u.head.rotation.x = damp(u.head.rotation.x, -0.6, 4, dt);
    }
    // хвост: от нижнего угла по ветру вниз, волной
    f.mesh.updateMatrixWorld(true);
    const b = f.mesh.localToWorld(V3.set(0, -0.85, 0));
    for (let i = 0; i < 10; i++) {
      const w = Math.sin(f.t * 5 - i * 0.7) * 0.2 * i / 9;
      setLine(f.tail, i, b.x + wx * i * 0.28 + sx * w, Math.max(A.groundH(b.x, b.z) + 0.05, b.y - i * 0.22), b.z + wz * i * 0.28 + sz * w);
    }
    f.tail.geometry.attributes.position.needsUpdate = true;
  } else {
    f.g.visible = vis;
    if (f.fall) {
      // хозяина нет — дрон падает
      f.fall.t += dt;
      const fl = A.groundH(f.p.x, f.p.z) + 0.12;
      if (f.p.y > fl) { f.v.y -= 12 * dt; f.p.addScaledVector(f.v, dt); if (f.p.y <= fl) { f.p.y = fl; f.v.set(0, 0, 0); A.puff(f.p.x, 0.3, f.p.z, true, 0.5); } }
      f.g.position.copy(f.p); f.g.rotation.z += dt * 3 * (f.p.y > fl + 0.01 ? 1 : 0);
      f.led.visible = false;
      if (f.fall.t > 9) f.gone = 1;
      return;
    }
    // куда смотрит хозяин — там и дрон; иногда резко улетает вдаль
    f.gaze += Math.sin(f.t * 0.23 + f.seed) * 0.35 * dt;
    const gx = Math.sin(f.gaze), gz = Math.cos(f.gaze), g0 = gy(m.x, m.z);
    let maxV = 4;
    if (f.pack) {
      f.tgt.set(m.x + gx * 0.7, g0 + 0.15, m.z + gz * 0.7); maxV = 3;
      if (f.p.distanceTo(f.tgt) < 0.4) { f.gone = 1; return; }
    } else if (f.mode === 'zoom') {
      maxV = 14;
      if ((f.zoomT -= dt) <= 0) { f.mode = 'hover'; f.zoomT = rand(7, 15); }
    } else {
      f.tgt.set(m.x + gx * 5.5, g0 + 3.6 + Math.sin(f.t * 0.7) * 0.8, m.z + gz * 5.5);
      if (f.t < 3) maxV = 1.5;                                 // взлёт — не спеша
      if ((f.zoomT -= dt) <= 0) {
        const an = f.gaze + rand(-1, 1), dd = rand(14, 26);
        f.tgt.set(m.x + Math.sin(an) * dd, g0 + rand(8, 13), m.z + Math.cos(an) * dd);
        f.mode = 'zoom'; f.zoomT = rand(3, 4.5);
      }
    }
    V3.subVectors(f.tgt, f.p).multiplyScalar(1.6);
    if (V3.length() > maxV) V3.setLength(maxV);
    f.v.x = damp(f.v.x, V3.x, 3, dt); f.v.y = damp(f.v.y, V3.y, 3, dt); f.v.z = damp(f.v.z, V3.z, 3, dt);
    f.p.addScaledVector(f.v, dt);
    f.g.position.copy(f.p);
    f.g.rotation.set(clamp(f.v.z * 0.05, -0.45, 0.45), 0, clamp(-f.v.x * 0.05, -0.45, 0.45));
    f.rot.rotation.y += dt * 40;
    f.led.visible = (f.t % 1) < 0.14 || (f.t % 1 > 0.3 && f.t % 1 < 0.36);
    // хозяин: лицом к дрону, пульт двумя руками, голова вверх
    const dx = f.p.x - m.x, dz = f.p.z - m.z, dh = Math.hypot(dx, dz), dy = f.p.y - (g0 + 1.6);
    if (!m.dead) {
      m.grp.rotation.y = dampAng(m.grp.rotation.y, Math.atan2(dx, dz), 3, dt);
      u.armR.rotation.x = damp(u.armR.rotation.x, -1.05, 6, dt); u.armL.rotation.x = damp(u.armL.rotation.x, -1.05, 6, dt);
      u.armR.rotation.z = damp(u.armR.rotation.z, -0.25, 6, dt); u.armL.rotation.z = damp(u.armL.rotation.z, 0.25, 6, dt);
      u.head.rotation.x = damp(u.head.rotation.x, -clamp(Math.atan2(dy, dh) * 0.8, -0.2, 0.8), 4, dt);
    }
  }
  if (!m.dead) {
    if (m.shock > 0) { m.shock -= dt; A.handsUp(u, dt); }
    place(m);
  }
}

/* ── чаевые от богача ──
   Заказ у богача: рядом гуляет богач (или стоит его машина), либо дом
   солидный — сталинка, офис. И то не каждый раз: примерно один из восьми.
   Возвращает сумму чаевых (0 — обычный клиент); game.js кладёт её в оплату. */
let POSH = null;
export function richTip (peds, share) {
  const p = peds && peds[0];
  if (!A || !p) return 0;
  if (!POSH) POSH = A.CITY.buildings.filter(b => b.st === 'stalin' || b.k === 'off').map(b => b.p.reduce((a, q) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]));
  const near = (x, z, r) => Math.abs(x - p.x) < r && Math.abs(z - p.z) < r;
  const ok = RICH.some(r => !r.m.dead && near(r.m.x, r.m.z, 70)) || LUX.some(l => near(l.x, l.z, 90)) || POSH.some(q => near(q[0], q[1], 40));
  if (!ok || !chance(1 / 8)) return 0;
  if (p.grp) {
    const b = A.sayBubble(p.grp, t('Сдачи не надо!'), '#8a6a1a', 2.7);
    setTimeout(() => { if (b.parent) b.parent.remove(b); b.material.dispose(); }, 2600);
  }
  return Math.max(300, Math.round(share * rand(1.5, 3) / 50) * 50);
}

/* ═════════════════ цикл ═════════════════ */
function setup () {
  THREE = A.THREE; V3 = new THREE.Vector3(); V3b = new THREE.Vector3();
  const sev = MAP.id === 'seversk';
  CAP = STATE.CAP = { couples: 4, rich: sev ? 2 : 3, lux: sev ? 1 : 2, artists: sev ? 3 : 2, flyers: 4 };
  buildWalls(); buildParks(); mistInit();
}

function sweep (list, bad, drop) {
  for (let i = list.length - 1; i >= 0; i--) if (bad(list[i])) { drop(list[i]); list.splice(i, 1); }
}
let scanT = 0.5;
/* рождения из scan() — по одному за кадр, а не пачкой в одном кадре раз в секунду (09.10.2026, хвост кадров
   на Деке): парочка, богач, машина богача, граффити, змей — каждый 1—4 мс на Деке, вместе — рывок до 15 мс */
const LATER = [];
function scan () {
  const V = A.V, E = A.ENV;
  const day = E.night < 0.4 && E.rain < 0.25 && !E.rainWant;
  sweep(COUPLES, c => c.lost || Math.hypot(c.x - V.x, c.z - V.z) > 240 || (c.a.dead && c.b.dead), dropCouple);
  sweep(RICH, r => r.m.lost || Math.hypot(r.m.x - V.x, r.m.z - V.z) > 240 || (r.m.dead && !r.dog), dropRich);
  sweep(LUX, l => Math.hypot(l.x - V.x, l.z - V.z) > 260, dropLux);
  sweep(ARTISTS, a => a.gone || Math.hypot(a.m.x - V.x, a.m.z - V.z) > 230, dropArtist);
  sweep(FLYERS, f => f.gone || Math.hypot(f.m.x - V.x, f.m.z - V.z) > 240, dropFlyer);
  const want = flyWant(1);
  for (const f of FLYERS) if (!day && !f.pack) f.pack = 1;
  // волна схлынула — лишние сворачиваются (змей сматывают, дрон садится)
  let live = FLYERS.filter(f => !f.pack && !f.fall).length;
  for (const f of FLYERS) if (live > want && !f.pack && !f.fall) { f.pack = 1; live--; }
  if (COUPLES.length < CAP.couples && chance(0.6)) LATER.push(spawnCouple);
  if (RICH.length < CAP.rich && chance(0.3)) LATER.push(spawnRich);
  if (LUX.length < CAP.lux && chance(0.2)) LATER.push(spawnLux);
  // стены рядом: на части — старые граффити, у свободной — может встать художник
  let free = null, fd = Infinity, olds = 0;
  for (const W of WALLS) {
    const d = Math.hypot(W.x - V.x, W.z - V.z);
    if (d > 200) continue;
    if (!W.seen && olds < 3) { W.seen = 1; if (chance(W.k === 'gar' || W.k === 'arch' ? 0.35 : 0.15)) { LATER.push(() => makeTag(W, true)); olds++; } }   // не больше трёх холстов за раз — и по одному в кадр
    if (W.cd > 0) { W.cd -= 1; continue; }
    if (W.busy || (W.tag && W.tag.done) || d < 35 || d > 150) continue;
    const s = d + rand(0, 60) - (W.k === 'arch' ? 35 : 0);       // арки-тоннели — любимое место
    if (s < fd) { fd = s; free = W; }
  }
  if (free && ARTISTS.length < CAP.artists && !E.rainWant && chance(deepWinter() ? 0.08 : winter() ? 0.25 : 0.5)) LATER.push(() => { if (!free.busy && ARTISTS.length < CAP.artists) spawnArtist(free); });   // в лютый мороз не рисуют
  if (day && PARKS.length && FLYERS.length < want && chance(0.5)) { const at = parkSpot(); if (at) LATER.push(() => spawnFlyer(at[0], at[1])); }
}

const OFF = new URLSearchParams(location.search).has('nolife');     // ?nolife — без жизни улиц: сравнить кадр
export function step (dt, api) {
  if (OFF) return;
  const t0 = performance.now();
  if (!A) { A = api; setup(); STATE.stats.setupMs = Math.round(performance.now() - t0); }
  if ((scanT -= dt) <= 0) { scanT = 1; scan(); }
  else if (LATER.length) LATER.shift()();
  WIND += Math.sin(performance.now() / 23000) * 0.02 * dt;
  WALKERS.length = 0;
  for (const c of COUPLES) { coupleStep(c, dt); if (!c.a.dead) WALKERS.push(c.a); if (!c.b.dead) WALKERS.push(c.b); }
  for (const r of RICH) { richStep(r, dt); if (!r.m.dead) WALKERS.push(r.m); }
  for (const l of LUX) luxStep(l, dt);
  for (const a of ARTISTS) { artistStep(a, dt); if (!a.m.dead && a.st === 'leave') WALKERS.push(a.m); }
  for (const f of FLYERS) flyerStep(f, dt);
  mistStep(dt);
  // готовые граффити видно только вблизи
  const V = A.V;
  for (const T of TAGS) T.mesh.visible = Math.abs(T.W.x - V.x) < 220 && Math.abs(T.W.z - V.z) < 220;
  STATE.stats.ms = STATE.stats.ms * 0.98 + (performance.now() - t0) * 0.02;       // сколько стоит кадр жизни, в среднем
  if (window.__dlv && !window.__dlv.LIFE) window.__dlv.LIFE = Object.assign(STATE, { debug: { spawnCouple, spawnRich, spawnLux, spawnArtist, spawnFlyer, parkSpot, FLY, makeTag, winter, deepWinter, cold, richTip } });
}

/* рядом кого-то сбили или взорвалось: парочки и богачи — руки вверх,
   графитисты — бегут, шофёр возмущается */
export function scare (x, z, r = 26) {
  if (!A) return;
  const near = o => Math.hypot(o.x - x, o.z - z) < r;
  for (const c of COUPLES) if (!c.react && (!c.a.dead || !c.b.dead) && near(c)) { c.shock = rand(1.5, 3); c.chat = 0; }
  for (const q of RICH) if (!q.m.dead && near(q.m)) q.shock = rand(1.5, 2.8);
  for (const l of LUX) if (!l.drv.dead && near(l.drv)) l.drv.shock = rand(1.5, 2.5);
  for (const a of ARTISTS) if (!a.m.dead && a.st === 'paint' && near(a.m)) flee(a);
  for (const f of FLYERS) if (!f.m.dead && near(f.m)) f.m.shock = rand(1.2, 2.2);
}
