import assert from 'node:assert/strict';
import { shopSlot } from '../src/game/facadespace.js';

// Реальный подъезд на месте желаемой витрины: магазин переезжает вдоль стены,
// сам подъезд и его адрес остаются нетронутыми. Повернутый дом даёт тот же результат.
for (const angle of [0, .37, Math.PI / 2, 2.4]) {
  const nx = Math.sin(angle), nz = Math.cos(angle), tx = nz, tz = -nx;
  const p = (s, o = 0) => [100 + tx * s + nx * o, 200 + tz * s + nz * o];
  const buildings = [{ p: [p(-15), p(15), p(15, -10), p(-15, -10)] }];
  const door = [...p(0), nx, nz, 0], doors = [door];
  const saved = JSON.stringify(doors);
  const free = shopSlot(...p(0), nx, nz, 2.5, buildings, doors);
  assert(free, 'магазин помещается рядом с подъездом');
  const along = (free.x - 100) * tx + (free.z - 200) * tz;
  assert(Math.abs(along) > 4.4 && Math.abs(along) < 4.5, 'витрина и весь козырёк разведены');
  assert(Math.abs((free.x - 100) * nx + (free.z - 200) * nz) < 1e-6, 'магазин остаётся на стене');
  assert.equal(JSON.stringify(doors), saved, 'адрес подъезда не меняется');
  assert.deepEqual(shopSlot(...p(-10), nx, nz, 2.5, buildings, doors), { x: p(-10)[0], z: p(-10)[1] });
}
assert.equal(shopSlot(0, 0, 0, 1, 2.5, [{ p: [[-3, 0], [3, 0], [3, -5], [-3, -5]] }], [[0, 0, 0, 1]]), null);
console.log('Фасады: 4 поворота, сохранение адреса, ближайшее свободное место, узкая стена — OK');
