/* Страница политики конфиденциальности public/privacy.html — из одной точки правды src/game/privacytext.js
   (тот же текст, что на листе «что собираем» в игре) и английского словаря src/i18n/en.json.
     node tools/privacy-html.mjs          — переписать public/privacy.html
     node tools/privacy-html.mjs --check  — только сверить: код 1, если страница отстала от privacytext.js (npm run check)
   Поменял пункты в privacytext.js — запусти без флагов. Нет английского перевода пункта — ошибка (код 1). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY, PRIVACY_LINK } from '../src/game/privacytext.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/privacy.html');
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/en.json'), 'utf8'));
const check = process.argv.includes('--check');

const missing = [];
const en = s => { const v = EN[s]; if (typeof v !== 'string' || !v.trim()) { missing.push(s); return s; } return v; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const link = '<a href="' + PRIVACY_LINK.href + '">' + esc(PRIVACY_LINK.text) + '</a>';
const fill = s => esc(s).replace('{link}', link);

function block (tr, ind) {
  const out = [];
  for (const sec of PRIVACY.sections) {
    out.push('', ind + '<h2>' + esc(tr(sec.h)) + '</h2>');
    for (const p of sec.p || []) out.push(ind + '<p>' + fill(tr(p)) + '</p>');
    if (sec.li && sec.li.length) {
      out.push(ind + '<ul>');
      for (const li of sec.li) out.push(ind + '  <li>' + fill(tr(li)) + '</li>');
      out.push(ind + '</ul>');
    }
  }
  return out.join('\n');
}

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Птица Пицца — конфиденциальность</title>
<meta name="description" content="Какую анонимную статистику собирает игра «Птица Пицца» и как её выключить.">
<link rel="icon" href="icon-32.png">
<!-- НЕ ПРАВИТЬ РУКАМИ: страница собирается из src/game/privacytext.js (тот же текст — в игре, настройки → игра →
     «что собираем ▸») командой node tools/privacy-html.mjs; английский — из src/i18n/en.json -->
<style>
  /* страница политики конфиденциальности (docs/STEAM-COMPLIANCE.md «Анонимная статистика»): лист накладной */
  :root { --bg: #e9e2d2; --paper: #fbf6ea; --ink: #2b2620; --dim: #6d6457; --red: #b8322a; --line: #d8cdb6; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #1d1a16; --paper: #2a2621; --ink: #efe7d6; --dim: #b4a993; --red: #e0695f; --line: #4a4339; }
  }
  :root[data-theme="dark"] { --bg: #1d1a16; --paper: #2a2621; --ink: #efe7d6; --dim: #b4a993; --red: #e0695f; --line: #4a4339; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
  .sheet { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 28px 24px; box-shadow: 0 2px 0 var(--line); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; color: var(--red); }
  .date { color: var(--dim); font-size: 14px; margin: 0 0 20px; }
  ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; }
  hr { border: 0; border-top: 1px dashed var(--line); margin: 36px 0; }
  .stamp { display: inline-block; border: 2px solid var(--red); color: var(--red); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; transform: rotate(-2deg); margin-bottom: 12px; }
  a { color: var(--red); }
</style>
</head>
<body>
<main>
<div class="sheet">
  <span class="stamp">ПТИЦА ПИЦЦА</span>
  <h1>${esc(PRIVACY.title)}</h1>
  <p class="date">${esc(PRIVACY.updated)}</p>
${block(s => s, '  ')}

  <hr>

  <h1 lang="en">${esc(en(PRIVACY.title))}</h1>
  <p class="date" lang="en">${esc(en(PRIVACY.updated))}</p>
  <div lang="en">${block(en, '  ')}
  </div>
</div>
</main>
</body>
</html>
`;

if (missing.length) {
  console.error('privacy-html: нет английского перевода в src/i18n/en.json:\n  ' + missing.join('\n  '));
  process.exit(1);
}
const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (check) {
  if (cur === html) { console.log('privacy-html: страница совпадает с privacytext.js'); process.exit(0); }
  console.error('privacy-html: public/privacy.html отстала от src/game/privacytext.js — запусти node tools/privacy-html.mjs');
  process.exit(1);
}
if (cur === html) console.log('privacy-html: без изменений');
else { fs.writeFileSync(OUT, html); console.log('privacy-html: записана public/privacy.html'); }
