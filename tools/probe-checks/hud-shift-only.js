/* Понятнее №13/13б: деньги смены, скрытый респект и удалённые уличные деньги.
   npm run probe -- --mode=steam --size=deck --cpu=3 --q='gfx=high&gfxdev=deck' 
     --eval=tools/probe-checks/hud-shift-only.js --max=0 --errors
   --q='...&hudshots' сохраняет резкие кадры в /tmp/bird-hud13-*.png.
   Это эмуляция Deck; KO проверяется настоящим onBoom с принудительной атрибуцией удара. */
await onShift(); autopilot(false); d.SBX.god = true; d.SBX.noStall = true;
const out = { failures: [], pickups: {}, screenshots: [] };
const check = (ok, why) => { if (!ok) out.failures.push(why); };
const visible = el => !!(el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
const q = s => document.querySelector(s);
const snap = async label => { if (new URLSearchParams(location.search).has('hudshots')) { const path = '/tmp/bird-hud13-' + label + '.png'; await shot(path); out.screenshots.push(path); } };
const cleanRespect = () => !q('#respect,.rs-fly,.rs-pop') && !/респект|новое звание|звание упало/i.test((q('#toast')?.textContent || ''));
await run(4.8);
check(visible(q('#shiftcash')), 'shift earnings visible');
check(!visible(q('#money')) && !q('#money .pg-ico,.pg-fly'), 'no piggy HUD or piggy animation');
check(!q('#rivals'), 'no permanent courier place');
const css = getComputedStyle(q('#shiftcash'));
check(css.backgroundColor === 'rgba(0, 0, 0, 0)' && css.borderTopWidth === '0px' && css.boxShadow === 'none', 'left earnings have no background/border/shadow');
out.hud = { text: d.SC.text, background: css.backgroundColor, border: css.borderTopWidth, shadow: css.boxShadow };
const r0 = d.RESPECT_API.get(), w0 = d.wallet();
d.RESPECT_API.add(200, 'probe'); await run(0.25);
check(d.RESPECT_API.get() === r0 + 200 && cleanRespect(), 'respect still accumulates without visual feedback');
d.RESPECT_API.add(-200, 'probe'); await run(0.25);
check(d.RESPECT_API.get() === r0 && cleanRespect(), 'respect decreases without visual feedback');
check(d.wallet() === w0, 'respect UI change preserves wallet');
check(d.HINTS.push('respect') === false && d.HINTS.push('wallet') === false, 'removed onboarding hints cannot be queued');
const earned = 320;
d.S.money += earned; d.addWallet(earned); await run(2.3);
check(+d.SC.text.replace(/\D/g, '') === Math.round(d.S.money), 'only shift amount is displayed after money animation');
await snap('shift');
const beforeCash = { n: d.NITRO_CANS.length, wallet: d.wallet(), money: d.S.money };
check(d.addPickup('cash', d.V.x, d.V.z, false, { amount: 1000 }) === null, 'cash constructor disabled');
check(d.NITRO_CANS.length === beforeCash.n && d.wallet() === beforeCash.wallet && d.S.money === beforeCash.money, 'rejected cash has no money or world effect');
const pick = async kind => {
 const before = { hp: d.S.hp, max: d.S.hpMax, nos: d.NOS.tank };
 const n = d.addPickup(kind, d.V.x, d.V.z, false);
 check(!!n, kind + ' still spawns'); await run(0.2);
 out.pickups[kind] = { consumed: !d.NITRO_CANS.includes(n), hp: d.S.hp, max: d.S.hpMax, nos: +d.NOS.tank.toFixed(2) };
 check(!d.NITRO_CANS.includes(n), kind + ' still collectible'); return before;
};
d.NOS.tank = 0.1; await pick('nos'); check(d.NOS.tank > 0.5, 'coffee refills tank');
d.S.hp = Math.max(1, d.S.hpMax - 1); const hb = await pick('heal'); check(d.S.hp > hb.hp, 'medkit restores health');
await pick('shield'); check(d.FXS.shieldT > 9, 'shield remains active');
await pick('beast'); check(d.FXS.beastT > 10, 'beast remains active');
d.S.hp = d.S.hpMax; d.S.lifeExtra = 0; const lb = await pick('life'); check(d.S.hpMax === lb.max + 1, 'golden heart still adds extra slot');
const fixed = d.addPickup('nos', d.V.x, d.V.z, true);
await run(0.2); check(fixed.t > 1, 'fixed pickup enters respawn timer');
fixed.t = 0.01; await run(0.2); check(fixed.t > 1, 'fixed pickup replenishes and is collectible again');
const R = d.RIVALS.find(r => r.t && !r.out);
if (R) {
 const w = d.wallet(), n = d.NITRO_CANS.length;
 const oldFoe = R.foe; R.foe = true; R.ko = 0; R.t.pHitT = 1e10; R.t.onBoom();
 check(R.ko === 1, 'rival KO callback ran');
 check(d.wallet() === w && d.NITRO_CANS.length === n && !d.NITRO_CANS.some(p => p.kind === 'cash'), 'rival KO drops no cash and gives no cash payout');
 R.foe = oldFoe; out.rivalKO = true;
} else out.rivalKO = 'no active rival';
d.scatterPickups();
await run(10, 3);
check(!d.NITRO_CANS.some(p => p.kind === 'cash'), 'no cash after timers and replenishment');
check(d.NITRO_CANS.some(p => p.kind === 'nos') && d.NITRO_CANS.some(p => p.kind === 'heal'), 'other pickups survive replenishment');
// Existing temporary sheet still opens from the new anchor; pause clears it immediately.
d.CREWRANK.SH.st = 'wait'; d.CREWRANK.SH.t = 2;
await until(() => visible(q('#rank-sheet')), 7000);
out.rankShown = visible(q('#rank-sheet'));
check(out.rankShown, 'temporary courier ranking still opens');
if (out.rankShown) await snap('rank');
d.setPause(true); await wait(150);
check(!visible(q('#rank-sheet')), 'ranking hides as soon as pause opens');
check(!/респект|звание/i.test(q('#pm-stats')?.textContent || ''), 'pause has no respect count or rank title');
await snap('pause'); d.setPause(false);
const saved = d.wallet(); d.endShift('смена окончена'); await run(2.5);
check(d.wallet() === saved, 'ending shift preserves wallet without another payout');
check(!/респект|новое звание|звание упало/i.test(q('#over')?.textContent || ''), 'results have no respect');
await snap('end');
await onShift(); await run(1);
check(d.wallet() === saved, 'starting next shift preserves wallet');
check(!d.NITRO_CANS.some(p => p.kind === 'cash') && !q('#rivals,#respect'), 'cash and removed HUD do not return next shift');
out.wallet = { before: w0, saved, after: d.wallet() };
out.cash = d.NITRO_CANS.filter(p => p.kind === 'cash').length;
out.crash = d.crashlog.entries(); check(!out.crash.length, 'crash log empty');
if (out.failures.length) throw Error(JSON.stringify(out));
return out;
