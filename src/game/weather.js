/* ──────────────────────────────────────────────────────────────────────────
   Погода смены: каждый сезон — в нескольких вариантах (IDEAS блок 8, правила — docs/CAREER.md «Сезоны»).

   Сезон по календарю (seasons.js) решает, ЧТО может быть, номер смены — ЧТО будет: вариант
   выбирается в начале смены жребием от номера смены (dlv-shifts), то есть детерминированно —
   та же смена того же сохранения всегда с той же погодой. Шансы — CHANCES ниже.

     clear  — как по календарю: изредка дождь (или снег), как было до блока 8
     heat   — жаркое лето: небо, земля, трава и туман оранжевые, как пустыня, над дальним асфальтом
              марево, все в шортах, дождя нет; подпись «жара +31…36°»
     golden — яркая сухая осень: кроны насыщенно жёлто-красные и ещё держатся, на асфальте листья,
              сухо, небо чистое
     snowy  — снежная зима: снегопад всю смену, вдоль домов сугробы до второго этажа, вдоль улиц —
              валы за тротуаром; дороги, подъезды и адреса заказов расчищены; въехал в сугроб —
              машину мягко тормозит; с сугробов катаются люди на ледянках
     rain   — дождь почти всю смену (льёт 60—120 с, перерывы 15—35 с), асфальт мокрый
     storm  — гроза: ливень всю смену, небо тёмное, молнии (вспышка света на миг) и гром с
              задержкой «сколько до молнии / 343 м/с»
     hurricane — ураган (редко, не в первые смены — hurricane.js HUR.FROM): ливень, ветер сносит
              машину, клонит деревья, летит мусор; уносит 1—3 дома рядом — на их месте забор и кран
              на несколько смен (hurricane.js)
   Сцепление в дождь и грозу — по общим правилам мокрой дороги (WET в game.js: от ENV.rain).

   Как подключено (game.js — точечные хуки):
     init(ctx)            — после buildSpots: строит сугробы снежной зимы (спрятаны, пока не нужны)
     shiftStart(ride)     — из startRun: выбрать вариант, подпись на экране
     rainControl(ENV, dt) — из updateEnv: true — дождём управляет вариант (расписание игры молчит)
     update(dt)           — каждый кадр после seasons: небо, молнии, сугробы и ледянки
     label()              — коротко для накладной («жара +34°»), '' — обычная погода
     force(id)            — быстрый заезд: свой вариант на следующую смену (null — снова жребий)
   ?weather=storm — вариант сразу (проверка), __dlv.weather — ручки.
   ────────────────────────────────────────────────────────────────────────── */
import './weather.css';
import { t } from '../i18n/index.js';
import * as SEAS from './seasons.js';
import * as HUR from './hurricane.js';

/* шансы вариантов на смену, по сезону календаря (в сумме 100) */
export const CHANCES = {
  summer: { clear: 47, heat: 25, rain: 15, storm: 10, hurricane: 3 },
  autumn: { clear: 39, golden: 25, rain: 20, storm: 10, hurricane: 6 },
  winter: { clear: 55, snowy: 45 },
  spring: { clear: 52, rain: 30, storm: 15, hurricane: 3 },
};
export const IDS = ['clear', 'heat', 'golden', 'snowy', 'rain', 'storm', 'hurricane'];
/* где вариант к месту: быстрый заезд с «жарой» зимой ставит сезон отсюда */
const HOME = { heat: 0.45, golden: 1.45, snowy: 2.5, rain: 3.5, storm: 0.6, hurricane: 1.3 };
const W = {
  RAIN_ON: [60, 120], RAIN_OFF: [15, 35],      // дождь: сколько льёт и сколько перерыв, с
  BOLT_EVERY: [6, 16], BOLT_DIST: [320, 1100], // молния: раз в 6—16 с, в 320—1 100 м
  SOUND: 343,                                   // м/с: гром через 1—3,2 с после вспышки
  HEAT_T: [31, 36],                             // жара: градусы в подписи
  SLED_MAX: 5, SLED_NEAR: [30, 120],            // ледянки: до 5 человек в 30—120 м от машины
  DEEP_BRAKE: 2.4,                              // в сугробе скорость гаснет как e^(−2,4·t): с 50 км/ч до 10 — за 0,7 с
};
const OVER = {
  clear: null,
  heat: { heat: 1, dry: v => Math.max(v, 0.6), yellow: v => Math.max(v, 0.32), fresh: 0, wet: 0, warm: 0, mud: 0 },
  golden: { gold: 1, yellow: 1, leaf: v => Math.max(v, 0.85), fallen: v => Math.max(v, 0.75), dry: v => Math.max(v, 0.6), wet: 0, mud: 0 },
  snowy: { snow: v => Math.max(v, 0.95), drift: 1, ice: v => Math.max(v, 0.9), warm: 1, snowfall: 0.85 },
  rain: { wet: v => Math.max(v, 0.65) },
  storm: { wet: v => Math.max(v, 0.85) },
  hurricane: { wet: v => Math.max(v, 0.85), fallen: v => Math.max(v, 0.5) },
};

let C = null, THREE = null;
let ID = 'clear', FORCE = null, TEMP = 0, RT = 0, N = 0;
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function h01 (n, k = 0) {
  let h = Math.imul((n | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul(k + 0x27d4eb2d, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* сезон календаря → набор шансов. Зима — пока лежит снег (seasons snowAmt > 0,45) */
export function bucket (s = SEAS.seasonValue()) {
  const v = ((s % 4) + 4) % 4;
  if (SEAS.snowAmt() > 0.45) return 'winter';
  return v >= 0.95 && v < 2.3 ? 'autumn' : v >= 2.3 && v < 3.75 ? 'spring' : 'summer';
}
/* вариант смены n: жребий от номера смены по шансам сезона */
export function pickFor (n, b = bucket()) {
  const tab = CHANCES[b] || CHANCES.summer;
  let x = h01(n, 77) * 100;
  for (const k in tab) if ((x -= tab[k]) < 0) return k;
  return 'clear';
}
const fits = (id, b) => id === 'clear' || (CHANCES[b] && CHANCES[b][id] !== undefined);

/* ctx: THREE, scene, cam, Store, MAP, CITY, V, S, SPOTS, ZEBRAS, Snd, toast, groundH, curbAt, nearestRoad, roadWidth, drivable,
   inHouse, inPoly, inBounds, makeHuman, dropMesh, gibHuman, CAR_L, CAR_W, isPlaying, intro;
   геттеры: ENV, sun, hemi, amb, PIZZERIAS */
export function init (ctx) {
  C = ctx; THREE = ctx.THREE;
  if (!ctx.intro) { try { buildDeep(); } catch (e) { console.error('[weather] сугробы', e); } }
  if (!ctx.intro) { try { HUR.init(ctx); } catch (e) { console.error('[weather] ураган', e); } }
  SEAS.addDriftTop(deepTop);
  const q = new URLSearchParams(location.search).get('weather');
  if (q && IDS.includes(q)) { FORCE = q; setTimeout(() => set(q), 0); }   // ENV игры заводится позже
  if (window.__dlv) window.__dlv.weather = DEBUG;
  else setTimeout(() => { if (window.__dlv) window.__dlv.weather = DEBUG; }, 0);
}

/* начало смены: снять вариант прошлой, выбрать новый, показать подпись */
export function shiftStart (ride) {
  if (!C) return;
  SEAS.setVariant(null);
  const n = (+C.Store.get('dlv-shifts', 0) || 0) + (ride ? 5003 : 0);
  let id = FORCE || pickFor(n, bucket());
  if (id === 'hurricane' && !FORCE && (ride || n < HUR.HUR.FROM)) id = 'storm';   // ураган — не в первые смены и не «просто покататься»
  if (FORCE && !fits(FORCE, bucket())) SEAS.setSeason(HOME[FORCE], true);   // быстрый заезд: «жара» — значит лето
  set(id, n);
  HUR.shiftStart(id, ride, n);
  caption(0.8);
}
/* поставить вариант сейчас */
function set (id, n = N) {
  if (!IDS.includes(id)) id = 'clear';
  ID = id; N = n;
  SEAS.setVariant(OVER[id]);
  TEMP = W.HEAT_T[0] + Math.floor(h01(n, 5) * (W.HEAT_T[1] - W.HEAT_T[0] + 1));
  for (const m of DEEP_MESH) m.visible = id === 'snowy';
  const ENV = C.ENV;
  if (ENV) {
    if (id === 'rain' || id === 'storm' || id === 'hurricane') { ENV.rainWant = 1; ENV.rain = Math.max(ENV.rain, 0.85); RT = rnd(...W.RAIN_ON); }
    else if (id !== 'clear') { ENV.rainWant = 0; ENV.rain = 0; }
  }
  if (id !== 'snowy') dropSleds();
  BOLT.t = id === 'storm' ? rnd(2, 5) : 0;
}
export const id = () => ID;
export function force (v) { FORCE = v && IDS.includes(v) ? v : null; }
export const forced = () => FORCE;

/* названия: для подписи и накладной */
const TITLE = {
  heat: () => t('жара +{n}°', { n: TEMP }), golden: () => t('золотая осень'), snowy: () => t('снегопад'),
  rain: () => t('дождь весь день'), storm: () => t('гроза'), hurricane: () => t('ураган!'),
};
const SUB = {
  heat: () => t('асфальт плавится, город оранжевый, все в шортах'),
  golden: () => t('сухо и ярко: листья на асфальте'),
  snowy: () => t('сугробы до второго этажа, дороги расчищены'),
  rain: () => t('дорога мокрая — тормоз слабее, в повороте сносит'),
  storm: () => t('ливень, молнии и гром — дорога мокрая'),
  hurricane: () => t('ветер сносит машину и уносит дома — держи руль'),
};
export const label = () => (TITLE[ID] ? TITLE[ID]() : '');
/* имя варианта для выбора в быстром заезде */
export const NAME = {
  clear: () => t('обычная'), heat: () => t('жара'), golden: () => t('золотая осень'), snowy: () => t('снежная зима'),
  rain: () => t('дождь'), storm: () => t('гроза'), hurricane: () => t('ураган'),
};
let capEl = null, capT = 0, capWait = -1;
/* подпись ждёт, пока не закроют накладную (state 'brief') и не загрузят пиццу: потом ещё delay с */
function caption (delay = 0) { capWait = TITLE[ID] ? delay : -1; }
const capFree = () => C.isPlaying() && C.S.state !== 'brief' && C.S.state !== 'loading' && !document.body.classList.contains('brief');
function capStep (dt) {
  if (capEl && capEl.classList.contains('on') && document.body.classList.contains('brief')) capEl.classList.remove('on');   // открыли накладную — подпись прочь
  if (capWait < 0 || !capFree()) return;
  if ((capWait -= dt) <= 0) { capWait = -1; showCaption(); }
}
function showCaption () {
  if (!TITLE[ID]) return;
  if (!capEl) {
    capEl = document.createElement('div');
    capEl.id = 'wx-cap';
    ($('game') || document.body).appendChild(capEl);
  }
  capEl.dataset.v = ID;
  capEl.innerHTML = '<b></b><span></span>';
  capEl.querySelector('b').textContent = TITLE[ID]();
  capEl.querySelector('span').textContent = SUB[ID]();
  clearTimeout(capT);
  capEl.classList.remove('on');
  void capEl.offsetWidth;
  capEl.classList.add('on');
  capT = setTimeout(() => capEl.classList.remove('on'), 4200);
}

/* дождь: true — расписанием управляет вариант (game.js updateEnv своё не крутит) */
export function rainControl (ENV, dt) {
  if (ID === 'clear') return false;
  if (ID === 'storm' || ID === 'hurricane') ENV.rainWant = 1;
  else if (ID === 'rain') {
    if ((RT -= dt) <= 0) {
      ENV.rainWant = ENV.rainWant ? 0 : 1;
      RT = rnd(...(ENV.rainWant ? W.RAIN_ON : W.RAIN_OFF));
      C.toast(ENV.rainWant ? t('пошёл дождь — дорога скользкая') : t('дождь притих — ненадолго'));
    }
  } else ENV.rainWant = 0;
  return true;
}

/* ─────────────── небо и свет ─────────────── */
let COL = null;
function colors () {
  if (COL) return COL;
  const c = h => new THREE.Color(h);
  COL = { heatSky: c('#f2a04e'), heatFog: c('#f2b673'), heatGnd: c('#d98c40'), heatSun: c('#ffbf70'),
    goldSky: c('#8fcaf2'), goldSun: c('#ffd9a0'), snowSky: c('#cdd5de'), snowFog: c('#dfe5ec'),
    stormSky: c('#3b424f'), stormFog: c('#4a525f'), hurSky: c('#525a52'), hurFog: c('#646b62'), flash: c('#e4e9ff'), flashFog: c('#bfc8e6') };
  return COL;
}
function sky (dt) {
  const ENV = C.ENV, scene = C.scene, sun = C.sun, hemi = C.hemi, amb = C.amb, K = colors();
  const day = 1 - (ENV.night || 0), fog = scene.fog;
  if (ID === 'heat') {
    scene.background.lerp(K.heatSky, 0.78 * day);
    if (fog) { fog.color.lerp(K.heatFog, 0.75 * day); fog.far *= 0.82; }
    if (hemi) hemi.groundColor.lerp(K.heatGnd, 0.55);
    if (sun) sun.color.lerp(K.heatSun, 0.5 * day);
  } else if (ID === 'golden') {
    scene.background.lerp(K.goldSky, 0.3 * day);
    if (sun) sun.color.lerp(K.goldSun, 0.35 * day);
  } else if (ID === 'snowy') {
    scene.background.lerp(K.snowSky, 0.35 * day);
    if (fog) { fog.color.lerp(K.snowFog, 0.4 * day); fog.far *= 0.72; }
  } else if (ID === 'storm' || ID === 'hurricane') {
    const R = ENV.rain || 0, hu = ID === 'hurricane';
    scene.background.lerp(hu ? K.hurSky : K.stormSky, 0.6 * R);
    if (fog) { fog.color.lerp(hu ? K.hurFog : K.stormFog, 0.55 * R); fog.far *= 1 - (hu ? 0.26 : 0.18) * R; }
    if (sun) sun.intensity *= 1 - 0.55 * R;
    if (hemi) hemi.intensity *= 1 - 0.32 * R;
    if (amb) amb.intensity *= 1 - 0.3 * R;
  }
  stepBolt(dt);
  const F = BOLT.f;
  if (F > 0.001) {
    scene.background.lerp(K.flash, 0.75 * F);
    if (fog) fog.color.lerp(K.flashFog, 0.5 * F);
    if (hemi) hemi.intensity += 2.4 * F;
    if (amb) amb.intensity += 0.9 * F;
    if (sun) sun.intensity += 0.6 * F;
  }
}

/* ─────────────── молния и гром ─────────────── */
const BOLT = { t: 0, f: 0, life: 0, pulses: [], mesh: null, mat: null, thunder: [], bufs: [], n: 0 };
function boltMesh () {
  if (BOLT.mesh) return BOLT.mesh;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 6 * 3), 3));
  BOLT.mat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide });
  BOLT.mesh = new THREE.Mesh(g, BOLT.mat);
  BOLT.mesh.frustumCulled = false; BOLT.mesh.visible = false;
  C.scene.add(BOLT.mesh);
  return BOLT.mesh;
}
/* удар: где-то впереди, в 320—1 100 м; вспышка из 2—3 миганий, гром — со скоростью звука */
export function strike (dist = rnd(...W.BOLT_DIST), da = rnd(-0.5, 0.5)) {
  if (!C) return null;
  const cam = C.cam, m = boltMesh(), p = m.geometry.attributes.position.array;
  const fw = new THREE.Vector3(); cam.getWorldDirection(fw);
  const a = Math.atan2(fw.x, fw.z) + da;
  const bx = cam.position.x + Math.sin(a) * dist, bz = cam.position.z + Math.cos(a) * dist;
  // зигзаг сверху вниз, лента шириной 4—7 м поперёк взгляда
  const px = Math.cos(a), pz = -Math.sin(a), wd = 3 + dist / 140;
  let x = bx + rnd(-40, 40), z = bz + rnd(-40, 40), y = 190;
  for (let i = 0; i < 16; i++) {
    const nx = i === 15 ? bx : x + rnd(-14, 14), nz = i === 15 ? bz : z + rnd(-8, 8), ny = i === 15 ? 0 : y - 190 / 16 * rnd(0.8, 1.2);
    const o = i * 18, w0 = wd * (1 - i / 22), w1 = wd * (1 - (i + 1) / 22);
    const q = [x - px * w0, y, z - pz * w0, x + px * w0, y, z + pz * w0, nx + px * w1, ny, nz + pz * w1,
      x - px * w0, y, z - pz * w0, nx + px * w1, ny, nz + pz * w1, nx - px * w1, ny, nz - pz * w1];
    for (let k = 0; k < 18; k++) p[o + k] = q[k];
    x = nx; y = ny; z = nz;
  }
  m.geometry.attributes.position.needsUpdate = true;
  m.visible = true;
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  BOLT.pulses = [];
  let t0 = 0;
  for (let i = 0; i < n; i++) { const len = rnd(0.05, 0.11); BOLT.pulses.push([t0, t0 + len, i ? rnd(0.55, 0.9) : 1]); t0 += len + rnd(0.06, 0.16); }
  BOLT.life = 0; BOLT.n++;
  const delay = dist / W.SOUND;
  BOLT.thunder.push({ t: delay, dist });
  return { dist: Math.round(dist), delay: +delay.toFixed(2) };
}
function stepBolt (dt) {
  if (ID === 'storm' && C.S.state !== 'title' && (C.ENV.rain || 0) > 0.5) {
    if ((BOLT.t -= dt) <= 0) { strike(); BOLT.t = rnd(...W.BOLT_EVERY); }
  }
  let f = 0;
  if (BOLT.pulses.length) {
    if (!BOLT.hold) BOLT.life += dt;            // hold — замереть на вспышке (снимок для проверки)
    for (const [a, b, k] of BOLT.pulses) if (BOLT.life >= a && BOLT.life < b + 0.08) f = Math.max(f, k * (BOLT.life < b ? 1 : 1 - (BOLT.life - b) / 0.08));
    if (BOLT.life > BOLT.pulses[BOLT.pulses.length - 1][1] + 0.1) BOLT.pulses = [];
  }
  BOLT.f = f;
  if (BOLT.mesh) { BOLT.mat.opacity = Math.min(1, f * 1.2); BOLT.mesh.visible = f > 0.01; }
  for (let i = BOLT.thunder.length - 1; i >= 0; i--) {
    const q = BOLT.thunder[i];
    if ((q.t -= dt) > 0) continue;
    BOLT.thunder.splice(i, 1);
    thunder(q.dist);
  }
}
/* гром: шум через фильтр низких, раскат с затуханием 2,5—4 с; ближе — громче и звонче */
function thunder (dist) {
  const Snd = C.Snd;
  if (!Snd || !Snd.ctx || !Snd.on || !Snd.master) return;
  const c = Snd.ctx;
  if (BOLT.bufs.length < 3) {
    const dur = rnd(2.6, 4), n = (c.sampleRate * dur) | 0, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
    let lp = 0;
    const ph = rnd(0, 6);
    for (let i = 0; i < n; i++) {
      const tt = i / c.sampleRate, env = Math.min(1, tt / 0.05) * Math.exp(-tt * 1.15) * (0.55 + 0.45 * Math.sin(tt * 6.3 + ph + Math.sin(tt * 2.1) * 2));
      lp += (Math.random() * 2 - 1 - lp) * 0.09;
      a[i] = lp * env * 3.2;
    }
    BOLT.bufs.push(b);
  }
  const s = c.createBufferSource(); s.buffer = BOLT.bufs[(Math.random() * BOLT.bufs.length) | 0];
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(1100 - dist * 0.7, 260, 900);
  const g = c.createGain(); g.gain.value = clamp(420 / dist, 0.25, 1) * 0.55;
  s.connect(f); f.connect(g); g.connect(Snd.master); s.start();
}

/* ─────────────── снежная зима: сугробы до второго этажа ───────────────
   Вдоль стен домов (у 60 % домов, с разрывами) — кучи высотой 3,4—5,2 м у домов в 2 этажа и
   выше, 1,5—2,3 м у одноэтажных. Вдоль улиц — валы 1,7—2,7 м сразу за тротуаром. Ни один не
   залезает на асфальт (проезды во дворах тоже) и не стоит ближе своего размера + 3,5 м к адресу
   заказа или двери подъезда; у пиццерии (45 м), зебр и остановок — нет. Одна склейка по клеткам
   200 м с тем же материалом, что сугробы сезона (новых программ нет), видна только в снежную зиму. */
let DEEP_MESH = [];
const DEEP = new Map(), DEEP_LIST = [], SLED_SPOTS = [];
const DSTAT = { house: 0, road: 0, ms: 0, tris: 0 };
const gk = (i, j) => i * 100003 + j;
function buildDeep () {
  const t0 = performance.now();
  const K = SEAS.kit(), P = K.Pile(200), T = K.tpls(), hsh = K.hsh, rngAt = K.rngAt;
  const { CITY, groundH, curbAt, nearestRoad, roadWidth, drivable, inHouse, inPoly, inBounds } = C;
  const svk = C.MAP.id === 'seversk';
  const CAP_H = svk ? 8500 : 4200, CAP_R = svk ? 4800 : 2400;
  // адреса заказов, двери подъездов, зебры, остановки — сетка 10 м
  const AD = new Map();
  const addA = (x, z, r) => { const k = gk(Math.floor(x / 10), Math.floor(z / 10)); let a = AD.get(k); if (!a) AD.set(k, a = []); a.push(x, z, r); };
  for (const s of C.SPOTS || []) addA(s.x, s.z, 0);
  for (const e of CITY.entrances || []) addA(e[0], e[1], 0);
  for (const q of C.ZEBRAS || []) addA(q.x, q.z, 4);
  for (const q of CITY.stops || []) addA(q.p[0], q.p[1], 6);
  const nearAddr = (x, z, r) => {
    const R = r + 6;
    for (let i = Math.floor((x - R) / 10); i <= Math.floor((x + R) / 10); i++) for (let j = Math.floor((z - R) / 10); j <= Math.floor((z + R) / 10); j++) {
      const a = AD.get(gk(i, j));
      if (a) for (let q = 0; q < a.length; q += 3) if (Math.hypot(a[q] - x, a[q + 1] - z) < r + a[q + 2]) return true;
    }
    return false;
  };
  const PZ = (C.PIZZERIAS && C.PIZZERIAS.length ? C.PIZZERIAS : [C.PIZZA]).filter(Boolean).map(p => [p.bx ?? p.x, p.bz ?? p.z]);
  const nearPizza = (x, z) => PZ.some(([px, pz]) => Math.hypot(px - x, pz - z) < 45);
  const offRoad = (x, z, m) => { const n = nearestRoad(x, z, 7, 1); return !n || n.d > n.seg.w / 2 + m; };
  // эллипс: центр, наружу (nx, nz) на W, вдоль на ±L. inner — проверять и внутреннюю половину (вал у дороги)
  const fits = (x, z, nx, nz, Wd, L, inner) => {
    const tx = -nz, tz = nx;
    const pts = [[x + nx * Wd, z + nz * Wd], [x + tx * L, z + tz * L], [x - tx * L, z - tz * L],
      [x + nx * Wd * 0.7 + tx * L * 0.7, z + nz * Wd * 0.7 + tz * L * 0.7], [x + nx * Wd * 0.7 - tx * L * 0.7, z + nz * Wd * 0.7 - tz * L * 0.7]];
    if (inner) pts.push([x - nx * Wd, z - nz * Wd], [x - nx * Wd * 0.7 + tx * L * 0.7, z - nz * Wd * 0.7 + tz * L * 0.7], [x - nx * Wd * 0.7 - tx * L * 0.7, z - nz * Wd * 0.7 - tz * L * 0.7], [x, z]);
    for (const [px, pz] of pts) if (!inBounds(px, pz, -20) || inHouse(px, pz) || !offRoad(px, pz, 0.6)) return false;
    return !nearAddr(x, z, Math.max(Wd, L) + 3.5) && !nearPizza(x, z);
  };
  const add = (x, z, nx, nz, Wd, L, H, house) => {
    const y = groundH(x, z) + curbAt(x, z) + 0.02, ry = Math.atan2(-nz, nx);
    P.add(T.mound, x, y, z, Wd, H, L, 0, ry, 0, '#e8edf4', 3, 0.02);
    const d = { x, y, z, W: Wd, L, H, cs: nx, sn: -nz, nx, nz, house, sled: 0 };
    const k = gk(Math.floor(x / 20), Math.floor(z / 20));
    let a = DEEP.get(k); if (!a) DEEP.set(k, a = []);
    a.push(d); DEEP_LIST.push(d);
    if (house && H > 3.3) SLED_SPOTS.push(d);
  };
  // у домов
  for (const b of CITY.buildings) {
    if (DSTAT.house >= CAP_H) break;
    const p = b.p;
    if (!p || p.length < 3 || b.k === 'gar' || b.k === 'ind' || b.k === 'church') continue;
    let cx = 0, cz = 0, ar = 0;
    for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; cx += a[0] / p.length; cz += a[1] / p.length; ar += a[0] * c[1] - c[0] * a[1]; }
    ar = Math.abs(ar) / 2;
    if (!inBounds(cx, cz, 0) || hsh(cx, cz, 301) > 0.6) continue;
    const lv = b.lv || (ar > 1200 ? 5 : ar > 600 ? 4 : ar > 220 ? 2 : 1), tall = lv >= 2;
    const r = rngAt(cx, cz, 302);
    for (let i = 0; i < p.length && DSTAT.house < CAP_H; i++) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 5) continue;
      let nx = dz / len, nz = -dx / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (inPoly(mx + nx * 0.5, mz + nz * 0.5, p)) { nx = -nx; nz = -nz; }
      for (let d = 2 + r() * 2; d < len - 2; d += 5.5 + r() * 3) {
        if (r() < 0.25) continue;
        const Wd = tall ? 2.0 + r() * 1.0 : 1.3 + r() * 0.6, L = tall ? 2.6 + r() * 1.4 : 1.8 + r() * 0.8, H = tall ? 3.4 + r() * 1.8 : 1.5 + r() * 0.8;
        const x = a[0] + dx / len * d + nx * Wd * 0.45, z = a[1] + dz / len * d + nz * Wd * 0.45;
        if (!fits(x, z, nx, nz, Wd, L, false)) continue;
        add(x, z, nx, nz, Wd, L, H, true);
        DSTAT.house++;
      }
    }
  }
  // вдоль улиц, за тротуаром
  for (const rd of CITY.roads) {
    if (DSTAT.road >= CAP_R) break;
    if (!drivable(rd) || rd.b || rd.c > 5) continue;
    const w = roadWidth(rd);
    for (let i = 1; i < rd.p.length && DSTAT.road < CAP_R; i++) {
      const [x1, z1] = rd.p[i - 1], [x2, z2] = rd.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / len, uz = (z2 - z1) / len;
      const r = rngAt(x1, z1, 303);
      for (let d = 8; d < len - 8; d += 9 + r() * 6) {
        for (const sd of [-1, 1]) {
          if (r() > 0.2) continue;
          const Wd = 1.1 + r() * 0.6, L = 2.4 + r() * 2, H = 1.7 + r() * 1.0, off = w / 2 + 2.75 + Wd + 0.6;
          const nx = -uz * sd, nz = ux * sd, x = x1 + ux * d + nx * off, z = z1 + uz * d + nz * off;
          if (!fits(x, z, nx, nz, Wd, L, true)) continue;
          add(x, z, nx, nz, Wd, L, H, false);
          DSTAT.road++;
        }
      }
    }
  }
  DSTAT.tris = P.tris();
  DEEP_MESH = P.build(K.mat(), false);
  for (const m of DEEP_MESH) m.visible = false;
  DSTAT.ms = Math.round(performance.now() - t0);
}
/* верх сугроба (сбитые и пятна ложатся на него): профиль кучи — как у moundTpl */
const prof = e => (e < 0.62 ? 1 - 0.3 * e / 0.62 : 0.7 - 0.78 * (e - 0.62) / 0.38);
function deepTop (x, z) {
  if (ID !== 'snowy') return -Infinity;
  let top = -Infinity;
  const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    for (const d of DEEP.get(gk(i, j)) || []) {
      const dx = x - d.x, dz = z - d.z;
      if (Math.abs(dx) > d.W + d.L || Math.abs(dz) > d.W + d.L) continue;
      const e = Math.hypot((dx * d.cs - dz * d.sn) / d.W, (dx * d.sn + dz * d.cs) / d.L);
      if (e < 1) top = Math.max(top, d.y + d.H * prof(e));
    }
  }
  return top;
}
/* машина в сугробе: мягко гаснет скорость, летит снег */
let deepT = 0, inDeep = false;
function stepDeep (dt) {
  const V = C.V, sp = Math.hypot(V.vx, V.vz);
  deepT -= dt;
  if (sp < 1) { inDeep = false; return; }
  const ci = Math.floor(V.x / 20), cj = Math.floor(V.z / 20);
  let hit = null;
  for (let i = ci - 1; i <= ci + 1 && !hit; i++) for (let j = cj - 1; j <= cj + 1 && !hit; j++) {
    for (const d of DEEP.get(gk(i, j)) || []) {
      const dx = V.x - d.x, dz = V.z - d.z;
      if (Math.abs(dx) > d.L + 3 || Math.abs(dz) > d.L + 3) continue;
      const ex = (dx * d.cs - dz * d.sn) / (d.W + 1.0), ez = (dx * d.sn + dz * d.cs) / (d.L + 1.2);
      if (ex * ex + ez * ez < 1) { hit = d; break; }
    }
  }
  if (!hit) { inDeep = false; return; }
  const k = Math.exp(-W.DEEP_BRAKE * dt);
  V.vx *= k; V.vz *= k;
  const K = SEAS.kit();
  if (!inDeep) {
    inDeep = true;
    K.splash(V.x, hit.y + 1.2, V.z, 14 + Math.min(20, sp | 0), 1 + sp / 20);
    if (sp > 8) K.chunks(V.x, hit.y + 1, V.z, 4, V.vx, V.vz);
    C.Snd.blip(65 + Math.random() * 20, 0.25, 'sine', 0.18); C.Snd.noise(0.25, 0.12);
    C.S.shake = Math.max(C.S.shake || 0, 0.06 + Math.min(0.12, sp / 140));
  } else if (deepT <= 0) { deepT = 0.15; K.splash(V.x, hit.y + 0.6, V.z, 5, 0.7); }
}

/* ─────────────── ледянки: с высоких сугробов у домов катаются люди ─────────────── */
const SLEDS = [];
let sledScan = 0, SLED_GEO = null;
const SLED_MATS = [];
function sledMesh () {
  if (!SLED_GEO) {
    SLED_GEO = new THREE.CylinderGeometry(0.42, 0.38, 0.07, 10);
    for (const h of ['#e8402a', '#2a7fe8', '#2ab85a', '#f0b020']) SLED_MATS.push(new THREE.MeshLambertMaterial({ color: h, flatShading: true }));
  }
  const m = new THREE.Mesh(SLED_GEO, SLED_MATS[(Math.random() * SLED_MATS.length) | 0]);
  C.scene.add(m);
  return m;
}
/* путь: s = 0 — макушка, 1 — внизу и 3,2 м дальше подножия, наружу от стены */
function pathAt (d, s) {
  const r = 0.15 * d.W + s * (d.W * 0.85 + 3.2), e = r / d.W;
  const x = d.x + d.nx * r, z = d.z + d.nz * r;
  const g = C.groundH(x, z) + C.curbAt(x, z);
  return { x, z, y: e < 1 ? Math.max(g, d.y + d.H * prof(e)) : g };
}
function spawnSled (d) {
  const grp = C.makeHuman(null, { fat: Math.random() < 0.12 });
  C.scene.add(grp);
  const q = { d, grp, sled: sledMesh(), st: 'climb', s: 1, v: 0, t: 0, ph: Math.random() * 6, sc: grp.scale.x, x: d.x, z: d.z, dead: 0, person: null };
  d.sled = 1;
  SLEDS.push(q);
  placeSled(q, 0);
}
function dropSled (q) {
  if (!q.dead) C.dropMesh(q.grp);
  C.scene.remove(q.sled);
  q.d.sled = 0;
}
function dropSleds () { for (const q of SLEDS) dropSled(q); SLEDS.length = 0; }
function placeSled (q, dt) {
  const d = q.d, u = q.grp.userData, g = q.grp;
  const P = pathAt(d, q.s), P2 = pathAt(d, Math.min(1, q.s + 0.04));
  const slope = Math.atan2(P.y - P2.y, Math.hypot(P2.x - P.x, P2.z - P.z) || 0.01);
  q.x = P.x; q.z = P.z;
  const ry = Math.atan2(d.nx, d.nz);
  if (q.st === 'slide' || q.st === 'sit' || q.st === 'out') {
    // сидит: ноги вперёд, руки держат края
    u.legL.rotation.x = damp(u.legL.rotation.x, -1.45, 14, dt); u.legR.rotation.x = damp(u.legR.rotation.x, -1.45, 14, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -0.5, 10, dt); u.armR.rotation.x = damp(u.armR.rotation.x, -0.5, 10, dt);
    g.rotation.set(slope * 0.85, ry, 0, 'YXZ');
    g.position.set(P.x, P.y + 0.08 - 0.62 * q.sc, P.z);
    q.sled.position.set(P.x, P.y + 0.05, P.z);
    q.sled.rotation.set(slope * 0.85, ry, 0, 'YXZ');
  } else {
    // идёт вверх (или стоит внизу): ноги шагают, ледянка — в руке
    const walk = q.st === 'climb' ? Math.sin(q.ph) * 0.6 : 0;
    u.legL.rotation.x = damp(u.legL.rotation.x, walk, 14, dt); u.legR.rotation.x = damp(u.legR.rotation.x, -walk, 14, dt);
    u.armL.rotation.x = damp(u.armL.rotation.x, -walk * 0.6, 10, dt); u.armR.rotation.x = damp(u.armR.rotation.x, -0.3, 10, dt);
    g.rotation.set(q.st === 'climb' ? 0.25 : 0, ry + Math.PI, 0, 'YXZ');
    g.position.set(P.x, P.y, P.z);
    const sx = Math.cos(ry + Math.PI) * 0.45 * q.sc, sz = -Math.sin(ry + Math.PI) * 0.45 * q.sc;
    q.sled.position.set(P.x + sx, P.y + 0.85 * q.sc, P.z + sz);
    q.sled.rotation.set(Math.PI / 2, ry, 0, 'YXZ');
  }
}
function stepSleds (dt) {
  const V = C.V, on = ID === 'snowy' && (C.ENV.night || 0) < 0.7 && C.S.state !== 'title';
  if (!on) { if (SLEDS.length) dropSleds(); return; }
  if ((sledScan -= dt) <= 0) {
    sledScan = 1.5;
    for (let i = SLEDS.length - 1; i >= 0; i--) if (SLEDS[i].dead || Math.hypot(SLEDS[i].d.x - V.x, SLEDS[i].d.z - V.z) > 200) { dropSled(SLEDS[i]); SLEDS.splice(i, 1); }
    if (SLEDS.length < W.SLED_MAX) {
      const [lo, hi] = W.SLED_NEAR, near = [];
      for (const d of SLED_SPOTS) { if (d.sled) continue; const r = Math.hypot(d.x - V.x, d.z - V.z); if (r > lo && r < hi) near.push(d); }
      if (near.length) spawnSled(near[(Math.random() * near.length) | 0]);
    }
  }
  const fx = Math.sin(V.h), fz = Math.cos(V.h), vsp = Math.hypot(V.vx, V.vz);
  for (const q of SLEDS) {
    if (q.dead) continue;
    const far = Math.hypot(q.x - V.x, q.z - V.z);
    q.grp.visible = q.sled.visible = far < 140;
    // под колёса — как все
    if (vsp > 3) {
      const dx = q.x - V.x, dz = q.z - V.z;
      if (Math.abs(dx * fx + dz * fz) < C.CAR_L + 0.5 && Math.abs(dx * fz - dz * fx) < C.CAR_W + 0.35 && q.grp.position.y < V.y + 2) {
        q.dead = 1; C.dropMesh(q.grp); C.gibHuman(q, V.vx, V.vz); C.S.people++; C.Snd.squish();
        q.sled.visible = false;
        continue;
      }
    }
    if (!q.grp.visible) continue;
    q.t -= dt;
    if (q.st === 'climb') {                       // лезет наверх ~4 с
      q.ph += dt * 7; q.s -= dt / 4.2;
      if (q.s <= 0) { q.s = 0; q.st = 'sit'; q.t = 0.7 + Math.random() * 0.8; }
    } else if (q.st === 'sit') {
      if (q.t <= 0) { q.st = 'slide'; q.v = 0.15; }
    } else if (q.st === 'slide') {                // съезжает с ускорением ~1,3 с
      q.v += dt * 1.1; q.s += q.v * dt;
      if (q.s >= 0.78) { q.st = 'out'; }
    } else if (q.st === 'out') {                  // катится по снегу у подножия и встаёт
      q.v = Math.max(0.05, q.v - dt * 1.4); q.s += q.v * dt;
      if (q.s >= 1) { q.s = 1; q.st = 'stand'; q.t = 0.6 + Math.random() * 1.2; }
    } else if (q.st === 'stand') {
      if (q.t <= 0) q.st = 'climb';
    }
    placeSled(q, dt);
  }
}

/* каждый кадр — после seasons (небо уже покрашено игрой и сезоном) */
const PERF = { ms: 0, n: 0 };
export function update (dt) {
  if (!C) return;
  const t0 = performance.now();
  capStep(dt);
  sky(dt);
  if (ID === 'snowy') stepDeep(dt);
  stepSleds(dt);
  HUR.step(dt, ID === 'hurricane' && C.S.state !== 'title');
  PERF.ms += performance.now() - t0; PERF.n++;
}

/* для ?debug: __dlv.weather */
const DEBUG = {
  get id () { return ID; }, get forced () { return FORCE; }, get temp () { return TEMP; }, get label () { return label(); },
  CHANCES, IDS, bucket, pickFor, force, strike, shiftStart, hur: HUR.DEBUG,
  /* поставить вариант сейчас (и сезон, если не к месту) */
  set (v) { SEAS.setVariant(null); if (v !== 'clear' && !fits(v, bucket())) SEAS.setSeason(HOME[v], true); set(v); HUR.shiftStart(ID, false, N); caption(0); return ID; },
  /* как разойдутся смены 0…n-1 по вариантам в этом сезоне */
  spread (n = 1000, b = bucket()) { const o = {}; for (let i = 0; i < n; i++) { const k = pickFor(i, b); o[k] = (o[k] || 0) + 1; } return o; },
  get bolts () { return BOLT.n; }, get flash () { return BOLT.f; }, hold (on = true) { BOLT.hold = on; },
  get deep () { return { ...DSTAT, n: DEEP_LIST.length, sledSpots: SLED_SPOTS.length, meshes: DEEP_MESH.length, visible: DEEP_MESH.some(m => m.visible) }; },
  DEEP_LIST, get sleds () { return SLEDS.map(q => ({ st: q.st, s: +q.s.toFixed(2), x: Math.round(q.x), z: Math.round(q.z), y: +q.grp.position.y.toFixed(1) })); },
  deepTop,
  /* сколько стоит кадр: update — мс в среднем с прошлого сброса, рисование — вызовы и треугольники */
  perf (reset) { const o = { updMs: +(PERF.ms / Math.max(1, PERF.n)).toFixed(3), frames: PERF.n, calls: C.renderer ? C.renderer.info.render.calls : null, tris: C.renderer ? C.renderer.info.render.triangles : null }; if (reset) PERF.ms = PERF.n = 0; return o; },
  /* npm run check (tools/probe-checks/weather-drifts.js): край каждого сугроба снежной зимы (16 точек) —
     не на асфальте; ни адрес заказа (SPOTS), ни дверь подъезда — не в сугробе и не ближе 1,5 м к нему */
  check () {
    const { nearestRoad, inHouse, SPOTS, CITY } = C, road = [], addr = [];
    for (const d of DEEP_LIST) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, lx = Math.cos(a) * d.W, lz = Math.sin(a) * d.L;
      const x = d.x + lx * d.cs + lz * d.sn, z = d.z - lx * d.sn + lz * d.cs;
      if (inHouse(x, z)) continue;
      const n = nearestRoad(x, z, 7, 1);
      if (n && n.d < n.seg.w / 2) { road.push({ x: Math.round(x), z: Math.round(z), over: +(n.seg.w / 2 - n.d).toFixed(2), house: d.house }); break; }
    }
    const pts = [...(SPOTS || []).map(s => [s.x, s.z, 'spot']), ...(CITY.entrances || []).map(e => [e[0], e[1], 'door'])];
    for (const [x, z, kind] of pts) {
      const ci = Math.floor(x / 20), cj = Math.floor(z / 20);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const d of DEEP.get(gk(i, j)) || []) {
        const dx = x - d.x, dz = z - d.z, e = Math.hypot((dx * d.cs - dz * d.sn) / (d.W + 1.5), (dx * d.sn + dz * d.cs) / (d.L + 1.5));
        if (e < 1) addr.push({ x: Math.round(x), z: Math.round(z), kind });
      }
    }
    return { n: DEEP_LIST.length, addrs: pts.length, road: road.length, addr: addr.length, sample: [...road.slice(0, 3), ...addr.slice(0, 3)] };
  },
};
