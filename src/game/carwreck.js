/* ──────────────────────────────────────────────────────────────────────────
   Машина разваливается по нарастающей (0п34, 24.10.2026; автор: «при столкновении давай не открывать капот и
   багажник — пусть отваливаются части машины: багажник, капот, двери, фары, бампера»; «стёкла трескаются, потом
   бьются постепенно — это всё разваливается, когда врезаешься»). Правила словами — docs/CAREER.md «Вмятины и
   отлетающие детали» → «Разваливается по нарастающей».

   От удара ничего не открывается. У каждой детали — свой счёт ударов d: удар добавляет силу k (0…1, как глубина
   вмятины: (м/с − 4) / 18) × близость к детали (вплотную — 1, дальше NEAR[1] м — 0); задние детали получают от
   любого удара не меньше REAR × k (камера сзади — «Следы сзади»). Ступени (S):
     1 — перекос: крышка, капот, дверь, бампер сели криво и так стоят;
     2 — болтается: петли / замок / крепление сорваны — деталь качается на ходу (пружина от разгона, торможения,
         поворотов и тряски), фара висит из гнезда;
     3 — отлетает: деталь кувыркается по дороге, лежит 15 с и тает (cardent.js fling).
   Фары и фонари: 1 — трещины (горит тусклее), 2 — разбита (не горит), 3 — вылетает из гнезда (у «Семёрки»).
   Ступень только растёт — до ремонта (машина собирается заново).

   «Семёрка» (своя и подробная копия потока, realcar.js): деталь вырезается из сетки модели своим куском — по
   плоскостям (CUT): треугольники, что режет граница детали, разрезаются по ней (ровный край, а не «зубы»
   треугольников), кусок снаружи остаётся с кузовом отдельной сеткой («кромка»). Пока деталь цела — её нет: кузов
   целиком, лишних отрисовок нет. Коробочные (?oldcar, поток) — их панели (капот, крышка, двери, бамперы, задняя
   дверь хэтчбека).

   Крышка багажника «Семёрки» открывается только когда кладут пиццу — ровно на петле у заднего стекла (lid).
   ?oldwreck — как было (крышки открываются от удара, детали — по-старому).

     hit(g, lx, lz, v, o)   — удар (cardent.js hit — своя и коробочная копия; foewreck.js post — «Семёрка» потока)
     rear(g, st, near, far) — «Следы сзади» (cardent.js): ступень износа зада → фонари, задний бампер, крышка
     lid(g, a)              — крышка багажника «Семёрки» на угол a (crashfx.js — пицца)
     piece(g, key), open(P, a) — дверь водителя (carexit.js)
     restore(g)             — подробная копия «Семёрки» собрана заново (foewreck.js pre): вернуть ступени
     beam(g), headOf(g)     — сколько света у фар: пятно на асфальте (game.js headGlow, roadlife.js)
     step(dt)               — каждый кадр: болтающиеся детали
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as PIX from './pixfx.js';
import { p0Of, RCW, LAMP_KEY, liteCut, soot as sootAt } from './realcar.js';
import { ST as DIRT_ST } from './cardirt.js';   // 0п82: отлетела деталь — своя машина грязнее
import { crackLamp, smashLamp, lampState, LAMP as CGLAMP, GLASS as CGGLASS } from './carglass.js';
import { fling, dropPart } from './cardent.js';

export const WR = {
  on: !(typeof location !== 'undefined' && /[?&]oldwreck\b/.test(location.search || '')),
  MIN: 4, FULL: 22,          // м/с: сила удара k = (v − MIN) / (FULL − MIN), 0…1 (как вмятина)
  S: [0.3, 0.85, 1.5],       // счёт детали: перекос, болтается, отлетает
  NEAR: [0.9, 2.4],          // м от места удара до детали: ближе — в полную силу, дальше — не задевает
  REAR: 0.35,                // задним деталям — от любого удара не меньше REAR × k
  REAR_K: 1.5,               // удар в корму — задним в полторы силы (как REARD.REAR_K)
  OFF_V: 24,                 // м/с вплотную (близость от 0,7) — отлетает сразу (86 км/ч)
  BUMPER: 17, BUMPER_OFF: 22, ARMOR_F: 3,   // бампер: с 61 км/ч в этот конец — сразу болтается, с 79 — отлетает; кенгурятник +3 м/с за ступень брони
  LAMP: [8, 16],             // м/с у фары: трещины / разбита сразу (как carglass.js LAMP)
  ARMOR: 0.15,               // броня — слабее на столько за ступень
  // углы, рад: open — приоткрыло, roll — перекосило набок, sag — дверь села, drop — бампер одним краем вниз, amp — размах на ходу
  POSE: {
    hood: [{ open: 0.04, roll: 0.035 }, { open: 0.1, roll: 0.07, amp: 0.07 }],
    trunk: [{ open: 0.045, roll: 0.04 }, { open: 0.13, roll: 0.07, amp: 0.09 }],
    door: [{ open: 0.045, sag: 0.03 }, { open: 0.24, sag: 0.07, amp: 0.2 }],
    bumper: [{ drop: 0.04, out: 0.02 }, { drop: 0.1, out: 0.05, amp: 0.035 }],
    lamp: [{ tilt: 0 }, { tilt: 0.4, amp: 0.3, out: 0.04 }],
  },
  SPRING: { K: 55, C: 3.5, ACC: 0.05, BUMP: 0.04, YAW: 0.25 },   // качание: жёсткость, затухание; от разгона (рад на м/с²), тряски, поворота
  GLASS: [9, 15, 22],        // м/с: удар у стекла добавляет 1 / 2 / 3 ступени: 1 — трещины, 2 — ещё трещины, 3 — разбито
  /* своя машина — вид по потерянным сердцам (0п58, автор 24.10: «разбитость машины привязана к сердцам»). Доля потерянных:
     меньше SKEW — только перекос и трещины (ступень 1); меньше HALF — болтается (2), стёкла и фары бьются; с HALF — отлетает
     OFFS[0] деталь, с MOST и на последнем сердце — OFFS[1]. Счёт ударов копится как раньше: потерял сердце — машина
     догоняет (sync) по месту прежних ударов. hearts(g) — { hp, max } своей (game.js), у чужих — null (как раньше) */
  HEARTS: { SKEW: 1 / 3, HALF: 0.5, MOST: 0.75, OFFS: [1, 2] },
  hearts: null,
  /* фары и фонари не отлетают и не висят (0п61, автор 24.10: «фонари не должны пропадать — могут мерцать или быть
     разбитыми»): 1 — трещины, горит тусклее и мерцает (ON — горит столько с, OFF — гаснет на столько, DIM — насколько), 2 — разбита */
  FLICK: { ON: [0.35, 2.6], OFF: [0.04, 0.16], DIM: 0.92 },
  /* отлетел бампер «Семёрки» — за ним панель кузова, тёмная, с креплениями (0п80; до того было видно багажник изнутри) */
  BACK: { HEX: 0x2b2a2c, BRACKET: 0x55565a, IN: 0.025 },
};
RCW.staged = WR.on;          // realcar.js: подробная копия — фары и стёкла по ступеням отсюда
CGLAMP.staged = WR.on ? (car) => !!(car && car.userData && (car.userData.see || car.userData.dent)) : null;   // carglass.js: фары своей и копии — по ступеням отсюда
CGGLASS.cap = car => { const c = WR.on && capOf(car); return c && c.st < 2 ? 2 : 3; };   // стёкла своей: сердец потеряно меньше трети — только трещины (0п58)

export const ST = { hits: 0, cuts: 0, cutTris: 0, clipped: 0, off: 0, offKeys: [], hang: 0, skew: 0, quiet: 0 };

/* ─── «Семёрка»: детали в осях модели (до k = 1,2). box — коробка (x / y / z от—до), planes — ещё полупространства
   [a, b, c, d]: внутри, если a·x + b·y + c·z + d ≥ 0; ny — грань смотрит вверх не меньше (крышки); whole — весь
   треугольник внутри (без разрезов, бампер); src — из каких сеток (top — своя верхняя граница по высоте);
   hinge — петля / крепление; at — середина в плане (x, z) — близость к удару; face — куда летит ─── */
const SRC = { body: 'real:Car_CarBody_0', det: 'real:Car_Details_0', lens: 'real:Car_Details_Transparent_0', winL: 'real:winL', winR: 'real:winR' };
const DRL = [0, 0.28, 0.23, 0.23 * 0.88 - 0.28 * 0.78];   // задняя дверь: задний край косой — огибает арку колеса
const door = (s, z, hz, extra) => ({ kind: 'door', s, box: { x: s > 0 ? [0.6, 9] : [-9, -0.6], y: [0.37, 9], z },
  top: { body: 0.98, det: 1.37 }, src: ['body', 'det', s > 0 ? 'winL' : 'winR'], hinge: [s * 0.86, 0.65, hz], at: [s * 0.89, (z[0] + z[1]) / 2], face: [s, 0], planes: extra || [] });
export const REAL_PARTS = {
  hood: { kind: 'hood', box: { x: [-0.72, 0.72], y: [0.8, 9], z: [1.0, 9] }, ny: 0.3, src: ['body'], hinge: [0, 1.03, 1.0], at: [0, 1.55], face: [0, 1] },
  trunk: { kind: 'trunk', rear: 1, box: { x: [-0.7, 0.7], y: [0.78, 9], z: [-9, -1.28] }, ny: 0.3, src: ['body'], hinge: [0, 0.98, -1.28], at: [0, -1.7], face: [0, -1] },
  dfl: door(1, [0.0, 0.9], 0.9), drl: door(1, [-0.88, -0.01], -0.01, [DRL]),
  dfr: door(-1, [0.0, 0.9], 0.9), drr: door(-1, [-0.88, -0.01], -0.01, [DRL]),
  bf: { kind: 'bumper', whole: 1, box: { x: [-0.95, 0.95], y: [0.3, 0.57], z: [1.75, 9] }, src: ['body', 'det'], hinge: [0.9, 0.43, 1.95], at: [0, 2.0], face: [0, 1] },
  br: { kind: 'bumper', rear: 1, whole: 1, box: { x: [-0.95, 0.95], y: [0.27, 0.56], z: [-9, -1.75] }, src: ['body', 'det'], hinge: [0.9, 0.42, -1.95], at: [0, -2.0], face: [0, -1] },
  fl: { kind: 'lamp', lamp: 'fl', box: { x: [0.33, 0.74], y: [0.57, 0.83], z: [1.85, 9] }, src: ['det', 'lens'], hinge: [0.53, 0.83, 2.0], at: [0.55, 1.95], face: [0.3, 1] },
  fr: { kind: 'lamp', lamp: 'fr', box: { x: [-0.74, -0.33], y: [0.57, 0.83], z: [1.85, 9] }, src: ['det', 'lens'], hinge: [-0.53, 0.83, 2.0], at: [-0.55, 1.95], face: [-0.3, 1] },
  rl: { kind: 'lamp', lamp: 'rl', rear: 1, box: { x: [0.28, 0.73], y: [0.55, 0.8], z: [-9, -1.88] }, src: ['det', 'lens'], hinge: [0.5, 0.8, -2.0], at: [0.5, -1.95], face: [0.3, -1] },
  rr: { kind: 'lamp', lamp: 'rr', rear: 1, box: { x: [-0.73, -0.28], y: [0.55, 0.8], z: [-9, -1.88] }, src: ['det', 'lens'], hinge: [-0.5, 0.8, -2.0], at: [-0.5, -1.95], face: [-0.3, -1] },
};
/* коробочные: деталь → панель makeCar (game.js) */
const BOX_PANEL = { hood: 'hood', trunk: 'trunk', rdoor: 'rdoor', dl: 'doorR', dr: 'doorL', bf: 'bumperF', br: 'bumperR' };   // doorR — у борта +x (слева по ходу)
const LAMPS = ['fl', 'fr', 'rl', 'rr'];

const lerp01 = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const rnd = (a, b) => a + Math.random() * (b - a);
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
let HIDE = null;                                   // стекло детали разбито — эта группа не рисуется (материал без программы)
const hideMat = () => HIDE || (HIDE = new THREE.MeshBasicMaterial({ visible: false }));

/* ─── состояние машины ─── */
const WS = new WeakMap();                          // машина (группа) → { parts: { key: { d, st } }, P: { key: piece }, R }
const LIVE = new Set();                            // машины с болтающимися деталями
const FLK = new Set();                             // машины с фарами в трещинах — мерцают (0п61)
function stOf (g) {
  let W = WS.get(g);
  if (!W) WS.set(g, W = { g, parts: {}, P: {}, R: null, src: null, mv: null });
  const R = g.userData.real || null;
  if (W.R !== R) { W.R = R; W.P = {}; W.src = null; }   // подробную копию «Семёрки» убрали / собрали — куски были на ней
  return W;
}
const realOK = R => !!(R && R.m && (!R.traffic || R.detail) && R.C && R.C.dir === 'vaz2107');
const partOf = (W, key) => W.parts[key] || (W.parts[key] = { d: 0, st: 0, want: 0 });
const stageOf = d => (d >= WR.S[2] ? 3 : d >= WR.S[1] ? 2 : d >= WR.S[0] ? 1 : 0);
/* потолок по сердцам (0п58): { st — выше какой ступени нельзя, off — сколько деталей может отлететь }; null — без потолка */
function capOf (g) {
  const h = WR.hearts && WR.hearts(g);
  if (!h || !(h.max > 0) || !(h.hp > 0)) return null;
  const f = (h.max - h.hp) / h.max, H = WR.HEARTS, last = h.hp <= 1;
  return { st: last || f >= H.HALF ? 3 : f >= H.SKEW ? 2 : 1, off: last || f >= H.MOST ? H.OFFS[1] : f >= H.HALF ? H.OFFS[0] : 0 };
}
const offs = W => { let n = 0; for (const k in W.parts) if (W.parts[k].st >= 3) n++; return n; };
/* деталь key — к ступени, какую набрала (want), но не выше потолка; 0 — не сдвинулась */
function raise (g, W, key, o, v, lx, cap) {
  const P = partOf(W, key);
  let st = P.want || 0;
  if (cap) { st = Math.min(st, cap.st); if (st >= 3 && offs(W) >= cap.off) st = 2; }
  if (!(st > P.st)) return 0;
  setStage(g, W, key, st, P.st, o, v, lx);
  return st;
}
/** сердца своей машины поменялись (game.js hurtCar): догнать вид по набранному счёту — сильнее набравшие первыми */
export function sync (g) {
  if (!WR.on || !g) return null;
  const W = WS.get(g);
  if (!W || !partsList(g)) return null;
  const cap = capOf(g), L = W.last || { o: { soft: true }, v: 8, lx: 0 }, out = [];
  const keys = Object.keys(W.parts).filter(k => W.parts[k].want > W.parts[k].st).sort((a, b) => W.parts[b].d - W.parts[a].d);
  for (const k of keys) { const s = raise(g, W, k, L.o, L.v, L.lx, cap); if (s) out.push(k + s); }
  return out;
}

/* какие детали у машины и где они (в осях машины, метры игры) */
function partsList (g) {
  const u = g.userData, R = u.real;
  if (R) {
    if (!realOK(R)) return null;
    const k = R.C.k, out = [];
    for (const key in REAL_PARTS) { const S = REAL_PARTS[key]; out.push({ key, kind: S.kind, rear: !!S.rear, ax: S.at[0] * k, az: S.at[1] * k, lamp: S.lamp }); }
    return out;
  }
  if (!u.panels) return null;
  const out = [];
  for (const key in BOX_PANEL) {
    const p = u.panels.find(q => q.m.name === BOX_PANEL[key]);
    if (!p) continue;
    const kind = key === 'hood' ? 'hood' : key === 'trunk' || key === 'rdoor' ? 'trunk' : key[0] === 'd' ? 'door' : 'bumper';
    out.push({ key, kind, rear: key === 'trunk' || key === 'rdoor' || key === 'br', ax: p.m.position.x, az: p.m.position.z });
  }
  lampState(g);                                     // собрать фары и фонари (carglass.js lampsOf)
  for (const key of LAMPS) {
    const c = u.lamps && u.lamps[key];
    if (c) out.push({ key, kind: 'lamp', rear: key[0] === 'r', ax: c.x, az: c.z, lamp: key });
  }
  return out;
}

/** удар: lx, lz — место в осях машины, v — м/с; o.ox, o.oz — куда летят детали (от ударившего), o.quiet — без полёта */
export function hit (g, lx, lz, v, o = {}) {
  if (!WR.on || !g || !g.userData || !(v > WR.MIN)) return null;
  const u = g.userData, list = partsList(g);
  if (!list) return null;
  const W = stOf(g), hl = u.real ? u.real.C.box.HL * u.real.C.k : u.hl || 2.1, hw = u.real ? u.real.C.box.W2 * u.real.C.k : (u.W || 1.8) / 2;
  const k = lerp01(v, WR.MIN, WR.FULL) * Math.max(0.2, 1 - WR.ARMOR * (u.armor || 0));
  const end = Math.abs(lz) / hl >= Math.abs(lx) / hw, rearHit = end && lz < 0;
  ST.hits++;
  const out = [], cap = capOf(g);
  W.last = { o: { ox: o.ox, oz: o.oz, soft: o.soft }, v, lx };
  // ближние к удару — первыми (отлетает то, во что попали, пока сердца позволяют)
  const order = list.map(p => [p, Math.hypot(p.ax - lx, p.az - lz)]).sort((a, b) => a[1] - b[1]);
  for (const [p, dist] of order) {
    const P = partOf(W, p.key);
    if (P.st >= 3) continue;
    const w = 1 - lerp01(dist, WR.NEAR[0], WR.NEAR[1]);
    let add = k * w * (p.rear && rearHit ? WR.REAR_K : 1);
    if (p.rear && !rearHit) add = Math.max(add, k * WR.REAR);
    if (!(add > 0)) continue;
    P.d += add;
    let st = stageOf(P.d);
    if (w >= 0.7 && v >= WR.OFF_V) st = 3;
    if (p.kind === 'bumper' && end && Math.sign(lz) === Math.sign(p.az)) {
      const front = p.az > 0, need = WR.BUMPER + (front ? WR.ARMOR_F * (u.armor || 0) : 0);
      if (v >= need + (WR.BUMPER_OFF - WR.BUMPER)) st = 3; else if (v >= need) st = Math.max(st, 2);
    }
    if (p.kind === 'lamp') {                         // фара не отлетает (0п61): трещины → разбита
      if (w >= 0.7) { if (v >= WR.LAMP[1]) st = Math.max(st, 2); else if (v >= WR.LAMP[0]) st = Math.max(st, 1); }
      st = Math.min(st, 2);
    }
    P.want = Math.max(P.want || 0, st);
    const s = raise(g, W, p.key, o, v, lx, cap);
    if (s) out.push(p.key + s);
  }
  return out;
}
/** «Следы сзади» (cardent.js rearWear): ступень износа зада st — фонари near / far, задний бампер, крышка */
export function rear (g, st, near, far, v = 6) {
  if (!WR.on || !g) return;
  const W = stOf(g), list = partsList(g);
  if (!list) return;
  const has = k => list.some(p => p.key === k), cap = capOf(g);
  const at = (key, s) => { if (!has(key)) return; const P = partOf(W, key); if (s > (P.want || 0)) { P.d = Math.max(P.d, WR.S[s - 1]); P.want = s; } raise(g, W, key, { soft: true }, v, 0, cap); };
  if (st >= 1) { at(near, 1); at('br', 1); at('trunk', 1); at('rdoor', 1); }
  if (st >= 2) { at(near, 2); at(far, 1); at('br', 2); }
  if (st >= 3) { at(near, 2); at(far, 2); at('br', 3); at('trunk', 2); at('rdoor', 2); }
}

/* новая ступень детали key: from — была; 3 — отлетает */
function setStage (g, W, key, st, from, o, v, lx) {
  const P = partOf(W, key);
  P.st = st;
  const u = g.userData, R = u.real;
  if (LAMPS.includes(key)) lampStage(g, W, key, st, from, o, v);
  if (R) {
    if (key in REAL_PARTS && REAL_PARTS[key].kind !== 'lamp') {   // фара — на месте (0п61): бьётся стекло (carglass.js, realcar.js lampInject)
      const pc = piece(g, key);
      if (pc) {
        if (pc.kind === 'bumper' && !pc.sd) pc.sd = Math.sign(lx) || (Math.random() < 0.5 ? 1 : -1);
        if (st >= 3) off(g, W, pc, o, v);
        else { pose(pc); if (st === 2) LIVE.add(W); }
      }
    }
  } else boxStage(g, W, key, st, o, v, lx);
  if (st === 1) ST.skew++; else if (st === 2) ST.hang++;
}

/* фара / фонарь: 1 — трещины (тусклее), 2 — разбит, 3 — вылетел (у «Семёрки» — кусок модели) */
function lampStage (g, W, key, st, from, o, v) {
  const u = g.userData, R = u.real;
  if (u.cg || u.lamps) {                            // своя (и «Семёрка» — по местам модели) и коробочная копия: carglass.js
    if (st >= 1 && from < 1) crackLamp(g, key);
    if (st >= 2 && from < 2) smashLamp(g, key);
  }
  const dead = R && R.lamp && R.lamp.dead;
  if (dead) {
    const c = LAMP_KEY[key];
    if (st === 1) { dead[c] = Math.max(dead[c], 0.45); FLK.add(W); }   // в трещинах — горит тусклее и мерцает (step)
    if (st >= 2) {
      if (dead[c] < 1 && !u.cg) shards(g, key);         // копия потока: осколки (своей — carglass.js smashLamp)
      dead[c] = 1;
    }
  }
}
const LSH = { f: [0xfff4cf, 0xeaf4ff, 0xffffff], r: [0xe0283a, 0xb81e2c, 0xffa630] };
function shards (g, key) {
  const S = REAL_PARTS[key], k = g.userData.real.C.k;
  g.updateMatrixWorld(true);
  const c = _v.set(S.at[0] * k, 0.7 * k, S.at[1] * k).applyMatrix4(g.matrixWorld), floor = g.position.y + 0.02, cols = LSH[key[0]];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.2;
    PIX.spawn(c.x + rnd(-0.1, 0.1), c.y, c.z + rnd(-0.1, 0.1), { vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 2, vz: Math.sin(a) * sp,
      s: 0.05 + Math.random() * 0.06, life: 2.5 + Math.random() * 2, hex: cols[(Math.random() * cols.length) | 0], g: 16, floor });
  }
}

/* ─── коробочные: панели makeCar ─── */
function boxStage (g, W, key, st, o, v, lx) {
  const u = g.userData, name = BOX_PANEL[key];
  if (!name) return;
  if (key === 'trunk' && u.trunk) {                  // крышка седана: угол — game.js updateTrunk (bend, roll)
    const tr = u.trunk;
    if (st >= 3) { offBox(g, W, key, name, o, v); return; }
    const Q = WR.POSE.trunk[st - 1];
    tr.bend = Q.open; tr.roll = (tr.rollS || (tr.rollS = Math.random() < 0.5 ? 1 : -1)) * Q.roll;
    if (st === 2) { const pc = boxPiece(g, W, key); if (pc) { pc.trunk = tr; LIVE.add(W); } }
    return;
  }
  if (key === 'rdoor' && u.rdoor) {                  // задняя дверь хэтчбека: приоткрыта и болтается (carrear.js lidGoal — качается сама)
    if (st >= 3) { offBox(g, W, key, name, o, v); return; }
    u.rdoor.ajar = st === 1 ? 0.06 : 0.2;
    return;
  }
  const pc = boxPiece(g, W, key);
  if (!pc) return;
  if (pc.kind === 'bumper' && !pc.sd) pc.sd = Math.sign(lx) || 1;
  if (st >= 3) { offBox(g, W, key, name, o, v); return; }
  pose(pc);
  if (st === 2) LIVE.add(W);
}
function boxPiece (g, W, key) {
  if (W.P[key]) return W.P[key];
  const u = g.userData, name = BOX_PANEL[key], p = u.panels.find(q => q.m.name === name);
  if (!p) return null;
  const m = p.m;
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox, kind = key === 'hood' ? 'hood' : key === 'trunk' || key === 'rdoor' ? 'trunk' : key[0] === 'd' ? 'door' : 'bumper';
  const s = Math.sign(m.position.x) || 1;
  const H = kind === 'hood' ? new THREE.Vector3(0, m.position.y + b.max.y, m.position.z + b.min.z)
    : kind === 'door' ? new THREE.Vector3(m.position.x, m.position.y, m.position.z + b.max.z)
      : kind === 'bumper' ? new THREE.Vector3(0, m.position.y, m.position.z) : m.position.clone();
  const pc = { key, kind, box: true, g, W, m, s, H, X: b.max.x, P0: m.position.clone(), Q0: m.quaternion.clone(), open: 0, lidA: 0, h: 0, hv: 0, gone: false, id: ++PID, rs: Math.random() < 0.5 ? 1 : -1 };
  W.P[key] = pc;
  return pc;
}
function offBox (g, W, key, name, o, v) {
  const u = g.userData, pc = W.P[key];
  if (pc) { pc.gone = true; if (pc.m) { pc.m.position.copy(pc.P0); pc.m.quaternion.copy(pc.Q0); } }
  if (key === 'rdoor' && u.rdoor) { u.rdoor.ajar = 0; u.rdoor.lost = true; }
  if (key === 'trunk' && u.trunk) { u.trunk.bend = 0; u.trunk.roll = 0; }
  const m = u.panels.find(q => q.m.name === name);
  if (m) m.m.userData.lost = 1;
  const f = faceOf(key, g);
  if (WR.QUIET || o.quiet) {                        // повтор прежних ударов на новой модели (game.js fwSwap): без полёта
    (u.lost || (u.lost = {}))[name] = 1;
    if (m) { const i = u.panels.indexOf(m); u.panels.splice(i, 1); m.m.visible = false; if (key === 'trunk' && u.trunk) { u.trunk.lost = true; u.trunk.m = new THREE.Object3D(); } }
    ST.quiet++;
    return;
  }
  dropPart(g, name, f[0], f[1], o.soft ? Math.min(v, 6) : v);
  ST.off++; ST.offKeys.push(key);
}
const faceOf = (key, g) => {
  const S = REAL_PARTS[key];
  if (S) return S.face;
  if (key === 'hood') return [0, 1];
  if (key === 'trunk' || key === 'rdoor' || key === 'br') return [0, -1];
  if (key === 'bf') return [0, 1];
  return [key === 'dl' ? 1 : -1, 0];
};

/* ─── «Семёрка»: кусок модели ─── */
function srcMeshes (W) {
  if (W.src) return W.src;
  const S = {};
  W.R.m.traverse(o => { if (o.isMesh) for (const k in SRC) if (o.name === SRC[k]) S[k] = o; });
  return (W.src = S);
}
/* по каждой сетке: исходный индекс (до вырезов), какие треугольники сняты (drop) и чьи (claim) */
const MS = new WeakMap();
function meshState (o) {
  let s = MS.get(o);
  if (!s) {
    const I = o.geometry.index.array, n = I.length / 3;
    MS.set(o, s = { I0: I.slice(), n, drop: new Uint8Array(n), claim: new Uint16Array(n) });
  }
  return s;
}
function rebuild (o, s) {
  let m = 0;
  for (let t = 0; t < s.n; t++) if (!s.drop[t]) m++;
  const out = new (s.I0.constructor)(m * 3);
  let j = 0;
  for (let t = 0; t < s.n; t++) if (!s.drop[t]) { out[j++] = s.I0[t * 3]; out[j++] = s.I0[t * 3 + 1]; out[j++] = s.I0[t * 3 + 2]; }
  o.geometry.setIndex(new THREE.BufferAttribute(out, 1));
}
/* полигон в барицентрических весах треугольника; val — значения плоскости в вершинах a, b, c */
function split (poly, va, vb, vc) {
  const inP = [], outP = [], val = w => w[0] * va + w[1] * vb + w[2] * vc;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], fa = val(A), fb = val(B);
    if (fa >= 0) inP.push(A); else outP.push(A);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb), X = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      inP.push(X); outP.push(X);
    }
  }
  return [inP.length >= 3 ? inP : null, outP.length >= 3 ? outP : null];
}
let PID = 0;
/** кусок детали key у машины g (вырезать, если ещё нет); null — не у «Семёрки» или нечего резать */
export function piece (g, key) {
  if (!WR.on || !g || !g.userData) return null;
  const W = stOf(g);
  if (W.P[key]) return W.P[key].gone ? null : W.P[key];
  const R = g.userData.real;
  if (!R) return BOX_PANEL[key] && g.userData.panels ? boxPiece(g, W, key) : null;
  if (!realOK(R) || !REAL_PARTS[key]) return null;
  const S = REAL_PARTS[key], M = srcMeshes(W), id = ++PID;
  const groups = [], rims = [];
  const planes = [];
  const B = S.box;
  for (const [ax, i] of [['x', 0], ['y', 1], ['z', 2]]) {
    const r = B[ax], n = [0, 0, 0];
    if (r[0] > -8) { n[i] = 1; planes.push([...n, -r[0]]); }
    if (r[1] < 8) { const m = [0, 0, 0]; m[i] = -1; planes.push([...m, r[1]]); }
  }
  for (const pl of S.planes || []) planes.push(pl);
  let tris = 0;
  for (const sk of S.src) {
    const o = M[sk];
    if (!o || !o.geometry.index) continue;
    const ms = meshState(o), geo = o.geometry, pa = geo.attributes.position, ua = geo.attributes.uv, na = geo.attributes.normal;
    const q0 = p0Of(o), p0 = q0 && q0.count === pa.count ? q0 : pa;
    const top = S.top && S.top[sk] !== undefined ? S.top[sk] : 9;
    const PL = top < 9 ? planes.concat([[0, -1, 0, top]]) : planes;
    const isWin = sk === 'winL' || sk === 'winR';
    const gIn = { mat: o.material, P: [], U: [], N: [], win: isWin ? o : null }, gOut = { mat: o.material, P: [], U: [], N: [] };
    const I = ms.I0;
    const emit = (G, poly, a, b, c) => {
      for (let j = 1; j + 1 < poly.length; j++) for (const w of [poly[0], poly[j], poly[j + 1]]) {
        G.P.push(w[0] * pa.getX(a) + w[1] * pa.getX(b) + w[2] * pa.getX(c), w[0] * pa.getY(a) + w[1] * pa.getY(b) + w[2] * pa.getY(c), w[0] * pa.getZ(a) + w[1] * pa.getZ(b) + w[2] * pa.getZ(c));
        if (ua) G.U.push(w[0] * ua.getX(a) + w[1] * ua.getX(b) + w[2] * ua.getX(c), w[0] * ua.getY(a) + w[1] * ua.getY(b) + w[2] * ua.getY(c));
        if (na) G.N.push(w[0] * na.getX(a) + w[1] * na.getX(b) + w[2] * na.getX(c), w[0] * na.getY(a) + w[1] * na.getY(b) + w[2] * na.getY(c), w[0] * na.getZ(a) + w[1] * na.getZ(b) + w[2] * na.getZ(c));
      }
    };
    let changed = false;
    for (let t = 0; t < ms.n; t++) {
      if (ms.drop[t] || ms.claim[t]) continue;
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      const ax = p0.getX(a), ay = p0.getY(a), az = p0.getZ(a), bx = p0.getX(b), by = p0.getY(b), bz = p0.getZ(b), cx = p0.getX(c), cy = p0.getY(c), cz = p0.getZ(c);
      // все вершины снаружи одной плоскости — не наш
      let outside = false, inside = true;
      const V = [];
      for (const pl of PL) {
        const va = pl[0] * ax + pl[1] * ay + pl[2] * az + pl[3], vb = pl[0] * bx + pl[1] * by + pl[2] * bz + pl[3], vc = pl[0] * cx + pl[1] * cy + pl[2] * cz + pl[3];
        if (va < 0 && vb < 0 && vc < 0) { outside = true; break; }
        if (va < 0 || vb < 0 || vc < 0) inside = false;
        V.push([va, vb, vc]);
      }
      if (outside || (S.whole && !inside)) continue;
      if (S.ny && !isWin) {
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
        if (Math.abs(ny / l) < S.ny) continue;
      }
      ms.drop[t] = 1; ms.claim[t] = id; changed = true; tris++;
      if (inside) { emit(gIn, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], a, b, c); continue; }
      ST.clipped++;
      let poly = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      for (const v3 of V) {
        if (!poly) break;
        const [pin, pout] = split(poly, v3[0], v3[1], v3[2]);
        if (pout) emit(gOut, pout, a, b, c);
        poly = pin;
      }
      if (poly) emit(gIn, poly, a, b, c);
    }
    if (changed) rebuild(o, ms);
    if (gIn.P.length) groups.push(gIn);
    if (gOut.P.length) rims.push(gOut);
  }
  if (!groups.length) { W.P[key] = { gone: true, key, empty: true }; return null; }
  const mk = (G, name) => {
    const geo = new THREE.BufferGeometry(), P = [], U = [], N = [];
    let n = 0;
    const withN = G.every(q => q.N.length);
    G.forEach((q, i) => { geo.addGroup(n, q.P.length / 3, i); n += q.P.length / 3; P.push(...q.P); U.push(...(q.U.length ? q.U : new Array(q.P.length / 3 * 2).fill(0))); if (withN) N.push(...q.N); });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (withN) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, G.length > 1 ? G.map(q => q.mat) : G[0].mat);
    m.name = name; m.userData.keepMat = 1;           // материалы — общие с машиной (cardent.js end не трогает)
    if (G.some(q => q.win)) m.renderOrder = 2;
    W.R.m.add(m);
    W.R.dent.push(geo);                              // мнётся дальше вместе с кузовом (realcar.js dentR); подробную копию выбросят с ней
    return m;
  };
  const m = mk(groups, 'real:part-' + key), rim = rims.length ? mk(rims, 'real:rim-' + key) : null;
  const pc = { key, kind: S.kind, s: S.s || 0, g, W, m, rim, id, H: new THREE.Vector3(...S.hinge), P0: new THREE.Vector3(), Q0: new THREE.Quaternion(),
    X: 0.9, sd: 0, open: 0, lidA: 0, h: 0, hv: 0, gone: false, tris, wins: groups.map(q => q.win), mats: groups.map(q => q.mat), rs: Math.random() < 0.5 ? 1 : -1 };
  W.P[key] = pc;
  ST.cuts++; ST.cutTris += tris;
  g.userData._pose = undefined;
  return pc;
}
/* вернуть кусок в кузов (крышка багажника закрылась, а она цела — не держать лишних отрисовок) */
function unpiece (W, pc) {
  if (!pc || pc.box || pc.gone) return;
  const M = srcMeshes(W);
  for (const sk of REAL_PARTS[pc.key].src) {
    const o = M[sk];
    if (!o) continue;
    const ms = MS.get(o);
    if (!ms) continue;
    let ch = false;
    for (let t = 0; t < ms.n; t++) if (ms.claim[t] === pc.id) { ms.claim[t] = 0; ms.drop[t] = 0; ch = true; }
    if (ch) rebuild(o, ms);
  }
  for (const m of [pc.m, pc.rim]) {
    if (!m) continue;
    m.parent && m.parent.remove(m);
    const i = W.R.dent.indexOf(m.geometry);
    if (i >= 0) W.R.dent.splice(i, 1);
    m.geometry.dispose();
  }
  delete W.P[pc.key];
}

/* поза куска: ступень (перекос / болтается), открыто (пицца, водитель), качание h */
function pose (pc) {
  if (pc.gone || !pc.m) return;
  const W = pc.W, P = W.parts[pc.key] || { st: 0 }, st = Math.min(2, P.st), Q = st ? WR.POSE[pc.kind][st - 1] : null;
  const h = pc.h;
  let rx = 0, ry = 0, rz = 0;
  _w.set(0, 0, 0);
  if (pc.kind === 'hood') { rx = -((Q ? Q.open : 0) + h); rz = Q ? pc.rs * Q.roll : 0; }
  else if (pc.kind === 'trunk') { rx = (Q ? Q.open : 0) + h + pc.lidA; rz = Q ? pc.rs * Q.roll : 0; }
  else if (pc.kind === 'door') { ry = -pc.s * ((Q ? Q.open : 0) + h + pc.open); rx = Q ? -Q.sag : 0; }
  else if (pc.kind === 'bumper') {
    const sd = pc.sd || 1;
    rz = -sd * ((Q ? Q.drop : 0) + h);
    if (Q) _w.set(0, -Q.out * 0.5, Math.sign(pc.H.z) * Q.out);
  } else if (pc.kind === 'lamp') {
    const back = pc.H.z < 0 ? 1 : -1;
    rx = back * ((Q ? Q.tilt : 0) + h);
    if (Q && Q.out) _w.set(0, 0, -back * Q.out);
  }
  // бампер — петля на противоположном конце (sd — с какой стороны просел)
  const H = pc.kind === 'bumper' ? _v.set(-(pc.sd || 1) * pc.X, pc.H.y, pc.H.z) : _v.copy(pc.H);
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  const m = pc.m, Hx = H.x, Hy = H.y, Hz = H.z;
  m.position.copy(pc.P0).sub(H).applyQuaternion(_q);
  m.position.x += Hx + _w.x; m.position.y += Hy + _w.y; m.position.z += Hz + _w.z;
  m.quaternion.copy(_q).multiply(pc.Q0);
  if (pc.g.userData) pc.g.userData._pose = undefined;   // стоящая машина матрицы не пересчитывает (cull.js moved)
  // стекло двери разбито — его часть в куске не рисуем
  if (pc.wins && Array.isArray(m.material)) pc.wins.forEach((o, i) => { if (o) m.material[i] = o.visible ? pc.mats[i] : hideMat(); });
}

/* копоть и грязь на месте отлетевшего (0п82, автор 24.10: «разбитая в хлам — белое пятно без всего»): вокруг дыры — сажа
   рваными краями (realcar.js soot, радиус SOOT_R по виду детали, м модели); своя машина — грязнее на GRIME (cardirt.js),
   машина потока — тусклее и ржавее на WEAR (износ uWear) */
export const SCAR = { R: { hood: 0.75, trunk: 0.75, door: 0.6, bumper: 0.55, lamp: 0.28 }, GRIME: 0.22, WEAR: 0.25 };
function scar (g, key, again) {
  const S = REAL_PARTS[key], R = g.userData.real;
  if (!S || !R) return;
  const r = SCAR.R[S.kind] || 0.4;
  // бампер — копоть на кузове над ним (сам бампер ниже кузова), остальное — посередине детали на высоте крепления
  const y = S.kind === 'bumper' ? S.box.y[1] + 0.08 : S.hinge[1];
  sootAt(g, S.at[0], y, S.at[1], r);
  if (again) return;                                 // подробная копия собрана заново (restore) — грязь уже набрана
  if (R.traffic) { if (R.U && R.U.wear) R.U.wear.value = Math.min(1, R.U.wear.value + SCAR.WEAR); }
  else DIRT_ST.dirt = Math.min(1, DIRT_ST.dirt + SCAR.GRIME);
}

/* отлетела: кусок — в мир (cardent.js fling), летит от удара */
function off (g, W, pc, o, v) {
  const u = g.userData;
  pc.gone = true; LIVE.delete(W);
  scar(g, pc.key);                                   // 0п82: копоть вокруг дыры, грязь
  if (pc.key === 'trunk' && u.trunk) { u.trunk.lost = true; cargoReal(g); }
  (u.lost || (u.lost = {}))[pc.key] = 1;
  if (pc.kind === 'lamp' && u.real && u.real.lamp) u.real.lamp.dead[LAMP_KEY[pc.key]] = 1;
  const m = pc.m;
  const di = W.R.dent.indexOf(m.geometry);
  if (di >= 0) W.R.dent.splice(di, 1);
  if (pc.kind === 'bumper') backPlate(W, m.geometry, pc.H.z > 0 ? 1 : -1);
  if (WR.QUIET || o.quiet) { m.parent && m.parent.remove(m); m.geometry.dispose(); ST.quiet++; return; }
  // середина куска — в начало его осей, масштаб модели — в сетку: кувыркается вокруг себя, ложится на асфальт как есть
  const geo = m.geometry, k = W.R.C.k;
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z); geo.scale(k, k, k); geo.computeBoundingSphere(); geo.boundingBox = null;
  m.position.add(c.applyQuaternion(m.quaternion));
  m.scale.setScalar(1 / k);
  const f = faceOf(pc.key, g), ox = (o.ox || 0) * 0.5 + f[0], oz = (o.oz || 0) * 0.5 + f[1];
  fling(g, m, 'part-' + pc.key, ox, oz, o.soft ? Math.min(v, 6) : v);
  ST.off++; ST.offKeys.push(pc.key);
}
/* бампер отлетел — на его месте панель кузова: тёмная пластина поперёк проёма (у внутреннего края бампера) и два
   кронштейна, торчат туда, где он был (0п80: сквозь дыру было видно багажник / моторный отсек изнутри). В осях модели */
let BACKM = null;
function backPlate (W, geo, s) {
  if (!W.R || !W.R.m) return;
  geo.computeBoundingBox();
  const b = geo.boundingBox, B = WR.BACK;
  if (!BACKM) BACKM = [new THREE.MeshLambertMaterial({ color: B.HEX }), new THREE.MeshLambertMaterial({ color: B.BRACKET })];
  const w = (b.max.x - b.min.x) * 0.9, h = (b.max.y - b.min.y) * 0.85, cy = (b.max.y + b.min.y) / 2;
  const zin = s > 0 ? b.min.z + B.IN : b.max.z - B.IN, depth = Math.max(0.05, (b.max.z - b.min.z) * 0.55);
  const grp = new THREE.Group();
  grp.name = 'real:bumper-back';
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), BACKM[0]);
  plate.position.set((b.max.x + b.min.x) / 2, cy, zin);
  grp.add(plate);
  for (const sx of [-1, 1]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, depth), BACKM[1]);
    br.position.set((b.max.x + b.min.x) / 2 + sx * w * 0.32, cy, zin + s * depth / 2);
    grp.add(br);
  }
  for (const c of grp.children) c.userData.keepMat = 1;
  W.R.m.add(grp);
  if (W.g.userData) W.g.userData._pose = undefined;
}
/* крышки багажника «Семёрки» нет — коробки с пиццей видно (коробки старого кузова — carrear.js cargo).
   Коробки собраны под ванну коробочного седана (низко, у заднего стекла, слева): у «Семёрки» ванны нет — кузов под крышкой
   сплошной, и из выреза торчал только оранжевый край верхней коробки (0п51). Ставим стопку на срез проёма (низ — на
   высоте среза крышки), по середине проёма вдоль и поперёк, в CARGO.K крупнее */
export const CARGO = { K: 1.3, UP: 0.01 };
function cargoReal (g) {
  const u = g.userData, c = u.cargo, R = u.real;
  if (!c) return;
  if (c.parent && c.parent !== g) g.add(c);
  if (!R || c.userData.realFit) return;
  c.userData.realFit = 1;
  const S = REAL_PARTS.trunk.box, k = R.C.k, HL = R.C.box.HL;
  c.geometry.computeBoundingBox();
  const bb = c.geometry.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const z0 = Math.max(S.z[0], -HL), z1 = S.z[1];                 // проём крышки вдоль: от кормы до петли у стекла
  const K = CARGO.K;
  c.scale.setScalar(K);
  c.position.set(-cx * K, S.y[0] * k + CARGO.UP - bb.min.y * K, (z0 + z1) / 2 * k * 0.98 - cz * K);
}

/** крышка багажника «Семёрки» на угол a (crashfx.js: кладут пиццу; tr — u.trunk) */
export function lid (g, a) {
  if (!WR.on || !g || !g.userData.real) return;
  const W = stOf(g), P = W.parts.trunk;
  let pc = W.P.trunk;
  if (pc && pc.gone) return;
  if (!pc) { if (!(a > 0.01)) return; pc = piece(g, 'trunk'); if (!pc) return; }
  if (a > 0.01) cargoReal(g);                        // приоткрыта — коробки на срезе проёма (не утоплены в кузов)
  if (pc.lidA === a) return;
  pc.lidA = a;
  if (!(a > 0.01) && !(P && P.st)) { unpiece(W, pc); return; }   // закрылась, цела — снова кузовом
  pose(pc);
}
/** дверь открыта на a рад (carexit.js) */
export function open (pc, a) {
  if (!pc || pc.gone) return;
  if (pc.box) { pc.open = a; pose(pc); return; }
  pc.open = a; pose(pc);
}
/** подробную копию «Семёрки» потока убрали (foewreck.js evict, дальше FW.FAR): отлетевшее (ступень 3) снимаем и с облегчённой
    R1 — треугольники, чья середина в коробке детали (по плоскостям, ny — грань вверх, top — по высоте; дверь — и со своим
    окном). Облегчённая — одна сетка без разрезов: край неровный, но с 90 м не видно; до 0п51 возвращалась целой */
export function liteLost (g, R1) {
  if (!WR.on || !g || !R1) return 0;
  const W = WS.get(g);
  if (!W) return 0;
  const done = R1.wrCut || (R1.wrCut = {});
  const keys = Object.keys(W.parts).filter(k => W.parts[k].st >= 3 && REAL_PARTS[k] && !done[k]);
  if (!keys.length) return 0;
  for (const k of keys) done[k] = 1;
  return liteCut(R1, (x, y, z, ny, glass) => {
    for (const k of keys) {
      const S = REAL_PARTS[k], B = S.box;
      if (glass && S.kind !== 'door') continue;
      if (x < B.x[0] || x > B.x[1] || y < B.y[0] || y > B.y[1] || z < B.z[0] || z > B.z[1]) continue;
      if (!glass && S.top && y > S.top.body) continue;
      if (S.planes && S.planes.some(pl => pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < 0)) continue;
      if (S.ny && !glass && ny < S.ny) continue;
      return true;
    }
    return false;
  });
}
/** подробная копия «Семёрки» собрана заново (foewreck.js pre): прежние ступени — на новых кусках */
export function restore (g) {
  if (!WR.on || !g) return;
  const W = WS.get(g);
  if (!W) return;
  stOf(g);
  for (const key in W.parts) {
    const P = W.parts[key];
    if (!P.st || !REAL_PARTS[key]) continue;
    if (REAL_PARTS[key].kind === 'lamp') { if (P.st === 1) FLK.add(W); continue; }   // фара — на месте, стекло — по uLampDead (0п61)
    const pc = piece(g, key);
    if (!pc) continue;
    if (P.st >= 3) { pc.gone = true; scar(g, pc.key, true); if (pc.kind === 'bumper') backPlate(W, pc.m.geometry, pc.H.z > 0 ? 1 : -1); pc.m.parent && pc.m.parent.remove(pc.m); const i = W.R.dent.indexOf(pc.m.geometry); if (i >= 0) W.R.dent.splice(i, 1); pc.m.geometry.dispose(); }
    else { pose(pc); if (P.st === 2) LIVE.add(W); }
  }
}

/* ─── фара в трещинах мерцает: горит тусклее, изредка гаснет на миг (0п61) ─── */
function flicker (dt) {
  const F = WR.FLICK;
  for (const W of FLK) {
    const g = W.g, R = g.userData && g.userData.real, dead = R && R.lamp && R.lamp.dead;
    if (!g.parent || !dead) { FLK.delete(W); continue; }
    const fl = W.fl || (W.fl = {});
    let any = false;
    for (const key of LAMPS) {
      const P = W.parts[key], c = LAMP_KEY[key];
      if (!P || P.st !== 1 || dead[c] >= 1) continue;
      any = true;
      const s = fl[key] || (fl[key] = { t: rnd(F.ON[0], F.ON[1]), off: 0 });
      s.t -= dt;
      if (s.t <= 0) { s.off = s.off ? 0 : 1; s.t = s.off ? rnd(F.OFF[0], F.OFF[1]) : (Math.random() < 0.35 ? rnd(F.OFF[0], F.OFF[1] * 1.5) : rnd(F.ON[0], F.ON[1])); }   // иногда — очередью
      dead[c] = s.off ? F.DIM : 0.45;
    }
    if (!any) FLK.delete(W);
  }
}

/* ─── каждый кадр: болтается на ходу ─── */
export function step (dt) {
  if (FLK.size && dt > 0) flicker(dt);
  if (!LIVE.size || !(dt > 0)) return;
  const SP = WR.SPRING, t = performance.now() / 1000;
  for (const W of LIVE) {
    const g = W.g;
    if (!g.parent) { LIVE.delete(W); continue; }
    const mv = W.mv || (W.mv = { x: g.position.x, y: g.position.y, z: g.position.z, vx: 0, vy: 0, vz: 0, h: g.rotation.y, w: 0 });
    const vx = (g.position.x - mv.x) / dt, vy = (g.position.y - mv.y) / dt, vz = (g.position.z - mv.z) / dt;
    let dh = g.rotation.y - mv.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const w = dh / dt;
    const okV = Math.hypot(vx, vz) < 80;            // телепорт — не разгон
    const ax = okV ? (vx - mv.vx) / dt : 0, ay = okV ? (vy - mv.vy) / dt : 0, az = okV ? (vz - mv.vz) / dt : 0, aw = okV ? (w - mv.w) / dt : 0;
    Object.assign(mv, { x: g.position.x, y: g.position.y, z: g.position.z, vx: okV ? vx : 0, vy: okV ? vy : 0, vz: okV ? vz : 0, h: g.rotation.y, w: okV ? w : 0 });
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    const af = ax * s + az * c, al = ax * c - az * s, sp = Math.hypot(vx, vz);   // вперёд и влево (оси машины)
    let any = false;
    for (const key in W.P) {
      const pc = W.P[key], P = W.parts[key];
      if (!pc || pc.gone || !P || P.st !== 2) continue;
      any = true;
      const Q = WR.POSE[pc.kind][1], amp = Q.amp || 0.05;
      let ex = (Math.random() - 0.5) * sp * SP.BUMP + ay * SP.BUMP * 0.3;
      if (pc.kind === 'hood') ex += af * SP.ACC;
      else if (pc.kind === 'trunk') ex -= af * SP.ACC;
      else if (pc.kind === 'door') ex += (al * SP.ACC - aw * SP.YAW * 0.1) * pc.s;
      else if (pc.kind === 'lamp') ex += af * SP.ACC * (pc.H && pc.H.z < 0 ? -1 : 1) + Math.sin(t * 9 + pc.id) * sp * 0.002;
      pc.hv += (ex * SP.K - SP.K * pc.h - SP.C * pc.hv) * dt;
      pc.h += pc.hv * dt;
      if (pc.h > amp) { pc.h = amp; pc.hv *= -0.3; } else if (pc.h < -amp * 0.6) { pc.h = -amp * 0.6; pc.hv *= -0.3; }
      if (pc.trunk) { pc.trunk.bend = WR.POSE.trunk[1].open + pc.h; continue; }   // коробочный седан: крышку двигает game.js updateTrunk
      pose(pc);
    }
    if (!any) LIVE.delete(W);
  }
}

/* ─── свет фар: сколько целых спереди ─── */
function frontOK (g) {
  const u = g && g.userData;
  if (!u) return [1, 1];
  const R = u.real, d = R && R.lamp && R.lamp.dead;
  if (d) return [d.x < 0.5 ? 1 - d.x : 0, d.y < 0.5 ? 1 - d.y : 0];
  const L = u.lamps;
  if (L) return [L.fl ? (L.fl.st ? 0 : L.fl.cr ? 0.55 : 1) : 1, L.fr ? (L.fr.st ? 0 : L.fr.cr ? 0.55 : 1) : 1];
  return [1, 1];
}
/** луч фар своей машины на асфальте: k — сила (0…1), x — сдвиг вбок (+ — влево по ходу, м), w — ширина (доля) */
const BEAM = { k: 1, x: 0, w: 1 };
export function beam (g) {
  const [l, r] = frontOK(g);
  if (l && r) { BEAM.k = (l + r) / 2; BEAM.x = 0; BEAM.w = 1; }
  else if (l || r) { BEAM.k = 0.55 * (l || r); BEAM.x = (l ? 1 : -1) * 0.6; BEAM.w = 0.55; }
  else { BEAM.k = 0; BEAM.x = 0; BEAM.w = 1; }
  return BEAM;
}
/** машина потока (roadlife.js): null — обе целы; иначе { k, x, w } как beam */
export function headOf (g) {
  const [l, r] = frontOK(g);
  if (l === 1 && r === 1) return null;
  return beam(g);
}

/* битая ли (Дядя Женя выправит): перекошено, болтается, отлетело */
export function hurt (g) {
  const W = g && WS.get(g);
  if (!W) return false;
  for (const k in W.parts) if (W.parts[k].st) return true;
  return false;
}
export function state (g) {
  const W = g && WS.get(g);
  if (!W) return {};
  const o = {};
  for (const k in W.parts) { const P = W.parts[k]; if (P.d > 0) o[k] = P.st + '/' + P.d.toFixed(2); }
  return o;
}
export const DEBUG = { WR, ST, REAL_PARTS, SCAR, state, piece, hurt, hit, sync, cap: g => capOf(g), flk: () => FLK.size, beam: g => ({ ...beam(g) }), live: () => LIVE.size,
  pieces: g => { const W = g && WS.get(g); return W ? Object.fromEntries(Object.entries(W.P).map(([k, p]) => [k, p.gone ? 'off' : (p.box ? 'box' : p.tris + ' тр.')])) : {}; } };
