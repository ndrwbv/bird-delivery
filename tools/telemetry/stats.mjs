/* Сводка анонимной статистики словами для автора: npm run stats → печатает и пишет docs/STATS.md.
     npm run stats                — последние 30 дней, без проверочных событий (test)
     npm run stats -- --days=7    — за 7 дней
     npm run stats -- --test      — только проверочные (probe с ?tel, dev-сборки) — посмотреть, что сводка работает
     npm run stats -- --all       — всё вместе
     npm run stats -- --print     — только напечатать, docs/STATS.md не трогать
   Доступ — `yc --profile personal` (вход автора) или ключ telemetry-reader.local.json. docs/ANALYTICS.md */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, q, CONF } from './ydb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../docs/STATS.md');
const arg = (k, d) => { const a = process.argv.find(s => s === '--' + k || s.startsWith('--' + k + '=')); return a === undefined ? d : a.includes('=') ? a.split('=')[1] : true; };
const DAYS = Math.max(1, +arg('days', 30) || 30);
const MODE = arg('all') ? 'all' : arg('test') ? 'test' : 'real';

/* ── выгрузка постранично по первичному ключу ── */
async function load (d) {
  const rows = [];
  let last = null;
  const testCond = MODE === 'all' ? '' : MODE === 'test' ? ' AND test = true' : ' AND (test IS NULL OR test = false)';
  for (let page = 0; page < 500; page++) {
    const after = last ? ` AND (install_id, session_id, ts, seq) > ("${last.installId}"u, "${last.sessionId}"u, Timestamp("${last.ts.toISOString()}"), ${last.seq}u)` : '';
    const part = await q(d, `SELECT install_id, session_id, ts, seq, event, version, build, device, data, test FROM \`${CONF.table}\`
      WHERE ts > CurrentUtcTimestamp() - Interval("P${DAYS}D")${testCond}${after}
      ORDER BY install_id, session_id, ts, seq LIMIT 2000;`);
    for (const r of part) { try { r.d = r.data ? JSON.parse(r.data) : {}; } catch (e) { r.d = {}; } rows.push(r); }
    if (part.length < 2000) break;
    last = part[part.length - 1];
  }
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
  const mm = {}; for (const r of ends) for (const [k, v] of Object.entries(r.d.m || {})) if (!k.startsWith('ev.') && k !== 'ontime' && k !== 'late') inc(mm, k, v);
  const MM = { fly: 'полёты на родстере', roof: 'прыжки на крышу', block: 'перекрытия на обратном пути' };
  if (Object.keys(mm).length) { p(`За смены: ${top(mm).map(([k, v]) => (MM[k] || k) + ' — ' + n0(v) + ' (' + n1(v / Math.max(1, ends.length)) + ' на смену)').join(', ')}.`); p(''); }

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
  return L.join('\n') + '\n';
}

const d = await connect();
try {
  const rows = await load(d);
  const md = report(rows);
  process.stdout.write(md);
  if (!arg('print')) { fs.writeFileSync(OUT, md); console.error('записано: ' + path.relative(process.cwd(), OUT) + ' (' + rows.length + ' событий)'); }
} finally { await d.destroy(); }
