/* Точка входа: площадка → язык (в первый запуск — окно выбора) → карта → игра.
   Язык нужен до загрузки игры: её строки переводятся прямо при импорте.
   Карта — тоже: игра строит город при импорте. Выбор карты — ?map=, потом
   иначе Стим и dev — Северск, Яндекс — Москва (выбора в меню больше нет). */
import { STARTUP } from './game/startuptrace.js';
import './styles/delivery.css';
import './input/padmenu.css';
import './styles/paper.css';            // стиль «как накладная»: бумага, чек, штамп, печать, стикер (П0)
import './game/hudpaper.css';       // хад-ценники и записка подсказки как накладная (clarity c8)
import './input/glyphs.js';            // значки кнопок по текущему вводу (A / Enter / тап)
import './game/orient.js';              // телефон — только боком: стоя — заставка «поверни телефон» (сразу, ещё на экране загрузки)
import Platform from './platform/index.js';
import * as CRASH from './platform/crashlog.js';
import { initI18n, applyDom, LANGS, LANG_NAMES, t } from './i18n/index.js';
import { pickLang } from './langpick.js';
import { MAP_IDS, loadMap } from './maps/index.js';
import { useMap } from './game/map.js';
import { migrateSingleProgress, saveId } from './game/singleprogress.js';
import { heroName } from './game/playername.js';
import { requireSingleProgress } from './game/progressboot.js';
import './game/progressboot.css';
import { pollPad } from './input/gamepad.js';
import { makePadMenu } from './input/padmenu.js';
import {selectAddressBoot17b} from './game/addressboot17b.js';
import { primeWinterRoadWorker, takeWinterRoadWorker } from './game/winter-road-client.js';
import { primeDeckShaders } from './game/landdata/deck-shaders-client.js';

// журнал ошибок и зависаний (docs/CRASHES.md) — первым делом: ловит и ошибки загрузки игры
CRASH.init();

// версия сборки в углу заставки: «v0.0.8» из релиза или «dev-<коммит>» (vite.config.js, __BUILD__)
const buildV = document.getElementById('build-v');
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
if (buildV) buildV.textContent = BUILD;
// и мелко в углу паузы
for (const el of document.querySelectorAll('.pm-ver')) el.textContent = BUILD;

STARTUP.mark('main.enter');
await STARTUP.awaited('platform.init', 'platform', () => Platform.init({ langs: LANGS }));
// первый запуск — спросить язык: игра ещё не загружена, перезагружать нечего. На Яндексе язык даёт площадка
const doorPreviewFirstRun = new URLSearchParams(location.search).has('doorpreview') && !Platform.langChosen;
if (Platform.id !== 'yandex' && !Platform.langChosen && !doorPreviewFirstRun) {
  Platform.setLang(await STARTUP.awaited('external.language', 'external', () => pickLang(LANGS, LANG_NAMES, Platform.lang)));
  Platform.store.flush && Platform.store.flush();
}
// Отладочный просмотр не меняет язык в сохранении и не ждёт первого меню.
await STARTUP.awaited('i18n.import', 'module', () => initI18n(doorPreviewFirstRun ? 'ru' : Platform.lang));
applyDom();
// фразы экрана загрузки («Покупаем пиццу…», index.html) уже на языке игрока — показать
document.getElementById('boot')?.classList.add('said');
document.documentElement.dataset.platform = Platform.id;

// i18n is ready; map/game/progress readers remain unloaded until every native write verifies.
if (Platform.id !== 'yandex') {
  await requireSingleProgress({
    migrate: () => STARTUP.work('progress.migrate', () => migrateSingleProgress({ store: Platform.store })),
    host: document.getElementById('boot'), t, pollPad, makePadMenu,
  });
  // Platform modules have no game/i18n imports: bind readonly identity only after bootstrap succeeds.
  (Platform.leaderboard.local || Platform.leaderboard).setIdentity?.(saveId, heroName);
}

// Стим (и dev) — Северск, Яндекс — Москва; ?map= — для отладки
const query = new URLSearchParams(location.search);
const want = query.get('map') || (Platform.id === 'yandex' ? 'moscow' : 'seversk');
const mapId = MAP_IDS.includes(want) ? want : MAP_IDS[0];
const deck = Platform.steam?.deck || /steamos|steam deck/i.test(navigator.userAgent);
const launch = Platform.id === 'steam' && mapId === 'seversk' &&
  !['nocareer', 'kids', 'hellrun', 'doorpreview'].some(key => query.has(key)) &&
  (query.has('fastmenu') || window.__startupHost?.nativeDeckLaunch || deck && !query.has('debug') && !window.__startupHost);
// This is only a cheap candidate choice. The game validates its full actual previsual key.
const addressCatalog17=typeof __ADDRESS_PACKAGE_CATALOG__!=='undefined'?__ADDRESS_PACKAGE_CATALOG__:null;
const addressBoot17=selectAddressBoot17b({mode:import.meta.env.MODE,mapId,deck:!!Platform.steam?.deck,userAgent:navigator.userAgent,
  get:(key,fallback)=>{const value=Platform.store.get(key);return value===undefined?fallback:value;},query:location.search,catalog:addressCatalog17});
let launchMenu = null, launchAction = null, mapRead = null, addressRead = null;
const readMap = () => mapRead ||= STARTUP.awaited('map.readParseImport', 'module', () => loadMap(mapId));
function readAddresses () {
  // Ранний вход получает адреса при сборке города. Готовый снимок
  // на этом пути нужен только для явных сравнений с генератором.
  if (!addressBoot17.enabled || (launch && !addressBoot17.diagnostic)) return;
  return addressRead ||= import('./game/addresspackage17b.js').then(({ ADDRESS_PACKAGE_PRELOAD17B }) =>
    STARTUP.awaited('addresses.preload', 'cacheIO', () => ADDRESS_PACKAGE_PRELOAD17B.preload({
      enabled: true, graphics: addressBoot17.graphics, catalog: addressCatalog17,
    })));
}
if (launch) {
  const prepareRoadWorker = () => {
    if (deck && !(query.has('debug') && query.has('deckroadsync'))) {
      primeWinterRoadWorker(() => STARTUP.mark('winterRoad.worker.ready'));
    }
  };
  const shaderCatalog = typeof __DECK_SHADER_CATALOG__ === 'undefined' ? null : __DECK_SHADER_CATALOG__;
  const shaderSourceHash = typeof __CITY_SOURCE_BASE17B__ === 'undefined' ? null : __CITY_SOURCE_BASE17B__.sourceHash;
  let shaderAttempted = false, stopShaders = null;
  const prepareShaders = () => {
    if (shaderAttempted || !deck || !shaderCatalog || (query.has('gfxdev') && query.get('gfxdev') !== 'deck') ||
        (query.has('debug') && (query.has('deckshaderdirect') || query.has('deckshaderbake')))) return;
    shaderAttempted = true;
    const forced = query.get('gfx');
    const high = forced === 'high' || (!['low', 'mid'].includes(forced) && Platform.store.get('dlv-gfx')?.deck?.p === 'high');
    if (high) stopShaders = primeDeckShaders(shaderCatalog, shaderSourceHash);
  };
  launchMenu = await import('./game/menu.js');
  const boot = document.getElementById('boot');
  document.body.classList.add('career');
  document.body.classList.remove('booting');
  document.getElementById('big').hidden = false;
  boot?.classList.add('gone');
  const selection = launchMenu.launchMenu({ Store: Platform.store, quit: () => Platform.quit(), pollPad });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    STARTUP.mark('launch.menu');
    // Чтение карты может идти за меню. Синхронное построение мира
    // остаётся за выбором действия, чтобы док принимал ввод сразу.
    setTimeout(() => {
      if (!launchAction || launchAction === 'go') {
        prepareRoadWorker();
        prepareShaders();
      }
      readMap().catch(() => {});
      readAddresses()?.catch(() => {});
    }, 0);
  }));
  launchAction = await selection;
  if (launchAction === 'go') {
    prepareRoadWorker();
    prepareShaders();
  } else {
    takeWinterRoadWorker(false);
    stopShaders?.();
  }
  STARTUP.mark('launch.select', { action: launchAction });
  document.body.classList.add('booting');
  boot?.classList.remove('gone');
}
useMap(await readMap());
STARTUP.mark('map.ready', { mapId });
document.documentElement.dataset.city = mapId;

await readAddresses();

// город строится синхронно при импорте: сначала даём браузеру нарисовать экран загрузки
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
// время запуска (docs/AGENTS.md → «Запуск до меню»): window.__boot — мс от старта страницы
const BOOT = window.__boot = { pre: Math.round(performance.now()), launchAction };
await STARTUP.awaited('game.import', 'module', () => import('./game/game.js'));
STARTUP.mark('game.module.ready');
BOOT.game = Math.round(performance.now());
document.title = (await import('./game/brands.js')).OWN.pizza();
Platform.ready();
function hideBoot (immediate = false) {
  document.body.classList.remove('booting');
  const boot = document.getElementById('boot');
  if (!boot) return;
  if (immediate) boot.remove();
  else { boot.classList.add('gone'); setTimeout(() => boot.remove(), 600); }
}
if (launchAction === 'go') {
  // Действие уже выбрано в раннем меню. Экран загрузки остаётся
  // на месте, пока город готовится к смене.
  requestAnimationFrame(() => {
    if (!launchMenu.resumeLaunch('go', () => hideBoot(true))) hideBoot();
  });
} else {
  // Первый кадр обычного меню: плавно убрать экран загрузки.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    BOOT.menu = Math.round(performance.now());
    STARTUP.mark('menu.visible');
    hideBoot();
    if (launchAction) requestAnimationFrame(() => launchMenu.resumeLaunch(launchAction));
  }));
}
