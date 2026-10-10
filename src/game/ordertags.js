/* ──────────────────────────────────────────────────────────────────────────
   Мини-карточки заказа над радаром (docs/ORDERS.md «Накладная и мини-карточки»; автор, 10.10.2026:
   «анкета падает возле радара и потом минимизируется в просто „Степану“ и сколько метров»).

   Накладная показалась сама, повисела ~2,6 с и «упала» к радару (game.js dropPhone) — на её месте
   бумажная бирка: аватарка, имя (только имя), сколько метров осталось. Несколько адресов (сборный,
   последовательный, развоз) — бирки стопкой над радаром: текущая — сверху и крупнее, остальные —
   ниже, мельче и бледнее. Групповой (несколько человек на одном адресе) — одна бирка «Аня +2».

   Лицо на бирке — настроение клиента по сроку (те же ступени, что у часов заказа):
     осталось больше 40 % срока — спокойное; ≤ 40 % — недовольное (рот прямой);
     ≤ 18 % или меньше 10 с — злое; опоздал — злое, бирка красная. Задел клиента машиной — злое.
   Отдал адрес — лицо довольное (опоздал — злое), имя и метры зачёркнуты ручкой, через 1,8 с бирка уходит.
   Сюжетный заказ (главы, Стёпа) — бирка на бумаге с оттенком цвета сюжета, как накладная.

   В езде — тихо: метры обновляются раз в 0,25 с (только текст, DOM не перестраивается), движение —
   только на событиях (появилась, сменилось лицо, отдал).

     OT.init(api)    — один раз из game.js; api: { S, V, faceDataURL, routeLeft() → м до текущей цели по маршруту | null }
     OT.step(dt)     — каждый кадр хада (hudStep): сам следит за S.order
     OT.anchor()     — { x, y } середины текущей бирки на экране — куда падает накладная
     OT.land(delay)  — накладная упала: бирки появляются через delay с
   отладка: __dlv.OTAGS
   ────────────────────────────────────────────────────────────────────────── */
import { t } from '../i18n/index.js';
import './ordertags.css';

export const OTAG = {
  EVERY: 0.25,      // метры и лица — раз в столько секунд
  DONE_T: 1.8,      // отдал — зачёркнуто висит столько секунд, потом бирка уходит
  FACE: 64,         // размер аватарки, px картинки
  WARN: 0.4,        // осталось ≤ 40 % срока — недовольное лицо (как часы заказа: warn)
  LOW: 0.18,        // ≤ 18 % или меньше LOW_S секунд — злое (часы: low)
  LOW_S: 10,
};

let A = null;
const T = { el: null, order: null, items: [], acc: 0, holdT: 0, h: -1, hT: 0, stats: { built: 0, done: 0, moods: 0, measured: 0 } };
const LIVE = ['loading', 'drive', 'handover', 'side'];

export function init (api) {
  A = api;
  const el = document.createElement('div');
  el.id = 'otags';
  el.className = 'hud';
  el.setAttribute('aria-hidden', 'true');
  ((document.getElementById('game')) || document.body).appendChild(el);
  T.el = el;
}

const firstName = p => (p && (p.first || (p.name || '').split(/\s+/)[0])) || t('клиент');
const delivered = (o, st, i) => st.done || (i < o.idx && st.done !== false);
const colorOf = o => { const sp = o.ord || o.look; return (sp && sp.color) || '#ff8a2b'; };
const storyOf = o => { const sp = o.ord || o.look; return !!(sp && sp.type === 'story'); };

function build (o) {
  clearAll();
  T.order = o;
  if (!o || !o.stops) return;
  const c = colorOf(o), story = storyOf(o);
  o.stops.forEach((st, i) => {
    const ps = (st.persons || []).filter(Boolean);
    if (!ps.length && !st.at && !(st.peds && st.peds.length)) return;
    const el = document.createElement('div');
    el.className = 'otag' + (story ? ' story' : '');
    el.style.setProperty('--c', c);
    const img = document.createElement('img'); img.alt = '';
    const nm = document.createElement('span'); nm.className = 'ot-nm';
    nm.textContent = firstName(ps[0]) + (ps.length > 1 ? ' +' + (ps.length - 1) : '');
    const m = document.createElement('span'); m.className = 'ot-m';
    el.append(img, nm, m);
    T.el.appendChild(el);
    const it = { st, i, el, img, nm, m, p: ps[0] || null, mood: null, txt: '', cur: null, done: false, goneT: 0 };
    setMood(it, '');
    T.items.push(it);
  });
  T.stats.built++;
  T.acc = OTAG.EVERY;               // метры — сразу, не через 0,25 с
  T.h = -1;
}

function setMood (it, mood) {
  if (it.mood === mood) return;
  const first = it.mood === null;
  it.mood = mood;
  if (it.p) { const src = A.faceDataURL(it.p, OTAG.FACE, mood); if (src && it.img.src !== src) it.img.src = src; }
  if (!first) { T.stats.moods++; it.el.classList.remove('jolt'); void it.el.offsetWidth; it.el.classList.add('jolt'); }
}

function clearAll () {
  for (const it of T.items) it.el.remove();
  T.items.length = 0;
  T.order = null;
}

function markDone (it, late) {
  if (it.done) return;
  it.done = true;
  it.goneT = OTAG.DONE_T;
  T.stats.done++;
  setMood(it, late ? 'angry' : 'happy');
  it.m.textContent = '✓'; it.txt = '✓';
  it.el.classList.remove('late', 'jolt');
  it.el.classList.add('done');
  T.h = -2;
}

/* опоздание — как часы заказа (game.js dashStep): срок вышел — опоздал; ≤ 18 % или < 10 с — горит; ≤ 40 % — поджимает */
function moodNow (st) {
  const S = A.S;
  if (st.bumped) return 'angry';
  if (S.free || !(S.timeMax > 0) || S.state === 'loading') return '';
  if (S.time <= 0) return 'angry';
  const k = S.time / S.timeMax;
  if (k <= OTAG.LOW || S.time < OTAG.LOW_S) return 'angry';
  if (k <= OTAG.WARN) return 'ok';
  return '';
}

function metersText (d) {
  const n = d < 100 ? Math.max(0, Math.round(d / 5) * 5) : Math.round(d / 10) * 10;
  return t('{n} м', { n });
}

function update () {
  const S = A.S, V = A.V, o = T.order;
  const lateNow = !S.free && S.timeMax > 0 && S.time <= 0 && S.state !== 'loading';
  for (const it of T.items) {
    if (it.done) continue;
    const st = it.st;
    if (o && delivered(o, st, it.i)) { markDone(it, st.pay ? !!st.pay.late : lateNow); continue; }
    const cur = !!o && it.i === o.idx;
    if (cur !== it.cur) { it.cur = cur; it.el.classList.toggle('cur', cur); it.el.style.order = cur ? '-1' : String(it.i); T.h = -2; }
    const at = st.at || (st.peds && st.peds[0]);
    let d = at ? Math.hypot(at.x - V.x, at.z - V.z) : 0;
    if (cur) { const r = A.routeLeft && A.routeLeft(); if (r !== null && r !== undefined && Number.isFinite(r)) d = Math.max(d, r); }
    const txt = metersText(d);
    if (txt !== it.txt) { it.txt = txt; it.m.textContent = txt; }
    setMood(it, moodNow(st));
    it.el.classList.toggle('late', lateNow);
  }
}

/* высота стопки — чтение offsetHeight пересчитывает раскладку страницы: только когда стопка сменилась
   (T.h < 0: собрали, убрали бирку, сменилась текущая, показали/спрятали) и на всякий случай раз в секунду */
function syncHeight () {
  T.hT = 0; T.stats.measured++;
  const h = T.el.classList.contains('on') ? Math.round(T.el.offsetHeight) : 0;
  if (h === T.h) return;
  T.h = h;
  document.documentElement.style.setProperty('--otags-h', h ? h + 8 + 'px' : '0px');   // радио-плашка — над стопкой (ordertags.css)
}

export function step (dt) {
  if (!A || !T.el) return;
  const S = A.S;
  if (S.state === 'title' || S.state === 'over' || S.ride) { if (T.items.length) clearAll(); show(false); return; }
  if (S.order !== T.order) {
    // заказ кончился: отданные — дожить зачёркнутыми, остальные (отменён, взорвался) — сразу
    const old = T.order;
    if (old && !S.order) {
      for (const it of T.items) if (!it.done && delivered(old, it.st, it.i)) markDone(it, it.st.pay ? !!it.st.pay.late : false);
      T.items = T.items.filter(it => { if (it.done) return true; it.el.remove(); return false; });
      T.order = null;
    } else build(S.order);
  }
  if (T.holdT > 0) T.holdT -= dt;
  // бирки уходят
  for (let k = T.items.length - 1; k >= 0; k--) {
    const it = T.items[k];
    if (!it.done) continue;
    if ((it.goneT -= dt) <= 0) {
      if (!it.el.classList.contains('gone')) { it.el.classList.add('gone'); it.goneT = 0.3; }
      else { it.el.remove(); T.items.splice(k, 1); T.h = -2; }
    }
  }
  const want = T.items.length > 0 && T.holdT <= 0 && S.state !== 'brief' && (LIVE.includes(S.state) || (S.state === 'back' && T.items.some(it => it.done)));
  show(want);
  T.hT += dt;
  if ((T.acc += dt) >= OTAG.EVERY) { T.acc = 0; if (T.order) update(); if (T.h < 0 || T.hT >= 1) syncHeight(); }
}

function show (on) {
  if (T.el.classList.contains('on') === on) return;
  T.el.classList.toggle('on', on);
  if (!on) T.el.classList.remove('land');
  T.h = -2;
}

/* куда падает накладная: середина текущей бирки (бирки уже собраны, но спрятаны — место знаем) */
export function anchor () {
  if (!T.el) return null;
  if (A && A.S.order !== T.order) build(A.S.order);
  if (T.order) update();
  const it = T.items.find(x => x.cur) || T.items[0];
  const r = (it ? it.el : T.el).getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function land (delay = 0.4) {
  if (!T.el) return;
  T.holdT = delay;
  T.el.classList.remove('land'); void T.el.offsetWidth; T.el.classList.add('land');
}

export const DEBUG = { T, OTAG, get items () { return T.items.map(it => ({ nm: it.nm.textContent, m: it.m.textContent, mood: it.mood, cur: it.cur, done: it.done })); } };
