await onShift();
await run(9);
const beforeSms = document.querySelector('#chat')?.textContent?.includes('Женя, заказ готов') || false;
const order = d.S.order;
const stop = order && order.stops[0];
if (order?.ord?.story?.storyId !== 'gennady') throw new Error('Первым заказом не стал Геннадий');
if (!stop.home?.flat) throw new Error('Номер квартиры не появился в накладной');
const flat = stop.home.flat;
d.V.x = d.S.target.x; d.V.z = d.S.target.z;
d.V.vx = 0; d.V.vz = 0;
d.car.position.x = d.V.x; d.car.position.z = d.V.z;
await run(5);
if (d.FPD.ph !== 'take-ready' || stop.carry) throw new Error('Нет явного получения пиццы');
d.FPD.take();
await run(5);
if (!stop.carry || d.DOOR.mode !== 'dial') throw new Error('После багажника нет домофона');
const intercomFlat = d.DOOR.doorState()?.flat;
if (intercomFlat !== flat) throw new Error('Код не совпадает с накладной');
d.DOOR.solve();
await run(2);
if (d.DOOR.mode !== 'stairs') throw new Error('Домофон не открыл подъезд');
d.DOOR.solve();
await run(2);
const stairs = d.DOOR.stairsState();
if (!stairs?.d3 || stairs.flat !== +flat || stairs.scene?.stage !== 'dialog') throw new Error('Нет сцены у нужной квартиры');
for (const seconds of [7, 4, 4]) {
  await run(seconds);
  const next = document.querySelector('#dlg .dlg-yes');
  if (!d.DLG.isOpen() || !next) throw new Error('Реплика не открылась');
  next.click();
  await run(0.35);
}
await run(3);
await run(7);
const afterSms = document.querySelector('#chat')?.textContent?.includes('Молодец, Женя. Клиент доволен') || false;
return { story: order.ord.story.storyId, flat, intercomFlat, stairsFlat: stairs.flat,
  carried: stop.carry, scenarioDone: order.ord.story.interiorDone,
  savedProgress: d.STORY.progress().gennady?.ch, delivered: d.S.delivered,
  state: d.S.state, dialogOpen: d.DLG.isOpen(), doorOpen: d.DOOR.on(), beforeSms, afterSms };
