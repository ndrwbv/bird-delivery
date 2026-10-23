/* ──────────────────────────────────────────────────────────────────────────
   Отклик удара своей машины (0п15, 23.10.2026; автор: «на полной скорости в ограждение — нет характерного звука
   и отклика»). Правила словами — docs/CAREER.md «Вмятины и отлетающие детали» → «Отклик удара»; звук —
   docs/SOUNDS.md «Удары слоями».

     hit(v, wx, wz, broken) — удар своей машины силой v м/с в точке мира (wx, wz); broken — сколько стёкол этим
                              ударом разбилось по-настоящему (carglass.js). Зовут: dentCar своей машины (game.js —
                              стены, машины, лаборатория), удар о стену слабее порога сердец (bump), снос ограждения
                              и мелочи. Ближе GAP с — тот же удар: берём сильнейший, второй раз не сыплем.
   • Осколки (SHARD): с SHARD.V м/с — всегда; со звоном «иногда» (GLASS) — тоже; разбилось настоящее стекло — больше.
     Из окон машины (ближнее к удару — больше половины), в разные стороны, падают, прыгают по асфальту и через
     LIFE с исчезают. Частицы — fxpool.js 'spark' (один InstancedMesh, цвет у каждой свой): ни меша, ни материала
     на осколок.
   • Звон «иногда» (GLASS): с GLASS.V м/с шанс P0, к GLASS.V1 — P1 (≈ 1 из 4 на заметном, 1 из 2 на сильном):
     звук бьющегося стекла (impact.js shatter) и осколки — даже если стекло своей машины уцелело. Разбилось
     по-настоящему — звенит impact.glass, здесь только осколки.
   • Крышки (LID): с LID.V м/с шанс P0 … P1 (к LID.V1): от удара открывается багажник (у хэтчбека — задняя дверь),
     капот или дверь (дверь — у коробочных машин ?oldcar) — что ближе к удару — и через HOLD с захлопывается со
     стуком. Багажник — cardent.js pop (тот же, что «следы сзади»: замок разбит — распахивает каждый удар).
     «Семёрка» (realcar.js): крышка багажника и капот вырезаются из кузова модели своей сеткой (вершины общие —
     мнутся вместе с кузовом) и открываются на тот же угол, что спрятанные крышки старого кузова; пока закрыты —
     рисуются кузовом, лишней отрисовки нет.
     init(api)   — game.js: { Snd, groundH, vel() — машина игрока V }
     step(dt, car) — каждый кадр: крышки (таймеры, угол, стук), вырезка крышек «Семёрки»
   ────────────────────────────────────────────────────────────────────────── */
import * as FXP from './fxpool.js';
import { shatter } from './impact.js';
import { pop as lidPop, lidTick } from './cardent.js';

export const CFX = {
  GAP: 0.3,                                        // с — один удар (нос и корма, место удара и hurtCar)
  SHARD: { V: 15, N0: 12, N1: 30, V1: 30, GLASS_N: 10, BROKEN_N: 14, LIFE: [1.6, 3.2], S: [0.3, 0.75], OUT: [2, 6.5], UP: [1.5, 5] },
  GLASS: { V: 8, V1: 22, P0: 0.25, P1: 0.55 },
  LID: { V: 9, V1: 24, P0: 0.2, P1: 0.6, HOLD: [0.9, 2.2], TRUNK: [0.8, 1.2], RDOOR: [0.9, 1.4], HOOD: [0.45, 0.8], DOOR: [0.6, 1.0], K: 10 },
};
const GLASS_HEX = [0xe4f5fb, 0xbfe0ec, 0xffffff, 0x9cc7d8, 0xd4ecf4];
export const ST = { hits: 0, gated: 0, shards: 0, shatter: 0, lids: { trunk: 0, rdoor: 0, hood: 0, door: 0 }, shut: 0, real: 0, last: null };

let A = null;
export function init (api) { A = api; }

const rnd = (a, b) => a + Math.random() * (b - a);
const lerp01 = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
let T = 0;                                         // свои часы (step)
const LAST = { t: -9, v: 0 };
let CAR = null;                                    // своя машина (step)

/** удар своей машины: v — м/с, wx, wz — точка в мире, broken — стёкол разбилось по-настоящему */
export function hit (v, wx, wz, broken = 0) {
  const car = CAR;
  if (!car || !(v > 0)) return null;
  const same = T - LAST.t < CFX.GAP && v <= LAST.v + 0.5;   // тот же удар, не сильнее
  if (same && !broken) { ST.gated++; return null; }
  const again = same;                              // тот же удар, но стекло разбилось только сейчас — только осколки
  if (!same) { LAST.t = T; LAST.v = v; }
  ST.hits++;
  const u = car.userData;
  // точка удара — в осях машины
  const dx = wx - car.position.x, dz = wz - car.position.z, c = Math.cos(car.rotation.y), s = Math.sin(car.rotation.y);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const out = { v: +v.toFixed(1), shards: 0, glass: false, lid: null };
  // звон «иногда» и осколки
  const G = CFX.GLASS, SH = CFX.SHARD;
  let n = 0;
  if (broken > 0) n += SH.BROKEN_N * broken;
  else if (v >= G.V && !again && Math.random() < G.P0 + (G.P1 - G.P0) * lerp01(v, G.V, G.V1)) {
    shatter(v, { x: wx, z: wz });
    ST.shatter++; out.glass = true;
    n += SH.GLASS_N;
  }
  if (v >= SH.V && !again) n += Math.round(SH.N0 + (SH.N1 - SH.N0) * lerp01(v, SH.V, SH.V1));
  if (n) out.shards = shards(car, u, lx, lz, n);
  // крышки
  const L = CFX.LID;
  if (v >= L.V && !again && Math.random() < L.P0 + (L.P1 - L.P0) * lerp01(v, L.V, L.V1)) out.lid = popLid(u, lx, lz);
  ST.last = out;
  return out;
}

/* осколки из окон: ближнее к удару — больше половины */
function shards (car, u, lx, lz, n) {
  const W = (u.W || 1.8) / 2, hl = u.hl || 2.1, y = u.real ? 1.4 : 1.1;
  const WIN = [[0, hl * 0.4, 0, 1], [0, -hl * 0.55, 0, -1], [W, -hl * 0.1, 1, 0], [-W, -hl * 0.1, -1, 0]];
  let near = 0, bd = 1e9;
  for (let i = 0; i < 4; i++) { const d = (WIN[i][0] - lx) ** 2 + (WIN[i][1] - lz) ** 2; if (d < bd) { bd = d; near = i; } }
  const c = Math.cos(car.rotation.y), s = Math.sin(car.rotation.y), V = A && A.vel && A.vel();
  const vx0 = V ? V.vx * 0.6 : 0, vz0 = V ? V.vz * 0.6 : 0, SH = CFX.SHARD;
  const gy = A && A.groundH ? A.groundH(car.position.x, car.position.z) : car.position.y;
  for (let i = 0; i < n; i++) {
    const w = WIN[Math.random() < 0.6 ? near : (Math.random() * 4) | 0];
    const ax = w[0] + (w[3] ? rnd(-W * 0.7, W * 0.7) : 0), az = w[1] + (w[2] ? rnd(-0.6, 0.6) : 0);
    const ox = w[2] + rnd(-0.7, 0.7), oz = w[3] + rnd(-0.7, 0.7), sp = rnd(SH.OUT[0], SH.OUT[1]);
    // в мир: x' = x cos + z sin, z' = −x sin + z cos (поворот машины rotation.y)
    const px = car.position.x + ax * c + az * s, pz = car.position.z - ax * s + az * c;
    const vx = (ox * c + oz * s) * sp + vx0, vz = (-ox * s + oz * c) * sp + vz0;
    const life = rnd(SH.LIFE[0], SH.LIFE[1]);
    FXP.part('spark', px, car.position.y + y + rnd(-0.15, 0.2), pz, GLASS_HEX[(Math.random() * GLASS_HEX.length) | 0], rnd(SH.S[0], SH.S[1]), 1,
      { vx, vy: rnd(SH.UP[0], SH.UP[1]), vz, life, max: life, gravity: 15, spin: rnd(-25, 25), keep: i % 2 === 0 }, gy);
  }
  ST.shards += n;
  return n;
}

/* какая крышка открылась: корма — багажник, морда — капот, бок — дверь (у коробочных), иначе ближайшее из есть */
function popLid (u, lx, lz) {
  const L = CFX.LID, hl = u.hl || 2.1, W = (u.W || 1.8) / 2;
  const end = Math.abs(lz) / hl >= Math.abs(lx) / W;
  const rear = u.trunk && !u.trunk.lost ? 'trunk' : u.rdoor ? 'rdoor' : null;
  const hood = u.hood && u.hood.m && u.hood.m.parent ? 'hood' : null;
  const door = !u.real && (u.panels || []).some(p => /^door[LR]$/.test(p.m.name)) ? 'door' : null;
  const pref = end ? (lz < 0 ? [rear, hood] : [hood, rear]) : Math.random() < 0.5 ? [door, rear, hood] : [door, hood, rear];
  const k = pref.find(Boolean);
  if (!k) return null;
  const hold = rnd(L.HOLD[0], L.HOLD[1]);
  if (k === 'trunk') lidPop(u.trunk, rnd(L.TRUNK[0], L.TRUNK[1]), hold);
  else if (k === 'rdoor') lidPop(u.rdoor, rnd(L.RDOOR[0], L.RDOOR[1]), hold);
  else if (k === 'hood') swing(u.hood, u.hood.m, rnd(L.HOOD[0], L.HOOD[1]), hold, 'hood', 0);
  else {
    const ps = u.panels.filter(p => /^door[LR]$/.test(p.m.name));
    let p = ps[0];
    for (const q of ps) if (Math.sign(q.m.position.x) === Math.sign(lx)) p = q;
    swing(p, p.m, rnd(L.DOOR[0], L.DOOR[1]), hold, 'door', Math.sign(p.m.position.x) || 1);
  }
  ST.lids[k]++;
  return k;
}

/* капот / дверь коробочного кузова: o — где держать состояние, m — меш; side 0 — капот (петля сзади, вверх), ±1 — дверь
   (петля спереди, наружу на сторону side) */
const SW = [];
function swing (o, m, angle, hold, kind, side) {
  let w = SW.find(q => q.m === m);
  if (!w) {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    w = { o, m, kind, side, a: 0, want: 0, t: 0, len: kind === 'hood' ? (o.len || b.max.z - b.min.z) : b.max.z - b.min.z,
      x: m.position.x, y: m.position.y, z: m.position.z, rx: m.rotation.x, ry: m.rotation.y };
    SW.push(w);
  }
  w.want = Math.max(w.want, angle); w.t = Math.max(w.t, hold);
}
function swingStep (w, dt) {
  if (w.t > 0) { w.t -= dt; if (w.t <= 0) w.want = 0; }
  w.a += (w.want - w.a) * Math.min(1, dt * CFX.LID.K);
  const m = w.m, a = w.a, h = w.len / 2;
  if (w.kind === 'hood') {
    m.rotation.x = w.rx - a; m.position.y = w.y + Math.sin(a) * h; m.position.z = w.z - h + Math.cos(a) * h;
  } else {
    m.rotation.y = w.ry - w.side * a; m.position.x = w.x + w.side * Math.sin(a) * h; m.position.z = w.z + h - Math.cos(a) * h;
  }
  if (w.want === 0 && a < 0.01) {                   // захлопнулось: ровно на место
    m.rotation.x = w.rx; m.rotation.y = w.ry; m.position.set(w.x, w.y, w.z);
    slam(m);
    return false;
  }
  return true;
}
function slam (m) {
  ST.shut++;
  const car = CAR, Snd = A && A.Snd;
  if (Snd && car) Snd.fx('door-close', s => s.blip(120, 0.08, 'square', 0.07), { x: car.position.x, z: car.position.z });
}

/* ─── «Семёрка»: крышка багажника и капот — свой кусок кузова ─── */
/* область крышки в осях модели (до увеличения k): z от–до, y от–до, |x| до, ny — грань смотрит вверх не меньше;
   петля — у какого края по длине (trunk — передний, hood — задний) */
const RLID = {
  trunk: { z: [-1.99, -1.04], y: [0.8, 1.02], x: 0.68, ny: 0.45, hinge: 'front' },
  hood: { z: [0.92, 2.0], y: [0.86, 1.06], x: 0.72, ny: 0.45, hinge: 'back' },
};
function realLids (car) {
  const R = car.userData.real;
  if (!R || R.lids !== undefined) return R ? R.lids : null;
  R.lids = null;
  let body = null;
  R.m.traverse(o => { if (o.isMesh && o.name === 'real:Car_CarBody_0') body = o; });
  if (!body || !body.geometry.index) return null;
  const g = body.geometry, P = g.attributes.position, I = g.index.array, n = I.length / 3;
  const own = new Uint8Array(n), lidOf = new Array(n), lids = {};
  for (const key in RLID) {
    const Q = RLID[key], tri = [];
    let z0 = 9, z1 = -9, yAt0 = 0, yAt1 = 0;
    for (let t = 0; t < n; t++) {
      if (own[t]) continue;
      let ok = true;
      for (let j = 0; j < 3 && ok; j++) {
        const i = I[t * 3 + j], x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        ok = z >= Q.z[0] && z <= Q.z[1] && y >= Q.y[0] && y <= Q.y[1] && Math.abs(x) <= Q.x;
      }
      if (!ok) continue;
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a);
      const vx = P.getX(c) - P.getX(a), vy = P.getY(c) - P.getY(a), vz = P.getZ(c) - P.getZ(a);
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      if (Math.abs(ny / l) < Q.ny) continue;
      own[t] = 1; lidOf[t] = key; tri.push(t);
      for (const i of [a, b, c]) {
        const z = P.getZ(i), y = P.getY(i);
        if (z < z0) { z0 = z; yAt0 = y; }
        if (z > z1) { z1 = z; yAt1 = y; }
      }
    }
    if (tri.length < 6) continue;
    const idx = new (I.constructor)(tri.length * 3);
    tri.forEach((t, k) => { idx[k * 3] = I[t * 3]; idx[k * 3 + 1] = I[t * 3 + 1]; idx[k * 3 + 2] = I[t * 3 + 2]; });
    const lg = new g.constructor();
    for (const name in g.attributes) lg.setAttribute(name, g.attributes[name]);   // вершины общие: вмятины — и на крышке
    lg.setIndex(new g.index.constructor(idx, 1));
    lg.boundingSphere = g.boundingSphere;
    const m = new body.constructor(lg, body.material);
    m.name = 'real:lid-' + key;
    const hz = Q.hinge === 'front' ? z1 : z0, hy = Q.hinge === 'front' ? yAt1 : yAt0;
    const pv = new body.parent.constructor();       // Group / Object3D — петля
    pv.position.set(0, hy, hz);
    m.position.set(0, -hy, -hz);
    pv.add(m); pv.visible = false;
    body.parent.add(pv);
    lids[key] = { pv, tri: tri.length, a: 0, sign: Q.hinge === 'front' ? 1 : -1 };
  }
  if (!Object.keys(lids).length) return null;
  // кузов без открытых крышек: индекс на каждое сочетание — один раз (пока закрыты и бамперы на месте — прежний, целиком).
  // cut — треугольники, вырезанные навсегда (бампер улетел: realcar.js bumper → trim, 0п30) — их нет ни в одном сочетании
  const full = g.index, cut = new Uint8Array(n);
  let cache = { '': full };
  const without = keys => {
    const k = keys.join('+');
    if (cache[k]) return cache[k];
    const drop = cut.slice();
    for (const key of keys) for (let t = 0; t < n; t++) if (lidOf[t] === key) drop[t] = 1;
    let m = 0;
    for (let t = 0; t < n; t++) if (!drop[t]) m++;
    const out = new (I.constructor)(m * 3);
    let j = 0;
    for (let t = 0; t < n; t++) if (!drop[t]) { out[j++] = I[t * 3]; out[j++] = I[t * 3 + 1]; out[j++] = I[t * 3 + 2]; }
    return (cache[k] = new full.constructor(out, 1));
  };
  /* вырезать навсегда треугольники, где test(a, b, c) (номера вершин) — кроме крышек; вернуть их вершины подряд */
  const trim = test => {
    const out = [];
    for (let t = 0; t < n; t++) {
      if (cut[t] || lidOf[t]) continue;
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (test(a, b, c)) { cut[t] = 1; out.push(a, b, c); }
    }
    if (out.length) { cache = {}; g.setIndex(without(R.lids.shown ? R.lids.shown.split('+') : [])); }
    return out;
  };
  R.lids = { body, lids, without, trim, shown: '' };
  ST.real++;
  return R.lids;
}
/* угол крышек «Семёрки» — как у спрятанных крышек старого кузова */
function realStep (car) {
  const u = car.userData, RL = realLids(car);
  if (!RL) return;
  const tr = u.trunk && !u.trunk.lost ? u.trunk.a || 0 : u.rdoor ? u.rdoor.a || 0 : 0;
  const hw = SW.find(w => w.kind === 'hood' && w.o === u.hood);
  const want = { trunk: tr, hood: hw ? hw.a : 0 };
  const open = [];
  for (const key in RL.lids) {
    const L = RL.lids[key], a = want[key] || 0;
    L.pv.visible = a > 0.01;
    if (L.pv.visible) { L.pv.rotation.x = L.sign * a; open.push(key); }
  }
  const k = open.join('+');
  if (k !== RL.shown) { RL.body.geometry.setIndex(RL.without(open)); RL.shown = k; }
}

/** каждый кадр */
export function step (dt, car) {
  T += dt;
  if (car !== CAR) { CAR = car; SW.length = 0; RD.a = 0; }
  if (!car) return;
  const u = car.userData;
  lidTick(u.trunk, dt);
  lidTick(u.rdoor, dt);
  // задняя дверь хэтчбека: захлопнулась — стук (крышка багажника стучит сама, game.js updateTrunk)
  if (u.rdoor) { const a = u.rdoor.a || 0; if (RD.a > 0.05 && a < 0.02) slam(u.rdoor.m); RD.a = a; }
  for (let i = SW.length - 1; i >= 0; i--) if (!swingStep(SW[i], dt)) SW.splice(i, 1);
  if (u.real) realStep(car);
}
const RD = { a: 0 };

export const DEBUG = {
  CFX, ST, RLID, hit,
  state () {
    const car = CAR, u = car && car.userData;
    if (!u) return null;
    const RL = u.real && u.real.lids;
    return {
      trunk: u.trunk ? { a: +(u.trunk.a || 0).toFixed(2), ajar: +(u.trunk.ajar || 0).toFixed(2), t: +(u.trunk.ajT || 0).toFixed(2), lost: !!u.trunk.lost } : null,
      rdoor: u.rdoor ? { a: +(u.rdoor.a || 0).toFixed(2), ajar: +(u.rdoor.ajar || 0).toFixed(2) } : null,
      swing: SW.map(w => ({ kind: w.kind, a: +w.a.toFixed(2), t: +w.t.toFixed(2) })),
      real: RL ? { shown: RL.shown, lids: Object.fromEntries(Object.entries(RL.lids).map(([k, L]) => [k, { tri: L.tri, open: L.pv.visible, a: +L.pv.rotation.x.toFixed(2) }])) } : null,
      shardsAlive: FXP.count('spark'),
    };
  },
};
