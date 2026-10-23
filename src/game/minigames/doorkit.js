/* Общее у мини-игр у двери — домофона (intercom.js) и подъезда (stairs.js), автор 10.10.2026:
   - сообщения, как у Толика (chat.css, iMessage): круглая аватарка с лицом (people.js faceDataURL; пока говорит — рот
     открывается, talkface.js), над пузырём имя мелко, серый пузырь с хвостиком; свои реплики курьера — синие справа;
   - часы заказа, как на приборке (game.js dashStep): «сейчас» зелёным и плашка «доставить до 14:35» — своего таймера
     у мини-игры нет, идёт срок заказа; фитиль под шапкой — сколько срока осталось;
   - жильцы за чужой дверью — лица по виду (бабка, дед, ребёнок…), собака и кот — значком;
   - песочница: заказ-образец и часы, если игра не дала своих.
   Модуль без export default — песочница (uilab/minigames.js) его не показывает кнопкой. */
import './doorkit.css';
import { makePerson } from '../people.js';
import * as TF from '../talkface.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
export const N_ = s => s;

/* ── жильцы: человек под вид (ищем зерно, чья внешность подходит; один раз на вид) ── */
const KINDS = {
  'бабка': L => L.f && L.age === 'old', 'дед': L => !L.f && L.age === 'old', 'соседка': L => L.f && L.age === 'adult',
  'мама': L => L.f && L.age !== 'old', 'ребёнок': L => L.age === 'young' && L.head === 'none', 'студент': L => !L.f && L.age === 'young' && L.glasses !== 'none',
  'мужик': L => !L.f && L.age === 'adult' && L.beard !== 'none', 'гопник': L => !L.f && L.age === 'young' && ['cap', 'beanie', 'hood'].includes(L.head),
  'гопник2': L => !L.f && L.age === 'young' && L.head === 'none' && L.hair === 'buzz',
};
const EMOJI = { 'собака': '🐕', 'кот': '🐈' };
const CACHE = new Map();
export function stranger (kind) {
  if (EMOJI[kind]) return null;
  if (CACHE.has(kind)) return CACHE.get(kind);
  const ok = KINDS[kind];
  let p = null;
  let seed = 7;
  for (const c of kind) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  for (let k = 0; k < 4000 && ok; k++) { const q = makePerson({ seed: (seed + k * 2654435761) >>> 0 }); if (ok(q.look)) { p = q; break; } }
  if (!p) p = makePerson({ seed });
  CACHE.set(kind, p);
  return p;
}

/* ── лента сообщений ── */
export function feed (el, o = {}) {
  const max = o.max || 3;
  el.classList.add('mk-feed');
  const imgs = new Set();
  function say (m) {
    const box = document.createElement('div');
    box.className = 'mk-m' + (m.out ? ' mk-out' : '') + (m.cls ? ' ' + m.cls : '');
    let img = null;
    if (!m.out) {
      if (m.person) {
        img = document.createElement('img'); img.className = 'mk-av'; img.alt = '';
        TF.bind(img, m.person, 96, m.mood || '');
        imgs.add(img);
      } else {
        const i = document.createElement('i'); i.className = 'mk-av mk-emo'; i.textContent = EMOJI[m.kind] || m.emoji || '🔔';
        box.appendChild(i);
      }
      if (img) box.appendChild(img);
    }
    const b = document.createElement('div');
    b.className = 'mk-b';
    b.innerHTML = (m.name ? '<b>' + esc(m.name) + '</b>' : '') + '<p>' + (m.html || esc(m.text)) + '</p>';   // html — подсказка с кнопками (learn)
    box.appendChild(b);
    el.appendChild(box);
    if (img) TF.talk(img, TF.talkTime(m.text || b.textContent));
    // старые — уходят сверху, лента не растёт
    const all = [...el.children].filter(c => !c.classList.contains('mk-gone'));
    for (let i = 0; i < all.length - max; i++) {
      const c = all[i];
      c.classList.add('mk-gone');
      const im = c.querySelector('img.mk-av');
      if (im) { TF.stop(im); imgs.delete(im); }
      setTimeout(() => c.remove(), 260);
    }
    return box;
  }
  return { say, clear: () => { for (const im of imgs) TF.stop(im); imgs.clear(); el.replaceChildren(); } };
}

/* ── первый раз (doorstep.js learnFirst, ECON.DOORGAME.LEARN): до 18.10.2026 Толик писал подсказку пузырём в ленте поверх
   игры — на телефоне она накладывалась на подъезд; теперь — пошаговое обучение до старта, doorcoach.js. Здесь — значок
   клавиши и строка с кнопками для его записок */
export const key = (s, kb) => '<kbd class="pp-key' + (kb ? ' pp-key-kb' : '') + '">' + esc(s) + '</kbd>';
/* строка с кнопками целиком одним ключом перевода: t(s, vars) с {имя} кнопок из keys (HTML <kbd>), остальное экранировано */
export function keysLine (t, s, keys = {}, vars = {}) {
  const ks = Object.keys(keys), tok = {};
  ks.forEach((k, i) => { tok[k] = '\u0001' + i + '\u0001'; });
  let out = esc(t(s, Object.assign({}, vars, tok)));
  ks.forEach((k, i) => { out = out.split('\u0001' + i + '\u0001').join(keys[k]); });
  return out;
}
/* «+N с к сроку — на первый раз» — строка в конце подсказки */
export const learnAdd = (ln, t) => (ln && ln.add > 0 ? ' ' + esc(t('На первый раз к сроку +{n} с.', { n: ln.add })) : '');

/* ── «пусть сам спустится» (17.10.2026; числа — econ.js DOORGAME.SELF): отказ от домофона и подъезда своей кнопкой —
   пометка на полях под заданием (справа), основному управлению не мешает: клавиатура Q, геймпад RB / R1, палец — тап по ней.
   Нажали — та же пометка становится строкой «клиент спускается… N с» (selfOn); ждать — selfWait(o) с (o.selfWait: [от, до]) ── */
export const selfHTML = t => '<button type="button" tabindex="-1" data-a="self" class="mk-self"><kbd class="pp-key"></kbd><span>' + esc(t('пусть сам спустится')) + '</span></button>';
export const selfKey = (k, fam) => (k === 'pad' ? (fam === 'ps' ? 'R1' : 'RB') : k === 'kb' ? 'Q' : '');
export function selfGlyph (el, k, fam) {
  const kb = el && el.querySelector('kbd');
  if (!kb) return;
  const s = selfKey(k, fam);
  kb.hidden = !s || el.classList.contains('on');
  kb.textContent = s;
  kb.classList.toggle('pp-key-kb', k === 'kb');
}
export const selfPad = p => !!(p && p.pageR);                       // геймпад: RB / R1 (pageR — фронт нажатия)
export const selfCode = c => c === 'KeyQ';                          // клавиатура: Q
export function selfWait (o) {
  const w = o && Array.isArray(o.selfWait) ? o.selfWait : [6, 10];
  return w[0] + Math.random() * Math.max(0, w[1] - w[0]);
}
export function selfOn (el, t, left) {
  if (!el) return;
  el.classList.add('on');
  const kb = el.querySelector('kbd'); if (kb) kb.hidden = true;
  const s = el.querySelector('span'), n = Math.max(0, Math.ceil(left));
  if (s && el.__n !== n) { el.__n = n; s.textContent = t('клиент спускается… {n} с', { n }); }
}

/* ── срок заказа, как на хаде: «до опоздания 2:15» (11о; «сейчас» — пусто, спрятано) ── */
export function dashHTML () {
  return '<span class="mk-dash"><b class="mk-now"></b><span class="mk-due"><em></em><b></b></span></span>';
}
/* c: { now: '', label: 'до опоздания', due: '2:15', lvl: '' | 'warn' | 'low' | 'late', k: 0…1 } */
export function dashSet (root, c, fuse) {
  const d = root.querySelector('.mk-dash');
  if (!d) return;
  if (!c) { d.hidden = true; if (fuse) fuse.parentNode.hidden = true; return; }
  d.hidden = false;
  const key = c.now + '|' + c.label + '|' + c.due + '|' + c.lvl;
  if (d.__k !== key) {
    d.__k = key;
    const nw = d.querySelector('.mk-now');
    nw.textContent = c.now || ''; nw.hidden = !c.now;              // часов игры больше нет (11о) — только отсчёт
    d.querySelector('.mk-due em').textContent = c.label || '';
    d.querySelector('.mk-due b').textContent = c.lvl === 'late' ? '' : c.due || '';
    d.dataset.lvl = c.lvl || '';
  }
  if (fuse) {
    fuse.parentNode.hidden = false;
    fuse.style.transform = 'scaleX(' + Math.max(0, Math.min(1, c.k)).toFixed(3) + ')';
    fuse.parentNode.classList.toggle('mk-hot', c.lvl === 'low' || c.lvl === 'late');
    fuse.parentNode.classList.toggle('mk-warn', c.lvl === 'warn');
  }
}
const pad2 = n => String(n).padStart(2, '0');
/* песочница: свои часы — срок sec с; плашка как в игре (11о): «до опоздания 0:40» — минуты:секунды, без часов игры
   (было «14:21 · доставить до 14:42» — песочница показывала не то, что игрок; ревью 23.10, Р23-1) */
export function fakeClock (sec, t) {
  const total = Math.max(1, +sec || 40);
  let left = total;
  return {
    step: dt => { left -= dt; },
    get: () => {
      const k = left / total, lvl = left <= 0 ? 'late' : (k <= 0.18 || left < 10) ? 'low' : k <= 0.4 ? 'warn' : '';
      const n = Math.max(0, Math.ceil(left));
      return { s: left, k, now: '', label: left <= 0 ? t('опоздал') : t('до опоздания'), due: Math.floor(n / 60) + ':' + pad2(n % 60), lvl };
    },
  };
}

/* песочница: заказ-образец для листа накладной */
export function fakeOrder (api, o = {}) {
  const t = api.t;
  const person = o.person || (api.makePerson ? api.makePerson({ seed: +o.seed || 4242 }) : null);
  const st = { persons: person ? [person] : [], addr: o.addr || t('ул. Ленина, 12'), home: o.home || null };
  return {
    kind: 'solo', items: '1 × ' + t('пепперони'), stops: [st], ord: { type: 'pizza' },
    extra: [[t('оплата'), '<b class="oc-pay">' + (api.money ? api.money(+o.fee || 1000) : (+o.fee || 1000) + ' ₽') + '</b>']],
  };
}

/* ── накладная в мини-игре (автор 11.10.2026: «накладную надо показывать, а не скрывать»): лист раскрыт сразу —
   в домофоне справа от двери (intercom.js ставит его, miniSide), в подъезде — в углу, компактно (o.compact);
   X / клик по листу — свернуть в плашку, ещё раз — раскрыть. На телефоне (узко или низко) — свёрнут: плашка со значком ✎.
   Весь лист — ordersheet.js; пометки ручкой — в .mk-mini-body ── */
export function miniHTML (sheet, o = {}) {
  const t = o.t || (s => s);
  return '<div class="mk-mini' + (o.compact ? ' mk-compact' : '') + '">' +
    '<div class="mk-mini-body mk-inv"><span class="pp-label">' + esc(t('накладная')) + '<span class="mk-mini-hide"><kbd class="mk-kx"></kbd>' + esc(t('свернуть')) + '</span></span>' + sheet + '</div>' +
    '<button type="button" tabindex="-1" class="mk-mini-tab">' + (o.face ? '<img src="' + o.face + '" alt="">' : '') +
      '<b>' + esc(t('накладная')) + '</b><span>' + esc(o.short || '') + '</span><span class="mk-pen">✎</span><kbd class="mk-kx"></kbd></button>' +
  '</div>';
}
/* мало места под раскрытый лист: телефон стоя (узко) или боком (низко) */
export const miniSmall = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px), (max-height: 460px)').matches;
/* раскрыт сразу (не телефон); клик по плашке или по листу, X — свернуть / раскрыть; новая пометка — свёрнутый
   приоткрывается на sec с, раскрытый — вздрагивает */
export function miniBind (el) {
  let to = 0;
  const tab = el.querySelector('.mk-mini-tab'), body = el.querySelector('.mk-mini-body');
  const toggle = on => { el.classList.toggle('open', on === undefined ? !el.classList.contains('open') : !!on); if (el.classList.contains('open')) el.classList.remove('peek'); };
  const tap = e => { e.preventDefault(); e.stopPropagation(); toggle(); };
  tab.addEventListener('pointerdown', tap);
  body.addEventListener('pointerdown', tap);
  if (!miniSmall()) el.classList.add('open');
  return {
    body,
    toggle,
    get open () { return el.classList.contains('open') || el.classList.contains('peek'); },
    peek (sec = 1.8) {
      el.classList.add('mk-marked');
      if (el.classList.contains('open')) { el.classList.remove('mk-jolt'); void el.offsetWidth; el.classList.add('mk-jolt'); return; }
      if (miniSmall()) return;      // телефон: лист закрыл бы всю сцену — только значок ✎ на плашке
      el.classList.add('peek'); clearTimeout(to); to = setTimeout(() => el.classList.remove('peek'), sec * 1000);
    },
    key (s) { for (const k of el.querySelectorAll('.mk-kx')) k.textContent = s ? '[' + s + ']' : ''; },
    off () { clearTimeout(to); },
  };
}
/* домофон: раскрытый лист — справа от двери, верх — у панели домофона (door, panel — прямоугольники doorscene.js,
   W, H — размер сцены). Справа меньше MIN_W px — в угол, как в подъезде */
export function miniSide (el, W, H, door, panel) {
  const x = Math.round(door.x + door.w + Math.min(40, Math.max(18, (W - door.x - door.w - 470) / 3))), w = Math.min(470, W - x - 16);
  const key = W + 'x' + H + ':' + x + ':' + Math.round(panel.y);
  if (el.__side === key) return;
  el.__side = key;
  if (w < 290 || W < 760) { el.classList.remove('mk-side'); return; }
  el.classList.add('mk-side');
  el.style.setProperty('--mk-x', x + 'px');
  el.style.setProperty('--mk-w', w + 'px');
  // верх — вровень с панелью, но лист целиком над строкой управления
  const b = el.querySelector('.mk-mini-body'), h = b ? b.offsetHeight || 300 : 300;
  el.style.setProperty('--mk-y', Math.round(Math.max(118, Math.min(panel.y, H - 58 - h))) + 'px');
}
