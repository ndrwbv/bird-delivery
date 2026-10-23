/* ──────────────────────────────────────────────────────────────────────────
   Всплески дождя (12ам, автор 18.10.2026: «капли не режут землю — всплески при падении»; docs/CAREER.md
   «Погода меняется за смену» → «Дождь у земли»).

   Струи дождя (game.js rainMat) падают до земли под камерой и там кончаются (до 23.10.2026 летели ещё на 8—16 м
   вниз и «резали» асфальт). Каждая струя, долетев, оставляет всплеск — колечко на асфальте, расходится и гаснет за
   SPL.T с. Всплеск считается в шейдере по тем же номеру струи, кругу и хешу, что сама струя (место прошлого круга),
   поэтому он ровно там, где струя кончилась, — буфер не трогаем, цикла по каплям нет. Камера едет — всплеск
   сдвигается назад на путь камеры с момента удара (стоит на месте, а не едет за машиной).
   Кольцо — плоский эллипс в 0,22 м над землёй (полотно дороги лежит на 0,09—0,14 м выше рельефа, тротуар — до 0,25), под углом взгляда; размер растёт с возрастом, прозрачность — по силе дождя.
   Видно ~четверть капель сразу (у каждой всплеск живёт SPL.T из ~1,1 с круга) — ~350 точек на 70 × 70 м.

   Из game.js (точечно): init({ THREE, WARM }) — до прогрева (образец материала); step(o) — каждый кадр после струй.
   Материал и точки — лениво, при первом дожде (не до buildCity: город строится на зерне).
   Отладка: __dlv.RSPL — { SPL, STATS }.
   ────────────────────────────────────────────────────────────────────────── */
export const SPL = { T: 0.32, SIZE: [0.3, 1.0], A: 0.95, MAX_UP: 24 };
export const STATS = { on: false, made: false };

let T = null, MAT = null, PTS = null, N = 0;
const VEL = { x: 0, z: 0, px: NaN, pz: NaN };

function mat () {
  if (MAT) return MAT;
  MAT = new T.ShaderMaterial({
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
      uFall: { value: 0 }, uA: { value: 0 }, uC: { value: new T.Color(0xdfe9f5) }, uVel: { value: new T.Vector2() },
      uScale: { value: 400 }, uT: { value: SPL.T }, uSize: { value: new T.Vector2(SPL.SIZE[0], SPL.SIZE[1]) },
    }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute float aY;
uniform float uFall, uScale, uT; uniform vec2 uVel, uSize;
varying float vK, vSq;
#include <fog_pars_vertex>
float h12 (vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main () {
  float id = position.x;
  float c = 30.0 - aY + uFall, k = floor(c / 38.0);
  float age = (c - k * 38.0) / 34.0;                  // с — как давно струя прошлого круга долетела до земли
  vK = age / uT;
  vec3 p = vec3(h12(vec2(id, k - 1.0)) * 70.0 - 35.0, 0.22, h12(vec2(id * 1.37 + 91.0, k - 0.5)) * 70.0 - 35.0);
  p.xz -= uVel * age;                                  // камера уехала — всплеск остаётся на месте удара
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float d = max(0.5, -mvPosition.z);
  vec3 v = cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz;
  vSq = clamp(v.y / max(0.01, length(v)), 0.18, 1.0);  // насколько сверху смотрим: кольцо на асфальте — сплюснутый эллипс
  gl_PointSize = vK < 1.0 && d < 45.0 ? mix(uSize.x, uSize.y, sqrt(vK)) * uScale / d : 0.0;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform vec3 uC; uniform float uA;
varying float vK, vSq;
#include <fog_pars_fragment>
void main () {
  if (vK >= 1.0) discard;
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(vec2(q.x, q.y / vSq));
  float r = 0.3 + 0.62 * vK;
  float ring = 1.0 - smoothstep(0.0, 0.16, abs(d - r));
  float plop = (1.0 - smoothstep(0.0, 0.22, d)) * (1.0 - smoothstep(0.0, 0.35, vK));   // в первый миг — брызги в середине
  float a = max(ring, plop) * (1.0 - vK) * uA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uC, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  return MAT;
}

export function init (o) {
  T = o.THREE;
  if (o.WARM && o.WARM.samplesFrom) o.WARM.samplesFrom((TH, geo) => [['всплески дождя (rainsplash.js)', new TH.Points(geo, mat())]]);
}

/* o: { dt, R (сила 0…1), on (струи видны), scene, base (позиция струй: x, y — земля, z), fall (RAIN_F), ground (струи
   кончаются у земли — камера не выше SPL.MAX_UP), cam, rainPos (буфер струй game.js), H (высота кадра, пикс) } */
let DBG = false;
export function step (o) {
  if (!T) return;
  if (!DBG && typeof window !== 'undefined' && window.__dlv) { window.__dlv.RSPL = { SPL, STATS }; DBG = true; }
  const cam = o.cam;
  if (Number.isFinite(VEL.px) && o.dt > 0) {
    const k = 1 - Math.exp(-8 * o.dt);
    VEL.x += ((cam.position.x - VEL.px) / o.dt - VEL.x) * k; VEL.z += ((cam.position.z - VEL.pz) / o.dt - VEL.z) * k;
    if (!(Math.abs(VEL.x) < 200)) VEL.x = 0; if (!(Math.abs(VEL.z) < 200)) VEL.z = 0;   // телепорт — не скорость
  }
  VEL.px = cam.position.x; VEL.pz = cam.position.z;
  const show = !!(o.on && o.ground && o.R > 0.1);
  STATS.on = show;
  if (!show) { if (PTS) PTS.visible = false; return; }
  if (!PTS) {
    N = o.rainPos.length / 6;                    // струя — 2 вершины по 3 числа: x — номер, y — высота на старте
    const g = new T.BufferGeometry();
    const pos = new Float32Array(N * 3), ys = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = o.rainPos[i * 6]; ys[i] = o.rainPos[i * 6 + 1]; }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aY', new T.BufferAttribute(ys, 1));
    PTS = new T.Points(g, mat());
    PTS.frustumCulled = false;
    o.scene.add(PTS);
    STATS.made = true;
  }
  PTS.visible = true;
  PTS.position.copy(o.base);
  const U = MAT.uniforms;
  U.uFall.value = o.fall;
  U.uA.value = SPL.A * Math.min(1, (o.R - 0.1) / 0.6);
  U.uVel.value.set(VEL.x, VEL.z);
  U.uScale.value = (cam.projectionMatrix.elements[5] || 1) * (o.H || 720) * 0.5;
  U.uT.value = SPL.T;
}
