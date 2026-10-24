/* ──────────────────────────────────────────────────────────────────────────
   Кровь на машинах (13.10.2026, только взрослая версия; автор: «как кровь добавляется на машину — на все машины»).

   Сбил человека — на кузове с той стороны пятна (морда, бок, корма): растут ~BLOOD.GROW с, потёки
   сползают вниз; пятна копятся (до BLOOD.N на машину) — машина «в кровище». Камера сзади — брызги
   перелетают на крышу и корму (чем быстрее, тем больше).
   • Своя машина — в той же программе, что грязь и снег (cardirt.js: vCL — точка в осях машины);
     новая машина (смена, «ещё раз», воскрешение) — чистая.
   • Машина потока, что сбила человека, — при первом наезде своя копия материалов с теми же
     пятнами (у потока материал общий на всех — иначе кровь была бы на всех машинах сразу).
   • Копится и сходит (0п42 → 0п59, автор 24.10.2026: «с одного человека меньше крови», «кровь с машины быстрее
     исчезает»): один сбитый — 2—4 небольших пятна (HIT); пятен на машину — BLOOD.N; места не хватает — два ближних
     сливаются; доросшее пятно бледнеет и пропадает за FADE.SEC с (дождь и снег — до 4 раз быстрее); ремонт у
     Дяди Жени и новая машина — целиком.
     Настоящая «Семёрка» (realcar.js: свои 40 пятен на кузове) — те же правила: roomReal перед ударом, step — бледнеют.
   Кадр: пятна — числа в программе (без картинок и новых отрисовок); step — рост, потёки, дождь.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* N — пятен на машину, GROW — с растёт, DRIP — м/с ползёт потёк, DRIP_MIN — ниже не стекает (м), K — размер */
export const BLOOD = { N: 24, GROW: 0.9, DRIP: 0.07, DRIP_MIN: 0.3, K: 1.0 };
/* слить: ROOM — сколько мест держать свободными перед ударом (на удар — до 11 пятен), MAX — радиус слитого не больше, м;
   дождь: FROM — с какой силы смывает (дождь 0,85, ливень 1), RATE — доля размера за с в ливень, MIN — меньше не смоет */
export const MERGE = { ROOM: 6, MAX: 0.7 };
/* кровь сходит сама (0п59, автор 24.10: «кровь с машины должна быстрее исчезать»): доросшие пятна бледнеют и пропадают за SEC с езды;
   дождь и снег ускоряют: в ливень / снегопад — в 1 + WET раз быстрее (силы дождя и снега 0…1); стоя — тоже сходит, как и в езде */
export const FADE = { SEC: 90, WET: 3, GONE: 0.08 };
/* сколько крови с одного сбитого (0п59): HIT.SPRAY — брызги на крышу и корму только быстрее HIT.FAST км/ч, и не больше одного */
export const HIT = { FAST: 55 };
export const STATS = { cars: 0, splats: 0, merged: 0 };
export const CFG = { on: false };                   // взрослая версия: кровь в программе коробочной своей машины (cardirt.js patch; game.js)

/* пятно: xyz — центр в осях машины (x — влево, y — вверх, z — вперёд), w — радиус (0 — нет); ниже центра — вытянуто вниз */
export const GLSL = `
uniform vec4 uBlood[${BLOOD.N}];
float cbH (vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 carBlood (vec3 c, vec3 p) {
  float bl = 0.0;
  vec3 q = floor(p * 18.0) / 18.0;                 // крупный пиксель
  for (int i = 0; i < ${BLOOD.N}; i++) {
    vec4 s = uBlood[i];
    if (s.w <= 0.0) continue;
    vec3 d = q - s.xyz;
    if (d.y < 0.0) d.y *= 0.3;
    float r = length(d) / s.w + (cbH(q * 3.1 + float(i)) - 0.5) * 0.6;
    bl = max(bl, smoothstep(1.0, 0.7, r));
  }
  return mix(c, vec3(0.32, 0.015, 0.02), bl * 0.92);
}
`;

const newState = () => ({ U: { uBlood: { value: Array.from({ length: BLOOD.N }, () => new THREE.Vector4(0, 0, 0, 0)) }, uBInv: { value: new THREE.Matrix4() } }, i: 0, splats: [], mesh: null });
export const PLAYER = newState();                   // своя машина: uBlood — в cardirt.js
const CARS = [];                                    // машины потока с кровью: { mesh, U, splats }

/* своя машина новая — чистая (cardirt.js dress) */
export function resetPlayer () {
  for (const v of PLAYER.U.uBlood.value) v.set(0, 0, 0, 0);
  PLAYER.splats.length = 0; PLAYER.i = 0;
}

/* машина потока: копия материалов кузова, кровь в её осях (uBInv — обратная матрица машины, step) */
function own (mesh, track = true) {
  if (mesh.userData.blood) return mesh.userData.blood;
  const S = newState();
  S.mesh = mesh;
  const done = new Map();
  mesh.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || !o.material.isMeshLambertMaterial || o.material.transparent) return;
    if (!done.has(o.material)) {
      const m = o.material.clone(), prev = o.material.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uBlood = S.U.uBlood; sh.uniforms.uBInv = S.U.uBInv;
        sh.vertexShader = 'varying vec3 vCBW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'uniform mat4 uBInv;\nvarying vec3 vCBW;\n' + GLSL + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = carBlood(diffuseColor.rgb, (uBInv * vec4(vCBW, 1.0)).xyz);');
      };
      const key = o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : '';
      m.customProgramCacheKey = () => key + '|carblood';
      done.set(o.material, m);
    }
    o.material = done.get(o.material);
  });
  mesh.userData.blood = S;
  if (track) CARS.push(S);
  STATS.cars = CARS.length;
  return S;
}

/* сбил человека: car — группа машины, wx, wz — где был человек (мир), kmh — скорость удара, player — своя машина */
/* прогрев шейдеров (warmup.js, 18.10.2026): кузов «в крови» — своя программа на каждый материал кузова; собиралась в момент,
   когда лихач впервые сбил человека (в Электроне с медленным процессором — ожидание 70—80 мс). Образец — машина с теми же
   материалами: копии с кровью, без слежения (game.js WARM.init extra; потом освобождается) */
export function sample (mesh) { own(mesh, false); return mesh; }

export function hit (car, wx, wz, kmh = 40, player = false) {
  if (!car) return;
  const S = player ? PLAYER : own(car);
  const u = car.userData || {}, HL = (u.hl || 2.2) * 0.98, W2 = 0.95;
  car.updateMatrixWorld();
  const L = car.worldToLocal(new THREE.Vector3(wx, car.position.y + 0.8, wz));
  const end = Math.abs(L.z) / HL >= Math.abs(L.x) / W2;
  const nz = end ? Math.sign(L.z) || 1 : 0, nx = end ? 0 : Math.sign(L.x) || 1;
  const x = end ? Math.max(-W2, Math.min(W2, L.x)) : nx * W2, z = end ? nz * HL : Math.max(-HL, Math.min(HL, L.z));
  room(S.U.uBlood.value, S.splats, MERGE.ROOM, i => { S.i = i; });
  const add = (px, py, pz, r, drip) => {
    const v = S.U.uBlood.value[S.i++ % BLOOD.N];
    v.set(px, py, pz, 0.01);
    S.splats = S.splats.filter(q => q.v !== v);
    S.splats.push({ v, R: r * BLOOD.K, t: 0, drip });
    STATS.splats++;
  };
  add(x, 0.6, z, 0.2 + Math.random() * 0.08, 0);                              // удар — морда / бок / корма
  add(x + (Math.random() - 0.5) * 0.5, 0.45, z, 0.15, 1);                     // бампер, стекает
  if (end && nz > 0) add(x * 0.8, 1.0, HL - 0.6, 0.2, 0);                       // капот
  else if (!end && Math.random() < 0.5) add(x, 1.0, z, 0.15, 1);                // дверь повыше
  if (kmh > HIT.FAST) add((Math.random() - 0.5) * 1.2, 1.5, -0.6 + Math.random() * 1.2, 0.15, 0);   // камера сзади — одно пятно на крышу
}

/* Места под новые пятна (0п42): живые пятна — подряд с начала массива, следующий удар пишет за ними. Свободных меньше
   need — два ближних (по краям) сливаются: середина — по площади, радиус — накрывает оба (не больше MERGE.MAX),
   дорос и не стекает. vs — массив Vector4 (w — радиус, 0 — нет), splats — { v, R, t, drip }; setI(i) — куда писать */
function room (vs, splats, need, setI) {
  const N = vs.length;
  const live = splats.filter(q => q.v.w > 0);
  while (live.length > N - need && live.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i].v, b = live[j].v, dd = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - (live[i].R + live[j].R) * 0.5;
      if (dd < bd) { bd = dd; bi = i; bj = j; }
    }
    const A = live[bi], B = live[bj], a = A.v, b = B.v, wa = A.R * A.R, wb = B.R * B.R, k = wb / (wa + wb);
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    a.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, 0);
    A.R = Math.min(MERGE.MAX, Math.max(A.R, B.R, (d + A.R + B.R) * 0.5));
    a.w = A.R * (A.wk || 1); A.t = 5; A.drip = 0;                   // A.wk — сколько от размера оставил дождь
    b.set(0, 0, 0, 0);
    live.splice(bj, 1);
    STATS.merged++;
  }
  // подряд с начала: живые пятна — в первые места массива, запись следующего удара — за последним
  live.sort((p, q) => vs.indexOf(p.v) - vs.indexOf(q.v));
  const vals = live.map(q => q.v.clone());
  for (let i = 0; i < N; i++) vs[i].set(0, 0, 0, 0);
  for (let i = 0; i < live.length; i++) { vs[i].copy(vals[i]); live[i].v = vs[i]; }
  splats.length = 0;
  for (const q of live) splats.push(q);
  setI(live.length);
}
/* настоящая «Семёрка» (realcar.js blood: R.bloodU — 40 пятен, R.splats, R.bloodI — куда писать) — перед ударом */
export function roomReal (car) {
  const R = car && car.userData && car.userData.real;
  if (!R || !R.bloodU || !R.splats) return;
  room(R.bloodU.value, R.splats, MERGE.ROOM, i => { R.bloodI = i; });
}

function grow (S, dt) {
  for (const s of S.splats) {
    if (s.t > 4) continue;
    s.t += dt;
    s.v.w = s.R * Math.min(1, s.t / BLOOD.GROW) ** 0.5;
    if (s.drip && s.v.y > BLOOD.DRIP_MIN) s.v.y -= BLOOD.DRIP * dt;
  }
}
/* кровь сходит: доросшие пятна (t > 4: растёт пятно realcar.js / grow — до 4 с) бледнеют за FADE.SEC с, дождь и снег — быстрее; меньше FADE.GONE — нет */
function wash (splats, wet, dt) {
  const k = dt / FADE.SEC * (1 + FADE.WET * Math.min(1, wet));
  for (const s of splats) {
    if (!(s.t > 4) || !(s.v.w > 0)) continue;
    s.wk = (s.wk || 1) - k;
    if (s.wk < FADE.GONE) { s.v.w = 0; continue; }
    s.v.w = s.R * s.wk;
  }
}
/* машина в крови (Дядя Женя: «кровищу отмою»): кузов — своя «Семёрка» или коробочная, лобовое — glassblood.js */
export function bloody (car) {
  const R = car && car.userData && car.userData.real;
  if (R && R.splats) return R.splats.some(s => s.v.w > 0.02);
  return PLAYER.splats.some(s => s.v.w > 0.02);
}
/* каждый кадр: пятна растут и стекают, дождь смывает; у машин потока — их положение (обратная матрица). Убранные
   машины — из списка. car — своя (настоящая «Семёрка»: её пятна растут в realcar.js step, дождь — тут) */
export function step (dt, rain = 0, car = null) {
  grow(PLAYER, dt);
  wash(PLAYER.splats, rain, dt);
  const R = car && car.userData && car.userData.real;
  if (R && R.splats) wash(R.splats, rain, dt);
  for (let i = CARS.length - 1; i >= 0; i--) {
    const S = CARS[i];
    if (!S.mesh.parent) { CARS.splice(i, 1); continue; }
    grow(S, dt);
    wash(S.splats, rain, dt);
    S.mesh.updateMatrixWorld();
    S.U.uBInv.value.copy(S.mesh.matrixWorld).invert();
  }
  STATS.cars = CARS.length;
}
