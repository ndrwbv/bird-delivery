/* Город шумит (М7, 09.10.2026): фоновые петли и редкие звуки по месту, времени суток и погоде.
   Правила словами и имена файлов — docs/SOUNDS.md «Город шумит».

   Петли (имя — файл public/sfx/имя.ogg; нет файла — синтез ниже):
     amb-city          гул города: тихо всегда, громче у проспекта и машин потока; ночью вдвое тише
     amb-birds         птицы днём: больше у парка и леса, утром — хор; в дождь и зимой почти нет
     amb-crickets      сверчки ночью летом (весной и осенью — реже), у зелени громче
     amb-wind          ветер: лёгкий фон, сильнее в дождь, зимой и в грозу
     amb-storm-wind    вой урагана (hurricane.js шлёт want() каждый кадр, сила — от порывов)
     amb-rain-roof     дождь по крыше машины, в ливень (гроза, ураган) — громче и ниже
     amb-crowd         гул толпы у фестиваля и протеста (марш, драка, концерт во дворе) — в мире
     amb-construction  стройка днём: стук молотка, иногда болгарка — в мире, у участков construction.js
   Редкие звуки (Snd.fx — как остальные): amb-dog (собака лает вдали, ночью; запасное — bark),
   amb-train (поезд проходит по рельсам, если рельсы рядом). Гром — weather.js, слева / справа по молнии.
   sfx-names: amb-city, amb-birds, amb-crickets, amb-wind, amb-storm-wind, amb-rain-roof, amb-crowd, amb-construction

   Петель звучит не больше AMB.MAX (самые громкие по месту), переходы — плавные (AMB.FADE). Громкость —
   ползунок «звуки» (шина sfxBus), ?mute глушит всё (общий регулятор Snd). Кадр: решения — 10 раз в
   секунду, место (зелень, машины, стройки) — 2 раза; зелень карты — сеткой 50 м, считается кусками.

     init(api)          — из game.js: { Snd, V, S, ENV, CITY, TRAFFIC, nearestRoad, inPoly, isPlaying, musicK }
                          musicK() — множитель фона, пока играет музыка (music.js: на 100 % — ×0,7)
     step(dt)           — каждый кадр (CL.step('ambience', …))
     want(name, v, p)   — внешняя петля на этот кадр: v 0…1, p — параметр синтеза (ураган: порыв)
     DEBUG              — __dlv.Snd.amb.DEBUG: playing(), ctx, STATS, force(name, v), render(name, s) */
import * as SFX from './sfx.js';
import * as SEAS from './seasons.js';
import * as WTH from './weather.js';
import * as FEST from './festivals.js';
import * as PROT from './protests.js';
import * as CONSTR from './construction.js';
import { isForest } from './forest.js';

export const AMB = {
  MAX: 4,               // петель звучит одновременно, не больше
  FADE: 0.5,            // с — постоянная перехода: до конца ~1,5 с
  TICK: 0.1, PLACE: 0.5,// с — решения и место
  CELL: 50,             // м — клетка зелени
  CROWD_FAR: { fest: 170, march: 150, riot: 120, gig: 120 },   // м — слышно до
  CONS_FAR: 120,        // стройку слышно до, м
  WORK: [0.042, 0.542], // стройка работает: доля суток ENV.t (0 — 6:00) — с 7:00 до 19:00
  DOG: [14, 40], DOG_R: [45, 130], DOG_FAR: 170,               // собака: раз в 14—40 с ночью, в 45—130 м
  TRAIN: [90, 200], TRAIN_R: 280, TRAIN_FAR: 320,             // поезд: раз в 90—200 с, рельсы ближе 280 м
  TITLE: 0.5,           // в главном меню фон вдвое тише (без звуков «в мире»)
};

/* петли: prio — кто главнее при отборе, spatial — звук из точки мира, file — множитель файла */
const DEF = {
  'amb-city':         { mk: synCity,     prio: 1,   file: 0.5 },
  'amb-birds':        { mk: synBirds,    prio: 1.1, file: 0.5 },
  'amb-crickets':     { mk: synCrickets, prio: 1.1, file: 0.4 },
  'amb-wind':         { mk: synWind,     prio: 0.8, file: 0.5 },
  'amb-storm-wind':   { mk: synHowl,     prio: 2,   file: 0.8 },
  'amb-rain-roof':    { mk: synRain,     prio: 1.6, file: 0.8 },
  'amb-crowd':        { mk: synCrowd,    prio: 1.4, file: 0.8, spatial: true },
  'amb-construction': { mk: synCons,     prio: 1.3, file: 0.8, spatial: true },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

let A = null;
const CH = {};                 // имя → { want, cur, set, g, p, src, off, at }
const EXT = {};                // имя → { v, p, t } — want() снаружи
const CTX = { green: 0, traffic: 0, wide: 0, cons: null, crowd: null, rail: null, railD: Infinity };
export const STATS = { started: {}, file: {}, oneshot: {}, ticks: 0, ms: 0, maxMs: 0, frames: 0, maxPlaying: 0 };
const T = { tick: 0, place: 0, dog: rnd(...AMB.DOG), train: rnd(...AMB.TRAIN), last: 0 };
let MODE = 0;                  // 0 — тихо, 1 — игра, AMB.TITLE — меню

export function init (api) {
  A = api;
  for (const k in DEF) CH[k] = { want: 0, cur: 0, set: -1, g: null, p: null, src: null, off: 0, at: null };
  // пауза, диалог, гараж, карта: шаги мира не идут — фон гаснет сам
  if (typeof setInterval === 'function') setInterval(watch, 300);
}

/* внешняя петля (ураган): держится, пока шлют каждый кадр */
export function want (name, v, p) {
  if (!DEF[name]) return;
  EXT[name] = { v: clamp(+v || 0, 0, 1), p, t: now() };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/* ─────────────── каждый кадр ─────────────── */
export function step (dt) {
  if (!A) return;
  const t0 = now();
  T.last = t0;
  const Snd = A.Snd;
  if (!Snd || !Snd.ctx || !Snd.sfxBus) return;
  greenWork();
  const ready = noiseWork(Snd.ctx);
  const S = A.S;
  MODE = !Snd.on ? 0 : S.state === 'title' ? AMB.TITLE : A.isPlaying() ? 1 : 0;
  if ((T.place -= dt) <= 0) { T.place = AMB.PLACE; place(); }
  if ((T.tick -= dt) <= 0) { T.tick = AMB.TICK; decide(ready); }
  // синтез со своим ритмом (птицы, стройка, толпа) и счётчик громкости
  const k = 1 - Math.exp(-dt / AMB.FADE);
  let playing = 0;
  for (const n in CH) {
    const ch = CH[n];
    if (!ch.src) continue;
    ch.cur += (ch.set - ch.cur) * k;
    if (ch.cur > 0.01) playing++;
    if (ch.src.tick) ch.src.tick(dt, ch.cur);
    // погасла — снять узлы
    if (ch.set <= 0 && ch.cur < 0.003) { if ((ch.off += dt) > 1) stopCh(ch); } else ch.off = 0;
  }
  STATS.maxPlaying = Math.max(STATS.maxPlaying, playing);
  if (MODE === 1) oneShots(dt);
  const ms = now() - t0;
  STATS.ms += ms; STATS.frames++; if (ms > STATS.maxMs) STATS.maxMs = ms;
}

/* сколько слышно: 0…1 для каждой петли */
function targets () {
  const E = A.ENV, w = {};
  const night = E.night || 0, day = 1 - night;
  const snowy = SEAS.snowy();
  const rain = snowy ? 0 : clamp(E.rain || 0, 0, 1);
  const id = WTH.id(), storm = id === 'storm' || id === 'hurricane';
  const b = WTH.bucket(), winter = b === 'winter' || snowy;
  const morning = E.t < 0.07 || E.t > 0.97 ? 1 : 0;   // 5:15—7:40 — утренний хор
  const tr = CTX.traffic, g = CTX.green;
  w['amb-city'] = (0.35 + 0.65 * tr) * (1 - 0.5 * night) * (1 - 0.35 * rain);
  w['amb-birds'] = day * day * (1 - rain) * (1 - rain) * (winter ? 0.2 : 1) * (0.25 + 0.75 * g) * (1 + 0.5 * morning) * (1 - 0.4 * tr);
  const bugs = { summer: 1, spring: 0.4, autumn: 0.5, winter: 0 }[b] || 0;
  w['amb-crickets'] = sstep(0.5, 0.9, night) * (1 - rain) * (snowy ? 0 : bugs) * (1 - SEAS.warmth()) * (0.35 + 0.65 * g);
  w['amb-wind'] = 0.18 + 0.2 * rain + (winter ? 0.2 : 0) + (storm ? 0.25 : 0) - 0.08 * tr;
  w['amb-rain-roof'] = rain * (storm ? 1 : 0.7);
  w['amb-storm-wind'] = 0;
  w['amb-crowd'] = 0; w['amb-construction'] = 0;
  if (MODE === 1) {
    if (CTX.crowd) w['amb-crowd'] = CTX.crowd.k * spot('amb-crowd', CTX.crowd);
    if (CTX.cons && E.t > AMB.WORK[0] && E.t < AMB.WORK[1]) w['amb-construction'] = (1 - 0.6 * rain) * spot('amb-construction', CTX.cons);
  }
  const t = now();
  for (const n in EXT) { const e = EXT[n]; if (t - e.t < 500) { w[n] = Math.max(w[n] || 0, e.v); if (CH[n].src && CH[n].src.set) CH[n].src.set(e.p); } }
  for (const n in FORCE) w[n] = FORCE[n];
  w['amb-wind'] *= 1 - clamp(w['amb-storm-wind'] * 1.5, 0, 1);   // воет ураган — простой ветер не нужен
  return w;
}
/* звук «в мире»: громкость от расстояния, сторона — на панораму петли */
function spot (n, at) {
  const sp = SFX.place(at);
  if (!sp || sp.g <= 0) return 0;
  CH[n].at = sp;
  return sp.g;
}

/* отобрать AMB.MAX самых слышных и плавно довести громкость */
function decide (ready) {
  STATS.ticks++;
  const w = targets(), c = A.Snd.ctx, tnow = c.currentTime;
  const order = Object.keys(DEF).map(n => [n, clamp(w[n] || 0, 0, 1) * MODE]).filter(q => q[1] > 0.02)
    .sort((a, b) => b[1] * DEF[b[0]].prio - a[1] * DEF[a[0]].prio).slice(0, AMB.MAX);
  const keep = new Set(order.map(q => q[0]));
  const mk = A.musicK ? clamp(+A.musicK() || 1, 0, 1) : 1;   // играет музыка — фон тише (music.js MUS.AMB)
  // гаснущая петля держит место, пока не стихла: новая вступает после — звучит не больше AMB.MAX
  let free = AMB.MAX;
  for (const n in CH) { const ch = CH[n]; if (ch.src && (keep.has(n) || ch.cur > 0.01)) free--; }
  for (const n in CH) {
    const ch = CH[n], v = keep.has(n) ? clamp(w[n], 0, 1) * MODE * mk : 0;
    ch.want = v;
    if (v > 0 && !ch.src) { if (free <= 0 || !(ready || SFX.buffer(n))) continue; free--; startCh(n, ch); }
    if (!ch.src) continue;
    // файл положили, пока звучал синтез, — перейти на файл
    if (ch.src.kind === 'synth' && v > 0 && SFX.buffer(n)) { stopCh(ch); startCh(n, ch); ch.set = -1; }
    if (Math.abs(v - ch.set) > 0.004) { ch.g.gain.setTargetAtTime(v, tnow, AMB.FADE); ch.set = v; }
    if (ch.p && ch.at) ch.p.pan.setTargetAtTime(ch.at.pan, tnow, 0.15);
  }
}

function startCh (n, ch) {
  const Snd = A.Snd, c = Snd.ctx, d = DEF[n];
  ch.g = c.createGain(); ch.g.gain.value = 0; ch.cur = 0; ch.set = 0; ch.off = 0;
  if (d.spatial && c.createStereoPanner) { ch.p = c.createStereoPanner(); ch.g.connect(ch.p); ch.p.connect(Snd.sfxBus); }
  else ch.g.connect(Snd.sfxBus);
  const buf = SFX.buffer(n);
  if (buf) {
    const s = c.createBufferSource(), fg = c.createGain();
    s.buffer = buf; s.loop = true; fg.gain.value = SFX.fileGain(n) * d.file;
    s.connect(fg); fg.connect(ch.g); s.start(0, Math.random() * buf.duration);
    ch.src = { kind: 'file', stop () { try { s.stop(); } catch (e) { /* — */ } s.disconnect(); fg.disconnect(); } };
    STATS.file[n] = (STATS.file[n] || 0) + 1;
  } else {
    ch.src = d.mk(c, ch.g, noise(c));
    ch.src.kind = 'synth';
  }
  STATS.started[n] = (STATS.started[n] || 0) + 1;
}
function stopCh (ch) {
  if (ch.src) ch.src.stop();
  try { ch.g.disconnect(); if (ch.p) ch.p.disconnect(); } catch (e) { /* — */ }
  ch.src = null; ch.g = null; ch.p = null; ch.cur = 0; ch.set = -1; ch.off = 0;
}

/* шаги мира не идут (пауза, диалог, гараж, карта) — всё в тишину */
function watch () {
  if (!A || !A.Snd || !A.Snd.ctx || now() - T.last < 400) return;
  const tnow = A.Snd.ctx.currentTime;
  for (const n in CH) {
    const ch = CH[n];
    if (ch.src && ch.set > 0) { ch.g.gain.setTargetAtTime(0, tnow, 0.25); ch.set = 0; }
  }
}

/* ─────────────── место: зелень, машины, стройки, толпа, рельсы ─────────────── */
function place () {
  const V = A.V, x = V.x, z = V.z;
  CTX.green = greenAt(x, z);
  let tr = 0;
  for (const t of A.TRAFFIC) {
    const dx = t.x - x, dz = t.z - z;
    if (dx > 90 || dx < -90 || dz > 90 || dz < -90) continue;
    tr += Math.max(0, 1 - Math.hypot(dx, dz) / 90);
  }
  const r = A.nearestRoad(x, z);
  CTX.wide = r && r.seg && r.d < 40 ? clamp(((r.seg.w || 0) - 8) / 10, 0, 1) : 0;
  CTX.traffic = clamp(tr / 3 + CTX.wide * 0.3, 0, 1);
  // стройка — ближайшая
  let best = null, bd = AMB.CONS_FAR;
  for (const s of CONSTR.sites()) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  CTX.cons = best ? { x: best.x, z: best.z, far: AMB.CONS_FAR, near: 12 } : null;
  // толпа — ближайшая из фестиваля и протеста
  const list = [];
  const f = FEST.where();
  if (f) list.push({ x: f.x, z: f.z, k: 1, kind: 'fest' });
  for (const q of PROT.crowds()) list.push(q);
  let cb = null, cd = Infinity;
  for (const q of list) { const far = AMB.CROWD_FAR[q.kind] || 120, d = Math.hypot(q.x - x, q.z - z); if (d < far && d / far < cd) { cd = d / far; cb = { x: q.x, z: q.z, k: q.k, far, near: 10, kind: q.kind }; } }
  CTX.crowd = cb;
  // рельсы — ближайшая точка (для поезда)
  if (RAIL.pts === null) railPts();
  let rb = null, rd = AMB.TRAIN_R;
  const P = RAIL.pts;
  for (let i = 0; i < P.length; i += 2) { const dx = P[i] - x, dz = P[i + 1] - z; if (dx > rd || dx < -rd || dz > rd || dz < -rd) continue; const d = Math.hypot(dx, dz); if (d < rd) { rd = d; rb = { x: P[i], z: P[i + 1] }; } }
  CTX.rail = rb; CTX.railD = rb ? rd : Infinity;
}

/* зелень: деревья карты и парки / лес / кладбища — сеткой 50 м, считается кусками (~1 500 проверок за кадр) */
const GREEN = { grid: new Map(), queue: null, done: false, cells: 0, ti: 0 };
const gk = (i, j) => i * 100003 + j;
function greenWork () {
  if (GREEN.done) return;
  const C = A.CITY, CS = AMB.CELL;
  const TR = C.trees || [];
  if (GREEN.ti < TR.length) {                       // деревья — по 4 000 за кадр
    const end = Math.min(TR.length, GREEN.ti + 4000);
    for (let i = GREEN.ti; i < end; i++) { const p = TR[i], k = gk(Math.floor(p[0] / CS), Math.floor(p[1] / CS)); GREEN.grid.set(k, (GREEN.grid.get(k) || 0) + 1); }
    GREEN.ti = end;
    return;
  }
  if (!GREEN.queue) {
    GREEN.queue = (C.green || []).filter(g => g.k === 'park' || g.k === 'cem' || isForest(g)).map(g => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      return { p: g.p, x0, x1, z0, z1, x: x0 + 12.5, z: z0 + 12.5 };
    });
    return;
  }
  let budget = 1500;
  while (budget > 0 && GREEN.queue.length) {
    const q = GREEN.queue[GREEN.queue.length - 1];
    budget -= q.p.length >> 2 || 1;
    if (A.inPoly(q.x, q.z, q.p)) { const k = gk(Math.floor(q.x / CS), Math.floor(q.z / CS)); GREEN.grid.set(k, (GREEN.grid.get(k) || 0) + 4); GREEN.cells++; }
    q.x += 25;
    if (q.x > q.x1) { q.x = q.x0 + 12.5; q.z += 25; if (q.z > q.z1) GREEN.queue.pop(); }
  }
  if (!GREEN.queue.length) GREEN.done = true;
}
function greenAt (x, z) {
  const CS = AMB.CELL, ci = Math.floor(x / CS), cj = Math.floor(z / CS);
  let s = 0;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) s += GREEN.grid.get(gk(i, j)) || 0;
  return clamp(s / 60, 0, 1);
}

const RAIL = { pts: null };
function railPts () {
  const out = [];
  for (const r of A.CITY.rails || []) {
    const p = r.p || [];
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 25));
      for (let k = 0; k < n; k++) out.push(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
    }
  }
  RAIL.pts = out;
}

/* ─────────────── редкие звуки ─────────────── */
function oneShots (dt) {
  const E = A.ENV, Snd = A.Snd, V = A.V;
  const rain = SEAS.snowy() ? 0 : E.rain || 0;
  if ((T.dog -= dt) <= 0) {
    T.dog = rnd(...AMB.DOG);
    STATS.dogTry = (STATS.dogTry || 0) + 1;
    if ((E.night || 0) > 0.6 && rain < 0.5) {
      const a = rnd(0, Math.PI * 2), d = rnd(...AMB.DOG_R);
      if (Snd.fx(['amb-dog', 'bark'], synDog, { x: V.x + Math.sin(a) * d, z: V.z + Math.cos(a) * d, far: AMB.DOG_FAR, near: 20 })) STATS.oneshot.dog = (STATS.oneshot.dog || 0) + 1;
    }
  }
  if ((T.train -= dt) <= 0) {
    T.train = rnd(...AMB.TRAIN);
    const r = CTX.rail;
    if (r && Snd.fx('amb-train', synTrain, { x: r.x, z: r.z, far: AMB.TRAIN_FAR, near: 30 })) STATS.oneshot.train = (STATS.oneshot.train || 0) + 1;
  }
}

/* ─────────────── синтез: шум с фильтрами, щелчки — дёшево ───────────────
   mk(c, out, N) → { stop(), tick?(dt, громкость), set?(p) }. N — общий белый и «бурый» шум (петли по 2—3 с) */
const NBS = new WeakMap();      // контекст → { white, brown }
/* шум для живого звука — кусками по ~20 000 отсчётов за кадр (на «Деке» разом — заметная заминка); готов — петли синтеза вступают */
const NP = { c: null, w: null, b: null, i: 0, lp: 0 };
function noiseWork (c) {
  if (NBS.has(c)) return true;
  if (NP.c !== c) { NP.c = c; NP.w = new Float32Array(c.sampleRate * 2); NP.b = new Float32Array(c.sampleRate * 3); NP.i = 0; NP.lp = 0; }
  const nw = NP.w.length, nb = NP.b.length, end = Math.min(nw + nb, NP.i + 20000);
  for (let i = NP.i; i < end; i++) {
    if (i < nw) NP.w[i] = Math.random() * 2 - 1;
    else { NP.lp += (Math.random() * 2 - 1 - NP.lp) * 0.12; NP.b[i - nw] = NP.lp * 3; }
  }
  NP.i = end;
  if (end < nw + nb) return false;
  NBS.set(c, bufs(c, NP.w, NP.b));
  NP.w = NP.b = null;
  return true;
}
function bufs (c, wa, ba) {
  const sr = c.sampleRate, m = ba.length, F = (sr * 0.05) | 0;
  for (let i = 0; i < F; i++) { const k = i / F; ba[m - F + i] = ba[m - F + i] * (1 - k) + ba[i] * k; }   // шов петли без щелчка
  const w = c.createBuffer(1, wa.length, sr), br = c.createBuffer(1, m, sr);
  w.getChannelData(0).set(wa); br.getChannelData(0).set(ba);
  return { white: w, brown: br };
}
/* сразу (проба громкости, редкий звук до готовности кусками) */
function noise (c) {
  let NB = NBS.get(c);
  if (NB) return NB;
  const sr = c.sampleRate, wa = new Float32Array(sr * 2), ba = new Float32Array(sr * 3);
  for (let i = 0; i < wa.length; i++) wa[i] = Math.random() * 2 - 1;
  let lp = 0;
  for (let i = 0; i < ba.length; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.12; ba[i] = lp * 3; }
  NB = bufs(c, wa, ba);
  NBS.set(c, NB);
  return NB;
}
function loopSrc (c, buf) {
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}
function filt (c, type, f, q) { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; return x; }
function gain (c, v) { const g = c.createGain(); g.gain.value = v; return g; }
function osc (c, type, f) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
/* снять всё: источники — stop, узлы — disconnect */
function kill (nodes) { for (const n of nodes) { try { if (n.stop) n.stop(); } catch (e) { /* — */ } try { n.disconnect(); } catch (e) { /* — */ } } }
/* короткий щелчок шума: when — время ctx, d — длина, f — полоса */
function burst (c, out, N, when, d, v, f, q = 1) {
  const s = c.createBufferSource(); s.buffer = N.white;
  const b = filt(c, 'bandpass', f, q), g = gain(c, 0);
  g.gain.setValueAtTime(v, when); g.gain.exponentialRampToValueAtTime(0.0001, when + d);
  s.connect(b); b.connect(g); g.connect(out);
  s.start(when, Math.random() * 1.5, d + 0.02);
  s.onended = () => { try { g.disconnect(); b.disconnect(); } catch (e) { /* — */ } };
}

/* гул города: бурый шум ниже 200 Гц, чуть шин, медленно дышит */
function synCity (c, out, N) {
  const a = loopSrc(c, N.brown), lp = filt(c, 'lowpass', 190, 0.7), ga = gain(c, 0.04);
  const b = loopSrc(c, N.white), bp = filt(c, 'bandpass', 950, 0.6), gb = gain(c, 0.006);
  const l = osc(c, 'sine', 0.06), lg = gain(c, 0.013);
  a.connect(lp); lp.connect(ga); ga.connect(out);
  b.connect(bp); bp.connect(gb); gb.connect(out);
  l.connect(lg); lg.connect(ga.gain);
  return { stop: () => kill([a, b, l, lp, ga, bp, gb, lg]) };
}
/* ветер: полоса бурого шума, порывы — медленные качели громкости и высоты */
function synWind (c, out, N) {
  const a = loopSrc(c, N.brown), bp = filt(c, 'bandpass', 420, 0.9), g = gain(c, 0.05);
  const l1 = osc(c, 'sine', 0.09), g1 = gain(c, 0.03), l2 = osc(c, 'sine', 0.037), g2 = gain(c, 160);
  a.connect(bp); bp.connect(g); g.connect(out);
  l1.connect(g1); g1.connect(g.gain); l2.connect(g2); g2.connect(bp.frequency);
  return { stop: () => kill([a, l1, l2, bp, g, g1, g2]) };
}
/* вой урагана (раньше — hurricane.js): полоса уже, высота — от порыва p 0…1 */
function synHowl (c, out, N) {
  const a = loopSrc(c, N.brown), bp = filt(c, 'bandpass', 260, 1.6), g = gain(c, 0.18);
  a.connect(bp); bp.connect(g); g.connect(out);
  return { stop: () => kill([a, bp, g]), set (p) { bp.frequency.setTargetAtTime(260 + 520 * clamp(+p || 0, 0, 1), c.currentTime, 0.4); } };
}
/* дождь по крыше: шипение сверху и барабан крыши; в ливень (p = 1) барабан громче */
function synRain (c, out, N) {
  const a = loopSrc(c, N.white), hp = filt(c, 'highpass', 1800), lp = filt(c, 'lowpass', 7500), ga = gain(c, 0.03);
  const b = loopSrc(c, N.white), bp = filt(c, 'bandpass', 620, 0.7), gb = gain(c, 0.07);
  a.connect(hp); hp.connect(lp); lp.connect(ga); ga.connect(out);
  b.connect(bp); bp.connect(gb); gb.connect(out);
  const id = WTH.id(), heavy = id === 'storm' || id === 'hurricane';
  if (heavy) { gb.gain.value = 0.1; bp.frequency.value = 480; }
  return { stop: () => kill([a, b, hp, lp, ga, bp, gb]) };
}
/* сверчки: два тона ~4,5 кГц, рублены на стрекот (28—31 Гц) и на трели (раз в 1—2 с) */
function synCrickets (c, out) {
  const nodes = [], g = gain(c, 0.009);
  g.connect(out); nodes.push(g);
  for (const [f, fast, slow] of [[4400, 28, 0.7], [4950, 31, 0.53]]) {
    const o = osc(c, 'sine', f), g1 = gain(c, 0.5), g2 = gain(c, 0.5);
    const l1 = osc(c, 'square', fast), m1 = gain(c, 0.5), l2 = osc(c, 'square', slow), m2 = gain(c, 0.5);
    o.connect(g1); g1.connect(g2); g2.connect(g);
    l1.connect(m1); m1.connect(g1.gain); l2.connect(m2); m2.connect(g2.gain);
    nodes.push(o, g1, g2, l1, m1, l2, m2);
  }
  return { stop: () => kill(nodes) };
}
/* птицы: короткие трели (2—5 нот вверх), слева и справа, чаще — чем громче петля */
function synBirds (c, out) {
  const g = gain(c, 1);
  g.connect(out);
  let t = rnd(0.2, 0.8);
  return {
    stop: () => kill([g]),
    tick (dt, lvl) {
      if ((t -= dt) > 0 || lvl < 0.02) return;
      t = rnd(0.35, 1.8) / (0.4 + lvl);
      const n = 2 + ((Math.random() * 4) | 0), f = rnd(2300, 4300), pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const v = rnd(0.02, 0.045);
      let at = c.currentTime + 0.02;
      const dst = pan || g;
      if (pan) { pan.pan.value = rnd(-0.8, 0.8); pan.connect(g); }
      for (let i = 0; i < n; i++) {
        const d = rnd(0.04, 0.09), o = c.createOscillator(), e = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * rnd(0.92, 1.06), at); o.frequency.exponentialRampToValueAtTime(f * rnd(1.15, 1.6), at + d);
        e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(v, at + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(e); e.connect(dst); o.start(at); o.stop(at + d + 0.02);
        o.onended = () => { try { e.disconnect(); } catch (er) { /* — */ } };
        at += d + rnd(0.02, 0.07);
      }
      if (pan) setTimeout(() => { try { pan.disconnect(); } catch (er) { /* — */ } }, (at - c.currentTime) * 1000 + 300);
    },
  };
}
/* толпа: гомон (бурый шум в полосе голоса), волнами, изредка возглас */
function synCrowd (c, out, N) {
  const a = loopSrc(c, N.brown), bp = filt(c, 'bandpass', 520, 0.8), ga = gain(c, 0.06);
  const b = loopSrc(c, N.white), bp2 = filt(c, 'bandpass', 1300, 1.4), gb = gain(c, 0.01);
  a.connect(bp); bp.connect(ga); ga.connect(out);
  b.connect(bp2); bp2.connect(gb); gb.connect(out);
  let t = 0;
  return {
    stop: () => kill([a, b, bp, ga, bp2, gb]),
    tick (dt) {
      if ((t -= dt) > 0) return;
      t = rnd(0.25, 0.6);
      const tn = c.currentTime;
      ga.gain.setTargetAtTime(0.06 * rnd(0.6, 1.25), tn, 0.15);
      gb.gain.setTargetAtTime(Math.random() < 0.06 ? 0.035 : 0.01, tn, 0.1);   // возглас
    },
  };
}
/* стройка: очереди ударов молотка (раз в ~0,4 с), паузы, иногда болгарка 1,5—3,5 с */
function synCons (c, out, N) {
  const g = gain(c, 1);
  g.connect(out);
  let t = rnd(0.3, 1), hits = 0, grind = null;
  const stopGrind = () => { if (grind) { kill(grind); grind = null; } };
  return {
    stop: () => { stopGrind(); kill([g]); },
    tick (dt, lvl) {
      if ((t -= dt) > 0 || lvl < 0.01) return;
      const at = c.currentTime + 0.02;
      if (hits > 0) {
        hits--;
        burst(c, g, N, at, 0.06, 0.09, rnd(1700, 2300), 1.2);
        burst(c, g, N, at, 0.03, 0.05, 700, 2);
        t = rnd(0.38, 0.46);
        return;
      }
      stopGrind();
      if (Math.random() < 0.25) {
        const len = rnd(1.5, 3.5);
        const s = c.createBufferSource(); s.buffer = N.white; s.loop = true;
        const bp = filt(c, 'bandpass', 3300, 3), e = gain(c, 0);
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 2900;
        const og = gain(c, 0.004), lo = osc(c, 'sine', 3.5), lg = gain(c, 60);
        e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(0.05, at + 0.25);
        e.gain.setValueAtTime(0.05, at + len - 0.3); e.gain.exponentialRampToValueAtTime(0.0001, at + len);
        s.connect(bp); bp.connect(e); o.connect(og); og.connect(e); e.connect(g);
        lo.connect(lg); lg.connect(o.frequency);
        s.start(at, Math.random()); o.start(at);
        grind = [s, o, lo, bp, e, og, lg];
        t = len + rnd(1, 3);
      } else { hits = 3 + ((Math.random() * 6) | 0); t = rnd(1, 4); }
    },
  };
}
/* собака вдали: два «гав» — пила вниз, приглушено */
function synDog (s) {
  const c = s.ctx, lp = filt(c, 'lowpass', 1100), tn = c.currentTime;
  lp.connect(s.out);
  for (let i = 0, at = tn + 0.02; i < 2; i++, at += rnd(0.18, 0.3)) {
    const o = c.createOscillator(), e = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rnd(480, 560), at); o.frequency.exponentialRampToValueAtTime(rnd(260, 320), at + 0.1);
    e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(0.07, at + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    o.connect(e); e.connect(lp); o.start(at); o.stop(at + 0.14);
  }
  setTimeout(() => { try { lp.disconnect(); } catch (e) { /* — */ } }, 1200);
}
/* поезд: гудок и перестук колёс «та-дам» ~6 с */
function synTrain (s) {
  const c = s.ctx, N = noise(c), tn = c.currentTime + 0.02;
  const lp = filt(c, 'lowpass', 900);
  lp.connect(s.out);
  for (const f of [311, 370]) {
    const o = c.createOscillator(), e = c.createGain();
    o.type = 'square'; o.frequency.value = f;
    e.gain.setValueAtTime(0.0001, tn); e.gain.exponentialRampToValueAtTime(0.025, tn + 0.08);
    e.gain.setValueAtTime(0.025, tn + 0.8); e.gain.exponentialRampToValueAtTime(0.0001, tn + 1.1);
    o.connect(e); e.connect(lp); o.start(tn); o.stop(tn + 1.15);
  }
  for (let i = 0; i < 12; i++) {
    const at = tn + 1 + i * 0.48, v = 0.12 * Math.sin(Math.PI * (i + 0.5) / 12);
    burst(c, lp, N, at, 0.07, v, 260, 0.8);
    burst(c, lp, N, at + 0.13, 0.07, v * 0.8, 240, 0.8);
  }
  setTimeout(() => { try { lp.disconnect(); } catch (e) { /* — */ } }, 8000);
}

/* ─────────────── отладка: __dlv.Snd.amb.DEBUG ─────────────── */
const FORCE = {};
export const DEBUG = {
  AMB, CTX, STATS, CH, GREEN,
  /* что звучит: имя → { want, gain, file|synth } */
  playing () {
    const o = {};
    for (const n in CH) { const ch = CH[n]; if (ch.src) o[n] = { want: +ch.want.toFixed(3), gain: +ch.cur.toFixed(3), kind: ch.src.kind }; }
    return o;
  },
  get mode () { return MODE; },
  ctx: () => ({ green: +CTX.green.toFixed(2), traffic: +CTX.traffic.toFixed(2), wide: +CTX.wide.toFixed(2), cons: CTX.cons && { x: Math.round(CTX.cons.x), z: Math.round(CTX.cons.z) }, crowd: CTX.crowd && { kind: CTX.crowd.kind, x: Math.round(CTX.crowd.x), z: Math.round(CTX.crowd.z) }, railD: Math.round(CTX.railD), greenDone: GREEN.done, greenCells: GREEN.cells }),
  /* поставить петлю вручную (v 0…1; null — снять) */
  force (n, v) { if (v == null) delete FORCE[n]; else FORCE[n] = v; return true; },
  /* редкий звук сейчас: 'dog' | 'train' (поезд — только если рельсы ближе AMB.TRAIN_R) */
  shot (k) { if (k === 'dog') T.dog = 0; else if (k === 'train') T.train = 0; return true; },
  rail: () => RAIL.pts && RAIL.pts.length / 2,
  perf (reset) { const o = { ms: +(STATS.ms / Math.max(1, STATS.frames)).toFixed(4), max: +STATS.maxMs.toFixed(2), frames: STATS.frames }; if (reset) STATS.ms = STATS.frames = STATS.maxMs = 0; return o; },
  /* громкость синтеза петли: s секунд без звука (OfflineAudioContext) → rms, peak */
  async render (n, s = 3, p) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !DEF[n]) return null;
    const c = new OAC(1, 44100 * s, 44100), out = c.createGain();
    out.connect(c.destination);
    const src = DEF[n].mk(c, out, noise(c));
    if (src.set) src.set(p);
    if (src.tick) for (let t = 0.05; t < s - 0.05; t += 0.05) c.suspend(t).then(() => { src.tick(0.05, 1); c.resume(); });
    const buf = await c.startRendering();
    const a = buf.getChannelData(0);
    let sq = 0, pk = 0;
    for (let i = 0; i < a.length; i++) { sq += a[i] * a[i]; pk = Math.max(pk, Math.abs(a[i])); }
    return { rms: +Math.sqrt(sq / a.length).toFixed(4), peak: +pk.toFixed(3) };
  },
};
