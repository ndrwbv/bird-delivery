/* Обычная смена на физической Deck. Проверяем газ до готовности заказа. */
const R = d.renderer;
const gl = R.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
if (!P.nativeDeck?.launch || d.GFX.preset !== 'high' || !/AMD|radeonsi/i.test(gpu) ||
    /llvmpipe|swiftshader|software/i.test(gpu) || R.domElement.width !== 1280 || R.domElement.height !== 800) {
  throw Error('Нужна физическая Deck, высокая графика и --deck-launch');
}

const trace = window.__startupTrace;
if (!await until(() => {
  const dialog = document.querySelector('#dlg:not([hidden])');
  if (dialog) (dialog.querySelector('.dlg-yes') || dialog.querySelector('button'))?.click();
  return !!trace.firstSteerable;
}, 180000)) throw Error('Нет первого кадра с доступным рулём');

const { x, z } = d.V;
const inputAt = performance.now(), inputState = d.S.state;
const key = type => document.dispatchEvent(new KeyboardEvent(type, { key: 'w', code: 'KeyW', bubbles: true }));
let movementAt, movementState, distance;
key('keydown');
try {
  if (!await until(() => {
    distance = Math.hypot(d.V.x - x, d.V.z - z);
    if (distance <= 0.25) return false;
    movementAt = performance.now();
    movementState = d.S.state;
    return true;
  }, 2500)) throw Error('Машина не тронулась по W');
} finally {
  key('keyup');
}
if (!await until(() => !!trace.firstControl, 7000)) throw Error('Первый заказ не завершил загрузку');
const report = trace.firstReport, click = report.marks['launch.select']?.at;
const steerable = trace.firstSteerable, control = trace.firstControl;
if (!Number.isFinite(click) || !(click <= steerable.at && steerable.at <= inputAt && steerable.at <= control.at)) {
  throw Error('Нет последовательности выбора, кадра с рулём и полной готовности заказа');
}
return {
  gpu, menuMs: report.marks['launch.menu']?.at, steerableMs: steerable.at - click,
  firstMovementMs: movementAt - click, cargoReadyMs: control.at - click, inputMs: inputAt - click,
  inputState, movementState, movedBeforeCargo: movementAt < control.at && movementState === 'loading',
  distance, crash: d.crashlog.entries(), startupTrace: report,
};
