/* ──────────────────────────────────────────────────────────────────────────
   Мыло вместо рывка — динамическое разрешение (правила словами — docs/CAREER.md
   «Настройки графики» → «тяжёлый кадр»; замеры — docs/AGENTS.md «Мыло вместо рывка»).

   Быстрая страховка от тяжёлой ОТРИСОВКИ: видеокарта несколько кадров подряд не
   успевает — кадр рисуется в меньшем разрешении (×0,85 / ×0,72 / ×0,6 по стороне),
   картинка на это время мягкая (не крупные пиксели, а «мыло»), потом по ступеньке
   обратно. От рывков кода (сборка, рождения, мусор в памяти) не спасает — там
   видеокарта ждёт процессор, и меньшее разрешение ничего не даёт.

   Чем меряем:
   - есть таймер видеокарты (EXT_disjoint_timer_query_webgl2 — Хром / Электрон на
     компьютере и Деке) — сколько видеокарта рисовала кадр. Ответ приходит через 2—4
     кадра. Тяжёлый — дольше 0,9 бюджета (бюджет — 1/60 с, при ограничении 30 / 40 к/с —
     1/30, 1/40; на экране 120 Гц всё равно 1/60) два замера подряд;
   - таймера нет (Сафари, часть телефонов) — промежуток между кадрами дольше 1,6 бюджета
     при коде игры короче половины промежутка (ждали не нас) в трёх кадрах из пяти; спуск — сразу
     на ×0,6 (кадры идут по сетке экрана, мелкий шаг её не перепрыгнет), после
     спуска проверяем, что кадры правда стали короче, — не стали (ограничение кадров
     системой, экран 30 Гц) — разрешение назад, следующая попытка через 30 с, 60, 120…,
     после трёх «не помогло» — до конца запуска не трогаем.

   Спуск — сразу на ту ступень, где кадр по прикидке влезет в 0,8 бюджета (не ниже ×0,6).
   Подъём — по одной ступени, когда по прикидке и на ступень выше влезет в 0,75 бюджета
   полсекунды подряд. Поднялись и меньше чем через 1 с снова пришлось спускаться, причём
   на прошлой ступени кадр влез бы (качели из-за самого подъёма, а не новая нагрузка) — следующий
   подъём ждёт вдвое дольше (0,5 → 1 → 2 с); 6 с без спусков — снова 0,5 с. Первые 1,5 с смены
   (и после паузы, повтора, катсцены) не смотрим: видеокарта догружает текстуры.

   С автоспуском дальности (cull.js govern) не спорит: тот медленный (2 с долгих кадров,
   виноват код игры) и режет дальность; этот быстрый и смотрит только на видеокарту.
   Работает только в смене (не в меню, не в паузе, не в повторе и катсцене) — вне её
   разрешение сразу полное.

   Настройка — gfx.js «тяжёлый кадр» (вкл / выкл; по умолчанию вкл на всех устройствах — автор 18.10.2026: «по
   дефолту ставить блюр вместо рывка»; кто выбрал сам, и выкл тоже, — у того остаётся). ?dyn=0 / ?dyn=1 — на этот запуск. Отладка — __dlv.DYNRES.
   ────────────────────────────────────────────────────────────────────────── */
import * as GFX from './gfx.js';
import * as TUNE from './tune.js';

export const LV = [1, 0.85, 0.72, 0.6];       // ступени: доля разрешения по стороне
const HI = 0.9, FIT = 0.8, UP_FIT = 0.75;     // доли бюджета: «тяжёлый», спуск — влезть, подъём — влезть с запасом
const UP_T = 0.5, PUMP_T = 1, CALM_T = 6, WARM_T = 1.5;  // с

let gl = null, ext = null, H = null;
const pool = [], pend = [];
let open = null;                              // запрос таймера в этом кадре
let lvl = 0, K = 1;
let warm = WARM_T, hiN = 0, calm = 0, upWait = UP_T, clock = 0, upAt = -1e9, downAt = -1e9;
let checkAt = 0, before = 0, after = [], fails = 0, offUntil = 0;   // проверка «помогло ли» (без таймера)
let win = 0;
const hv = [];                                // без таймера: последние долгие промежутки, мс
export const STATS = { timer: false, gpu: [], k: [], cpuMax: [0, 0],   // cpuMax — самое долгое: до отрисовки / после (мс процессора)
  downs: 0, ups: 0, useless: 0, frames: 0, low: 0, disjoint: 0 };
export const DEBUG = { force: null, timing: false, sink: null, noTimer: false, pin: null, trace: null };
/* force: true/false — включить/выключить мимо настройки; timing — мерить и выключенным; sink — массив: класть туда каждый
   замер видеокарты (мс); noTimer — вести себя, как будто таймера нет (проверка запасного пути); pin — держать ступень 0…3 (кадр для глаз) */

export function init (hooks) {
  H = hooks || {};
  try {
    gl = H.renderer.getContext();
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  } catch (e) { ext = null; }
  STATS.timer = !!ext;
  /* программа растяжки — сейчас, при загрузке: проверка сборки и места uniform — ожидание видеокарты, под нагрузкой
     в смене это был бы рывок до 30 мс в момент первого спуска (замер 17.10.2026) */
  try { glInit(); if (!bad) texFit(); H.renderer.resetState(); } catch (e) { bad = true; }
  try { H.renderer.domElement.addEventListener('webglcontextrestored', () => { glDrop(); pool.length = pend.length = 0; open = null; }); } catch (e) { /* — */ }
}
export const k = () => K;
/* есть ли таймер видеокарты (облегчение кадра — tune.js: без него смотрит на промежутки между кадрами) */
export const timer = () => !!ext && !DEBUG.noTimer;
const on = () => (DEBUG.force !== null ? DEBUG.force : !!GFX.dynOn());
const budget = () => { const f = GFX.fpsCap(); return 1000 / Math.min(f || 60, 60); };

/* ── как рисуем меньше, не трогая холст ──
   Размер холста не меняем: смена размера пересоздаёт буфер кадра и ждёт, пока видеокарта дорисует
   всё, что у неё в очереди, — под нагрузкой это был рывок 40—65 мс ровно в момент спуска (замер 17.10.2026).
   Новые программы шейдеров тоже не нужны (рисование в свою цель three.js собрал бы их заново — тот же рывок).
   Поэтому: сцена рисуется в угол того же холста (меньший viewport), угол копируется в текстуру
   (copyTexSubImage2D), и текстура растягивается на весь холст одним треугольником с мягкой выборкой —
   это и есть «мыло». Копия и растяжка — ~0,1—0,3 мс видеокарты на кадр, только пока разрешение снижено. */
let tex = null, texW = 0, texH = 0, prog = null, vao = null, uS = null, uM = null, vw = 0, vh = 0, low = false, bad = false;
const VS = '#version 300 es\nout vec2 v; void main () { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
const FS = '#version 300 es\nprecision mediump float; uniform sampler2D t; uniform vec2 s, m; in vec2 v; out vec4 o; void main () { o = vec4(texture(t, min(v * s, m)).rgb, 1.0); }';
function glInit () {
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { bad = true; return; }   // не собралась — дальше без «мыла»
  uS = gl.getUniformLocation(prog, 's'); uM = gl.getUniformLocation(prog, 'm');
  vao = gl.createVertexArray();
  tex = gl.createTexture(); texW = texH = 0;
}
/* текстура под размер холста (копия угла кладётся в её угол) */
function texFit () {
  const W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, W, Hh, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  texW = W; texH = Hh;
  H.renderer.resetState();
}
function glDrop () { prog = vao = tex = null; texW = texH = 0; }
/* перед отрисовкой сцены: снижено — рисуем в угол */
function lowBegin () {
  low = false;
  if (K >= 1 || bad || !gl || gl.isContextLost()) return;
  if (!prog) { glInit(); if (bad) return; }       // после потери контекста
  const W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight;
  if (W !== texW || Hh !== texH) texFit();        // размер окна или «чёткость» поменялись
  vw = Math.max(16, Math.round(W * K)); vh = Math.max(16, Math.round(Hh * K));
  H.renderer.setViewport(0, 0, vw, vh);
  low = true;
}
/* после: угол — в текстуру, текстуру — на весь холст; состояние three.js — сбросить, viewport — обратно */
function lowEnd () {
  if (!low) return;
  low = false;
  const R = H.renderer, W = texW, Hh = texH;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, vw, vh);
  gl.viewport(0, 0, W, Hh);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
  gl.colorMask(true, true, true, true);
  gl.useProgram(prog);
  gl.uniform2f(uS, vw / W, vh / Hh); gl.uniform2f(uM, (vw - 0.5) / W, (vh - 0.5) / Hh);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  R.resetState();
  const sz = R.getSize(SZ);
  R.setViewport(0, 0, sz.x, sz.y);
}
const SZ = { x: 0, y: 0, set (x, y) { this.x = x; this.y = y; return this; } };

/* ── вокруг отрисовки сцены: угол / растяжка и таймер видеокарты ── */
export function begin () {
  const t0 = performance.now();
  lowBegin();
  const t1 = performance.now() - t0; if (t1 > STATS.cpuMax[0]) STATS.cpuMax[0] = +t1.toFixed(2);
  if (!ext || DEBUG.noTimer || open || !(on() || DEBUG.timing || !TUNE.DEBUG.off)) return;   // таймер нужен и облегчению кадра (tune.js)
  const q = pool.pop() || gl.createQuery();
  try { gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = { q, k: K }; } catch (e) { pool.push(q); }
}
export function end () {
  const t0 = performance.now();
  lowEnd();
  const t1 = performance.now() - t0; if (t1 > STATS.cpuMax[1]) STATS.cpuMax[1] = +t1.toFixed(2);
  if (!open) return;
  try { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(open); } catch (e) { pool.push(open.q); }
  open = null;
  if (pend.length > 8) pool.push(pend.shift().q);   // долго нет ответов — старые выкидываем
}
function poll () {
  let got = null;
  while (pend.length) {
    const p = pend[0];
    if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
    pend.shift();
    const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
    pool.push(p.q);
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { STATS.disjoint++; continue; }   // замер испорчен (частота, переключение)
    got = got || [];
    got.push({ ms: ns / 1e6, k: p.k });
  }
  return got;
}
const keep = (a, v, n = 1200) => { a.push(v); if (a.length > n) a.splice(0, n / 2); };

/* прикидка: сколько займёт кадр на доле s, если на доле k1 занял ms (¾ — пиксели, ¼ — вершины и вызовы) */
const pred = (ms, k1, s) => ms * (0.25 + 0.75 * (s / k1) * (s / k1));

function setLvl (n, pump) {
  if (n === lvl) return;
  const down = n > lvl;
  lvl = n; K = LV[n];
  hiN = 0; calm = 0;
  if (down) {
    STATS.downs++;
    if (pump && clock - upAt < PUMP_T) upWait = Math.min(2, upWait * 2);   // только что поднялись — и подъём же и не влез
    downAt = clock;
  } else { STATS.ups++; upAt = clock; }
}
function reset () { if (lvl) setLvl(0); hiN = 0; calm = 0; checkAt = 0; after.length = 0; win = 0; }

/* после отрисовки обычного кадра (смена и меню): raw — промежуток с прошлого кадра (с), work — код игры
   с отрисовкой (мс), active — идёт смена (в меню и на итогах разрешение полное) */
export function step (raw, work, active) {
  const got = ext && pend.length ? poll() : null;
  if (got) for (const g of got) { keep(STATS.gpu, +g.ms.toFixed(2)); if (DEBUG.sink) DEBUG.sink.push(g.ms); if (Math.abs(g.k - K) < 1e-3) TUNE.gpu(g.ms); }
  if (DEBUG.pin !== null) { setLvl(Math.max(0, Math.min(LV.length - 1, DEBUG.pin | 0))); return; }
  if (!on() || !active) { reset(); warm = WARM_T; return; }
  if (!(raw > 0) || raw > 0.25) { warm = Math.max(warm, 0.5); return; }   // после паузы / загрузки — не замер
  if (warm > 0) { warm -= raw; hiN = 0; return; }   // первые 1,5 с смены (и после паузы, повтора, катсцены): видеокарта догружает текстуры — не повод
  clock += raw; STATS.frames++;
  if (K < 1) STATS.low++;
  keep(STATS.k, K, 600);
  if (clock - downAt > CALM_T) upWait = UP_T;
  const B = budget();
  if (ext && !DEBUG.noTimer) timed(got, raw, B); else untimed(raw * 1000, work, B);
}

function timed (got, raw, B) {
  if (!got) return;
  for (const g of got) {
    if (Math.abs(g.k - K) > 1e-3) continue;      // рисовали ещё на прошлой ступени
    hiN = g.ms > HI * B ? hiN + 1 : 0;
    if (hiN >= 2) {
      let n = lvl;
      while (n < LV.length - 1 && pred(g.ms, K, LV[n]) > FIT * B) n++;
      // качели: только что поднялись, и на прошлой ступени этот кадр влез бы — виноват подъём (а не новая нагрузка: салют, взрыв)
      if (n > lvl) { setLvl(n, lvl < LV.length - 1 && pred(g.ms, K, LV[lvl + 1]) <= FIT * B); return; }
    }
    if (lvl && pred(g.ms, K, LV[lvl - 1]) <= UP_FIT * B) calm += raw / got.length; else calm = 0;
  }
  if (lvl && calm >= upWait) setLvl(lvl - 1);
}

function untimed (ms, work, B) {
  if (DEBUG.trace) DEBUG.trace.push([Math.round(ms), Math.round(work), lvl, checkAt ? 1 : 0]);
  if (clock < offUntil) return;
  if (checkAt) {                                  // только что спустились: стали ли кадры короче
    after.push(ms);
    if (clock < checkAt) return;
    const a = after.slice().sort((x, y) => x - y)[after.length >> 1] || ms;
    checkAt = 0; after.length = 0;
    if (a > before * 0.85) {                      // не помогло — дело не в отрисовке
      STATS.useless++; fails++;
      offUntil = fails >= 3 ? Infinity : clock + 30 * 2 ** (fails - 1);
      reset();
      return;
    }
  }
  // 18.10.2026: при 30 к/с (телефон, «низкая») кадр по сетке экрана — 33 / 50 / 67 мс; порог 1,6 кадра (53 мс) пропускал
  // кадры по 50 мс (20 к/с) — «мыло» в Сафари (таймера видеокарты нет) не включалось. С ограничением к/с — 1,25 кадра
  const heavy = ms > (B > 20 ? 1.25 : 1.6) * B && work < ms * 0.5;
  win = ((win << 1) | (heavy ? 1 : 0)) & 31;      // последние 5 кадров: долгие и короткие вперемешку (17 / 33 / 50) — тоже тяжело
  hiN = (win & 1) + (win >> 1 & 1) + (win >> 2 & 1) + (win >> 3 & 1) + (win >> 4 & 1);
  if (heavy) { hv.push(ms); if (hv.length > 3) hv.shift(); }
  if (hiN >= 3 && lvl < LV.length - 1) {
    win = 0;          // сразу на нижнюю ступень: кадры идут по сетке экрана (16,7 / 33,3 мс), шаг ×0,85 её часто не перепрыгнет
    before = hv.slice().sort((x, y) => x - y)[1] || ms; checkAt = clock + 0.5; after.length = 0;
    setLvl(LV.length - 1, lvl > 0);
    return;
  }
  if (lvl && ms <= 1.2 * B) calm += ms / 1000; else if (lvl) calm = 0;
  if (lvl && calm >= upWait * 2) setLvl(lvl - 1);
}

/* кадр мимо смены (повтор, катсцена, вступление) — перед его отрисовкой: разрешение полное */
export function idle () { if (lvl) reset(); warm = WARM_T; }

Object.defineProperties(DEBUG, Object.getOwnPropertyDescriptors({   // с геттерами (Object.assign скопировал бы значения)
  get lvl () { return lvl; }, get k () { return K; }, get on () { return on(); }, get budget () { return budget(); },
  get upWait () { return upWait; }, get offUntil () { return offUntil; }, LV, STATS, set: n => setLvl(n | 0), reset,
  /* доля кадров на пониженном разрешении и сколько раз спускались */
  info () { return { timer: STATS.timer, on: on(), k: K, frames: STATS.frames, lowShare: STATS.frames ? +(STATS.low / STATS.frames).toFixed(3) : 0, downs: STATS.downs, ups: STATS.ups, useless: STATS.useless, disjoint: STATS.disjoint }; },
}));
