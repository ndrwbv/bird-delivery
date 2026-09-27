/* Текущая карта. main.js выбирает её до загрузки игры (useMap), игра читает
   MAP как обычный объект: данные города и всё, что у карты своё. Общий код
   игры — src/game/game.js, настройки карт — src/maps/<id>/index.js. */
export const MAP = {};
export function useMap (cfg) { Object.assign(MAP, cfg); return MAP; }
