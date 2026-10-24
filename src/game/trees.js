/* ──────────────────────────────────────────────────────────────────────────
   Деревья и кусты города (кроме ельника — forest.js). Правила словами —
   docs/CAREER.md «Город: как выглядит» → «Деревья и кусты».

   growTree — как выглядит одно дерево: порода по месту (жребий от точки —
   каждый запуск то же), ствол и ветки (видны всегда, зимой — голые), крона
   из 3—6 комков: низ комка темнее, верх светлее, нижние комки темнее верхних.
   Всё ложится в общую склейку сезонов (seasons.js, PILE): никаких своих
   мешей, отрисовок на кадр не прибавляется. Вид куска (aux.x) в склейке:
   0 — ствол и ветки, 1 — листва (осенью желтеет и опадает по комку),
   2 — листья на земле, 5 — цветы сирени (весной), 6 — ягоды рябины и
   шиповника (осень — зима), 7 — ветки и прутья голой кроны (видны, когда
   облетела листва).

   Зимние модели (24.10.2026, автор 23.10: «не просто палки — ветки образуют
   округлую форму, и они все в снегу»): у берёзы, тополя, клёна, липы, рябины и
   дерева аллеи ствол и ветки — модель из Blender (wintertrees.data.js): ствол и
   суки (вид 0) видны всегда — летом внутри кроны, ветки и прутья (вид 7) — когда
   облетела листва; концы прутьев — по поверхности летней кроны. Грани, что
   смотрят вверх, — палитра 1: зимой белые (снег, seasons.js pileMat).

   Новые породы и кусты (М6, 24.10.2026, автор: «больше вариаций кустов и деревьев») — growNew: яблоня, черёмуха,
   ива (плакучая, ракита), каштан, вяз, лиственница, старое дерево, стриженое, живая изгородь (стриженая, запущенная),
   можжевельник, жёлтая акация, бузина, боярышник, смородина. Порода по месту — pickKind: у воды — ивы, в частном
   секторе — сады, в парке и старом центре — каштаны и вязы (TREE.PLACE). Телефон — меньше видов (TREE.MOB_SWAP).

   plantYardsSteps — дворы: группы по 3—7 деревьев перед подъездами и кусты под
   окнами (сирень, шиповник, акация, изгородь…). Не на проезде, не у двери, не на тропинке,
   не на площадке и не в дворовой мелочи — места для пина остаются. Потом — новые посадки: сады частного
   сектора (plantGardens), стриженое у администраций (plantAdmins), ивы по берегам (plantShores).
   Твёрдость — как у всех деревьев: ствол — препятствие 1,1 × 1,1 м (game.js tree).
   ────────────────────────────────────────────────────────────────────────── */
import { wet } from './streams.js';             // речки и пруды — без деревьев (streams.js)
import { WTREES } from './wintertrees.data.js'; // зимние модели: голые ветки со снегом сверху (tools/trees/wintertrees.py, Blender)
import { MOB } from './mobile.js';
import { at as distAt, has as distHas } from './districts.js';   // район: частный сектор, старый центр (порода по месту)

export const TREE = {
  // доли пород там, где дерево сажает карта и улицы (без своей породы)
  // (М6, 24.10.2026: + вяз, каштан, лиственница, черёмуха, яблоня, старое дерево, жёлтая акация, боярышник, бузина)
  W_SVK: { birch: 27, pine: 12, spruce: 15, poplar: 9, maple: 7, lime: 6, rowan: 7, bush: 5, elm: 3, chestnut: 2, larch: 3,
    cherry: 3, apple: 1, oldtree: 2, caragana: 2, hawthorn: 2, elder: 1 },
  // телефон (мобильный режим): прежние доли ели и сосны (их крона дешевле всех — память), новые породы — понемногу вместо берёзы
  W_SVK_MOB: { birch: 25, pine: 13, spruce: 17, poplar: 10, maple: 8, lime: 6, rowan: 8, bush: 8, elm: 2, chestnut: 1, cherry: 2 },
  W_MSK: { lime: 27, maple: 14, birch: 13, poplar: 10, rowan: 6, spruce: 9, pine: 4, bush: 7, elm: 3, chestnut: 4, larch: 1,
    cherry: 2, oldtree: 1, caragana: 2, hawthorn: 2 },
  // ?oldtrees — как до М6 (сравнить кадры, память и вызовы одной сборкой): прежние доли, без новых пород и посадок
  OLD: { W_SVK: { birch: 30, pine: 13, spruce: 17, poplar: 10, maple: 8, lime: 6, rowan: 8, bush: 8 },
    W_MSK: { lime: 30, maple: 15, birch: 14, poplar: 11, rowan: 6, spruce: 10, pine: 4, bush: 10 },
    YARD: { birch: 40, poplar: 14, maple: 16, lime: 10, rowan: 12, pine: 8 }, WIN: { lilac: 60, rosehip: 40 } },
  // порода по месту (М6): где сажает карта, парки и улицы — доли меняются по тому, что рядом (pickKind)
  PLACE: {
    WATER: 9,                   // ближе стольких метров к речке или пруду — «у воды»
    W_WATER: { willow: 52, birch: 16, poplar: 12, oldtree: 8, elder: 6, cherry: 6 },
    W_PARK: { chestnut: 8, elm: 6, larch: 6, oldtree: 4, hawthorn: 4, caragana: 3, juniper: 2 },   // + к обычным долям в парке
    W_OLD: { chestnut: 6, elm: 5, lime: 6 },                                                        // + в Центре и Старом городе
    W_PRIV_MOB: { apple: 10, cherry: 8, birch: 22, poplar: 10, maple: 6, rowan: 8, spruce: 17, pine: 10, bush: 6, willow: 3 },   // телефон: ели и сосны — как везде
    W_PRIV: { apple: 18, cherry: 14, birch: 16, poplar: 8, maple: 5, rowan: 8, elder: 6, oldtree: 8, hawthorn: 4, caragana: 5, spruce: 6, willow: 2 },   // частный сектор
  },
  // новые посадки (М6, plantYardsSteps): сады частного сектора, стриженое у администраций, ивы по берегам
  GARDEN: { SHARE: 0.85, MOB: 0, BACK: [3, 8], N: [1, 3], STEP: 3.2, MIX: { apple: 55, cherry: 28, rowan: 9, oldtree: 8 }, CURRANT: 0.6, HEDGE: 0.3 },   // MOB — доля на телефоне (0 — садов нет: память)
  ADMIN: { SHARE: 0.8, WALL: [2.6, 4.2, 5.6], STEP: 2.7, HEDGE: 0.45, MAX: 8, FROM: 2.5 },   // от стены, м (по очереди); доля зданий с изгородью вместо шаров
  SHORE: { STEP: 15, OFF: [4.5, 7.5], MAX: 300, MAX_MOB: 60 },                    // ивы: шаг по берегу, от воды, м; не больше
  // телефон (мобильный режим, «меньше видов»): этих пород нет — вместо них старые (память и «каша» на маленьком экране)
  MOB_SWAP: { oldtree: 'poplar', caragana: 'bush', elder: 'bush', hawthorn: 'rowan', hedge: null, larch: 'spruce' },
  MOB_DOTS: 0.4,               // телефон: цветов и ягод у новых пород — 0,4 от компьютера (по 8 треугольников каждый)
  // группы во дворах
  YARD: {
    SHARE: 0.5,                 // у такой доли подъездов — группа перед домом
    DIST: [13, 26],             // от двери вглубь двора, м
    SIDE: 15,                   // вдоль дома в обе стороны, м
    N: [3, 7],                  // деревьев в группе
    STEP: 2.6,                  // между деревьями группы не меньше, м
    GAP: 16,                    // между центрами групп не меньше, м
    DOOR: 8,                    // от любой двери не ближе, м
    ROAD: 3.5,                  // от края проезда не ближе, м
    PATH: 2.2,                  // от оси тропинки не ближе, м
    MIX: { birch: 34, poplar: 11, maple: 13, lime: 9, rowan: 10, pine: 6, cherry: 6, apple: 4, chestnut: 3, elm: 2, larch: 1, oldtree: 1 },   // порода группы
    MIX_MOB: { birch: 37, poplar: 14, maple: 16, lime: 10, rowan: 12, pine: 8, cherry: 3 },                                                  // телефон
  },
  // кусты под окнами
  WIN: {
    SHARE: 0.6,                 // у такой доли подъездов, с каждой стороны от двери — жребий
    WALL: 2.0,                  // от стены, м
    FROM: 4.4,                  // от оси двери вдоль стены не ближе, м (дальше заборчиков тропинки)
    N: [1, 3],                  // кустов подряд
    STEP: 2.0,                  // между кустами, м
    MIX: { lilac: 40, rosehip: 24, caragana: 12, hedge: 12, hawthorn: 6, elder: 6 },   // (до М6: сирень 60 %, шиповник 40 %)
    HEDGE_STEP: 1.7,            // живая изгородь — кусками вплотную, ×2 кусков
  },
  // аллея-арка: ряды пышных деревьев с обеих сторон, кроны смыкаются над дорогой (plantAlley)
  ALLEY: {
    MAP: 'seversk', NAME: 'улица Ленина', MIN_W: 13,   // широкий отрезок улицы Ленина (14 м, ~0,9 км)
    STEP: 9,                    // между деревьями вдоль улицы, м
    OFF: 3.5,                   // ствол — от края асфальта (за тротуаром), м
    CROSS: 18,                  // от перекрёстка и съезда не ближе, м
    ZEBRA: 9, STOP: 11,         // от зебры и остановки не ближе, м
    TRUNK: 6.0,                 // ствол до развилки, м
    TOP: 11.6,                  // верх арки над осью улицы, м; низ кроны там ~8 м (камера — 6,2 м над машиной, автобус ~3,5)
    MIX: { lime: 55, maple: 30, poplar: 15 },   // осенью: липа — золотая, клён — рыжий и красный, тополь — лимонный
  },
  // зимние модели (wintertrees.data.js): цвета частей [ствол, сук, ветка, прут]; когда появляются ветки и прутья
  WINTER: {
    COL: {
      birch: ['#ece8de', '#d8d2c6', '#8a7c72', '#5e463c'], maple: ['#6e5440', '#6a4c32', '#5e4632', '#54402e'],
      lime: ['#7a5a3c', '#6a4c32', '#5e4632', '#54402e'], poplar: ['#6a5a48', '#5a4a3a', '#544436', '#4c3e32'],
      rowan: ['#6a5a4c', '#6a5a4c', '#5e5044', '#54463a'],
      apple: ['#6a5644', '#665040', '#5e4a3a', '#544234'], cherry: ['#4e4440', '#4a403c', '#463c38', '#403632'],
      willow: ['#6a5e4c', '#6e6248', '#8a7a40', '#a8903a'],          // у ивы прутья зимой жёлто-оливковые
      chestnut: ['#5a4a40', '#56463a', '#4e4036', '#463a30'], elm: ['#5e5248', '#5a4c40', '#544638', '#4c4032'],
      larch: ['#7a5240', '#6a4a36', '#5e4430', '#56402e'], oldtree: ['#5a5046', '#5e544a', '#544a40', '#4a4038'],
      caragana: ['#6a6a48', '#62603e', '#5c5a3a', '#545234'], elder: ['#8a8070', '#7a7060', '#6e6454', '#625848'],
      hawthorn: ['#5e4c40', '#5a4838', '#524232', '#4a3c2e'], currant: ['#6a5040', '#5e4838', '#564232', '#4e3c2e'],
    },
    TWIG: [0.32, 0.55],          // зерно прутьев: видны, когда листвы осталось меньше (ветки — на 0,12 раньше)
    MOB_PARTS: 2,                // мобильный режим: только части ниже этой (2 — ствол и суки со снегом, без веток и прутьев:
                                 // память телефона — у каждого дерева ~70 треугольников вместо ~200; 0 — палки, как до моделей)
  },
};
let LEAN = null;                // для 'alley': куда клонится крона — к оси улицы { ux, uz, reach }
let ORIENT = null;              // для изгороди и рядов: поворот куска вдоль стены (рад), null — по жребию
let FORM = null;                // форма силой (изгородь: 'cut' / 'wild'; стриженое: 0 шар, 1 на штамбе, 2 конус)
export const SHRUBS = new Set(['lilac', 'rosehip', 'caragana', 'elder', 'hawthorn', 'currant', 'hedge', 'juniper', 'topiary']);

export const STATS = { kinds: {}, where: {}, groups: 0, yard: 0, shrubs: 0, tried: 0, places: {}, pts: {}, tris: {}, gardens: [], ygroups: [], admin: { b: 0, edge: 0, try: 0, ok: 0 } };

/* цвет темнее/светлее, кэш по строке: склейка разбирает цвет один раз на строку */
const TONE = new Map();
function tone (hex, k) {
  const key = hex + k;
  let v = TONE.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  v = '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
  TONE.set(key, v);
  return v;
}
const pickR = (r, a) => a[(r() * a.length) | 0];
function weighted (r, o) {
  let s = 0; for (const k in o) s += o[k];
  let x = r() * s; for (const k in o) if ((x -= o[k]) < 0) return k;
  return Object.keys(o)[0];
}

/* зимняя модель: группы [часть, снег] → вершины шаблона без индексов (м), раз на модель — при первом дереве */
const WT = {};
function wtModel (name) {
  let m = WT[name];
  if (m) return m;
  const D = WTREES[name], v = D.v, top = WTPARTS ?? (MOB.on ? TREE.WINTER.MOB_PARTS : 9);
  m = WT[name] = D.g.filter(g => g[0] < top).map(([part, snow, ix]) => {
    const t = new Float32Array(ix.length * 3);
    for (let i = 0; i < ix.length; i++) { const q = ix[i] * 3; t[i * 3] = v[q] / 100; t[i * 3 + 1] = v[q + 1] / 100; t[i * 3 + 2] = v[q + 2] / 100; }
    return { part, snow, tpl: t };
  });
  return m;
}
/* ── М9 (24.10.2026): у каждого дерева своя форма. Варианты ветвления — те же вершины шаблона, перекрученные, согнутые, расширенные,
   у части — с обломанным сучком; считаются раз на породу при первом дереве (в памяти — по ~5 КБ на вариант). Какой вариант,
   наклон ствола и ширина — хешем места (не жребием r: порядок случайных чисел при стройке не меняется) */
const hz = (x, z, k = 0) => {
  let h = Math.imul(Math.round(x * 16) ^ 0x27d4eb2d, 0x9E3779B1) ^ Math.imul(Math.round(z * 16) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const NOVAR = typeof location !== 'undefined' && new URLSearchParams(location.search).has('novar');   // ?novar — все деревья одной породы одинаковые, как до М9 (сравнить)
const NVAR = () => MOB.on ? 4 : 6;                 // вариантов ветвления на породу (0 — как в файле)
let VAR = null;                                    // у текущего дерева: { k вариант, wx, wz наклон (м на метр высоты, в мире), ax, az ширина }
function varOf (kind, x, z) {
  if (NOVAR || kind === 'hedge' || kind === 'topiary') return null;
  const shrub = SHRUBS.has(kind) || kind === 'bush', m = shrub ? 0 : 0.025 + hz(x, z, 52) * 0.07, a = hz(x, z, 53) * 6.283;
  return { k: Math.floor(hz(x, z, 51) * NVAR()), wx: m * Math.cos(a), wz: m * Math.sin(a),
    ax: 1 + (hz(x, z, 54) - 0.5) * 0.3, az: 1 + (hz(x, z, 55) - 0.5) * 0.3 };
}
const WTV = {}, WTX = {};
function wtVariant (name, k) {
  if (!k) return wtModel(name);
  const key = name + '#' + k;
  let m = WTV[key];
  if (m) return m;
  const base = wtModel(name);
  let ex = WTX[name];
  if (!ex) {                                       // размер модели: высота и самый дальний сук
    ex = WTX[name] = { h: 1, r: 1 };
    for (const g of base) for (let i = 0; i < g.tpl.length; i += 3) { ex.h = Math.max(ex.h, g.tpl[i + 1]); ex.r = Math.max(ex.r, Math.hypot(g.tpl[i], g.tpl[i + 2])); }
  }
  let a = (Math.imul(k * 7919 + 13, 0x9E3779B1) ^ Math.imul(name.length * 131 + name.charCodeAt(0) * 17 + name.charCodeAt(name.length - 1), 0x85ebca6b)) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const al = name === 'alley', sg = () => rnd() < 0.5 ? -1 : 1;
  const tw = sg() * (0.1 + rnd() * (al ? 0.12 : 0.22)), bx = sg() * (0.01 + rnd() * 0.045), bz = sg() * (0.01 + rnd() * 0.05),
    wx = (rnd() - 0.5) * (al ? 0.16 : 0.34), wz = (rnd() - 0.5) * 0.4, mir = k % 2 === 1,
    cut = k % 3 === 2, ca = rnd() * 6.283, cw = 0.5 + rnd() * 0.4;
  m = WTV[key] = base.map(g => {
    const t = g.tpl, n = t.length / 9, o = new Float32Array(t.length);
    let w = 0;
    for (let f = 0; f < n; f++) {
      if (cut && g.part >= 1) {                    // обломан сучок: сектор в стороне и выше середины — без ветвей и прутьев
        const cx = (t[f * 9] + t[f * 9 + 3] + t[f * 9 + 6]) / 3, cy = (t[f * 9 + 1] + t[f * 9 + 4] + t[f * 9 + 7]) / 3, cz = (t[f * 9 + 2] + t[f * 9 + 5] + t[f * 9 + 8]) / 3;
        let d = Math.atan2(cz, cx) - ca; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
        if (cy > ex.h * 0.4 && Math.hypot(cx, cz) > ex.r * 0.4 && d < cw) continue;
      }
      for (let q = 0; q < 9; q += 3) {
        let vx = t[f * 9 + q], vy = t[f * 9 + q + 1], vz = t[f * 9 + q + 2];
        const u = Math.min(1.2, vy / ex.h), sm = Math.min(1, Math.max(0, (u - 0.3) / 0.5));
        const ang = tw * Math.max(0, u), c1 = Math.cos(ang), s1 = Math.sin(ang);   // перекрут растёт с высотой
        const rx = vx * c1 - vz * s1, rz = vx * s1 + vz * c1;
        vx = rx * (1 + wx * sm) + bx * u * u * ex.h; vz = rz * (1 + wz * sm) + bz * u * u * ex.h;
        if (mir) vz = -vz;
        o.set([vx, vy, vz], w * 9 + q);
      }
      if (mir) { for (let q = 0; q < 3; q++) { const tmp = o[w * 9 + 3 + q]; o[w * 9 + 3 + q] = o[w * 9 + 6 + q]; o[w * 9 + 6 + q] = tmp; } }   // зеркало — грани наизнанку: меняем порядок вершин
      w++;
    }
    return { part: g.part, snow: g.snow, tpl: o.slice(0, w * 9) };
  });
  return m;
}
/* дерево по модели: ствол и суки — вид 0, ветки и прутья — вид 7 (зерно seed: видны, когда листвы меньше); снег — палитра 1 */
function winterTree (P, name, x, y, z, sx, sy, sz, yaw, col, seed) {
  const V = VAR;
  let rx = 0, rz = 0, mod = null;
  if (V) {
    mod = wtVariant(name, V.k);
    sx *= V.ax; sz *= V.az;
    if (V.wx || V.wz) {                            // наклон ствола: смещение в мире (wx, wz на метр высоты) → оси модели (поворот yaw последний)
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      rz = Math.atan2(-(V.wx * c - V.wz * sn), 1); rx = Math.atan2(V.wx * sn + V.wz * c, 1);
    }
  }
  for (const g of mod || wtModel(name)) {
    const k = g.part < 2 ? 0 : 7;
    P.add(g.tpl, x, y, z, sx, sy, sz, rx, yaw, rz, col[g.part], k, k ? Math.min(0.95, seed + (g.part === 2 ? 0.12 : 0)) : 0, g.snow);
  }
}

const twig = r => TREE.WINTER.TWIG[0] + r() * (TREE.WINTER.TWIG[1] - TREE.WINTER.TWIG[0]);
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const NOWT = QS.has('nowt');                                       // ?nowt — зимой палки, как до моделей (сравнить)
const WTPARTS = QS.has('wtparts') ? +QS.get('wtparts') : null;     // ?wtparts=2 — только ствол и суки (как в мобильном режиме), 9 — всё
const OLDT = QS.has('oldtrees');                                   // ?oldtrees — породы и посадки как до М6 (TREE.OLD)
const YEL = ['#e8b830', '#f0c848', '#d8a028'], ORA = ['#e8902a', '#d86a22', '#f0a838'], RED = ['#c84a24', '#d86a22', '#b83a22'];
const DECIDUOUS = new Set(['birch', 'maple', 'lime', 'poplar', 'rowan', 'bush', 'lilac', 'rosehip', 'alley',
  'apple', 'cherry', 'willow', 'chestnut', 'elm', 'larch', 'oldtree', 'caragana', 'elder', 'hawthorn', 'currant', 'hedge']);
const WMOK = !NOWT && !(MOB.on && !TREE.WINTER.MOB_PARTS && WTPARTS === null);   // зимние модели вообще (MOB_PARTS 0 — на телефоне палки)
/* порода по месту: у воды — ивы, в частном секторе — сады, в парке и в старом центре — каштаны и вязы (TREE.PLACE) */
let PARKS = null;
function pickKind (o, r) {
  const { x, z } = o, PL = TREE.PLACE;
  if (OLDT) return weighted(r, o.seversk ? TREE.OLD.W_SVK : TREE.OLD.W_MSK);
  let W = o.seversk ? (MOB.on ? TREE.W_SVK_MOB : TREE.W_SVK) : TREE.W_MSK;
  if (wet(x, z, PL.WATER)) W = PL.W_WATER;
  else {
    const d = distHas() ? distAt(x, z) : -1;
    if (o.seversk && d === 7) W = MOB.on ? PL.W_PRIV_MOB : PL.W_PRIV;
    else {
      if (!PARKS && o.CITY) PARKS = (o.CITY.green || []).filter(g => g.k === 'park').map(g => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
        return { p: g.p, x0, z0, x1, z1 };
      });
      const park = PARKS && o.inPoly && PARKS.some(g => x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1 && o.inPoly(x, z, g.p));
      const old = o.seversk && (d === 3 || d === 4);
      if (park || old) { W = { ...W }; for (const [k, v] of Object.entries(park ? PL.W_PARK : PL.W_OLD)) W[k] = (W[k] || 0) + v; }
    }
  }
  return weighted(r, W);
}

/* o: P (склейка), T (шаблоны), r (жребий от точки), x, z, y, kind, seversk, DECID, SPRUCES, ground(x, z) */
let TRIS = 0;                                     // треугольников у этого дерева (STATS.tris — по породам, для проверки)
export function growTree (o) {
  const { T, r, x, z, y } = o, P0 = o.P;
  const P = { add (tpl, ...a) { TRIS += tpl.length / 9; return P0.add(tpl, ...a); } };
  let kind = o.kind || pickKind(o, r);
  if (MOB.on && kind in TREE.MOB_SWAP) { kind = TREE.MOB_SWAP[kind]; if (!kind) return false; }   // телефон: меньше видов
  STATS.kinds[kind] = (STATS.kinds[kind] || 0) + 1;
  TRIS = 0;
  VAR = varOf(kind, x, z);                       // М9: свой вариант ветвления, наклон и ширина у каждого дерева (хеш места)
  if (STATS.kinds[kind] === 40 || STATS.kinds[kind] === 400) STATS.where[kind] = [Math.round(x), Math.round(z)];   // для проверки глазами (?debug)
  if (STATS.kinds[kind] % 7 === 1) { const a = STATS.pts[kind] || (STATS.pts[kind] = []); if (a.length < 40) a.push([Math.round(x), Math.round(z)]); }
  const s = 0.82 + r() * 0.4, yaw = r() * 6.283;
  // зимняя модель вместо палок-веток: старые trunk/branch молчат, но жребий r() тянется как прежде — летняя крона та же
  const WM = (kind === 'alley' ? !!LEAN : kind in TREE.WINTER.COL) && !NOWT && !(MOB.on && !TREE.WINTER.MOB_PARTS && WTPARTS === null);   // MOB_PARTS 0 — на телефоне палки, как было
  const trunk = (w, h, hex) => WM || P.add(T.stick, x, y + h / 2 * s - 0.2, z, w * s, h * s + 0.2, w * s, 0, yaw, 0, hex);
  const branch = (y0, len, tilt, a, w, hex) => {
    // ветка от ствола: наклон tilt, по кругу a; центр — на середине длины
    if (WM) return;
    const dx = -Math.sin(tilt) * Math.cos(a + yaw), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(a + yaw);
    P.add(T.stick, x + dx * len / 2 * s, y + (y0 + dy * len / 2) * s, z + dz * len / 2 * s, w * s, len * s, w * s, 0, a + yaw, tilt, hex);
  };
  // комок кроны: lvl 0 — нижний (темнее), 1 — верхний (светлее)
  const clump = (ox, oy, oz, rr, sy, hex, pal, lvl, kind = 1) =>
    P.add(T.ico, x + ox * s + (VAR ? VAR.wx * oy * s : 0), y + oy * s, z + oz * s + (VAR ? VAR.wz * oy * s : 0), rr * s, rr * s * sy, rr * s, 0, r() * 6.283, 0, tone(hex, Math.round((0.82 + 0.32 * lvl) * 20) / 20), kind, r(), pal, 0.38);
  const leaves = (hexes, n, rad) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = 0.4 + r() * rad, lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
      const sz = 0.6 + r() * 0.8;
      // первый лист у крупной россыпи — не плоский, а низкая кучка 10—17 см (О7, 09.10.2026: осенью под деревьями
      // бугорки, а не только плоские пятна). Жребий тот же (размер), лишних r() нет — деревья растут как прежде
      if (i === 0 && sz > 1.0 && T.mound) P.add(T.mound, lx, o.ground(lx, lz) + 0.02, lz, sz * 0.75, 0.1 + (sz - 1) * 0.18, sz * (0.45 + r() * 0.45), 0, r() * 6.283, 0, pickR(r, hexes), 2, r());
      else P.add(T.flat, lx, o.ground(lx, lz) + 0.1, lz, sz, 1, sz * (0.6 + r() * 0.6), 0, r() * 6.283, 0, pickR(r, hexes), 2, r());
    }
  };
  // мелочь на кроне: цветы (вид 5) и ягоды (вид 6) — снаружи комков, больше снизу
  const dots = (n, cx, cy, cz, rad, size, hexes, k, ico) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, h = -0.5 + r() * 0.9, d = rad * Math.sqrt(1 - h * h) * 0.95;
      P.add(T.oct, x + (cx + Math.cos(a) * d) * s + (VAR ? VAR.wx * (cy + h * rad) * s : 0), y + (cy + h * rad) * s, z + (cz + Math.sin(a) * d) * s + (VAR ? VAR.wz * (cy + h * rad) * s : 0),
        size * s, size * s * (ico ? 1.6 : 1), size * s, 0, r() * 6.283, 0, pickR(r, hexes), k, 0.02 + r() * 0.9);
    }
  };
  const H = 0.88 + r() * 0.3;                              // своя высота у каждого
  if (kind === 'birch') {
    // белый ствол с чёрными чёрточками, тёмный комель; крона лёгкая, вытянутая, светлая
    trunk(0.3, 7.4 * H, '#ece8de');
    P.add(T.stick, x, y + 0.3 * s, z, 0.36 * s, 0.75 * s, 0.36 * s, 0, yaw, 0, '#5e5850');
    for (let i = 0; i < 4; i++) {
      const hy = 1.2 + i * 1.45 * H + r() * 0.4;
      const a = yaw + i * 2.3 + r();                      // пятно с одной стороны ствола, не кольцо
      // у модели ствол тоньше кверху (радиус угла: 0,2 у земли → 0,13 на 3,6 м → 0,06 на макушке) — пятно по нему
      const hm = hy / H, rr = WM ? (hm < 3.6 ? 0.2 - 0.07 * hm / 3.6 : Math.max(0.06, 0.13 - 0.07 * (hm - 3.6) / 5)) : 0;
      const w = WM ? rr * 1.5 : 0.26, off = WM ? rr * 0.25 : 0.06;
      P.add(T.stick, x + Math.cos(a) * off * s, y + hy * s, z - Math.sin(a) * off * s, w * s, (0.07 + r() * 0.08) * s, w * s, 0, a, 0, '#26252a');
    }
    for (let i = 0; i < 3; i++) branch((3.4 + i * 0.9) * H, 1.5 + r() * 0.7, 0.5 + r() * 0.35, i * 2.1 + r(), 0.09, '#d8d2c6');
    for (let i = 0; i < 2; i++) branch(6.2 * H, 1.3 + r() * 0.5, 0.25 + r() * 0.35, i * 2.1 + r(), 0.06, '#6a5248');   // тонкие тёмные прутья наверху — зимой видно
    const g = r() < 0.5 ? '#80c05a' : '#8cc862', n = 4 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = i * 2.4 + r();
      clump(Math.sin(a) * 0.75 * (1 - t * 0.6), (3.9 + t * 3.7) * H, Math.cos(a) * 0.75 * (1 - t * 0.6), 1.25 - t * 0.35, 1.3, g, 0, t);
    }
    leaves(YEL, 4, 2.6);
    if (WM) winterTree(P, r() < 0.5 ? 'birchA' : 'birchB', x, y, z, s, s * H, s, yaw, TREE.WINTER.COL.birch, twig(r));
  } else if (kind === 'maple' || kind === 'lime') {
    // клён — широкий круглый, осенью красный и рыжий; липа — повыше, осенью жёлтая
    const maple = kind === 'maple';
    const pal = maple ? (r() < 0.55 ? 2 : 1) : r() < 0.75 ? 0 : 1;
    trunk(0.5, 3.0 * H, maple ? '#6e5440' : '#7a5a3c');
    for (let i = 0; i < 3; i++) branch(2.3 * H + r() * 0.4, 2.0 + r() * 0.6, 0.6 + r() * 0.3, i * 2.1 + r() * 0.6, 0.15, '#6a4c32');
    const g = pickR(r, maple ? ['#4f9443', '#5aa04a'] : ['#5aa04a', '#62a84f', '#6fb05a']);
    const top = maple ? 5.3 : 6.0, rad = maple ? 1.55 : 1.3;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + r() * 0.5;
      clump(Math.sin(a) * rad, (top - 1.0 - r() * 0.4) * H, Math.cos(a) * rad, 1.35 + r() * 0.3, maple ? 0.85 : 1.0, g, pal, 0.25);
    }
    clump(0, top * H, 0, maple ? 1.65 : 1.45, maple ? 0.85 : 1.15, g, pal, 1);
    for (let i = 0; i < 2; i++) branch((top - 1.4) * H, 1.5, 0.3 + r() * 0.3, i * 3.1 + r(), 0.08, '#5e4632');   // макушка: зимой видно, что это дерево, а не рогатка
    leaves(pal === 0 ? YEL : pal === 1 ? ORA : RED, 6, 3.4);
    if (WM) winterTree(P, kind, x, y, z, s, s * H, s, yaw, TREE.WINTER.COL[kind], twig(r));
  } else if (kind === 'alley' && LEAN) {
    // дерево аллеи: толстый ствол, сучья и крона тянутся над дорогой к её оси — с той стороны навстречу
    // такое же, кроны смыкаются аркой. Зимой видно голые сучья через всю дорогу
    const AL = TREE.ALLEY, ux = LEAN.ux, uz = LEAN.uz, R = LEAN.reach, vx = -uz, vz = ux;
    const sp = weighted(r, AL.MIX);
    const pal = sp === 'maple' ? (r() < 0.55 ? 2 : 1) : sp === 'poplar' ? 3 : r() < 0.8 ? 0 : 1;
    const g = pickR(r, sp === 'maple' ? ['#4f9443', '#5aa04a'] : ['#5aa04a', '#62a84f', '#548f44']);
    const bark = sp === 'poplar' ? '#6a5a48' : '#6e5440';
    // М9: у каждого дерева аллеи своя форма — вариант ветвления модели, наклон ствола, ширина и высота, у кроны свои комки (хеш места, не r)
    const q = k => hz(x, z, 60 + k), hr = r();
    const TR = AL.TRUNK * (0.94 + r() * 0.12), hTop = AL.TOP * (VAR ? 0.95 + q(0) * 0.15 : 0.97 + hr * 0.06), wk = VAR ? VAR.az : 1;
    const at = (f, h, sd = 0) => [x + ux * f + vx * sd + (VAR ? VAR.wx * h : 0), y + h, z + uz * f + vz * sd + (VAR ? VAR.wz * h : 0)];
    const limb = (a, b, w, hex) => {
      if (WM) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
      P.add(T.stick, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, w, l, w, 0, Math.atan2(dz / l, -dx / l), Math.acos(Math.max(-1, Math.min(1, dy / l))), hex);
    };
    const F = at(0.3, TR), M = at(R * 0.55, TR + 2.4), sd = r() < 0.5 ? -1 : 1;
    limb(at(0, -0.2), F, 0.78, bark);                                   // ствол, чуть к дороге
    limb(F, M, 0.42, bark);                                             // главный сук — над дорогу
    limb(M, at(R * 1.02, hTop - 1.4, sd * 0.8), 0.18, '#5e4632');        // тонкий — до середины улицы
    limb(M, at(R * 0.7, hTop - 0.4, -sd * 1.6), 0.12, '#5e4632');
    for (const k of [-1, 1]) limb(F, at(1.0, TR + 2.4, k * 2.6), 0.28, bark);   // вдоль улицы
    limb(F, at(-1.6, TR + 2.2), 0.24, bark);                            // назад, над тротуаром
    limb(F, at(0.6, TR + 4.4), 0.2, '#5e4632');                         // макушка
    // крона по дуге от ствола к оси улицы: у ствола ~9 м, над осью ~10 м до центра комка
    const hc = t => TR + 3.1 + (hTop - 1.7 - TR - 3.1) * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI / 2);
    let C = [[-0.18, 0, 2.3], [0.12, 0, 2.7], [0.42, 0, 2.7], [0.72, 0, 2.6], [1.0, 0, 2.5],
      [0.3, 2.5, 2.2], [0.3, -2.5, 2.2], [0.78, 2.1 * sd, 2.1], [0.2, 0.6 * sd, 1.9]];
    if (VAR) {                                                          // крона несимметричная: комки сдвинуты, часть боковых нет, где-то лишний
      C = C.map(([t, side, rr], i) => (i >= 5 && i <= 7 && q(10 + i) < 0.22) ? null : [t + (q(20 + i) - 0.5) * 0.16, side * wk + (q(30 + i) - 0.5) * 1.4, rr * (0.82 + q(40 + i) * 0.42)]);
      if (q(5) < 0.5) C.push([0.25 + q(6) * 0.6, (q(7) - 0.5) * 5, 1.7 + q(8) * 0.6]);
    }
    C.forEach((c, i) => {
      if (!c) return;
      const [t, side, rr] = c;
      const p = at(t * R, hc(t) + (i === 8 ? 2.1 : 0) + (r() - 0.5) * 0.5, side + (r() - 0.5) * 0.8);
      const k = rr * (0.92 + r() * 0.16);
      P.add(T.ico, p[0], p[1], p[2], k, k * 0.74, k, 0, r() * 6.283, 0, tone(g, Math.round((0.84 + 0.3 * (i === 8 ? 1 : t * 0.6)) * 20) / 20), 1, r(), pal, 0.38);
    });
    leaves(pal === 0 ? YEL : pal === 1 ? ORA : pal === 2 ? RED : ['#e0c840', '#f0d048'], 6, 3.0);
    // модель аллеи: +x — к оси улицы (сучья до 10,4 м) — тянем до reach; высота — по верху арки
    if (WM) winterTree(P, 'alley', x, y, z, R / 10.2, hTop / 11.6, 1, Math.atan2(-uz, ux), sp === 'maple' ? TREE.WINTER.COL.maple : sp === 'poplar' ? [bark, bark, '#544436', '#4c3e32'] : [bark, bark, '#5e4632', '#54402e'], twig(r));
  } else if (kind === 'poplar') {
    // тополь колонной: высокий, узкий, крона от низа почти до макушки; зимой — метла из прямых веток
    trunk(0.5, 2.4 * H, '#6a5a48');
    for (let i = 0; i < 4; i++) branch(1.8 * H, (5.2 + r() * 1.2) * H, 0.1 + r() * 0.1, i * 1.57 + r(), 0.13, '#5a4a3a');
    const g = r() < 0.5 ? '#4f8f3f' : '#548f44';
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      clump((r() - 0.5) * 0.5, (3.4 + i * 1.75) * H, (r() - 0.5) * 0.5, 1.5 - t * 0.5, 1.3, g, i < 2 ? 3 : 0, t);
    }
    leaves(['#c8b840', '#e0c040'], 3, 2.2);
    if (WM) winterTree(P, 'poplar', x, y, z, s, s * H, s, yaw, TREE.WINTER.COL.poplar, twig(r));
  } else if (kind === 'rowan') {
    // рябина: невысокая, ствол раздвоен; осенью красная, гроздья ягод — с осени до конца зимы
    if (!WM) for (const sd of [-1, 1]) P.add(T.stick, x + sd * 0.25 * s, y + 1.2 * H * s, z, 0.2 * s, 2.6 * H * s, 0.2 * s, 0, yaw, sd * 0.16, '#6a5a4c');
    for (let i = 0; i < 3; i++) branch(2.0 * H, 1.4 + r() * 0.4, 0.55 + r() * 0.3, i * 2.1 + r(), 0.08, '#6a5a4c');
    const g = '#5aa04a', pal = r() < 0.6 ? 2 : 1;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + r(), t = i / 3;
      clump(Math.sin(a) * 0.8, (2.9 + t * 1.1) * H, Math.cos(a) * 0.8, 1.0 - t * 0.15, 0.95, g, pal, t);
    }
    dots(8, 0, 3.0 * H, 0, 1.45, 0.3, ['#d8301c', '#e8481c', '#c8281c'], 6, false);
    leaves(pal === 2 ? RED : ORA, 3, 2.0);
    if (WM) winterTree(P, 'rowan', x, y, z, s, s * H, s, yaw, TREE.WINTER.COL.rowan, twig(r));
  } else if (kind === 'pine') {
    // сосна: рыжий ствол, крона — неровные тёмные ярусы на верхней половине, снизу сухие сучки
    trunk(0.42, 9.2 * H, '#a0603a');
    for (let i = 0; i < 2; i++) branch((2.4 + i * 1.1) * H, 0.9, 1.25, r() * 6.28, 0.09, '#6a4a30');
    for (let i = 0; i < 3; i++) branch((4.4 + i * 1.2) * H, 2.0, 1.05, i * 2.1 + r(), 0.13, '#8a5030');
    const G = ['#3f7a3f', '#356b3a', '#467f44'];
    for (let i = 0; i < 7; i++) {
      const t = i / 6, a = i * 2.3 + r(), d = (1.7 - 0.9 * t) * (0.7 + 0.5 * r());
      clump(Math.sin(a) * d, (4.4 + t * 5.2) * H, Math.cos(a) * d, 1.85 - 0.6 * t, 0.6, G[i % 3], 0, t, 0);
    }
  } else if (kind === 'spruce') {
    const hs = 0.85 + r() * 0.5;
    trunk(0.36, 1.4, '#5a4030');
    const L = [[2.3, 1.0], [1.85, 2.2], [1.4, 3.3], [0.9, 4.3]];
    L.forEach(([rr, b], i) => P.add(T.cone, x, y + (b + 1.0) * s * hs, z, rr * s, 2.0 * s * hs, rr * s, 0, yaw + i * 0.45, 0, i % 2 ? '#357341' : '#2f6a3a'));
    o.SPRUCES.push({ x, z, y, s, hs });
  } else if (kind === 'lilac') {
    // сирень: куст ~2,5 м из прямых прутьев, весной — фиолетовые или белые кисти
    for (let i = 0; i < 4; i++) branch(0, 2.0 * H, 0.22 + r() * 0.12, i * 1.57 + r(), 0.09, '#6a5a4c');
    const pal = 3;
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.6; clump(Math.sin(a) * 0.7, (1.4 + r() * 0.4) * H, Math.cos(a) * 0.7, 0.85 + r() * 0.15, 1.0, '#5f9a48', pal, 0.2); }
    clump(0, 2.2 * H, 0, 0.85, 1.1, '#5f9a48', pal, 1);
    const hue = r() < 0.75 ? ['#a87ad0', '#b98ee0', '#9a6cc4'] : ['#f2eef8', '#e6def2'];
    dots(7, 0, 1.9 * H, 0, 1.25, 0.3, hue, 5, true);
  } else if (kind === 'rosehip') {
    // шиповник: невысокий плотный куст, осенью — красные ягоды
    for (let i = 0; i < 4; i++) branch(0, 1.3, 0.4 + r() * 0.2, i * 1.57 + r(), 0.07, '#7a4a3a');
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.6; clump(Math.sin(a) * 0.55, 0.8 + r() * 0.3, Math.cos(a) * 0.55, 0.65 + r() * 0.12, 0.9, '#4f8a3c', 2, i / 3); }
    dots(6, 0, 0.9, 0, 0.95, 0.2, ['#c8281c', '#d8401c'], 6, false);
  } else if (NEW_KINDS.has(kind)) {
    growNew(kind, { P, T, r, x, y, z, s, yaw, H, WM, trunk, branch, clump, leaves, dots });
  } else {                                                 // куст в парке
    for (let i = 0; i < 3; i++) branch(0, 2.2, 0.28, i * 2.1 + r(), 0.16, '#6a4c32');
    const pal = r() < 0.5 ? 2 : 1;
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + r(); clump(Math.sin(a) * 0.8, 1.7 + r() * 0.7, Math.cos(a) * 0.8, 0.9 + r() * 0.3, 0.9, pickR(r, ['#5aa04a', '#6fb05a', '#4f9443']), pal, i / 3); }
    leaves(pal === 2 ? RED : ORA, 3, 2.0);
  }
  STATS.tris[kind] = (STATS.tris[kind] || 0) + TRIS;
  if (DECIDUOUS.has(kind)) o.DECID.push([x, z]);
}

/* ─────────────── новые породы и кусты (М6, автор 24.10.2026: «больше вариаций кустов и деревьев») ───────────────
   У каждой — 2—3 размера и формы (s, H, своя форма по жребию), цвета по сезонам (осенняя палитра комков 0 — золотая,
   1 — рыжая, 2 — алая, 3 — лимонная), зимой — голые ветки моделью из Blender (wintertrees.data.js), хвойные и
   стриженые — зелёные, снег сверху. Цветы — вид 5 (весной), ягоды и яблоки — вид 6 (с конца лета до середины зимы). */
const NEW_KINDS = new Set(['apple', 'cherry', 'willow', 'chestnut', 'elm', 'larch', 'oldtree', 'topiary', 'hedge', 'juniper',
  'caragana', 'elder', 'hawthorn', 'currant']);
const COLW = TREE.WINTER.COL;
function growNew (kind, c) {
  const { P, T, r, x, y, z, s, yaw, H, WM, trunk, branch, clump, leaves } = c;
  const dots = (n, ...a) => c.dots(MOB.on ? Math.max(2, Math.round(n * TREE.MOB_DOTS)) : n, ...a);   // телефон — реже
  // смещение в осях дерева (как у модели: поворот yaw вокруг вертикали) → мир
  const rot = (lx, lz) => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const wt = (name, sx, sy, sz, ry = yaw) => { if (WM) winterTree(P, name, x, y, z, sx, sy, sz, ry, COLW[kind], twig(r)); };
  if (kind === 'apple') {
    // яблоня-дичка: низкая, кривой ствол, крона широкая и приплюснутая; весной — бело-розовый цвет, осенью — яблочки
    const W = 0.85 + r() * 0.35;
    trunk(0.36, 1.7 * H, '#6a5644');
    for (let i = 0; i < 4; i++) branch(1.5 * H, 1.8 + r() * 0.5, 0.8 + r() * 0.3, i * 1.57 + r() * 0.5, 0.12, '#665040');
    const g = pickR(r, ['#5a9a48', '#62a04c', '#5f9446']);
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + r() * 0.4; clump(Math.sin(a) * 1.55 * W, (2.9 + r() * 0.4) * H, Math.cos(a) * 1.55 * W, 1.1 + r() * 0.25, 0.72, g, 0, 0.3); }
    clump(0, 3.7 * H, 0, 1.3 * W, 0.7, g, 0, 1);
    dots(9, 0, 3.2 * H, 0, 2.15 * W, 0.32, ['#fbeef2', '#f4d6de', '#ffffff'], 5, false);
    dots(6, 0, 3.0 * H, 0, 2.1 * W, 0.18, r() < 0.55 ? ['#d8401c', '#c83020', '#e85a28'] : ['#e8c040', '#d8b030', '#c8d040'], 6, false);
    leaves(YEL, 4, 2.8);
    wt('apple', s * W, s * H, s * W);
  } else if (kind === 'cherry') {
    // черёмуха: три ствола из земли, крона высоким овалом; весной вся в белых кистях, летом — чёрные ягоды
    for (let i = 0; i < 3; i++) branch(0, 4.6 * H, 0.2 + r() * 0.1, i * 2.1 + r() * 0.4, 0.13, '#4e4440');
    const g = pickR(r, ['#4f8a3c', '#558f40']), W = 0.85 + r() * 0.3;
    for (let i = 0; i < 5; i++) { const t = i / 4, a = i * 2.4 + r(); clump(Math.sin(a) * 1.15 * W * (1 - t * 0.4), (3.5 + t * 2.4) * H, Math.cos(a) * 1.15 * W * (1 - t * 0.4), 1.2 - t * 0.25, 1.15, g, 1, t); }
    dots(13, 0, 4.5 * H, 0, 2.2 * W, 0.32, ['#ffffff', '#f6f4ee', '#eef0e6'], 5, true);
    dots(5, 0, 4.0 * H, 0, 2.1 * W, 0.15, ['#2a1e28', '#3a2a34'], 6, false);
    leaves(ORA, 3, 2.4);
    wt('cherry', s * W, s * H, s * W);
  } else if (kind === 'willow') {
    // ива у воды: плакучая (крона свисает почти до земли) или ракита (короткий толстый ствол, круглая шапка)
    const weep = FORM !== null ? FORM === 0 : r() < 0.65, g = pickR(r, ['#8aa860', '#93ad66', '#7f9f58']);
    if (weep) {
      trunk(0.6, 3.0 * H, '#6a5e4c');
      for (let i = 0; i < 4; i++) branch(2.6 * H, 2.4, 0.85 + r() * 0.3, i * 1.57 + r() * 0.5, 0.18, '#6e6248');
      // «занавес»: узкие длинные пряди по кругу свисают от макушки почти до земли, сверху — приплюснутая шапка
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + r() * 0.3, d = 2.4 + r() * 0.5; clump(Math.sin(a) * d, (3.5 + r() * 0.4) * H, Math.cos(a) * d, 0.8 + r() * 0.15, 2.5, g, 3, 0.1 + r() * 0.3); }
      clump(0, 5.5 * H, 0, 2.3, 0.62, g, 3, 1);
      wt('willowA', s, s * H, s);
    } else {
      trunk(0.72, 2.3 * H, '#6a5e4c');
      for (let i = 0; i < 4; i++) branch(2.0 * H, 2.0, 0.45 + r() * 0.3, i * 1.57 + r() * 0.5, 0.14, '#6e6248');
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.5; clump(Math.sin(a) * 1.5, (4.0 + r() * 0.4) * H, Math.cos(a) * 1.5, 1.35 + r() * 0.2, 0.95, g, 3, 0.25); }
      clump(0, 5.4 * H, 0, 1.6, 0.9, g, 3, 1);
      wt('willowB', s, s * H, s);
    }
    leaves(['#c8b840', '#e0c040'], 4, 3.2);
  } else if (kind === 'chestnut') {
    // каштан: толстый ствол, тёмный плотный купол (или высокий овал); весной — белые «свечи», осенью рыжий
    const tall = r() < 0.4, g = pickR(r, ['#3f7f3a', '#447f3c', '#3a7536']), W = tall ? 0.8 : 1;
    trunk(0.62, 3.4 * H, '#5a4a40');
    for (let i = 0; i < 3; i++) branch(3.0 * H, 2.6, 0.6 + r() * 0.3, i * 2.1 + r() * 0.5, 0.18, '#56463a');
    // плотный купол: нижнее кольцо из 4 комков внахлёст, над ним 3, макушка — без просветов (не «клевер»)
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.4; clump(Math.sin(a) * 1.5 * W, (4.9 + r() * 0.3) * H, Math.cos(a) * 1.5 * W, 1.75 + r() * 0.15, tall ? 1.15 : 0.9, g, 1, 0.2); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.8 + r() * 0.4; clump(Math.sin(a) * 0.95 * W, (6.3 + r() * 0.3) * H * (tall ? 1.08 : 1), Math.cos(a) * 0.95 * W, 1.5, tall ? 1.15 : 0.9, g, 1, 0.6); }
    clump(0, (tall ? 7.9 : 7.2) * H, 0, 1.35 * W, tall ? 1.2 : 0.85, g, 1, 1);
    dots(12, 0, 6.0 * H, 0, 3.1 * W, 0.24, ['#f8f4e8', '#f6e4e0', '#fff8f0'], 5, true);
    leaves(ORA, 6, 3.4);
    wt('chestnut', s * W, s * H * (tall ? 1.1 : 1), s * W);
  } else if (kind === 'elm') {
    // вяз — «ваза»: ствол до 3,3 м, три лидера вразлёт вверх, крона широким зонтом; осенью золотой
    const g = pickR(r, ['#4f8f3f', '#57954a', '#4a8a3c']), W = 0.85 + r() * 0.3;
    trunk(0.5, 3.4 * H, '#5e5248');
    for (let i = 0; i < 3; i++) branch(3.0 * H, 4.8, 0.42 + r() * 0.12, i * 2.1 + r() * 0.3, 0.2, '#5a4c40');
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + r() * 0.4; clump(Math.sin(a) * 2.7 * W, (7.5 + r() * 0.5) * H, Math.cos(a) * 2.7 * W, 1.45 + r() * 0.2, 0.7, g, 0, 0.35); }
    clump(0, 8.6 * H, 0, 1.9 * W, 0.6, g, 0, 1);
    leaves(YEL, 6, 3.6);
    wt('elm', s * W, s * H, s * W);
  } else if (kind === 'larch') {
    // лиственница: конус из ярусов светлой мягкой хвои — осенью золотая и облетает (вид 1), зимой — голые ветки мутовками
    const g = pickR(r, ['#8cc060', '#94c468', '#86b85a']);
    trunk(0.34, 12 * H, '#7a5240');
    const L = [[2.4, 1.9], [1.95, 3.9], [1.5, 5.8], [1.05, 7.7], [0.6, 9.5]];
    L.forEach(([rr, b], i) => P.add(T.cone, x, y + (b + 1.15) * s * H, z, rr * s, 2.3 * s * H, rr * s, 0, yaw + i * 0.5, 0, tone(g, Math.round((0.84 + 0.06 * i) * 20) / 20), 1, r(), 0, 0.38));
    leaves(['#e8b830', '#f0c848', '#d8a028'], 3, 2.2);
    wt('larch', s, s * H, s);
  } else if (kind === 'oldtree') {
    // старое корявое: толстый наклонный ствол с дуплом, один сук обломан, другой сухой торчит; крона редкая, набок
    const g = pickR(r, ['#5a9446', '#62984a', '#548c42']), pal = r() < 0.5 ? 0 : 1;
    trunk(0.85, 5.0 * H, '#5a5046');
    branch(3.0 * H, 1.8, 1.3, 2.9, 0.3, '#5e544a');
    const [hx, hz] = rot(0.02, -0.15);                            // дупло — на стволе (модель: ствол на 2,2 м — x 0,31, z −0,15)
    P.add(T.box, x + hx * s, y + 2.2 * s * H, z + hz * s, 0.3 * s, 0.5 * s, 0.3 * s, 0, yaw, 0, '#1e1812');
    for (const [lx, ly, lz, rr] of [[2.5, 6.0, 0.2, 1.5], [-0.8, 6.6, -1.2, 1.35], [1.0, 7.7, 0.7, 1.2], [3.2, 5.2, -1.4, 1.1]]) {
      const [ox, oz] = rot(lx, lz);
      clump(ox, ly * H, oz, rr * (0.9 + r() * 0.2), 0.8, g, pal, (ly - 5) / 3);
    }
    leaves(pal ? ORA : YEL, 5, 3.4);
    wt('oldtree', s, s * H, s);
  } else if (kind === 'topiary') {
    // стриженое у администраций: шар на земле, шар на штамбе или конус туи — вечнозелёное (вид 0), зимой снег сверху
    const f = FORM !== null ? FORM : (r() * 3) | 0, g = pickR(r, ['#3f7a3f', '#467f44', '#3a7040']), k = 0.85 + r() * 0.3;
    if (f === 0) P.add(T.ico, x, y + 0.55 * k, z, 0.75 * k, 0.68 * k, 0.75 * k, 0, yaw, 0, g, 0, 0, 0, 0.38);
    else if (f === 1) {
      P.add(T.stick, x, y + 0.6 * k, z, 0.12, 1.3 * k, 0.12, 0, yaw, 0, '#6a5040');
      P.add(T.ico, x, y + 1.65 * k, z, 0.62 * k, 0.6 * k, 0.62 * k, 0, yaw, 0, g, 0, 0, 0, 0.38);
    } else {
      P.add(T.cone, x, y + 1.2 * k, z, 0.6 * k, 2.4 * k, 0.6 * k, 0, yaw, 0, tone(g, 0.92), 0, 0, 0, 0.3);
      P.add(T.ico, x, y + 0.35 * k, z, 0.58 * k, 0.42 * k, 0.58 * k, 0, yaw, 0, tone(g, 0.85), 0);
    }
  } else if (kind === 'hedge') {
    // живая изгородь, кусок ~1,7 м вдоль стены: стриженая — ровный брусок (осенью желтеет, зимой — голые ветки со снегом
    // сверху), запущенная — комки разной высоты, зимой — прутья
    const ry = ORIENT !== null ? ORIENT : yaw, wild = FORM !== null ? FORM === 'wild' : r() < 0.4;
    const g = pickR(r, ['#4f8a3c', '#558f40', '#4a8538']), sd = twig(r);
    if (!wild) {
      const h = 0.95 + r() * 0.2;
      P.add(T.box, x, y + h / 2, z, 1.78, h, 0.85, 0, ry, 0, g, 1, 0.05 + r() * 0.85, 0, 0.38);
      P.add(T.box, x, y + h / 2 - 0.05, z, 1.62, h - 0.12, 0.7, 0, ry, 0, '#4a3e30', 7, sd);
      P.add(T.box, x, y + h - 0.08, z, 1.68, 0.1, 0.76, 0, ry, 0, '#4a3e30', 7, sd, 1);
    } else {
      const ux = Math.cos(ry), uz = -Math.sin(ry);
      for (let i = -1; i <= 1; i++) { const d = i * 0.62 + (r() - 0.5) * 0.2; clump(ux * d, 0.8 + r() * 0.5, uz * d, 0.62 + r() * 0.2, 1.05, g, 0, 0.3 + i * 0.2); }
      if (WMOK) winterTree(P, 'currant', x, y, z, 1.7, 1.5 + r() * 0.4, 1.0, ry, COLW.currant, sd);
      else for (let i = 0; i < 3; i++) branch(0, 1.4, 0.3 + r() * 0.3, i * 2.1 + r(), 0.06, '#5e4838');
    }
  } else if (kind === 'juniper') {
    // можжевельник: колонна или стелющийся — сизо-зелёный, вечнозелёный, зимой снег сверху
    const g = pickR(r, ['#3a6a58', '#41705c', '#365f50']);
    if (r() < 0.55) {
      P.add(T.cone, x, y + 1.3 * s * H, z, 0.55 * s, 2.6 * s * H, 0.55 * s, 0, yaw, 0, g, 0, 0, 0, 0.3);
      clump(0, 0.7 * H, 0, 0.6, 1.3, g, 0, 0.2, 0);
    } else for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(); clump(Math.sin(a) * 0.7, 0.42, Math.cos(a) * 0.7, 0.8, 0.45, g, 0, i / 2, 0); }
  } else if (kind === 'caragana') {
    // жёлтая акация: прямой узкий куст ~2,6 м, мелкая светлая листва, в конце весны — жёлтые цветки
    const g = pickR(r, ['#7ab052', '#80b458', '#74a84c']);
    for (let i = 0; i < 4; i++) branch(0, 2.3 * H, 0.15 + r() * 0.12, i * 1.57 + r(), 0.06, '#62603e');
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.5; clump(Math.sin(a) * 0.45, (1.2 + r() * 0.6) * H, Math.cos(a) * 0.45, 0.62 + r() * 0.12, 1.35, g, 0, i / 3); }
    clump(0, 2.25 * H, 0, 0.55, 1.2, g, 0, 1);
    dots(9, 0, 1.7 * H, 0, 0.95, 0.2, ['#f0d030', '#f8e048', '#e8c020'], 5, false);
    leaves(YEL, 2, 1.6);
    wt('caragana', s, s * H, s);
  } else if (kind === 'elder') {
    // бузина: широкий раскидистый куст ~3 м, крупная тёмная листва; весной — белые зонтики, с конца лета — красные ягоды
    const g = pickR(r, ['#4f8a3c', '#4a8238']);
    for (let i = 0; i < 4; i++) branch(0, 2.4 * H, 0.45 + r() * 0.2, i * 1.57 + r(), 0.08, '#7a7060');
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + r() * 0.5; clump(Math.sin(a) * 1.1, (1.6 + r() * 0.6) * H, Math.cos(a) * 1.1, 0.9 + r() * 0.15, 0.85, g, 2, i / 4); }
    dots(8, 0, 1.9 * H, 0, 1.75, 0.3, ['#f4f0dc', '#ece6cc'], 5, false);
    dots(7, 0, 1.8 * H, 0, 1.7, 0.18, ['#d82018', '#e83020', '#c01818'], 6, false);
    leaves(RED, 2, 1.8);
    wt('elder', s, s * H, s);
  } else if (kind === 'hawthorn') {
    // боярышник: деревце-куст ~3,5 м, круглая плотная крона; весной белые цветы, осенью алый и тёмно-красные ягоды
    const g = pickR(r, ['#4f9443', '#56984a']);
    trunk(0.2, 1.3 * H, '#5e4c40');
    for (let i = 0; i < 3; i++) branch(1.0 * H, 1.4, 0.7 + r() * 0.3, i * 2.1 + r(), 0.07, '#5a4838');
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + r() * 0.5; clump(Math.sin(a) * 0.85, (2.3 + r() * 0.3) * H, Math.cos(a) * 0.85, 0.9 + r() * 0.15, 0.9, g, 2, 0.3); }
    clump(0, 3.0 * H, 0, 0.95, 0.85, g, 2, 1);
    dots(9, 0, 2.5 * H, 0, 1.6, 0.2, ['#ffffff', '#f6f0ea'], 5, false);
    dots(8, 0, 2.4 * H, 0, 1.6, 0.16, ['#a8181c', '#c02020', '#901418'], 6, false);
    leaves(RED, 3, 2.0);
    wt('hawthorn', s, s * H, s);
  } else if (kind === 'currant') {
    // смородина у частных домов: низкий круглый куст ~1,2 м, чёрные или красные ягоды
    const g = pickR(r, ['#5a9a48', '#62a04e']), red = r() < 0.35;
    for (let i = 0; i < 3; i++) branch(0, 1.1, 0.4 + r() * 0.2, i * 2.1 + r(), 0.05, '#6a5040');
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + r() * 0.5; clump(Math.sin(a) * 0.45, 0.6 + r() * 0.2, Math.cos(a) * 0.45, 0.55 + r() * 0.1, 0.85, g, red ? 2 : 1, i / 2); }
    dots(6, 0, 0.65, 0, 0.8, 0.12, red ? ['#d01828', '#e02838'] : ['#20141e', '#2e1e2a'], 6, false);
    wt('currant', s, s, s);
  }
}

/* ─────────────── дворы: группы деревьев и кусты под окнами ───────────────
   A: CITY, tree(x, z, strip, kind) → true, если посадил; inHouse, inBounds, inPoly, groundH,
      nearestRoad, solidAt, SMASH, YARD_PATHS, PITCHES. Один раз при сборке, до smashBuild. */
/* шагами (yield) — поздняя сборка (latebuild.js; при ?nolate — разом): на Деке весь кусок ~0,5 с; шаг — 200 подъездов */
export function* plantYardsSteps (A) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noyardtrees')) return 0;   // ?noyardtrees — без дворовых групп и кустов (сравнить)
  const { CITY } = A, Y = TREE.YARD, WN = TREE.WIN;
  // сетки: двери, тропинки, мелочь дворов, уже посаженное здесь
  const grid = (cell) => { const m = new Map(); return { cell, m,
    add (x, z, v) { const k = Math.floor(x / cell) + ',' + Math.floor(z / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); },
    near (x, z, fn) { const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = m.get(i + ',' + j); if (a) for (const v of a) if (fn(v)) return true; }
      return false; } }; };
  const DOORS = grid(20), PATHS = grid(10), SM = grid(10), MINE = grid(20);
  for (const e of CITY.entrances) DOORS.add(e[0], e[1], e);
  for (const pl of A.YARD_PATHS) for (let i = 1; i < pl.length; i++) {
    const [ax, az] = pl[i - 1], [bx, bz] = pl[i], L = Math.hypot(bx - ax, bz - az), seg = [ax, az, bx, bz];
    for (let t = 0; t <= L; t += 8) PATHS.add(ax + (bx - ax) * t / (L || 1), az + (bz - az) * t / (L || 1), seg);
    PATHS.add(bx, bz, seg);
  }
  for (const it of A.SMASH) SM.add(it.x, it.z, it);
  // площадки и стоянки: многоугольники с рамкой
  const AREAS = [];
  const box = (p, pad) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad }; };
  for (const g of CITY.green) if (g.k === 'play' || g.k === 'pitch' || g.k === 'sport') AREAS.push(box(g.p, 3));
  for (const l of CITY.lots || []) if (l.p) AREAS.push(box(l.p, 3));
  const AG = grid(60);
  for (const a of AREAS) for (let x = a.x0; x <= a.x1 + 60; x += 60) for (let z = a.z0; z <= a.z1 + 60; z += 60) AG.add(Math.min(x, a.x1), Math.min(z, a.z1), a);
  const inArea = (x, z) => AG.near(x, z, a => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1 &&
    (A.inPoly(x, z, a.p) || A.inPoly(x + 3, z, a.p) || A.inPoly(x - 3, z, a.p) || A.inPoly(x, z + 3, a.p) || A.inPoly(x, z - 3, a.p)));
  const segD = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)); return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t); };

  // свободно ли место: m — сколько от дома, road — от проезда, door — от двери, path — от тропинки
  const free = (x, z, m, road, door, path, sm) => {
    STATS.tried++;
    if (!A.inBounds(x, z, -30) || A.groundH(x, z) < 0.3 || A.inHouse(x, z, m) || wet(x, z, 1)) return false;
    const n = A.nearestRoad(x, z, 14, 1);
    if (n && n.d < n.seg.w / 2 + road) return false;
    if (DOORS.near(x, z, e => Math.hypot(e[0] - x, e[1] - z) < door)) return false;
    if (PATHS.near(x, z, s => segD(x, z, s) < path)) return false;
    if (SM.near(x, z, it => Math.hypot(it.x - x, it.z - z) < (it.r || 1) + sm)) return false;
    if (A.solidAt(x, z, 1.0)) return false;
    if (PITCHES_NEAR(x, z)) return false;
    return !inArea(x, z);
  };
  const PITCHES_NEAR = (x, z) => (A.PITCHES || []).some(p => Math.hypot(p.cx - x, p.cz - z) < Math.max(p.L || 0, p.W || 0) / 2 + 4);
  const hash = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

  yield 'grid';
  let ne = 0;
  for (const e of CITY.entrances) {
    if (++ne % 200 === 0) yield 'ents';
    const [ex, ez, nx, nz] = e, tx = -nz, tz = nx;
    // группа деревьев перед подъездом
    if (hash(ex, ez, 1) < Y.SHARE) {
      for (let tr = 0; tr < 4; tr++) {
        const d = Y.DIST[0] + hash(ex, ez, 10 + tr) * (Y.DIST[1] - Y.DIST[0]), side = (hash(ex, ez, 20 + tr) * 2 - 1) * Y.SIDE;
        const cx = ex + nx * d + tx * side, cz = ez + nz * d + tz * side;
        if (MINE.near(cx, cz, q => q.g && Math.hypot(q.x - cx, q.z - cz) < Y.GAP)) continue;
        if (!free(cx, cz, 4, Y.ROAD + 1, Y.DOOR + 2, Y.PATH + 1, 2.5)) continue;
        const n = Y.N[0] + Math.floor(hash(cx, cz, 3) * (Y.N[1] - Y.N[0] + 1));
        const main = weighted(() => hash(cx, cz, 4), OLDT ? TREE.OLD.YARD : MOB.on ? Y.MIX_MOB : Y.MIX);
        const pts = [];
        for (let k = 0; k < n * 3 && pts.length < n; k++) {
          const a = k * 2.4 + hash(cx, cz, 30 + k) * 0.8, rr = k ? 2.2 + Math.sqrt(k) * 1.5 + hash(cx, cz, 40 + k) : 0;
          const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
          if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < Y.STEP)) continue;
          if (MINE.near(x, z, q => Math.hypot(q.x - x, q.z - z) < Y.STEP)) continue;
          if (k && !free(x, z, 3, Y.ROAD, Y.DOOR, Y.PATH, 1.8)) continue;
          const kind = hash(x, z, 5) < 0.75 ? main : pickR(() => hash(x, z, 6), ['birch', 'rowan', 'maple', 'lime']);   // примесь — прежняя
          if (!A.tree(x, z, 0, kind)) continue;
          pts.push([x, z]);
          MINE.add(x, z, { x, z, g: !k });
        }
        if (pts.length) { STATS.groups++; STATS.yard += pts.length; if (pts.length > 2 && STATS.ygroups.length < 60 && NEW_KINDS.has(main)) STATS.ygroups.push([Math.round(cx), Math.round(cz), Math.round(ex), Math.round(ez), main]); }
        break;
      }
    }
    // кусты под окнами — по обе стороны от двери
    for (const sd of [-1, 1]) {
      if (hash(ex, ez, sd > 0 ? 7 : 8) >= WN.SHARE) continue;
      const kind = weighted(() => hash(ex, ez, sd > 0 ? 11 : 12), OLDT ? TREE.OLD.WIN : WN.MIX), hedge = kind === 'hedge';
      const cnt = (WN.N[0] + Math.floor(hash(ex, ez, sd > 0 ? 13 : 14) * (WN.N[1] - WN.N[0] + 1))) * (hedge ? 2 : 1);
      let off = WN.FROM + hash(ex, ez, sd > 0 ? 15 : 16) * 2;
      if (hedge) { ORIENT = Math.atan2(-tz, tx); FORM = 'cut'; }               // изгородь под окнами — стриженая, вдоль стены
      for (let k = 0; k < cnt; k++, off += hedge ? WN.HEDGE_STEP : WN.STEP + hash(ex, ez, 17 + k) * 0.8) {
        const x = ex + nx * WN.WALL + tx * off * sd, z = ez + nz * WN.WALL + tz * off * sd;
        if (MINE.near(x, z, q => Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
        if (!free(x, z, 0.9, 1.5, 3.6, 1.3, 1.0)) continue;
        if (!A.tree(x, z, 0, kind)) continue;
        MINE.add(x, z, { x, z });
        STATS.shrubs++;
      }
      ORIENT = FORM = null;
    }
  }
  yield 'yards';
  if (!QS.has('nonewtrees') && !OLDT) {                     // ?nonewtrees — без садов, стриженого у администраций и ив по берегам (сравнить)
    const put = (x, z, kind, m, road, door, path, sm, step = 2.4) => {
      if (MINE.near(x, z, q => Math.hypot(q.x - x, q.z - z) < step)) return false;
      if (!free(x, z, m, road, door, path, sm) || !A.tree(x, z, 0, kind)) return false;
      MINE.add(x, z, { x, z });
      STATS.places[kind] = (STATS.places[kind] || 0) + 1;
      return true;
    };
    plantGardens(A, put, hash);
    yield 'gardens';
    plantAdmins(A, put, hash);
    yield 'admins';
    plantShores(A, put, hash);
  }
  return STATS;
}

/* сады частного сектора (М6): за домом, с той стороны, что дальше от улицы, — 1—3 яблони, черёмухи, рябины, ряд смородины,
   у части — запущенная изгородь по задней границе */
const centerOf = p => { let cx = 0, cz = 0; for (const q of p) { cx += q[0] / p.length; cz += q[1] / p.length; } return [cx, cz]; };
function plantGardens (A, put, hash) {
  const G = TREE.GARDEN;
  for (const b of A.CITY.buildings) {
    if (!(b.k === 'priv' || b.st === 'priv') || !b.p || b.p.length < 3) continue;
    const [cx, cz] = centerOf(b.p);
    if (hash(cx, cz, 50) >= G.SHARE * (MOB.on ? G.MOB : 1)) continue;
    const rd = A.nearestRoad(cx, cz, 80, 1);
    let ax = 1, az = 0;
    if (rd) { const l = Math.hypot(cx - rd.x, cz - rd.z) || 1; ax = (cx - rd.x) / l; az = (cz - rd.z) / l; }
    const bx = -az, bz = ax;
    let back = 0, side = 0;                         // дом: до задней стены и в стороны от середины, м
    for (const q of b.p) { back = Math.max(back, (q[0] - cx) * ax + (q[1] - cz) * az); side = Math.max(side, Math.abs((q[0] - cx) * bx + (q[1] - cz) * bz)); }
    if (STATS.gardens.length < 40) STATS.gardens.push([Math.round(cx), Math.round(cz), Math.round(ax * 100) / 100, Math.round(az * 100) / 100]);   // для проверки глазами
    const d0 = back + G.BACK[0] + hash(cx, cz, 51) * (G.BACK[1] - G.BACK[0]);
    const n = G.N[0] + Math.floor(hash(cx, cz, 52) * (G.N[1] - G.N[0] + 1));
    for (let i = 0; i < n; i++) {
      const lat = (i - (n - 1) / 2) * G.STEP + (hash(cx, cz, 53 + i) - 0.5) * 1.2, dd = d0 + (hash(cx, cz, 56 + i) - 0.5) * 1.6;
      const x = cx + ax * dd + bx * lat, z = cz + az * dd + bz * lat;
      put(x, z, weighted(() => hash(x, z, 57), G.MIX), 1.5, 3, 5, 1.6, 1.2, 2.8);
    }
    if (hash(cx, cz, 60) < G.CURRANT) {             // смородина — рядком сбоку от дома
      const sd = hash(cx, cz, 61) < 0.5 ? -1 : 1, nb = 2 + Math.floor(hash(cx, cz, 62) * 3);
      for (let i = 0; i < nb; i++) {
        const lat = sd * (side + 2.0), dd = back * 0.4 - i * 1.5;
        put(cx + ax * dd + bx * lat, cz + az * dd + bz * lat, 'currant', 1.0, 2.5, 3.6, 1.3, 0.8, 1.2);
      }
    }
    if (hash(cx, cz, 63) < G.HEDGE) {               // запущенная изгородь по задней границе
      ORIENT = Math.atan2(-bz, bx); FORM = 'wild';
      const dd = d0 + 3.2;
      for (let i = -2; i <= 2; i++) { const lat = i * 1.7; put(cx + ax * dd + bx * lat, cz + az * dd + bz * lat, 'hedge', 1.2, 2.5, 4, 1.3, 0.8, 1.5); }
      ORIENT = FORM = null;
    }
  }
}

/* у администраций, школ, больниц и контор (pub, off — М6): вдоль стены к улице, в 2,6 м от неё — ряд стриженых шаров
   (у каждого здания своя форма: шар, шар на штамбе, конус туи — или через один) или стриженая изгородь */
function plantAdmins (A, put, hash) {
  const D = TREE.ADMIN;
  for (const b of A.CITY.buildings) {
    if (!(b.k === 'pub' || b.k === 'off') || !b.p || b.p.length < 3) continue;
    const [cx, cz] = centerOf(b.p);
    if (hash(cx, cz, 70) >= D.SHARE) continue;
    // сторона к улице: середина стены + наружу 3 м — ближе всех к дороге
    let best = null;
    for (let i = 0; i < b.p.length; i++) {
      const [x1, z1] = b.p[i], [x2, z2] = b.p[(i + 1) % b.p.length], L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 8) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      let nx = uz, nz = -ux;
      if (A.inPoly(mx + nx, mz + nz, b.p)) { nx = -nx; nz = -nz; }
      const rd = A.nearestRoad(mx + nx * 3, mz + nz * 3, 50, 1);
      if (!rd) continue;
      if (!best || rd.d < best.d) best = { d: rd.d, x1, z1, ux, uz, L, nx, nz };
    }
    STATS.admin.b++;
    if (!best) continue;
    STATS.admin.edge++;
    const hedge = hash(cx, cz, 71) < D.HEDGE, f1 = (hash(cx, cz, 72) * 3) | 0, f2 = hash(cx, cz, 73) < 0.5 ? f1 : (f1 + 1) % 3;
    const step = hedge ? TREE.WIN.HEDGE_STEP : D.STEP, max = hedge ? D.MAX * 2 : D.MAX;
    if (hedge) { ORIENT = Math.atan2(-best.uz, best.ux); FORM = 'cut'; }
    let n = 0;
    for (let t = D.FROM + (best.L - 2 * D.FROM) % step / 2; t <= best.L - D.FROM && n < max; t += step) {
      if (!hedge) FORM = n % 2 ? f2 : f1;
      for (const w of D.WALL) {                     // у стены часто дорожка-отмостка — тогда чуть дальше
        const x = best.x1 + best.ux * t + best.nx * w, z = best.z1 + best.uz * t + best.nz * w;
        STATS.admin.try++;
        if (put(x, z, hedge ? 'hedge' : 'topiary', 0.9, 1.5, 3.6, 1.0, 0.8, hedge ? 1.5 : 2.0)) { n++; break; }
      }
    }
    STATS.admin.ok += n;
    ORIENT = FORM = null;
  }
}

/* ивы по берегам речек и прудов (М6): места через SHORE.STEP м по обе стороны, в 4,5—7,5 м от воды; из мест — доля по
   жребию так, чтобы ив было не больше SHORE.MAX (телефон — MAX_MOB) */
function plantShores (A, put, hash) {
  const S = TREE.SHORE, C = [];
  const edge = (p, closed, w) => {
    for (let i = 1; i < p.length + (closed ? 1 : 0); i++) {
      const [x1, z1] = p[i - 1], [x2, z2] = p[i % p.length], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      for (let t = S.STEP / 2; t < L; t += S.STEP) for (const sd of [-1, 1]) {
        const off = w / 2 + S.OFF[0] + hash(x1 + t, z1, 80 + sd) * (S.OFF[1] - S.OFF[0]);
        const x = x1 + ux * t - uz * off * sd, z = z1 + uz * t + ux * off * sd;
        if (A.inBounds(x, z, -30) && !wet(x, z, 1.5) && wet(x, z, TREE.PLACE.WATER)) C.push([x, z]);
      }
    }
  };
  for (const st of A.CITY.streams || []) edge(st.p, false, st.w || 6);
  for (const g of A.CITY.green) if (g.k === 'water') edge(g.p, true, 0);
  const max = MOB.on ? S.MAX_MOB : S.MAX, k = Math.min(1, max / Math.max(1, C.length));
  STATS.shore = C.length;
  for (const [x, z] of C) {
    if (hash(x, z, 85) >= k) continue;
    FORM = hash(x, z, 86) < 0.65 ? 0 : 1;           // плакучая / ракита
    put(x, z, 'willow', 2, 3, 6, 2, 1.5, 6);
    FORM = null;
  }
}

/* ─────────────── аллея-арка (улица Ленина в Солнечном) ───────────────
   Вдоль отрезка — деревья 'alley' с обеих сторон через STEP м за тротуаром, крона каждого
   тянется к оси улицы, и кроны с двух сторон смыкаются над дорогой. Не у перекрёстков и
   съездов, зебр, остановок, не в домах и не вплотную к другим препятствиям. Обычные
   деревья вдоль этих отрезков (game.js osmStreetTrees) не сажаются.
   A: CITY, mapId, tree, roadWidth, NODE_IDX, nodeDeg, ZEBRAS, inHouse, inBounds, solidAt. */
export function alleyRoads (CITY, mapId) {
  const AL = TREE.ALLEY;
  if (mapId !== AL.MAP || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('noalley'))) return [];
  return CITY.roads.filter(r => r.n === AL.NAME && (r.w || 0) >= AL.MIN_W);
}
export function plantAlley (A) {
  const AL = TREE.ALLEY, roads = alleyRoads(A.CITY, A.mapId);
  let n = 0, len = 0, skip = 0;
  const PTS = [];                                       // где стоят (для проверки, ?debug)
  for (const r of roads) {
    const off = A.roadWidth(r) / 2 + AL.OFF;
    const X = r.p.filter(p => { const k = A.NODE_IDX.get(p[0] + ',' + p[1]); return k !== undefined && A.nodeDeg(k) >= 3; });
    let acc = AL.STEP / 2;
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
      len += L;
      for (; acc < L; acc += AL.STEP) {
        const bx = x1 + ux * acc, bz = z1 + uz * acc;
        if (X.some(p => Math.hypot(p[0] - bx, p[1] - bz) < AL.CROSS)) { skip += 2; continue; }
        for (const s of [-1, 1]) {
          const x = bx - uz * off * s, z = bz + ux * off * s;
          if (!A.inBounds(x, z, -50) || A.inHouse(x, z, 1.5) || A.solidAt(x, z, 0.9) ||
            A.ZEBRAS.some(q => Math.abs(q.x - x) < AL.ZEBRA && Math.abs(q.z - z) < AL.ZEBRA) ||
            A.CITY.stops.some(q => Math.abs(q.p[0] - x) < AL.STOP && Math.abs(q.p[1] - z) < AL.STOP)) { skip++; continue; }
          LEAN = { ux: uz * s, uz: -ux * s, reach: off };
          if (A.tree(x, z, 0, 'alley')) { n++; PTS.push([Math.round(x), Math.round(z)]); } else skip++;
          LEAN = null;
        }
      }
      acc -= L;
    }
  }
  STATS.alley = { trees: n, skipped: skip, len: Math.round(len), roads: roads.length, PTS };
  return STATS.alley;
}

export const DEBUG = { TREE, STATS };
