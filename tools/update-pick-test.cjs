/* Проверка: какую версию игра предлагает обновиться (electron/release-pick.cjs), без сети и Электрона.
   Из любой старой версии (0.9.1, 0.10.6, 0.11.0…) — сразу самая новая готовая, а не следующая по порядку.
   Данные: придуманный список (вперемешку, черновик, предрелиз, «ещё собирается») и снимок настоящего
   ответа GitHub tools/fixtures/github-releases.json (gh api repos/ndrwbv/bird-delivery/releases).

   node tools/update-pick-test.cjs          → JSON { ok, fail, cases }, код выхода 1 при провале (npm run check)
   node tools/update-pick-test.cjs --live   → ещё и живой ответ через gh api (нужен gh и сеть) */
const fs = require('fs');
const path = require('path');
const { parseVer, cmpVer, isNewer, pickLatest, ASSET } = require('../electron/release-pick.cjs');

const fail = [];
let cases = 0;
const eq = (what, got, want) => { cases++; if (got !== want) fail.push(`${what}: ${got} вместо ${want}`); };

/* ── сравнение номеров числами ── */
eq('0.10.6 > 0.9.1', cmpVer('v0.10.6', 'v0.9.1') > 0, true);
eq('0.11.0 > 0.10.6', cmpVer('v0.11.0', 'v0.10.6') > 0, true);
eq('1.0.0 > 0.99.99', cmpVer('v1.0.0', 'v0.99.99') > 0, true);
eq('0.12.3 = 0.12.3', cmpVer('v0.12.3', '0.12.3'), 0);
eq('не номер', parseVer('local-abc'), null);
eq('та же — не новее', isNewer('v0.12.3', 'v0.12.3'), false);
eq('старее — не предлагать', isNewer('v0.11.0', 'v0.12.0'), false);
eq('0.10.0 новее 0.9.9', isNewer('v0.10.0', 'v0.9.9'), true);

/* ── придуманный список ── */
const asset = (name, tag, extra) => ({ name, state: 'uploaded', size: 1e8, browser_download_url: `https://x/${tag}/${name}`, ...extra });
const rel = (tag, opts = {}) => ({
  tag_name: tag, draft: !!opts.draft, prerelease: !!opts.prerelease, body: 'что нового ' + tag,
  assets: opts.assets || [asset(ASSET.win32, tag), asset(ASSET.linux, tag), asset('install-deck.sh', tag)],
});
const LIST = [   // нарочно не по порядку: строкой «v0.9.1» > «v0.12.3», а первым в списке стоит старый
  rel('v0.9.1'), rel('v0.12.0'), rel('v0.10.6'), rel('v0.2.0'), rel('v0.12.3'), rel('v0.11.0'), rel('v0.10.10'),
  rel('v0.12.4', { assets: [] }),                                                   // ещё собирается — файлов нет
  rel('v0.12.5', { assets: [asset(ASSET.win32, 'v0.12.5', { state: 'starter', size: 0 }), asset(ASSET.linux, 'v0.12.5', { size: 0 })] }), // файлы ещё грузятся
  rel('v0.13.0', { draft: true }), rel('v0.14.0', { prerelease: true }), rel('nightly'),
];
for (const plat of ['win32', 'linux']) {
  const p = pickLatest(LIST, plat);
  eq(`придуманный, ${plat}: самая новая готовая`, p && p.tag, 'v0.12.3');
  eq(`придуманный, ${plat}: файл той же версии`, p && p.asset, `https://x/v0.12.3/${ASSET[plat]}`);
  for (const cur of ['v0.9.1', 'v0.10.6', 'v0.11.0', 'v0.12.0']) eq(`придуманный, ${plat}: из ${cur} → предложить`, isNewer(p.tag, cur), true);
  eq(`придуманный, ${plat}: с v0.12.3 — свежая`, isNewer(p.tag, 'v0.12.3'), false);
  eq(`придуманный, ${plat}: задом наперёд — то же`, (pickLatest([...LIST].reverse(), plat) || {}).tag, 'v0.12.3');
}
// установщика под Windows ещё нет, архив для Деки есть — Деке новая, Windows — прошлая готовая
const HALF = [...LIST, rel('v0.12.6', { assets: [asset(ASSET.linux, 'v0.12.6')] })];
eq('Дека: архив есть — v0.12.6', (pickLatest(HALF, 'linux') || {}).tag, 'v0.12.6');
eq('Windows: установщика нет — v0.12.3', (pickLatest(HALF, 'win32') || {}).tag, 'v0.12.3');
eq('Windows: адрес установщика', (pickLatest(HALF, 'win32') || {}).setup, `https://x/v0.12.3/${ASSET.win32}`);
eq('пустой ответ', pickLatest([], 'win32'), null);
eq('ответ — не список (ошибка GitHub)', pickLatest({ message: 'API rate limit exceeded' }, 'linux'), null);

/* ── настоящий ответ GitHub (снимок) ── */
function real (list, label) {
  for (const plat of ['win32', 'linux']) {
    const ready = list.filter(r => !r.draft && !r.prerelease && parseVer(r.tag_name) && (r.assets || []).some(a => a.name === ASSET[plat] && a.size > 0));
    const want = ready.map(r => r.tag_name).sort((a, b) => cmpVer(b, a))[0];
    const p = pickLatest(list, plat);
    eq(`${label}, ${plat}: самый большой номер с файлом`, p && p.tag, want);
    eq(`${label}, ${plat}: не первый попавшийся`, (pickLatest([...list].reverse(), plat) || {}).tag, want);
    for (const cur of ['v0.9.1', 'v0.10.6', 'v0.11.0']) if (cmpVer(want, cur) > 0) eq(`${label}, ${plat}: из ${cur} → ${want}`, isNewer(p.tag, cur), true);
    if (p) eq(`${label}, ${plat}: файл из того же релиза`, p.asset.includes(`/download/${p.tag}/${ASSET[plat]}`), true);
  }
}
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/github-releases.json'), 'utf8'));
real(snap, 'снимок GitHub');
eq('снимок GitHub: Windows — v0.12.3', (pickLatest(snap, 'win32') || {}).tag, 'v0.12.3');
eq('снимок GitHub: старые без установщика не мешают', (pickLatest(snap.filter(r => cmpVer(r.tag_name, 'v0.0.7') < 0), 'win32')), null);

if (process.argv.includes('--live')) {
  const { execFileSync } = require('child_process');
  try {
    const live = JSON.parse(execFileSync('gh', ['api', 'repos/ndrwbv/bird-delivery/releases?per_page=30'], { encoding: 'utf8', maxBuffer: 64e6 }));
    real(live, 'живой GitHub');
    console.error('живой GitHub: Windows', (pickLatest(live, 'win32') || {}).tag, '· Дека', (pickLatest(live, 'linux') || {}).tag);
  } catch (e) { fail.push('живой GitHub: ' + e.message.split('\n')[0]); }
}

console.log(JSON.stringify({ ok: !fail.length, cases, fail }));
process.exit(fail.length ? 1 : 0);
