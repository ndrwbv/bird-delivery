/* Карты игры. Каждая — папка src/maps/<id>/: index.js (настройки) и
   city-data.js (город из OpenStreetMap, собирает scripts/osm_<id>.py).
   Данные грузятся отдельным куском только для выбранной карты.

   Северск — основная карта (Стим, веб). Москва больше не развивается: она
   остаётся демо на Яндексе (там только она) и открывается в dev через
   ?map=moscow; в сборки Стима и веба не попадает. Файлы карты не удалены. */
import { N_ } from '../i18n/index.js';

const MODE = import.meta.env.MODE, DEV = import.meta.env.DEV;
const ALL = {
  ...(MODE !== 'yandex' ? { seversk: () => import('./seversk/index.js') } : {}),
  ...(MODE === 'yandex' || DEV ? { moscow: () => import('./moscow/index.js') } : {}),
};
export const MAP_IDS = Object.keys(ALL);
/* что показать в меню выбора, не загружая сам город */
export const MAP_META = {
  ...(MODE !== 'yandex' ? { seversk: { title: N_('Северск'), note: N_('закрытый город целиком: КПП, гаражи, промзона, железная дорога') } } : {}),
  ...(MODE === 'yandex' || DEV ? { moscow: { title: N_('Москва'), note: N_('район у Ленинской Слободы · демо') } } : {}),
};
export async function loadMap (id) {
  const f = ALL[id] || ALL[MAP_IDS[0]];
  return (await f()).default;
}
