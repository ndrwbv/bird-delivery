/* ──────────────────────────────────────────────────────────────────────────
   Анонимная статистика (трек 12 «Аналитика», docs/ANALYTICS.md — там полный список событий): сколько длится игра,
   где бросают, какие механики включаются и чем кончаются, прогресс и покупки, воронка новичка, тепловая карта,
   падения, ошибки и скорость. Приёмник — Cloud Function в личном облаке автора (tools/telemetry, YDB serverless).
   Ни имени, ни почты, ни IP: случайный номер установки и номер запуска.

   Когда шлёт: только взрослая версия (Стим, браузер), настройка «анонимная статистика» вкл (по умолчанию вкл).
   Детская (Яндекс, ?kids) — модуль не делает ничего: ни запросов, ни замеров, ни обёрток. ?notel — выключено совсем.
   Проверки (probe / check / perf / tour / capture — у них ?debug или ?mute) и dev-сервер — копят, но не шлют;
   ?tel — шлют с пометкой test (сводка их не считает). Сборка dev-<коммит> — тоже test.

   Как шлёт: очередь [номер, время, имя, данные] — пачкой раз в 60 с (fetch keepalive, text/plain — без
   предварительного запроса), при сворачивании и закрытии — navigator.sendBeacon. Нет сети — копит до MAXQ
   (старое выбрасывает), при закрытии кладёт неотправленное в сохранение (dlv-tel-q) и шлёт в следующий запуск.
   На кадр не влияет: свой requestAnimationFrame пишет время кадра в кольцо (без аллокаций); раз в 30 кадров —
   опрос экрана, паузы, нитро, прыжка и «стоит ли машина»; раз в 30 кадров один кадр — замер шагов мира
   (crashlog PROF); всё остальное — по таймеру раз в минуту. Памяти — несколько КБ (кольцо 16 КБ + таблички).

     TEL.init(api)  — game.js: { adult, career, S, playing(), where(), screen(), ctx(), counters(), gpu(), live(), pos(),
                      gas(), air(), nitro(), place(x, z), lateDone(fn), resErr() → [[имя, массив ошибок]…], onShiftStart, onShiftEnd }
     TEL.ev(name, data) / TEL.count(k) / TEL.first(k, data) / TEL.heat(k, x, z, data) / TEL.death(why, x, z) — из модулей
     TEL.available() / TEL.on() / TEL.set(on) — настройка (settings.js)
     __dlv.tel — queue(), state(), flush(), perf(), poll(), sessionEnd(), beacon()
   ────────────────────────────────────────────────────────────────────────── */
import Platform from '../platform/index.js';
import * as CL from '../platform/crashlog.js';

export const URL_INGEST = 'https://functions.yandexcloud.net/d4eu40ddb8ngvb0aqjp6';
export const GAME_KEY = 'bp1';                    // ключ-строка версии протокола (приёмник принимает только известные)
export const TEL = {
  EVERY: 60, MAXQ: 400, BATCH: 250, MAX_BYTES: 48000, STORED: 6,
  ERR_MAX: 25, RES_MAX: 10, CRASH_MAX: 10,       // ошибок / неотданных файлов / падений прошлых запусков — за запуск
  POLL: 30,                                       // кадров между опросами (экран, пауза, нитро, «стоит»)
  SLOW_EVERY: 30, SLOW_MS: 4,                     // замер шагов мира — один кадр из 30; в минутку — шаги дольше 4 мс
  STUCK_S: 15, STUCK_M: 4,                        // стоит 15 с на месте (меньше 4 м), газ жали — «застрял»
  CELL: 100,                                      // клетка тепловой карты, м
  MEM_HIGH: 0.85,                                 // куча JS — доля предела: «память на исходе», раз за запуск
  SCREEN_MIN: 0.6,                                // экран короче — не событие (листание)
};
const KEY_ON = 'dlv-tel', KEY_ID = 'dlv-tel-id', KEY_Q = 'dlv-tel-q';
const KEY_T0 = 'dlv-tel-t0', KEY_ONCE = 'dlv-tel-once', KEY_LAST = 'dlv-tel-last', KEY_VER = 'dlv-tel-ver', KEY_CRASH = 'dlv-tel-crash-at';
export const KEYS = [KEY_ON, KEY_ID, KEY_Q, KEY_T0, KEY_ONCE, KEY_LAST, KEY_VER, KEY_CRASH];   // общие на устройство, сброс прогресса не трогает

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const DEV = !!(import.meta.env && import.meta.env.DEV);
const MODE = (import.meta.env && import.meta.env.MODE) || '';
const TEST = QS.has('tel') || DEV || /^dev/.test(BUILD);
const QUIET = !QS.has('tel') && (DEV || QS.has('debug') || QS.has('mute'));   // проверки: копим, но не шлём
const bridge = typeof window !== 'undefined' ? window.birdSteam : undefined;

let A = null, ON = false, inited = false;
let installId = '', sessionId = '', seq = 0, fresh = false, t0Install = 0;
const Q = [];                                     // [seq, ts, name, data]
const ST = { sent: 0, batches: 0, failed: 0, dropped: 0, errors: 0, res: 0, lastCode: 0, shifts: 0, play: 0, minPlay: 0, t0: 0, memHigh: false };
const SH = { on: false, t0: 0, play: 0, m: {}, c0: null, boom: 0, nitro: 0 };

const rid = n => {
  let s = ''; const c = 'abcdefghijklmnopqrstuvwxyz0123456789', r = new Uint8Array(n);
  try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < n; i++) r[i] = Math.random() * 256; }
  for (let i = 0; i < n; i++) s += c[r[i] % 36]; return s; };
const store = () => Platform.store;
function sget (k, d) { try { const v = store().get(k, d); return v === undefined || v === null ? d : v; } catch (e) { return d; } }
function sset (k, v) { try { store().set(k, v); } catch (e) { /* — */ } }
const call = (fn, d) => { try { return fn ? fn() : d; } catch (e) { return d; } };

/** есть ли статистика в этой сборке вообще (детская — нет) */
export const available = () => !!(A && A.adult) && Platform.id !== 'yandex' && MODE !== 'yandex' && !QS.has('kids') && !QS.has('notel');
export const on = () => available() && String(sget(KEY_ON, '1')) !== '0';
export function set (v) {
  sset(KEY_ON, v ? '1' : '0');
  try { store().flush && store().flush(); } catch (e) { /* — */ }
  if (v && !ON) { start(); ev('setting', { id: 'tel', v: 'on' }); }
  else if (!v && ON) stop();
}

/* ── события ── */
export function ev (name, data) {
  if (!ON) return;
  Q.push([++seq, Date.now(), name, data == null ? null : data]);
  if (Q.length > TEL.MAXQ) { Q.splice(0, Q.length - TEL.MAXQ); ST.dropped++; }
}
export function count (k, n = 1) {
  if (!ON || !SH.on) return;
  SH.m[k] = (SH.m[k] || 0) + n;
}
/** воронка новичка: шаг k — один раз на установку, со временем от первого запуска (с) и сыгранным за рулём */
export function first (k, data) {
  if (!ON) return;
  let done = sget(KEY_ONCE, null);
  if (!done || typeof done !== 'object') done = {};
  if (done[k]) return;
  done[k] = 1; sset(KEY_ONCE, done);
  ev('funnel', { k, t: Math.round((Date.now() - t0Install) / 1000), ...(data || {}) });
}
/** тепловая карта: что (boom, death, hit, late, stuck) и клетка CELL м; адрес улицы — для сводки */
export function heat (k, x, z, data) {
  if (!ON || !Number.isFinite(x) || !Number.isFinite(z)) return;
  const p = call(() => A.place && A.place(x, z), null) || {};
  ev('heat', { k, cx: Math.floor(x / TEL.CELL), cz: Math.floor(z / TEL.CELL), a: p.a ? String(p.a).slice(0, 60) : '', d: p.d, ...(data || {}) });
}
/** смена сорвалась (game.js gameOver): машина всё → взрыв; клетка — в тепловую карту */
export function death (why, x, z) {
  if (!ON) return;
  const boom = why === 'машина всё';
  if (boom && SH.on) SH.boom++;
  ev('death', { why: String(why || '').slice(0, 30) });
  heat(boom ? 'boom' : 'death', x, z, { why: String(why || '').slice(0, 30) });
  if (boom) first('boom1');
}

/* ── время кадра и опрос: своё кольцо, без аллокаций ── */
const FT = new Float32Array(4096);
let ftN = 0, lastRaf = 0, rafId = 0, frameN = 0;
function raf (now) {
  rafId = requestAnimationFrame(raf);
  frameN++;
  if (lastRaf) {
    const d = now - lastRaf;
    if (d > 0 && d < 1000) {                      // свернули и вернулись — не кадр
      FT[ftN++ & 4095] = d;
      if (A.playing && A.playing()) { const s = d / 1000; ST.play += s; ST.minPlay += s; if (SH.on) SH.play += s; }
    }
  }
  lastRaf = now;
  slowTick();
  if (frameN % TEL.POLL === 0) poll();           // часы опроса — performance.now (у кадра свои, в проверках их ускоряют)
}

/* замер шагов мира (crashlog PROF): один кадр из SLOW_EVERY, чужой замер (tools/perf.cjs) не трогаем */
const SLOW = new Map();                           // имя шага → [кадров дольше SLOW_MS, макс, сумма]
let slowFrames = 0;
function slowRec (name, ms) {
  if (ms < TEL.SLOW_MS) return;
  let r = SLOW.get(name);
  if (!r) { if (SLOW.size > 120) return; r = [0, 0, 0]; SLOW.set(name, r); }
  r[0]++; r[2] += ms; if (ms > r[1]) r[1] = ms;
}
function slowTick () {
  const mine = CL.PROF.fn === slowRec;
  if (mine) CL.PROF.fn = null;
  else if (CL.PROF.fn === null && frameN % TEL.SLOW_EVERY === 0) { CL.PROF.fn = slowRec; slowFrames++; }
}
function slowTop () {
  if (!SLOW.size) return undefined;
  const top = [...SLOW].sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, r]) => [k, r[0], Math.round(r[1] * 10) / 10, Math.round(r[2] / r[0] * 10) / 10]);
  SLOW.clear();
  return top;
}

/* предупреждения и console.error модулей (ошибки, которые поймали сами и пошли дальше): счётчик по тексту, в минутку — топ */
const WARN = new Map();
function warnHit (lv, a) {
  if (!ON) return;
  let s = '';
  try { s = a.map(x => (x && x.message) || (typeof x === 'object' ? '' : String(x))).join(' ').trim(); } catch (e) { return; }
  if (!s || s.startsWith('[crashlog]')) return;
  const k = lv + ' ' + s.slice(0, 110);
  const n = WARN.get(k);
  if (n !== undefined) WARN.set(k, n + 1); else if (WARN.size < 40) WARN.set(k, 1);
}
function warnTop () {
  if (!WARN.size) return undefined;
  const top = [...WARN].sort((a, b) => b[1] - a[1]).slice(0, 5);
  WARN.clear();
  return top;
}
function wrapConsole () {
  for (const lv of ['warn', 'error']) {
    const orig = console[lv];
    if (typeof orig !== 'function' || orig.__tel) continue;
    const w = function (...a) { try { warnHit(lv, a); } catch (e) { /* — */ } return orig.apply(this, a); };
    w.__tel = true;
    console[lv] = w;
  }
}

/* опрос раз в POLL кадров: экран (меню, гараж, пауза, панели), нитро, прыжок, «машина стоит без причины» */
const SHIFT_ST = new Set(['drive', 'back', 'handover', 'side', 'brief', 'loading', 'dying']);
let scr = '', scrAt = 0, lastPoll = 0, wasAir = false;
const stk = { x: 0, z: 0, t: 0, gas: false, sent: false, on: false };
export function poll (now = performance.now()) {
  if (!ON) return;
  const dt = lastPoll ? Math.min(2, (now - lastPoll) / 1000) : 0;
  lastPoll = now;
  // экран: смена целиком — один экран «shift»; пауза — «pause» (сколько стоял — в sec следующего события)
  let s = call(A.screen, '') || '';
  if (SHIFT_ST.has(s)) s = 'shift';
  if (s !== scr) {
    // ушёл с экрана: «был на s столько-то секунд, ушёл на to» (короче SCREEN_MIN — листание, не событие)
    const sec = scrAt ? (now - scrAt) / 1000 : 0;
    if (scr && sec >= TEL.SCREEN_MIN) ev('screen', { s: scr, sec: Math.round(sec * 10) / 10, to: s });
    scr = s; scrAt = now;
  }
  if (!SH.on) return;
  if (call(A.nitro, false)) SH.nitro += dt;
  const air = !!call(A.air, false);
  if (air && !wasAir) count('air');
  wasAir = air;
  // застрял: идёт езда (не разговор, не мини-игра), машина 15 с в пределах 4 м, газ жали
  if (call(A.live, false)) {
    const p = call(A.pos, null);
    if (!p) return;
    if (!stk.on || Math.hypot(p.x - stk.x, p.z - stk.z) > TEL.STUCK_M) { stk.x = p.x; stk.z = p.z; stk.t = 0; stk.gas = false; stk.sent = false; stk.on = true; return; }
    stk.t += dt;
    if (call(A.gas, 0) > 0.3) stk.gas = true;
    if (!stk.sent && stk.gas && stk.t > TEL.STUCK_S) { stk.sent = true; count('stuck'); heat('stuck', p.x, p.z, { sec: Math.round(stk.t) }); }
  } else stk.on = false;
}

/* минутка: кадр, память, медленные шаги, предупреждения, ошибки ресурсов */
const SORT = new Float32Array(4096);
export function perf () {
  if (!ON) return;
  resCheck();
  const n = Math.min(ftN, 4096);
  const warn = warnTop(), slow = slowTop(), sf = slowFrames; slowFrames = 0;
  if (n < 30) { ftN = 0; if (warn) ev('warn', { top: warn }); return; }   // окно не видно — кадр не мерили
  SORT.set(FT.subarray(0, n)); const s = SORT.subarray(0, n); s.sort();
  let sum = 0, drops = 0;
  for (let i = 0; i < n; i++) { sum += s[i]; if (s[i] > 50) drops++; }
  const pq = q => +s[Math.min(n - 1, Math.floor(n * q))].toFixed(1);
  const pm = performance && performance.memory;
  const mem = pm ? Math.round(pm.usedJSHeapSize / 1048576) : undefined;
  const c = ctx();
  ev('perf', { p50: pq(0.5), p95: pq(0.95), max: +s[n - 1].toFixed(0), drops, fps: Math.round(1000 * n / sum), n, mem, gfx: c.gfx, dyn: c.dyn,
    where: where(), play: Math.round(ST.minPlay), ...(slow ? { slow, sf } : {}), ...(warn ? { warn } : {}) });
  if (pm && !ST.memHigh && pm.jsHeapSizeLimit && pm.usedJSHeapSize / pm.jsHeapSizeLimit > TEL.MEM_HIGH) {
    ST.memHigh = true;
    ev('mem_high', { mem, limit: Math.round(pm.jsHeapSizeLimit / 1048576), where: where() });
  }
  ftN = 0; ST.minPlay = 0;
  markLast(false);
}

/* ресурсы: файл не загрузился (картинка, скрипт, стиль — событие страницы; звук и музыка — их счётчики ошибок) */
const resSeen = new Map();                        // массив ошибок модуля → сколько уже отдали
function resFail (src, msg) {
  if (!ON || ST.res >= TEL.RES_MAX) return;
  ST.res++;
  ev('res_fail', { src, msg: String(msg || '').replace(/^.*\/(?=[^/]+$)/, '').slice(0, 120) });
}
function resCheck () {
  const lists = call(A.resErr, null);
  if (!Array.isArray(lists)) return;
  for (const [name, arr] of lists) {
    if (!Array.isArray(arr)) continue;
    const was = resSeen.get(arr) || 0;
    for (let i = was; i < arr.length; i++) resFail(name, arr[i]);
    resSeen.set(arr, arr.length);
  }
}

/* ── отправка ── */
const header = () => ({ k: GAME_KEY, i: installId, s: sessionId, v: BUILD.slice(0, 40), b: build(), d: device(), ...(TEST ? { t: true } : {}) });
function build () { return MODE === 'ios' ? 'ios' : Platform.id === 'steam' ? 'steam' : Platform.id === 'web' ? 'web' : 'other'; }
function device () { const d = ctx().dev; return d === 'deck' ? 'deck' : d === 'phone' || d === 'ios' ? 'phone' : 'desktop'; }
/* пачки из очереди: не больше BATCH событий и MAX_BYTES (fetch keepalive и sendBeacon держат ~64 КБ) */
function takeBatch () {
  if (!Q.length) return null;
  const h = header();
  const n = Math.min(Q.length, TEL.BATCH);
  let e = Q.slice(0, n), body = JSON.stringify({ ...h, e });
  while (body.length > TEL.MAX_BYTES && e.length > 1) { e = e.slice(0, Math.ceil(e.length / 2)); body = JSON.stringify({ ...h, e }); }
  if (body.length > TEL.MAX_BYTES) { Q.splice(0, 1); ST.dropped++; return takeBatch(); }   // одно огромное — выкинуть
  return { body, n: e.length };
}
let busy = false;
async function post (body) {
  const r = await fetch(URL_INGEST, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit' });
  ST.lastCode = r.status;
  return r.status;
}
export async function flush () {
  if (!ON || busy || QUIET) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  busy = true;
  try {
    for (let k = 0; k < 4; k++) {
      const b = takeBatch();
      if (!b) break;
      let code = 0;
      try { code = await post(b.body); } catch (e) { code = 0; }
      if (code >= 200 && code < 300) { Q.splice(0, b.n); ST.sent += b.n; ST.batches++; }
      else if (code >= 400 && code < 500) { Q.splice(0, b.n); ST.dropped += b.n; }   // приёмник не принял формат — не повторять
      else { ST.failed++; break; }                  // нет сети / приёмник лежит — попробуем через минуту
    }
    await sendStored();
  } finally { busy = false; }
  return true;
}
/* закрытие / сворачивание: sendBeacon (живёт после закрытия страницы); не вышло — в сохранение до следующего запуска */
function beacon () {
  if (!ON || QUIET) return;
  for (let k = 0; k < 4; k++) {
    const b = takeBatch();
    if (!b) break;
    let ok = false;
    try { ok = !!(navigator.sendBeacon && navigator.onLine !== false && navigator.sendBeacon(URL_INGEST, b.body)); } catch (e) { ok = false; }
    if (ok) { Q.splice(0, b.n); ST.sent += b.n; ST.batches++; }
    else { stash(b.body); Q.splice(0, b.n); }
  }
}
function stash (body) {
  try {
    const arr = sget(KEY_Q, null);
    const list = Array.isArray(arr) ? arr : [];
    list.push(body);
    sset(KEY_Q, list.slice(-TEL.STORED));
    store().flush && store().flush();
  } catch (e) { /* полное хранилище — не страшно */ }
}
async function sendStored () {
  const arr = sget(KEY_Q, null);
  if (!Array.isArray(arr) || !arr.length) return;
  sset(KEY_Q, []);
  const left = [];
  for (const body of arr) {
    if (typeof body !== 'string') continue;
    let code = 0;
    try { code = await post(body); } catch (e) { code = 0; }
    if (!(code >= 200 && code < 500)) left.push(body);
  }
  if (left.length) sset(KEY_Q, left.slice(-TEL.STORED));
}

/* ── ошибки из журнала (crashlog.js): коротко — вид, где, текст, файл:строка ── */
function onError (r) {
  if (!ON || !r || ST.errors >= TEL.ERR_MAX) return;
  ST.errors++;
  const m = /([\w.-]+\.(?:js|cjs|mjs|html)):(\d+)(?::(\d+))?/.exec(r.stack || '');
  ev('error', { kind: r.kind, where: String(r.where || '').slice(0, 60), msg: String(r.msg || '').slice(0, 160), at: m ? m[1] + ':' + m[2] + (m[3] ? ':' + m[3] : '') : '',
    n: r.n || 1, ph: r.snap && r.snap.phase, st: r.snap && r.snap.state });
}

/* ── прошлый запуск: кончился ли чисто; падения оболочки (Стим) ── */
function markLast (clean, hid) {
  sset(KEY_LAST, { s: sessionId, t: Date.now(), w: where(), sh: SH.on ? 1 : 0, v: BUILD.slice(0, 40), sec: Math.round((performance.now() - ST.t0) / 1000), ...(clean ? { c: 1 } : {}), ...(hid ? { h: 1 } : {}) });
}
function lastRun () {
  const L = sget(KEY_LAST, null);
  if (L && typeof L === 'object' && L.s && !L.c) {
    ev('unclean_exit', { prev: String(L.s).slice(0, 20), w: L.w || '', sh: L.sh ? 1 : 0, v: L.v || '', sec: L.sec || 0, ago: Math.round((Date.now() - (L.t || Date.now())) / 1000), hid: L.h ? 1 : 0 });
  }
  const was = String(sget(KEY_VER, '') || '');
  if (was && was !== BUILD) ev('update', { from: was.slice(0, 40), to: BUILD.slice(0, 40) });
  if (was !== BUILD) sset(KEY_VER, BUILD);
  if (bridge && bridge.shellLog) {
    const since = String(sget(KEY_CRASH, '') || '');
    const now = new Date().toISOString();
    bridge.shellLog(since).then(list => {
      if (!ON || !Array.isArray(list)) return;
      for (const r of list.slice(-TEL.CRASH_MAX)) ev('crash_prev', { kind: r.kind, msg: String(r.msg || '').slice(0, 160), at: r.at, v: r.build || '' });
      sset(KEY_CRASH, now);
    }).catch(() => {});
  }
}

/* ── видеокарта: коротко, без «ANGLE (…)» и драйверов ── */
function gpu () {
  try {
    const gl = A.gpu && A.gpu();
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let s = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    const m = /^ANGLE \((.*)\)$/.exec(s); if (m) s = m[1];
    s = s.replace(/Direct3D.*$|OpenGL.*$|vs_\d.*$|\(0x[0-9a-f]+\)|, ?D3D\d+|Metal Renderer:? ?|,? ?Unspecified Version|\bANGLE\b ?/gi, '').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
    return s.slice(0, 80);
  } catch (e) { return ''; }
}

/* ── смена ── */
const ctx = () => call(() => A && A.ctx && A.ctx(), null) || {};
const where = () => { try { return String(A.where ? A.where() : (A.S && A.S.state) || ''); } catch (e) { return '?'; } };
const counters = () => call(() => A.counters && A.counters(), null) || {};
function shiftStart (o) {
  if (!ON) return;
  ST.shifts++;
  const c = ctx(), n = (o && o.n) || 0;
  Object.assign(SH, { on: true, t0: performance.now(), play: 0, m: {}, c0: counters(), boom: 0, nitro: 0 });
  stk.on = false; wasAir = false;
  ev('shift_start', { n, dist: c.dist, city: c.city ? 1 : 0, quick: c.quick ? 1 : 0, wallet: c.wallet, lvl: c.lvl, rank: c.rank, car: c.car, sea: seaName(c.sea), hol: c.hol || '' });
  first('shift1');
  if (n >= 2) first('shift2'); if (n >= 5) first('shift5'); if (n >= 10) first('shift10');
  markLast(false);
}
const seaName = v => (typeof v === 'number' ? ['summer', 'autumn', 'winter', 'spring'][Math.floor(((v % 4) + 4) % 4)] : '');
function shiftEnd (o) {
  if (!ON || !SH.on) return;
  SH.on = false;
  const S = A.S || {}, c = ctx(), c1 = counters(), m = { ...SH.m };
  for (const k in c1) { const d = (c1[k] || 0) - ((SH.c0 && SH.c0[k]) || 0); if (d > 0) m[k] = d; }
  if (SH.nitro >= 0.5) m.nitro_s = Math.round(SH.nitro);
  const del = (o && o.delivered) || S.delivered || 0;
  ev('shift_end', {
    why: String((o && o.why) || '').slice(0, 30), full: o && o.full ? 1 : 0,
    sec: Math.round((performance.now() - SH.t0) / 1000), play: Math.round(SH.play),
    del, late: m.late || 0, money: Math.round((o && o.money) || S.money || 0),
    hits: (o && o.hits) || 0, fine: Math.round((o && o.fine) || 0), hp: S.hp, hpMax: S.hpMax, rev: S.revives || 0,
    people: S.people || 0, wrecks: S.wrecks || 0, boom: SH.boom, dist: c.dist, city: c.city ? 1 : 0,
    sea: seaName(c.sea), hol: c.hol || '', cam: c.cam || '', gfx: c.gfx || '', mood: (o && o.mood) || '', wallet: c.wallet, lvl: c.lvl, rank: c.rank, m,
  });
  first('shift1_end', { full: o && o.full ? 1 : 0, del });
  markLast(false);
  setTimeout(() => { flush(); }, 1500);
}

/* ── запуск / выключение ── */
let timer = 0;
function start () {
  if (ON || !available()) return;
  ON = true;
  installId = String(sget(KEY_ID, '') || '');
  if (!/^[a-z0-9]{8,40}$/.test(installId)) { installId = rid(16); fresh = true; sset(KEY_ID, installId); }
  t0Install = +sget(KEY_T0, 0) || 0;
  if (!t0Install) { t0Install = Date.now(); sset(KEY_T0, t0Install); }
  sessionId = rid(12); seq = 0; ST.t0 = performance.now();
  const ua = (navigator.userAgent || '');
  const os = /Windows/.test(ua) ? 'win' : /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Mac OS X/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : 'other';
  const c = ctx();
  ev('session_start', { first: fresh ? 1 : 0, lang: Platform.lang || '', scr: (screen.width || 0) + 'x' + (screen.height || 0), dpr: +(devicePixelRatio || 1).toFixed(2),
    cores: navigator.hardwareConcurrency || 0, ram: navigator.deviceMemory || 0, os, gpu: gpu(), shifts: +sget('dlv-shifts', 0) || 0, gfx: c.gfx || '',
    wallet: c.wallet, lvl: c.lvl, rank: c.rank, days: Math.floor((Date.now() - t0Install) / 86400000) });
  lastRun();
  markLast(false);
  for (const r of CL.session()) onError(r);      // ошибки загрузки — до init
  rafId = requestAnimationFrame(raf);
  timer = setInterval(() => { perf(); flush(); }, TEL.EVERY * 1000);
  setTimeout(() => { flush(); }, 5000);
}
function stop () {
  markLast(true);
  ON = false;
  Q.length = 0; SH.on = false;
  if (rafId) cancelAnimationFrame(rafId); rafId = 0; lastRaf = 0; ftN = 0;
  if (CL.PROF.fn === slowRec) CL.PROF.fn = null;
  if (timer) clearInterval(timer); timer = 0;
  sset(KEY_Q, []);
}
function sessionEnd () {
  if (!ON) return;
  ev('session_end', { sec: Math.round((performance.now() - ST.t0) / 1000), play: Math.round(ST.play), shifts: ST.shifts, where: where(), scr, scrSec: scrAt ? Math.round((performance.now() - scrAt) / 1000) : 0 });
  markLast(true);
  beacon();
}

export function init (api) {
  if (inited) return;
  inited = true;
  A = api || {};
  if (!available()) return;                       // детская: ни замеров, ни запросов, ни обёрток
  CL.HOOK.fn = onError;
  wrapConsole();
  if (A.onShiftStart) A.onShiftStart(shiftStart);
  if (A.onShiftEnd) A.onShiftEnd(shiftEnd);
  addEventListener('pagehide', sessionEnd);
  document.addEventListener('visibilitychange', () => {
    if (!ON) return;
    if (document.visibilityState === 'hidden') { perf(); ev('hide', { where: where() }); markLast(false, true); beacon(); }
    else markLast(false);
  });
  // файл не загрузился (картинка, скрипт, стиль): событие error элемента не всплывает — ловим на захвате
  addEventListener('error', e => { const t = e && e.target; if (t && t !== window && t.tagName) resFail(t.tagName.toLowerCase(), t.src || t.href || t.currentSrc || ''); }, true);
  // долгий запуск: до меню (main.js window.__boot) и до достроенного города (latebuild.js)
  if (A.lateDone) A.lateDone(() => setTimeout(() => { const b = window.__boot || {}; ev('boot', { pre: b.pre, game: b.game, menu: b.menu, built: Math.round(performance.now()) }); }, 0));
  if (on()) start();
  setTimeout(() => { if (typeof window !== 'undefined' && window.__dlv) window.__dlv.tel = DEBUG; }, 0);   // __dlv появляется позже init
}

export const DEBUG = {
  TEL, ST, SH, get on () { return ON; }, get quiet () { return QUIET; }, get test () { return TEST; },
  get installId () { return installId; }, get sessionId () { return sessionId; },
  queue: () => Q.slice(), flush, perf, poll, header, sessionEnd, beacon, gpu, first, heat,
  state: () => ({ on: ON, quiet: QUIET, test: TEST, q: Q.length, ...ST, shift: SH.on, screen: scr, url: URL_INGEST }),
};
