/* Шейдеры, текстуры и сохранение на ходу (10.10.2026). В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/shaders.js --cpu=3 --size=deck --max=0 --timeout=600
   (имена функций в «откуда» — со сборкой без сжатия: npx vite build --mode web --minify false --outDir папка,
   потом --dir=папка). --q=shsecs=5 — секунд на этап (5 по умолчанию), --q=shonly=night,rain — только эти этапы.
   Смена на автопилоте, по очереди: день, ночь, дождь, гроза, жара, золотой час, снег, ураган, нитро, бист,
   взрыв, машина горит, авария, погоня, вор, фестивали, протест, мафия, налёт, пиццерия-шар вблизи, катсцена,
   повтор, другие концы города. На каждом этапе — что собралось впервые:
   - links — новые программы шейдеров (gl.linkProgram): что рисовалось (кто, материал), откуда создан материал;
   - кадры, в которых это было, — сколько мс шёл JS кадра (ms) и сколько из них ждали видеокарту (wait);
   - tex — новые текстуры (THREE.Texture создана в смене; холст — canvas), загрузки в видеокарту (up, мс);
   - mats — материалы, созданные в смене (по месту создания, сколько штук);
   - store — записи сохранения (localStorage.setItem / Store.set): ключ, сколько раз, мс;
   - programs — renderer.info.programs (сколько программ живо), textures — renderer.info.memory.textures. */
const Q = new URLSearchParams(location.search), SECS = +(Q.get('shsecs') || 5), ONLY = (Q.get('shonly') || '').split(',').filter(Boolean);
const R = d.renderer, gl = R.getContext(), THREE = d.THREE;
let OVER = 0, HOOK = false, PH = 'загрузка', curO = null, curM = null, inCompile = false;
const short = s => (s || '').split('\n').slice(3, 9).map(x => x.trim().replace(/^at /, '').replace(/\s*\(?[^\s(]*\/assets\//, ' ').replace(/\)$/, '').replace(/:\d+$/, '')).filter(x => !/^(new |Object\.set|set uuid)/.test(x)).slice(0, 4).join(' < ');
const stk = () => short(new Error().stack);
/* где создан материал / текстура: ловим this.uuid = … в конструкторе */
const BORN = new WeakMap(), MATS = new Map(), TEXS = [];
for (const [C, kind] of [[THREE.Material, 'mat'], [THREE.Texture, 'tex']]) {
  Object.defineProperty(C.prototype, 'uuid', { configurable: true, get () { return undefined; }, set (v) {
    Object.defineProperty(this, 'uuid', { value: v, writable: true, enumerable: true, configurable: true });
    if (!HOOK) return;
    const s = stk(); BORN.set(this, PH + ': ' + s);
    if (kind === 'mat') { const k = this.type + ' ← ' + s, o = MATS.get(k) || { n: 0, ph: PH }; o.n++; MATS.set(k, o); }
    else TEXS.push({ ph: PH, s, ref: new WeakRef(this) });
  } });
}
/* кто рисуется: renderBufferDirect (renderObject) и compile */
const rbd = R.renderBufferDirect;
R.renderBufferDirect = function (c, s, g, m, o, gr) { curO = o; curM = m; return rbd.call(this, c, s, g, m, o, gr); };
const cmp = R.compile;
R.compile = function (...a) { inCompile = true; curO = curM = null; try { return cmp.apply(this, a); } finally { inCompile = false; } };
const OWN = () => [['машина игрока', [d.car]], ['поток', (d.TRAFFIC || []).map(t => t.mesh)], ['люди', (d.PEOPLE || []).map(p => p.grp)],
  ['прохожие', (d.PEDS || []).map(p => p.grp)], ['самокаты', (d.SCOOTS || []).map(p => p.grp || p.mesh)], ['конкуренты', (d.RIVALS || []).map(r => r.mesh || r.car)]];
const who = o => {
  if (!o) return inCompile ? 'renderer.compile' : '?';
  let top = o, path = [];
  while (top.parent && top.parent !== d.scene && top.parent.type !== 'Scene') { if (top.name) path.push(top.name); top = top.parent; }
  if (top.name) path.push(top.name);
  const sc = top.parent && top.parent !== d.scene ? 'другая сцена ' : '';
  let own = '';
  for (const [k, L] of OWN()) if (L.includes(top)) { own = k; break; }
  const m = curM || {}, ud = Object.keys(top.userData || {}).slice(0, 4).join('/');
  return sc + (own || (path.reverse().join('>') || top.type)) + (ud ? ' {' + ud + '}' : '') + ' · ' + o.type + (o.isInstancedMesh ? '(inst)' : '') + ' ' +
    m.type + (m.name ? '«' + m.name + '»' : '') + (m.transparent ? ' прозр' : '') + (m.side === 2 ? ' 2стор' : m.side === 1 ? ' обр' : '') + (m.map ? ' map' : '') +
    (m.vertexColors ? ' vc' : '') + (m.defines && Object.keys(m.defines).length ? ' def:' + Object.keys(m.defines).join('/') : '') + (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? ' obc' : '') +
    (m.color ? ' #' + m.color.getHexString() : '') + (BORN.has(m) ? ' — создан ' + BORN.get(m) : '');
};
/* программы: linkProgram, ожидание (getProgramParameter), загрузки текстур */
const LINKS = [], GLP = new Map();
let F = { links: 0, wait: 0, up: 0, upMs: 0, ls: 0 };
const lp = gl.linkProgram.bind(gl);
gl.linkProgram = p => { const t = performance.now(); lp(p); F.wait += performance.now() - t; F.links++; if (HOOK) { const L = { ph: PH, who: who(curO), p }; LINKS.push(L); GLP.set(p, L); } };
const WAITS = [];
for (const k of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog']) {
  const f = gl[k].bind(gl); gl[k] = (...a) => { const t = performance.now(), r = f(...a), ms = performance.now() - t; F.wait += ms;
    if (HOOK && ms > 1) WAITS.push({ ph: PH, ms: +ms.toFixed(1), k, who: who(curO), p: SH2P.get(a[0]) || a[0] }); return r; };
}
const SH2P = new Map(), att = gl.attachShader.bind(gl);
gl.attachShader = (p, sh) => { SH2P.set(sh, p); att(p, sh); };
const UPS = new Map();
for (const k of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texStorage2D']) {
  const f = gl[k].bind(gl);
  gl[k] = (...a) => { const t = performance.now(), r = f(...a), ms = performance.now() - t; F.up++; F.upMs += ms;
    if (HOOK) { const src = a.find(x => x && typeof x === 'object' && 'width' in x && !ArrayBuffer.isView(x)); const kk = PH + ' ' + k + (src ? ' ' + (src.constructor && src.constructor.name) + ' ' + src.width + '×' + src.height : ''); const o = UPS.get(kk) || { n: 0, ms: 0 }; o.n++; o.ms += ms; UPS.set(kk, o); }
    return r; };
}
/* сохранение: localStorage и Store.set */
const LS = new Map();
const lset = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) { const t = performance.now(); lset.call(this, k, v); const ms = performance.now() - t; F.ls += ms;
  if (HOOK) { const o = LS.get(k) || { n: 0, ms: 0, kb: 0, ph: {}, at: stk() }; o.n++; o.ms += ms; o.kb = +(String(v).length / 1024).toFixed(1); o.ph[PH] = (o.ph[PH] || 0) + 1; LS.set(k, o); } };
const SSET = new Map();
if (d.Store && d.Store.set) { const s0 = d.Store.set; d.Store.set = function (k, v) { if (HOOK) { const o = SSET.get(k) || { n: 0, ph: {} }; o.n++; o.ph[PH] = (o.ph[PH] || 0) + 1; SSET.set(k, o); } return s0.apply(this, arguments); }; }
/* холсты, созданные в смене */
const CV = new Map(), ce = document.createElement;
document.createElement = function (tag, o) { const el = ce.call(this, tag, o); if (HOOK && String(tag).toLowerCase() === 'canvas') { const k = PH + ' ← ' + stk(); CV.set(k, (CV.get(k) || 0) + 1); } return el; };
/* кадры: JS кадра (все колбэки rAF), в каких — программы */
const raf = window.requestAnimationFrame, LONG = [], PHS = {}, GAPS = [];
let acc = 0, lastT = -1, lastW = -1;
const endFrame = () => {
  const p = PHS[PH] || (PHS[PH] = { frames: 0, js: [], links: 0, wait: 0, up: 0, upMs: 0, ls: 0 });
  p.frames++; p.js.push(acc); p.links += F.links; p.wait += F.wait; p.up += F.up; p.upMs += F.upMs; p.ls += F.ls;
  if (HOOK && (F.links || acc > 50)) LONG.push({ ph: PH, ms: +acc.toFixed(1), links: F.links, wait: +F.wait.toFixed(1), up: F.up, upMs: +F.upMs.toFixed(1) });
  F = { links: 0, wait: 0, up: 0, upMs: 0, ls: 0 };
};
window.requestAnimationFrame = cb => raf(t => { if (t !== lastT) { const now = performance.now(); if (lastT >= 0) { endFrame(); if (HOOK && lastW >= 0 && now - lastW > 50) GAPS.push({ ph: PH, ms: +(now - lastW).toFixed(1) }); } lastW = now; acc = 0; lastT = t; } const s = performance.now(); cb(t); acc += performance.now() - s; });
const progN = () => R.info.programs.length, texN = () => R.info.memory.textures;
const SNAP = {};
const NIGHT = d.ECON.tOfHour(22.5), DAY = d.ECON.tOfHour(11);
const phase = async (name, fn, secs = SECS) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  if (d.S.state === 'over' || d.S.state === 'title') { PH = 'новая смена'; await onShift(); autopilot(true); OVER++; }
  PH = name; const p0 = progN(), t0 = texN(), l0 = LINKS.length;
  let err = null;
  try { if (fn) { const r = await fn(); if (r === false) err = 'не запустилось'; } } catch (e) { err = String(e && e.message || e).slice(0, 120); }
  await wait(secs * 1000);
  SNAP[name] = { links: LINKS.length - l0, programs: progN() - p0, textures: texN() - t0, err };
};
const V = d.V, near = r => { const T = (d.TRAFFIC || []).filter(t => !t.parked && !t.wreck && !t.bus).sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z)); return T[r || 0]; };

const start = { programs: progN(), textures: texN(), geometries: R.info.memory.geometries, late: d.LATE ? d.LATE.left() : null };
HOOK = true;
await phase('старт смены', async () => { await onShift(); autopilot(true); }, 3);
await phase('смена', null, 6);
await phase('ночь', () => { d.ENV.t = NIGHT; });
await phase('утро', () => { d.ENV.t = DAY; });
await phase('дождь', () => { d.weather.set('rain'); d.ENV.rainWant = 1; d.ENV.rain = 1; });
await phase('гроза', () => { d.weather.set('storm'); d.weather.strike(60); setTimeout(() => d.weather.strike(30), 1500); });
await phase('жара', () => { d.weather.set('heat'); });
await phase('золотой', () => { d.weather.set('golden'); });
await phase('снег', () => { d.weather.set('snowy'); });
await phase('снег-ночь', () => { d.ENV.t = NIGHT; });
await phase('ураган', () => { d.ENV.t = DAY; d.weather.set('hurricane'); d.weather.hur.force(); });
await phase('ясно', () => { d.weather.set('clear'); d.ENV.rainWant = 0; d.ENV.rain = 0; });
await phase('нитро', () => { d.NOS.tank = 1; d.IN.nitro = 1; setTimeout(() => { d.IN.nitro = 0; }, 2500); });
await phase('бист', () => { d.FXS.beastT = 8; });
await phase('взрыв', () => { d.boom(V.x + Math.sin(V.h) * 12, V.z + Math.cos(V.h) * 12); });
await phase('горит', () => { const t = near(); if (!t) return false; d.wreckCar(t); });
await phase('кровь', () => { d.blood(V.x + 3, 1, V.z + 3, 20); d.sparks(V.x, 1, V.z, 20); });
await phase('удар', () => { d.dentCar && d.dentCar(0.5, 0, 1); d.S.shake = 1; });
await phase('авария', () => { d.spawnAccident(); });
await phase('погоня', () => { d.SBX.chase = 1; d.CHASE.next = 0; for (const t of d.TRAFFIC) if (d.chaseStart(t)) return true; return false; });
await phase('вор', () => { d.spawnThief(); });
for (const k of ['hookah', 'pumpkin', 'burger']) await phase('фест-' + k, () => { d.FEST.stop(); const i = d.FEST.start(k, 0); if (!i) return false; tp(i.outside[0], i.outside[1]); });
await phase('протест', () => { d.FEST.stop(); d.PROT.march(); d.PROT.riot(); d.PROT.gig(); const m = d.PROT.info.march; if (m) tp(m.x, m.z); });
await phase('мафия', () => { d.PROT.clear(); d.MAFIA.spawn(V.x + 25, V.z); });
await phase('налёт', () => d.RAID.start());
await phase('шар', () => { d.RAID.lose(); const D = d.PZD.DOMES[0]; if (!D) return false; tp(D.x + 18, D.z + 18); });
await phase('шар-ночь', () => { d.ENV.t = NIGHT; });
await phase('катсцена', async () => { d.ENV.t = DAY; const L = d.STORY.list(); const s = L && L[0]; if (!s) return false; await d.STORY.play(s.id || s, 0, { teleport: true }); }, 8);
await phase('повтор', () => { const ok = d.REPLAY.open(); setTimeout(() => d.REPLAY.close(), 4000); return ok; });
await phase('край-1', () => { tp(-1500, -1500); });
await phase('край-2', () => { tp(1500, 1500); });
await phase('край-3', () => { tp(-1500, 1500); });
HOOK = false;
autopilot(false);
window.requestAnimationFrame = raf;

const pr = new Map(R.info.programs.map(p => [p.program, p]));
const links = LINKS.map(L => { const p = pr.get(L.p); return { ph: L.ph, who: L.who, prog: p ? p.name + ' ' + (p.cacheKey.length > 60 ? '#' + p.cacheKey.length : p.cacheKey) : '(уже выгружена)' }; });
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? { p50: +s[n >> 1].toFixed(1), max: +s[n - 1].toFixed(1), o50: s.filter(v => v > 50).length } : null; };
const texs = {}; for (const T of TEXS) { const t = T.ref.deref(), k = T.ph + ' ' + (t && t.image && t.image.constructor ? t.image.constructor.name : t ? t.type : '?') + ' ← ' + T.s; texs[k] = (texs[k] || 0) + 1; }
return {
  start, end: { programs: progN(), textures: texN(), geometries: R.info.memory.geometries },
  phases: Object.fromEntries(Object.entries(SNAP).map(([k, v]) => [k, { ...v, js: st((PHS[k] || { js: [] }).js), wait: +((PHS[k] || {}).wait || 0).toFixed(1), up: (PHS[k] || {}).up, upMs: +((PHS[k] || {}).upMs || 0).toFixed(1) }])),
  links, long: LONG.sort((a, b) => b.ms - a.ms).slice(0, 25),
  mats: [...MATS].map(([k, v]) => [v.n, v.ph, k]).sort((a, b) => b[0] - a[0]).slice(0, 30),
  tex: Object.entries(texs).sort((a, b) => b[1] - a[1]).slice(0, 30),
  ups: [...UPS].map(([k, v]) => [k, v.n, +v.ms.toFixed(1)]).sort((a, b) => b[2] - a[2]).slice(0, 25),
  canvas: [...CV].sort((a, b) => b[1] - a[1]).slice(0, 20),
  ls: [...LS].map(([k, v]) => ({ k, n: v.n, ms: +v.ms.toFixed(1), kb: v.kb, ph: v.ph, at: v.at })).sort((a, b) => b.n - a.n).slice(0, 25),
  store: [...SSET].map(([k, v]) => [k, v.n, v.ph]).sort((a, b) => b[1] - a[1]).slice(0, 25),
  restarts: OVER, waits: WAITS.sort((a, b) => b.ms - a.ms).slice(0, 20).map(w => ({ ...w, prog: (pr.get(w.p) || {}).name, linked: GLP.has(w.p) ? GLP.get(w.p).ph : 'при загрузке', p: undefined })), gaps: GAPS.sort((a, b) => b.ms - a.ms).slice(0, 15), state: d.S.state, crash: d.crashlog.count(),
};
