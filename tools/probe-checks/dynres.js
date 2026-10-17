/* «Тяжёлый кадр» — мыло вместо рывка (dynres.js), замер до/после в одном запуске. В npm run check не входит.
   Запуск («Дека»): npm run probe -- --eval=tools/probe-checks/dynres.js --cpu=3 --size=deck --q="gfxdev=deck" --max=0 --timeout=400
   Сцены смены (каждая — дважды подряд: «мыло» выкл, потом вкл; --q=dynsecs=12 — секунд на прогон, scenes=drive,spin,boom,ny,load — какие):
   drive — автопилот; spin — машина стоит и крутится на месте (камера проходит по городу); boom — взрывы впереди раз в 1,2 с;
   ny — Новый год в полночь: салют залпами и петарды;
   load — искусственная нагрузка на видеокарту: невидимый слой на весь кадр с тяжёлой краской, приступами (loadon=2 с
   нагрузки, loadoff=3 с без неё; loadms=26 — сколько мс видеокарты на полном разрешении, подбирается в начале; loadn=700 — шагов краски напрямую, повторяемо). Видеокарта
   машины агентов (Apple M) по пикселям почти не тормозит — без такой нагрузки «мыло» на ней не включится ни разу.
   notimer=1 — вести себя, как будто таймера видеокарты нет (запасной путь: по промежуткам между кадрами).
   gpuk — кадр крупнее в gpuk раз по стороне (окно — больше); на Apple M время видеокарты от этого почти не растёт (02.10—17.10:
   ×1 → ×3 по стороне — 3,2 → 6,3 мс), «видеокарту Деки» так не изобразить.
   Ответ на прогон: кадр (промежутки между кадрами: p50/p99, доля > 25 мс), js — код кадра, gpu — время видеокарты на отрисовку
   сцены (p50/p95/max, доля > 15 мс), low — доля кадров на пониженном разрешении, downs — сколько раз спускались. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('dynsecs') || 12), GK = +(Q.get('gpuk') || 1);
const SC = (Q.get('scenes') || 'drive,spin,boom,ny,load').split(',');
const DY = d.DYNRES, V = d.V;
DY.noTimer = Q.get('notimer') === '1';
if (GK !== 1) { const it = d.GFX.ITEMS.find(i => i.id === 'px'); it.vals = it.vals.map(v => Math.round(v * GK)); d.GFX.set('px', d.GFX.opts.px); }
DY.timing = true;
await onShift(); autopilot(true); await wait(4000);
// JS кадра и промежутки — как в frametail.js
const raf = window.requestAnimationFrame; let acc = 0, lastT = -1, lastW = -1, js = [], ft = [];
window.requestAnimationFrame = cb => raf(t => {
  if (t !== lastT) { const now = performance.now(); if (lastT >= 0) { js.push(acc); if (lastW >= 0) ft.push(now - lastW); } lastW = now; acc = 0; lastT = t; }
  const s = performance.now(); cb(t); acc += performance.now() - s;
});
const st = (a, thr) => { const s = a.slice().sort((x, y) => x - y), n = s.length, q = p => (n ? +s[Math.min(n - 1, Math.floor(p * n))].toFixed(1) : 0);
  return { n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: n ? +s[n - 1].toFixed(1) : 0, ['o' + thr + '%']: n ? +(100 * a.filter(v => v > thr).length / n).toFixed(1) : 0 }; };
// нагрузка: треугольник на весь кадр, краска — цикл синусов, почти прозрачная (картинку не меняет)
let LOAD = null;
function mkLoad () {
  let geo = null, Mesh = null, SM = null, Attr = null;
  d.scene.traverse(o => {
    if (!Mesh && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && o.geometry.type === 'BufferGeometry') { Mesh = o.constructor; geo = o.geometry.constructor; Attr = o.geometry.attributes.position.constructor; }
    if (!SM && o.material && o.material.isShaderMaterial && o.material.type === 'ShaderMaterial') SM = o.material.constructor;
  });
  const g = new geo(); g.setAttribute('position', new Attr(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const m = new SM({ uniforms: { uN: { value: 100 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main () { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float uN; void main () { float a = 0.0; vec2 p = gl_FragCoord.xy; for (int i = 0; i < 8192; i++) { if (float(i) >= uN) break; a += sin(p.x * 0.011 + float(i) * 0.37) * cos(p.y * 0.013 + a * 0.1); } gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(abs(a) * 1e-7, 0.0, 0.001)); }' });
  const ms = new Mesh(g, m); ms.frustumCulled = false; ms.renderOrder = 9999; ms.visible = false; d.scene.add(ms);
  return ms;
}
const gpuNow = async (secs = 1.5) => { const s = DY.sink = []; await wait(secs * 1000); DY.sink = null; s.sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
let LOADN = 0;
if (SC.includes('load')) {
  LOAD = mkLoad(); DY.force = false;
  const base = await gpuNow(), want = +(Q.get('loadms') || 26);
  LOAD.visible = true; LOAD.material.uniforms.uN.value = 100; const at100 = await gpuNow();
  LOADN = Math.max(10, Math.round(100 * (want - base) / Math.max(0.5, at100 - base)));
  LOAD.material.uniforms.uN.value = LOADN; let got = await gpuNow();
  LOADN = Math.max(10, Math.round(LOADN * (want - base) / Math.max(0.5, got - base)));   // второй заход: видеокарта меняет частоту под нагрузкой
  LOAD.material.uniforms.uN.value = LOADN; got = await gpuNow(); LOAD.visible = false;
  if (+Q.get('loadn')) { LOADN = +Q.get('loadn'); LOAD.visible = true; LOAD.material.uniforms.uN.value = LOADN; got = await gpuNow(); LOAD.visible = false; }   // loadn — число шагов краски напрямую (повторяемо)
  log({ load: { base: +base.toFixed(1), at100: +at100.toFixed(1), n: LOADN, gpu: +got.toFixed(1) } });
}
const LON = +(Q.get('loadon') || 2), LOFF = +(Q.get('loadoff') || 3);
const TICK = {
  load: (i) => { const t = (i * 16 / 1000) % (LON + LOFF); LOAD.visible = t < LON; },
  drive: () => {},
  spin: () => { V.h += 0.035; },
  boom: (i) => { if (i % 75 === 0) d.boom(V.x + Math.sin(V.h) * 20, V.z + Math.cos(V.h) * 20, 5); },
  ny: (i) => { if (i % 40 === 0) d.HOL.boom(3); if (i % 120 === 0) d.ENV.t = 0.74; },
};
const out = {};
for (const sc of SC) {
  if (sc === 'ny') { d.HOL.start('newyear'); d.ENV.t = 0.74; }
  autopilot(sc !== 'spin');
  for (const mode of (Q.get('order') === 'onoff' ? [true, false] : [false, true])) {   // order=onoff — сначала вкл (проверка, не в порядке ли дело)
    DY.force = mode; DY.reset(); DY.STATS.cpuMax[0] = DY.STATS.cpuMax[1] = 0;
    await wait(1500);                             // разгон: прошлый прогон, ступень, салют набирается
    js = []; ft = []; const gpu = DY.sink = []; const f0 = DY.STATS.frames, l0 = DY.STATS.low, dn0 = DY.STATS.downs;
    let i = 0; const iv = setInterval(() => { i++; try { d.S.hp = d.S.hpMax || d.S.hp; TICK[sc](i); } catch (e) { /* — */ } }, 16);
    await wait(SECS * 1000);
    clearInterval(iv);
    DY.sink = null; const fr = DY.STATS.frames - f0;
    out[sc + (mode ? ':on' : ':off')] = { cpuMax: DY.STATS.cpuMax.slice(), frame: st(ft, 25), js: st(js, 16.7), gpu: st(gpu, 15), low: fr ? +((DY.STATS.low - l0) / fr).toFixed(2) : 0, downs: DY.STATS.downs - dn0, useless: DY.STATS.useless, state: d.S.state };
  }
  if (sc === 'ny') d.HOL.stop();
  if (sc === 'load') LOAD.visible = false;
}
window.requestAnimationFrame = raf; DY.force = null; DY.timing = false;
return { timer: DY.STATS.timer && !DY.noTimer, loadN: LOADN, budget: DY.budget, canvas: [d.renderer.domElement.width, d.renderer.domElement.height], gk: GK, out, crash: d.crashlog.count() };
