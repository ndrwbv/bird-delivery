/* ──────────────────────────────────────────────────────────────────────────
   Праздники (автор 12.10.2026: «очень не хватает разнообразия, чтобы затягивало. И чтобы праздники были, типа
   Хэллоуин, Новый год, и они были не часто»; решение 16.10.2026: праздник примерно раз в 8—10 смен, по сезону;
   пока всегда зима — первым Новый год). Правила словами и цифрами — docs/CAREER.md «Праздники».

   Праздник — особая смена карьеры: жребий в её начале (HOL — частота, HOLIDAYS — таблица праздников). В празднике:
     • объявление Толика в чате через HOL.SAY_AT с;
     • город: гирлянды по краю крыш части домов и спиралью на фонарях (точки — одна склейка-«огоньки» на клетку
       400 м, один материал на весь город), ёлки ярче (ещё спираль огоньков, мишура на ёлке у пиццерии), мишура
       на фасадах у пиццерии (своя склейка полосок), сезон — тот, где новогодние ёлки стоят (seasons.js uNY);
     • прохожие в костюмах (Деды Морозы, Снегурочки; во взрослой — часть Дедов Морозов пьяные: шатаются, бутылка,
       красный нос) — переодеваются обычные прохожие вне кадра;
     • салют и петарды вечером и ночью — частицы одной отрисовкой (в полночь — залпами);
     • заказы: часть — праздничные (оливье-пицца, «к бою курантов» — срочный до 00:00 по часам мира, корпоратив —
       сборный), чаевые щедрее, реплики клиентов к празднику; в чеке смены — праздничная лента.
   Хэллоуин — в таблице с on: false (вернутся сезоны — включить и дописать украшения «тыквы» и «привидения»:
   строители — DECOR_BUILD ниже, костюмы — COSTUME).

   Из game.js: init(api), shiftStart({ ride, quick }) — после погоды (weather.js), announce(), step(dt).
   Из orders.js: chimesDue(), toMidnight(), wantCorp(), olivier(), tag(kind), why(hol, { n, k }), tipChance(), tipMul(), name().
   Из festivals.js: в праздник фестиваля нет (game.js передаёт holiday). Из career.js: ribbon() — лента в чек.
   api: THREE, scene, cam, renderer, Store, CITY, ADULT, V, S, groundH, inBounds, inHouse, inPoly, night(), hour(),
        env() → ENV, dayRate() — долей суток в секунду, people() → прохожие, dress(p, person, o), sayBubble, chat(text),
        onArrive(cb), playing(), PIZZA (геттер)
   Отладка: __dlv.HOL — next(id), start(id), stop(), info(), sim(N), boom(n), folk(), decor().
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';
import * as ECON from './econ.js';
import * as SEAS from './seasons.js';
import { DEBUG as SLD } from './streetlamps.js';   // фонари: где столбы, сбит ли (streetlamps.js)
import { makePerson } from './people.js';
import * as CYCLE from './seasoncycle.js';      // круг сезонов: праздник сезона — по плану (seasoncycle.js holiday)
import './holidays.css';

/* частота — на все праздники вместе */
export const HOL = {
  CHANCE: 0.15,        // шанс праздника в смену, когда прошло GAP_MIN смен
  GAP_MIN: 4,          // после праздника — не раньше чем через 4 смены (три обычные между ними; две подряд не бывает)
  FROM: 3,             // не в первые 3 смены новичка (с 4-й)
  PITY: 14,            // 14 смен подряд (после перерыва) без праздника — следующая точно праздник
  SAY_AT: 2.5,         // объявление Толика через, с
  TIP_CHANCE: 0.15,    // чаевые: шанс + 15 %
  TIP_MUL: 1.25,       // и сумма × 1,25
  LINE_P: 0.6,         // реплика клиента к празднику — на 60 % вручений
  CELL: 400,           // клетка склейки огоньков, м (точки дешёвые — клетка крупнее, меньше отрисовок)
  TCELL: 200,          // клетка склейки мишуры, м
  FOLK_EVERY: 3,       // раз в столько с — проверить, все ли костюмы на улице
  FOLK_FAR: 55,        // переодевать прохожего — дальше стольких м от камеры (или за спиной)
  CHIMES_V: 15,        // «к бою курантов»: адрес не дальше (до полуночи − CHIMES_PAD) × 15 м/с по дорогам
  CHIMES_PAD: 10,
};

const KEY = 'dlv-holiday';

/* Таблица праздников. season — какой сезон смены (seasons.js: 0—1 лето, 1—2 осень, 2—3 зима, 3—4 весна);
   seaAt — куда сдвинуть сезон внутри него, если смена встала не туда (Новый год: где стоят ёлки и гирлянды uNY);
   weight — вес среди подходящих по сезону; decor — что строить (DECOR_BUILD) и цвета огоньков; folk — костюмы
   (COSTUME) и сколько; orders — праздничные заказы; lines — реплики клиентов; ribbon — лента в чек смены */
export const HOLIDAYS = [
  {
    id: 'newyear', on: true, season: 'winter', seaAt: [2.3, 2.6], weight: 1,
    name: N_('Новый год'),
    decor: {
      build: ['roofs', 'lamps', 'firs', 'tinsel'],
      bulbs: ['#ff4a3c', '#ffd23f', '#4dff6e', '#4aa8ff', '#ff6ae0', '#ffe6a0'],
      warm: ['#ffe6a0', '#ffd98a', '#fff2c8'],
      tinsel: ['#e8c040', '#d8dde4', '#d33a3a', '#3fbf5a', '#4a8ae0'],
      roofs: 0.3,      // доля жилых домов от 2 этажей с огоньками по краю крыши (сколько выйдет — не больше ROOF_CAP)
      lamps: 0.6,      // доля фонарей со спиралью огоньков
      fireworks: true,
    },
    folk: [{ kind: 'moroz', n: 4, drunk: 0.5 }, { kind: 'snegurochka', n: 2 }],
    announce: {
      adult: N_('сегодня 31-е! весь город за оливье и мандаринами, заказов — вагон. ближе к полуночи будут «к бою курантов» — срочные, на корпоративы — сборные. пьяных Дедов Морозов не сбивай — им ещё по квартирам'),
      kids: N_('сегодня 31-е! весь город за оливье и мандаринами, заказов — вагон. ближе к полуночи будут «к бою курантов» — срочные, на корпоративы — сборные. Дедов Морозов на дороге объезжай — им ещё по квартирам'),
    },
    orders: {
      olivier: { share: 0.35, k: 1.2, items: [N_('оливье-пицца'), N_('пицца «Мандариновая»'), N_('пицца «Селёдка под шубой»')],
        why: N_('к праздничному столу · оплата ×{k}') },
      corp: { share: 0.3, max: 2, k: 1.25, item: N_('набор «Корпоратив»'),
        why: N_('корпоратив: {n} офиса празднуют, порядок выбираешь сам · оплата ×{k}') },
      chimes: { k: 1.2, win: [45, 110], item: N_('пицца «Бой курантов»'),
        why: N_('к бою курантов: успеть до 00:00 · оплата ×{k} · не успеешь — штраф') },
    },
    lines: {
      all: [N_('С наступающим! Это вам — мандаринка!'), N_('Оливье в пицце? Гениально. С Новым годом!'),
        N_('Успел до курантов! Ты наш Дед Мороз!'), N_('Держи на чай — Новый год же!')],
      adult: [N_('Заходи, нальём! А, ты за рулём… ну, с праздником!')],
      kids: [N_('Заходи на салатик! А, работа… ну, с праздником!')],
    },
    ribbon: { title: N_('С Новым годом!'), sub: N_('праздничная смена · новогодних заказов: {n}'), none: N_('праздничная смена') },
  },
  {
    // 17.10.2026: включён вместе с кругом сезонов (seasoncycle.js) — последняя смена осени. Тыквы со светящимися рожицами
    // и привидения-простыни — DECOR_BUILD pumpkins / ghosts, костюмы ведьм и привидений — COSTUME
    id: 'halloween', on: true, season: 'autumn', seaAt: [1.55, 1.85], weight: 1,
    name: N_('Хэллоуин'),
    decor: {
      build: ['roofs', 'lamps', 'pumpkins', 'ghosts'],
      bulbs: ['#ff8a1e', '#9b4dff', '#7dff4a', '#ff8a1e'],
      warm: ['#ffb060', '#ff8a1e'],
      tinsel: ['#ff8a1e', '#2b2a30', '#9b4dff'],
      roofs: 0.18, lamps: 0.35, fireworks: false,
    },
    folk: [{ kind: 'witch', n: 4 }, { kind: 'ghost', n: 4 }],
    announce: {
      adult: N_('сегодня Хэллоуин! город в тыквах, над дворами летают привидения, по улицам ходят ведьмы. ведьм не сбивай — проклянут. тыквенную пиццу везём с наценкой'),
      kids: N_('сегодня Хэллоуин! город в тыквах, над дворами летают привидения, по улицам ходят ведьмы. тыквенную пиццу везём с наценкой'),
    },
    orders: { olivier: { share: 0.35, k: 1.2, items: [N_('тыквенная пицца'), N_('пицца «Кровавая Мэри» (томатная)'), N_('пицца «Ведьмин котёл»')], why: N_('к Хэллоуину · оплата ×{k}') } },
    lines: {
      all: [N_('Сладость или гадость? Ладно, пицца.'), N_('Ой, курьер! А я думал — привидение.'), N_('Тыквенная? Жуть как вкусно!')],
      adult: [N_('Заходи, у нас вечеринка вампиров! А, ты за рулём…')],
      kids: [N_('Хочешь конфетку? Хэллоуин же!')],
    },
    ribbon: { title: N_('Хэллоуин'), sub: N_('праздничная смена · праздничных заказов: {n}'), none: N_('праздничная смена') },
  },
];

let A = null, THREE = null;
let CUR = null;                       // идущий праздник: { h, n, corp, chimes, got, seen }
const ST = { forced: null, lastRibbon: null };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const byId = id => HOLIDAYS.find(h => h.id === id) || null;
const SEASON_OF = v => ['summer', 'autumn', 'winter', 'spring'][Math.floor(((v % 4) + 4) % 4) % 4];

export function init (api) {
  A = api; THREE = api.THREE;
  if (A.onArrive) A.onArrive(onArrive);
  setTimeout(() => { if (window.__dlv) window.__dlv.HOL = DEBUG; }, 0);
}

/* ─────────────── когда ─────────────── */
function save (o) { try { A.Store.set(KEY, JSON.stringify(o)); } catch (e) { /* без сохранения — не страшно */ } }
function load () { try { return JSON.parse(A.Store.get(KEY, '') || '{}') || {}; } catch (e) { return {}; } }
/* shifts — законченных смен, sv — память { last, since, id }, sk — сезон смены. → праздник или null; sv меняется на месте */
function decide (shifts, sv, sk, rnd = Math.random) {
  if (shifts < HOL.FROM) return null;                                   // не в первые смены новичка
  if (sv.last != null && shifts - sv.last < HOL.GAP_MIN) return null;   // после праздника — перерыв
  const list = HOLIDAYS.filter(h => h.on && h.season === sk);
  if (!list.length) return null;                                        // в этом сезоне праздников нет
  const since = sv.since || 0;
  if (since + 1 < HOL.PITY && rnd() >= HOL.CHANCE) { sv.since = since + 1; return null; }
  let sum = 0;
  for (const h of list) sum += h.weight * (h.id === sv.id && list.length > 1 ? 0.3 : 1);
  let r = rnd() * sum, h = list[0];
  for (const q of list) { r -= q.weight * (q.id === sv.id && list.length > 1 ? 0.3 : 1); if (r <= 0) { h = q; break; } }
  sv.since = 0; sv.last = shifts; sv.id = h.id;
  return h;
}

export function shiftStart (o = {}) {
  if (!A) return;
  const want = ST.forced;
  ST.forced = null;
  end();
  ST.lastRibbon = null;          // лента прошлого праздника — только в его чек (до 17.10 висела во всех чеках до следующего праздника)
  if (o.ride || o.quick) return;
  let h = null;
  const plan = CYCLE.holiday();                     // круг сезонов (17.10.2026): Новый год — во вторую смену зимы, Хэллоуин — в последнюю осени
  const shifts = +A.Store.get('dlv-shifts', 0) || 0;
  if (want) h = byId(want);
  else if (plan !== undefined) {
    h = plan && shifts >= HOL.FROM ? byId(plan) : null;
    if (h && !h.on) h = null;
    if (h) { const sv = load(); sv.since = 0; sv.last = shifts; sv.id = h.id; save(sv); }
  } else {
    const sv = load();
    h = decide(shifts, sv, SEASON_OF(SEAS.seasonValue()));
    save(sv);
  }
  if (h) begin(h);
}
function begin (h) {
  CUR = { h, n: 0, corp: 0, chimes: false, got: 0, seen: new WeakSet() };
  ST.lastRibbon = null;
  CYCLE.held(h.id, +A.Store.get('dlv-shifts', 0) || 0);   // круг сезонов: такой же праздник по плану скоро — не встанет и не обещается
  // Новый год: сезон — где новогодние ёлки и гирлянды стоят (seasons.js K.ny)
  const v = SEAS.seasonValue();
  if (h.seaAt && !SEAS.seasonForced() && (v < h.seaAt[0] || v > h.seaAt[1])) SEAS.shiftSeason(rand(h.seaAt[0], h.seaAt[1]));
  decorOn(h);
  F.t = 0.5;
}
function end () {
  if (CUR) ST.lastRibbon = { h: CUR.h, got: CUR.got };
  CUR = null;
  decorOff();
  folkOff();
  for (const b of BUB) drop(b);
  BUB.length = 0;
}
export const active = () => (CUR ? CUR.h.id : '');
export const name = () => (CUR ? t(CUR.h.name) : '');

/* ─────────────── объявление ─────────────── */
export function announce () {
  if (!CUR) return;
  const id = CUR, a = CUR.h.announce;
  setTimeout(() => { if (CUR === id && A.chat) A.chat(t(A.ADULT ? a.adult : a.kids)); }, HOL.SAY_AT * 1000);
}

/* ─────────────── каждый кадр ─────────────── */
const U = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 400 } };
const SZ = { v: null };
const PERF = { avg: 0, max: 0, n: 0 };                // сколько стоит кадр праздника, мс (отладка: info().perf)
export function step (dt) {
  if (!A) return;
  const t0 = performance.now();
  stepIn(dt);
  const ms = performance.now() - t0;
  PERF.avg += (ms - PERF.avg) * 0.02; PERF.max = Math.max(PERF.max * 0.999, ms); PERF.n++;
}
function stepIn (dt) {
  if (BUILD.gen) buildStep();
  U.uTime.value += dt;
  U.uNight.value = A.night ? A.night() || 0 : 0;
  if (A.renderer && A.cam) {                                         // размер точки на экране: высота кадра × проекция
    if (!SZ.v) SZ.v = new THREE.Vector2();
    A.renderer.getDrawingBufferSize(SZ.v);
    U.uScale.value = SZ.v.y * 0.5 * A.cam.projectionMatrix.elements[5];
  }
  fwStep(dt, !!(CUR && CUR.h.decor.fireworks));
  bubStep(dt);
  if (!CUR) return;
  lampStep(dt);
  folkStep(dt);
  ghostStep();
}

/* ═════════════════════ украшения ═════════════════════
   Огоньки — THREE.Points: точка с круглым светящимся пятном, размер в метрах (вдали — не меньше 1,6 px, ночью — крупнее
   и ярче, мигают каждая по-своему). Одна склейка на клетку 400 м, материал один на весь город. Мишура — полоски
   (два треугольника), своя склейка у пиццерии. Строится один раз на праздник при первом включении — кусками по
   ~3 мс в кадр, дальше только прячется и показывается */
const DECOR = new Map();               // id праздника → { pts: [Points], tin: [Mesh], lamps: [], n, ms }
const BUILD = { gen: null, id: '', ms: 0 };
let PMAT = null, TMAT = null;

function ptsMat () {
  if (PMAT) return PMAT;
  PMAT = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `attribute vec3 aux; uniform float uTime, uNight, uScale; varying vec3 vC; varying float vTw;
      #include <fog_pars_vertex>
      void main () {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vTw = 0.5 + 0.5 * sin(uTime * (1.3 + fract(aux.y * 7.3) * 2.6) + aux.y * 40.0);
        gl_PointSize = clamp(aux.x * (1.0 + uNight * 0.7) * uScale / max(-mvPosition.z, 0.5), 1.6, 24.0);
        vC = color;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uNight; varying vec3 vC; varying float vTw;
      #include <fog_pars_fragment>
      void main () {
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
        if (r > 1.0) discard;
        float core = 1.0 - r;
        vec3 c = vC * (mix(0.8, 1.0, uNight) * mix(0.55, 1.35, vTw) + uNight * 0.55 * vTw);
        c = mix(c, vec3(1.0), core * core * (0.15 + 0.35 * uNight));
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    vertexColors: true, fog: true,
  });
  Object.assign(PMAT.uniforms, U);                 // общие юниформы (время, ночь, размер кадра)
  PMAT.userData.keep = true; PMAT.userData.glow = 1;
  return PMAT;
}
function tinMat () {
  if (TMAT) return TMAT;
  TMAT = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `attribute float aPh; uniform float uTime; varying vec3 vC; varying float vG;
      #include <fog_pars_vertex>
      void main () {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vG = pow(max(0.0, sin(uTime * 2.7 + aPh * 37.0 + position.y * 3.0)), 14.0);   // блик пробегает по мишуре
        vC = color;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uNight; varying vec3 vC; varying float vG;
      #include <fog_pars_fragment>
      void main () {
        gl_FragColor = vec4(vC * mix(1.0, 0.42, uNight) + vec3(vG * (0.55 + 0.3 * uNight)), 1.0);
        #include <fog_fragment>
      }`,
    vertexColors: true, fog: true, side: THREE.DoubleSide,
  });
  Object.assign(TMAT.uniforms, U);
  TMAT.userData.keep = true; TMAT.userData.glow = 1;
  return TMAT;
}

/* клетки: точки (огоньки) и полоски (мишура) */
function Cells () {
  const m = new Map();
  const cell = (x, z, S = HOL.CELL) => {
    const k = S + ':' + Math.floor(x / S) + ',' + Math.floor(z / S);
    let c = m.get(k);
    if (!c) m.set(k, c = { k, p: [], c: [], a: [], tp: [], tc: [], ta: [] });
    return c;
  };
  const rgb = new Map();
  const col = hex => { let v = rgb.get(hex); if (!v) { const q = new THREE.Color(hex); v = [Math.round(q.r * 255), Math.round(q.g * 255), Math.round(q.b * 255)]; rgb.set(hex, v); } return v; };
  return {
    m,
    /* огонёк: размер size м, фаза мигания ph 0…1 → { c: клетка, i: номер точки в ней } */
    bulb (x, y, z, hex, size, ph) {
      const c = cell(x, z), i = c.p.length / 3, v = col(hex);
      c.p.push(x, y, z); c.c.push(v[0], v[1], v[2]); c.a.push(size, ph, 0);
      return { c, i };
    },
    /* полоска мишуры: середина верха (x, y, z), вдоль (ux, uz) шириной w, вниз длиной h */
    strip (x, y, z, ux, uz, w, h, hex, ph) {
      const c = cell(x, z, HOL.TCELL), v = col(hex), hw = w / 2;
      const ax = x - ux * hw, az = z - uz * hw, bx = x + ux * hw, bz = z + uz * hw, lo = y - h;
      c.tp.push(ax, y, az, bx, y, bz, bx, lo, bz, ax, y, az, bx, lo, bz, ax, lo, az);
      for (let k = 0; k < 6; k++) { c.tc.push(v[0], v[1], v[2]); c.ta.push(ph); }
    },
  };
}
const geoOf = (p, c, extra) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(c), 3, true));
  for (const k in extra) g.setAttribute(k, extra[k]);
  g.computeBoundingSphere();
  return g;
};

/* детерминированный шум от точки (тот же дом — те же огоньки) */
function hsh (x, z, k = 0) {
  let h = Math.imul(Math.round(x * 16) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 16) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const pickH = (a, x, z, k) => a[Math.floor(hsh(x, z, k) * a.length) % a.length];

const ROOF_CAP = 40000, LAMP_CAP = 16000, TIN_CAP = 6000;
/* строители украшений: function*(ctx) — шагами (yield), чтобы не вешать кадр */
const DECOR_BUILD = {
  /* огоньки по краю крыши: жилые дома от 2 этажей, доля decor.roofs (сколько уместится в ROOF_CAP) */
  * roofs (X) {
    const { D, cells, out } = X, B = A.CITY.buildings || [];
    const cand = [];
    let per = 0, n = 0;
    for (const b of B) {
      if (++n % 500 === 0) yield;
      if (b.k === 'gar' || b.k === 'ind' || b.k === 'church' || !b.p || b.p.length < 3) continue;
      let s2 = 0, cx = 0, cz = 0, L = 0;
      for (let i = 0; i < b.p.length; i++) {
        const a = b.p[i], c = b.p[(i + 1) % b.p.length];
        s2 += a[0] * c[1] - c[0] * a[1]; cx += a[0] / b.p.length; cz += a[1] / b.p.length; L += Math.hypot(c[0] - a[0], c[1] - a[1]);
      }
      const area = Math.abs(s2) / 2, lv = b.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
      if (lv < 2 || !A.inBounds(cx, cz, 0)) continue;
      cand.push({ b, cx, cz, lv, L });
      per += L;
    }
    const share = Math.min(D.roofs, ROOF_CAP * 0.85 * 0.75 / Math.max(1, per));   // огонёк — через 0,85 м; с запасом, чтобы не упереться в потолок
    let bulbs = 0;
    n = 0;
    for (const q of cand) {
      if (++n % 60 === 0) yield;
      if (bulbs >= ROOF_CAP || hsh(q.cx, q.cz, 301) > share) continue;
      const p = q.b.p;
      let hHi = -Infinity;
      for (const v of p) hHi = Math.max(hHi, A.groundH(v[0], v[1]));
      const y = hHi + 3.15 * q.lv + 1.1 - 0.15;
      const multi = hsh(q.cx, q.cz, 302) < 0.65, ph0 = hsh(q.cx, q.cz, 303);
      for (let i = 0; i < p.length && bulbs < ROOF_CAP; i++) {
        const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 2) continue;
        let nx = dz / len, nz = -dx / len;
        if (A.inPoly((a[0] + c[0]) / 2 + nx * 0.5, (a[1] + c[1]) / 2 + nz * 0.5, p)) { nx = -nx; nz = -nz; }   // наружу
        for (let d = 0.3; d < len - 0.2 && bulbs < ROOF_CAP; d += 0.85) {
          const k = (d / 0.85) | 0;
          cells.bulb(a[0] + dx / len * d + nx * 0.22, y, a[1] + dz / len * d + nz * 0.22,
            multi ? D.bulbs[k % D.bulbs.length] : D.warm[k % D.warm.length], 0.42, (ph0 + k * 0.137) % 1);
          bulbs++;
        }
      }
      out.houses++;
    }
    out.roof = bulbs;
  },
  /* спираль огоньков на столбах фонарей (доля decor.lamps); сбили фонарь — его огоньки прячутся (lampStep) */
  * lamps (X) {
    const { D, cells, out } = X, L = SLD.LAMPS || [];
    const TOP = { cobra: 6.1, ball: 4.4, twin: 4.4, wood: 5.6, woodball: 5.6, park: 3.8, yard: 5.0 };
    const RAD = { cobra: 0.21, ball: 0.17, twin: 0.17, wood: 0.21, woodball: 0.21, park: 0.15, yard: 0.19 };
    let bulbs = 0, n = 0;
    for (const r of L) {
      if (++n % 120 === 0) yield;
      if (bulbs >= LAMP_CAP) break;
      const top = TOP[r.style];
      if (!top || hsh(r.x, r.z, 311) > D.lamps || !A.inBounds(r.x, r.z, 0)) continue;
      const N = Math.round(top * 2.6), rad = RAD[r.style], a0 = hsh(r.x, r.z, 312) * 6.28, multi = hsh(r.x, r.z, 313) < 0.7;
      let first = null;
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1), a = a0 + f * 5.5 * 6.283;
        const q = cells.bulb(r.x + Math.sin(a) * rad, r.y + 0.6 + f * (top - 0.6), r.z + Math.cos(a) * rad,
          multi ? D.bulbs[i % D.bulbs.length] : D.warm[i % D.warm.length], 0.26, hsh(r.x + i, r.z, 314));
        if (!first) first = q;
      }
      X.lamps.push({ rec: r, c: first.c, i0: first.i, n: N, dn: false });
      bulbs += N;
      out.lamps++;
    }
    out.lampBulbs = bulbs;
  },
  /* новогодние ёлки (seasons.js): ещё две спирали огоньков; на ёлке у пиццерии — и мишура */
  * firs (X) {
    const { D, cells, out } = X, FIRS = SEAS.firs ? SEAS.firs() : [];
    FIRS.forEach((f, j) => {
      const k = f.k, y = A.groundH(f.x, f.z);
      for (const off of [0, Math.PI]) {
        const N = 240;
        for (let i = 0; i < N; i++) {
          const q = i / N, a = off + q * 8 * 6.283, rr = (4.75 - q * 3.9) * k + 0.1;
          cells.bulb(f.x + Math.sin(a) * rr, y + (1.4 + q * 9.4) * k, f.z + Math.cos(a) * rr, D.bulbs[i % D.bulbs.length], 0.26, (i * 0.0618 + j * 0.3) % 1);
        }
        out.firBulbs += N;
      }
      if (j === 0) {                                     // у пиццерии: мишура серебром и золотом
        for (let i = 0; i < 300; i++) {
          const q = i / 300, a = 1.3 + q * 6 * 6.283, rr = (4.85 - q * 3.9) * k + 0.18;
          cells.strip(f.x + Math.sin(a) * rr, y + (1.6 + q * 9.0) * k + 0.5, f.z + Math.cos(a) * rr, Math.cos(a), -Math.sin(a), 0.32, 0.55, i % 3 === 2 ? D.tinsel[0] : D.tinsel[1], q);
        }
        out.tinsel += 300;
      }
    });
    out.firs = FIRS.length;
    yield;
  },
  /* мишура на фасадах у пиццерии: провисающими гирляндами над первым этажом, у каждого дома свой цвет */
  * tinsel (X) {
    const { D, cells, out } = X, PZ = A.PIZZA, B = A.CITY.buildings || [];
    if (!PZ) return;
    let n = 0, strips = 0;
    for (const b of B) {
      if (++n % 400 === 0) yield;
      if (strips >= TIN_CAP) break;
      if (b.k === 'gar' || b.k === 'ind' || !b.p || b.p.length < 3) continue;
      let cx = 0, cz = 0;
      for (const q of b.p) { cx += q[0] / b.p.length; cz += q[1] / b.p.length; }
      if (Math.hypot(cx - PZ.x, cz - PZ.z) > 230 || hsh(cx, cz, 321) > 0.55) continue;
      const hex = pickH(D.tinsel, cx, cz, 322), hy = 2.9 + hsh(cx, cz, 323) * 0.5;
      for (let i = 0; i < b.p.length && strips < TIN_CAP; i++) {
        const a = b.p[i], c = b.p[(i + 1) % b.p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
        if (len < 4) continue;
        let nx = dz / len, nz = -dx / len;
        if (A.inPoly((a[0] + c[0]) / 2 + nx * 0.5, (a[1] + c[1]) / 2 + nz * 0.5, b.p)) { nx = -nx; nz = -nz; }
        const ux = dx / len, uz = dz / len, span = 3.2;
        for (let d = 0.3; d < len - 0.3 && strips < TIN_CAP; d += 0.2) {
          const x = a[0] + ux * d + nx * 0.16, z = a[1] + uz * d + nz * 0.16, f = (d % span) / span;
          cells.strip(x, A.groundH(x, z) + hy - 1.7 * f * (1 - f), z, ux, uz, 0.13, 0.36, hex, hsh(x, z, 324));
          strips++;
        }
      }
    }
    out.tinsel += strips;
  },
};

/* ═════════════════════ Хэллоуин: тыквы и привидения ═════════════════════
   По-детски жутко, кодом. Тыква — приплюснутый шар с рёбрами и хвостиком, рожица — плоская картинка с треугольными
   глазами и зубастым ртом без света (видна и днём, ночью светится, как фонарик). Тыквы стоят у подъездов (сбоку от
   двери, смотрят наружу; у пиццерии — гуще, PUMPKIN); склейка — InstancedMesh на клетку 800 м
   (вне кадра не рисуются). Привидение — простыня с волнистым подолом, чёрные глаза-овалы и рот «о»: GHOST.N штук
   висят у стен домов на 2,6—5 м рядом с курьером (уехал — дальние переселяются вперёд, вне кадра), покачиваются
   и плавают вверх-вниз */
const PUMPKIN = { CAP: 1600, NEAR: 900, NEAR_P: 0.5, FAR_P: 0.08, CELL: 800, SIZE: [1.3, 2.1] };
const GHOST = { N: 36, H: [2.6, 5], NEAR: [45, 190], FAR: 230, CELL: 100, SPOTS: 12000, CHECK: 0.12 };
function pumpkinGeo () {
  const g = new THREE.SphereGeometry(0.34, 14, 9);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rib = 1 + 0.09 * Math.cos(a * 8);
    p.setXYZ(i, x * rib, y * 0.74 + 0.25, z * rib);
    const k = 0.82 + 0.18 * Math.cos(a * 8);
    col.push(0.93 * k, 0.42 * k, 0.05 * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const st = new THREE.CylinderGeometry(0.035, 0.05, 0.14, 6);
  st.translate(0.01, 0.53, 0);
  const sc = [];
  for (let i = 0; i < st.attributes.position.count; i++) sc.push(0.25, 0.32, 0.12);
  st.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  return mergeTwo(g, st);
}
function mergeTwo (a, b) {
  const A1 = a.index ? a.toNonIndexed() : a, B1 = b.index ? b.toNonIndexed() : b, out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const x = A1.attributes[k].array, y = B1.attributes[k].array, z = new Float32Array(x.length + y.length);
    z.set(x); z.set(y, x.length);
    out.setAttribute(k, new THREE.BufferAttribute(z, 3));
  }
  return out;
}
function faceTex () {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd23f';
  const tri = (x, y, w, h) => { g.beginPath(); g.moveTo(x - w / 2, y + h / 2); g.lineTo(x + w / 2, y + h / 2); g.lineTo(x, y - h / 2); g.closePath(); g.fill(); };
  tri(36, 30, 30, 26); tri(92, 30, 30, 26); tri(64, 50, 14, 12);
  g.beginPath();                                   // зубастый рот
  g.moveTo(16, 62);
  for (let i = 0; i <= 8; i++) g.lineTo(16 + i * 12, 62 + (i % 2 ? 8 : 0));
  g.lineTo(112, 62); g.quadraticCurveTo(64, 104, 16, 62); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,0)';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
  return t;
}
function ghostGeo () {
  // профиль простыни: голова-купол → плечи → расширяющийся подол
  const pr = [[0.001, 1.25], [0.16, 1.22], [0.27, 1.12], [0.32, 0.98], [0.33, 0.8], [0.37, 0.5], [0.45, 0.18], [0.5, 0]];
  const g = new THREE.LatheGeometry(pr.map(q => new THREE.Vector2(q[0], q[1])), 14);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    if (y < 0.05) p.setY(i, y + 0.08 * Math.sin(a * 6));        // волнистый подол
    col.push(0.95, 0.95, 0.97);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  let G = g;
  // глаза и рот: тёмные овалы на лице (смотрит по +z)
  for (const [x, y, sx, sy] of [[-0.1, 1.0, 0.055, 0.08], [0.1, 1.0, 0.055, 0.08], [0, 0.84, 0.05, 0.06]]) {
    const e = new THREE.SphereGeometry(1, 8, 6);
    e.scale(sx, sy, 0.03); e.translate(x, y, y > 0.9 ? 0.31 : 0.325);
    const ec = [];
    for (let i = 0; i < e.attributes.position.count; i++) ec.push(0.06, 0.05, 0.08);
    e.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
    G = mergeTwo(G, e);
  }
  return G;
}
/* наружу от подъезда: свой вектор (сгенерированные подъезды) или ищем сторону, где не дом */
function doorOut (e) {
  if (e.length >= 4 && Number.isFinite(e[2])) return [e[2], e[3]];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, ox = Math.sin(a), oz = Math.cos(a);
    if (!A.inHouse(e[0] + ox * 1.4, e[1] + oz * 1.4, 0) && A.inHouse(e[0] - ox * 1.0, e[1] - oz * 1.0, 0)) return [ox, oz];
  }
  return null;
}
const DUMMY = { o: null };
const obj = () => DUMMY.o || (DUMMY.o = new THREE.Object3D());
DECOR_BUILD.pumpkins = function* (X) {
  const E = A.CITY.entrances || [], PZ = A.PIZZA, spots = [];
  let n = 0;
  for (const e of E) {
    if (++n % 300 === 0) yield;
    if (spots.length >= PUMPKIN.CAP) break;
    const dn = PZ ? Math.hypot(e[0] - PZ.x, e[1] - PZ.z) : 1e9;
    if (hsh(e[0], e[1], 401) > (dn < PUMPKIN.NEAR ? PUMPKIN.NEAR_P : PUMPKIN.FAR_P) || !A.inBounds(e[0], e[1], 0)) continue;
    const o = doorOut(e);
    if (!o) continue;
    const [ox, oz] = o, side = hsh(e[0], e[1], 405) < 0.5 ? 1 : -1, two = hsh(e[0], e[1], 406) < 0.35;
    for (const sd of two ? [side, -side] : [side]) {
      const x = e[0] + ox * 0.75 + oz * sd * 1.8, z = e[1] + oz * 0.75 - ox * sd * 1.8;   // сбоку от двери — мимо урны и лавочки
      if (!A.inHouse(x, z, 0.25)) spots.push({ x, z, a: Math.atan2(ox, oz) + sd * 0.35 });
    }
  }
  if (!spots.length) return;
  // по клеткам: InstancedMesh тела и рожицы на клетку, своя граница — вне кадра не рисуются
  const cells = new Map();
  for (const q of spots) { const k = Math.floor(q.x / PUMPKIN.CELL) + ',' + Math.floor(q.z / PUMPKIN.CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(q); }
  const geo = pumpkinGeo(), bodyM = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a1500 });   // чуть светится изнутри — ночью видно
  const fg = new THREE.PlaneGeometry(0.36, 0.27);
  fg.translate(0, 0.27, 0.38);
  const faceM = new THREE.MeshBasicMaterial({ map: faceTex(), transparent: true, alphaTest: 0.4, color: 0xffffff });
  faceM.userData.glow = 1;
  const o = obj();
  for (const list of cells.values()) {
    const body = new THREE.InstancedMesh(geo, bodyM, list.length), face = new THREE.InstancedMesh(fg, faceM, list.length);
    list.forEach((q, i) => {
      const s = PUMPKIN.SIZE[0] + hsh(q.x, q.z, 402) * (PUMPKIN.SIZE[1] - PUMPKIN.SIZE[0]);
      o.position.set(q.x, A.groundH(q.x, q.z) - 0.03, q.z);
      o.rotation.set(0, q.a + (hsh(q.x, q.z, 403) - 0.5) * 0.5, 0);
      o.scale.set(s, s * (0.85 + hsh(q.x, q.z, 404) * 0.3), s);
      o.updateMatrix();
      body.setMatrixAt(i, o.matrix); face.setMatrixAt(i, o.matrix);
    });
    for (const m of [body, face]) { m.visible = false; m.matrixAutoUpdate = false; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); A.scene.add(m); X.extra.push(m); }
    yield;
  }
  X.out.pumpkins = spots.length; X.out.pumpkinCells = cells.size;
};
DECOR_BUILD.ghosts = function* (X) {
  // места: середины длинных стен жилых домов, 0,6 м наружу (сетка GHOST.CELL м)
  const B = A.CITY.buildings || [], grid = new Map();
  let n = 0, cnt = 0;
  for (const b of B) {
    if (++n % 400 === 0) yield;
    if (cnt >= GHOST.SPOTS) break;
    if (b.k === 'gar' || b.k === 'ind' || !b.p || b.p.length < 3 || hsh(b.p[0][0], b.p[0][1], 411) > 0.7) continue;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i], c = b.p[(i + 1) % b.p.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 6 || hsh(a[0], a[1], 412) > 0.8) continue;
      let nx = dz / len, nz = -dx / len;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (A.inPoly(mx + nx * 0.5, mz + nz * 0.5, b.p)) { nx = -nx; nz = -nz; }
      const x = mx + nx * 1.4, z = mz + nz * 1.4;
      if (!A.inBounds(x, z, 0)) continue;
      const k = Math.floor(x / GHOST.CELL) + ',' + Math.floor(z / GHOST.CELL);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push({ x, z, a: Math.atan2(nx, nz), y: A.groundH(x, z) });
      cnt++;
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3f4a });
  const m = new THREE.InstancedMesh(ghostGeo(), mat, GHOST.N);
  m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = false;
  A.scene.add(m);
  X.extra.push(m);
  X.ghosts = { m, grid, list: Array.from({ length: GHOST.N }, (_, i) => ({ x: 0, z: 0, y: -999, a: 0, ph: i * 1.7, s: 0.85 + (i % 5) * 0.12, on: false })), i: 0, t: 0, moved: 0 };
  X.out.ghosts = GHOST.N; X.out.ghostSpots = cnt;
  yield;
};
/* одно привидение — на стену рядом с курьером (вне кадра или дальше 120 м); нет места — прячется */
function ghostPlace (G, q) {
  const V = A.V, c = A.cam.position;
  if (!FV) FV = new THREE.Vector3();
  A.cam.getWorldDirection(FV);
  const ci = Math.floor(V.x / GHOST.CELL), cj = Math.floor(V.z / GHOST.CELL), R = Math.ceil(GHOST.NEAR[1] / GHOST.CELL);
  for (let k = 0; k < 24; k++) {
    const cell = G.grid.get((ci + Math.round((Math.random() * 2 - 1) * R)) + ',' + (cj + Math.round((Math.random() * 2 - 1) * R)));
    if (!cell || !cell.length) continue;
    const p = cell[(Math.random() * cell.length) | 0], d = Math.hypot(p.x - V.x, p.z - V.z);
    if (d < GHOST.NEAR[0] || d > GHOST.NEAR[1]) continue;
    const dx = p.x - c.x, dz = p.z - c.z;
    if (d < 120 && dx * FV.x + dz * FV.z > 0) continue;              // в кадре и близко — не появляться на глазах
    if (G.list.some(o => o.on && Math.abs(o.x - p.x) < 6 && Math.abs(o.z - p.z) < 6)) continue;
    q.x = p.x; q.z = p.z; q.a = p.a; q.y = p.y + GHOST.H[0] + Math.random() * (GHOST.H[1] - GHOST.H[0]); q.on = true;
    G.moved++;
    return;
  }
  q.on = false;
}
/* привидения плавают: вверх-вниз 0,25 м, качаются ±0,18 рад, поворачиваются туда-сюда; дальние — переселяются */
let GH_T = 0;
function ghostStep () {
  const R = DECOR.get(CUR.h.id), G = R && R.ghosts;
  if (!G || !G.m.visible) return;
  const dt = 1 / 60;
  if (!G.filled) { G.filled = true; for (const q of G.list) ghostPlace(G, q); }   // праздник начался — сразу все вокруг
  if ((G.t -= dt) <= 0) {                                    // по одному за раз: кто далеко или не стоит — к курьеру
    G.t = GHOST.CHECK;
    const q = G.list[G.i = (G.i + 1) % G.list.length];
    if (!q.on || Math.hypot(q.x - A.V.x, q.z - A.V.z) > GHOST.FAR) ghostPlace(G, q);
  }
  if ((GH_T = (GH_T + 1) % 2)) return;                       // матрицы — через кадр: движение медленное
  const tm = U.uTime.value, o = obj();
  for (let i = 0; i < G.list.length; i++) {
    const q = G.list[i];
    o.position.set(q.x, q.on ? q.y + Math.sin(tm * 1.3 + q.ph) * 0.25 : -999, q.z);
    o.rotation.set(Math.sin(tm * 0.9 + q.ph) * 0.12, q.a + Math.sin(tm * 0.5 + q.ph) * 0.5, Math.sin(tm * 1.1 + q.ph * 2) * 0.18);
    o.scale.setScalar(q.on ? q.s : 0.001);
    o.updateMatrix();
    G.m.setMatrixAt(i, o.matrix);
  }
  G.m.instanceMatrix.needsUpdate = true;
}

function* buildGen (h) {
  const t0 = performance.now();
  const X = { D: h.decor, cells: Cells(), lamps: [], extra: [], ghosts: null, out: { houses: 0, roof: 0, lamps: 0, lampBulbs: 0, firs: 0, firBulbs: 0, tinsel: 0 } };
  for (const k of h.decor.build) if (DECOR_BUILD[k]) yield* DECOR_BUILD[k](X);
  const R = { pts: [], tin: [], lamps: X.lamps, extra: X.extra, ghosts: X.ghosts, out: X.out, n: 0, ms: 0 };
  let nc = 0;
  for (const c of X.cells.m.values()) {
    if (c.p.length) {
      const g = geoOf(c.p, c.c, { aux: new THREE.BufferAttribute(new Float32Array(c.a), 3) });
      const m = new THREE.Points(g, ptsMat());
      m.matrixAutoUpdate = false; m.visible = false; m.renderOrder = 2;
      A.scene.add(m);
      R.pts.push(m); c.mesh = m;
      R.n += c.p.length / 3;
    }
    if (c.tp.length) {
      const g = geoOf(c.tp, c.tc, { aPh: new THREE.BufferAttribute(new Float32Array(c.ta), 1) });
      const m = new THREE.Mesh(g, tinMat());
      m.matrixAutoUpdate = false; m.visible = false;
      A.scene.add(m);
      R.tin.push(m);
    }
    if (++nc % 6 === 0) yield;
  }
  for (const L of X.lamps) { L.mesh = L.c.mesh; L.y0 = L.mesh.geometry.attributes.position.array.slice(L.i0 * 3, (L.i0 + L.n) * 3); delete L.c; }
  R.ms = Math.round(performance.now() - t0);
  return R;
}
function buildStep () {
  const t0 = performance.now();
  for (;;) {
    const r = BUILD.gen.next();
    if (r.done) {
      const R = r.value;
      R.ms = Math.round(BUILD.ms + performance.now() - t0);
      DECOR.set(BUILD.id, R);
      BUILD.gen = null;
      if (CUR && CUR.h.id === BUILD.id) show(R, true);
      return;
    }
    if (performance.now() - t0 > 3) break;               // ~3 мс в кадр
  }
  BUILD.ms += performance.now() - t0;
}
function show (R, on) {
  for (const m of R.pts) m.visible = on;
  for (const m of R.tin) m.visible = on;
  for (const m of R.extra || []) m.visible = on;
}
function decorOn (h) {
  const R = DECOR.get(h.id);
  if (R) { if (R.ghosts) R.ghosts.filled = false; show(R, true); return; }   // привидения — заново вокруг курьера
  if (BUILD.gen && BUILD.id === h.id) return;
  BUILD.gen = buildGen(h); BUILD.id = h.id; BUILD.ms = 0;
}
function decorOff () { for (const R of DECOR.values()) show(R, false); }

/* сбитый фонарь — его огоньки под землю, поставили обратно — на место */
let LAMP_T = 0;
function lampStep (dt) {
  if ((LAMP_T -= dt) > 0) return;
  LAMP_T = 0.25;
  const R = DECOR.get(CUR.h.id);
  if (!R) return;
  for (const L of R.lamps) {
    const dn = !!L.rec.down;
    if (dn === L.dn) continue;
    L.dn = dn;
    const pa = L.mesh.geometry.attributes.position, a = pa.array;
    if (dn) for (let i = 0; i < L.n; i++) a[(L.i0 + i) * 3 + 1] = -3000;
    else a.set(L.y0, L.i0 * 3);
    pa.needsUpdate = true;
  }
}

/* ═════════════════════ прохожие в костюмах ═════════════════════ */
const COSTUME = {
  moroz (drunk) {
    const p = makePerson({ fem: false, first: t('Дед'), last: t('Мороз') });
    Object.assign(p.look, { age: 'old', beard: 'full', hair: 'short', hairC: '#f2f2f2', browC: '#e8e8e8', headC: '#c4161c', pompom: true, tieC: '#f6f6f6', glasses: 'none', fat: true, shape: 'chubby' });
    if (drunk) Object.assign(p.look, { bottle: '#3f8a4a', noseC: '#d8506a' });
    return { person: p, o: { shirt: '#c4161c', pants: '#c4161c', hat: 'beanie', fat: true } };
  },
  snegurochka () {
    const p = makePerson({ fem: true, first: t('Снегурочка'), last: '' });
    Object.assign(p.look, { age: 'young', hair: 'braid', hairC: '#e8cf8f', browC: '#a57a4a', headC: '#e6f2ff', pompom: true, tieC: '#ffffff', bottom: 'skirt', skirt: '#5aa0dc', legs: '#eef3fa', glasses: 'none' });
    return { person: p, o: { shirt: '#5aa0dc', hat: 'beanie', fem: true } };
  },
  /* Хэллоуин: ведьма — чёрное платье, полосатые колготки, остроконечная шляпа (people.js 'witch'), зелёный нос */
  witch () {
    const p = makePerson({ fem: true, first: t('Ведьма'), last: '' });
    Object.assign(p.look, { hair: 'long', hairC: Math.random() < 0.5 ? '#e0602a' : '#2b2a30', headC: '#2b2a30', tieC: '#7a3fb0', bottom: 'skirt', skirt: '#3a1f4a', legs: '#7a3fb0', glasses: 'none', noseC: '#7ab84a' });
    return { person: p, o: { shirt: '#2b2a30', hat: 'witch', fem: true } };
  },
  /* привидение: человек в белой простыне с капюшоном, глаза-плошки */
  ghost () {
    const p = makePerson({ fem: Math.random() < 0.5, first: t('Привидение'), last: '' });
    Object.assign(p.look, { eyes: 'bulge', eyeC: '#1d1a1f', glasses: 'none', beard: 'none', shoes: '#f4f4f6' });
    return { person: p, o: { shirt: '#f4f4f6', pants: '#f4f4f6', hat: 'hood', skin: '#eef0f4' } };
  },
};
const FOLK_LINES = {
  moroz: [N_('Хо-хо-хо!'), N_('С наступающим!'), N_('Где моя Снегурочка?'), N_('Подарки — по списку, не толкаемся')],
  drunk: [N_('Снегурочка… ик… ты где?'), N_('Я Дед Мороз! А ты кто такой?'), N_('Мешок потерял… с подарками… ёлки-палки'), N_('Наливай, внучка!')],
  snegurochka: [N_('Дедушка, не убегай!'), N_('С Новым годом!'), N_('Дедушка опять потерялся…')],
  witch: [N_('Хи-хи-хи!'), N_('Сладость или гадость?'), N_('Где моя метла?!'), N_('Прокляну! …шучу')],
  ghost: [N_('У-у-у-у!'), N_('Бу!'), N_('Я страшное привидение!'), N_('У-у… а пицца с чем?')],
};
const FOLK_COL = { snegurochka: '#3a7fc0', witch: '#7a3fb0', ghost: '#5a5a6a' };
const F = { t: 0, sayT: 4 };
const tagged = p => p.hol && p.grp === p.holGrp;
function folkStep (dt) {
  const P = A.people ? A.people() : null;
  if (!P) return;
  if ((F.t -= dt) <= 0) F.t = topUp(P) ? 0.4 : HOL.FOLK_EVERY;   // переодеваем по одному за раз (сборка человека — пара мс)
  const tm = U.uTime.value;
  for (const p of P) {
    if (!tagged(p)) continue;
    if (p.holDrunk && !p.dead && !p.fly) p.grp.rotation.z = Math.sin(tm * 1.9 + p.ph) * 0.2;   // шатается
  }
  // реплики: кто-то из костюмов рядом с машиной — облачком
  if ((F.sayT -= dt) <= 0) {
    F.sayT = rand(5, 9);
    const V = A.V;
    const near = P.filter(p => tagged(p) && !p.dead && !p.guest && Math.hypot(p.x - V.x, p.z - V.z) < 24);
    if (near.length) {
      const p = pick(near), k = p.holDrunk ? 'drunk' : p.hol;
      say(p.grp, t(pick(FOLK_LINES[k] || FOLK_LINES.moroz)), FOLK_COL[p.hol] || '#c0392b', 3);
    }
  }
}
function offView (p) {
  const c = A.cam.position, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
  if (d > HOL.FOLK_FAR) return true;
  if (!FV) FV = new THREE.Vector3();
  A.cam.getWorldDirection(FV);
  return d > 12 && dx * FV.x + dz * FV.z < 0;
}
let FV = null;
/* одного прохожего вне кадра — в недостающий костюм; → true, если ещё кого-то не хватает */
function topUp (P) {
  const have = {};
  for (const p of P) if (tagged(p)) have[p.hol] = (have[p.hol] || 0) + 1;
  for (const f of CUR.h.folk) {
    const need = f.n - (have[f.kind] || 0);
    if (need <= 0 || !COSTUME[f.kind]) continue;
    for (const p of P) {
      if (tagged(p) || p.guest || p.idle || p.dead || p.after || p.hold || p.party || p.sitting || p.base === undefined || !offView(p)) continue;
      const drunk = f.kind === 'moroz' && A.ADULT && Math.random() < (f.drunk || 0);
      const c = COSTUME[f.kind](drunk);
      A.dress(p, c.person, c.o);
      p.hol = f.kind; p.holGrp = p.grp; p.holDrunk = drunk;
      return true;
    }
  }
  return false;
}
function folkOff () {
  const P = A && A.people ? A.people() : null;
  if (!P) return;
  for (const p of P) {
    if (!p.hol) continue;
    const mine = tagged(p);
    p.hol = null; p.holGrp = null; p.holDrunk = false;
    if (mine && !p.guest && !p.dead) A.dress(p, null);    // снова обычный прохожий
  }
}

/* облачка: реплики костюмов и клиентов */
const BUB = [];
function say (grp, text, col, dur) {
  if (!A.sayBubble || !grp) return;
  const b = A.sayBubble(grp, text, col, 2.75);
  if (b) BUB.push({ b, t: dur });
}
function drop (q) { if (q.b.parent) q.b.parent.remove(q.b); if (q.b.material) q.b.material.dispose(); }
function bubStep (dt) {
  for (let i = BUB.length - 1; i >= 0; i--) if ((BUB[i].t -= dt) <= 0) { drop(BUB[i]); BUB.splice(i, 1); }
}

/* приехал к клиенту (orders.js onArrive): счёт праздничных заказов, реплика к празднику */
function onArrive (ev) {
  if (!CUR || !ev || !ev.stop) return;
  const o = ev.order, sp = o && o.ord;
  if (sp && (sp.story || sp.fest)) return;
  if (sp && sp.hol && !CUR.seen.has(o)) { CUR.seen.add(o); CUR.got++; }
  if (Math.random() >= HOL.LINE_P) return;
  const L = CUR.h.lines, pool = [...L.all, ...(A.ADULT ? L.adult : L.kids)];
  const p = ev.stop.peds && ev.stop.peds[0];
  if (pool.length && p && p.grp && !p.dead) setTimeout(() => { if (p.grp && !p.dead) say(p.grp, t(pick(pool)), '#c0392b', 3.4); }, 350);
}

/* ═════════════════════ заказы (orders.js) ═════════════════════ */
/** сколько настоящих секунд до 00:00 по часам мира */
export function toMidnight () {
  const E = A && A.env ? A.env() : null;
  if (!E) return 0;
  let d = ECON.tOfHour(24) - E.t;
  if (d < -1e-6) d += 1;
  return d / (A.dayRate() || 1 / 480);
}
/** пора «к бою курантов»? → секунд до полуночи (окно orders.chimes.win) или 0 */
export function chimesDue () {
  const c = CUR && CUR.h.orders.chimes;
  if (!c || CUR.chimes) return 0;
  const s = toMidnight();
  return s >= c.win[0] && s <= c.win[1] ? s : 0;
}
/** этот заказ — корпоратив (сборный)? gen — сколько заказов смены уже было: не первый, не больше max за смену */
export function wantCorp (gen = 1) {
  const c = CUR && CUR.h.orders.corp;
  return !!(c && gen > 0 && CUR.corp < c.max && Math.random() < c.share);
}
/** обычный заказ — праздничный («оливье-пицца»)? → пометка или null */
export function olivier () {
  const c = CUR && CUR.h.orders.olivier;
  return c && Math.random() < c.share ? tag('olivier') : null;
}
/** пометка праздничного заказа: { kind, k — множитель оплаты, item — что в накладной, why } (и счёт) */
export function tag (kind) {
  if (!CUR) return null;
  const c = CUR.h.orders[kind];
  if (!c) return null;
  CUR.n++;
  if (kind === 'corp') CUR.corp++;
  if (kind === 'chimes') CUR.chimes = true;
  return { kind, k: c.k || 1, item: t(c.item || pick(c.items)), why: c.why, hol: CUR.h.id };
}
export const why = (hol, p) => t(hol.why, p);
export const tipChance = () => (CUR ? HOL.TIP_CHANCE : 0);
export const tipMul = () => (CUR ? HOL.TIP_MUL : 1);

/** лента в чек смены (career.js showEnd): праздник шёл в эту смену → { title, sub } или null */
export function ribbon () {
  const r = CUR ? { h: CUR.h, got: CUR.got } : ST.lastRibbon;
  if (!r || !r.h.ribbon) return null;
  return { title: t(r.h.ribbon.title), sub: r.got || !r.h.ribbon.none ? t(r.h.ribbon.sub, { n: r.got }) : t(r.h.ribbon.none) };
}

/* ═════════════════════ салют и петарды ═════════════════════
   Одна отрисовка — точки с прибавлением света, частицы считает процессор (до FW.N штук). Вечером и ночью (ночь
   ≥ 0,45) — ракета раз в 0,7—2,4 с в 130—300 м от камеры (чаще впереди), взлетает с искрами, на 28—55 м — взрыв:
   шар, кольцо или золотая «ива»; около полуночи (23:42—0:18 по часам мира) — залпами, раз в 0,15—0,5 с. Петарды —
   у земли в 14—40 м от машины раз в 4—11 с: вспышка и искры */
const FW = { N: 1600, pts: null, i: 0, alive: 0, next: 2, petT: 6, rockets: [] };
const FW_PAL = ['#ff4a3c', '#ffd23f', '#4dff6e', '#4aa8ff', '#ff6ae0', '#ffffff', '#ff9a2a', '#b06aff'];
function fwInit () {
  const N = FW.N;
  FW.p = new Float32Array(N * 3).fill(0); FW.v = new Float32Array(N * 3); FW.c = new Float32Array(N * 3);
  FW.l = new Float32Array(N * 2); FW.life = new Float32Array(N); FW.max = new Float32Array(N); FW.drag = new Float32Array(N); FW.grav = new Float32Array(N);
  for (let i = 0; i < N; i++) FW.p[i * 3 + 1] = -9999;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(FW.p, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(FW.c, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aL', new THREE.BufferAttribute(FW.l, 2).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: U.uScale },
    vertexShader: `attribute vec2 aL; uniform float uScale; varying vec3 vC; varying float vA;
      void main () { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aL.y * uScale / max(-mv.z, 0.5), 1.0, 64.0); vA = aL.x; vC = color; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main () { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0 || vA <= 0.0) discard;
        float f = 1.0 - r; gl_FragColor = vec4(vC + vec3(f * f * 0.6), vA * f); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  m.userData.keep = true; m.userData.glow = 1;
  FW.pts = new THREE.Points(g, m);
  FW.pts.frustumCulled = false; FW.pts.renderOrder = 5; FW.pts.visible = false;
  A.scene.add(FW.pts);
}
const COL = new Map();
function rgbOf (hex) { let v = COL.get(hex); if (!v) { const c = new THREE.Color(hex); v = [c.r, c.g, c.b]; COL.set(hex, v); } return v; }
function spark (x, y, z, vx, vy, vz, hex, life, size, drag, grav) {
  const i = FW.i;
  FW.i = (FW.i + 1) % FW.N;
  const c = rgbOf(hex);
  FW.p[i * 3] = x; FW.p[i * 3 + 1] = y; FW.p[i * 3 + 2] = z;
  FW.v[i * 3] = vx; FW.v[i * 3 + 1] = vy; FW.v[i * 3 + 2] = vz;
  FW.c[i * 3] = c[0]; FW.c[i * 3 + 1] = c[1]; FW.c[i * 3 + 2] = c[2];
  FW.life[i] = life; FW.max[i] = life; FW.l[i * 2] = 1; FW.l[i * 2 + 1] = size; FW.drag[i] = drag; FW.grav[i] = grav;
}
function launch () {
  if (!FW.dir) FW.dir = new THREE.Vector3();
  A.cam.getWorldDirection(FW.dir);
  const c = A.cam.position, base = Math.atan2(FW.dir.x, FW.dir.z);
  for (let k = 0; k < 4; k++) {
    const a = base + (Math.random() < 0.8 ? rand(-0.8, 0.8) : rand(-3.1, 3.1)), d = rand(130, 300);
    const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    if (!A.inBounds(x, z, 0)) continue;
    const gy = A.groundH(x, z), r = Math.random();
    FW.rockets.push({ x, y: gy + 3, z, vy: rand(24, 30), top: gy + rand(28, 55), kind: r < 0.25 ? 'willow' : r < 0.5 ? 'ring' : 'peony',
      hex: pick(FW_PAL), hex2: Math.random() < 0.4 ? pick(FW_PAL) : null, tr: 0 });
    return;
  }
}
function burst (q) {
  const n = q.kind === 'willow' ? 90 : 110;
  const ax = rand(-1, 1), az = rand(-1, 1), al = Math.hypot(ax, az) || 1;
  for (let i = 0; i < n; i++) {
    let vx, vy, vz;
    if (q.kind === 'ring') {                                // кольцо в наклонной плоскости
      const a = i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      vx = ca * az / al + sa * 0.3; vy = sa; vz = -ca * ax / al + sa * 0.3;
    } else { const u = rand(-1, 1), a = rand(0, 6.283), s = Math.sqrt(1 - u * u); vx = s * Math.cos(a); vy = u; vz = s * Math.sin(a); }
    const sp = q.kind === 'willow' ? rand(8, 12) : rand(13, 19);
    const hex = q.kind === 'willow' ? '#ffcf6a' : q.hex2 && i % 2 ? q.hex2 : q.hex;
    spark(q.x, q.y, q.z, vx * sp, vy * sp + 2, vz * sp, hex, q.kind === 'willow' ? rand(2.2, 2.9) : rand(1.3, 2.0), q.kind === 'willow' ? 2.2 : 2.8, q.kind === 'willow' ? 0.9 : 1.2, q.kind === 'willow' ? 4 : 6);
  }
  spark(q.x, q.y, q.z, 0, 0, 0, '#ffffff', 0.18, 16, 0, 0);   // вспышка
  FW.bursts = (FW.bursts || 0) + 1;
}
function petard () {
  const V = A.V;
  for (let k = 0; k < 4; k++) {
    const a = rand(0, 6.283), d = rand(14, 40), x = V.x + Math.sin(a) * d, z = V.z + Math.cos(a) * d;
    if (!A.inBounds(x, z, 0) || A.inHouse(x, z, 1)) continue;
    const y = A.groundH(x, z) + 0.4;
    for (let i = 0; i < 22; i++) {
      const u = rand(0.1, 1), b = rand(0, 6.283), s = Math.sqrt(1 - u * u), sp = rand(4, 9);
      spark(x, y, z, s * Math.cos(b) * sp, u * sp, s * Math.sin(b) * sp, i % 3 ? '#fff2b0' : '#ff9a2a', rand(0.35, 0.6), 0.35, 1.5, 9);
    }
    spark(x, y + 0.3, z, 0, 0, 0, '#ffffff', 0.12, 3.5, 0, 0);
    FW.petards = (FW.petards || 0) + 1;
    return;
  }
}
function fwStep (dt, on) {
  if (!FW.pts) { if (!on) return; fwInit(); }
  if (on && A.playing && A.playing()) {
    const night = A.night ? A.night() || 0 : 0, h = (((A.hour ? A.hour() : 12) % 24) + 24) % 24;
    const salvo = h >= 23.7 || h < 0.3;
    if (night > 0.45) {
      if ((FW.next -= dt) <= 0) { launch(); FW.next = salvo ? rand(0.15, 0.5) : rand(0.7, 2.4); }
      if ((FW.petT -= dt) <= 0) { petard(); FW.petT = rand(4, 11); }
    }
  }
  // ракеты: летят вверх с искрами, на своей высоте — взрыв
  for (let i = FW.rockets.length - 1; i >= 0; i--) {
    const q = FW.rockets[i];
    q.y += q.vy * dt; q.vy = Math.max(6, q.vy - 7 * dt);
    if ((q.tr -= dt) <= 0) { q.tr = 0.03; spark(q.x + rand(-0.2, 0.2), q.y, q.z + rand(-0.2, 0.2), rand(-1, 1), rand(-3, -1), rand(-1, 1), '#ffb050', 0.5, 1.1, 2, 3); }
    if (q.y >= q.top) { burst(q); FW.rockets.splice(i, 1); }
  }
  // частицы
  let alive = 0;
  const P = FW.p, Vv = FW.v, L = FW.l;
  for (let i = 0; i < FW.N; i++) {
    if (FW.life[i] <= 0) continue;
    FW.life[i] -= dt;
    if (FW.life[i] <= 0) { L[i * 2] = 0; P[i * 3 + 1] = -9999; continue; }
    alive++;
    const k = Math.max(0, 1 - FW.drag[i] * dt), o = i * 3;
    Vv[o] *= k; Vv[o + 1] = Vv[o + 1] * k - FW.grav[i] * dt; Vv[o + 2] *= k;
    P[o] += Vv[o] * dt; P[o + 1] += Vv[o + 1] * dt; P[o + 2] += Vv[o + 2] * dt;
    const f = FW.life[i] / FW.max[i];
    L[i * 2] = f < 0.3 ? f / 0.3 * (0.75 + 0.25 * Math.sin(FW.life[i] * 40 + i)) : 1;   // к концу гаснет и мерцает
  }
  if (alive || FW.alive) {
    const g = FW.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.aL.needsUpdate = true;
  }
  FW.alive = alive;
  FW.pts.visible = alive > 0;
}

/* ═════════════════════ отладка: __dlv.HOL ═════════════════════ */
export const DEBUG = {
  HOL, HOLIDAYS,
  /* на следующую смену — этот праздник (id: 'newyear') */
  next: (id = 'newyear') => { if (!byId(id)) return false; ST.forced = id; return true; },
  /* сейчас, посреди смены (без объявления — announce() отдельно) */
  start: (id = 'newyear') => { const h = byId(id); if (!h) return false; end(); begin(h); return DEBUG.info(); },
  stop: () => { end(); return true; },
  announce: () => { announce(); return !!CUR; },
  info: () => {
    const R = CUR ? DECOR.get(CUR.h.id) : null;
    return {
      id: CUR ? CUR.h.id : '', orders: CUR ? CUR.n : 0, corp: CUR ? CUR.corp : 0, chimes: CUR ? CUR.chimes : false, got: CUR ? CUR.got : 0,
      toMidnight: A ? Math.round(toMidnight()) : 0, building: !!BUILD.gen, save: A ? load() : null,
      decor: R ? { ...R.out, points: R.n, cellsPts: R.pts.length, cellsTin: R.tin.length, ms: R.ms, visible: R.pts.filter(m => m.visible).length } : null,
      fireworks: { alive: FW.alive, rockets: FW.rockets.length, bursts: FW.bursts || 0, petards: FW.petards || 0 },
      folk: DEBUG.folk().length, perf: { avg: +PERF.avg.toFixed(3), max: +PERF.max.toFixed(2) },
    };
  },
  decor: () => { const o = {}; for (const [k, R] of DECOR) o[k] = { ...R.out, points: R.n, ms: R.ms }; return o; },
  folk: () => (A && A.people ? A.people().filter(tagged).map(p => ({ kind: p.hol, drunk: !!p.holDrunk, x: Math.round(p.x), z: Math.round(p.z), guest: !!p.guest })) : []),
  /* салют сейчас: n ракет рядом, впереди камеры */
  boom: (n = 3) => { if (!FW.pts) fwInit(); for (let i = 0; i < n; i++) launch(); petard(); return FW.rockets.length; },
  /* прогон жребия на N смен подряд (сезон — зима): сколько праздников, перерывы */
  sim: (N = 100, season = 'winter') => {
    const sv = {}, hits = [];
    for (let i = 0; i < N; i++) if (decide(i, sv, season)) hits.push(i);
    const gaps = hits.slice(1).map((v, i) => v - hits[i]);
    return { N, holidays: hits.length, share: +(hits.length / N).toFixed(3), first: hits[0], gapMin: gaps.length ? Math.min(...gaps) : 0,
      gapMax: gaps.length ? Math.max(...gaps) : 0, gapMean: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) : 0,
      twoInRow: gaps.filter(g => g === 1).length, at: hits.slice(0, 30) };
  },
  get CUR () { return CUR; }, FW, DECOR,
};
