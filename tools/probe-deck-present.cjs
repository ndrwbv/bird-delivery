// Viz reports compositor presentations. The game's draw count is measured
// separately because the compositor can also present a HUD-only frame.
const categories = ['disabled-by-default-display.framedisplayed', 'blink.user_timing'];
const round = value => +value.toFixed(2);

function measure (frames, start, end) {
  let first = 0, last = 0, minFps = Infinity;
  for (let at = start; at <= end - 1000; at = frames[first] ?? Infinity) {
    while (frames[first] <= at) first++;
    while (frames[last] <= at + 1000 + 1e-6) last++;
    minFps = Math.min(minFps, last - first);
  }
  const gaps = frames.slice(1).map((at, i) => at - frames[i]).sort((a, b) => a - b);
  const fps = frames.length * 1000 / (end - start), p99Ms = gaps[Math.ceil(gaps.length * 0.99) - 1];
  return { fps: round(fps), minFps, p99Ms: round(p99Ms), worstMs: round(gaps.at(-1)),
    over50Ms: gaps.filter(gap => gap > 50).length, frames: frames.length,
    pass: fps >= 45 && minFps >= 45 && p99Ms <= 1000 / 45 + 0.5 };
}

function readPresentations (trace, results) {
  const sources = new Map(), marks = new Map();
  for (const event of trace.traceEvents) {
    if (!Number.isFinite(event.ts)) continue;
    if (event.name === 'Display::FrameDisplayed') {
      const frames = sources.get(event.pid) || new Set();
      frames.add(event.ts / 1000);
      sources.set(event.pid, frames);
    } else if (event.name?.startsWith('deck-scene:')) marks.set(event.name, event.ts / 1000);
  }
  if (sources.size !== 1) throw Error('Трасса должна содержать вывод одного композитора Electron');
  const frames = [...sources.values().next().value].sort((a, b) => a - b), rows = {};
  for (const [name, scene] of Object.entries(results)) {
    if (!scene.valid) continue;
    const start = marks.get('deck-scene:' + name + ':start'), end = marks.get('deck-scene:' + name + ':end');
    if (!(end > start + 1000)) throw Error('В трассе нет границ сцены ' + name);
    const shown = frames.filter(at => start <= at && at <= end);
    if (shown.length < 2 || shown[0] - start > 500 || end - shown.at(-1) > 500) throw Error('В трассе неполный вывод сцены ' + name);
    rows[name] = measure(shown, start, end);
  }
  return rows;
}

module.exports = { categories, readPresentations };
