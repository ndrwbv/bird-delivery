/* Точка входа: площадка → язык → карта → игра.
   Язык нужен до загрузки игры: её строки переводятся прямо при импорте.
   Карта — тоже: игра строит город при импорте. Выбор карты — ?map=, потом
   иначе Стим и dev — Северск, Яндекс — Москва (выбора в меню больше нет). */
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

// Стим (и dev) — Северск, Яндекс — Москва; ?map= — для отладки
const want = new URLSearchParams(location.search).get('map') || (Platform.id === 'yandex' ? 'moscow' : 'seversk');
const mapId = MAP_IDS.includes(want) ? want : 'moscow';
useMap(await loadMap(mapId));
document.documentElement.dataset.city = mapId;

// город строится синхронно при импорте: сначала даём браузеру нарисовать экран загрузки
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
await import('./game/game.js');
document.title = (await import('./game/brands.js')).OWN.pizza();
Platform.ready();
// первый кадр игры готов — загрузка плавно уходит, интерфейс плавно проявляется
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.body.classList.remove('booting');
  const boot = document.getElementById('boot');
  if (boot) { boot.classList.add('gone'); setTimeout(() => boot.remove(), 600); }
}));
