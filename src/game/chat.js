/* Чат управляющего: «Толик управляющий» пишет справа сверху, как в iMessage —
   аватарка, имя, пузырь. Сначала 0,5 с «печатает…» (три точки), потом текст.
   Текст приходит крупно **на своём месте** (не по центру): «бам» — строка раздувается от своего
   правого верхнего угла влево-вниз (×1,8, не вылезая за экран, с отскоком и звуком), держится 1,2 с
   + 1 с на 150 букв (не дольше 2 с) и за 0,45 с уменьшается до обычной. Пришло новое — прежнее
   крупное сразу уменьшается. prefers-reduced-motion — без увеличения, просто появляется.
   Видно сразу не больше трёх сообщений (четвёртое выталкивает самое старое; не влезают по высоте — чат шире,
   потом уходят старые, последнее видно целиком — fit),
   каждое висит (после крупного) 4 с + 1 с на каждые 25 букв (не дольше 8 с) и уезжает вправо.
   Текст пришёл — аватарка Толика говорит ртом (talkface.js): ~14 букв в секунду, 0,7—2,6 с.
   Ввод не перехватывает. Место — под колонкой хада справа (кошелёк, часы смены,
   «закончить смену», на телефоне — радар и кнопки); не влезает по высоте — слева от неё.
   Телефон (Р12, PH ниже): узкая колонка под мини-карточкой, слева от радара, над педалями; имя с должностью в пузыре
   одной строкой («Толик, управляющий: …»),
   не больше 2 сообщений, «крупно» — ×1,12 на 0,3 с, едешь — прочитанные полупрозрачные.
   Пишет только на плохое и на очень хорошее, обычные доставки — молча.
   Что и когда пишет — docs/ORDERS.md «Толик управляющий».

   Из game.js:
     CHAT.init({ face, person, adult, blip, speed }) — face(person, size) → картинка; adult — взрослая версия (мат);
                                            speed() — скорость машины, м/с; CHAT.phone() — телефонный вид чата
                                            blip(f, d, type, v) — звук (Snd.blip); fx — Snd.fx (файлы chat / chat-angry)
     CHAT.react(kind, onShow?)            — kind: 'fast' | 'late' | 'bump' | 'kill' | 'bundle' | 'urgent' | 'back';
                                            onShow() — в момент, когда текст появился (списание денег)
     CHAT.say(text, onShow?, angry?, who?, o?) — своё сообщение (в общую очередь уведомлений, notifyq.js — ниже SLOT);
                                            o.key — такое же уже ждёт — не ставить; who.rank — фраза про рейтинг (самая неважная);
                                            who = { name, person, role } — пишет не Толик, а он
                                            (коллеги в чате пиццерии — рейтинг смены, crewrank.js); подпись — с
                                            должностью: «Серёга · курьер» / «Толик · управляющий», телефон — «Серёга, курьер:»
     CHAT.clear()                         — убрать всё (конец смены, меню)
     CHAT.later(ms, fn)                   — отложенное сообщение; пока не вышло — чат «занят»
     CHAT.busy() / CHAT.idle(cb, max)     — есть ли отложенное, «печатает…» или крупное; cb — когда всё
                                            показано и уменьшилось (не дольше max мс) — конец смены ждёт
     CHAT.waiting()                       — идёт idle(): отложенная похвала всё равно показывается
     CHAT.talking()                       — печатает или крупное сообщение (музыка тише, music.js)
   Из shiftend.js (экран Толика в конце смены):
     CHAT.avatar(size)                    — его лицо картинкой ('' — нет); CHAT.person() — он сам (диалог обеда)
     CHAT.shiftLine(mood)                 — что он пишет после смены: mood 'bad' | 'ok' | 'great' */
import './chat.css';                  // вид iMessage: круглая аватарка, серые пузыри лентой (и для shiftend.js, cityopen.js, DLG.line)
import { t, N_ } from '../i18n/index.js';
import * as TF from './talkface.js';  // аватарка говорит ртом, когда сообщение пришло
import * as NQ from './notifyq.js';  // одно уведомление за раз: сообщение ждёт своей очереди (notifyq.js)

/* Место в общей очереди уведомлений (notifyq.js, автор 18.10.2026: «одно уведомление за раз»): новое сообщение
   ждёт, пока уйдёт то, что на экране (чек оплаты, тост, подсказка…), и держит экран «печатает…» + прочитать:
   1,5 с + 0,045 с на букву, не меньше 2,5 и не больше 5,5 с (и не меньше, чем оно крупно). Толик — важность «менеджер»
   (после чека оплаты, до рейтинга и достижений), ждёт до BOSS_WAIT с; коллеги и Толик про рейтинг (who.rank) — самые
   неважные: ждут до CREW_WAIT с, в очереди — не больше одного (новое вытесняет старое), Толик пришёл — их ждущее
   выбрасывается. Одинаковые реакции (react: две похвалы, два опоздания) не копятся — вторая не ставится (вычет — всё равно).
   Перебило срочное или чек оплаты в первые FRESH с — сообщение уходит из ленты и придёт заново целиком; позже — остаётся мелко */
export const SLOT = { MIN: 2.5, BASE: 1.5, PER: 0.045, MAX: 5.5, BOSS_WAIT: 45, CREW_WAIT: 12, FRESH: 2.1 };
let QN = 0;                                              // ждут в очереди (busy — конец смены их подождёт)

const TYPE_S = 0.5, MAX = 3;
const hold = s => Math.min(8, 4 + s.length / 25);
/* крупно: во сколько раз, сколько держится, выскок и уменьшение (мс) */
const BIG = { S: 1.8, MIN: 1.2, PER: 150, MAX: 2, IN: 380, OUT: 450 };
/* телефон (касания, высота ≤ 500 или ширина ≤ 900 px; ревью 17.10, Р12): чат — узкой колонкой под мини-карточкой
   заказа, слева от радара, над педалями (не на педалях, руле, радаре и сердцах); сообщения в одну строку с именем
   («Олег: …»), видно не больше 2; «крупно» — чуть-чуть (×1,12) и на долю секунды; едешь (быстрее DRIVE м/с) —
   сообщение через FRESH с после прихода полупрозрачное (72 %, chat.css .ph-drive) */
export const PH = { MAX: 2, W: 240, BIG_S: 1.12, BIG_HOLD: 0.3, DRIVE: 4, FRESH: 1.5 };
const bigHold = s => (C.ph ? PH.BIG_HOLD : Math.min(BIG.MAX, BIG.MIN + s.length / BIG.PER));
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* фразы: общие и взрослые/детские (мат — только во взрослой) */
const LINES = {
  fast: /*i18n*/ [N_('Быстро доставил. Молодец, Женя.'), N_('Клиент доволен. Продолжай так же.')],
  bundle: /*i18n*/ [N_('Все адреса в срок. Молодец.'), N_('Развоз закрыт. Проверь коробки перед следующим.')],
};
const ADULT_LINES = {
  late: /*i18n*/ [N_('Пицца остыла. Клиент недоволен, замену вычтем из зарплаты.')],
  bump: /*i18n*/ [N_('Женя, ты задел клиента машиной. В следующий раз осторожнее.')],
  kill: /*i18n*/ [N_('Ты сбил клиента?! Сейчас разберёмся со штрафом.')],
  urgent: /*i18n*/ [N_('Срочный заказ сорван. Штраф уже начислен.')],
  back: /*i18n*/ [N_('Женя, возвращайся в пиццерию. Заказ уже ждёт.')],
};
const KIDS_LINES = ADULT_LINES;

const C = { el: null, face: null, person: null, adult: false, blip: null, fx: null, speed: null, items: [], last: {}, wait: 0, pl: 0, ph: false, bot: 0 };
const PEND = new Set();                                  // отложенные сообщения (later)
const ANGRY = new Set(['late', 'bump', 'kill', 'urgent', 'back']);

/* speed() — скорость машины, м/с (на телефоне едешь — старые сообщения прозрачнее) */
export function init ({ face, person, adult, blip, fx, speed }) {
  C.face = face; C.person = person; C.adult = !!adult; C.blip = blip || null; C.fx = fx || null; C.speed = speed || null;
}
/* телефон: касания и низкий (боком) или узкий экран. Дека, компьютер, планшет боком — как было */
export const phone = () => document.body.classList.contains('touch') && (innerHeight <= 500 || innerWidth <= 900);

/* звук «пришло сообщение»: два коротких тона, ругань — ниже */
function ding (angry) {
  const f = angry ? [620, 470] : [1320, 1760];
  const synth = s => f.forEach((x, i) => setTimeout(() => { try { s.blip(x, 0.12, 'triangle', 0.13); } catch (e) { /* — */ } }, i * 95));
  if (C.fx) { try { C.fx(angry ? 'chat-angry' : 'chat', synth); } catch (e) { /* — */ } return; }
  if (C.blip) synth({ blip: C.blip });
}

/* где пузырь крупно: на своём месте — строка раздувается от правого верхнего угла своего содержимого
   (аватарка + пузырь) влево и вниз; не больше BIG.S, не за левый и нижний край экрана */
function bigTf (m) {
  const row = m.el, b = row.querySelector('.cm-b'), c = C.el.getBoundingClientRect();
  const x0 = row.offsetLeft, x1 = b ? b.offsetLeft + b.offsetWidth : x0 + row.offsetWidth;
  const cw = Math.max(1, x1 - x0), h = Math.max(1, row.offsetHeight);
  const s = Math.max(1, Math.min(C.ph ? PH.BIG_S : BIG.S, (c.left + x1 - 10) / cw, (innerHeight - 10 - c.top - row.offsetTop) / h));
  return { origin: cw.toFixed(1) + 'px 0px', s, dx: 0, dy: 0 };
}
const tf = (g, k) => 'translate(' + (g.dx * k).toFixed(1) + 'px, ' + (g.dy * k).toFixed(1) + 'px) scale(' + (1 + (g.s - 1) * k).toFixed(3) + ')';

function grow (m) {
  if (!m.el.animate || calm()) return false;
  for (const o of C.items) if (o !== m && o.big) shrink(o);
  const g = bigTf(m);
  m.el.style.transformOrigin = g.origin;
  m.el.classList.add('big');
  m.big = true;
  m.anim = m.el.animate([
    { transform: 'none', opacity: 0.6 },
    { transform: tf(g, 1.06), opacity: 1, offset: 0.62 },
    { transform: tf(g, 0.97), offset: 0.82 },
    { transform: tf(g, 1) },
  ], { duration: BIG.IN, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards' });
  return true;
}
function shrink (m) {
  if (!m.big) return;
  m.big = false;
  clearTimeout(m.t3);
  const a = m.anim, from = getComputedStyle(m.el).transform;
  m.anim = m.el.animate([{ transform: from === 'none' ? 'none' : from }, { transform: 'none' }],
    { duration: BIG.OUT, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' });
  if (a) a.cancel();
  const done = m.anim;
  done.onfinish = () => { if (m.anim === done) { m.el.classList.remove('big'); done.cancel(); m.anim = null; } };
}

function box () {
  if (C.el) return C.el;
  const el = document.createElement('div');
  el.id = 'chat';
  document.body.appendChild(el);
  C.el = el;
  addEventListener('resize', place);
  return el;
}

/* под колонкой хада справа; не влезает — слева от неё */
function place () {
  if (!C.el) return;
  const W = innerWidth, H = innerHeight;
  C.ph = phone();
  C.el.classList.toggle('ph', C.ph);
  if (C.ph) { placePhone(W, H); return; }
  C.bot = H - 6;
  const ids = ['hud-right', 'cr-clock'].concat(document.body.classList.contains('touch') ? ['radar', 'ctrls'] : []);
  let top = 1e9, bottom = 0, left = W, right = 0;
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e || e.hidden) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.right < W / 2) continue;
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); left = Math.min(left, r.left); right = Math.max(right, r.right);
  }
  if (!right) { top = bottom = 10; left = right = W - 10; }
  const below = H - bottom > Math.min(260, H * 0.42);
  C.el.style.top = Math.round(below ? bottom + 8 : top) + 'px';
  C.el.style.right = Math.round(below ? Math.max(10, W - right) : W - left + 8) + 'px';
  C.el.style.width = Math.round(Math.max(150, Math.min(270, (below ? W : left) - 24))) + 'px';
  fit(H);
}

/* видимый прямоугольник элемента (нет, спрятан, прозрачный — null) */
function rectOf (sel) {
  const e = document.querySelector(sel);
  if (!e || e.hidden) return null;
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const cs = getComputedStyle(e);
  if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
  return r;
}

/* телефон (Р12): узкая колонка в свободном месте справа — под мини-карточкой заказа (#otags), слева от радара и
   паузы, над педалями (#tp-right); левее середины экрана не заходит (там машина и сердца). Тост, подсказка,
   реплика Толика на ходу и грамота сверху по центру — колонка уходит под них, пока они видны */
function placePhone (W, H) {
  const rad = rectOf('#radar'), ctr = rectOf('#ctrls'), tags = rectOf('#otags'), ped = rectOf('#touchpad .tp-right'), hl = rectOf('#hud-left');
  let right = W - 10;
  for (const r of [rad, ctr]) if (r && r.left > W / 2) right = Math.min(right, r.left - 8);
  let top = tags ? tags.bottom + 6 : rad ? rad.top : 10;
  const bot = ped ? ped.top - 6 : H - 10;
  const lim = Math.max(hl ? hl.right + 12 : 10, W * 0.5 - 40);   // левее — машина посередине и колонка хада слева
  const w = Math.round(Math.max(140, Math.min(PH.W, right - lim)));
  for (const r of [rectOf('#toast'), rectOf('#hint'), rectOf('#dlg-live'), rectOf('#ach-toast')]) {
    if (r && r.right > right - w && r.left < right && r.top < bot && r.bottom > top - 4) top = Math.max(top, r.bottom + 6);
  }
  C.bot = Math.max(top + 40, bot);
  C.el.style.top = Math.round(top) + 'px';
  C.el.style.right = Math.round(W - right) + 'px';
  C.el.style.width = w + 'px';
  C.maxW = Math.max(w, Math.round(right - lim));
  drive();
  fit(H);
}

/* едешь — сообщения, что уже прочитаны (пришли раньше FRESH с), полупрозрачные: дорогу за ними видно */
function drive () {
  const v = C.speed ? +C.speed() || 0 : 0, now = performance.now();
  C.el.classList.toggle('ph-drive', v > PH.DRIVE);
  for (const m of C.items) m.el.classList.toggle('fresh', !m.said || now - (m.at || 0) < PH.FRESH * 1000);
}

/* не влезает по высоте (телефон боком: чат под радаром, а коллеги пишут втроём с именами, Толик — длинное объявление
   праздника): сначала шире (до 46 % экрана — меньше строк), потом уходят самые старые сообщения; последнее остаётся
   всегда (ревью 17.10: низ объявления Нового года уезжал за край экрана). Крупное (grow) — transform, высоту не меняет */
function fit (H) {
  // уходящие (.out) ещё 0,35 с в ленте — не считаем их, только живые сообщения
  // телефон — до верха педалей (C.bot), шире — только до середины экрана (C.maxW, placePhone)
  const over = () => { let h = C.el.getBoundingClientRect().top; for (const m of C.items) h += m.el.offsetHeight + 3; return h > (C.bot || H - 6); };
  if (!C.items.length || !over()) return;
  const w = parseFloat(C.el.style.width) || 270, wide = C.ph ? C.maxW : Math.round(Math.min(innerWidth * 0.46, 420));
  if (wide > w) C.el.style.width = wide + 'px';
  while (C.items.length > 1 && over()) drop(C.items[0]);
}

function drop (m) {
  const i = C.items.indexOf(m);
  if (i < 0) return;
  C.items.splice(i, 1);
  clearTimeout(m.t1); clearTimeout(m.t2); clearTimeout(m.t3);
  m.big = false;
  if (m.anim) { m.anim.cancel(); m.anim = null; }
  m.el.classList.remove('big');
  shown(m);                                               // убрали, не дождавшись текста, — списание всё равно
  m.el.classList.add('out');
  setTimeout(() => m.el.remove(), 350);
  mark();
}

/* пишут разные (Толик и коллеги): имя — над первым сообщением каждого подряд, аватарка и хвостик — у последнего
   (chat.css .cm-head / .cm-tail); пишет один Толик — как было: имя над первым, аватарка у последнего */
function mark () {
  const L = C.items;
  for (let i = 0; i < L.length; i++) {
    const w = L[i].w;
    L[i].el.classList.toggle('cm-head', !i || L[i - 1].w !== w);
    L[i].el.classList.toggle('cm-tail', i === L.length - 1 || L[i + 1].w !== w);
  }
}

function shown (m) {
  const f = m.onShow;
  m.onShow = null;
  if (f) try { f(); } catch (e) { console.warn('[chat]', e); }
}

/* who — кто пишет, если не Толик: { name, person, role } (коллеги в чате пиццерии — crewrank.js; role — должность:
   «курьер»; без who — Толик, «управляющий») */
export function say (text, onShow, angry, who, o) {
  text = String(text == null ? '' : text);
  const crew = !!(who && (who.name || who.rank));
  const rec = { m: null, onShow };
  QN++;
  if (!crew) NQ.clear('crew', true);                    // Толик пишет — ждущие фразы коллег про рейтинг не нужны
  const slot = TYPE_S + Math.max(C.ph ? PH.BIG_HOLD : Math.min(BIG.MAX, BIG.MIN + text.length / BIG.PER),
    Math.min(SLOT.MAX, Math.max(SLOT.MIN, SLOT.BASE + SLOT.PER * text.length)));
  NQ.push({
    kind: crew ? 'crew' : 'boss', text, ms: slot * 1000, fresh: SLOT.FRESH, key: o && o.key,
    wait: crew ? SLOT.CREW_WAIT : SLOT.BOSS_WAIT, group: crew ? 'crew' : undefined, max: crew ? 1 : undefined,
    show: () => { QN--; const f = rec.onShow; rec.onShow = null; rec.m = sayNow(text, f, angry, who); },
    // перебило срочное или чек оплаты: только пришло — убираем из ленты, покажется заново целиком (вычет — один раз);
    // уже прочитали крупно — остаётся в ленте мелко
    hide: (it, again) => { if (!rec.m) return; if (again) { QN++; drop(rec.m); rec.m = null; } else { rec.m.calm = true; shrink(rec.m); } },
    drop: () => { QN--; const f = rec.onShow; rec.onShow = null; if (f) try { f(); } catch (e) { console.warn('[chat]', e); } },   // не показали — вычет всё равно
  });
  return rec;
}
function sayNow (text, onShow, angry, who) {
  const el = box();
  place();
  // хад мог появиться или спрятаться, пока сообщения висят (написал в катсцене — хада нет, чат встал в самый верх;
  // катсцена кончилась — он лёг на кошелёк и радар): пока есть сообщения, место пересчитываем
  if (!C.pl) C.pl = setInterval(() => { if (!C.items.length) { clearInterval(C.pl); C.pl = 0; return; } place(); }, 400);
  while (C.items.length >= (C.ph ? PH.MAX : MAX)) drop(C.items[0]);
  const row = document.createElement('div');
  row.className = 'cm';
  const pers = who && who.person ? who.person : C.person;
  const ava = pers && C.face ? '<img alt="">' : '<i></i>';
  row.innerHTML = ava + '<div class="cm-b"><b></b><p class="typing"><span></span><span></span><span></span></p></div>';
  // кто пишет — с должностью (автор 18.10: «когда смс пишет курьер, я не понимаю, что это курьер»): «Серёга · курьер»,
  // «Толик · управляющий»; на телефоне — в пузыре коротко «Серёга, курьер:»
  const nm0 = who && who.name ? who.name : t('Ирина Сергеевна'), role = who && who.name ? who.role || '' : t('управляющая');
  row.querySelector('b').textContent = role ? nm0 + ' · ' + role : nm0;
  const img = row.querySelector('img');
  if (img) TF.bind(img, pers, 48);
  el.appendChild(row);
  const m = { el: row, onShow, w: who && who.name ? who.name : '' };
  C.items.push(m);
  mark();
  m.t1 = setTimeout(() => {
    const p = row.querySelector('p');
    p.className = '';
    p.textContent = text;
    // телефон: имя — в начале пузыря, одной строкой с текстом («Олег: …»); не телефон — спрятано (chat.css)
    const nm = document.createElement('i');
    nm.className = 'cm-n';
    nm.textContent = (role ? nm0 + ', ' + role : nm0) + ': ';
    p.prepend(nm);
    m.at = performance.now();
    place();                                              // текст пришёл — влезает ли по высоте (fit), до «крупно»
    m.said = true;
    shown(m);
    ding(angry);
    if (img) TF.talk(img, TF.talkTime(text));
    const big = !m.calm && grow(m) ? bigHold(text) : 0;
    if (big) m.t3 = setTimeout(() => shrink(m), big * 1000);
    m.t2 = setTimeout(() => drop(m), (big + hold(text)) * 1000);
  }, TYPE_S * 1000);
  return m;
}

/* случайная фраза, не та же, что в прошлый раз */
export function react (kind, onShow) {
  const pool = LINES[kind] || (C.adult ? ADULT_LINES : KIDS_LINES)[kind];
  if (!pool || !pool.length) return null;
  let k = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && k === C.last[kind]) k = (k + 1) % pool.length;
  C.last[kind] = k;
  return say(t(pool[k]), onShow, ANGRY.has(kind), null, { key: 'react:' + kind });
}

/* ── экран Толика в конце смены (shiftend.js): одна фраза по смене, «мдаа» — тоже фраза ── */
const SHIFT_LINES = {
  bad: /*i18n*/ [N_('Сегодня вышло плохо. Завтра соберись, Женя.')],
  ok: /*i18n*/ [N_('Смена закончилась. Отдохни перед следующей.')],
  great: /*i18n*/ [N_('Молодец, Женя. Сегодня клиенты довольны.')],
};
const SHIFT_ADULT = { bad: [], ok: [], great: [] };
export const avatar = size => (C.person && C.face ? C.face(C.person, size) : '');
/* он сам — человек (people.js): диалог «на, похавай» в пиццерии (career.js atBase) */
export const person = () => C.person;
export function shiftLine (mood) {
  const k = SHIFT_LINES[mood] ? mood : 'ok';
  const pool = SHIFT_LINES[k].concat(C.adult ? SHIFT_ADULT[k] : []);
  return t(pool[Math.floor(Math.random() * pool.length)]);
}

export function clear () { NQ.clear(['boss', 'crew']); for (const m of C.items.slice()) drop(m); }   // ждущие в очереди — тоже (вычеты — всё равно)

/* отложенное сообщение: пока таймер не вышел, чат «занят» (конец смены его подождёт); clear() его не
   отменяет — вычет за опоздание должен случиться и после конца смены */
export function later (ms, fn) {
  const id = setTimeout(() => { PEND.delete(id); try { fn(); } catch (e) { console.warn('[chat]', e); } }, ms);
  PEND.add(id);
  return id;
}
export const busy = () => PEND.size > 0 || QN > 0 || C.items.some(m => !m.said || m.big || m.anim);
export const waiting = () => C.wait > 0;
/** Толик сейчас «говорит»: печатает или сообщение крупно (музыка приглушается — music.js) */
export const talking = () => C.items.some(m => !m.said || m.big);
export function idle (cb, max = 6000) {
  const t0 = performance.now();
  C.wait++;
  const tick = () => {
    if (busy() && performance.now() - t0 < max) { setTimeout(tick, 80); return; }
    C.wait--;
    try { cb(); } catch (e) { console.error('[chat] idle', e); }
  };
  tick();
}
