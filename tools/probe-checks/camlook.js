/* «Осмотреться» (camlook.js, 12ак, 23.10.2026) — голова из-за руля и камера вокруг машины сзади. В npm run check не входит.
   Запуск («Дека»): npm run probe -- --eval=tools/probe-checks/camlook.js --size=deck --max=0 --timeout=300 --q="shots=/папка"
   Телефон (палец по экрану): npm run probe -- --eval=tools/probe-checks/camlook.js --size=phone-land --max=0 --timeout=300 --q="touch=1"
   Числа: yaw — куда смотрит камера относительно курса машины, град (+ — влево); back06 — через 0,6 с после «отпустил».
   Кадры (shots=папка): cab-0 вперёд, cab-l90 / cab-r90 — боковые окна, cab-r160 — через плечо в заднее стекло,
   near-90 / high-180 — камера сбоку и спереди. */
const Q = new URLSearchParams(location.search), DIR = Q.get('shots') || '', TOUCH = Q.has('touch');
const L = d.LOOK, V = d.V, cam = d.cam, cv = document.getElementById('view');
const dir = () => { const v = cam.getWorldDirection(cam.position.clone()); let a = Math.atan2(v.x, v.z) - V.h; a = Math.atan2(Math.sin(a), Math.cos(a)); return +(a * 180 / Math.PI).toFixed(1); };
const out = { cab: {}, pad: {}, mouse: {}, touch: {}, near: {}, high: {} };
const shotIf = async n => { if (DIR) { await shot(DIR + '/' + n + '.png'); out.shots = (out.shots || []).concat(n); } };
await onShift();
autopilot(true); await run(4); autopilot(false);
d.S.paused = false;
await run(0.5);

// ── из-за руля: держать 90° влево, вправо, 160° через правое плечо; отпустил — через 0,6 с вперёд
d.CAMV.set('cab', false);
await run(0.3);
out.cab.ahead = dir(); await shotIf('cab-0');
for (const [n, a] of [['l90', 90], ['r90', -90], ['r160', -160], ['l125', 125]]) {
  L.hold(a); await run(0.25);
  out.cab[n] = { yaw: L.yawDeg, cam: dir() };
  await shotIf('cab-' + n);
}
L.hold(-90); await run(0.2); L.release();
await run(0.3); out.cab.back03 = { yaw: L.yawDeg, cam: dir() };
await run(0.3); out.cab.back06 = { yaw: L.yawDeg, cam: dir() };

// ── мышь: правая кнопка на картинке, повести на 200 точек вправо
cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: 400, clientY: 300, bubbles: true }));
dispatchEvent(new MouseEvent('mousemove', { buttons: 2, clientX: 600, clientY: 300, bubbles: true }));
await run(0.1);
out.mouse.held = { yaw: L.yawDeg, cam: dir(), joy: d.IN ? d.IN.joy : undefined };
dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, clientX: 600, clientY: 300, bubbles: true }));
await run(0.6); out.mouse.back06 = L.yawDeg;

// ── геймпад (имитация): правый стик вправо до упора, потом вниз (назад), потом отпустить
const mk = () => ({ id: 'probe pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const gp = mk(); navigator.getGamepads = () => [gp];
gp.axes[2] = 1; gp.timestamp = performance.now(); await run(0.6);
out.pad.right = { yaw: L.yawDeg, cam: dir() };
gp.axes[2] = 0; gp.axes[3] = 1; await run(0.6);
out.pad.down = { yaw: L.yawDeg, cam: dir() };
gp.axes[2] = -1; gp.axes[3] = 0; await run(0.6);
out.pad.left = { yaw: L.yawDeg, cam: dir() };
gp.axes[2] = 0; gp.axes[3] = 0; await run(0.6);
out.pad.back06 = { yaw: L.yawDeg, cam: dir() };

// ── телефон: палец по свободной части экрана
if (TOUCH) {
  const pe = (t, x) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 200, bubbles: true }));
  pe('pointerdown', 420); pe('pointermove', 520); await run(0.1);
  out.touch.held = { yaw: L.yawDeg, cam: dir() };
  pe('pointerup', 520); await run(0.6);
  out.touch.back06 = L.yawDeg;
}

// ── сзади, близко и высоко: камера вокруг машины
d.CAMV.set('near', false); await run(0.4);
L.hold(90); await run(0.8); out.near.l90 = { yaw: L.yawDeg, cam: dir() }; await shotIf('near-l90');
L.release(); await run(1); out.near.back = dir();
d.CAMV.set('high', false); await run(0.4);
L.hold(180); await run(1.2); out.high.y180 = { yaw: L.yawDeg, cam: dir() }; await shotIf('high-180');
L.release(); await run(1.2); out.high.back = dir();
d.CAMV.set('cab', false);
return out;
