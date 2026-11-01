/* №14–16: реальные клавиши/геймпад, размер рамки, расход и подбор нитро,
   открытие карты, срок мини-игры и границы бабла на русском/английском. */
await ride(); autopilot(false); d.SBX.god = true; d.SBX.noStall = true;
const failures = [], samples = [];
// Сохраняем высокую графику; предложение сменить пресет не закрывает проверяемое сообщение.
let offersDismissed = 0;
const keepHigh = setInterval(() => { const no = document.querySelector('.gfx-offer [data-a="no"]'); if (no) { no.click(); offersDismissed++; } }, 100);
const check = (yes, text) => { if (!yes) failures.push(text); };
const key = (code, down = true) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
const tap = async code => { key(code); await wait(100); key(code, false); await wait(150); };
check(!document.getElementById('timewrap') && !document.getElementById('pause'), 'removed timer and pause button have no DOM/click zone');
check(!document.getElementById('nitro') && !document.getElementById('nitrobar'), 'no duplicate nitro gauge');
const mini = document.querySelector('#radar > .nitro-frame');
const large = document.querySelector('#fullmap .fm-view > .nitro-frame');
check(!!mini && !!large, 'both maps have nitro frame');
const value = el => +(el?.getAttribute('aria-valuenow') || 0);
for (const tank of [0, 0.37, 1]) {
  d.NOS.tank = tank; await run(0.15);
  check(value(mini) === Math.round(tank * 100) && value(large) === value(mini), 'maps agree at tank ' + tank);
  samples.push({ tank, mini: value(mini), large: value(large) });
}
const before = d.NOS.tank;
key('ShiftLeft'); await run(0.5);
check(d.NOS.burn && d.NOS.tank < before && value(mini) < 100, 'real nitro input consumes tank and frame');
check(mini.classList.contains('nf-burn'), 'burning frame visible');
key('ShiftLeft', false); await run(0.15);
check(!d.NOS.burn && !mini.classList.contains('nf-burn'), 'frame stops burning after release');
d.NOS.tank = 0.1; d.addPickup('nos', d.V.x, d.V.z, false); await run(0.4);
check(d.NOS.tank > 0.5 && Math.abs(value(mini) - d.NOS.tank * 100) < 1, 'coffee pickup replenishes frame');
await tap('Tab');
check(!document.getElementById('fullmap').hidden, 'keyboard opens map');
await wait(150);
for (const [name, svg] of [['mini', mini], ['large', large]]) {
  if (!svg) continue;
  const target = svg.parentElement, rect = svg.querySelector('.nf-fill'), css = getComputedStyle(svg);
  check(+svg.viewBox.baseVal.width === target.clientWidth && +svg.viewBox.baseVal.height === target.clientHeight, name + ' frame fits actual map dimensions');
  check(+rect.getAttribute('width') > 0 && +rect.getAttribute('height') > 0 && rect.getTotalLength() > 0, name + ' frame has full perimeter');
  check(css.pointerEvents === 'none' && getComputedStyle(rect).fill === 'none', name + ' frame does not cover/capture map');
}
await tap('Tab');
check(document.getElementById('fullmap').hidden, 'keyboard closes map');
await tap('Escape'); check(d.S.paused, 'Escape pauses without screen button');
await tap('Escape'); check(!d.S.paused, 'Escape resumes');
const getPads = navigator.getGamepads;
const gp = { id: 'HUD input test', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
navigator.getGamepads = () => [gp];
await wait(150);
gp.buttons[9] = { pressed: true, touched: true, value: 1 }; await wait(150);
gp.buttons[9] = { pressed: false, touched: false, value: 0 }; await wait(150);
check(d.S.paused, 'gamepad pauses without screen button');
gp.buttons[9] = { pressed: true, touched: true, value: 1 }; await wait(150);
gp.buttons[9] = { pressed: false, touched: false, value: 0 }; await wait(150);
check(!d.S.paused, 'gamepad resumes');
navigator.getGamepads = getPads;
// Удалённый HUD не лишает домофон и подъезд отсчёта от состояния заказа.
const saved = { free: d.S.free, time: d.S.time, timeMax: d.S.timeMax };
d.S.free = false; d.S.timeMax = 100; d.S.time = 73.2;
check(d.DOOR.clock?.due === '1:14' && d.DOOR.clock.lvl === '', 'minigame deadline independent from removed DOM');
d.S.time = 6; check(d.DOOR.clock?.due === '0:06' && d.DOOR.clock.lvl === 'low', 'minigame low deadline');
d.S.time = 0; check(d.DOOR.clock?.lvl === 'late' && d.DOOR.clock.due === '', 'minigame late deadline');
Object.assign(d.S, saved);
d.CHAT.clear();
const en = document.documentElement.lang === 'en';
const message = d.CHAT.say(en ? 'Zhenya, you are doing well. I am giving you more orders.' : 'Женя, хорошо справляешься. Даю тебе больше заказов.');
await until(() => message.m?.said, 20000);
await wait(2700);
const bubble = message.m?.el.querySelector('.cm-b'), name = bubble?.querySelector('b'), body = bubble?.querySelector('p');
check(!!bubble && !!name && !!body, 'manager message displayed through queue');
if (bubble && name && body) {
  const b = bubble.getBoundingClientRect(), n = name.getBoundingClientRect(), css = getComputedStyle(bubble);
  check(n.left >= b.left - 1 && n.right <= b.right + 1 && n.top >= b.top - 1 && n.bottom <= b.bottom + 1, 'name is inside bubble');
  check(parseFloat(getComputedStyle(name).fontSize) < parseFloat(getComputedStyle(body).fontSize), 'name is smaller than message');
  check(name.scrollWidth <= name.clientWidth + 1 && css.backgroundColor !== 'rgba(0, 0, 0, 0)', 'long manager name fits painted bubble');
  samples.push({ name: name.textContent, nameSize: getComputedStyle(name).fontSize, messageSize: getComputedStyle(body).fontSize, bubble: { width: b.width, height: b.height } });
}
if (new URLSearchParams(location.search).has('hudshots')) await shot('/tmp/bird-hud-map-' + (en ? 'en' : 'ru') + '.png');
clearInterval(keepHigh);
return { offersDismissed, ok: !failures.length && !d.crashlog.count(), failures, samples, crashes: d.crashlog.count() };
