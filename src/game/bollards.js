/* ──────────────────────────────────────────────────────────────────────────
   Полусферы и столбики у тротуаров (М7, хвост М5; автор 24.10.2026: «у магазинов, переходов, въездов — бетонные
   полусферы и столбики, окрашенные, облупленные, по району»). Правила словами — docs/CAREER.md «Полусферы и столбики
   у тротуаров».

   Где (жребий — только по месту, хеш; Math.random не трогаем: город строится на зерне, docs/AGENTS.md):
     • у зебр — у каждого края перехода по два, у бордюра, по обе стороны полосы;
     • у магазинов (вывеска на стене с витриной, poi.w) — ряд из 2—4 у края тротуара напротив входа;
     • у въездов во дворы (дворовый проезд встречает улицу) — по одному с обеих сторон проезда.
   Доля мест — BL.RATE (у зебр, магазинов, въездов своя); на телефоне — вдвое реже. Не на асфальте, не в доме, не на
   стоянке курьеров, не ближе BL.GAP друг к другу.

   Виды (по району, как у заборов — fencevar.js zone): бетонная полусфера голая, полусфера крашеная (облупленная),
   бетонный столбик (с полосой или без), стальная труба с шапкой и светоотражающей полосой, чугунный шар на столбе (в
   Старом городе и Центре). Облупленность — рыжие и бетонные пятна в цвете вершин у части (у окраин — чаще).

   Сбиваются: kind 'bollard', как столб (it.post) — медленно (< ~22 км/ч) машина упирается, быстрее сносит; обломки —
   куски цвета краски. Одна вещь — одна геометрия (вращением профиля, 20—40 вершин) в общей склейке мелочи: новых
   вызовов отрисовки нет.

     BOLL.build(api)  — LATE-шаг (game.js, после дворов, до smashBuild); шагами
   ?nobollard — без них (сравнить). Отладка — __dlv.BOLL.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { quiet } from './propvar.js';
import { zone } from './fencevar.js';
import { CLEAN } from './mobile.js';

export const OFF = typeof location !== 'undefined' && /[?&]nobollard(&|$)/.test(location.search);
const MOB = !!CLEAN;
const ZW = 3.4;            // ширина зебры вдоль дороги (game.js ZW)
const WALK = 2.75;         // тротуар за полотном (pave.js PAVE.WALK)

export const BL = {
  RATE: { zebra: 0.18, shop: 0.7, gate: 0.3 },    // доля мест с столбиками (на телефоне — вдоль BL.MOB)
  MOB: 0.5,
  GAP: 0.9,                                      // ближе друг к другу — не ставим, м
  EDGE: 0.55,                                    // от края асфальта до столбика, м
  ZEBRA_SIDE: 0.45,                              // от края полосы зебры вдоль дороги, м
  SHOP: { N: [2, 4], STEP: 1.7, NEAR: 4.5, DOOR: 5 },   // у магазина: сколько, шаг, стена не дальше края тротуара + NEAR, м
  GATE: { SIDE: 0.9, NEAR: 14 },                 // у въезда: от кромки проезда, поиск улицы
  MAX: { zebra: 1000, shop: 300, gate: 800 },     // потолок по видам — память
  /* вид по району: [голая полусфера, крашеная полусфера, бетонный столбик, стальная труба, чугунный шар] */
  W: { old: [0.1, 0.15, 0.2, 0.1, 0.45], mid: [0.35, 0.25, 0.2, 0.15, 0.05], rim: [0.4, 0.1, 0.15, 0.35, 0] },
  PEEL: { old: 0.15, mid: 0.4, rim: 0.65 },      // доля облупленных
  CONCRETE: ['#a9a69c', '#9c998f', '#b3b0a5', '#8f8c83'],
  PAINT: { old: ['#e8e4d8', '#2a2d30', '#2f5a3a', '#c9a23a'], mid: ['#e8e4d8', '#e0b028', '#c9453a', '#4f6fa8', '#3f7a4a'], rim: ['#e0b028', '#c9453a', '#e8e4d8', '#6c7378'] },
  PIPE: ['#e0b028', '#2a2d30', '#c9453a', '#4f6fa8'],
  RUST: '#8a4a2a',
};
export const ST = { zebra: 0, shop: 0, gate: 0, kinds: [0, 0, 0, 0, 0], peeled: 0, verts: 0, skip: { road: 0, house: 0, near: 0, start: 0 }, shopWhy: { cand: 0, noRoad: 0, close: 0, far: 0, zebra: 0 }, ms: 0 };
export const LIST = [];

function hsh (x, z, k) {
  let h = Math.imul(Math.round(x * 4) ^ 0x7f4a7c15, 0x9E3779B1) ^ Math.imul(Math.round(z * 4) + k * 1013904223, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const byW = (w, W) => { let s = 0; for (let i = 0; i < W.length; i++) { s += W[i]; if (w < s) return i; } return W.length - 1; };
const mix = (hex, to, k) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), c = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};
const COL = new Map();
const col = hex => { let c = COL.get(hex); if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; COL.set(hex, c); } return c; };

/* ── геометрия: профиль вращения [радиус, высота, цвет] снизу вверх; n граней; последняя точка с радиусом 0 — вершина.
   Соседние точки в одном месте (смена цвета — полоса) не соединяются: резкая граница цвета. peel — жребий облупленности ── */
function lathe (prof, n, x, y, z, rot, peel, seed) {
  const pos = [], cl = [], idx = [], rings = [];
  const r = (k) => hsh(seed, k, 5);
  for (let pi = 0; pi < prof.length; pi++) {
    const [rad, h, hex] = prof[pi], o = pos.length / 3;
    const cnt = rad > 0 ? n : 1;
    for (let i = 0; i < cnt; i++) {
      const a = rot + i / n * 6.2832;
      pos.push(x + Math.cos(a) * rad, y + h, z + Math.sin(a) * rad);
      let c = col(hex);
      if (peel && pi > 0 && r(pi * 31 + i) < peel.k) c = col(peel.hex[(pi + i) & 1]);       // пятно облупившейся краски
      cl.push(c[0], c[1], c[2]);
    }
    rings.push([o, cnt, rad, h]);
  }
  for (let pi = 1; pi < prof.length; pi++) {
    const [o0, c0, r0, h0] = rings[pi - 1], [o1, c1, r1, h1] = rings[pi];
    if (r0 === r1 && h0 === h1) continue;                                // смена цвета: ребро без грани
    if (c1 === 1) { for (let i = 0; i < n; i++) idx.push(o0 + i, o0 + (i + 1) % n, o1); continue; }
    for (let i = 0; i < n; i++) {
      const a = o0 + i, b = o0 + (i + 1) % n, c = o1 + i, d = o1 + (i + 1) % n;
      idx.push(a, b, c, b, d, c);
    }
  }
  return quiet(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cl), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
    return g;
  });
}

/* вид и краска на месте (x, z): { kind, geo, hex } */
function make (x, z, y, k0) {
  const zn = zone(x, z), kind = byW(hsh(x, z, 801 + k0), BL.W[zn]);
  const peelOn = !MOB && hsh(x, z, 802) < BL.PEEL[zn];
  const conc = BL.CONCRETE[Math.floor(hsh(x, z, 803) * BL.CONCRETE.length)];
  const pal = BL.PAINT[zn], paint = pal[Math.floor(hsh(x, z, 804) * pal.length)];
  const sd = Math.round(x * 4) * 7919 + Math.round(z * 4);
  const rot = hsh(x, z, 805) * 6.2832, big = hsh(x, z, 806) < 0.4, R = big ? 0.38 : 0.3;
  let prof, n = MOB ? 6 : 7, hex = conc, peel = null;
  if (kind === 0) {                                                     // бетонная полусфера
    prof = [[R, 0, conc], [R * 0.97, R * 0.35, conc], [R * 0.78, R * 0.7, conc], [R * 0.4, R * 0.93, conc], [0, R, conc]];
    if (peelOn) peel = { k: 0.25, hex: [mix(conc, '#4a4840', 0.5), mix(conc, '#d8d4c8', 0.5)] };
  } else if (kind === 1) {                                              // крашеная полусфера: низ — бетон, верх — краска
    const c2 = peelOn ? mix(paint, conc, 0.35) : paint;
    prof = [[R, 0, conc], [R * 0.97, R * 0.12, conc], [R * 0.97, R * 0.12, c2], [R * 0.78, R * 0.7, c2], [R * 0.4, R * 0.93, c2], [0, R, c2]];
    hex = paint;
    if (peelOn) peel = { k: 0.45, hex: [conc, BL.RUST] };
  } else if (kind === 2) {                                              // бетонный столбик с шапкой, у части — полоса краски
    const h = 0.7 + hsh(x, z, 807) * 0.15, band = hsh(x, z, 808) < 0.55;
    prof = band
      ? [[0.12, 0, conc], [0.12, h * 0.55, conc], [0.12, h * 0.55, paint], [0.12, h * 0.8, paint], [0.12, h * 0.8, conc], [0.1, h * 0.92, conc], [0.05, h, conc], [0, h + 0.02, conc]]
      : [[0.12, 0, conc], [0.12, h * 0.85, conc], [0.1, h * 0.93, conc], [0.05, h, conc], [0, h + 0.02, conc]];
    if (band) hex = paint;
    if (peelOn) peel = { k: 0.3, hex: [mix(conc, '#4a4840', 0.45), BL.RUST] };
  } else if (kind === 3) {                                              // стальная труба: цвет, полоса, шапка
    const pc = BL.PIPE[Math.floor(hsh(x, z, 809) * BL.PIPE.length)], h = 0.9 + hsh(x, z, 807) * 0.1, bl = pc === '#e0b028' ? '#2a2d30' : '#e8e4d8';
    prof = [[0.055, 0, pc], [0.055, h * 0.7, pc], [0.055, h * 0.7, bl], [0.055, h * 0.8, bl], [0.055, h * 0.8, pc], [0.055, h, pc], [0.03, h + 0.02, pc], [0, h + 0.03, pc]];
    hex = pc; n = MOB ? 5 : 6;
    if (peelOn) peel = { k: 0.3, hex: [BL.RUST, mix(pc, BL.RUST, 0.5)] };
  } else {                                                              // чугунный шар на столбе
    const iron = '#1e2022', gold = zn === 'old' && hsh(x, z, 810) < 0.4 ? '#c9a23a' : iron;
    prof = [[0.085, 0, iron], [0.065, 0.12, iron], [0.065, 0.5, iron], [0.1, 0.52, iron], [0.15, 0.62, iron], [0.14, 0.74, iron], [0.08, 0.82, gold], [0, 0.85, gold]];
    hex = iron; n = 7;
    if (peelOn) peel = { k: 0.2, hex: [BL.RUST, '#3a3d40'] };
  }
  if (peel) ST.peeled++;
  const geo = lathe(prof, n, x, y, z, rot, peel, sd);
  ST.kinds[kind]++; ST.verts += geo.attributes.position.count;
  return { kind, geo, hex };
}

export function* build (A) {
  if (OFF) return;
  const t0 = performance.now();
  const grid = new Map(), gkey = (x, z) => Math.floor(x / 2) * 100003 + Math.floor(z / 2);
  const taken = (x, z, d) => {
    for (let i = Math.floor((x - d) / 2); i <= Math.floor((x + d) / 2); i++) for (let j = Math.floor((z - d) / 2); j <= Math.floor((z + d) / 2); j++)
      for (const q of grid.get(i * 100003 + j) || []) if (Math.hypot(q[0] - x, q[1] - z) < d) return true;
    return false;
  };
  const rate = (k) => BL.RATE[k] * (MOB ? BL.MOB : 1);
  // можно ли поставить: не на асфальте (A.onPave — '' газон, 'road' полотно), не в доме, не на въезде курьеров, не тесно
  const ok = (x, z, why) => {
    if (!A.inBounds(x, z, -20)) return false;
    if (A.onPave(x, z, 0.1) === 'road') { ST.skip.road++; return false; }
    if (A.inHouse(x, z, 0.35)) { ST.skip.house++; return false; }
    if (A.introClear && A.introClear(x, z, 6)) { ST.skip.start++; return false; }
    if (A.startClear && A.startClear(x, z)) { ST.skip.start++; return false; }
    if (taken(x, z, BL.GAP)) { ST.skip.near++; return false; }
    return true;
  };
  const place = (x, z, why) => {
    const y = A.groundH(x, z) + (A.curbAt ? A.curbAt(x, z) : 0) - 0.03;
    const b = make(x, z, y, why === 'zebra' ? 0 : why === 'shop' ? 1 : 2);
    const it = A.smashAdd('bollard', x, z, 0.3, [b.geo], b.hex);
    it.post = 1;                                    // как столб: медленно — твёрдый, быстро — сносит (game.js POST_KNOCK)
    it.slow = 0.88;                                 // бетон тормозит заметнее столба
    it.bk = b.kind;
    ST[why]++;
    LIST.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, why, b.kind]);
    const k = gkey(x, z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([x, z]);
    return true;
  };

  /* 1) зебры: у каждого края — по два, у бордюра, по обе стороны полосы */
  let n = 0;
  for (const zb of A.ZEBRAS) {
    if (++n % 120 === 0) yield 'bollards';
    if (ST.zebra >= BL.MAX.zebra) break;
    if (hsh(zb.x, zb.z, 811) >= rate('zebra')) continue;
    const nx = -zb.uz, nz = zb.ux, half = zb.w / 2 + BL.EDGE, side = ZW / 2 + BL.ZEBRA_SIDE;
    for (const sd of [-1, 1]) for (const al of [-1, 1]) {
      const x = zb.x + nx * half * sd + zb.ux * side * al, z = zb.z + nz * half * sd + zb.uz * side * al;
      if (ok(x, z)) place(x, z, 'zebra');
    }
  }
  yield 'bollards';

  /* 2) магазины: ряд у края тротуара напротив входа */
  n = 0;
  for (const poi of A.CITY.pois) {
    if (++n % 200 === 0) yield 'bollards';
    if (!poi.w || ST.shop >= BL.MAX.shop) continue;
    const [wx, wz, wnx, wnz] = poi.w;
    if (!A.inBounds(wx, wz, -30) || hsh(wx, wz, 812) >= rate('shop')) continue;
    const fx = wx + wnx * 1.5, fz = wz + wnz * 1.5;               // перед входом
    ST.shopWhy.cand++;
    const q = A.nearestRoad(fx, fz, 7, 2);
    if (!q || q.seg.x) { ST.shopWhy.noRoad++; continue; }          // улица, пешеходка или двор (класс ≤ 7; не мост)
    const sx = q.seg.x2 - q.seg.x1, sz = q.seg.z2 - q.seg.z1, sl = Math.hypot(sx, sz) || 1, ux = sx / sl, uz = sz / sl;
    const s = (fx - q.seg.x1) * -uz + (fz - q.seg.z1) * ux, side = s < 0 ? -1 : 1, hw = q.seg.w / 2;
    if (Math.abs(s) < hw + 0.8) { ST.shopWhy.close++; continue; }
    if (Math.abs(s) > hw + (q.seg.c <= 5 ? WALK : 1) + BL.SHOP.NEAR) { ST.shopWhy.far++; continue; }    // вход прямо у полотна или далеко от улицы — ряд не нужен
    if (A.ZEBRAS.some(zb => Math.hypot(zb.x - fx, zb.z - fz) < 4.5)) { ST.shopWhy.zebra++; continue; }
    const cnt = BL.SHOP.N[0] + Math.floor(hsh(wx, wz, 813) * (BL.SHOP.N[1] - BL.SHOP.N[0] + 1));
    const tproj = (fx - q.seg.x1) * ux + (fz - q.seg.z1) * uz;
    const bx = q.seg.x1 + ux * tproj + -uz * side * (hw + BL.EDGE), bz = q.seg.z1 + uz * tproj + ux * side * (hw + BL.EDGE);
    for (let i = 0; i < cnt; i++) {
      const o = (i - (cnt - 1) / 2) * BL.SHOP.STEP;
      const x = bx + ux * o, z = bz + uz * o;
      if (ok(x, z)) place(x, z, 'shop');
    }
  }
  yield 'bollards';

  /* 3) въезды во дворы: проезд (класс 7) выходит к улице — столбики по бокам у края тротуара */
  n = 0;
  for (const r of A.CITY.roads) {
    if (++n % 400 === 0) yield 'bollards';
    if (r.c !== 7 || r.b || r.x || ST.gate >= BL.MAX.gate || r.p.length < 2) continue;
    const w7 = A.roadWidth(r) / 2;
    for (const end of [0, 1]) {
      const p = end ? r.p[r.p.length - 1] : r.p[0], p2 = end ? r.p[r.p.length - 2] : r.p[1];
      if (hsh(p[0], p[1], 814) >= rate('gate')) continue;
      const q = A.nearestRoad(p[0], p[1], 5, 2);
      if (!q || q.d > BL.GATE.NEAR) continue;
      const dl = Math.hypot(p2[0] - p[0], p2[1] - p[1]) || 1, dx = (p2[0] - p[0]) / dl, dz = (p2[1] - p[1]) / dl;   // в глубь двора
      // от конца проезда в глубь — пока не выйдем из полотна улицы и не дойдём до края тротуара: тут же «рот» въезда
            let mx = p[0], mz = p[1], got = false;
      for (let t = 0; t <= 14; t += 0.5) {
        const cx = p[0] + dx * t, cz = p[1] + dz * t, qq = A.nearestRoad(cx, cz, 5, 2);
        if (!qq) continue;
        const sx = qq.seg.x2 - qq.seg.x1, sz = qq.seg.z2 - qq.seg.z1, sl = Math.hypot(sx, sz) || 1;
        const s = Math.abs((cx - qq.seg.x1) * -sz / sl + (cz - qq.seg.z1) * sx / sl);
        if (s >= qq.seg.w / 2 + 0.9) { mx = cx; mz = cz; got = true; break; }
      }
      if (!got) continue;
      const px = -dz, pz = dx;
      for (const sd of [-1, 1]) {
        const x = mx + px * (w7 + BL.GATE.SIDE) * sd, z = mz + pz * (w7 + BL.GATE.SIDE) * sd;
        if (A.ZEBRAS.some(zb => Math.hypot(zb.x - x, zb.z - z) < 3.2)) continue;
        if (ok(x, z)) place(x, z, 'gate');
      }
    }
  }
  ST.ms = Math.round(performance.now() - t0);
}

export const DEBUG = { BL, ST, LIST, OFF };
