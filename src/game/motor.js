/* Мотор из записей (М3, 09.10.2026). Правила словами и имена файлов — docs/SOUNDS.md «Мотор из записей».

   Как в гонках: у машины 4 петли мотора на ровных оборотах — холостые, низкие, средние, высокие
   (engine-<класс>-idle|low|mid|high). Игра считает обороты из скорости и передачи (своя коробка: 4—5 передач,
   переключение по оборотам, провал на переключении), звучат две соседние петли — плавно перетекают одна в
   другую (equal-power: cos / sin, громкость не проседает посередине), и каждая подстраивает высоту
   (playbackRate = обороты / обороты записи). Нет файлов — те же 4 петли синтезом: при первом звуке игра
   «записывает» их сама (вспышки в цилиндрах через резонансы выхлопа, своё звучание у каждого класса),
   по одной петле за кадр, — дальше всё как с файлами. Кадр: 4 петли + фильтр + пара узлов, параметры —
   раз в кадр и только когда поменялись.

   Классы (CLASS — по id машины из cars.js): «жигули» vaz (Семёрка, Копейка, Приора, Нива, Волга),
   «Буханка» uaz (Буханка, Патриот: низкие обороты, рокот, вой раздатки на ходу), иномарки foreign
   (Матиз, Чери, Белджик, Круз, Веста, Хавал, Джили: ровно и тихо).

   Плюс: газовка на месте (упёрся газом — обороты к отсечке), отсечка (дробь «тр-р-р» на красной зоне,
   rev-limit), хлопки на сбросе газа с высоких оборотов (огонь и «пах» из трубы — exhaust.js liftPop),
   визг шин (tire-squeal: занос, торможение на скорости, рывок с места), стартер при старте смены
   (starter) и «подхват» оборотов, затухание при «заглохла», свист нитро (nitro-whistle). Мотор с низким
   ресурсом (cars.js engine().c) троит: ровный провал раз в цикл (один цилиндр не работает), случайные
   «чихи» и обороты гуляют. Машины потока рядом — свой тихий гул (2 голоса, «в мире»).

   sfx-names: engine-vaz-idle, engine-vaz-low, engine-vaz-mid, engine-vaz-high
   sfx-names: engine-uaz-idle, engine-uaz-low, engine-uaz-mid, engine-uaz-high
   sfx-names: engine-foreign-idle, engine-foreign-low, engine-foreign-mid, engine-foreign-high
   sfx-names: tire-squeal, nitro-whistle, starter, rev-limit

     init({ Snd })          — из game.js сразу после Snd
     input(v, load, info)   — из driveStep (Snd.engine): v — скорость вдоль машины, м/с, load — газ (или нитро),
                              info — MOTOR_IN (game.js); без info — мотор молчит (пауза, карта, меню)
     step(dt, api)          — каждый кадр (CL.step): api — { TRAFFIC, V, health(), pop(loud) }
     crank()                — стартер (startRun); cut(sec) — «чих»: мотор на миг пропадает (exhaust.js)
     DEBUG                  — __dlv.Snd.motor.DEBUG: state(), sweep(cls), render(cls, layer), force… */
import * as SFX from './sfx.js';

/* ─── числа ─── */
export const ENG = {
  VOL: 0.075,          // громкость мотора на полном газу у красной зоны (шина «мотор»; до М3 пик ≈ 0,06)
  IDLE: 0.3,           // холостые без газа — доля (ровный гул на стоянке не должен надоедать)
  OFF: 0.7,            // сброс газа на красной зоне — доля (торможение мотором тише и глуше)
  SHIFT: 0.16,         // с — провал газа на переключении вверх
  SHIFT_CUT: 0.4,      // громкость на переключении
  UP: 0.92, UP_OFF: 0.72, DOWN: 0.36,   // доли красной зоны: вверх на газу / без газа, вниз
  LAUNCH: 0.42,        // рывок с места: обороты сразу на эту долю (сцепление)
  PUSH: 0.35, PUSH_T: 0.9,              // газ, а машина стоит (упёрся) — через PUSH с за PUSH_T с до отсечки
  CHOP: [0.065, 0.085], CHOP_LEN: 0.03, // отсечка: «тр-р-р» — провал каждые 65—85 мс на 30 мс
  LIFT: { RPM: 0.62, V: 8 },            // хлопки на сбросе газа: с этой доли оборотов и скорости, м/с
  SICK: { FROM: 70, ZERO: 15 },         // мотор %: с FROM начинает троить, к ZERO — сильно
  WAKE: 0.3,           // с без input — мотор гаснет (меню, итоги смены); 1,5 с тишины — петли останавливаются
  SQ: { SIDE: 3.5, SIDE_FULL: 10, BRAKE: 13, BRAKE_FULL: 30, VOL: 0.11, LAUNCH: 0.45 },   // визг шин: снос вбок м/с, тормоз м/с
  NOS: { VOL: 0.035, F0: 1700, F1: 3300, SPOOL: 1.4 },   // свист нитро: громкость, Гц от / до, с раскрутки
  TRAF: { R: 34, VOICES: 2, VOL: 0.028, EVERY: 0.12 },   // гул потока: радиус, м; голосов; громкость; с между выборами
};

/* класс → обороты: rpm — на каких оборотах записаны 4 петли (idle, low, mid, high), idle / red — холостые
   и красная зона; gears — доля максималки, на которой передача доходит до красной; lift — шанс хлопка на сбросе;
   vol — громкость класса; syn — как звучит синтез (цилиндры, неровность, резонансы выхлопа, шум, «грязь») */
export const CLS = {
  vaz: {
    rpm: [900, 2500, 4000, 5600], idle: 850, red: 6000, gears: [0.21, 0.38, 0.56, 0.77, 1.0], lift: 0.5, vol: 1,
    syn: { cyl: 4, uneven: 0.2, jit: 0.16, pulse: 0.0011, f0: 230, w0: 0.9, f1: 125, bw1: 70, w1: 1, f2: 520, bw2: 190, w2: 0.55, f3: 2300, bw3: 700, w3: 0.14, noise: 0.45, ndec: 0.004, drive: 2.0 },
  },
  uaz: {
    rpm: [750, 1700, 2700, 3700], idle: 700, red: 4000, gears: [0.26, 0.48, 0.73, 1.0], lift: 0.35, vol: 1.1, whine: 40,
    syn: { cyl: 4, uneven: 0.32, jit: 0.24, pulse: 0.0016, f0: 170, w0: 1.2, f1: 78, bw1: 45, w1: 1, f2: 320, bw2: 130, w2: 0.5, f3: 1400, bw3: 500, w3: 0.08, noise: 0.35, ndec: 0.006, drive: 2.6 },
  },
  foreign: {
    rpm: [850, 2600, 4400, 6300], idle: 800, red: 6800, gears: [0.2, 0.36, 0.53, 0.74, 1.0], lift: 0.12, vol: 0.85,
    syn: { cyl: 4, uneven: 0.05, jit: 0.04, pulse: 0.0008, f0: 260, w0: 0.7, f1: 150, bw1: 90, w1: 1, f2: 640, bw2: 260, w2: 0.45, f3: 3300, bw3: 1200, w3: 0.3, noise: 0.3, ndec: 0.003, drive: 1.3 },
  },
};
/* id машины (cars.js / econ.js CAR_LIST) → класс; нет в списке — седан звучит «жигулями», остальное — иномаркой */
export const CLASS = {
  semerka: 'vaz', kopeyka: 'vaz', priora: 'vaz', niva: 'vaz', volga: 'vaz',
  buhanka: 'uaz', patriot: 'uaz',
  matiz: 'foreign', cheri: 'foreign', belgik: 'foreign', cruze: 'foreign', vesta: 'foreign', havalka: 'foreign', jilya: 'foreign',
};
export const classOf = id => CLASS[id] || 'vaz';
const LAYERS = ['idle', 'low', 'mid', 'high'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const HALF_PI = Math.PI / 2;
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

let A = null;                                   // { Snd } + api из step
export function init (api) { A = Object.assign(A || {}, api); }

/* ─── синтез: «записать» петлю на ровных оборотах ───
   Вспышки в цилиндрах (полусинус + короткий шум сгорания) раз в 120/rpm/цил с; у каждого цилиндра своя сила
   (неровность), у каждой вспышки — разброс; дальше — резонансы выхлопа (три двухполюсника) и низ (сглаженные
   вспышки), «грязь» (tanh). Целое число циклов в буфере, резонансы проходят буфер дважды — петля без шва. */
function lcg (seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function genLayer (sr, cls, li) {
  const P = CLS[cls], S = P.syn, rpm = P.rpm[li], k = li / 3;
  const cyc = 120 / rpm;                                       // с на цикл (два оборота)
  const nCyc = Math.max(3, Math.round(1.1 / cyc));
  const len = Math.round(nCyc * cyc * sr);
  const nF = nCyc * S.cyl, fire = len / nF;
  const R = lcg([...cls].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) + li * 131);
  const ex = new Float32Array(len);
  const camp = []; for (let i = 0; i < S.cyl; i++) camp.push(1 + (R() * 2 - 1) * S.uneven);
  const pw = Math.max(2, Math.round(sr * S.pulse * (1 - 0.35 * k)));
  const nd = Math.max(8, sr * S.ndec * (1 - 0.45 * k)), nl = Math.round(nd * 4), nk = Math.exp(-1 / nd);
  const nv0 = S.noise * (0.6 + 0.9 * k);
  for (let f = 0; f < nF; f++) {
    const st = Math.round(f * fire + (R() * 2 - 1) * S.jit * fire * 0.12 * (1 - 0.7 * k));
    const a = camp[f % S.cyl] * (1 + (R() * 2 - 1) * S.jit * (1 - 0.6 * k));
    for (let n = 0; n < pw; n++) { const i = (st + n + len) % len; ex[i] += a * Math.sin(Math.PI * n / pw); }
    let e = a * nv0;
    for (let n = 0; n < nl; n++, e *= nk) { const i = (st + n + len) % len; ex[i] += e * (R() * 2 - 1); }
  }
  const y = new Float32Array(len), tmp = new Float32Array(len);
  const add = (w) => {                                          // tmp → y с весом w (по rms)
    let s = 0; for (let i = 0; i < len; i++) s += tmp[i] * tmp[i];
    const g = w / (Math.sqrt(s / len) || 1);
    for (let i = 0; i < len; i++) y[i] += tmp[i] * g;
  };
  const reson = (f, bw) => {                                    // двухполюсный резонанс, по кругу (2 прохода)
    const r = Math.exp(-Math.PI * bw / sr), c1 = 2 * r * Math.cos(2 * Math.PI * f / sr), c2 = -r * r;
    let y1 = 0, y2 = 0;
    for (let p = 0; p < 2; p++) for (let i = 0; i < len; i++) { const v = ex[i] + c1 * y1 + c2 * y2; y2 = y1; y1 = v; if (p) tmp[i] = v; }
  };
  const low = f => {                                            // сглаженные вспышки — низ и гармоники частоты вспышек
    const a = 1 - Math.exp(-2 * Math.PI * f / sr);
    let z = 0, z2 = 0;
    for (let p = 0; p < 2; p++) for (let i = 0; i < len; i++) { z += a * (ex[i] - z); z2 += a * (z - z2); if (p) tmp[i] = z2; }
    let m = 0; for (let i = 0; i < len; i++) m += tmp[i]; m /= len;
    for (let i = 0; i < len; i++) tmp[i] -= m;                  // без постоянной составляющей
  };
  low(S.f0 * (1 + 0.6 * k)); add(S.w0);
  reson(S.f1 * (1 + 0.2 * k), S.bw1); add(S.w1);
  reson(S.f2 * (1 + 0.15 * k), S.bw2); add(S.w2 * (0.8 + 0.5 * k));
  reson(S.f3, S.bw3); add(S.w3 * (0.5 + 1.2 * k));
  // «грязь» и громкость: rms 0,25, без клиппинга
  let s = 0; for (let i = 0; i < len; i++) s += y[i] * y[i];
  const pre = 0.35 / (Math.sqrt(s / len) || 1), dr = S.drive * (1 + 0.4 * k);
  s = 0;
  for (let i = 0; i < len; i++) { const v = Math.tanh(y[i] * pre * dr); y[i] = v; s += v * v; }
  const post = 0.25 / (Math.sqrt(s / len) || 1);
  for (let i = 0; i < len; i++) y[i] = clamp(y[i] * post, -1, 1);
  return y;
}
/* готовые петли синтеза: ключ cls:li → AudioBuffer (на свой AudioContext) */
const SYN = new Map();
let SYN_CTX = null;
function synBuf (c, cls, li) {
  if (SYN_CTX !== c) { SYN.clear(); SYN_CTX = c; }
  const key = cls + ':' + li;
  let b = SYN.get(key);
  if (!b) {
    const t = nowS(), arr = genLayer(c.sampleRate, cls, li);
    b = c.createBuffer(1, arr.length, c.sampleRate);
    b.getChannelData(0).set(arr);
    SYN.set(key, b);
    ST.genMs += (nowS() - t) * 1000; ST.gen++;
  }
  return b;
}
const synReady = (c, cls, li) => SYN_CTX === c && SYN.has(cls + ':' + li);

/* громкость файла петли — к той же rms, что у синтеза (0,25): файлы автора бывают разной громкости */
const RMS = new WeakMap();
function fileK (b) {
  let k = RMS.get(b);
  if (k === undefined) {
    const a = b.getChannelData(0), n = Math.min(a.length, b.sampleRate * 3);
    let s = 0, m = 0;
    for (let i = 0; i < n; i += 2) { s += a[i] * a[i]; m++; }
    k = clamp(0.25 / (Math.sqrt(s / (m || 1)) || 0.25), 0.2, 5);
    RMS.set(b, k);
  }
  return k;
}
/* набор петель для класса: файлы класса (все 4) → файлы «жигулей» (все 4) → синтез. rpm — обороты записи */
function pickSet (c, cls) {
  for (const src of [cls, 'vaz']) {
    const bufs = LAYERS.map(l => SFX.buffer('engine-' + src + '-' + l));
    if (bufs.every(Boolean)) return { file: true, src, bufs, ks: bufs.map(fileK), rpm: CLS[src].rpm };
  }
  return null;
}

/* ─── состояние ─── */
const IN = { v: 0, load: false, live: false, at: -9, dead: false, brake: 0, hand: 0, side: 0, air: false, nos: false, vmax: 48, surf: 1, id: '' };
const M = {
  cls: 'vaz', set: null, src: [], lg: [], mix: null, miss: null, mOsc: null, mDep: null, chop: null, filt: null, out: null, whine: null, whG: null,
  awake: false, quietT: 0, prepLi: 0,
  gear: 1, rpm: 850, shiftT: 0, pushT: 0, launchT: 9, brakeT: 0, cutT: 0, crankT: 0, wasDead: false, wasGas: false, nextChop: 0, chopN: 0, limitT: 0,
  health: 100, sick: 0, healthT: 0, wob: 0, popQ: [], last: {}, lvl: 0, crossG: [0, 0, 0, 0], rate: [1, 1, 1, 1],
};
export const ST = { gen: 0, genMs: 0, wakes: 0, shifts: 0, chops: 0, pops: 0, sputters: 0, cranks: 0, squealMax: 0, sideMax: 0, steps: 0, ms: 0, msMax: 0, traffic: 0 };

/** из driveStep (через Snd.engine) */
export function input (v, load, info) {
  IN.v = +v || 0; IN.load = !!load; IN.at = nowS();
  if (!info) {
    IN.live = false;
    const c = A && A.Snd && A.Snd.ctx;
    if (c && M.out) M.out.gain.setTargetAtTime(0, c.currentTime, 0.04);   // пауза: шаг кадра может не прийти
    return;
  }
  IN.live = info.live !== false; IN.dead = !!info.dead; IN.brake = info.brake ? 1 : 0; IN.hand = info.hand ? 1 : 0;
  IN.side = +info.side || 0; IN.air = !!info.air; IN.nos = !!info.nos; IN.vmax = info.vmax || 48; IN.surf = info.surf == null ? 1 : info.surf; IN.id = info.id || '';
}

/** стартер: при старте смены — «вжжж-вжжж» и подхват */
export function crank () {
  const Snd = A && A.Snd;
  if (!Snd || !Snd.ctx || !Snd.on) { M.crankT = 0; return; }
  M.crankT = 0.62; M.wasDead = true; ST.cranks++;
  Snd.fx('starter', s => {
    // стартер крутит: 5 тяжёлых «р-р» (такты сжатия), потом мотор схватывает (подхват — сам мотор)
    for (let i = 0; i < 5; i++) setTimeout(() => { s.noise(0.06, 0.1); s.blip(70 + i * 6, 0.07, 'sawtooth', 0.07); }, i * 105);
    setTimeout(() => s.noise(0.05, 0.16), 560);
  }, { eng: 1 });
}
/** «чих» (exhaust.js): мотор на миг пропадает */
export function cut (sec = 0.15) { M.cutT = Math.max(M.cutT, sec); M.rpm *= 0.85; }

/* ─── узлы ─── */
function build (c, bus) {
  M.mix = c.createGain();
  M.miss = c.createGain();
  M.chop = c.createGain();
  M.filt = c.createBiquadFilter(); M.filt.type = 'lowpass'; M.filt.frequency.value = 900; M.filt.Q.value = 0.7;
  M.out = c.createGain(); M.out.gain.value = 0;
  M.mix.connect(M.miss); M.miss.connect(M.chop); M.chop.connect(M.filt); M.filt.connect(M.out); M.out.connect(bus);
  // троит: импульс 25 % раз в цикл (один цилиндр) — минус к громкости
  const N = 16, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = 2 * Math.sin(n * Math.PI * 0.25) / (n * Math.PI);
  M.mOsc = c.createOscillator();
  try { M.mOsc.setPeriodicWave(c.createPeriodicWave(re, im, { disableNormalization: true })); } catch (e) { M.mOsc.type = 'square'; }
  M.mOsc.frequency.value = 7;
  M.mDep = c.createGain(); M.mDep.gain.value = 0;
  M.mOsc.connect(M.mDep); M.mDep.connect(M.miss.gain); M.mOsc.start();
  M.bus = bus;
}
function wake (c, set) {
  sleep();
  M.set = set; M.awake = true; M.quietT = 0; ST.wakes++;
  const t = c.currentTime;
  for (let i = 0; i < 4; i++) {
    const s = c.createBufferSource(); s.buffer = set.bufs[i]; s.loop = true;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(M.mix);
    s.start(t, Math.random() * Math.max(0, s.buffer.duration - 0.05));
    M.src[i] = s; M.lg[i] = g;
  }
  if (CLS[M.cls].whine) {
    M.whine = c.createOscillator(); M.whine.type = 'triangle'; M.whine.frequency.value = 200;
    M.whG = c.createGain(); M.whG.gain.value = 0;
    M.whine.connect(M.whG); M.whG.connect(M.out); M.whine.start();
  }
  M.last = {};
}
function sleep () {
  for (const s of M.src) { try { s.stop(); s.disconnect(); } catch (e) { /* — */ } }
  for (const g of M.lg) { try { g.disconnect(); } catch (e) { /* — */ } }
  if (M.whine) { try { M.whine.stop(); M.whine.disconnect(); M.whG.disconnect(); } catch (e) { /* — */ } }
  M.src = []; M.lg = []; M.whine = M.whG = null; M.awake = false;
}
/* setTargetAtTime только если значение заметно поменялось */
function set (key, param, v, t, tau, eps) {
  const o = M.last[key];
  if (o !== undefined && Math.abs(o - v) <= eps * Math.max(1e-4, Math.abs(o))) return;
  M.last[key] = v;
  param.setTargetAtTime(v, t, tau);
}

/** равная мощность между соседними петлями: g[4], rate[4] для оборотов rpm; R — обороты записи */
export function crossfade (rpm, R, g, rate) {
  g[0] = g[1] = g[2] = g[3] = 0;
  if (rpm <= R[0]) g[0] = 1;
  else if (rpm >= R[3]) g[3] = 1;
  else {
    const i = rpm < R[1] ? 0 : rpm < R[2] ? 1 : 2, f = (rpm - R[i]) / (R[i + 1] - R[i]);
    g[i] = Math.cos(f * HALF_PI); g[i + 1] = Math.sin(f * HALF_PI);
  }
  for (let i = 0; i < 4; i++) rate[i] = clamp(rpm / R[i], 0.5, 2);
  return g;
}

/* ─── каждый кадр ─── */
export function step (dt, api) {
  if (api) init(api);
  const Snd = A && A.Snd, c = Snd && Snd.ctx;
  if (!c || !dt) return;
  const t0 = nowS();
  const t = c.currentTime;
  if (!M.out) build(c, Snd.engBus);
  const fresh = IN.live && t0 - IN.at < ENG.WAKE && Snd.on;
  const cls = classOf(IN.id);
  if (cls !== M.cls) { M.cls = cls; if (M.awake) sleep(); M.set = null; M.prepLi = 0; }
  const P = CLS[cls];

  // ресурс мотора — раз в полсекунды (cars.js)
  if ((M.healthT -= dt) <= 0) {
    M.healthT = 0.5;
    try { M.health = A.health ? +A.health() : 100; } catch (e) { M.health = 100; }
    if (!Number.isFinite(M.health)) M.health = 100;
    M.sick = M.forceSick != null ? M.forceSick : clamp((ENG.SICK.FROM - M.health) / (ENG.SICK.FROM - ENG.SICK.ZERO), 0, 1);
  }

  if (fresh) {
    // петли: файлы класса или синтез (синтез — по одной петле за кадр, кадр не дёргается)
    if (!M.set || (!M.set.file && (M.prepLi = (M.prepLi + 1) % 30) === 0)) {
      const fset = pickSet(c, cls);
      if (fset && (!M.set || !M.set.file || M.set.src !== fset.src)) wake(c, fset);
      else if (!M.set) {
        let li = 0; while (li < 4 && synReady(c, cls, li)) li++;
        if (li < 4) synBuf(c, cls, li);
        else wake(c, { file: false, src: cls, bufs: [0, 1, 2, 3].map(i => synBuf(c, cls, i)), ks: [1, 1, 1, 1], rpm: P.rpm });
      }
    } else if (!M.awake) wake(c, M.set);
  } else if (Snd.on && (M.prepT = (M.prepT || 0) - dt) <= 0) {
    // меню, итоги: петли синтеза для машины в гараже «записываются» заранее — по одной раз в 0,3 с, не в езде
    M.prepT = 0.3;
    let id = IN.id; try { if (A.carId) id = A.carId() || id; } catch (e) { /* — */ }
    const pc = classOf(id);
    if (!pickSet(c, pc)) { let li = 0; while (li < 4 && synReady(c, pc, li)) li++; if (li < 4) synBuf(c, pc, li); }
  }
  if (M.awake) drive(dt, c, t, P, fresh);
  tires(dt, c, t, Snd, fresh);
  nitro(dt, c, t, Snd, fresh);
  traffic(dt, c, t, Snd);

  const ms = (nowS() - t0) * 1000;
  ST.steps++; ST.ms += ms; if (ms > ST.msMax && ST.steps > 30) ST.msMax = ms;
}

function drive (dt, c, t, P, fresh) {
  const v = Math.abs(IN.v), load = fresh && IN.load && !IN.dead, red = P.red, idle = P.idle;
  // ── коробка и обороты ──
  let target;
  M.shiftT = Math.max(0, M.shiftT - dt); M.cutT = Math.max(0, M.cutT - dt);
  if (M.crankT > 0) { M.crankT -= dt; target = 0; if (M.crankT <= 0) { M.rpm = idle * 1.9; M.wasDead = false; } }
  else if (!fresh) target = M.rpm;                               // пауза, меню: обороты стоят, мотор просто молчит
  else if (IN.dead) { target = 0; M.wasDead = true; }
  else {
    if (M.wasDead) { M.wasDead = false; M.rpm = Math.max(M.rpm, idle * 1.7); }     // схватил: обороты подлетают и садятся на холостые
    if (IN.v < -0.5) { M.gear = 0; target = idle + (red - idle) * clamp(v / 12, 0, 1) * 0.75; }   // задний ход
    else {
      if (M.gear < 1) M.gear = 1;
      const G = P.gears, top = g => G[g - 1] * IN.vmax * 1.08, wheel = g => red * v / top(g);
      if (M.shiftT <= 0) {
        const w = wheel(M.gear);
        if (M.gear < G.length && w >= red * (load ? ENG.UP : ENG.UP_OFF)) {
          M.gear++; ST.shifts++;
          if (load && v > 3) {
            M.shiftT = ENG.SHIFT;
            A.Snd.fx('gear', s => s.blip(70 + M.gear * 6, 0.07, 'triangle', 0.03), { eng: 1 }, 0.6);   // щелчок передачи
          }
        } else if (M.gear > 1 && w < red * ENG.DOWN && wheel(M.gear - 1) < red * 0.85) {
          M.gear--;
          if (IN.brake && v > 4 && t > (M.blipAt || 0)) { M.rpm = Math.min(red * 0.9, M.rpm + (red - idle) * 0.15); M.blipAt = t + 0.35; }   // перегазовка на понижении
        }
      }
      target = Math.max(idle, wheel(M.gear));
      // сцепление: газ с места — обороты сразу вверх; упёрся и жмёшь — газовка до отсечки
      if (load && v < 1.2) M.pushT += dt; else M.pushT = 0;
      if (load && M.gear === 1) {
        const push = clamp((M.pushT - ENG.PUSH) / ENG.PUSH_T, 0, 1);
        target = Math.max(target, idle + (red - idle) * (ENG.LAUNCH + (1.02 - ENG.LAUNCH) * push));
      }
      if (IN.air && load) target = red * 1.02;                  // колёса в воздухе — крутятся свободно
      if (IN.nos) target *= 1.06;
      target = Math.min(target, red * 1.02);
    }
  }
  const up = target > M.rpm;
  const k = IN.dead || !fresh ? 2.6 : M.shiftT > 0 ? 18 : up ? (load ? 7 : 5) : load ? 6 : 4.5;
  M.rpm += (target - M.rpm) * (1 - Math.exp(-k * dt));
  // троит: обороты гуляют на холостых
  M.wob += dt * (1.7 + Math.random());
  const wob = M.sick * (Math.sin(M.wob) * 0.6 + Math.sin(M.wob * 2.7 + 1) * 0.4) * (0.06 - 0.04 * clamp((M.rpm - idle) / (red - idle), 0, 1));
  const rpm = Math.max(1, M.rpm * (1 + wob));
  const r = clamp((rpm - idle) / (red - idle), 0, 1);

  // ── отсечка: «тр-р-р» на красной зоне ──
  const limiter = fresh && !IN.dead && (load || IN.nos) && M.rpm >= red * 0.985;
  if (limiter) {
    M.limitT += dt;
    if (M.nextChop < t) M.nextChop = t + 0.005;
    while (M.nextChop < t + 0.06) {
      M.chop.gain.setValueAtTime(0.12, M.nextChop);
      M.chop.gain.setValueAtTime(1, M.nextChop + ENG.CHOP_LEN);
      M.nextChop += rnd(ENG.CHOP[0], ENG.CHOP[1]);
      M.rpm *= 0.972; ST.chops++;
      if ((M.chopN = (M.chopN + 1) % 4) === 0 && M.limitT > 0.25) A.Snd.fx('rev-limit', s => s.noise(0.03, 0.035), { eng: 1 }, 0.5);
    }
  } else M.limitT = 0;
  // ── больной мотор: случайные «чихи» ──
  if (M.sick > 0 && fresh && !IN.dead && Math.random() < M.sick * (load ? 1.2 : 2.5) * dt) {
    const at = t + 0.01, d = rnd(0.04, 0.11) * (0.6 + M.sick);
    M.chop.gain.setValueAtTime(0.25, at); M.chop.gain.setValueAtTime(1, at + d);
    ST.sputters++;
  }
  // ── хлопки на сбросе газа ──
  if (M.wasGas && !load && fresh && !IN.dead && r > ENG.LIFT.RPM && v > ENG.LIFT.V && Math.random() < P.lift * (1 + M.sick)) {
    const n = 1 + ((Math.random() * (M.sick > 0.3 ? 3 : 2)) | 0);
    for (let i = 0; i < n; i++) M.popQ.push(t + 0.06 + i * rnd(0.09, 0.2));
  }
  M.wasGas = load;
  while (M.popQ.length && M.popQ[0] <= t) {
    M.popQ.shift();
    if (A.pop && A.pop(0.5 + 0.5 * r)) ST.pops++;
  }

  // ── громкость, слои, фильтр ──
  let lvl = load ? 0.55 + 0.45 * r : ENG.IDLE + (ENG.OFF - ENG.IDLE) * r;
  if (M.crankT > 0 || !fresh) lvl = 0;
  if (IN.dead || M.wasDead) lvl *= clamp(M.rpm / idle, 0, 1) ** 1.5;     // глохнет: гул садится вместе с оборотами
  if (M.shiftT > 0) lvl *= ENG.SHIFT_CUT;
  if (M.cutT > 0) lvl *= 0.15;
  lvl *= ENG.VOL * (CLS[M.cls].vol || 1);
  M.lvl = lvl;
  set('out', M.out.gain, lvl, t, lvl > (M.last.out || 0) ? 0.04 : 0.07, 0.01);
  if (lvl < 1e-4 && (!fresh || IN.dead)) { if ((M.quietT += dt) > 1.5) { sleep(); return; } }
  else M.quietT = 0;
  if (lvl < 1e-4 && M.last.out === lvl) return;                 // молчит — слои не трогаем
  const S = M.set;
  crossfade(rpm, S.rpm, M.crossG, M.rate);
  for (let i = 0; i < 4; i++) {
    set('g' + i, M.lg[i].gain, M.crossG[i] * S.ks[i], t, 0.03, 0.02);
    set('r' + i, M.src[i].playbackRate, M.rate[i], t, 0.03, 0.004);
  }
  set('f', M.filt.frequency, load ? 1500 + 7500 * r : 600 + 2600 * r, t, 0.06, 0.03);
  const dep = M.sick * 0.75;
  set('dep', M.mDep.gain, -dep, t, 0.2, 0.05);
  set('mb', M.miss.gain, 1 - dep * 0.25, t, 0.2, 0.05);
  if (dep > 0) set('mf', M.mOsc.frequency, rpm / 120, t, 0.03, 0.01);
  if (M.whG) {                                                    // Буханка: вой раздатки — от скорости колёс
    set('wf', M.whine.frequency, 90 + CLS[M.cls].whine * v, t, 0.05, 0.01);
    set('wg', M.whG.gain, ENG.VOL * 0.12 * clamp(v / 8, 0, 1) * (load ? 1 : 0.6) * (lvl > 0 ? 1 : 0), t, 0.08, 0.03);
  }
}

/* ─── визг шин: петля, пока заносит, тормозишь на скорости или рвёшь с места ─── */
const TS = { src: null, g: null, f1: null, f2: null, am: null, lfo: null, file: false, quiet: 0, lvl: 0, set: -1 };
let NOISE = null;
function noiseBuf (c) {
  if (NOISE && NOISE.sampleRate === c.sampleRate) return NOISE;
  const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  return (NOISE = b);
}
function tires (dt, c, t, Snd, fresh) {
  const v = Math.abs(IN.v), side = Math.abs(IN.side);
  let k = 0;
  if (fresh && !IN.air) {
    if (side > ST.sideMax) ST.sideMax = +side.toFixed(2);
    k = clamp((side - ENG.SQ.SIDE) / (ENG.SQ.SIDE_FULL - ENG.SQ.SIDE), 0, 1);
    if (IN.brake && IN.v > ENG.SQ.BRAKE) { M.brakeT += dt; k = Math.max(k, clamp((IN.v - ENG.SQ.BRAKE) / (ENG.SQ.BRAKE_FULL - ENG.SQ.BRAKE), 0.25, 1) * (M.brakeT < 1.2 ? 0.8 : 0.35)); }
    else M.brakeT = 0;
    if (IN.hand && v > 5) k = Math.max(k, 0.3 + 0.4 * clamp((v - 5) / 15, 0, 1));
    // рывок с места: газ с нуля — короткий «вжик»
    if (IN.load && !IN.dead) { if (M.launchT >= 9 && v < 1.5) M.launchT = 0; else if (M.launchT < 9) M.launchT += dt; } else M.launchT = 9;
    if (M.launchT < ENG.SQ.LAUNCH && v < 9) k = Math.max(k, 0.45 * (1 - M.launchT / ENG.SQ.LAUNCH));
    k *= IN.surf;
  }
  TS.lvl = k;
  if (k > ST.squealMax) ST.squealMax = +k.toFixed(2);
  if (k > 0.01 && !TS.src) {
    const buf = SFX.buffer('tire-squeal');
    TS.g = c.createGain(); TS.g.gain.value = 0; TS.g.connect(Snd.sfxBus);
    const s = c.createBufferSource(); s.loop = true;
    if (buf) { s.buffer = buf; s.connect(TS.g); TS.file = true; TS.vol = SFX.fileGain('tire-squeal') * 0.7; }
    else {
      // синтез: шум через две узкие полосы (резина визжит на 1,1 и 1,7 кГц) и дрожь 7—9 Гц
      s.buffer = noiseBuf(c);
      TS.am = c.createGain(); TS.am.gain.value = 0.7;
      TS.f1 = c.createBiquadFilter(); TS.f1.type = 'bandpass'; TS.f1.frequency.value = 1150; TS.f1.Q.value = 14;
      TS.f2 = c.createBiquadFilter(); TS.f2.type = 'bandpass'; TS.f2.frequency.value = 1720; TS.f2.Q.value = 18;
      TS.lfo = c.createOscillator(); TS.lfo.frequency.value = rnd(7, 9);
      const lg = c.createGain(); lg.gain.value = 0.3; TS.lfo.connect(lg); lg.connect(TS.am.gain); TS.lfo.start();
      s.connect(TS.f1); s.connect(TS.f2); TS.f1.connect(TS.am); TS.f2.connect(TS.am); TS.am.connect(TS.g);
      TS.file = false; TS.vol = ENG.SQ.VOL * 4;                  // узкая полоса съедает громкость шума
      SFX.synthed('tire-squeal');
    }
    s.start(0, Math.random() * (s.buffer.duration - 0.1));
    TS.src = s; TS.quiet = 0; TS.set = -1;
  }
  if (!TS.src) return;
  if (Math.abs(k - TS.set) > 0.03 || (k === 0 && TS.set !== 0)) {
    TS.g.gain.setTargetAtTime(k * TS.vol, t, k > TS.set ? 0.04 : 0.1);
    if (TS.file) TS.src.playbackRate.setTargetAtTime(0.92 + 0.18 * k, t, 0.08);
    else { TS.f1.frequency.setTargetAtTime(1050 + 250 * k, t, 0.08); TS.f2.frequency.setTargetAtTime(1600 + 300 * k, t, 0.08); }
    TS.set = k;
  }
  if (k === 0) { if ((TS.quiet += dt) > 1.2) tsStop(); } else TS.quiet = 0;
}
function tsStop () {
  for (const n of [TS.src, TS.lfo]) { try { if (n) n.stop(); } catch (e) { /* — */ } }
  for (const n of [TS.src, TS.f1, TS.f2, TS.am, TS.lfo, TS.g]) { try { if (n) n.disconnect(); } catch (e) { /* — */ } }
  TS.src = TS.lfo = TS.f1 = TS.f2 = TS.am = TS.g = null;
}

/* ─── свист нитро: петля, пока жжёшь (турбина раскручивается) ─── */
const NS = { src: null, osc: null, g: null, f: null, spool: 0, quiet: 0, file: false, set: -1 };
function nitro (dt, c, t, Snd, fresh) {
  const on = fresh && IN.nos && !IN.dead;
  NS.spool = clamp(NS.spool + (on ? dt / ENG.NOS.SPOOL : -dt * 1.5), 0, 1);
  const k = on ? 0.35 + 0.65 * NS.spool : NS.spool * 0.5;
  if (k > 0.01 && !NS.g) {
    NS.g = c.createGain(); NS.g.gain.value = 0; NS.g.connect(Snd.engBus);
    const buf = SFX.buffer('nitro-whistle');
    if (buf) {
      NS.src = c.createBufferSource(); NS.src.buffer = buf; NS.src.loop = true; NS.src.connect(NS.g); NS.src.start();
      NS.file = true; NS.vol = SFX.fileGain('nitro-whistle') * 0.6;
    } else {
      // синтез: свист (синус, растёт с раскруткой) и шипение газа (шум в полосе 3—5 кГц)
      NS.osc = c.createOscillator(); NS.osc.frequency.value = ENG.NOS.F0;
      const og = c.createGain(); og.gain.value = 0.5; NS.osc.connect(og); og.connect(NS.g); NS.osc.start();
      NS.src = c.createBufferSource(); NS.src.buffer = noiseBuf(c); NS.src.loop = true;
      NS.f = c.createBiquadFilter(); NS.f.type = 'bandpass'; NS.f.frequency.value = 4000; NS.f.Q.value = 1.2;
      const ng = c.createGain(); ng.gain.value = 0.9; NS.src.connect(NS.f); NS.f.connect(ng); ng.connect(NS.g); NS.src.start();
      NS.file = false; NS.vol = ENG.NOS.VOL;
      SFX.synthed('nitro-whistle');
    }
    NS.quiet = 0; NS.set = -1;
  }
  if (!NS.g) return;
  if (Math.abs(k - NS.set) > 0.02 || (k === 0 && NS.set !== 0)) {
    NS.g.gain.setTargetAtTime(k * NS.vol, t, on ? 0.06 : 0.2);
    if (NS.osc) NS.osc.frequency.setTargetAtTime(ENG.NOS.F0 + (ENG.NOS.F1 - ENG.NOS.F0) * NS.spool, t, 0.1);
    else if (NS.file && NS.src) NS.src.playbackRate.setTargetAtTime(0.9 + 0.25 * NS.spool, t, 0.1);
    NS.set = k;
  }
  if (k <= 0.01) { if ((NS.quiet += dt) > 1.5) nsStop(); } else NS.quiet = 0;
}
function nsStop () {
  for (const n of [NS.src, NS.osc]) { try { if (n) n.stop(); } catch (e) { /* — */ } }
  for (const n of [NS.src, NS.osc, NS.f, NS.g]) { try { if (n) n.disconnect(); } catch (e) { /* — */ } }
  NS.src = NS.osc = NS.f = NS.g = null;
}

/* ─── машины потока рядом: тихий гул, 2 голоса, «в мире» (слева / справа, тише вдали) ─── */
const TV = [];                                   // { car, src, f, g, pan, quiet }
let travT = 0;
function traffic (dt, c, t, Snd) {
  if ((travT -= dt) > 0) return;
  travT = ENG.TRAF.EVERY;
  const T = A.ACT || A.TRAFFIC, V = A.V, live = A.live ? A.live() : true;   // без стоящих у бордюра (trafficgrid.js)
  // две ближние едущие
  let a = null, b = null, da = 1e9, db = 1e9;
  if (T && V && live && Snd.on) {
    const R2 = ENG.TRAF.R * ENG.TRAF.R;
    for (const o of T) {
      if (!(o.speed > 2) || o.parked || o.wreck || o.knock || !o.mesh) continue;
      const d = (o.x - V.x) ** 2 + (o.z - V.z) ** 2;
      if (d > R2) continue;
      if (d < da) { b = a; db = da; a = o; da = d; } else if (d < db) { b = o; db = d; }
    }
  }
  const want = [a, b].filter(Boolean).slice(0, ENG.TRAF.VOICES);
  // голос остаётся за своей машиной, свободный — новой
  for (const v of TV) if (v.car && !want.includes(v.car)) v.car = null;
  for (const o of want) {
    if (TV.some(v => v.car === o)) continue;
    let v = TV.find(x => !x.car);
    if (!v && TV.length < ENG.TRAF.VOICES) TV.push(v = { car: null, src: null });
    if (v) v.car = o;
  }
  for (const v of TV) {
    const o = v.car;
    const sp = o ? SFX.place({ x: o.x, z: o.z, far: ENG.TRAF.R, near: 4 }) : null;
    const g = o && sp ? sp.g * ENG.TRAF.VOL * (0.45 + 0.55 * clamp(o.speed / 14, 0, 1)) : 0;
    if (g > 0 && !v.src) {
      const fset = pickSet(c, 'foreign');
      const buf = fset ? fset.bufs[1] : synBuf(c, 'foreign', 1);   // синтез «записывается» один раз (~3 мс)
      v.src = c.createBufferSource(); v.src.buffer = buf; v.src.loop = true;
      v.f = c.createBiquadFilter(); v.f.type = 'lowpass'; v.f.frequency.value = 520;
      v.g = c.createGain(); v.g.gain.value = 0; v.k = fset ? fset.ks[1] : 1;
      v.src.connect(v.f); v.f.connect(v.g);
      if (c.createStereoPanner) { v.pan = c.createStereoPanner(); v.g.connect(v.pan); v.pan.connect(Snd.sfxBus); } else v.g.connect(Snd.sfxBus);
      v.src.start(0, Math.random() * buf.duration * 0.9); v.quiet = 0; ST.traffic++;
    }
    if (!v.src) continue;
    v.g.gain.setTargetAtTime(g * v.k, t, 0.15);
    if (o && sp) {
      v.src.playbackRate.setTargetAtTime(clamp(0.7 + o.speed / 22, 0.6, 1.6), t, 0.2);
      if (v.pan) v.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
      v.quiet = 0;
    } else if ((v.quiet += ENG.TRAF.EVERY) > 1.5) {
      for (const n of [v.src, v.f, v.g, v.pan]) { try { if (n === v.src) n.stop(); if (n) n.disconnect(); } catch (e) { /* — */ } }
      v.src = v.f = v.g = v.pan = null;
    }
  }
}

/* ─── отладка (__dlv.Snd.motor.DEBUG) ─── */
export const DEBUG = {
  ENG, CLS, CLASS, ST, IN, M, classOf, crossfade,
  state () {
    return {
      cls: M.cls, awake: M.awake, set: M.set ? (M.set.file ? 'file:' + M.set.src : 'synth:' + M.set.src) : null,
      gear: M.gear, rpm: Math.round(M.rpm), lvl: +M.lvl.toFixed(4), layers: M.crossG.map(g => +g.toFixed(2)), rate: M.rate.map(r => +r.toFixed(2)),
      health: Math.round(M.health), sick: +M.sick.toFixed(2), squeal: +TS.lvl.toFixed(2), nitro: +NS.spool.toFixed(2),
      traffic: TV.filter(v => v.src).length, crank: +Math.max(0, M.crankT).toFixed(2), in: { ...IN },
    };
  },
  /* мотор с ресурсом p % (null — как в игре) */
  sick (p) { M.forceSick = p == null ? null : clamp((ENG.SICK.FROM - p) / (ENG.SICK.FROM - ENG.SICK.ZERO), 0, 1); M.healthT = 0; },
  /* rms / пик синтезной петли без звука: cls, li 0…3 */
  render (cls = 'vaz', li = 0, sr = 44100) {
    const a = genLayer(sr, cls, li);
    let s = 0, p = 0; for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; p = Math.max(p, Math.abs(a[i])); }
    // шов: разница соседних отсчётов на стыке против средней
    let d = 0; for (let i = 1; i < a.length; i++) d += Math.abs(a[i] - a[i - 1]);
    return { len: +(a.length / sr).toFixed(3), rms: +Math.sqrt(s / a.length).toFixed(3), peak: +p.toFixed(3), seam: +(Math.abs(a[0] - a[a.length - 1]) / (d / a.length)).toFixed(2) };
  },
  /* громкость смеси 4 петель на оборотах от холостых до красной (OfflineAudioContext, без звука): equal-power — без провала */
  async sweep (cls = 'vaz', steps = 9) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const P = CLS[cls], out = [], g = [0, 0, 0, 0], rate = [1, 1, 1, 1];
    for (let s = 0; s < steps; s++) {
      const rpm = P.idle + (P.red - P.idle) * s / (steps - 1);
      const c = new OAC(1, 22050, 44100);
      crossfade(rpm, P.rpm, g, rate);
      for (let i = 0; i < 4; i++) {
        if (!g[i]) continue;
        const a = genLayer(44100, cls, i), b = c.createBuffer(1, a.length, 44100); b.getChannelData(0).set(a);
        const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.playbackRate.value = rate[i];
        const gg = c.createGain(); gg.gain.value = g[i]; src.connect(gg); gg.connect(c.destination); src.start();
      }
      const buf = await c.startRendering(), a = buf.getChannelData(0);
      let q = 0; for (let i = 0; i < a.length; i++) q += a[i] * a[i];
      out.push({ rpm: Math.round(rpm), layers: g.map(x => +x.toFixed(2)), rms: +Math.sqrt(q / a.length).toFixed(3) });
    }
    return out;
  },
  perf: () => ({ steps: ST.steps, avgMs: +(ST.ms / Math.max(1, ST.steps)).toFixed(4), maxMs: +ST.msMax.toFixed(3), genMs: +ST.genMs.toFixed(1), gen: ST.gen }),
};
