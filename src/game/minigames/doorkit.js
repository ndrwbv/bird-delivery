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
    b.innerHTML = (m.name ? '<b>' + esc(m.name) + '</b>' : '') + '<p>' + esc(m.text) + '</p>';
    box.appendChild(b);
    el.appendChild(box);
    if (img) TF.talk(img, TF.talkTime(m.text));
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

/* ── часы заказа: «сейчас» и «доставить до …», как на приборке ── */
export function dashHTML () {
  return '<span class="mk-dash"><b class="mk-now"></b><span class="mk-due"><em></em><b></b></span></span>';
}
/* c: { now: '14:21', label: 'доставить до', due: '14:35', lvl: '' | 'warn' | 'low' | 'late', k: 0…1 } */
export function dashSet (root, c, fuse) {
  const d = root.querySelector('.mk-dash');
  if (!d) return;
  if (!c) { d.hidden = true; if (fuse) fuse.parentNode.hidden = true; return; }
  d.hidden = false;
  const key = c.now + '|' + c.label + '|' + c.due + '|' + c.lvl;
  if (d.__k !== key) {
    d.__k = key;
    d.querySelector('.mk-now').textContent = c.now || '';
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
/* песочница: свои часы — срок sec с, «сейчас» с 14:20, минута игры ≈ 2 с */
export function fakeClock (sec, t) {
  const total = Math.max(1, +sec || 40);
  let left = total;
  const hhmm = m => pad2(Math.floor(m / 60) % 24) + ':' + pad2(Math.floor(m) % 60);
  return {
    step: dt => { left -= dt; },
    get: () => {
      const k = left / total, lvl = left <= 0 ? 'late' : (k <= 0.18 || left < 10) ? 'low' : k <= 0.4 ? 'warn' : '';
      const now = 14 * 60 + 20 + (total - left) / 2;
      return { s: left, k, now: hhmm(now), label: left <= 0 ? t('опоздал') : t('доставить до'), due: hhmm(now + Math.max(0, left) / 2), lvl };
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

/* ── свёрнутая накладная в углу (весь лист — ordersheet.js; пометки ручкой — в .mk-mini-body) ── */
export function miniHTML (sheet, o = {}) {
  const t = o.t || (s => s);
  return '<div class="mk-mini">' +
    '<div class="mk-mini-body mk-inv"><span class="pp-label">' + esc(t('накладная')) + '</span>' + sheet + '</div>' +
    '<button type="button" tabindex="-1" class="mk-mini-tab">' + (o.face ? '<img src="' + o.face + '" alt="">' : '') +
      '<b>' + esc(t('накладная')) + '</b><span>' + esc(o.short || '') + '</span><span class="mk-pen">✎</span><kbd class="mk-kx"></kbd></button>' +
  '</div>';
}
/* раскрыть / свернуть (клик, X), приоткрыть на sec с после новой пометки */
export function miniBind (el) {
  let to = 0;
  const tab = el.querySelector('.mk-mini-tab');
  const toggle = on => { el.classList.toggle('open', on === undefined ? !el.classList.contains('open') : !!on); };
  tab.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
  return {
    body: el.querySelector('.mk-mini-body'),
    toggle,
    // узкий экран (телефон): лист закрыл бы всю сцену — только значок ✎ на плашке
    peek (sec = 1.8) { el.classList.add('mk-marked'); if (innerWidth < 760) return; el.classList.add('peek'); clearTimeout(to); to = setTimeout(() => el.classList.remove('peek'), sec * 1000); },
    key (s) { const k = el.querySelector('.mk-kx'); if (k) k.textContent = s ? '[' + s + ']' : ''; },
    off () { clearTimeout(to); },
  };
}
