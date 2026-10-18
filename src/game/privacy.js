/* Лист «что собираем» (18.10.2026): полный текст политики конфиденциальности прямо в игре — работает офлайн.
   Открывается из настроек → игра → кнопка «что собираем ▸» под строкой «анонимная статистика» (только взрослая
   версия: в детской нет ни статистики, ни строки). Текст — из privacytext.js (одна точка правды с
   public/privacy.html), строки — через t(): ru в коде, en — src/i18n/en.json.
   Внизу — «[B] назад» (в настройки, на ту же кнопку) и «выключить статистику / включить статистику» (telemetry.js).
   Листать: колесо, палец, крестовина или левый стик (курсор идёт по абзацам и пунктам), правый стик.
   B / Esc — назад: окно помечено data-back="settings", game.js panelBack возвращает в настройки,
   settings.js ставит курсор на «что собираем ▸».

     PV.open(P, body, back, focus) — нарисовать лист в окно P (#panel), body — #pn-body; back() — вернуться;
                                     focus — 'pv-tel', если перерисовали после нажатия */
import './privacy.css';
import { t } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';
import * as TEL from './telemetry.js';
import { PRIVACY, PRIVACY_LINK } from './privacytext.js';

export const KIND = 'privacy';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
/* строка политики: перевод, экранирование; {link} — адрес вопросов текстом (офлайн — ссылка всё равно не откроется) */
const line = s => esc(t(s)).replace('{link}', '<b class="pv-link">' + esc(PRIVACY_LINK.text) + '</b>');

export function open (P, body, back, focus) {
  P.dataset.kind = KIND; P.dataset.back = 'settings'; P.dataset.sub = '';
  const on = TEL.on();
  let first = true;
  // каждый абзац с заголовком и каждый пункт списка — шаг крестовины (data-pad): курсор ведёт, лист прокручивается за ним
  const pad = (tag, inner, cls = '') => {
    const af = first && !focus ? ' autofocus' : '';
    first = false;
    return '<' + tag + ' class="pv-pad' + (cls ? ' ' + cls : '') + '" data-pad tabindex="-1"' + af + '>' + inner + '</' + tag + '>';
  };
  const secs = PRIVACY.sections.map(sec => {
    const ps = (sec.p || []).map(s => '<p>' + line(s) + '</p>');
    // заголовок — вместе с первым абзацем, остальные абзацы — отдельными шагами
    let h = pad('div', '<h3>' + esc(t(sec.h)) + '</h3>' + (ps[0] || '')) + ps.slice(1).map(p => pad('div', p)).join('');
    if (sec.li && sec.li.length) h += '<ul>' + sec.li.map(s => pad('li', line(s))).join('') + '</ul>';
    return '<section class="pv-sec" data-sec="' + sec.id + '">' + h + '</section>';
  }).join('');

  body.innerHTML = '<header class="pn-t pv-head"><span>' + esc(t('анонимная статистика')) + '</span><b>' + esc(t('что собираем')) + '</b></header>' +
    '<div class="pv-pane"><div class="pv-list">' +
      '<div class="pv-top"><span class="pv-date">' + esc(t(PRIVACY.updated)) + '</span>' +
      '<span class="pv-seal' + (on ? '' : ' off') + '">' + esc(t('сейчас: {v}', { v: on ? t('вкл') : t('выкл') })) + '</span></div>' +
      secs + '</div></div>' +
    '<div class="pv-foot"><button type="button" class="pp-note pv-back" id="pv-back">' + keyHTML('back') + esc(t('назад')) + '</button>' +
      '<button type="button" class="pv-tel' + (on ? ' on' : '') + '" id="pv-tel"' + (focus === 'pv-tel' ? ' autofocus' : '') + '>' +
      esc(on ? t('выключить статистику') : t('включить статистику')) + '</button></div>';

  body.querySelector('#pv-back').addEventListener('click', () => back());
  body.querySelector('#pv-tel').addEventListener('click', () => {
    const pane = body.querySelector('.pv-pane'), y = pane ? pane.scrollTop : 0;
    TEL.set(!TEL.on());
    open(P, body, back, 'pv-tel');
    const p2 = body.querySelector('.pv-pane'); if (p2) p2.scrollTop = y;   // перерисовали — текст стоит, где был
  });
}

export const DEBUG = { open, KIND };
