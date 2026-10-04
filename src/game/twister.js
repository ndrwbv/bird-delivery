/* ──────────────────────────────────────────────────────────────────────────
   Ураган: смерч и косой ливень (правила — docs/CAREER.md «Погода смены» → «Ураган»).

   Смерч — серая крутящаяся воронка от земли до туч (одна отрисовка, крутит и качает шейдер).
   Появляется, когда ураган выбрал дом (hurricane.js): касается земли в COME_FROM м против ветра
   от дома и за COME с подходит к нему — дом взлетает кусками прямо в воронку; висит над
   фундаментом STAY с и уходит по ветру (GO с, гаснет). У основания — клубы пыли.
   Ливень — косые струи вокруг камеры, наклон и снос по ветру, гуще в порыв (одна отрисовка,
   движение в шейдере). Тумана не добавляет: видно как в обычный дождь.

   Из hurricane.js: init(ctx), come(x, z) → с до касания, at(x, z), step(dt, on, WIND).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const TW = {
  COME: 5,             // с: от касания земли до дома
  COME_FROM: 75,       // м: касается земли против ветра от дома
  STAY: 6,             // с: висит над домом, пока куски улетают
  GO: 11,              // с: уходит по ветру и гаснет
  GO_SPEED: 9,         // м/с
  H: 105,              // м: высота воронки
  R0: 2.5, R1: 20,     // м: радиус у земли и под тучами
  RAIN: 1800, RAIN_PHONE: 900,   // косых струй
};

let C = null;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = k => k * k * (3 - 2 * k);

/* ═════════════ воронка ═════════════ */
const FUN_VERT = `#include <fog_pars_vertex>
uniform float uT;
varying vec2 vUv;
void main () {
  vUv = uv;
  vec3 p = position;
  float k = uv.y;
  p.x += (sin(uT * 1.3 + k * 4.0) * 5.0 + sin(uT * 0.6) * 2.0) * k * k;
  p.z += (cos(uT * 1.1 + k * 3.0) * 4.0) * k * k;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FUN_FRAG = `#include <common>
#include <fog_pars_fragment>
uniform float uT, uA, uL;
uniform vec3 uC;
varying vec2 vUv;
void main () {
  float a = vUv.x * 6.2831853;
  float s1 = sin(a * 5.0 + vUv.y * 16.0 - uT * 9.0) * 0.5 + 0.5;
  float s2 = sin(a * 9.0 - vUv.y * 27.0 - uT * 14.0) * 0.5 + 0.5;
  float s3 = sin(a * 3.0 + vUv.y * 7.0 - uT * 5.0) * 0.5 + 0.5;
  float al = (0.6 + 0.3 * s1 * s2 + 0.15 * s3) * smoothstep(0.0, 0.05, vUv.y) * (1.0 - 0.45 * smoothstep(0.7, 1.0, vUv.y)) * uA;
  vec3 col = uC * (0.62 + 0.38 * s1 + 0.15 * s3) * uL;
  gl_FragColor = vec4(col, al);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const F = { mesh: null, core: null, U: null, ph: 'off', x: 0, z: 0, x0: 0, z0: 0, tx: 0, tz: 0, t: 0, a: 0, dustT: 0, n: 0 };
function funnel () {
  if (F.mesh) return F.mesh;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const v = i / 16;
    pts.push(new THREE.Vector2(TW.R0 + (TW.R1 - TW.R0) * Math.pow(v, 2.4), v * TW.H));
  }
  const geo = new THREE.LatheGeometry(pts, 28);
  F.U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uA: { value: 0 }, uL: { value: 1 }, uC: { value: new THREE.Color('#4a4f4b') } }]);
  const mat = new THREE.ShaderMaterial({ uniforms: F.U, vertexShader: FUN_VERT, fragmentShader: FUN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  F.mesh = new THREE.Mesh(geo, mat);
  F.mesh.frustumCulled = false; F.mesh.visible = false;
  F.mesh.position.y = -500;                        // не в нуле: иначе cull.js freeze() заморозит матрицу как статику
  // плотная сердцевина — тоньше и темнее, крутится быстрее
  const U2 = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uA: { value: 0 }, uL: { value: 1 }, uC: { value: new THREE.Color('#303431') } }]);
  F.core = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U2, vertexShader: FUN_VERT, fragmentShader: FUN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  F.core.scale.set(0.55, 0.97, 0.55); F.core.frustumCulled = false;
  F.core.renderOrder = 1;
  F.mesh.add(F.core);
  C.scene.add(F.mesh);
  return F.mesh;
}
/* дом выбран: воронка касается земли против ветра и идёт к нему; вернёт, через сколько дойдёт */
export function come (x, z, W) {
  if (!C) return 0;
  funnel();
  const wx = W ? W.x : 1, wz = W ? W.z : 0, side = rnd(-25, 25);
  if (F.ph !== 'off' && F.a > 0.3) { F.x0 = F.x; F.z0 = F.z; }
  else { F.x0 = x - wx * TW.COME_FROM - wz * side; F.z0 = z - wz * TW.COME_FROM + wx * side; F.a = 0; }
  F.x = F.x0; F.z = F.z0; F.tx = x; F.tz = z;
  F.ph = 'come'; F.t = 0; F.n++;
  return TW.COME;
}
/* сразу над домом (проверка) */
export function at (x, z) {
  if (!C) return;
  funnel();
  F.x = F.x0 = F.tx = x; F.z = F.z0 = F.tz = z;
  F.ph = 'stay'; F.t = 0; F.a = Math.max(F.a, 0.6); F.n++;
}
function stepFunnel (dt, on, W) {
  if (F.ph === 'off') return;
  if (!on && F.ph !== 'go') { F.ph = 'go'; F.t = 0; }   // ураган кончился — уходит
  F.t += dt;
  let want = 1;
  if (F.ph === 'come') {
    const k = sm(clamp(F.t / TW.COME, 0, 1));
    F.x = F.x0 + (F.tx - F.x0) * k; F.z = F.z0 + (F.tz - F.z0) * k;
    if (F.t >= TW.COME) { F.ph = 'stay'; F.t = 0; }
  } else if (F.ph === 'stay') {
    F.x = F.tx + Math.sin(F.t * 0.9) * 2; F.z = F.tz + Math.cos(F.t * 0.7) * 2;
    if (F.t >= TW.STAY) { F.ph = 'go'; F.t = 0; }
  } else if (F.ph === 'go') {
    F.x += (W ? W.x : 1) * TW.GO_SPEED * dt; F.z += (W ? W.z : 0) * TW.GO_SPEED * dt;
    want = 1 - clamp((F.t - (TW.GO - 4)) / 4, 0, 1);
    if (F.t >= TW.GO || (!on && F.a < 0.02)) { F.ph = 'off'; F.mesh.visible = false; F.a = 0; return; }
  }
  F.a += (want - F.a) * (1 - Math.exp(-(want < F.a ? 3 : 0.9) * dt));
  const m = F.mesh;
  m.visible = F.a > 0.01;
  const gy = C.groundH(F.x, F.z);
  m.position.set(F.x, gy - 0.5, F.z);
  m.rotation.y -= dt * 2.2; F.core.rotation.y -= dt * 2.6;
  const night = C.ENV ? C.ENV.night || 0 : 0, L = 1 - 0.55 * night;
  F.U.uT.value += dt; F.U.uA.value = F.a * 0.9; F.U.uL.value = L;
  const U2 = F.core.material.uniforms; U2.uT.value += dt * 1.3; U2.uA.value = F.a * 0.95; U2.uL.value = L;
  // пыль у основания (не дальше 260 м от камеры)
  if (C.puff && F.a > 0.4 && (F.dustT -= dt) <= 0) {
    F.dustT = 0.14;
    const cam = C.cam.position;
    if (Math.hypot(cam.x - F.x, cam.z - F.z) < 260) {
      const a = rnd(0, 6.28), r = rnd(2, 9);
      C.puff(F.x + Math.cos(a) * r, rnd(0.3, 2.5), F.z + Math.sin(a) * r, Math.random() < 0.5, rnd(2.5, 4.5));
    }
  }
}

/* ═════════════ косой ливень ═════════════ */
const RAIN_VERT = `attribute float aEnd;
uniform float uT, uLen, uK;
uniform vec2 uW;
varying float vA;
void main () {
  vec3 p = position;
  float sp = 36.0 * (0.85 + 0.3 * fract(p.x * 13.7 + p.z * 7.1));
  float y = mod(p.y - uT * sp, 40.0) - 10.0;
  vec3 dir = normalize(vec3(uW.x * uK, -1.0, uW.y * uK));
  vec3 q = vec3(p.x, y, p.z);
  q.xz += uW * uK * (30.0 - y);
  q.x = mod(q.x + 36.0, 72.0) - 36.0; q.z = mod(q.z + 36.0, 72.0) - 36.0;
  q -= dir * uLen * aEnd;
  vA = 1.0 - 0.7 * aEnd;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
}`;
const RAIN_FRAG = `uniform float uA;
uniform vec3 uC;
varying float vA;
void main () { gl_FragColor = vec4(uC, uA * vA); }`;
const RN = { mesh: null, U: null, a: 0 };
function rain () {
  if (RN.mesh) return RN.mesh;
  const n = matchMedia && matchMedia('(pointer: coarse)').matches ? TW.RAIN_PHONE : TW.RAIN;
  const pos = new Float32Array(n * 6), end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = rnd(-36, 36), y = rnd(0, 40), z = rnd(-36, 36);
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  RN.U = { uT: { value: 0 }, uLen: { value: 2.6 }, uK: { value: 0.6 }, uW: { value: new THREE.Vector2(1, 0) }, uA: { value: 0 }, uC: { value: new THREE.Color('#d6dee8') } };
  RN.mesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: RN.U, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false }));
  RN.mesh.frustumCulled = false; RN.mesh.visible = false; RN.mesh.position.y = -500;
  C.scene.add(RN.mesh);
  return RN.mesh;
}
function stepRain (dt, on, W) {
  const want = on ? (C.ENV ? C.ENV.rain || 0 : 1) : 0;
  RN.a += (want - RN.a) * (1 - Math.exp(-0.8 * dt));
  if (RN.a < 0.02 && !on) { if (RN.mesh) RN.mesh.visible = false; return; }
  const m = rain(), cam = C.cam.position;
  m.visible = true;
  m.position.set(cam.x, cam.y - 6, cam.z);
  const g = W ? W.g : 0.5, night = C.ENV ? C.ENV.night || 0 : 0;
  RN.U.uT.value += dt;
  RN.U.uK.value = 0.35 + 0.75 * g;                  // в порыв струи почти лежат
  RN.U.uLen.value = 2.2 + 1.4 * g;
  RN.U.uW.value.set(W ? W.x : 1, W ? W.z : 0);
  RN.U.uA.value = RN.a * (0.42 + 0.18 * g) * (1 - 0.45 * night);
}

export function step (dt, on, W) {
  if (!C) return;
  stepFunnel(dt, on, W);
  stepRain(dt, on, W);
}

export function init (ctx) {
  C = ctx;
  // шейдеры — сразу при загрузке, чтобы первый смерч не дёрнул кадр
  try {
    if (C.renderer && C.renderer.compile) {
      const tmp = new THREE.Scene(); tmp.fog = C.scene.fog;
      funnel(); rain();
      C.scene.remove(F.mesh); C.scene.remove(RN.mesh);
      tmp.add(F.mesh); tmp.add(RN.mesh);
      F.mesh.visible = RN.mesh.visible = true;
      C.renderer.compile(tmp, C.cam);
      tmp.remove(F.mesh); tmp.remove(RN.mesh);
      F.mesh.visible = RN.mesh.visible = false;
      C.scene.add(F.mesh); C.scene.add(RN.mesh);
    }
  } catch (e) { console.error('[twister] шейдеры', e); }
}

export const DEBUG = {
  TW, get funnel () { return { ph: F.ph, x: Math.round(F.x), z: Math.round(F.z), a: +F.a.toFixed(2), n: F.n, vis: !!(F.mesh && F.mesh.visible) }; },
  get rain () { return { a: +RN.a.toFixed(2), vis: !!(RN.mesh && RN.mesh.visible) }; },
  come, at,
};
