/* 0п118: клавиши и виртуальный стандартный геймпад в настоящей физике.
   npm run probe -- --mode=steam --size=deck --q='gfx=high&gfxdev=deck' --eval=tools/probe-checks/steering.js
   Машину удерживаем на одной точке, задавая 3 и 25 м/с: окружение не меняет постановку.
   Проверяем заметный плавный набор, быстрый точный возврат, перекладку и неполный стик. */
await ride(); autopilot(false); window.__warp = 1;
await until(() => !d.LATE.busy(), 90000);
const V = d.V, IN = d.IN, origin = { x: V.x, z: V.z, y: V.y, h: V.h };
const getPads = navigator.getGamepads.bind(navigator), rows = [], fail = [];
const gp = { id: 'Steering regression gamepad', index: 0, connected: false, mapping: 'standard',
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
navigator.getGamepads = () => gp.connected ? [gp] : [];
const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'KeyA' ? 'a' : 'd', bubbles: true }));
const frame = () => new Promise(r => requestAnimationFrame(r));
const clear = () => {
  key('KeyA', false); key('KeyD', false); gp.axes[0] = 0;
  for (const k in IN) IN[k] = 0;
};
let speed = 3;
const hold = () => {
  Object.assign(V, origin); V.vx = Math.sin(origin.h) * speed; V.vz = Math.cos(origin.h) * speed;
  V.vy = 0; V.air = false; V.kickW = 0;
};
const input = (kind, value) => {
  if (kind === 'keyboard') { key('KeyA', value > 0); key('KeyD', value < 0); }
  else gp.axes[0] = -value;
};
async function phase (kind, value, end, max = 1) {
  input(kind, value); hold();
  let start = null, first = null, last = null, frames = 0, maxJump = 0, previous = V.steer, early = null;
  while (true) {
    const t = await frame();
    if (start === null) start = t;
    const elapsed = (t - start) / 1000;
    const v = V.steer;
    if (first === null && Math.abs(v - previous) > .001) first = elapsed;
    maxJump = Math.max(maxJump, Math.abs(v - previous)); previous = v; frames++;
    if (early === null && elapsed >= .08) early = v;
    last = { elapsed, v, input: { joy: IN.joy, jx: IN.jx, left: IN.left, right: IN.right } };
    hold();
    if (end(v, elapsed) || elapsed > max) break;
  }
  return { seconds: +last.elapsed.toFixed(3), value: +last.v.toFixed(4), early, first, frames, maxJump: +maxJump.toFixed(3), input: last.input };
}
try {
  for (const kind of ['keyboard', 'gamepad']) for (const velocity of [3, 25]) {
    clear(); gp.connected = kind === 'gamepad'; speed = velocity; V.steer = 0;
    await frame(); hold();
    const pull = await phase(kind, 1, v => v >= .999);
    const release = await phase(kind, 0, v => v === 0);
    V.steer = 1;
    const reverse = await phase(kind, -1, v => v <= -.999);
    const releaseOther = await phase(kind, 0, v => v === 0);
    const still = await phase(kind, 0, (_v, t) => t >= .2);
    const row = { kind, speed, pull, release, reverse, releaseOther, still };
    if (pull.seconds < .25 || pull.seconds > .47 || pull.early === null || pull.early <= 0 || pull.early > .65) fail.push(kind + '/' + speed + ': набор не плавный');
    if (pull.first > .10 || pull.value !== 1) fail.push(kind + '/' + speed + ': запаздывание/нет полного руля');
    if (release.seconds > .3 || release.value !== 0 || releaseOther.value !== 0 || still.value !== 0) fail.push(kind + '/' + speed + ': остаточный поворот');
    if (reverse.seconds < .42 || reverse.seconds > .7 || reverse.value !== -1) fail.push(kind + '/' + speed + ': перекладка');
    if (kind === 'gamepad') {
      const partial = row.partial = await phase(kind, .55, (_v, t) => t >= .4);
      if (partial.value <= .2 || partial.value >= .65 || !partial.input.joy) fail.push('gamepad/' + speed + ': потеря неполного стика');
    }
    rows.push(row);
  }
} finally {
  clear(); gp.connected = false; navigator.getGamepads = getPads;
  Object.assign(V, origin); V.vx = V.vz = V.steer = 0;
}
return { ok: !fail.length && !d.crashlog.count(), fail, rows, crashes: d.crashlog.count() };
