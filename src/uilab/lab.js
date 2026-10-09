/* Песочница интерфейса — экран игры без мира (рамка ui.html?frame). Модули игры настоящие:
   career.js (итоги смены), shiftend.js (деньги кучей, Толик), chat.js, dialog.js, orders.js (полоса
   накладной) — на заглушке api (mock.js) и сохранении в памяти. Что повторяет код game.js (накладная,
   оплата, воскрешение), написано в screens/hud.js.

   window.__ui — для панели (shell.js) и probe:
     __ui.list()               → экраны [{ id, group, name, note, knobs, auto }]
     await __ui.show(id, ручки) — показать экран (ручки — { ключ: значение }, чего нет — по умолчанию)
     __ui.reset()               — убрать всё
     __ui.setTouch(on), __ui.setHud(on) — телефонный хад (body.touch), показать хад
     __ui.onLog(fn)             — fn(текст, вид): что происходит на экране (ответы в диалогах и т. п.)
     __ui.info()                → { lang, adult, langs, cur }

   Экран — { id, group, name, note?, knobs: [ручка], auto?, show(o, tok) }; ручка —
   { k, label, type: 'num' | 'bool' | 'sel' | 'text', def, min, max, step, opts: [[значение, подпись, группа?]] }.
   auto: false — панель не перепоказывает экран на каждую ручку (диалоги — по кнопке). */
import * as ECON from '../game/econ.js';
import * as DIST from '../game/districts.js';
import * as CHAT from '../game/chat.js';
import * as DLG from '../game/dialog.js';
import * as END from '../game/shiftend.js';
import * as CAREERM from '../game/career.js';
import * as HQ from '../game/heroquests.js';
import * as ORD from '../game/orders.js';
import { makePerson, faceDataURL } from '../game/people.js';
import { loadMap } from '../maps/index.js';
import { useMap } from '../game/map.js';
import { t, tn, LANGS, LANG_NAMES } from '../i18n/index.js';
import { memStore, makeApi } from './mock.js';
import shiftEndScreens from './screens/shiftend.js';
import hudScreens from './screens/hud.js';
import dialogScreens from './screens/dialogs.js';
import paperScreens from './screens/paper.js';
import soundScreens from './screens/sounds.js';
import { minigameScreens } from './minigames.js';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* машина игрока для реплик Жеки ({ when: car('home') }, {car} в тексте) — ручка «машина» в диалогах */
const CARS = {
  home: { id: 'semerka', name: () => t('Семёрка'), hex: '#f0522a' },
  china: { id: 'belgik', name: () => t('Белджик X-50'), hex: '#d23a2f' },
  both: { id: 'cheri', name: () => t('Чери-Мери'), hex: '#f2c21b' },
  yellow: { id: 'semerka', name: () => t('Семёрка'), hex: '#f2c21b' },
  other: { id: 'cruze', name: () => t('Шеви Круиз'), hex: '#b7bcc3' },
};
let CAR = 'home';
const carNow = () => { const c = CARS[CAR] || CARS.home; return { id: c.id, name: c.name(), hex: c.hex }; };

export async function boot ({ adult, lang }) {
  const Store = memStore();
  const NUMF = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : lang);
  const money = n => NUMF.format(Math.round(n || 0)) + ' ₽';
  const person = o => makePerson(o);
  const A = makeApi({ adult, money, Store, person, face: (p, size) => faceDataURL(p, size) });

  // районы — настоящие (карта Северска: названия и порядок), заказы и пиццерии не нужны
  const MAP = await loadMap('seversk');
  try { useMap(MAP); } catch (e) { /* — */ }
  DIST.init({ MAP, Store });
  CHAT.init({ adult, person: makePerson({ seed: 0x2E4A17, fem: false }), face: (p, size) => faceDataURL(p, size), blip: null });
  DLG.init({ pause: () => {}, face: (p, size) => faceDataURL(p, size) });
  window.__dlv = window.__dlv || {};                 // career.js кладёт сюда свою отладку (__dlv.CAREERM: SH, skipTo, openSpend…)
  CAREERM.init(A);
  HQ.init({ A, cars: () => ({ current: carNow }) });
  await sleep(0);
  const CM = window.__dlv.CAREERM;
  paintBg();
  addEventListener('resize', paintBg);

  /* ── журнал для панели ── */
  const subs = [];
  const log = (msg, kind = '') => { for (const f of subs) { try { f(String(msg), kind); } catch (e) { /* — */ } } };

  /* ── убрать всё, что могли показать экраны ── */
  let TOK = { dead: true };
  const reset = () => {
    TOK.dead = true;
    for (let i = 0; i < 6 && DLG.isOpen(); i++) DLG.dismiss();
    CHAT.clear();
    const ov = $('over'); if (ov) ov.hidden = true;
    const pay = $('cr-payout'); if (pay) pay.remove();
    for (const id of ['cr-spend', 'payfx', 'choice', 'wasted', 'ul-mg']) { const e = $(id); if (e) { e.hidden = true; e.classList.remove('on', 'fly'); } }
    try { if (CM.closeDep) CM.closeDep(); } catch (e) { /* — */ }
    try { if (CM.closeGarage) CM.closeGarage(); } catch (e) { /* — */ }
    const ph = $('phone'); if (ph) ph.classList.remove('on');
    document.body.classList.remove('brief', 'w-show');
    if (ctx.cleanup) { const f = ctx.cleanup; ctx.cleanup = null; try { f(); } catch (e) { /* — */ } }
  };

  const ctx = {
    A, Store, ADULT: !!adult, LANG: lang, money, t, tn, log, sleep, $, reset, cleanup: null,
    CM, END, CHAT, DLG, DIST, ECON, ORD, HQ, makePerson, faceDataURL,
    setCar: k => { CAR = CARS[k] ? k : 'home'; }, carNow,
  };
  const SCREENS = [...shiftEndScreens(ctx), ...dialogScreens(ctx), ...hudScreens(ctx), ...paperScreens(ctx), ...soundScreens(ctx), ...minigameScreens(ctx)];
  const byId = new Map(SCREENS.map(s => [s.id, s]));
  let cur = '';

  window.__ui = {
    ready: true,
    list: () => SCREENS.map(s => ({ id: s.id, group: s.group, name: s.name, note: s.note || '', knobs: s.knobs || [], auto: s.auto !== false })),
    async show (id, vals = {}) {
      const s = byId.get(id);
      if (!s) { log('нет экрана «' + id + '»', 'err'); return false; }
      reset();
      cur = id;
      const o = {};
      for (const k of s.knobs || []) o[k.k] = vals[k.k] !== undefined ? vals[k.k] : k.def;
      const tok = TOK = { dead: false };
      try { await s.show(o, tok); } catch (e) { console.error('[uilab]', e); log(s.name + ': ' + (e && e.message || e), 'err'); return false; }
      return true;
    },
    reset () { reset(); cur = ''; },
    setTouch (on) { document.body.classList.toggle('touch', !!on); dispatchEvent(new Event('resize')); },
    setHud (on) { document.body.classList.toggle('uilab-hud', !!on); dispatchEvent(new Event('resize')); },
    onLog (fn) { if (typeof fn === 'function') subs.push(fn); },
    info: () => ({ lang, adult: !!adult, langs: LANGS.map(l => [l, LANG_NAMES[l] || l]), cur }),
    ctx,
  };
}

/* фон вместо города: вечернее небо и силуэты панелек с окнами (всегда одинаковые) */
function paintBg () {
  const cv = $('view');
  if (!cv) return;
  const w = cv.width = Math.max(1, innerWidth), h = cv.height = Math.max(1, innerHeight);
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#34448a'); sky.addColorStop(0.6, '#b0627a'); sky.addColorStop(1, '#2a2235');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let x = -20; x < w;) {
    const bw = 60 + rnd() * 110, bh = h * (0.25 + rnd() * 0.35);
    g.fillStyle = ['#2b2f4a', '#33395a', '#262a42'][Math.floor(rnd() * 3)];
    g.fillRect(x, h - bh, bw, bh);
    g.fillStyle = 'rgba(255, 216, 94, .55)';
    for (let wy = h - bh + 12; wy < h - 14; wy += 18) for (let wx = x + 8; wx < x + bw - 10; wx += 16) if (rnd() < 0.3) g.fillRect(wx, wy, 7, 9);
    x += bw + 4 + rnd() * 18;
  }
  g.fillStyle = '#1b1d2a'; g.fillRect(0, h * 0.93, w, h * 0.07);
}
