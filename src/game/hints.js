/* ─────────────── Подсказки первой смены («учить делом») ───────────────
   docs/CAREER.md «Первая минута: подсказки делом» (08.10.2026, IDEAS № 9 и Е0а).
   Вместо стопки окон (вступление-катсцена, гайд «как ехать», карточка «кофе-нитро» на паузе) —
   одна строка внизу экрана, игра не останавливается. Каждая подсказка — один раз за всё время
   (ключ 'dlv-hints', «сбросить прогресс» стирает) и тогда, когда понадобилась:

     drive  — руль в руках (принял первый заказ): газ, руль, тормоз — тем, чем играешь;
              уходит, когда проехал 30 м (не раньше 3 с) или через 20 с;
     map    — сразу за «drive» (или раньше, если 3 с едешь от цели): точка на радаре и карта
              района; радар подсвечен. Всегда раньше «кофе» и «тормоза» (UI-REVIEW № 25);
     brake  — первый раз ближе 40 м к гостю быстрее 25 км/ч: «притормози — пицца отдастся сама»;
     nitro  — первая длинная прямая: быстрее 36 км/ч, 1,2 с почти не крутишь руль, в баке кофе
              (больше 20 %), и про радар уже сказали; или первый подобранный кофе. Уходит, как
              только нажал кофе;
     hp     — первый удар, который снял сердце: сердца подсвечены;
     cash   — первые деньги за смену (карьера): после чека оплаты и денег в пачку;
     wallet — сразу за «cash»: копилка — все твои деньги, пачка ссыпается в неё в конце смены;
     respect — первый респект (карьера): что такое звезда; звезда подсвечена;
     bump   — первый раз задел своего клиента (карьера): без чаевых, а быстрее 43 км/ч — заказ сорван;
     back   — первый раз опоздал обратно в пиццерию (карьера, game.js backLate): «вернуться до» — тоже срок.
   «respect», «bump» и «back» видят и ветераны — это правила, о которых раньше не говорили.

   Очередь вручения (ridequeue.js, UI-REVIEW № 41): пока на экране чек оплаты, деньги летят в пачку
   или только что написал Толик (RQ.busy) — подсказка спрятана, её время стоит, новая не открывается.
   Пока подсказка на экране — RQ.mark('hint'): достижение ждёт её.

   Подсказка висит не меньше, чем её прочитать (readTime, dialog.js), следующая ждёт, пока
   уйдёт текущая (+0,6 с). «hp» и кофе — срочные: сменяют текущую, та встаёт в очередь.
   Пока игра не идёт (пауза, меню, накладная, конец смены) — строка спрятана, отсчёт стоит.
   Кто уже отвёз учебный заказ Степана до этой версии ('dlv-msk-tut'), подсказок не видит.

   Плюс первый смешной момент — stepan(ped): Степан получил пиццу, предлагает вложиться в его
   бизнес и выдувает облако прямо на машину, курьер кашляет. С 10.10.2026 это внутри катсцены вручения
   (stepafirst.js); stepan(ped) — запасной, если сцена не вышла. Пока идёт катсцена, строка подсказки
   спрятана (hints.css body.story-cut), её очередь ждёт.

     HINTS.init(api)    — один раз из game.js
     HINTS.step(dt)     — каждый кадр
     HINTS.coffee()     — подобрал кофе; true — показали подсказку (тост «кофе +» не нужен)
     HINTS.stepan(ped)  — отдал учебный заказ
   api: S, V, NOS, Store, Snd, ADULT, CAREER, sayBubble, puff, toast, money (₽ строкой) */
import './hints.css';
import { t } from '../i18n/index.js';
import { readTime } from './dialog.js';
import * as RQ from './ridequeue.js';
import { CLIENT_HIT } from './econ.js';

const KEY = 'dlv-hints';
const PLAY = ['drive', 'back', 'side', 'loading', 'handover'];
const GAP = 0.6;
const ALL = ['drive', 'map', 'brake', 'nitro', 'hp', 'cash', 'wallet'];

let A = null, EL = null, TXT = null;
const H = {
  seen: new Set(), cur: null, t: 0, shown: 0, gap: 0, queue: [], hiEl: null,
  driveAt: null, mapT: -1, away: 0, lastD: 0, straight: 0, lastH: 0, lastHp: null, lastMoney: null, cashT: -1, burn: 0,
};

const isPad = () => document.body.classList.contains('pad');
const isTouch = () => !isPad() && document.body.classList.contains('touch');
const k = (...ks) => ks.map(x => '<kbd>' + x + '</kbd>').join('');

export function init (api) {
  A = api;
  readSeen();
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.HINTS = DEBUG; }, 0);
}
function readSeen () {
  const raw = String(A.Store.get(KEY, '') || '');
  for (const id of raw.split(',')) if (id) H.seen.add(id);
  // ветеран: учебный заказ отвезён до подсказок — ничего не показываем
  if (A.Store.get('dlv-msk-tut', 0) || new URLSearchParams(location.search).has('sandbox')) for (const id of ALL) H.seen.add(id);
}
/** сменили профиль без перезагрузки (game.js reprofile): что видел — заново из сохранения нового профиля */
export function reload () {
  if (!A) return;
  if (H.hiEl) H.hiEl.classList.remove('hn-hi');
  if (EL) EL.classList.remove('on');
  Object.assign(H, { cur: null, t: 0, shown: 0, gap: 0, queue: [], hiEl: null, driveAt: null, mapT: -1, away: 0, lastD: 0, straight: 0, lastH: 0, lastHp: null, lastMoney: null, cashT: -1, burn: 0 });
  H.seen.clear();
  readSeen();
}
const need = id => !H.seen.has(id) && !(H.cur && H.cur.id === id) && !H.queue.some(h => h.id === id);

/* текст и что подсветить */
function make (id, extra) {
  const pad = isPad(), touch = isTouch();
  switch (id) {
    case 'drive': return { text: pad ? t('{gas} газ · {steer} руль · {brake} тормоз', { gas: k('RT'), steer: k(t('стик')), brake: k('LT') })
      : touch ? t('{steer} руль · справа — газ и тормоз', { steer: k('◀', '▶') })
        : t('{gas} газ · {steer} руль · {brake} тормоз · {hand} ручник', { gas: k('W'), steer: k('A', 'D'), brake: k('S'), hand: k(t('пробел')) }) };
    case 'map': return { hi: '#radar', text: pad ? t('куда везти — точка на радаре · {key} — карта района', { key: k('Y') })
      : touch ? t('куда везти — точка на радаре · тык в радар — карта района')
        : t('куда везти — точка на радаре · {key} — карта района', { key: k('Tab') }) };
    case 'brake': return { text: t('у гостя притормози — пицца отдастся сама') };
    case 'nitro': {
      const key = pad ? k('A') : touch ? k(t('кофе')) : k('Shift');
      return { hi: touch ? '#touchpad .tp-nos' : '#radar', text: extra === 'coffee' ? t('кофе в баке! нажми {key} и полетишь на кофейной тяге', { key })
        : t('прямая! нажми {key} и полетишь на кофейной тяге', { key }) };
    }
    case 'hp': return { hi: '#hearts', text: t('сердца — жизни тачки: врезался — минус сердце, легонько — половинка') };
    case 'cash': return { hi: '#shiftcash', text: t('зелёная пачка — заработано за смену') };
    case 'wallet': return { hi: '#money', text: t('копилка — все твои деньги: в конце смены пачка ссыпается в неё') };
    case 'respect': return { hi: '#respect', text: t('звезда — респект района: за конкурентов, похитителя и помощь своим. копишь — растёт звание') };
    case 'back': return { hi: '#timewrap', text: t('«вернуться до» — тоже срок: опоздал обратно в пиццерию — штраф {sum}', { sum: extra || '' }) };
    case 'bump': return { text: t('задел клиента — без чаевых; быстрее {kmh} км/ч — заказ сорван', { kmh: Math.round(CLIENT_HIT.HARD * 3.6) }) };
  }
  return null;
}

function ui () {
  if (EL) return EL;
  EL = document.createElement('div');
  EL.id = 'hint';
  EL.innerHTML = '<span></span>';
  TXT = EL.firstChild;
  (document.getElementById('game') || document.body).appendChild(EL);
  return EL;
}
function seen (id) {
  H.seen.add(id);
  A.Store.set(KEY, [...H.seen].join(','));
}
function highlight (sel) {
  if (H.hiEl) H.hiEl.classList.remove('hn-hi');
  H.hiEl = sel ? document.querySelector(sel) : null;
  if (H.hiEl) H.hiEl.classList.add('hn-hi');
}
function open (h) {
  ui();
  RQ.mark('hint', true);
  H.cur = h; H.t = 0; H.shown = 0;
  TXT.innerHTML = h.text;
  seen(h.id);
  highlight(h.hi);
  EL.classList.remove('on'); void EL.offsetWidth;
}
function close () {
  if (!H.cur) return;
  const id = H.cur.id;
  H.cur = null; H.gap = GAP;
  RQ.mark('hint', false);
  highlight(null);
  if (EL) EL.classList.remove('on');
  if (id === 'drive' && need('map')) { const h = make('map'); H.queue.unshift(Object.assign({ id: 'map', min: Math.max(3, readTime(h.text.replace(/<[^>]+>/g, ''))) }, h)); }   // радар — сразу следом
  if (id === 'cash' && need('wallet')) push('wallet');
}
/* в очередь; urgent — сменить текущую (она — первой в очередь, если её почти не видели) */
function push (id, extra, urgent) {
  if (!need(id)) return false;
  const h = Object.assign({ id, min: 0 }, make(id, extra));
  h.min = Math.max(3, readTime(h.text.replace(/<[^>]+>/g, '')));
  if (urgent && H.cur) {
    const was = H.cur;
    if (H.shown < 2) { H.seen.delete(was.id); H.queue.unshift(was); }
    highlight(null); H.cur = null; H.gap = 0;
    open(h);
    return true;
  }
  if (!H.cur && H.gap <= 0 && !RQ.busy()) open(h); else H.queue.push(h);
  return true;
}

/** первый респект (game.js RESPECT.onChange) */
export function respect () { if (A && A.CAREER) push('respect'); }
/** первый раз задел своего клиента (game.js clientBump) */
export function bump () { if (A && A.CAREER) push('bump'); }
/** первый раз опоздал обратно в пиццерию (game.js backLate); fine — штраф в ₽, как видит игрок */
export function backLate (fine) { if (A && A.CAREER) push('back', A.money ? A.money(fine) : fine + ' ₽'); }

export function coffee () {
  if (!A || !need('nitro')) return false;
  return push('nitro', 'coffee', true);
}

/* когда текущая уходит сама */
function done (h, dt) {
  const S = A.S, V = A.V;
  if (h.id === 'drive') {
    if (H.driveAt) { const m = Math.hypot(V.x - H.driveAt.x, V.z - H.driveAt.z); if (m > 30 && H.t > 3) return true; }
    return H.t > 20;
  }
  if (h.id === 'nitro') {
    H.burn = A.NOS().burn ? H.burn + dt : 0;
    if (H.burn > 0.6 && H.t > 1.5) return true;
    return H.t > h.min + 4;
  }
  if (h.id === 'brake') return S.state !== 'drive' ? H.t > 1.5 : H.t > h.min + 3;
  return H.t > h.min + 1;
}

export function step (dt) {
  if (!A) return;
  const S = A.S, V = A.V;
  const live = !S.paused && PLAY.includes(S.state) && !S.ride;
  const wait = RQ.busy();                          // чек оплаты, деньги в пачку, Толик — подсказка ждёт (ridequeue.js)
  if (EL) EL.classList.toggle('on', !!(H.cur && live && !wait));
  RQ.mark('hint', !!(H.cur && live && !wait));      // достижение ждёт, пока подсказка на экране; следующая — после него (RQ.hold)
  if (!live) {
    if (H.hiEl) H.hiEl.classList.remove('hn-hi');
    if (S.state === 'title' || S.state === 'over') { H.driveAt = null; H.lastHp = null; H.lastMoney = null; }
    return;
  }
  const v = Math.hypot(V.vx, V.vz);

  // ── что понадобилось ──
  if (S.state === 'drive' && !H.driveAt) { H.driveAt = { x: V.x, z: V.z }; push('drive'); }
  if (S.target && (S.state === 'drive' || S.state === 'back')) {
    const d = Math.hypot(S.target.x - V.x, S.target.z - V.z);
    H.away = d > H.lastD + 0.02 && v > 3 ? H.away + dt : Math.max(0, H.away - dt);
    H.lastD = d;
    if (H.away > 3 && H.driveAt && need('map')) push('map');
    if (S.state === 'drive' && d < 40 && v > 7) push('brake');
  }
  // прямая: быстро и руль почти не крутишь
  let dh = V.h - H.lastH; H.lastH = V.h;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const nos = A.NOS();
  H.straight = v > 10 && Math.abs(dh) < 0.12 * dt && !nos.burn ? H.straight + dt : 0;
  if (H.straight > 1.2 && nos.tank > 0.2 && need('nitro') && H.driveAt && H.seen.has('map')) push('nitro');
  // первый удар: сердце убыло
  if (H.lastHp !== null && S.hp < H.lastHp && S.hp > 0) push('hp', null, true);
  H.lastHp = S.hp;
  // первые деньги за смену — в очередь: откроется, когда чек и деньги в пачку уйдут (RQ.busy)
  if (A.CAREER) {
    if (H.lastMoney !== null && S.money > H.lastMoney) push('cash');
    H.lastMoney = S.money;
  }

  // ── показ ──
  if (wait) {                                      // занято (чек, деньги, Толик): текущая — обратно в очередь, покажется заново целиком
    if (H.cur) { const was = H.cur; highlight(null); H.cur = null; H.gap = GAP; if (was.id !== 'brake') H.queue.unshift(was); }
    return;
  }
  if (H.cur) {
    H.t += dt; H.shown += dt;
    if (H.hiEl) H.hiEl.classList.toggle('hn-hi', H.t % 0.7 < 0.4);   // мигает: класс туда-сюда
    if (done(H.cur, dt)) close();
  } else if ((H.gap -= dt) <= 0 && H.queue.length) {
    const h = H.queue.shift();
    if (h.id === 'brake' && S.state !== 'drive') H.seen.delete('brake');   // гость уже позади — «притормози» в другой раз
    else open(h);
  }
}

/* ── первый смешной момент: Степан забрал пиццу ── */
export function stepan (ped) {
  if (!A || !ped || !ped.grp) return;
  const S = A.S, V = A.V;
  const live = () => !ped.dead && ped.grp.parent && PLAY.includes(S.state);
  setTimeout(() => {
    if (!live()) return;
    const b = A.sayBubble(ped.grp, t('Брат, вложишься в мой бизнес?'), '#7a4cc2');
    setTimeout(() => { ped.grp.remove(b); if (b.material) b.material.dispose(); }, 3600);
  }, 1100);
  // облако — прямо на машину
  setTimeout(() => {
    if (!live()) return;
    for (let i = 0; i < 14; i++) {
      setTimeout(() => {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
        A.puff(V.x + Math.cos(a) * r, 0.6 + Math.random() * 0.8, V.z + Math.sin(a) * r, false, 0.9 + Math.random() * 0.6);
      }, i * 60);
    }
    const Snd = A.Snd;
    [250, 750, 1300].forEach(ms => setTimeout(() => { if (Snd && Snd.fx) Snd.fx('engine-cough', s => { s.noise(0.12, 0.22); s.blip(80 + Math.random() * 30, 0.14, 'sawtooth', 0.16); }, { eng: 1 }); }, ms));
    setTimeout(() => A.toast(t('кхе-кхе… в другой раз')), 500);
  }, 2600);
}

const DEBUG = { H, push, close, get cur () { return H.cur && H.cur.id; } };
