/* ──────────────────────────────────────────────────────────────────────────
   Тропинки-срезки через газоны дворов (2г9, второй круг 25.10.2026; правила словами — docs/CAREER.md
   «Город: как выглядит» → «Трава, тропинки, плиты»).

   Кроме тропинок wastelands.js (от подъездов к остановкам, ларькам, гаражам, к соседнему дому) люди срезают:
     • УГОЛ ДОРОЖКИ — где дорожка двора упирается в другую дорожку (тропинка двери в дорожку вдоль дома, выход в
       общую сеть) или в тротуар улицы, напрямик через газонный угол: от точки CORNER.D м до стыка по одной дорожке к точке CORNER.D м
       по другой (сторона — жребий по месту);
     • ОТ ДВЕРИ К УЛИЦЕ — от конца тропинки подъезда (у общей дорожки) прямо к ближайшему тротуару, мимо выходов
       дорожек, если до него STREET.MIN—STREET.MAX м.
   Только краска на земле (полосы склейки LITM с цветами-метками тропинок wastelands.js — их рисует lawn.js:
   рыжая утоптанная земля и заросший край): ни твёрдого, ни «где ходят» (pave.js) она не меняет. Детерминированно
   (жребий по месту). Не через дома, асфальт, плитку, заборы и стены, клумбы, палисадники, площадки, корты, карманы,
   деревья и кусты дворов, воду: каждые 0,7 м средней части проверяется место; хоть одна точка занята — нет.
   Середина срезки — не ближе DUP м к уже проложенной (своей или wastelands.js — по своей сетке).

     SHORT.build(api) — шагами (latebuild.js), после WASTE.trails; ?oldgrass / ?oldlook / ?noshortcut — без них.
   ────────────────────────────────────────────────────────────────────────── */
import { onPave } from './pave.js';

export const SHORT = {
  CORNER: { SHARE: 0.45, D: [4.5, 9], MIN_ANG: 50 },   // доля стыков; от стыка, м; угол между дорожками не меньше, °
  STREET: { SHARE: 0.3, MIN: 9, MAX: 40, OFF: 9.5 },                    // доля подъездов; длина, м; старт — столько м от двери
  W: [0.8, 1.15], EDGE: 1.0,                                             // ширина утоптанного, м; заросший край — на столько шире
  DUP: 6, MAX_N: 900,
};
const TRAIL_HEX = ['#8f7a5a', '#94805e', '#87735a'], EDGE_HEX = '#a3a072';   // как wastelands.js (цвета-метки — их узнаёт lawn.js)
export const ST = { corners: 0, street: 0, m: 0, tried: 0, ms: 0, why: {} };
const why = k => { ST.why[k] = (ST.why[k] || 0) + 1; };
const LIST = [];                                   // для проверок: [ax, az, bx, bz]

const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const key = (i, j) => i * 100003 + j;

export function* build (A) {
  if (!A || !A.LITM) return;
  const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  if (Q.has('noshortcut') || Q.has('oldgrass') || Q.has('oldlook')) return;
  let t0 = performance.now(), ms = 0;
  const pause = () => { ms += performance.now() - t0; }, resume = () => { t0 = performance.now(); };
  const P = (A.CITY && A.CITY.paths) || [];
  // отрезки дорожек — сеткой 16 м
  const G = new Map(), C = 16;
  P.forEach((q, pi) => {
    for (let i = 1; i < q.length; i++) {
      const [ax, az] = q[i - 1], [bx, bz] = q[i];
      for (let x = Math.floor((Math.min(ax, bx) - 2) / C); x <= Math.floor((Math.max(ax, bx) + 2) / C); x++)
        for (let z = Math.floor((Math.min(az, bz) - 2) / C); z <= Math.floor((Math.max(az, bz) + 2) / C); z++) {
          const k = key(x, z); let a = G.get(k); if (!a) G.set(k, a = []); a.push([ax, az, bx, bz, pi, i]);
        }
    }
  });
  // стены и заборы (SOLIDS: повёрнутые коробки)
  const SG = new Map(), SC = 30;
  for (const s of A.SOLIDS || []) for (let i = Math.floor((s.cx - s.ex) / SC); i <= Math.floor((s.cx + s.ex) / SC); i++) for (let j = Math.floor((s.cz - s.ez) / SC); j <= Math.floor((s.cz + s.ez) / SC); j++) {
    const k = key(i, j); let a = SG.get(k); if (!a) SG.set(k, a = []); a.push(s);
  }
  const inSolid = (x, z, r) => {
    const a = SG.get(key(Math.floor(x / SC), Math.floor(z / SC)));
    if (a) for (const s of a) { const dx = x - s.cx, dz = z - s.cz, lx = dx * s.cs + dz * s.sn, lz = -dx * s.sn + dz * s.cs; if (Math.abs(lx) < s.hw + r && Math.abs(lz) < s.hd + r) return true; }
    return false;
  };
  const fillNear = (x, z) => {
    const f = A.fills && A.fills(Math.floor(x / 40), Math.floor(z / 40));
    if (f) for (const o of f) { const r = o.k === 'play' ? 6 : o.k === 'tree' || o.k === 'shrub' ? 1.4 : 3.2; if (Math.abs(o.x - x) < r && Math.abs(o.z - z) < r && Math.hypot(o.x - x, o.z - z) < r) return true; }
    return false;
  };
  // площадки, спортполя, вода, кладбища (CITY.green) — сеткой
  const inP = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const GG = new Map(), GC = 40;
  for (const g of (A.CITY && A.CITY.green) || []) {
    if (!g.p || !/^(play|pitch|water|cem)$/.test(g.k)) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    const b = { p: g.p, x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z1 + 1 };
    for (let i = Math.floor(b.x0 / GC); i <= Math.floor(b.x1 / GC); i++) for (let j = Math.floor(b.z0 / GC); j <= Math.floor(b.z1 / GC); j++) { const k = key(i, j); let a = GG.get(k); if (!a) GG.set(k, a = []); a.push(b); }
  }
  const green = (x, z) => { for (const b of GG.get(key(Math.floor(x / GC), Math.floor(z / GC))) || []) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && inP(x, z, b.p)) return true; return false; };
  const lawnWhy = (x, z) => onPave(x, z, 0.35) ? 'pave' : A.inHouse(x, z, 1.2) ? 'house' : inSolid(x, z, 0.5) ? 'solid' : (A.blocks && A.blocks(x, z, 0.45)) ? 'blocks' : fillNear(x, z) ? 'fill' : green(x, z) ? 'green' : '';
  const lawn = (x, z) => !onPave(x, z, 0.35) && !A.inHouse(x, z, 1.2) && !inSolid(x, z, 0.5) && !(A.blocks && A.blocks(x, z, 0.45)) && !fillNear(x, z) && A.groundH(x, z) > 0.5 && A.inBounds(x, z, 30)
    && !green(x, z);
  /* средняя часть (без ~2 м у концов — там дорожка и её край) — вся газон */
  const clear = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.7), e = Math.min(2.4, L * 0.25);
    for (let i = 0; i <= n; i++) { const d = i / n * L; if (d < e || d > L - e) continue; const t = d / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (!lawn(x, z)) { why('c_' + (lawnWhy(x, z) || 'other')); return false; } }
    return true;
  };
  // проложенные середины — сеткой (и тропинки wastelands.js не видим — их середины не хранятся; дубль с ними не страшен)
  const DG = new Map(), DC = 12;
  const dup = (x, z) => {
    for (let i = Math.floor((x - SHORT.DUP) / DC); i <= Math.floor((x + SHORT.DUP) / DC); i++) for (let j = Math.floor((z - SHORT.DUP) / DC); j <= Math.floor((z + SHORT.DUP) / DC); j++)
      for (const p of DG.get(key(i, j)) || []) if (Math.hypot(p[0] - x, p[1] - z) < SHORT.DUP) return true;
    return false;
  };
  const mark = (x, z) => { const k = key(Math.floor(x / DC), Math.floor(z / DC)); let a = DG.get(k); if (!a) DG.set(k, a = []); a.push([x, z]); };
  const LITM = A.LITM;
  const draw = (ax, az, bx, bz, seed) => {
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    const w = SHORT.W[0] + (SHORT.W[1] - SHORT.W[0]) * hash(seed, 1, 5), hi = (hash(seed, 2, 5) * 3) | 0;
    const bend = (hash(seed, 3, 5) - 0.5) * 0.16 * L, n = Math.max(2, Math.round(L / 2.5));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const q = i / n, b = Math.sin(q * Math.PI) * bend + (i && i < n ? (hash(seed + i, 4, 5) - 0.5) * 0.25 : 0);
      pts.push([ax + (bx - ax) * q + nx * b, az + (bz - az) * q + nz * b]);
    }
    LITM.color(EDGE_HEX);
    for (let i = 1; i < pts.length; i++) LITM.ribbon(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w + SHORT.EDGE, 0.066);
    const ty = 0.072 + hi * 0.0007;                // как у тропинок wastelands.js: каждый оттенок на своей высоте (не мерцают внахлёст)
    LITM.color(TRAIL_HEX[hi]);
    for (let i = 1; i < pts.length; i++) LITM.ribbon(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, ty);
    for (let i = 1; i < pts.length - 1; i++) LITM.disc(pts[i][0], pts[i][1], w / 2, ty, 6);
    mark((ax + bx) / 2, (az + bz) / 2);
    LIST.push([Math.round(ax), Math.round(az), Math.round(bx), Math.round(bz)]);
    ST.m += L;
  };
  /* по ломаной q от точки (x, z) на отрезке i (i−1 → i) на dist м: sg = 1 — к концу, −1 — к началу; дальше конца — null */
  const walk = (q, i, x, z, sg, dist) => {
    let k = sg > 0 ? i : i - 1;
    while (k >= 0 && k < q.length) {
      const l = Math.hypot(q[k][0] - x, q[k][1] - z);
      if (l >= dist) { const t = dist / (l || 1); return [x + (q[k][0] - x) * t, z + (q[k][1] - z) * t]; }
      dist -= l; x = q[k][0]; z = q[k][1]; k += sg;
    }
    return null;
  };
  const N = () => ST.corners + ST.street;
  // 1) углы: конец одной дорожки упирается в другую
  const near = (x, z) => G.get(key(Math.floor(x / C), Math.floor(z / C))) || [];
  let np = 0;
  for (let pi = 0; pi < P.length && N() < SHORT.MAX_N; pi++) {
    if (++np % 300 === 0) { pause(); yield 'corners'; resume(); }
    const q = P[pi];
    if (q.length < 2) continue;
    for (const end of [0, 1]) {
      const E = end ? q[q.length - 1] : q[0], E2 = end ? q[q.length - 2] : q[1];
      let ux = E2[0] - E[0], uz = E2[1] - E[1];
      const ul = Math.hypot(ux, uz);
      if (ul < 2) continue;
      ux /= ul; uz /= ul;
      if (hash(E[0], E[1], 61 + end) > SHORT.CORNER.SHARE) continue;
      // другая дорожка у конца
      let best = null;
      for (const s of near(E[0], E[1])) {
        if (s[4] === pi) continue;
        const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz; if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((E[0] - s[0]) * dx + (E[1] - s[1]) * dz) / l2)), jx = s[0] + dx * t, jz = s[1] + dz * t, d = Math.hypot(E[0] - jx, E[1] - jz);
        if (d < 1.6 && (!best || d < best.d)) best = { jx, jz, vx: dx / Math.sqrt(l2), vz: dz / Math.sqrt(l2), t, L: Math.sqrt(l2), d, q: P[s[4]], i: s[5] };
      }
      // или тротуар улицы: выход дорожки упёрся в тротуар — срезают угол к тротуару
      if (!best && A.nearestRoad) {
        const r = A.nearestRoad(E[0], E[1], 8, 2);
        if (r && r.seg && r.seg.c <= 5 && r.seg.x1 !== undefined) {
          const sx = r.seg.x2 - r.seg.x1, sz = r.seg.z2 - r.seg.z1, L = Math.hypot(sx, sz), off = r.seg.w / 2 + 1.4 + (r.seg.g || 0);
          const ddx = E[0] - r.x, ddz = E[1] - r.z, dd = Math.hypot(ddx, ddz) || 1;
          if (L > 6 && Math.abs(dd - off) < 2.6) {
            const jx = r.x + ddx / dd * off, jz = r.z + ddz / dd * off, t = ((r.x - r.seg.x1) * sx + (r.z - r.seg.z1) * sz) / (L * L);
            best = { jx, jz, vx: sx / L, vz: sz / L, t, L, d: 0, road: 1 };
          }
        }
      }
      if (!best) { why('noJoin'); continue; }
      const ang = Math.acos(Math.min(1, Math.abs(ux * best.vx + uz * best.vz))) * 180 / Math.PI;
      if (ang < SHORT.CORNER.MIN_ANG) { why('ang'); continue; }          // почти вдоль — это не угол
      ST.tried++;
      const D = SHORT.CORNER.D, d1 = Math.min(ul - 0.5, D[0] + (D[1] - D[0]) * hash(E[0], E[1], 63)), d2 = D[0] + (D[1] - D[0]) * hash(E[0], E[1], 64);
      const ax = best.jx + ux * d1, az = best.jz + uz * d1;
      const sides = hash(E[0], E[1], 65) < 0.5 ? [1, -1] : [-1, 1];
      for (const sg of sides) {
        let bx = best.jx + best.vx * sg * d2, bz = best.jz + best.vz * sg * d2;
        if (!best.road) {                                   // по второй дорожке (ломаной) — d2 м от стыка, в её пределах
          const b = walk(best.q, best.i, best.jx, best.jz, sg, d2);
          if (!b) { why('along'); continue; }
          bx = b[0]; bz = b[1];
        }
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (Math.hypot(bx - ax, bz - az) < 4) { why('short'); continue; }
        if (dup(mx, mz)) { why('dup'); continue; }
        if (best.road && onPave(bx, bz, 0.2) !== 'walk') { why('notWalk'); continue; }
        if (!clear(ax, az, bx, bz)) { why('clear'); continue; }
        draw(ax, az, bx, bz, ax * 0.37 + bz * 0.11);
        ST.corners++;
        break;
      }
    }
  }
  pause(); yield 'corners'; resume();
  // 2) от двери к улице
  let ne = 0;
  for (const e of (A.CITY && A.CITY.entrances) || []) {
    if (N() >= SHORT.MAX_N) break;
    if (++ne % 300 === 0) { pause(); yield 'street'; resume(); }
    if (hash(e[0], e[1], 71) > SHORT.STREET.SHARE) continue;
    const ox = e[2] || 0, oz = e[3] || 0, ol = Math.hypot(ox, oz);
    if (ol < 0.1) continue;
    const sx = e[0] + ox / ol * SHORT.STREET.OFF, sz = e[1] + oz / ol * SHORT.STREET.OFF;
    const r = A.nearestRoad(sx, sz, SHORT.STREET.MAX + 12, 2);
    if (!r || !r.seg || r.d < 2) continue;
    // край тротуара (класс ≤ 5 — с тротуаром) — со стороны двери
    const edge = r.seg.w / 2 + (r.seg.c <= 5 ? 2.2 + (r.seg.g || 0) : 0.5);
    const dx = sx - r.x, dz = sz - r.z, dl = Math.hypot(dx, dz) || 1;
    // наискосок: точка на краю сдвинута вдоль улицы на 25—60 % расстояния (прямо — это уже выход дорожки)
    const sh = (hash(e[0], e[1], 72) < 0.5 ? -1 : 1) * dl * (0.25 + 0.35 * hash(e[0], e[1], 73));
    const tx = r.x + dx / dl * edge - dz / dl * sh, tz = r.z + dz / dl * edge + dx / dl * sh;
    const L = Math.hypot(tx - sx, tz - sz);
    if (L < SHORT.STREET.MIN || L > SHORT.STREET.MAX) continue;
    ST.tried++;
    if (!onPave(tx, tz, 0.3) || dup((sx + tx) / 2, (sz + tz) / 2) || !clear(sx, sz, tx, tz)) continue;
    draw(sx, sz, tx, tz, sx * 0.29 + tz * 0.13);
    ST.street++;
  }
  ST.m = Math.round(ST.m);
  pause();
  ST.ms = Math.round(ms);
}
export const DEBUG = { SHORT, ST, LIST, near: (x, z, n = 6) => LIST.slice().sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z)).slice(0, n) };
