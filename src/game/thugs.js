/* ──────────────────────────────────────────────────────────────────────────
   Гопники прессуют прохожего (docs/IDEAS.md, блок 9; правила — docs/CAREER.md
   «Респект и войны брендов» → «Гопники прессуют прохожих»). Только в карьере.

   Где и когда (PRESS ниже): машина в бандитском круге (ZN.gangZones) или не дальше
   NEAR м от его края. Первая сцена смены — не раньше FIRST с, дальше — раз в EVERY с,
   не больше PER_SHIFT за смену, одна за раз. Ставится на тротуаре у улицы внутри круга,
   R м от машины, впереди по ходу (±AHEAD рад) — чтобы её было видно.

   Что видно: прохожий (обычный горожанин с сумкой) прижат к стене, вокруг N гопников в
   спортивках с лампасами и кепках (как у пина в world.js, узнаются по одежде) — толкают,
   тянут сумку, облачка «Сумку сюда!» и «Помогите!». Во взрослой у одного бита.

   Помочь (любое из):
     • сбить хоть одного гопника (быстрее 20 км/ч — по общим правилам hits.js);
     • промчаться мимо кучки ближе SCARE_R м быстрее SCARE_KMH км/ч — разбегаются;
     • встать рядом (ближе STAND_R м, медленнее STAND_V м/с) на STAND_T с — свидетель, уходят;
     • посигналить ближе HONK_R м (H; сигнал общий с компаниями в форме — crews.js onHonk).
   Помог — гопники разбегаются («Шухер!»), прохожий благодарит, респект +RESPECT.GAIN.helpedCivil
   (econ.js, respect.js), с шансом TIP_CHANCE — чаевые TIP ₽.
   Проехал мимо — через LIFE с сумку отнимают, гопники уходят, прохожий садится на асфальт.
   Ничего не теряешь. Сбил самого прохожего — он «сбит прохожий» по общим правилам,
   гопники ржут и уходят, респекта нет.

   Переменных игры модуль не видит — всё приходит в api (thugsApi в game.js).
   Отладка: __dlv.THUGS (PRESS, SC, spawn(), honk()).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import * as ZN from './zones.js';
import * as DIST from './districts.js';
import { makePerson } from './people.js';
import { TIER } from './hits.js';
import { DEBUG as WD } from './world.js';
import { RESPECT as RG } from './econ.js';
import * as RESPECT from './respect.js';
import * as CREWS from './crews.js';           // сигнал игрока (H; машина гудит сама, если постоял рядом) — общий с компаниями в форме


export const PRESS = {
  FIRST: [25, 45],         // с от начала смены до первой сцены
  EVERY: [45, 80],         // с между сценами (отсчёт — с конца прошлой)
  PER_SHIFT: 4,            // не больше за смену
  NEAR: 120,               // м от края бандитского круга — уже «рядом»
  R: [70, 140],            // м от машины, где ставить
  AHEAD: 1.1,              // рад: впереди по ходу машины, ± столько
  N: [2, 4],               // гопников в кучке
  RING: [0.95, 1.3],       // м: как плотно обступили прохожего
  LIFE: 35,                // с: столько прессуют, потом отнимают сумку и уходят
  FAR: 230,                // м: уехал дальше — сцена тихо пропадает
  SCARE_R: 7, SCARE_KMH: 25,           // промчался рядом быстро — разбегаются
  STAND_R: 10, STAND_V: 2, STAND_T: 2.5,   // встал рядом — свидетель, уходят
  HONK_R: 25,              // м: гудок спугивает
  TIP_CHANCE: 0.5, TIP: [300, 1200],   // чаевые от спасённого, ₽ (вне карьеры — / MONEY_K)
};

const TRACK = ['#1d2a66', '#1b1b20', '#2a2d36', '#16305a', '#3a3a42'];
const BAG = ['#8a3b3b', '#c8742e', '#3b5a8a', '#2b2a30', '#d6b25a', '#6a3f7a'];
const HL = 2.7, HW = 1.35;               // кузов для наезда — как у бандитов у пина (world.js)

const L_PRESS_ADULT = [N_('Слышь, телефон дай позвонить!'), N_('Сумку сюда, быстро!'), N_('Ты чё, не с нашего района?'), N_('Карманы вывернул, сука!'), N_('Чё ты дёргаешься?')];
const L_PRESS_KIDS = [N_('Дай позвонить!'), N_('Сумку давай!'), N_('Ты с какого района?'), N_('Деньги есть?'), N_('Чё ты дёргаешься?')];
const L_VICTIM = [N_('Помогите!'), N_('Отстаньте!'), N_('Да нет у меня ничего!'), N_('Люди, помогите!')];
const L_THANKS = [N_('Спасибо, выручил!'), N_('Дай бог тебе здоровья!'), N_('Век не забуду!'), N_('Ох, спасибо, сынок!')];
const L_FLEE = [N_('Шухер!'), N_('Валим, пацаны!'), N_('Атас!')];
const L_ROBBED = [N_('Ну вот… опять…'), N_('Сумку отняли…')];
const L_TOOK = [N_('Спасибо за сумочку!'), N_('Хе-хе, бывай!')];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inGang = (x, z) => ZN.gangZones().some(g => (x - g.x) ** 2 + (z - g.z) ** 2 < g.r * g.r);

let A = null;
export const SC = {
  st: '', t: 0, x: 0, z: 0, men: [], vic: null, bag: null, standT: 0, sayT: 0, vicT: 0,
  cd: 0, n: 0, session: -1, helped: 0, robbed: 0, how: '', tip: 0,
  stats: { spawned: 0, helped: 0, robbed: 0, ko: 0 },
};

/* ── кто ── */
function thug (bat) {
  const hex = pick(TRACK);
  const grp = A.makeHuman(null, { shirt: hex, pants: hex, cap: '#131317', fat: false, fem: false });
  const u = grp.userData;
  for (const [part, h, y] of [[u.legL, 0.62, -0.34], [u.legR, 0.62, -0.34], [u.armL, 0.42, -0.23], [u.armR, 0.42, -0.23]]) {
    if (!part) continue;
    const g = [];
    for (const s of [-1, 1]) A.box(g, 0.02, h, 0.03, '#f2f2f0', s * 0.078, y, 0);
    part.add(new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC));
  }
  if (bat && A.ADULT && u.armR) {                  // детская версия — без бит
    const g = [];
    A.box(g, 0.06, 0.5, 0.06, '#6b4a2e', 0, -0.62, 0.05);
    A.box(g, 0.09, 0.5, 0.09, '#9a7348', 0, -1.1, 0.05);
    u.armR.add(new THREE.Mesh(A.mergeGeos(g), A.HUMAN_VC));
  }
  A.scene.add(grp);
  return { grp, u, x: 0, z: 0, h: 0, ph: rand(0, 6), dead: 0, push: 0, pushT: rand(0.4, 1.4), bubble: null, bubT: 0, tx: 0, tz: 0 };
}
function victim () {
  const person = makePerson({});
  const grp = A.makeHuman(person, {});
  const u = grp.userData;
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.12), new THREE.MeshLambertMaterial({ color: pick(BAG), flatShading: true }));
  bag.position.set(0, -0.66, 0.05);
  if (u.armL) u.armL.add(bag); else grp.add(bag);
  A.scene.add(grp);
  return { grp, u, person, bag, x: 0, z: 0, h: 0, ph: 0, dead: 0, bubble: null, bubT: 0, sit: 0, jx: 0, jz: 0, bx: 0, bz: 0, walkT: 0 };
}

function say (m, text, col) {
  if (!A.sayBubble || !m || m.dead) return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || '#5a4a9a', 2.7);
  m.bubT = 2.6;
}
function unsay (m) { if (m && m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; } }

/* ── где поставить: тротуар у улицы в бандитском круге, впереди по ходу ── */
function findSpot (force) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz), h = sp > 3 ? Math.atan2(V.vx, V.vz) : V.h;
  for (let k = 0; k < 40; k++) {
    const a = h + rand(-PRESS.AHEAD, PRESS.AHEAD) * (k > 25 ? 2.5 : 1), d = rand(PRESS.R[0], PRESS.R[1]) * (force && k > 30 ? 0.5 : 1);
    const x = V.x + Math.sin(a) * d, z = V.z + Math.cos(a) * d;
    if (!force && !inGang(x, z)) continue;
    const r = A.nearestRoad(x, z, 4, 2);                  // улица, не дворовый проезд
    if (!r || r.d > 35 || r.seg.b) continue;
    const w = r.seg.w || 7;
    let nx = x - r.x, nz = z - r.z;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.2) { const sx = r.seg.x2 - r.seg.x1, sz = r.seg.z2 - r.seg.z1, sl = Math.hypot(sx, sz) || 1; nx = sz / sl; nz = -sx / sl; }
    else { nx /= nl; nz /= nl; }
    const off = w / 2 + rand(2.4, 3.4);
    const px = r.x + nx * off, pz = r.z + nz * off;
    if (!A.inBounds(px, pz, 8) || A.inHouse(px, pz, 1.8)) continue;
    const r2 = A.nearestRoad(px, pz);
    if (r2 && r2.d < (r2.seg.w || 7) / 2 + 1.4) continue;    // не на проезжей части (и не у другой улицы)
    if (!force && Math.hypot(px - V.x, pz - V.z) < 55) continue;
    return { x: px, z: pz, nx, nz };
  }
  return null;
}

export function spawn (force = false) {
  if (!A || SC.st) return false;
  const s = findSpot(force);
  if (!s) return false;
  SC.st = 'press'; SC.t = 0; SC.x = s.x; SC.z = s.z; SC.standT = 0; SC.sayT = 0.6; SC.vicT = 1.4; SC.how = ''; SC.tip = 0;
  const v = victim();
  v.x = v.bx = s.x; v.z = v.bz = s.z;
  SC.vic = v;
  // кучкой со стороны улицы и с боков: прохожему некуда деться
  const n = Math.round(rand(PRESS.N[0], PRESS.N[1] + 0.49));
  const a0 = Math.atan2(-s.nx, -s.nz);                  // от прохожего — к улице
  SC.men = [];
  for (let i = 0; i < n; i++) {
    const m = thug(i === 0);
    const a = a0 + (i - (n - 1) / 2) * (n > 3 ? 1.05 : 1.3) + Math.PI, rr = rand(PRESS.RING[0], PRESS.RING[1]);
    let x = s.x - Math.sin(a) * rr, z = s.z - Math.cos(a) * rr;
    if (A.inHouse(x, z, 0.3)) { x = s.x - s.nx * rr * -1 + rand(-0.6, 0.6); z = s.z - s.nz * rr * -1 + rand(-0.6, 0.6); }
    m.x = m.tx = x; m.z = m.tz = z; m.h = Math.atan2(s.x - x, s.z - z);
    SC.men.push(m);
  }
  v.h = Math.atan2(SC.men[0].x - v.x, SC.men[0].z - v.z);
  SC.stats.spawned++; SC.n++;
  return true;
}

/* ── помог: разбегаются, прохожий благодарит ── */
function helped (how) {
  if (SC.st !== 'press') return;
  SC.st = 'flee'; SC.t = 0; SC.how = how; SC.helped++; SC.stats.helped++;
  const V = A.V;
  for (const m of SC.men) {
    if (m.dead) continue;
    let dx = m.x - V.x, dz = m.z - V.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    m.tx = m.x + dx * 40 + rand(-8, 8); m.tz = m.z + dz * 40 + rand(-8, 8);
  }
  const lead = SC.men.find(m => !m.dead);
  if (lead) say(lead, t(pick(L_FLEE)), '#d9342c');
  const v = SC.vic;
  if (v && !v.dead) {
    say(v, t(pick(L_THANKS)), '#2f8f5b');
    if (A.emote) A.emote(v.x, 2.2, v.z, 'heart', 4);
  }
  // респект и чаевые
  const gain = RG.GAIN.helpedCivil || 0;                 // econ.js RESPECT.GAIN.helpedCivil
  try { RESPECT.add(null, 'helpedCivil', true); } catch (e) { console.warn('[thugs] respect', e); }
  let tip = 0;
  if (v && !v.dead && chance(PRESS.TIP_CHANCE)) tip = A.reward ? A.reward(Math.round(rand(PRESS.TIP[0], PRESS.TIP[1]) / 50) * 50) : 0;
  SC.tip = tip;
  if (A.popBonus) A.popBonus(t('спас прохожего!'), (gain ? t('+{n} респект', { n: gain }) : '') + (tip ? (gain ? ' · ' : '') + t('на чай {money}', { money: A.money(tip) }) : ''));
}
/* гудок машины (если есть): спугивает ближе HONK_R */
export function honk (x, z) {
  if (SC.st !== 'press' || !A) return false;
  const px = x === undefined ? A.V.x : x, pz = z === undefined ? A.V.z : z;
  if (Math.hypot(px - SC.x, pz - SC.z) > PRESS.HONK_R) return false;
  helped('honk');
  return true;
}
/* не помог — сумку отняли, уходят */
function robbed (why) {
  if (SC.st !== 'press') return;
  SC.st = 'robbed'; SC.t = 0; SC.robbed++; SC.stats.robbed++;
  const v = SC.vic, lead = SC.men.find(m => !m.dead);
  let ax = 0, az = 0;
  if (v) { ax = -Math.sin(v.h); az = -Math.cos(v.h); }
  for (const m of SC.men) {
    if (m.dead) continue;
    // уходят вразвалку от улицы, вдоль тротуара
    m.tx = m.x + ax * 6 + rand(-25, 25); m.tz = m.z + az * 6 + rand(-25, 25);
  }
  if (lead && v && !v.dead) {
    // сумка — у главного
    if (v.bag && v.bag.parent && lead.u.armL) { v.bag.parent.remove(v.bag); lead.u.armL.add(v.bag); }
    say(lead, why === 'ko' ? (A.ADULT ? t('Ха, красава!') : t('Ого, вот это да!')) : t(pick(L_TOOK)), '#d9342c');
    if (why !== 'ko') { v.sit = 1; say(v, t(pick(L_ROBBED)), '#5a4a9a'); }
  } else if (lead) say(lead, A.ADULT ? t('Ха, красава!') : t('Ого, вот это да!'), '#d9342c');
}

export function clear () {
  for (const m of SC.men) { unsay(m); if (!m.dead) { m.dead = 1; A.dropMesh(m.grp); } }
  if (SC.vic) { unsay(SC.vic); if (!SC.vic.dead) A.dropMesh(SC.vic.grp); }
  SC.men = []; SC.vic = null; SC.st = '';
}

/* наезд — по общим правилам: быстрее TIER.FALL — сбит (hits.js), медленнее — твёрдый, выталкиваем */
function contact (p, sp, fx, fz) {
  const V = A.V, ex = p.x - V.x, ez = p.z - V.z, al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  if (Math.abs(al) >= HL || Math.abs(ac) >= HW) return false;
  if (sp * 3.6 >= TIER.FALL) {
    p.dead = 1; unsay(p);
    A.dropMesh(p.grp);
    A.gibHuman({ x: p.x, z: p.z, grp: p.grp }, V.vx, V.vz);
    if (A.onRunOver) A.onRunOver();
    return true;
  }
  const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
  if (outW <= outL) { const k = ac >= 0 ? outW : -outW; p.x += fz * k; p.z -= fx * k; }
  else { const k = al >= 0 ? outL : -outL; p.x += fx * k; p.z += fz * k; }
  return false;
}
const place = p => p.grp.position.set(p.x, A.groundH(p.x, p.z) + (A.curbAt ? A.curbAt(p.x, p.z) : 0), p.z);

function live () {
  const S = A.S;
  return S && ['drive', 'back', 'handover', 'side'].includes(S.state) && !S.ride && !S.freeRun;
}

/* ── кадр ── */
export function step (dt, api) {
  if (api) A = api;
  if (!A) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.THUGS) window.__dlv.THUGS = DEBUG;
  if (!A.CAREER) return;
  if (!SC.hooked) { SC.hooked = 1; CREWS.onHonk(honk); }
  const S = A.S, V = A.V;
  // новая смена — счётчики сначала
  const ses = DIST.session();
  if (ses !== SC.session) { SC.session = ses; SC.n = 0; SC.cd = rand(PRESS.FIRST[0], PRESS.FIRST[1]); if (SC.st) clear(); }
  if (!S || S.state === 'title' || S.state === 'over' || S.state === 'dying') { if (SC.st) clear(); return; }
  if (!SC.st) {
    if (!live()) return;
    if (SC.cd > 0) { SC.cd -= dt; return; }
    if (SC.n >= PRESS.PER_SHIFT) return;
    const ge = WD && WD.GE && WD.GE.st;
    const near = ZN.gangZones().some(g => Math.hypot(V.x - g.x, V.z - g.z) < g.r + PRESS.NEAR);
    if (!near || (ge && ge !== 'wait') || !spawn()) { SC.cd = 2; return; }
    return;
  }
  SC.t += dt;
  const sp = Math.hypot(V.vx, V.vz), fx = Math.sin(V.h), fz = Math.cos(V.h);
  const dCar = Math.hypot(V.x - SC.x, V.z - SC.z);
  if (dCar > PRESS.FAR) { endScene(); return; }

  if (SC.st === 'press') {
    // промчался рядом / встал рядом
    if (dCar < PRESS.SCARE_R + 1.5 && sp * 3.6 >= PRESS.SCARE_KMH && SC.men.some(m => !m.dead && Math.hypot(m.x - V.x, m.z - V.z) < PRESS.SCARE_R)) helped('scare');
    else if (dCar < PRESS.STAND_R && sp < PRESS.STAND_V) { if ((SC.standT += dt) >= PRESS.STAND_T) helped('stand'); }
    else SC.standT = Math.max(0, SC.standT - dt);
    if (SC.st === 'press' && SC.t > PRESS.LIFE) robbed();
  }

  // гопники
  const vic = SC.vic;
  let ko = false;
  for (const m of SC.men) {
    if (m.dead) continue;
    const u = m.u;
    if (m.bubble && (m.bubT -= dt) <= 0) unsay(m);
    let walk = false, speed = 0;
    if (SC.st === 'press') {
      // толкают: рывок руками вперёд, прохожего шатает
      if (vic && !vic.dead) m.h = damp(m.h, m.h + wrap(Math.atan2(vic.x - m.x, vic.z - m.z) - m.h), 6, dt);
      m.push = Math.max(0, m.push - dt * 3);
      if ((m.pushT -= dt) <= 0) {
        m.pushT = rand(1.1, 2.2); m.push = 1;
        if (vic && !vic.dead) { const l = Math.hypot(vic.x - m.x, vic.z - m.z) || 1; vic.jx += (vic.x - m.x) / l * 0.22; vic.jz += (vic.z - m.z) / l * 0.22; }
      }
      const k = m.push;
      if (u.armR) u.armR.rotation.x = -0.4 - 1.1 * k;
      if (u.armL) u.armL.rotation.x = -0.4 - 1.1 * k;
      if (u.legL) { u.legL.rotation.x = 0; u.legR.rotation.x = 0; }
    } else {
      speed = SC.st === 'flee' ? 5.5 : 1.6;
      const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const st = Math.min(1, speed * dt / d), nx = m.x + dx * st, nz = m.z + dz * st;
        if (!A.inHouse(nx, nz, 0.3)) { m.x = nx; m.z = nz; walk = true; }
        else { m.tx = m.x + rand(-20, 20); m.tz = m.z + rand(-20, 20); }
        m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 8, dt);
      }
      m.ph += dt * (walk ? (speed > 3 ? 13 : 7) : 2);
      const sw = walk ? Math.sin(m.ph) * (speed > 3 ? 0.85 : 0.5) : 0;
      if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; }
      if (u.armR) { u.armR.rotation.x = -sw * 0.6; u.armL.rotation.x = SC.st === 'robbed' && m === SC.men[0] ? -0.3 : sw * 0.6; }
    }
    if (contact(m, sp, fx, fz)) { SC.stats.ko++; ko = true; continue; }
    place(m);
    m.grp.rotation.y = m.h;
  }
  if (ko && SC.st === 'press') helped('ko');

  // прохожий
  if (vic && !vic.dead) {
    const u = vic.u;
    if (vic.bubble && (vic.bubT -= dt) <= 0) unsay(vic);
    vic.jx = damp(vic.jx, 0, 3, dt); vic.jz = damp(vic.jz, 0, 3, dt);
    if (SC.st === 'press') {
      vic.x = vic.bx + vic.jx; vic.z = vic.bz + vic.jz;
      vic.ph += dt;
      if (u.armL && A.handsUp) A.handsUp(u, dt, 0.55 + 0.15 * Math.sin(vic.ph * 5));
      const lead = SC.men.find(m => !m.dead);
      if (lead) vic.h = damp(vic.h, vic.h + wrap(Math.atan2(lead.x - vic.x, lead.z - vic.z) - vic.h), 4, dt);
      if ((SC.vicT -= dt) <= 0) { SC.vicT = rand(2.6, 4); say(vic, t(pick(L_VICTIM)), '#2a6fd6'); }
      if ((SC.sayT -= dt) <= 0) {
        SC.sayT = rand(2.4, 3.8);
        const who = SC.men.filter(m => !m.dead);
        if (who.length) say(pick(who), t(pick(A.ADULT ? L_PRESS_ADULT : L_PRESS_KIDS)), '#d9342c');
      }
    } else if (SC.st === 'flee') {
      // руки вниз, лицом к машине; через 4 с уходит по своим делам
      if (u.armL) { u.armL.rotation.x = damp(u.armL.rotation.x, 0, 6, dt); u.armR.rotation.x = damp(u.armR.rotation.x, SC.t < 3 ? -2.6 : 0, 6, dt); u.armL.rotation.z = damp(u.armL.rotation.z, 0, 6, dt); u.armR.rotation.z = damp(u.armR.rotation.z, 0, 6, dt); }
      if (SC.t < 4) vic.h = damp(vic.h, vic.h + wrap(Math.atan2(V.x - vic.x, V.z - vic.z) - vic.h), 5, dt);
      else {
        if (!vic.walkT) { vic.walkT = 1; vic.tx = vic.x + Math.sin(vic.h + Math.PI / 2) * 30; vic.tz = vic.z + Math.cos(vic.h + Math.PI / 2) * 30; }
        const dx = vic.tx - vic.x, dz = vic.tz - vic.z, d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const k = Math.min(1, 1.3 * dt / d), nx = vic.x + dx * k, nz = vic.z + dz * k;
          if (!A.inHouse(nx, nz, 0.3)) { vic.x = nx; vic.z = nz; }
          vic.h = damp(vic.h, vic.h + wrap(Math.atan2(dx, dz) - vic.h), 6, dt);
          vic.ph += dt * 7;
          const sw = Math.sin(vic.ph) * 0.5;
          if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; }
        }
      }
    } else if (SC.st === 'robbed') {
      // сел на асфальт, обхватил голову
      vic.sit = Math.min(1, vic.sit + dt * 2);
      if (u.legL) { u.legL.rotation.x = -1.4 * vic.sit; u.legR.rotation.x = -1.4 * vic.sit; }
      if (u.armL) { u.armL.rotation.x = damp(u.armL.rotation.x, -2.4, 4, dt); u.armR.rotation.x = damp(u.armR.rotation.x, -2.4, 4, dt); }
    }
    if (contact(vic, sp, fx, fz)) {
      // сбил самого прохожего: гопникам — смешно
      if (SC.st === 'press') robbed('ko');
    } else {
      place(vic);
      if (vic.sit) vic.grp.position.y -= 0.55 * vic.sit;
      vic.grp.rotation.y = vic.h;
    }
  }

  if (SC.st === 'press' && SC.men.every(m => m.dead)) helped('ko');
  if ((SC.st === 'flee' && SC.t > 9) || (SC.st === 'robbed' && SC.t > 12)) endScene();
}
function endScene () {
  clear();
  SC.cd = rand(PRESS.EVERY[0], PRESS.EVERY[1]);
}

/* красная точка на радаре, пока прессуют: «там помочь» */
export function drawRadar (ctx, tr, s) {
  if (SC.st !== 'press' || !A) return;
  const [a, b] = tr(SC.x, SC.z);
  const k = 0.5 + 0.5 * Math.sin(SC.t * 6);
  ctx.beginPath(); ctx.arc(a, b, 5 + 3 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 70, 60, ' + (0.55 + 0.35 * k) + ')'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff3d6'; ctx.stroke();
}

export const DEBUG = {
  PRESS, SC,
  spawn: (force = true) => { if (SC.st) clear(); return spawn(force); },
  honk, clear, help: () => helped('debug'),
  get state () { return { st: SC.st, t: Math.round(SC.t * 10) / 10, x: Math.round(SC.x), z: Math.round(SC.z), men: SC.men.filter(m => !m.dead).length, n: SC.n, cd: Math.round(SC.cd), how: SC.how, tip: SC.tip, ...SC.stats }; },
};
