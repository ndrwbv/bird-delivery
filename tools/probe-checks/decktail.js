/* Хвост кадров на «Деке» по тяжёлым местам (18.10.2026, docs/AGENTS.md «Дека: хвост по местам»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/decktail.js --cpu=3 --size=deck --q=gfxdev=deck --max=0 --timeout=900
   (--q=gfxdev=deck — графика «средняя», как на Деке; без него — «высокая» компьютера; --mode=steam — сборка Стима).
   Смена на автопилоте, сцены по очереди (--q=dtsecs=40 — секунд на сцену; dtonly=center,ny — только эти):
     center — работаешь в Центре днём; east — Восток; old — Старый город (дворы-лабиринт); night — Центр ночью;
     ny — зима + Новый год ночью; hw — осень + Хэллоуин вечером; snow — снегопад днём; cab — вид из-за руля; near — сзади близко.
   Ответ по сценам: js — код кадра (p50/p95/p99/max, доля > 25 и > 33 мс), gap — промежутки между кадрами (с шумом машины),
   calls / tris — вызовов и треугольников, rd — отрисовка в среднем; long — кадры > 25 мс: мс, отрисовка, шаги CL.step > 1 мс,
   сборки шейдеров, загрузки текстур и буферов; «нет» — ни шагов, ни отрисовки (сборщик мусора или пауза машины).
   tune — облегчение тяжёлого кадра (tune.js): доля кадров с облегчением. Без звука (probe глушит). */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('dtsecs') || 40);
const ONLY = Q.get('dtonly') ? Q.get('dtonly').split(',') : null;
if (Q.get('tunepin') !== null && d.TUNE) d.TUNE.pin = +Q.get('tunepin');   // --q=tunepin=1 — облегчение всё время (0 — никогда), сравнить вид и цену
if (Q.has('notune') && d.TUNE) d.TUNE.off = true;
if (d.DYNRES) d.DYNRES.timing = true;                                         // таймер видеокарты и без «мыла» (сборки до 18.10)
if (d.DIST && d.DIST.unlockAll) d.DIST.unlockAll();
const goDist = async i => { if (d.DIST && d.DIST.set) d.DIST.set(i); d.startRun(false); await wait(400); if (d.S.state === 'brief') { d.acceptOrder(); await until(x => x.S.state === 'drive', 4000); } autopilot(true); };
await goDist(3); await wait(3000);

const R = d.renderer, gl = R.getContext();
const newF = () => ({ st: {}, link: 0, linkMs: 0, tex: 0, texMs: 0, buf: 0, bufMs: 0, rd: 0, calls: 0, tris: 0 });
let F = newF();
const LINKED = [];
const PF = d.crashlog.PROF;
const SUM = {};
PF.fn = (n, ms) => { if (ms > 0.3) F.st[n] = (F.st[n] || 0) + ms; if (!/:tp|warm|restart/.test(SC)) { const s = SUM[n] || (SUM[n] = [0, 0, 0]); s[0] += ms; if (ms > s[1]) s[1] = ms; if (ms > 4) s[2]++; } };
const wrap = (o, k, tag) => { const f = o[k]; if (!f) return () => {}; o[k] = function () { const t = performance.now(); const r = f.apply(this, arguments); const ms = performance.now() - t; F[tag]++; F[tag + 'Ms'] += ms; return r; }; return () => { o[k] = f; }; };
let curO = null, curM = null;
const rbd = R.renderBufferDirect;
R.renderBufferDirect = function (c, s, g, m, o, gr) { curO = o; curM = m; return rbd.call(this, c, s, g, m, o, gr); };
const whoIs = () => { const o = curO, m = curM || {}; if (!o) return '?'; const ch = []; for (let q = o; q && q !== d.scene && ch.length < 6; q = q.parent) ch.push((q.name || q.type) + (q.userData && Object.keys(q.userData).length ? '{' + Object.keys(q.userData).slice(0, 5).join('/') + '}' : ''));
  let key = ''; try { key = m.customProgramCacheKey ? String(m.customProgramCacheKey()).slice(0, 40) : ''; } catch (e) { /* — */ }
  return ch.reverse().join('>') + ' ' + m.type + (m.name ? ' «' + m.name + '»' : '') + (m.transparent ? ' прозр' : '') + (m.map ? ' map' : '') + (m.vertexColors ? ' vc' : '') + (o.isInstancedMesh ? ' inst' : '') + (o.isSkinnedMesh ? ' skin' : '') + (o.geometry ? ' ' + o.geometry.type : '') + (key ? ' key:' + key : '') + (m.fog === false ? ' nofog' : ''); };
const lp = gl.linkProgram;
gl.linkProgram = function (p) { LINKED.push([SC, whoIs()]); return lp.call(this, p); };
const un = [wrap(gl, 'linkProgram', 'link'), () => { gl.linkProgram = lp; }, wrap(gl, 'texImage2D', 'tex'), wrap(gl, 'texSubImage2D', 'tex'), wrap(gl, 'bufferData', 'buf'), wrap(gl, 'bufferSubData', 'buf')];
const r0 = R.render;
R.render = function (s, c) { const t = performance.now(); r0.call(R, s, c); F.rd += performance.now() - t; if (s === d.scene) { F.calls += R.info.render.calls; F.tris += R.info.render.triangles; } };
const raf = window.requestAnimationFrame;
let acc = 0, lastT = -1, lastW = -1, SC = 'warm', gpuN = 0;
const OUT = {}, LONG = [];
const TU = () => (d.TUNE ? d.TUNE.ST : null);
const push = (js, f, gap) => {
  if (!f.rd) return;
  const o = OUT[SC] || (OUT[SC] = { js: [], gap: [], gpu: [], calls: 0, tris: 0, rd: 0, links: 0, n: 0, tuned: 0 });
  const G = d.DYNRES && d.DYNRES.STATS.gpu; if (G && G.length !== gpuN) { if (G.length > gpuN) for (let i = gpuN; i < G.length; i++) o.gpu.push(G[i]); gpuN = G.length; }
  o.js.push(js); if (gap > 0) o.gap.push(gap); o.calls += f.calls; o.tris += f.tris; o.rd += f.rd; o.links += f.link; o.n++;
  const tu = TU(); if (tu && tu.k > 0.02) o.tuned++;
  if (js > 25) {
    const st = Object.entries(f.st).filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0] + ' ' + e[1].toFixed(1));
    const sum = Object.values(f.st).reduce((a, b) => a + b, 0);
    LONG.push({ sc: SC, ms: +js.toFixed(1), rd: +f.rd.toFixed(1), steps: +sum.toFixed(1), st, link: f.link ? [f.link, +f.linkMs.toFixed(1)] : 0,
      tex: f.tex ? [f.tex, +f.texMs.toFixed(1)] : 0, buf: f.buf ? [f.buf, +f.bufMs.toFixed(1)] : 0 });
  }
};
const A = function __frameA (cb, t) { cb(t); }, B = function __frameB (cb, t) { cb(t); };
let odd = 0;
window.requestAnimationFrame = cb => raf(t => {
  if (t !== lastT) { const now = performance.now(); if (lastT >= 0) push(acc, F, lastW >= 0 ? now - lastW : 0); lastW = now; F = newF(); acc = 0; lastT = t; odd ^= 1; }
  const s = performance.now(); (odd ? A : B)(cb, t); acc += performance.now() - s;
});

const NIGHT = d.ECON.tOfHour(22.5), DAY = d.ECON.tOfHour(12);
const cam = m => { try { d.CAMV && d.CAMV.set(m); } catch (e) { /* — */ } };
const wx = w => { try { d.weather.force(null); d.weather.set(w); } catch (e) { /* — */ } };
const SCENES0 = [
  ['center', async () => { d.ENV.t = DAY; }],
  ['east', async () => { await goDist(5); d.ENV.t = DAY; }],
  ['old', async () => { await goDist(4); d.ENV.t = DAY; }],
  ['night', async () => { await goDist(3); d.ENV.t = NIGHT; }],
  ['ny', async () => { d.season.set(2.45); d.HOL.start('newyear'); d.ENV.t = NIGHT; }],
  ['hw', async () => { d.HOL.stop(); d.season.set(1.7); d.HOL.start('halloween'); d.ENV.t = d.ECON.tOfHour(20); }],
  ['snow', async () => { d.HOL.stop(); d.season.set(2.3); d.ENV.t = DAY; wx('snowy'); }],
  ['cab', async () => { d.season.set(0.5); wx('clear'); d.ENV.t = DAY; cam('cab'); }],
  ['near', async () => { cam('near'); }],
];
/* --q=dtorder=cab,near,night — свой порядок сцен (по умолчанию — как в списке) */
const SCENES = Q.get('dtorder') ? Q.get('dtorder').split(',').map(n => SCENES0.find(s => s[0] === n)).filter(Boolean) : SCENES0;
const keep = setInterval(() => { try { d.S.hp = d.S.hpMax || d.S.hp; } catch (e) { /* — */ } }, 500);
const t0 = performance.now();
for (const [name, fn] of SCENES) {
  if (ONLY && !ONLY.includes(name)) continue;
  if (d.S.state === 'over' || d.S.state === 'title') { SC = 'restart'; await onShift(); autopilot(true); await wait(1500); }
  SC = name + ':tp';
  try { await fn(); } catch (e) { log({ sc: name, err: String(e && e.message || e).slice(0, 100) }); }
  await wait(2500); SC = name;
  const te = performance.now() + SECS * 1000;
  while (performance.now() < te) {
    await wait(1000);
    if (d.S.state === 'over' || d.S.state === 'title') { SC = 'restart'; await onShift(); autopilot(true); await wait(1500); SC = name; }
  }
}
cam('high');
clearInterval(keep);
PF.fn = null; R.render = r0; R.renderBufferDirect = rbd; window.requestAnimationFrame = raf; for (const u of un) u();
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length, q = p => (n ? +s[Math.min(n - 1, Math.floor(p * n))].toFixed(1) : 0);
  return { n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: n ? +s[n - 1].toFixed(1) : 0,
    'o25%': n ? +(100 * a.filter(v => v > 25).length / n).toFixed(2) : 0, 'o33%': n ? +(100 * a.filter(v => v > 33).length / n).toFixed(2) : 0 }; };
const ok = e => !/:tp|warm|restart/.test(e[0]);
const all = [].concat(...Object.entries(OUT).filter(ok).map(e => e[1].js));
const sc = {};
for (const [k, o] of Object.entries(OUT)) if (ok([k])) { const g = st(o.gap); sc[k] = { ...st(o.js), gap95: g.p95, gap99: g.p99, 'gap33%': g['o33%'], gpu50: st(o.gpu).p50, gpu95: st(o.gpu).p95, calls: Math.round(o.calls / (o.n || 1)), ktris: Math.round(o.tris / (o.n || 1) / 1000), rd: +(o.rd / (o.n || 1)).toFixed(2), links: o.links, tuned: o.n ? +(100 * o.tuned / o.n).toFixed(0) : 0 }; }
const who = {}; for (const L of LONG) if (ok([L.sc])) { if (!L.st.length && L.rd < 15) { const w = who['(нет: сборщик/пауза)'] || (who['(нет: сборщик/пауза)'] = [0, 0]); w[0]++; w[1] += L.ms; } for (const s of L.st) { const k = s.split(' ')[0]; const w = who[k] || (who[k] = [0, 0]); w[0]++; w[1] += +s.split(' ')[1]; } }
return { secs: +((performance.now() - t0) / 1000).toFixed(0), win: [Math.round(t0), Math.round(performance.now())], gfx: d.GFX.preset, dev: d.GFX.dev,
  all: st(all), sc,
  steps: Object.entries(SUM).map(([k, v]) => [k, +(v[0] / (all.length || 1)).toFixed(3), +v[1].toFixed(1), v[2]]).sort((a, b) => b[1] - a[1]).slice(0, 20),
  who: Object.entries(who).map(([k, v]) => [k, v[0], +v[1].toFixed(0)]).sort((a, b) => b[2] - a[2]).slice(0, 15),
  linked: LINKED.filter(ok), long: LONG.filter(L => ok([L.sc])).sort((a, b) => b.ms - a.ms).slice(0, 25),
  cullq: d.CULLQ ? { lvl: d.CULLQ.lvl, k: +d.CULLQ.k.toFixed(2), sw: d.CULL.switches || 0 } : null, tune: d.TUNE ? d.TUNE.summary() : null, crash: d.crashlog.count() };
