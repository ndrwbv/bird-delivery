/* Свободная камера редактора: летает над городом (docs/SANDBOX.md, «Редактор города»).

   Клавиатура: WASD / стрелки — вперёд, назад, вбок; Q / E — ниже / выше; Shift — втрое быстрее.
   Мышь: зажать и тянуть (левой или правой) — повернуть голову; колесо — высота (вниз — ближе к земле).
   Геймпад: левый стик — ехать, правый — смотреть, курки — ниже / выше, LB — медленнее, RB — быстрее.
   Скорость растёт с высотой: у земли ~15 м/с, с птичьего полёта — сотни.

   Камеру ставит сама игра в своём кадре: game.js зовёт __dlv.EDL.ED.cam(cam, dt) вместо камеры меню. */
const DEAD = 0.15;
const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function makeCam (d, keys) {
  const P = { x: 0, y: 80, z: 0, yaw: 0, pitch: -0.6 };
  const ground = (x, z) => Math.max(0, d.groundH(x, z) || 0);
  const pad = { used: 0, a: false, b: false, aWas: false, bWas: false };

  function clampP () {
    P.pitch = Math.max(-1.5699, Math.min(0.7, P.pitch));
    const g = ground(P.x, P.z);
    P.y = Math.max(g + 1.6, Math.min(4000, P.y));
  }
  function speed () { return Math.max(14, Math.min(600, (P.y - ground(P.x, P.z)) * 1.1)); }

  function step (dt) {
    let f = 0, s = 0, u = 0, k = 1;
    const K = keys.down;
    if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) s += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) s -= 1;
    if (K.has('KeyE') || K.has('PageUp')) u += 1;
    if (K.has('KeyQ') || K.has('PageDown')) u -= 1;
    if (K.has('ShiftLeft') || K.has('ShiftRight')) k = 3;
    // геймпад — первый подключённый
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of gps) {
      if (!g || !g.connected) continue;
      const ax = g.axes, bt = g.buttons;
      const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      const lt = bt[6] ? bt[6].value : 0, rt = bt[7] ? bt[7].value : 0;
      if (lx || ly || rx || ry || lt > 0.1 || rt > 0.1 || bt.some(b => b && b.pressed)) pad.used = performance.now();
      f -= ly; s += lx; u += rt - lt;
      P.yaw -= rx * 2.2 * dt; P.pitch -= ry * 1.6 * dt;
      if (bt[4] && bt[4].pressed) k *= 0.3;
      if (bt[5] && bt[5].pressed) k *= 3;
      pad.a = !!(bt[0] && bt[0].pressed); pad.b = !!(bt[1] && bt[1].pressed);
      break;
    }
    if (f || s || u) {
      const v = speed() * k * dt;
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      P.x += (-sy * f + cy * s) * v;
      P.z += (-cy * f - sy * s) * v;
      P.y += u * v * 0.8;
    }
    clampP();
  }

  /** в кадре игры: шаг и поставить камеру */
  function apply (cam, dt) {
    if (dt > 0) step(Math.min(dt, 0.1));
    cam.position.set(P.x, P.y, P.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(P.pitch, P.yaw, 0);
  }

  function turn (dx, dy) { P.yaw -= dx * 0.0045; P.pitch -= dy * 0.0045; clampP(); }
  function wheel (dy) {
    const g = ground(P.x, P.z), h = Math.max(1.6, P.y - g);
    P.y = g + h * Math.exp(dy * 0.0012);
    clampP();
  }
  /** смотреть на точку (x, z) с высоты h, с юга (камера на +z от точки, смотрит на север, вниз под углом) */
  function goTo (x, z, h = 60, pitch = -0.75) {
    const g = ground(x, z);
    P.yaw = 0; P.pitch = pitch;
    const back = h / Math.tan(-pitch);
    P.x = x; P.z = z + back; P.y = g + h;
    clampP();
  }
  /** вид сверху на точку */
  function top (x, z, h = 320) { P.x = x; P.z = z + 0.01; P.y = ground(x, z) + h; P.pitch = -1.5699; clampP(); }
  /** вид сбоку на точку: с 50 м, почти над землёй */
  function side (x, z) {
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), dist = 50;
    P.x = x + sy * dist; P.z = z + cy * dist; P.y = ground(P.x, P.z) + 14; P.pitch = -0.22;
    clampP();
  }
  return { P, apply, turn, wheel, goTo, top, side, pad, speed };
}
