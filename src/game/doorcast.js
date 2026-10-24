/* ──────────────────────────────────────────────────────────────────────────
   Люди у двери — живые, в 3D (автор 18.10.2026: «незнакомец, который хочет крэк, — его вообще нет рядом со мной, я не
   понимаю, кто со мной говорит»; «люди говорят фразы про собаку, а её нет рядом и нет звука собаки»). Правила словами —
   docs/ORDERS.md «Кто говорит у двери — виден в 3D».

   Тот, кто говорит в окне разговора у двери (сценки oddfolk.js, клиенты автора regulars.js, жители Юга locals.js,
   разговор у двери smalltalk), стоит в мире рядом с машиной, с тем же лицом, что в окне, и говорит ртом, пока его
   реплика печатается (как герои катсцен — actorlife.js). Чего в окне нет и в мире нет — то словами «из квартиры».

     init({ scene, makeHuman(person), dropMesh(grp), groundH(x, z), car() → { x, z, h }, cam, Snd })   — game.js
     frame(dt)                       — каждый кадр (game.js CL.step 'doorcast')
     client(ped)                     — актёр из клиента у двери (его тело ведёт game.js; тут — только лицо и рот)
     extra(person, ped, i, n, o)     — ещё один человек у двери: рядом с клиентом, чуть ближе к подъезду, лицом к машине
                                       (o.kid — рост ×, o.back — из-за спины). Свой — уберём сами (leave)
     stranger(person, ped, o)        — незнакомец подходит к машине вдоль тротуара (руки в карманах), встаёт там, где его
                                       видно над окном разговора, лицом к машине → актёр; a.ready — Promise «дошёл»
     leave(a)                        — свой уходит (незнакомец — дальше по тротуару, у двери — к подъезду) и пропадает;
                                       клиент — рот закрыт, лицо общее
     say(a, o)                       — DLG.say, пока печатается — рот актёра a говорит (a — null: никто в мире)
     dog(ped, o)                     — собака у ног клиента: лает («Гав!» облачком и звуком 'bark'), o.sec — сколько
                                       стоит, потом убегает к подъезду; o.sit — сидит, виляет хвостом; → { bark(), go() }
     cat(ped, o)                     — кот у ног клиента: сидит, «Мяу»; → { go() } — уходит к подъезду
     offstage(ped, text, o)          — облачко «из квартиры» у клиента за спиной (o.snd — звук, o.col)
     clear()                         — убрать всех своих сразу (смена кончилась)
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import { DOGS_ON } from './dogsflag.js';      // собаки выключены (?dogs — вернуть): dog() отдаёт null
import * as LIFE from './actorlife.js';
import * as PETW from './petwear.js';          // зимой собака клиента в свитере или попонке (petwear.js)
import * as TALK from './talk.js';
import * as DLG from './dialog.js';
import { makeCatModel, FURS } from './cats.js';

export const DC = {
  WALK: 1.9,          // шаг незнакомца, м/с
  FROM: 6,            // м: откуда подходит — вдоль тротуара от точки, где встанет
  AWAY: 14,           // м: уходит на столько — и пропадает
  WAIT: 3.5,          // с: дольше «дошёл» не ждём (разговор начинается)
  NEAR: [2.4, 6.5],   // м от машины: где может встать незнакомец
  CAR: [1.8, 3.1],    // м: габарит машины с запасом (вбок, вдоль от середины) — туда не встаёт
  SIDE: 0.8,          // м: шаг вбок у двери (второй, третий человек)
  BACK: 0.55,         // м: у двери — чуть ближе к подъезду, чем клиент
  LIFE: 90,           // с: актёр живёт не дольше (страховка; клиент — лицо снова общее, свой — пропадает)
  BARK: [0.5, 1.1],   // с между «гав»
  DOG_COL: '#8a5a2a', OFF_COL: '#7a6a5a',
  CAM_Y: 0.48,        // окно у двери — камера смотрит на говорящего: его голова на столько выше середины кадра (доля половины высоты; game.js camStep)
  CAM_ZOOM: 0.35,     // … и угол обзора уже на столько (люди у двери крупнее)
};

let A = null;
const ACT = new Set();
const DOGS = new Set();
const CATS = new Set();
export const ST = { actors: 0, strangers: 0, extras: 0, dogs: 0, barks: 0, offstage: 0, says: 0, talkOn: 0, left: 0 };

export function init (api) { A = api; }

const angTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);
const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const gh = (x, z) => { try { return A && A.groundH ? A.groundH(x, z) : 0; } catch (e) { return 0; } };
const carPos = () => { try { return A && A.car ? A.car() : null; } catch (e) { return null; } };
const EMOS = { happy: 1, angry: 1, sad: 1, scared: 1, surprised: 1 };

/* актёр: grp — тело, own — наш (уберём сами), L — живое лицо (actorlife faceOnly) */
function actor (grp, own, o = {}) {
  const a = { grp, own, x: grp.position.x, z: grp.position.z, h: grp.rotation.y, to: null, speed: o.speed || DC.WALK, ph: Math.random() * 6,
    look: null, pockets: !!o.pockets, talk: false, L: null, t: 0, gone: null, ready: null, done: null };
  try { a.L = LIFE.faceOnly(grp); } catch (e) { a.L = null; }
  ACT.add(a); ST.actors++;
  return a;
}
const alive = a => a && a.grp && a.grp.parent;

/** клиент у двери: тело ведёт game.js, тут — лицо и рот. o.nofocus — камера на него не смотрит (крик на ходу) */
export function client (ped, o = {}) {
  if (!ped || ped.dead || !ped.grp || !ped.grp.parent) return null;
  for (const a of ACT) if (a.grp === ped.grp) { if (!o.nofocus) a.nofocus = false; return a; }
  const a = actor(ped.grp, false);
  a.nofocus = !!o.nofocus;
  a.ped = ped;
  LASTPED = ped;
  return a;
}

/* куда смотрит дверь: от машины к клиенту (d) и вдоль фасада (s) */
function axes (ped) {
  const c = carPos();
  const px = ped ? ped.x : c ? c.x : 0, pz = ped ? ped.z : c ? c.z : 0;
  let dx = c ? px - c.x : 0, dz = c ? pz - c.z : 1, L = Math.hypot(dx, dz);
  if (L < 0.3) { dx = Math.sin(c ? c.h : 0); dz = Math.cos(c ? c.h : 0); L = 1; }
  dx /= L; dz /= L;
  return { c, px, pz, dx, dz, sx: dz, sz: -dx, L };
}

function spawn (person, x, z, h, o = {}) {
  if (!A || !A.makeHuman || !A.scene) return null;
  let grp = null;
  try { grp = A.makeHuman(person); } catch (e) { console.warn('[doorcast] makeHuman', e); return null; }
  if (!grp) return null;
  if (o.kid) grp.scale.setScalar(o.kid);
  grp.position.set(x, gh(x, z), z);
  grp.rotation.y = h;
  A.scene.add(grp);
  const a = actor(grp, true, o);
  a.x = x; a.z = z; a.h = h;
  return a;
}

/** ещё один человек у двери: i-й из n рядом с клиентом (по очереди справа и слева), лицом к машине */
export function extra (person, ped, i = 0, n = 1, o = {}) {
  const X = axes(ped);
  const k = i + 1, side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * DC.SIDE * (o.kid ? Math.max(0.7, o.kid) : 1);
  const back = o.back ? DC.BACK * 1.6 : DC.BACK;
  const x = X.px + X.dx * back + X.sx * side, z = X.pz + X.dz * back + X.sz * side;
  const a = spawn(person, x, z, angTo(x, z, X.c ? X.c.x : x - X.dx, X.c ? X.c.z : z - X.dz), o);
  if (!a) return null;
  a.door = { x: X.px + X.dx * 3, z: X.pz + X.dz * 3 };              // уходит — к подъезду, дальше от машины
  a.look = X.c ? { x: X.c.x, z: X.c.z } : null;
  ST.extras++;
  return a;
}

/* видно ли голову над окном разговора: окно занимает низ экрана (до ~55 % высоты сверху) */
const PV = new THREE.Vector3();
function seen (x, z, hgt = 1.75) {
  const cam = A && A.cam;
  if (!cam) return 1;
  PV.set(x, gh(x, z) + hgt, z).project(cam);
  if (PV.z > 1 || PV.z < -1) return -9;
  const top = typeof document !== 'undefined' && document.querySelector('.dlg-box:not([hidden])');
  let lim = -0.12;                                                      // окна ещё нет: низ ~55 % экрана — под ним
  if (top) { const r = top.getBoundingClientRect(), H = innerHeight || 720; if (r.height > 0) lim = 1 - 2 * (r.top / H) + 0.04; }
  if (PV.y < lim || PV.y > 0.92 || Math.abs(PV.x) > 0.82) return -1;
  return 1 - Math.abs(PV.x) * 0.4 + (PV.y - lim) * 0.2;
}

/** незнакомец подходит к машине вдоль тротуара и встаёт там, где его видно; a.ready — дошёл */
export function stranger (person, ped, o = {}) {
  const X = axes(ped);
  if (!X.c) return null;
  // где встать: между машиной и подъездом, вбок от клиента — не в машине (её габарит с запасом), не за ней (дальше от камеры,
  // чем машина: голову не закроет крыша) и так, чтобы голову было видно над окном разговора
  const fx0 = Math.sin(X.c.h || 0), fz0 = Math.cos(X.c.h || 0), cp = A.cam && A.cam.position;
  const dCar = cp ? Math.hypot(cp.x - X.c.x, cp.z - X.c.z) : 0;
  let best = null, bs = -1e9;
  for (const tk of [0.7, 0.55, 0.85, 1, 1.15, 0.4]) for (const s of [1.3, -1.3, 2.2, -2.2, 3.2, -3.2]) {
    const L = Math.max(DC.NEAR[0], Math.min(DC.NEAR[1], X.L * tk));
    const x = X.c.x + X.dx * L + X.sx * s, z = X.c.z + X.dz * L + X.sz * s;
    if (Math.hypot(x - X.px, z - X.pz) < 0.9) continue;                // не в клиента
    const ox = x - X.c.x, oz = z - X.c.z, lon = ox * fx0 + oz * fz0, lat = ox * fz0 - oz * fx0;
    if (Math.abs(lat) < DC.CAR[0] && Math.abs(lon) < DC.CAR[1]) continue;   // в машине
    const far = cp ? Math.hypot(cp.x - x, cp.z - z) - dCar : 2;        // дальше машины от камеры — видно над крышей
    const side = Math.abs(lat) >= DC.CAR[0] && lon > -DC.CAR[1] && lon < DC.NEAR[1];   // сбоку от машины: камера сзади-сверху не закроет его машиной
    const v = seen(x, z) - Math.abs(tk - 0.7) * 0.3 + (far > 1 ? 0.6 : far > 0 ? 0.2 : -0.6) + (side ? 1 : 0);
    if (v > bs) { bs = v; best = { x, z, s }; }
  }
  if (!best) return null;
  const sg = best.s >= 0 ? 1 : -1;
  const fx = best.x + X.sx * sg * DC.FROM, fz = best.z + X.sz * sg * DC.FROM;
  const a = spawn(person, fx, fz, angTo(fx, fz, best.x, best.z), { pockets: true, speed: o.speed || DC.WALK });
  if (!a) return null;
  a.to = { x: best.x, z: best.z };
  a.look = { x: X.c.x, z: X.c.z };
  a.away = { x: best.x - X.sx * sg * DC.AWAY, z: best.z - X.sz * sg * DC.AWAY };   // уходит дальше по тротуару, мимо
  a.ready = new Promise(res => { a.done = res; setTimeout(res, DC.WAIT * 1000); });
  a.spot = best; a.seen = +bs.toFixed(2);
  ST.strangers++;
  return a;
}

/** уйти: свой — дальше по тротуару или к подъезду, потом пропадает; клиент — лицо общее */
export function leave (a) {
  if (!a) return;
  talk(a, false);
  if (LASTPED && a.ped === LASTPED) LASTPED = null;
  a.leaving = true;
  if (!a.own) { release(a); return; }
  if (!alive(a)) { release(a); return; }
  const w = a.away || a.door;
  a.look = null;
  if (w) { a.to = { x: w.x, z: w.z, drop: true }; a.speed = a.away ? DC.WALK * 0.9 : 1.4; }
  else drop(a);
  ST.left++;
}
function release (a) {
  if (a.L) { try { LIFE.detach(a.L); } catch (e) { /* — */ } a.L = null; }
  ACT.delete(a);
}
function drop (a) {
  release(a);
  if (a.own && a.grp) { try { if (A && A.dropMesh) A.dropMesh(a.grp); else if (a.grp.parent) a.grp.parent.remove(a.grp); } catch (e) { /* — */ } }
  a.grp = null;
}

/** рот: говорит / замолчал */
export function talk (a, on, emo) {
  if (!a) return;
  a.talk = !!on;
  const L = a.L;
  if (!L) return;
  if (on) a.said = performance.now();
  if (on) { L.talk = true; L.mouth = 1; L.talkT = 0.1; ST.talkOn++; if (emo !== undefined) { L.emo = EMOS[emo] ? emo : ''; L.emoT = 0; } }
  else { L.talk = false; L.mouth = 0; if (L.emo) L.emoT = LIFE.LIFE.EMO_HOLD; }
}
function hushAll () { for (const a of ACT) if (a.talk) talk(a, false); }

/** куда смотреть камере (game.js camStep): голова того, кто говорит сейчас (или говорил последним, или подходит) →
    { x, y, z } | null. Пока у двери есть живой актёр сцены — кадр на нём, а не под листом разговора */
const FO = { x: 0, y: 0, z: 0 };
export function focus () {
  let best = null;
  for (const a of ACT) {
    if (a.leaving || a.nofocus || !alive(a)) continue;
    if (!best || (a.talk && !best.talk) || (a.talk === best.talk && (a.said || 0) > (best.said || 0))) best = a;
  }
  if (!best) return null;
  const g = best.grp, k = g.scale.y || 1;
  FO.x = g.position.x; FO.y = g.position.y + 1.55 * k; FO.z = g.position.z;
  return FO;
}

/* ── реплика облачком (Д6, автор 24.10.2026: «встречи возле дома не отображаются диалогами — просто сверху чела пишется,
   что он говорит»): окна разговора у дома нет — человек говорит облачком над головой (talk.js, светлая бумажная плашка),
   рот открыт, пока оно висит; игра не стоит, руль у игрока. Выбор ответа у дома убран (он будет на этаже, Д5): реплика
   с ответами (o.decline) отвечает за курьера случай: say вернёт true или false наугад (CLOUD.PICK: 1 — всегда true, 0 — всегда false,
   для проверок), чтобы обе ветки историй жителей и клиентов автора жили до этажа. ──
   CLOUD.ON = false — по-старому, окном разговора (dialog.js) */
export const CLOUD = { ON: true, PICK: null, MIN: 2.6, MAX: 7, BASE: 1.3, PER_CHAR: 0.055, GAP: 0.3, Y: 2.75 };
const PEND = new Set();                                   // облачка сейчас: { b, grp, end(res) }
let LASTPED = null;                                       // клиент у двери — к нему идёт «голос из квартиры» (актёра нет)
const cloudTime = text => Math.min(CLOUD.MAX, Math.max(CLOUD.MIN, CLOUD.BASE + CLOUD.PER_CHAR * String(text == null ? '' : text).length));
const pickAns = o => (o.decline === undefined || o.decline === null ? true : CLOUD.PICK === 1 ? true : CLOUD.PICK === 0 ? false : Math.random() < 0.5);
function cloudSay (a, o) {
  const text = String(o.text == null ? '' : o.text), hold = cloudTime(text), name = o.name || '';
  const col = o.color || '#5a4a9a';
  let g = a && alive(a) ? a.grp : null, off = null;
  const ped = (a && a.ped) || LASTPED;
  if (!g && ped && ped.grp && ped.grp.parent && !ped.dead) off = offstage(ped, text, { hold, col, name: name || undefined });   // из квартиры: за спиной клиента
  if (!g && !off) return new Promise(res => { const P = { end: r => { clearTimeout(P.tm); PEND.delete(P); res(r); } }; P.tm = setTimeout(() => P.end(pickAns(o)), hold * 1000); PEND.add(P); });   // человека в мире нет (песочница) — пауза без облачка
  if (g) { hushAll(); if (a) talk(a, true, o.emo); }
  const b = g ? bubble(g, text, col, CLOUD.Y, hold, name) : null;
  if (o.onShow) { try { o.onShow(); } catch (e) { /* — */ } }
  return new Promise(res => {
    const P = {
      end: r => {
        clearTimeout(P.tm); PEND.delete(P);
        if (a) talk(a, false);
        if (b && b.parent) b.parent.remove(b);
        if (off && off.parent) off.parent.remove(off);
        if (o.onTyped) { try { o.onTyped(); } catch (e) { /* — */ } }
        setTimeout(() => res(r), r === null ? 0 : CLOUD.GAP * 1000);
      } };
    P.tm = setTimeout(() => P.end(pickAns(o)), hold * 1000);
    PEND.add(P);
  });
}
/** сбросить висящие облачка (смена кончилась) — say вернёт null, сценка дальше не идёт */
function cloudClear () { for (const P of [...PEND]) P.end(null); }

/** реплика человека у дома (у актёра a говорит рот; a — null: голос из квартиры / говорящего в мире нет) → Promise: true (дослушали) / true | false наугад, если у реплики два ответа, null (смена кончилась). Окна больше нет — облачко (см. выше) */
export function say (a, o) {
  ST.says++;
  if (CLOUD.ON) return cloudSay(a, o);
  return DLG.say(Object.assign({}, o, {
    onShow: () => { hushAll(); if (a) talk(a, true, o.emo); if (o.onShow) o.onShow(); },
    onTyped: () => { if (a) talk(a, false); if (o.onTyped) o.onTyped(); },
  })).then(r => { if (a) talk(a, false); return r; });
}

/* зверь у ног: сбоку от клиента, чуть ближе к машине — с той стороны, где его не закроют клиент и машина
   (дальше от линии камера → клиент; не в габарите машины) */
function petSpot (X, side) {
  const cp = A.cam && A.cam.position, c = X.c;
  let x = X.px + X.sx * side, z = X.pz + X.sz * side, bd = -1e9;
  for (const sg of [1, -1]) for (const back of [0.3, -0.2]) {
    const qx = X.px - X.dx * back + X.sx * side * sg, qz = X.pz - X.dz * back + X.sz * side * sg;
    let off = 1;
    if (cp) { const lx = X.px - cp.x, lz = X.pz - cp.z, ll = Math.hypot(lx, lz) || 1; off = Math.abs((qx - cp.x) * lz - (qz - cp.z) * lx) / ll; }
    if (c) {
      const fx = Math.sin(c.h || 0), fz = Math.cos(c.h || 0), ox = qx - c.x, oz = qz - c.z;
      if (Math.abs(ox * fz - oz * fx) < DC.CAR[0] && Math.abs(ox * fx + oz * fz) < DC.CAR[1]) off -= 5;   // в машине — нет
      if (cp && Math.hypot(cp.x - qx, cp.z - qz) < Math.hypot(cp.x - c.x, cp.z - c.z) + 1.5 && Math.abs(ox * fz - oz * fx) < DC.CAR[0] + 0.6) off -= 2;   // за машиной от камеры
    }
    if (off > bd) { bd = off; x = qx; z = qz; }
  }
  return [x, z];
}

/* ── собака ── */
function dogMesh () {
  const g = new THREE.Group(), C = ['#c9a46a', '#d9b36a', '#e8e0d0', '#b8743a', '#f0c070'][(Math.random() * 5) | 0], D = '#2b2a30';   // светлые — видно на асфальте и снегу
  const mats = {};
  const box = (w, h, d, col, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[col] || (mats[col] = new THREE.MeshLambertMaterial({ color: col })));
    m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m;
  };
  box(0.26, 0.24, 0.62, C, 0, 0.42, 0);                  // туловище
  PETW.wear(box, { w: 0.26, h: 0.24, d: 0.62, y: 0.42, z: 0 }, PETW.coatFor(PETW.PW.HOME, ['sweater', 'vest']));   // зимой — одёжка
  const head = new THREE.Group(); head.position.set(0, 0.58, 0.36); g.add(head);
  const hb = (w, h, d, col, x, y, z) => { const m = box(w, h, d, col, x, y, z); g.remove(m); head.add(m); return m; };
  hb(0.2, 0.2, 0.24, C, 0, 0, 0.02);
  hb(0.12, 0.1, 0.14, C, 0, -0.05, 0.17);                // морда
  hb(0.05, 0.05, 0.03, D, 0, -0.02, 0.25);               // нос
  for (const sd of [-1, 1]) hb(0.06, 0.1, 0.05, C, sd * 0.07, 0.13, -0.03);   // уши
  for (const sd of [-1, 1]) hb(0.03, 0.03, 0.02, D, sd * 0.05, 0.03, 0.13);   // глаза
  const legs = [];
  for (const [lx, lz] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]]) legs.push(box(0.07, 0.32, 0.07, C, lx, 0.16, lz));
  const tail = new THREE.Group(); tail.position.set(0, 0.55, -0.3); g.add(tail);
  const tm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), mats[C]); tm.position.set(0, 0.06, -0.11); tm.rotation.x = -0.7; tail.add(tm);
  g.userData.dog = { head, tail, legs, mats };
  return g;
}
function dogDrop (D) {
  DOGS.delete(D);
  if (!D.m) return;
  if (D.m.parent) D.m.parent.remove(D.m);
  D.m.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
  for (const k in D.m.userData.dog.mats) D.m.userData.dog.mats[k].dispose();
  D.m = null;
}
function bubble (grp, text, col, y, hold, name) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: TALK.tex(text, col, name || ''), transparent: true, depthWrite: false }));
  b.position.set(0, y, 0);
  grp.add(b);
  TALK.track(b, 1);                                // у двери — важное, без очереди фоновых (talk.js)
  setTimeout(() => { if (b.parent) b.parent.remove(b); b.material.dispose(); }, hold * 1000);
  return b;
}
const synBark = s => { s.blip(560, 0.07, 'square', 0.05); setTimeout(() => s.blip(470, 0.08, 'square', 0.045), 150); };

/** собака у ног клиента (сбоку, ближе к машине), мордой к машине. o: { sec — сколько стоит (0 — пока не go), barks — сколько раз
    гавкнуть сразу, sit — сидит и виляет хвостом, word — «Гав!» } → { bark(n), go(), m } */
export function dog (ped, o = {}) {
  if (!DOGS_ON || !A || !A.scene || !ped || !ped.grp) return null;
  const X = axes(ped);
  const [x, z] = petSpot(X, 0.8);
  const m = dogMesh();
  m.scale.setScalar(1.15);
  // o.from — выбегает оттуда (из машины, unboard) к ногам клиента и там садится
  const sx = o.from ? o.from.x : x, sz = o.from ? o.from.z : z;
  m.position.set(sx, gh(sx, sz), sz);
  m.rotation.y = o.from ? angTo(sx, sz, x, z) : X.c ? angTo(x, z, X.c.x, X.c.z) : 0;
  A.scene.add(m);
  const D = { m, x: sx, z: sz, ph: 0, wag: 0, sit: !!o.sit && !o.from, sitAt: !!o.sit, barkQ: 0, barkT: 0.25, word: o.word || t('Гав!'), t: 0, sec: o.sec || 0,
    to: o.from ? { x, z, stay: true, look: X.c ? { x: X.c.x, z: X.c.z } : null } : null, jump: o.from ? JUMP.OUT : 0, s0: 1.15,
    door: { x: X.px + X.dx * 3.5, z: X.pz + X.dz * 3.5 } };
  D.bark = (n = 1) => { D.barkQ += n; };
  D.go = () => { if (D.m && !D.board && (!D.to || D.to.stay)) { D.to = { x: D.door.x, z: D.door.z }; D.sit = false; D.look = null; } };
  if (D.to && D.to.look) D.look = D.to.look;
  D.bark(o.barks === undefined ? 2 : o.barks);
  DOGS.add(D); ST.dogs++;
  return D;
}
function dogStep (D, dt) {
  if (!D.m) return;
  D.t += dt;
  if (D.sec && D.t > D.sec && !D.board) D.go();
  const u = D.m.userData.dog;
  let moving = false;
  if (D.board) {                                                     // бежит к машине и запрыгивает в салон (board)
    const r = boardStep(D, dt, JUMP.DOG_RUN);
    if (r === true) { dogDrop(D); return; }
    moving = r === 'run';
    if (r === 'hop') { legsStill(u); return; }
  } else if (D.to) {
    const dx = D.to.x - D.x, dz = D.to.z - D.z, d = Math.hypot(dx, dz);
    if (d < 0.2 && D.to.stay) { D.to = null; D.sit = D.sitAt; }   // выбежал из машины — у ног клиента, садится
    else if (d < 0.2 || D.t > (D.sec || 0) + 60) { dogDrop(D); return; }
    else {
      const st = Math.min(d, 3.2 * dt);
      D.x += dx / d * st; D.z += dz / d * st; moving = true;
      D.m.rotation.y += dAng(D.m.rotation.y, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
      D.ph += dt * 16;
    }
  }
  if (!D.to && D.look) D.m.rotation.y += dAng(D.m.rotation.y, angTo(D.x, D.z, D.look.x, D.look.z)) * Math.min(1, dt * 6);
  let jy = 0;
  if (D.jump > 0) { D.jump -= dt; jy = Math.sin(Math.max(0, D.jump) / JUMP.OUT * Math.PI) * 0.55; }   // спрыгнул с сиденья
  D.m.position.set(D.x, gh(D.x, D.z) + jy + (moving ? Math.abs(Math.sin(D.ph)) * 0.05 : 0), D.z);
  D.m.rotation.x = D.sit && !moving ? -0.35 : 0;
  for (let i = 0; i < 4; i++) u.legs[i].rotation.x = moving ? Math.sin(D.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0;
  // хвост виляет (сидит — довольный, быстрее); лает — голова дёргается вверх
  D.wag += dt * (D.sit ? 16 : 10);
  u.tail.rotation.y = Math.sin(D.wag) * 0.6;
  if (D.barkQ > 0 && !D.to && (D.barkT -= dt) <= 0) {
    D.barkQ--; D.barkT = DC.BARK[0] + Math.random() * (DC.BARK[1] - DC.BARK[0]);
    D.snap = 0.18; ST.barks++;
    bubble(D.m, D.word, DC.DOG_COL, 0.95, 1.1);
    try { if (A.Snd) A.Snd.fx('bark', synBark, { x: D.x, z: D.z, far: 40 }); } catch (e) { /* — */ }
  }
  if (D.snap > 0) { D.snap -= dt; u.head.rotation.x = -0.35 * Math.sin(Math.max(0, D.snap) / 0.18 * Math.PI); } else u.head.rotation.x = 0;
}

/** кот у ног клиента (сидит, хвост ходит), «Мяу» облачком и звуком 'meow'; → { go() } — уходит к подъезду */
export function cat (ped, o = {}) {
  if (!A || !A.scene || !ped || !ped.grp) return null;
  const X = axes(ped);
  const [x, z] = petSpot(X, 0.6);
  // o.from — выбегает оттуда (из машины, unboard) к ногам клиента; «Мяу» — когда добежал
  const sx = o.from ? o.from.x : x, sz = o.from ? o.from.z : z;
  const C = catAt(sx, sz, o.from ? angTo(sx, sz, x, z) : X.c ? angTo(x, z, X.c.x, X.c.z) : 0, o);
  if (!C) return null;
  C.door = { x: X.px + X.dx * 3.5, z: X.pz + X.dz * 3.5 };
  if (o.from) { C.to = { x, z, stay: true }; C.jump = JUMP.OUT; C.word = o.word || t('Мяу'); C.look = X.c ? { x: X.c.x, z: X.c.z } : null; }
  else meow(C, o.word);
  return C;
}
/* кот в точке x, z (у ветеринара, у тёщи вместо Бобика — потом board) */
function catAt (x, z, h, o = {}) {
  if (!A || !A.scene) return null;
  let m = null;
  try { m = makeCatModel(THREE, FURS[o.fur || ((Math.random() * FURS.length) | 0)] || FURS[0], true); } catch (e) { return null; }
  m.position.set(x, gh(x, z), z);
  m.rotation.y = h;
  A.scene.add(m);
  const C = { m, x, z, t: 0, to: null, cat: true, s0: m.scale.x || 1, jump: 0, door: { x, z } };
  C.go = () => { if (C.m && !C.board && (!C.to || C.to.stay)) { C.to = { x: C.door.x, z: C.door.z }; C.look = null; } };
  CATS.add(C); ST.cats = (ST.cats || 0) + 1;
  return C;
}
function meow (C, word) {
  bubble(C.m, word || t('Мяу'), DC.DOG_COL, 0.75, 1.4);
  try { if (A.Snd) A.Snd.fx('meow', s => s.blip(1100, 0.08, 'triangle', 0.03), { x: C.x, z: C.z, far: 30 }); } catch (e) { /* — */ }
}
function catDrop (C) {
  CATS.delete(C);
  if (!C.m) return;
  if (C.m.parent) C.m.parent.remove(C.m);
  C.m.traverse(q => { if (q.isMesh) q.geometry.dispose(); if (q.isSprite) q.material.dispose(); });   // свои геометрии (own); материал общий
  C.m = null;
}
function catStep (C, dt) {
  if (!C.m) return;
  C.t += dt;
  const u = C.m.userData;
  let walk = false;
  if (C.board) {                                                     // бежит к машине и запрыгивает в салон (board)
    const r = boardStep(C, dt, JUMP.CAT_RUN);
    if (r === true) { catDrop(C); return; }
    if (r === 'hop') return;
    walk = true;
  } else if (C.to) {
    const dx = C.to.x - C.x, dz = C.to.z - C.z, d = Math.hypot(dx, dz);
    if (d < 0.2 && C.to.stay) { C.to = null; meow(C, C.word); }      // выбежал из машины — у ног клиента: «Мяу»
    else if (d < 0.2 || C.t > 60) { catDrop(C); return; }
    else {
      const st = Math.min(d, (C.to.stay ? 2.6 : 1.6) * dt);
      C.x += dx / d * st; C.z += dz / d * st;
      C.m.rotation.y += dAng(C.m.rotation.y, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
      walk = true;
    }
  }
  if (walk && u.legs) for (let i = 0; i < 4; i++) u.legs[i].rotation.x = Math.sin(C.t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5;
  if (!walk && C.look) C.m.rotation.y += dAng(C.m.rotation.y, angTo(C.x, C.z, C.look.x, C.look.z)) * Math.min(1, dt * 6);
  let jy = 0;
  if (C.jump > 0) { C.jump -= dt; jy = Math.sin(Math.max(0, C.jump) / JUMP.OUT * Math.PI) * 0.5; }
  C.m.position.set(C.x, gh(C.x, C.z) + jy, C.z);
  if (u.tail) u.tail.rotation.y = Math.sin(C.t * 2.4) * 0.5;
}

/* ── живое поручение (errands.js: «забери Бобика у тёщи», «кот от ветеринара») ──
   Зверь бежит к ближнему боку машины, запрыгивает в салон (дуга, уменьшается) и пропадает — у машины «Гав!» / «Мяу»
   облачком и звуком. У клиента — выпрыгивает из машины и бежит к его ногам (dog / cat с o.from), там лает / мяукает. */
export const JUMP = { SIDE: 1.15, HOP: 0.42, OUT: 0.35, DOG_RUN: 4.6, CAT_RUN: 3.6, MAX: 6 };
/** зверь у ног того, кто отдаёт: kind 'dog' | 'cat', ped — у кого (как dog / cat), o — как у них */
export function pet (kind, ped, o = {}) { return kind === 'cat' ? cat(ped, o) : dog(ped, o); }
/** выпрыгнуть из машины к ногам клиента ped: o — как у dog / cat (sit, barks, sec, word) */
export function unboard (kind, ped, o = {}) {
  const c = carPos();
  if (!c || !ped) return null;
  const fx = Math.sin(c.h || 0), fz = Math.cos(c.h || 0), sx = fz, sz = -fx;
  const sg = (ped.x - c.x) * sx + (ped.z - c.z) * sz >= 0 ? 1 : -1;
  ST.unboards = (ST.unboards || 0) + 1;
  return pet(kind, ped, Object.assign({}, o, { from: { x: c.x + sx * sg * JUMP.SIDE, z: c.z + sz * sg * JUMP.SIDE } }));
}
/** зверь P (из dog / cat / pet) бежит к машине и запрыгивает в салон; o.word — что скажет у машины, o.done() — запрыгнул */
export function board (P, o = {}) {
  if (!P || !P.m) return false;
  P.board = { t: 0, hop: -1, word: o.word || (P.cat ? t('Мяу') : t('Гав!')), done: o.done || null };
  P.sit = false; P.to = null; P.barkQ = 0; P.look = null; P.jump = 0;
  ST.boards = (ST.boards || 0) + 1;
  return true;
}
/* шаг посадки → 'run' (бежит), 'hop' (в прыжке — позу ставит сам), true — в салоне (убрать) */
function boardStep (P, dt, run) {
  const B = P.board, c = carPos();
  B.t += dt;
  if (!c || B.t > JUMP.MAX) { boarded(P, c); return true; }
  if (B.hop < 0) {
    const fx = Math.sin(c.h || 0), fz = Math.cos(c.h || 0), sx = fz, sz = -fx;
    const sg = (P.x - c.x) * sx + (P.z - c.z) * sz >= 0 ? 1 : -1;
    const tx = c.x + sx * sg * JUMP.SIDE, tz = c.z + sz * sg * JUMP.SIDE, dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
    if (d < 0.35) { B.hop = 0; B.x0 = P.x; B.z0 = P.z; return 'hop'; }
    const st = Math.min(d, run * dt);
    P.x += dx / d * st; P.z += dz / d * st;
    P.m.rotation.y += dAng(P.m.rotation.y, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
    P.ph = (P.ph || 0) + dt * 16;
    P.m.position.set(P.x, gh(P.x, P.z), P.z);
    return 'run';
  }
  B.hop += dt / JUMP.HOP;
  const k = Math.min(1, B.hop);
  const x = B.x0 + (c.x - B.x0) * k * 0.75, z = B.z0 + (c.z - B.z0) * k * 0.75;
  P.x = x; P.z = z;
  P.m.rotation.y += dAng(P.m.rotation.y, angTo(x, z, c.x, c.z)) * Math.min(1, dt * 12);
  P.m.position.set(x, gh(x, z) + Math.sin(k * Math.PI) * 0.7 + k * 0.5, z);
  P.m.scale.setScalar((P.s0 || 1) * (1 - 0.65 * k));
  if (k >= 1) { boarded(P, c); return true; }
  return 'hop';
}
function boarded (P, c) {
  const B = P.board;
  if (c && A && A.scene) {
    const g = new THREE.Group();
    g.position.set(c.x, gh(c.x, c.z), c.z);
    A.scene.add(g);
    bubble(g, B.word, DC.DOG_COL, 1.9, 1.3, '');
    setTimeout(() => { if (g.parent) g.parent.remove(g); }, 1400);
    try {
      if (A.Snd) { if (P.cat) A.Snd.fx('meow', s => s.blip(1100, 0.08, 'triangle', 0.03), { x: c.x, z: c.z, far: 30 }); else A.Snd.fx('bark', synBark, { x: c.x, z: c.z, far: 40 }); }
    } catch (e) { /* — */ }
  }
  ST.boarded = (ST.boarded || 0) + 1;
  P.board = null;
  if (B.done) { try { B.done(); } catch (e) { /* — */ } }
}
function legsStill (u) { if (u && u.legs) for (let i = 0; i < 4; i++) u.legs[i].rotation.x = 0.5; }

/** облачко «из квартиры» — у клиента за спиной (дверь), низко: голос или звук оттуда */
export function offstage (ped, text, o = {}) {
  if (!A || !A.scene || !ped || !ped.grp) return null;
  const X = axes(ped);
  const g = new THREE.Group();
  const x = X.px + X.dx * 1.2, z = X.pz + X.dz * 1.2;
  g.position.set(x, gh(x, z), z);
  A.scene.add(g);
  const hold = o.hold || 2.6;
  bubble(g, text, o.col || DC.OFF_COL, o.y || 2.2, hold, o.name === undefined ? t('из квартиры') : o.name);
  setTimeout(() => { if (g.parent) g.parent.remove(g); }, hold * 1000 + 100);
  if (o.snd) { try { if (A.Snd) A.Snd.fx(o.snd, o.syn || null, { x, z, far: 40 }); } catch (e) { /* — */ } }
  ST.offstage++;
  return g;
}

/* ── кадр ── */
export function frame (dt) {
  if (!ACT.size && !DOGS.size && !CATS.size) return;
  const cp = A && A.cam && A.cam.position;
  for (const a of ACT) {
    if (!alive(a)) { release(a); continue; }
    if (a.L) LIFE.face(a.L, dt);
    a.t += dt;
    if (a.t > DC.LIFE && !DLG.isOpen()) { drop(a); continue; }       // страховка: забытый актёр не держит камеру и лицо (окно открыто — держим)
    if (!a.own) {                                                    // клиента двигает game.js; пока разговор — стоит у двери, не уходит с пиццей
      if (a.ped && !a.nofocus && !a.leaving && a.ped.freeT !== undefined && a.ped.freeT < 0.6) a.ped.freeT = 0.6;
      continue;
    }
    const u = a.grp.userData;
    let walking = false;
    if (a.to) {
      const dx = a.to.x - a.x, dz = a.to.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.06) {
        a.x = a.to.x; a.z = a.to.z;
        const dropIt = a.to.drop;
        a.to = null;
        if (a.done) { a.done(); a.done = null; }
        if (dropIt) { drop(a); continue; }
      } else {
        const st = Math.min(d, a.speed * dt);
        a.x += dx / d * st; a.z += dz / d * st;
        a.h += dAng(a.h, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
        a.ph += dt * 8.5 * a.speed / 1.6;
        walking = true;
      }
    }
    if (!walking && a.look) a.h += dAng(a.h, angTo(a.x, a.z, a.look.x, a.look.z)) * Math.min(1, dt * 6);
    a.grp.position.set(a.x, gh(a.x, a.z), a.z);
    a.grp.rotation.y = a.h;
    const sw = walking ? Math.sin(a.ph) * 0.6 : 0;
    if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; }
    if (u.armL) {
      if (a.pockets) { u.armL.rotation.x = 0.22; u.armR.rotation.x = 0.22; u.armL.rotation.z = -0.1; u.armR.rotation.z = 0.1; }   // руки в карманах
      else { u.armL.rotation.x = walking ? -sw * 0.6 : 0; u.armR.rotation.x = walking ? sw * 0.6 : 0; u.armL.rotation.z = u.armR.rotation.z = 0; }
    }
    if (u.head) {
      // говорит — голова к камере (как герои катсцен), чуть кивает в такт
      const want = a.talk && cp ? Math.max(-1, Math.min(1, dAng(a.h, Math.atan2(cp.x - a.x, cp.z - a.z)))) : 0;
      a.hy = (a.hy || 0) + (want - (a.hy || 0)) * Math.min(1, dt * 6);
      u.head.rotation.y = a.hy;
      u.head.rotation.x = a.talk ? Math.sin(a.t * 7.3) * 0.05 : 0;
    }
  }
  for (const D of DOGS) dogStep(D, dt);
  for (const C of CATS) catStep(C, dt);
}

/** убрать всех своих сразу (смена кончилась, профиль сменили) */
export function clear () {
  cloudClear();
  for (const a of [...ACT]) { if (a.own) drop(a); else release(a); }
  for (const D of [...DOGS]) dogDrop(D);
  for (const C of [...CATS]) catDrop(C);
}

/* для probe: __dlv.DCAST */
export const DEBUG = {
  DC, ST, CLOUD, get pending () { return PEND.size; }, cloudClear,
  get actors () { return [...ACT].map(a => ({ own: a.own, x: +(a.grp ? a.grp.position.x : a.x).toFixed(1), z: +(a.grp ? a.grp.position.z : a.z).toFixed(1), kid: a.grp ? +a.grp.scale.y.toFixed(2) : 1, walking: !!a.to, talk: a.talk, mouth: a.L ? a.L.mouth : null, face: !!a.L, seen: a.seen })); },
  get dogs () { return [...DOGS].map(D => ({ x: +D.x.toFixed(1), z: +D.z.toFixed(1), sit: D.sit, going: !!D.to, board: !!D.board, barksLeft: D.barkQ })); },
  get cats () { return [...CATS].map(C => ({ x: +C.x.toFixed(1), z: +C.z.toFixed(1), going: !!C.to, board: !!C.board })); },
  JUMP,
  /* голова на экране (NDC y: 1 — верх) */
  screen (a) { if (!a || !a.grp || !A || !A.cam) return null; const g = a.grp.position; PV.set(g.x, g.y + 1.6 * (a.grp.scale.y || 1), g.z).project(A.cam); return { x: +PV.x.toFixed(2), y: +PV.y.toFixed(2) }; },
  get list () { return [...ACT]; },
  clear,
};
