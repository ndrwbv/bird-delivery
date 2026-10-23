/* ──────────────────────────────────────────────────────────────────────────
   Вручение в кадре (11бд, автор 24.10.2026: «отвёз клиенту пиццу, кинул её ему — камера на угол должна
   поворачиваться, чтобы показать, что произошло»; «если диалог — должна быть сцена крупным планом, что ему
   пиццу дают и он что-то говорит»). Правила словами — docs/ORDERS.md «Вручение в кадре».

   1) ПОВОРОТ — каждое вручение (коробка летит из багажника): камера плавно разворачивается на клиента
      (HC.IN с), держит, пока коробка летит и он её ловит (радуется / злится / роняет), и плавно уходит обратно
      за машину (HC.OUT с) — всего ~2 с. Сзади (высоко и близко) камера обходит машину на другую от клиента
      сторону, чуть вбок — видно и багажник, и клиента; из-за руля поворачивается голова курьера (camlook.js).
      Пропуск — любая клавиша, кнопка геймпада, касание, газ (машина тронулась) — камера возвращается за HC.QUICK с.
   2) СЦЕНА — только если с клиентом сейчас будет разговор (разговор у двери, просьба-поручение, приглашение
      клиентки): склейкой — крупный план сбоку, курьер стоит перед клиентом с коробкой в руках, протягивает её,
      клиент берёт двумя руками (qpeople.js CARRY) и говорит реплику облачком; потом склейкой назад — и окно
      разговора. ~3 с. Пропуск — любая клавиша / кнопка / касание: коробка сразу у клиента, сразу окно.

     init(api)                 — game.js: { THREE, cam, V, S, IN, pad, car(), mode(), groundH, camClear, makeHuman,
                                 courier() — человек курьера, box() — коробка, say(grp, text, col, y, vip) — облачко,
                                 emote(x, y, z, kind, n), DCAST, LK — camlook.js, LOOK, driver(on), undraw(), ADULT }
     handed(st, list, o)       — game.js handOver: коробки полетят; list — [{ ped, person, cancel() → bool, give() }];
                                 o: { onTime, story } — поворот + «взвод»: окно разговора с этим клиентом в ближайшие
                                 HC.ARM с (DLG.say → gate) — вместо поворота сцена (полёт коробки отменён, её отдаёт курьер)
     gate(o)                   — dialog.js: перед окном разговора; Promise — сначала сцена
     scene(ped, o) → Promise | null — сцена (doorstep.js — перед разговором у двери; o: { onTime, give(), kind });
                                 null — не вышло (клиента нет, уже идёт сцена, ?oldhand), give не звали
     step(dt)                  — каждый кадр после camStep: камера поворота / сцены поверх обычной
     busy()                    — идёт сцена (game.js держит машину, как при окне разговора)
     cabOut()                  — сцена из-за руля: камера снаружи, машину показать, салон не рисовать
   ?oldhand — по-старому (ни поворота, ни сцены). Отладка: __dlv.HCAM
   ────────────────────────────────────────────────────────────────────────── */
import { t, N_ } from '../i18n/index.js';

export const HC = {
  IN: 0.45,           // с: камера разворачивается на клиента
  HOLD: 0.95,         // с: держит (коробка летит 0,38—0,98 с, клиент ловит, реакция)
  OUT: 0.55,          // с: обратно за машину
  QUICK: 0.3,         // с: пропустили — обратно за столько
  GROUP: 0.22,        // с: ещё на каждого следующего в компании (коробки летят по очереди)
  SPEED: 4,           // м/с: машина поехала быстрее (и на 1,5 быстрее, чем на вручении) — поворот кончается
  SIDE: 0.6,          // рад: камера — напротив клиента через машину, повёрнута вбок на столько (видно багажник и клиента)
  HIGH: { r: 7, h: 3.3 },     // сзади, высоко: м от машины, над машиной
  NEAR: { r: 5, h: 2.2 },     // сзади, близко
  LOOK: 0.85,         // смотрит в точку на пути от машины к клиенту (доля пути)
  LOOK_Y: 1.05,       // м над землёй
  CAB_DN: 0.05,       // из-за руля: взгляд чуть ниже (коробка в руках)
  ARM: 0.3,           // с: окно разговора с клиентом в этот срок после вручения — сцена вместо поворота
  SC: {
    STAND: 1.05,      // м: курьер стоит перед клиентом
    HOLD0: 0.45,      // с: курьер стоит с коробкой (протягивает)
    PASS: 0.42,       // с: коробка из рук в руки (дугой)
    SAY: 1.9,         // с: клиент говорит облачком
    CAM_D: 3.1,       // м: камера сбоку от середины между ними
    CAM_F: 1.35,      // м: … и ближе к курьеру (видно лицо клиента)
    CAM_Y: 1.55,      // м над землёй — на уровне глаз
    LOOK_Y: 1.45,     // м: куда смотрит (между лицами и коробкой)
    FOV: 50,
    BUB: 2.3,         // м: облачко над клиентом (в кадре крупного плана)
  },
};

/* реплики клиента в сцене: вовремя — рад, опоздал — ворчит; перед просьбой — «слушай, есть дело» */
const LINES = {
  happy: [N_('О, горяченькая!'), N_('Наконец-то! Спасибо!'), N_('Пахнет — огонь!'), N_('Красава, быстро!'), N_('Ммм, сейчас поем')],
  late: [N_('Ну наконец-то…'), N_('Я уж думал, не приедешь'), N_('Остыла, небось'), N_('Час жду!')],
  lateAdult: [N_('Ну ёпт, наконец-то'), N_('Где тебя носило, блин?')],
  ask: [N_('Спасибо! Слушай, есть дело…'), N_('О, пицца! Слушай, выручишь?'), N_('Спасибо! А ты не занят?')],
};
const COL = { happy: '#3f8f4d', late: '#c0392b', ask: '#5a4a9a' };

let A = null;
const OFF = typeof location !== 'undefined' && /[?&]oldhand\b/.test(location.search);
const TURN = { on: false, t: 0, dur: 0, hold: 0, q: -1, w0: 0, peds: [], v0: 0, side: 0, w: 0, mode: '' };
const ARMED = { p: null };
const SC = { on: false, t: 0, ped: null, cour: null, box: null, a: null, mine: false, bub: null, given: false, said: false, done: null,
  give: null, line: '', col: '', emo: '', cam: null, cut: false, t0: 0, from: null, to: null };
const INP = { hit: false };
export const ST = { turns: 0, turnSkips: 0, scenes: 0, sceneSkips: 0, gates: 0, last: null, lastScene: null, maxW: 0 };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const pick = a => a[(Math.random() * a.length) | 0];
const alive = p => p && !p.dead && p.grp && p.grp.parent;
let V3 = null, V3b = null, V3c = null;

export function init (api) {
  A = api;
  V3 = new A.THREE.Vector3(); V3b = new A.THREE.Vector3(); V3c = new A.THREE.Vector3();
  if (typeof addEventListener !== 'function') return;
  // пропуск: любая клавиша / касание. Сцену клавиши не проходят (как катсцена story.js): ни руль, ни ответ мини-игры
  // под ней (smalltalk слушает keydown на window с захватом — наш обработчик заведён раньше и срабатывает первым)
  const hit = e => {
    if (SC.on) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) skipScene(); return; }
    if (TURN.on && !e.repeat) INP.hit = true;
  };
  addEventListener('keydown', hit, true);
  addEventListener('pointerdown', hit, true);
}

/* ── поворот ── */
function turnW () {
  const T = TURN;
  if (T.q >= 0) return T.w0 * (1 - ease((T.t - T.q) / HC.QUICK));
  if (T.t < HC.IN) return ease(T.t / HC.IN);
  if (T.t < HC.IN + T.hold) return 1;
  return 1 - ease((T.t - HC.IN - T.hold) / HC.OUT);
}
function quick (why) {
  if (!TURN.on || TURN.q >= 0) return;
  TURN.w0 = turnW(); TURN.q = TURN.t;
  if (why) { ST.turnSkips++; if (ST.last) ST.last.skip = why; }
}
function endTurn () { TURN.on = false; TURN.w = 0; TURN.peds = []; }

export function handed (st, list, o = {}) {
  if (!A || OFF || !list || !list.length) return;
  if (o.story) return;                              // сюжет — своя катсцена (story.js)
  ARMED.p = { list, onTime: !!o.onTime, until: performance.now() + HC.ARM * 1000 };
  const peds = list.filter(q => alive(q.ped) && !q.pre).map(q => q.ped);
  if (!peds.length) return;                         // коробку уже отдал курьер (сцена перед разговором у двери)
  const V = A.V;
  Object.assign(TURN, { on: true, t: 0, q: -1, w0: 0, peds, hold: HC.HOLD + HC.GROUP * Math.min(4, peds.length - 1),
    v0: Math.hypot(V.vx, V.vz), side: 0, w: 0, mode: A.mode() });
  TURN.dur = HC.IN + TURN.hold + HC.OUT;
  INP.hit = false;
  ST.turns++;
  ST.last = { n: peds.length, mode: TURN.mode, dur: +TURN.dur.toFixed(2), skip: '', t: 0 };
}

/* точка, на которую смотрим: середина живых клиентов */
function target () {
  let x = 0, z = 0, n = 0;
  for (const p of TURN.peds) if (alive(p)) { x += p.grp.position.x; z += p.grp.position.z; n++; }
  if (!n) return null;
  return { x: x / n, z: z / n };
}

function turnStep (dt) {
  const T = TURN, V = A.V, cam = A.cam;
  T.t += dt;
  if (ST.last) ST.last.t = +T.t.toFixed(2);
  const sp = Math.hypot(V.vx, V.vz);
  const p = A.pad;
  if (T.q < 0) {
    if (INP.hit) quick('key');
    else if (p && p.any) quick('pad');
    else if (sp > Math.max(HC.SPEED, T.v0 + 1.5)) quick('drive');
    else if (A.LK && A.LK.src) quick('look');
    else if (A.focus && A.focus()) quick('talk');      // у двери уже кто-то говорит (сценка, oddfolk.js) — камера на нём
    else if (A.S.state === 'dying' || A.S.state === 'over') quick('over');
  }
  INP.hit = false;
  const w = turnW();
  T.w = w;
  ST.maxW = Math.max(ST.maxW, w);
  const done = T.q >= 0 ? T.t - T.q >= HC.QUICK : T.t >= T.dur;
  const tg = target();
  if (done || !tg) { if (A.mode() === 'cab' && A.LK && !A.LK.src && A.LK.relT < 0) { A.LK.yaw = 0; A.LK.pitch = 0; } endTurn(); return; }
  const ac = Math.atan2(tg.x - V.x, tg.z - V.z);
  if (A.mode() === 'cab') {
    // из-за руля: голова курьера на клиента (camlook.js — вправо до 160°, влево до 125°); сам крутит — не мешаем
    const LK = A.LK, L = A.LOOK;
    if (LK && !LK.src && LK.relT < 0) {
      LK.yaw = clamp(dAng(V.h, ac) * w, -L.CAB_R, L.CAB_L);
      LK.pitch = -HC.CAB_DN * w;
    }
    return;
  }
  if (w <= 0.001) return;
  // сзади: камера обходит машину на другую от клиента сторону (по кругу, не сквозь машину), смотрит на клиента
  const P = cam.position;
  const a0 = Math.atan2(P.x - V.x, P.z - V.z), r0 = Math.hypot(P.x - V.x, P.z - V.z);
  if (!T.side) {                                     // с какого боку — ближе к тому, где камера сейчас (короче поворот)
    const aL = ac + Math.PI + HC.SIDE, aR = ac + Math.PI - HC.SIDE;
    T.side = Math.abs(dAng(a0, aL)) <= Math.abs(dAng(a0, aR)) ? 1 : -1;
  }
  const C = TURN.mode === 'near' ? HC.NEAR : HC.HIGH;
  const aT = ac + Math.PI + HC.SIDE * T.side;
  const sx = Math.sin(aT), sz = Math.cos(aT);
  let r = C.r;
  for (let d = 2; d <= C.r; d += 0.75) if (!A.camClear(V.x + sx * d, V.z + sz * d)) { r = Math.max(2.5, d - 1.4); break; }   // у стены — ближе и выше, как camStep
  const yT = Math.max(V.y + C.h + (C.r - r) * 0.5, A.groundH(V.x + sx * r, V.z + sz * r) + 2);
  const a = a0 + dAng(a0, aT) * w, rr = lerp(r0, r, w);
  const px = V.x + Math.sin(a) * rr, pz = V.z + Math.cos(a) * rr, py = lerp(P.y, yT, w);
  // куда смотрим: от прежнего взгляда — к точке между машиной и клиентом
  const lx = lerp(V.x, tg.x, HC.LOOK), lz = lerp(V.z, tg.z, HC.LOOK), ly = A.groundH(lx, lz) + HC.LOOK_Y;
  const D = Math.hypot(lx - P.x, ly - P.y, lz - P.z) || 1;
  V3.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(D).add(P);
  V3b.set(lerp(V3.x, lx, w), lerp(V3.y, ly, w), lerp(V3.z, lz, w));
  cam.position.set(px, py, pz);
  cam.up.set(0, 1, 0);
  cam.lookAt(V3b);
}

/* ── сцена крупным планом ── */
export function gate (o) {
  const P = ARMED.p;
  if (!A || OFF || !P || !o || !o.person) return null;
  if (performance.now() > P.until) { ARMED.p = null; return null; }
  const same = q => q.person === o.person || q.ped.person === o.person || (q.person && o.person.id && q.person.id === o.person.id);
  const q = P.list.find(q => q.ped && !q.pre && same(q));
  if (!q || !alive(q.ped) || q.ped.surf) return null;
  ARMED.p = null;
  if (!q.cancel()) return null;                     // коробка уже в полёте — без сцены
  ST.gates++;
  endTurn();
  const pr = scene(q.ped, { onTime: P.onTime, give: q.give, kind: o.pay ? 'ask' : '' });
  if (!pr) q.give();
  return pr;
}

function courier () {
  if (SC.cour && SC.cour.userData) return SC.cour;
  const p = A.courier && A.courier();
  if (!p) return null;
  try {
    const g = A.makeHuman(p, { shirt: p.look && p.look.shirt, pants: p.look && p.look.pants });
    SC.cour = g;
    return g;
  } catch (e) { console.warn('[handcam] courier', e); return null; }
}

export function scene (ped, o = {}) {
  if (!A || OFF || SC.on || !alive(ped) || ped.surf) return null;   // не вышло — без сцены (кто звал, отдаёт коробку сам)
  const g = ped.grp, gx = g.position.x, gz = g.position.z, ry = g.rotation.y;
  const fx = Math.sin(ry), fz = Math.cos(ry);
  const gy = A.groundH(gx, gz);
  const cour = courier();
  ST.scenes++;
  const late = !o.onTime;
  const kind = o.kind === 'ask' && !late ? 'ask' : late ? 'late' : 'happy';
  const pool = kind === 'late' ? LINES.late.concat(A.ADULT ? LINES.lateAdult : []) : LINES[kind];
  Object.assign(SC, { on: true, t: 0, ped, given: false, said: false, give: o.give || null, line: t(pick(pool)), col: COL[kind],
    emo: late ? 'angry' : 'happy', bub: null, box: null, a: null, mine: false, t0: performance.now(), from: null, cut: false });
  // курьер — перед клиентом лицом к нему, коробка у него в руках (как у клиента: на кистях, qpeople.js CARRY)
  const S = HC.SC;
  const cx = gx + fx * S.STAND, cz = gz + fz * S.STAND;
  if (cour) {
    cour.position.set(cx, A.groundH(cx, cz), cz);
    cour.rotation.set(0, ry + Math.PI, 0);
    cour.visible = true;
    if (!cour.parent) A.scene.add(cour);
    const b = A.box();
    b.scale.setScalar(0.75);
    b.position.set(0, 1.12, 0.48);
    cour.add(b);
    SC.box = b;
  }
  if (A.driver) A.driver(false);                    // курьер вышел — за рулём пусто
  // клиент говорит ртом (doorcast.js); свой актёр (не разговора у двери) — уберём сами
  const n0 = A.DCAST.ST.actors;
  SC.a = A.DCAST.client(ped, { nofocus: true });
  SC.mine = A.DCAST.ST.actors > n0;
  // камера: сбоку от пары, ближе к курьеру (лицо клиента — к камере), на уровне глаз; та сторона, что дальше от машины
  const V = A.V, mx = gx + fx * S.STAND * 0.5, mz = gz + fz * S.STAND * 0.5;
  let best = null;
  for (const sg of [1, -1]) for (const k of [1, 0.65]) {
    const px = mx + fz * sg * S.CAM_D * k + fx * S.CAM_F, pz = mz - fx * sg * S.CAM_D * k + fz * S.CAM_F;
    const clear = A.camClear(px, pz) && A.camClear(lerp(mx, px, 0.5), lerp(mz, pz, 0.5));
    const sc = (clear ? 100 : 0) + k * 10 + Math.min(8, Math.hypot(px - V.x, pz - V.z));
    if (!best || sc > best.sc) best = { sc, x: px, z: pz };
  }
  SC.cam = { x: best.x, y: Math.max(gy, A.groundH(best.x, best.z)) + S.CAM_Y, z: best.z, lx: lerp(mx, gx, 0.15), ly: gy + S.LOOK_Y, lz: lerp(mz, gz, 0.15) };
  ST.lastScene = { kind, line: SC.line, ms: 0, skip: false, cour: !!cour };
  return new Promise(res => { SC.done = res; });
}

function skipScene () {
  if (!SC.on) return;
  ST.sceneSkips++;
  if (ST.lastScene) ST.lastScene.skip = true;
  endScene();
}
function giveNow () {
  if (SC.given) return;
  SC.given = true;
  if (SC.box) { if (SC.box.parent) SC.box.parent.remove(SC.box); disposeBox(SC.box); SC.box = null; }
  try { if (SC.give) SC.give(); } catch (e) { console.warn('[handcam] give', e); }
}
function disposeBox (b) { b.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!o.material.userData.keep) o.material.dispose(); } }); }
function endScene () {
  if (!SC.on) return;
  giveNow();
  SC.on = false;
  if (SC.bub) { if (SC.bub.parent) SC.bub.parent.remove(SC.bub); SC.bub.material.dispose(); SC.bub = null; }
  if (SC.a) { A.DCAST.talk(SC.a, false); if (SC.mine) A.DCAST.leave(SC.a); SC.a = null; }
  if (SC.cour) { SC.cour.visible = false; if (SC.cour.parent) SC.cour.parent.remove(SC.cour); }
  if (A.driver) A.driver(true);
  if (ST.lastScene) ST.lastScene.ms = Math.round(performance.now() - SC.t0);
  const r = SC.done; SC.done = null; SC.ped = null;
  if (r) r(true);
}

function sceneStep (dt) {
  const S = HC.SC, cam = A.cam, ped = SC.ped;
  SC.t += dt;
  const st = A.S.state;
  if (!alive(ped) || st === 'dying' || st === 'over' || st === 'title' || (A.pad && A.pad.any)) { if (A.pad && A.pad.any) skipScene(); else endScene(); return; }
  // коробка: постоял — из рук в руки дугой, долетела — у клиента (game.js takeBox / doorstep — двумя руками)
  if (!SC.given && SC.t >= S.HOLD0) {
    const b = SC.box;
    if (b && !SC.from) {
      b.getWorldPosition(V3c);
      SC.from = { x: V3c.x, y: V3c.y, z: V3c.z };
      b.parent.remove(b); A.scene.add(b);
      b.position.copy(V3c);
      b.rotation.set(0, SC.cour ? SC.cour.rotation.y : 0, 0);
    }
    const k = ease((SC.t - S.HOLD0) / S.PASS);
    if (b && SC.from) {
      const g = ped.grp, ry = g.rotation.y;
      const tx = g.position.x + Math.sin(ry) * 0.45, tz = g.position.z + Math.cos(ry) * 0.45, ty = g.position.y + (ped.sitting ? 0.9 : 1.02);
      b.position.set(lerp(SC.from.x, tx, k), lerp(SC.from.y, ty, k) + Math.sin(k * Math.PI) * 0.12, lerp(SC.from.z, tz, k));
    }
    if (k >= 1 || !b) giveNow();
  }
  if (SC.given && !SC.said) {
    SC.said = true;
    SC.bub = A.say(ped.grp, SC.line, SC.col, S.BUB, 1);
    if (SC.a) A.DCAST.talk(SC.a, true, SC.emo);
    if (SC.emo === 'happy') A.emote(ped.grp.position.x, 2.1, ped.grp.position.z, 'heart', 2);
    else A.emote(ped.grp.position.x, 2.1, ped.grp.position.z, 'angry', 2);
    SC.sayT = SC.t;
  }
  if (SC.said && SC.t - SC.sayT >= S.SAY) { endScene(); return; }
  // камера — крупный план, склейкой; машину видно и из-за руля (салон не рисуем)
  const c = SC.cam;
  cam.position.set(c.x, c.y, c.z);
  cam.up.set(0, 1, 0);
  cam.lookAt(c.lx, c.ly, c.lz);
  if (Math.abs(cam.fov - S.FOV) > 0.01) { cam.fov = S.FOV; cam.updateProjectionMatrix(); }
  if (A.mode() === 'cab' && A.cabOut) A.cabOut();
}

/** каждый кадр после camStep (game.js) */
export function step (dt) {
  if (!A) return;
  if (ARMED.p && performance.now() > ARMED.p.until) ARMED.p = null;
  if (SC.on) { sceneStep(dt); return; }
  if (TURN.on) turnStep(dt);
}
export const busy = () => SC.on;
export const turning = () => TURN.on;

export const DEBUG = {
  HC, ST, TURN, SC, LINES,
  get w () { return +TURN.w.toFixed(3); },
  get armed () { return !!ARMED.p; },
  /** для probe: поворот на этих людей, как после вручения (коробка не летит) */
  turn (peds) { handed(null, (peds || []).map(ped => ({ ped, person: ped && ped.person, cancel: () => false, give: () => {} })), { onTime: true }); ARMED.p = null; },
  off: OFF,
};
