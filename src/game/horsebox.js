/* ──────────────────────────────────────────────────────────────────────────
   Коневозка: машина потока с прицепом, из окна прицепа торчит голова коня
   (docs/IDEAS.md, быстрые правки; правила — docs/CAREER.md «Трафик по часам» → «Коневозка»).

   Кто: каждая новая машина потока (не такси, не на парковке, не скорая/курьеры/погоня) с шансом
     HB.P (1 из 50) едет с прицепом. При ~22 машинах вокруг это одна коневозка примерно на
     полтора-два «состава» потока — встречается раз в несколько минут, не на каждой улице.
     С прицепом машина едет на 20 % медленнее (SLOW), а едущие сзади держат дистанцию больше
     на длину прицепа (TOW — поле t.tow, game.js updateTraffic).
   Как едет: прицеп — на сцепке за задним бампером, ось прицепа тянется за сцепкой на дышле
     (L = 2,7 м): на поворотах прицеп «срезает» угол и поворачивает позже машины, как настоящий.
   Удар: въехал в прицеп быстрее HIT (8 м/с ≈ 29 км/ч) — прицеп отцепляется и отлетает (быстрее
     TIP (14 м/с ≈ 50 км/ч) — ещё и ложится на бок); тебе — как удар о машину (сердца по скорости).
     Медленнее — упёрся, как в машину. Машину-тягач отбросило сильно (быстрее DETACH 10 м/с) или
     она сгорела — прицеп тоже отцепляется. Отцепленный — лежит/стоит, конь кричит «иго-го!»;
     уехал дальше FAR (140 м) — прицеп убирается. Отцепленных одновременно — не больше LOOSE (4).
   Перф: геометрия склеена и общая на все прицепы — 4 меша на прицеп (кузов, огни, конь, хвост).

   Из game.js:
     HB.step(dt, api)   — каждый кадр (CL.step); api — см. hbApi в game.js
     HB.onRespawn(t)    — машину потока переставили (respawnTraffic): старый прицеп убираем, бросаем жребий заново
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { t as tr } from '../i18n/index.js';

export const HB = {
  P: 1 / 50,          // шанс, что новая машина потока — с прицепом
  SLOW: 0.8,          // скорость тягача от обычной
  L: 2.7,             // дышло: от сцепки до оси прицепа, м
  TOW: 4.4,           // на сколько больше дистанция у едущих сзади, м
  HIT: 8,             // м/с: быстрее — прицеп отцепляется от твоего удара
  TIP: 14,            // м/с: быстрее — ещё и ложится на бок
  DETACH: 10,         // м/с: тягач отбросило быстрее — прицеп отцепился
  FAR: 140,           // м: отцепленный дальше — убираем
  LOOSE: 4,           // отцепленных одновременно не больше
};

let A = null;
const LIST = [];      // { car, grp, neck, tail, x, z, h, gy, loose, vx, vz, spin, roll, rollT, pitch, ph, say, sayT }
const ST = { rolled: 0, towed: 0, detached: 0, hits: 0 };
let GEO = null, MAT = null, MAT_B = null;

/* ── модель: собираем один раз, склеиваем ── */
function build () {
  if (GEO) return;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const body = [], lights = [], horse = [], tail = [];
  const put = A.put;
  const CREAM = '#e9e2d0', ROOF = '#f6f3ec', STRIPE = '#8a2a2a', DARK = '#2b2a30', TYRE = '#1d1c20', WIN = '#23262c';
  // кузов: от z = −1,6 (зад) до 1,8 (перед), низ на 0,5 м
  put(body, B(1.7, 1.85, 3.4), CREAM, 0, 1.425, 0.1);
  put(body, B(1.78, 0.12, 3.48), ROOF, 0, 2.39, 0.1);
  put(body, B(1.6, 1.55, 0.3), CREAM, 0, 1.3, 1.92);                 // скруглённый нос — ступенькой
  put(body, B(1.5, 0.2, 0.3), ROOF, 0, 2.15, 1.92);
  put(body, B(1.72, 0.18, 3.42), STRIPE, 0, 1.0, 0.1);              // полоса по борту
  put(body, B(1.62, 0.12, 0.32), STRIPE, 0, 1.0, 1.92);
  put(body, B(1.5, 0.16, 3.2), DARK, 0, 0.44, 0.1);                 // рама
  for (const s of [1, -1]) {
    put(body, B(0.26, 0.1, 1.0), DARK, s * 0.92, 0.84, 0);          // крылья над колёсами
    put(body, new THREE.CylinderGeometry(0.36, 0.36, 0.22, 10), TYRE, s * 0.93, 0.36, 0, 0, 0, Math.PI / 2);
    put(body, new THREE.CylinderGeometry(0.15, 0.15, 0.24, 8), '#9aa0a8', s * 0.93, 0.36, 0, 0, 0, Math.PI / 2);
    put(body, B(0.04, 0.5, 0.9), WIN, s * 0.865, 1.95, 1.1);         // окна спереди по бокам
  }
  put(body, B(1.5, 1.4, 0.06), '#d8d0bc', 0, 1.2, -1.62);            // нижняя половина задней двери
  put(body, B(1.4, 0.5, 0.05), WIN, 0, 2.05, -1.62);                // верх задней двери открыт — там хвост
  put(body, B(0.1, 0.1, 1.0), DARK, 0.25, 0.48, 2.25, 0, 0.25, 0);   // дышло — буквой А
  put(body, B(0.1, 0.1, 1.0), DARK, -0.25, 0.48, 2.25, 0, -0.25, 0);
  put(body, B(0.2, 0.14, 0.24), DARK, 0, 0.5, 2.7);                 // сцепка
  for (const s of [1, -1]) put(lights, B(0.26, 0.12, 0.04), '#e0262a', s * 0.6, 0.72, -1.66);
  // конь: шея из окна (опора — низ окна, x = 0,86), голова смотрит вперёд
  const BAY = '#7a4a2a', MANE = '#2b1d14', MUZ = '#5a3620';
  put(horse, B(0.3, 0.8, 0.36), BAY, 0.2, 0.32, 0.02, 0, 0, -0.6);
  put(horse, B(0.09, 0.78, 0.12), MANE, 0.1, 0.36, -0.15, 0, 0, -0.6);
  put(horse, B(0.3, 0.3, 0.66), BAY, 0.46, 0.68, 0.2, 0.35, 0, 0);
  put(horse, B(0.27, 0.27, 0.24), MUZ, 0.46, 0.53, 0.52, 0.35, 0, 0);
  put(horse, B(0.09, 0.03, 0.46), '#f0ece4', 0.46, 0.84, 0.24, 0.35, 0, 0);   // белая проточина
  put(horse, B(0.07, 0.18, 0.07), BAY, 0.38, 0.9, -0.02);
  put(horse, B(0.07, 0.18, 0.07), BAY, 0.54, 0.9, -0.02);
  put(horse, B(0.12, 0.1, 0.2), MANE, 0.46, 0.86, -0.06);               // чёлка
  for (const s of [1, -1]) put(horse, B(0.03, 0.06, 0.08), '#111111', 0.46 + s * 0.155, 0.74, 0.28);
  put(tail, B(0.16, 0.75, 0.1), MANE, 0, -0.32, -0.05);
  GEO = { body: A.mergeGeos(body), lights: A.mergeGeos(lights), horse: A.mergeGeos(horse), tail: A.mergeGeos(tail) };
  MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  MAT_B = new THREE.MeshBasicMaterial({ vertexColors: true });
}

function makeTrailer () {
  build();
  const grp = new THREE.Group();
  grp.rotation.order = 'YXZ';
  grp.add(new THREE.Mesh(GEO.body, MAT), new THREE.Mesh(GEO.lights, MAT_B));
  const neck = new THREE.Group();
  neck.position.set(0.86, 1.72, 1.1);
  neck.scale.setScalar(1.3);                                       // голову видно издалека
  neck.add(new THREE.Mesh(GEO.horse, MAT));
  const tail = new THREE.Group();
  tail.position.set(0, 2.25, -1.66);
  tail.add(new THREE.Mesh(GEO.tail, MAT));
  grp.add(neck, tail);
  return { grp, neck, tail };
}

const eligible = t => !t.parked && !t.svc && !t.chase && !t.taxi && !t.gone && !t.accident && t.model !== 'moped';

function attach (t) {
  const m = makeTrailer();
  const o = { car: t, ...m, x: 0, z: 0, h: t.h, gy: t.gy, loose: 0, vx: 0, vz: 0, spin: 0, roll: 0, rollT: 0, pitch: 0, ph: Math.random() * 6, say: null, sayT: 0 };
  const fx = Math.sin(t.h), fz = Math.cos(t.h), back = (t.hl || 2) + 0.25 + HB.L;
  o.x = t.x - fx * back; o.z = t.z - fz * back;
  t.cruise *= HB.SLOW;
  t.tow = HB.TOW;
  t.hb = o;
  A.scene.add(o.grp);
  LIST.push(o);
  ST.towed++;
  return o;
}

function drop (o) {
  A.scene.remove(o.grp);
  if (o.say) { o.say.parent && o.say.parent.remove(o.say); o.say.material.dispose(); }
  if (o.car && o.car.hb === o) { o.car.hb = null; o.car.tow = 0; }
  const i = LIST.indexOf(o);
  if (i >= 0) LIST.splice(i, 1);
}

/* отцепился: дальше — сам по себе, с толчком (vx, vz) */
function detach (o, vx, vz, force) {
  if (o.loose) { o.vx += vx; o.vz += vz; return; }
  o.loose = 1; ST.detached++;
  if (o.car) { o.car.hb = null; o.car.tow = 0; }
  o.car = null;
  o.vx = vx; o.vz = vz;
  o.spin = (Math.random() * 2 - 1) * Math.min(3, 0.6 + force * 0.12);
  if (force >= HB.TIP) o.rollT = Math.random() < 0.5 ? 1.45 : -1.45;
  // конь возмущён
  if (A.sayBubble) { if (o.say) { o.say.parent && o.say.parent.remove(o.say); o.say.material.dispose(); } o.say = A.sayBubble(o.grp, tr('иго-го!'), '#7a4a2a', 3.5); o.sayT = 2.2; }
  if (A.Snd && A.Snd.fx) A.Snd.fx('horse', s => [880, 1180, 760].forEach((f, i) => setTimeout(() => { try { s.blip(f, 0.12, 'sawtooth', 0.07); } catch (e) { /* — */ } }, i * 110)), { x: o.x, z: o.z });
  // лишние отцепленные — самый старый долой
  const loose = LIST.filter(q => q.loose);
  if (loose.length > HB.LOOSE) drop(loose[0]);
}

/* поставить группу: ось на земле, нос к сцепке */
function pose (o, hitchY) {
  const grp = o.grp;
  o.gy = A.surfaceAt(o.x, o.z, o.gy);
  const fy = hitchY !== undefined ? hitchY : A.surfaceAt(o.x + Math.sin(o.h) * HB.L, o.z + Math.cos(o.h) * HB.L, o.gy);
  const slope = -Math.atan((fy - o.gy) / HB.L);
  grp.position.set(o.x, o.gy + Math.abs(Math.sin(o.roll)) * 0.85, o.z);
  grp.rotation.set(slope + o.pitch, o.h, o.roll);
}

/* прицеп за машиной: ось тянется за сцепкой на дышле длиной L */
function follow (o, dt) {
  const t = o.car, fx = Math.sin(t.h), fz = Math.cos(t.h), k = (t.hl || 2) + 0.25;
  const hx = t.x - fx * k, hz = t.z - fz * k;
  let dx = o.x - hx, dz = o.z - hz, d = Math.hypot(dx, dz);
  if (d < 0.01 || Math.abs(d - HB.L) > 3) { dx = -fx; dz = -fz; d = 1; }   // переставили/телепорт — сразу позади
  o.x = hx + dx / d * HB.L; o.z = hz + dz / d * HB.L;
  o.h = Math.atan2(hx - o.x, hz - o.z);
  o.pitch = 0;
  pose(o, t.gy !== undefined ? t.gy : undefined);
}

/* сам по себе: юз, разворот, на бок (если сильно) */
function loose (o, dt) {
  const sp = Math.hypot(o.vx, o.vz);
  if (sp > 0.05 || Math.abs(o.spin) > 0.02) {
    o.x += o.vx * dt; o.z += o.vz * dt;
    const bx = o.x, bz = o.z;
    A.pushOut(o, 1.3);
    if (bx !== o.x || bz !== o.z) { o.vx *= 0.4; o.vz *= 0.4; }
    const k = Math.max(0, sp - 9 * dt) / (sp || 1);
    o.vx *= k; o.vz *= k;
    o.h += o.spin * dt; o.spin *= Math.exp(-2.4 * dt);
    if (sp > 4 && Math.random() < dt * 10 && A.puff) A.puff(o.x, 0.2, o.z, false, 0.35);
  }
  o.roll += (o.rollT - o.roll) * Math.min(1, dt * 5);
  o.pitch += (0.16 - o.pitch) * Math.min(1, dt * 6);              // нос лёг на дышло
  pose(o);
}

/* ты въехал в прицеп */
function collide (o) {
  const V = A.V, L = A.CAR_L, W = A.CAR_W;
  if (Math.abs(V.x - o.x) > 9 || Math.abs(V.z - o.z) > 9) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), tx = Math.sin(o.h), tz = Math.cos(o.h);
  const cx = o.x + tx * 0.1, cz = o.z + tz * 0.1;
  let best = 1e9, nx = 0, nz = 0, px = 0, pz = 0;
  for (const a of [0.55, -0.55])
    for (const b of [0.85, -0.85]) {
      const ax = V.x + fx * L * a, az = V.z + fz * L * a, bx = cx + tx * b, bz = cz + tz * b;
      const d = Math.hypot(ax - bx, az - bz);
      if (d < best) { best = d; nx = ax - bx; nz = az - bz; px = (ax + bx) / 2; pz = (az + bz) / 2; }
    }
  const need = W + 0.95;
  if (best >= need || best === 0) return;
  nx /= best; nz /= best;
  const sp = o.loose ? 0 : (o.car.speed || 0);
  const ovx = o.loose ? o.vx : tx * sp, ovz = o.loose ? o.vz : tz * sp;
  const vn = (V.vx - ovx) * nx + (V.vz - ovz) * nz;
  const pen = need - best;
  if (vn >= 0) { V.x += nx * pen; V.z += nz * pen; return; }
  const hit = -vn;
  if (hit > HB.HIT) {
    ST.hits++;
    detach(o, -nx * hit * 0.8, -nz * hit * 0.8, hit);
    if (A.sparks) A.sparks(px, 0.8, pz, hit > 12 ? 12 : 5, -nx, -nz);
    if (A.Snd && A.Snd.crash) A.Snd.crash(hit, { x: px, z: pz }, 'car');
    if (A.hurt) A.hurt((hit - 5) * 0.14, hit, px, pz);
    V.vx *= 0.88; V.vz *= 0.88;
    o.x -= nx * pen; o.z -= nz * pen;
    return;
  }
  if (o.loose) {                                    // стоящий — подвинуть пополам
    o.x -= nx * pen * 0.6; o.z -= nz * pen * 0.6;
    V.x += nx * pen * 0.4; V.z += nz * pen * 0.4;
    o.vx -= vn * nx * 0.3; o.vz -= vn * nz * 0.3;
    V.vx -= vn * nx * 0.5; V.vz -= vn * nz * 0.5;
  } else {
    V.x += nx * pen; V.z += nz * pen;
    V.vx -= vn * nx * 0.8; V.vz -= vn * nz * 0.8;
  }
}

export function onRespawn (t) {
  if (t.hb && !t.hb.loose) drop(t.hb);
  t.hb = null; t.tow = 0; t.hbRoll = 0;
}

export function step (dt, api) {
  A = api;
  // жребий для новых машин потока
  for (const t of A.TRAFFIC) {
    if (t.hbRoll) continue;
    t.hbRoll = 1;
    if (!eligible(t)) continue;
    ST.rolled++;
    if (Math.random() < HB.P || DEBUG.force > 0) { if (DEBUG.force > 0) DEBUG.force--; attach(t); }
  }
  for (let i = LIST.length - 1; i >= 0; i--) {
    const o = LIST[i];
    if (!o.loose) {
      const t = o.car;
      if (!t || t.gone || t.hb !== o || !A.TRAFFIC.includes(t)) { drop(o); continue; }
      if (t.wreck) { detach(o, (t.kvx || 0) * 0.5, (t.kvz || 0) * 0.5, 0); }
      else if (t.knock && Math.hypot(t.kvx || 0, t.kvz || 0) > HB.DETACH) { detach(o, t.kvx * 0.5, t.kvz * 0.5, Math.hypot(t.kvx, t.kvz)); }
    }
    if (o.loose) {
      if (Math.hypot(o.x - A.V.x, o.z - A.V.z) > HB.FAR) { drop(o); continue; }
      loose(o, dt);
    } else follow(o, dt);
    // конь крутит головой, хвост машет
    o.ph += dt;
    o.neck.rotation.y = Math.sin(o.ph * 0.7) * 0.4;
    o.neck.rotation.z = Math.sin(o.ph * 2.1) * 0.06;
    o.tail.rotation.z = Math.sin(o.ph * 3.3) * 0.35;
    if (o.say && (o.sayT -= dt) <= 0) { o.say.parent && o.say.parent.remove(o.say); o.say.material.dispose(); o.say = null; }
    if (A.S.state !== 'title') collide(o);
  }
}

/* для probe: d.HB.force = 3 — следующие три новые машины с прицепом; list() — где кто */
export const DEBUG = {
  HB, ST, LIST, force: 0,
  attach: t => attach(t),
  list: () => LIST.map(o => {
    const t = o.car;
    if (!t) return { loose: 1, x: +o.x.toFixed(1), z: +o.z.toFixed(1), roll: +o.roll.toFixed(2) };
    const fx = Math.sin(t.h), fz = Math.cos(t.h), k = (t.hl || 2) + 0.25;
    const hx = t.x - fx * k, hz = t.z - fz * k;
    let dh = t.h - o.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { loose: 0, dist: +Math.hypot(t.x - A.V.x, t.z - A.V.z).toFixed(0), bar: +Math.hypot(hx - o.x, hz - o.z).toFixed(2), dh: +dh.toFixed(3), turn: !!t.turn, speed: +(t.speed || 0).toFixed(1) };
  }),
  clear: () => { for (const o of LIST.slice()) drop(o); },
};
