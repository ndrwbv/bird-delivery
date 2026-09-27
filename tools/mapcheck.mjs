#!/usr/bin/env node
/* Проверка карты без браузера: npm run mapcheck [-- --map seversk] [-- --list <kind>] [-- --json]

   Гоняет те же проверки, что ?mapcheck в игре (src/game/mapcheck.js), по
   city-data.js: сначала на сырых данных, потом после починки, которую игра
   делает на загрузке. Выход с кодом 1, если после починки остались ошибки. */
import { decodeHeights, checkMap, fixMap } from '../src/game/mapcheck.js';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] || true : null; };
const CITY_DATA = (await import('../src/maps/' + (opt('--map') || 'moscow') + '/city-data.js')).default;
const listKind = opt('--list'), asJson = args.includes('--json');

const city = structuredClone(CITY_DATA);
const TH = decodeHeights(city.terrain);

const t0 = performance.now();
const before = checkMap(city, TH);
const t1 = performance.now();
const fx = fixMap(city, TH, { report: true });
const after = checkMap(city, TH, { fade: true, treated: fx.deadEnds, tapers: fx.tapers });
const t2 = performance.now();

if (asJson) {
  process.stdout.write(JSON.stringify({ before, after, fixes: fx.log, deadEnds: fx.deadEnds }, null, 1));
  process.exit(after.some(i => i.severity === 'error') ? 1 : 0);
}

const tally = list => {
  const m = new Map();
  for (const i of list) {
    const k = m.get(i.kind) || { error: 0, warn: 0, info: 0 };
    k[i.severity]++;
    m.set(i.kind, k);
  }
  return m;
};
const A = tally(before), Bt = tally(after);
const kinds = [...new Set([...A.keys(), ...Bt.keys()])].sort();
const cell = k => (k ? [k.error && k.error + 'E', k.warn && k.warn + 'W', k.info && k.info + 'i'].filter(Boolean).join(' ') || '0' : '0');
console.log('\nmap check — ' + city.meta.city + ', ' + city.roads.length + ' roads after fixes\n');
console.log('kind'.padEnd(18) + 'before'.padEnd(16) + 'after');
console.log('-'.repeat(46));
for (const k of kinds) console.log(k.padEnd(18) + cell(A.get(k)).padEnd(16) + cell(Bt.get(k)));
const sev = (l, s) => l.filter(i => i.severity === s).length;
console.log('-'.repeat(46));
console.log('total'.padEnd(18) + `${sev(before, 'error')}E ${sev(before, 'warn')}W`.padEnd(16) + `${sev(after, 'error')}E ${sev(after, 'warn')}W`);

const fk = new Map();
for (const f of fx.log) fk.set(f.kind, (fk.get(f.kind) || 0) + 1);
console.log('\nfixes: ' + [...fk].map(([k, n]) => k + ' ' + n).join(', '));
for (const f of fx.log.filter(f => f.kind === 'smooth' || f.kind === 'lift' || f.kind === 'trim' || f.kind === 'pair')) console.log('  · ' + f.msg);
const de = fx.deadEnds;
console.log(`dead ends treated: ${de.length} (blocks ${de.filter(d => d.kind === 'blocks').length}, road works ${de.filter(d => d.kind === 'works').length})`);
console.log(`time: check ${(t1 - t0).toFixed(0)} ms, fix ${fx.ms.toFixed(0)} ms, recheck ${(t2 - t1 - fx.ms).toFixed(0)} ms`);

const show = listKind === true ? null : listKind;
if (listKind) {
  console.log('\nremaining' + (show ? ' ' + show : '') + ':');
  for (const i of after.filter(i => !show || i.kind === show)) console.log(`  ${i.severity.padEnd(5)} ${i.kind.padEnd(15)} ${String(i.x).padStart(7)} ${String(i.z).padStart(7)}  ${i.msg}`);
}
const errs = after.filter(i => i.severity === 'error');
if (errs.length) {
  console.log(`\n${errs.length} error(s) left after fixes:`);
  for (const i of errs.slice(0, 25)) console.log(`  ${i.kind.padEnd(15)} ${String(i.x).padStart(7)} ${String(i.z).padStart(7)}  ${i.msg}`);
  process.exit(1);
}
console.log('\nno errors left');
