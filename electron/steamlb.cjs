/* Таблицы лидеров Стима (docs/STEAM.md §4.2).

   steamworks.js таблиц не умеет, поэтому — напрямую в steam_api через koffi (FFI: вызов функций
   из готовой библиотеки, без компиляции). Библиотеку steam_api берём ту же, что привёз и уже
   загрузил steamworks.js: Стим поднят им, мы только зовём функции таблиц.

   Тонкость — колбэки. steamworks.js (внутри steamworks-rs) работает в режиме ManualDispatch и
   30 раз в секунду сам разбирает очередь Стима: результат ЛЮБОГО асинхронного вызова, даже не
   своего, он забирает и выбрасывает. Поэтому, пока ждём ответа таблицы (busy()), очередь
   разбираем мы — тем же циклом, что steamworks-rs (RunFrame → GetNextCallback →
   GetAPICallResult → FreeLastCallback), — а в остальное время её разбирает steamworks.js.
   Переключает main.cjs. Пока открыта экранная клавиатура Стима (её колбэк ждёт steamworks.js),
   очередь не трогаем: запрос таблицы подождёт или уйдёт по таймауту.

   create({ log }) → null (нет koffi / библиотеки / Стима) или
     { busy(), pump(), upload(name, score, details), entries(name, kind, from, to) }
   kind: 'global' (места from..to, с 1), 'around' (вокруг игрока, from ≤ 0 ≤ to), 'friends'.
   Строка: { rank, score, details: [..], steamId, name, me }. Нет ответа Стима — null. */
'use strict';
const path = require('path');

const CB_DONE = 703;               // SteamAPICallCompleted_t (k_iSteamUtilsCallbacks + 3)
const CB_FIND = 1104;              // LeaderboardFindResult_t
const CB_DOWN = 1105;              // LeaderboardScoresDownloaded_t
const CB_UP = 1106;                // LeaderboardScoreUploaded_t
const SORT_DESC = 2;               // ELeaderboardSortMethod: больше — лучше
const SHOW_NUMERIC = 1;            // ELeaderboardDisplayType: просто число
const KEEP_BEST = 1;               // ELeaderboardUploadScoreMethod: хуже прошлого — не перезаписывать
const REQ = { global: 0, around: 1, friends: 2 };   // ELeaderboardDataRequest
const WAIT_MS = 10000;
const MAX_DETAILS = 8;
/* выравнивание uint64 в структурах колбэков: Windows — pack(8), mac/Linux — pack(4) */
const WIN = process.platform === 'win32';

/** steam_api из папки steamworks.js (в собранной игре — из app.asar.unpacked). */
function libFile () {
  let dir;
  try { dir = path.dirname(require.resolve('steamworks.js')); } catch (e) { return null; }
  dir = dir.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const rel = { win32: 'dist/win64/steam_api64.dll', linux: 'dist/linux64/libsteam_api.so', darwin: 'dist/osx/libsteam_api.dylib' }[process.platform];
  return rel ? path.join(dir, rel) : null;
}

const big = v => (typeof v === 'bigint' ? v : BigInt(v || 0));

function create ({ log = () => {}, file: fileOverride = '' } = {}) {   // file — другая steam_api (проверка на подделке)
  let koffi;
  try { koffi = require('koffi'); } catch (e) { log('lb: koffi нет:', e.message); return null; }
  const file = fileOverride || libFile();
  if (!file) { log('lb: нет steam_api под эту систему'); return null; }
  let lib;
  try { lib = koffi.load(file); } catch (e) { log('lb: steam_api не загрузился:', e.message); return null; }

  // первое имя из списка, которое есть в библиотеке (версии интерфейсов меняются от SDK к SDK)
  const fn = (...protos) => {
    for (const p of protos) { try { return lib.func(p); } catch (e) { /* следующая версия */ } }
    throw new Error('нет функции: ' + protos[0]);
  };
  let F;
  try {
    koffi.struct('BirdLbCallbackMsg', { user: 'int32', id: 'int32', param: 'void *', size: 'int32' });
    koffi.struct('BirdLbCallDone', { call: 'uint64', id: 'int32', size: 'uint32' });
    F = {
      pipe: fn('int32 SteamAPI_GetHSteamPipe()'),
      frame: fn('void SteamAPI_ManualDispatch_RunFrame(int32)'),
      next: fn('bool SteamAPI_ManualDispatch_GetNextCallback(int32, _Out_ BirdLbCallbackMsg *)'),
      free: fn('void SteamAPI_ManualDispatch_FreeLastCallback(int32)'),
      result: fn('bool SteamAPI_ManualDispatch_GetAPICallResult(int32, uint64, void *, int, int, _Out_ bool *)'),
      stats: fn('void * SteamAPI_SteamUserStats_v013()', 'void * SteamAPI_SteamUserStats_v012()', 'void * SteamAPI_SteamUserStats_v011()'),
      friends: fn('void * SteamAPI_SteamFriends_v018()', 'void * SteamAPI_SteamFriends_v017()'),
      user: fn('void * SteamAPI_SteamUser_v023()', 'void * SteamAPI_SteamUser_v022()', 'void * SteamAPI_SteamUser_v021()'),
      myId: fn('uint64 SteamAPI_ISteamUser_GetSteamID(void *)'),
      find: fn('uint64 SteamAPI_ISteamUserStats_FindOrCreateLeaderboard(void *, const char *, int, int)'),
      upload: fn('uint64 SteamAPI_ISteamUserStats_UploadLeaderboardScore(void *, uint64, int, int32, const int32 *, int)'),
      download: fn('uint64 SteamAPI_ISteamUserStats_DownloadLeaderboardEntries(void *, uint64, int, int, int)'),
      entry: fn('bool SteamAPI_ISteamUserStats_GetDownloadedLeaderboardEntry(void *, uint64, int, void *, void *, int)'),
      persona: fn('const char * SteamAPI_ISteamFriends_GetFriendPersonaName(void *, uint64)'),
      ask: fn('bool SteamAPI_ISteamFriends_RequestUserInformation(void *, uint64, bool)'),
    };
  } catch (e) { log('lb: steam_api без нужных функций:', e.message); return null; }

  const PIPE = F.pipe();                           // 0 — Стим не поднят (интерфейсы тогда не трогаем)
  if (!PIPE) { log('lb: нет канала Стима'); return null; }
  const US = F.stats(), FR = F.friends(), USER = F.user();
  if (!US || !FR || !USER) { log('lb: Стим не поднят (интерфейсы пустые)'); return null; }
  const ME = String(big(F.myId(USER)));

  /* ── ожидание результатов: ключ — номер вызова ── */
  const pending = new Map();
  const wait = (call, id) => new Promise(resolve => {
    const key = String(big(call));
    if (key === '0') { resolve(null); return; }        // k_uAPICallInvalid: Стим не принял вызов
    const t = setTimeout(() => { pending.delete(key); log('lb: таймаут', id); resolve(null); }, WAIT_MS);
    pending.set(key, { id, done: buf => { clearTimeout(t); resolve(buf); } });
  });

  /* один проход очереди Стима — как steamworks-rs run_callbacks, но свои результаты оставляем себе */
  const msg = {};
  function pump () {
    F.frame(PIPE);
    while (F.next(PIPE, msg)) {
      try {
        if (msg.id !== CB_DONE || !msg.param) continue;
        const d = koffi.decode(msg.param, 'BirdLbCallDone');
        const key = String(big(d.call));
        const p = pending.get(key);
        const buf = Buffer.alloc(Math.max(d.size, 1));
        const failed = [false];
        const ok = F.result(PIPE, d.call, buf, d.size, d.id, failed);
        if (!p) continue;                               // чужой результат: забрали и выбросили, как steamworks-rs
        pending.delete(key);
        p.done(ok && !failed[0] && d.id === p.id ? buf : null);
      } catch (e) { log('lb: колбэк:', e.message); }
      finally { F.free(PIPE); }
    }
  }

  /* ── таблица по имени: хендл кешируем ── */
  const boards = new Map();
  async function board (name) {
    if (boards.has(name)) return boards.get(name);
    const buf = await wait(F.find(US, String(name), SORT_DESC, SHOW_NUMERIC), CB_FIND);
    if (!buf) return null;
    const h = buf.readBigUInt64LE(0), found = buf.readUInt8(8);
    if (!found || !h) { log('lb: таблицы нет:', name); return null; }
    boards.set(name, h);
    return h;
  }

  async function upload (name, score, details = []) {
    const h = await board(name);
    if (!h) return null;
    const det = Int32Array.from((Array.isArray(details) ? details : []).slice(0, MAX_DETAILS).map(v => Math.round(+v || 0) | 0));
    const buf = await wait(F.upload(US, h, KEEP_BEST, Math.round(+score || 0) | 0, det.length ? det : null, det.length), CB_UP);
    if (!buf) return null;
    // LeaderboardScoreUploaded_t: bool ok; uint64 board; int32 score; bool changed; int rank; int prev
    const o = WIN ? 8 : 4;
    return { ok: !!buf.readUInt8(0), score: buf.readInt32LE(o + 8), changed: !!buf.readUInt8(o + 12), rank: buf.readInt32LE(o + 16), prev: buf.readInt32LE(o + 20) };
  }

  async function entries (name, kind, from, to) {
    const h = await board(name);
    if (!h) return null;
    const req = REQ[kind];
    if (req === undefined) return null;
    const buf = await wait(F.download(US, h, req, from | 0, to | 0), CB_DOWN);
    if (!buf) return null;
    // LeaderboardScoresDownloaded_t: uint64 board; uint64 entries; int count
    const list = buf.readBigUInt64LE(8), n = Math.min(buf.readInt32LE(16), 200);
    const rows = [];
    const e = Buffer.alloc(32), det = new Int32Array(MAX_DETAILS);
    for (let i = 0; i < n; i++) {
      det.fill(0);
      if (!F.entry(US, list, i, e, det, MAX_DETAILS)) continue;
      // LeaderboardEntry_t: uint64 steamId; int32 rank; int32 score; int32 details; uint64 ugc
      const id = e.readBigUInt64LE(0), cd = Math.max(0, Math.min(e.readInt32LE(16), MAX_DETAILS));
      rows.push({ steamId: String(id), rank: e.readInt32LE(8), score: e.readInt32LE(12), details: Array.from(det.slice(0, cd)) });
    }
    // имена: незнакомых Стим подгружает сам — просим и ждём чуть-чуть
    let ask = false;
    for (const r of rows) { try { if (F.ask(FR, BigInt(r.steamId), true)) ask = true; } catch (x) { /* — */ } }
    if (ask) await new Promise(r => setTimeout(r, 1200));
    for (const r of rows) {
      let nm = '';
      try { nm = F.persona(FR, BigInt(r.steamId)) || ''; } catch (x) { /* — */ }
      r.name = nm === '[unknown]' ? '' : nm;
      r.me = r.steamId === ME;
    }
    return rows;
  }

  log('lb: таблицы Стима готовы');
  return { busy: () => pending.size > 0, pump, upload, entries };
}

module.exports = { create, libFile };
