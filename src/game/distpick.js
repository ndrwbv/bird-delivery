/* Выбор района — карусель карточек (05.10.2026, docs/IDEAS.md № 12; правила — docs/CAREER.md «Районы»).
   Было: список строк «машина +20 % · оплата +15 % · 4 из 4 смен · загибается ★☆☆☆☆» — игроку непонятно.
   Стало: как главное меню и гараж — одна крупная карточка района в центре, соседи по бокам. С 09.10.2026
   (UI-REVIEW № 28, 36, 37, 46) карточка — бумажный «пропуск в район»: две главные строки (далеко ли заказы,
   на сколько больше платят), мелко — машина и бандиты, под фото пиццерии — как она выросла; печать
   ОТКРЫТ / ПОКА ЗАКРЫТ; штамп «[A] на смену здесь». Закрытый — серый штамп «откроется через N смен»,
   курсор геймпада остаётся на нём (не уходит на «назад»). Фон глухой — меню под ним не видно.

     DP.open({ title, cards, idx, onPick(key), onBack(), onFlip() }) — показать (cards — districtCards / cityCard)
     DP.districtCards({ btn, cur, closed }) — карточки 8 районов; btn — надпись кнопки; cur — номер, где работаешь
     DP.cityCard({ btn, on, far }) — карточка «весь город» (cityopen.js)
     DP.root() / DP.isOpen() / DP.back() / DP.flip(±1) / DP.close()

   Кто зовёт: menu.js («сменить район» на карточке «на смену») и cityopen.js (всё открыто — выбор перед
   сменой). Листать — свайп, ◀ ▶, ←→, стик, крестовина, LB/RB (career.js padPre / onKey зовут DP.flip),
   выбрать — A / Enter / тап по кнопке, назад — B / Esc / «назад». */
import './distpick.css';
import { t, tn, N_ } from '../i18n/index.js';
import * as DIST from './districts.js';
import * as GROW from './growth.js';
import * as ZN from './zones.js';
import { DISTRICT, PAY, CITY } from './econ.js';
import { carousel } from './carousel.js';
import { keyHTML } from '../input/glyphs.js';
import * as PFX from './paperfx.js';

let el = null, CZ = null, ON = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pc = k => Math.round((k - 1) * 100);
const km = m => String(Math.round(m / 100) / 10).replace('.', ',');

/* где это — по id района карты Солнечного (src/maps/seversk/index.js); другой карты — без строки */
const WHERE = {
  south: N_('южный край города, у кольца — всё рядом'),
  ring: N_('от кольца до Солнечной, вдоль реки'),
  avenue: N_('середина города, улица Калинина'),
  center: N_('у площади Ленина, самые людные улицы'),
  old: N_('северо-запад: старые кварталы'),
  east: N_('за железкой: особняки богачей, промзона, тракт'),
  north: N_('север: гаражи и заводы, ехать далеко'),
  west: N_('запад за речкой: частные дома'),
};

function build () {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'cr-dpick';
  el.hidden = true;
  el.innerHTML = '<div class="dp-t"></div><div class="dp-car"></div><div class="dp-bot"><button type="button" class="dp-back pp-note"></button></div>';
  (document.getElementById('game') || document.body).appendChild(el);
  CZ = carousel(el.querySelector('.dp-car'), { cls: 'dp-cz', scales: [1, 0.84, 0.7], reach: 2,
    onChange: () => { if (ON && ON.onFlip) try { ON.onFlip(); } catch (e) { /* — */ } } });
  el.querySelector('.dp-back').addEventListener('click', () => back());
  return el;
}

/* ── карточка — «ПРОПУСК В РАЙОН» на бумаге накладной (paper.css, docs/UI-REVIEW.md № 46): шапка, фото
   пиццерии полароидом (подпись — как выросла), имя района; две главные строки — далеко ли заказы и на
   сколько больше платят; мелко — машина и бандиты; печать ОТКРЫТ / ПОКА ЗАКРЫТ; внизу — штамп «[A] на
   смену здесь». Закрытый: штамп серый, на нём «откроется через N смен» — курсор остаётся на карточке
   (кнопка не disabled), нажал — печать хлопает ещё раз. Движение — только когда лист появился. ── */
const row = (cls, k, v) => '<p class="pp-row"><span>' + esc(k) + '</span><i></i><b' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</b></p>';
function card (key, cls, num, name, where, rows, extra, foot, btn, locked, photo, lockTxt) {
  const c = document.createElement('section');
  c.className = 'dp-card pp-sheet' + (cls ? ' ' + cls : '');
  c.dataset.key = key; c.dataset.title = name;
  c.innerHTML = '<header class="pp-head"><span>' + esc(t('пропуск в район')) + '</span><b>№ ' + esc(num) + '</b></header>' +
    '<div class="dp-id"><figure class="dp-ph"><i class="pp-polaroid" aria-hidden="true"></i>' + (photo ? '<figcaption>' + esc(photo) + '</figcaption>' : '') + '</figure>' +
      '<div class="dp-nm"><b>' + esc(name) + '</b>' + (where ? '<span class="pp-hint">' + esc(where) + '</span>' : '') +
      (cls.includes('cur') ? '<span class="pp-mark dp-here">' + esc(t('ты здесь')) + '</span>' : '') + '</div></div>' +
    rows.join('') +
    (extra ? '<p class="pp-hint dp-x">' + esc(extra) + '</p>' : '') +
    '<div class="pp-seal ' + (locked ? 'pp-seal-red' : 'pp-seal-green') + '">' + esc(locked ? t('закрыт') : t('открыт')) + '</div>' +
    '<button type="button" class="pp-stamp dp-go' + (locked ? ' dp-lk' : '') + '" data-main' + (locked ? ' aria-disabled="true"' : '') + '>' +
      (locked ? esc(lockTxt || t('пока закрыт')) : keyHTML('ok') + esc(btn)) + '</button>' +
    (foot ? '<p class="pp-hint dp-f">' + esc(foot) + '</p>' : '');
  const go = c.querySelector('.dp-go');
  if (!locked) go.addEventListener('click', () => pick(key));
  else go.addEventListener('click', () => { PFX.replay(c.querySelector('.pp-seal'), 'pp-seal'); PFX.replay(c, 'pp-shake'); });
  return c;
}

/* бандиты в районе i — есть ли круг (с учётом доната) */
const gangIn = i => { try { return ZN.gangZones().some(g => DIST.at(g.x, g.z) === i); } catch (e) { return false; } };

/* две главные строки — далеко ли заказы и на сколько больше платят (одинаковые для открытых и закрытых) */
function distRows (i) {
  const [, far] = DISTRICT.DIST[Math.min(i, DISTRICT.DIST.length - 1)];
  const p = pc(DISTRICT.PAY[i] || 1);
  return [
    row('', t('заказы'), i ? t('дальше: до {km} км', { km: km(far) }) : t('рядом: до {km} км', { km: km(far) })),
    row(p ? 'pp-plus' : '', t('платят'), p ? t('на {p} % больше', { p }) : t('как обычно')),
  ];
}
/* мелко одной строкой: машина и бандиты */
function distExtra (i) {
  const s = pc(DISTRICT.SPEED[i] || 1), x = [];
  if (s) x.push(t('машина быстрее на {s} %', { s }));
  if (gangIn(i)) x.push(t('бандиты: платят на {p} % больше, берут мзду', { p: pc(PAY.ZONE.gang || 1) }));
  return x.join(' · ');
}

/** карточки 8 районов: открытые — с кнопкой btn, закрытые — серые, со сроком открытия */
export function districtCards ({ btn, cur = DIST.cur(), noCur = false } = {}) {
  const open = DIST.opened(), L = DIST.list(), last = open - 1;
  return L.map((d, i) => {
    const locked = i >= open, name = t(d.name), sh = DIST.shiftsIn(i);
    let foot = '', lockTxt = '';
    if (locked) {
      const left = Math.max(1, DIST.need(last) - DIST.shiftsIn(last));
      lockTxt = i === open ? tn(left, 'откроется через {n} смену|откроется через {n} смены|откроется через {n} смен')
        : t('откроется после «{prev}»', { prev: t(L[i - 1].name) });
      if (i === open) foot = t('смены — в районе «{prev}»', { prev: t(L[last].name) }) + ' · ' +
        tn(DISTRICT.COUNT_MIN, 'в зачёт — от {n} заказа за смену|в зачёт — от {n} заказов за смену|в зачёт — от {n} заказов за смену');
    } else if (i === last && i < L.length - 1) {
      foot = tn(Math.max(1, DIST.need(i) - sh), 'до района «{next}» — ещё {n} смена здесь|до района «{next}» — ещё {n} смены здесь|до района «{next}» — ещё {n} смен здесь', { next: t(L[i + 1].name) });
    } else foot = sh ? tn(sh, 'ты отработал тут {n} смену|ты отработал тут {n} смены|ты отработал тут {n} смен') : '';
    return card(String(i), (!noCur && i === cur ? 'cur' : '') + (locked ? ' lock' : ''), String(i + 1), name, WHERE[d.id] ? t(WHERE[d.id]) : '',
      distRows(i), distExtra(i), foot, btn, locked, GROW.label(i), lockTxt);
  });
}
/** «весь город» (всё открыто, cityopen.js): far — премии за 2 / 3 / 4 км строкой */
export function cityCard ({ btn, on, far }) {
  const rows = [
    row('', t('заказы'), t('во всех районах')),
    row('pp-plus', t('платят'), t('на {p} % больше', { p: pc(CITY.PAY) })),
  ];
  const extra = t('за дальние 2 / 3 / 4 км — {far}', { far }) + ' · ' + t('машина быстрее на {s} %', { s: pc(CITY.SPEED) });
  return card('city', 'city' + (on ? ' cur' : ''), '★', t('весь город'), t('все 8 районов сразу; после заказа — в ближайшую пиццерию'), rows, extra, '', btn, false, '', '');
}

export function open ({ title, cards, idx = 0, onPick, onBack, onFlip, back: backTxt }) {
  build();
  ON = { onPick, onBack, onFlip };
  el.querySelector('.dp-t').textContent = title;
  el.querySelector('.dp-back').innerHTML = keyHTML('back') + esc(backTxt || t('назад'));
  el.hidden = false;
  CZ.set(cards, idx);
  requestAnimationFrame(() => fit());
}
/* не влезает по высоте (телефон боком, Дека с крупным шрифтом) — уменьшить карточки целиком */
function fit () {
  if (!el || el.hidden) return;
  for (const c of CZ.cards()) c.style.zoom = '';
  const st = el.querySelector('.cz-stage'), h = st ? st.clientHeight : 0;
  const hi = Math.max(...CZ.cards().map(c => c.offsetHeight));
  if (h && hi > h) { const k = Math.max(0.55, Math.floor(h / hi * 100) / 100); for (const c of CZ.cards()) c.style.zoom = k; }
}
addEventListener('resize', () => fit());

function pick (key) {
  const cb = ON && ON.onPick;
  close();
  if (cb) cb(key);
}
export function close () { if (el) el.hidden = true; ON = null; }
export const isOpen = () => !!(el && !el.hidden && el.isConnected);
export const root = () => (isOpen() ? el : null);
export function back () {
  if (!isOpen()) return false;
  const cb = ON && ON.onBack;
  close();
  if (cb) cb();
  return true;
}
/** листать (геймпад, клавиши); true — пролистнули */
export const flip = d => !!(isOpen() && CZ && CZ.flip(d));
export const DEBUG = { open, close, flip, districtCards, cityCard, root };
