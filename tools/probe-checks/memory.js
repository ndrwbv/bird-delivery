/* Память: меню → город достроен → 60 с смены (docs/AGENTS.md «Память на телефоне»).
   npm run probe -- --eval=tools/probe-checks/memory.js --mem --early --size=phone --max=0 --timeout=300
   --q=msecs=60 — секунд смены; --q=msnap=1 — ещё снимки кучи (нужен --heapsnap=папка); --q=mlate=1 — по кускам поздней сборки.
   Ответ: menu / built / shift — heap (куча JS, МБ), gl (видео, МБ: buf, tex, rb, fb, total), glJs (копии буферов в JS),
   proc (память процессов Электрона); late — самые «тяжёлые» куски поздней сборки [кусок, +видео МБ, +куча МБ]. */
const q = new URLSearchParams(location.search);
const SECS = +(q.get('msecs') || 60), SNAP = q.has('msnap');
const out = {};
const extra = () => ({
  pool: d.HPOOL ? d.HPOOL.snap().left : null,
  faces: d.FACE ? d.FACE.size() : null,
  topTex: window.__glmem ? window.__glmem.top(8) : null,
  gfx: d.GFX ? d.GFX.dev + ':' + d.GFX.preset : null,
  mobile: window.__mobile ? window.__mobile.on : null, canvasFreed: window.__mobile ? +(window.__mobile.STATS.freed / 1048576).toFixed(1) : null,
});
out.menu = { ...(await mem('menu')), ...extra() };
if (SNAP) await heapSnap('menu');
await until(() => window.__boot && window.__boot.full, 120000);
await wait(500);
out.built = { ...(await mem('built')), ...extra(), bootFull: window.__boot.full };
if (SNAP) await heapSnap('built');
const L = memLate();
if (L) {
  out.lateTopGl = L.slice().sort((a, b) => b[1] - a[1]).slice(0, 14);
  out.lateTopHeap = L.slice().sort((a, b) => b[2] - a[2]).slice(0, 14);
  out.lateGlSum = +L.reduce((s, x) => s + x[1], 0).toFixed(1);
  if (q.has('mlate')) out.late = L;
}
await onShift(); autopilot(true);
await run(SECS, 1);
autopilot(false);
out.shift = { ...(await mem('shift')), ...extra(), delivered: d.S.delivered || 0 };
if (SNAP) await heapSnap('shift');
return out;
