import city from './vk-city.js';
import edits from './vk-edits.json';
import { N_ } from '../../i18n/index.js';
import { inDeliveryZone } from './vk-delivery-zone.mjs';

const district = { id: 'south', name: N_('Юг'), pizza: city.meta.home };
const garage = { x: 3413, z: 2561 };

export default {
  id: 'seversk',
  data: city,
  edits,
  title: N_('Солнечный'),
  tagline: { kids: N_('развози пиццу на «Жигулях» по Солнечному') },
  home: { point: city.meta.home },
  border: city.border,
  canDeliver: inDeliveryZone,
  bounds: city.meta.bounds,
  fallbackAddr: 'Солнечный',
  river: { name: N_('Томь'), at: N_('Томь, у берега'), surf: false },
  edgeToast: N_('доставляем только по району Юг'),
  waterToasts: [N_('там Томь'), N_('вплавь не довезёшь')],
  fence: false,
  career: {
    garage,
    garages: [garage],
    gang: [],
    districts: { at: () => 0, list: [district] },
  },
};
