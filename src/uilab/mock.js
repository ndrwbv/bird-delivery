/* Песочница интерфейса: игра без мира. То, что game.js отдаёт модулям (api карьеры, хранилище,
   звук), — тут заглушками. Сохранение — только в памяти: песочница не трогает прогресс игрока.

     memStore()           — { get(k, d), set(k, v), flush(), clear(), dump() } — как Store игры
     makeApi({ adult, money, Store, person, face }) — api для career.js (CAREERM.init): всё, чего нет
                            в заглушке, — пустая функция (новые поля api не роняют песочницу)
     countUp(el, to, fmt, ms) — копия из game.js: цифра докручивается */
import { tOfHour, DONATE } from '../game/econ.js';

const noop = () => {};
/* «нет такого поля» → пустая функция; then / toJSON / символы — нет (иначе await и JSON сломаются) */
const SKIP = new Set(['then', 'toJSON', 'constructor', 'prototype', '$$typeof']);
const loose = obj => new Proxy(obj, { get: (o, k) => (k in o || typeof k !== 'string' || SKIP.has(k) ? o[k] : noop) });

export function memStore (seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    get: (k, d) => (m.has(k) && m.get(k) !== null && m.get(k) !== undefined ? m.get(k) : d),
    set: (k, v) => { m.set(k, v); },
    remove: k => { m.delete(k); },
    flush: noop,
    clear: () => m.clear(),
    dump: () => Object.fromEntries(m),
  };
}

/* звук: песочница молчит (Snd.coin(), Snd.blip(…) — ничего не делают) */
export const Snd = loose({});

export function countUp (el, to, fmt, ms) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/* курьеры рейтинга пиццерии — цвета и пол, как RIVAL_SPEC в game.js */
const RIVALS = [{ hex: '#2f8f5b' }, { hex: '#8e5bd8' }, { hex: '#3f7fd6' }, { hex: '#d9537a', fem: true }];

export function makeApi ({ adult, money, Store, person, face }) {
  const ENV = { t: tOfHour(9) };
  const W = { v: 0 };
  const S = { money: 0, delivered: 0, tips: 0, people: 0, hurt: 0, state: 'over', orders: 1 };
  const api = {
    S, NOS: {}, Store, Snd, ADULT: !!adult, CAREER: true,
    env: () => ENV,
    money,
    wallet: () => W.v,
    setWallet: v => { W.v = Math.max(0, Math.round(v || 0)); },
    addWallet: n => { W.v = Math.max(0, W.v + Math.round(n || 0)); },
    pay: n => { const p = Math.min(W.v, n); W.v -= p; return p; },
    donated: k => Math.max(0, Math.min(1, (+Store.get('dlv-don-' + k, 0) || 0) / ((DONATE[k] && DONATE[k].goal) || 1))),
    countUp,
    isPlaying: () => false,
    choiceOpen: () => false,
    panelOpen: () => false,
    playerName: () => String(Store.get('dlv-name', '') || ''),
    setName: n => Store.set('dlv-name', n),
    rivalSpec: () => RIVALS.map(q => ({ hex: q.hex, fem: !!q.fem })),
    rivals: () => [],
    person, face,
  };
  return loose(api);
}
