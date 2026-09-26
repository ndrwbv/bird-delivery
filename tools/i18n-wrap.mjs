/* Обернуть в $t() самостоятельные строки с кириллицей в диапазоне строк:
   node tools/i18n-wrap.mjs файл от до [--dry]
   Кусочки склеек ('минус ' + x) и ключи объектов не трогает — их правим руками,
   чтобы в переводе была целая фраза с {подстановкой}. */
import fs from 'node:fs';
import { lex } from './jslex.mjs';
const [file, from, to, dry] = process.argv.slice(2);
const KEEP = new Set(['не доставил', 'машина всё', 'утонул', 'не успел', 'смена окончена']);
let src = fs.readFileSync(file, 'utf8');
const toks = lex(src).filter(k => k.line >= +from && k.line <= +to && k.kind === 'str' && /[А-Яа-яЁё]/.test(k.value));
const edits = [];
for (const k of toks) {
  const before = src.slice(Math.max(0, k.start - 6), k.start), after = src.slice(k.end, k.end + 6);
  if (/\$t\($|\$tn\($/.test(before)) continue;
  if (/\+\s*$/.test(before) || /^\s*\+/.test(after)) { console.log('склейка', k.line, k.value); continue; }
  if (/^\s*:/.test(after) && !/\?\s*$/.test(before)) { console.log('ключ', k.line, k.value); continue; }
  if (/\[\s*$/.test(before) && /^\s*\]/.test(after)) { console.log('индекс', k.line, k.value); continue; }
  if (KEEP.has(k.value)) { console.log('оставил', k.line, k.value); continue; }
  edits.push(k);
}
for (const k of edits.reverse()) src = src.slice(0, k.start) + '$t(' + src.slice(k.start, k.end) + ')' + src.slice(k.end);
console.log('обернул', edits.length);
if (!dry) fs.writeFileSync(file, src);
