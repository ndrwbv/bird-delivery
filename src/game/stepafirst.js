/* ──────────────────────────────────────────────────────────────────────────
   Учебный заказ Стёпы — сюжетный (docs/CAREER.md «Учебный заказ и кальянщики»,
   docs/ORDERS.md «Сюжетные заказы» → «Первый заказ — Стёпа»; автор, 10.10.2026:
   «Первая доставка должна быть Стёпе, и она должна быть сюжетная»).

   Самый первый заказ за всё время — Степан Тугарев на лавочке с кальяном (game.js
   stepanOrder: лавочка в соседнем дворе, облака дыма — по ним и находишь). Заказ розовый, как
   главы героев: накладная «история», пин и радар — цветом сюжета (S.order.look).
   До руля ничего не добавилось: имя → накладная Степана → «ГАЗ ГАЗ».

   Вручение — короткая катсцена на движке сюжетных сцен (story.js, живые лица actorlife.js,
   как «Стёпа на лавочке» — stepabench.js): Стёпа сидит на лавочке, курьер подходит с коробкой,
   знакомство, «брат, вложишься в мой бизнес?» — два ответа кнопками ([A] «а что за бизнес?» /
   [X] «в другой раз»), чаевые (если были — за скорость, экономика заказа та же) и «я ещё
   закажу», в конце он выдувает облако прямо на машину, курьер кашляет «кхе-кхе». [B] / Esc —
   пропустить с первой секунды. Детская версия: самовар, пар, «пиццерия-чайная».

   Деньги — как были у учебного заказа (game.js checkArrival): глава без награды (noReward), чек
   оплаты — после сцены; строка «за скорость» в нём — «чаевые Стёпы · за скорость».

     ST1.init(api)              — один раз из game.js
     ST1.play(ped, o) → bool    — отдали учебный заказ: сцена началась (false — не вышло, тогда старый
                                  прикол hints.js stepan); o: { tipped, done() } — done после сцены
   api: { THREE, ADULT, V, fxAdd, puffGeo, groundH, Snd, sayBubble, makeHuman, stepanPerson }
   отладка: __dlv.STEPA1
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as STORY from './story.js';
import * as HEROES from './heroes.js';
import * as LIFE from './actorlife.js';

export const S1 = {
  SEAT: 0.42,           // высота сиденья лавочки, м (как stepabench.js SB.SEAT)
  PUFF: [3, 4.5],       // Стёпа затягивается и выдыхает облако раз в столько секунд, пока идёт сцена
  CLOUD_T: 1.1,         // за сколько секунд облако долетает до машины
};

let A = null;
const M = { spot: null, on: false, puffT: 1.2, stats: { played: 0, skipped: 0, ans: null, ms: 0 } };

const rand = (a, b) => a + Math.random() * (b - a);

const CHAPTER = {
  name: N_('Бизнес вот-вот будет'), stars: 0, money: 0, noReward: true,
  script: [
    ['shot', 'establish', { cut: true }],
    ['walk', 'courier', 'front', { wait: false }],
    ['wait', 1.1],
    ['shot', 'two'],
    ['say', 'stepa', N_('О, пицца! Стёпа. Бизнесмен — бизнес вот-вот будет.'), { emo: 'happy' }],
    ['walk', 'courier', 'front'],
    ['give'],
    ['shot', 'host', { cut: true }],
    ['ask', 'stepa', N_('Брат, вложишься в мой бизнес?'), { yes: N_('а что за бизнес?'), no: N_('в другой раз') }],
    // «а что за бизнес?» — смешной ответ; «в другой раз» — не обиделся
    ['say', 'stepa', N_('Кальянная на колёсах! Не… пиццерия-кальянная. Короче, вайбкодинг.'), { emo: 'happy', ans: 'yes', adult: true }],
    ['say', 'stepa', N_('Самоварная на колёсах! Не… пиццерия-чайная. Короче, вайбкодинг.'), { emo: 'happy', ans: 'yes', adult: false }],
    ['say', 'stepa', N_('Понял, брат. Бизнес подождёт — он у меня терпеливый.'), { emo: 'sad', ans: 'no' }],
    ['shot', 'two'],
    // чаевые: были (довёз быстро — «за скорость») — даёт; нет — обещает с прибыли. И «ещё закажу» — на будущие «Стёпа на лавочке»
    ['act', 'stepa', 'give', 1, { if: 'ok' }],
    ['say', 'stepa', N_('Держи на чай, брат. Я ещё закажу — я тут часто сижу.'), { emo: 'happy', if: 'ok' }],
    ['say', 'stepa', N_('Чаевые — с первой прибыли, брат. Я ещё закажу — я тут часто сижу.'), { if: 'bad' }],
    // облако — прямо на машину (через курьера); курьер кашляет; в конце — машина в дыму, курьер идёт к ней
    ['do', o => blowAtCar(o)],
    ['shot', 'courier', { cut: true }],
    ['act', 'courier', 'shake', 1.2],
    ['do', o => cough(o)],
    ['shot', 'car'],
    ['walk', 'courier', 'car', { wait: false }],
    ['wait', 1.4],
  ],
};

/* облака: дым кальяна (взрослая) или пар самовара (детская) — белые клубы из puffGeo */
function cloud (x, y, z, vx, vz, n, big, life) {
  const T = A.THREE, gy = A.groundH(x, z);
  for (let k = 0; k < n; k++) {
    const m = new T.Mesh(A.puffGeo, new T.MeshBasicMaterial({ color: A.ADULT ? (k % 3 ? 0xe9e7e2 : 0xf6f4f0) : 0xffffff, transparent: true, opacity: A.ADULT ? 0.7 : 0.55, depthWrite: false }));
    m.position.set(x + rand(-0.15, 0.15), gy + y + rand(-0.05, 0.12), z + rand(-0.15, 0.15));
    m.scale.setScalar(rand(0.35, 0.6) * big);
    A.fxAdd(m, { vx: vx * rand(0.8, 1.15) + rand(-0.3, 0.3), vz: vz * rand(0.8, 1.15) + rand(-0.3, 0.3), vy: rand(0.25, 0.6), life: life || rand(3, 4.5), max: life || 4.5, grow: 0.5 });
  }
}
/* затяжка: облако от Стёпы вперёд, пока он сидит (как кальянщики hookah.js) */
function exhale (a, big = 1) {
  if (!a || a.hidden) return;
  const fx = Math.sin(a.h), fz = Math.cos(a.h), y = (a.sit ? 1.25 : 1.6);
  cloud(a.x + fx * 0.35, y, a.z + fz * 0.35, fx * 0.9, fz * 0.9, Math.round(6 * big), big);
}
/* финал: большое облако летит от Стёпы на машину (мимо курьера), машина в дыму */
function blowAtCar (o) {
  const a = o.actor('stepa'), V = o.V;
  if (o.skip || !a) return null;
  const tx = V.x - a.x, tz = V.z - a.z, d = Math.hypot(tx, tz) || 1, v = d / S1.CLOUD_T;
  const y = a.sit ? 1.25 : 1.6;
  for (let i = 0; i < 6; i++) setTimeout(() => cloud(a.x + tx / d * 0.4, y, a.z + tz / d * 0.4, tx / d * v, tz / d * v, 3, 1.3, 3.5), i * 90);
  // долетело: клубы вокруг машины
  setTimeout(() => {
    for (let i = 0; i < 16; i++) setTimeout(() => {
      const an = Math.random() * Math.PI * 2, r = Math.random() * 1.8;
      cloud(V.x + Math.cos(an) * r, 0.6 + Math.random() * 0.8, V.z + Math.sin(an) * r, 0, 0, 1, 1.6, rand(3.5, 4.5));
    }, i * 50);
  }, S1.CLOUD_T * 1000);
  return o.wait(S1.CLOUD_T + 0.3);
}
/* курьер в дыму кашляет: пузырь «кхе-кхе…» над головой и три «кхе» (звук — тот же, что был у прикола hints.js stepan) */
function cough (o) {
  const c = o.actor('courier');
  if (o.skip || !c) return null;
  cloud(c.x, 1.5, c.z, 0, 0, 4, 1.1, 2.5);
  const Snd = A.Snd;
  [0, 450, 950].forEach(ms => setTimeout(() => { if (Snd && Snd.fx) Snd.fx('engine-cough', s => { s.noise(0.12, 0.22); s.blip(80 + Math.random() * 30, 0.14, 'sawtooth', 0.16); }, { eng: 1 }); }, ms));
  LIFE.emo(c, 'scared', 1.9);                       // глаза-плошки, сжатые зубы — кашляет
  const b = A.sayBubble(c.grp, t('кхе-кхе…'), '#7a4cc2', 2.4);
  return o.wait(1.7).then(() => { c.grp.remove(b); if (b.material) b.material.dispose(); });
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
  ped.grp.visible = false;                       // в сцене его играет актёр; после — снова он, уже с пиццей
  M.on = true; M.puffT = 0.8; M.stats.played++;
  const order = { storyId: 'stepa-first', chapter: 0 };
  STORY.play('stepa-first', 0, { order, cond: o.tipped ? 'ok' : 'bad' }).then(() => {
    M.on = false;
    M.stats.skipped += STORY.DEBUG.CUT.skip ? 1 : 0;
    M.stats.ans = STORY.DEBUG.CUT.ans || null;
    M.stats.ms = Math.round(performance.now() - t0);
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
