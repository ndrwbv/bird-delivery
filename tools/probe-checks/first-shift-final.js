/* Белая проверка граничных состояний №0п124: отдельно от полного заезда first-shift-journey.js.
   Здесь часы/оплата задаются явно; для границы возврата машину ставим у Геннадия и возвращаем к базе.
   Полный путь без таких подстановок проверяет first-shift-journey.js.
   npm run probe -- --mode=steam --size=deck --eval=tools/probe-checks/first-shift-final.js */
await onShift();
await until(() => d.ORD.CAR && d.ORD.STORY, 10000);
const O = d.ORD, C = d.CAREERM, S = d.S;
const require = (yes, message) => { if (!yes) throw new Error(message); };
require(O.firstFinalPending() && !O.firstFinalComplete(), 'Чистая первая смена не резервирует финал');
require(!S.order?.ord?.story, 'Геннадий выдан вместо первого обычного заказа');
require(O.bundleSpec(120, { min: 200, max: 1800 }) === null, 'Первая смена перешла к сборным');
const previous = S.order;
d.ENV.t = d.ECON.SHIFT.T_END + 0.001;
await run(1);
require(C.phase() === 'late' && C.shiftOn() && S.order === previous, 'Полночь потеряла текущую доставку до финала');
// Предыдущая доставка закончилась и машина стоит у исходной пиццерии.
S.order = null; S.state = 'handover'; S.handT = 0;
require(await until(() => S.order?.ord?.story?.storyId === 'gennady', 12000), 'Финал не выдан после пропущенного последнего слота');
const first = S.order, sp = first.ord.story, expected = d.STORY.orderFor('gennady', 0);
require(C.SH.home, 'Выданный после полуночи финал не сохраняет ожидание возвращения');
require(sp.firstFinal && sp.shift === 1 && sp.addr === expected.addr && sp.door.x === expected.door.x && sp.door.z === expected.door.z, 'Финал изменил заданный адрес/подъезд Геннадия');
await run(8);
require(C.shiftOn() && S.order === first && S.state !== 'over', 'Полночь/lateGuard прервали финальную доставку');
// Потеря неоплаченной пиццы не должна навсегда занять единственный сюжетный слот.
S.order = null; S.state = 'handover'; S.handT = 0;
require(await until(() => S.order && S.order !== first && S.order.ord?.story?.storyId === 'gennady', 12000), 'Неоплаченный финал нельзя повторно забрать');
require((+d.Store.get('dlv-boss', 0) || 0) === 0, 'Первая смена съела сообщение о росте');
// Сохранённая завершённая глава + ещё не закрытая смена: как после выхода между ними.
const wallet = d.wallet();
const paid = { ...S.order.ord.story, interiorDone: true }, baseCar = { x: d.V.x, y: d.V.y, z: d.V.z, h: d.V.h };
await d.STORY.onDeliver(paid);
S.order = null; S.state = 'back'; S.target = { x: d.PIZZA.x, z: d.PIZZA.z };
d.V.x = paid.parking.x; d.V.z = paid.parking.z; d.V.y = d.surfaceAt(d.V.x, d.V.z); d.V.vx = d.V.vz = 0;
await run(8);
require(C.shiftOn() && S.state === 'back' && !S.order && Math.hypot(d.V.x - d.PIZZA.x, d.V.z - d.PIZZA.z) > 100,
  'После оплаты позднего финала lateGuard оборвал дорогу назад');
d.STORY.reload(true); O.resetShift();
require(O.firstFinalComplete() && !O.firstFinalPending() && O.nextPlan() === null, 'После восстановления оплаченная глава выдана снова');
require(d.wallet() === wallet, 'Восстановление повторно начислило оплату');
Object.assign(d.V, baseCar, { vx: 0, vz: 0 });
S.order = null; S.state = 'handover'; S.handT = 0;
require(await until(() => S.state === 'over' && !C.shiftOn(), 12000), 'После завершённого финала первая смена не закрылась');
const completed = +d.Store.get('dlv-shifts', 0) || 0;
require(completed === 1, 'Конец первой смены не сохранён ровно один раз');
require(!O.firstFinalPending() && !O.firstFinalComplete(), 'Исключение первой смены осталось в последующих');
O.resetShift();
const later = O.bundleSpec(120, { min: 200, max: 1800 });
require(!!later?.bundle && later.bundle.boss === 2, 'После первой смены сборные/объявление не вернулись');
// Подтверждённый сброс карьеры удаляет оба обычных ключа, отдельного вечного флага нет.
d.STORY.reset(); d.Store.set('dlv-shifts', 0);
require(O.firstFinalPending() && !O.firstFinalComplete(), 'После сброса карьеры финал остался закрытым');
return { ok: true, midnightKeptCurrent: true, finalAddress: sp.addr, finalDoor: sp.door,
  retryUnpaid: true, restoredNoRepeat: true, walletUnchangedOnRestore: true, completed,
  laterBundle: later.bundle.n, laterBoss: later.bundle.boss, resetRestoresFinal: true };
