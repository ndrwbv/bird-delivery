/* ──────────────────────────────────────────────────────────────────────────
   Повтор для клипов (№ 10 IDEAS, 09.10.2026). Правила словами — docs/CAREER.md «Повтор».

   ЗАПИСЬ — всё время, пока идёт смена (и пока машина «умирает»): 20 раз в секунду игрового
   времени снимок поз всего, что ездит, ходит и летает рядом со своей машиной (RP.R м): верхние
   объекты сцены (машины потока, прохожие, свои и чужие обломки, сбитые столбы и лавочки, дым и
   искры), колёса своей машины, камера игры. Хранится последние RP.SECS секунд — кольцом в
   готовых массивах (ничего не выделяем в кадре): ~1,9 МБ. Между снимками — плавно (интерполяция); колёса своей
   машины — не по короткой дуге, а на сколько машина проехала (WHEEL_R): на любой скорости крутятся вперёд.

   ПОВТОР — клавиша R / LB геймпада в езде, или «повтор» в паузе. Мир стоит, хад скрыт, сверху —
   плашка «ПОВТОР»; камера — 4 ракурса (сзади низко, сбоку как у трассы, облёт, как было в игре),
   скорость ×0,25 / ×0,5 / ×1, перемотка. В катсцене, диалоге, на карте, в меню — нельзя.

   ЗВУК ПОВТОРА — пока идёт запись, пишутся и звуки (кольцо EV, последние RP.SECS с): именованные
   звуки игры (Snd.fx: гудки, бах, сбитый столб…; кроме звуков интерфейса — SND_SKIP), удары слоями
   (impact.js: удар, стекло, упавшая деталь), а в кадре — газ, тормоз и занос (мотор, визг шин).
   Повтор идёт вперёд (×0,25—×1, не перемотка) — звуки звучат в свой момент, мотор — по записанной
   скорости, «уши» — у машины в повторе. Перемотка, пауза — мотор молчит. Музыка (music.js) идёт своя.

   РОЛИК — запись холста (MediaRecorder, webm) от начала повтора до конца тем же ракурсом и
   скоростью, со звуком: шины «звуки», «мотор», «музыка» (общий AudioContext игры) → свой регулятор →
   MediaStreamAudioDestinationNode → дорожка opus в том же webm. Звук выключен (M, настройки), ?mute,
   площадка заглушила — ролик без звука. После записи в заголовок webm дописывается длительность
   (webmdur.js): без неё часть плееров не показывает время. В Стим-сборке (Электрон) — файл в
   «Видео/Птица Пицца» (electron/main.cjs video:save), в браузере — скачивается. Гифку не делаем:
   webm и так открывают все плееры и мессенджеры.

   УДАР — сильный (от RP.SLOW.V м/с, авария, impact.js IMP.TIER.HEAVY): ~0,4 с мир идёт ×0,3,
   тряска камеры, низкий «вуух». Графика «эффекты: меньше» (gfx.js) — без этого.

     init(api)       — из game.js один раз (что нужно — ниже, «api»)
     rec(dt)         — каждый кадр езды, перед рендером (CL.step); idle() — в меню и на итогах
     open(from)      — показать повтор; from: 'key' | 'pad' | 'pause'. close() — назад в игру
     on()            — повтор открыт: кадр игры — frame(raw), мир не шагает
     pad(p)          — геймпад (game.js padStep); true — кнопки забрал повтор
     crash(vn)       — удар своей машины силой vn м/с (game.js hurtCar)
     tapFx(...)      — Snd.fx (game.js): записать именованный звук; tapHit(вид, ...) — impact.js: удар, стекло, деталь
     slowK(raw)      — множитель времени мира в этом кадре (замедление после удара)
     DEBUG           — __dlv.REPLAY: состояние, счётчики, ручки для проверок

   sfx-names: slowmo, clip-saved
   ────────────────────────────────────────────────────────────────────────── */
import './replay.css';
import { t, N_ } from '../i18n/index.js';
import { keyHTML, matchKey, refreshKeys } from '../input/glyphs.js';
import * as IMPACT from './impact.js';
import { fixDuration } from './webmdur.js';

export const RP = {
  HZ: 20,             // снимков в секунду игрового времени (было 30, 10.10.2026: запись дешевле на треть; между снимками — плавно, колёса — по пути машины)
  HIT_V: 6,           // м/с: удар своей машины сильнее — снимок в этом же кадре, вне очереди (момент удара — точно, а не между снимками)
  WHEEL_R: 0.46,      // м: радиус колеса своей машины, как в game.js (V.wheel += vf·dt / 0.46) — поворот колеса между снимками
  SECS: 10,           // сколько секунд хранить
  R: 140,             // м от своей машины: что дальше — не пишем (в повторе камера рядом, дальше — туман)
  E_AVG: 180,         // в среднем объектов в снимке (кольцо — на SECS·HZ·E_AVG; больше — окно чуть короче)
  MAX_PER: 480,       // не больше объектов в одном снимке
  JUMP: 40,           // м: машина прыгнула дальше за один снимок (воскресла, телепорт) — запись с чистого листа
  MIN: 0.5,           // с: короче — «нечего показывать»
  SPEEDS: [0.25, 0.5, 1],
  SCRUB: 2.5,         // перемотка зажатой стрелкой — во столько раз быстрее реального времени
  STEP: 1,            // с: шаг крестовины / кнопки ◀ ▶
  SLOW: { ON: false, V: 15, K: 0.3, SECS: 0.4, EASE: 0.12, GAP: 2.5, SHAKE: 0.9 },   // ON — замедление выключено (автор 10.10.2026: «неприятная пауза, когда врезаешься» — убрать); тряска осталась
  REC_FPS: 30, REC_BPS: 8e6,
  SND: true,          // звуки в повторе (и в ролике): удары, гудки, мотор по записи
  EV_MAX: 400,        // звуков в кольце, не больше (старые выпадают)
  REC_ABPS: 128e3,    // звук ролика, бит/с (opus)
  REC_GAIN: 0.45,     // громкость звука в ролике — как общий регулятор игры (Snd.main)
};
/* звуки интерфейса — не в повтор */
const SND_SKIP = new Set(['ui-click', 'ui-deny', 'tick', 'clip-saved', 'order', 'fail', 'receipt', 'fanfare', 'reel-tick', 'reel-stop', 'talk-f', 'chip', 'bet']);
const CAMS = [
  { id: 'chase', label: N_('сзади') },
  { id: 'side', label: N_('сбоку') },
  { id: 'orbit', label: N_('облёт') },
  { id: 'game', label: N_('как было') },
];

/* ── кольцо снимков ──
   запись объекта — FL чисел: положение 3, поворот 4 (кватернион), масштаб 3, прозрачность (−1 — не трогаем), флаги
   (1 — видим, 2 — «всегда видим, если записан»: машины и люди, которых игра прячет вне своего кадра) */
const FL = 12;
const F_CAP = RP.HZ * RP.SECS + 2;
const E_CAP = F_CAP * RP.E_AVG;
const ED = new Float32Array(E_CAP * FL);
const EID = new Int32Array(E_CAP);
const FDL = 16;                                 // кадр: время, камера xyz, кватернион, машина xyz, курс, скорость, fov, педали (MF_*), занос
const FD = new Float32Array(F_CAP * FDL);
const FS = new Float64Array(F_CAP);             // номер первой записи кадра (сквозной)
const FC = new Int32Array(F_CAP);               // сколько записей
let FN = 0, F0 = 0, EN = 0, T = 0, ACC = 0, LIVE = false, HIT = false;
/* реестр: объект → номер; номер освобождается, когда его нет ни в одном живом снимке */
const IDX = new Map();
const OBJ = [], LAST = [], FREE = [];
/* по номеру — ссылки на положение, поворот, масштаб и свой прозрачный материал: в кадре читаем однотипные
   Vector3 / Quaternion (быстро), а не разные объекты сцены (Mesh, Group, Sprite — медленный разнотипный доступ) */
const POS = [], QUA = [], SCL = [], MAT = [];
const ALW = new Set();

export const STATS = { samples: 0, entries: 0, maxPer: 0, objs: 0, clears: 0, opens: 0, slow: 0, saved: 0, recMs: 0, lastPath: '', events: 0, played: 0, audio: false, lastDurMs: 0 };

/* ?noreplay — без записи (сравнить цену кадра: tools/probe-checks/frametail.js) */
const OFF = typeof location !== 'undefined' && /[?&]noreplay(&|$)/.test(location.search);
let A = null;
export function init (api) {
  A = api;
  addEventListener('keydown', onKey, true);       // раньше игры (game.js, career.js): в повторе клавиши — его
  addEventListener('keyup', onKeyUp, true);
}

function clear () {
  FN = F0 = EN = 0; T = 0; ACC = 0;
  IDX.clear(); OBJ.length = 0; LAST.length = 0; FREE.length = 0; POS.length = 0; QUA.length = 0; SCL.length = 0; MAT.length = 0; CAND.length = 0; NEXT.length = 0;
  EV.length = 0;
  STATS.clears++;
}
/** не едем (меню, итоги): следующая запись — с чистого листа */
export function idle () { LIVE = false; }

const ownMat = o => { const m = o.isMesh ? o.material : null; return m && !Array.isArray(m) && m.transparent && m.opacity !== undefined ? m : null; };
function register (o) {
  let id;
  if (FREE.length) id = FREE.pop(); else { id = OBJ.length; OBJ.push(null); LAST.push(-1); POS.push(null); QUA.push(null); SCL.push(null); MAT.push(null); }
  OBJ[id] = o; POS[id] = o.position; QUA[id] = o.quaternion; SCL[id] = o.scale; MAT[id] = ownMat(o); LAST[id] = -1;
  IDX.set(o, id);
  return id;
}
function put (id, o, flags) {
  LAST[id] = FN;
  const k = EN % E_CAP, b = k * FL, p = POS[id], q = QUA[id], s = SCL[id], m = MAT[id];
  EID[k] = id;
  ED[b] = p.x; ED[b + 1] = p.y; ED[b + 2] = p.z;
  ED[b + 3] = q.x; ED[b + 4] = q.y; ED[b + 5] = q.z; ED[b + 6] = q.w;
  ED[b + 7] = s.x; ED[b + 8] = s.y; ED[b + 9] = s.z;
  ED[b + 10] = m !== null ? m.opacity : -1;
  ED[b + 11] = flags | (o.visible ? 1 : 0);
  EN++;
}
/* ── звуки: кольцо событий ──
   { t — время записи (T), k — 'fx' | 'hit' | 'glass' | 'debris', a — аргументы как у вызова }; «где» копируем */
const EV = [];
const MF_GAS = 1, MF_BRAKE = 2, MF_HAND = 4, MF_NOS = 8, MF_AIR = 16, MF_DEAD = 32;
const cp = o => (o && typeof o === 'object' ? { ...o } : o);
function evPush (k, a) {
  if (!A || OPEN || OFF || !LIVE) return;
  const old = T - RP.SECS - 1;
  let n = 0;
  while (n < EV.length && (EV[n].t < old || EV.length - n >= RP.EV_MAX)) n++;
  if (n) EV.splice(0, n);
  EV.push({ t: T, k, a });
  STATS.events++;
}
/** Snd.fx (game.js): именованный звук игры */
export function tapFx (name, synth, at, v) {
  if (!LIVE || OPEN) return;
  if (SND_SKIP.has(Array.isArray(name) ? name[0] : name)) return;
  evPush('fx', [name, synth, cp(at), v]);
}
/** impact.js: 'hit' (v, mat, at) | 'glass' (broken, cracked, lamps, at) | 'debris' (at, v, key, again) */
export function tapHit (k, a, b, c, d) {
  if (!LIVE || OPEN) return;
  evPush(k, [cp(a), cp(b), cp(c), cp(d)]);
}
function fire (e) {
  const a = e.a;
  try {
    if (e.k === 'fx') A.Snd.fx(a[0], a[1], a[2] || undefined, a[3]);
    else if (e.k === 'hit') IMPACT.hit(a[0], a[1], a[2] || undefined);
    else if (e.k === 'glass') IMPACT.glass(a[0], a[1], a[2], a[3] || undefined);
    else if (e.k === 'debris') IMPACT.debris(a[0], a[1], a[2], a[3]);
    STATS.played++;
  } catch (err) { /* звук не главное */ }
}

/* кого писать в снимок: ближе RP.R, ещё не в этом снимке; новых — только то, что двигается (не замороженную статику) */
let SX = 0, SZ = 0, SN = 0;
const R2 = RP.R * RP.R;
let CAND = [], NEXT = [], PART = 0;
const SCAN_OF = 3, TAIL = 64;     // за снимок — треть детей сцены по кругу и 64 последних (новое добавляют в конец: дым, обломки)
function take (o, flags) {
  if (SN >= RP.MAX_PER) return;
  const p = o.position, dx = p.x - SX, dz = p.z - SZ;
  if (dx * dx + dz * dz > R2) return;
  let id = IDX.get(o);
  if (id === undefined) {
    if (!(o.isMesh || o.isGroup || o.isSprite) || o.isInstancedMesh || !o.matrixAutoUpdate) return;
    id = register(o);
  } else if (LAST[id] === FN) return;
  put(id, o, flags);
  NEXT.push(o); SN++;
}
const takeAlw = o => take(o, 2);

/** каждый кадр езды (game.js, перед рендером) */
export function rec (dt) {
  if (!A || OPEN || OFF) return;
  const car = A.car();
  if (!car) return;
  if (!LIVE) { clear(); LIVE = true; }
  T += dt; ACC += dt;
  const step = 1 / RP.HZ;
  const hit = HIT && ACC >= step * 0.5;            // удар — вне очереди, но не чаще чем через полшага (иначе окно кольца короче)
  if (FN > F0 && ACC < step && !hit) return;
  ACC = hit || ACC >= 2 * step ? 0 : Math.max(0, ACC - step);
  HIT = false;
  const t0 = performance.now();
  const cp = car.position, cx = cp.x, cz = cp.z;
  if (FN > F0) {
    const pb = ((FN - 1) % F_CAP) * FDL, dx = FD[pb + 8] - cx, dz = FD[pb + 10] - cz;
    if (dx * dx + dz * dz > RP.JUMP * RP.JUMP) { clear(); LIVE = true; }
  }
  const slot = FN % F_CAP, sc = A.scene;
  FS[slot] = EN;
  const e0 = EN;
  SX = cx; SZ = cz; SN = 0; NEXT.length = 0;
  ALW.clear();
  A.always(ALW, cx, cz, R2);
  take(car, 2);
  ALW.forEach(takeAlw);                         // машины потока и люди рядом
  for (let i = 0; i < CAND.length; i++) { const o = CAND[i]; if (o.parent === sc) take(o, 0); }   // кто был в прошлом снимке
  const ch = sc.children, L = ch.length;
  for (let i = PART; i < L; i += SCAN_OF) take(ch[i], 0);
  for (let i = Math.max(0, L - TAIL); i < L; i++) take(ch[i], 0);
  PART = (PART + 1) % SCAN_OF;
  const sw = CAND; CAND = NEXT; NEXT = sw;
  let n = SN;
  const wh = car.userData && car.userData.wheels;
  if (wh) for (let i = 0; i < wh.length; i++) { const w = wh[i]; let id = IDX.get(w); if (id === undefined) id = register(w); put(id, w, 2 | 4); n++; }   // 4 — колесо (apply: поворот по пути)
  FC[slot] = n;
  const c = A.cam, b = slot * FDL;
  FD[b] = T;
  FD[b + 1] = c.position.x; FD[b + 2] = c.position.y; FD[b + 3] = c.position.z;
  FD[b + 4] = c.quaternion.x; FD[b + 5] = c.quaternion.y; FD[b + 6] = c.quaternion.z; FD[b + 7] = c.quaternion.w;
  FD[b + 8] = cx; FD[b + 9] = cp.y; FD[b + 10] = cz;
  FD[b + 11] = car.rotation.y;
  FD[b + 12] = A.speed ? A.speed() : 0;
  FD[b + 13] = c.fov;
  const mi = A.motorIn ? A.motorIn() : null;      // педали и занос — мотор и визг шин в повторе
  FD[b + 14] = mi ? ((A.gas && A.gas() ? MF_GAS : 0) | (mi.brake ? MF_BRAKE : 0) | (mi.hand ? MF_HAND : 0) | (mi.nos ? MF_NOS : 0) | (mi.air ? MF_AIR : 0) | (mi.dead ? MF_DEAD : 0)) : 0;
  FD[b + 15] = mi ? +mi.side || 0 : 0;
  FN++;
  while (FN - F0 > F_CAP - 1) F0++;
  while (F0 < FN && FS[F0 % F_CAP] < EN - E_CAP) F0++;   // записи этого кадра уже затёрты — кадр не живой
  if ((FN & 63) === 0) {                          // реестр: кого нет ни в одном живом кадре — освободить
    for (let id = 0; id < OBJ.length; id++) if (OBJ[id] && LAST[id] < F0) { IDX.delete(OBJ[id]); OBJ[id] = POS[id] = QUA[id] = SCL[id] = MAT[id] = null; FREE.push(id); }
  }
  STATS.samples++; STATS.entries = EN - e0; if (n > STATS.maxPer) STATS.maxPer = n;
  STATS.objs = IDX.size;
  STATS.recMs += (performance.now() - t0 - STATS.recMs) * 0.05;
}

/* ── повтор ── */
let OPEN = false, FROM = '', F = 0, TT = null, CD = null, TR = null, DUR = 0;
let PT = 0, PLAY = true, SPD = 2, CAM = 0, HOLD = 0, PADH = 0, LASTPT = -1, RT0 = 0, MOT = false;
const MI = { live: true, dead: false, brake: 0, hand: 0, side: 0, air: false, nos: false, vmax: 48, surf: 1, id: '' };   // мотор в повторе
const SNAP = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, fov: 60 };
const CM = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, ok: false, h: 0, ang: 0, ax: 0, ay: 0, az: 0, anchor: false, side: 1 };
export const on = () => OPEN;
export const length = () => (FN - F0 > 1 ? FD[((FN - 1) % F_CAP) * FDL] - FD[(F0 % F_CAP) * FDL] : 0);

/** повтор можно открыть сейчас (не катсцена, не диалог, не меню) и есть что показать */
export const can = () => !!(A && !OPEN && A.canOpen() && length() >= RP.MIN);

export function open (from) {
  if (!A || OPEN) return false;
  if (!A.canOpen(from === 'pause')) return false;
  if (length() < RP.MIN) { if (A.toast) A.toast(t('повтор: пока нечего показывать')); return false; }
  FROM = from || 'key';
  if (FROM === 'pause') A.pause(false);
  build();
  A.freeze(true);
  const c = A.cam;
  SNAP.px = c.position.x; SNAP.py = c.position.y; SNAP.pz = c.position.z;
  SNAP.qx = c.quaternion.x; SNAP.qy = c.quaternion.y; SNAP.qz = c.quaternion.z; SNAP.qw = c.quaternion.w; SNAP.fov = c.fov;
  OPEN = true; PT = 0; PLAY = true; SPD = RP.SPEEDS.length - 1; HOLD = 0; PADH = 0; LASTPT = -1; CM.ok = false; CM.anchor = false;
  STATS.opens++;
  document.body.classList.add('replay-on');
  ui(true);
  return true;
}

/* снимки кольца → дорожка на каждый объект: где был в каждом кадре; трогаем только тех, кто двигался */
function build () {
  F = FN - F0;
  TT = new Float32Array(F);
  CD = new Float32Array(F * FDL);
  const tBase = FD[(F0 % F_CAP) * FDL];
  RT0 = tBase;
  const mi = A.motorIn ? A.motorIn() : null;
  MI.vmax = (mi && mi.vmax) || 48; MI.surf = mi && mi.surf != null ? mi.surf : 1; MI.id = (mi && mi.id) || '';
  const map = new Map();
  for (let k = 0; k < F; k++) {
    const slot = (F0 + k) % F_CAP;
    CD.set(FD.subarray(slot * FDL, slot * FDL + FDL), k * FDL);
    TT[k] = FD[slot * FDL] - tBase;
    const s = FS[slot], cnt = FC[slot];
    for (let e = 0; e < cnt; e++) {
      const ei = (s + e) % E_CAP, id = EID[ei];
      let tr = map.get(id);
      if (!tr) map.set(id, tr = { o: OBJ[id], pres: new Uint8Array(F), d: new Float32Array(F * FL), snap: new Float64Array(FL), parent: null, added: false, frozen: false });
      tr.pres[k] = 1;
      tr.d.set(ED.subarray(ei * FL, ei * FL + FL), k * FL);
    }
  }
  DUR = TT[F - 1];
  A.unview();                                     // машины и люди вне кадра игры — снова видны (их кадр — не наш)
  TR = [];
  for (const tr of map.values()) {
    const o = tr.o;
    if (!o) continue;
    snap(o, tr.snap);
    let moved = false;
    for (let k = 0; k < F && !moved; k++) {
      if (!tr.pres[k]) { moved = true; break; }
      const b = k * FL, d = tr.d, s = tr.snap;
      for (let j = 0; j < 10; j++) if (Math.abs(d[b + j] - s[j]) > 1e-3) { moved = true; break; }
      if (!moved && d[b + 10] >= 0 && Math.abs(d[b + 10] - s[10]) > 0.01) moved = true;
      if (!moved && !(d[b + 11] & 2) && ((d[b + 11] & 1) ? 1 : 0) !== (o.visible ? 1 : 0)) moved = true;
    }
    if (!moved) continue;
    tr.parent = o.parent;
    tr.vis = o.visible;
    tr.frozen = !o.matrixAutoUpdate;
    if (!o.parent) { A.scene.add(o); tr.added = true; }   // уже убрали со сцены (дым догорел, машина уехала) — на время повтора вернуть
    TR.push(tr);
  }
  STATS.tracks = TR.length; STATS.frames = F; STATS.dur = DUR;
}
function snap (o, s) {
  const p = o.position, q = o.quaternion, sc = o.scale, m = o.material;
  s[0] = p.x; s[1] = p.y; s[2] = p.z; s[3] = q.x; s[4] = q.y; s[5] = q.z; s[6] = q.w; s[7] = sc.x; s[8] = sc.y; s[9] = sc.z;
  s[10] = ownMat(o) ? m.opacity : -1;
}

export function close () {
  if (!OPEN) return;
  if (REC) stopRec(true);
  for (const tr of TR) {
    const o = tr.o, s = tr.snap;
    o.position.set(s[0], s[1], s[2]); o.quaternion.set(s[3], s[4], s[5], s[6]); o.scale.set(s[7], s[8], s[9]);
    if (s[10] >= 0 && o.material) o.material.opacity = s[10];
    o.visible = tr.vis;
    if (tr.added && o.parent) o.parent.remove(o);
    if (tr.frozen) { o.updateMatrix(); o.updateMatrixWorld(true); }
  }
  if (MOT && A.motor) A.motor(0, false, null, 0);
  MOT = false;
  TR = null; TT = null; CD = null;
  const c = A.cam;
  c.position.set(SNAP.px, SNAP.py, SNAP.pz); c.quaternion.set(SNAP.qx, SNAP.qy, SNAP.qz, SNAP.qw);
  if (c.fov !== SNAP.fov) { c.fov = SNAP.fov; c.updateProjectionMatrix(); }
  OPEN = false;
  document.body.classList.remove('replay-on');
  ui(false);
  A.freeze(false);
  if (FROM === 'pause') A.pause(true);
}

/* кадр k, доля a по времени повтора */
function at (pt) {
  let lo = 0, hi = F - 1;
  if (pt <= 0) return [0, 0];
  if (pt >= TT[hi]) return [hi, 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TT[m] <= pt) lo = m; else hi = m; }
  const span = TT[hi] - TT[lo];
  return [lo, span > 0 ? (pt - TT[lo]) / span : 0];
}
const AT = [0, 0];
function apply (k, a) {
  const k2 = Math.min(F - 1, k + 1);
  // колёса своей машины: на сколько они повернулись между снимками — по пути машины вдоль курса (м / радиус),
  // а не по короткой дуге (быстрее ~100 км/ч при 20 снимках в секунду короткая дуга крутила бы их назад)
  const c1 = k * FDL, c2 = k2 * FDL, ch = CD[c1 + 11];
  const wexp = ((CD[c2 + 8] - CD[c1 + 8]) * Math.sin(ch) + (CD[c2 + 10] - CD[c1 + 10]) * Math.cos(ch)) / RP.WHEEL_R;
  for (let i = 0; i < TR.length; i++) {
    const tr = TR[i], o = tr.o, P = tr.pres, d = tr.d;
    const p1 = P[k], p2 = P[k2];
    if (!p1 && !p2) { o.visible = false; continue; }
    let b1 = k * FL, b2 = k2 * FL, w = a;
    if (!p1) b1 = b2; else if (!p2) b2 = b1;
    if (b1 === b2) w = 0;
    const L = (j) => d[b1 + j] + (d[b2 + j] - d[b1 + j]) * w;
    o.position.set(L(0), L(1), L(2));
    const fl = d[(w < 0.5 ? b1 : b2) + 11];
    if ((fl & 4) && b1 !== b2 && Math.abs(d[b1 + 4]) + Math.abs(d[b1 + 5]) + Math.abs(d[b2 + 4]) + Math.abs(d[b2 + 5]) < 1e-3) {
      // поворот только вокруг оси колеса (x): угол из кватерниона, лишние обороты — те, что ближе к пути машины
      const a1 = 2 * Math.atan2(d[b1 + 3], d[b1 + 6]), a2 = 2 * Math.atan2(d[b2 + 3], d[b2 + 6]);
      let da = a2 - a1;
      da += Math.round((wexp - da) / (Math.PI * 2)) * Math.PI * 2;
      const an = (a1 + da * w) / 2;
      o.quaternion.set(Math.sin(an), 0, 0, Math.cos(an));
      o.scale.set(L(7), L(8), L(9));
      o.visible = true;
      if (tr.frozen) { o.updateMatrix(); o.updateMatrixWorld(true); }
      continue;
    }
    // кватернион: nlerp по короткой дуге
    let qx = d[b2 + 3], qy = d[b2 + 4], qz = d[b2 + 5], qw = d[b2 + 6];
    if (d[b1 + 3] * qx + d[b1 + 4] * qy + d[b1 + 5] * qz + d[b1 + 6] * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    const x = d[b1 + 3] + (qx - d[b1 + 3]) * w, y = d[b1 + 4] + (qy - d[b1 + 4]) * w, z = d[b1 + 5] + (qz - d[b1 + 5]) * w, ww = d[b1 + 6] + (qw - d[b1 + 6]) * w;
    const n = Math.sqrt(x * x + y * y + z * z + ww * ww) || 1;
    o.quaternion.set(x / n, y / n, z / n, ww / n);
    o.scale.set(L(7), L(8), L(9));
    o.visible = (fl & 2) ? true : !!(fl & 1);
    const op = d[b1 + 10];
    if (op >= 0 && o.material) o.material.opacity = L(10);
    if (tr.frozen) { o.updateMatrix(); o.updateMatrixWorld(true); }
  }
}

/* ── камера повтора ── */
const P = { x: 0, y: 0, z: 0, h: 0, v: 0 };
function carAt (pt, out) {
  const r = at(pt), k = r[0], a = r[1], k2 = Math.min(F - 1, k + 1), b1 = k * FDL, b2 = k2 * FDL;
  out.x = CD[b1 + 8] + (CD[b2 + 8] - CD[b1 + 8]) * a;
  out.y = CD[b1 + 9] + (CD[b2 + 9] - CD[b1 + 9]) * a;
  out.z = CD[b1 + 10] + (CD[b2 + 10] - CD[b1 + 10]) * a;
  let dh = CD[b2 + 11] - CD[b1 + 11];
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  out.h = CD[b1 + 11] + dh * a;
  out.v = CD[b1 + 12] + (CD[b2 + 12] - CD[b1 + 12]) * a;
  return out;
}
const FUT = { x: 0, y: 0, z: 0, h: 0, v: 0 };
function camera (dt, jump) {
  const c = A.cam, mode = CAMS[CAM].id;
  carAt(PT, P);
  const fx = Math.sin(P.h), fz = Math.cos(P.h);   // вперёд машины (как в игре: sin/cos курса)
  if (mode === 'game') {
    const r = at(PT), k = r[0], a = r[1], k2 = Math.min(F - 1, k + 1), b1 = k * FDL, b2 = k2 * FDL;
    const L = j => CD[b1 + j] + (CD[b2 + j] - CD[b1 + j]) * a;
    c.position.set(L(1), L(2), L(3));
    let qx = CD[b2 + 4], qy = CD[b2 + 5], qz = CD[b2 + 6], qw = CD[b2 + 7];
    if (CD[b1 + 4] * qx + CD[b1 + 5] * qy + CD[b1 + 6] * qz + CD[b1 + 7] * qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
    const x = CD[b1 + 4] + (qx - CD[b1 + 4]) * a, y = CD[b1 + 5] + (qy - CD[b1 + 5]) * a, z = CD[b1 + 6] + (qz - CD[b1 + 6]) * a, w = CD[b1 + 7] + (qw - CD[b1 + 7]) * a;
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    c.quaternion.set(x / n, y / n, z / n, w / n);
    setFov(c, L(13) || 64);
    CM.ok = false;
    return;
  }
  let tx, ty, tz, lx = P.x, ly = P.y + 0.8, lz = P.z, fov = 55, k = 1 - Math.exp(-dt * 7);
  if (mode === 'chase') {
    // низко сзади: за машиной на 5,4 м, курс камеры догоняет курс машины мягко (занос виден), без отставания по дороге
    if (!CM.ok || jump) CM.h = P.h;
    else { let dh = P.h - CM.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; CM.h += dh * (1 - Math.exp(-dt * 4)); }
    const hx = Math.sin(CM.h), hz = Math.cos(CM.h);
    tx = P.x - hx * 5.4; ty = P.y + 1.15; tz = P.z - hz * 5.4;
    lx = P.x + hx * 3; ly = P.y + 0.85; lz = P.z + hz * 3;
    fov = 60; k = 1;
  } else if (mode === 'orbit') {
    CM.ang += dt * 0.42;
    const r = 8.5;
    tx = P.x + Math.sin(CM.ang) * r; ty = P.y + 2.4 + Math.sin(CM.ang * 0.7) * 0.6; tz = P.z + Math.cos(CM.ang) * r;
    fov = 52; k = 1 - Math.exp(-dt * 10);
  } else {
    // сбоку, как камера у трассы: стоит на месте у дороги впереди, провожает машину и зумит; уехала — новая точка
    const dx = CM.ax - P.x, dz = CM.az - P.z, d2 = dx * dx + dz * dz;
    const behind = (dx * fx + dz * fz) < -14;     // машина уже проехала её и ушла дальше
    if (!CM.anchor || jump || d2 > 30 * 30 || behind) {
      carAt(Math.min(DUR, PT + 1.6), FUT);         // где машина будет через 1,6 с
      const rx = Math.cos(FUT.h), rz = -Math.sin(FUT.h);   // вправо от курса
      let side = CM.side = -CM.side, ok = false;
      for (const off of [7.5, 4.5]) {
        for (let s = 0; s < 2 && !ok; s++, side = -side) {
          const x = FUT.x + rx * off * side + Math.sin(FUT.h) * 3, z = FUT.z + rz * off * side + Math.cos(FUT.h) * 3;
          if (!A.inHouse || !A.inHouse(x, z)) { CM.ax = x; CM.az = z; ok = true; }
        }
        if (ok) break;
      }
      if (!ok) { CM.ax = FUT.x + rx * 4; CM.az = FUT.z + rz * 4; }
      CM.ay = FUT.y + 1.5; CM.anchor = true; CM.ok = false;
    }
    tx = CM.ax; ty = CM.ay; tz = CM.az;
    const dd = Math.sqrt((tx - P.x) ** 2 + (tz - P.z) ** 2);
    fov = Math.max(20, Math.min(58, 2 * Math.atan(5.5 / Math.max(1, dd)) * 180 / Math.PI));
    k = 1;
  }
  if (mode !== 'side' && A.inHouse && A.inHouse(tx, tz)) {   // сзади и облёт: в стене дома — ближе к машине, пока не выйдет
    for (let i = 1; i <= 4; i++) { const f = 1 - i * 0.2, x = P.x + (tx - P.x) * f, z = P.z + (tz - P.z) * f; if (!A.inHouse(x, z) || i === 4) { tx = x; tz = z; break; } }
  }
  if (!CM.ok || jump) { CM.x = tx; CM.y = ty; CM.z = tz; CM.lx = lx; CM.ly = ly; CM.lz = lz; CM.ok = true; }
  else {
    CM.x += (tx - CM.x) * k; CM.y += (ty - CM.y) * k; CM.z += (tz - CM.z) * k;
    const kl = k >= 1 ? 1 : 1 - Math.exp(-dt * 12);
    CM.lx += (lx - CM.lx) * kl; CM.ly += (ly - CM.ly) * kl; CM.lz += (lz - CM.lz) * kl;
  }
  if (A.groundH) { const g = A.groundH(CM.x, CM.z) + 0.5; if (CM.y < g) CM.y = g; }
  c.position.set(CM.x, CM.y, CM.z);
  c.lookAt(CM.lx, CM.ly, CM.lz);
  setFov(c, fov);
}
function setFov (c, f) { if (Math.abs(c.fov - f) > 0.05) { c.fov = f; c.updateProjectionMatrix(); } }

/** кадр повтора (game.js frameStep): позы, камера, плашка; рисует game.js */
export function frame (raw) {
  const dt = Math.min(Math.max(raw, 0), 0.1);
  const rate = HOLD || PADH ? (HOLD || PADH) * RP.SCRUB : PLAY ? RP.SPEEDS[SPD] : 0;
  const pt0 = PT;
  PT += dt * rate;
  if (PT >= DUR) {
    if (REC) { PT = DUR; stopRec(false); }
    else if (rate > 0 && !HOLD && !PADH) PT = 0; else PT = DUR;
  }
  if (PT < 0) PT = 0;
  const jump = LASTPT < 0 || Math.abs(PT - LASTPT) > 0.6;
  LASTPT = PT;
  const r = at(PT); AT[0] = r[0]; AT[1] = r[1];
  apply(r[0], r[1]);
  camera(dt, jump);
  sounds(pt0, dt, rate > 0 && !HOLD && !PADH && PT > pt0 && PT - pt0 < 0.6);
  bar();
}

/* звуки повтора: события [pt0, PT) и мотор по записи; fwd — идёт вперёд обычным ходом (не перемотка, не пауза) */
function sounds (pt0, dt, fwd) {
  if (!RP.SND || !A.Snd) return;
  const c = A.cam;
  c.updateMatrixWorld();
  const e = c.matrixWorld.elements;
  if (A.Snd.ear) A.Snd.ear(P.x, P.z, e[0], e[2]);   // «уши» — у машины в повторе, правое — по камере повтора
  if (fwd) {
    for (let i = 0; i < EV.length; i++) { const et = EV[i].t - RT0; if (et >= pt0 && et < PT) fire(EV[i]); }
  }
  if (!A.motor) return;
  if (fwd) {
    const k = AT[0], f = CD[k * FDL + 14];
    MI.dead = !!(f & MF_DEAD); MI.brake = f & MF_BRAKE ? 1 : 0; MI.hand = f & MF_HAND ? 1 : 0; MI.nos = !!(f & MF_NOS); MI.air = !!(f & MF_AIR);
    MI.side = CD[k * FDL + 15];
    A.motor(P.v, !MI.dead && !!(f & (MF_GAS | MF_NOS)), MI, dt);
    MOT = true;
  } else { A.motor(0, false, null, dt); MOT = false; }   // мотор молчит; визг шин и нитро гаснут своим шагом
}

/* ── управление ── */
function togglePlay () { if (PT >= DUR) PT = 0; PLAY = !PLAY; hud(); }
function speed (d) { SPD = Math.max(0, Math.min(RP.SPEEDS.length - 1, SPD + d)); hud(); }
function cam (d) { CAM = (CAM + d + CAMS.length) % CAMS.length; CM.ok = false; CM.anchor = false; hud(); }
function step (d) { PT = Math.max(0, Math.min(DUR, PT + d * RP.STEP)); }

function typing (e) { const el = e.target; return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)); }
function onKey (e) {
  if (!OPEN) {
    if (e.code === 'KeyR' && !e.repeat && !typing(e) && A && A.canOpen(false)) {
      if (open('key')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
    return;
  }
  e.preventDefault(); e.stopImmediatePropagation();
  const c = e.code;
  if (c === 'ArrowLeft' || c === 'KeyA') { HOLD = -1; return; }
  if (c === 'ArrowRight' || c === 'KeyD') { HOLD = 1; return; }
  if (e.repeat) return;
  if (matchKey('back', e) || c === 'KeyR' || c === 'KeyP') close();
  else if (matchKey('ok', e)) togglePlay();
  else if (c === 'ArrowUp' || c === 'KeyW') speed(1);
  else if (c === 'ArrowDown' || c === 'KeyS') speed(-1);
  else if (matchKey('y', e) || c === 'KeyC') cam(1);
  else if (matchKey('x', e)) save();
}
function onKeyUp (e) {
  if (!OPEN) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const c = e.code;
  if ((c === 'ArrowLeft' || c === 'KeyA') && HOLD < 0) HOLD = 0;
  if ((c === 'ArrowRight' || c === 'KeyD') && HOLD > 0) HOLD = 0;
}
/** геймпад (game.js padStep): в езде LB — открыть; в повторе — все кнопки его. true — забрал */
export function pad (p) {
  if (!A) return false;
  if (!OPEN) {
    if (p.pageL && A.canOpen(false)) { p.pageL = false; return open('pad'); }
    return false;
  }
  if (p.menuBack || p.pause || p.pageL) { close(); return true; }
  if (p.accept) togglePlay();
  if (p.btnY) cam(1);
  if (p.btnX) save();
  if (p.menuUp) speed(1);
  if (p.menuDown) speed(-1);
  if (p.menuLeft) step(-1);
  if (p.menuRight) step(1);
  const sx = Math.abs(p.steer) > 0.3 ? p.steer : Math.abs(p.rx) > 0.3 ? p.rx : 0;
  PADH = sx;
  return true;
}

/* ── плашка «ПОВТОР» и подсказки (стиль накладной) ── */
let EL = null;
function ui (show) {
  if (!EL) {
    EL = document.createElement('div');
    EL.className = 'rp-ui';
    EL.innerHTML =
      '<div class="rp-top"><b class="rp-stamp">' + t('повтор') + '</b><span class="rp-info"><em class="rp-cam"></em><em class="rp-spd"></em><em class="rp-rec" hidden>● ' + t('запись') + '</em></span>' +
      '<div class="rp-bar"><i></i></div></div>' +
      '<button type="button" class="rp-msg" hidden></button>' +
      '<nav class="rp-keys">' +
        '<button type="button" data-a="play"></button>' +
        '<button type="button" data-a="rew"><kbd class="pp-key pp-key-kb rp-ar">←</kbd>' + t('−1 с') + '</button>' +
        '<button type="button" data-a="fwd"><kbd class="pp-key pp-key-kb rp-ar">→</kbd>' + t('+1 с') + '</button>' +
        '<button type="button" data-a="spd"></button>' +
        '<button type="button" data-a="cam"></button>' +
        '<button type="button" data-a="save"></button>' +
        '<button type="button" data-a="exit">' + keyHTML('back') + t('назад в игру') + '</button>' +
      '</nav>';
    EL.addEventListener('click', e => {
      const b = e.target && e.target.closest && e.target.closest('button');
      if (!b || !OPEN) return;
      const a = b.dataset.a;
      if (a === 'play') togglePlay(); else if (a === 'rew') step(-1); else if (a === 'fwd') step(1);
      else if (a === 'spd') { SPD = (SPD + 1) % RP.SPEEDS.length; hud(); } else if (a === 'cam') cam(1);
      else if (a === 'save') save(); else if (a === 'exit') close();
      else if (b.classList.contains('rp-msg') && b.dataset.path && window.birdSteam && window.birdSteam.showVideo) window.birdSteam.showVideo(b.dataset.path);
    });
    document.body.appendChild(EL);
  }
  EL.classList.toggle('on', !!show);
  if (show) { hud(); refreshKeys(EL); }
}
const spdTxt = k => (k === 0.25 ? t('×0,25') : k === 0.5 ? t('×0,5') : t('×1'));
function hud () {
  if (!EL) return;
  const q = s => EL.querySelector(s);
  q('.rp-cam').textContent = t('камера') + ': ' + t(CAMS[CAM].label);
  q('.rp-spd').textContent = spdTxt(RP.SPEEDS[SPD]);
  q('.rp-rec').hidden = !REC;
  q('[data-a="play"]').innerHTML = keyHTML('ok') + (PLAY ? t('пауза') : t('играть'));
  q('[data-a="spd"]').innerHTML = '<kbd class="pp-key pp-key-kb rp-ar">↑↓</kbd>' + spdTxt(RP.SPEEDS[SPD]);
  q('[data-a="cam"]').innerHTML = keyHTML('y') + t('камера');
  q('[data-a="save"]').innerHTML = keyHTML('x') + (REC ? t('стоп запись') : t('сохранить ролик'));
  EL.classList.toggle('rec', !!REC);
  refreshKeys(EL);
}
let BAR_W = -1;
function bar () {
  if (!EL) return;
  const w = Math.round((DUR > 0 ? PT / DUR : 0) * 200) / 2;
  if (w !== BAR_W) { BAR_W = w; EL.querySelector('.rp-bar > i').style.width = w + '%'; }
}
let msgT = 0;
function msg (text, path) {
  if (!EL) return;
  const m = EL.querySelector('.rp-msg');
  m.textContent = text; m.hidden = false;
  if (path) m.dataset.path = path; else delete m.dataset.path;
  m.classList.toggle('link', !!(path && window.birdSteam && window.birdSteam.showVideo));
  clearTimeout(msgT);
  msgT = setTimeout(() => { m.hidden = true; }, 7000);
}

/* ── ролик: запись холста ── */
let REC = null, CHUNKS = [], STREAM = null, CANCEL = false, AUD = null, REC_MS = 0;
const MIME = aud => {
  if (typeof MediaRecorder === 'undefined') return '';
  const L = aud ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const m of L) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* — */ } }
  return '';
};
/* звук ролика: шины «звуки», «мотор», «музыка» → свой регулятор → дорожка. Динамики — как были (общий регулятор
   Snd.main не трогаем). Звук выключен, ?mute, площадка заглушила, контекст спит — null (ролик без звука) */
function audioOn () {
  const S = A.Snd, c = S && S.ctx;
  if (!c || !c.createMediaStreamDestination) return null;
  if (!DEBUG.forceAudio && (S.hard || !S.on || S.muted)) return null;
  if (c.state !== 'running') return null;
  const buses = [S.sfxBus, S.engBus, S.musicBus].filter(Boolean);
  if (!buses.length) return null;
  try {
    const g = c.createGain(), d = c.createMediaStreamDestination();
    g.gain.value = RP.REC_GAIN;
    for (const b of buses) b.connect(g);
    g.connect(d);
    AUD = { g, d, buses };
    return d.stream.getAudioTracks()[0] || null;
  } catch (e) { audioOff(); return null; }
}
function audioOff () {
  if (!AUD) return;
  for (const b of AUD.buses) { try { b.disconnect(AUD.g); } catch (e) { /* — */ } }
  try { AUD.g.disconnect(); } catch (e) { /* — */ }
  AUD = null;
}
function save () {
  if (REC) { stopRec(true); msg(t('запись отменена')); return; }
  const cv = A.canvas;
  if (!cv || !cv.captureStream || !MIME(false)) { msg(t('тут ролик не записать: браузер не умеет')); return; }
  let mime = '';
  try {
    STREAM = cv.captureStream(RP.REC_FPS);
    const at = MIME(true) ? audioOn() : null;
    if (at) { STREAM = new MediaStream([...STREAM.getVideoTracks(), at]); mime = MIME(true); } else { audioOff(); mime = MIME(false); }
    const o = { mimeType: mime, videoBitsPerSecond: RP.REC_BPS };
    if (at) o.audioBitsPerSecond = RP.REC_ABPS;
    REC = new MediaRecorder(STREAM, o);
  } catch (e) {
    REC = null; audioOff();
    if (STREAM) { for (const tr of STREAM.getTracks()) tr.stop(); STREAM = null; }
    msg(t('тут ролик не записать: браузер не умеет')); return;
  }
  STATS.audio = !!AUD;
  CHUNKS = []; CANCEL = false;
  const r = REC;
  r.ondataavailable = e => { if (e.data && e.data.size) CHUNKS.push(e.data); };
  r.onstop = () => { const parts = CHUNKS; CHUNKS = []; if (!CANCEL) done(new Blob(parts, { type: mime.split(';')[0] }), mime, REC_MS); };
  PT = 0; PLAY = true; LASTPT = -1;
  r.start(500);
  STATS.recStart = performance.now();
  hud();
}
function stopRec (cancel) {
  const r = REC;
  if (!r) return;
  REC = null; CANCEL = !!cancel;
  REC_MS = performance.now() - (STATS.recStart || 0);
  try { r.stop(); } catch (e) { /* — */ }
  if (STREAM) { for (const tr of STREAM.getTracks()) tr.stop(); STREAM = null; }
  audioOff();
  hud();
}
function stamp () {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '_' + z(d.getHours()) + '-' + z(d.getMinutes()) + '-' + z(d.getSeconds());
}
async function done (blob, mime, ms) {
  STATS.lastMs = performance.now() - (STATS.recStart || 0);
  if (/webm/.test(mime)) { const b = await fixDuration(blob, ms); STATS.lastDurMs = b !== blob ? Math.round(ms) : 0; blob = b; }   // длительность — в заголовок
  STATS.lastSize = blob.size;
  const name = 'bird-pizza_' + stamp() + (/mp4/.test(mime) ? '.mp4' : '.webm');
  if (DEBUG.sink) { DEBUG.sink(blob, name); return; }
  const B = typeof window !== 'undefined' && window.birdSteam;
  try {
    if (B && B.saveVideo) {
      const path = await B.saveVideo(new Uint8Array(await blob.arrayBuffer()), t('Птица Пицца'), name);
      if (!path) throw new Error('save');
      STATS.saved++; STATS.lastPath = path;
      msg(t('ролик сохранён: {p}', { p: path }), path);
    } else {
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      STATS.saved++; STATS.lastPath = name;
      msg(t('ролик сохранён: {p}', { p: t('загрузки') + ' / ' + name }));
    }
    if (A.Snd && A.Snd.fx) A.Snd.fx('clip-saved', s => { s.blip(660, 0.08, 'square', 0.08); setTimeout(() => s.blip(990, 0.12, 'square', 0.08), 90); });
  } catch (e) { msg(t('не вышло сохранить ролик')); }
}

/* ── сильный удар: короткое замедление, тряска, «вуух» ── */
let SLOW_T = 0, SLOW_AT = -1e9;
export function crash (vn) {
  if (A && !OPEN && vn >= RP.HIT_V) HIT = true;
  if (!A || OPEN || !(vn >= RP.SLOW.V)) return;
  if (A.GFX && A.GFX.fxLow && A.GFX.fxLow()) return;   // «эффекты: меньше» — без замедления и тряски
  const now = performance.now() / 1000;
  if (now - SLOW_AT < RP.SLOW.GAP) return;
  SLOW_AT = now;
  if (A.shake) A.shake(RP.SLOW.SHAKE);
  if (!RP.SLOW.ON) return;                        // без замедления и «вуух» — только тряска
  SLOW_T = RP.SLOW.SECS;
  STATS.slow++;
  if (A.Snd && A.Snd.fx) A.Snd.fx('slowmo', s => {
    const c = s.ctx, o = c.createOscillator(), g = c.createGain(), now2 = c.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(170, now2); o.frequency.exponentialRampToValueAtTime(42, now2 + 0.55);
    g.gain.setValueAtTime(0.0001, now2); g.gain.exponentialRampToValueAtTime(0.32, now2 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, now2 + 0.6);
    o.connect(g); g.connect(s.out); o.start(now2); o.stop(now2 + 0.62);
    s.noise(0.35, 0.06);
  });
}
/** множитель времени мира в этом кадре: после сильного удара — RP.SLOW.K, к концу плавно к 1 */
export function slowK (raw) {
  if (SLOW_T <= 0) return 1;
  SLOW_T -= Math.min(Math.max(raw, 0), 0.05);
  const k = RP.SLOW.K, e = RP.SLOW.EASE;
  if (SLOW_T <= 0) return 1;
  return SLOW_T < e ? k + (1 - k) * (1 - SLOW_T / e) : k;
}

export const DEBUG = {
  RP, STATS, EV, open, close, can, length, slowK, crash, sink: null,
  forceAudio: false,      // проверки: звук в ролик и при ?mute (динамики молчат — общий регулятор игры на нуле)
  get on () { return OPEN; }, get pt () { return PT; }, get dur () { return DUR; }, get cam () { return CAMS[CAM].id; }, get speed () { return RP.SPEEDS[SPD]; },
  get play () { return PLAY; }, get rec () { return !!REC; }, get frames () { return FN - F0; }, get slow () { return SLOW_T; },
  set pt (v) { PT = +v || 0; }, setCam (i) { CAM = i % CAMS.length; CM.ok = false; CM.anchor = false; hud(); }, setSpeed (i) { SPD = i; hud(); }, togglePlay, save, stopRec,
  mem: () => ({ ringMB: +((ED.byteLength + EID.byteLength + FD.byteLength + FS.byteLength + FC.byteLength) / 1048576).toFixed(2), objs: IDX.size }),
};
