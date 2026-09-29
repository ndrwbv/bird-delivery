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

/* Пока открыт только кусок города у пиццерии: всё, что севернее большого
   кольца (улица «Кольцо», в ~300 м от пиццерии), закрыто забором, на дорогах
   через него — бетонные блоки. Линия — z = OPEN_Z (м карты, z растёт на юг);
   открыто то, что южнее. Граница езды — старый забор, обрезанный по этой
   линии; сам город за ней стоит как стоял, туда просто не проехать.
   Открыть город обратно — убрать поле open ниже (border вернётся к забору). */
const OPEN_Z = 1530;
function clipSouth (poly, zc) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ina = a[1] >= zc, inb = b[1] >= zc;
    if (ina) out.push(a);
    if (ina !== inb) out.push([Math.round(a[0] + (zc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])), zc]);
  }
  return out;
}
const OPEN_BORDER = DATA.border ? clipSouth(DATA.border, OPEN_Z) : null;
/* забор по линии отсечки: куски, где линия внутри старого забора */
const OPEN_FENCE = (() => {
  if (!OPEN_BORDER) return [];
  const xs = OPEN_BORDER.filter(q => q[1] === OPEN_Z).map(q => q[0]).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([[xs[i], OPEN_Z], [xs[i + 1], OPEN_Z]]);
  return out;
})();

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
    // «конец города» — хоть один заказ за смену. Пока город закрыт за кольцом — дальний
    // восток открытой части (~2,2 км от пиццерии); весь город — geo(56.60691508638336, 84.84422385137559)
    edge: OPEN_BORDER ? { x: 5320, z: 2480 } : geo(56.60691508638336, 84.84422385137559),
    // без подписей: настоящие места Северска не называем (docs/STEAM-COMPLIANCE.md).
    // Пока город закрыт — один круг у забора на северо-западе открытой части (~1,1 км);
    // весь город — geo(56.603258, 84.868847) и geo(56.601029, 84.836719), r 300
    gang: OPEN_BORDER ? [{ x: 2260, z: 1680, r: 260 }] : [
      { ...geo(56.603258, 84.868847), r: 300 },
      { ...geo(56.601029, 84.836719), r: 300 },
    ],
  },
  // край езды — многоугольник: забор закрытого города, обрезанный по кольцу (см. OPEN_Z)
  border: OPEN_BORDER || DATA.border || null,
  // закрытая часть города: забор по линии, блоки на дорогах, своя подсказка у забора
  open: OPEN_BORDER ? { z: OPEN_Z, fence: OPEN_FENCE, toast: N_('дальше город пока закрыт — развозим у пиццерии') } : null,
};
