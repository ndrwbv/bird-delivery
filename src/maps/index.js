/* Карты игры. Каждая — папка src/maps/<id>/: index.js (настройки) и
   city-data.js (город из OpenStreetMap, собирает scripts/osm_<id>.py).
   Данные грузятся отдельным куском только для выбранной карты.

   Москва — везде (на Яндексе только она: это демо). Северск — только в Стиме
   и в dev: в яндексовой сборке ветка выкидывается при сборке целиком, и
   город в архив не попадает. */
import { N_ } from '../i18n/index.js';

const ALL = {
  moscow: () => import('./moscow/index.js'),
  ...(import.meta.env.MODE !== 'yandex' ? { seversk: () => import('./seversk/index.js') } : {}),
};
export const MAP_IDS = Object.keys(ALL);
/* что показать в меню выбора, не загружая сам город */
export const MAP_META = {
  moscow: { title: N_('Москва'), note: N_('район у Ленинской Слободы · демо') },
  seversk: { title: N_('Северск'), note: N_('закрытый город целиком: КПП, гаражи, промзона, железная дорога') },
};
export async function loadMap (id) {
  const f = ALL[id] || ALL.moscow;
  return (await f()).default;
}
