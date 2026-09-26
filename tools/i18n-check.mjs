/* Проверка словарей: у перевода те же {подстановки} и теги, что у исходника,
   множественное — объектом с категориями языка, нет пустых строк.
   node tools/i18n-check.mjs [lang…] — код выхода 1, если есть ошибки. */
import fs from 'node:fs';
const src = JSON.parse(fs.readFileSync('src/i18n/_source.json', 'utf8'));
const langs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('src/i18n').filter(f => /^[a-z]{2}\.json$/.test(f)).map(f => f.slice(0, 2));
const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const tags = s => (String(s).match(/<\/?[a-z]+/g) || []).sort().join(',');
let bad = 0;
for (const l of langs) {
  const d = JSON.parse(fs.readFileSync('src/i18n/' + l + '.json', 'utf8'));
  const cats = new Intl.PluralRules(l).resolvedOptions().pluralCategories;
  let miss = 0, errs = [];
  for (const [k, meta] of Object.entries(src)) {
    const v = d[k];
    if (v === undefined) { miss++; continue; }
    if (meta.plural) {
      if (typeof v !== 'object' || !v) { errs.push('не объект: ' + k); continue; }
      for (const c of cats) if (typeof v[c] !== 'string') errs.push(`нет категории ${c}: ${k}`);
      const forms = k.split('|');
      for (const c of Object.keys(v)) if (ph(v[c]) !== ph(forms[0])) errs.push(`подстановки (${c}): ${k}`);
      continue;
    }
    if (typeof v !== 'string' || !v.trim()) { errs.push('пусто: ' + k); continue; }
    if (ph(v) !== ph(k)) errs.push(`подстановки: «${k}» → «${v}»`);
    if (tags(v) !== tags(k)) errs.push(`теги: «${k}» → «${v}»`);
  }
  bad += errs.length;
  console.log(`${l}: нет перевода ${miss}, ошибок ${errs.length}`);
  for (const e of errs.slice(0, 20)) console.log('   ' + e);
}
process.exit(bad ? 1 : 0);
