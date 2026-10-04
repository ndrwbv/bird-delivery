/* ──────────────────────────────────────────────────────────────────────────
   Налёт на твою точку и ёлка-турель (блок 9; правила — docs/CAREER.md
   «Респект и войны брендов» → «Налёт на точку», числа — econ.js RAID и TURRET).

   Налёт. Иногда посреди смены 4—6 бойцов в форме «Вселенной суши» (голубые
   рубашки, синие кепки) или «Королевы Бургеров» (жёлтые рубашки, синие штаны
   и кепки) прибегают к пиццерии-шару, где ты работаешь, и громят её: машут
   битами (детская — подушками), сносят столики. Точка мигает красным на радаре
   (за краем — у края) и на большой карте, Толик пишет в чат одной фразой
   («Налёт на точку! Гони!»; итог — тоже одной). Других надписей нет. Успел — отбился: каждого надо сбить машиной
   (быстрее 20 км/ч; летишь прямо в него — не отпрыгнет, сбит), распугать
   (пронёсся рядом быстрее 25 км/ч, не задев; убегающего тоже можно сбить)
   или посигналить рядом (H или постоял рядом 1,5 с: в 18 м каждый второй разбегается, кто уже бьёт машину — нет). Медленнее
   20 км/ч — налётчик твёрдый, отходит и бьёт по машине (полсердца).
   Когда — econ.js RAID: не раньше 5-й смены, не в быстром заезде и не
   «покататься», шанс 30 % на смену, 5 смен без налёта — следующая точно с
   ним, через 50—130 с от начала смены и только когда ты дальше 150 м от точки.
   Во время заказа налёт не мешает: срок заказа идёт, ехать — решать тебе.

   Ёлка-турель. Покупается в «потратить» (вкладка «ёлка-турель») с звания
   econ.js RESPECT.TURRET_LEVEL, стоит у пиццерии, где работаешь (в «весь
   город» — у той, откуда едешь). Ёлка с гирляндой, звездой и стволом; сама
   крутится к цели и стреляет по налётчикам (и по бойцам конкурентов, если
   game.js даст их список — api.foes) в радиусе TURRET.R: взрослая — пули
   (вспышка, трассер, искры), детская — снежками; попала — налётчик лежит
   (взрослая) или с визгом убегает (детская). Меши общие на всю игру.

   Из game.js:
     RAID.init(api)              — один раз после города
     RAID.shiftStart({ ride, quick }) — начало смены: будет ли налёт
     RAID.step(dt)               — каждый кадр
     RAID.radar(ctx, rA, rB, R)  — мигающая точка на радаре; RAID.mapMark(x, fmX, fmZ, u) — на карте
     RAID.honk()                 — игрок посигналил
     RAID.loadWait(P)            — сколько секунд дольше грузится заказ из пиццерии P (проигранный налёт)
   Из career.js: RAID.spendTab() / RAID.spendPane(el, api, done) — вкладка «ёлка-турель».
   Отладка: __dlv.RAID — start(brand), win(), lose(), buy(), turret(on), state.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { RAID, TURRET, RESPECT as RCFG } from './econ.js';
import * as RESPECT from './respect.js';
import * as DIRECTOR from './director.js';   // режиссёр событий: налёт — крупное, не в начале сессии
import * as CREWS from './crews.js';             // форма сетей — та же, что у компаний на улицах
import { TIER } from './hits.js';
import './raid.css';

/* поведение (не деньги — деньги в econ.js) */
const B = {
  SPAWN: [26, 34],     // м от точки — откуда прибегают (с улицы)
  RUN: 3.8, CHARGE: 4.2, FLEE: 6,  // м/с
  AGGRO: 26,           // м — ближе к машине: часть налётчиков бежит бить её
  HIT_R: 1.9, HIT_CD: 1.4, HIT_P: 0.55, DMG: 0.4,   // удар по машине: полсердца
  HONK_R: 18, HONK_P: 0.5,   // м — сигнал: в радиусе каждый второй разбегается; кто уже бьёт машину — не боится
  SCARE_R: 4.5, SCARE_KMH: 25,      // пронёсся рядом — убегает
  CAME_R: 70,          // м — «ты приехал» (иначе победа — заслуга ёлки)
  SHOW_R: 260,         // дальше — люди не рисуются
  TABLES_AT: 0.35,     // доля времени — столики снесены
};

const rand = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const pick = a => a[(Math.random() * a.length) | 0];

const BRANDS = {
  sushi: { name: N_('Вселенная суши'), shirt: '#4fc3f7', pants: '#20314f', cap: '#1e6fb8', bubble: '#1b6fa8',
    cry: [N_('роллы — сила!'), N_('пицца — прошлый век!'), N_('васаби вам в тесто!'), N_('это наш район!')] },
  burger: { name: N_('Королева Бургеров'), shirt: '#ffcc1a', pants: '#1f4fb8', cap: '#1f4fb8', bubble: '#1d3f8f',
    cry: [N_('слава королеве!'), N_('бургер — король!'), N_('пицца — не еда!'), N_('это наш район!')] },
};
const RUN_LINES = [N_('атас!'), N_('валим!'), N_('мама!'), N_('я пошутил!')];

let A = null;
const R = { on: false, P: null, brand: '', men: [], t: 0, T0: 0, came: false, myKO: 0, gunKO: 0, scared: 0, tables: false,
  plan: -1, sinceT: 0, shards: [], lost: null, last: null, stats: { started: 0, won: 0, lost: 0, shots: 0, hits: 0 } };
const TUR = { g: null, head: null, at: null, cd: 1, fx: [], light: 0 };

/* ── память: смены без налёта, куплена ли ёлка ── */
const KEY = 'dlv-raid', TKEY = 'dlv-turret';
const load = () => {
  let v = A && A.Store.get(KEY, null);
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  return v && typeof v === 'object' ? v : { since: 0 };
};
export const hasTurret = () => !!(A && +A.Store.get(TKEY, 0));
export function turretOpen () {
  try { const p = RESPECT.perk('turret'); if (p !== undefined) return !!p; } catch (e) { /* нет респекта */ }
  try { return RESPECT.level().i >= RCFG.TURRET_LEVEL; } catch (e) { return false; }
}

export function init (api) { A = api; }

/* ── начало смены: решить, будет ли налёт ── */
export function shiftStart (o = {}) {
  clear(true);
  repair();
  R.plan = -1;
  if (!A || !A.CAREER || o.ride || o.quick) return;
  const shifts = +A.Store.get('dlv-shifts', 0) || 0, sv = load();
  if (shifts < RAID.FROM) return;
  if (sv.since + 1 >= RAID.PITY || chance(RAID.CHANCE)) { R.plan = rand(RAID.AT[0], RAID.AT[1]); sv.since = 0; }
  else sv.since = (sv.since || 0) + 1;
  A.Store.set(KEY, sv);
}

/* ── форма: рубашка и кепка своей сети; в руке бита (детская — подушка) ── */
const lam = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
let BAT_GEO = null, PILLOW_GEO = null, BAT_MAT = null, PILLOW_MAT = null;
function fighter (brand) {
  const b = Object.assign({}, BRANDS[brand], (CREWS.BRANDS && CREWS.BRANDS[brand]) || {});
  const grp = A.makeHuman(null, { shirt: b.shirt, pants: b.pants, cap: b.cap, fat: chance(0.2) });
  const u = grp.userData;
  if (!BAT_GEO) {
    BAT_GEO = new THREE.BoxGeometry(0.08, 0.08, 0.95); BAT_MAT = lam('#5c4a3a'); BAT_MAT.userData.keep = true;
    PILLOW_GEO = new THREE.BoxGeometry(0.34, 0.16, 0.62); PILLOW_MAT = lam('#f4f1ea'); PILLOW_MAT.userData.keep = true;
  }
  const st = new THREE.Mesh(A.ADULT ? BAT_GEO : PILLOW_GEO, A.ADULT ? BAT_MAT : PILLOW_MAT);
  st.userData.shared = true;
  st.position.set(0, -0.56, 0.45);
  u.armR.add(st);
  A.scene.add(grp);
  return grp;
}

/* где встать громить: дуга площади со стороны улицы, столики, витрина */
function spots (P, n) {
  const d = P.dome, cx = d ? d.x : P.bx, cz = d ? d.z : P.bz, rr = (d ? d.R : 6) + 1.6;
  const fa = Math.atan2(P.x - cx, P.z - cz);           // к улице
  const out = [];
  out.push([P.wx + Math.sin(fa) * 1.4, P.wz + Math.cos(fa) * 1.4]);   // у витрины
  for (let i = 1; i < n; i++) {
    const a = fa + (i % 2 ? 1 : -1) * (0.35 + Math.ceil(i / 2) * 0.42) + rand(-0.12, 0.12);
    out.push([cx + Math.sin(a) * (rr + rand(0, 1.2)), cz + Math.cos(a) * (rr + rand(0, 1.2))]);
  }
  return out;
}

/* ── начать налёт ── */
export function start (brand, P) {
  if (!A) return false;
  P = P || A.PIZZA;
  if (!P) return false;
  clear(true);
  brand = brand || pick(['sushi', 'burger']);
  const n = Math.round(rand(RAID.N[0], RAID.N[1] + 0.49));
  const d = P.dome, cx = d ? d.x : P.bx, cz = d ? d.z : P.bz;
  // прибегают с улицы: вдоль неё по обе стороны от подъезда к точке
  const fx = P.x - cx, fz = P.z - cz, fl = Math.hypot(fx, fz) || 1, ux = -fz / fl, uz = fx / fl;
  const sp = spots(P, n);
  Object.assign(R, { on: true, P, brand, t: RAID.TIME, T0: RAID.TIME, came: false, myKO: 0, gunKO: 0, scared: 0, tables: false, men: [], sayT: 1 });
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1, k = rand(B.SPAWN[0], B.SPAWN[1]);
    let x = P.x + ux * s * k + fx / fl * rand(1, 4), z = P.z + uz * s * k + fz / fl * rand(1, 4);
    const grp = fighter(brand);
    const m = { grp, u: grp.userData, x, z, h: 0, st: 'in', tx: sp[i][0], tz: sp[i][1], ph: rand(0, 6), swing: 0, swingCd: rand(0, 1), hitCd: 0,
      bubble: null, bubT: 0, t: 0, bump: 0, charge: chance(0.5) };
    if (A.pushOut) A.pushOut(m, 0.45);
    grp.position.set(m.x, A.groundH(m.x, m.z), m.z);
    R.men.push(m);
  }
  R.stats.started++;
  DIRECTOR.start('raid');
  if (A.chat) A.chat(t('Налёт на точку! Гони!'));      // о налёте — только Толик, одной фразой; на радаре и карте — мигающая точка
  if (A.Snd) { A.Snd.blip(440, 0.12, 'square', 0.14); setTimeout(() => A.Snd && A.Snd.blip(330, 0.18, 'square', 0.14), 160); }
  return true;
}

/* ── убрать всех (конец смены, новая смена) ── */
export function clear (quiet) {
  for (const m of R.men) dropMan(m);
  R.men.length = 0;
  if (R.on) DIRECTOR.end('raid');
  R.on = false;
  if (!quiet) R.P = null;
}
function dropMan (m) {
  if (m.st === 'gone') return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
  unshare(m.grp);                                    // общая бита не утилизируется
  A.dropMesh(m.grp);
  m.st = 'gone';
}
/* общие меши (бита, подушка) — снять с человека до dropMesh, иначе он утилизирует их геометрию */
function unshare (g) {
  const sh = [];
  g.traverse(o => { if (o.userData && o.userData.shared) sh.push(o); });
  for (const o of sh) if (o.parent) o.parent.remove(o);
}
function say (m, text, col) {
  if (!A.sayBubble || m.st === 'gone') return;
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); }
  m.bubble = A.sayBubble(m.grp, text, col || BRANDS[R.brand].bubble, 2.8);
  m.bubT = 2.4;
}
const standing = () => R.men.filter(m => m.st === 'in' || m.st === 'smash' || m.st === 'charge').length;

/* ── итог ── */
function end (won) {
  R.on = false;
  DIRECTOR.end('raid');
  R.last = { won, came: R.came, myKO: R.myKO, gunKO: R.gunKO, scared: R.scared, left: Math.round(R.t), took: Math.round(R.T0 - R.t) };
  if (won) {
    R.stats.won++;
    const full = R.came;
    const resp = Math.round((RCFG.GAIN.defend || 8) * (full ? 1 : RAID.TURRET_RESPECT));
    const cash = full ? RAID.WIN_CASH + R.myKO * RAID.KO_CASH : 0;
    // = RESPECT.gain('defend'), но тихо: сумма и респект — одной всплывашкой ниже; без тебя — вполовину
    RESPECT.add(full ? null : resp, 'defend', true);
    if (cash && A.reward) A.reward(cash);
    if (A.chat) A.chat(full ? t('Отбил точку! +{money}', { money: A.money(cash) }) : t('Ёлка отбила точку.'));
    R.last.cash = cash; R.last.resp = resp;
    // убежавшие и уцелевшие — прочь
    for (const m of R.men) if (m.st !== 'gone' && m.st !== 'flee') { m.st = 'flee'; m.t = 0; }
  } else {
    R.stats.lost++;
    const fine = RAID.LOST_FINE;
    if (A.fine) A.fine(fine);
    const resp = RCFG.GAIN.noDefend || -6;
    RESPECT.add(null, 'noDefend', true);           // = RESPECT.gain('noDefend'), тихо
    smashTables(true);
    shards(R.P);
    R.lost = R.P;
    if (A.chat) A.chat(t('Точку разгромили. Ремонт −{money}', { money: A.money(fine) }));
    if (A.Snd && A.Snd.fail) A.Snd.fail();
    R.last.fine = fine; R.last.resp = resp;
    for (const m of R.men) if (m.st !== 'gone' && m.st !== 'flee') { m.st = 'flee'; m.t = 0; m.cheer = 1; }
  }
}

/* столики у точки — снести (smashNear в game.js) */
function smashTables (all) {
  if (R.tables && !all) return;
  R.tables = true;
  const P = R.P;
  if (A.smashTables && P) A.smashTables(P.dome ? P.dome.x : P.bx, P.dome ? P.dome.z : P.bz, (P.dome ? P.dome.R : 8) + 8);
}
/* осколки витрины на плитке — до следующей смены */
let SHARD_GEO = null, SHARD_MAT = null;
function shards (P) {
  if (!P) return;
  if (!SHARD_GEO) { SHARD_GEO = new THREE.BoxGeometry(0.32, 0.02, 0.2); SHARD_MAT = new THREE.MeshLambertMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.8 }); }
  const im = new THREE.InstancedMesh(SHARD_GEO, SHARD_MAT, 26), o = new THREE.Object3D();
  for (let i = 0; i < 26; i++) {
    const x = P.wx + rand(-2.6, 2.6), z = P.wz + rand(-2.6, 2.6);
    o.position.set(x, A.groundH(x, z) + 0.16, z); o.rotation.set(rand(-0.2, 0.2), rand(0, 6.3), rand(-0.2, 0.2));
    o.scale.setScalar(rand(0.5, 1.6)); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  A.scene.add(im);
  R.shards.push(im);
}
function repair () {
  for (const m of R.shards) { A && A.scene.remove(m); m.dispose && m.dispose(); }
  R.shards.length = 0;
  R.lost = null;
}
/* проигранный налёт: заказ из этой точки грузится дольше (game.js loadPizza) */
export const loadWait = P => (R.lost && (!P || P === R.lost) ? RAID.LOST_LOAD : 0);

/* ── сигнал: H (гудит crews.js) или постоял рядом с налётчиками полторы секунды — машина гудит сама ── */
let honkT = -1, standT = 0, keyOn = false;
function bindKey () {
  if (keyOn || typeof addEventListener === 'undefined') return;
  keyOn = true;
  addEventListener('keydown', e => { if (e.code === 'KeyH' && !e.repeat && R.on) honk(); });
}
function standHonk (dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  const close = R.men.some(m => (m.st === 'smash' || m.st === 'charge' || m.st === 'in') && Math.hypot(m.x - V.x, m.z - V.z) < B.HONK_R);
  if (close && sp < 3) standT += dt; else standT = 0;
  if (standT > 1.5) {
    standT = -2;                                       // следующий — не раньше чем через 3,5 с
    if (A.Snd) { A.Snd.blip(392, 0.16, 'square', 0.09); setTimeout(() => A.Snd.blip(392, 0.26, 'square', 0.09), 190); }
    honk();
  }
}
export function honk () {
  honkT = 0;
  if (!R.on || !A) return 0;
  let n = 0;
  for (const m of R.men) {
    if (m.st === 'gone' || m.st === 'flee' || m.st === 'charge') continue;
    if (Math.hypot(m.x - A.V.x, m.z - A.V.z) < B.HONK_R && chance(B.HONK_P)) { flee(m); n++; }
  }
  return n;
}
function flee (m, quiet) {
  if (m.st === 'flee' || m.st === 'gone') return;
  m.st = 'flee'; m.t = 0; R.scared++;
  if (!quiet) say(m, t(pick(RUN_LINES)), '#d9342c');
}

/* ── шаг налётчика ── */
function manStep (m, dt, dV, near) {
  const V = A.V, u = m.u, sp = Math.hypot(V.vx, V.vz);
  m.t += dt;
  if (m.bubble && (m.bubT -= dt) <= 0) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
  const d = Math.hypot(V.x - m.x, V.z - m.z);
  let tx = m.tx, tz = m.tz, speed = 0, walk = false;
  if (m.st === 'flee') {
    // прочь от точки и от машины
    const P = R.P, cx = P.dome ? P.dome.x : P.bx, cz = P.dome ? P.dome.z : P.bz;
    let ax = m.x - cx + (m.x - V.x) * 0.6, az = m.z - cz + (m.z - V.z) * 0.6;
    const al = Math.hypot(ax, az) || 1;
    tx = m.x + ax / al * 10; tz = m.z + az / al * 10; speed = B.FLEE;
    if (m.cheer && m.t < 1.5) speed = 0;                 // проиграл — они сначала ликуют
    if (m.t > 7 && (d > 40 || !near)) { dropMan(m); return; }
  } else if (m.st === 'in') {
    speed = B.RUN;
    if (Math.hypot(tx - m.x, tz - m.z) < 0.6) { m.st = 'smash'; m.swingCd = rand(0.2, 0.8); }
  } else if (m.st === 'smash') {
    if (m.charge && d < B.AGGRO && R.on) m.st = 'charge';
  } else if (m.st === 'charge') {
    tx = V.x; tz = V.z; speed = d > B.HIT_R ? B.CHARGE : 0;
    if (d > B.AGGRO + 14) m.st = 'in';
  }
  if (speed > 0) {
    const dx = tx - m.x, dz = tz - m.z, l = Math.hypot(dx, dz);
    if (l > 0.3) {
      const k = Math.min(l, speed * dt);
      m.x += dx / l * k; m.z += dz / l * k;
      if (A.pushOut) A.pushOut(m, 0.45);
      m.h = damp(m.h, m.h + wrap(Math.atan2(dx, dz) - m.h), 10, dt);
      walk = true;
    }
  } else if (m.st === 'charge' || (m.st === 'smash' && d < 14)) m.h = damp(m.h, m.h + wrap(Math.atan2(V.x - m.x, V.z - m.z) - m.h), 6, dt);
  else if (m.st === 'smash') {
    const P = R.P, cx = P.dome ? P.dome.x : P.bx, cz = P.dome ? P.dome.z : P.bz;
    m.h = damp(m.h, m.h + wrap(Math.atan2(cx - m.x, cz - m.z) - m.h), 4, dt);
  }

  // замах: громят точку или бьют машину
  m.swing = Math.max(0, m.swing - dt);
  if ((m.st === 'smash' || (m.st === 'charge' && d < B.HIT_R + 0.4)) && (m.swingCd -= dt) <= 0) {
    m.swingCd = rand(0.7, 1.2); m.swing = 0.3;
    if (m.st === 'charge' && sp < 4 && (m.hitCd <= 0) && chance(B.HIT_P)) {
      m.hitCd = B.HIT_CD;
      if (A.hurt) A.hurt(B.DMG);
      if (A.Snd) A.Snd.blip(A.ADULT ? 140 : 300, 0.06, A.ADULT ? 'square' : 'triangle', 0.1);
    } else if (dV < 60 && A.Snd && chance(0.5)) A.Snd.blip(rand(150, 230), 0.05, 'square', 0.05);
  }
  m.hitCd = Math.max(0, m.hitCd - dt);

  // поза
  m.ph += dt * (walk ? (speed > 4 ? 12 : 9) : 2);
  const sw = walk ? Math.sin(m.ph) * 0.9 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (m.st === 'flee' && m.cheer && m.t < 1.5) { u.armR.rotation.x = u.armL.rotation.x = -2.8 + Math.sin(m.t * 14) * 0.3; }
  else if (m.st === 'flee') { u.armR.rotation.x = u.armL.rotation.x = -2.9; }        // руки вверх — убегает
  else if (m.swing > 0) u.armR.rotation.x = -2.8 + (0.3 - m.swing) * 8;
  else { u.armR.rotation.x = damp(u.armR.rotation.x, walk ? -sw * 0.5 : -2.4, 8, dt); u.armL.rotation.x = walk ? sw * 0.6 : -0.3; }
  m.grp.position.set(m.x, A.groundH(m.x, m.z) + (A.curbAt ? A.curbAt(m.x, m.z) : 0), m.z);
  m.grp.rotation.y = m.h;
  m.grp.visible = near;

  // машина: сбил / твёрдый / пронёсся рядом
  const fx = Math.sin(V.h), fz = Math.cos(V.h), ex = m.x - V.x, ez = m.z - V.z;
  const al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  const HL = (A.CAR_L || 2.2) + 0.5, HW = (A.CAR_W || 1) + 0.35, kmh = sp * 3.6;
  const inBox = Math.abs(al) < HL && Math.abs(ac) < HW;
  // убегающего тоже можно сбить (он уже убран — без премии, как прохожий)
  if (m.st === 'flee') { if (inBox && kmh >= TIER.FALL) knock(m, V.vx, V.vz, kmh, true, true); return; }
  m.bump = Math.max(0, m.bump - dt);
  if (inBox) {
    if (kmh >= TIER.FALL) { knock(m, V.vx, V.vz, kmh, true); return; }
    const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
    if (outW <= outL) { const k = ac >= 0 ? outW : -outW; m.x += fz * k; m.z -= fx * k; }
    else { const k = al >= 0 ? outL : -outL; m.x += fx * k; m.z += fz * k; }
    if (A.pushOut) A.pushOut(m, 0.45);
    if (m.bump <= 0 && sp > 1) { m.bump = 1; if (A.bump) A.bump(); m.st = 'charge'; m.charge = true; }
  } else if (kmh >= B.SCARE_KMH && d < B.SCARE_R && !(al > 0 && Math.abs(ac) < HW + 0.3)) flee(m);   // пугается, только если машина проносится мимо, а не летит прямо в него
}

/* сбит машиной или ёлкой */
function knock (m, vx, vz, kmh, byCar, fled) {
  if (m.bubble) { m.grp.remove(m.bubble); m.bubble.material.dispose(); m.bubble = null; }
  if (byCar) { if (!fled) R.myKO++; if (A.onRunOver) A.onRunOver(); }
  else R.gunKO++;
  unshare(m.grp);
  A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, vx, vz, kmh);       // взрослая — лежит/кусками, детская — со звёздочками и встаёт
  A.dropMesh(m.grp);
  m.st = 'gone';
}

/* ── ёлка-турель: модель кодом, меши общие ── */
const TG = {};
function turretGeo () {
  if (TG.cone) return TG;
  TG.trunk = new THREE.CylinderGeometry(0.16, 0.22, 0.9, 6);
  TG.cone = [new THREE.ConeGeometry(1.25, 1.5, 8), new THREE.ConeGeometry(0.95, 1.25, 8), new THREE.ConeGeometry(0.62, 1.05, 8)];
  TG.base = new THREE.CylinderGeometry(0.7, 0.85, 0.4, 8);
  TG.barrel = new THREE.CylinderGeometry(0.09, 0.11, 1.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.9);
  TG.drum = new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8).rotateX(Math.PI / 2);
  TG.bulb = new THREE.SphereGeometry(0.075, 6, 4);
  TG.star = new THREE.OctahedronGeometry(0.24, 0);
  TG.flash = new THREE.SphereGeometry(0.2, 6, 4);
  TG.snow = new THREE.SphereGeometry(0.14, 7, 5);
  TG.mGreen = lam('#1f6b3a'); TG.mGreen2 = lam('#2a7f45'); TG.mWood = lam('#6b4a2e'); TG.mBase = lam('#c9302c');
  TG.mGun = lam('#2b2d33'); TG.mStar = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  TG.bulbs = ['#ff3b30', '#ffd23f', '#3fa9ff', '#7fe07a'].map(c => new THREE.MeshBasicMaterial({ color: c }));
  TG.mSnow = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (const k in TG) if (TG[k] && TG[k].isMaterial) TG[k].userData.keep = true;
  return TG;
}
function buildTurret () {
  const G = turretGeo(), g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(G.base, G.mBase, 0, 0.2, 0);
  add(G.trunk, G.mWood, 0, 0.75, 0);
  add(G.cone[0], G.mGreen, 0, 1.75, 0);
  add(G.cone[1], G.mGreen2, 0, 2.6, 0);
  add(G.cone[2], G.mGreen, 0, 3.35, 0);
  add(G.star, G.mStar, 0, 4.0, 0);
  // гирлянда: спираль лампочек
  for (let i = 0; i < 18; i++) {
    const k = i / 18, y = 1.1 + k * 2.6, r = 1.15 - k * 0.85, a = k * Math.PI * 5;
    add(G.bulb, G.bulbs[i % 4], Math.sin(a) * r, y, Math.cos(a) * r);
  }
  // ствол на поворотной голове — из середины ёлки
  const head = new THREE.Group();
  head.position.set(0, 2.2, 0);
  const dr = new THREE.Mesh(G.drum, G.mGun); head.add(dr);
  const br = new THREE.Mesh(G.barrel, G.mGun); head.add(br);
  g.add(head);
  return { g, head };
}
/* где стоит: у пиццерии, где работаешь — на площади сбоку от входа */
function placeTurret (P) {
  if (!TUR.g) { const b = buildTurret(); TUR.g = b.g; TUR.head = b.head; A.scene.add(TUR.g); }
  const d = P.dome, cx = d ? d.x : P.bx, cz = d ? d.z : P.bz;
  const fa = Math.atan2(P.x - cx, P.z - cz), a = fa - 1.15, rr = (d ? d.R : 7) + 1.4;
  let x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
  const p = { x, z };
  if (A.pushOut) A.pushOut(p, 1);
  TUR.g.position.set(p.x, A.groundH(p.x, p.z) + 0.12, p.z);
  TUR.at = P;
  TUR.g.visible = true;
}
/* цели: налётчики и бойцы конкурентов от game.js (api.foes → [{ x, z, hit(dirx, dirz) }]) */
function targets () {
  const out = [];
  if (R.on) for (const m of R.men) if (m.st === 'in' || m.st === 'smash' || m.st === 'charge') out.push(m);
  if (A.foes) { try { for (const f of A.foes() || []) out.push(f); } catch (e) { /* чужой список */ } }
  return out;
}
function turretStep (dt) {
  const P = A.PIZZA;
  if (!hasTurret() || !P || A.S.ride) { if (TUR.g) TUR.g.visible = false; return; }
  if (TUR.at !== P || !TUR.g) placeTurret(P);
  TUR.g.visible = true;
  const gx = TUR.g.position.x, gz = TUR.g.position.z;
  const dV = Math.hypot(A.V.x - gx, A.V.z - gz), near = dV < B.SHOW_R;
  // гирлянда мигает (общие материалы — дёшево)
  TUR.light += dt;
  if (near) { const k = Math.floor(TUR.light * 3); for (let i = 0; i < 4; i++) TG.bulbs[i].color.setStyle(((k + i) % 4) < 2 ? ['#ff3b30', '#ffd23f', '#3fa9ff', '#7fe07a'][i] : '#2a2a2a'); }
  let best = null, bd = TURRET.R;
  for (const m of targets()) { const d = Math.hypot(m.x - gx, m.z - gz); if (d < bd) { bd = d; best = m; } }
  if (best) TUR.head.rotation.y = damp(TUR.head.rotation.y, TUR.head.rotation.y + wrap(Math.atan2(best.x - gx, best.z - gz) - TUR.head.rotation.y), 8, dt);
  TUR.cd -= dt;
  if (best && TUR.cd <= 0) { TUR.cd = TURRET.RATE * rand(0.85, 1.15); shoot(best, near); }
  fxStep(dt);
}
function muzzle () {
  const p = new THREE.Vector3(0, 0, 1.7);
  TUR.head.localToWorld(p);
  return p;
}
function shoot (m, near) {
  R.stats.shots++;
  const hit = chance(TURRET.HIT), p = muzzle();
  const ty = A.groundH(m.x, m.z) + 1.1, tx = m.x + (hit ? 0 : rand(-2, 2)), tz = m.z + (hit ? 0 : rand(-2, 2));
  if (A.ADULT) {
    if (near) {
      const fl = new THREE.Mesh(TG.flash, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, depthWrite: false }));
      fl.position.copy(p); A.scene.add(fl);
      const g = new THREE.BufferGeometry().setFromPoints([p.clone(), new THREE.Vector3(tx, ty, tz)]);
      const tr = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9 }));
      A.scene.add(tr);
      TUR.fx.push({ o: fl, life: 0.07 }, { o: tr, life: 0.06, geo: g });
      if (A.Snd) { A.Snd.noise(0.08, 0.22); A.Snd.blip(180, 0.06, 'square', 0.12); }
      if (!hit && A.sparks) A.sparks(tx, 0.1, tz, 3);
    }
    if (hit) gunHit(m, tx - p.x, tz - p.z);
  } else {
    // снежок по дуге, долетает за 0,5 с
    const o = new THREE.Mesh(TG.snow, TG.mSnow);
    o.position.copy(p); A.scene.add(o);
    TUR.fx.push({ o, life: 0.5, keep: true, fly: { x0: p.x, y0: p.y, z0: p.z, x1: tx, y1: ty, z1: tz, T: 0.5, t: 0, m: hit ? m : null } });
    if (near && A.Snd) A.Snd.blip(620, 0.06, 'triangle', 0.08);
  }
}
function gunHit (m, dx, dz) {
  R.stats.hits++;
  const l = Math.hypot(dx, dz) || 1;
  if (m.hit) { m.hit(dx / l, dz / l); return; }      // боец конкурента — по-своему (game.js)
  if (m.st === 'gone' || m.st === 'flee') return;
  if (A.ADULT) knock(m, dx / l * 9, dz / l * 9, 35, false);
  else { R.gunKO++; if (A.puff) A.puff(m.x, 1.4, m.z); flee(m); }   // детская: снежком в лоб — с визгом убегает
}
function fxStep (dt) {
  for (let i = TUR.fx.length - 1; i >= 0; i--) {
    const f = TUR.fx[i];
    f.life -= dt;
    if (f.fly) {
      const q = f.fly; q.t += dt;
      const k = Math.min(1, q.t / q.T);
      f.o.position.set(q.x0 + (q.x1 - q.x0) * k, q.y0 + (q.y1 - q.y0) * k + Math.sin(k * Math.PI) * 1.5, q.z0 + (q.z1 - q.z0) * k);
      if (k >= 1) { if (A.puff) A.puff(q.x1, q.y1, q.z1); if (q.m) gunHit(q.m, q.x1 - q.x0, q.z1 - q.z0); f.life = 0; }
    } else if (f.o.material) f.o.material.opacity = Math.max(0, f.life / 0.07);
    if (f.life <= 0) {
      A.scene.remove(f.o);
      if (!f.keep && f.o.material) f.o.material.dispose();
      if (f.geo) f.geo.dispose();
      TUR.fx.splice(i, 1);
    }
  }
}

/* ── кадр ── */
export function step (dt) {
  if (!A || !A.CAREER) return;
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.RAID) window.__dlv.RAID = DEBUG;
  const S = A.S;
  if (!S || S.state === 'title' || S.state === 'over') {
    if (R.on || R.men.length) clear(true);
    if (TUR.g && S && S.state === 'title') TUR.g.visible = false;
    return;
  }
  if (A.isPlaying && !A.isPlaying()) return;
  // пора начинать?
  if (!R.on && R.plan >= 0 && !S.ride && (S.shiftT || 0) >= R.plan && A.PIZZA) {
    const P = A.PIZZA;
    if (Math.hypot(A.V.x - P.x, A.V.z - P.z) > RAID.FAR && DIRECTOR.can('raid')) { R.plan = -1; start(); }   // режиссёр против — ждём
  }
  turretStep(dt);
  if (!R.men.length) return;
  const P = R.P, dV = P ? Math.hypot(A.V.x - P.x, A.V.z - P.z) : 999, near = dV < B.SHOW_R;
  if (R.on) {
    R.t -= dt;
    if (dV < B.CAME_R) R.came = true;
    bindKey();
    standHonk(dt);
    if (!R.tables && R.t < R.T0 * (1 - B.TABLES_AT)) smashTables();
    // кричат свои лозунги
    if (near && (R.sayT -= dt) <= 0) {
      R.sayT = rand(1.6, 2.6);
      const m = pick(R.men.filter(q => q.st === 'smash' || q.st === 'charge'));
      if (m) say(m, t(pick(BRANDS[R.brand].cry)));
    }
  }
  for (const m of R.men.slice()) if (m.st !== 'gone') manStep(m, dt, dV, near);
  for (let i = R.men.length - 1; i >= 0; i--) if (R.men[i].st === 'gone') R.men.splice(i, 1);
  if (R.on) {
    if (!standing()) end(true);
    else if (R.t <= 0) end(false);
  }
  if (honkT >= 0) honkT += dt;
}

/* ── радар и карта: точка мигает красным ── */
export function radar (x, rA, rB, Rr) {
  if (!R.on || !R.P) return;
  const on = (performance.now() / 250 | 0) % 2 === 0;
  let a = rA(R.P.x, R.P.z), b = rB(R.P.x, R.P.z);
  const len = Math.hypot(a, b);
  if (len > Rr - 8) { a *= (Rr - 8) / len; b *= (Rr - 8) / len; }
  x.globalAlpha = 1;
  x.fillStyle = on ? '#ff2d2d' : '#ffd23f';
  x.fillRect(a - 4.5, b - 4.5, 9, 9);
  x.lineWidth = 1.6; x.strokeStyle = '#33210c'; x.strokeRect(a - 4.5, b - 4.5, 9, 9);
}
export function mapMark (x, fmX, fmZ, u) {
  if (!R.on || !R.P) return;
  const px = fmX(R.P.x), pz = fmZ(R.P.z), k = (performance.now() / 700) % 1;
  x.beginPath(); x.arc(px, pz, (14 + k * 22) * u, 0, Math.PI * 2);
  x.globalAlpha = 1 - k; x.lineWidth = 3 * u; x.strokeStyle = '#ff2d2d'; x.stroke(); x.globalAlpha = 1;
  const on = (performance.now() / 250 | 0) % 2 === 0;
  x.fillStyle = on ? '#ff2d2d' : '#ffd23f';
  x.fillRect(px - 7 * u, pz - 7 * u, 14 * u, 14 * u);
  x.lineWidth = 2 * u; x.strokeStyle = '#fff'; x.strokeRect(px - 7 * u, pz - 7 * u, 14 * u, 14 * u);
  x.font = 'bold ' + 12 * u + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 3 * u; x.strokeStyle = 'rgba(40, 32, 52, 0.9)';
  const s = t('налёт!');
  x.strokeText(s, px, pz + 24 * u); x.fillStyle = '#ff5a4a'; x.fillText(s, px, pz + 24 * u);
}

/* ── «потратить»: вкладка ёлки-турели (career.js) ── */
export const ready = () => !!A;
export function spendTab (money) {
  const sub = hasTurret() ? t('стоит у точки') : !turretOpen() ? t('со звания «{rank}»', { rank: rankName() }) : money(TURRET.PRICE);
  return { key: 'turret', name: t('ёлка-турель'), sub };
}
function rankName () {
  const L = RCFG.LEVELS, i = RCFG.TURRET_LEVEL;
  try { return RESPECT.level(L[i].at).name; } catch (e) { return String(L[i] ? L[i].at : ''); }
}
/* el — панель, api — { wallet(), addWallet(n), money(n), Store, Snd }, done() — перерисовать экран */
export function spendPane (el, api, done) {
  const owned = hasTurret(), open = turretOpen(), can = open && !owned && api.wallet() >= TURRET.PRICE;
  el.innerHTML = '<div class="rd-pane"><p>' + esc(A.ADULT
    ? t('Ёлка с гирляндой и стволом у твоей пиццерии. Сама крутится и расстреливает налётчиков и бойцов конкурентов в {r} м. Налёт с ней проще: пока едешь, она уже кладёт их по одному.', { r: TURRET.R })
    : t('Ёлка с гирляндой и снежной пушкой у твоей пиццерии. Сама крутится и закидывает снежками налётчиков и бойцов конкурентов в {r} м — они с визгом убегают. Налёт с ней проще.', { r: TURRET.R })) + '</p>' +
    (owned ? '<div class="cr-done">✓ ' + esc(t('стоит у точки')) + '</div>'
      : !open ? '<p class="rd-lock">' + esc(t('нужно звание «{rank}» — респект {n}', { rank: rankName(), n: RCFG.LEVELS[RCFG.TURRET_LEVEL].at })) + '</p>'
        : '<button type="button" class="cr-btn buy">' + esc(t('купить за {money}', { money: api.money(TURRET.PRICE) })) + '</button>') + '</div>';
  const b = el.querySelector('button.buy');
  if (b) {
    b.disabled = !can;
    b.onclick = () => { if (buy(api)) done && done(); };
  }
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function buy (api) {
  api = api || A;
  if (hasTurret() || !turretOpen() || api.wallet() < TURRET.PRICE) return false;
  api.addWallet(-TURRET.PRICE);
  A.Store.set(TKEY, 1);
  if (A.Store.flush) A.Store.flush();
  if (api.Snd || A.Snd) (api.Snd || A.Snd).coin();
  return true;
}

export const DEBUG = {
  R, B, TUR, RAID, TURRET,
  start: (brand) => start(brand),
  win: () => { if (!R.on) return false; for (const m of R.men) if (m.st !== 'gone') flee(m, true); end(true); return R.last; },
  lose: () => { if (!R.on) return false; R.t = 0; end(false); return R.last; },
  plan: (s) => { R.plan = s; return R.plan; },
  shiftStart: o => { shiftStart(o); return R.plan; },
  store: (k, v) => { if (v !== undefined) A.Store.set(k, v); return A.Store.get(k, null); },
  turret: (on) => { A.Store.set(TKEY, on === false ? 0 : 1); if (on === false && TUR.g) TUR.g.visible = false; return hasTurret(); },
  buy: () => buy(),
  honk,
  get state () {
    return { on: R.on, brand: R.brand, t: Math.round(R.t * 10) / 10, standing: standing(), men: R.men.length, came: R.came, myKO: R.myKO, gunKO: R.gunKO,
      scared: R.scared, plan: Math.round(R.plan), last: R.last, stats: R.stats, turret: hasTurret(), turretOpen: turretOpen(), lost: !!R.lost,
      at: R.P ? { x: Math.round(R.P.x), z: Math.round(R.P.z) } : null };
  },
};
