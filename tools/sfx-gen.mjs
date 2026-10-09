/* Звуки через ElevenLabs Sound Effects API (М2а, docs/SOUNDS.md «Генерация»).

   npm run sfx                       — сгенерировать все звуки из tools/sfx-list.json, у которых ещё нет
                                       файлов в public/sfx: имя-1.mp3, имя-2.mp3 … (сколько variants)
   npm run sfx -- --dry              — только показать, что и сколько будет сгенерировано, и цену (ключ не нужен)
   npm run sfx -- --only=coin,honk   — только эти имена
   npm run sfx -- --force            — перегенерировать, даже если файлы есть (старые — в .sfx-old/)
   npm run sfx -- --limit=10         — не больше 10 звуков (имён) за запуск
   npm run sfx -- --loops            — вместе с петлями, которые игра пока не берёт (имени нет в коде); петли «город
                                       шумит» (amb-…, М7) и мотора (engine-…, М3) игра берёт — они генерируются и без флага

   Ключ — ELEVENLABS_API_KEY в .env.local в корне проекта (файл не коммитится, .gitignore).
   API: POST https://api.elevenlabs.io/v1/sound-generation, заголовок xi-api-key, тело
   { text, duration_seconds (0,5—30), prompt_influence (0—1), loop, model_id } → mp3 (output_format).
   После генерации — таблица tools/sfx-index.mjs (что из файлов, что синтезом). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SFX_DIR, sfxIndex, knownNames } from './sfx-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST_FILE = path.join(ROOT, 'tools', 'sfx-list.json');
const OLD_DIR = path.join(ROOT, '.sfx-old');
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const MODEL = 'eleven_text_to_sound_v2';
const FORMAT = 'mp3_44100_128';
/* цена (elevenlabs.io/pricing/api, 10.2026): API — $0,12 за минуту звука; на подписке — кредиты:
   на сайте 40 кредитов за секунду заданной длины (через API не дороже). Оценка, не счёт */
const USD_PER_SEC = 0.12 / 60;
const CREDITS_PER_SEC = 40;

const argv = process.argv.slice(2);
const has = k => argv.includes('--' + k);
const arg = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const DRY = has('dry'), FORCE = has('force'), LOOPS = has('loops');
const ONLY = arg('only') ? arg('only').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
const LIMIT = arg('limit') ? Math.max(0, parseInt(arg('limit'), 10) || 0) : Infinity;

const die = msg => { console.error('\n' + msg + '\n'); process.exit(1); };

/* ── список ── */
function readList () {
  let j;
  try { j = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8')); } catch (e) { die('Не читается tools/sfx-list.json: ' + e.message); }
  const errs = [], seen = new Set();
  const sounds = (j.sounds || []).map((s, i) => {
    const at = 'строка ' + (i + 1) + (s && s.name ? ' («' + s.name + '»)' : '');
    if (!s || typeof s.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.name) || /-\d+$/.test(s.name)) errs.push(at + ': имя — латиница, цифры, дефис, не кончается на «-цифры»');
    else if (seen.has(s.name)) errs.push(at + ': имя повторяется'); else seen.add(s.name);
    if (!s.prompt || typeof s.prompt !== 'string') errs.push(at + ': нет prompt');
    const dur = Number(s.dur);
    if (!(dur >= 0.5 && dur <= 30)) errs.push(at + ': dur — от 0,5 до 30 секунд');
    const v = s.variants === undefined ? 1 : Number(s.variants);
    if (!(Number.isInteger(v) && v >= 1 && v <= 8)) errs.push(at + ': variants — от 1 до 8');
    return { ...s, dur, variants: v, loop: !!s.loop, text: s.prompt + (s.style !== undefined ? (s.style ? ', ' + s.style : '') : (j.style ? ', ' + j.style : '')) };
  });
  if (errs.length) die('Ошибки в tools/sfx-list.json:\n  ' + errs.join('\n  '));
  return { sounds, influence: j.prompt_influence !== undefined ? Number(j.prompt_influence) : 0.3 };
}

/* ── ключ ── */
function apiKey () {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch (e) { /* файла нет */ }
  return '';
}

const NO_KEY = `Нет ключа ElevenLabs.

Что сделать:
  1. Зайти на elevenlabs.io → профиль (слева внизу) → API Keys → Create API Key
     (права: Sound Effects). Скопировать ключ — он показывается один раз.
  2. В корне проекта создать файл .env.local (рядом с package.json) с одной строкой:
       ELEVENLABS_API_KEY=сюда_ключ
     Файл в git не попадает.
  3. Снова: npm run sfx -- --dry  (проверить список и цену), потом npm run sfx`;

/* ── один звук ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function generate (key, s, influence) {
  const body = { text: s.text, duration_seconds: s.dur, prompt_influence: influence, model_id: MODEL };
  if (s.loop) body.loop = true;
  for (let attempt = 1; ; attempt++) {
    let r;
    try {
      r = await fetch(API + '?output_format=' + FORMAT, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < 3) { await sleep(2000 * attempt); continue; }
      throw new Error('нет связи с ElevenLabs: ' + e.message);
    }
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const txt = await r.text().catch(() => '');
    if (r.status === 401) die('ElevenLabs не принял ключ (401). Проверьте ELEVENLABS_API_KEY в .env.local — ключ целиком, без пробелов, и что у ключа есть право Sound Effects.\n' + txt.slice(0, 300));
    if (r.status === 402 || /quota|credits|insufficient/i.test(txt)) die('На аккаунте ElevenLabs кончились кредиты (' + r.status + '). Пополнить или сменить план — elevenlabs.io → Subscription. Уже сделанные файлы остались, следующий запуск продолжит с места.\n' + txt.slice(0, 300));
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(3000 * attempt); continue; }
    throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 300));
  }
}

/* ── основное ── */
const { sounds, influence } = readList();
const idx = sfxIndex();
const known = knownNames();
const listed = new Set(sounds.map(s => s.name));

if (ONLY) {
  const bad = ONLY.filter(n => !listed.has(n));
  if (bad.length) die('Нет в tools/sfx-list.json: ' + bad.join(', ') + '\nИмена — как в docs/SOUNDS.md.');
}
const missingInList = known.filter(n => !listed.has(n));
const strayInList = sounds.filter(s => !s.loop && !known.includes(s.name)).map(s => s.name);

const later = s => s.loop && !known.includes(s.name);          // петля, которую игра пока не берёт (имени нет в коде)
const want = sounds.filter(s => (ONLY ? ONLY.includes(s.name) : true) && (!later(s) || LOOPS || (ONLY && ONLY.includes(s.name))));
const skipHave = want.filter(s => idx[s.name] && !FORCE);
let todo = want.filter(s => !idx[s.name] || FORCE);
const cut = todo.length > LIMIT ? todo.length - LIMIT : 0;
if (cut) todo = todo.slice(0, LIMIT);

const gens = todo.reduce((n, s) => n + s.variants, 0);
const secs = todo.reduce((n, s) => n + s.variants * s.dur, 0);
const loopsLeft = !LOOPS && !ONLY ? sounds.filter(later).length : 0;

console.log(`tools/sfx-list.json: ${sounds.length} звуков, ${sounds.reduce((n, s) => n + s.variants, 0)} вариантов` +
  (sounds.some(s => s.loop) ? ` (из них петель — ${sounds.filter(s => s.loop).length})` : ''));
if (missingInList.length) console.log('⚠ игра знает, а в списке нет (добавить строку): ' + missingInList.join(', '));
if (strayInList.length) console.log('⚠ в списке, а игра такого имени не берёт (опечатка?): ' + strayInList.join(', '));
if (skipHave.length) console.log(`уже есть файлы — пропускаю (${skipHave.length}): ` + skipHave.map(s => s.name).join(', ') + '  [перегенерировать: --force]');
if (loopsLeft) console.log(`петли, которые игра пока не берёт (${loopsLeft}), пропускаю  [вместе с ними: --loops]`);
if (cut) console.log(`--limit=${LIMIT}: ещё ${cut} звук(ов) — в следующий запуск`);
console.log('');
if (!todo.length) { console.log('Генерировать нечего.'); process.exit(0); }

console.log((DRY ? 'Будет сгенерировано' : 'Генерирую') + ` — ${todo.length} звук(ов), ${gens} файл(ов), ${secs.toFixed(1)} с звука:`);
for (const s of todo) console.log(`  ${s.name.padEnd(14)} ×${s.variants}  ${String(s.dur).padStart(4)} с${s.loop ? '  петля' : ''}  ${s.ru || ''}`);
console.log(`\nЦена (оценка): по прайсу API ≈ ${secs * USD_PER_SEC < 0.01 ? 'меньше цента' : '$' + (secs * USD_PER_SEC).toFixed(2)} ($0,12 за минуту звука);` +
  ` в кредитах подписки — не больше ≈ ${Math.ceil(secs * CREDITS_PER_SEC).toLocaleString('ru')} (${CREDITS_PER_SEC} за секунду;` +
  ` в месяц: Starter — 30 000, Creator — 121 000).`);
if (DRY) { console.log('\n--dry: ничего не отправлено.'); process.exit(0); }

const key = apiKey();
if (!key) die(NO_KEY);

fs.mkdirSync(SFX_DIR, { recursive: true });
let made = 0, failed = [];
for (const s of todo) {
  if (FORCE && idx[s.name]) {                       // старые файлы — не удаляем, а в .sfx-old/ (вернуть — перетащить обратно)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(OLD_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of idx[s.name]) fs.renameSync(path.join(SFX_DIR, f), path.join(dir, f));
    console.log(`  ${s.name}: старые файлы → .sfx-old/${stamp}/`);
  }
  for (let i = 1; i <= s.variants; i++) {
    const file = `${s.name}-${i}.mp3`;
    process.stdout.write(`  ${file.padEnd(20)} `);
    try {
      const buf = await generate(key, s, influence);
      fs.writeFileSync(path.join(SFX_DIR, file), buf);
      made++;
      console.log(`готово, ${(buf.length / 1024).toFixed(0)} КБ`);
    } catch (e) {
      failed.push(file);
      console.log('ошибка: ' + e.message);
    }
  }
}
console.log(`\nСделано файлов: ${made}` + (failed.length ? `, не вышло: ${failed.length} (${failed.join(', ')}) — запустите ещё раз с --only=имя --force` : '') + '\n');
spawnSync(process.execPath, [path.join(ROOT, 'tools', 'sfx-index.mjs')], { stdio: 'inherit' });
