/* ──────────────────────────────────────────────────────────────────────────
   Дворы у многоэтажек: лавочки у подъездов, тропинки и низкие заборчики
   (docs/IDEAS.md блок 6; правила словами — docs/CAREER.md «Дворы у подъездов»).

   Подъезд многоэтажки (жилой дом от 3 этажей, не особняк, не частный, не гараж и не цех):
     • тропинка PATH.W (1,6 м) от дорожки вдоль стены прямо от двери — до общей дорожки;
     • общая дорожка WALK.W (1,8 м) — вдоль всей стены с подъездами в WALK.OFF (7,5 м) от неё,
       с краёв — на WALK.EXT (4 м) дальше крайних подъездов; от того конца, что ближе к улице, —
       тропинка до тротуара (если улица ближе 40 м). Упёрлась в асфальт двора — значит, туда и
       ведёт: дальше не строим;
     • по обе стороны тропинки — низкий заборчик FENCE.H (0,55 м) в FENCE.U (2,9 м) от её оси
       (у FENCE.FLOWERS — 35 % подъездов — вместо него бордюр с цветами), кусками по 2,5 м:
       сбиваются на ходу, как дворовые заборчики (машину чуть тормозит, не держит);
     • лавочка у BENCH.SHARE (80 %) подъездов: сбоку от тропинки, вдоль неё, спинкой к заборчику,
       лицом к тропинке; сторона — жребий по месту подъезда (каждый запуск там же).
   Между тропинкой и заборчиками — 4 м свободно: туда встаёт пин и подъезжает машина. Заборчик и
   лавочка для пина — как стена (blocks): луч пина через них не идёт, пин не встаёт вплотную.

   Всё — в склейке дворовой мелочи (smashAdd) и в статике дорожек (LITM): новых отрисовок нет.
   ────────────────────────────────────────────────────────────────────────── */

export const YARD = {
  MIN_LV: 3,
  PATH: { W: 1.6, FROM: 2.3, MIN: 3 },
  WALK: { OFF: 7.5, W: 1.8, EXT: 4, STEP: 3, ROAD_MAX: 40 },
  FENCE: { U: 2.9, H: 0.55, SEG: 2.5, FROM: 2.9, FLOWERS: 0.35, COLORS: ['#3f7a4a', '#4f6fa8', '#d8d2c8', '#8a3b3b', '#c9803a'] },
  BENCH: { SHARE: 0.8, U: 1.9, N: 3.9 },
};

export const STATS = { ents: 0, multi: 0, paths: 0, walks: 0, links: 0, fences: 0, flowers: 0, benches: 0 };

const hash = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* заборы и лавочки для пина: отрезок каждой вещи в сетке по 10 м */
const CELL = 10, GRID = new Map();
function gridAdd (it) {
  const x0 = Math.floor((Math.min(it.ax, it.bx) - 1) / CELL), x1 = Math.floor((Math.max(it.ax, it.bx) + 1) / CELL);
  const z0 = Math.floor((Math.min(it.az, it.bz) - 1) / CELL), z1 = Math.floor((Math.max(it.az, it.bz) + 1) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = i + ',' + j;
    let a = GRID.get(k);
    if (!a) GRID.set(k, a = []);
    a.push(it);
  }
}
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

/* стоит ли целый заборчик или лавочка ближе r к точке — для пина (game.js pinRay / pinFree) */
export function blocks (x, z, r) {
  const a = GRID.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!a) return false;
  for (let i = 0; i < a.length; i++) {
    const it = a[i];
    if (it.down) continue;
    if (segD(x, z, it.ax, it.az, it.bx, it.bz) < r + it.th) return true;
  }
  return false;
}

/* Расстановка — один раз, после подъездов и дорожек у стен (game.js osmEntrances).
   A: THREE, CITY, HOUSE_GRID, LITM, BENCHES, YARD_PATHS, box, put, smashAdd, groundH, inHouse,
      inBounds, inPoly, nearestRoad, benchOk, DRIVE_MAX */
export function build (A) {
  const { THREE, CITY, LITM } = A;
  const onAsphalt = (x, z, m = 0.6) => { const r = A.nearestRoad(x, z, 7, 1); return !!r && r.d < r.seg.w / 2 + m; };
  const bad = (x, z, m) => onAsphalt(x, z, m) || A.inHouse(x, z, 0.3) || A.groundH(x, z) < 0.3;

  // чужие тропинки (до тротуара, аллеи): заборчик их не перегораживает
  const PG = new Map();
  for (const q of A.YARD_PATHS) for (let i = 1; i < q.length; i++) {
    const [ax, az] = q[i - 1], [bx, bz] = q[i];
    const s = { ax, az, bx, bz };
    for (let gx = Math.floor((Math.min(ax, bx) - 2) / CELL); gx <= Math.floor((Math.max(ax, bx) + 2) / CELL); gx++)
      for (let gz = Math.floor((Math.min(az, bz) - 2) / CELL); gz <= Math.floor((Math.max(az, bz) + 2) / CELL); gz++) {
        const k = gx + ',' + gz;
        let a = PG.get(k);
        if (!a) PG.set(k, a = []);
        if (a.length < 40) a.push(s);
      }
  }
  const nearPath = (x, z, r) => { for (const s of PG.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) if (segD(x, z, s.ax, s.az, s.bx, s.bz) < r) return true; return false; };

  // подъезды многоэтажек → стены домов, на которых они стоят
  const walls = new Map();
  for (const e of CITY.entrances) {
    const [x, z, nx, nz] = e;
    STATS.ents++;
    if (!A.inBounds(x, z, -40)) continue;
    const ix = x - nx * 0.6, iz = z - nz * 0.6;
    let hb = null;
    for (const b of A.HOUSE_GRID.get(Math.floor(ix / 40) + ',' + Math.floor(iz / 40)) || []) if (A.inPoly(ix, iz, b.p)) { hb = b; break; }
    if (!hb || (hb.k && hb.k !== 'res') || hb.st === 'villa' || hb.st === 'priv') continue;
    const p = hb.p;
    if (hb.lvY === undefined) {
      let s2 = 0;
      for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; s2 += a[0] * c[1] - c[0] * a[1]; }
      const area = Math.abs(s2) / 2;
      hb.lvY = hb.lv || (area > 1200 ? 5 : area > 600 ? 4 : area > 220 ? 2 : 1);
    }
    if (hb.lvY < YARD.MIN_LV) continue;
    let bi = -1, bd = 3, bu = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < bd) { bd = d; bi = i; bu = t * Math.sqrt(l2); }
    }
    if (bi < 0) continue;
    STATS.multi++;
    let set = walls.get(hb);
    if (!set) walls.set(hb, set = new Map());
    let w = set.get(bi);
    if (!w) set.set(bi, w = { nx, nz, ents: [] });
    w.ents.push({ x, z, u: bu });
  }

  const P = YARD.PATH, W = YARD.WALK, F = YARD.FENCE, B = YARD.BENCH;
  const fenceSeg = (ax, az, bx, bz, hex, flowers) => {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    if (l < 0.6 || bad(cx, cz, 0.9) || bad(ax, az, 0.6) || bad(bx, bz, 0.6) || nearPath(cx, cz, 1.3)) return;
    const ry = Math.atan2(-(bz - az), bx - ax), ex = (bx - ax) / l, ez = (bz - az) / l, gy = A.groundH(cx, cz), g = [];
    let it;
    if (flowers) {
      A.box(g, l, 0.16, 0.22, '#c9c2b6', cx, gy + 0.08, cz, ry);              // бордюр
      A.box(g, l - 0.1, 0.22, 0.3, '#4f8f3f', cx, gy + 0.27, cz, ry);         // зелень
      const n = Math.max(2, Math.round(l / 0.6));
      for (let k = 0; k < n; k++) {                                          // цветы — кубики, по вершинам дёшево
        const t = (k + 0.5) / n - 0.5, px = cx + ex * t * l, pz = cz + ez * t * l, hs = hash(px, pz, 3);
        A.box(g, 0.2, 0.2, 0.2, ['#e0475a', '#f2c230', '#b65fd0', '#f08a3c', '#f4f1ea'][Math.floor(hs * 5)], px, gy + 0.44 + hs * 0.08, pz, ry + hs);
      }
      it = A.smashAdd('bush', cx, cz, Math.min(1.3, l / 2), g, '#4f8f3f');
      STATS.flowers++;
    } else {
      A.box(g, l, 0.06, 0.05, hex, cx, gy + F.H - 0.05, cz, ry);
      A.box(g, l, 0.06, 0.05, hex, cx, gy + F.H * 0.45, cz, ry);
      for (const o of [-l / 2 + 0.04, l / 2 - 0.04]) A.box(g, 0.07, F.H, 0.07, hex, cx + ex * o, gy + F.H / 2, cz + ez * o);
      it = A.smashAdd('fence', cx, cz, Math.min(1.3, l / 2), g, hex);
      STATS.fences++;
    }
    it.ax = ax; it.az = az; it.bx = bx; it.bz = bz; it.th = 0.05;
    gridAdd(it);
  };

  for (const [hb, set] of walls) {
    const p = hb.p;
    for (const [i, w] of set) {
      const a = p[i], c = p[(i + 1) % p.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 4) continue;
      const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len, nx = w.nx, nz = w.nz;
      const at = (u, n) => [a[0] + ux * u + nx * n, a[1] + uz * u + nz * n];
      w.ents.sort((q, r) => q.u - r.u);
      // тропинки от дверей
      let reached = 0;
      for (const e of w.ents) {
        const hv = hash(e.x, e.z, 21);
        const goal = W.OFF - W.W / 2 + 0.2;          // чуть заходит на общую дорожку
        let nEnd = P.FROM;
        for (let n = P.FROM + 0.5; ; n += 0.5) {
          const nn = Math.min(n, goal), [qx, qz] = at(e.u, nn);
          if (bad(qx, qz, 0.4)) break;
          nEnd = nn;
          if (nn >= goal) break;
        }
        e.nEnd = nEnd;
        if (nEnd - P.FROM < P.MIN) continue;
        e.full = nEnd >= goal;
        if (e.full) reached++;
        LITM.color('#d3c9b8');
        for (let n = P.FROM; n < nEnd - 0.01; n += 2.5) {
          const [x1, z1] = at(e.u, n), [x2, z2] = at(e.u, Math.min(nEnd, n + 2.5));
          LITM.ribbon(x1, z1, x2, z2, P.W, 0.083);
        }
        const p0 = at(e.u, P.FROM), p1 = at(e.u, nEnd);
        A.YARD_PATHS.push([p0, p1]); CITY.paths.push([p0, p1]);
        STATS.paths++;
        // заборчики (или бордюр с цветами) по обе стороны тропинки
        const flowers = hash(e.x, e.z, 22) < F.FLOWERS, hex = F.COLORS[Math.floor(hash(a[0], a[1], 23) * F.COLORS.length)];
        const benchSide = hv < 0.5 ? 1 : -1;
        const nTo = nEnd - 0.4;
        for (const s of [-1, 1]) {
          const u = e.u + s * F.U;
          // соседний подъезд ближе — его тропинка: не перегораживаем
          if (w.ents.some(o => o !== e && Math.abs(o.u - u) < P.W / 2 + 0.6)) continue;
          const L = nTo - F.FROM;
          if (L < 1) continue;
          const k = Math.max(1, Math.round(L / F.SEG));
          for (let j = 0; j < k; j++) {
            const [ax, az] = at(u, F.FROM + L * j / k), [bx, bz] = at(u, F.FROM + L * (j + 1) / k);
            fenceSeg(ax, az, bx, bz, hex, flowers);
          }
        }
        // лавочка сбоку от тропинки, вдоль неё, лицом к ней
        if (hash(e.x, e.z, 24) < B.SHARE && nEnd >= B.N + 1.3) {
          const [bx, bz] = at(e.u + benchSide * B.U, B.N);
          if (A.benchOk(bx, bz) && !nearPath(bx, bz, 1.1)) {
            const ry = Math.atan2(-ux * benchSide, -uz * benchSide);
            const it = A.smashAdd('bench', bx, bz, 1.2, benchGeo(A, bx, bz, ry), '#8a6b4e');
            A.BENCHES.push({ x: bx, z: bz, y: A.groundH(bx, bz), ry, prop: it });
            const [b0x, b0z] = at(e.u + benchSide * B.U, B.N - 1.2), [b1x, b1z] = at(e.u + benchSide * B.U, B.N + 1.2);
            it.ax = b0x; it.az = b0z; it.bx = b1x; it.bz = b1z; it.th = 0.35;
            gridAdd(it);
            STATS.benches++;
          }
        }
      }
      if (!reached) continue;
      // общая дорожка вдоль стены
      const u0 = Math.max(-W.EXT, w.ents[0].u - W.EXT), u1 = Math.min(len + W.EXT, w.ents[w.ents.length - 1].u + W.EXT);
      LITM.color('#d3c9b8');
      const pts = [], flush = () => { if (pts.length > 1) { A.YARD_PATHS.push(pts.slice()); CITY.paths.push(pts.slice()); } pts.length = 0; };
      let built = 0, ends = [];
      for (let u = u0; u < u1 - 0.01; u += W.STEP) {
        const u2 = Math.min(u1, u + W.STEP);
        const [x1, z1] = at(u, W.OFF), [x2, z2] = at(u2, W.OFF);
        const [mx, mz] = at((u + u2) / 2, W.OFF);
        if (bad(mx, mz, 0.6) || A.inHouse(mx, mz, 0.6)) { flush(); continue; }
        LITM.ribbon(x1, z1, x2, z2, W.W, 0.084);
        if (!pts.length) { pts.push([x1, z1]); ends.push(u); }
        pts.push([x2, z2]);
        ends.push(u2);
        built++;
      }
      flush();
      if (!built) continue;
      STATS.walks++;
      // тропинка от общей дорожки до тротуара — от того её конца, что ближе к улице
      const uA = Math.min(...ends), uB = Math.max(...ends);
      let best = null;
      for (const u of [uA, uB]) {
        const [sx, sz] = at(u, W.OFF);
        const r = A.nearestRoad(sx, sz, A.DRIVE_MAX, 2);
        if (!r || r.d > W.ROAD_MAX) continue;
        if (!best || r.d < best.r.d) best = { sx, sz, r };
      }
      if (!best) continue;
      const { sx, sz, r } = best;
      const ddx = sx - r.x, ddz = sz - r.z, dl = Math.hypot(ddx, ddz) || 1;
      const edge = r.seg.w / 2 + (r.seg.c <= 5 ? 2.4 + (r.seg.g || 0) : 0.6);
      const ex = r.x + ddx / dl * edge, ez = r.z + ddz / dl * edge, L = Math.hypot(ex - sx, ez - sz);
      if (L < 1.5 || L > W.ROAD_MAX) continue;
      let clear = true;
      for (let t = 0.1; clear && t < 0.96; t += 0.08) { const qx = lerp(sx, ex, t), qz = lerp(sz, ez, t); if (A.inHouse(qx, qz, 0.4) || (t < 0.9 && onAsphalt(qx, qz))) clear = false; }
      if (!clear) continue;
      LITM.ribbon(sx, sz, ex, ez, 1.5, 0.085);
      LITM.disc(ex, ez, 0.75, 0.085, 6);
      A.YARD_PATHS.push([[sx, sz], [ex, ez]]); CITY.paths.push([[sx, sz], [ex, ez]]);
      STATS.links++;
    }
  }
  return STATS;
}

/* лавочка — как у аллей (world.js benchGeo): сиденье, спинка, две ножки */
function benchGeo (A, x, z, ry) {
  const gy = A.groundH(x, z), parts = [], c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = at(0, 0); A.box(parts, 2.4, 0.16, 0.62, '#8a6b4e', px, gy + 0.6, pz, ry);
  [px, pz] = at(0, -0.27); A.box(parts, 2.4, 0.5, 0.12, '#8a6b4e', px, gy + 0.98, pz, ry);
  for (const k of [-1, 1]) { [px, pz] = at(k * 1.05, -0.05); A.box(parts, 0.14, 0.85, 0.66, '#3b3f46', px, gy + 0.2, pz, ry); }
  return parts;
}

export const DEBUG = { YARD, STATS, blocks, get cells () { return GRID.size; } };
