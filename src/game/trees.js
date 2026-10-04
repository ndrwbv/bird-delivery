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
   шиповника (осень — зима).

   plantYards — дворы: группы по 3—7 деревьев перед подъездами и кусты под
   окнами (сирень, шиповник). Не на проезде, не у двери, не на тропинке,
   не на площадке и не в дворовой мелочи — места для пина остаются.
   Твёрдость — как у всех деревьев: ствол — препятствие 1,1 × 1,1 м (game.js tree).
   ────────────────────────────────────────────────────────────────────────── */

export const TREE = {
  // доли пород там, где дерево сажает карта и улицы (без своей породы)
  W_SVK: { birch: 30, pine: 13, spruce: 17, poplar: 10, maple: 8, lime: 6, rowan: 8, bush: 8 },
  W_MSK: { lime: 30, maple: 15, birch: 14, poplar: 11, rowan: 6, spruce: 10, pine: 4, bush: 10 },
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
    MIX: { birch: 40, poplar: 14, maple: 16, lime: 10, rowan: 12, pine: 8 },   // порода группы
  },
  // кусты под окнами
  WIN: {
    SHARE: 0.6,                 // у такой доли подъездов, с каждой стороны от двери — жребий
    WALL: 2.0,                  // от стены, м
    FROM: 4.4,                  // от оси двери вдоль стены не ближе, м (дальше заборчиков тропинки)
    N: [1, 3],                  // кустов подряд
    STEP: 2.0,                  // между кустами, м
    LILAC: 0.6,                 // сирень, остальное — шиповник
  },
};

export const STATS = { kinds: {}, where: {}, groups: 0, yard: 0, shrubs: 0, tried: 0 };

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

const YEL = ['#e8b830', '#f0c848', '#d8a028'], ORA = ['#e8902a', '#d86a22', '#f0a838'], RED = ['#c84a24', '#d86a22', '#b83a22'];
const DECIDUOUS = new Set(['birch', 'maple', 'lime', 'poplar', 'rowan', 'bush', 'lilac', 'rosehip']);

/* o: P (склейка), T (шаблоны), r (жребий от точки), x, z, y, kind, seversk, DECID, SPRUCES, ground(x, z) */
export function growTree (o) {
  const { P, T, r, x, z, y } = o;
  const kind = o.kind || weighted(r, o.seversk ? TREE.W_SVK : TREE.W_MSK);
  STATS.kinds[kind] = (STATS.kinds[kind] || 0) + 1;
  if (STATS.kinds[kind] === 40 || STATS.kinds[kind] === 400) STATS.where[kind] = [Math.round(x), Math.round(z)];   // для проверки глазами (?debug)
  const s = 0.82 + r() * 0.4, yaw = r() * 6.283;
  const trunk = (w, h, hex) => P.add(T.stick, x, y + h / 2 * s - 0.2, z, w * s, h * s + 0.2, w * s, 0, yaw, 0, hex);
  const branch = (y0, len, tilt, a, w, hex) => {
    // ветка от ствола: наклон tilt, по кругу a; центр — на середине длины
    const dx = -Math.sin(tilt) * Math.cos(a + yaw), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(a + yaw);
    P.add(T.stick, x + dx * len / 2 * s, y + (y0 + dy * len / 2) * s, z + dz * len / 2 * s, w * s, len * s, w * s, 0, a + yaw, tilt, hex);
  };
  // комок кроны: lvl 0 — нижний (темнее), 1 — верхний (светлее)
  const clump = (ox, oy, oz, rr, sy, hex, pal, lvl, kind = 1) =>
    P.add(T.ico, x + ox * s, y + oy * s, z + oz * s, rr * s, rr * s * sy, rr * s, 0, r() * 6.283, 0, tone(hex, Math.round((0.82 + 0.32 * lvl) * 20) / 20), kind, r(), pal, 0.38);
  const leaves = (hexes, n, rad) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = 0.4 + r() * rad, lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
      const sz = 0.6 + r() * 0.8;
      P.add(T.flat, lx, o.ground(lx, lz) + 0.1, lz, sz, 1, sz * (0.6 + r() * 0.6), 0, r() * 6.283, 0, pickR(r, hexes), 2, r());
    }
  };
  // мелочь на кроне: цветы (вид 5) и ягоды (вид 6) — снаружи комков, больше снизу
  const dots = (n, cx, cy, cz, rad, size, hexes, k, ico) => {
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, h = -0.5 + r() * 0.9, d = rad * Math.sqrt(1 - h * h) * 0.95;
      P.add(T.oct, x + (cx + Math.cos(a) * d) * s, y + (cy + h * rad) * s, z + (cz + Math.sin(a) * d) * s,
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
      P.add(T.stick, x + Math.cos(a) * 0.06 * s, y + hy * s, z - Math.sin(a) * 0.06 * s, 0.26 * s, (0.07 + r() * 0.08) * s, 0.26 * s, 0, a, 0, '#26252a');
    }
    for (let i = 0; i < 3; i++) branch((3.4 + i * 0.9) * H, 1.5 + r() * 0.7, 0.5 + r() * 0.35, i * 2.1 + r(), 0.09, '#d8d2c6');
    for (let i = 0; i < 2; i++) branch(6.2 * H, 1.3 + r() * 0.5, 0.25 + r() * 0.35, i * 2.1 + r(), 0.06, '#6a5248');   // тонкие тёмные прутья наверху — зимой видно
    const g = r() < 0.5 ? '#80c05a' : '#8cc862', n = 4 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = i * 2.4 + r();
      clump(Math.sin(a) * 0.75 * (1 - t * 0.6), (3.9 + t * 3.7) * H, Math.cos(a) * 0.75 * (1 - t * 0.6), 1.25 - t * 0.35, 1.3, g, 0, t);
    }
    leaves(YEL, 4, 2.6);
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
  } else if (kind === 'rowan') {
    // рябина: невысокая, ствол раздвоен; осенью красная, гроздья ягод — с осени до конца зимы
    for (const sd of [-1, 1]) P.add(T.stick, x + sd * 0.25 * s, y + 1.2 * H * s, z, 0.2 * s, 2.6 * H * s, 0.2 * s, 0, yaw, sd * 0.16, '#6a5a4c');
    for (let i = 0; i < 3; i++) branch(2.0 * H, 1.4 + r() * 0.4, 0.55 + r() * 0.3, i * 2.1 + r(), 0.08, '#6a5a4c');
    const g = '#5aa04a', pal = r() < 0.6 ? 2 : 1;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + r(), t = i / 3;
      clump(Math.sin(a) * 0.8, (2.9 + t * 1.1) * H, Math.cos(a) * 0.8, 1.0 - t * 0.15, 0.95, g, pal, t);
    }
    dots(8, 0, 3.0 * H, 0, 1.45, 0.3, ['#d8301c', '#e8481c', '#c8281c'], 6, false);
    leaves(pal === 2 ? RED : ORA, 3, 2.0);
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
  } else {                                                 // куст в парке
    for (let i = 0; i < 3; i++) branch(0, 2.2, 0.28, i * 2.1 + r(), 0.16, '#6a4c32');
    const pal = r() < 0.5 ? 2 : 1;
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + r(); clump(Math.sin(a) * 0.8, 1.7 + r() * 0.7, Math.cos(a) * 0.8, 0.9 + r() * 0.3, 0.9, pickR(r, ['#5aa04a', '#6fb05a', '#4f9443']), pal, i / 3); }
    leaves(pal === 2 ? RED : ORA, 3, 2.0);
  }
  if (DECIDUOUS.has(kind)) o.DECID.push([x, z]);
}

/* ─────────────── дворы: группы деревьев и кусты под окнами ───────────────
   A: CITY, tree(x, z, strip, kind) → true, если посадил; inHouse, inBounds, inPoly, groundH,
      nearestRoad, solidAt, SMASH, YARD_PATHS, PITCHES. Один раз при сборке, до smashBuild. */
export function plantYards (A) {
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
    if (!A.inBounds(x, z, -30) || A.groundH(x, z) < 0.3 || A.inHouse(x, z, m)) return false;
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

  for (const e of CITY.entrances) {
    const [ex, ez, nx, nz] = e, tx = -nz, tz = nx;
    // группа деревьев перед подъездом
    if (hash(ex, ez, 1) < Y.SHARE) {
      for (let tr = 0; tr < 4; tr++) {
        const d = Y.DIST[0] + hash(ex, ez, 10 + tr) * (Y.DIST[1] - Y.DIST[0]), side = (hash(ex, ez, 20 + tr) * 2 - 1) * Y.SIDE;
        const cx = ex + nx * d + tx * side, cz = ez + nz * d + tz * side;
        if (MINE.near(cx, cz, q => q.g && Math.hypot(q.x - cx, q.z - cz) < Y.GAP)) continue;
        if (!free(cx, cz, 4, Y.ROAD + 1, Y.DOOR + 2, Y.PATH + 1, 2.5)) continue;
        const n = Y.N[0] + Math.floor(hash(cx, cz, 3) * (Y.N[1] - Y.N[0] + 1));
        const main = weighted(() => hash(cx, cz, 4), Y.MIX);
        const pts = [];
        for (let k = 0; k < n * 3 && pts.length < n; k++) {
          const a = k * 2.4 + hash(cx, cz, 30 + k) * 0.8, rr = k ? 2.2 + Math.sqrt(k) * 1.5 + hash(cx, cz, 40 + k) : 0;
          const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
          if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < Y.STEP)) continue;
          if (MINE.near(x, z, q => Math.hypot(q.x - x, q.z - z) < Y.STEP)) continue;
          if (k && !free(x, z, 3, Y.ROAD, Y.DOOR, Y.PATH, 1.8)) continue;
          const kind = hash(x, z, 5) < 0.75 ? main : pickR(() => hash(x, z, 6), ['birch', 'rowan', 'maple', 'lime']);
          if (!A.tree(x, z, 0, kind)) continue;
          pts.push([x, z]);
          MINE.add(x, z, { x, z, g: !k });
        }
        if (pts.length) { STATS.groups++; STATS.yard += pts.length; }
        break;
      }
    }
    // кусты под окнами — по обе стороны от двери
    for (const sd of [-1, 1]) {
      if (hash(ex, ez, sd > 0 ? 7 : 8) >= WN.SHARE) continue;
      const kind = hash(ex, ez, sd > 0 ? 11 : 12) < WN.LILAC ? 'lilac' : 'rosehip';
      const cnt = WN.N[0] + Math.floor(hash(ex, ez, sd > 0 ? 13 : 14) * (WN.N[1] - WN.N[0] + 1));
      let off = WN.FROM + hash(ex, ez, sd > 0 ? 15 : 16) * 2;
      for (let k = 0; k < cnt; k++, off += WN.STEP + hash(ex, ez, 17 + k) * 0.8) {
        const x = ex + nx * WN.WALL + tx * off * sd, z = ez + nz * WN.WALL + tz * off * sd;
        if (MINE.near(x, z, q => Math.hypot(q.x - x, q.z - z) < 1.6)) continue;
        if (!free(x, z, 0.9, 1.5, 3.6, 1.3, 1.0)) continue;
        if (!A.tree(x, z, 0, kind)) continue;
        MINE.add(x, z, { x, z });
        STATS.shrubs++;
      }
    }
  }
  return STATS;
}

export const DEBUG = { TREE, STATS };
