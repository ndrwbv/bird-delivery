/* Собрать все строки для перевода в src/i18n/_source.json.

   Берём: $t('…') / t('…') / N_('…') — ключ-строка; $tn(n, 'a|b|c') / tn(…) —
   множественное (plural: true); из index.html — текст [data-i18n],
   [data-i18n-html], значения data-i18n-ph / data-i18n-title. У каждого ключа —
   где встретился (ctx), чтобы переводчику было видно, что это за строка.

   node tools/i18n-extract.mjs            — перезаписать _source.json
   node tools/i18n-extract.mjs --missing  — ещё и показать, чего нет в словарях */
import fs from 'node:fs';
import path from 'node:path';
import { lex } from './jslex.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const out = {};
const add = (key, ctx, plural) => {
  if (!key || !/[А-Яа-яЁё]/.test(key)) return;
  const o = out[key] || (out[key] = { ctx: [] });
  if (o.ctx.length < 3 && !o.ctx.includes(ctx)) o.ctx.push(ctx);
  if (plural) o.plural = true;
};
const unq = v => v.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

function scanJs (file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const toks = lex(src);
  // /*i18n*/ [ … ] — все строки массива в словарь (списки, которые переводят по одной)
  for (const m of src.matchAll(/\/\*i18n\*\/\s*\[/g)) {
    let d = 0, e = m.index + m[0].length - 1;
    for (; e < src.length; e++) { if (src[e] === '[') d++; else if (src[e] === ']' && --d === 0) break; }
    for (const k of toks) if (k.kind === 'str' && k.start > m.index && k.end <= e) add(unq(k.value), rel + ':' + k.line);
  }
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.kind !== 'str') continue;
    const pre = src.slice(Math.max(0, k.start - 5), k.start);
    if (/(?:\$t|(?<![\w$.])t|N_)\($/.test(pre)) add(unq(k.value), rel + ':' + k.line);
    // $tn(выражение, 'a|b|c') — ищем открывающую скобку назад, до запятой верхнего уровня
    else if (/,\s*$/.test(pre)) {
      let j = k.start - 1, depth = 0;
      for (; j > 0 && k.start - j < 200; j--) {
        const c = src[j];
        if (c === ')' || c === ']') depth++;
        else if (c === '(' || c === '[') { if (!depth) break; depth--; }
      }
      if (/(?:\$tn|(?<![\w$.])tn)$/.test(src.slice(Math.max(0, j - 4), j))) add(unq(k.value), rel + ':' + k.line, true);
    }
  }
}
function walk (dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'vendor' && f !== 'i18n') walk(p); }
    else if (/\.m?js$/.test(f) && f !== 'city-data.js') scanJs(p);
  }
}
walk(path.join(ROOT, 'src'));

// разметка: текст элементов с data-i18n
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lineOf = i => html.slice(0, i).split('\n').length;
for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n(?:\s|>)[^>]*>([^<]*)<\/\1>|<(\w+)[^>]*\sdata-i18n>([^<]*)<\/\3>/g)) {
  const txt = (m[2] !== undefined ? m[2] : m[4]).trim();
  add(txt.replace(/&amp;/g, '&'), 'index.html:' + lineOf(m.index));
}
for (const m of html.matchAll(/data-i18n-(?:ph|title)="([^"]+)"/g)) add(m[1], 'index.html:' + lineOf(m.index));

const keys = Object.keys(out).sort((a, b) => a.localeCompare(b, 'ru'));
const sorted = {};
for (const k of keys) sorted[k] = out[k];
fs.writeFileSync(path.join(ROOT, 'src/i18n/_source.json'), JSON.stringify(sorted, null, 1) + '\n');
console.log('строк для перевода:', keys.length, '(из них множественных', keys.filter(k => out[k].plural).length + ')');

if (process.argv.includes('--missing')) {
  for (const f of fs.readdirSync(path.join(ROOT, 'src/i18n'))) {
    if (!/^[a-z]{2}\.json$/.test(f)) continue;
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n', f), 'utf8'));
    const miss = keys.filter(k => !(k in d));
    const extra = Object.keys(d).filter(k => !(k in out));
    console.log(f, 'нет перевода:', miss.length, '· лишних:', extra.length);
  }
}
