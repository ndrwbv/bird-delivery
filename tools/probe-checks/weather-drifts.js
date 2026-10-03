/* Снежная зима (weather.js): сугробы до второго этажа не перекрывают дороги и адреса заказов
   (для npm run check; можно и так: npm run probe -- --eval=tools/probe-checks/weather-drifts.js).
   Край каждого сугроба — 16 точек — не на асфальте (проезды во дворах тоже); ни один адрес заказа
   (все точки доставки SPOTS) и ни одна дверь подъезда не в сугробе и не ближе 1,5 м к нему.
   И включается ли вариант: ручка __dlv.weather.set('snowy') — сугробы видны, сцепление в грозу = дождь. */
const W = d.weather;
if (!W) return { ok: false, err: 'нет __dlv.weather' };
const r = W.check();
W.set('snowy');
const vis = W.deep.visible;
W.set('storm');
await wait(300);
const stormRain = d.ENV.rainWant;
W.set('clear');
return { ok: !r.road && !r.addr && r.n > 0 && vis && stormRain === 1, ...r, visible: vis, stormRain };
