/* Сводка анонимной статистики словами для автора: npm run stats → печатает и пишет docs/STATS.md.
     npm run stats                — последние 30 дней, без проверочных событий (test)
     npm run stats -- --days=7    — за 7 дней
     npm run stats -- --test      — только проверочные (probe с ?tel, dev-сборки) — посмотреть, что сводка работает
     npm run stats -- --all       — всё вместе
     npm run stats -- --print     — только напечатать, docs/STATS.md не трогать
     npm run stats -- --fresh     — забыть копию на диске и выгрузить всё заново
   Доступ — `yc --profile personal` (вход автора) или ключ telemetry-reader.local.json. docs/ANALYTICS.md
   Копия выгрузки — tools/telemetry/.cache/events.json (в .gitignore): из базы каждый раз тянутся только дни с
   последнего выгруженного (чтение тоже тратит операции бесплатного уровня). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, q, CONF } from './ydb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../docs/STATS.md');
const arg = (k, d) => { const a = process.argv.find(s => s === '--' + k || s.startsWith('--' + k + '=')); return a === undefined ? d : a.includes('=') ? a.split('=')[1] : true; };
const DAYS = Math.max(1, +arg('days', 30) || 30);
const MODE = arg('all') ? 'all' : arg('test') ? 'test' : 'real';

/* ── выгрузка: копия на диске + постранично по ключу (день, установка, запуск, время, номер) только новые дни ── */
const CACHE = path.join(here, '.cache', 'events.json');
const dayStr = d => new Date(d).toISOString().slice(0, 10);
async function fetchDays (d, from) {
  const rows = [];
  let last = null;
  for (let page = 0; page < 1000; page++) {
    const after = last ? ` AND (day, install_id, session_id, ts, seq) > (Date("${dayStr(last.day)}"), "${last.installId}"u, "${last.sessionId}"u, Timestamp("${last.ts.toISOString()}"), ${last.seq}u)` : '';
    const part = await q(d, `SELECT day, install_id, session_id, ts, seq, event, version, build, device, data, test FROM \`${CONF.table}\`
      WHERE day >= Date("${from}")${after} ORDER BY day, install_id, session_id, ts, seq LIMIT 2000;`);
    for (const x of part) rows.push({ day: dayStr(x.day), installId: x.installId, sessionId: x.sessionId, ts: x.ts.toISOString(), seq: x.seq, event: x.event, version: x.version, build: x.build, device: x.device, data: x.data, test: !!x.test });
    if (part.length < 2000) break;
    last = part[part.length - 1];
  }
  return rows;
}
async function load (d) {
  let cache = { days: {} };
  if (!arg('fresh')) { try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { /* нет копии */ } }
  const since = dayStr(Date.now() - DAYS * 86400000);
  const have = Object.keys(cache.days || {}).sort();
  const from = have.length && have[have.length - 1] > since ? have[have.length - 1] : since;   // последний день — заново (мог дописаться)
  const fresh = await fetchDays(d, from);
  for (const k of Object.keys(cache.days)) if (k >= from) delete cache.days[k];
  for (const x of fresh) (cache.days[x.day] = cache.days[x.day] || []).push(x);
  cache.at = new Date().toISOString();
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch (e) { /* — */ }
  console.error('из базы — дни с ' + from + ': ' + fresh.length + ' событий');
  const rows = [];
  for (const [k, list] of Object.entries(cache.days)) {
    if (k < since) continue;
    for (const x of list) {
      if (MODE === 'real' && x.test) continue;
      if (MODE === 'test' && !x.test) continue;
      let dd = {}; try { dd = x.data ? JSON.parse(x.data) : {}; } catch (e) { dd = {}; }
      rows.push({ ...x, ts: new Date(x.ts), d: dd });
    }
  }
  rows.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  return rows;
}

/* ── числа словами ── */
const n0 = v => Math.round(v).toLocaleString('ru-RU');
const n1 = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
const pct = (a, b) => (b ? Math.round(100 * a / b) + ' %' : '—');
const mins = s => (s >= 3600 ? n1(s / 3600) + ' ч' : s >= 60 ? n1(s / 60) + ' мин' : Math.round(s) + ' с');
const med = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const top = (obj, k = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k);
const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };

const WHERE = { title: 'в главном меню', garage: 'в гараже', over: 'на чеке смены (после смены)', drive: 'посреди смены (едет к клиенту)', back: 'посреди смены (едет в пиццерию)',
  handover: 'посреди смены (у клиента)', side: 'посреди смены (поручение)', dying: 'в момент аварии', '': 'неизвестно' };
const whereWord = w => (w && w.startsWith('ride.') ? 'в «покататься»' : WHERE[w] || w);
const DEV = { desktop: 'компьютер', deck: 'Steam Deck', phone: 'телефон' };
const EVK = { gig: 'концерт во дворе', crew: 'драка компаний', thugs: 'гопники', flirt: 'приглашение клиентки', moose: 'лоси', odd: 'сценка у двери / жители',
  story: 'глава сюжета', errand: 'поручение', gang: 'банда у пина', march: 'марш протеста', mafia: 'мафиози', raid: 'налёт на точку', riot: 'восстание',
  fest: 'фестиваль', hurricane: 'ураган' };
const MINI = { intercom: 'домофон', stairs: 'подъезд', talk: 'разговор у двери', meet: 'встреча-катсцена' };

function report (rows) {
  const L = [];
  const p = s => L.push(s);
  const real = MODE === 'real' ? 'без проверочных событий' : MODE === 'test' ? '**только проверочные события (test)** — цифры не про игроков' : 'все события, включая проверочные';
  p('# Статистика игры');
  p('');
  p(`Собрано ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC командой \`npm run stats\` · последние ${DAYS} дн. · ${real}. Что собирается и как — [ANALYTICS.md](ANALYTICS.md).`);
  p('');
  if (!rows.length) { p('Событий пока нет.'); return L.join('\n') + '\n'; }

  /* сессии */
  const ses = new Map();
  for (const r of rows) {
    const k = r.installId + '/' + r.sessionId;
    let s = ses.get(k);
    if (!s) { s = { install: r.installId, t0: r.ts, t1: r.ts, ev: [], device: r.device, build: r.build, version: r.version }; ses.set(k, s); }
    if (r.ts < s.t0) s.t0 = r.ts; if (r.ts > s.t1) s.t1 = r.ts;
    s.ev.push(r);
  }
  const S = [...ses.values()];
  const installs = new Set(S.map(s => s.install));
  const durs = S.map(s => { const e = s.ev.find(x => x.event === 'session_end'); return e && e.d.sec ? e.d.sec : (s.t1 - s.t0) / 1000; });
  const plays = S.map(s => { const e = s.ev.find(x => x.event === 'session_end'); return e ? e.d.play || 0 : s.ev.filter(x => x.event === 'perf').reduce((a, x) => a + (x.d.play || 0), 0); });
  const firstT = new Date(Math.min(...S.map(s => +s.t0))), lastT = new Date(Math.max(...S.map(s => +s.t1)));
  p('## Коротко');
  p('');
  p(`- Игроков (установок): **${n0(installs.size)}**, новых за период: ${n0(new Set(rows.filter(r => r.event === 'session_start' && r.d.first).map(r => r.installId)).size)}.`);
  p(`- Запусков игры (сессий): **${n0(S.length)}**, всего в игре **${mins(durs.reduce((a, b) => a + b, 0))}**, из них за рулём ${mins(plays.reduce((a, b) => a + b, 0))}.`);
  p(`- Сессия в среднем **${mins(avg(durs))}** (половина — короче ${mins(med(durs))}).`);
  p(`- События с ${firstT.toISOString().slice(0, 10)} по ${lastT.toISOString().slice(0, 10)}.`);
  const byDev = {}; for (const s of S) inc(byDev, DEV[s.device] || s.device);
  const byBuild = {}; for (const s of S) inc(byBuild, s.build === 'steam' ? 'Стим' : s.build === 'web' ? 'браузер' : s.build);
  p(`- Где играют: ${top(byDev).map(([k, v]) => k + ' ' + pct(v, S.length)).join(', ')}; сборка: ${top(byBuild).map(([k, v]) => k + ' ' + pct(v, S.length)).join(', ')}.`);
  const byVer = {}; for (const s of S) inc(byVer, s.version);
  p(`- Версии: ${top(byVer, 6).map(([k, v]) => k + ' (' + v + ')').join(', ')}.`);
  p('');

  /* смены */
  const ends = rows.filter(r => r.event === 'shift_end'), starts = rows.filter(r => r.event === 'shift_start');
  p('## Смены');
  p('');
  if (!starts.length) p('Смен не было.');
  else {
    const full = ends.filter(r => r.d.full).length;
    const sec = ends.map(r => r.d.sec || 0), del = ends.map(r => r.d.del || 0);
    const late = ends.reduce((a, r) => a + (r.d.late || 0), 0), ontime = ends.reduce((a, r) => a + ((r.d.m && r.d.m.ontime) || 0), 0);
    const perSes = S.map(s => s.ev.filter(x => x.event === 'shift_start').length);
    p(`- Начато смен: **${n0(starts.length)}**, закончено ${n0(ends.length)} (до конца — ${pct(full, ends.length)}); за запуск в среднем ${n1(avg(perSes))}, запусков без единой смены — ${pct(perSes.filter(v => !v).length, S.length)}.`);
    p(`- Смена длится в среднем **${mins(avg(sec))}** (половина — короче ${mins(med(sec))}); доставок за смену в среднем ${n1(avg(del))}, деньги — ${n0(avg(ends.map(r => r.d.money || 0)))} ₽.`);
    p(`- Опоздания: ${pct(late, late + ontime)} адресов; удары о машину за смену в среднем ${n1(avg(ends.map(r => r.d.hits || 0)))}; воскрешений ${n0(ends.reduce((a, r) => a + (r.d.rev || 0), 0))}; взрывов машины ${n0(ends.reduce((a, r) => a + (r.d.boom || 0), 0))}.`);
    const why = {}; for (const r of ends) inc(why, r.d.why || '?');
    p(`- Чем кончилась: ${top(why).map(([k, v]) => '«' + k + '» ' + pct(v, ends.length)).join(', ')}.`);
    const dist = {}; for (const r of ends) inc(dist, r.d.city ? 'весь город' : 'район ' + ((r.d.dist ?? -1) + 1));
    p(`- Где работали: ${top(dist).map(([k, v]) => k + ' — ' + v).join(', ')}.`);
    const sea = {}, hol = {}, cam = {};
    for (const r of ends) { inc(sea, r.d.sea || '?'); if (r.d.hol) inc(hol, r.d.hol); inc(cam, r.d.cam || '?'); }
    const SEA = { summer: 'лето', autumn: 'осень', winter: 'зима', spring: 'весна' }, CAM = { high: 'сзади, высоко', near: 'сзади, близко', cab: 'из-за руля' };
    p(`- Сезон: ${top(sea).map(([k, v]) => (SEA[k] || k) + ' ' + v).join(', ')}; праздники: ${top(hol).map(([k, v]) => k + ' ' + v).join(', ') || 'не было'}; камера: ${top(cam).map(([k, v]) => (CAM[k] || k) + ' ' + pct(v, ends.length)).join(', ')}.`);
    const deaths = {}; for (const r of rows.filter(x => x.event === 'death')) inc(deaths, r.d.why || '?');
    if (Object.keys(deaths).length) p(`- Срывы смены: ${top(deaths).map(([k, v]) => '«' + k + '» ' + v).join(', ')}.`);
  }
  p('');

  /* где бросают */
  p('## Где бросают');
  p('');
  const quit = {};
  for (const s of S) {
    const e = s.ev.find(x => x.event === 'session_end');
    let w = e ? e.d.where : '';
    if (!w) { const lastW = [...s.ev].reverse().find(x => x.d && x.d.where); w = lastW ? lastW.d.where : ''; }
    inc(quit, whereWord(w));
  }
  p('Где был игрок, когда закрыл игру (последнее, что пришло от запуска):');
  p('');
  for (const [k, v] of top(quit, 12)) p(`- ${k} — ${pct(v, S.length)} (${v})`);
  const closed = S.filter(s => s.ev.some(x => x.event === 'session_end')).length;
  p('');
  p(`Закрытие успели записать у ${pct(closed, S.length)} запусков; у остальных — по последнему событию (игру убили, пропала сеть).`);
  p('');

  /* механики */
  p('## Что включается и чем кончается');
  p('');
  const evk = {}; for (const r of rows.filter(x => x.event === 'event')) inc(evk, r.d.k);
  const shifts = Math.max(1, starts.length);
  if (Object.keys(evk).length) {
    p('События режиссёра (сколько раз, на смену):');
    p('');
    for (const [k, v] of top(evk, 20)) p(`- ${EVK[k] || k} — ${n0(v)} (${n1(v / shifts)} на смену)`);
    p('');
  }
  const er = rows.filter(x => x.event === 'errand'), ee = rows.filter(x => x.event === 'errand_end');
  if (er.length) {
    p(`Поручения: предложено ${n0(er.length)}, согласились ${pct(er.filter(r => r.d.r === 1).length, er.length)}, отказались ${pct(er.filter(r => r.d.r === 0).length, er.length)}; довезли ${n0(ee.filter(r => r.d.ok).length)} из ${n0(ee.length)} начатых.`);
    const byId = {}; for (const r of er) { byId[r.d.id] = byId[r.d.id] || [0, 0]; byId[r.d.id][0]++; if (r.d.r === 1) byId[r.d.id][1]++; }
    p('');
    for (const [k, [a, b]] of Object.entries(byId).sort((x, y) => y[1][0] - x[1][0]).slice(0, 10)) p(`- ${k}: предложено ${a}, взяли ${pct(b, a)}`);
    p('');
  }
  const mini = {}; for (const r of rows.filter(x => x.event === 'mini')) { const m = mini[r.d.k] = mini[r.d.k] || {}; inc(m, r.d.out || '?'); }
  if (Object.keys(mini).length) {
    p('Мини-игры у клиента (исходы):');
    p('');
    for (const [k, outs] of Object.entries(mini)) { const tot = Object.values(outs).reduce((a, b) => a + b, 0); p(`- ${MINI[k] || k} — ${tot}: ${top(outs).map(([o, v]) => o + ' ' + pct(v, tot)).join(', ')}`); }
    p('');
  }
  const ch = {}; for (const r of rows.filter(x => x.event === 'choice')) { const c = ch[r.d.h || '—'] = ch[r.d.h || '—'] || [0, 0, 0]; c[0]++; if (r.d.r === 1) c[1]++; else if (r.d.r === 0) c[2]++; }
  if (Object.keys(ch).length) {
    p('Разговоры с выбором (шапка окна → принял / отказался):');
    p('');
    for (const [k, [a, y, nn]] of Object.entries(ch).sort((x, z) => z[1][0] - x[1][0]).slice(0, 12)) p(`- ${k} — ${a}: принял ${pct(y, a)}, отказался ${pct(nn, a)}`);
    p('');
  }
  const mm = {}; for (const r of ends) for (const [k, v] of Object.entries(r.d.m || {})) if (!/^(ev\.|pick\.|air$|nitro_s$|replay$|stuck$|ontime$|late$)/.test(k)) inc(mm, k, v);
  const MM = { fly: 'полёты на родстере', roof: 'прыжки на крышу', block: 'перекрытия на обратном пути' };
  if (Object.keys(mm).length) { p(`За смены: ${top(mm).map(([k, v]) => (MM[k] || k) + ' — ' + n0(v) + ' (' + n1(v / Math.max(1, ends.length)) + ' на смену)').join(', ')}.`); p(''); }

  /* прогресс и покупки */
  p('## Прогресс и покупки');
  p('');
  const buys = rows.filter(x => x.event === 'buy');
  if (buys.length) {
    const BW = { car: 'машина', armor: 'броня', engine: 'мотор', paint: 'покраска', repair: 'ремонт', sell: 'продажа' };
    const g = {}; for (const r of buys) { const k = (BW[r.d.what] || r.d.what) + (r.d.id ? ' · ' + r.d.id : ''); const e = g[k] = g[k] || [0, 0]; e[0]++; e[1] += r.d.price || 0; }
    p(`Покупки и продажи (${buys.length}):`);
    p('');
    for (const [k, [n, sum]] of Object.entries(g).sort((a, b) => b[1][0] - a[1][0]).slice(0, 15)) p(`- ${k} — ${n} раз, ${n0(sum)} ₽`);
    p('');
  }
  const rev = rows.filter(x => x.event === 'revive');
  if (rev.length) p(`- Воскрешений ${rev.length}, в среднем за ${n0(avg(rev.map(r => r.d.price || 0)))} ₽ (со скидкой ${pct(rev.filter(r => r.d.sale).length, rev.length)}).`);
  const dep = rows.filter(x => x.event === 'dep');
  if (dep.length) { const byG = {}; for (const r of dep) inc(byG, r.d.game || '?'); p(`- «Депнуть»: ставок ${dep.length} (${top(byG).map(([k, v]) => k + ' ' + v).join(', ')}), выиграно ${pct(dep.filter(r => r.d.win).length, dep.length)}, поставлено ${n0(dep.reduce((a, r) => a + (r.d.stake || 0), 0))} ₽.`); }
  const dists = rows.filter(x => x.event === 'district');
  if (dists.length) { const byD = {}; for (const r of dists) inc(byD, 'район ' + (r.d.opened + 1)); p(`- Открыто районов: ${top(byD, 9).map(([k, v]) => k + ' — ' + v).join(', ')}; в среднем на смене № ${n1(avg(dists.map(r => r.d.shifts || 0)))}.`); }
  const ranks = rows.filter(x => x.event === 'rank');
  if (ranks.length) p(`- Звания: повышений ${ranks.filter(r => r.d.up).length}, понижений ${ranks.filter(r => !r.d.up).length}; самое высокое — ${Math.max(...ranks.map(r => r.d.i || 0))}.`);
  const don = rows.filter(x => x.event === 'donate');
  if (don.length) { const byK = {}; for (const r of don) inc(byK, r.d.k, r.d.v || 0); p(`- Донаты: ${top(byK).map(([k, v]) => k + ' ' + n0(v) + ' ₽').join(', ')}.`); }
  const wl = rows.filter(x => x.event === 'shift_start' && typeof x.d.wallet === 'number').map(x => x.d.wallet);
  if (wl.length) p(`- Копилка в начале смены: в среднем ${n0(avg(wl))} ₽, половина — меньше ${n0(med(wl))} ₽.`);
  const tm = rows.filter(x => x.event === 'test_money');
  if (tm.length) p(`- ⚠ Тестовая кнопка денег нажата ${tm.length} раз у ${new Set(tm.map(r => r.installId)).size} установок — их копилка не настоящая.`);
  if (!buys.length && !rev.length && !dep.length && !dists.length) p('Покупок и открытий пока не было.');
  p('');

  /* воронка новичка */
  p('## Воронка новичка');
  p('');
  const fun = rows.filter(x => x.event === 'funnel');
  const news = new Set(rows.filter(r => r.event === 'session_start' && r.d.first).map(r => r.installId));
  if (!fun.length) p('Шагов воронки пока нет.');
  else {
    const ORDER = ['shift1', 'hint.drive', 'hint.map', 'hint.nitro', 'hint.brake', 'tut_order', 'delivery1', 'hint.cash', 'hint.wallet', 'shift1_end', 'tour.shift', 'tour.garage', 'buy1', 'shift2', 'boom1', 'district2', 'shift5', 'shift10'];
    const FW = { shift1: 'начал первую смену', tut_order: 'отвёз учебный заказ', delivery1: 'первая доставка', shift1_end: 'досидел первую смену', 'tour.shift': 'обучение на чеке', 'tour.garage': 'обучение в гараже', buy1: 'первая покупка', shift2: 'вторая смена', boom1: 'первый взрыв', district2: 'открыл 2-й район', shift5: 'пятая смена', shift10: 'десятая смена', intro: 'вступление' };
    const by = {}; for (const r of fun) (by[r.d.k] = by[r.d.k] || []).push(r);
    const keys = [...ORDER.filter(k => by[k]), ...Object.keys(by).filter(k => !ORDER.includes(k)).sort()];
    const base = news.size || new Set(fun.map(r => r.installId)).size;
    p(`Из ${base} новых установок дошли до шага (время от первого запуска — половина быстрее):`);
    p('');
    for (const k of keys) {
      const list = by[k], who = new Set(list.map(r => r.installId)).size;
      const sk = list.filter(r => r.d.skip).length;
      p(`- ${FW[k] || (k.startsWith('hint.') ? 'подсказка «' + k.slice(5) + '»' : k)} — ${who} (${pct(who, base)}), через ${mins(med(list.map(r => r.d.t || 0)))}${sk ? ', пропустили ' + pct(sk, list.length) : ''}`);
    }
  }
  p('');

  /* тепловая карта */
  p('## Тепловая карта: где разбиваются, гибнут, опаздывают, застревают');
  p('');
  const heat = rows.filter(x => x.event === 'heat');
  if (!heat.length) p('Точек пока нет.');
  else {
    const HK = { boom: 'взрыв', death: 'срыв смены', hit: 'сильный удар', late: 'опоздание', stuck: 'застрял' };
    const byK = {}; for (const r of heat) inc(byK, HK[r.d.k] || r.d.k);
    p(`Всего ${heat.length}: ${top(byK).map(([k, v]) => k + ' ' + v).join(', ')}. Клетки 100 × 100 м, сверху — где чаще всего:`);
    p('');
    const cells = {};
    for (const r of heat) { const k = r.d.cx + ':' + r.d.cz; const c = cells[k] = cells[k] || { n: 0, k: {}, a: {}, d: r.d.d }; c.n++; inc(c.k, HK[r.d.k] || r.d.k); if (r.d.a) inc(c.a, r.d.a); }
    for (const [k, c] of Object.entries(cells).sort((a, b) => b[1].n - a[1].n).slice(0, 15)) {
      const a = top(c.a, 1)[0];
      p(`- ${a ? a[0] : 'клетка ' + k} (клетка ${k}${c.d != null ? ', район ' + (c.d + 1) : ''}) — ${c.n}: ${top(c.k).map(([kk, v]) => kk + ' ' + v).join(', ')}`);
    }
  }
  p('');

  /* экраны и настройки */
  p('## Экраны и настройки');
  p('');
  const scr = rows.filter(x => x.event === 'screen');
  if (scr.length) {
    const SW = { shift: 'смена', pause: 'пауза', title: 'главное меню', garage: 'гараж', replay: 'повтор', over: 'чек смены', 'panel.settings': 'настройки', 'panel.collect': 'находки', 'panel.shop': 'магазин' };
    const t1 = {}, n1x = {}; for (const r of scr) { inc(t1, r.d.s, r.d.sec || 0); inc(n1x, r.d.s); }
    p('Сколько времени на каком экране (всего, раз, в среднем):');
    p('');
    for (const [k, v] of top(t1, 15)) p(`- ${SW[k] || k} — ${mins(v)}, ${n1x[k]} раз, по ${mins(v / n1x[k])}`);
    p('');
  }
  const sets = rows.filter(x => x.event === 'setting');
  if (sets.length) {
    const g = {}; for (const r of sets) inc(g, r.d.id + ' → ' + r.d.v);
    p(`Смены настроек (${sets.length}):`);
    p('');
    for (const [k, v] of top(g, 15)) p(`- ${k} — ${v}`);
    p('');
    const off = sets.filter(r => r.d.id === 'tel');
    if (off.length) p(`Статистику включали заново ${off.length} раз (выключение не видно — после него игра молчит).`);
  }
  const mmx = {}; for (const r of ends) for (const [k, v] of Object.entries(r.d.m || {})) if (/^(pick\.|air|nitro_s|replay|stuck)/.test(k)) inc(mmx, k, v);
  if (Object.keys(mmx).length) { const PW = { 'pick.nos': 'кофе', 'pick.shield': 'щит', air: 'прыжков', nitro_s: 'секунд нитро', replay: 'повторов', stuck: 'застреваний' }; p(`За смену в среднем: ${top(mmx, 12).map(([k, v]) => (PW[k] || k) + ' ' + n1(v / Math.max(1, ends.length))).join(', ')}.`); p(''); }

  /* падения */
  p('## Падения целиком');
  p('');
  const cp = rows.filter(x => x.event === 'crash_prev'), ue = rows.filter(x => x.event === 'unclean_exit');
  if (!cp.length && !ue.length) p('Падений и нечистых выходов не было.');
  else {
    if (cp.length) {
      const g = {}; for (const r of cp) { const k = (r.d.kind || '?') + ' · ' + (r.d.msg || '').slice(0, 80); const e = g[k] = g[k] || { n: 0, dev: {}, v: {} }; e.n++; inc(e.dev, DEV[r.device] || r.device); inc(e.v, r.d.v || r.version); }
      p(`Оболочка Стима записала (падение страницы, «не отвечает», видеокарта) — ${cp.length}:`);
      p('');
      for (const [k, e] of Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 10)) p(`- ${k} — ${e.n}; ${top(e.dev).map(([a, b]) => a + ' ' + b).join(', ')}; версии ${top(e.v, 4).map(([a]) => a).join(', ')}`);
      p('');
    }
    if (ue.length) {
      const inShift = ue.filter(r => r.d.sh).length, hid = ue.filter(r => r.d.hid).length;
      const byW = {}; for (const r of ue) inc(byW, whereWord(r.d.w));
      p(`Прошлый запуск кончился без выхода: ${ue.length} (${pct(ue.length, S.length)} запусков); посреди смены — ${inShift}; свёрнутым (скорее закрыли или выгрузила система) — ${hid}, на экране (похоже на падение) — ${ue.length - hid}. Где: ${top(byW).map(([k, v]) => k + ' ' + v).join(', ')}.`);
      const byDV = {}; for (const r of ue.filter(x => !x.d.hid)) inc(byDV, (DEV[r.device] || r.device) + ' ' + (r.d.v || ''));
      if (Object.keys(byDV).length) p(`На экране — по устройствам и версиям: ${top(byDV, 8).map(([k, v]) => k + ' — ' + v).join(', ')}.`);
    }
  }
  const gl = rows.filter(x => x.event === 'error' && x.d.kind === 'gl');
  if (gl.length) p(`Видеокарта теряла контекст WebGL ${gl.length} раз (${top((() => { const o = {}; for (const r of gl) inc(o, DEV[r.device] || r.device); return o; })()).map(([k, v]) => k + ' ' + v).join(', ')}).`);
  const mh = rows.filter(x => x.event === 'mem_high');
  if (mh.length) p(`Память на исходе (куча JS > 85 % предела): ${mh.length} запусков, в среднем ${n0(avg(mh.map(r => r.d.mem || 0)))} из ${n0(avg(mh.map(r => r.d.limit || 0)))} МБ.`);
  p('');

  /* ошибки */
  p('## Ошибки и зависания');
  p('');
  const errs = rows.filter(x => x.event === 'error');
  if (!errs.length) p('Ни одной ошибки не пришло.');
  else {
    const g = {};
    for (const r of errs) {
      const k = (r.d.kind || '?') + ' · ' + (r.d.where || '?') + ' · ' + (r.d.msg || '').slice(0, 90) + (r.d.at ? ' · ' + r.d.at : '');
      const e = g[k] = g[k] || { n: 0, ses: new Set(), ver: new Set() };
      e.n += r.d.n || 1; e.ses.add(r.installId + r.sessionId); e.ver.add(r.version);
    }
    p(`Всего записей ${n0(errs.length)}, в ${pct(new Set(errs.map(r => r.installId + r.sessionId)).size, S.length)} запусков. Топ (вид · где · текст · файл:строка):`);
    p('');
    for (const [k, e] of Object.entries(g).sort((a, b) => b[1].ses.size - a[1].ses.size || b[1].n - a[1].n).slice(0, 12)) p(`- ${k} — запусков ${e.ses.size}, раз ${e.n}; версии ${[...e.ver].slice(0, 4).join(', ')}`);
    p('');
    p('Виды: error — ошибка страницы, rejection — промис, frame — ядро кадра, step / fuse — часть мира упала / выключена, freeze — мир стоял 3 с ([CRASHES.md](CRASHES.md)).');
  }
  p('');

  const rf = rows.filter(x => x.event === 'res_fail');
  if (rf.length) { const g = {}; for (const r of rf) inc(g, r.d.src + ' · ' + r.d.msg); p('Файлы не загрузились:'); p(''); for (const [k, v] of top(g, 10)) p(`- ${k} — ${v}`); p(''); }
  const wr = {}; for (const r of rows) { const list = (r.event === 'perf' || r.event === 'warn') && (r.d.warn || r.d.top); if (Array.isArray(list)) for (const [k, v] of list) inc(wr, k, v); }
  if (Object.keys(wr).length) { p('Предупреждения и пойманные ошибки в консоли (warn / error), топ:'); p(''); for (const [k, v] of top(wr, 10)) p(`- ${k} — ${v}`); p(''); }

  /* скорость */
  p('## Скорость по устройствам');
  p('');
  const perf = rows.filter(x => x.event === 'perf' && x.d.n >= 60);
  if (!perf.length) p('Замеров пока нет.');
  else {
    const by = {};
    for (const r of perf) { const k = (DEV[r.device] || r.device) + ', графика ' + (r.d.gfx || '?'); (by[k] = by[k] || []).push(r.d); }
    p('По минутам игры: кадр (половина кадров быстрее / 95 % быстрее), провалы дольше 50 мс в минуту, память.');
    p('');
    for (const [k, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
      const p50 = med(list.map(x => x.p50)), p95 = med(list.map(x => x.p95)), dr = avg(list.map(x => x.drops)), mem = med(list.filter(x => x.mem).map(x => x.mem));
      p(`- ${k} — ${list.length} мин: кадр ${n1(p50)} / ${n1(p95)} мс (~${Math.round(1000 / Math.max(1, p50))} к/с), провалов ${n1(dr)} в минуту${mem ? ', память ' + mem + ' МБ' : ''}`);
    }
  }
  p('');
  const slowAll = {}; let sfAll = 0;
  for (const r of perf) { sfAll += r.d.sf || 0; for (const [k, n, mx, av] of r.d.slow || []) { const e = slowAll[k] = slowAll[k] || { n: 0, max: 0, sum: 0 }; e.n += n; e.sum += av * n; if (mx > e.max) e.max = mx; } }
  if (Object.keys(slowAll).length) {
    p('');
    p(`Медленные шаги мира (замер — каждый 30-й кадр, ${n0(sfAll)} кадров; шаг дольше 4 мс):`);
    p('');
    for (const [k, e] of Object.entries(slowAll).sort((a, b) => b[1].n - a[1].n).slice(0, 10)) p(`- ${k} — ${e.n} раз (${pct(e.n, sfAll)} замеров), в среднем ${n1(e.sum / e.n)} мс, самое долгое ${n1(e.max)} мс`);
  }
  const boot = rows.filter(x => x.event === 'boot');
  if (boot.length) {
    p('');
    const byD = {}; for (const r of boot) (byD[DEV[r.device] || r.device] = byD[DEV[r.device] || r.device] || []).push(r.d);
    p('Запуск (половина быстрее): ' + Object.entries(byD).map(([k, l]) => `${k} — до меню ${n1(med(l.map(x => x.menu || 0)) / 1000)} с, город достроен ${n1(med(l.map(x => x.built || 0)) / 1000)} с (${l.length})`).join('; ') + '.');
  }
  const gpus = {}; for (const r of rows.filter(x => x.event === 'session_start' && x.d.gpu)) inc(gpus, (DEV[r.device] || r.device) + ' · ' + r.d.gpu);
  if (Object.keys(gpus).length) { p(''); p('Видеокарты: ' + top(gpus, 10).map(([k, v]) => k + ' (' + v + ')').join(', ') + '.'); }
  const upd = rows.filter(x => x.event === 'update');
  if (upd.length) { const g = {}; for (const r of upd) inc(g, r.d.from + ' → ' + r.d.to); p(''); p('Обновились: ' + top(g, 8).map(([k, v]) => k + ' (' + v + ')').join(', ') + '.'); }
  p('');

  /* объём */
  p('## Объём и бесплатный уровень');
  p('');
  const playMin = Math.max(1, plays.reduce((a, b) => a + b, 0) / 60), allMin = Math.max(1, durs.reduce((a, b) => a + b, 0) / 60);
  const perMin = rows.length / allMin;
  p(`- ${n0(rows.length)} событий за ${mins(allMin * 60)} в игре — ${n1(perMin)} в минуту. Пачка — раз в минуту (+ при сворачивании и закрытии): ~1 вызов функции на минуту игры.`);
  p(`- Бесплатно в месяц: функция — 1 млн вызовов (~${n0(1e6 / 60)} ч игры); база — 1 млн операций, запись ~0,5 операции на событие (замер 18.10.2026) → ~${n0(2e6 / Math.max(1, perMin) / 60)} ч игры при нынешних ${n1(perMin)} событиях в минуту; место — 1 ГБ (~2—3 млн строк, строки старше года стираются).`);
  p('');
  return L.join('\n') + '\n';
}

const d = await connect();
try {
  const rows = await load(d);
  const md = report(rows);
  process.stdout.write(md);
  if (!arg('print')) { fs.writeFileSync(OUT, md); console.error('записано: ' + path.relative(process.cwd(), OUT) + ' (' + rows.length + ' событий)'); }
} finally { await d.destroy(); }
