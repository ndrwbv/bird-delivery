/* Лист «авторы и лицензии» (23.10.2026, 0п27): кто сделал то, что в игре не наше, и по какой лицензии.
   Открывается из настроек → игра → «авторы и лицензии ▸» (и из главного меню, и из паузы; в обеих версиях).
   Подписи CC-BY (модели машин) и ODbL (карта) — обязательны: убрать строку нельзя, пока модель в игре.
   Новая чужая вещь в игре (модель, шрифт, звук, библиотека) — строкой сюда (и в docs/STEAM-COMPLIANCE.md).
   Вид — лист накладной, как «что собираем» (privacy.css: классы pv-*; своё — credits.css).
   Внизу — «[B] назад» (в настройки, на ту же кнопку). Листать: колесо, палец, крестовина, стик.

     CR.open(P, body, back, steam) — нарисовать лист в окно P (#panel), body — #pn-body; back() — вернуться;
                                     steam — сборка Стима (строки Electron и steamworks.js — только в ней) */
import './privacy.css';
import './credits.css';
import { t, N_ } from '../i18n/index.js';
import { keyHTML } from '../input/glyphs.js';

export const KIND = 'credits';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

/* что: name — как есть (имена и названия не переводим), who — автор, lic — лицензия, what — что это в игре (t), url — откуда */
export const CREDITS = [
  { h: N_('карта и рельеф'), li: [
    { name: 'OpenStreetMap', who: '© OpenStreetMap contributors', lic: 'ODbL 1.0', what: N_('дома, дороги, дворы и названия улиц города'), url: 'openstreetmap.org/copyright' },
    { name: 'SRTM', who: 'NASA / USGS', lic: 'public domain', what: N_('рельеф: холмы и низины') },
  ] },
  { h: N_('3D-модели'), li: [
    { name: 'Old Car – VAZ 2107', who: 'Arkady Gribachev', lic: 'CC BY 4.0', what: N_('«Семёрка»: твоя машина и машины на дорогах'), url: 'sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb' },
    { name: 'VAZ 2101', who: 'Javkal', lic: 'CC BY 4.0', what: N_('«Копейка» на дорогах'), url: 'sketchfab.com/3d-models/vaz-2101-95d34f63b5b14e2197fd41383776e031' },
    { name: 'Quaternius', who: 'Quaternius', lic: 'CC0', what: N_('люди: прохожие, клиенты, курьеры'), url: 'quaternius.com' },
  ] },
  { h: N_('шрифты'), li: [
    { name: 'Press Start 2P', who: '© 2012 The Press Start 2P Project Authors', lic: 'SIL OFL 1.1', what: N_('все надписи игры') },
    { name: 'Rubik Mono One', who: '© 2015 The Rubik Project Authors', lic: 'SIL OFL 1.1', what: N_('надпись «Птица Пицца» в меню') },
  ] },
  { h: N_('программы'), li: [
    { name: 'three.js', who: '© three.js authors', lic: 'MIT', what: N_('3D в браузере'), url: 'threejs.org' },
    { name: 'Electron', who: '© OpenJS Foundation and Electron contributors', lic: 'MIT', what: N_('игра на компьютере'), steam: true },
    { name: 'steamworks.js', who: '© ceifa', lic: 'MIT', what: N_('достижения и облако Стима'), steam: true },
  ] },
];

export function open (P, body, back, steam) {
  P.dataset.kind = KIND; P.dataset.back = 'settings'; P.dataset.sub = '';
  let first = true;
  const pad = (tag, inner, cls = '') => {
    const af = first ? ' autofocus' : '';
    first = false;
    return '<' + tag + ' class="pv-pad' + (cls ? ' ' + cls : '') + '" data-pad tabindex="-1"' + af + '>' + inner + '</' + tag + '>';
  };
  const item = c => pad('li', '<b class="cr-name">' + esc(c.name) + '</b> <span class="cr-lic">' + esc(c.lic) + '</span><br>' +
    '<span class="cr-who">' + esc(c.who) + '</span> · ' + esc(t(c.what)) +
    (c.url ? '<br><span class="pv-link cr-url">' + esc(c.url) + '</span>' : ''), 'cr-item');
  const secs = CREDITS.map(sec => {
    const li = sec.li.filter(c => !c.steam || steam);
    if (!li.length) return '';
    return '<section class="pv-sec"><h3>' + esc(t(sec.h)) + '</h3><ul>' + li.map(item).join('') + '</ul></section>';
  }).join('');

  body.innerHTML = '<header class="pn-t pv-head"><span>' + esc(t('титры')) + '</span><b>' + esc(t('авторы и лицензии')) + '</b></header>' +
    '<div class="pv-pane"><div class="pv-list">' +
      '<div class="pv-top"><span class="pv-date">' + esc(t('чужое, что есть в игре, — и спасибо его авторам')) + '</span>' +
      '<span class="pv-seal cr-seal">' + esc(t('спасибо!')) + '</span></div>' +
      secs +
      '<section class="pv-sec">' + pad('div', '<p>' + esc(t('музыка и звуки собраны в самой игре; город Солнечный выдуман, совпадения с настоящими людьми случайны.')) + '</p>') + '</section>' +
    '</div></div>' +
    '<div class="pv-foot"><button type="button" class="pp-note pv-back" id="cr-back">' + keyHTML('back') + esc(t('назад')) + '</button></div>';

  body.querySelector('#cr-back').addEventListener('click', () => back());
}

export const DEBUG = { open, KIND, CREDITS };
