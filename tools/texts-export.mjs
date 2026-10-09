/* Выгрузить все русские фразы игры в texts/ru.edit.json для правки автором.

   Формат: { "файл": { "фраза как сейчас": "фраза как сейчас", … }, … } — группы по файлу,
   где фраза встречается первой (из src/i18n/_source.json, поле ctx). Автор правит только
   ПРАВУЮ часть (значение). Левую не трогать — по ней агент найдёт фразу в коде.
   {name}, {n}, {money} и т. п. — подстановки: оставлять как есть. Множественные — «a|b|c».

   node tools/i18n-extract.mjs && node tools/texts-export.mjs
   Уже правленный texts/ru.edit.json не перезаписывается (флаг --force — перезаписать). */
import fs from 'node:fs';
const OUT = 'texts/ru.edit.json';
if (fs.existsSync(OUT) && !process.argv.includes('--force')) { console.log(OUT + ' уже есть — не трогаю (--force)'); process.exit(0); }
const src = JSON.parse(fs.readFileSync('src/i18n/_source.json', 'utf8'));
const groups = {};
for (const [k, v] of Object.entries(src)) {
  if (k.startsWith('_')) continue;
  const f = ((v && v.ctx && v.ctx[0]) || 'прочее').replace(/^src\/(game\/)?/, '').replace(/:\d+$/, '');
  (groups[f] ||= {})[k] = k;
}
const sorted = Object.fromEntries(Object.keys(groups).sort().map(f => [f, groups[f]]));
fs.mkdirSync('texts', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(OUT + ': ' + Object.values(groups).reduce((a, g) => a + Object.keys(g).length, 0) + ' фраз в ' + Object.keys(groups).length + ' файлах');
