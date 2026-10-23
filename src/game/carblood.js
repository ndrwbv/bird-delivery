/* ──────────────────────────────────────────────────────────────────────────
   Кровь на машинах (13.10.2026, только взрослая версия; автор: «как кровь добавляется на машину — на все машины»).

   Сбил человека — на кузове с той стороны пятна (морда, бок, корма): растут ~BLOOD.GROW с, потёки
   сползают вниз; пятна копятся (до BLOOD.N на машину) — машина «в кровище». Камера сзади — брызги
   перелетают на крышу и корму (чем быстрее, тем больше).
   • Своя машина — в той же программе, что грязь и снег (cardirt.js: vCL — точка в осях машины);
     новая машина (смена, «ещё раз», воскрешение) — чистая.
   • Машина потока, что сбила человека, — при первом наезде своя копия материалов с теми же
     пятнами (у потока материал общий на всех — иначе кровь была бы на всех машинах сразу).
   Кадр: пятна — числа в программе (без картинок и новых отрисовок); step — рост и потёки.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* N — пятен на машину, GROW — с растёт, DRIP — м/с ползёт потёк, DRIP_MIN — ниже не стекает (м), K — размер */
export const BLOOD = { N: 24, GROW: 0.9, DRIP: 0.07, DRIP_MIN: 0.3, K: 1.3 };
export const STATS = { cars: 0, splats: 0 };

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
  const add = (px, py, pz, r, drip) => {
    const v = S.U.uBlood.value[S.i++ % BLOOD.N];
    v.set(px, py, pz, 0.01);
    S.splats = S.splats.filter(q => q.v !== v);
    S.splats.push({ v, R: r * BLOOD.K, t: 0, drip });
    STATS.splats++;
  };
  add(x, 0.6, z, 0.3 + Math.random() * 0.15, 0);                              // удар — морда / бок / корма
  add(x + (Math.random() - 0.5) * 0.6, 0.45, z, 0.25, 1);                     // бампер, стекает
  add(x + (Math.random() - 0.5) * 0.4, 0.75, z * 0.97, 0.18, 1);              // потёк
  if (end && nz > 0) { add(x * 0.8, 1.0, HL - 0.6, 0.35, 0); add(x * 0.5, 1.3, 0.6, 0.2, 0); }   // капот и стойки
  else if (!end) add(x, 1.0, z, 0.25, 1);                                       // дверь повыше
  const n = kmh > 25 ? 1 + Math.floor(Math.min(3, kmh / 35)) : 0;             // камера сзади — на крышу и корму
  for (let i = 0; i < n; i++) add((Math.random() - 0.5) * 1.2, 1.5, -0.6 + Math.random() * 1.2, 0.18 + Math.random() * 0.15, 0);
  if (n > 1) { add((Math.random() - 0.5) * 1.0, 1.0, -HL + 0.55, 0.22, 1); add((Math.random() - 0.5) * 1.2, 0.75, -HL, 0.2, 1); }
}

function grow (S, dt) {
  for (const s of S.splats) {
    if (s.t > 4) continue;
    s.t += dt;
    s.v.w = s.R * Math.min(1, s.t / BLOOD.GROW) ** 0.5;
    if (s.drip && s.v.y > BLOOD.DRIP_MIN) s.v.y -= BLOOD.DRIP * dt;
  }
}
/* каждый кадр: пятна растут и стекают; у машин потока — их положение (обратная матрица). Убранные машины — из списка */
export function step (dt) {
  grow(PLAYER, dt);
  for (let i = CARS.length - 1; i >= 0; i--) {
    const S = CARS[i];
    if (!S.mesh.parent) { CARS.splice(i, 1); continue; }
    grow(S, dt);
    S.mesh.updateMatrixWorld();
    S.U.uBInv.value.copy(S.mesh.matrixWorld).invert();
  }
  STATS.cars = CARS.length;
}
