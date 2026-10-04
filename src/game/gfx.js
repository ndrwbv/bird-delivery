/* ──────────────────────────────────────────────────────────────────────────
   Настройки графики (правила словами — docs/CAREER.md «Настройки графики»,
   зачем — docs/IOS.md «Нагрев и батарея»).

   Пресеты Низкая / Средняя / Высокая и под ними семь пунктов; поменял пункт
   руками — пресет «своя». Значение пункта — номер 0…2 (Низкая…Высокая),
   у окон и эффектов — 0/1:

     пункт   Низкая            Средняя        Высокая
     fps     30 к/с            60             как у экрана
     range   туман ~250 м      ~370 м         ~490 м
     menu    застывший кадр    30 к/с         живой    (листаешь меню — полные к/с)
     px      ~430 точек        ~540           ~720 (по короткой стороне)
     win     комнат нет        есть           есть
     fx      меньше и короче   как есть       как есть
     far     вдали раз в 3 к.  раз в 2        каждый кадр

   Правило: графика не меняет игру. Пресет трогает только то, что видно и что
   далеко: сколько машин и людей, где они рождаются, кто клиент, физика —
   одинаково. «Вдали» — дальше LAG_R от машины игрока: там прохожие и так не
   видны (game.js cullFar прячет их дальше 130 м), машины — точки в тумане.

   Умолчание по устройству (не сохраняется, пока игрок не тронул): iOS и
   телефон — Низкая, Steam Deck — Средняя, компьютер — Высокая. Сохранение —
   общий ключ dlv-gfx (profiles.js SHARED, «сбросить прогресс» не трогает), в
   нём — отдельно по виду устройства: Steam Cloud синкает Деку и компьютер, а
   графика у них разная.

   Отладка: ?gfx=low|mid|high — пресет на этот запуск (не сохраняется),
   ?gfxdev=pc|deck|phone|ios — каким устройством себя считать. __dlv.GFX.
   ────────────────────────────────────────────────────────────────────────── */
import './gfx.css';
import { t, N_ } from '../i18n/index.js';
import Platform from '../platform/index.js';
import * as CULL from './cull.js';
import * as WINS from './windows.js';

export const KEY = 'dlv-gfx';
const BASE_FAR = 490;
const LAG_R = 110;                 // дальше — «вдали»: считаем раз в N кадров

export const ITEMS = [
  { id: 'fps', label: N_('кадров в секунду'), vals: [30, 60, 0] },
  { id: 'range', label: N_('дальность'), vals: [250, 370, 490] },
  { id: 'menu', label: N_('город за меню'), vals: [0, 30, -1] },
  { id: 'px', label: N_('чёткость'), vals: [430, 540, 720] },
  { id: 'win', label: N_('окна с комнатами'), vals: [0, 1] },
  { id: 'fx', label: N_('эффекты'), vals: [0, 1] },
  { id: 'far', label: N_('машины и люди вдали'), vals: [3, 2, 1] },
];
export const PRESETS = {
  low: { fps: 0, range: 0, menu: 0, px: 0, win: 0, fx: 0, far: 0 },
  mid: { fps: 1, range: 1, menu: 1, px: 1, win: 1, fx: 1, far: 1 },
  high: { fps: 2, range: 2, menu: 2, px: 2, win: 1, fx: 1, far: 2 },
};
const ORDER = ['low', 'mid', 'high'];
const NAMES = { low: N_('низкая'), mid: N_('средняя'), high: N_('высокая'), custom: N_('своя') };
export const DEFAULTS = { ios: 'low', phone: 'low', deck: 'mid', pc: 'high' };

const Q = new URLSearchParams(location.search);
const store = () => Platform.store;
function readAll () { try { const v = store().get(KEY); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
function writeAll (v) { try { store().set(KEY, v); } catch (e) { /* — */ } }

/* какое это устройство */
export function device () {
  const q = Q.get('gfxdev');
  if (q && DEFAULTS[q]) return q;
  try {
    if (import.meta.env.MODE === 'ios' || (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios')) return 'ios';
  } catch (e) { /* — */ }
  if ((Platform.steam && Platform.steam.deck) || /steamos|steam deck/i.test(navigator.userAgent || '')) return 'deck';
  if (Platform.id !== 'steam' && matchMedia('(pointer: coarse)').matches) return 'phone';
  return 'pc';
}

const DEV = device();
const O = {};                      // текущие пункты: { fps: 0…2, … }
let PRESET = 'high', VER = 0;
const clampItem = (it, v) => (Number.isInteger(v) && v >= 0 && v < it.vals.length ? v : null);
function load () {
  const forced = Q.get('gfx');
  const mine = readAll()[DEV];
  const p = PRESETS[forced] ? forced : mine && (PRESETS[mine.p] || mine.p === 'custom') ? mine.p : DEFAULTS[DEV];
  Object.assign(O, PRESETS[p] || PRESETS.high);
  if (p === 'custom' && mine && mine.o) for (const it of ITEMS) { const v = clampItem(it, mine.o[it.id]); if (v !== null) O[it.id] = v; }
  PRESET = whichPreset();
}
function whichPreset () {
  for (const p of ORDER) if (ITEMS.every(it => PRESETS[p][it.id] === O[it.id])) return p;
  return 'custom';
}
function save () {
  if (PRESETS[Q.get('gfx')]) return;             // отладочный пресет из адреса — не сохраняем
  const all = readAll();
  all[DEV] = PRESET === 'custom' ? { p: 'custom', o: { ...O } } : { p: PRESET };
  writeAll(all);
}
load();

/* ── что читает игра ── */
const val = id => { const it = ITEMS.find(i => i.id === id); return it.vals[O[id]]; };
export const preset = () => PRESET;
export const presetName = () => t(NAMES[PRESET]);
export const opts = () => ({ ...O });
export const fpsCap = () => val('fps');                        // 0 — как у экрана
export const rangeK = () => val('range') / BASE_FAR;           // доля полной дальности
export const pixelShort = () => val('px');
export const every = () => val('far');                         // вдали — раз в столько кадров
export const fxLow = () => !val('fx');
export const winQ = () => (val('win') ? { interior: 1, lod: 70 } : { interior: 0, lod: 0 });
/* прятать дальше (м): прохожих, машин; ближний/дальний вариант человечка */
/* мелочь мира — по пункту «дальность» (свой пункт в окне не заводим): мелочь на газоне
   (lawnprops.js) — радиус клеток R, трава / одуванчики / мусор — до small, доля травы,
   зарослей и мусора — thin; краска газона (lawn.js) — полная (1) или облегчённая (0:
   без тени-рельефа и мелких октав шума — на Деке это ~треть времени видеокарты на землю) */
export const DETAIL = [
  { R: 80, small: 40, thin: 0.5, lawn: 0 },     // низкая
  { R: 100, small: 50, thin: 0.7, lawn: 0 },    // средняя (Steam Deck)
  { R: 120, small: 60, thin: 1, lawn: 1 },      // высокая
];
export const detail = () => DETAIL[O.range] || DETAIL[2];
export const hideR = () => (O.far === 0 ? { people: 100, cars: 200, lod: 32 } : { people: 130, cars: 220, lod: 45 });

/* ── применить: что меняется без перезагрузки ── */
let H = null;                       // хуки game.js: { resize }
export function init (hooks) { H = hooks || {}; apply(); }
function apply () {
  VER++;
  CULL.Q.base = BASE_FAR * rangeK();
  CULL.Q.fps = fpsCap() || 60;
  WINS.quality(winQ());
  if (H && H.resize) H.resize();
}
export function set (id, v) {
  const it = ITEMS.find(i => i.id === id);
  if (!it || clampItem(it, v) === null) return;
  O[id] = v; PRESET = whichPreset(); save(); apply();
}
export function setPreset (p) {
  if (!PRESETS[p]) return;
  Object.assign(O, PRESETS[p]); PRESET = p; save(); apply();
}

/* ── кадры: ограничение к/с и город за меню ──
   04.10.2026: «в интерфейсе 20 к/с» — облёт камеры над городом за меню шёл 20 к/с, и всё меню
   (Steam показывает к/с всего окна) выглядело рывками. Теперь на средней — 30 к/с, а пока игрок
   листает меню (касание, мышь, клавиши, геймпад — poke()) и ещё 0,9 с после — полные. Экран,
   закрывающий город целиком (гараж, «потратить»: cover), не ограничивается: города там нет,
   кадр игры пустой, а машина в гараже крутится своим кадром (cars.js previewCanvas).
   hold(now, menu, sig) — true: этот кадр пропустить целиком (мир не считаем, не рисуем).
   Пропуск по времени, а не «каждый второй»: на 120 Гц ограничение 60 — тоже 60.
   Физика от этого не зависит: шаг мира — по прошедшему времени (game.js frameStep).
   Застывший город за меню: первую секунду после смены экрана (sig) — 20 к/с,
   чтобы всё догрузилось, дальше — один кадр раз в MENU_KEEP мс (на случай, если меню
   что-то поменяло в городе). */
const MENU_SETTLE = 1000, MENU_KEEP = 4000, UI_HOLD = 900;
let due = 0, mSig = null, mBurst = 0, mNext = 0, uiUntil = 0;
/** игрок трогает меню — город за ним полные к/с ещё UI_HOLD мс (на «застывшем» — не трогаем) */
export function poke () { uiUntil = performance.now() + UI_HOLD; }
export const STATS = { drawn: 0, skipped: 0, menuDrawn: 0, work: [], frame: 0 };
export function hold (now, menu, sig, cover) {
  let fps = fpsCap();
  if (menu && cover) { mSig = null; return pass(now, 0, true); }
  if (menu) {
    const m = val('menu');
    if (m === 0) {
      const s = sig + '|' + VER;
      if (s !== mSig) { mSig = s; mBurst = now + MENU_SETTLE; mNext = mBurst + MENU_KEEP; }
      if (now < mBurst) fps = 20;
      else if (now >= mNext) { mNext = now + MENU_KEEP; return pass(now, 0, true); }
      else { STATS.skipped++; return true; }
    } else if (m > 0 && now >= uiUntil) fps = fps ? Math.min(fps, m) : m;
  } else mSig = null;
  return pass(now, fps, menu);
}
function pass (now, fps, menu) {
  if (fps > 0) {
    const iv = 1000 / fps;
    if (now + 2 < due) { STATS.skipped++; return true; }
    due += iv;
    if (due < now) due = now + iv;
  } else due = now;
  STATS.drawn++; STATS.frame++;
  if (menu) STATS.menuDrawn++;
  return false;
}
/* сколько занял кадр игры (мс, CPU) — game.js после рендера */
export function work (ms) { const w = STATS.work; w.push(ms); if (w.length > 600) w.splice(0, 300); }

/* ── вдали: раз в N кадров ──
   lag(o, dt, px, pz) → dt для этого объекта: 0 — в этом кадре пропустить, иначе
   накопленное время. Рядом (ближе LAG_R) — каждый кадр. Кто когда считается —
   по своему номеру, чтобы не все в один кадр. */
let SEQ = 0;
export function lag (o, dt, px, pz) {
  const n = val('far');
  const near = (o.x - px) ** 2 + (o.z - pz) ** 2 < LAG_R * LAG_R;
  if (n <= 1 || near) { if (o._lag) { dt += o._lag; o._lag = 0; } return Math.min(dt, 0.2); }
  if (o._lk === undefined) o._lk = SEQ++;
  o._lag = (o._lag || 0) + dt;
  if ((STATS.frame + o._lk) % n !== 0) return 0;
  const a = o._lag; o._lag = 0;
  return Math.min(a, 0.2);
}

/* ── эффекты: дым, искры, огонь, кровь, куски ──
   На «меньше»: каждая вторая частица не рождается (счётчик, не случай), живут
   короче — 0,6 от обычного; следы на асфальте — вдвое короче и не больше 35;
   куски и обломки тают в 1,6 раза быстрее. Сюжет и счёт не трогает: это только частицы. */
let fxN = 0;
export const fxDrop = () => fxLow() && (++fxN & 1) === 1;
export const fxLife = () => (fxLow() ? 0.6 : 1);
export const decalMax = () => (fxLow() ? 35 : 70);
export const gibFade = () => (fxLow() ? 1.6 : 1);

/* ── «кадр не успевает»: один раз предложить «Среднюю» ──
   cull.js сам опускает дальность, если кадр долгий две секунды подряд
   (CULL.Q.lvl > 0). На Высокой это и есть повод предложить Среднюю — тихой
   плашкой внизу на 15 с, один раз на устройство. */
let offerEl = null;
export function watch (playing) {
  if (PRESET !== 'high' || !playing || !(CULL.Q.lvl > 0) || offerEl) return;
  const all = readAll();
  if (all.offered && all.offered[DEV]) return;
  all.offered = { ...(all.offered || {}), [DEV]: 1 }; writeAll(all);
  offer();
}
function offer () {
  const el = offerEl = document.createElement('div');
  el.className = 'gfx-offer';
  el.innerHTML = '<span>' + t('кадр не успевает — включить графику «средняя»?') + '</span>' +
    '<button type="button" data-a="yes">' + t('включить') + '</button><button type="button" data-a="no">' + t('не надо') + '</button>' +
    '<small>' + t('поменять — в настройках → графика') + '</small>';
  const close = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.addEventListener('click', e => {
    const a = e.target && e.target.dataset && e.target.dataset.a;
    if (a === 'yes') setPreset('mid');
    if (a) close();
  });
  document.body.appendChild(el);
  setTimeout(close, 15000);
}

/* ── окно «графика» в настройках ──
   body — куда рисовать, focus — id кнопки после перерисовки */
function itemText (it, v) {
  switch (it.id) {
    case 'fps': return v === 2 ? t('как у экрана') : String(it.vals[v]);
    case 'range': return [t('близко'), t('средне'), t('далеко')][v] + ' · ' + t('{m} м', { m: it.vals[v] });
    case 'menu': return v === 0 ? t('застывший кадр') : v === 1 ? t('{n} к/с', { n: 30 }) : t('живой');
    case 'px': return [t('крупный пиксель'), t('средний пиксель'), t('мелкий пиксель')][v];
    case 'win': return v ? t('вкл') : t('выкл');
    case 'fx': return v ? t('все') : t('меньше');
    case 'far': return v === 2 ? t('каждый кадр') : t('раз в {n} кадра', { n: it.vals[v] });
  }
  return String(v);
}
/* card — карточка «графика» в карусели настроек (settings.js): без заголовка, пункты — сеткой,
   у «качества» data-main (на неё встаёт геймпад) */
export function panel (body, focus, card) {
  const btn = (id, txt, main) => '<button type="button" id="' + id + '"' + (id === focus ? ' autofocus' : '') + (main && card ? ' data-main' : '') + '>' + txt + '</button>';
  const row = (label, id, txt, main) => '<div class="set-row"><span>' + label + '</span>' + btn(id, txt, main) + '</div>';
  body.innerHTML = (card ? '' : '<div class="pn-t">' + t('графика') + '</div>') +
    row('<b>' + t('качество') + '</b>', 'gfx-p', presetName(), true) +
    '<div class="set-rows">' + ITEMS.map(it => row(t(it.label), 'gfx-' + it.id, itemText(it, O[it.id]))).join('') + '</div>' +
    '<div class="pn-n">' + t('графика не меняет игру: машины и люди рядом, клиенты и физика — одинаковые на любой') + '</div>';
  const again = id => panel(body, id, card);
  body.querySelector('#gfx-p').onclick = () => {
    const i = ORDER.indexOf(PRESET);
    setPreset(ORDER[(i + 1) % ORDER.length]);      // «своя» → низкая
    again('gfx-p');
  };
  for (const it of ITEMS) body.querySelector('#gfx-' + it.id).onclick = () => { set(it.id, (O[it.id] + 1) % it.vals.length); again('gfx-' + it.id); };
}

/* отладка: __dlv.GFX */
export const DEBUG = {
  get dev () { return DEV; }, get preset () { return PRESET; }, get opts () { return { ...O }; },
  set, setPreset, STATS, ITEMS, PRESETS, DETAIL, poke,
  /* время кадра CPU за последние n кадров: p50 / p95, мс */
  work (n = 300) { const s = STATS.work.slice(-n).sort((a, b) => a - b), q = p => (s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : 0); return { n: s.length, p50: q(0.5), p95: q(0.95) }; },
};
