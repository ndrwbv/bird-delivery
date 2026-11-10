/* Физическая Deck, видимое окно, Steam. Засекаем интервалы между отрисовками
   основной сцены. Это кадры игры, отправленные на вывод, без счётчика композитора. */
const R = d.renderer;
const gl = R.getContext();
const info = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
if (!P.nativeDeck || !gpu || !/AMD|RADV|radeonsi/i.test(gpu) || /llvmpipe|swiftshader|software/i.test(gpu)) {
  throw Error('Замер требует аппаратный WebGL в видимом окне Steam Deck: ' + gpu);
}
const gfx = d.GFX;
if (gfx.preset !== 'high' || gfx.dev !== 'deck' || R.domElement.width !== 1280 || R.domElement.height !== 800) {
  throw Error('Для замера нужны высокая графика Deck и кадр 1280×800');
}
console.info('[deck] GPU', gpu, JSON.stringify(P.nativeDeck));
const q = new URLSearchParams(location.search);
const seconds = Number(q.get('decksecs') ?? 30);
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 120) throw Error('decksecs: 10–120 с');
const budget = 1000 / 45;
const day = d.ECON.tOfHour(12);
const night = d.ECON.tOfHour(22.5);
const plan = [
  { name: 'center', district: 3, season: 0.5, hour: day, weather: 'clear' },
  { name: 'east', district: 5, season: 0.5, hour: day, weather: 'clear' },
  { name: 'old', district: 4, season: 0.5, hour: day, weather: 'clear' },
  { name: 'snow', district: 3, season: 2.4, hour: day, weather: 'snowy' },
  { name: 'blizzard', district: 3, season: 2.4, hour: night, weather: 'blizzard' },
  { name: 'newyear', district: 3, season: 2.45, hour: night, weather: 'clear', holiday: 'newyear' },
  { name: 'storm', district: 4, season: 0.6, hour: night, weather: 'storm' },
  { name: 'hurricane', district: 3, season: 1.3, hour: day, weather: 'hurricane' },
  { name: 'fireworks', district: 3, season: 2.45, hour: night, weather: 'clear', holiday: 'newyear', stress: () => d.HOL.boom(8) },
  { name: 'tornado', district: 3, season: 1.3, hour: day, weather: 'hurricane', stress: () => d.weather.hur.come() },
];
const only = q.get('deckscenes')?.split(',');
const scenes = only ? plan.filter(s => only.includes(s.name)) : plan;
if (!scenes.length || only && scenes.length !== only.length) throw Error('Неизвестная сцена Deck');

let startup = null;
if (P.nativeDeck.launch) {
  const trace = window.__startupTrace;
  if (!await until(() => {
    const dialog = document.querySelector('#dlg:not([hidden])');
    if (dialog) (dialog.querySelector('.dlg-yes') || dialog.querySelector('button'))?.click();
    return !!trace.firstControl;
  }, 180000)) throw Error('Нет первого управляемого кадра после нажатия в раннем меню');
  const report = trace.firstReport || trace.report();
  const menu = report.marks['launch.menu']?.at;
  const click = report.marks['launch.select']?.at;
  const control = report.marks['first.control']?.at;
  const queued = report.marks['shift.request']?.at;
  const ready = report.marks['queue.full']?.at;
  if (![menu, click, control].every(Number.isFinite) || !(menu <= click && click <= control)) {
    throw Error('Нет подтверждённой последовательности меню → выбор → управление');
  }
  const { x, z } = d.V;
  const key = type => document.dispatchEvent(new KeyboardEvent(type, { key: 'w', code: 'KeyW', bubbles: true }));
  key('keydown');
  try { await wait(650); } finally { key('keyup'); }
  const moved = Math.hypot(d.V.x - x, d.V.z - z);
  if (!(moved > 0.05)) throw Error('Первый кадр не дал тронуться по W');
  startup = {
    menuMs: Math.round(menu), afterClickMs: Math.round(control - click), moved,
    beforeQueueMs: Number.isFinite(queued) ? Math.round(queued - click) : null,
    queueMs: Number.isFinite(ready) && Number.isFinite(queued) ? Math.round(ready - queued) : null,
    afterQueueMs: Number.isFinite(ready) ? Math.round(control - ready) : null,
    pass: control - click <= 20000,
    contourPackage: d.LAND_PACKAGE?.meta() ?? null,
    preparedTerrainTiles: report.counters['land.surface.bakedUsed'] ?? 0,
    preparedShadowParts: report.counters['shift.shadow.warmParts'] ?? 0,
    stages: report.rows.sort((a, b) => b.exclusiveWorkMs - a.exclusiveWorkMs).slice(0, 12)
      .map(row => [row.name, Math.round(row.exclusiveWorkMs)]),
  };
  log(startup);
  console.info('[deck] запуск', JSON.stringify(startup));
}

const round = n => +n.toFixed(2);
const quantile = (a, p) => a[Math.ceil(a.length * p) - 1] ?? 0;
function worstSecond (times, start, end) {
  let first = 0, last = 0, min = Infinity;
  // The count can only drop when the left edge passes a rendered frame.
  for (let left = start; left <= end - 1000; left = times[first] ?? Infinity) {
    while (times[first] <= left) first++;
    const right = left + 1000 + 1e-6; // numerical rounding at a tied edge
    while (times[last] <= right) last++;
    min = Math.min(min, last - first);
  }
  return Number.isFinite(min) ? min : 0;
}
function fixedRoute () {
  const { x, z, h } = d.V, target = d.S.target;
  const fx = Math.sin(h), fz = Math.cos(h);
  const candidates = [];
  for (const node of d.NODES) {
    const dx = node.x - x, dz = node.z - z, distance = Math.hypot(dx, dz);
    if (distance < 520 || distance > 710 || node.nb.length < 2) continue;
    candidates.push({ node, score: (dx * fx + dz * fz) / distance - Math.abs(distance - 610) / 900 });
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const { node } of candidates.slice(0, 20)) {
    const path = d.drivingPath(x, z, node.x, node.z, h, false);
    if (!path || path.length < 3) continue;
    let distance = 0;
    for (let i = 1; i < path.length; i++) distance += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (distance < 480) continue;
    if (target && path.some(([px, pz], i) => {
      if (!i) return Math.hypot(px - target.x, pz - target.z) < 60;
      const [ax, az] = path[i - 1], dx = px - ax, dz = pz - az;
      const t = Math.max(0, Math.min(1, ((target.x - ax) * dx + (target.z - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(ax + dx * t - target.x, az + dz * t - target.z) < 60;
    })) continue;
    return path;
  }
  return null;
}
function stageRoute () {
  const { x, z } = d.V;
  const local = d.nearestRoad(x, z, 5, 4);
  if (local) tp(local.x, local.z);
  let path = fixedRoute();
  // An order can spawn next to the pizzeria, inside the exclusion radius.
  // In that case begin on a neighbouring street clear of the delivery.
  const offsets = [[0, -110], [110, 0], [0, 110], [-110, 0], [150, -150], [150, 150], [-150, 150], [-150, -150]];
  if (!path) for (const [dx, dz] of offsets) {
    const road = d.nearestRoad(x + dx, z + dz, 5, 1);
    if (!road || road.d > 55) continue;
    tp(road.x, road.z);
    path = fixedRoute();
    if (path) break;
  }
  return path;
}
const render = R.render;
const results = {};
const gpuTimes = [];
const previousGpuSink = d.DYNRES.sink;
const profile = d.crashlog.PROF;
const previousProfile = profile.fn;
d.DYNRES.sink = gpuTimes;
let sample = null;
if (q.has('deckprofile')) {
  profile.fn = (name, ms) => {
    if (!sample || ms < 1) return;
    const row = sample.steps[name] ||= { total: 0, max: 0, over4: 0 };
    row.total += ms;
    row.max = Math.max(row.max, ms);
    row.over4 += +(ms > 4);
    if (name === 'snow.surface') {
      const snow = d.SNOW.ST, view = d.SNOW.render;
      for (const key of ['contactMs', 'viewMs', 'objectsMs', 'deformMs', 'nearMs', 'middleMs']) {
        const value = snow[key] ?? view?.[key];
        if (!Number.isFinite(value)) continue;
        const part = sample.steps[key] ||= { total: 0, max: 0, over4: 0 };
        part.total += value;
        part.max = Math.max(part.max, value);
        part.over4 += +(value > 4);
      }
    }
  };
}
R.render = function (scene, camera) {
  render.call(this, scene, camera);
  if (!sample || scene !== d.scene || this.getRenderTarget()) return;
  if (document.hidden) sample.hidden = true;
  const fog = scene.fog;
  sample.fogGap = Math.min(sample.fogGap, fog.far - fog.near);
  if (d.S.state !== 'drive' || d.S.paused || d.DLG.isOpen()) {
    const phase = d.S.paused ? 'пауза' : d.DLG.isOpen() ? 'диалог' : d.S.state;
    sample.interruptions[phase] = (sample.interruptions[phase] || 0) + 1;
  }
  const now = performance.now();
  sample.times.push(now);
  if (now >= sample.coverageAt && d.LAND_STREAM) {
    sample.coverageAt = now + 250;
    sample.coverageChecks++;
    if (!d.LAND_STREAM.readyAt(camera.position.x, camera.position.z, Math.min(640, camera.far + 32))) {
      sample.coverageMisses++;
    }
  }
  sample.calls += this.info.render.calls;
  sample.triangles += this.info.render.triangles;
  const { x, z } = d.V;
  sample.distance += Math.hypot(x - sample.x, z - sample.z);
  sample.x = x;
  sample.z = z;
};
try {
  d.DIST.unlockAll();
  for (const scene of scenes) {
    autopilot(false);
    P.ap.fixedRoute = null;
    d.HOL.stop();
    if (!d.DIST.set(scene.district)) throw Error('Не выбран район: ' + scene.name);
    const loadStarted = performance.now();
    d.startRun(false);
    autopilot(true);
    console.info('[deck] вход', scene.name);
    let nextStatus = loadStarted + 15000;
    const ready = await until(() => {
      if (d.S.state === 'drive' && d.PZ_CUR === d.PIZZERIAS[scene.district] && !document.querySelector('.late-wait')) return true;
      if (performance.now() >= nextStatus) {
        nextStatus += 15000;
        console.info('[deck] ожидание', scene.name, d.S.state, d.LAND_STREAM.stats.ready, d.LAND_STREAM.stats.queue.queued);
      }
      return false;
    }, 90000);
    if (!ready) {
      results[scene.name] = { valid: false, pass: false, state: d.S.state, reason: 'Смена не началась за 90 с' };
      log([scene.name, results[scene.name]]);
      console.info('[deck]', scene.name, JSON.stringify(results[scene.name]));
      continue;
    }
    const districtLoadMs = round(performance.now() - loadStarted);
    d.season.set(scene.season);
    d.ENV.t = scene.hour;
    d.weather.set(scene.weather);
    if (scene.holiday) d.HOL.start(scene.holiday);
    const path = stageRoute();
    if (!path) {
      results[scene.name] = { valid: false, pass: false, reason: 'Нет длинного маршрута вдали от заказа' };
      log([scene.name, results[scene.name]]);
      continue;
    }
    P.ap.fixedRoute = path;
    await wait(3500);
    const stress = scene.stress?.() ?? null;
    if (scene.stress && !stress) {
      results[scene.name] = { valid: false, pass: false, reason: 'Нагрузочное событие не запустилось' };
      log([scene.name, results[scene.name]]);
      continue;
    }
    sample = { times: [], steps: {}, interruptions: {}, fogGap: Infinity, calls: 0, triangles: 0, distance: 0,
      x: d.V.x, z: d.V.z, coverageAt: 0, coverageChecks: 0, coverageMisses: 0 };
    gpuTimes.length = 0;
    const tileStages = d.LAND_STREAM.stats.stages;
    if (tileStages) for (const key of Object.keys(tileStages)) delete tileStages[key];
    const prevLow = d.DYNRES.STATS.low;
    const prevDyn = d.DYNRES.STATS.frames;
    const apTimes = P.ap.timing = [];
    const start = performance.now();
    if (P.nativeDeck.tracePresent) performance.mark('deck-scene:' + scene.name + ':start');
    await wait(seconds * 1000);
    if (P.nativeDeck.tracePresent) performance.mark('deck-scene:' + scene.name + ':end');
    const elapsed = performance.now() - start;
    P.ap.timing = null;
    apTimes.sort((a, b) => a - b);
    const { times, steps, fogGap, calls, triangles, distance, hidden, interruptions, coverageChecks, coverageMisses } = sample;
    const interrupted = Object.keys(interruptions).length > 0;
    sample = null;
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const gapsSorted = gaps.slice().sort((a, b) => a - b);
    const count = times.length;
    const fps = count * 1000 / elapsed;
    const minFps = worstSecond(times, start, start + elapsed);
    const p99 = quantile(gapsSorted, 0.99);
    const slowest = gapsSorted.slice(-Math.max(1, Math.ceil(gaps.length * 0.01)));
    const slowestMs = slowest.reduce((a, b) => a + b, 0);
    const slowSteps = Object.entries(steps).sort((a, b) => b[1].total - a[1].total).slice(0, 8)
      .map(([name, row]) => [name, round(row.total), round(row.max), row.over4]);
    gpuTimes.sort((a, b) => a - b);
    const valid = count > 0 && !hidden && !interrupted && distance >= seconds * 2;
    const dynFrames = d.DYNRES.STATS.frames - prevDyn;
    results[scene.name] = {
      valid, pass: valid && coverageMisses === 0 && fogGap > 0 && fps >= 45 && minFps >= 45 && p99 <= budget + 0.5,
      fps: round(fps), minFps, fps1Pct: slowestMs ? round(slowest.length * 1000 / slowestMs) : 0, p95Ms: round(quantile(gapsSorted, 0.95)), p99Ms: round(p99),
      worstMs: round(gapsSorted.at(-1) ?? 0), overBudgetPct: round(100 * gaps.filter(v => v > budget + 0.5).length / Math.max(1, gaps.length)),
      over50Ms: gaps.filter(v => v > 50).length, frames: count, distanceM: round(distance),
      hidden: !!hidden, interrupted, interruptions, fixedRoute: true, minFogGapM: Number.isFinite(fogGap) ? round(fogGap) : null,
      coverageChecks, coverageMisses,
      calls: Math.round(calls / Math.max(1, count)), ktris: Math.round(triangles / Math.max(1, count) / 1000),
      cpuWork: gfx.work(), slowSteps,
      autopilot: { samples: apTimes.length, p95Ms: round(quantile(apTimes, 0.95)),
        p99Ms: round(quantile(apTimes, 0.99)), maxMs: round(apTimes.at(-1) ?? 0) },
      tileSteps: Object.entries(tileStages || {}).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
        .map(([key, row]) => [key, round(row.ms), round(row.max), row.over4]),
      gpuP95Ms: gpuTimes.length ? round(quantile(gpuTimes, 0.95)) : null,
      reducedResolutionPct: dynFrames ? round(100 * (d.DYNRES.STATS.low - prevLow) / dynFrames) : null,
      districtLoadMs, district: d.DIST.cur(), weather: d.weather.id, wave: d.weather.wave(), season: d.season.value,
      holiday: scene.holiday ? d.HOL.info() : null, stress,
      tornadoHouses: scene.name === 'tornado' ? d.weather.hur.sites : null,
    };
    log([scene.name, results[scene.name]]);
    console.info('[deck]', scene.name, JSON.stringify(results[scene.name]));
  }
} finally {
  R.render = render;
  d.DYNRES.sink = previousGpuSink;
  profile.fn = previousProfile;
  autopilot(false);
  P.ap.fixedRoute = null;
  P.ap.timing = null;
}
return { gpu, ...P.nativeDeck, windowSize: [innerWidth, innerHeight], renderSize: [R.domElement.width, R.domElement.height], seconds, startup, results, crash: d.crashlog.entries() };
