/* Точка входа: площадка → язык → карта → игра.
   Язык нужен до загрузки игры: её строки переводятся прямо при импорте.
   Карта — тоже: игра строит город при импорте. Выбор карты — ?map=, потом
   сохранённый (меню Стима), по умолчанию Москва; на Яндексе — только Москва. */
import './styles/delivery.css';
import './input/padmenu.css';
import Platform from './platform/index.js';
import { initI18n, applyDom, LANGS } from './i18n/index.js';
import { MAP_IDS, loadMap } from './maps/index.js';
import { useMap } from './game/map.js';

await Platform.init({ langs: LANGS });
await initI18n(Platform.lang);
applyDom();
document.documentElement.dataset.platform = Platform.id;

const want = new URLSearchParams(location.search).get('map') || Platform.store.get('dlv-map', 'moscow');
const mapId = MAP_IDS.includes(want) ? want : 'moscow';
useMap(await loadMap(mapId));
document.documentElement.dataset.city = mapId;

await import('./game/game.js');
document.title = (await import('./game/brands.js')).OWN.pizza();
Platform.ready();
