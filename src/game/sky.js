/* ──────────────────────────────────────────────────────────────────────────
   Небо, свет и палитра (2г1, 25.10.2026; автор: «игра выглядит плоско», рефы 6, 9, 10 — рисованная глубинка).

   Небо — купол вокруг камеры (один вызов отрисовки, последним из непрозрачного — только где не закрыто, без тумана):
     • градиент: зенит насыщенно-синий, к горизонту светлее и теплее; низ неба = цвет тумана, поэтому
       дальний город растворяется в небе, а не в серо-голубой стене;
     • свечение вокруг солнца (направление — от настоящего солнца игры) и тёплая полоса у горизонта
       со стороны солнца — днём слабая, к вечеру золотая (реф 10);
     • облака рисует сам купол: мягкие кучевые с размытым краем, освещённые с солнечной стороны, и
       перистые полосы; плывут по ветру и стоят над городом (при езде видно, что они на месте). Старые
       облака-комья (game.js CLOUDS) спрятаны;
     • ночью — тёмно-синее, редкие звёзды; дождь и снегопад — небо серее, облака сплошнее (цвета неба
       и тумана сереют в weather.js / seasons.js как раньше — купол берёт их в момент отрисовки).
   Цвета зенита и горизонта по времени суток — KEYS ниже (те же точки, что SKY_KEYS game.js, плюс
   «золотой час» 0,55—0,70). Пишутся в scene.background (зенит) и scene.fog.color (горизонт) —
   поэтому вода, погода и сезоны работают с ними как раньше.

   Свет: солнце теплее и ярче относительно неба, заполняющий свет (полусфера, эмбиент) — слабее и
   прохладнее: стороны домов на солнце и в тени заметно различаются (как реф 6 и 9), тень мягкая.
   Множители — LIGHT ниже, поверх профиля «мягкого города» (softcity.js light()).

   Выключить: ?oldsky — небо, свет и палитра как до 25.10.2026; ?nograde — только палитра (grade.js);
   ?oldlook — весь прежний вид. Из probe — __dlv.SKY.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as GRADE from './grade.js';

const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const SKY = {
  on: !Q.has('oldsky') && !Q.has('oldlook'),
  mesh: null, U: null,               // U — униформы купола (для probe)
  /* облака: сколько метров езды — одна «клетка» шума (сдвиг облаков при езде); ветер, м/с */
  cloudCell: 1400, wind: 2.2,
};

/* [доля суток, зенит, горизонт (= туман), цвет свечения солнца, тёплая полоса у горизонта 0…1, облачность 0…1, сила кривой]
   0 — шесть утра; 0,33 ≈ 14:00; 0,62 ≈ вечер; 0,77—0,93 — ночь */
const KEYS = [
  [0.00, '#6f8fc6', '#f2cfae', '#ffc48a', 0.85, 0.42, 0.85],
  [0.07, '#3d7fd0', '#cfe0ea', '#fff0d2', 0.25, 0.28, 1.0],
  [0.50, '#3d7fd0', '#d3e1e6', '#fff0d2', 0.3, 0.32, 1.0],
  [0.62, '#4a82c8', '#ecdcb6', '#ffd896', 0.7, 0.45, 1.0],
  [0.70, '#5a6ea6', '#f2b07a', '#ffa860', 1.0, 0.48, 0.95],
  [0.77, '#141c3a', '#222c4f', '#9db4ff', 0.0, 0.40, 0.55],
  [0.93, '#141c3a', '#222c4f', '#9db4ff', 0.0, 0.40, 0.55],
  [1.00, '#6f8fc6', '#f2cfae', '#ffc48a', 0.85, 0.42, 0.85],
];
const KC = KEYS.map(k => [k[0], new THREE.Color(k[1]), new THREE.Color(k[2]), new THREE.Color(k[3]), k[4], k[5], k[6]]);

/* свет днём (ночью — как было, 11бж): множители поверх SKY_KEYS и softcity.js */
export const LIGHT = {
  sun: 1.85,                 // солнце ярче (с «мягким городом» днём 1,30 → 2,4)
  sunWarm: '#ffd6a0', sunWarmK: 0.3, goldK: 0.35,   // теплее; к вечеру (0,55—0,70) ещё теплее
  hemi: 1.2,                 // полусфера: цвет темнее и синее (ниже), сила чуть больше — в сумме тень темнее на ~25 %
  hemiSky: '#a0b0e0', hemiSkyK: 0.5,     // свет неба на теневых сторонах — прохладный синий
  hemiGnd: '#a39a86', hemiGndK: 0.6,     // снизу — отсвет земли, тёплый серый (не зелёный: жёлтые стены в тени не «оливковые»)
  amb: 0.55, ambCol: '#b4c6ea',          // эмбиент слабее и прохладнее
  snowK: 0.55,               // зимой (снег лежит) прибавка солнца ×0,45: 1,85 → 1,38
};
/* итог днём (ENV.t 0,33), освещённость в долях: стена к солнцу 2,3 / стена в тени 1,2 (было 2,2 / 1,6 — разница
   1,4 раза, стала 1,9); земля на солнце 3,2 / в тени 1,5 (было 2,9 / 1,8) */
const LC = { warm: new THREE.Color(LIGHT.sunWarm), gold: new THREE.Color('#ffb870'), hs: new THREE.Color(LIGHT.hemiSky), hg: new THREE.Color(LIGHT.hemiGnd), amb: new THREE.Color(LIGHT.ambCol) };

const U = {
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlowC: { value: new THREE.Color() },
  uSun: { value: new THREE.Vector3(0, 1, 0) }, uBand: { value: 0 }, uGlow: { value: 1 },
  uCover: { value: 0.4 }, uNight: { value: 0 }, uOver: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() },
};

const VS = `
varying vec3 vDir;
void main () {
  vDir = position;
  vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = p.xyww;
}`;
const FS = `
uniform vec3 uZen, uHor, uGlowC, uSun, uCam;
uniform vec2 uWind;
uniform float uBand, uGlow, uCover, uNight, uOver;
varying vec3 vDir;
float h2 (vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn (vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm (vec2 p) {
  const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
  float s = 0.5 * vn(p); p = M * p;
  s += 0.25 * vn(p); p = M * p;
  s += 0.125 * vn(p); p = M * p;
  s += 0.0625 * vn(p);
  return s / 0.9375;
}
void main () {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  // градиент: у горизонта — цвет тумана, к зениту быстро темнее и насыщеннее
  float t = 1.0 - pow(1.0 - y, 3.2);
  vec3 col = mix(uHor, uZen, t);
  // тёплая полоса у горизонта со стороны солнца и свечение вокруг солнца
  vec2 sxz = normalize(uSun.xz + vec2(1e-4));
  float az = max(dot(normalize(d.xz + vec2(1e-4)), sxz), 0.0);
  float lowB = pow(1.0 - y, 5.0);
  col = mix(col, uGlowC, uBand * lowB * (0.35 + 0.65 * az * az) * 0.75 * (1.0 - uOver * 0.8));
  float sd = max(dot(d, uSun), 0.0);
  col += uGlowC * uGlow * (pow(sd, 6.0) * 0.16 + pow(sd, 48.0) * 0.32 + smoothstep(0.9985, 0.9993, sd) * 0.9) * (1.0 - uOver * 0.85);
  // звёзды ночью (облака их закрывают — сначала звёзды)
  if (uNight > 0.3) {
    vec2 g = floor(d.xz / (d.y + 0.35) * 260.0);
    float s = step(0.9965, h2(g)) * smoothstep(0.08, 0.3, d.y) * (uNight - 0.3) / 0.7 * (1.0 - uOver);
    col += vec3(0.5, 0.55, 0.7) * s;
  }
  // облака: слой на высоте над городом, по месту камеры (едешь — они стоят)
  float fade = smoothstep(0.0, 0.16, d.y);
  if (fade > 0.0) {
    // купол, а не плоскость: у горизонта облака сжаты слабее — кучевые и там «кучками», а не полосами
    vec2 p = d.xz / (d.y + 0.24) * 1.35 + uCam.xz / ${SKY.cloudCell.toFixed(1)} + uWind;
    float m = vn(p * 0.23 + 3.7);                         // где облака кучкуются, где ясно
    float sh = fbm(p) * (0.5 + 0.85 * m);
    float cov = mix(0.6 - uCover * 0.3, 0.1, uOver);
    float a = smoothstep(cov, cov + 0.09, sh);              // край мягкий, но облако — «кучкой»
    // свет: со стороны солнца облако светлее, толща — темнее к низу (рисованная тень), тонкий край просвечивает
    float sh2 = fbm(p + sxz * 0.18) * (0.5 + 0.85 * m);
    float dens = clamp((sh - cov) / 0.22, 0.0, 1.0);
    float lit = clamp(0.78 - dens * 0.55 + (sh - sh2) * 4.5, 0.0, 1.0);
    vec3 shade = mix(mix(uZen, uHor, 0.7), vec3(dot(uHor, vec3(0.33))), 0.4) * vec3(0.84, 0.86, 0.96);
    vec3 light = mix(vec3(1.0, 0.97, 0.92), uGlowC, 0.25 + 0.55 * uBand) * mix(1.1, 0.13, uNight);
    light = mix(light, shade * 1.22, uOver * 0.7);
    vec3 cc = mix(shade, light, smoothstep(0.2, 0.7, lit));
    // перистые: вытянутые прозрачные полосы выше кучевых
    vec2 q = d.xz / (d.y + 0.12) * 2.6 + uCam.xz / ${(SKY.cloudCell * 0.7).toFixed(1)} + uWind * 1.5;
    q = vec2(q.x * 0.5 + q.y * 0.2, q.y * 4.5 - q.x * 1.2);
    float ci = smoothstep(0.62, 0.9, 0.65 * vn(q) + 0.35 * vn(q * 2.3 + 1.7)) * 0.16 * (1.0 - uOver) * (1.0 - uNight) * (1.0 - smoothstep(0.45, 0.85, d.y));
    col = mix(col, light, ci * fade * (1.0 - a));
    col = mix(col, cc, a * fade * (0.94 - 0.4 * uNight));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

let R = null;
export function init ({ scene, renderer }) {
  R = renderer;
  GRADE.init(renderer);
  if (!SKY.on) return;
  /* рисуется последним из непрозрачного, с проверкой глубины (perf 14, 26.10.2026): облака и свечение считаются только там,
     где правда видно небо, а не на всём кадре под домами и землёй (купол на дальней плоскости — z = w); прозрачное — поверх */
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide,
    depthTest: true, depthWrite: false, fog: false, toneMapped: false });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = 1e9; m.matrixAutoUpdate = false;
  m.name = 'sky';
  /* в момент отрисовки — после погоды и сезонов: зенит и горизонт — какие они в этом кадре */
  m.onBeforeRender = (rr, sc, cam) => {
    U.uZen.value.copy(sc.background && sc.background.isColor ? sc.background : U.uZen.value);
    if (sc.fog) U.uHor.value.copy(sc.fog.color);
    U.uCam.value.copy(cam.position);
  };
  scene.add(m);
  SKY.mesh = m; SKY.U = U;
}

const CZ = new THREE.Color(), CH = new THREE.Color(), CG = new THREE.Color(), CA = new THREE.Color(), CB = new THREE.Color(), V3 = new THREE.Vector3();
const ease = k => k * k * (3 - 2 * k);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
let ambBase = null;

/* раз в кадр из game.js updateEnv — после дневного профиля и softcity.light, до погоды и сезонов.
   t — ENV.t, night — ENV.night, rain — ENV.rain, over — снегопад и т. п. (0…1) */
export function env ({ t, night, rain, over = 0, snow = 0, scene, sun, hemi, amb, dt = 0 }) {
  if (!SKY.on) { GRADE.weight(R, 1); return; }
  let i = 0;
  while (i < KC.length - 2 && t >= KC[i + 1][0]) i++;
  const A = KC[i], B = KC[i + 1], k = ease(clamp01((t - A[0]) / (B[0] - A[0])));
  CZ.copy(A[1]).lerp(B[1], k); CH.copy(A[2]).lerp(B[2], k); CG.copy(A[3]).lerp(B[3], k);
  const band = A[4] + (B[4] - A[4]) * k, cover = A[5] + (B[5] - A[5]) * k, gw = A[6] + (B[6] - A[6]) * k;
  const R0 = Math.min(1, rain), ov = Math.max(R0, over);
  // дождь: серее, как было (game.js RAIN_SKY), туман и небо — к одному серому
  CA.set('#8d97a3');
  CZ.lerp(CA, R0 * 0.6 * (1 - night * 0.6)); CH.lerp(CA, R0 * 0.6 * (1 - night * 0.6));
  scene.background.copy(CZ);
  if (scene.fog) scene.fog.color.copy(CH);
  U.uGlowC.value.copy(CG); U.uBand.value = band * (1 - night); U.uCover.value = cover; U.uNight.value = night;
  U.uOver.value = ov;
  U.uGlow.value = 1 - night * 0.7;
  U.uWind.value.x += SKY.wind * dt / SKY.cloudCell; U.uWind.value.y += SKY.wind * 0.35 * dt / SKY.cloudCell;
  // направление солнца — от настоящего солнца игры (позиция относительно цели)
  V3.copy(sun.position).sub(sun.target.position).normalize();
  U.uSun.value.copy(V3);
  // свет: днём солнце теплее и ярче, заполняющий слабее и прохладнее; ночью и в дождь — к прежнему
  const day = 1 - night, clear = 1 - R0 * 0.6, w = day * clear;
  const gold = clamp01((t - 0.55) / 0.12) * clamp01((0.76 - t) / 0.04) * day;
  sun.intensity *= 1 + (LIGHT.sun - 1) * w * (1 - LIGHT.snowK * snow);   // на снегу прибавка солнца меньше — белое не выгорает
  sun.color.lerp(LC.warm, LIGHT.sunWarmK * w).lerp(LC.gold, LIGHT.goldK * gold);
  if (hemi) {
    hemi.intensity *= 1 + (LIGHT.hemi - 1) * w;
    hemi.color.lerp(LC.hs, LIGHT.hemiSkyK * w);
    hemi.groundColor.lerp(LC.hg, LIGHT.hemiGndK * w);
  }
  if (amb) {
    if (!ambBase) ambBase = amb.color.clone();
    amb.intensity *= 1 + (LIGHT.amb - 1) * w;
    amb.color.copy(ambBase).lerp(LC.amb, w);
  }
  GRADE.weight(R, gw * (1 - R0 * 0.35));
}

/* старые облака-комья: прятать, когда облака рисует купол */
export const oldClouds = () => !SKY.on;
