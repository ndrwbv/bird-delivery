/* ──────────────────────────────────────────────────────────────────────────
   Стёпа на лавочке (docs/ORDERS.md «Герои города» → «Стёпа на лавочке»).
   В АРХИВЕ, автор 10.10.2026: сюжет героев убран (heroes.js HERO.STORY = false) — Стёпа сам не
   заказывает; лавочка у подъезда ставится как раньше — на ней первый заказ (stepafirst.js).
   Стёпа Тугарев сидит на лавочке у своего дома — Ленинградская, 8 — и сам заказывает
   пиццу. Заказ — на лавочку, клиент — он. Вручил — сразу сюжетный разговор (катсцена
   story.js, как главы героев): «спасибо… постреляю из лука… пиво стынет… на жидкий хлеб»
   и чаевые. Детская версия: квас вместо пива.

   Героев на улице нет (heroes.js HERO.STREET = false): Стёпа на лавочке — только
   пока идёт его заказ. Лавочка у подъезда — всегда (ставится один раз при сборке города).

   Когда (SB):
     • с SB.FROM-й смены карьеры, не чаще раза в SB.EVERY смены;
     • в подходящую смену — с шансом SB.CHANCE (бросок один раз на смену);
     • не первым заказом смены, с SB.HOURS[0] до SB.HOURS[1] часов игры;
     • дом в открытом районе и не дальше 1,6 × дальности района от пиццерии (orders.js storyNear);
     • лавочку снесли машиной — в эту смену не заказывает.
   Награда: обычная оплата заказа + катсцена: SB.STARS ★ и SB.TIP ₽ «на жидкий хлеб».

   init(api) — game.js: { CITY, ADULT, CAREER, bench(x, z) → prop | null, realAddress(x, z) }
   отладка: __dlv.STEPAB
   ────────────────────────────────────────────────────────────────────────── */
import { N_ } from '../i18n/index.js';
import * as STORY from './story.js';
import * as HEROES from './heroes.js';
import * as PAVE from './pave.js';

export const SB = {
  ADDR: ['Ленинградская улица', '8'],
  FROM: 3,              // с какой смены карьеры
  EVERY: 3,             // не чаще раза в столько смен
  CHANCE: 0.5,          // в подходящую смену — с таким шансом
  HOURS: [12, 22],      // в какие часы игры
  STARS: 2,
  TIP: 700,             // ₽ «на жидкий хлеб», как видит игрок
  SEAT: 0.42,           // высота сиденья, м
};

let A = null;
const M = { place: null, prop: null, roll: {}, stats: { issued: 0, done: 0 } };

const CHAPTER = {
  name: N_('Любимая'), stars: SB.STARS, money: SB.TIP,
  label: N_('Стёпа: «на жидкий хлеб»'),
  items: N_('пицца — Стёпина любимая'),
  note: N_('Стёпа: «я на лавочке у восьмого дома. неси сюда, брат»'),
  why: N_('Стёпа Тугарев заказал пиццу себе на лавочку'),
  kids: { label: N_('Стёпа: «на квасок»') },
  script: [
    ['shot', 'establish', { cut: true }],
    ['walk', 'courier', 'front'],
    ['shot', 'two'],
    ['give'],
    ['act', 'stepa', 'nod'],
    ['say', 'stepa', N_('Спасибо за пиццу, это моя любимая.'), { emo: 'happy' }],
    ['shot', 'host', { cut: true }],
    ['say', 'stepa', N_('А теперь пойду постреляю из лука с окна на газон через дорогу.')],
    ['act', 'stepa', 'think'],
    ['say', 'stepa', N_('А, ещё пиво стынет, так что пока.'), { emo: 'surprised', adult: true }],
    ['say', 'stepa', N_('А, ещё квас стынет, так что пока.'), { emo: 'surprised', adult: false }],
    ['shot', 'two'],
    ['act', 'stepa', 'give'],
    ['say', 'stepa', N_('На тебе на жидкий хлеб.'), { emo: 'happy', adult: true }],
    ['say', 'stepa', N_('На тебе на квасок.'), { emo: 'happy', adult: false }],
    ['act', 'stepa', 'wave'],
    // уходит домой: встаёт с лавочки и идёт в свой подъезд, курьер — к машине; сцена кончается,
    // когда Стёпа скрылся в двери (до 09.10.2026 он просто пропадал с лавочки)
    ['walk', 'courier', 'car', { wait: false }],
    ['walk', 'stepa', 'in'],
  ],
};

/* лавочка у подъезда Ленинградской, 8: вдоль стены, сбоку от двери (тропинка от двери — свободна) */
function buildBench () {
  const C = A.CITY, B = C.buildings || [];
  const b = B.find(q => q.a && q.a[0] === SB.ADDR[0] && q.a[1] === SB.ADDR[1]);
  if (!b) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  const doors = (C.entrances || []).filter(q => q[0] > x0 - 4 && q[0] < x1 + 4 && q[1] > z0 - 4 && q[1] < z1 + 4);
  for (const e of doors) {
    let [ex, ez, nx, nz] = e;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const sx = -nz, sz = nx;
    // ближайшее к двери место у стены, где не мощёно (тропинки у дома — свободны)
    const cand = [];
    for (let k = -8; k <= 8; k += 0.8) for (let out = 1.9; out <= 6; out += 0.7) if (Math.abs(k) >= 2.2) cand.push([k, out, Math.abs(k) + out * 1.5]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [k, out] of cand) {
      const x = ex + nx * out + sx * k, z = ez + nz * out + sz * k;
      if (PAVE.onPave(x, z, 1.3)) continue;
      const p = A.bench(x, z);
      if (!p) continue;
      const ry = p.ry, fx = Math.sin(ry), fz = Math.cos(ry);
      // куда ставить машину: перед лавочкой, на 5 м
      M.prop = p;
      return { ex: x, ez: z, nx: fx, nz: fz, sx: -fz, sz: fx, x: x + fx * 5, z: z + fz * 5,
        door: { x: ex, z: ez, nx, nz },                          // в конце сцены уходит сюда (story.js 'in')
        addr: A.realAddress ? A.realAddress(ex + nx * 2, ez + nz * 2) : SB.ADDR.join(', ') };
    }
  }
  return null;
}

function ready (ctx, p, shift) {
  // в архиве, автор 10.10.2026: сюжет героев убран (heroes.js HERO.STORY) — Стёпа сам не заказывает;
  // лавочка у Ленинградской, 8 по-прежнему ставится (на ней — первый заказ, stepafirst.js)
  if (!HEROES.HERO.STORY) return false;
  if (!A || !A.CAREER || !M.place) return false;
  if (M.prop && M.prop.down) return false;                     // лавочку снесли
  if (shift < SB.FROM) return false;
  if (p.last !== undefined && p.last > -99 && shift - p.last < SB.EVERY) return false;
  if ((ctx.shiftOrders | 0) < 1) return false;                // не первым заказом смены
  if (ctx.hour !== undefined && ctx.hour !== null && (ctx.hour < SB.HOURS[0] || ctx.hour >= SB.HOURS[1])) return false;
  if (M.roll[shift] === undefined) M.roll[shift] = Math.random() < SB.CHANCE;
  if (!M.roll[shift]) return false;
  M.stats.issued++;
  return true;
}

function storyDef () {
  const def = HEROES.DEFS.find(d => d.id === 'stepa');
  return {
    id: 'stepa-bench', name: def.name,
    arch: true,                                   // в архиве, автор 10.10.2026 (story.js nextOrder, heroes.js HERO.STORY)
    who: { seed: def.seed, fem: def.fem, look: def.look },
    items: CHAPTER.items,
    chapters: [CHAPTER],
    sit: SB.SEAT,
    model: () => HEROES.model('stepa'),
    place: () => M.place,
    ready: (ctx, p, shift) => ready(ctx, p, shift),
    decorate: o => { o.noGuest = true; },
    // заказ повторяется: глава снова первая, следующий раз — через SB.EVERY смен
    onDone: () => { const p = STORY.progOf('stepa-bench'); p.ch = 0; STORY.persist(); M.stats.done++; },
  };
}

export function init (api) {
  A = api;
  if (M.ready) return;
  M.ready = true;
  M.place = buildBench();
  STORY.register(storyDef());
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.STEPAB = DEBUG; }, 0);
}

export const DEBUG = { SB, M, get place () { return M.place; }, force: () => STORY.orderFor('stepa-bench', 0) };
