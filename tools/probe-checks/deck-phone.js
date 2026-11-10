/* Холодный старт обычной смены. Засекаем первый W при открытом заказе,
   интервалы кадров до конца опускания телефона и длинные задачи JS. */
if (!P.nativeDeck?.launch || d.GFX.preset !== 'high') {
  throw Error('Нужны --deck-native --deck-launch и высокая графика');
}
const gl = d.renderer.getContext();
const info = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
if (!gpu || !/AMD|radeonsi/i.test(gpu) || /llvmpipe|swiftshader|software/i.test(gpu)) {
  throw Error('Замер требует аппаратный WebGL на Steam Deck');
}

const phone = document.getElementById('hud-phone');
const device = phone?.querySelector('.hp-device');
if (!device) throw Error('Телефон курьера не открыт');
const isExpanded = () => phone.classList.contains('hp-expanded');
if (!await until(() => {
  const dialog = document.querySelector('#dlg:not([hidden])');
  if (dialog) (dialog.querySelector('.dlg-yes') || dialog.querySelector('button'))?.click();
  return isExpanded() && document.body.classList.contains('hp-order-open') && d.S.state === 'drive';
}, 180000)) throw Error('Заказ не появился в начале смены');

const frames = [], transitions = [], tasks = [];
let dockAt = null, hidden = document.hidden;
const dock = new MutationObserver(() => { if (!isExpanded()) dockAt ??= performance.now(); });
const types = ['transitionstart', 'transitionend', 'transitioncancel'];
const transition = event => {
  if (event.target === device) {
    transitions.push({ event: event.type, property: event.propertyName, at: performance.now() });
  }
};
const observer = new PerformanceObserver(list => {
  for (const { startTime, duration } of list.getEntries()) tasks.push({ startTime, duration });
});
let raf, last = performance.now();
function sample(now) {
  hidden ||= document.hidden;
  if (now > last) frames.push({ at: now, ms: now - last });
  last = now;
  raf = requestAnimationFrame(sample);
}
const key = type => document.dispatchEvent(new KeyboardEvent(type, { key: 'w', code: 'KeyW', bubbles: true }));

for (const type of types) device.addEventListener(type, transition);
observer.observe({ type: 'longtask' });
dock.observe(phone, { attributes: true, attributeFilter: ['class'] });
raf = requestAnimationFrame(sample);
const start = performance.now();
const heroAtInput = !!d.V.hero;
if (P.nativeDeck.tracePresent) performance.mark('deck-scene:phone:start');
try {
  key('keydown');
  await wait(1100);
} finally {
  if (P.nativeDeck.tracePresent) performance.mark('deck-scene:phone:end');
  key('keyup');
  cancelAnimationFrame(raf);
  observer.disconnect();
  dock.disconnect();
  for (const type of types) device.removeEventListener(type, transition);
}
const begins = transitions.find(row => row.event === 'transitionstart' && row.property === 'transform');
const ends = transitions.find(row => row.event === 'transitionend' && row.property === 'transform');
const lastAt = ends?.at ?? start + 1000;
const intervals = frames.filter(row => row.at <= lastAt).map(row => row.ms).sort((a, b) => a - b);
const maxMs = intervals.at(-1) ?? null;
const observed = !hidden && !!begins && !!ends && !isExpanded();
return {
  observed,
  pass: observed && maxMs !== null && maxMs <= 1000 / 45 + 0.5,
  results: { phone: { valid: observed } },
  heroAtInput,
  gpu, properties: getComputedStyle(device).transitionProperty,
  inputToMotionMs: begins ? begins.at - start : null,
  inputToDockClassMs: dockAt === null ? null : dockAt - start,
  frames: intervals.length, maxMs,
  p95Ms: intervals[Math.ceil(intervals.length * .95) - 1] ?? null,
  over50Ms: intervals.filter(ms => ms > 50).length,
  transitions, tasks: tasks.filter(row => row.startTime <= lastAt && row.startTime + row.duration >= start),
  crash: d.crashlog.entries(),
};
