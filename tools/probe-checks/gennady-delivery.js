await onShift();
await run(9);
// В обычной смене Д22 даёт сюжет последним; этот сценарий проверяет саму встречу без ожидания конца смены.
if (d.S.order?.ord?.story?.storyId !== 'gennady') {
  const spec = d.STORY.orderFor('gennady', 0);
  if (!spec || !d.ORDM.force(spec)) throw new Error('Не удалось выбрать главу Геннадия');
  await run(9);
}
const beforeSms = document.querySelector('#chat')?.textContent?.includes('Женя, заказ готов') || false;
const order = d.S.order;
const stop = order && order.stops[0];
if (order?.ord?.story?.storyId !== 'gennady') throw new Error('Не запустилась глава Геннадия');
if (stop.peds.length) throw new Error('Геннадий появился перед домом вместо квартиры');
if (!stop.home?.flat) throw new Error('Номер квартиры не появился в накладной');
const flat = stop.home.flat;
d.V.x = d.S.target.x; d.V.z = d.S.target.z;
d.V.vx = 0; d.V.vz = 0;
d.car.position.x = d.V.x; d.car.position.z = d.V.z;
await until(() => stop.carry && d.DOOR.mode === 'stairs', 22000);
await until(() => d.DLG.isOpen() && document.querySelector('#dlg .dlg-text')?.textContent === 'пахнет ссаниной', 5000);
if (!stop.carry || d.DOOR.mode !== 'stairs' || document.querySelector('#fp-take-hint')) throw new Error('Автоматический путь от машины до лестницы не завершился');
if (stop.door?.mode !== 'hidden' || document.querySelector('.dg')) throw new Error('Домофон не скрыт');
if (!d.DLG.isOpen() || document.querySelector('#dlg .dlg-name')?.textContent !== 'Женя' ||
    document.querySelector('#dlg .dlg-text')?.textContent !== 'пахнет ссаниной') throw new Error('Нет вступительной реплики Жени в интерфейсе диалога');
await run(2); // дождаться печати букв и паузы перед принятием, как у игрока
document.querySelector('#dlg .dlg-yes')?.click();
await until(() => !d.DLG.isOpen(), 2000);
const atStart = d.DOOR.stairsState();
dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
await run(1.3);
dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
const walking = d.DOOR.stairsState();
if (!walking?.v3?.firstPerson || walking.y <= atStart.y + 0.1) throw new Error('Курьер не поднимается при удержании W');
d.DOOR.solve();
await until(() => d.DOOR.stairsState()?.scene?.stage === (new URLSearchParams(location.search).has('door3d') ? 'dialog' : 'door_dialogue'), 12000);
const stairs = d.DOOR.stairsState();
const oldDoor = new URLSearchParams(location.search).has('door3d');
if (!stairs?.d3 || !stairs.v3?.firstPerson || stairs.flat !== +flat || stairs.scene?.stage !== (oldDoor ? 'dialog' : 'door_dialogue')) throw new Error('Нет сцены у нужной квартиры: ' + JSON.stringify({ stairs, flat, oldDoor }));
const spoken = [];
let wrong = false, right = false;
for (let i = 0; i < 12; i++) {
  await run(i ? 4 : 7);
  if (!d.DLG.isOpen()) break;
  const text = document.querySelector('#dlg .dlg-text')?.textContent;
  if (!text) throw new Error('Реплика не открылась');
  if ((text === 'драсте, ваша пицца' || text === 'у вас в заказе было...' || text === 'вот ваша пеперони' || text === 'извините задержался') &&
      document.querySelector('#dlg .dlg-name')?.textContent !== 'Женя') throw new Error('Реплика курьера без подписи Женя');
  if (!oldDoor && (!document.querySelector('#door2d') || !d.DOOR.stairsState()?.v3?.portrait || document.querySelector('#door2d img'))) throw new Error('2D Геннадий не стоит в 3D-коридоре');
  if (!oldDoor && getComputedStyle(document.querySelector('#dlg .dlg-head img')).display !== 'none') throw new Error('Аватар Геннадия остался в диалоге');
  spoken.push(text);
  const choice = text === 'у вас в заказе было...';
  const next = document.querySelector('#dlg ' + (choice && wrong ? '.dlg-no' : '.dlg-yes'));
  if (!next) throw new Error('Кнопка ответа не найдена');
  if (choice) { if (wrong) right = true; else wrong = true; }
  next.click();
  await run(0.35);
}
if (!wrong || !right || !spoken.includes('не, не мое') || !spoken.includes('досвидания') ||
    !spoken.some(s => s.startsWith('вот ваши ')) || spoken.includes('...')) throw new Error('Ветка выбора пиццы не пройдена: ' + JSON.stringify(spoken));
await run(3);
await run(7);
const afterSms = document.querySelector('#chat')?.textContent?.includes('Молодец, Женя. Клиент доволен') || false;
const finalStairs = d.DOOR.stairsState();
const driver = d.DRIVER.of(d.car);
if (d.DOOR.on() || d.FPD.on || !order.ord.story.interiorDone || d.S.delivered < 1 || !driver?.visible)
  throw new Error('Сюжет не завершился или курьер не вернулся за руль: ' + JSON.stringify({ stage: finalStairs?.scene?.stage,
    phase: finalStairs?.phase, fpd: d.FPD.ph, delivered: d.S.delivered, done: order.ord.story.interiorDone, driver: driver?.visible, crash: d.crashlog }));
return { story: order.ord.story.storyId, flat, intercom: stop.door?.mode, stairsFlat: stairs.flat,
  carried: stop.carry, scenarioDone: order.ord.story.interiorDone,
  savedProgress: d.STORY.progress().gennady?.ch, delivered: d.S.delivered,
  state: d.S.state, dialogOpen: d.DLG.isOpen(), doorOpen: d.DOOR.on(), oldDoor, beforeSms, afterSms,
  spoken, wrong, right, stairsStage: finalStairs?.scene?.stage, stairsPhase: finalStairs?.phase,
  driverVisible: driver?.visible, carVisible: d.car.visible, fpPhase: d.FPD.ph, fpLast: d.FPD.ST.last };
