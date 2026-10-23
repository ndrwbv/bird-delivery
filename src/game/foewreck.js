/* ──────────────────────────────────────────────────────────────────────────
   Чужие машины мнутся и бьются (12ар, 23.10.2026; автор 21.10 и 23.10: «ударенная машина мнётся в месте удара,
   стёкла трескаются и бьются, фары гаснут, на сильном ударе отлетают колёса и бамперы; внутри сидит водитель;
   автобусы и грузовики тоже реагируют»). Правила словами — docs/CAREER.md «Чужие машины мнутся и бьются»,
   модели — docs/CARS3D.md.

   • Подробная копия (как своя). Машины города рисуются облегчёнными (поток — склейкой в один-два меша или
     облегчённой «Семёркой», стоящие — склейкой на весь квартал). Ударил с FW.MIN м/с — ударенная (если она среди
     FW.SLOTS ближних ударенных) получает подробную копию: коробочная — makeCar с частой сеткой и салоном со
     стёклами (opts.dent: мнётся вершинами, бампер и колпаки отлетают — cardent.js, стёкла по одному — carglass.js),
     «Семёрка» — полная модель (realcar.js detail: стёкла по одному, четыре колеса, бампер вырезается).
     Удары по ней — как по своей. Дальше FW.FAR м — копию возвращаем: «Семёрка» — облегчённая (она мялась вместе
     с копией), коробочная — обычная полная модель, на которой повторены прежние удары (битая так и остаётся).
   • Сильный удар у колеса (FW.WHEEL м/с, ближе FW.WHEEL_R) — колесо отлетает; в морду или корму (FW.BUMPER) —
     бампер (у «Семёрки» — вырезан из кузова). Разбилось стекло — осколки (pixfx.js) и звон (impact.js).
   • Водитель. Внутри машины потока сидит конкретный человек (personOf — тот же, что выйдет): у «Семёрки» —
     человек Quaternius в позе «сидит» (как курьер своей, cardriver.js), у коробочной — коробочный в его одежде.
     Виден через стекло только в подробной копии. Вышел — сиденье пустое, вернулся — снова за рулём.
     Выходит разбираться не всегда (FW.OUT); вышел — один из трёх (FW.VAR): пинает твою машину (клип Kick_Right),
     бьёт ногой лобовое (трескается с первого, бьётся с третьего удара), запрыгивает на капот и прыгает (вмятины
     на капоте; поехал быстрее ATK.FALL_V — свалился).
   • Автобусы и самосвалы (big): не отлетают, но качаются (пружина, BIG.K / BIG.DAMP), мнутся у места удара (своя
     сетка у этого автобуса), на стёклах — трещины (одна сетка на машину, до BIG.MAXCR), фары и фонари гаснут.
   Кадр: подробная копия собирается в момент удара (раз на машину); в покадровом — только качка больших, водители,
   выселение дальних (раз в FW.TICK с). Новых программ шейдеров нет (материалы — те же, что у своей и у облегчённых;
   трещины больших — материал стёкол салона, прогрев — warmup.js).

     init(api)                    — game.js
     pre(t, v)                    — до fullCar в ударе машины курьера: решить, нужна ли подробная копия
     post(t, wx, wz, v, nx, nz)   — после dentCar: колёса, бампер, осколки, учёт удара
     big(t, wx, wz, v)            — удар автобуса / самосвала (buses.js hit, game.js)
     personOf(t), out(t), variant() — водитель: кто он, выйдет ли, что будет делать
     aim(d), attack(d, dt), drive(d, dt) — водитель у твоей машины (game.js updateDrivers)
     forget(t)                    — машину переставили / убрали (respawnTraffic, placeTraffic, svcGone)
     step(dt)                     — каждый кадр
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as REALCAR from './realcar.js';
import * as CG from './carglass.js';
import * as DENTM from './cardent.js';
import * as PIX from './pixfx.js';
import { glass as glassSnd } from './impact.js';
import { qHas } from './qpeople.js';

export const FW = {
  ON: !(typeof location !== 'undefined' && /[?&]nofw\b/.test(location.search || '')),   // ?nofw — как было до 12ар (для сравнения)
  SLOTS: 4,             // подробных копий одновременно (ближние ударенные)
  MIN: 5,               // м/с — с такого удара подробная копия
  FAR: 90,              // м — дальше копию возвращаем
  TICK: 0.5,            // с — как часто проверять дальних
  HITS: 6,              // сколько последних ударов помнить (повтор на новой модели)
  WHEEL: 21, WHEEL_R: 1.25,   // м/с у колеса (ближе WHEEL_R м по земле) — колесо отлетает
  BUMPER: 17,           // м/с в морду / корму — бампер «Семёрки» отлетает (коробочные — cardent.js PART.BUMPER, те же 17)
  OUT: 0.6,             // шанс, что водитель выйдет разбираться (иначе — едет дальше)
  VAR: { kick: 0.45, glass: 0.3, hood: 0.25 },   // что делает вышедший
  SEAT: { X: 0.43, Y: 0.17, Z: -0.08, LEG: -1.45, ARM: -0.8 },   // водитель «Семёрки» — как курьер своей (cardriver.js DRV)
  ATK: {
    KICK_T: 0.95, KICK_AT: 0.42, KICK_F: 8,      // пинок: период, с; в какой доле клипа удар; сила мятины, м/с
    GLASS_T: 1.05, GLASS_AT: 0.45, CRACK_F: 10, BREAK_F: 16, BREAK_N: 3,   // лобовое: 1-й удар — трещины, BREAK_N-й — вдребезги
    CLIMB: 0.45, JUMP_T: 0.8, JUMP_H: 0.6, HOOD_F: 7, FALL_V: 5, HOOD_STAND: 2,   // капот: залез за CLIMB с; прыжок; мятина; свалился, если поехал быстрее FALL_V м/с; запрыгивает, если машина медленнее HOOD_STAND
    HURT_N: 3,          // каждый такой удар — ещё и сердце (как раньше у кулаков)
  },
  BIG: {
    SWAY: 0.024, SWAY_MAX: 0.5,  // качка: толчок угловой скорости, рад/с на м/с удара (не больше SWAY_MAX)
    K: 40, DAMP: 3.2,            // пружина качки: жёсткость и затухание
    DENT_MIN: 4, DENT_FULL: 24, DEPTH: 0.22, R0: 0.5, R1: 0.7, IN: 0.35,   // вмятина: с какой силы, во всю глубину DEPTH м, радиус, глубже IN от края не мнётся
    CRACK: 7, BREAK: 15, MAXCR: 6, CR0: 0.75, CR1: 1.25,   // трещины на стекле: с CRACK м/с; с BREAK — крупнее (размер CR1 м) и осколки
    LAMP: 8, BOTH: 16,           // фара / фонарь гаснет с LAMP м/с у угла, обе на этом конце — с BOTH
  },
};
export const ST = { buildMs: 0, buildMax: 0, det: 0, real: 0, boxy: 0, back: 0, evict: 0, wheels: 0, bumpers: 0, panes: 0, shards: 0, seated: 0,
  out: 0, stay: 0, kick: 0, glass: 0, hood: 0, kicks: 0, glassHits: 0, ownCrack: 0, ownBreak: 0, jumps: 0, falls: 0,
  big: 0, bigDent: 0, bigCrack: 0, bigLamp: 0, sway: 0, swayMax: 0 };

let A = null;
export function init (api) { A = api; }

const REC = new WeakMap();                         // машина → { hits, person, kind, det, seat }
const DETS = [];                                    // машины с подробной копией
const rec = t => { let r = REC.get(t); if (!r) REC.set(t, r = { hits: [], person: null, kind: '', det: false, seat: null, bump: 0 }); return r; };
const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

/* в оси машины (как dentCar): x — влево по ходу, z — вперёд */
function toLocal (g, wx, wz) {
  const dx = wx - g.position.x, dz = wz - g.position.z, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
  return [dx * c - dz * s, dx * s + dz * c];
}
function toWorld (g, lx, lz) {
  const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
  return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c];
}

export const isBig = t => FW.ON && !!(t && (t.bus || t.model === 'dump'));
const okCar = t => t && t.mesh && !t.bus && !t.gone && !t.accident && !t.tow && !t.rival && !t.svc && !t.chase && !t.bcar && !t.hb && !t.mp && t.model !== 'moped' && t.model !== 'dump' && !(t.mesh.userData && t.mesh.userData.full);

/* ─── водитель ─── */
export function personOf (t) {
  if (!t || t.parked) return null;
  const r = rec(t);
  if (!r.person && A && A.person) r.person = A.person();
  return r.person;
}
export function out (t) {
  if (!FW.ON) return true;
  const go = Math.random() < FW.OUT;
  if (go) ST.out++; else ST.stay++;
  return go;
}
export function variant () {
  if (!FW.ON) return null;
  let x = Math.random() * (FW.VAR.kick + FW.VAR.glass + FW.VAR.hood);
  for (const k of ['kick', 'glass', 'hood']) { if ((x -= FW.VAR[k]) < 0) { ST[k]++; return k; } }
  ST.kick++; return 'kick';
}
const drvLook = p => { const L = p && p.look; return L ? { shirt: (L.top === 'jacket' ? L.jacket : L.shirt) || '#5a6a7a', skin: L.skin || '#e2b48c', hair: L.hairC || '#3a2a20' } : null; };

/* посадить человека Quaternius за руль подробной «Семёрки» */
function seatReal (t, r) {
  const p = personOf(t);
  if (!p || !A.makeHuman) return;
  const L = p.look || {};
  const g = A.makeHuman(p, { shirt: L.shirt, pants: L.pants });
  if (!g || !g.userData.q) { if (g && A.dropMesh) A.dropMesh(g); return; }   // люди коробочные (?qp=0) — без водителя
  const S = FW.SEAT, h = g.userData;
  g.position.set(S.X, S.Y, S.Z);
  h.legL.rotation.x = S.LEG; h.legR.rotation.x = S.LEG;
  h.armL.rotation.x = S.ARM; h.armR.rotation.x = S.ARM;
  t.mesh.add(g);
  const u = t.mesh.userData;
  u._pose = undefined;                              // стоящая — пересчитать матрицы (cull.js moved)
  t.mesh.updateMatrixWorld(true);
  (u.men || (u.men = [])).push(g);                 // game.js dropMen: отдаст людям, когда машину перекрасят (взрыв) или выбросят
  r.seat = g;
  ST.seated++;
}
function unseat (t, r) {
  const g = r.seat;
  r.seat = null;
  if (!g) return;
  const u = t.mesh && t.mesh.userData;
  if (u && u.men) { const i = u.men.indexOf(g); if (i >= 0) u.men.splice(i, 1); }
  if (g.parent) { g.parent.remove(g); if (A.dropMesh) A.dropMesh(g); }
}

/* ─── подробная копия ─── */
const dist2 = t => (t.x - A.V.x) ** 2 + (t.z - A.V.z) ** 2;
function slot (t) {
  if (DETS.length < FW.SLOTS) return true;
  let far = null, fd = -1;
  for (const o of DETS) { const d = dist2(o); if (d > fd) { fd = d; far = o; } }
  if (!far || fd <= dist2(t) + 25) return false;   // все ударенные ближе этой — пусть эта остаётся облегчённой
  evict(far);
  return true;
}
export function pre (t, v) {
  if (!A || !FW.ON || !(v >= FW.MIN) || !okCar(t)) return;
  const r = rec(t);
  if (r.det || !slot(t)) return;
  const u = t.mesh.userData, t0 = performance.now();
  if (u.realLite) {
    if (!REALCAR.detail(t.mesh)) return;
    const R2 = t.mesh.userData.real, R1 = R2.lite;
    R2.lite = null;                                 // прежние удары — только на копии (облегчённая их уже помнит)
    for (const h of r.hits) REALCAR.dent(t.mesh, h[0], h[1], h[2]);
    R2.lite = R1; R2.broke.length = 0;
    // стёкла облегчённой были одной сеткой: разбиты — нет ни одного, в трещинах — все
    const lg = R1.glass[0];
    if (lg && !lg.visible) for (const k in R2.panes) { R2.panes[k].st = 2; R2.panes[k].m.visible = false; }
    r.kind = 'real'; ST.real++;
    if (!t.parked) seatReal(t, r);
  } else {
    if (!A.swap(t, true, r.hits, t.parked ? null : drvLook(personOf(t)))) return;
    r.kind = 'boxy'; ST.boxy++;
    r.seat = t.mesh.userData.seat || null;
    rearLamps(t.mesh);
  }
  r.det = true;
  DETS.push(t);
  ST.det++;
  ST.buildMs = performance.now() - t0; ST.buildMax = Math.max(ST.buildMax, ST.buildMs);
}
/* коробочная: задние фонари — в склейке кузова (carglass.js их не находит) — вершины их цвета, чтобы бились */
const TAIL = new THREE.Color('#e8323c');
function rearLamps (g) {
  const u = g.userData;
  CG.lampState(g);                                  // собрать фары (lampsOf), дальше дописать фонари
  const L = u.lamps, bm = g.children.find(c => c.isMesh && c.userData.bulk);
  if (!L || !bm || L.rl || L.rr) return;
  const col = bm.geometry.attributes.color, pos = bm.geometry.attributes.position, hl = u.hl || 2;
  if (!col) return;
  const per = { rl: [], rr: [] }, c = { rl: [0, 0, 0], rr: [0, 0, 0] };
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - TAIL.r) > 0.02 || Math.abs(col.getY(i) - TAIL.g) > 0.02 || Math.abs(col.getZ(i) - TAIL.b) > 0.02) continue;
    const z = pos.getZ(i);
    if (z > -hl * 0.6) continue;
    const k = pos.getX(i) > 0 ? 'rl' : 'rr';
    per[k].push(i); c[k][0] += pos.getX(i); c[k][1] += pos.getY(i); c[k][2] += z;
  }
  for (const k of ['rl', 'rr']) {
    const n = per[k].length;
    if (!n) continue;
    L[k] = { k, st: 0, n, x: c[k][0] / n, y: c[k][1] / n, z: c[k][2] / n, parts: [{ m: bm, idx: per[k] }] };
  }
}
/* вернуть облегчённую (keep — машина остаётся на месте: коробочную — обычной полной с прежними ударами) */
function evict (t, keep = true) {
  const r = REC.get(t), i = DETS.indexOf(t);
  if (i >= 0) DETS.splice(i, 1);
  if (!r || !r.det) return;
  r.det = false;
  if (r.kind === 'real') { unseat(t, r); if (t.mesh) REALCAR.undetail(t.mesh); }
  else { r.seat = null; if (keep && !t.gone && t.mesh && t.mesh.userData.dent) A.swap(t, false, r.hits, null); }
  if (keep) ST.evict++;
  ST.back++;
}
export function forget (t) {
  const r = REC.get(t);
  if (!r) return;
  if (r.det) evict(t, false);                       // убирают или переставляют — заново не собираем
  REC.delete(t);
}

/* после удара: учёт, колёса, бампер, стёкла «Семёрки» */
export function post (t, wx, wz, v, nx = 0, nz = 0) {
  if (!A || !FW.ON || !okCar(t)) return;
  const g = t.mesh, r = rec(t), [lx, lz] = toLocal(g, wx, wz);
  r.hits.push([lx, lz, v]);
  if (r.hits.length > FW.HITS) r.hits.shift();
  if (!r.det) return;
  const u = g.userData, R = u.real && u.real.detail ? u.real : null;
  // стёкла «Семёрки» (realcar.js paneGlass): разбитые — осколки и звон
  if (R && R.broke.length) {
    for (const m of R.broke) shardsAt(g, m, 12);
    glassSnd(R.broke.length, 0, 0, { x: wx, z: wz });
    ST.panes += R.broke.length;
    R.broke.length = 0;
  }
  const hl = u.hl || 2.2, W2 = R ? R.C.box.W2 * R.C.k : (u.W || 1.8) / 2;
  const cr = Math.cos(g.rotation.y), sr = Math.sin(g.rotation.y), ox = nx * cr - nz * sr, oz = nx * sr + nz * cr;   // от тебя — в осях машины: туда летят детали
  // колесо
  if (v >= FW.WHEEL) {
    let best = null, bd = FW.WHEEL_R, key = '';
    if (R) {
      for (const k in R.wheelG) {
        const w = R.wheelG[k], p = w.position, d = Math.hypot(p.x * R.C.k - lx, p.z * R.C.k - lz);
        if (w.userData.lost || d >= bd) continue;
        bd = d; best = w; key = k;
      }
      if (best) {
        best.userData.lost = 1;
        const m = best.children[0] && best.children[0].children[0];
        if (m && m.isMesh) { m.geometry = m.geometry.clone(); m.userData.keepMat = 1; DENTM.fling(g, m, 'wheel', ox, oz, v); ST.wheels++; }
      }
    } else if (u.wheels) {
      for (const w of u.wheels) {
        const p = w.parent && w.parent.position;
        if (!p) continue;
        const d = Math.hypot(p.x - lx, p.z - lz);
        if (d < bd) { bd = d; best = w; }
      }
      if (best) { u.wheels.splice(u.wheels.indexOf(best), 1); DENTM.fling(g, best, 'wheel', ox, oz, v); ST.wheels++; }
    }
  }
  // бампер «Семёрки» (коробочные — cardent.js сам)
  if (R && v >= FW.BUMPER && Math.abs(lz) / hl >= Math.abs(lx) / W2) {
    const m = REALCAR.bumper(g, lz > 0 ? 'f' : 'r');
    if (m) { m.userData.keepMat = 1; DENTM.fling(g, m, 'bumper', 0, lz > 0 ? 1 : -1, v); ST.bumpers++; }
  } else if (!R && u.lost) {                       // коробочная: бампер сносит cardent.js — только считаем
    const n = (u.lost.bumperF ? 1 : 0) + (u.lost.bumperR ? 1 : 0);
    if (n > (r.bump || 0)) { ST.bumpers += n - (r.bump || 0); r.bump = n; }
  }
}
function shardsAt (g, m, n) {
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  m.updateMatrixWorld(true);
  const c = _v.copy(m.geometry.boundingSphere.center).applyMatrix4(m.matrixWorld);
  const floor = g.position.y + 0.02;
  for (let i = 0; i < n; i++) {
    const sp = 1.5 + Math.random() * 2.5, a = Math.random() * Math.PI * 2;
    PIX.spawn(c.x + rnd(-0.3, 0.3), c.y + rnd(-0.2, 0.2), c.z + rnd(-0.3, 0.3), { vx: Math.cos(a) * sp, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * sp,
      s: 0.06 + Math.random() * 0.07, life: 2.5 + Math.random() * 2, hex: Math.random() < 0.5 ? 0xcfeaff : 0xa8d0ec, g: 16, floor });
  }
  ST.shards += n;
}

/* ─── водитель у твоей машины (game.js updateDrivers) ─── */
const carHW = u => (u.real ? REALCAR.MODELS.semerka.box.W2 * (u.real.C ? u.real.C.k : 1.2) : (u.W || 1.8) / 2);
const carCF = u => (u.cg && u.cg.S ? u.cg.S.cz + u.cg.S.cab / 2 : 0.8);
/* где ему встать: kick — у ближнего борта, glass — у лобового с его стороны, hood — перед капотом */
export function aim (d) {
  const car = A.car(), u = car.userData, hl = u.hl || 2.2, hw = carHW(u);
  if (!d.fw) return { x: car.position.x, z: car.position.z, r: 2.6 };   // ?nofw — как было: к середине машины
  const [lx, lz] = toLocal(car, d.x, d.z), sd = lx >= 0 ? 1 : -1;
  let px, pz, r;
  if (d.fw === 'hood') { px = 0; pz = hl + 0.85; r = 0.8; }
  else if (d.fw === 'glass' && !d.fwDone) { px = sd * (hw + 0.5); pz = carCF(u) - 0.2; r = 0.55; }
  else {
    // ближняя точка снаружи кузова
    const cz = Math.max(-hl - 0.5, Math.min(hl + 0.5, lz)), inEnd = Math.abs(lz) > hl;
    px = inEnd ? Math.max(-hw, Math.min(hw, lx)) : sd * (hw + 0.5); pz = inEnd ? Math.sign(lz) * (hl + 0.5) : cz; r = 0.6;
  }
  const [x, z] = toWorld(car, px, pz);
  return { x, z, r };
}
/* дошёл: что дальше — бить (hit) или лезть на капот (hood, только если машина почти стоит) */
export function reach (d) {
  if (d.fw === 'hood') {
    if (Math.hypot(A.V.vx, A.V.vz) > FW.ATK.HOOD_STAND) return 'chase';
    d.fwT = 0; d.fwN = 0; d.fwY = d.grp.position.y;
    return 'hood';
  }
  d.fwT = 0; d.fwP = 0;
  return 'hit';
}
/* пинает машину или лобовое (d.state 'hit'): true — сделал всё сам */
export function attack (d, dt) {
  if (!A || !d.fw || d.fw === 'hood') return false;
  const car = A.car(), u = d.grp.userData, P = aim(d);
  const dx = P.x - d.x, dz = P.z - d.z;
  if (Math.hypot(dx, dz) > P.r + 0.9) { d.state = 'chase'; u.qAnim = null; return true; }
  // лицом к машине (к её середине у лобового — к стеклу)
  const tx = d.fw === 'glass' && !d.fwDone ? toWorld(car, 0, carCF(car.userData) - 0.1) : [car.position.x, car.position.z];
  const fx = tx[0] - d.x, fz = tx[1] - d.z, ya = Math.atan2(fx, fz);
  d.grp.rotation.y += Math.atan2(Math.sin(ya - d.grp.rotation.y), Math.cos(ya - d.grp.rotation.y)) * Math.min(1, dt * 10);
  const glass = d.fw === 'glass' && !d.fwDone, K = FW.ATK, T = glass ? K.GLASS_T : K.KICK_T, AT = glass ? K.GLASS_AT : K.KICK_AT;
  d.fwT += dt;
  const f = Math.min(1, d.fwT / T), c = qHas(d.grp, 'kick') ? 'kick' : 'punch';
  u.qAnim = { c, f, fw: 1 };
  if (!d.fwP && f >= AT) {
    d.fwP = 1; d.strikes++;
    const l = Math.hypot(fx, fz) || 1, hx = d.x + fx / l * 0.7, hz = d.z + fz / l * 0.7;
    if (glass) {
      d.fwN = (d.fwN || 0) + 1;
      const st = A.ownGlass(d.fwN >= K.BREAK_N ? K.BREAK_F : K.CRACK_F, d.fwN === 1 || d.fwN >= K.BREAK_N);
      ST.glassHits++;
      if (st === 1) ST.ownCrack++;
      if (st === 2) { ST.ownBreak++; d.fwDone = 1; }
      A.thud(hx, hz, 0.22);
    } else {
      A.dentCar(car, hx, hz, K.KICK_F);
      ST.kicks++;
      A.thud(hx, hz, 0.18);
    }
    if (d.strikes % K.HURT_N === 0) A.hurtCar(1, 14, hx, hz, 'person');
  }
  if (d.fwT >= T) { d.fwT = 0; d.fwP = 0; }
  return true;
}
/* на капоте (d.state 'hood'): прыгает, мнёт капот; поехал — свалился. true — водителя обработали целиком */
export function drive (d, dt) {
  if (!A) return false;
  const u = d.grp.userData;
  if (d.state !== 'hit' && d.state !== 'hood' && u.qAnim && u.qAnim.fw) u.qAnim = null;
  if (d.state !== 'hood') return false;
  const car = A.car(), cu = car.userData, K = FW.ATK, hl = cu.hl || 2.2;
  const top = cu.real ? 1.12 : (cu.y0 || 0.65) + 0.36, hz = cu.hood ? cu.hood.z : hl * 0.62;
  d.give -= dt;
  d.fwT += dt;
  const sp = Math.hypot(A.V.vx, A.V.vz);
  let y = top, legs = -0.15, arms = -2.7;
  if (d.fwT < K.CLIMB) {                            // залезает: из-под носа на капот
    const k = d.fwT / K.CLIMB;
    y = top * k + Math.sin(k * Math.PI) * 0.35;
    legs = -0.9 * (1 - k);
  } else {
    const ph = (d.fwT - K.CLIMB) / K.JUMP_T, f = ph % 1, n = Math.floor(ph);
    y = top + K.JUMP_H * Math.sin(f * Math.PI);
    legs = -0.6 * (1 - Math.sin(f * Math.PI));     // приземлился — присел
    if (n > d.fwN) {                                // приземление: мнёт капот
      d.fwN = n; d.strikes++; ST.jumps++;
      const [wx, wz] = toWorld(car, 0, hz);
      A.dentCar(car, wx, wz, K.HOOD_F);
      A.thud(wx, wz, 0.28);
      if (d.strikes % K.HURT_N === 0) A.hurtCar(1, 14, wx, wz, 'person');
    }
  }
  const [wx, wz] = toWorld(car, 0, d.fwT < K.CLIMB ? hz + (hl + 0.85 - hz) * (1 - d.fwT / K.CLIMB) : hz);
  d.x = wx; d.z = wz;
  d.grp.position.set(wx, car.position.y + y, wz);
  d.grp.rotation.y = car.rotation.y + Math.PI;     // лицом к лобовому
  u.legL.rotation.x = legs; u.legR.rotation.x = legs;
  u.armL.rotation.x = arms + Math.sin(d.fwT * 12) * 0.3; u.armR.rotation.x = arms - Math.sin(d.fwT * 12) * 0.3;
  if (sp > K.FALL_V || d.give <= 0 || A.over()) {  // поехал — свалился с капота (или надоело — слез)
    const sd = Math.random() < 0.5 ? -1 : 1, [fx, fz] = toWorld(car, sd * (carHW(cu) + 0.9), hz);
    d.x = fx; d.z = fz;
    d.grp.position.set(fx, A.groundH(fx, fz), fz);
    u.legL.rotation.x = 0; u.legR.rotation.x = 0;
    d.state = 'back';
    if (sp > K.FALL_V) ST.falls++;
  }
  return true;
}

/* ─── автобусы и самосвалы ─── */
const BIGR = new WeakMap();
const DARK = { f: new THREE.Color(0x2a2c31), r: new THREE.Color(0x3b161b) };
const LSH = { f: [0xfff4cf, 0xeaf4ff, 0xffffff], r: [0xe0283a, 0xb81e2c, 0xffa630] };
/* окна: side — по бортам (y от—до, z от—до), front / rear — лобовое и заднее (z, y от—до, |x| до) */
function winsOf (t, bb) {
  if (t.bus) { const hl = t.bus.hl, hw = t.bus.W2; return { hw, hl, side: [1.5, 2.42, -hl + 0.4, hl - 0.3], front: [hl + 0.035, 1.38, 2.42, hw - 0.18], rear: [-hl - 0.035, 1.76, 2.34, hw - 0.4] }; }
  const hw = Math.max(-bb.min.x, bb.max.x), hl = Math.max(-bb.min.z, bb.max.z);
  return { hw, hl, side: [2.08, 2.72, 2.15, 3.05], front: [3.4, 2.08, 2.82, 1.0], rear: null, sideX: 1.25 };   // самосвал (construction.js dumpParts): окна только у кабины
}
function bigRec (t) {
  let r = BIGR.get(t);
  if (r && r.mesh === t.mesh) return r;
  const g = t.mesh;
  const body = g.children.find(c => c.isMesh && c.material && c.material.isMeshLambertMaterial && c.material.vertexColors);
  const lamp = g.children.find(c => c.isMesh && c.visible && c.material && c.material.isMeshBasicMaterial && c.material.vertexColors);
  if (body && !body.geometry.boundingBox) body.geometry.computeBoundingBox();
  r = { mesh: g, body, lamp, ownBody: false, ownLamp: null, rx: 0, rz: 0, wx: 0, wz: 0, appX: 0, appZ: 0, lastX: NaN, lastZ: NaN, cr: null, ncr: 0, dead: {} };
  r.W = winsOf(t, body ? body.geometry.boundingBox : new THREE.Box3(new THREE.Vector3(-1.2, 0, -3.7), new THREE.Vector3(1.2, 3, 3.7)));
  BIGR.set(t, r);
  return r;
}
const BIGS = new Set();
export function big (t, wx, wz, v) {
  if (!A || !FW.ON || !isBig(t) || !t.mesh || !(v >= 2)) return;
  const r = bigRec(t), g = t.mesh, B = FW.BIG, [lx, lz] = toLocal(g, wx, wz), { hw, hl } = r.W;
  const end = Math.abs(lz) / hl >= Math.abs(lx) / hw;
  const nx = end ? 0 : Math.sign(lx) || 1, nz = end ? Math.sign(lz) || 1 : 0;
  ST.big++;
  // качнулся: удар в борт — крен, в морду / корму — клевок
  const w = Math.min(B.SWAY_MAX, v * B.SWAY);
  if (end) r.wx += nz * w * 0.45; else r.wz += nx * w;
  BIGS.add(t);
  // вмятина
  if (v > B.DENT_MIN && r.body) {
    if (!r.ownBody) { if (t.bus) r.body.geometry = r.body.geometry.clone(); r.ownBody = true; }   // у автобусов сетка общая на модель — своя
    const k = Math.min(1, (v - B.DENT_MIN) / (B.DENT_FULL - B.DENT_MIN));
    const cx = end ? Math.max(-hw, Math.min(hw, lx)) : nx * hw, cz = end ? nz * hl : Math.max(-hl, Math.min(hl, lz));
    if (bigDent(r.body.geometry, cx, 0.95, cz, nx, nz, B.DEPTH * k, B.R0 + B.R1 * k, (end ? hl : hw) - B.IN)) ST.bigDent++;
  }
  // трещины на стекле
  if (v >= B.CRACK) crackBig(t, r, end, nx, nz, lx, lz, v);
  // фары и фонари
  if (end && v >= B.LAMP && r.lamp) lampBig(t, r, nz > 0 ? 'f' : 'r', v >= B.BOTH || Math.abs(lx) < 0.3 ? [1, -1] : [Math.sign(lx) || 1]);
}
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function bigDent (geo, cx, cy, cz, nx, nz, depth, rad, lim) {
  const a = geo.attributes.position.array, r2 = rad * rad;
  let moved = 0;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    const out = x * nx + z * nz;
    if (out <= lim) continue;
    const dx = x - cx, dy = (y - cy) * 0.7, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    const q = 1 - Math.sqrt(d2) / rad, h = hash(x, y, z), push = Math.min(depth * q * q * (0.65 + 0.7 * h), out - lim);
    if (push < 1e-4) continue;
    a[i] -= nx * push; a[i + 1] -= push * 0.15 * h; a[i + 2] -= nz * push;
    moved++;
  }
  if (moved) { geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere(); }
  return moved;
}
function crackBig (t, r, end, nx, nz, lx, lz, v) {
  const W = r.W, B = FW.BIG;
  let c, n, ext;                                    // середина, нормаль, полуразмеры окна (вдоль, вверх)
  const s = (v >= B.BREAK ? B.CR1 : B.CR0) / 2;
  if (end) {
    const F = nz > 0 ? W.front : W.rear;
    if (!F) return;
    const x = Math.max(-F[3] + s, Math.min(F[3] - s, lx));
    c = [x, (F[1] + F[2]) / 2 + rnd(-0.15, 0.15), F[0]]; n = [0, 0, nz]; ext = [Math.min(s, F[3]), Math.min(s, (F[2] - F[1]) / 2)];
  } else {
    const S = W.side;
    if (lz < S[2] - 0.5 || lz > S[3] + 0.5) return;  // мимо окон (самосвал — кузов)
    const z = Math.max(S[2] + s, Math.min(S[3] - s, lz));
    c = [nx * ((W.sideX || W.hw) + 0.035), (S[0] + S[1]) / 2 + rnd(-0.15, 0.15), z]; n = [nx, 0, 0]; ext = [Math.min(s, (S[3] - S[2]) / 2), Math.min(s, (S[1] - S[0]) / 2)];
  }
  if (!r.cr) {
    const N = B.MAXCR, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 12), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(N * 8), 2));
    const idx = [];
    for (let q = 0; q < N; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    geo.setIndex(idx);
    r.cr = new THREE.Mesh(geo, CG.glassMat(false));
    r.cr.name = 'foe-cracks';
    r.cr.renderOrder = 2;
    r.cr.frustumCulled = false;
    t.mesh.add(r.cr);
  }
  const q = r.ncr % B.MAXCR, pa = r.cr.geometry.attributes.position, ua = r.cr.geometry.attributes.uv;
  const [ax, az] = n[0] ? [0, 1] : [1, 0], ex = ext[0], ey = ext[1];
  const P = [[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]];
  P.forEach(([a, b], j) => pa.setXYZ(q * 4 + j, c[0] + ax * a, c[1] + b, c[2] + az * a));
  const sh = (q % 3) * 0.04;
  ua.setXY(q * 4, 0.5 + sh, 0); ua.setXY(q * 4 + 1, 1, 0); ua.setXY(q * 4 + 2, 1, 1); ua.setXY(q * 4 + 3, 0.5 + sh, 1);
  pa.needsUpdate = true; ua.needsUpdate = true;
  r.ncr++;
  ST.bigCrack++;
  if (v >= B.BREAK) {                               // вдребезги — осколки
    t.mesh.updateMatrixWorld(true);
    _v.set(c[0], c[1], c[2]).applyMatrix4(t.mesh.matrixWorld);
    const floor = t.mesh.position.y + 0.02, nw = new THREE.Vector3(n[0], 0, n[2]).transformDirection(t.mesh.matrixWorld);
    for (let i = 0; i < 14; i++) PIX.spawn(_v.x + rnd(-0.4, 0.4), _v.y + rnd(-0.3, 0.3), _v.z + rnd(-0.4, 0.4), { vx: nw.x * rnd(1.5, 4) + rnd(-1, 1), vy: rnd(1, 3), vz: nw.z * rnd(1.5, 4) + rnd(-1, 1),
      s: rnd(0.06, 0.13), life: rnd(2.5, 4.5), hex: Math.random() < 0.5 ? 0xcfeaff : 0xa8d0ec, g: 16, floor });
    ST.shards += 14;
    glassSnd(1, 0, 0, { x: _v.x, z: _v.z });
  } else glassSnd(0, 1, 0, { x: t.x, z: t.z });
}
function lampBig (t, r, e, sides) {
  const m = r.lamp;
  if (m.geometry !== r.ownLamp) { m.geometry = m.geometry.clone(); r.ownLamp = m.geometry; r.dead = {}; }   // общая на модель (автобус: фары + табличка) — своя; автобус сменил табличку (buses.js glowFor) — фары снова целые
  const geo = m.geometry, pos = geo.attributes.position, col = geo.attributes.color;
  if (!col) return;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const zE = e === 'f' ? geo.boundingBox.max.z : geo.boundingBox.min.z;
  let n = 0;
  for (const sd of sides) {
    const key = e + sd;
    if (r.dead[key]) continue;
    r.dead[key] = 1;
    let cx = 0, cy = 0, cz = 0, k = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(z - zE) > 0.3 || y > 1.6 || Math.sign(x) !== sd) continue;
      col.setXYZ(i, DARK[e].r, DARK[e].g, DARK[e].b);
      cx += x; cy += y; cz += z; k++;
    }
    if (!k) continue;
    n++;
    t.mesh.updateMatrixWorld(true);
    _v.set(cx / k, cy / k, cz / k).applyMatrix4(t.mesh.matrixWorld);
    const floor = t.mesh.position.y + 0.02, cols = LSH[e];
    for (let i = 0; i < 8; i++) PIX.spawn(_v.x, _v.y, _v.z, { vx: rnd(-2, 2), vy: rnd(0.8, 2.5), vz: rnd(-2, 2), s: rnd(0.05, 0.1), life: rnd(2.5, 4), hex: cols[i % cols.length], g: 16, floor });
  }
  if (n) { col.needsUpdate = true; ST.bigLamp += n; glassSnd(0, 0, n, { x: t.x, z: t.z }); }
}
/* качка: угол + на тот, что поставила поза (poseOnSlope / автобус); поза за кадр не менялась — сперва снять свой прошлый */
function sway (t, r, dt) {
  const B = FW.BIG, m = t.mesh;
  r.wx += (-B.K * r.rx - B.DAMP * r.wx) * dt; r.rx += r.wx * dt;
  r.wz += (-B.K * r.rz - B.DAMP * r.wz) * dt; r.rz += r.wz * dt;
  const rot = m.rotation;
  if (rot.x === r.lastX) rot.x -= r.appX;
  if (rot.z === r.lastZ) rot.z -= r.appZ;
  const quiet = Math.abs(r.rx) + Math.abs(r.rz) + Math.abs(r.wx) + Math.abs(r.wz) < 1e-4;
  if (quiet) { r.rx = r.rz = r.wx = r.wz = 0; }
  rot.x += r.rx; rot.z += r.rz;
  r.appX = r.rx; r.appZ = r.rz; r.lastX = rot.x; r.lastZ = rot.z;
  ST.swayMax = Math.max(ST.swayMax, Math.abs(r.rx), Math.abs(r.rz));
  return !quiet;
}

/* ─── каждый кадр ─── */
let TK = 0, PRE = false;
export function step (dt) {
  if (!A || !(dt > 0)) return;
  if (!PRE) { PRE = true; REALCAR.preloadFull(); }   // полная модель для подробных копий (своя «Семёрка» её уже грузила)
  for (const t of BIGS) {
    const r = BIGR.get(t);
    if (!r || r.mesh !== t.mesh || t.gone || !sway(t, r, Math.min(dt, 0.05))) BIGS.delete(t);
    else ST.sway++;
  }
  // водитель за рулём: вышел — сиденье пустое
  for (const t of DETS) {
    const r = REC.get(t);
    if (!r) continue;
    if (r.seat && !r.seat.parent && r.kind === 'real') r.seat = null;   // машину перекрасил взрыв (dropMen)
    if (r.seat) r.seat.visible = !t.driver && !t.noDriver && !t.wreck && !t.parked;
  }
  if ((TK -= dt) > 0) return;
  TK = FW.TICK;
  for (let i = DETS.length - 1; i >= 0; i--) {
    const t = DETS[i];
    if (t.gone || !t.mesh || dist2(t) > FW.FAR * FW.FAR) evict(t);
  }
}

export const DEBUG = { FW, ST, DETS, rec: t => REC.get(t) || null, big: t => BIGR.get(t) || null, evict, isBig, pre, post, hitBig: big };
