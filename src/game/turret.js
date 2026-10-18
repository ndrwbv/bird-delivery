/* ──────────────────────────────────────────────────────────────────────────
   Гранатомёт на крыше (18.10.2026, автор: «можно купить автоматический гранатомёт, который отстреливает конкурентов»).
   Правила словами и числами — docs/CAREER.md «Крылья и гранатомёт». Покупка — гараж (econ.js ADDON.gun, cars.js
   upgrade(id, 'gun')), вид — mount() / head() ниже (зовёт cars.js makeModel: подставка — в склейку кузова, голова —
   отдельной группой, чтобы крутилась; car.userData.gun — она).

   Как стреляет (числа — GUN):
     • сам: ищет ближнюю машину конкурента (курьеры «Вселенной суши» и «Королевы Бургеров», что бодают, и
       машины-бургеры потока; свои курьеры, поток, мопеды, люди — не цели) в R м, не ближе R_MIN (свой взрыв не
       заденет), впереди или сбоку (не дальше ARC от носа — назад не бьёт), не за домом;
     • голова поворачивается к ней (TURN рад/с), навелась — выстрел: граната летит дугой туда, где машина будет
       (по её скорости), T_MIN…T_MAX с;
     • долетела, а машина в HIT_R м от точки — попадание: взрослая — машина горит (как от твоего тарана: конкурент —
       деньги из сумки и респект, game.js onBoom), детская — водомёт: машина «заглохла» на STALL с, без взрыва;
       промах — взрослая: маленький взрыв BLAST м (кого задело — по общим правилам), детская — брызги;
     • перезарядка CD с, гранат AMMO на смену (новая смена — полный ящик).
   Хад: справа сверху под скоростью (и полоской «полёт») — «гранаты 9»; на телефоне — значок над педалями.

   Переменных игры модуль не видит: всё — через init(api):
     V, Snd, toast, scene, car() — своя машина, adult, canUse(hud), targets() — машины (TRAFFIC), isTarget(t),
     los(x0, z0, x1, z1) — не за домом, floor(x, z), hit(t, x, z) — попал, miss(x, z) — промах, puff(x, y, z, dark, size)
   game.js зовёт: tick(dt) — каждый кадр езды; shiftStart() — новая смена.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t } from '../i18n/index.js';
import './turret.css';

export const GUN = {
  R: 42,          // м — дальше не стреляет
  R_MIN: 14,      // м — ближе не стреляет: свой взрыв (≈9 м бьёт машину) не заденет
  ARC: 1.95,      // рад от носа (≈112°): впереди и сбоку, назад — нет
  CD: 7,          // с — перезарядка между выстрелами
  AMMO: 12,       // гранат на смену
  SPEED: 26,      // м/с — скорость гранаты по земле…
  T_MIN: 0.55,    //   …но в полёте не меньше T_MIN
  T_MAX: 1.7,     //   …и не больше T_MAX с
  LOB: 0.12,      // дуга: вершина над прямой — LOB × дальность + 0,8 м
  HIT_R: 3.2,     // м — машина в стольких от точки падения: попал
  BLAST: 5,       // м — промах: маленький взрыв (взрослая)
  TURN: 5,        // рад/с — поворот головы
  AIM: 0.14,      // рад — навелась: можно стрелять
  SCAN: 0.25,     // с — как часто ищет цель
  STALL: 7,       // с — детская: облитая машина стоит
  FIRST: 1.2,     // с — после начала смены и пересадки не стреляет сразу
};
export const STATS = { shots: 0, hits: 0, miss: 0, scans: 0, lastTgt: null, lastDist: 0, flights: [] };

let A = null;
const ST = { ammo: GUN.AMMO, cd: GUN.FIRST, scanT: 0, tgt: null, yaw: 0, fly: [], trailT: 0, emptyHint: false };
let hud = null, hudN = null, hudLab = null, tp = null, lastShow = null, lastKey = '';
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

export function init (api) {
  A = Object.assign(A || {}, api);
  if (typeof document === 'undefined' || hud) return;
  const right = document.getElementById('hud-right');
  if (right) {
    hud = document.createElement('div');
    hud.id = 'gunhud';
    hud.hidden = true;
    hud.innerHTML = '<i></i><span></span><b></b>';
    hudLab = hud.querySelector('span'); hudN = hud.querySelector('b');
    const after = document.getElementById('flyhud') || document.getElementById('speed');
    if (after && after.parentNode === right) after.after(hud); else right.appendChild(hud);
  }
  const pad = document.querySelector('#touchpad .tp-right');
  if (pad) {
    tp = document.createElement('div');
    tp.className = 'tp-gun';
    tp.hidden = true;
    pad.appendChild(tp);
  }
}

const gunHead = () => { const c = A && A.car && A.car(); return c && c.userData ? c.userData.gun || null : null; };
export const has = () => !!gunHead();
export const state = () => ({ has: has(), ammo: ST.ammo, cd: ST.cd, yaw: ST.yaw, tgt: ST.tgt ? { x: Math.round(ST.tgt.x), z: Math.round(ST.tgt.z), foe: !!ST.tgt.rival, bcar: !!ST.tgt.bcar } : null, flying: ST.fly.length });

/* новая смена: полный ящик, не стреляет первые FIRST с */
export function shiftStart () {
  ST.ammo = GUN.AMMO; ST.cd = GUN.FIRST; ST.tgt = null; ST.emptyHint = false;
  for (const f of ST.fly) dropFly(f);
  ST.fly.length = 0;
}

/* ── кадр ── */
export function tick (dt) {
  if (!A) return;
  stepFly(dt);
  const h = gunHead();
  drawHud(h);
  if (!h) { ST.tgt = null; ST.yaw = 0; return; }
  if (h !== ST.head) { ST.head = h; ST.cd = Math.max(ST.cd, GUN.FIRST); h.rotation.y = ST.yaw = 0; }   // пересел / машину пересобрали
  ST.cd = Math.max(0, ST.cd - dt);
  const live = A.canUse ? A.canUse() : true;
  ST.scanT -= dt;
  if (ST.scanT <= 0) { ST.scanT = GUN.SCAN; ST.tgt = live && ST.ammo > 0 ? pick() : null; }
  else if (ST.tgt && !valid(ST.tgt)) ST.tgt = null;
  const V = A.V;
  let want = 0;
  if (ST.tgt) want = wrap(Math.atan2(ST.tgt.x - V.x, ST.tgt.z - V.z) - V.h);
  const err = wrap(want - ST.yaw), step = GUN.TURN * dt;
  ST.yaw = wrap(ST.yaw + Math.max(-step, Math.min(step, err)));
  h.rotation.y = ST.yaw;
  if (ST.tgt && live && ST.cd <= 0 && ST.ammo > 0 && Math.abs(err) < GUN.AIM) fire(h, ST.tgt);
}

/* цель годится: машина конкурента, жива, в кольце R_MIN…R, впереди или сбоку */
function valid (c) {
  if (!c || c.wreck || c.gone || !(A.isTarget && A.isTarget(c))) return false;
  const V = A.V, dx = c.x - V.x, dz = c.z - V.z, d = Math.hypot(dx, dz);
  if (d > GUN.R || d < GUN.R_MIN) return false;
  return Math.abs(wrap(Math.atan2(dx, dz) - V.h)) <= GUN.ARC;
}
function pick () {
  STATS.scans++;
  const V = A.V;
  let best = null, bd = Infinity, second = null, sd = Infinity;
  for (const c of A.targets ? A.targets() : []) {
    if (!valid(c)) continue;
    const d = Math.hypot(c.x - V.x, c.z - V.z);
    if (d < bd) { second = best; sd = bd; best = c; bd = d; } else if (d < sd) { second = c; sd = d; }
  }
  // не за домом: дом между — берём вторую, иначе никого (дальше двух не проверяем — дорого)
  for (const c of [best, second]) if (c && (!A.los || A.los(V.x, V.z, c.x, c.z))) return c;
  return null;
}

/* ── выстрел ── */
const GEO = {};
function geo () {
  if (GEO.g) return GEO;
  GEO.g = new THREE.SphereGeometry(0.12, 7, 5).scale(1, 1, 1.5);
  GEO.w = new THREE.SphereGeometry(0.2, 7, 5);
  GEO.flash = new THREE.SphereGeometry(0.26, 6, 4);
  GEO.mG = new THREE.MeshLambertMaterial({ color: '#3d4a2c' });
  GEO.mW = new THREE.MeshLambertMaterial({ color: '#7cc8ff' });
  GEO.mF = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, depthWrite: false });
  for (const k of ['mG', 'mW', 'mF']) GEO[k].userData.keep = true;
  return GEO;
}
const MZ = new THREE.Vector3();
function fire (h, c) {
  const G = geo(), adult = !!A.adult;
  MZ.set(0, 0.12, 0.62);
  h.updateWorldMatrix(true, false);
  h.localToWorld(MZ);
  const x0 = MZ.x, y0 = MZ.y, z0 = MZ.z;
  const d0 = Math.hypot(c.x - x0, c.z - z0);
  const T = Math.max(GUN.T_MIN, Math.min(GUN.T_MAX, d0 / GUN.SPEED));
  const sp = c.knock ? 0 : (c.speed || 0);         // куда приедет за полёт гранаты
  const x1 = c.x + Math.sin(c.h || 0) * sp * T, z1 = c.z + Math.cos(c.h || 0) * sp * T;
  const y1 = (A.floor ? A.floor(x1, z1) : 0) + 0.8;
  const m = new THREE.Mesh(adult ? G.g : G.w, adult ? G.mG : G.mW);
  m.position.set(x0, y0, z0);
  A.scene.add(m);
  const f = { m, x0, y0, z0, x1, y1, z1, T, t: 0, apex: GUN.LOB * Math.hypot(x1 - x0, z1 - z0) + 0.8, c };
  ST.fly.push(f);
  // вспышка у ствола (как у ёлки-турели) и звук выстрела — существующие
  const fl = new THREE.Mesh(G.flash, G.mF);
  fl.position.copy(MZ);
  A.scene.add(fl);
  ST.fly.push({ flash: fl, life: 0.08 });
  if (A.Snd && A.Snd.fx) {
    if (adult) A.Snd.fx('shot', s => { s.noise(0.1, 0.26); s.blip(110, 0.09, 'square', 0.14); }, { x: x0, z: z0 });
    else A.Snd.fx('pizza-throw', s => s.blip(520, 0.08, 'triangle', 0.1), { x: x0, z: z0 });
  }
  if (adult && A.puff) A.puff(x0, y0 - (A.floor ? A.floor(x0, z0) : 0), z0, false, 0.5);
  ST.ammo--; ST.cd = GUN.CD; ST.tgt = null; ST.scanT = 0.4;
  STATS.shots++; STATS.lastDist = Math.round(d0);
  STATS.lastTgt = c.rival ? 'foe' : c.bcar ? 'bcar' : 'car';
  if (ST.ammo <= 0 && !ST.emptyHint && A.toast) {
    ST.emptyHint = true;
    A.toast(adult ? t('гранаты кончились — новый ящик в следующую смену') : t('вода в водомёте кончилась — нальют в следующую смену'));
  }
}
function dropFly (f) {
  const o = f.m || f.flash;
  if (o) A.scene.remove(o);
}
function stepFly (dt) {
  for (let i = ST.fly.length - 1; i >= 0; i--) {
    const f = ST.fly[i];
    if (f.flash) {
      f.life -= dt;
      if (f.life <= 0) { dropFly(f); ST.fly.splice(i, 1); }
      continue;
    }
    f.t += dt;
    const k = Math.min(1, f.t / f.T);
    const x = f.x0 + (f.x1 - f.x0) * k, z = f.z0 + (f.z1 - f.z0) * k;
    f.m.position.set(x, f.y0 + (f.y1 - f.y0) * k + 4 * f.apex * k * (1 - k), z);
    if (A.adult && A.puff && (ST.trailT -= dt) <= 0) { ST.trailT = 0.07; A.puff(x, f.m.position.y - (A.floor ? A.floor(x, z) : 0), z, false, 0.25); }
    if (k < 1) continue;
    dropFly(f); ST.fly.splice(i, 1);
    land(f);
  }
}
function land (f) {
  const c = f.c;
  const near = c && !c.wreck && !c.gone && Math.hypot(c.x - f.x1, c.z - f.z1) < GUN.HIT_R;
  STATS.flights.push({ d: Math.round(Math.hypot(f.x1 - f.x0, f.z1 - f.z0)), T: +f.T.toFixed(2), hit: !!near });
  if (STATS.flights.length > 20) STATS.flights.shift();
  if (near && A.hit) { STATS.hits++; A.hit(c, f.x1, f.z1); return; }
  STATS.miss++;
  if (A.miss) A.miss(f.x1, f.z1);
}

/* ── хад: «гранаты 9» под полоской «полёт»; на телефоне — значок над педалями ── */
function drawHud (h) {
  const show = !!h && !!(A.canUse ? A.canUse(true) : true);
  if (show !== lastShow) {
    lastShow = show;
    if (hud) hud.hidden = !show;
    if (tp) tp.hidden = !show;
    lastKey = '';
  }
  if (!show) return;
  const cls = ST.ammo <= 0 ? 'empty' : ST.cd > 0 ? 'wait' : 'ready';
  const key = ST.ammo + cls + (A.adult ? 1 : 0);
  if (key === lastKey) return;
  lastKey = key;
  const lab = A.adult ? t('гранаты') : t('водомёт');
  if (hud) { hud.className = cls + (A.adult ? '' : ' kid'); hudLab.textContent = lab; hudN.textContent = String(ST.ammo); }
  if (tp) { tp.className = 'tp-gun ' + cls + (A.adult ? '' : ' kid'); tp.textContent = String(ST.ammo); tp.title = lab; }
}

/* ── вид: подставка на крыше (в склейку кузова) и голова (отдельно — крутится) ──
   at — { x, y, z } точка крыши (или палубы кабриолета) у cars.js dress; add(geo, hex, x, y, z) — склейка кузова */
export function mount (add, at, adult) {
  const ring = new THREE.CylinderGeometry(0.26, 0.3, 0.1, 10);
  add(ring, '#2b2c31', at.x, at.y + 0.05, at.z);
  add(new THREE.BoxGeometry(0.62, 0.04, 0.5), adult ? '#3a3d33' : '#2d6fb5', at.x, at.y + 0.02, at.z);
}
/* голова: put(list, geo, hex, x, y, z) и mergeGeos — склейка в один меш; ноль — ось поворота над подставкой.
   Взрослая — оливковый короб с ящиком гранат и толстым коротким стволом; детская — синий бак и белый раструб */
export function head (put, mergeGeos, adult) {
  const L = [];
  const B = (w, h, d, hex, x, y, z) => put(L, new THREE.BoxGeometry(w, h, d), hex, x, y, z);
  const C = (r, len, hex, x, y, z) => put(L, new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), hex, x, y, z);
  if (adult) {
    B(0.34, 0.22, 0.46, '#4a5636', 0, 0.13, 0);             // короб
    B(0.2, 0.2, 0.26, '#3b4429', 0.25, 0.12, -0.04);         // ящик-лента сбоку
    B(0.2, 0.03, 0.26, '#6b7a4a', 0.25, 0.235, -0.04);
    C(0.075, 0.5, '#24262b', 0, 0.13, 0.4);                  // ствол
    C(0.095, 0.08, '#1b1c20', 0, 0.13, 0.64);                // дульный срез
    B(0.06, 0.08, 0.06, '#24262b', 0, 0.28, 0.12);           // прицел
  } else {
    C(0.15, 0.4, '#3f9ae0', 0, 0.15, -0.02);                 // бак
    C(0.155, 0.05, '#ffffff', 0, 0.15, -0.02);               // белая полоска
    C(0.06, 0.4, '#f2f0ea', 0, 0.15, 0.36);                  // раструб
    C(0.09, 0.06, '#ffd23f', 0, 0.15, 0.58);                 // жёлтый наконечник
  }
  const m = new THREE.Mesh(mergeGeos(L), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}
