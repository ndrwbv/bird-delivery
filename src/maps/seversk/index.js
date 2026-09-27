/* Северск — закрытый город (ЗАТО) целиком, по периметру забора с КПП.
   Только для Стима. Город — city-data.js (scripts/osm_seversk.py): дома со
   стилями (панельки, сталинки, частный сектор, гаражи), железная дорога,
   промзона, Томь, рельеф SRTM, забор и КПП по границе. */
import DATA from './city-data.js';
import { N_ } from '../../i18n/index.js';

/* градусы → метры карты (та же проекция, что в scripts/osm_seversk.py:
   от точки meta.center, начало координат — meta.origin) */
const [LAT0, LON0] = DATA.meta.center, [OX, OZ] = DATA.meta.origin || DATA.meta.home;
const M = 111320, ML = M * Math.cos(LAT0 * Math.PI / 180);
export const geo = (lat, lon) => ({ x: Math.round((lon - LON0) * ML + OX), z: Math.round((LAT0 - lat) * M + OZ) });

export default {
  id: 'seversk',
  data: DATA,
  title: N_('Северск'),
  tagline: { adult: N_('развози пиццу по закрытому городу — пропуск есть только у тебя!'), kids: N_('развози пиццу по закрытому городу — пропуск есть только у тебя!') },
  // пиццерия — там, где в карте стоит «Додо Пицца» (meta.home), вывеска наша
  home: { point: DATA.meta.home },
  fallbackAddr: 'Северск',
  river: DATA.meta.river ? { name: N_('Томь'), at: N_('Томь, у берега'), surf: false } : null,
  farOrder: null,
  edgeToast: N_('дальше забор и КПП — из закрытого города без пропуска не выехать'),
  waterToasts: [N_('там Томь'), N_('вплавь не довезёшь')],
  metro: false,
  // каток — хоккейная коробка у Калинина, 96; сходка бургеров — у ТРК «Лето» (Солнечная, 2 ст4)
  landmarks: { rink: [3556, 1494], burgers: 'Лето' },
  /* Карьера (Стим): смена 9—24, районы, гараж, бандиты. Есть это поле — есть карьера. */
  career: {
    garage: geo(56.576843, 84.927785),                       // ремонт у Дяди Жени
    rich: { ...geo(56.5927162345484, 84.926990297152), r: 280 },   // особняки
    edge: geo(56.60691508638336, 84.84422385137559),        // «конец города» — хоть один заказ за смену
    gang: [
      { ...geo(56.603258, 84.868847), r: 300 },          // без подписей: настоящие места Северска не называем (docs/STEAM-COMPLIANCE.md)
      { ...geo(56.601029, 84.836719), r: 300 },
    ],
  },
  border: DATA.border || null,   // край карты — многоугольник по забору, а не прямоугольник
};
