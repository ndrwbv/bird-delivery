/* Вручение в кадре (handcam.js, 11бд, 24.10.2026; ORDERS.md «Вручение в кадре»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/handcam.js --size=deck --max=0 --timeout=400 --q="shots=/папка&cv=high,near,cab"
   Сцена перед разговором у двери: --q="scene=talk&cv=near&shots=/папка"; перед просьбой-поручением: --q="scene=ask&cv=high&shots=/папка"
   Поворот: машину ставят в ~45 м до адреса, автопилот подъезжает и вручает; с начала поворота — руки прочь, кадры на
   t ≈ 0,1 / 0,75 / 1,25 / после возврата. Числа: dur — длительность поворота, maxW — насколько развернулась (1 — целиком),
   ang — угол камеры от курса машины в середине, град (сзади — 0), back — после возврата. */
const Q = new URLSearchParams(location.search), DIR = Q.get('shots') || '', SCENE = Q.get('scene') || '';
const MODES = (Q.get('cv') || 'high,near,cab').split(',');
const H = d.HCAM, V = d.V, cam = d.cam, out = { modes: {}, scene: null };
const camAng = () => { const v = cam.getWorldDirection(cam.position.clone()); let a = Math.atan2(v.x, v.z) - V.h; a = Math.atan2(Math.sin(a), Math.cos(a)); return +(a * 180 / Math.PI).toFixed(0); };
const shotIf = async n => { if (DIR) { await shot(DIR + '/' + n + '.png'); (out.shots = out.shots || []).push(n); } };
await onShift(); autopilot(true);
const toTarget = async () => {
  await until(() => d.S.state === 'drive' && d.S.target && d.route.length > 1, 40000);
  const P = d.route;
  let L = 0, i = P.length - 1;
  while (i > 1 && L < 45) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); i--; }
  const a = P[i], b = P[Math.min(P.length - 1, i + 1)];
  tp(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
  await run(0.3);
};
for (const m of MODES) {
  d.CAMV.set(m, false);
  if (SCENE === 'talk') d.DOOR.talk();
  if (SCENE === 'ask') { d.ORD.ERR.due = true; delete d.DIRECTOR.KINDS.errand; }   // режиссёр (director.js) просьбу не держит
  const n0 = H.ST.turns, s0 = H.ST.scenes;
  await toTarget();
  autopilot(true);
  await until(() => H.ST.turns > n0 || H.ST.scenes > s0, 70000);   // не доехал от точки — автопилот довезёт сам
  if (!(H.ST.turns > n0 || H.ST.scenes > s0)) { out.modes[m] = { mode: m, fail: 'не доехал', st: d.S.state }; continue; }
  autopilot(false);
  const r = { mode: m };
  if (H.ST.scenes > s0) {
    // сцена крупным планом: курьер с коробкой → коробка в руках у клиента, облачко → окно разговора
    r.scene = { ...H.ST.lastScene };
    await until(() => H.SC.t >= 0.15, 3000); r.t1 = +H.SC.t.toFixed(2); await shotIf(m + '-scene-1-give');
    await until(() => H.SC.t >= 0.7 || !H.SC.on, 3000); r.t2 = +H.SC.t.toFixed(2); await shotIf(m + '-scene-2-pass');
    await until(() => H.SC.t >= 1.4 || !H.SC.on, 3000); r.t3 = +H.SC.t.toFixed(2); await shotIf(m + '-scene-3-say');
    await until(() => !H.SC.on, 6000);
    await run(0.9);
    r.after = { dlg: d.DLG.isOpen(), door: !!document.querySelector('#doorgame .tk'), ms: H.ST.lastScene.ms, skip: H.ST.lastScene.skip };
    await shotIf(m + '-scene-4-window');
    out.scene = r;
    out.modes[m] = r;
    continue;
  }
  r.turn = { ...H.ST.last };
  r.ped = H.TURN.peds[0];
  await until(() => H.TURN.t >= 0.1, 2000); r.a0 = camAng(); await shotIf(m + '-1-throw');
  await until(() => H.TURN.t >= 0.75 || !H.TURN.on, 3000); r.t2 = +H.TURN.t.toFixed(2); r.w2 = H.w; r.ang = camAng(); await shotIf(m + '-2-fly');
  await until(() => H.TURN.t >= 1.25 || !H.TURN.on, 3000); r.t3 = +H.TURN.t.toFixed(2); r.w3 = H.w; await shotIf(m + '-3-caught');
  await until(() => !H.TURN.on, 5000);
  await run(0.3);
  r.back = camAng(); r.dur = H.ST.last.t; r.maxW = +H.ST.maxW.toFixed(2); r.skip = H.ST.last.skip;
  await shotIf(m + '-4-back');
  // клиент сбоку: машину повернуть к нему боком (side=1) — поворот на того же клиента, кадр в середине
  if (Q.has('side') && H.TURN.peds !== undefined) {
    const ped = r.ped;
    if (ped && ped.grp && ped.grp.parent) {
      V.h = Math.atan2(ped.grp.position.x - V.x, ped.grp.position.z - V.z) + Math.PI / 2;   // клиент справа
      V.vx = V.vz = 0;
      await run(1.2);
      H.turn([ped]);
      await until(() => H.TURN.t >= 0.9 || !H.TURN.on, 3000); r.side = { w: H.w, ang: camAng() }; await shotIf(m + '-5-side');
      await until(() => !H.TURN.on, 4000); await run(0.3); r.side.back = camAng(); await shotIf(m + '-6-side-back');
    }
    delete r.ped;
  }
  out.modes[m] = r;
  H.ST.maxW = 0;
  autopilot(true);
}
out.st = { turns: H.ST.turns, skips: H.ST.turnSkips, scenes: H.ST.scenes, gates: H.ST.gates };
if (SCENE === 'ask') out.err = { miss: d.ORD.ERR.miss.slice(-4) };
return out;
