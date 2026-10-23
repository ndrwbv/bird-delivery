/* Хвост кадров на телефоне (18.10.2026, docs/AGENTS.md «Провалы на телефоне»). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/mobtail.js --size=phone-land --cpu=4 --max=0 --timeout=900
   Смена на автопилоте, сцены по очереди (--q=mtsecs=40 — секунд на сцену; --q=mtonly=d2,ny — только эти):
     d1 — свой район; d2…d4 — машину к пиццериям других районов (все районы открыты); night — ночь;
     ny — зима + Новый год, ночь; hw — осень + Хэллоуин; summer — лето днём.
   Ответ по сценам: js — код кадра на нарисованных кадрах (p50/p95/p99/max, доля > 33 и > 50 мс), calls / tris — вызовов и
   треугольников в кадре; long — самые долгие кадры: мс, отрисовка, шаги CL.step > 1 мс в этом кадре, сборки шейдеров
   (link, мс), загрузки текстур и буферов в видеокарту (мс), время со старта страницы (для --jsflags="--trace-gc":
   gc рядом — пауза сборщика). Без звука (probe глушит). */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('mtsecs') || 40);
const ONLY = Q.get('mtonly') ? Q.get('mtonly').split(',') : null;
if (d.DIST && d.DIST.unlockAll) d.DIST.unlockAll();
await onShift(); autopilot(true); await wait(3000);

const R = d.renderer, gl = R.getContext();
let F = null;                                       // текущий кадр: { st: {шаг: мс}, link, linkMs, tex, texMs, buf, bufMs, rd }
const newF = () => ({ st: {}, link: 0, linkMs: 0, chk: 0, chkMs: 0, tex: 0, texMs: 0, buf: 0, bufMs: 0, rd: 0, calls: 0, tris: 0 });
const LINKED = [];                                  // [сцена, WebGLProgram] — собранные посреди смены
F = newF();
const PF = d.crashlog.PROF;
const SUM = {};                                     // шаги мира за всё время (кроме прыжков): сумма, худший
PF.fn = (n, ms) => { if (ms > 0.3) F.st[n] = (F.st[n] || 0) + ms; if (!/:tp|warm|restart/.test(SC)) { const s = SUM[n] || (SUM[n] = [0, 0, 0]); s[0] += ms; if (ms > s[1]) s[1] = ms; if (ms > 4) s[2]++; } };
const wrap = (o, k, tag) => { const f = o[k]; if (!f) return () => {}; o[k] = function () { const t = performance.now(); const r = f.apply(this, arguments); const ms = performance.now() - t; F[tag]++; F[tag + 'Ms'] += ms; return r; }; return () => { o[k] = f; }; };
const lp = gl.linkProgram;
let curO = null, curM = null;                      // кто рисуется (для «что собралось»)
const rbd = R.renderBufferDirect;
R.renderBufferDirect = function (c, s, g, m, o, gr) { curO = o; curM = m; return rbd.call(this, c, s, g, m, o, gr); };
const whoIs = () => { const o = curO, m = curM || {}; if (!o) return '?'; let top = o; while (top.parent && top.parent !== d.scene) top = top.parent;
  return (top.name || top.type) + '>' + (o.name || o.type) + (o.isInstancedMesh ? '(inst)' : '') + ' ' + m.type + (m.transparent ? ' прозр' : '') + (m.map ? ' map' : '') + (m.vertexColors ? ' vc' : '') + (m.side === 2 ? ' 2стор' : '') + (m.alphaTest ? ' at' : '') + (m.userData && Object.keys(m.userData).length ? ' {' + Object.keys(m.userData).join('/') + '}' : ''); };
gl.linkProgram = function (p) { LINKED.push([SC, p, whoIs()]); return lp.call(this, p); };
const TEXK = {}, TEXW = {};                                    // загрузки текстур: сцена + размер → сколько раз
for (const k of ['texImage2D', 'texSubImage2D']) { const f = gl[k]; gl[k] = function (...a) { const src = a.find(x => x && typeof x === 'object' && 'width' in x && !ArrayBuffer.isView(x)); const kk = SC + ' ' + k.slice(3, 6) + ' ' + (src ? (src.constructor && src.constructor.name) + ' ' + src.width + '×' + src.height : a.length >= 9 ? a[4] + '×' + a[5] : '?'); if (!TEXK[kk]) TEXW[kk] = (new Error().stack || '').split('\n').slice(3, 7).map(x => x.trim().replace(/^at /, '').replace(/\s*\(?[^\s(]*\/assets\//, ' ').replace(/\)$/, '')).join(' < '); TEXK[kk] = (TEXK[kk] || 0) + 1; return f.apply(this, a); }; }
const un = [wrap(gl, 'linkProgram', 'link'), wrap(gl, 'getProgramParameter', 'chk'), () => { gl.linkProgram = lp; }, wrap(gl, 'texImage2D', 'tex'), wrap(gl, 'texSubImage2D', 'tex'),
  wrap(gl, 'bufferData', 'buf'), wrap(gl, 'bufferSubData', 'buf')];
const r0 = R.render;
R.render = function (s, c) { const t = performance.now(); r0.call(R, s, c); F.rd += performance.now() - t; if (s === d.scene) { F.calls += R.info.render.calls; F.tris += R.info.render.triangles; } };
const raf = window.requestAnimationFrame;
let acc = 0, lastT = -1, SC = 'warm';
const OUT = {}, LONG = [];
const push = (js, f, at) => {
  if (!f.rd) return;                                // кадр пропущен ограничением к/с — не в счёт
  const o = OUT[SC] || (OUT[SC] = { js: [], calls: 0, tris: 0, links: 0, n: 0 });
  o.js.push(js); o.calls += f.calls; o.tris += f.tris; o.links += f.link; o.n++;
  if (js > 33) {
    const st = Object.entries(f.st).filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0] + ' ' + e[1].toFixed(1));
    const sum = Object.values(f.st).reduce((a, b) => a + b, 0);
    LONG.push({ sc: SC, ms: +js.toFixed(1), rd: +f.rd.toFixed(1), steps: +sum.toFixed(1), st, link: f.link ? [f.link, +f.linkMs.toFixed(1)] : 0, chk: f.chk ? [f.chk, +f.chkMs.toFixed(1)] : 0,
      tex: f.tex ? [f.tex, +f.texMs.toFixed(1)] : 0, buf: f.buf ? [f.buf, +f.bufMs.toFixed(1)] : 0, at: Math.round(at) });
  }
};
const A = function __frameA (cb, t) { cb(t); }, B = function __frameB (cb, t) { cb(t); };
let odd = 0;
window.requestAnimationFrame = cb => raf(t => {
  if (t !== lastT) { if (lastT >= 0) push(acc, F, performance.now()); F = newF(); acc = 0; lastT = t; odd ^= 1; }
  const s = performance.now(); (odd ? A : B)(cb, t); acc += performance.now() - s;
});

const NIGHT = d.ECON.tOfHour(22.5), DAY = d.ECON.tOfHour(12);
const PZ = (d.PIZZERIAS || []).filter(Boolean).map(p => [p.x !== undefined ? p.x : p.pos ? p.pos.x : 0, p.z !== undefined ? p.z : p.pos ? p.pos.z : 0]);
const V = d.V;
const goPz = i => { const p = PZ[i % Math.max(1, PZ.length)]; if (p) tp(p[0] + 30, p[1] + 30); };
const SCENES = [
  ['d1', () => { d.ENV.t = DAY; }],
  ['d2', () => goPz(2)],
  ['d3', () => goPz(4)],
  ['d4', () => goPz(6)],
  ['night', () => { goPz(1); d.ENV.t = NIGHT; }],
  ['ny', () => { d.season.set(2.45); d.HOL.start('newyear'); d.ENV.t = NIGHT; goPz(0); }],
  ['hw', () => { d.HOL.stop(); d.season.set(1.7); d.HOL.start('halloween'); d.ENV.t = d.ECON.tOfHour(20); goPz(3); }],
  ['summer', () => { d.HOL.stop(); d.season.set(0.5); d.ENV.t = DAY; goPz(5); }],
];
const keep = setInterval(() => { try { d.S.hp = d.S.hpMax || d.S.hp; } catch (e) { /* — */ } }, 500);
const t0 = performance.now();
for (const [name, fn] of SCENES) {
  if (ONLY && !ONLY.includes(name)) continue;
  if (d.S.state === 'over' || d.S.state === 'title') { SC = 'restart'; await onShift(); autopilot(true); await wait(1500); }
  SC = name + ':tp';                                 // первые 2,5 с после прыжка — отдельно (прыжок камеры: всё рядом строится заново)
  setTimeout(() => { SC = name; }, 2500);
  try { fn(); } catch (e) { log({ sc: name, err: String(e && e.message || e).slice(0, 100) }); }
  const te = performance.now() + SECS * 1000;
  while (performance.now() < te) {
    await wait(1000);
    if (d.S.state === 'over' || d.S.state === 'title') { SC = 'restart'; await onShift(); autopilot(true); await wait(1500); SC = name; }
  }
}
clearInterval(keep);
PF.fn = null; R.render = r0; R.renderBufferDirect = rbd; window.requestAnimationFrame = raf; for (const u of un) u();
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length, q = p => (n ? +s[Math.min(n - 1, Math.floor(p * n))].toFixed(1) : 0);
  return { n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: n ? +s[n - 1].toFixed(1) : 0,
    'o33%': n ? +(100 * a.filter(v => v > 33).length / n).toFixed(2) : 0, o50: a.filter(v => v > 50).length }; };
const all = [].concat(...Object.entries(OUT).filter(e => !/:tp|warm|restart/.test(e[0])).map(e => e[1].js));
const PR = new Map(R.info.programs.map(p => [p.program, p]));
const linked = LINKED.map(([s, p, w]) => { const q = PR.get(p); return s + ' ' + w + ' ' + (q ? q.name + ' ' + (q.cacheKey.length > 80 ? '#' + q.cacheKey.length : q.cacheKey) : '(выгружена)'); });
const sc = {}; for (const [k, o] of Object.entries(OUT)) sc[k] = { ...st(o.js), calls: Math.round(o.calls / (o.n || 1)), ktris: Math.round(o.tris / (o.n || 1) / 1000), links: o.links };
// какие шаги чаще всего в долгих кадрах
const who = {}; for (const L of LONG) for (const s of L.st) { const k = s.split(' ')[0]; const w = who[k] || (who[k] = [0, 0]); w[0]++; w[1] += +s.split(' ')[1]; }
return { secs: +((performance.now() - t0) / 1000).toFixed(0), win: [Math.round(t0), Math.round(performance.now())], gfx: d.GFX.preset, dev: d.GFX.dev, dyn: d.GFX.dyn,
  mobile: !!(window.__mobile && window.__mobile.on), all: st(all), sc,
  tex: Object.entries(TEXK).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => [k, n, TEXW[k]]),
  steps: Object.entries(SUM).map(([k, v]) => [k, +(v[0] / (all.length || 1)).toFixed(3), +v[1].toFixed(1), v[2]]).sort((a, b) => b[1] - a[1]).slice(0, 25),
  who: Object.entries(who).map(([k, v]) => [k, v[0], +v[1].toFixed(0)]).sort((a, b) => b[2] - a[2]).slice(0, 15),
  linked, long: LONG.filter(L => !/:tp|warm|restart/.test(L.sc)).sort((a, b) => b.ms - a.ms).slice(0, 30), dynres: d.DYNRES && d.DYNRES.STATS ? { downs: d.DYNRES.STATS.downs, low: d.DYNRES.STATS.low, frames: d.DYNRES.STATS.frames, timer: d.DYNRES.STATS.timer } : null,
  longTp: LONG.filter(L => /:tp|restart/.test(L.sc)).sort((a, b) => b.ms - a.ms).slice(0, 8), crash: d.crashlog.count() };
