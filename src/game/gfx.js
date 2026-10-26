/* ──────────────────────────────────────────────────────────────────────────
   Настройки графики (правила словами — docs/CAREER.md «Настройки графики»,
   зачем — docs/IOS.md «Нагрев и батарея»).

   Пресеты Низкая / Средняя / Высокая и под ними девять пунктов; поменял пункт
   руками — пресет «своя». Значение пункта — номер 0…2 (Низкая…Высокая),
   у окон и эффектов — 0/1:

     пункт   Низкая            Средняя        Высокая
     fps     30 к/с            без огранич.   без ограничения  (пункт: 30 / 40 / 60 / без ограничения;
             09.10.2026, IDEAS К2: по умолчанию — без ограничения, и на Деке; было 30 / 60 / как у экрана)
     range   туман ~250 м      ~370 м         ~490 м
     menu    застывший кадр    30 к/с         живой    (листаешь меню — полные к/с)
     px      PC: 1280×720      1600×900       1920×1080; Deck: 960×540 / 1280×720 / 1280×800
     win     комнат нет        есть           есть
     fx      меньше и короче   как есть       как есть
     far     вдали раз в 3 к.  раз в 2        каждый кадр
     aa      нет               сглаживание    сглаживание   (MSAA ×4 на маленьком кадре —
             края и огни вдали не рябят; меняется после перезапуска игры)
     edge    мягкие края       нет            мягкие края   (FXAA одним проходом по готовому кадру,
             fxaa.js: лесенка внутри краски — разметка, окна, листва; сразу, без перезапуска; на низкой MSAA нет —
             тут они заметнее всего; на средней — Дека: по прикидке дороже 0,5 мс видеокарты, а MSAA и так есть)
     shadow  поддельные        поддельные     настоящие     (2г2, sunshadow.js: карта теней от солнца ±64 м
             вокруг камеры — дома, балконы, деревья, фонари на землю и стены; поддельные — маска домов на земле, fakeshadows.js)

   Отдельно от пресета — «тяжёлый кадр» (dynres.js): видеокарта не успевает — на миг
   меньшее разрешение, «мыло вместо рывка». По умолчанию вкл везде (автор 18.10.2026: «по дефолту ставить блюр
   вместо рывка»; до того — выкл, «что за блюр?»).
   Вместо него — «тяжёлое место» (tune.js, вкл везде, без пункта): кадр не успевает — ненадолго и плавно ближе
   туман, люди и машины вдали, комнаты за окнами, мелочь газона (viewR, detail, lag ниже), потом обратно.

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
import { keyHTML } from '../input/glyphs.js';
import Platform from '../platform/index.js';
import * as CULL from './cull.js';
import * as WINS from './windows.js';
import { ON as MOBILE } from './mobile.js';
import * as TUNE from './tune.js';
import {RESOLUTIONS,RESOLUTION_PRESETS,migrateResolution,resolutionSize} from './renderresolution.js';

export const KEY = 'dlv-gfx';
const BASE_FAR = 490;
const LAG_R = 110;                 // дальше — «вдали»: считаем раз в N кадров

export const ITEMS = [
  { id: 'fps', label: N_('кадров в секунду'), vals: [30, 40, 60, 0] },   // 0 — без ограничения (как у экрана)
  { id: 'range', label: N_('дальность'), vals: [250, 370, 490] },
  { id: 'menu', label: N_('город за меню'), vals: [0, 30, -1] },
  { id: 'px', label: N_('разрешение отрисовки'), vals: [430, 540, 720, 0] },
  { id: 'win', label: N_('окна с комнатами'), vals: [0, 1] },
  { id: 'fx', label: N_('эффекты'), vals: [0, 1] },
  { id: 'far', label: N_('машины и люди вдали'), vals: [3, 2, 1] },
  { id: 'aa', label: N_('сглаживание'), vals: [0, 1] },
  { id: 'edge', label: N_('мягкие края'), vals: [0, 1] },   // FXAA по готовому кадру (fxaa.js), сразу, без перезапуска
  { id: 'shadow', label: N_('тени'), vals: [0, 1] },        // 0 — поддельные (маска домов на земле, fakeshadows.js), 1 — настоящие от солнца (sunshadow.js)
];
export const PRESETS = {
  low: { fps: 0, range: 0, menu: 0, px: 0, win: 0, fx: 0, far: 0, aa: 0, edge: 1, shadow: 0 },   // edge: у низкой нет MSAA — мягкие края заметнее всего (телефон: +0,06 мс процессора, видеокарта ~+0,3 мс на M4)
  mid: { fps: 3, range: 1, menu: 1, px: 1, win: 1, fx: 1, far: 1, aa: 1, edge: 0, shadow: 0 },   // edge: Дека — проход ~0,25 мс на M4, на Деке по прикидке ×3 ≈ 0,6—0,9 мс > 0,5 — выкл (MSAA и так есть)
  high: { fps: 3, range: 2, menu: 2, px: 2, win: 1, fx: 1, far: 1, aa: 1, edge: 1, shadow: 1 },   // far: вдали раз в 2 кадра, как на средней (10.10.2026: на «Деке» поток −0,15 мс, люди и прохожие −0,1…0,2 мс; на средней так и было)
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
  if (MOBILE) return 'phone';                    // мобильный режим (mobile.js): телефон, планшет, ?mobile
  if (Platform.id !== 'steam' && matchMedia('(pointer: coarse)').matches) return 'phone';
  return 'pc';
}

const DEV = device();
if (RESOLUTION_PRESETS[DEV]) {
  ITEMS.find(it => it.id === 'px').vals = RESOLUTIONS;
  ORDER.forEach((p,i) => { PRESETS[p].px = RESOLUTION_PRESETS[DEV][i]; });
}
const O = {};                      // текущие пункты: { fps: 0…2, … }
let PRESET = 'high', VER = 0;
const clampItem = (it, v) => (Number.isInteger(v) && v >= 0 && v < it.vals.length ? v : null);
function load () {
  const forced = Q.get('gfx');
  const mine = readAll()[DEV];
  const p = PRESETS[forced] ? forced : mine && (PRESETS[mine.p] || mine.p === 'custom') ? mine.p : DEFAULTS[DEV];
  Object.assign(O, PRESETS[p] || PRESETS.high);
  if (p === 'custom' && mine && mine.o) {
    const o = { ...mine.o };
    if (!(mine.rv >= 2) && RESOLUTION_PRESETS[DEV]) o.px = migrateResolution(o.px, DEV) ?? PRESETS[DEFAULTS[DEV]].px;
    if (!(mine.fv >= 2) && Number.isInteger(o.fps)) o.fps = [0, 2, 3][o.fps] ?? o.fps;   // сохранено до 09.10.2026: к/с были 30 / 60 / как у экрана
    for (const it of ITEMS) { const v = clampItem(it, o[it.id]); if (v !== null) O[it.id] = v; }
    if (o.shadow === undefined) O.shadow = (PRESETS[DEFAULTS[DEV]] || PRESETS.high).shadow;   // «своя» сохранена до пункта «тени» (25.10.2026) — как у пресета устройства
  }
  PRESET = whichPreset();
}
function whichPreset () {
  for (const p of ORDER) if (ITEMS.every(it => PRESETS[p][it.id] === O[it.id])) return p;
  return 'custom';
}
function save () {
  if (PRESETS[Q.get('gfx')]) return;             // отладочный пресет из адреса — не сохраняем
  const all = readAll();
  all[DEV] = PRESET === 'custom' ? { p: 'custom', o: { ...O }, fv: 2, rv: 2 } : { p: PRESET, rv: 2 };   // fv — номера пункта к/с: 30 / 40 / 60 / без ограничения
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
export const pixelShort = () => { const v=val('px');return Array.isArray(v)?Math.min(...v):v||Infinity; };
export function renderSize(w,h,dpr=1,choice=val('px')) { return resolutionSize(choice,w,h,dpr); }
export const every = () => val('far');                         // вдали — раз в столько кадров
export const fxLow = () => !val('fx');
/* сглаживание: контекст WebGL создаётся один раз — значение на момент запуска (game.js), смена — после перезапуска */
export const aa = () => !!val('aa');
const AA0 = aa();
/* мягкие края (FXAA одним проходом, fxaa.js / dynres.js) — меняется сразу; ?fxaa=0 / ?fxaa=1 — на этот запуск (замеры) */
const FXAA_Q = Q.get('fxaa');
export const edge = () => (FXAA_Q === '0' ? false : FXAA_Q === '1' ? true : !!val('edge'));
/* тени: настоящие от солнца (sunshadow.js, 2г2) — только где пункт «тени: настоящие» (по умолчанию — «Высокая»); сразу, без перезапуска */
export const realShadows = () => !!val('shadow');
export const winQ = () => (val('win') ? { interior: 1, lod: 70 } : { interior: 0, lod: 0 });
/* прятать дальше (м): прохожих, машин; ближний/дальний вариант человечка */
/* мелочь мира — по пункту «дальность» (свой пункт в окне не заводим): мелочь на газоне
   (lawnprops.js) — радиус клеток R, трава / одуванчики / мусор — до small, доля травы,
   зарослей и мусора — thin; краска газона (lawn.js) — полная (1) или облегчённая (0:
   без тени-рельефа и мелких октав шума — на Деке это ~треть времени видеокарты на землю) */
/* small — до края, где трава уже исчезла; полоса роста из земли — 14 м и ещё 6 м запаса (lawnprops.js FADE_S, FADE_LAG):
   видно примерно до small − 13 м. 17.10.2026: средняя 50 → 64 (трава видна до ~51 м, как до 04.10, а не до ~37),
   высокая 60 → 72 (~59 м) — чтобы высокая не была ближе средней; на «Деке» кадр тот же (травы в кадре сотни штук) */
/* meadow — некошеная трава рядом с камерой (meadow.js, 2г8): 1 — только ближняя и редкая, 2 — ближняя и дальняя пореже,
   3 — полная (25.10.2026) */
export const DETAIL = [
  { R: 80, small: 40, thin: 0.5, lawn: 0, meadow: 1 },     // низкая
  { R: 100, small: 64, thin: 0.7, lawn: 0, meadow: 2 },    // средняя (Steam Deck)
  { R: 120, small: 72, thin: 1, lawn: 1, meadow: 3 },      // высокая
];
/* 18.10.2026: мелочь газона ближе, пока кадр тяжёлый (tune.js «облегчение»: small × M.small; у края она и так растёт из земли) */
const DET_T = { R: 0, small: 0, thin: 0, lawn: 0, meadow: 0, meadowK: 1 };
export const detail = () => {
  const D = DETAIL[O.range] || DETAIL[2], m = TUNE.M.small;
  if (m >= 1) return D;
  DET_T.R = D.R; DET_T.small = D.small * m; DET_T.thin = D.thin; DET_T.lawn = D.lawn; DET_T.meadow = D.meadow; DET_T.meadowK = m;   // трава (meadow.js): реже на ту же долю, без пересборки
  return DET_T;
};
export const hideR = () => (O.far === 0 ? { people: 100, cars: 200, lod: 32 } : { people: 130, cars: 220, lod: 45 });
/* что видно сейчас (game.js cullFar, humanLod, стоящие машины): hideR, а пока кадр тяжёлый — ближе (tune.js);
   плотность и рождение (yardlife.js и др.) — по hideR, чтобы облегчение не меняло, сколько жизни вокруг */
const VIEW_R = { people: 0, cars: 0, lod: 0 };
export const viewR = () => {
  const R = hideR(), M = TUNE.M;
  VIEW_R.people = R.people * M.people; VIEW_R.cars = R.cars * M.cars; VIEW_R.lod = R.lod * M.lod;
  return VIEW_R;
};

/* ── «тяжёлый кадр»: мыло вместо рывка (dynres.js) ──
   Вкл / выкл — отдельно от пресета (в «свою» не превращает), по виду устройства, в том же ключе dlv-gfx
   (поле dyn). ?dyn=0 / ?dyn=1 — на этот запуск, не сохраняется.
   По умолчанию вкл на всех устройствах (автор 18.10.2026: «по дефолту ставить блюр вместо рывка»; прежнее «что за
   блюр?» — выкл везде — отменено). Кто сам выбрал в настройках (значение dyn сохранено только по нажатию игрока,
   setDyn) — у того остаётся как выбрал, и выкл тоже */
export const DYN_DEF = { ios: 1, phone: 1, deck: 1, pc: 1 };
const DYN_Q = Q.get('dyn');
let DYN = (() => { const v = readAll().dyn; return v && (v[DEV] === 0 || v[DEV] === 1) ? v[DEV] : DYN_DEF[DEV]; })();
if (DYN_Q === '0' || DYN_Q === '1') DYN = +DYN_Q;
export const dynOn = () => DYN;
export function setDyn (v) {
  DYN = v ? 1 : 0;
  if (DYN_Q === '0' || DYN_Q === '1') return;
  const all = readAll(); all.dyn = { ...(all.dyn || {}), [DEV]: DYN }; writeAll(all);
}

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
  const n = val('far') + TUNE.M.extraLag;        // тяжёлый кадр — вдали ещё реже (tune.js)
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
   (CULL.Q.lvl > 0). На Высокой это и есть повод предложить Среднюю — маленькой
   бумажкой в правом нижнем углу на 15 с, один раз на устройство. В езде она
   ничего не ждёт и не перекрывает: «[X] включить» — кнопкой X геймпада или
   клавишей X (в езде обе свободны), пальцем / мышью — по самой кнопке; «не надо» —
   только пальцем / мышью, иначе сама уходит через 15 с (game.js padStep / keydown → offerYes). */
let offerEl = null;
export function watch (playing) {
  if (offerEl && offerEl.hidden === playing) offerEl.hidden = !playing;   // пауза, карта, повтор, диалог — записку прячем: X там не её
  if (PRESET !== 'high' || !playing || !(CULL.Q.lvl > 0) || offerEl !== null) return;
  const all = readAll();
  if (all.offered && all.offered[DEV]) return;
  all.offered = { ...(all.offered || {}), [DEV]: 1 }; writeAll(all);
  offer();
}
function offer () {
  const el = offerEl = document.createElement('div');
  el.className = 'gfx-offer pp-ride';
  el.innerHTML = '<span>' + t('кадр не успевает — включить графику «средняя»?') + '</span>' +
    '<button type="button" data-a="yes">' + keyHTML('x') + t('включить') + '</button><button type="button" data-a="no">' + t('не надо') + '</button>';
  el.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button[data-a]');
    if (!b) return;
    if (b.dataset.a === 'yes') setPreset('mid');
    closeOffer();
  });
  document.body.appendChild(el);
  setTimeout(() => { if (offerEl === el) closeOffer(); }, 15000);
}
function closeOffer () {
  const el = offerEl;
  if (el && el.parentNode) el.parentNode.removeChild(el);
  offerEl = el ? 0 : offerEl;                       // 0 — уже предлагали в этот запуск (null — ещё нет)
}
/** X геймпада / клавиша X в езде: плашка «включить „среднюю“?» на экране — включить; true — нажали её */
export function offerYes () {
  if (!offerEl) return false;
  const b = offerEl.querySelector('button[data-a="yes"]');
  if (b) b.classList.add('pp-down');
  setPreset('mid');
  setTimeout(closeOffer, 120);                      // кнопка успевает вдавиться
  return true;
}

/* ── окно «графика» в настройках ──
   body — куда рисовать, focus — id кнопки после перерисовки */
function itemText (it, v) {
  switch (it.id) {
    case 'fps': return it.vals[v] ? String(it.vals[v]) : t('без ограничения');
    case 'range': return [t('близко'), t('средне'), t('далеко')][v] + ' · ' + t('{m} м', { m: it.vals[v] });
    case 'menu': return v === 0 ? t('застывший кадр') : v === 1 ? t('{n} к/с', { n: 30 }) : t('живой');
    case 'px': {
      const canvas = document.getElementById('view');
      const [w, h] = renderSize(canvas?.clientWidth || innerWidth, canvas?.clientHeight || innerHeight, window.devicePixelRatio || 1, it.vals[v]);
      return w + ' × ' + h + (it.vals[v] === 0 ? ' · ' + t('полное') : '');
    }
    case 'win': return v ? t('вкл') : t('выкл');
    case 'fx': return v ? t('все') : t('меньше');
    case 'far': return v === 2 ? t('каждый кадр') : t('раз в {n} кадра', { n: it.vals[v] });
    case 'aa': return (v ? t('вкл') : t('выкл')) + (!!v !== AA0 ? ' · ' + t('после перезапуска') : '');
    case 'edge': return v ? t('вкл') : t('выкл');
    case 'shadow': return v ? t('настоящие') : t('поддельные');
  }
  return String(v);
}
/* card — карточка «графика» в карусели настроек (settings.js): без заголовка, пункты — сеткой,
   у «качества» data-main (на неё встаёт геймпад) */
export function panel (body, focus, card) {
  const btn = (id, txt, main) => '<button type="button" id="' + id + '"' + (id === focus ? ' autofocus' : '') + (main && card ? ' data-main' : '') + '>' + txt + '</button>';
  const resolution = ITEMS.find(it => it.id === 'px');
  const resolutionRow = '<div class="set-row"><label for="gfx-px">' + t(resolution.label) + '</label><select id="gfx-px"' +
    (focus === 'gfx-px' ? ' autofocus' : '') + '>' + resolution.vals.map((v,i) => '<option value="' + i + '"' +
    (i === O.px ? ' selected' : '') + '>' + itemText(resolution,i) + '</option>').join('') + '</select></div>';
  const row = (label, id, txt, main) => '<div class="set-row"><span>' + label + '</span>' + btn(id, txt, main) + '</div>';
  body.innerHTML = (card ? '' : '<div class="pn-t">' + t('графика') + '</div>') +
    row('<b>' + t('качество') + '</b>', 'gfx-p', presetName(), true) +
    '<div class="set-rows">' + ITEMS.map(it => it.id === 'px' ? resolutionRow : row(t(it.label), 'gfx-' + it.id, itemText(it, O[it.id]))).join('') +
    row(t('тяжёлый кадр'), 'gfx-dyn', DYN ? t('мыло вместо рывка') : t('рывок вместо мыла')) +
    '<div class="pn-n">' + t('меньше разрешение — выше скорость; интерфейс остаётся чётким. «Тяжёлый кадр» может временно снижать разрешение ещё сильнее') + '</div>' +
    // «сглаживание» и «мягкие края» рядом — непонятно, чем отличаются (ревью 23.10, Р23-7)
    '<div class="pn-n set-aa-n">' + t('сглаживание — ровные края домов и машин, грузит видеокарту; мягкие края — лёгкое сглаживание всего кадра, почти даром') + '</div></div>' +
    '<div class="pn-n">' + t('графика не меняет игру: машины и люди рядом, клиенты и физика — одинаковые на любой') + '</div>';
  const again = id => panel(body, id, card);
  body.querySelector('#gfx-p').onclick = () => {
    const i = ORDER.indexOf(PRESET);
    setPreset(ORDER[(i + 1) % ORDER.length]);      // «своя» → низкая
    again('gfx-p');
  };
  for (const it of ITEMS.filter(it => it.id !== 'px')) body.querySelector('#gfx-' + it.id).onclick = () => { set(it.id, (O[it.id] + 1) % it.vals.length); again('gfx-' + it.id); };
  const select=body.querySelector('#gfx-px');
  select.onchange=()=>{set('px',Number(select.value));body.querySelector('#gfx-p').textContent=presetName();};
  // Стрелки/Enter/поиск по буквам обрабатывает сам список, не навигация игры.
  select.onkeydown=e=>{if(e.code!=='Escape')e.stopPropagation();};
  select.onkeyup=e=>e.stopPropagation();
  body.querySelector('#gfx-dyn').onclick = () => { setDyn(!DYN); again('gfx-dyn'); };
}

// Размер окна может поменяться, пока открыты настройки.
addEventListener('resize', () => {
  const select = document.getElementById('gfx-px'), item=ITEMS.find(it => it.id === 'px');
  if (select) for(const option of select.options)option.textContent=itemText(item,Number(option.value));
});

/* отладка: __dlv.GFX */
export const DEBUG = {
  get dev () { return DEV; }, get preset () { return PRESET; }, get opts () { return { ...O }; },
  set, setPreset, STATS, ITEMS, PRESETS, DETAIL, poke, get dyn () { return DYN; }, setDyn,
  offer: () => { offerEl = null; offer(); return true; },   // показать плашку «кадр не успевает» сразу (проверка вида)
  /* время кадра CPU за последние n кадров: p50 / p95, мс */
  work (n = 300) { const s = STATS.work.slice(-n).sort((a, b) => a - b), q = p => (s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : 0); return { n: s.length, p50: q(0.5), p95: q(0.95) }; },
};
