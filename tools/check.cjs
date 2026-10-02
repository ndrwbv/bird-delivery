/* npm run check — общие проверки перед сдачей, 1—2 минуты. Таблица в конце, код выхода 1 при провале.
   npm run check -- --rebuild   собрать заново, даже если сборки свежие
   npm run check -- --only=orders,smoke   только эти проверки (по началу id)
   npm run check -- --serial    дымовые прогоны по очереди (по умолчанию — разом: быстрее,
                                но время кадра чуть хуже, чем у одного)

   Новая проверка — элемент CHECKS: { id, name, group, run: async () => ({ status, info }) },
   status — 'ok' | 'warn' | 'fail'. Проверки одной group идут параллельно, группы — по очереди.
   Скрипт в игре — через probe(args) (tools/probe.cjs, отчёт JSON). */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const has = k => argv.includes('--' + k);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ELECTRON = require('electron');            // из node — путь к бинарнику
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bird-check-'));

function sh (cmd, args, opts = {}) {
  return new Promise(res => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...(opts.env || {}) } });
    let out = '', errs = '';
    p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { errs += b; });
    const kill = setTimeout(() => p.kill('SIGKILL'), (opts.timeout || 180) * 1000);
    p.on('close', code => { clearTimeout(kill); res({ code, out, err: errs }); });
  });
}
let nProbe = 0;
async function probe (args, timeout = 150) {
  const rep = path.join(TMP, 'r' + (nProbe++) + '.json');
  const r = await sh(ELECTRON, [path.join(__dirname, 'probe.cjs'), '--no-build', '--report=' + rep, '--timeout=' + (timeout - 10), ...args], { timeout });
  let j = null;
  try { j = JSON.parse(fs.readFileSync(rep, 'utf8')); } catch (e) { /* — */ }
  return j || { ok: false, errors: [], evalErr: 'probe без отчёта (код ' + r.code + '): ' + (r.err || r.out).trim().split('\n').slice(-3).join(' | ') };
}
const errLine = j => [j.evalErr && 'исключение: ' + j.evalErr, j.uncaught ? j.uncaught + ' необработанных: ' + (j.errors.find(e => /^Uncaught/.test(e)) || '').slice(0, 160) : '', j.loaded === false && 'игра не загрузилась', j.timeout && 'время вышло'].filter(Boolean).join('; ');

const build = mode => async () => {
  const r = await sh(process.execPath, [path.join(__dirname, 'probe-build.cjs'), mode, ...(has('rebuild') ? ['--rebuild'] : [])], { timeout: 240 });
  let j = {}; try { j = JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { j = { error: (r.err || r.out).trim() }; }
  if (j.error) return { status: 'fail', info: j.error.split('\n').filter(l => /error|Error|✗|failed/i.test(l)).slice(0, 3).join(' | ') || j.error.slice(0, 300) };
  return { status: 'ok', info: j.built ? 'собрана за ' + (j.ms / 1000).toFixed(1) + ' с' : 'свежая' };
};
/* журнал ошибок дымовых прогонов (src/platform/crashlog.js): предохранитель в цикле кадра глотает
   исключения, в консоль они уже не «Uncaught» — смотрим журнал. Проверка «журнал пуст» — ниже */
const CRASHES = [];
const crashLines = (c, label) => (c || []).map(e => `${label}: ${e.kind} ${e.where} ×${e.n} — ${e.msg}${e.at ? ' ' + e.at.trim() : ''}${e.state ? ' [' + e.state + (e.phase ? '/' + e.phase : '') + ']' : ''}`);
const smoke = (args, label) => async () => {
  const j = await probe([...args, '--js=return await smoke(30)'], 90);
  const e = errLine(j), s = j.result;
  if (s && s.crash) CRASHES.push(...crashLines(s.crash, label));
  else if (!s) CRASHES.push(label + ': нет результата — журнал не прочитан');
  if (e || !s) return { status: 'fail', info: e || 'нет результата' };
  const ft = s.ft || {}, base = `${s.m} м, кадр p50 ${ft.p50} p95 ${ft.p95} мс, ошибок консоли ${j.errors.length}`;
  if (!s.ok) return { status: 'fail', info: s.fail.join('; ') + ' · ' + base + (s.crash && s.crash.length ? '\n' + crashLines(s.crash, '    журнал').join('\n') : '') };
  return { status: ft.p95 > 33 ? 'warn' : 'ok', info: base + (ft.p95 > 33 ? ' (p95 > 33 мс)' : '') };
};

const CHECKS = [
  { id: 'build-web', name: 'сборка web', group: 1, run: build('web') },
  { id: 'build-steam', name: 'сборка steam', group: 1, run: build('steam') },
  { id: 'i18n', name: 'i18n:check', group: 1, run: async () => {
    const r = await sh(process.execPath, [path.join(__dirname, 'i18n-check.mjs')]);
    const lines = r.out.trim().split('\n');
    const miss = lines.map(l => /нет перевода (\d+)/.exec(l)).filter(Boolean).reduce((a, m) => a + +m[1], 0);
    const errs = lines.map(l => /ошибок (\d+)/.exec(l)).filter(Boolean).reduce((a, m) => a + +m[1], 0);
    if (r.code !== 0 || errs) return { status: 'fail', info: `ошибок ${errs}: ` + lines.filter(l => /^\s{3}/.test(l)).slice(0, 2).map(s => s.trim()).join(' | ') };
    return { status: miss ? 'warn' : 'ok', info: miss ? `без перевода ${miss} строк (на все языки)` : 'всё переведено' };
  } },
  { id: 'orders', name: 'заказы в открытых районах', group: 2, run: async () => {
    const j = await probe(['--eval=' + path.join(__dirname, 'probe-checks/orders-open.js')]);
    const e = errLine(j), r = j.result;
    if (e || !r) return { status: 'fail', info: e || 'нет результата' };
    if (r.skip) return { status: 'warn', info: r.skip };
    return { status: r.bad ? 'fail' : 'ok', info: `${r.total} адресов, ${r.shifts} смен, плохих ${r.bad}` + (r.bad ? ': ' + JSON.stringify(r.sample[0]) : '') };
  } },
  { id: 'smoke-adult', name: '30 с автопилота: взрослая (web)', group: 3, run: smoke(['--mode=web'], 'взрослая') },
  { id: 'smoke-phone', name: '30 с автопилота: телефон (web)', group: 3, run: smoke(['--size=phone'], 'телефон') },
  { id: 'smoke-crashlog', name: 'журнал ошибок пуст после дымовых', group: 4, run: async () => (
    CRASHES.length ? { status: 'fail', info: CRASHES.length + ' записей:\n' + CRASHES.map(l => '    ' + l).join('\n') } : { status: 'ok', info: 'пуст' }) },
  // детская версия и сборка Яндекса — только по явной просьбе автора (Яндекс собираем по нужде)
];

(async () => {
  const T0 = Date.now();
  const only = arg('only', '').split(',').filter(Boolean);
  const list = CHECKS.filter(c => !only.length || only.some(o => c.id.startsWith(o)));
  const rows = [];
  const runOne = async c => {
    const t = Date.now();
    let r;
    try { r = await c.run(); } catch (e) { r = { status: 'fail', info: String(e && e.message || e) }; }
    const row = { ...c, ...r, ms: Date.now() - t };
    rows.push(row);
    process.stderr.write(`  ${row.status === 'ok' ? 'ок ' : row.status === 'warn' ? 'внм' : 'ПРОВАЛ'} ${c.name} (${(row.ms / 1000).toFixed(1)} с)\n`);
    return row;
  };
  const groups = [...new Set(list.map(c => c.group))].sort((a, b) => a - b);
  for (const g of groups) {
    const cs = list.filter(c => c.group === g);
    // сборки упали — в игре проверять нечего
    if (g > 1 && rows.some(r => r.id.startsWith('build') && r.status === 'fail')) { for (const c of cs) rows.push({ ...c, status: 'fail', info: 'не запускалась: сборка упала', ms: 0 }); continue; }
    if (has('serial') && g === 3) { for (const c of cs) await runOne(c); } else await Promise.all(cs.map(runOne));
  }
  rows.sort((a, b) => list.indexOf(list.find(c => c.id === a.id)) - list.indexOf(list.find(c => c.id === b.id)));
  const W = Math.max(...rows.map(r => r.name.length));
  const mark = s => (s === 'ok' ? 'ок    ' : s === 'warn' ? 'внимание' : 'ПРОВАЛ').padEnd(8);
  console.log('');
  for (const r of rows) console.log(`${mark(r.status)}  ${r.name.padEnd(W)}  ${((r.ms / 1000).toFixed(1) + ' с').padStart(6)}  ${r.info || ''}`);
  const bad = rows.filter(r => r.status === 'fail').length, warn = rows.filter(r => r.status === 'warn').length;
  console.log(`\n${bad ? 'ПРОВАЛ: ' + bad : 'всё ок'}${warn ? ', предупреждений ' + warn : ''} · ${((Date.now() - T0) / 1000).toFixed(0)} с`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* — */ }
  process.exit(bad ? 1 : 0);
})();
