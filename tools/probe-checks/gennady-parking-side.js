await onShift();
await run(9);
if (d.S.order?.ord?.story?.storyId !== 'gennady') {
  const spec = d.STORY.orderFor('gennady', 0);
  if (!spec || !d.ORDM.force(spec)) throw new Error('Нет сюжета Геннадия');
  await run(9);
}
const stop = d.S.order.stops[0], spot = d.S.order.ord.story.parking;
const target = d.S.target;
const starts = new URLSearchParams(location.search).has('west')
  ? [[target.x - 25, target.z + 7], [target.x - 19, target.z - 15]]
  : [[target.x + 25, target.z - 7], [target.x + 19, target.z + 15]];
const from = starts.find(p => !d.inWall(p[0], p[1], 2) && !d.YARDS.blocks(p[0], p[1], 1) && d.groundH(p[0], p[1]) > 0.3);
if (!from) throw new Error('Нет открытого бокового старта');
d.V.x = from[0]; d.V.z = from[1]; d.V.h = Math.PI / 2; d.V.vx = 12; d.V.vz = 0;
d.car.position.x = from[0]; d.car.position.z = from[1]; d.car.rotation.y = d.V.h;
if (!await until(() => d.FPD.ph === 'walk', 22000) || !d.FPD.R.entryDoor)
  throw new Error('Детальная дверь не видна до открытия: ' + JSON.stringify(d.FPD.ST.last));
if (!await until(() => stop.carry && d.DOOR.mode === 'stairs', 30000))
  throw new Error('Боковой въезд не довёл курьера до подъезда: ' + JSON.stringify(d.FPD.ST.last));
const parked = [d.V.x, d.V.z];
if (Math.hypot(parked[0] - spot.x, parked[1] - spot.z) > 0.5)
  throw new Error('Боковой въезд дал другую парковку: ' + JSON.stringify({ from, parked, spot, last: d.FPD.ST.last }));
return { from, parked, spot, route: d.FPD.ST.last.parking, length: d.FPD.ST.last.parkLength };
