/* Все литералы с кириллицей, ещё не обёрнутые в t(...): что осталось перевести. */
import fs from 'node:fs';
import { lex } from './jslex.mjs';
const files = process.argv.slice(2);
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const tok of lex(src)) {
    if (!/[А-Яа-яЁё]/.test(tok.value)) continue;
    const pre = src.slice(Math.max(0, tok.start - 4), tok.start);
    if (/\bt\($|tn\($/.test(pre)) continue;
    total++;
    console.log(f + ':' + tok.line + '\t' + tok.quote + tok.value.slice(0, 110).replace(/\n/g, '⏎'));
  }
}
console.error('осталось:', total);
