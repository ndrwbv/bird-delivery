/* Удары слоями (М4, 09.10.2026). Правила словами и имена файлов — docs/SOUNDS.md «Удары слоями».

   Удар машины собирается из слоёв, каждый — свой файл public/sfx (или синтез, если файла нет):
     тело     hit-<материал>-<сила>   «бум» того, во что въехал: стена, машина, столб, забор, человек, бак, дерево
     металл   hit-metal-mid / -heavy   хруст и скрежет своего кузова (средний удар и авария)
     бум      hit-boom                 низкий глухой удар — только авария
     стекло   hit-glass / hit-glass-crack / hit-lamp   разбилось / треснуло стекло, разбилась фара (carglass.js)
     обломки  hit-debris               отлетевшая деталь падает на асфальт (cardent.js), на каждый отскок
     петли    scrape-wall / scrape-car  скрежет бортом, пока трёшься о стену / машину
   sfx-names: hit-wall-light, hit-wall-mid, hit-wall-heavy, hit-car-light, hit-car-mid, hit-car-heavy, hit-pole-light, hit-pole-mid, hit-pole-heavy
   sfx-names: hit-fence-light, hit-fence-mid, hit-fence-heavy, hit-person-light, hit-person-mid, hit-person-heavy, hit-bin-light, hit-bin-mid, hit-bin-heavy
   sfx-names: hit-tree-light, hit-tree-mid, hit-tree-heavy, hit-metal-mid, hit-metal-heavy, hit-boom, hit-glass, hit-glass-crack, hit-lamp, hit-debris
   sfx-names: scrape-wall, scrape-car, scrape, crash-heavy, crash-light, crash, clank

   Сила — скорость удара по нормали, м/с (IMP.TIER): лёгкий тычок, средний, авария. Сильнее — больше
   слоёв и громче. Голосов (слоёв) звучит не больше IMP.VOICES: новый важнее — тихо гасит самый
   неважный, нет — не звучит. Один и тот же удар (нос и корма, место столкновения + hurtCar) в IMP.GAP с
   рядом — один раз, если не сильнее прежнего. Вариант файла / синтеза подряд не повторяется.

     init({ Snd })          — из game.js
     hit(v, mat, at, o)     — удар силы v (м/с) о материал mat в точке at { x, z } (без at — «в машине»)
     glass(broken, cracked, lamps, at) — сколько стёкол разбилось / треснуло и фар разбилось за удар
     debris(at, v, key, again) — деталь упала на асфальт со скоростью v м/с (again — повторный отскок)
     rub(k, mat)            — трёшься бортом этот кадр: k 0…1 (от скорости вдоль), mat 'wall' | 'car'
     step()                 — каждый кадр: петля скрежета
     DEBUG                  — __dlv.Snd.hit.DEBUG: ST, last, voices(), render(слой, k) */
import * as SFX from './sfx.js';

export const IMP = {
  TIER: { LIGHT: 2.5, MID: 8, HEAVY: 15 },   // м/с: слабее LIGHT — тихо; с MID — средний; с HEAVY — авария (бьёт сердца о стену)
  VOICES: 6,             // слоёв звучит одновременно, не больше
  GAP: 0.25,             // с — повтор удара ближе GAP_R м: только если сильнее прежнего
  GAP_R: 5,
  RUB_MIN: 3,            // м/с вдоль борта — скрежет с этой скорости, в полную силу — к RUB_FULL
  RUB_FULL: 18,
  RUB_HOLD: 0.12,        // с — петля держится после последнего касания (контакт мигает по кадрам)
};
const T_NAME = ['light', 'mid', 'heavy'];
const OLD = t => (t === 2 ? ['crash-heavy', 'crash'] : ['crash-light', 'crash']);   // старые имена (до М4) — запасные
/* материал: metal / boom — множитель слоя «металл» (с среднего) и «бум» (авария); old — запасные имена тела */
const MAT = {
  wall:   { metal: 1,    boom: 1,    old: OLD },
  car:    { metal: 1.1,  boom: 1,    old: OLD },
  pole:   { metal: 0.85, boom: 0.8,  old: OLD },
  fence:  { metal: 0.45, boom: 0.4,  old: () => ['fence'] },
  person: { metal: 0.3,  boom: 0.5,  old: () => ['hit-person'] },
  bin:    { metal: 0.6,  boom: 0.6,  old: () => ['clank'] },
  tree:   { metal: 0.6,  boom: 0.8,  old: OLD },
};
/* приоритет слоя при нехватке голосов */
const PRIO = { body: 3, boom: 2, metal: 2, glass: 2, debris: 1 };

let A = null;
export const ST = { hits: 0, gated: 0, layers: {}, file: 0, synth: 0, stolen: 0, dropped: 0, tiers: [0, 0, 0], mats: {}, rub: 0, rubMax: 0 };
const LAST = { t: -9, tier: -1, x: 0, z: 0, at: false, info: null };
export function init (api) { A = api; }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
export const tierOf = v => (v >= IMP.TIER.HEAVY ? 2 : v >= IMP.TIER.MID ? 1 : v >= IMP.TIER.LIGHT ? 0 : -1);
export const matOf = m => (MAT[m] ? m : 'wall');
/* материал твёрдого препятствия (стены домов и мелочь, game.js solidsNear): метка s.mat / s.tree, иначе — по габариту */
export function solidMat (s) {
  if (s.mat) return s.mat;
  if (s.tree) return 'tree';
  if (s.rail) return 'fence';
  const a = Math.min(s.hw, s.hd), b = Math.max(s.hw, s.hd);
  if (b <= 0.8) return 'pole';                    // столбы, колонны, тумбы, стелы
  if (a <= 0.35) return 'fence';                  // заборы, оградки, перила
  return 'wall';
}

/* сбиваемая мелочь (SMASH в game.js): материал и доля силы — лёгкое машину почти не держит, удар слабее скорости */
const SMASH_MAT = {
  fence: ['fence', 0.55], bigfence: ['fence', 0.75], table: ['fence', 0.45], bench: ['fence', 0.5], slide: ['fence', 0.5], goal: ['fence', 0.45],
  sign: ['pole', 0.7], lamp: ['pole', 0.75], bush: ['tree', 0.35], bin: ['bin', 0.45], can: ['bin', 0.35], litter: ['bin', 0.3], cone: ['bin', 0.25],
  bricks: ['wall', 0.5], ice: ['wall', 0.3], snowman: ['person', 0.35], sand: ['person', 0.3], pile: ['person', 0.4], glass: ['fence', 0.3],
};
export function smashMat (it) {
  if (it.post) return ['pole', 0.75];
  return SMASH_MAT[it.kind] || ['fence', 0.4];
}

/* ─── варианты: подряд не повторяется ─── */
const VAR = {};
function variant (key, n) {
  let i = (Math.random() * n) | 0;
  if (n > 1 && i === VAR[key]) i = (i + 1 + ((Math.random() * (n - 1)) | 0)) % n;
  VAR[key] = i;
  return i;
}

/* ─── голоса: не больше IMP.VOICES слоёв разом ─── */
const VO = [];
function voice (c, prio, dur, out) {
  const now = c.currentTime;
  for (let i = VO.length - 1; i >= 0; i--) if (VO[i].end <= now) VO.splice(i, 1);
  if (VO.length >= IMP.VOICES) {
    let w = -1;
    for (let i = 0; i < VO.length; i++) {
      const v = VO[i];
      if (v.prio > prio) continue;
      if (w < 0 || v.prio < VO[w].prio || (v.prio === VO[w].prio && v.end < VO[w].end)) w = i;
    }
    if (w < 0) { ST.dropped++; return null; }
    try { VO[w].g.gain.setTargetAtTime(0, now, 0.015); } catch (e) { /* — */ }
    VO.splice(w, 1); ST.stolen++;
  }
  const g = c.createGain();
  g.connect(out);
  const v = { end: now + dur, prio, g };
  VO.push(v);
  return v;
}

/* один слой: файл (первое имя с файлом) или синтез; v — громкость 0…1; → имя, что прозвучало, или null */
function layer (c, out, kind, names, v, syn, k) {
  const vo = voice(c, PRIO[kind] || 1, 1, out);
  if (!vo) return null;
  for (const n of names) {
    const d = SFX.play(n, vo.g, v);
    if (d) { vo.end = c.currentTime + (typeof d === 'number' ? d : 1); ST.file++; count(n); return n; }
  }
  SFX.synthed(names[0]);
  const d = syn(c, vo.g, c.currentTime + 0.005, clamp(v, 0, 1.2), k);
  vo.end = c.currentTime + d;
  ST.synth++; count(names[0]);
  return names[0];
}
const count = n => { ST.layers[n] = (ST.layers[n] || 0) + 1; };

/* общий узел удара: громкость от расстояния и сторона (sfx.js); null — дальше, чем слышно */
function outFor (at) {
  const Snd = A && A.Snd;
  if (!Snd || !Snd.ctx || !Snd.on || !Snd.sfxBus) return null;
  const sp = at ? SFX.place(at) : null;
  if (sp && sp.g <= 0) return null;
  return SFX.node(Snd.sfxBus, sp);
}

/** удар силы v (м/с) о материал mat в точке at (без at — «в машине», по центру) → { v, mat, tier, layers } или null */
export function hit (v, mat, at) {
  v = +v || 0;
  const tier = tierOf(v);
  if (tier < 0) return null;
  mat = matOf(mat);
  const Snd = A && A.Snd, c = Snd && Snd.ctx;
  if (!c) return null;
  const now = c.currentTime;
  // тот же удар (нос и корма, место столкновения и hurtCar): один раз, если не сильнее
  const near = !at || !LAST.at || Math.hypot(at.x - LAST.x, at.z - LAST.z) < IMP.GAP_R;
  if (now - LAST.t < IMP.GAP && tier <= LAST.tier && near) { ST.gated++; return null; }
  const out = outFor(at);
  if (!out) return null;
  LAST.t = now; LAST.tier = tier; LAST.at = !!at; if (at) { LAST.x = at.x; LAST.z = at.z; }
  ST.hits++; ST.tiers[tier]++; ST.mats[mat] = (ST.mats[mat] || 0) + 1;
  const M = MAT[mat], T = IMP.TIER;
  // сила внутри ступени 0…1 и громкость слоя тела: тычок 0,45—0,7, средний 0,7—0,9, авария 0,9—1
  const lo = [T.LIGHT, T.MID, T.HEAVY][tier], hi = [T.MID, T.HEAVY, 30][tier];
  const kin = clamp((v - lo) / (hi - lo), 0, 1);
  const vol = [0.45, 0.7, 0.9][tier] + kin * [0.25, 0.2, 0.1][tier];
  const k = clamp((v - T.LIGHT) / 25, 0, 1);          // общая сила 0…1 — для синтеза
  const vi = variant(mat + tier, 3);
  const body = 'hit-' + mat + '-' + T_NAME[tier];
  const played = [];
  const bn = layer(c, out, 'body', [body, ...M.old(tier)], vol, (cc, o, t, vv) => SYN[mat](cc, o, t, vv, k, tier, vi), k);
  if (bn) played.push(bn);
  const legacy = bn && bn !== body && OLD(tier).includes(bn);   // старый «crash» — металл и бум в нём уже есть
  if (tier >= 1 && !legacy) {
    const mv = M.metal * (tier === 2 ? 0.85 : 0.5) * (0.85 + kin * 0.15);
    const mi = variant('metal' + tier, 3);
    const n = layer(c, out, 'metal', ['hit-metal-' + T_NAME[tier], 'scrape'], mv, (cc, o, t, vv) => synMetal(cc, o, t, vv, k, tier, mi), k);
    if (n) played.push(n);
  }
  if (tier === 2 && !legacy) {
    const bi = variant('boom', 3);
    const n = layer(c, out, 'boom', ['hit-boom'], M.boom * (0.75 + kin * 0.25), (cc, o, t, vv) => synBoom(cc, o, t, vv, k, bi), k);
    if (n) played.push(n);
  }
  const info = { v: +v.toFixed(1), mat, tier: T_NAME[tier], layers: played };
  LAST.info = info;
  return info;
}

/** стекло за удар (dentCar своей машины): broken — разбилось стёкол, cracked — треснуло, lamps — фар */
export function glass (broken, cracked, lamps, at) {
  if (!(broken > 0 || cracked > 0 || lamps > 0)) return null;
  const c = A && A.Snd && A.Snd.ctx, out = c && outFor(at);
  if (!out) return null;
  const got = [];
  const go = (name, v, syn) => { const vi = variant(name, 3); const n = layer(c, out, 'glass', [name, 'glass'], v, (cc, o, t, vv) => syn(cc, o, t, vv, vi)); if (n) got.push(n); };
  if (broken > 0) go('hit-glass', Math.min(1, 0.8 + broken * 0.15), synGlass);
  else if (cracked > 0) go('hit-glass-crack', 0.7, synCrack);
  if (lamps > 0) go('hit-lamp', Math.min(1, 0.6 + lamps * 0.15), synLamp);
  return got;
}

/** деталь (бампер, крышка, зеркало, колпак) ударилась об асфальт: v — скорость падения, м/с */
const DEB_K = { bumperF: 1, bumperR: 1, trunk: 1, hub: 0.6 };
export function debris (at, v, key, again) {
  const c = A && A.Snd && A.Snd.ctx, out = c && outFor(at);
  if (!out) return null;
  const vol = clamp((v - 1) / 7, 0.15, 1) * (DEB_K[key] || 0.7) * (again ? 0.6 : 1);
  if (vol < 0.12) return null;
  const vi = variant('debris', 3), small = key === 'hub' || /^mirror/.test(key || '');
  return layer(c, out, 'debris', ['hit-debris'], vol, (cc, o, t, vv) => synDebris(cc, o, t, vv, vi, small));
}

/* ─── скрежет бортом: одна петля, пока трёшься ─── */
const RUB = { want: 0, mat: 'wall', at: -9, lvl: 0, set: -1, ch: null, name: '' };
/** k 0…1 — сила трения этот кадр (вызывать из столкновения), mat — 'wall' | 'car' */
export function rub (k, mat) {
  const c = A && A.Snd && A.Snd.ctx;
  if (!c || !(k > 0)) return;
  if (k >= RUB.want || c.currentTime - RUB.at > 0.05) { RUB.want = clamp(k, 0, 1); RUB.mat = mat === 'car' ? 'car' : 'wall'; }
  RUB.at = c.currentTime;
}
/** скорость вдоль борта → k для rub() */
export const rubK = sp => clamp((sp - IMP.RUB_MIN) / (IMP.RUB_FULL - IMP.RUB_MIN), 0, 1);

export function step () {
  const Snd = A && A.Snd, c = Snd && Snd.ctx;
  if (!c) return;
  const on = Snd.on && c.currentTime - RUB.at < IMP.RUB_HOLD;
  const w = on ? 0.25 + RUB.want * 0.75 : 0;
  RUB.lvl = w;
  if (w > 0) { ST.rubMax = Math.max(ST.rubMax, w); }
  const name = RUB.mat === 'car' ? 'scrape-car' : 'scrape-wall';
  if (w > 0 && (!RUB.ch || (RUB.ch.file && RUB.name !== name))) rubStart(c, Snd.sfxBus, name);
  const ch = RUB.ch;
  if (!ch) return;
  if (Math.abs(w - RUB.set) > 0.04 || (w === 0 && RUB.set !== 0)) {
    const t = c.currentTime;
    ch.g.gain.setTargetAtTime(w * ch.vol, t, w > RUB.set ? 0.03 : 0.08);
    if (ch.src.playbackRate) ch.src.playbackRate.setTargetAtTime(ch.file ? 0.85 + RUB.want * 0.3 : 1, t, 0.1);
    if (ch.f) {
      const car = RUB.mat === 'car';
      ch.f.frequency.setTargetAtTime((car ? 2300 : 1100) * (0.8 + RUB.want * 0.6), t, 0.08);
      ch.f.Q.setTargetAtTime(car ? 2.4 : 0.9, t, 0.08);
    }
    RUB.set = w;
  }
  if (w === 0) { if ((ch.quiet = (ch.quiet || 0) + 1) > 40) rubStop(); }   // ~0,7 с тишины — отцепить
  else { ch.quiet = 0; ST.rub++; }
}
function rubStart (c, bus, name) {
  rubStop();
  const buf = SFX.buffer(name) || SFX.buffer(name === 'scrape-car' ? 'scrape-wall' : 'scrape-car') || SFX.buffer('scrape');
  const g = c.createGain(); g.gain.value = 0; g.connect(bus);
  const src = c.createBufferSource(); src.loop = true;
  let f = null, am = null, lfo = null, vol;
  if (buf) {
    src.buffer = buf; src.connect(g); vol = SFX.fileGain(name) * 0.8;
  } else {
    // синтез: шум через полосу (стена ниже и глуше, машина — выше и звонче), «дрожь» скрежета — пила 17—29 Гц по громкости
    src.buffer = noiseBuf(c);
    f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.9;
    am = c.createGain(); am.gain.value = 0.65;
    lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = rnd(17, 29);
    const lg = c.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain); lfo.start();
    src.connect(f); f.connect(am); am.connect(g);
    vol = 0.24;
    SFX.synthed(name);
  }
  src.start(0, Math.random() * (src.buffer.duration - 0.1));
  RUB.ch = { src, g, f, am, lfo, vol, file: !!buf, quiet: 0 };
  RUB.name = name; RUB.set = -1;
}
function rubStop () {
  const ch = RUB.ch;
  if (!ch) return;
  for (const n of [ch.src, ch.lfo]) { try { if (n) n.stop(); } catch (e) { /* — */ } }
  for (const n of [ch.src, ch.f, ch.am, ch.lfo, ch.g]) { try { if (n) n.disconnect(); } catch (e) { /* — */ } }
  RUB.ch = null;
}

/* ─────────────── синтез: кирпичики ─────────────── */
const NB = new WeakMap();
function noiseBuf (c) {
  let b = NB.get(c);
  if (b) return b;
  const n = c.sampleRate * 2;
  b = c.createBuffer(1, n, c.sampleRate);
  const a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  NB.set(c, b);
  return b;
}
function env (c, out, t, v, d, a = 0.003) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out);
  return g;
}
/* тон: частота f0 → f1 за d, громкость v */
function tone (c, out, t, type, f0, f1, d, v) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
  o.connect(env(c, out, t, v, d));
  o.start(t); o.stop(t + d + 0.05);
  return d;
}
/* шум через фильтр type (частота f → f1), длина d */
function nz (c, out, t, d, v, type, f, q = 1, f1, a) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c);
  const b = c.createBiquadFilter(); b.type = type; b.Q.value = q;
  b.frequency.setValueAtTime(f, t);
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + d);
  s.connect(b); b.connect(env(c, out, t, v, d, a));
  s.start(t, Math.random() * 1.5, d + 0.06);
  return d;
}
/* звон металла: несколько негармоничных синусов, верхние гаснут быстрее */
function ring (c, out, t, fs, d, v) {
  fs.forEach((f, i) => tone(c, out, t, 'sine', f, f * 0.996, d * (1 - i * 0.14), v / (1 + i * 0.6)));
  return d;
}
/* дребезг: n щелчков шума с шагом dt, тише к концу */
function rattle (c, out, t, n, dt, v, f0, f1, q = 2.5) {
  let e = 0;
  for (let i = 0; i < n; i++) {
    e += dt * rnd(0.6, 1.4);
    nz(c, out, t + e, rnd(0.02, 0.05), v * (1 - i / (n + 1)), 'bandpass', rnd(f0, f1), q);
  }
  return e + 0.06;
}

/* ─── тело: «бум» по материалу. v — громкость 0…1, k — сила 0…1, tier 0…2, vi — вариант 0…2 ─── */
const VR = [0.92, 1, 1.1];                         // высота варианта
const SYN = {
  wall (c, o, t, v, k, tier, vi) {                 // бетон, кирпич: низкий глухой удар, короткий хвост
    const r = VR[vi] * rnd(0.97, 1.03);
    let d = tone(c, o, t, 'sine', 105 * r, 38, 0.16 + 0.22 * k, 0.5 * v);
    d = Math.max(d, nz(c, o, t, 0.1 + 0.2 * k, 0.4 * v, 'lowpass', 900 * r, 0.7, 260));
    if (tier >= 1) d = Math.max(d, nz(c, o, t + 0.01, 0.06, 0.25 * v, 'bandpass', 1800 * r, 1.2));   // крошка
    if (tier === 2) d = Math.max(d, nz(c, o, t, 0.45, 0.3 * v, 'lowpass', 240, 0.7));              // гул
    return d + 0.05;
  },
  car (c, o, t, v, k, tier, vi) {                  // жесть о жесть: «бонг» панели и хлопок
    const r = VR[vi] * rnd(0.97, 1.03);
    let d = tone(c, o, t, 'triangle', 150 * r, 62, 0.14 + 0.2 * k, 0.4 * v);
    d = Math.max(d, nz(c, o, t, 0.09 + 0.18 * k, 0.4 * v, 'bandpass', 1400 * r, 1.4, 700));
    d = Math.max(d, ring(c, o, t, [310 * r, 523 * r * (1 + vi * 0.03), 788 * r], 0.25 + 0.3 * k, (0.08 + 0.08 * k) * v));
    return d + 0.05;
  },
  pole (c, o, t, v, k, tier, vi) {                 // столб, фонарь: звонкий «донг» с долгим хвостом
    const r = VR[vi] * rnd(0.97, 1.03);
    let d = ring(c, o, t, [440 * r, 1185 * r, 2350 * r, 3120 * r], 0.35 + 0.55 * k + tier * 0.1, (0.13 + 0.07 * k) * v);
    d = Math.max(d, tone(c, o, t, 'sine', 190 * r, 90, 0.1, 0.35 * v));
    d = Math.max(d, nz(c, o, t, 0.04, 0.25 * v, 'highpass', 2600, 0.8));
    return d + 0.05;
  },
  fence (c, o, t, v, k, tier, vi) {                // доски, сетка, перила: стук и дребезг
    const r = VR[vi] * rnd(0.95, 1.05);
    let d = tone(c, o, t, 'triangle', 230 * r, 140, 0.08, 0.3 * v);
    d = Math.max(d, rattle(c, o, t, 3 + tier * 3 + vi, 0.03 + 0.01 * vi, 0.75 * v, 800 * r, 2200 * r, 1.8));
    if (tier >= 1) d = Math.max(d, nz(c, o, t, 0.15, 0.45 * v, 'bandpass', 600 * r, 1.2));        // треск доски
    return d + 0.05;
  },
  person (c, o, t, v, k, tier, vi) {               // мягкое тело: глухой шлепок без звона
    const r = VR[vi] * rnd(0.95, 1.05);
    let d = tone(c, o, t, 'sine', 78 * r, 44, 0.15 + 0.1 * k, 0.55 * v);
    d = Math.max(d, nz(c, o, t, 0.09 + 0.06 * k, 0.35 * v, 'lowpass', 380 * r, 0.8));
    if (tier >= 1) d = Math.max(d, 0.02 + nz(c, o, t + 0.02, 0.06, 0.2 * v, 'bandpass', 950 * r, 1.2));   // шлепок
    return d + 0.05;
  },
  bin (c, o, t, v, k, tier, vi) {                  // мусорка, бак, контейнер, ракушка: гулкое пустое железо
    const r = VR[vi] * rnd(0.97, 1.03);
    let d = ring(c, o, t, [172 * r, 415 * r, 760 * r, 1290 * r], 0.3 + 0.35 * k, (0.12 + 0.06 * k) * v);
    d = Math.max(d, tone(c, o, t, 'triangle', 115 * r, 68, 0.12, 0.3 * v));
    d = Math.max(d, nz(c, o, t, 0.07, 0.3 * v, 'bandpass', 1800 * r, 1.2));
    if (tier >= 1) d = Math.max(d, 0.05 + rattle(c, o, t + 0.05, 2 + tier * 2, 0.07, 0.2 * v, 500, 1500, 3));   // кувыркается
    return d + 0.05;
  },
  tree (c, o, t, v, k, tier, vi) {                 // ствол, куст: деревянный стук и шорох листвы
    const r = VR[vi] * rnd(0.95, 1.05);
    let d = tone(c, o, t, 'triangle', 210 * r, 118, 0.1 + 0.05 * k, 0.4 * v);
    d = Math.max(d, nz(c, o, t, 0.08, 0.6 * v, 'bandpass', 520 * r, 2));
    d = Math.max(d, nz(c, o, t + 0.02, 0.3 + 0.4 * k, (0.06 + 0.08 * k) * v, 'highpass', 3000 * r, 0.7, null, 0.06));   // листва
    if (tier === 2) d = Math.max(d, nz(c, o, t, 0.25, 0.25 * v, 'lowpass', 300, 0.7));
    return d + 0.05;
  },
};
/* металл своего кузова: хруст из щелчков и скрежет, авария — дольше и гуще */
function synMetal (c, o, t, v, k, tier, vi) {
  const n = tier === 2 ? 10 + vi * 2 : 5 + vi;
  let d = rattle(c, o, t, n, tier === 2 ? 0.035 : 0.03, 0.9 * v, 900, 3200, 1.6);
  d = Math.max(d, nz(c, o, t, 0.2 + 0.25 * k, 0.4 * v, 'bandpass', 2400 * VR[vi], 3, 1500));   // визг жести
  if (tier === 2) d = Math.max(d, nz(c, o, t + 0.03, 0.4, 0.3 * v, 'bandpass', 700, 1.2, 400));
  return d + 0.05;
}
/* низкий удар аварии: «в грудь» */
function synBoom (c, o, t, v, k, vi) {
  let d = tone(c, o, t, 'sine', 64 * VR[vi], 27, 0.45 + 0.15 * k, 0.6 * v);
  d = Math.max(d, nz(c, o, t, 0.35, 0.35 * v, 'lowpass', 190, 0.7));
  return d + 0.05;
}
/* стекло разбилось: звон осколков, шипение, потом дробь падающих */
function synGlass (c, o, t, v, vi) {
  let d = nz(c, o, t, 0.22, 0.25 * v, 'highpass', 4200, 0.7);
  const n = 6 + vi * 2;
  for (let i = 0; i < n; i++) { const e = rnd(0, 0.22); d = Math.max(d, e + tone(c, o, t + e, 'sine', rnd(2400, 6500), rnd(2300, 6300), rnd(0.04, 0.12), rnd(0.04, 0.08) * v)); }
  for (let i = 0; i < 4; i++) { const e = rnd(0.25, 0.6); d = Math.max(d, e + tone(c, o, t + e, 'sine', rnd(3000, 7000), 2900, 0.05, 0.03 * v)); }
  return d + 0.05;
}
/* треснуло: сухой щелчок и пара звонких точек */
function synCrack (c, o, t, v, vi) {
  let d = nz(c, o, t, 0.05, 0.25 * v, 'highpass', 3500, 0.8);
  for (let i = 0; i < 2 + vi; i++) { const e = rnd(0, 0.06); d = Math.max(d, e + tone(c, o, t + e, 'sine', rnd(3000, 4800), 2900, 0.06, 0.05 * v)); }
  return d + 0.05;
}
/* фара: пластиковый хлопок и звонкие осколки */
function synLamp (c, o, t, v, vi) {
  let d = nz(c, o, t, 0.06, 0.8 * v, 'bandpass', 3000 * VR[vi], 1.5);
  for (let i = 0; i < 3 + vi; i++) { const e = rnd(0.01, 0.15); d = Math.max(d, e + tone(c, o, t + e, 'sine', rnd(3500, 6000), 3300, 0.05, 0.08 * v)); }
  return d + 0.05;
}
/* деталь об асфальт: пара отскоков — пластик и жесть */
function synDebris (c, o, t, v, vi, small) {
  const f = small ? 1600 : 800;
  let d = 0, e = 0;
  for (let i = 0; i < 2 + vi; i++) {
    d = Math.max(d, e + nz(c, o, t + e, 0.06, 1.1 * v * (1 - i * 0.25), 'bandpass', f * rnd(0.8, 1.3), 1.8));
    e += rnd(0.06, 0.13) * (1 - i * 0.2);
  }
  d = Math.max(d, ring(c, o, t, [f * 0.65 * VR[vi], f * 1.6 * VR[vi]], 0.15, 0.1 * v));
  return d + 0.05;
}

/* ─── отладка ─── */
export const DEBUG = {
  IMP, MAT, ST, get last () { return LAST.info; },
  voices () { const c = A && A.Snd && A.Snd.ctx; return c ? VO.filter(v => v.end > c.currentTime).length : 0; },
  rub: () => ({ lvl: +RUB.lvl.toFixed(2), mat: RUB.mat, on: !!RUB.ch, file: !!(RUB.ch && RUB.ch.file) }),
  solidMat, smashMat, tierOf,
  /* громкость синтеза слоя без звука (OfflineAudioContext): name — 'wall' … 'tree' (тело), 'metal', 'boom', 'glass', 'crack', 'lamp', 'debris';
     v — сила удара м/с → { rms, peak, dur } */
  async render (name, v = 10) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const c = new OAC(1, 44100 * 2, 44100), out = c.createGain();
    out.connect(c.destination);
    const tier = Math.max(0, tierOf(v)), k = clamp((v - IMP.TIER.LIGHT) / 25, 0, 1), vol = [0.55, 0.8, 0.95][tier];
    const f = SYN[name] ? (cc, o, t) => SYN[name](cc, o, t, vol, k, tier, 1)
      : { metal: (cc, o, t) => synMetal(cc, o, t, 0.8, k, Math.max(1, tier), 1), boom: (cc, o, t) => synBoom(cc, o, t, 0.9, k, 1),
        glass: (cc, o, t) => synGlass(cc, o, t, 0.9, 1), crack: (cc, o, t) => synCrack(cc, o, t, 0.7, 1),
        lamp: (cc, o, t) => synLamp(cc, o, t, 0.8, 1), debris: (cc, o, t) => synDebris(cc, o, t, 0.8, 1, false) }[name];
    if (!f) return null;
    const dur = f(c, out, 0.01);
    const buf = await c.startRendering(), a = buf.getChannelData(0);
    let sq = 0, pk = 0;
    for (let i = 0; i < a.length; i++) { sq += a[i] * a[i]; pk = Math.max(pk, Math.abs(a[i])); }
    return { rms: +Math.sqrt(sq / a.length).toFixed(4), peak: +pk.toFixed(3), dur: +dur.toFixed(2) };
  },
};
