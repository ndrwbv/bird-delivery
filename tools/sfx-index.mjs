/* Звуки из файлов (М2, docs/SOUNDS.md): какие файлы лежат в public/sfx.

   Игра не перебирает имена наугад (404 на каждый звук) — она один раз читает sfx/index.json:
     { "coin": ["coin-1.ogg", "coin-2.ogg"], "crash-heavy": ["crash-heavy.ogg"] }
   Этот список строит sfxIndex(): плагин в vite.config.js отдаёт его в dev (на каждый запрос — свежий:
   положил файл — F5) и кладёт в сборку (web, Стим, Яндекс) при vite build. Руками не пишется.

   Имя звука — имя файла без расширения и без хвоста «-цифры»: crash-heavy-2.ogg → «crash-heavy».
   Регистр не важен, форматы — .ogg .mp3 .wav .m4a .webm .flac.

   npm run sfx:index — таблица для автора: какие звуки есть в игре, у каких лежат файлы, и файлы
   с неизвестным именем (опечатка — игра их не возьмёт). В конце — музыка из public/music (docs/MUSIC.md). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SFX_DIR = path.join(ROOT, 'public', 'sfx');
export const MUSIC_DIR = path.join(ROOT, 'public', 'music');   // музыка (docs/MUSIC.md): тот же список → music/index.json
export const EXT = /\.(ogg|mp3|wav|m4a|webm|flac)$/i;

/** имя звука по имени файла: «Crash-Heavy-2.ogg» → «crash-heavy» */
export const nameOf = f => f.replace(EXT, '').toLowerCase().replace(/-\d+$/, '');

/** { имя: [файлы] } из папки */
export function sfxIndex (dir = SFX_DIR) {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return out; }
  for (const f of files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    if (f.startsWith('.') || !EXT.test(f)) continue;
    (out[nameOf(f)] = out[nameOf(f)] || []).push(f);
  }
  return out;
}

/** имена звуков, которые игра умеет брать из файлов: Snd.fx('имя' …) / Snd.fx(['имя', 'запасное'] …) в src */
export function knownNames () {
  const names = new Set();
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); continue; }
      if (!/\.js$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      // fx('coin', …) · fx(['crash-heavy', 'crash'], …) · fx(big ? 'a' : 'b', …)
      for (const m of src.matchAll(/(?:\bfx|\bSFX\.play)\(([^)]{0,160})/g)) {
        const head = m[1].split(/,\s*(?:[a-z]\w*\s*=>|\(\s*[a-z]\w*\s*\)\s*=>|null|undefined|\{)/)[0];
        for (const q of head.matchAll(/'([a-z][a-z0-9-]*)'/g)) names.add(q[1]);
      }
      // имя в переменной — пометка в комментарии рядом: «sfx-names: seal, stamp»
      for (const m of src.matchAll(/sfx-names:\s*([a-z0-9, -]+)/g)) for (const n of m[1].split(/[,\s]+/)) if (n) names.add(n);
    }
  };
  walk(path.join(ROOT, 'src'));
  return [...names].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idx = sfxIndex(), known = knownNames();
  const got = known.filter(n => idx[n]), miss = known.filter(n => !idx[n]);
  const stray = Object.keys(idx).filter(n => !known.includes(n));
  console.log('public/sfx: ' + Object.values(idx).reduce((s, a) => s + a.length, 0) + ' файл(ов)\n');
  console.log('из файлов (' + got.length + '):');
  for (const n of got) console.log('  ' + n.padEnd(18) + idx[n].join(', '));
  console.log('\nсинтез, файла нет (' + miss.length + '):\n  ' + (miss.join(', ') || '—'));
  if (stray.length) {
    console.log('\nНЕИЗВЕСТНЫЕ имена — игра их не возьмёт (опечатка?):');
    for (const n of stray) console.log('  ' + n.padEnd(18) + idx[n].join(', '));
  }
  // музыка: имена — те же правила (day-1.ogg → «day»), слоты — music.js SLOTS; радио — станции radio.js STATIONS
  const mus = sfxIndex(MUSIC_DIR), SLOTS = ['menu', 'day', 'night', 'tense', 'shiftend', 'radio-disco', 'radio-retro', 'radio-night'];
  console.log('\nмузыка, public/music (docs/MUSIC.md):');
  for (const n of SLOTS) console.log('  ' + n.padEnd(18) + (mus[n] ? mus[n].join(', ') : n.startsWith('radio-') ? '— нет (станция играет день / ночь)' : '— нет'));
  const mStray = Object.keys(mus).filter(n => !SLOTS.includes(n));
  if (mStray.length) console.log('  НЕИЗВЕСТНЫЕ — игра их не возьмёт: ' + mStray.map(n => mus[n].join(', ')).join(', '));
}
