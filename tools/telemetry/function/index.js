/* Приёмник анонимной статистики «Птицы Пиццы» (Yandex Cloud Functions, nodejs22). docs/ANALYTICS.md

   Игра шлёт POST (text/plain — без предварительного OPTIONS) с пачкой событий:
     { k: 'bp1', i: install_id, s: session_id, v: версия, b: 'web'|'steam', d: 'desktop'|'deck'|'phone', t: true — проверка,
       e: [[seq, ts_ms, 'event', { data }], …] }
   Проверяет размер и формат, пишет пачку одним BulkUpsert в таблицу YDB `events` (ключ — день события, установка,
   запуск, время, номер; ~0,5 операции YDB на строку), отвечает 204.
   IP и заголовки не сохраняются. Мусор — 400 без записи. */
'use strict';
const { Driver, TokenAuthService, Types, TypedValues } = require('ydb-sdk');

const ENDPOINT = process.env.YDB_ENDPOINT || 'grpcs://ydb.serverless.yandexcloud.net:2135';
const DATABASE = process.env.YDB_DATABASE || '';
const TABLE = process.env.YDB_TABLE || 'events';
const KEYS = (process.env.GAME_KEYS || 'bp1').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BODY = 64 * 1024;           // байт в пачке
const MAX_EVENTS = 300;               // событий в пачке
const MAX_DATA = 2048;                // символов данных события
const DAY = 86400000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const reply = (code, text) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'text/plain' }, body: text || '' });

const quiet = { error: console.error, warn () {}, info () {}, debug () {}, trace () {}, fatal: console.error };
let driver = null, ready = null;
// токен сервисного аккаунта функции приходит в context.token каждого вызова (обновляется сам); локальная проверка — YDB_TOKEN
const auth = new TokenAuthService(process.env.YDB_TOKEN || '');
function getDriver () {
  if (!ready) {
    driver = new Driver({ endpoint: ENDPOINT, database: DATABASE, authService: auth, logger: quiet });
    ready = driver.ready(8000).then(ok => { if (!ok) { ready = null; throw new Error('ydb not ready'); } return driver; });
  }
  return ready;
}

const ROW = Types.struct({
  day: Types.DATE,
  install_id: Types.UTF8,
  session_id: Types.UTF8,
  ts: Types.TIMESTAMP,
  seq: Types.UINT32,
  event: Types.optional(Types.UTF8),
  version: Types.optional(Types.UTF8),
  build: Types.optional(Types.UTF8),
  device: Types.optional(Types.UTF8),
  data: Types.optional(Types.JSON),
  test: Types.optional(Types.BOOL),
  received: Types.optional(Types.TIMESTAMP),
});

const RE_ID = /^[a-z0-9]{8,40}$/;
const RE_VER = /^[\w.+-]{1,40}$/;
const RE_EV = /^[a-z][a-z0-9_.]{0,47}$/;
const BUILDS = new Set(['web', 'steam', 'ios', 'other']);
const DEVICES = new Set(['desktop', 'deck', 'phone']);

/** разбор пачки → строки таблицы или текст ошибки */
function parse (raw, now) {
  if (!raw || raw.length > MAX_BODY) return 'size';
  let p;
  try { p = JSON.parse(raw); } catch (e) { return 'json'; }
  if (!p || typeof p !== 'object') return 'json';
  if (!KEYS.includes(p.k)) return 'key';
  if (!RE_ID.test(p.i) || !RE_ID.test(p.s)) return 'id';
  if (typeof p.v !== 'string' || !RE_VER.test(p.v)) return 'version';
  const build = BUILDS.has(p.b) ? p.b : 'other';
  const device = DEVICES.has(p.d) ? p.d : 'desktop';
  if (!Array.isArray(p.e) || !p.e.length || p.e.length > MAX_EVENTS) return 'events';
  const test = p.t === true;
  const received = new Date(now);
  const rows = [];
  for (const e of p.e) {
    if (!Array.isArray(e)) continue;
    const [seq, ts, name, data] = e;
    if (!Number.isInteger(seq) || seq < 0 || seq > 4e9) continue;
    if (typeof name !== 'string' || !RE_EV.test(name)) continue;
    // часы игрока врут — событие из будущего или старше 30 дней пишем временем приёма
    const t = Number.isFinite(ts) && ts < now + DAY && ts > now - 30 * DAY ? ts : now;
    let js = null;
    if (data != null && typeof data === 'object') {
      js = JSON.stringify(data);
      if (js.length > MAX_DATA) js = JSON.stringify({ cut: js.length });
    }
    const ms = Math.round(t);
    rows.push({ day: new Date(ms - ms % DAY), install_id: p.i, session_id: p.s, ts: new Date(ms), seq, event: name, version: p.v, build, device, data: js, test, received });
  }
  return rows.length ? rows : 'events';
}

module.exports.handler = async function (event, context) {
  const tok = context && context.token && context.token.access_token;
  if (tok) auth.token = tok;
  const method = (event && event.httpMethod) || 'POST';
  if (method === 'OPTIONS') return reply(204);
  if (method !== 'POST') return reply(405, 'post only');
  let raw = (event && event.body) || '';
  if (event && event.isBase64Encoded) { try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { return reply(400, 'b64'); } }
  const rows = parse(raw, Date.now());
  if (typeof rows === 'string') return reply(400, rows);
  try {
    const d = await getDriver();
    await d.tableClient.withSession(s => s.bulkUpsert(TABLE, TypedValues.list(ROW, rows)), 5000);
  } catch (e) {
    console.error('write failed', e && e.message);
    ready = null;                     // следующий вызов подключится заново
    if (driver) { const old = driver; driver = null; old.destroy().catch(() => {}); }
    return reply(503, 'later');
  }
  return reply(204);
};
module.exports._parse = parse;        // для локальной проверки
