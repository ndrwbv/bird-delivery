/* Новый год: полночь — событие, а смена кончается только в пиццерии (0п45, автор 24.10.2026: «в один момент у меня Новый год
   просто посреди возвращения закончил смену»). Запуск: npm run probe -- --eval=tools/probe-checks/nymidnight.js --max=0 --timeout=500
   Смена 31.12 (праздник newyear), полночь застаёт: drive — везёшь заказ; back — едешь назад; brief — отъехал, а на экране
   накладная нового заказа (руль на ней не блокируется); loading — пицца ещё грузится, а ты уже отъехал. Автопилот (×3) везёт
   и возвращается. Провал — смена кончилась дальше 30 м от пиццерии. Ещё: в полночь залп салюта и поздравление в чате (rang).
   До 24.10.2026 (накладная или погрузка не у пиццерии) смена кончалась сразу: brief — в 295 м, loading — в 161 м.
   В npm run check — id nymidnight. */
const Q = new URLSearchParams(location.search);
const ONLY = (Q.get('ny') || 'drive,back,brief,loading').split(',');
const P = () => d.PZ_CUR, dist = () => Math.round(Math.hypot(d.V.x - P().x, d.V.z - P().z));
const out = { rows: {}, bad: [], warn: [] };
const chatNY = () => { const el = document.getElementById('chat'); return !!el && /с Новым годом/i.test(el.textContent); };
async function freshShift () {
  if (!['title', 'over'].includes(d.S.state)) { d.endShift(); await run(0.5); }
  d.startRun(false); await wait(400);
  if (d.S.state === 'brief') { d.acceptOrder(); await until(x => x.S.state === 'drive', 4000); }
  d.HOL.start('newyear');
}
async function untilState (st, far, secs) {
  autopilot(true);
  for (let i = 0; i < secs * 4; i++) { await run(0.25, 3); if (d.S.state === st && dist() > far) return true; if (d.S.state === 'over') return false; }
  return false;
}
for (const sc of ONLY) {
  await freshShift();
  let ok = true, said = false;
  if (sc === 'drive') { ok = await untilState('drive', 60, 60); d.CAREERM.skipTo(23.97); }
  else {
    // назад / новый заказ вдали: машину — на дорогу в 150—400 м от пиццерии (без автопилота: он не всегда успевает отъехать)
    autopilot(false);
    ok = false;
    for (let i = 0; i < 24 && !ok; i++) {
      const a = i * 0.9, r = 180 + (i % 4) * 60;
      tp(P().x + Math.sin(a) * r, P().z + Math.cos(a) * r);
      ok = dist() > 130 && dist() < 450;
    }
    if (ok) {
      d.backToBase();                                  // заказ отвезли — едем назад
      await run(0.3);
      if (sc !== 'back') {
        d.newOrder();                                  // новый заказ пришёл, когда ты уже не у пиццерии (накладная на экране)
        if (sc === 'loading') d.acceptOrder();          // приняли сразу: коробка летит в багажник (погрузка), а ты уже далеко
        d.CAREERM.skipTo(23.995);
      } else d.CAREERM.skipTo(23.97);
      ok = d.S.state === (sc === 'back' ? 'back' : sc);
      autopilot(true);
    }
  }
  if (!ok) { out.warn.push(sc + ': не дошли до нужного состояния (автопилот)'); continue; }
  const st0 = d.S.state, d0 = dist();
  const ev = []; let last = '', maxD = 0, late = false, endD = null;
  for (let i = 0; i < 4 * 150; i++) {
    await run(0.25, 3);
    const S = d.S, SH = d.CAREERM.SH;
    if (SH.phase === 'late') { late = true; maxD = Math.max(maxD, dist()); }
    const k = S.state + '|' + SH.phase + (SH.home ? '|home' : '');
    if (k !== last) { ev.push(k + ' @' + dist() + ' м'); last = k; }
    if (d.DLG.isOpen()) d.DLG.dismiss();
    said = said || chatNY();
    if (S.state === 'over' || S.state === 'title') { endD = dist(); break; }
  }
  const info = d.HOL.info();
  const row = { at: st0 + ' @' + d0 + ' м', late, maxD, endD, rang: info.rang, said, ev: ev.slice(-6) };
  out.rows[sc] = row;
  if (endD != null && endD > 30) out.bad.push(sc + `: смена кончилась в ${endD} м от пиццерии — ` + JSON.stringify(row.ev));
  else if (!late) out.bad.push(sc + ': полночь не наступила');
  else if (endD == null) out.warn.push(sc + ': за 150 с не доехал до пиццерии (автопилот), смена ждёт — ' + JSON.stringify(row.ev));
  if (late && !info.rang) out.bad.push(sc + ': в полночь не было салюта и поздравления (rang)');
  else if (late && !said) out.warn.push(sc + ': поздравления «с Новым годом» в чате не видно');
}
return out;
