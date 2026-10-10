/* ──────────────────────────────────────────────────────────────────────────
   Учебный заказ Стёпы — сюжетный (docs/CAREER.md «Учебный заказ и кальянщики»,
   docs/ORDERS.md «Сюжетные заказы» → «Первый заказ — Стёпа»; автор, 10.10.2026:
   «Первая доставка должна быть Стёпе, и она должна быть сюжетная»).

   Самый первый заказ за всё время — Стёпа Тугарев на лавочке у своего дома, **Ленинградская, 8**
   (та же лавочка, что у «Стёпы на лавочке», stepabench.js; game.js stepanOrder; автор 10.10.2026),
   курит кальян — облака дыма видно издалека. Заказ розовый, как главы героев: накладная «история»,
   пин и радар — цветом сюжета (S.order.look). Нет такого дома в карте (или лавочку снесли) —
   ближайшая лавочка во дворе, как раньше.

   Вручение — короткая катсцена на движке сюжетных сцен (story.js, живые лица actorlife.js):
   курьер подходит с коробкой — «Новичок? Пон, пон. Калик будешь?» — «Не, я на смене.» — Стёпа
   кладёт пиццу на лавочку — «Давай краба.» — рукопожатие (жест story.js 'hand') — «Стёпа.» — «А я — <имя игрока>.» — кивает,
   курьер идёт к машине. [B] / Esc — пропустить с первой секунды. Детская версия: «Чаю будешь?».

   Деньги — как были у учебного заказа (game.js checkArrival): глава без награды (noReward), чек
   оплаты — после сцены; строка «за скорость» в нём — «чаевые Стёпы · за скорость».

     ST1.init(api)              — один раз из game.js
     ST1.play(ped, o) → bool    — отдали учебный заказ: сцена началась (false — не вышло, тогда старый
                                  прикол hints.js stepan); o: { tipped, done() } — done после сцены
   api: { THREE, ADULT, V, fxAdd, puffGeo, groundH, Snd, sayBubble, makeHuman, stepanPerson, playerName, cam }
   отладка: __dlv.STEPA1
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as STORY from './story.js';
import { part as fxPart } from './fxpool.js';    // частицы из общего запаса (fxpool.js)
import * as HEROES from './heroes.js';

export const S1 = {
  SEAT: 0.42,           // высота сиденья лавочки, м (как stepabench.js SB.SEAT)
  PUFF: [3, 4.5],       // Стёпа затягивается и выдыхает облако раз в столько секунд, пока идёт сцена
};

let A = null;
const M = { spot: null, on: false, puffT: 1.2, stats: { played: 0, skipped: 0, ans: null, ms: 0 } };

const rand = (a, b) => a + Math.random() * (b - a);

/* Разговор — словами автора (10.10.2026): «Новичок? Пон, пон. Калик будешь?» — «Не, я на смене.» —
   кладёт пиццу на лавочку — «Давай краба.» — рукопожатие — «Стёпа.» — «А я — <имя игрока>.»
   Детская версия: чай вместо кальяна. */
const myName = () => {
  const n = String((A && A.playerName && A.playerName()) || '').trim().split(/\s+/)[0];
  return n || t('курьер');
};
const CHAPTER = {
  name: N_('Новичок'), stars: 0, money: 0, noReward: true,
  script: [
    ['shot', 'establish', { cut: true }],
    ['walk', 'courier', 'front', { wait: false }],
    ['wait', 1.1],
    ['shot', 'two'],
    ['walk', 'courier', 'front'],
    ['give'],
    ['shot', 'host', { cut: true }],
    ['say', 'stepa', N_('Новичок? Пон, пон.')],
    ['say', 'stepa', N_('Калик будешь?'), { emo: 'happy', adult: true }],
    ['say', 'stepa', N_('Чаю будешь?'), { emo: 'happy', adult: false }],
    ['shot', 'courier', { cut: true }],
    ['say', 'courier', N_('Не, я на смене.')],
    // кладёт пиццу на лавочку рядом с собой (автор 10.10.2026: с коробкой в руках краб выходил «в четыре руки»)
    ['shot', 'two', { cut: true }],
    ['do', o => boxOnBench(o)],
    ['act', 'stepa', 'give', 0.6],
    ['wait', 0.5],
    ['say', 'stepa', N_('Давай краба.')],
    // краб: курьер подходит на расстояние руки, оба тянут правую — рукопожатие
    ['walk', 'courier', 'close'],
    ['face', 'stepa', 'courier'],
    ['face', 'courier', 'stepa'],
    ['act', 'stepa', 'hand'],
    ['act', 'courier', 'hand'],
    ['wait', 1.7],
    ['say', 'stepa', N_('Стёпа.')],
    ['say', 'courier', N_('А я — {name}.'), { vars: () => ({ name: myName() }) }],
    ['act', 'stepa', 'nod'],
    ['wait', 0.8],
    ['walk', 'courier', 'car', { wait: false }],
    ['wait', 1.4],
  ],
};

/* коробка из рук Стёпы — на лавочку рядом с ним (в мире, не в руках); после сцены убирается (play) */
function boxOnBench (o) {
  const a = o.actor('stepa'), h = o.home;
  if (!a || !a.hold || !a.grp.parent) return null;
  const box = a.hold, par = a.grp.parent;
  par.attach(box);
  const sx = h ? h.sx : Math.cos(a.h), sz = h ? h.sz : -Math.sin(a.h);
  // на ту сторону лавочки, что ближе к камере, и надписью на крышке к камере (автор 10.10.2026: «пусть пицца лежит к камере»)
  const cp = A.cam && A.cam(), cx = cp ? cp.position.x : a.x, cz = cp ? cp.position.z : a.z;
  const side = ((a.x + sx - cx) ** 2 + (a.z + sz - cz) ** 2) < ((a.x - sx - cx) ** 2 + (a.z - sz - cz) ** 2) ? 1 : -1;
  const x = a.x + sx * 0.85 * side, z = a.z + sz * 0.85 * side;
  box.position.set(x, A.groundH(x, z) + 0.82, z);
  box.rotation.set(0, Math.atan2(cx - x, cz - z), 0);
  a.hold = null;
  M.box = box;
  return null;
}
/* облака: дым кальяна (взрослая) или пар самовара (детская) — белые клубы из puffGeo */
function cloud (x, y, z, vx, vz, n, big, life) {
  const gy = A.groundH(x, z);
  for (let k = 0; k < n; k++) {
    const px = x + rand(-0.15, 0.15), py = gy + y + rand(-0.05, 0.12), pz = z + rand(-0.15, 0.15);
    fxPart('puff', px, py, pz, A.ADULT ? (k % 3 ? 0xe9e7e2 : 0xf6f4f0) : 0xffffff, rand(0.35, 0.6) * big, A.ADULT ? 0.7 : 0.55,
      { vx: vx * rand(0.8, 1.15) + rand(-0.3, 0.3), vz: vz * rand(0.8, 1.15) + rand(-0.3, 0.3), vy: rand(0.25, 0.6), life: life || rand(3, 4.5), max: life || 4.5, grow: 0.5 });
  }
}
/* затяжка: облако от Стёпы вперёд, пока он сидит (как кальянщики hookah.js) */
function exhale (a, big = 1) {
  if (!a || a.hidden) return;
  const fx = Math.sin(a.h), fz = Math.cos(a.h), y = (a.sit ? 1.25 : 1.6);
  cloud(a.x + fx * 0.35, y, a.z + fz * 0.35, fx * 0.9, fz * 0.9, Math.round(6 * big), big);
}
function storyDef () {
  const def = HEROES.DEFS.find(d => d.id === 'stepa');
  return {
    id: 'stepa-first', name: def.name,
    who: { seed: def.seed, fem: def.fem, look: HEROES.look('stepa') },
    items: N_('пицца'),
    chapters: [CHAPTER],
    get sit () { return M.spot && M.spot.sit ? S1.SEAT : 0; },
    // тот же Степан, что ждал заказ (game.js stepanPerson), без болгарки: в руках — шланг кальяна
    model: () => A.makeHuman(A.stepanPerson()),
    place: () => M.spot,
    ready: () => false,                 // в очередь глав не ходит: сцену зовёт game.js на вручении учебного
    onDone: () => { const p = STORY.progOf('stepa-first'); p.ch = 0; STORY.persist(); },   // «сбросить прогресс» — сцена снова
  };
}

/* Стёпа выдыхает облака, пока идёт сцена (мир стоит — кальянщики hookah.js не дымят) */
function frame (dt, on) {
  if (!on || !M.on) return;
  if ((M.puffT -= dt) > 0) return;
  M.puffT = rand(S1.PUFF[0], S1.PUFF[1]);
  const a = STORY.DEBUG.CUT.actors.zina;
  if (a && !a.talk) exhale(a, 1);
}

/* где сцена: лавочка, на которой ждал (или где стоял, лицом к машине) */
function spotOf (ped) {
  const b = ped.sitAt || (ped.idle && ped.idle.b) || null;
  const sit = !!(b && ped.sitting);
  const x = sit ? b.x : ped.x, z = sit ? b.z : ped.z;
  const ry = sit ? b.ry : Math.atan2(A.V.x - x, A.V.z - z);
  const nx = Math.sin(ry), nz = Math.cos(ry);
  return { ex: x, ez: z, nx, nz, sx: -nz, sz: nx, x: x + nx * 5, z: z + nz * 5, addr: '', sit };
}

export function play (ped, o = {}) {
  if (!A || !ped || !ped.grp || ped.dead || STORY.active()) return false;
  M.spot = spotOf(ped);
  const t0 = performance.now();
  // в сцене его играет актёр; после — снова он, уже с пиццей. Не просто visible = false: катсцена каждый кадр
  // возвращает видимость всем прохожим рядом (game.js unview), и Стёпа-прохожий стоял внутри Стёпы-актёра —
  // две головы в одной, одна повёрнута к камере, другая нет (автор 10.10.2026: «лицо кривое») — убираем из сцены
  const g = ped.grp, par = g.parent;
  g.visible = false;
  if (par) par.remove(g);
  M.on = true; M.puffT = 0.8; M.stats.played++;
  const order = { storyId: 'stepa-first', chapter: 0 };
  STORY.play('stepa-first', 0, { order, cond: o.tipped ? 'ok' : 'bad' }).then(() => {
    M.on = false;
    if (M.box) { if (M.box.parent) M.box.parent.remove(M.box); M.box = null; }   // коробка с лавочки — у Стёпы в мире
    M.stats.skipped += STORY.DEBUG.CUT.skip ? 1 : 0;
    M.stats.ans = STORY.DEBUG.CUT.ans || null;
    M.stats.ms = Math.round(performance.now() - t0);
    if (par && ped.grp === g && !g.parent) par.add(g);
    if (!ped.dead) ped.grp.visible = true;
    if (o.done) { try { o.done(); } catch (e) { console.warn('[stepafirst] done', e); } }
  });
  return true;
}

export function init (api) {
  A = api;
  if (M.ready) return;
  M.ready = true;
  STORY.register(storyDef());
  STORY.onFrame(frame);
  if (typeof window !== 'undefined') window.setTimeout(() => { if (window.__dlv) window.__dlv.STEPA1 = DEBUG; }, 0);
}

const DEBUG = { S1, M, CHAPTER, get spot () { return M.spot; } };
