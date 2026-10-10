/* ──────────────────────────────────────────────────────────────────────────
   Машины потока: «кто рядом» по сетке и стоящие — вон из покадровых циклов
   (11.10.2026, трек «Производительность», docs/AGENTS.md «Стоящие машины и сетка „кто рядом“»).

   Было: каждая едущая машина (их ~70—100) в каждом кадре перебирала все ~310 машин списка TRAFFIC
   (из них 150—240 — припаркованные, которые не двигаются), а ещё ~12 проходов по тем же 310 —
   фары, радар, отсечение по кадру, самосвалы, бургер-машины, коневозки, мопеды…

   Теперь:
     • ACT — машины, которые что-то делают: всё, кроме «стоящих» (still — припаркованная у бордюра,
       её никто не трогал; склеена по клеткам, parkmerge.js). Покадровые циклы идут по ACT;
       TRAFFIC — по-прежнему общий список всех машин (взрыв, полная карта, проверки).
     • Сетка «кто рядом»: клетка CELL м, корзины по хешу клетки (256 × 256, без границ карты),
       списки — на Int32Array, без выделений в кадре. Две сетки: едущие (пересборка дважды
       за кадр — в начале и в конце updateTraffic, ~310 вставок) и стоящие (собирается один раз,
       когда машины встают в склейку; толкнули — машина выходит, near() её там больше не отдаёт).
       near(x, z, r, out) кладёт в out кандидатов из клеток, задевающих квадрат ±r, — точную
       проверку расстояния делает тот, кто спросил (как раньше: |dx| > 16 — мимо). К радиусу —
       запас SLACK (2 м) на то, что машины успели проехать с пересборки.
     • Стоящая «просыпается» (wake): толкнули, задели, взрыв, лось, вытащили в пробку, сдвинули —
       выходит из склейки в свою лёгкую модель и в ACT. Проверка — в пересборке (на всё, что
       пропустили хуки в fullCar / knockCar / poseOnSlope).

   ?oldcars — по-старому (без сетки и склейки стоящих): near() отдаёт весь TRAFFIC, все машины в ACT —
   для замера «до/после» одной сборкой.
   ────────────────────────────────────────────────────────────────────────── */

export const TG = {
  CELL: 20,
  SLACK: 2,         // м: запас к радиусу near() — сколько машина могла проехать с пересборки (≤ 1 м за кадр даже в полёте)
  on: !new URLSearchParams(typeof location !== 'undefined' ? location.search : '').has('oldcars'),
  ACT: [],          // машины, которые что-то делают (не стоящие)
  R: null,          // откуда читать результат near(): out (сетка) или TRAFFIC целиком (?oldcars)
  frame: 0,
  fullF: 0,         // проход последнего полного перебора TRAFFIC (parkmerge.js view: у кого tgF раньше — нет в списке)
  PL2: 0,           // м²: высоту полотна под машиной (game.js poseOnSlope → paveLift) мерить заново, отъехав на √PL2 (1,5 м)
  ST: { act: 0, still: 0, woke: 0, builds: 0, full: 0, q: 0, cand: 0 },
};

const NB = 256, MASK = NB - 1;
const key = (ix, iz) => ((ix & MASK) << 8) | (iz & MASK);

function grid () {
  return { head: new Int32Array(NB * NB).fill(-1), next: new Int32Array(512), cars: [], n: 0, used: new Int32Array(1024), nu: 0 };
}
const DYN = grid(), STILL = grid(), WALK = grid();

function clear (G) {
  for (let i = 0; i < G.nu; i++) G.head[G.used[i]] = -1;
  G.nu = 0; G.n = 0;
}
function put (G, o, x, z) {
  const C = TG.CELL, k = key(Math.floor(x / C), Math.floor(z / C)), i = G.n++;
  if (i >= G.next.length) { const nx = new Int32Array(G.next.length * 2); nx.set(G.next); G.next = nx; }
  if (G.head[k] < 0) {
    if (G.nu >= G.used.length) { const nu = new Int32Array(G.used.length * 2); nu.set(G.used); G.used = nu; }
    G.used[G.nu++] = k;
  }
  G.cars[i] = o; G.next[i] = G.head[k]; G.head[k] = i;
}

let LIST = null, WAKE = null;
/** TRAFFIC и что делать с проснувшейся (вынуть из склейки, вернуть свою модель на сцену) */
export function init (list, onWake) { LIST = list; WAKE = onWake; TG.R = list; }

/* стоящая ли ещё: никто не тронул и стоит там же, где её поставили в склейку (pk — x, z, h) */
const still = t => t.parked && !t.knock && !t.wreck && !t.driver && !t.gone && !t.moved && !(t.hitT > 0) && !(t.chainT > 0) && t.hp >= 45 &&
  t.pk && t.mesh === t.pk.mesh && t.x === t.pk.x && t.z === t.pk.z && t.h === t.pk.h;

/** машина встаёт в склейку (parkmerge.js): из ACT и сетки едущих — в сетку стоящих */
export function sleep (t) {
  t.still = 1; t.tgF = TG.frame;                   // «в списке» с этого кадра (parkmerge.js view)
  put(STILL, t, t.x, t.z);
  TG.ST.still++;
}
/* в ACT — один раз за проход (tgA — номер прохода, где её уже взяли) */
function act (t) {
  if (t.tgA === TG.frame) return;
  t.tgA = TG.frame;
  TG.ACT.push(t);
  if (TG.on) put(DYN, t, t.x, t.z);
}
function wakeUp (t) { t.still = 0; TG.ST.still--; TG.ST.woke++; if (WAKE) WAKE(t); }
/** проснулась вне пересборки (хуки game.js): сразу в ACT и в сетку едущих — в этом же кадре её видно */
export function wake (t) {
  if (!t.still) return;
  wakeUp(t);
  act(t);
}

/* Пересборка — без перебора стоящих в каждом кадре (их 150—240, а каждая — объект на ~100 полей: даже
   «стоит ли ещё» по всем — 0,07 мс на Деке). Проход по ACT (кто ушёл — вон), новые в конце TRAFFIC (push —
   единственный способ добавить машину) — в ACT. Целиком по TRAFFIC — раз в FULL_EVERY проходов, если
   кого-то убрали (gone) или список укоротили снаружи (фестиваль). Стоящих проверяем по кусочку (SLICE). */
const FULL_EVERY = 30;
let LAST = 0, SLI = 0;
function full () {
  const TR = LIST, A = TG.ACT, f = TG.frame;
  let w = 0;
  A.length = 0;
  for (let i = 0; i < TR.length; i++) {
    const t = TR[i];
    if (t.gone) continue;
    if (w !== i) TR[w] = t;
    w++;
    t.tgF = f;                                     // в списке (parkmerge.js view: склейку машины, которой нет в TRAFFIC, — прячем)
    if (t.still) continue;
    t.tgA = f; A.push(t);
    if (TG.on) put(DYN, t, t.x, t.z);
  }
  TR.length = w;
  TG.fullF = f; TG.ST.full++;
}
/** новые машины в конце TRAFFIC (родились с прошлого прохода) — в ACT и сетку; в начале updateTraffic */
export function fresh () {
  const TR = LIST;
  if (TR.length < LAST) LAST = 0;                  // укоротили снаружи — в конце кадра всё равно пройдём целиком
  for (let i = LAST; i < TR.length; i++) { const t = TR[i]; if (!t.still && !t.gone) act(t); }
  LAST = TR.length;
}
/** конец updateTraffic: убранные (gone) — из TRAFFIC и ACT, новые — в ACT, сетка едущих — заново */
export function rebuild () {
  const TR = LIST, A = TG.ACT;
  const f = ++TG.frame; TG.ST.builds++;
  clear(DYN);
  let gone = TR.length < LAST || f - TG.fullF >= FULL_EVERY, na = 0;
  if (!gone) for (let i = LAST; i < TR.length; i++) if (TR[i].gone) { gone = true; break; }   // родилась и уже убрана
  if (!gone)
    for (let i = 0; i < A.length; i++) {
      const t = A[i];
      if (t.gone) { gone = true; break; }
      if (t.still) continue;                       // снова уснуть не может (sleep — только при сборке), но на всякий случай
      t.tgA = f; A[na++] = t;
      if (TG.on) put(DYN, t, t.x, t.z);
    }
  if (gone) { clear(DYN); full(); }
  else {
    A.length = na;
    for (let i = LAST; i < TR.length; i++) { const t = TR[i]; if (!t.still && !t.gone) act(t); }
  }
  LAST = TR.length;
  // стоящие — по кусочку: никто ли не тронул мимо хуков (fullCar, knockCar, poseOnSlope)
  const SL = STILL.cars, ns = STILL.n;
  for (let k = Math.min(ns, Math.ceil(ns / FULL_EVERY)); k > 0; k--) {
    if (SLI >= ns) SLI = 0;
    const t = SL[SLI++];
    if (t.still && !still(t)) { wakeUp(t); act(t); }
  }
  TG.ST.act = A.length;
}

function scan (G, x, z, r, out, n, onlyStill) {
  const C = TG.CELL, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
  const H = G.head, NX = G.next, L = G.cars;
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++)
      for (let c = H[key(i, j)]; c >= 0; c = NX[c]) {
        const o = L[c];
        if (onlyStill && !o.still) continue;       // проснулась — она уже в сетке едущих
        out[n++] = o;
      }
  return n;
}
/** кандидаты рядом с (x, z) в квадрате ±r (с запасом до клетки): n штук в TG.R[0…n-1].
    withStill = false — без стоящих у бордюра (кому они не помеха: узкие дороги, фары) */
export function near (x, z, r, out, withStill = true) {
  TG.ST.q++;
  if (!TG.on) { TG.R = LIST; return LIST.length; }
  r += TG.SLACK;                                   // машины успели проехать с пересборки
  let n = scan(DYN, x, z, r, out, 0, false);
  if (withStill) n = scan(STILL, x, z, r, out, n, true);
  TG.R = out; TG.ST.cand += n;
  return n;
}

/* ── люди на тротуарах и полотне (walkersAll в game.js): машины перед ними тормозят ──
   Раньше каждая едущая перебирала всех (~120—200 человек) — теперь по той же сетке.
   Люди за время updateTraffic не двигаются: сетка точная. */
export function walkers (lists) {
  clear(WALK);
  if (!TG.on) return;
  for (let li = 0; li < lists.length; li++) {
    const L = lists[li];
    if (!L) continue;
    for (let i = 0; i < L.length; i++) { const p = L[i]; if (p && !p.dead) put(WALK, p, p.x, p.z); }
  }
}
/** люди рядом: n штук в out[0…n-1] (точную проверку делает тот, кто спросил) */
export function walkersNear (x, z, r, out) { return scan(WALK, x, z, r, out, 0, false); }

export const DEBUG = { TG, DYN, STILL, still };

TG.PL2 = TG.on ? 1.5 * 1.5 : -1;                  // ?oldcars — каждый раз, как раньше
