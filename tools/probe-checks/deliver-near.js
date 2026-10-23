/* Заказы доезжают (плавные улицы 11ч, этап 4): N заказов подряд — машину ставят на путь навигатора в ~120 м до адреса,
   дальше автопилот сам (по полосе маршрута, дворами); вручил (или вернулся в пиццерию) за 45 с — доехал.
   npm run probe -- --eval=tools/probe-checks/deliver-near.js --max=0 --timeout=600 [--q=smooth] [--q=dnn=12] */
const Q = new URLSearchParams(location.search), NN = +(Q.get('dnn') || 10);
await onShift(); autopilot(true);
const pl = P => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; };
const out = { n: 0, ok: 0, miss: [], secs: [] };
for (let k = 0; k < NN; k++) {
  const live = () => d.S.state === 'drive' || d.S.state === 'back';
  await until(() => d.S.target && d.route.length > 1 && live(), 30000);
  if (!d.S.target || !live()) break;
  const st = d.S.state;                            // drive — к клиенту, back — в пиццерию
  // точка пути в ~120 м до цели (с конца), на ней — машина по ходу пути
  const P = d.route, T = d.S.target;
  let L = 0, i = P.length - 1;
  while (i > 1 && L < 120) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); i--; }
  const a = P[i], b = P[Math.min(P.length - 1, i + 1)];
  tp(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
  const d0 = d.S.delivered, t0 = d.S.clock || 0, w0 = performance.now();
  out.n++;
  let done = false;
  for (let s = 0; s < 90 && !done; s++) { await run(0.5, 3); done = st === 'drive' ? d.S.delivered > d0 : d.S.state !== 'back'; }
  if (done) { out.ok++; out.secs.push(+((performance.now() - w0) / 1000).toFixed(1)); }
  else out.miss.push({ st, to: [Math.round(T.x), Math.round(T.z)], car: [Math.round(d.V.x), Math.round(d.V.z)], left: Math.round(pl(d.route)), state: d.S.state });
  if (d.S.state === 'over' || d.S.state === 'menu') break;
}
return { smooth: !!(d.SMOOTH && d.SMOOTH.STATS.on), ...out };
