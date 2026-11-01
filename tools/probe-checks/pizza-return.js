/* 0п115: после доставки заказа уже нет, но зелёная зона должна выдать следующий.
   Проверяем настоящий цикл кадра: снаружи зоны ждём, внутри — новая накладная и погрузка.
   npm run probe -- --mode=steam --size=deck --q=gfx=high&gfxdev=deck --eval=tools/probe-checks/pizza-return.js */
await onShift();
autopilot(false);
const rows = [], bad = [];
const dist = () => Math.hypot(d.V.x - d.PZ_CUR.x, d.V.z - d.PZ_CUR.z);
for (let i = 0; i < 3; i++) {
  const oldOrder = d.S.order, count = d.S.orders;
  tp(d.PZ_CUR.x + 45, d.PZ_CUR.z + 45);
  d.backToBase();
  await run(0.3);
  if (dist() <= 7 || d.S.state !== 'back' || d.S.order !== null || d.S.orders !== count)
    bad.push('вне зоны: должен ждать без заказа');

  const P = d.PZ_CUR, V = d.V;
  V.x = P.x; V.z = P.z; V.y = d.surfaceAt(V.x, V.z); V.vx = V.vz = 0;
  d.car.position.set(V.x, V.y, V.z);
  const arrived = await until(() => d.S.state !== 'back', 3000);
  const arrival = { state: d.S.state, distance: +dist().toFixed(2), empty: !d.S.order };
  if (!arrived) { bad.push('в зелёной зоне не началась выдача'); rows.push(arrival); break; }
  if (arrival.state !== 'handover' || !arrival.empty) bad.push('возврат не прошёл через ожидание на базе');
  const next = await until(() => d.S.order && d.S.order !== oldOrder, 5000);
  if (next && d.S.state === 'brief') d.acceptOrder();
  const loaded = next && await until(() => d.S.state === 'drive', 5000);
  rows.push({ arrival, next: !!next, loaded: !!loaded, orders: d.S.orders });
  if (!loaded || d.S.orders !== count + 1) { bad.push('следующий заказ не загрузился ровно один раз'); break; }
}
const crash = d.crashlog.entries();
if (crash.length) bad.push('непустой журнал ошибок');
return { ok: !bad.length && rows.length === 3, bad, rows, crash };
