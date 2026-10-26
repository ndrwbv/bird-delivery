/* ──────────────────────────────────────────────────────────────────────────
   Формы деревьев «как в глубинке» (2г6, 2г10; автор 25.10.2026: «деревья — низкие зелёные комья на палке, все похожи»).
   Правила словами — docs/CAREER.md «Город: как выглядит» → «Деревья выше и разные».

   Здесь — только формы крон основных пород города (берёза, клён, липа, тополь, сосна, ель): trees.js зовёт grow2 вместо
   прежних «комьев», всё ложится в ту же склейку сезонов (PILE, seasons.js), своих мешей нет.
     • высота — своя у каждого дерева, часть — с пятиэтажку и выше (WOOD.H: берёза 9—13 м, высокая 15—21; тополь 15—24;
       липа 11—17; клён 8,5—12,5; сосна 14—19, высокая 20—25; ель 8—14, высокая 15—21);
     • крона — «яйцо» из многих комков (WOOD.N): комки торчат наружу неровно, часть мест пустые — силуэт рваный, не шар;
       крона начинается высоко — под ней голый ствол и нижние сучья (ствол и сучья — зимняя модель trees.js, видны всегда);
     • два тона: комок к солнцу (сторона +z, верх) — светлый и тёплый, снизу и внутри — тёмный холодный (цвета WOOD.COL);
       поверх — шейдер склейки (seasons.js pileMat): грань к солнцу теплее, в тени — синее;
     • берёза — плакучая: по краю свисают светлые пряди; тополь — колонной; клён — широкий; сосна — рыжий голый ствол,
       крона «зонтиком» из 4—6 плоских лап ярусами на верхней трети, сухие сучки ниже; ель — ярусы «полка + бахрома»:
       полка сверху (на ней зимой снег), бахрома снизу — круче и рваная, остаётся зелёной;
     • снег (2г10): у сосны на каждой лапе — белая шапка (вид 8 склейки: видна, когда снега больше её зерна), хвоя сосны и
       ели — палитра 2 (шейдер кладёт снег гуще, чем на прочее). Ветки голых крон обводит снегом зимняя модель
       (trees.js: верх сечения поднят по снегу, liftOf).
   ?oldwood (и общий ?oldlook) — прежние кроны и леса (сравнить). Телефон — прежние (память: треугольников больше).
   ────────────────────────────────────────────────────────────────────────── */

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/* новый вид деревьев и леса включён (выключают ?oldwood и ?oldlook) */
export const WOOD_ON = !(QS.has('oldwood') || QS.has('oldlook'));

export const WOOD = {
  // высота дерева до макушки, м: [обычное от, до], [высокое от, до], доля высоких
  H: {
    birch: [9, 13, 15, 21, 0.35], lime: [11, 14, 14, 17, 0.4], maple: [8.5, 11, 10.5, 12.5, 0.3],
    poplar: [15, 19, 19, 24, 0.5], pine: [14, 19, 20, 25, 0.4], spruce: [8, 14, 15, 21, 0.35],
  },
  // комков на поверхности кроны (обычное / высокое), по 20 треугольников
  N: { birch: [5, 7], lime: [7, 9], maple: [7, 9], poplar: [6, 9] },
  // цвета: [тень — холодный тёмный, свет — тёплый светлый]
  COL: {
    birch: ['#2c5228', '#acc455'], lime: ['#1d4224', '#729c3e'], maple: ['#183a20', '#66923a'], poplar: ['#1a3a24', '#6c9650'],
    pine: ['#11281a', '#436a38'], spruce: ['#0e2418', '#30583a'],
  },
  BARK: { pine: ['#6a4030', '#c87a44'], spruce: '#4a3628' },
  SNOW: '#f2f5fa',
  // мягкая крона (второй круг 2г6): доля «от центра кроны» в нормали комка (берёза, клён, липа, тополь / сосна / ель)
  SOFT: { leaf: 0.55, pine: 0.35, spruce: 0.25 },
  // рваный край: с какой «боковитости» к взгляду (0 — лицом, 1 — ребром) листва редеет, до какой — сильнее всего, доля
  // просветов там; дальше EDGE[3] м — слабее, дальше EDGE[4] — край сплошной (не рябит)
  EDGE: [0.25, 0.9, 0.85, 70, 160],
  JIT: 0.22,                                         // комок не шар: вершины в стороны ±доля радиуса (4 формы)
};

const GA = 2.39996;
/* цвет между a и b: доля t (0…1), шаг 1/12 — склейка разбирает цвет по строке (кэш) */
const MIXC = new Map();
export function mixHex (a, b, t) {
  t = Math.max(0, Math.min(1, Math.round(t * 12) / 12));
  const key = a + b + t;
  let v = MIXC.get(key);
  if (v) return v;
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  v = '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
  MIXC.set(key, v);
  return v;
}

/* комок — не шар: икосаэдр, вершины которого раздвинуты в стороны на ±WOOD.JIT радиуса (4 формы, одна вершина — один сдвиг,
   щелей нет); раз на игру */
const LUMPS = [];
function lumpTpl (T, k) {
  if (!LUMPS.length) {
    for (let v = 0; v < 4; v++) {
      const t = T.ico, o = new Float32Array(t.length), J = new Map();
      let a = 977 + v * 7919;
      const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for (let i = 0; i < t.length; i += 3) {
        const key = Math.round(t[i] * 100) + ',' + Math.round(t[i + 1] * 100) + ',' + Math.round(t[i + 2] * 100);
        let f = J.get(key);
        if (f === undefined) J.set(key, f = 1 + (rnd() * 2 - 1) * WOOD.JIT);
        o[i] = t[i] * f; o[i + 1] = t[i + 1] * f; o[i + 2] = t[i + 2] * f;
      }
      LUMPS.push(o);
    }
  }
  return LUMPS[(k >>> 0) % 4];
}

/* ярус ели: полка (верх, пологая — на ней снег) и бахрома (низ, крутая, край рваный); радиус 1, высота 1, низ — y 0.
   граней по кругу 5 — 15 треугольников (полка 5 + бахрома 10) */
let SKIRT = null;
function skirtTpl () {
  if (SKIRT) return SKIRT;
  const n = 5, out = [], top = [0, 1, 0], mid = [], bot = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = a + Math.PI / n;
    mid.push([Math.cos(a) * 0.77, 0.46, Math.sin(a) * 0.77]);         // полка пологая (снег), бахрома под ней крутая (зелёная и зимой)
    const rr = i % 2 ? 0.84 : 0.97;                                  // край рваный: лапы через одну короче
    bot.push([Math.cos(b) * rr, i % 2 ? 0.12 : 0, Math.sin(b) * rr]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(...top, ...mid[j], ...mid[i]);                          // обход — наружу (как у ConeGeometry three.js: против часовой снаружи)
    out.push(...mid[i], ...mid[j], ...bot[i]);
    out.push(...mid[j], ...bot[j], ...bot[i]);
  }
  SKIRT = new Float32Array(out);
  return SKIRT;
}

/* крона-«яйцо»: center cy (м над землёй), полуоси rx (вширь), ry (ввысь); комки по поверхности спиралью, часть мест
   пустые (рваный силуэт), внутри — тёмная сердцевина. c — что дал trees.js (P, T, r, x, y, z, lean) */
function egg (c, o) {
  const { P, T, r, x, y, z } = c, [dark, light] = o.col, zmin = o.zmin ?? -0.5;
  const at = (px, py, pz) => [x + px + c.lx * py, y + py, z + pz + c.lz * py];
  const [ncx, ncy, ncz] = at(0, o.cy, 0), NC = { cx: ncx, cy: ncy, cz: ncz, w: WOOD.SOFT.leaf };   // мягкая нормаль: от центра кроны
  // сердцевина: 1—2 больших тёмных комка — без просветов насквозь
  const nc = o.ry > o.rx * 1.6 && !o.one ? 2 : 1;
  for (let i = 0; i < nc; i++) {
    const py = o.cy + (nc > 1 ? (i ? 0.35 : -0.3) * o.ry : 0), [px, qy, pz] = at(0, py, 0), k = o.rx * 0.78;
    P.add(lumpTpl(T, i), px, qy, pz, k, (nc > 1 ? o.ry * 0.5 : o.ry * 0.8), k, 0, r() * 6.283, 0, mixHex(dark, light, 0.12), o.kind, r(), o.pal, 0.5, null, 1, NC);
  }
  const N = Math.round(o.n / ((1 - zmin) / 2)) + 1, rot = r() * 6.283;
  let made = 0;
  for (let i = 0; i < N; i++) {
    const zz = 1 - 2 * (i + 0.5) / N;
    if (zz < zmin) continue;
    if (made > 2 && r() < (o.skip ?? 0.12)) continue;                 // пустое место — силуэт рваный
    made++;
    const rr = Math.sqrt(1 - zz * zz), a = i * GA + rot, f = 0.66 + r() * 0.24;
    const lx = Math.cos(a) * rr * o.rx * f, lz = Math.sin(a) * rr * o.rx * f, ly = o.cy + zz * o.ry * f;
    const sz = o.rx * (o.lump[0] + r() * (o.lump[1] - o.lump[0])) * (1 - 0.22 * Math.max(0, zz));
    // тон: выше и к солнцу (+z) — светлее; низ и тень — темнее, у каждого комка свой сдвиг
    const t = 0.34 + 0.36 * zz + 0.26 * (lz / o.rx) + (r() - 0.5) * 0.2;
    const [px, qy, pz] = at(lx, ly, lz);
    P.add(lumpTpl(T, i + 1), px, qy, pz, sz, sz * (o.flat ?? 1), sz, 0, r() * 6.283, 0, mixHex(dark, light, t), o.kind, r(), o.pal, 0.5, null, 1, NC);
  }
  // плакучие пряди (берёза): длинные светлые комки свисают с нижнего края кроны
  for (let i = 0; i < (o.droop || 0); i++) {
    const a = rot + i * (6.283 / o.droop) + r() * 0.5, zz = -0.25 - r() * 0.35, rr = Math.sqrt(1 - zz * zz) * 0.92;
    const lx = Math.cos(a) * rr * o.rx, lz = Math.sin(a) * rr * o.rx, ly = o.cy + zz * o.ry - o.ry * 0.12;
    const sz = o.rx * (0.3 + r() * 0.08);
    const [px, qy, pz] = at(lx, ly, lz);
    P.add(lumpTpl(T, i + 2), px, qy, pz, sz, sz * 1.8, sz, 0, r() * 6.283, 0, mixHex(dark, light, 0.5 + 0.25 * lz / o.rx + (r() - 0.5) * 0.2), o.kind, r(), o.pal, 0.35, null, 1, NC);
  }
}

/* высота дерева (м) и высокое ли — хешем места (жребий r не тянем) */
function height (c, kind) {
  const H = WOOD.H[kind], big = c.hz(71) < H[4], u = c.hz(72);
  return { big, h: big ? H[2] + u * (H[3] - H[2]) : H[0] + u * (H[1] - H[0]) };
}

/* дерево новой формы; false — порода не наша (trees.js рисует по-старому).
   c: P, T, r, x, y, z, yaw, hz(k) — хеш места, lx / lz — наклон (м на метр высоты), WM — зимняя модель есть,
   wt(name, sx, sy, sz) — зимняя модель (ствол и сучья), stick(x0,y0,z0,x1,y1,z1,w,hex) — палка, leaves(hexes, n, rad) */
export function grow2 (kind, c) {
  const { P, T, r, x, y, z } = c;
  if (kind === 'birch') {
    const { big, h } = height(c, 'birch'), sy = h / 8.9, sx = (big ? 1.12 : 0.95) + r() * 0.25;
    if (c.WM) {
      c.wt(r() < 0.5 ? 'birchA' : 'birchB', sx, sy, sx);
      // чёрные чёрточки на белом стволе — по радиусу ствола модели (0,2 у земли → 0,13 на 3,6 м → 0,06 у макушки), ниже кроны
      const nm = 4, top = 5.7 * sy - 2.4 * sy;
      for (let i = 0; i < nm; i++) {
        const hy = 0.9 + i * (top - 0.9) / nm + r() * 0.4, hm = hy / sy, a = c.yaw + i * 2.3 + r();
        const rr = (hm < 3.6 ? 0.2 - 0.07 * hm / 3.6 : Math.max(0.06, 0.13 - 0.07 * (hm - 3.6) / 5)) * sx, w = rr * 1.5, off = rr * 0.25;
        P.add(T.stick, x + Math.cos(a) * off + c.lx * hy, y + hy, z - Math.sin(a) * off + c.lz * hy, w, 0.07 + r() * 0.1, w, 0, a, 0, '#26252a');
      }
    } else c.stick(0, 0, 0, 0, h * 0.8, 0, 0.3, '#ece8de');
    egg(c, { cy: 5.7 * sy, rx: 1.95 * sx * 1.12, ry: 3.2 * sy, n: WOOD.N.birch[big ? 1 : 0], lump: [0.42, 0.56], flat: 1.1, zmin: -0.5,
      col: WOOD.COL.birch, kind: 1, pal: 0, droop: big ? 3 : 0, skip: 0.14, one: 1 });
    c.leaves(['#e8b830', '#f0c848', '#d8a028'], 4, 2.6 * sx);
    return { h, rx: 1.95 * sx };
  }
  if (kind === 'maple' || kind === 'lime') {
    const lime = kind === 'lime', { big, h } = height(c, kind);
    const sy = h / (lime ? 7.8 : 6.8), sx = (lime ? 1.0 : 1.12) + r() * 0.28;
    const pal = lime ? (r() < 0.75 ? 0 : 1) : (r() < 0.55 ? 2 : 1);
    if (c.WM) c.wt(kind, sx, sy, sx); else c.stick(0, 0, 0, 0, h * 0.55, 0, 0.5, '#6e5440');
    egg(c, lime ? { cy: 5.3 * sy, rx: 2.6 * sx, ry: 2.5 * sy * 1.04, n: WOOD.N.lime[big ? 1 : 0], lump: [0.38, 0.52], flat: 1.0, zmin: -0.45,
      col: WOOD.COL.lime, kind: 1, pal } : { cy: 4.7 * sy, rx: 3.0 * sx, ry: 2.1 * sy * 1.06, n: WOOD.N.maple[big ? 1 : 0], lump: [0.34, 0.48],
      flat: 0.85, zmin: -0.4, col: WOOD.COL.maple, kind: 1, pal });
    c.leaves(pal === 0 ? ['#e8b830', '#f0c848', '#d8a028'] : pal === 1 ? ['#e8902a', '#d86a22', '#f0a838'] : ['#c84a24', '#d86a22', '#b83a22'], 6, 3.4 * sx);
    return { h, rx: (lime ? 2.6 : 3.0) * sx };
  }
  if (kind === 'poplar') {
    const { big, h } = height(c, 'poplar'), sy = h / 11.8, sx = 0.95 + r() * 0.25;
    if (c.WM) c.wt('poplar', sx, sy, sx); else c.stick(0, 0, 0, 0, h * 0.7, 0, 0.5, '#6a5a48');
    egg(c, { cy: 6.6 * sy, rx: 1.5 * sx * 1.12, ry: 5.2 * sy, n: WOOD.N.poplar[big ? 1 : 0], lump: [0.56, 0.72], flat: 1.35, zmin: -0.8,
      col: WOOD.COL.poplar, kind: 1, pal: 3, skip: 0.1 });
    c.leaves(['#c8b840', '#e0c040'], 3, 2.2);
    return { h, rx: 1.5 * sx };
  }
  if (kind === 'pine') {
    // сосна: рыжий ствол голый на две трети, крона «зонтиком» — плоские лапы ярусами, ниже — сухие сучки
    const { big, h } = height(c, 'pine'), [dark, light] = WOOD.COL.pine, [b0, b1] = WOOD.BARK.pine;
    const w = (big ? 0.62 : 0.5) * (0.9 + r() * 0.2);
    c.stick(0, -0.2, 0, 0, h * 0.5, 0, w, b0);                                  // комель — темнее
    c.stick(0, h * 0.48, 0, 0, h * 0.97, 0, w * 0.6, b1);                       // выше — рыжий
    for (let i = 0; i < 2; i++) {                                               // сухие сучки
      const a = r() * 6.283, hy = h * (0.3 + r() * 0.22), L = 0.9 + r() * 0.8;
      c.stick(0, hy, 0, Math.cos(a) * L, hy - 0.25, Math.sin(a) * L, 0.09, '#5a4434');
    }
    const nT = big ? 5 : 4, h0 = h * (big ? 0.6 : 0.56), rot = r() * 6.283;
    const NP = { cx: x + c.lx * h * 0.8, cy: y + h * 0.8, cz: z + c.lz * h * 0.8, w: WOOD.SOFT.pine };
    for (let i = 0; i < nT; i++) {
      const t = i / (nT - 1), hy = h0 + (h * 0.94 - h0) * t, a = rot + i * GA + (r() - 0.5) * 0.6;
      const d = (big ? 1.9 : 1.5) * (1 - 0.55 * t) * (0.75 + r() * 0.5), R = (big ? 2.3 : 1.9) * (1 - 0.45 * t) * (0.85 + r() * 0.3);
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      if (i < nT - 1) c.stick(0, hy - 0.6, 0, px, hy - 0.1, pz, 0.14, b1);          // сук к лапе
      const tt = 0.3 + 0.45 * t + 0.25 * (pz / 2.2) + (r() - 0.5) * 0.15;
      const X = x + px + c.lx * hy, Z = z + pz + c.lz * hy;
      P.add(lumpTpl(T, i), X, y + hy, Z, R, R * (0.5 + r() * 0.15), R * 0.85, (r() - 0.5) * 0.4, r() * 6.283, 0, mixHex(dark, light, tt), 0, 0, 2, 0.6, null, 1, NP);
      const R2 = R * 0.6, a2 = a + 1.4, X2 = X + Math.cos(a2) * R * 0.7, Z2 = Z + Math.sin(a2) * R * 0.7;   // вторая лапа рядом — край рваный
      P.add(T.oct, X2, y + hy - 0.15, Z2, R2, R2 * 0.5, R2, 0, r() * 6.283, 0, mixHex(dark, light, tt - 0.12), 0, 0, 2, 0.5, null, 1, NP);
      // снежная шапка на лапе: вид 8 — видна, когда снега больше зерна (тяжёлая — с середины зимы)
      P.add(T.oct, X, y + hy + R * 0.3, Z, R * 0.88, R * 0.22, R * 0.88, 0, r() * 6.283, 0, WOOD.SNOW, 8, 0.12 + r() * 0.35);
    }
    return { h, rx: 2.2 };
  }
  if (kind === 'spruce') {
    // ель: ярусы «полка + бахрома» почти от земли, макушка острая
    const { big, h } = height(c, 'spruce'), [dark, light] = WOOD.COL.spruce, S = skirtTpl();
    c.stick(0, -0.2, 0, 0, 1.4, 0, 0.42, WOOD.BARK.spruce);
    const NS = { cx: x + c.lx * h * 0.45, cy: y + h * 0.45, cz: z + c.lz * h * 0.45, w: WOOD.SOFT.spruce };
    const nT = big ? 6 : 5, h0 = 0.7 + r() * 0.5, Rb = h * (0.2 + r() * 0.05), rot = r() * 6.283;
    for (let i = 0; i < nT; i++) {
      const t = i / nT, base = h0 + (h - h0) * t * 0.93, hT = (h - h0) / nT * (i === nT - 1 ? 2.0 : 1.75);
      const R = Rb * Math.pow(1 - t, 0.85) + 0.35;
      const tt = 0.25 + 0.5 * t + (r() - 0.5) * 0.15;
      P.add(S, x + c.lx * base, y + base, z + c.lz * base, R, hT, R, 0, rot + i * 0.6, 0, mixHex(dark, light, tt), 0, 0, 2, 0.45, null, 1, NS);
    }
    return { h, rx: Rb, h0 };
  }
  return false;
}
