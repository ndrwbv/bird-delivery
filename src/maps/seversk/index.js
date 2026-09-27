/* Северск — закрытый город (ЗАТО) целиком, по периметру забора с КПП.
   Только для Стима. Город — city-data.js (scripts/osm_seversk.py): дома со
   стилями (панельки, сталинки, частный сектор, гаражи), железная дорога,
   промзона, Томь, рельеф SRTM, забор и КПП по границе. */
import DATA from './city-data.js';
import { N_ } from '../../i18n/index.js';

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
  border: DATA.border || null,   // край карты — многоугольник по забору, а не прямоугольник
};
