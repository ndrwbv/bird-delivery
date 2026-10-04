/* Компании в форме своих сетей (блок 9 «Войны брендов», docs/CAREER.md «Респект и войны брендов»).
   Числа — econ.js RESPECT.CREW и RESPECT.GAIN.

   По тротуарам Солнечного стоят группы по 3—5 человек в форме сети: оранжевая «Птица Пицца» (твоя),
   голубая «Вселенная суши», жёлто-синяя «Королева Бургеров». Узнаются только по форме (футболка,
   штаны, кепка) — никаких черт внешности по сетям.
     перекур  — стоят кружком, курят (взрослая) или едят мороженое (детская), болтают;
     драка    — двое-трое с битами (в детской — подушками) бьют одного-двоих из другой сети:
                избиваемые падают, встают, закрываются руками.
   Своих бьют (избивают «Птицу Пиццу»):
     сбил всех нападавших — «помог избиваемому коллеге»: +GAIN.helpCrew и HELP_CASH ₽;
     посигналил рядом (H или просто постоял рядом, ближе HONK_R, полторы секунды — машина гудит сама) —
       нападавшие разбегаются: +GAIN.honkCrew и половина HELP_CASH;
     был рядом (ближе PASS_R) и уехал, драка кончилась без тебя — «проехал мимо»: GAIN.passCrew (минус).
   Сбил любого в форме чужой сети — +GAIN.rivalFighter; своего в форме — GAIN.ownCrew (минус).

     CREWS.step(dt, api)   — каждый кадр (game.js); api — см. crewsApi в game.js
     CREWS.DEBUG           — { list, stats, spawn(kind, opts), clear(), honk(), C } для probe */
import * as THREE from '../vendor/three.module.min.js';
import { t, N_ } from '../i18n/index.js';
import { RESPECT as R } from './econ.js';
import * as RESPECT from './respect.js';
import { TIER } from './hits.js';
import * as DIRECTOR from './director.js';   // режиссёр событий (director.js)

const C = R.CREW;
/* форма сетей: футболка, штаны, кепка; цвет облачка с репликами */
export const BRANDS = {
  pizza: { name: N_('Птица Пицца'), shirt: '#ff8a1c', pants: '#4a2c14', cap: '#ff8a1c', say: '#d9620f' },
  sushi: { name: N_('Вселенная суши'), shirt: '#4fc8e8', pants: '#1d3557', cap: '#f4f1ea', say: '#1f8fb5' },
  burger: { name: N_('Королева Бургеров'), shirt: '#f2c230', pants: '#2a4fb8', cap: '#2a4fb8', say: '#2a4fb8' },
};
const RIVAL_IDS = ['sushi', 'burger'];
const SHIFT_STATES = ['drive', 'back', 'handover', 'side'];

/* реплики: болтовня на перекуре, клич нападавших, крик избиваемых, «спасибо» */
const CHAT = {
  pizza: [N_('опять ананасы заказали'), N_('у меня сегодня шесть адресов'), N_('кто брал мою термосумку?'), N_('пицца сама себя не довезёт')],
  sushi: [N_('роллы не ждут'), N_('палочки опять забыли'), N_('у нас доставка за 30 минут… иногда'), N_('васаби кончился')],
  burger: [N_('булка — это жизнь'), N_('королева нами довольна'), N_('картошку не забудь'), N_('соус кончился, опять')],
};
const CRY = {
  pizza: [N_('это наш район!'), N_('пицца — сила!'), N_('за Птицу!')],
  sushi: [N_('суши — сила!'), N_('пицца — не еда!'), N_('ролл вам в бок!')],
  burger: [N_('бургер — король!'), N_('булки, вперёд!'), N_('пиццу — на свалку!')],
};
const CRY_ADULT = [N_('сука, вали с района!'), N_('пиздец тебе, курьер!'), N_('нахуй с нашей улицы!')];
const HELP = [N_('помогите!'), N_('наших бьют!'), N_('ай!'), N_('спасите!')];
const THANKS = [N_('спасибо, брат!'), N_('ты лучший!'), N_('с нас пицца!')];

let A = null;
const CREWS = [];
/* все люди компаний одним списком — машины потока их пропускают (game.js walkersAll) */
export const WALKERS = [];
const ST = { cd: 20, honkCd: 0, stand: 0, honkReq: 0, key: false, stats: { spawned: 0, fights: 0, own: 0, helped: 0, honked: 0, passed: 0, lost: 0, ko: 0, own_ko: 0 } };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ── сигнал: H на клавиатуре (game.js не слушает H) ── */
function bindKey () {
  if (ST.key || typeof addEventListener === 'undefined') return;
  ST.key = true;
  addEventListener('keydown', e => { if (e.code === 'KeyH' && !e.repeat) ST.honkReq = 1; });
}
/* кто ещё слушает сигнал (thugs.js — гопники у прохожего): fn(x, z) */
const HONK_CBS = [];
export const onHonk = fn => { if (typeof fn === 'function' && !HONK_CBS.includes(fn)) HONK_CBS.push(fn); };
function honk () {
  if (ST.honkCd > 0) return false;
  ST.honkCd = 1.2;
  for (const fn of HONK_CBS) { try { fn(A.V.x, A.V.z); } catch (e) { /* слушатель не ломает сигнал */ } }
  if (A && A.Snd && A.Snd.blip) {
    A.Snd.blip(392, 0.16, 'square', 0.09);
    setTimeout(() => A.Snd.blip(392, 0.26, 'square', 0.09), 190);
  }
  for (const c of CREWS) {
    if (c.kind !== 'fight' || c.over) continue;
    if (Math.hypot(c.x - A.V.x, c.z - A.V.z) < C.HONK_R) scare(c);
  }
  return true;
}

/* ── место: тротуар у дороги, в R метрах от игрока, чаще впереди по ходу ── */
function spot () {
  const V = A.V;
  for (let k = 0; k < 14; k++) {
    const a = V.h + rand(-1.3, 1.3) + (k > 8 ? Math.PI : 0), d = rand(C.R[0], C.R[1]);
    const px = V.x + Math.sin(a) * d, pz = V.z + Math.cos(a) * d;
    const r = A.nearestRoad(px, pz);
    if (!r || !r.seg || r.d > 40 || (r.seg.c !== undefined && r.seg.c > 6)) continue;
    let nx = (px - r.x) / (r.d || 1), nz = (pz - r.z) / (r.d || 1);
    if (r.d < 0.1) { nx = 1; nz = 0; }
    const off = (r.seg.w || 7) / 2 + 2.8;
    const x = r.x + nx * off, z = r.z + nz * off;
    if (A.inHouse(x, z, 2.6) || !A.inBounds(x, z, 30)) continue;
    if (Math.hypot(x - V.x, z - V.z) < C.R[0] * 0.8) continue;
    if (CREWS.some(c => Math.hypot(c.x - x, c.z - z) < 70)) continue;
    return { x, z, nx, nz };
  }
  return null;
}

/* ── люди ── */
function prop (grp, kind) {
  const arm = grp.userData.armR;
  let m;
  if (kind === 'cig') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }));
    m.position.set(0, -0.5, 0.12);
  } else if (kind === 'ice') {
    // рожок мороженого: вафля конусом вниз и шарик сверху
    m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0xd9a35a }));
    m.rotation.x = Math.PI;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), new THREE.MeshLambertMaterial({ color: pick([0xf7c6d9, 0xfff3d6, 0x8a5a3c, 0xa8e8b8]) }));
    ball.position.y = -0.12; m.add(ball);
    m.position.set(0, -0.56, 0.1);
  } else {
    m = A.warStick(kind === 'pillow' ? 0xf4f1ea : 0x5c4a3a);
    m.position.set(0, -0.56, 0.45);
  }
  arm.add(m);
  return m;
}
function member (crew, brand, role, x, z) {
  const B = BRANDS[brand];
  const grp = A.makeHuman(null, { shirt: B.shirt, pants: B.pants, cap: B.cap, fat: chance(0.15) });
  grp.position.set(x, A.groundH(x, z), z);
  A.scene.add(grp);
  const m = { grp, u: grp.userData, brand, role, x, z, hx: x, hz: z, ph: rand(0, 6), hp: 3, down: 0, swing: 0, swingCd: rand(0.2, 1),
    dead: 0, flee: 0, puffT: rand(1, 3), bumpT: 0, h: 0 };
  if (role === 'hang') m.prop = prop(grp, A.ADULT ? 'cig' : 'ice');
  else if (role === 'att') m.prop = prop(grp, A.ADULT ? 'bat' : 'pillow');
  crew.people.push(m);
  return m;
}

/* компания: kind 'hang' | 'fight'; o — { brand, att, vic, x, z } (для отладки) */
function spawn (kind, o = {}) {
  const at = o.x !== undefined ? { x: o.x, z: o.z, nx: 1, nz: 0 } : spot();
  if (!at) return null;
  const crew = { kind, x: at.x, z: at.z, nx: at.nx, nz: at.nz, people: [], t: 0, seen: 0, helped: 0, honked: 0, over: 0, overT: 0, bubbles: [], sayT: rand(0.5, 2), id: ++ST.stats.spawned };
  const n = randi(C.SIZE[0], C.SIZE[1]);
  if (kind === 'hang') {
    crew.brand = o.brand || pick(['pizza', 'pizza', 'sushi', 'burger']);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rand(-0.2, 0.2), r = rand(1.1, 1.5);
      member(crew, crew.brand, 'hang', at.x + Math.sin(a) * r, at.z + Math.cos(a) * r);
    }
  } else {
    // кто кого: своих бьют (OWN_VICTIM), иначе свои бьют чужих или две чужие сети между собой
    let att, vic;
    if (o.att) { att = o.att; vic = o.vic || (att === 'pizza' ? pick(RIVAL_IDS) : 'pizza'); }
    else if (chance(C.OWN_VICTIM)) { vic = 'pizza'; att = pick(RIVAL_IDS); }
    else if (chance(0.5)) { att = 'pizza'; vic = pick(RIVAL_IDS); }
    else { att = pick(RIVAL_IDS); vic = att === 'sushi' ? 'burger' : 'sushi'; }
    crew.att = att; crew.vic = vic; crew.own = vic === 'pizza';
    const nv = n >= 5 ? 2 : 1, na = n - nv;
    crew.t = C.FIGHT_T;
    for (let i = 0; i < nv; i++) member(crew, vic, 'vic', at.x + rand(-0.8, 0.8), at.z + rand(-0.8, 0.8));
    for (let i = 0; i < na; i++) {
      const a = i / na * Math.PI * 2 + rand(-0.3, 0.3);
      member(crew, att, 'att', at.x + Math.sin(a) * 2.2, at.z + Math.cos(a) * 2.2);
    }
    ST.stats.fights++;
    crew.dir = 1; DIRECTOR.start('crew');
    if (crew.own) {
      ST.stats.own++;
      if (A.toast && Math.hypot(at.x - A.V.x, at.z - A.V.z) < 320) {
        const kb = typeof document !== 'undefined' && !document.body.classList.contains('touch') && !document.body.classList.contains('pad');
        A.toast(kb ? t('наших бьют! «{brand}» напали на курьеров — сбей их или посигналь (H)', { brand: t(BRANDS[att].name) })
          : t('наших бьют! «{brand}» напали на курьеров — сбей их или встань рядом: машина посигналит', { brand: t(BRANDS[att].name) }));
      }
    }
  }
  CREWS.push(crew);
  return crew;
}

function drop (crew) {
  if (crew.dir) { crew.dir = 0; DIRECTOR.end('crew'); }
  for (const b of crew.bubbles) if (b.s.parent) { b.s.parent.remove(b.s); b.s.material.dispose(); }
  crew.bubbles.length = 0;
  for (const m of crew.people) if (!m.dead) A.dropMesh(m.grp);
  crew.people.length = 0;
}
function clear () { for (const c of CREWS) drop(c); CREWS.length = 0; WALKERS.length = 0; }

function say (crew, m, text, col) {
  if (!m || m.dead || crew.bubbles.length >= 2) return;
  const s = A.sayBubble(m.grp, text, col || BRANDS[m.brand].say, 2.6);
  crew.bubbles.push({ s, t: 2.2 });
}

/* сигнал: нападавшие разбегаются, драка кончена в пользу своих */
function scare (crew) {
  if (crew.over) return;
  const first = !crew.honked;
  crew.honked = 1;
  for (const m of crew.people) if (m.role === 'att' && !m.dead) { m.flee = 1; m.down = 0; m.grp.rotation.x = 0; }
  if (first && crew.own) { ST.stats.honked++; finish(crew, 'honk'); }
  else if (first) finish(crew, 'scared');
}

/* как кончилась драка: ko — всех нападавших сбил; honk — спугнул; time — кончилась сама */
function finish (crew, how) {
  if (crew.over) return;
  if (crew.dir) { crew.dir = 0; DIRECTOR.end('crew'); }
  crew.over = 1; crew.overT = 8;
  if (crew.own && !A.S.freeRun) {
    if (how === 'ko' || how === 'honk') {
      ST.stats.helped++;
      const cash = Math.round((how === 'ko' ? R.HELP_CASH : R.HELP_CASH / 2) / (A.CAREER ? 1 : 8));
      RESPECT.gain(how === 'ko' ? 'helpCrew' : 'honkCrew');
      if (cash > 0) { A.S.money += cash; A.addWallet(cash); }
      if (A.popBonus) A.popBonus(t('{brand} благодарит!', { brand: t(BRANDS.pizza.name) }), t('помог избиваемому коллеге · +{money}', { money: A.money(cash) }));
      const v = crew.people.find(m => m.role === 'vic' && !m.dead);
      if (v) say(crew, v, t(pick(THANKS)));
    } else if (crew.seen) {
      ST.stats.passed++;
      RESPECT.gain('passCrew');
    } else ST.stats.lost++;
  }
  // нападавшие уходят, избиваемые встают
  for (const m of crew.people) {
    if (m.dead) continue;
    if (m.role === 'att') m.flee = 1;
    m.down = 0; m.grp.rotation.x = 0;
  }
}

/* ── шаги ── */
function walkPose (u, ph, k = 1) {
  const sw = Math.sin(ph) * 0.8 * k;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw * 0.6;
}
function standPose (u) { u.legL.rotation.x = u.legR.rotation.x = 0; }
function place (m) { m.grp.position.set(m.x, A.groundH(m.x, m.z) + (A.curbAt ? A.curbAt(m.x, m.z) : 0), m.z); m.grp.rotation.y = m.h; }

function hangStep (crew, m, dt, near) {
  const u = m.u;
  m.ph += dt;
  const drag = Math.max(0, Math.sin(m.ph * 0.9 + m.hx)) ** 6;     // затяжка / лизнуть мороженое
  u.armR.rotation.x = -0.5 - drag * 1.7;
  u.armL.rotation.x = -0.2;
  u.head.rotation.y = Math.sin(m.ph * 0.4 + m.hz) * 0.35;
  m.h = damp(m.h, Math.atan2(crew.x - m.x, crew.z - m.z), 4, dt);
  if (A.ADULT && near < 60 && (m.puffT -= dt) <= 0 && A.fxAdd && A.puffGeo) {
    m.puffT = rand(2, 4);
    const fx = Math.sin(m.h), fz = Math.cos(m.h);
    const p = new THREE.Mesh(A.puffGeo, new THREE.MeshBasicMaterial({ color: 0xe9e7e2, transparent: true, opacity: 0.5, depthWrite: false }));
    p.position.set(m.x + fx * 0.4, A.groundH(m.x, m.z) + 1.6, m.z + fz * 0.4);
    p.scale.setScalar(0.22);
    A.fxAdd(p, { vy: rand(0.5, 0.9), vx: fx * 0.4, vz: fz * 0.4, life: rand(1.4, 2.2), max: 2.2, grow: 1.3 });
  }
  place(m);
}

function fightStep (crew, m, dt, near) {
  const u = m.u;
  if (m.flee) {                                     // уходит прочь от машины и тает за 50 м
    if (m.faT > 0) m.faT -= dt;
    const an = Math.atan2(m.x - A.V.x, m.z - A.V.z) + (m.faT > 0 ? m.fa : 0), x0 = m.x, z0 = m.z;
    m.x += Math.sin(an) * 4.2 * dt; m.z += Math.cos(an) * 4.2 * dt;
    if (A.pushOut) A.pushOut(m, 0.45);
    // упёрся в стену — не шагает на месте, а бежит вдоль неё полторы секунды
    if (!(m.faT > 0) && Math.hypot(m.x - x0, m.z - z0) < 4.2 * dt * 0.35) { m.fa = Math.random() < 0.5 ? 1.4 : -1.4; m.faT = 1.5; }
    m.h = damp(m.h, an, 8, dt); m.ph += dt * 12;
    walkPose(u, m.ph); u.armR.rotation.x = -0.6;
    place(m);
    if (Math.hypot(m.x - A.V.x, m.z - A.V.z) > 55 && Math.hypot(m.x - crew.x, m.z - crew.z) > 20) { m.dead = 1; A.dropMesh(m.grp); }
    return;
  }
  if (m.down > 0) {
    m.down -= dt;
    m.grp.rotation.x = damp(m.grp.rotation.x, -1.45, 10, dt);
    m.grp.position.set(m.x, A.groundH(m.x, m.z) + 0.25, m.z);
    if (m.down <= 0) m.grp.rotation.x = 0;
    return;
  }
  if (m.role === 'vic') {
    // закрывается руками, ёжится; после драки — машет «спасибо»
    m.ph += dt;
    standPose(u);
    const k = crew.over ? 0.9 + Math.sin(m.ph * 8) * 0.25 : 1;
    u.armL.rotation.x = damp(u.armL.rotation.x, -2.6 * k, 12, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, -2.6 * k, 12, dt);
    if (!crew.over) {
      const a = crew.people.find(x => x.role === 'att' && !x.dead && !x.flee);
      if (a) m.h = damp(m.h, Math.atan2(a.x - m.x, a.z - m.z), 6, dt);
    } else m.h = damp(m.h, Math.atan2(A.V.x - m.x, A.V.z - m.z), 4, dt);
    place(m);
    return;
  }
  // нападающий: к ближнему стоящему избиваемому, замах, удар
  let foe = null, bd = Infinity;
  for (const e of crew.people) if (e.role === 'vic' && !e.dead) { const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < bd) { bd = d; foe = e; } }
  if (!foe || crew.over) { m.flee = 1; return; }
  const dx = foe.x - m.x, dz = foe.z - m.z;
  if (bd > 1.25) {
    m.x += dx / bd * 3.4 * dt; m.z += dz / bd * 3.4 * dt;
    if (A.pushOut) A.pushOut(m, 0.45);
    m.ph += dt * 12; walkPose(u, m.ph); u.armR.rotation.x = -2.6;
  } else {
    standPose(u);
    m.swingCd -= dt;
    if (m.swingCd <= 0) {
      m.swingCd = rand(0.6, 1.1); m.swing = 0.25;
      if (foe.down <= 0 && chance(0.45)) {
        foe.down = rand(1.4, 2.2);
        if (near < 70) {
          A.Snd.blip(rand(150, 220), 0.06, 'square', 0.07);
          if (A.ADULT && A.blood) A.blood(foe.x, 1.2, foe.z, 4);   // детская — без крови, только звёздочки
          else if (A.emote) A.emote(foe.x, 2, foe.z, 'angry', 1);
        }
      }
    }
    if (m.swing > 0) { m.swing -= dt; u.armR.rotation.x = -2.8 + (0.25 - m.swing) * 9; }
    else u.armR.rotation.x = damp(u.armR.rotation.x, -2.7, 8, dt);
  }
  m.h = damp(m.h, Math.atan2(dx, dz), 10, dt);
  place(m);
}

/* наезд — как у мафиози: прямоугольник кузова; быстрее TIER.FALL — сбит (hits.js решает, как) */
function hitCheck (crew, m, dt) {
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  const fx = Math.sin(V.h), fz = Math.cos(V.h), ex = m.x - V.x, ez = m.z - V.z;
  const al = ex * fx + ez * fz, ac = ex * fz - ez * fx;
  const HL = (A.CAR_L || 2.2) + 0.5, HW = (A.CAR_W || 1) + 0.35;
  if (Math.abs(al) >= HL || Math.abs(ac) >= HW) return;
  if (sp * 3.6 >= TIER.FALL) {
    m.dead = 1;
    A.gibHuman({ x: m.x, z: m.z, grp: m.grp }, V.vx, V.vz);
    A.dropMesh(m.grp);
    if (A.onRunOver) A.onRunOver();
    if (!A.S.freeRun) {
      if (m.brand === 'pizza') { ST.stats.own_ko++; RESPECT.gain('ownCrew'); }
      else { ST.stats.ko++; RESPECT.gain('rivalFighter'); }
    }
    if (crew.kind === 'fight' && m.role === 'att' && !crew.over) {
      crew.helped++;
      if (!crew.people.some(x => x.role === 'att' && !x.dead && !x.flee)) finish(crew, crew.own ? 'ko' : 'scared');
    }
    return;
  }
  // медленно — толкнуть из-под кузова
  const outW = HW - Math.abs(ac) + 0.05, outL = HL - Math.abs(al) + 0.05;
  if (outW <= outL) { const k = ac >= 0 ? outW : -outW; m.x += fz * k; m.z -= fx * k; }
  else { const k = al >= 0 ? outL : -outL; m.x += fx * k; m.z += fz * k; }
  if ((m.bumpT -= dt) <= 0 && sp > 1) { m.bumpT = 1.5; say(crew, m, A.ADULT ? t('смотри, куда прёшь, блять!') : t('эй, аккуратнее!'), '#d9342c'); }
}

function crewStep (crew, dt) {
  const V = A.V, near = Math.hypot(crew.x - V.x, crew.z - V.z);
  for (let i = crew.bubbles.length - 1; i >= 0; i--) {
    const b = crew.bubbles[i];
    if ((b.t -= dt) <= 0 || !b.s.parent) { if (b.s.parent) b.s.parent.remove(b.s); b.s.material.dispose(); crew.bubbles.splice(i, 1); }
  }
  const vis = near < 170;
  if (crew.kind === 'fight' && !crew.over) {
    crew.t -= dt;
    if (near < C.PASS_R) crew.seen = 1;
    if (crew.t <= 0) finish(crew, 'time');
  }
  if (crew.over) crew.overT -= dt;
  // реплики — только когда рядом
  if (near < 60 && (crew.sayT -= dt) <= 0) {
    crew.sayT = crew.kind === 'fight' ? rand(1.6, 2.6) : rand(4, 8);
    const alive = crew.people.filter(m => !m.dead && m.down <= 0 && !m.flee);
    if (crew.kind === 'hang') { const m = pick(alive); if (m) say(crew, m, t(pick(CHAT[m.brand]))); }
    else if (!crew.over) {
      const a = pick(alive.filter(m => m.role === 'att')), v = pick(alive.filter(m => m.role === 'vic'));
      if (a) say(crew, a, t(A.ADULT && chance(0.35) ? pick(CRY_ADULT) : pick(CRY[a.brand])));
      if (v) say(crew, v, t(pick(HELP)), '#d9342c');
    }
  }
  for (const m of crew.people) {
    if (m.dead) continue;
    if (m.grp.visible !== vis) m.grp.visible = vis;
    if (near > 200) continue;                        // далеко — не анимируем (FPS)
    if (crew.kind === 'hang') hangStep(crew, m, dt, near); else fightStep(crew, m, dt, near);
    if (!m.dead && near < 40) hitCheck(crew, m, dt);
  }
}

export function step (dt, api) {
  if (api) A = api;
  if (!A || !A.CAREER) return;
  bindKey();
  if (typeof window !== 'undefined' && window.__dlv && !window.__dlv.CREWS) window.__dlv.CREWS = DEBUG;
  const S = A.S;
  if (!S || S.state === 'title' || S.state === 'over' || A.intro) { if (CREWS.length) clear(); ST.honkReq = 0; return; }
  ST.honkCd = Math.max(0, ST.honkCd - dt);
  const V = A.V, sp = Math.hypot(V.vx, V.vz);
  // сигнал: H — или машина сама гудит, если стоишь рядом с дракой своих полторы секунды
  const fightNear = CREWS.find(c => c.kind === 'fight' && !c.over && Math.hypot(c.x - V.x, c.z - V.z) < C.HONK_R);
  if (fightNear && sp < 3) ST.stand += dt; else ST.stand = 0;
  if (ST.honkReq || ST.stand > 1.5) { ST.honkReq = 0; ST.stand = 0; honk(); }
  // новые компании — только на смене, не в первые минуты (calmStart) и не больше MAX
  if (SHIFT_STATES.includes(S.state) && !(A.calmStart && A.calmStart()) && (ST.cd -= dt) <= 0) {
    ST.cd = rand(C.EVERY[0], C.EVERY[1]);
    if (CREWS.length < C.MAX) spawn(chance(C.FIGHT_P) && DIRECTOR.can('crew') ? 'fight' : 'hang');   // драка — лёгкое событие; нельзя — просто перекур
  }
  WALKERS.length = 0;
  for (let i = CREWS.length - 1; i >= 0; i--) {
    const c = CREWS[i];
    crewStep(c, dt);
    for (const m of c.people) if (!m.dead) WALKERS.push(m);
    const d = Math.hypot(c.x - V.x, c.z - V.z);
    const empty = !c.people.some(m => !m.dead);
    if (d > C.DESPAWN || empty || (c.over && c.overT <= 0 && d > 60)) {
      if (c.kind === 'fight' && !c.over) finish(c, 'time');
      drop(c); CREWS.splice(i, 1);
    }
  }
}

export const DEBUG = {
  list: CREWS, ST, C, BRANDS,
  get stats () { return ST.stats; },
  spawn: (kind = 'fight', o = {}) => { const c = spawn(kind, o); return c ? { id: c.id, kind: c.kind, x: c.x, z: c.z, att: c.att, vic: c.vic, n: c.people.length } : null; },
  honk: () => { ST.honkCd = 0; return honk(); },
  clear,
  info: () => CREWS.map(c => ({ id: c.id, kind: c.kind, brand: c.brand, att: c.att, vic: c.vic, own: !!c.own, over: c.over, t: +c.t.toFixed(1), seen: c.seen, helped: c.helped, honked: c.honked,
    d: Math.round(Math.hypot(c.x - A.V.x, c.z - A.V.z)), people: c.people.filter(m => !m.dead).map(m => m.role + ':' + m.brand + (m.down > 0 ? ':down' : '') + (m.flee ? ':flee' : '')) })),
};
