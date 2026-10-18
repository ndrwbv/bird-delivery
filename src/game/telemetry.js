/* ──────────────────────────────────────────────────────────────────────────
   Анонимная статистика (трек 12 «Аналитика», docs/ANALYTICS.md): сколько длится игра, где бросают, какие
   механики включаются и чем кончаются, ошибки и скорость. Приёмник — Cloud Function в личном облаке автора
   (tools/telemetry, YDB serverless). Ни имени, ни почты, ни IP: случайный номер установки и номер запуска.

   Когда шлёт: только взрослая версия (Стим, браузер), настройка «анонимная статистика» вкл (по умолчанию вкл).
   Детская (Яндекс, ?kids) — модуль не делает ничего: ни запросов, ни замеров. ?notel — выключено совсем.
   Проверки (probe / check / perf / tour / capture — у них ?debug или ?mute) и dev-сервер — копят, но не шлют;
   ?tel — шлют с пометкой test (сводка их не считает). Сборка dev-<коммит> — тоже test.

   Как шлёт: очередь событий [номер, время, имя, данные] — пачкой раз в 60 с (fetch keepalive, text/plain — без
   предварительного запроса), при сворачивании и закрытии — navigator.sendBeacon. Нет сети — копит до MAXQ
   (старое выбрасывает), при закрытии кладёт неотправленное в сохранение (dlv-tel-q) и шлёт в следующий запуск.
   На кадр не влияет: свой requestAnimationFrame пишет время кадра в кольцо (без аллокаций), всё остальное — по таймеру.

   События (поле data — коротко, без текста игрока):
     session_start {first, lang, scr, dpr, cores, os, shifts}    — запуск игры
     session_end   {sec, play, shifts, where}                    — закрыл (не всегда успевает — тогда конец = последнее событие)
     perf          {p50, p95, max, drops, fps, mem, gfx, dyn, where, play, n}   — раз в минуту, пока окно видно
     shift_start   {n, dist, city, quick}
     shift_end     {why, full, sec, play, del, late, money, hits, fine, hp, rev, people, wrecks, boom, dist, city, sea, hol, cam, gfx, m:{…}}
     event         {k}            — режиссёр начал событие (гопники, концерт, банда, налёт, ураган, сценка, поручение, глава…)
     choice        {h, r}         — окно разговора с двумя ответами: шапка и ответ (1 — принял, 0 — отказался, -1 — закрыли)
     errand        {id, r}        — поручение предложено: принял / отказался;  errand_end {id, ok}
     mini          {k, out}       — мини-игра у клиента: домофон / подъезд / разговор, исход
     death         {why}          — смена сорвалась: машина всё, утонул, под лёд…
     error         {kind, where, msg, at, n}   — запись журнала ошибок (crashlog.js), не больше ERR_MAX за запуск
   Счётчики за смену (m в shift_end): count(k) — трамплины на крышу, полёты, перекрытия, опоздания и т. п.

     TEL.init(api)  — game.js: { adult, career, S, playing(), where(), ctx(), counters(), onShiftStart, onShiftEnd }
     TEL.ev(name, data) / TEL.count(k) — из модулей; до init и в детской — ничего
     TEL.available() / TEL.on() / TEL.set(on) — настройка (settings.js)
     __dlv.tel — queue(), sent, flush(), state()
   ────────────────────────────────────────────────────────────────────────── */
import Platform from '../platform/index.js';
import * as CL from '../platform/crashlog.js';

export const URL_INGEST = 'https://functions.yandexcloud.net/d4eu40ddb8ngvb0aqjp6';
export const GAME_KEY = 'bp1';                    // ключ-строка версии протокола (приёмник принимает только известные)
export const TEL = { EVERY: 60, MAXQ: 400, BATCH: 250, MAX_BYTES: 48000, ERR_MAX: 25, STORED: 6 };
const KEY_ON = 'dlv-tel', KEY_ID = 'dlv-tel-id', KEY_Q = 'dlv-tel-q';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const DEV = !!(import.meta.env && import.meta.env.DEV);
const MODE = (import.meta.env && import.meta.env.MODE) || '';
const TEST = QS.has('tel') || DEV || /^dev/.test(BUILD);
const QUIET = !QS.has('tel') && (DEV || QS.has('debug') || QS.has('mute'));   // проверки: копим, но не шлём

let A = null, ON = false, inited = false;
let installId = '', sessionId = '', seq = 0, first = false;
const Q = [];                                     // [seq, ts, name, data]
const ST = { sent: 0, batches: 0, failed: 0, dropped: 0, errors: 0, lastCode: 0, shifts: 0, play: 0, minPlay: 0, t0: 0 };
const SH = { on: false, t0: 0, play: 0, m: {}, c0: null, boom: 0, late: 0 };

const rid = n => {
  let s = ''; const c = 'abcdefghijklmnopqrstuvwxyz0123456789', r = new Uint8Array(n);
  try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < n; i++) r[i] = Math.random() * 256; }
  for (let i = 0; i < n; i++) s += c[r[i] % 36]; return s; };
const store = () => Platform.store;
function sget (k, d) { try { const v = store().get(k, d); return v === undefined ? d : v; } catch (e) { return d; } }
function sset (k, v) { try { store().set(k, v); } catch (e) { /* — */ } }

/** есть ли статистика в этой сборке вообще (детская — нет) */
export const available = () => !!(A && A.adult) && Platform.id !== 'yandex' && MODE !== 'yandex' && !QS.has('kids') && !QS.has('notel');
export const on = () => available() && String(sget(KEY_ON, '1')) !== '0';
export function set (v) {
  sset(KEY_ON, v ? '1' : '0');
  try { store().flush && store().flush(); } catch (e) { /* — */ }
  if (v && !ON) start();
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

/* ── время кадра: своё кольцо, без аллокаций ── */
const FT = new Float32Array(4096);
let ftN = 0, lastRaf = 0, rafId = 0;
function raf (now) {
  rafId = requestAnimationFrame(raf);
  if (lastRaf) {
    const d = now - lastRaf;
    if (d > 0 && d < 1000) {                      // свернули и вернулись — не кадр
      FT[ftN++ & 4095] = d;
      if (A.playing && A.playing()) { const s = d / 1000; ST.play += s; ST.minPlay += s; if (SH.on) SH.play += s; }
    }
  }
  lastRaf = now;
}
const SORT = new Float32Array(4096);
function perf () {
  const n = Math.min(ftN, 4096);
  if (n < 30) { ftN = 0; return; }                // окно не видно — не мерили
  SORT.set(FT.subarray(0, n)); const s = SORT.subarray(0, n); s.sort();
  let sum = 0, drops = 0;
  for (let i = 0; i < n; i++) { sum += s[i]; if (s[i] > 50) drops++; }
  const pq = q => +s[Math.min(n - 1, Math.floor(n * q))].toFixed(1);
  const mem = performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined;
  const c = ctx();
  ev('perf', { p50: pq(0.5), p95: pq(0.95), max: +s[n - 1].toFixed(0), drops, fps: Math.round(1000 * n / sum), n, mem, gfx: c.gfx, dyn: c.dyn, where: where(), play: Math.round(ST.minPlay) });
  ftN = 0; ST.minPlay = 0;
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
  ev('error', { kind: r.kind, where: String(r.where || '').slice(0, 60), msg: String(r.msg || '').slice(0, 160), at: m ? m[1] + ':' + m[2] + (m[3] ? ':' + m[3] : '') : '', n: r.n || 1, ph: r.snap && r.snap.phase });
}

/* ── смена ── */
const ctx = () => { try { return (A && A.ctx && A.ctx()) || {}; } catch (e) { return {}; } };
const where = () => { try { return String(A.where ? A.where() : (A.S && A.S.state) || ''); } catch (e) { return '?'; } };
const counters = () => { try { return (A.counters && A.counters()) || {}; } catch (e) { return {}; } };
function shiftStart (o) {
  if (!ON) return;
  ST.shifts++;
  const c = ctx();
  Object.assign(SH, { on: true, t0: performance.now(), play: 0, m: {}, c0: counters(), boom: 0 });
  ev('shift_start', { n: (o && o.n) || 0, dist: c.dist, city: c.city ? 1 : 0, quick: c.quick ? 1 : 0 });
}
function shiftEnd (o) {
  if (!ON || !SH.on) return;
  SH.on = false;
  const S = A.S || {}, c = ctx(), c1 = counters(), m = { ...SH.m };
  for (const k in c1) { const d = (c1[k] || 0) - ((SH.c0 && SH.c0[k]) || 0); if (d > 0) m[k] = d; }
  const sea = typeof c.sea === 'number' ? ['summer', 'autumn', 'winter', 'spring'][Math.floor(((c.sea % 4) + 4) % 4)] : '';
  ev('shift_end', {
    why: String((o && o.why) || '').slice(0, 30), full: o && o.full ? 1 : 0,
    sec: Math.round((performance.now() - SH.t0) / 1000), play: Math.round(SH.play),
    del: (o && o.delivered) || S.delivered || 0, late: m.late || 0, money: Math.round((o && o.money) || S.money || 0),
    hits: (o && o.hits) || 0, fine: Math.round((o && o.fine) || 0), hp: S.hp, hpMax: S.hpMax, rev: S.revives || 0,
    people: S.people || 0, wrecks: S.wrecks || 0, boom: SH.boom, dist: c.dist, city: c.city ? 1 : 0,
    sea, hol: c.hol || '', cam: c.cam || '', gfx: c.gfx || '', mood: (o && o.mood) || '', m,
  });
  setTimeout(() => { flush(); }, 1500);
}
/** смена сорвалась (game.js gameOver): машина всё → взрыв */
export function death (why) {
  if (!ON) return;
  if (why === 'машина всё' && SH.on) SH.boom++;
  ev('death', { why: String(why || '').slice(0, 30) });
}

/* ── запуск / выключение ── */
let timer = 0;
function start () {
  if (ON || !available()) return;
  ON = true;
  installId = String(sget(KEY_ID, '') || '');
  if (!/^[a-z0-9]{8,40}$/.test(installId)) { installId = rid(16); first = true; sset(KEY_ID, installId); }
  sessionId = rid(12); seq = 0; ST.t0 = performance.now();
  const ua = (navigator.userAgent || '');
  const os = /Windows/.test(ua) ? 'win' : /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Mac OS X/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : 'other';
  ev('session_start', { first: first ? 1 : 0, lang: Platform.lang || '', scr: (screen.width || 0) + 'x' + (screen.height || 0), dpr: +(devicePixelRatio || 1).toFixed(2),
    cores: navigator.hardwareConcurrency || 0, ram: navigator.deviceMemory || 0, os, shifts: +sget('dlv-shifts', 0) || 0, gfx: ctx().gfx || '' });
  for (const r of CL.session()) onError(r);      // ошибки загрузки — до init
  rafId = requestAnimationFrame(raf);
  timer = setInterval(() => { perf(); flush(); }, TEL.EVERY * 1000);
  setTimeout(() => { flush(); }, 5000);
}
function stop () {
  ON = false;
  Q.length = 0; SH.on = false;
  if (rafId) cancelAnimationFrame(rafId); rafId = 0; lastRaf = 0; ftN = 0;
  if (timer) clearInterval(timer); timer = 0;
  sset(KEY_Q, []);
}
function sessionEnd () {
  if (!ON) return;
  ev('session_end', { sec: Math.round((performance.now() - ST.t0) / 1000), play: Math.round(ST.play), shifts: ST.shifts, where: where() });
  beacon();
}

export function init (api) {
  if (inited) return;
  inited = true;
  A = api || {};
  if (!available()) return;                       // детская: ни замеров, ни запросов
  CL.HOOK.fn = onError;
  if (A.onShiftStart) A.onShiftStart(shiftStart);
  if (A.onShiftEnd) A.onShiftEnd(shiftEnd);
  addEventListener('pagehide', sessionEnd);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ON) { perf(); ev('hide', { where: where() }); beacon(); } });
  if (on()) start();
  setTimeout(() => { if (typeof window !== 'undefined' && window.__dlv) window.__dlv.tel = DEBUG; }, 0);   // __dlv появляется позже init
}

export const DEBUG = {
  TEL, ST, SH, get on () { return ON; }, get quiet () { return QUIET; }, get test () { return TEST; },
  get installId () { return installId; }, get sessionId () { return sessionId; },
  queue: () => Q.slice(), flush, perf, header, sessionEnd, beacon,
  state: () => ({ on: ON, quiet: QUIET, test: TEST, q: Q.length, ...ST, shift: SH.on, url: URL_INGEST }),
};
