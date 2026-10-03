/* Рамка песочницы интерфейса: экран игры без мира.
   1) язык (?lang=…) — до импорта модулей игры: их строки переводятся прямо при импорте;
   2) разметка — #game из настоящего index.html (fetch): итоги, накладная, карточка выбора, хад —
      те же узлы и те же стили (delivery.css), что в игре;
   3) модули игры и экраны — lab.js (импорт после языка). */
import '../styles/delivery.css';
import '../input/padmenu.css';
import './frame.css';
import { initI18n, applyDom } from '../i18n/index.js';

const Q = new URLSearchParams(location.search);
const LANG = await initI18n(Q.get('lang') || 'ru');
document.title = 'ui · ' + LANG;

const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
const doc = new DOMParser().parseFromString(html, 'text/html');
const game = doc.getElementById('game');
if (!game) throw new Error('uilab: в index.html нет #game');
document.documentElement.dataset.map = doc.documentElement.dataset.map || '';
document.documentElement.dataset.city = 'seversk';
document.body.classList.add('uilab');
document.body.appendChild(document.adoptNode(game));
applyDom(game);

const LAB = await import('./lab.js');
await LAB.boot({ adult: !Q.has('kids'), lang: LANG });
window.__probeReady = true;
