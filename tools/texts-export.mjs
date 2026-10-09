/* Выгрузить все русские фразы игры в texts/ru.edit.json для правки автором.

   Формат: { "файл — о чём он": { "фраза как сейчас": { "где": "…", "как надо": "фраза" }, … } }.
   Автор правит только «как надо». Ключ (фраза как сейчас) не трогать — по нему агент найдёт
   фразу в коде. «где» — подсказка: ближайший комментарий в коде над фразой и имя списка/функции,
   откуда она; «ещё N мест» — фраза встречается и в других местах.
   {name}, {n}, {money} и т. п. — подстановки: оставлять как есть. Множественные — «a|b|c».

   node tools/i18n-extract.mjs && node tools/texts-export.mjs
   Уже правленный texts/ru.edit.json не перезаписывается (флаг --force — перезаписать). */
import fs from 'node:fs';
const OUT = 'texts/ru.edit.json';
if (fs.existsSync(OUT) && !process.argv.includes('--force')) { console.log(OUT + ' уже есть — не трогаю (--force)'); process.exit(0); }
const src = JSON.parse(fs.readFileSync('src/i18n/_source.json', 'utf8'));
const FILE_ABOUT = {
  'game.js': 'основная игра: смена, хад, тосты внизу, чат Толика, заказы в езде, пауза',
  'index.html': 'разметка экранов (меню, окна, кнопки)',
};
const cache = {};
const lines = f => cache[f] ||= (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : []);
const clean = s => s.replace(/^\s*(\/\*+|\/\/+|\*+)\s?/, '').replace(/\*+\/\s*$/, '').replace(/[─━═]+/g, '').trim();
function about (f) {
  const short = f.replace(/^src\/(game\/)?/, '');
  if (FILE_ABOUT[short]) return FILE_ABOUT[short];
  for (const l of lines(f).slice(0, 8)) { const c = clean(l); if (c.length > 8) return c.split(/(?<=[.:;])\s/)[0].replace(/\s*\(docs\/.*$/, ''); }
  return '';
}
const WHO = { courier: 'курьер (ты)', host: 'клиент', tolik: 'Толик', stepa: 'Стёпа', zina: 'баба Зина', leha: 'Лёха Арбуз',
  zheka: 'Жека', igor: 'Игорёк', nast: 'Настюша', arisha: 'Ариша', andr: 'Андрюша' };
const KEY = { items: 'что в заказе (накладная)', note: 'записка на накладной', why: 'зачем заказ', name: 'название',
  title: 'заголовок', sub: 'подпись под строкой', label: 'надпись на кнопке/карточке', desc: 'описание', hint: 'подсказка', kids: 'детская версия' };
function where (ctx) {
  const [f, n] = ctx.split(':'); const L = lines(f); const i = (+n || 1) - 1; const cur = L[i] || '';
  const out = [];
  const say = cur.match(/\[\s*'say'\s*,\s*'(\w+)'/); if (say) out.push('говорит ' + (WHO[say[1]] || say[1]));
  const key = cur.match(/\b(\w+)\s*:\s*N_\(/); if (key && KEY[key[1]]) out.push(KEY[key[1]]);
  if (/kids\s*:/.test(cur)) out.push('детская версия');
  if (/ADULT/.test(cur)) out.push('только взрослая');
  // сюжет: глава и герой выше по файлу
  if (say || /script|chapters/.test(L.slice(Math.max(0, i - 200), i).join('\n'))) {
    let ch = '', hero = '';
    for (let k = i; k >= Math.max(0, i - 220); k--) {
      const l = L[k] || '';
      if (!ch) { const m = l.match(/^\s*name\s*:\s*N_\('([^']+)'/); if (m) ch = m[1]; }
      if (!hero) { const m = l.match(/^\s*(?:hero|id)\s*:\s*'(\w+)'/); if (m) hero = m[1]; }
      if (ch && hero) break;
    }
    if (ch || hero) out.push('сюжет' + (hero ? ' ' + (WHO[hero] || hero) : '') + (ch ? ', глава «' + ch + '»' : ''));
  }
  let note = '', name = '';
  for (let k = i; k >= Math.max(0, i - 14); k--) {
    const l = L[k] || '';
    if (!name) {
      const m = l.match(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]{2,})/);
      if (m) name = m[1];
    }
    if (!note) {
      const c = l.match(/\/\/\s*(.+)$/) || l.match(/\/\*\s*(.+?)(\*\/|$)/);
      if (c && clean(c[1]).length > 3 && !/^[\w$.]+$/.test(clean(c[1]))) note = clean(c[1]);
    }
    if (note && name) break;
  }
  if (note && !say) out.push(note);
  if (name && !say && !out.length) out.push('(' + name + ')');
  return out.join(' · ');
}
const groups = {};
for (const [k, v] of Object.entries(src)) {
  if (k.startsWith('_')) continue;
  const ctx = (v && v.ctx) || []; const f = (ctx[0] || 'прочее').replace(/:\d+$/, '');
  const short = f.replace(/^src\/(game\/)?/, ''); const head = short + (about(f) ? ' — ' + about(f) : '');
  let w = ctx[0] ? where(ctx[0]) : '';
  if (ctx.length > 1) w += (w ? ' · ' : '') + 'ещё ' + (ctx.length - 1) + ' мест';
  if (v && v.plural) w += (w ? ' · ' : '') + 'формы для 1 | 2 | 5';
  (groups[head] ||= {})[k] = { 'где': w, 'как надо': k };
}
const sorted = Object.fromEntries(Object.keys(groups).sort().map(f => [f, groups[f]]));
fs.mkdirSync('texts', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
console.log(OUT + ': ' + Object.values(groups).reduce((a, g) => a + Object.keys(g).length, 0) + ' фраз в ' + Object.keys(groups).length + ' файлах');
