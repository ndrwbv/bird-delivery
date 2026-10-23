/* «Мягкие края» (fxaa.js, dynres.js) — цена прохода (23.10.2026). В npm run check не входит.
   Запуск («Дека»): npm run probe -- --eval=tools/probe-checks/fxaa.js --cpu=3 --size=deck --seed=7 --q="gfxdev=deck&dyn=0" --max=0 --timeout=400
   (телефон: --cpu=4 --size=phone-land --q="dyn=0"; без MSAA: &aa=0). Мир стоит, кадр рисуется руками, два вида (у машины и вдаль):
   pass:* — таймер видеокарты только вокруг прохода (кадр сцены перед этим дорисован — readPixels: плиточная видеокарта Apple
   иначе рисует сцену внутри прохода, и замер врёт в разы), режимы none — пустой замер / copy — копия кадра + простая растяжка /
   fxaa — копия + сглаживание; frame:* — таймер вокруг всего кадра (сцена + проход), none / fxaa вперемешку (шумит сильнее:
   частота видеокарты); cpu — мс процессора на сам проход (DYNRES.post). --q=pc=200 — кадров на режим.
   Кадры «было / стало»: __dlv.DYNRES.edge = false / true, renderer.render + DYNRES.post, холст — toDataURL в том же кадре
   (снимок окна в probe растягивает кадр мягко, а у игрока — крупным пикселем). */
const Q = new URLSearchParams(location.search), N = +(Q.get('pc') || 200);
const DY = d.DYNRES, R = d.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
await onShift(); autopilot(true); await run(6); autopilot(false);
d.S.paused = true; await wait(300);
const res = {}, cpu = {}, frame = () => new Promise(r => requestAnimationFrame(r));
const pend = [], PX = new Uint8Array(4);
const poll = () => { while (pend.length && gl.getQueryParameter(pend[0].q, gl.QUERY_RESULT_AVAILABLE)) { const p = pend.shift(); const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) res[p.m].push(ns / 1e6); gl.deleteQuery(p.q); } };
const set = m => { DY.edge = m !== 'none'; DY.edgePlain = m === 'copy'; };
const post = (k) => { const t = performance.now(); DY.post(); (cpu[k] = cpu[k] || []).push(performance.now() - t); };
const scene = async (tag) => {
  const PM = ['none', 'copy', 'fxaa'], FM = ['none', 'fxaa'];
  for (const m of PM) res[tag + ':pass:' + m] = [];
  for (const m of FM) res[tag + ':frame:' + m] = [];
  for (let i = 0; i < N * 3; i++) {
    const m = PM[i % 3]; await frame();
    R.render(d.scene, d.cam); set(m);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PX);
    const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); post(m); gl.endQuery(ext.TIME_ELAPSED_EXT);
    pend.push({ q, m: tag + ':pass:' + m }); poll();
  }
  for (let i = 0; i < N * 2; i++) {
    const m = FM[i % 2]; await frame(); set(m);
    const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); R.render(d.scene, d.cam); post('f' + m); gl.endQuery(ext.TIME_ELAPSED_EXT);
    pend.push({ q, m: tag + ':frame:' + m }); poll();
  }
  for (let i = 0; i < 20; i++) { await frame(); poll(); }
};
await scene('near');
const c = d.car.position, h = d.car.rotation.y;
d.cam.position.set(c.x - Math.sin(h) * 6, c.y + 7, c.z - Math.cos(h) * 6);
d.cam.lookAt(c.x + Math.sin(h) * 120, c.y + 2, c.z + Math.cos(h) * 120); d.cam.updateMatrixWorld();
await scene('far');
DY.edge = null; DY.edgePlain = false; d.S.paused = false;
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length, q = p => (n ? +s[Math.min(n - 1, Math.floor(p * n))].toFixed(3) : 0); return { n, p50: q(0.5), p90: q(0.9), mean: n ? +(a.reduce((x, y) => x + y, 0) / n).toFixed(3) : 0 }; };
return { size: [gl.drawingBufferWidth, gl.drawingBufferHeight], aa: gl.getContextAttributes().antialias, gpu: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, st(v)])), cpu: Object.fromEntries(Object.entries(cpu).map(([k, v]) => [k, st(v)])) };
