/* ──────────────────────────────────────────────────────────────────────────
   Двор не плоский и не пустой (автор 18.10.2026: «во дворах всё ещё очень гладко и пусто. Нужны клумбы…»).
   Правила словами — docs/CAREER.md «Город: как выглядит» → «Двор не плоский».

   1. У подъездов многоэтажек — по обе стороны от тропинки двери, на газоне между дорожкой вдоль стены и общей
      дорожкой (2,75—6,1 м от стены; от оси тропинки — дальше её заборчика, от 3,4 м), кусок до LEN м вдоль дома,
      пока не упрётся в дорожку, чужую дверь, куст, лавочку, карман парковки, вещь лабиринта:
        • палисадник (PAL) — низкий заборчик вокруг (сбиваемый, как у тропинок), внутри вскопанная земля,
          два ряда цветов, иногда куст сирени или шиповника (твёрдый);
        • клумба-грядка (RBED) — бетонный или белёный бортик 0,32 м, земля, цветы; твёрдая, как большая клумба;
        • клумба из покрышек (TIRE) — кольцо крашеных покрышек, внутри цветы; твёрдая.
      Дверь, тропинка, заборчики, лавочка и место клиента — не тронуты.
   2. Приствольные круги (RING): у деревьев во дворах (не в лесочках, не на мощёном) — круг вскопанной земли
      0,95 м с низким бетонным бортиком (телефон — без бортика).
   3. Холмики (HILL): на больших газонах дворов — пологие горки травы 3,5—5,5 м, 0,3—0,5 м высотой; машина
      въезжает на них (lift: кузов поднимается и наклоняется, не стена).
   Всё — в статике (LIT, LITM) и сбиваемой мелочи (smashAdd): новых вызовов отрисовки нет. В сетку лабиринта
   (yardmaze.js addObj) — мелочь, ельник, сцены жизни дворов и трамплины их обходят.

     DECOR.build(api)     — LATE-шаг (game.js, после бордюров, до сугробов и smashBuild); шагами
     DECOR.lift(x, z)     — высота холмика над землёй в точке, м (0 — нет)
   ?nodecor — без всего этого (сравнить).
   ────────────────────────────────────────────────────────────────────────── */

export const DECOR = {
  ZONE: 60,                    // дворы: подъезд ближе, м (как бордюры)
  STRIP: [2.2, 7.4, 2.2, 3.6], // полоса у стены: ищем газон от стены от — до, м (дорожка вдоль стены — до 2,35, общая — от 6,6); ширина от — до
  U0: 3.4,                     // от оси тропинки двери, м (её заборчик — в 2,9)
  LEN: [2.6, 9],               // кусок вдоль дома, м
  W: { pal: 0.5, rbed: 0.3, tire: 0.12 },   // доли (остальное — пусто)
  MOB_SIDE: 0.6,               // телефон: вещь — только у такой доли сторон подъездов, цветы — одним рядом (память: пик следа)
  MOB_PAL: 0.4,                // телефон: палисадник — у такой доли (остальные — грядка): сбиваемое держит вершины в памяти
  FENCE_H: 0.55, SEC: 2.5,
  FENCE_HEX: ['#5aa860', '#6a9ad8', '#ece6da', '#c45a48', '#e0943e'],   // светлые — сбиваемое (как yards.js)
  RING: { R: 0.95, H: 0.12, W: 0.1, GAP: 2.2 },
  HILL: { STEP: 30, SHARE: 0.32, MOB: 0.16, R: [3.5, 5.5], H: [0.3, 0.5], SEG: 10 },
};
export const ST = { ms: 0, pal: 0, rbed: 0, tire: 0, flowers: 0, lilac: 0, palFence: 0, rings: 0, hills: 0, tried: 0, mob: 0, rej: {}, first: {} };

let A = null, MOB = false, OFF = new Set();
const FLOWER = ['#d9342c', '#f2c12e', '#9a5fc0', '#ef7d2a', '#f4f1ea', '#e0568f'];
const SOIL = '#6a523d', SOIL2 = '#5e4835';
function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x3c6ef372, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng (x, z, k) {
  let a = (hsh(x, z, k) * 4294967296) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
const gk = (i, j) => (i + 8192) * 16384 + j + 8192;
function idx (G, C, x0, z0, x1, z1, v) {
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      const k = gk(i, j);
      let a = G.get(k);
      if (!a) G.set(k, a = []);
      a.push(v);
    }
}
function near (G, C, x, z, r, fn) {
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
    for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
      const a = G.get(gk(i, j));
      if (a) for (let k = 0; k < a.length; k++) if (fn(a[k])) return true;
    }
  return false;
}

/* ── сетки на время сборки ── */
let SG = null, SMG = null, ENTG = null, ZN = null, AREAG = null, GREENG = null, OWN = null;
/* solidNear / smashNear — тем же обходом, что near(), но без замыкания на каждый вопрос: их зовут сотни тысяч раз,
   замыкания и числа в них — ~0,2 ГБ мусора за сборку города (сборщик на Деке) */
function solidNear (x, z, r) {
  const R = r + 12, C = 30;
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++)
    for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      const a = SG.get(gk(i, j));
      if (a) for (let k = 0; k < a.length; k++) {
        const s = a[k];
        if (s.deckY !== undefined) continue;
        const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs;
        if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true;
      }
    }
  return false;
}
/* сбиваемое ближе r: у заборчиков (есть ax…bz) — до самого отрезка, у остального — до круга */
function smashNear (x, z, r) {
  const R = r + 2, C = 20;
  for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++)
    for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      const a = SMG.get(gk(i, j));
      if (a) for (let k = 0; k < a.length; k++) {
        const it = a[k];
        if (!it.down && (it.ax !== undefined ? segD(x, z, it.ax, it.az, it.bx, it.bz) < r + 0.1 : Math.hypot(it.x - x, it.z - z) < r + Math.min(it.r || 1, 1.0))) return true;
      }
    }
  return false;
}
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const inZone = (x, z) => ZN.has(gk(Math.floor(x / 20), Math.floor(z / 20)));
const ownNear = (x, z, r) => near(OWN, 16, x, z, r + 6, o => Math.hypot(o.x - x, o.z - z) < r + o.r);
function inArea (x, z, m) {
  return near(AREAG, 40, x, z, 0, b => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m && A.inPoly(x, z, b.p));
}
/* цвет травы в точке: зелёный кусок карты (парк, газон) — его цвет; площадка, поле, лес, вода — null (холмик не ставим) */
function lawnHex (x, z) {
  let hex = null, top = -1;
  const a = GREENG.get(gk(Math.floor(x / 40), Math.floor(z / 40)));
  if (a) for (const g of a) {
    if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1 || !A.inPoly(x, z, g.p)) continue;
    if (!g.hex) return null;
    if (g.y > top) { top = g.y; hex = g.hex; }
  }
  return hex || A.groundHex(A.groundH(x, z));
}
function resDoor (e) {
  const ix = e[0] - e[2] * 0.6, iz = e[1] - e[3] * 0.6;
  for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) {
    if (!A.inPoly(ix, iz, b.p)) continue;
    if ((b.k && b.k !== 'res') || b.st === 'villa' || b.st === 'priv') return false;
    return (b.lvY !== undefined ? b.lvY : b.lv || 1) >= 3;
  }
  return false;
}
/* точка — в зоне чужой двери (тропинка с заборчиками: ±3,3 м от оси, до 8 м от стены) */
function doorZone (x, z, own) {
  return near(ENTG, 20, x, z, 9, e => {
    if (e === own) return false;
    const dx = x - e[0], dz = z - e[1], n = dx * e[2] + dz * e[3], u = -dx * e[3] + dz * e[2];
    return n > -0.6 && n < 8.2 && Math.abs(u) < 3.3;
  });
}
/* можно ли здесь вещь у стены (точка полосы) */
const rej = k => { ST.rej[k] = (ST.rej[k] || 0) + 1; return false; };
function stripOk (x, z, e) {
  if (A.groundH(x, z) < 0.3) return rej('вода');
  if (A.inHouse(x, z, 0.4)) return rej('дом');
  if (A.onPave(x, z, 0.15)) return rej('мощёное');
  if (A.curbNear && A.curbNear(x, z, 0.25)) return rej('бордюр');
  if (A.yardBlocks(x, z, 0.45)) return rej('заборчик');
  if (A.mazeBlocks(x, z, 0.6)) return rej('лабиринт');
  if (A.ycBlocks(x, z, 1.2)) return rej('карман');
  if (solidNear(x, z, 0.55)) return rej('твёрдое');
  if (smashNear(x, z, 0.5)) return rej('мелочь');
  if ((A.pzBlocks && A.pzBlocks(x, z, 2)) || (A.rivBlocks && A.rivBlocks(x, z, 2))) return rej('пицц');
  if (doorZone(x, z, e)) return rej('дверь');
  if (inArea(x, z, 0.5)) return rej('площадка');
  return true;
}

/* ═════ 1. у подъездов: палисадник, грядка, покрышки ═════ */
function* doors () {
  const D = DECOR, [S0, S1, SW0, SW1] = D.STRIP;
  let ne = 0;
  for (const e of RES) {
    if (++ne % 12 === 0) yield 'у подъездов';
    const [ex, ez, nx, nz] = e, tx = -nz, tz = nx;
    for (const s of [-1, 1]) {
      const at = (u, n) => [ex + tx * u * s + nx * n, ez + tz * u * s + nz * n];
      // газон между дорожкой вдоль стены и общей дорожкой: самый длинный свободный кусок поперёк
      let b0 = null, best = null;
      for (let n = S0; n <= S1 + 1e-6; n += 0.2) {
        const [x, z] = at(D.U0 + 0.6, n), free = !A.onPave(x, z, 0.12) && !A.inHouse(x, z, 0.4);
        if (free && b0 === null) b0 = n;
        if ((!free || n + 0.2 > S1 + 1e-6) && b0 !== null) { const b1 = free ? n : n - 0.2; if (!best || b1 - b0 > best[1] - best[0]) best = [b0, b1]; b0 = null; }
      }
      ST.tried++;
      if (!best || best[1] - best[0] - 0.1 < SW0) { ST.first.narrow = (ST.first.narrow || 0) + 1; continue; }
      const N0 = best[0] + 0.05, N1 = Math.min(best[1] - 0.05, N0 + SW1);
      at.N0 = N0; at.N1 = N1;
      const slice = u => { for (let n = N0; n <= N1 + 1e-6; n += (N1 - N0) / 4) { const [x, z] = at(u, n); if (!stripOk(x, z, e)) return false; } return true; };
      const r0 = { ...ST.rej };
      if (!slice(D.U0)) { for (const k in ST.rej) if (ST.rej[k] !== r0[k]) ST.first[k] = (ST.first[k] || 0) + 1; continue; }
      let len = 0;
      for (let L = 0.5; L <= D.LEN[1] + 1e-6; L += 0.5) { if (!slice(D.U0 + L)) break; len = L; }
      if (len < D.LEN[0]) continue;
      const r = rng(ex + s, ez, 41), w = r();
      if (MOB && r() > D.MOB_SIDE) continue;
      let kind = w < D.W.pal ? 'pal' : w < D.W.pal + D.W.rbed ? 'rbed' : w < D.W.pal + D.W.rbed + D.W.tire ? 'tire' : '';
      if (kind === 'pal' && (len < 3 || (MOB && r() > D.MOB_PAL))) kind = 'rbed';
      if (kind === 'pal') palisade(at, len, r, e);
      else if (kind === 'rbed') rbed(at, len, r, s, e);
      else if (kind === 'tire') tireBed(at, len, r);
    }
  }
}
/* палисадник: заборчик вокруг (сбиваемый), вскопанная земля, цветы, иногда куст */
function palisade (at, len, r, e) {
  const D = DECOR, N0 = at.N0, N1 = at.N1, u0 = D.U0, u1 = D.U0 + len;
  const hex = D.FENCE_HEX[Math.floor(hsh(e[0], e[1], 43) * D.FENCE_HEX.length)];   // у подъезда — свой цвет
  const corners = [at(u0, N0), at(u1, N0), at(u1, N1), at(u0, N1)];
  for (let k = 0; k < 4; k++) fenceSide(corners[k], corners[(k + 1) % 4], hex);
  // земля
  const m = 0.18, q = [at(u0 + m, N0 + m), at(u1 - m, N0 + m), at(u1 - m, N1 - m), at(u0 + m, N1 - m)];
  A.LITM.color(r() < 0.5 ? SOIL : SOIL2);
  A.LITM.dtri(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], 0.055);
  A.LITM.dtri(q[0][0], q[0][1], q[2][0], q[2][1], q[3][0], q[3][1], 0.055);
  // цветы — два ряда вдоль дома; куст — посередине (сирень или шиповник, твёрдый)
  const main = FLOWER[Math.floor(r() * FLOWER.length)], alt = FLOWER[Math.floor(r() * FLOWER.length)];
  const lilac = len >= 4 && r() < 0.6, lu = u0 + len * (0.3 + r() * 0.4);
  for (const n of MOB ? [(N0 + N1) / 2 - 0.3] : [N0 + 0.7, N1 - 0.7]) {
    for (let u = u0 + 0.55; u < u1 - 0.4; u += MOB ? 1.05 : 0.7) {
      if (lilac && Math.abs(u - lu) < 1.1 && Math.abs(n - (N0 + N1) / 2) < 1.3) continue;
      const [x, z] = at(u + (r() - 0.5) * 0.15, n + (r() - 0.5) * 0.2), gy = A.groundH(x, z);
      const tall = 0.24 + r() * 0.14;
      A.box(A.LIT, 0.32, tall, 0.32, r() < 0.25 ? '#4f8f3f' : n < (N0 + N1) / 2 ? main : alt, x, gy + tall / 2 + 0.03, z, r() * 3);
      ST.flowers++;
    }
  }
  if (lilac) { const [x, z] = at(lu, (N0 + N1) / 2); if (A.tree(x, z, 0, r() < 0.6 ? 'lilac' : 'rosehip')) ST.lilac++; }
  const [cx, cz] = at((u0 + u1) / 2, (N0 + N1) / 2);
  addOwn({ x: cx, z: cz, r: Math.hypot(len, N1 - N0) / 2, solid: 0, kind: 'pal' });
  ST.pal++;
}
/* сторона заборчика: секции по SEC м — каждая сбивается сама (круг r, как у дворовых заборчиков); секция — одна геометрия
   из трёх коробок по 8 вершин (две перекладины и столбик в начале; у последней — и в конце): сбиваемое держит вершины
   в памяти до конца игры — у четырёх коробок BoxGeometry было 96 вершин и 4 объекта на секцию */
function fenceSide (a, b, hex) {
  const D = DECOR, L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / D.SEC)), sl = L / n;
  const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L, c = new A.THREE.Color(hex);
  for (let k = 0; k < n; k++) {
    const x0 = a[0] + ex * k * sl, z0 = a[1] + ez * k * sl, x1 = x0 + ex * sl, z1 = z0 + ez * sl, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g0 = A.groundH(x0, z0), g1 = A.groundH(x1, z1), nb = k === n - 1 ? 4 : 3;
    const P = new Float32Array(nb * 24), I = new Uint16Array(nb * 36);
    let v = 0;
    const bx = (ax, ay, az, bx2, by, bz2, w, h) => {      // коробка вдоль a→b, ширина w, высота h (низ — ay/by)
      const dx = bx2 - ax, dz = bz2 - az, l = Math.hypot(dx, dz) || 1, px = -dz / l * w / 2, pz = dx / l * w / 2, o = v;
      const pts = [[ax + px, ay, az + pz], [ax - px, ay, az - pz], [bx2 - px, by, bz2 - pz], [bx2 + px, by, bz2 + pz]];
      for (const q of pts) { P.set(q, v * 3); v++; }
      for (const q of pts) { P.set([q[0], q[1] + h, q[2]], v * 3); v++; }
      const F = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
      const i0 = (o / 8) * 36;
      for (let i = 0; i < 36; i++) I[i0 + i] = F[i] + o;
    };
    const H = D.FENCE_H;
    bx(x0, g0 + H - 0.08, z0, x1, g1 + H - 0.08, z1, 0.05, 0.06);           // верхняя перекладина
    bx(x0, g0 + H * 0.45 - 0.03, z0, x1, g1 + H * 0.45 - 0.03, z1, 0.05, 0.06);
    bx(x0 - ex * 0.035, g0 - 0.02, z0 - ez * 0.035, x0 + ex * 0.035, g0 - 0.02, z0 + ez * 0.035, 0.07, H + 0.02);   // столбик
    if (nb === 4) bx(x1 - ex * 0.035, g1 - 0.02, z1 - ez * 0.035, x1 + ex * 0.035, g1 - 0.02, z1 + ez * 0.035, 0.07, H + 0.02);
    const C = new Float32Array(nb * 24);
    for (let i = 0; i < C.length; i += 3) { C[i] = c.r; C[i + 1] = c.g; C[i + 2] = c.b; }
    const g = new A.THREE.BufferGeometry();
    g.setAttribute('position', new A.THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new A.THREE.BufferAttribute(C, 3));
    g.setIndex(new A.THREE.BufferAttribute(I, 1));
    A.smashAdd('fence', cx, cz, Math.min(1.3, sl / 2), [g], hex);
    ST.palFence++;
  }
}
/* грядка: бортик (бетон или белёный), земля, цветы; твёрдая */
function rbed (at, len, r, s, e) {
  const D = DECOR, N0 = at.N0, N1 = at.N1;
  const L = Math.min(len - 0.5, 2.4 + r() * 2.2), W = Math.min(N1 - N0 - 0.4, 1.25 + r() * 0.3), um = D.U0 + 0.3 + L / 2, nm = (N0 + N1) / 2;
  const [cx, cz] = at(um, nm), [ax, az] = at(um + 1, nm);
  const ux = ax - cx, uz = az - cz, ry = Math.atan2(-uz, ux), vx = -uz, vz = ux;
  const gy = A.groundH(cx, cz), white = r() < 0.55, bh = white ? '#ece8df' : '#a9a69e';
  const H = 0.32, T = 0.16;
  A.box(A.LIT, L, H, T, bh, cx + vx * (W / 2 - T / 2), gy + H / 2 - 0.04, cz + vz * (W / 2 - T / 2), ry);
  A.box(A.LIT, L, H, T, bh, cx - vx * (W / 2 - T / 2), gy + H / 2 - 0.04, cz - vz * (W / 2 - T / 2), ry);
  A.box(A.LIT, T, H, W - 2 * T, bh, cx + ux * (L / 2 - T / 2), gy + H / 2 - 0.04, cz + uz * (L / 2 - T / 2), ry);
  A.box(A.LIT, T, H, W - 2 * T, bh, cx - ux * (L / 2 - T / 2), gy + H / 2 - 0.04, cz - uz * (L / 2 - T / 2), ry);
  A.box(A.LIT, L - 2 * T, 0.2, W - 2 * T, SOIL, cx, gy + 0.14, cz, ry);         // земля почти вровень с бортиком
  const main = FLOWER[Math.floor(r() * FLOWER.length)], alt = FLOWER[Math.floor(r() * FLOWER.length)];
  const nu = Math.max(2, Math.floor((L - 0.4) / 0.55));
  for (let i = 0; i < nu; i++) for (const o of MOB ? [0] : [-0.28, 0.28]) {
    const t = (i + 0.5) / nu - 0.5, x = cx + ux * t * (L - 0.4) + vx * o, z = cz + uz * t * (L - 0.4) + vz * o, tall = 0.22 + r() * 0.12;
    A.box(A.LIT, 0.3, tall, 0.3, r() < 0.2 ? '#4f8f3f' : o < 0 ? main : alt, x, gy + 0.24 + tall / 2, z, r() * 3);
    ST.flowers++;
  }
  const so = A.obb(cx, cz, L / 2 + 0.05, W / 2 + 0.05, Math.atan2(uz, ux)); so.mat = 'wall'; so.maze = 1;
  // в сетку лабиринта — отрезком по длине грядки (не кругом: круг по диагонали задевал проход рядом)
  addOwn({ x: cx, z: cz, r: Math.hypot(L, W) / 2, solid: 1, kind: 'rbed', seg: 1, ax: cx - ux * L / 2, az: cz - uz * L / 2, bx: cx + ux * L / 2, bz: cz + uz * L / 2, th: W / 2 + 0.05 });
  ST.rbed++;
}
/* клумба из покрышек: кольцо крашеных покрышек стоймя, внутри земля и цветы; твёрдая */
let TIRE_G = null;
function tireBed (at, len, r) {
  const D = DECOR, N0 = at.N0, N1 = at.N1, R = Math.min((N1 - N0) / 2 - 0.25, 1.0 + r() * 0.25), [cx, cz] = at(D.U0 + Math.min(len, 3.2) / 2 + 0.2, (N0 + N1) / 2);
  if (!TIRE_G) TIRE_G = new A.THREE.CylinderGeometry(0.34, 0.34, 0.24, 6);
  const gy = A.groundH(cx, cz), hex = ['#f4f1ea', '#d9342c', '#f2c12e', '#4f6fa8', '#3f7a4a'][Math.floor(r() * 5)];
  const n = Math.max(8, Math.round(2 * Math.PI * R / 0.72));
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
    const g = new A.THREE.BufferGeometry();
    g.setAttribute('position', TIRE_G.attributes.position.clone());
    if (TIRE_G.index) g.setIndex(TIRE_G.index.clone());
    A.put(A.LIT, g, k % 2 ? hex : '#2c2c2e', px, gy + 0.3, pz, Math.PI / 2, -a + Math.PI, 0);
  }
  A.LITM.color(SOIL).disc(cx, cz, R - 0.15, 0.09, 8);
  const main = FLOWER[Math.floor(r() * FLOWER.length)];
  for (let k = 0; k < 6; k++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * (R - 0.45), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, tall = 0.24 + r() * 0.12;
    A.box(A.LIT, 0.3, tall, 0.3, k % 3 === 2 ? '#4f8f3f' : main, x, gy + 0.1 + tall / 2, z, a);
    ST.flowers++;
  }
  for (let k = 0; k < 2; k++) { const so = A.obb(cx, cz, R + 0.3, (R + 0.3) * 0.6, k * Math.PI / 2); so.mat = 'wall'; so.maze = 1; }
  addOwn({ x: cx, z: cz, r: R + 0.35, solid: 1, kind: 'tire' });
  ST.tire++;
}
function addOwn (o) {
  idx(OWN, 16, o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r, o);
  if (A.mazeAdd) A.mazeAdd(o);
}

/* ═════ 2. приствольные круги ═════ */
function* rings () {
  const R = DECOR.RING, grove = new Set();
  for (const o of A.groves()) for (const p of o.tr || []) grove.add(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2));
  const done = new Map();
  let n = 0;
  for (const s of A.SOLIDS) {
    if (!s.tree || s.edGone || s.noRing) continue;   // noRing — живая изгородь (trees.js)
    const x = s.cx, z = s.cz;
    if (!inZone(x, z) || grove.has(Math.round(x * 2) + ',' + Math.round(z * 2))) continue;
    if (++n % 300 === 0) yield 'круги';
    if (A.groundH(x, z) < 0.3 || A.inHouse(x, z, 1.2) || A.onPave(x, z, R.R + 0.1)) continue;
    if (A.curbNear && A.curbNear(x, z, R.R + 0.2)) continue;
    if (near(done, 8, x, z, R.GAP, p => Math.hypot(p[0] - x, p[1] - z) < R.GAP)) continue;
    idx(done, 8, x, z, x, z, [x, z]);
    A.LITM.color(SOIL).disc(x, z, R.R, 0.05, 8);
    if (!MOB) ring(x, z);
    ST.rings++;
  }
}
/* низкий бортик вокруг круга: 8 кусков (грань внутрь, верх, грань наружу) одного цвета — вершины общие */
function ring (x, z) {
  const R = DECOR.RING, M = A.LITM, n = 8, r0 = R.R, r1 = R.R + R.W;
  M.color('#b3b0a8');
  const P = [];
  for (let k = 0; k <= n; k++) {
    const a = (k % n) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const ix = x + c * r0, iz = z + s * r0, ox = x + c * r1, oz = z + s * r1;
    const gi = A.groundH(ix, iz), go = A.groundH(ox, oz), top = Math.max(gi, go) + 0.05 + R.H;
    P.push([ix, iz, gi + 0.02, ox, oz, go - 0.02, top]);
  }
  for (let k = 0; k < n; k++) {
    const p = P[k], q = P[k + 1];
    M.quad(p[0], p[2], p[1], q[0], q[2], q[1], q[0], q[6], q[1], p[0], p[6], p[1]);
    M.quad(p[0], p[6], p[1], q[0], q[6], q[1], q[3], q[6], q[4], p[3], p[6], p[4]);
    M.quad(p[3], p[6], p[4], q[3], q[6], q[4], q[3], q[5], q[4], p[3], p[5], p[4]);
  }
}

/* ═════ 3. холмики на больших газонах ═════ */
const HILLS = [], HG = new Map();
function* hills () {
  const H = DECOR.HILL, share = MOB ? H.MOB : H.SHARE;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const e of RES) { x0 = Math.min(x0, e[0]); x1 = Math.max(x1, e[0]); z0 = Math.min(z0, e[1]); z1 = Math.max(z1, e[1]); }
  let n = 0;
  for (let gx = Math.floor((x0 - 60) / H.STEP) * H.STEP; gx <= x1 + 60; gx += H.STEP) {
    for (let gz = Math.floor((z0 - 60) / H.STEP) * H.STEP; gz <= z1 + 60; gz += H.STEP) {
      if (hsh(gx, gz, 51) >= share || !inZone(gx, gz)) continue;
      if (++n % 8 === 0) yield 'холмики';
      const r = rng(gx, gz, 52);
      for (let t = 0; t < 3; t++) {
        const x = gx + (r() - 0.5) * H.STEP * 0.7, z = gz + (r() - 0.5) * H.STEP * 0.7;
        const R = H.R[0] + r() * (H.R[1] - H.R[0]), h = H.H[0] + r() * (H.H[1] - H.H[0]);
        if (hillOk(x, z, R)) { hill(x, z, R, h); break; }
      }
    }
  }
}
function hillOk (x, z, R) {
  if (A.groundH(x, z) < 0.5 || A.inHouse(x, z, R + 4)) return false;
  const nr = A.nearestRoad(x, z, 7, 2);
  if (nr && nr.d < A.walkHalf(nr.seg) + R + 2) return false;
  if (A.onPave(x, z, R + 1.5) || inArea(x, z, R + 2)) return false;
  if (A.mazeBlocks(x, z, R + 2) || A.yardBlocks(x, z, R + 2) || A.ycBlocks(x, z, R + 2.5) || ownNear(x, z, R + 3)) return false;
  if (solidNear(x, z, R + 0.3) || smashNear(x, z, R + 1)) return false;
  if (near(ENTG, 20, x, z, R + 8, e => Math.hypot(e[0] - x, e[1] - z) < R + 8)) return false;
  if ((A.pzBlocks && A.pzBlocks(x, z, R + 4)) || (A.rivBlocks && A.rivBlocks(x, z, R + 4))) return false;
  for (let k = 0; k < 8; k++) {                     // край — на траве, не на дорожке и не у бордюра
    const a = k / 8 * Math.PI * 2, px = x + Math.cos(a) * (R + 0.6), pz = z + Math.sin(a) * (R + 0.6);
    if (A.onPave(px, pz, 0.8) || (A.curbNear && A.curbNear(px, pz, 1)) || A.inHouse(px, pz, 2)) return false;
  }
  if (!lawnHex(x, z)) return false;
  return true;
}
/* профиль холмика: косинусом от верха к краю (край — вровень с газоном) */
const prof = (d, R, h) => (d >= R ? 0 : h * 0.5 * (1 + Math.cos(Math.PI * d / R)));
const BASE = 0.046;                                 // над газонами карты (0,04—0,0435)
function hill (x, z, R, h) {
  const n = DECOR.HILL.SEG, M = A.LITM, rings = [1, 0.66, 0.33];
  M.color(lawnHex(x, z));
  const pt = (k, f) => { const a = (k % n) / n * Math.PI * 2, px = x + Math.cos(a) * R * f, pz = z + Math.sin(a) * R * f; return [px, A.groundH(px, pz) + BASE + prof(R * f, R, h) - (f >= 1 ? 0.01 : 0), pz]; };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < n; k++) {
      const a = pt(k, rings[ri]), b = pt(k + 1, rings[ri]), c = pt(k + 1, rings[ri + 1]), d = pt(k, rings[ri + 1]);
      M.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      M.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    }
  }
  const top = [x, A.groundH(x, z) + BASE + h, z];
  for (let k = 0; k < n; k++) { const a = pt(k, rings[rings.length - 1]), b = pt(k + 1, rings[rings.length - 1]); M.tri(a[0], a[1], a[2], b[0], b[1], b[2], top[0], top[1], top[2]); }
  const o = { x, z, R, h };
  HILLS.push(o);
  idx(HG, 16, x - R, z - R, x + R, z + R, o);
  addOwn({ x, z, r: R, solid: 0, kind: 'hill' });
  ST.hills++;
}
/* высота холмика над землёй в точке, м (0 — не на холмике) */
export function lift (x, z) {
  const a = HG.get(gk(Math.floor(x / 16), Math.floor(z / 16)));
  if (!a) return 0;
  let y = 0;
  for (let i = 0; i < a.length; i++) { const o = a[i], d = Math.hypot(o.x - x, o.z - z); if (d < o.R) y = Math.max(y, prof(d, o.R, o.h)); }
  return y;
}

const RES = [];
export function* build (api) {
  const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (QS && QS.has('nodecor')) return ST;
  const t0 = performance.now();
  A = api; MOB = !!(api.mobile && api.mobile()); ST.mob = MOB ? 1 : 0;
  OFF = new Set(((QS && QS.get('decoroff')) || '').split(','));   // ?decoroff=doors,rings,hills — без этих частей (замеры)
  const C = A.CITY;
  SG = new Map(); for (const s of A.SOLIDS) idx(SG, 30, s.cx - s.ex, s.cz - s.ez, s.cx + s.ex, s.cz + s.ez, s);
  SMG = new Map(); for (const it of A.SMASH) idx(SMG, 20, it.x, it.z, it.x, it.z, it);
  ENTG = new Map(); ZN = new Set(); OWN = new Map(); RES.length = 0;
  for (const e of C.entrances) {
    idx(ENTG, 20, e[0], e[1], e[0], e[1], e);
    if (resDoor(e)) RES.push(e);
    const R = DECOR.ZONE, kk = Math.ceil(R / 20) + 1, ci = Math.floor(e[0] / 20), cj = Math.floor(e[1] / 20);
    for (let i = ci - kk; i <= ci + kk; i++) for (let j = cj - kk; j <= cj + kk; j++) if (Math.hypot((i + 0.5) * 20 - e[0], (j + 0.5) * 20 - e[1]) < R) ZN.add(gk(i, j));
  }
  yield 'сетки';
  const box = p => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { p, x0, x1, z0, z1 }; };
  AREAG = new Map(); GREENG = new Map();
  for (const l of C.lots || []) if (l.p && l.p.length > 2) { const b = box(l.p); idx(AREAG, 40, b.x0, b.z0, b.x1, b.z1, b); }
  for (const g of C.green || []) {
    if (!g.p || g.p.length < 3) continue;
    const b = box(g.p);
    if (b.x1 - b.x0 > 3000 || b.z1 - b.z0 > 3000) continue;
    const grass = (g.k === 'park' || g.k === 'green') && !(A.isForest && A.isForest(g));
    b.hex = grass ? A.greenHex(g) : null; b.y = A.greenY ? A.greenY(g) : 0;
    idx(GREENG, 40, b.x0, b.z0, b.x1, b.z1, b);
    if (!grass) idx(AREAG, 40, b.x0, b.z0, b.x1, b.z1, b);
  }
  yield 'зелень';
  if (!OFF.has('doors')) yield* doors();
  if (!OFF.has('rings') && !MOB) yield* rings();   // телефон — без кругов (память: пик следа страницы у порога)
  if (!OFF.has('hills')) yield* hills();
  if (A.indexSolids) A.indexSolids();
  SG = SMG = ENTG = ZN = AREAG = GREENG = OWN = null;
  ST.ms = Math.round(performance.now() - t0);
  return ST;
}

export const DEBUG = { DECOR, ST, HILLS, lift };
