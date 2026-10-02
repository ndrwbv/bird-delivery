/* Точка входа: площадка → язык (в первый запуск — окно выбора) → карта → игра.
   Язык нужен до загрузки игры: её строки переводятся прямо при импорте.
   Карта — тоже: игра строит город при импорте. Выбор карты — ?map=, потом
   иначе Стим и dev — Северск, Яндекс — Москва (выбора в меню больше нет). */
import './styles/delivery.css';
import './input/padmenu.css';
import Platform from './platform/index.js';
import { initI18n, applyDom, LANGS, LANG_NAMES } from './i18n/index.js';
import { pickLang } from './langpick.js';
import { MAP_IDS, loadMap } from './maps/index.js';
import { useMap } from './game/map.js';

// версия сборки в углу заставки: «v0.0.8» из релиза или «dev-<коммит>» (vite.config.js, __BUILD__)
const buildV = document.getElementById('build-v');
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
if (buildV) buildV.textContent = BUILD;
// и мелко в углу паузы
for (const el of document.querySelectorAll('.pm-ver')) el.textContent = BUILD;

await Platform.init({ langs: LANGS });
// первый запуск — спросить язык: игра ещё не загружена, перезагружать нечего. На Яндексе язык даёт площадка
if (Platform.id !== 'yandex' && !Platform.langChosen) {
  Platform.setLang(await pickLang(LANGS, LANG_NAMES, Platform.lang));
  Platform.store.flush && Platform.store.flush();
}
await initI18n(Platform.lang);
applyDom();
document.documentElement.dataset.platform = Platform.id;

// Стим (и dev) — Северск, Яндекс — Москва; ?map= — для отладки
const want = new URLSearchParams(location.search).get('map') || (Platform.id === 'yandex' ? 'moscow' : 'seversk');
const mapId = MAP_IDS.includes(want) ? want : MAP_IDS[0];
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
