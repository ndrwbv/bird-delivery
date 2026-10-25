/* UI-REVIEW № 1: курсор живого окна воскрешения не гаснет после 8 с,
   первое направление зажигает главное, следующее перемещает.
   npm run probe -- --eval=tools/probe-checks/pad-focus.js --size=deck */
await onShift();
d.addWallet(1000000);
const original = navigator.getGamepads;
const gp = { id: 'probe focus (STANDARD GAMEPAD)', index: 0, connected: true,
  mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
const fail = [], states = {};
const root = document.getElementById('choice');
const selected = () => root.querySelector('#ch-opts .padsel')?.dataset.i ?? null;
const press = async n => {
  gp.buttons[n] = { pressed: true, touched: true, value: 1 };
  await wait(160);
  gp.buttons[n] = { pressed: false, touched: false, value: 0 };
  await wait(200);
};
try {
  navigator.getGamepads = () => [gp];
  // Мышь была последним вводом: курсор до первого направления скрыт.
  dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  d.askRevive();
  // Срок решения обычно 9 с; здесь удлиняем, чтобы проверить именно простой курсора.
  d.CH.t = d.CH.t0 = 60;
  await wait(250);
  states.before = selected();
  await press(13);
  states.first = selected();
  if (states.first !== '0') fail.push('первое направление не выделило воскреснуть');
  await wait(9000);
  states.idle = selected();
  if (states.idle !== '0') fail.push('курсор исчез или сдвинулся за 9 с');
  await press(13);
  states.next = selected();
  if (states.next !== '1') fail.push('второе направление не выбрало закончить смену');
  dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await wait(150);
  states.mouse = selected();
  if (states.mouse !== null) fail.push('мышь не убрала подсветку геймпада');
  await press(12);
  states.woke = selected();
  if (states.woke !== '1') fail.push('первое направление после мыши сдвинуло курсор');
  await press(12);
  states.back = selected();
  if (states.back !== '0') fail.push('следующее направление не вернуло воскреснуть');
} finally {
  navigator.getGamepads = original;
}
if (fail.length) throw new Error(JSON.stringify({ fail, states }));
return { ok: true, states, idleSeconds: 9 };
