/* Тёплый синтез звуков (11г, 10.10.2026). Правила словами — docs/SOUNDS.md «Тёплый стиль синтеза».

   Образец — удар о столб и визг тормозов (impact.js, motor.js): у звука есть низ (саб на октаву ниже
   или глухой «бум»), тело (тон через фильтр, без голого квадрата), мягкая атака (3—25 мс вместо щелчка)
   и хвост (гаснет сам, плюс отзвук улицы — общая реверберация). Здесь — общий набор «инструментов» и
   таблица: какое имя звука каким инструментом играть.

   Как подключено: Snd.fx(имя, синтез) в game.js отдаёт синтезу не голые blip / noise, а kit(имя) —
   те же s.blip(f, d, тип, v) и s.noise(d, v), но каждая нота играется инструментом имени (TIMBRE):
   колокольчик, дерево, глухой удар, клаксон, динамик домофона, голос, собака… Партитура звонящего
   (высоты, ритм, громкость) остаётся его, меняется только звучание. s.out — вход «полосы» звука:
   свой синтез модуля (лёд, гром, поезд) тоже получает отзвук. Звук в мире вдали — глуше (воздух) и
   с большей долей отзвука.

     kit(c, out, name)        — для Snd.fx: { ctx, out, blip, noise, preset }
     blip(c, out, f, d, type, v) / noise(c, out, d, v) — то же без имени (Snd.blip / Snd.noise)
     siren(c, out, o)         — нота сирены скорой: o = { hi, d0, d1, dur } (d0 / d1 — доплер в начале и конце)
     doppler(src, lis, at)    — множитель высоты от скоростей источника и слушателя
     DEBUG                    — __dlv.Snd.warm: TIMBRE, CLOCK (сдвиг времени для отрисовки без звука) */

const LATER = typeof setTimeout === 'function' ? setTimeout.bind(globalThis) : () => 0;   // свой: проверки подменяют setTimeout
/* сдвиг «сейчас» в секундах: проверка рисует партитуру в OfflineAudioContext, подменяя setTimeout (DEBUG) */
export const CLOCK = { off: 0 };
const T0 = c => c.currentTime + CLOCK.off + 0.003;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

/* общий стиль: громкость отзвука по умолчанию, отзвук улицы, доплер */
export const WARM = {
  WET: 0.16,          // доля в отзвук (реверберацию) у звука по умолчанию
  ROOM: 5,            // громкость возврата реверберации (свёртка сама сильно приглушает: так отзвук ~−14 дБ к звуку при WET)
  ECHO: [0.13, 0.21], // с — две задержки «эха улиц» (сирена, клаксоны)
  ECHO_FB: 0.3,
  DOP: { C: 343, K: 1.4, MIN: 0.8, MAX: 1.25 },   // доплер: скорость звука, преувеличение, пределы
};

/* ─────────────── общие узлы на контекст ─────────────── */
const NB = new WeakMap(), IRB = new WeakMap(), ROOMS = new WeakMap(), ECHOS = new WeakMap();
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
/* отклик «двор-колодец»: ранние отражения от стен и тёмный хвост ~1,4 с (к концу глуше) */
function irBuf (c) {
  let b = IRB.get(c);
  if (b) return b;
  const sr = c.sampleRate, len = (sr * 1.5) | 0;
  b = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const a = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const k = 0.75 - 0.6 * Math.min(1, t / 1.1);            // однополюсный фильтр: хвост темнеет
      lp += (Math.random() * 2 - 1 - lp) * k;
      a[i] = lp * Math.exp(-t / 0.24) * Math.min(1, t / 0.012);
    }
    [0.011, 0.019, 0.027, 0.038, 0.052].forEach((s, j) => {
      const i = ((s * (ch ? 1.09 : 1)) * sr) | 0;
      if (i < len) a[i] += (ch ? -1 : 1) * (0.55 - j * 0.08);
    });
  }
  IRB.set(c, b);
  return b;
}
function biq (c, type, f, q = 0.7, gain = 0) {
  const b = c.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  if (gain) b.gain.value = gain;
  return b;
}
function gn (c, v) { const g = c.createGain(); g.gain.value = v; return g; }
/* реверберация шины: одна на шину (звуки / мотор), вход → без гула и верхов → свёртка → шина */
function room (c, bus) {
  let i = ROOMS.get(bus);
  if (i) return i;
  i = gn(c, 1);
  const hp = biq(c, 'highpass', 170), lp = biq(c, 'lowpass', 5200), cv = c.createConvolver(), r = gn(c, WARM.ROOM);
  cv.buffer = irBuf(c);
  i.connect(hp); hp.connect(lp); lp.connect(cv); cv.connect(r); r.connect(bus);
  ROOMS.set(bus, i);
  return i;
}
/* эхо улиц: две короткие задержки, отражения глуше (фильтр в петле) */
function echo (c, bus) {
  let i = ECHOS.get(bus);
  if (i) return i;
  i = gn(c, 1);
  const r = gn(c, 0.55);
  WARM.ECHO.forEach((s, j) => {
    const dl = c.createDelay(1), lp = biq(c, 'lowpass', j ? 1500 : 2100), fb = gn(c, WARM.ECHO_FB * (j ? 0.7 : 1));
    dl.delayTime.value = s;
    i.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(r);
  });
  r.connect(bus);
  ECHOS.set(bus, i);
  return i;
}
/* «полоса» одного звука: вход → (вдали — глуше) → out; и доля в отзвук / эхо.
   out.__bus / out.__sp ставит sfx.js node(): шина и громкость от расстояния */
function strip (c, out, P) {
  const bus = out.__bus || out, spg = out.__sp == null ? 1 : clamp(out.__sp, 0, 1);
  const i = gn(c, 1), nodes = [i];
  if (spg < 0.95) {
    const lp = biq(c, 'lowpass', 1400 + 16000 * spg * spg, 0.5);
    i.connect(lp); lp.connect(out); nodes.push(lp);
  } else i.connect(out);
  const far = Math.sqrt(Math.max(spg, 0.0001));               // сухой звук тише как k², отзвук — как k: вдали эхо слышнее
  const wet = (P.wet == null ? WARM.WET : P.wet) * far;
  if (wet > 0.001) { const s = gn(c, wet); i.connect(s); s.connect(room(c, bus)); nodes.push(s); }
  if (P.echo) { const e = gn(c, P.echo * far); i.connect(e); e.connect(echo(c, bus)); nodes.push(e); }
  LATER(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* — */ } } }, 12000);
  return i;
}

/* ─────────────── кирпичики ─────────────── */
/* огибающая: тишина → мягкий подъём a → к hold·v за d → хвост tail до тишины */
function envG (c, dest, t, a, v, d, hold, tail) {
  const g = c.createGain(), p = g.gain;
  v = Math.max(v, 2e-5);
  p.setValueAtTime(1e-5, t);
  p.linearRampToValueAtTime(v, t + a);
  p.exponentialRampToValueAtTime(Math.max(v * hold, 1.5e-5), t + a + d);
  p.exponentialRampToValueAtTime(1e-5, t + a + d + tail);
  g.connect(dest);
  return { g, end: t + a + d + tail + 0.03 };
}
function osc (c, type, f, t, end, nodes) {
  const o = c.createOscillator();
  o.type = type; o.frequency.setValueAtTime(clamp(f, 20, 16000), t);
  o.start(t); o.stop(end);
  nodes.push(o);
  return o;
}
function done (src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* — */ } } };
}
/* шум через фильтр с мягкой огибающей */
function nzf (c, dest, t, d, v, a, type, f, q, f1, nodes) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c);
  const b = biq(c, type, f, q);
  if (f1 && f1 !== f) b.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  const g = c.createGain(), p = g.gain;
  p.setValueAtTime(1e-5, t); p.linearRampToValueAtTime(Math.max(v, 2e-5), t + a); p.exponentialRampToValueAtTime(1e-5, t + a + d);
  s.connect(b); b.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5, a + d + 0.05);
  const ns = [s, b, g];
  if (nodes) nodes.push(...ns); else done(s, ns);
  return s;
}

/* саб — октава вниз, у высоких нот — ещё ниже, чтобы низ был ниже 260 Гц (не ниже 45 Гц) */
function subF (f) {
  let s = f / 2;
  while (s > 260) s /= 2;
  return s < 45 ? f : s;
}

/* ─────────────── инструменты: (c, вход, t, f, d, тип, v, P) ───────────────
   f — уже с переносом октавы (P.oct), v — громкость с поправкой имени (P.g) */
const INST = {
  /* по умолчанию: тон через фильтр (квадрат и пила — мягче), пара чуть расстроенных голосов, саб на октаву ниже */
  warm (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const a = P.a == null ? 0.007 : P.a, hold = P.hold == null ? 0.45 : P.hold, tail = P.tail == null ? 0.07 + d * 0.9 : P.tail;
    const E = envG(c, dest, t, a, v, d, hold, tail); nodes.push(E.g);
    const bright = type === 'square' || type === 'sawtooth';
    const cut = Math.min(P.lp || 4200, f * (bright ? 3 : 5));
    const lp = biq(c, 'lowpass', cut * 1.8, 0.6); nodes.push(lp);
    lp.frequency.setValueAtTime(cut * 1.8, t); lp.frequency.exponentialRampToValueAtTime(cut, t + a + d * 0.7 + 0.02);
    lp.connect(E.g);
    const m = gn(c, bright ? 0.5 : 0.6); nodes.push(m); m.connect(lp);
    const o1 = osc(c, type, f, t, E.end, nodes), o2 = osc(c, type, f, t, E.end, nodes);
    o2.detune.value = P.det == null ? 7 : P.det;
    if (P.glide) for (const o of [o1, o2]) o.frequency.exponentialRampToValueAtTime(clamp(f * P.glide, 20, 16000), t + a + d);
    o1.connect(m); o2.connect(m);
    const sf = subF(f);
    const so = osc(c, 'sine', sf, t, E.end, nodes), sg = gn(c, P.low == null ? 0.5 : P.low); nodes.push(sg);
    if (P.glide) so.frequency.exponentialRampToValueAtTime(clamp(sf * P.glide, 20, 8000), t + a + d);
    so.connect(sg); sg.connect(E.g);
    if (P.vib) {
      const l = osc(c, 'sine', P.vibF || 5.5, t, E.end, nodes), lg = gn(c, f * P.vib); nodes.push(lg);
      l.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    }
    done(o1, nodes);
  },
  /* колокольчик: основной тон и негармоничные обертоны (верхние гаснут быстрее), мягкий саб — «дзинь» с хвостом */
  bell (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const a = P.a == null ? 0.004 : P.a, tail = (P.tail == null ? 0.45 : P.tail) + d * 0.8;
    const parts = P.parts || [[1, 1, 1], [2, 0.32, 0.6], [2.76, 0.17, 0.4], [5.4, 0.06, 0.22]];
    let first = null;
    for (const [r, amp, share] of parts) {
      const ff = f * r * (r === 1 ? 1 : rnd(0.997, 1.003));
      if (ff > 9000) continue;
      const E = envG(c, dest, t, a, v * amp, 0.01, 0.9, tail * share); nodes.push(E.g);
      const o = osc(c, 'sine', ff, t, E.end, nodes); o.connect(E.g);
      if (!first) first = o;
    }
    const lo = P.low == null ? 0.35 : P.low;
    if (lo > 0) {
      const E = envG(c, dest, t, 0.01, v * lo, 0.02, 0.85, tail * 0.65); nodes.push(E.g);
      const o = osc(c, 'sine', subF(f), t, E.end, nodes); o.connect(E.g);
    }
    done(first, nodes);
  },
  /* дерево: тихий щелчок шумом, короткое тело и мягкий «ток» снизу — кнопки, барабан, тиканье, шаги */
  wood (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const body = 0.035 + d * 0.6, tail = P.tail == null ? 0.06 : P.tail;
    nzf(c, dest, t, 0.018 + d * 0.2, v * 0.55, 0.002, 'bandpass', clamp(f * 1.6, 300, 6000), 1.4, null, nodes);
    const E = envG(c, dest, t, P.a == null ? 0.003 : P.a, v, body, 0.3, tail); nodes.push(E.g);
    const o = osc(c, 'triangle', f, t, E.end, nodes);
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + body);
    const lp = biq(c, 'lowpass', Math.min(4000, f * 3), 0.7); nodes.push(lp);
    o.connect(lp); lp.connect(E.g);
    const E2 = envG(c, dest, t, 0.004, v * (P.low == null ? 0.7 : P.low), 0.05 + d * 0.4, 0.3, 0.05); nodes.push(E2.g);
    const s = osc(c, 'sine', Math.max(55, f * 0.5), t, E2.end, nodes);
    s.frequency.exponentialRampToValueAtTime(Math.max(45, f * 0.36), t + 0.09 + d * 0.4);
    s.connect(E2.g);
    done(o, nodes);
  },
  /* глухой удар: синус сверху вниз, мягкий шум снизу, у печати / двери — шлепок по полосе (P.slap, Гц) */
  thump (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const len = 0.08 + d * 0.9, tail = P.tail == null ? 0.08 : P.tail;
    const E = envG(c, dest, t, P.a == null ? 0.003 : P.a, v, len, 0.25, tail); nodes.push(E.g);
    const o = osc(c, 'sine', f * 1.3, t, E.end, nodes);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.55), t + len);
    o.connect(E.g);
    const o2 = osc(c, 'triangle', f * 2, t, E.end, nodes), g2 = gn(c, 0.18); nodes.push(g2);
    o2.frequency.exponentialRampToValueAtTime(Math.max(40, f * 1.1), t + len * 0.6);
    o2.connect(g2); g2.connect(E.g);
    nzf(c, dest, t, len * 0.6 + 0.03, v * 0.5, 0.003, 'lowpass', clamp(f * 4, 300, 3000), 0.7, Math.max(150, f * 1.5), nodes);
    if (P.slap) nzf(c, dest, t, 0.03 + d * 0.15, v * (P.slapV || 0.45), 0.002, 'bandpass', P.slap, 1.2, null, nodes);
    done(o, nodes);
  },
  /* клаксон: две пилы терцией, рупор (две полосы), саб — «бип» машины с телом */
  horn (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const E = envG(c, dest, t, P.a == null ? 0.014 : P.a, v, d, 0.85, P.tail == null ? 0.1 : P.tail); nodes.push(E.g);
    const lp = biq(c, 'lowpass', P.lp || 2600, 0.7), pk1 = biq(c, 'peaking', 480, 1.1, 6), pk2 = biq(c, 'peaking', 1500, 1.3, 3);
    nodes.push(lp, pk1, pk2);
    pk1.connect(pk2); pk2.connect(lp); lp.connect(E.g);
    let first = null;
    for (const [ff, gg] of [[f, 0.5], [f * (P.iv || 1.26), 0.4]]) {
      for (const dt of [-8, 8]) {
        const o = osc(c, 'sawtooth', ff, t, E.end, nodes); o.detune.value = dt;
        const g = gn(c, gg * 0.5); nodes.push(g); o.connect(g); g.connect(pk1);
        if (!first) first = o;
      }
    }
    const s = osc(c, 'sine', f / 2, t, E.end, nodes), sg = gn(c, P.low == null ? 0.35 : P.low); nodes.push(sg);
    s.connect(sg); sg.connect(E.g);
    done(first, nodes);
  },
  /* динамик домофона / звонок: квадрат через маленький динамик (без гула, с полосой), лёгкое дребезжание сети,
     тёплое тело снизу октавой ниже */
  buzz (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const E = envG(c, dest, t, P.a == null ? 0.006 : P.a, v, d, 0.75, P.tail == null ? 0.09 : P.tail); nodes.push(E.g);
    const hp = biq(c, 'highpass', 260), pk = biq(c, 'peaking', 1300, 1.3, 6), lp = biq(c, 'lowpass', 2800, 0.7);
    const am = gn(c, 0.8); nodes.push(hp, pk, lp, am);
    hp.connect(pk); pk.connect(lp); lp.connect(am); am.connect(E.g);
    const o = osc(c, type === 'sawtooth' ? 'sawtooth' : 'square', f, t, E.end, nodes), og = gn(c, 0.4); nodes.push(og);
    o.connect(og); og.connect(hp);
    if (P.am) {   // дребезжание (зуммер замка): громкость дрожит с частотой сети
      const l = osc(c, 'square', P.am, t, E.end, nodes), lg = gn(c, 0.25); nodes.push(lg);
      l.connect(lg); lg.connect(am.gain);
    }
    const b = osc(c, 'triangle', f / 2 >= 70 ? f / 2 : f, t, E.end, nodes), bl = biq(c, 'lowpass', 900), bg = gn(c, P.low == null ? 0.45 : P.low);
    nodes.push(bl, bg); b.connect(bl); bl.connect(bg); bg.connect(E.g);
    done(o, nodes);
  },
  /* кнопка домофона: «пик» мягким тоном через динамик и щелчок самой кнопки */
  beep (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const E = envG(c, dest, t, 0.005, v, d, 0.6, P.tail == null ? 0.07 : P.tail); nodes.push(E.g);
    const bp = biq(c, 'bandpass', 1200, 0.8); nodes.push(bp); bp.connect(E.g);
    const o = osc(c, 'sine', f, t, E.end, nodes), o2 = osc(c, 'triangle', f, t, E.end, nodes), g2 = gn(c, 0.35); nodes.push(g2);
    o.connect(E.g); o2.connect(g2); g2.connect(bp);
    nzf(c, dest, t, 0.012, v * 0.5, 0.001, 'lowpass', 2600, 0.7, null, nodes);
    const E2 = envG(c, dest, t, 0.003, v * 0.6, 0.04, 0.3, 0.04); nodes.push(E2.g);
    const s = osc(c, 'sine', 190, t, E2.end, nodes); s.frequency.exponentialRampToValueAtTime(90, t + 0.07); s.connect(E2.g);
    done(o, nodes);
  },
  /* голос: пила с дрожью через две форманты (P.fm — гласная), снизу — грудь */
  voice (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const E = envG(c, dest, t, P.a == null ? 0.018 : P.a, v, d, P.hold == null ? 0.7 : P.hold, P.tail == null ? 0.07 + d * 0.3 : P.tail); nodes.push(E.g);
    const [F1, F2] = P.fm || [650, 1150];
    const b1 = biq(c, 'bandpass', F1, 4), b2 = biq(c, 'bandpass', F2, 6), g2 = gn(c, 0.6), lp = biq(c, 'lowpass', 900), gl = gn(c, 0.55);
    nodes.push(b1, b2, g2, lp, gl);
    b1.connect(E.g); b2.connect(g2); g2.connect(E.g); lp.connect(gl); gl.connect(E.g);
    const o = osc(c, 'sawtooth', f, t, E.end, nodes);
    if (P.glide) o.frequency.exponentialRampToValueAtTime(clamp(f * P.glide, 30, 8000), t + d);
    const l = osc(c, 'sine', P.vibF || 5.5 + Math.random(), t, E.end, nodes), lg = gn(c, f * (P.vib == null ? 0.015 : P.vib)); nodes.push(lg);
    l.connect(lg); lg.connect(o.frequency);
    o.connect(b1); o.connect(b2); o.connect(lp);
    done(o, nodes);
  },
  /* собака: «гав» — тон резко вниз через пасть (форманты), выдох шумом, грудь снизу */
  dog (c, dest, t, f, d, type, v, P) {
    const nodes = [];
    const len = Math.max(0.06, d);
    const E = envG(c, dest, t, 0.006, v, len, 0.35, 0.06); nodes.push(E.g);
    const b1 = biq(c, 'bandpass', 800, 3), b2 = biq(c, 'bandpass', 1700, 4), lp = biq(c, 'lowpass', 2200);
    nodes.push(b1, b2, lp);
    b1.connect(lp); b2.connect(lp); lp.connect(E.g);
    const o = osc(c, 'sawtooth', f * (P.yelp ? 0.9 : 1.15), t, E.end, nodes);
    if (P.yelp) { o.frequency.exponentialRampToValueAtTime(f * 1.2, t + len * 0.35); o.frequency.exponentialRampToValueAtTime(f * 0.75, t + len); }
    else o.frequency.exponentialRampToValueAtTime(f * 0.55, t + len);
    o.connect(b1); o.connect(b2);
    nzf(c, dest, t, len * 0.8, v * 0.35, 0.004, 'bandpass', 1300, 1, null, nodes);
    const E2 = envG(c, dest, t, 0.005, v * 0.5, len * 0.7, 0.3, 0.05); nodes.push(E2.g);
    const s = osc(c, 'sine', Math.max(70, f * 0.3), t, E2.end, nodes); s.frequency.exponentialRampToValueAtTime(Math.max(55, f * 0.2), t + len); s.connect(E2.g);
    done(o, nodes);
  },
  /* крылья: взлетели голуби — несколько мягких хлопков шумом */
  flutter (c, dest, t, f, d, type, v, P) {
    let e = 0;
    for (let i = 0; i < 6; i++) {
      nzf(c, dest, t + e, 0.03, v * (1 - i * 0.12), 0.006, 'bandpass', rnd(900, 1700), 1.2);
      nzf(c, dest, t + e, 0.035, v * 0.4 * (1 - i * 0.12), 0.006, 'lowpass', 350, 0.7);
      e += rnd(0.045, 0.075);
    }
  },
};

/* ─────────────── шумы: (c, вход, t, d, v, P) — по P.nz ─────────────── */
const NZ = {
  /* по умолчанию: тот же мягкий шум, что был (полоса до 1,3 кГц), плюс низ до 250 Гц; не щелчок, а «ш-ш» с хвостом */
  soft (c, o, t, d, v) {
    nzf(c, o, t, d * 1.1, v * 0.85, 0.005, 'lowpass', 1300, 0.6);
    nzf(c, o, t, d * 1.25, v * 0.6, 0.008, 'lowpass', 240, 0.7);
  },
  /* «пш-ш»: пневматика, баллончик, нитро — шипение с подъёмом и тихий низ */
  pssh (c, o, t, d, v) {
    nzf(c, o, t, d * 1.1, v * 0.9, Math.min(0.04, d * 0.2), 'bandpass', 2600, 0.6, 1700);
    nzf(c, o, t, d * 1.2, v * 0.35, 0.02, 'lowpass', 220, 0.7);
  },
  /* «вуух»: полоса едет вверх-вниз, подъём медленный */
  whoosh (c, o, t, d, v) {
    const nodes = [];
    const s = nzf(c, o, t, d * 0.75, v * 1.1, d * 0.35, 'bandpass', 380, 1.1, 650, nodes);
    const b = nodes[1];
    b.frequency.cancelScheduledValues(t);
    b.frequency.setValueAtTime(380, t); b.frequency.exponentialRampToValueAtTime(1700, t + d * 0.4); b.frequency.exponentialRampToValueAtTime(500, t + d * 1.1);
    done(s, nodes);
    nzf(c, o, t, d * 0.8, v * 0.45, d * 0.3, 'lowpass', 280, 0.7);
  },
  /* вода: полоса сверху вниз, бульканье и глухой «бульк» снизу */
  splash (c, o, t, d, v) {
    nzf(c, o, t, d * 1.1, v * 0.8, 0.006, 'lowpass', 2600, 0.7, 450);
    for (let i = 0; i < 4; i++) nzf(c, o, t + 0.03 + Math.random() * d * 0.8, 0.04, v * 0.3, 0.004, 'bandpass', rnd(500, 1400), 4);
    const nodes = [];
    const E = envG(c, o, t, 0.006, v * 0.5, 0.12 + d * 0.3, 0.3, 0.08); nodes.push(E.g);
    const s = osc(c, 'sine', 110, t, E.end, nodes); s.frequency.exponentialRampToValueAtTime(48, t + 0.15 + d * 0.3); s.connect(E.g);
    done(s, nodes);
  },
  /* сбил мелочь: хруст полосой, пара щепок сверху и глухой удар снизу */
  crunch (c, o, t, d, v) {
    nzf(c, o, t, d, v * 0.75, 0.003, 'bandpass', 1100, 0.9, 600);
    for (let i = 0; i < 3; i++) nzf(c, o, t + Math.random() * d * 0.6, 0.03, v * 0.35, 0.002, 'bandpass', rnd(1500, 3200), 2.2);
    nzf(c, o, t, d * 1.2, v * 0.65, 0.004, 'lowpass', 230, 0.8);
    const nodes = [];
    const E = envG(c, o, t, 0.004, v * 0.45, 0.1 + d * 0.3, 0.25, 0.08); nodes.push(E.g);
    const s = osc(c, 'sine', 95, t, E.end, nodes); s.frequency.exponentialRampToValueAtTime(42, t + 0.12 + d * 0.3); s.connect(E.g);
    done(s, nodes);
  },
  /* железо: короткий шум полосой и гулкий звон пустого бака (негармоничные синусы гаснут) */
  clank (c, o, t, d, v) {
    nzf(c, o, t, d * 0.7, v * 0.7, 0.003, 'bandpass', 1500, 1.6);
    nzf(c, o, t, d, v * 0.5, 0.004, 'lowpass', 260, 0.8);
    const f = rnd(230, 320), nodes = [];
    let first = null;
    [[1, 0.5, 0.5], [2.71, 0.25, 0.35], [5.1, 0.1, 0.2]].forEach(([r, a, len]) => {
      const E = envG(c, o, t, 0.003, v * a, 0.01, 0.9, len + d); nodes.push(E.g);
      const s = osc(c, 'sine', f * r, t, E.end, nodes); s.connect(E.g);
      if (!first) first = s;
    });
    done(first, nodes);
  },
  /* глухо: падение, пинок, толчок — низкий шум и «бум» синусом */
  thud (c, o, t, d, v) {
    nzf(c, o, t, d, v * 0.8, 0.004, 'lowpass', 520, 0.7, 260);
    const nodes = [];
    const E = envG(c, o, t, 0.004, v * 0.6, 0.09 + d * 0.4, 0.25, 0.07); nodes.push(E.g);
    const s = osc(c, 'sine', 88, t, E.end, nodes); s.frequency.exponentialRampToValueAtTime(44, t + 0.12 + d * 0.4); s.connect(E.g);
    done(s, nodes);
  },
  /* листва, кусты: мягкий шелест сверху, чуть низа */
  leaves (c, o, t, d, v) {
    nzf(c, o, t, d * 1.2, v * 0.8, Math.min(0.03, d * 0.25), 'bandpass', 3400, 0.7);
    nzf(c, o, t, d, v * 0.5, 0.01, 'lowpass', 600, 0.7);
  },
  /* стекло: звонкий шорох и осколки сверху, глухой хлопок снизу */
  glass (c, o, t, d, v) {
    nzf(c, o, t, d, v * 0.7, 0.002, 'highpass', 3600, 0.7);
    nzf(c, o, t, d * 0.5, v * 0.5, 0.003, 'lowpass', 400, 0.7);
  },
  /* взрыв, выстрел: хлопок, низкий раскат с долгим хвостом */
  boom (c, o, t, d, v) {
    nzf(c, o, t, d * 0.5, v * 0.6, 0.002, 'lowpass', 2400, 0.7, 700);
    nzf(c, o, t, d * 1.6, v * 0.9, 0.006, 'lowpass', 300, 0.8, 120);
    const nodes = [];
    const E = envG(c, o, t, 0.004, v * 0.7, 0.2 + d * 0.5, 0.3, 0.2 + d * 0.4); nodes.push(E.g);
    const s = osc(c, 'sine', 70, t, E.end, nodes); s.frequency.exponentialRampToValueAtTime(30, t + 0.4 + d * 0.8); s.connect(E.g);
    done(s, nodes);
  },
  /* дыхание: одышка — полоса голоса с медленным подъёмом */
  breath (c, o, t, d, v) {
    nzf(c, o, t, d * 0.9, v * 1.1, d * 0.3, 'bandpass', 900, 0.9, 600);
    nzf(c, o, t, d, v * 0.4, d * 0.3, 'lowpass', 300, 0.7);
  },
};

/* ─────────────── какое имя — каким инструментом ───────────────
   i — инструмент нот (blip), nz — шум (noise); oct — перенос высоты (0,5 — октава вниз);
   g / gn — поправка громкости нот / шума (под прежнюю громкость, RMS ±2 дБ — проверка DEBUG);
   wet — доля отзвука, echo — эхо улиц; остальное — параметры инструмента */
const STAIR = { wet: 0.32 };                   // подъезд: гулкая лестничная клетка
export const TIMBRE = {
  // интерфейс
  'ui-click': { i: 'wood', oct: 0.7, wet: 0.06 },
  'ui-deny': { i: 'warm', oct: 0.5, low: 0.8, wet: 0.12 },
  chip: { i: 'wood', oct: 0.8, wet: 0.08 },
  bet: { i: 'thump', oct: 0.6, slap: 1400, wet: 0.14 },
  'reel-tick': { i: 'wood', oct: 0.55, wet: 0.05 },
  'reel-stop': { i: 'thump', oct: 0.55, slap: 1800, slapV: 0.5, wet: 0.14 },
  ball: { i: 'thump', oct: 0.6, slap: 1100, wet: 0.12 },
  whoosh: { nz: 'whoosh', wet: 0.18 },
  sting: { i: 'warm', oct: 1, low: 0.7, tail: 0.5, wet: 0.3 },
  'sting-high': { i: 'warm', oct: 1, low: 0.7, tail: 0.5, wet: 0.3 },
  'clip-saved': { i: 'bell', oct: 0.5, wet: 0.2 },
  // работа и деньги
  coin: { i: 'bell', oct: 0.5, tail: 0.5, wet: 0.2 },
  order: { i: 'bell', oct: 0.5, tail: 0.55, wet: 0.2 },
  go: { i: 'bell', oct: 0.5, tail: 0.5, wet: 0.2 },
  back: { i: 'bell', oct: 0.5, tail: 0.55, wet: 0.2 },
  box: { i: 'thump', oct: 0.25, slap: 900, slapV: 0.5, wet: 0.14 },
  coffee: { i: 'bell', oct: 0.5, tail: 0.3, wet: 0.14 },
  tick: { i: 'wood', oct: 0.45, wet: 0.08 },
  fail: { i: 'warm', oct: 1, glide: 0.94, vib: 0.012, vibF: 5, low: 0.55, lp: 1800, wet: 0.22 },
  receipt: { i: 'wood', oct: 0.55, wet: 0.06 },
  seal: { i: 'thump', oct: 0.8, slap: 1200, slapV: 0.6, tail: 0.15, wet: 0.24 },
  stamp: { i: 'thump', oct: 1, slap: 1600, slapV: 0.6, tail: 0.12, wet: 0.22 },
  revive: { i: 'bell', oct: 1, tail: 0.8, wet: 0.3 },
  repair: { i: 'bell', oct: 0.5, tail: 0.25, wet: 0.16 },
  chat: { i: 'bell', oct: 0.5, tail: 0.45, wet: 0.18 },
  'chat-angry': { i: 'warm', oct: 0.5, low: 0.6, wet: 0.16 },
  fanfare: { i: 'warm', oct: 1, low: 0.45, lp: 3200, vib: 0.006, vibF: 6, tail: 0.25, wet: 0.3 },
  firework: { i: 'thump', oct: 0.6, nz: 'boom', wet: 0.35, echo: 0.2 },
  alarm: { i: 'horn', oct: 1, iv: 1.19, wet: 0.2, echo: 0.2 },
  'heart-lost': { i: 'thump', oct: 1, nz: 'thud', wet: 0.2 },
  'nitro-pick': { i: 'bell', oct: 0.5, tail: 0.35, wet: 0.18 },
  nitro: { i: 'warm', oct: 0.5, nz: 'pssh', low: 0.8, wet: 0.14 },
  thud: { i: 'thump', oct: 1, nz: 'thud', wet: 0.16 },
  trunk: { i: 'thump', oct: 0.8, slap: 2200, slapV: 0.35, wet: 0.14 },
  bump: { nz: 'thud', wet: 0.14 },
  horn: { i: 'horn', oct: 1, wet: 0.18, echo: 0.22 },
  honk: { i: 'horn', oct: 1, wet: 0.18, echo: 0.25 },
  // мотор (шина «мотор»)
  gear: { i: 'thump', oct: 1, wet: 0.05 },
  backfire: { i: 'thump', oct: 1, nz: 'boom', wet: 0.18, echo: 0.12 },
  'engine-stall': { i: 'warm', oct: 1, low: 0.6, lp: 900, wet: 0.1 },
  'engine-crank': { i: 'warm', oct: 1, low: 0.6, lp: 900, nz: 'thud', wet: 0.08 },
  'engine-miss': { i: 'thump', oct: 1, wet: 0.1 },
  'engine-start': { i: 'warm', oct: 1, low: 0.6, lp: 1000, nz: 'thud', wet: 0.1 },
  'engine-cough': { i: 'warm', oct: 1, low: 0.6, lp: 900, nz: 'thud', wet: 0.1 },
  starter: { i: 'warm', oct: 1, low: 0.6, lp: 800, nz: 'thud', wet: 0.06 },
  'rev-limit': { nz: 'thud', wet: 0.04 },
  // мини-игры: подъезд и домофон (гулкая лестница)
  'stairs-step': { i: 'wood', oct: 0.6, ...STAIR },
  'stairs-puff': { nz: 'breath', ...STAIR },
  'stairs-ring': { i: 'bell', oct: 0.5, tail: 0.6, ...STAIR },
  'stairs-wrong': { i: 'buzz', oct: 1, ...STAIR },
  'stairs-open': { i: 'bell', oct: 0.5, tail: 0.5, ...STAIR },
  'stairs-fail': { i: 'warm', oct: 0.75, low: 0.6, ...STAIR },
  'stairs-gop': { i: 'voice', oct: 1, fm: [500, 900], glide: 0.85, ...STAIR },
  'stairs-beat': { i: 'wood', oct: 0.5, ...STAIR },
  'stairs-dodge': { nz: 'leaves', ...STAIR },
  'stairs-pay': { i: 'bell', oct: 0.5, tail: 0.4, ...STAIR },
  'intercom-key': { i: 'beep', oct: 0.7, ...STAIR },
  'intercom-ring': { i: 'buzz', oct: 1, tail: 0.14, ...STAIR },
  'intercom-open': { i: 'buzz', oct: 1, am: 50, ...STAIR },
  'intercom-wrong': { i: 'buzz', oct: 1, ...STAIR },
  'intercom-knock': { i: 'thump', oct: 1, nz: 'thud', slap: 900, ...STAIR },
  'intercom-fail': { i: 'warm', oct: 0.75, low: 0.6, ...STAIR },
  'talk-blab': { i: 'voice', oct: 1, fm: [700, 1250], a: 0.008, tail: 0.04 },
  'talk-pick': { i: 'bell', oct: 0.5, tail: 0.3 },
  'talk-sad': { i: 'voice', oct: 1, fm: [450, 900], glide: 0.9 },
  // город
  siren: { i: 'warm', wet: 0.22, echo: 0.4 },
  ram: { i: 'warm', oct: 0.5, glide: 1.12, low: 0.8, lp: 1400, wet: 0.2, echo: 0.15 },
  'bus-door': { nz: 'pssh', wet: 0.2 },
  'door-open': { i: 'wood', oct: 0.6, tail: 0.18, wet: 0.3 },
  'door-close': { i: 'thump', oct: 0.9, slap: 700, wet: 0.35, echo: 0.15 },
  smash: { nz: 'crunch', wet: 0.18 },
  pole: { i: 'warm', oct: 1, nz: 'crunch', low: 0.7, lp: 1200, wet: 0.2 },
  glass: { i: 'bell', oct: 1, tail: 0.15, low: 0, nz: 'glass', wet: 0.2 },
  'glass-tink': { i: 'bell', oct: 1, tail: 0.3, low: 0.2, wet: 0.2 },
  fence: { i: 'thump', oct: 1, slap: 800, wet: 0.16 },
  clank: { nz: 'clank', wet: 0.2 },
  dumpster: { i: 'thump', oct: 1, nz: 'clank', wet: 0.24, echo: 0.12 },
  boom: { i: 'thump', oct: 1, nz: 'boom', wet: 0.3, echo: 0.25 },
  cone: { nz: 'thud', wet: 0.1 },
  rustle: { nz: 'leaves', wet: 0.08 },
  leaves: { nz: 'leaves', wet: 0.08 },
  snowdrift: { i: 'thump', oct: 1, nz: 'soft', wet: 0.08 },
  snowball: { nz: 'thud', wet: 0.08 },
  'snowball-hit': { i: 'thump', oct: 0.5, wet: 0.08 },
  throw: { i: 'wood', oct: 0.5, wet: 0.1 },
  thunder: { wet: 0.12 },
  'house-gone': { i: 'warm', oct: 1, nz: 'crunch', low: 0.7, lp: 700, wet: 0.3 },
  spray: { nz: 'pssh', wet: 0.06 },
  birds: { i: 'flutter', wet: 0.14 },
  splash: { nz: 'splash', wet: 0.14 },
  drown: { nz: 'splash', wet: 0.2 },
  pothole: { i: 'thump', oct: 1, nz: 'thud', wet: 0.12 },
  'ice-crack': { nz: 'crunch', wet: 0.25 },
  slowmo: { nz: 'whoosh', wet: 0.3 },
  // люди и звери
  squish: { i: 'thump', oct: 0.8, nz: 'splash', wet: 0.12 },
  'hit-person': { i: 'thump', oct: 1, nz: 'thud', wet: 0.12 },
  fall: { nz: 'thud', wet: 0.14 },
  splat: { nz: 'splash', wet: 0.12 },
  punch: { i: 'thump', oct: 1, slap: 1500, wet: 0.16 },
  kick: { nz: 'thud', wet: 0.14 },
  fight: { i: 'voice', oct: 1.4, fm: [700, 1200], a: 0.012, wet: 0.2 },
  bat: { i: 'thump', oct: 1, slap: 2400, slapV: 0.5, wet: 0.18 },
  shot: { i: 'thump', oct: 0.6, nz: 'boom', wet: 0.32, echo: 0.3 },
  'bullet-hit': { i: 'bell', oct: 0.5, tail: 0.2, wet: 0.14 },
  'pizza-throw': { i: 'wood', oct: 0.5, wet: 0.14 },
  yum: { i: 'voice', oct: 0.5, fm: [300, 2200], glide: 0.92, vib: 0.02, wet: 0.14 },
  'talk-m': { i: 'voice', oct: 0.8, fm: [600, 1100], a: 0.01, wet: 0.1 },
  'talk-f': { i: 'voice', oct: 0.8, fm: [750, 1400], a: 0.01, wet: 0.1 },
  burp: { i: 'voice', oct: 1, fm: [400, 800], glide: 0.8, vib: 0.03, wet: 0.16 },
  sing: { i: 'voice', oct: 1, fm: [700, 1100], vib: 0.02, wet: 0.24 },
  rep: { i: 'voice', oct: 0.5, fm: [500, 950], a: 0.01, wet: 0.12 },
  love: { i: 'bell', oct: 0.5, tail: 0.6, wet: 0.25 },
  mascot: { i: 'thump', oct: 0.8, wet: 0.14 },
  meow: { i: 'voice', oct: 0.6, fm: [900, 1700], glide: 0.8, vib: 0.02, a: 0.02, wet: 0.14 },
  bark: { i: 'dog', oct: 1, wet: 0.2, echo: 0.12 },
  'amb-dog': { wet: 0.25, echo: 0.2 },
  yelp: { i: 'dog', oct: 1, yelp: 1, wet: 0.16 },
  moose: { i: 'voice', oct: 1, fm: [350, 700], nz: 'breath', wet: 0.2 },
  'moose-hit': { i: 'thump', oct: 1, slap: 600, wet: 0.16 },
  horse: { i: 'voice', oct: 0.7, fm: [800, 1500], vib: 0.04, vibF: 9, wet: 0.2 },
  witch: { i: 'voice', oct: 0.9, fm: [1000, 2200], vib: 0.05, vibF: 8, wet: 0.35 },
  ghost: { i: 'voice', oct: 0.6, fm: [400, 800], vib: 0.03, vibF: 4, a: 0.06, tail: 0.4, wet: 0.45 },
  cauldron: { i: 'bell', oct: 0.5, tail: 0.5, wet: 0.3 },
  'amb-train': { wet: 0.1 },
};
const NONE = {};
const PREFIX = [['stairs-', { i: 'wood', ...STAIR }], ['intercom-', { i: 'buzz', ...STAIR }], ['talk-', { i: 'voice', fm: [650, 1150] }], ['engine-', { i: 'warm', lp: 900, low: 0.6 }], ['amb-', {}]];
export function timbre (name) {
  if (!name) return NONE;
  const P = TIMBRE[name];
  if (P) return P;
  for (const [p, T] of PREFIX) if (name.startsWith(p)) return T;
  return NONE;
}

/* общие уровни инструментов: под прежний blip той же громкости (RMS), подобраны DEBUG.compare */
const LVL = { warm: 0.283, bell: 0.476, wood: 0.356, thump: 0.403, horn: 0.546, buzz: 0.62, beep: 0.306, voice: 0.537, dog: 0.904, flutter: 3.192 };
const NLVL = 0.573;

/* поправка громкости имени (весь звук: ноты и шум) — подобрана так, чтобы RMS был как у прежнего синтеза
   (±2 дБ, окно 2 с; проверка — замер старого и нового в OfflineAudioContext). Нет имени — 1 */
// TRIM:begin
export const TRIM = {
  'ui-deny': 1.1, chip: 1.09, bet: 1.08, 'reel-tick': 0.86, ball: 0.9, whoosh: 2.63, sting: 0.92, order: 0.94,
  go: 0.91, back: 0.94, box: 0.64, coffee: 0.69, tick: 1.11, receipt: 1.18, revive: 0.9, repair: 0.93, chat: 0.75,
  'chat-angry': 0.86, fanfare: 1.31, firework: 0.56, alarm: 0.94, 'heart-lost': 0.63, nitro: 1.55, thud: 0.56,
  trunk: 0.9, bump: 0.66, gear: 0.7, backfire: 0.39, 'engine-stall': 0.89, 'engine-crank': 0.73, 'engine-miss': 1.17,
  'engine-start': 0.9, 'engine-cough': 0.81, starter: 0.52, 'rev-limit': 0.43, 'stairs-step': 1.07,
  'stairs-puff': 2.69, 'stairs-open': 0.86, 'stairs-gop': 0.87, 'stairs-beat': 0.79, 'stairs-dodge': 2.07,
  'stairs-pay': 0.84, 'stairs-fail': 0.8, 'talk-blab': 1.67, 'talk-pick': 0.87, 'talk-sad': 0.86,
  'intercom-ring': 0.82, 'intercom-open': 0.77, 'intercom-knock': 0.48, ram: 0.87, 'bus-door': 2.51, smash: 1.06,
  pole: 1.18, glass: 2.28, 'glass-tink': 0.67, fence: 1.13, clank: 0.9, dumpster: 1.13, boom: 0.64, cone: 0.59,
  rustle: 2.36, leaves: 2.41, snowball: 0.56, 'snowball-hit': 0.6, throw: 0.77, 'house-gone': 1.17, spray: 2.2,
  drown: 1.17, pothole: 0.75, squish: 0.74, 'hit-person': 0.79, fall: 0.69, splat: 0.67, kick: 0.54, fight: 1.59,
  bat: 1.38, shot: 0.43, 'bullet-hit': 0.79, 'pizza-throw': 0.78, yum: 0.52, 'talk-m': 0.83, 'talk-f': 1.16, sing: 0.9,
  love: 0.88, mascot: 1.24, meow: 1.28, bark: 1.1, yelp: 0.83, moose: 1.54, 'moose-hit': 1.21, horse: 0.73,
  witch: 0.79, cauldron: 1.45, '': 1.4, 'intercom-fail': 0.77,
};
// TRIM:end

function playBlip (c, dest, P, k, f, d, type, v) {
  const i = INST[P.i] ? P.i : 'warm';
  d = Math.max(0.012, +d || 0.05);
  INST[i](c, dest, T0(c), (+f || 440) * (P.oct || 1), d, type || 'square', (v == null ? 0.16 : v) * k * (P.g || 1) * LVL[i], P);
}
function playNoise (c, dest, P, k, d, v) {
  const n = NZ[P.nz] ? P.nz : 'soft';
  d = Math.max(0.02, +d || 0.1);
  NZ[n](c, dest, T0(c), d, (v == null ? 0.28 : v) * k * (P.gn || 1) * NLVL, P);
}
const trimOf = name => (TRIM[name] == null ? 1 : TRIM[name]);

/** набор для синтеза Snd.fx: те же blip / noise, но инструментом имени; out — вход полосы (с отзвуком) */
export function kit (c, out, name) {
  const P = timbre(name), k = trimOf(name || '');
  let inp = null;
  const io = () => inp || (inp = strip(c, out, P));
  return {
    ctx: c,
    get out () { return io(); },
    blip: (f, d, type, v) => playBlip(c, io(), P, k, f, d, type, v),
    noise: (d, v) => playNoise(c, io(), P, k, d, v),
    siren: o => siren(c, io(), o),
  };
}
/** без имени (Snd.blip / Snd.noise напрямую): тёплый тон / мягкий шум, лёгкий отзвук */
export function blip (c, out, f, d, type, v) { playBlip(c, strip(c, out, NONE), NONE, trimOf(''), f, d, type, v); }
export function noise (c, out, d, v) { playNoise(c, strip(c, out, NONE), NONE, trimOf(''), d, v); }

/* ─────────────── сирена скорой: двухтоновый вой ───────────────
   Одна нота («ви» — высокая, «ву» — низкая) ~0,42 с: въезжает с прошлой высоты за 45 мс (вой без
   щелчков), пила и квадрат через рупор (полосы 1 и 2,3 кГц), дрожь 6,5 Гц, саб; хвост заходит под
   следующую ноту. d0 / d1 — доплер в начале и в конце ноты: приближается — выше, уехала — ниже. */
export const SIREN = { HI: 740, LO: 555, DUR: 0.42, V: 0.031 };
export function siren (c, dest, o = {}) {
  const t = T0(c), dur = o.dur || SIREN.DUR, d0 = o.d0 || 1, d1 = o.d1 || d0;
  const F = o.hi ? SIREN.HI : SIREN.LO, Fp = o.hi ? SIREN.LO : SIREN.HI;
  const nodes = [];
  const g = c.createGain(), p = g.gain, v = SIREN.V * (o.v || 1);
  p.setValueAtTime(1e-5, t); p.linearRampToValueAtTime(v, t + 0.03);
  p.setValueAtTime(v, t + dur - 0.02); p.exponentialRampToValueAtTime(1e-5, t + dur + 0.1);
  g.connect(dest); nodes.push(g);
  const end = t + dur + 0.13;
  const hp = biq(c, 'highpass', 240), pk1 = biq(c, 'peaking', 1050, 1.1, 6), pk2 = biq(c, 'peaking', 2300, 1.5, 4), lp = biq(c, 'lowpass', 3300, 0.7);
  nodes.push(hp, pk1, pk2, lp);
  hp.connect(pk1); pk1.connect(pk2); pk2.connect(lp); lp.connect(g);
  const lfo = osc(c, 'sine', 6.5, t, end, nodes), lg = gn(c, F * 0.004); nodes.push(lg); lfo.connect(lg);
  const voice = (type, ratio, det, lvl, to) => {
    const ov = osc(c, type, Fp * ratio * d0, t, end, nodes);
    ov.detune.value = det;
    ov.frequency.exponentialRampToValueAtTime(F * ratio * d0, t + 0.045);
    ov.frequency.exponentialRampToValueAtTime(F * ratio * d1, t + dur);
    lg.connect(ov.frequency);
    const og = gn(c, lvl); nodes.push(og); ov.connect(og); og.connect(to);
    return ov;
  };
  const first = voice('sawtooth', 1, 0, 0.32, hp);
  voice('sawtooth', 1, 9, 0.22, hp);
  voice('square', 1, -6, 0.16, hp);
  voice('sine', 0.5, 0, 0.3, g);        // саб: тело сирены снизу
  done(first, nodes);
  return dur;
}
/** доплер: src / lis — { x, z, vx, vz }; → множитель высоты сейчас и через dt с (по прямой) */
export function doppler (src, lis, dt = 0) {
  const D = WARM.DOP;
  const sx = src.x + src.vx * dt, sz = src.z + src.vz * dt, lx = lis.x + lis.vx * dt, lz = lis.z + lis.vz * dt;
  const dx = lx - sx, dz = lz - sz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const vs = (src.vx * ux + src.vz * uz) * D.K;              // источник едет к слушателю — плюс
  const vl = -(lis.vx * ux + lis.vz * uz) * D.K;             // слушатель едет к источнику — плюс
  return clamp((D.C + vl) / (D.C - vs), D.MIN, D.MAX);
}

export const DEBUG = { TIMBRE, TRIM, WARM, SIREN, LVL, CLOCK, kit, blip, noise, siren, doppler, timbre, INST: Object.keys(INST), NZ: Object.keys(NZ) };
