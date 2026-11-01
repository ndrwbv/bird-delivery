/* №17ж. Bounded startup aggregates, opt-in ?startuptrace; no world/quality/scheduling changes.
   workMs is synchronous JS elapsed time, NOT OS thread CPU. Async/worker/import windows may overlap. */
export function createStartupTrace ({ enabled = false, now = () => performance.now(), resources = () => performance.getEntriesByType('resource') } = {}) {
  const rows = new Map(), marks = Object.create(null), stack = [], waits = new Map(), flags = Object.create(null);
  const LIMIT = 256;
  let workUnionMs = 0, dropped = 0, runs = 0, latestRun = null, menuEnd = null, firstSnapshot = null;
  const counters = Object.create(null);
  const overflow = { rows: 0, marks: 0, flags: 0, counters: 0 };
  const lose = kind => { dropped++; overflow[kind]++; };
  const row = name => {
    if (rows.has(name)) return rows.get(name);
    if (rows.size >= LIMIT) { lose('rows'); return null; }
    const r = { name, workMs: 0, exclusiveWorkMs: 0, maxWorkMs: 0, steps: 0, windowMs: 0, windows: 0, workerWorkMs: 0, workerBatches: 0 };
    rows.set(name, r); return r;
  };
  function mark (name, data) {
    if (!enabled || Object.hasOwn(marks, name)) return;
    if (Object.keys(marks).length >= 64) { lose('marks'); return; }
    if (name === 'menu.visible') menuEnd = windowStart('external.menuInput', 'menuInput');
    marks[name] = { at: now(), ...(data === undefined ? {} : { data }) };
  }
  const noop = () => {};
  function startWork (name) {
    if (!enabled) return noop;
    const task = { start: now(), child: 0 }; stack.push(task);
    let ended = false;
    return () => {
      if (ended) return; ended = true;
      const ms = Math.max(0, now() - task.start), r = row(name); stack.pop();
      if (r) { r.workMs += ms; r.exclusiveWorkMs += Math.max(0, ms - task.child); r.maxWorkMs = Math.max(r.maxWorkMs, ms); r.steps++; }
      if (stack.length) stack[stack.length - 1].child += ms; else workUnionMs += ms;
    };
  }
  function work (name, fn) {
    if (!enabled) return fn();
    const end = startWork(name);
    try { return fn(); } finally { end(); }
  }
  function windowStart (name, kind = 'async') {
    if (!enabled) return () => {};
    const start = now();
    let group = waits.get(kind);
    if (!group) { group = { active: 0, from: 0, unionMs: 0 }; waits.set(kind, group); }
    if (!group.active++) group.from = start;
    let ended = false;
    return () => {
      if (ended) return; ended = true;
      const end = now(), r = row(name);
      if (r) { r.windowMs += Math.max(0, end - start); r.windows++; }
      if (!--group.active) group.unionMs += Math.max(0, end - group.from);
    };
  }
  function awaited (name, kind, fn) {
    if (!enabled) return fn();
    return (async () => {
      const end = windowStart(name, kind);
      try { return await fn(); } finally { end(); }
    })();
  }
  function steps (name, it) {
    if (!enabled) return it;
    const wrapped = { [Symbol.iterator] () { return this; }, next: value => work(name, () => it.next(value)) };
    if (typeof it.return === 'function') wrapped.return = value => work(name, () => it.return(value));
    if (typeof it.throw === 'function') wrapped.throw = error => work(name, () => it.throw(error));
    return wrapped;
  }
  function flag (kind) {
    if (!enabled) return;
    if (!Object.hasOwn(flags, kind) && Object.keys(flags).length >= 32) { lose('flags'); return; }
    flags[kind] = (flags[kind] || 0) + 1;
  }
  function worker (name, ms) { if (!enabled || !Number.isFinite(ms) || ms < 0) return; const r = row(name); if (r) { r.workerWorkMs += ms; r.workerBatches++; } }
  function request (data = {}) {
    if (!enabled || latestRun && latestRun.controlAt === null) return;
    menuEnd?.(); menuEnd = null;
    latestRun = { id: ++runs, requestedAt: now(), controlAt: null, data };
    mark('shift.request', data);
  }
  function control (data) {
    if (!enabled || !latestRun || latestRun.controlAt !== null) return;
    latestRun.controlAt = now(); latestRun.control = data;
    mark('first.control', data);
    if (!firstSnapshot) firstSnapshot = report();
  }
  function count (name, n = 1) {
    if (!enabled || !Number.isFinite(n)) return;
    if (!Object.hasOwn(counters, name) && Object.keys(counters).length >= 32) { lose('counters'); return; }
    counters[name] = (counters[name] || 0) + n;
  }
  function geometry (name, root) {
    if (!enabled) return;
    let bytes = 0;
    root.traverse(o => {
      const g = o.geometry; if (!g) return;
      for (const a of Object.values(g.attributes || {})) bytes += a.array?.byteLength || a.data?.array?.byteLength || 0;
      bytes += g.index?.array?.byteLength || 0;
    });
    count(name + '.cells'); count(name + '.attributeBytes', bytes);
  }
  function report () {
    const end = now();
    const capturedResources = enabled ? resources().filter(r => /\.m?js(?:\?|$)|\.json(?:\?|$)/.test(r.name)) : [];
    const resourceCapture = { totalCount: capturedResources.length, includedCount: Math.min(capturedResources.length, 64), truncatedCount: Math.max(0, capturedResources.length - 64), limit: 64 };
    const union = Object.fromEntries([...waits].map(([kind, g]) => [kind, g.unionMs + (g.active ? end - g.from : 0)]));
    return { version: 1, enabled, marks: { ...marks }, rows: [...rows.values()].map(r => ({ ...r })), workUnionMs, waitUnionMs: union,
      flags: { ...flags }, counters: { ...counters }, dropped, overflow: { ...overflow }, resourceCapture, latestRun: latestRun && { ...latestRun }, clock: { timeOrigin: globalThis.performance?.timeOrigin ?? null, now: end },
      resources: capturedResources.slice(0, 64).map(r => ({ name: r.name, start: r.startTime, duration: r.duration, responseEnd: r.responseEnd, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize })),
      notes: { work: 'Synchronous elapsed JS slices; exclusive/union avoid nested double counting, not OS CPU.', imports: 'Async import includes I/O, parse/evaluate and scheduling; ResourceTiming is separate evidence, never pure parse time.', worker: 'Worker-reported work overlaps main thread; wait unions overlap other categories and cannot be added to wall.' } };
  }
  return { enabled, mark, work, startWork, windowStart, awaited, steps, flag, worker, request, control, count, geometry, report, get firstControl () { return marks['first.control'] || null; }, get firstReport () { return firstSnapshot; } };
}
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('startuptrace');
export const STARTUP = createStartupTrace({ enabled });
if (enabled && typeof window !== 'undefined') window.__startupTrace = STARTUP;
