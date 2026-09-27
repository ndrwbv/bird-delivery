/* Районы города для карьеры: куда ведёт заказ и что там бывает.
     rich   — особняки (MAP.career.rich: точка и радиус)
     gang   — бандитские районы (MAP.career.gang), сжимаются донатом «борьба с насилием»
     garage — гаражные кооперативы и ряды гаражей
     ind    — промзона
     poor   — частный сектор и бараки
     normal — всё остальное
   ZN.init(api) — один раз после сборки города; ZN.zoneAt(x, z) — строка выше.
   ZN.gangZones() — текущие круги бандитов с учётом доната (для карты и событий).
   Прогресс доната читается через api.donated('gang') → 0…1. */
import { GANG } from './econ.js';

let A = null, CELL = new Map();
const C = 60;

export function init (api) {
  A = api;
  CELL = new Map();
  // клетки по 60 м: какой вид домов в клетке преобладает — быстрый ответ без перебора
  const add = (x, z, k) => {
    const key = Math.floor(x / C) + ',' + Math.floor(z / C);
    let c = CELL.get(key);
    if (!c) CELL.set(key, c = {});
    c[k] = (c[k] || 0) + 1;
  };
  for (const b of A.CITY.buildings) {
    let cx = 0, cz = 0;
    for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
    const k = b.k === 'gar' ? 'garage' : b.k === 'ind' ? 'ind' : b.k === 'priv' || b.st === 'priv' ? 'poor' : 'normal';
    add(cx, cz, k);
  }
  for (const g of A.CITY.garlots || []) for (const q of g.p || []) add(q[0], q[1], 'garage');
}

const inR = (x, z, c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r;

export function gangZones () {
  const G = (A && A.MAP.career && A.MAP.career.gang) || [];
  const p = A && A.donated ? A.donated('gang') : 0;
  return G.map(g => ({ x: g.x, z: g.z, r: (g.r || GANG.ZONE_R) * (1 - p) })).filter(g => g.r > 20);
}

export function zoneAt (x, z) {
  if (!A) return 'normal';
  const car = A.MAP.career || {};
  for (const g of gangZones()) if (inR(x, z, g)) return 'gang';
  if (car.rich && inR(x, z, car.rich)) return 'rich';
  const c = CELL.get(Math.floor(x / C) + ',' + Math.floor(z / C));
  if (!c) return 'normal';
  let best = 'normal', n = 0;
  for (const k in c) if (c[k] > n) { n = c[k]; best = k; }
  return best;
}
