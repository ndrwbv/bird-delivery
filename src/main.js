/* Точка входа: площадка → язык → игра.
   Язык нужен до загрузки игры: её строки переводятся прямо при импорте. */
import './styles/delivery.css';
import './input/padmenu.css';
import Platform from './platform/index.js';
import { initI18n, applyDom, LANGS } from './i18n/index.js';

await Platform.init({ langs: LANGS });
await initI18n(Platform.lang);
applyDom();
document.documentElement.dataset.platform = Platform.id;
await import('./game/moscow.js');
Platform.ready();
