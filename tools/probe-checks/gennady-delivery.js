await onShift();
await run(9);
if (d.S.order?.ord?.story?.storyId !== 'gennady') {
  const spec = d.STORY.orderFor('gennady', 0);
  if (!spec || !d.ORDM.force(spec)) throw new Error('Нет сюжета Геннадия');
  await run(9);
}
const order = d.S.order, stop = order.stops[0], spec = order.ord.story;
if (spec.storyId !== 'gennady') throw new Error('Не тот сюжет');
const expectedFlat = '10';
d.V.x = d.S.target.x; d.V.z = d.S.target.z; d.V.vx = d.V.vz = 0;
d.car.position.x = d.V.x; d.car.position.z = d.V.z;
await until(() => stop.carry && d.DOOR.mode === 'stairs', 30000);
const parked = { x: d.V.x, z: d.V.z, h: d.V.h, plan: d.FPD.ST.last };
const outbound = d.FPD.R.path?.pts?.map(p => [...p]) || [];
if (Math.hypot(parked.x - spec.parking.x, parked.z - spec.parking.z) > 0.5)
  throw new Error('Машина не в фиксированном месте: ' + JSON.stringify(parked));
if (stop.home.flat !== expectedFlat) throw new Error('Квартира меняется: ' + stop.home.flat);
await until(() => d.DLG.isOpen(), 5000);
await until(() => !d.DLG.isOpen(), 7000);
const warnings = [];
const oldWarn = console.warn;
console.warn = (...args) => { warnings.push(args.map(a => String(a?.stack || a)).join(' ')); oldWarn(...args); };
d.DOOR.solve();
await until(() => d.DOOR.stairsState()?.scene?.stage === 'door_dialogue', 18000);
const stairs = d.DOOR.stairsState();
if (!stairs?.d3 || !stairs?.v3?.firstPerson || stairs.flat !== 10)
  throw new Error('Сюжет не в нужной 3D-квартире: ' + JSON.stringify(stairs));
await until(() => d.DLG.isOpen() && !document.querySelector('#dlg')?.hidden &&
  document.querySelector('#dlg .dlg-text')?.textContent === 'у вас в заказе было...', 30000);
if (document.querySelector('#dlg .dlg-name')?.textContent !== 'Женя' || !document.querySelector('#door2d'))
  throw new Error('Сюжетный выбор без подписи Жени или без Геннадия');
const yes = document.querySelector('#dlg .dlg-yes'), no = document.querySelector('#dlg .dlg-no');
if (!yes || !no) throw new Error('Выбор не построен: ' + JSON.stringify({ dlg: document.querySelector('#dlg')?.outerHTML?.slice(0, 1500), stairs: d.DOOR.stairsState()?.scene, order: d.S.order?.ord?.story?.storyId, warnings, crash: d.crashlog }));
if (yes.getBoundingClientRect().left >= no.getBoundingClientRect().left)
  throw new Error('Визуальный порядок ответов расходится со стрелками');
await run(1);
const before = [yes.classList.contains('dlg-cur'), no.classList.contains('dlg-cur')];
dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
const selected = [yes.classList.contains('dlg-cur'), no.classList.contains('dlg-cur')];
if (!selected[1] || selected[0]) throw new Error('Стрелка не выделяет пеперони: ' + JSON.stringify({ before, selected }));
dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true }));
if (!yes.classList.contains('dlg-cur') || no.classList.contains('dlg-cur')) throw new Error('Стрелка не возвращает выбор на диабло');
dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
if (!await until(() => d.DLG.isOpen() && document.querySelector('#dlg .dlg-text')?.textContent === 'не, не мое', 9000))
  throw new Error('Не сработала неверная ветка');
if (!await until(() => d.DLG.isOpen() && document.querySelector('#dlg .dlg-text')?.textContent === 'у вас в заказе было...', 12000))
  throw new Error('После ошибки выбор не повторился');
await run(1);
dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
if (!document.querySelector('#dlg .dlg-no')?.classList.contains('dlg-cur')) throw new Error('Повторная стрелка не выбрала пеперони');
dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
const returnPhases = new Set();
await until(() => { if (d.FPD.on) returnPhases.add(d.FPD.ph); return !d.DOOR.on() && !d.FPD.on; }, 30000);
await run(2);
if (!returnPhases.has('return-open') || !returnPhases.has('return-sit') || !returnPhases.has('return-close'))
  throw new Error('Посадка не прошла через открытие двери и сиденье: ' + JSON.stringify([...returnPhases]));
if (!order.ord.story.interiorDone || d.S.delivered < 1)
  throw new Error('Встреча не засчиталась: ' + JSON.stringify({ done: order.ord.story.interiorDone, delivered: d.S.delivered,
    state: d.S.state, stairs: stop.stairs, hold: !!stop.hold, arrived: stop.arrived, target: d.S.target,
    fpd: d.FPD.ph, dlg: d.DLG.isOpen(), warnings }));
const returned = d.FPD.R.path?.pts?.map(p => [...p]) || [];
const blocked = pts => {
  const hit = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3);
    for (let j = 1; j < n; j++) {
      const x = a[0] + (b[0] - a[0]) * j / n, z = a[1] + (b[1] - a[1]) * j / n;
      if (d.inWall(x, z, 0.15) || d.YARDS.blocks(x, z, 0.15)) hit.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }
  return hit;
};
const badOut = blocked(outbound), badReturn = blocked(returned);
if (badOut.length || badReturn.length) throw new Error('Курьер пересекает геометрию: ' + JSON.stringify({ badOut, badReturn, outbound, returned }));
if (Math.hypot(d.V.x - spec.parking.x, d.V.z - spec.parking.z) > 0.5)
  throw new Error('Машина сместилась после возвращения');
return { flat: stop.home.flat, parked, selected, returnPhases: [...returnPhases], delivered: d.S.delivered, finalCar: [d.V.x, d.V.z], driver: d.DRIVER.of(d.car)?.visible, outbound, returned };
