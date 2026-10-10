/* ──────────────────────────────────────────────────────────────────────────
   Грязь и снег на своей машине (09.10.2026, группа Ж5 docs/IDEAS.md).
   Правила словами — docs/CAREER.md «Грязь и снег на машине».

   • Грязь копится с километрами смены: на сухой дороге — пыль (светлая,
     бежевая), весной (распутица) и в дождь — бурая грязь, зимой — серая
     слякоть с солью. Сначала пачкаются пороги и низ бампера, потом граница
     ползёт вверх, брызги выше порогов, зад машины грязнее всего (его и видно),
     поверх всего — лёгкий налёт. Полная грязь — за DIRT.KM км по сухому;
     в дождь и распутицу — в разы быстрее (DIRT.WET, DIRT.MUD), зимой — DIRT.WINTER.
   • Снег на крыше, капоте и багажнике: зимой машина выезжает со снегом
     (простояла ночь во дворе — SNOW.START), в снегопад его прибавляется,
     на скорости сдувает до SNOW.KEEP, без зимы — тает.
   • Новая смена — машина чистая (wash), снег — по сезону.
   Кадр: ни одной новой отрисовки и текстуры — кусочек шейдера в материалах
   кузова своей машины (по высоте, стороне и шуму в осях машины).
   step(dt, car, vf, w) — w: { rain, snowFall, snow, mud, wet } из game.js.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* KM — км по сухому до полной грязи; WET / MUD / WINTER — во сколько раз быстрее в ливень, распутицу, зимой */
export const DIRT = { KM: 9, WET: 3, MUD: 3, WINTER: 1.5 };
/* START — снега на крыше в начале зимней смены; FALL — с снегопада до полного; KEEP — сколько остаётся на скорости;
   BLOW — быстрее этого (м/с) сдувает; MELT — с до таяния без зимы */
export const SNOW = { START: 0.75, FALL: 40, KEEP: 0.35, BLOW: 16, MELT: 25 };
export const ST = { dirt: 0, snow: 0, km: 0, car: null, mats: 0 };

/* цвета грязи (линейные): пыль, бурая грязь, слякоть */
const DUST = new THREE.Color(0.36, 0.3, 0.22), MUD = new THREE.Color(0.1, 0.066, 0.036), SLUSH = new THREE.Color(0.3, 0.3, 0.3);
const U = { uDirt: { value: 0 }, uSnowC: { value: 0 }, uMudC: { value: DUST.clone() }, uCarInv: { value: new THREE.Matrix4() } };
const M4 = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);

const FRAG = `
uniform float uDirt, uSnowC; uniform vec3 uMudC; varying vec3 vCL;
float cdH (vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cdN (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cdH(i), cdH(i + vec2(1.0, 0.0)), f.x), mix(cdH(i + vec2(0.0, 1.0)), cdH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 carDirt (vec3 c) {
  vec3 N = normalize(cross(dFdx(vCL), dFdy(vCL)));
  float h = vCL.y;
  vec2 sp = vec2(vCL.x * 0.7 + vCL.z, vCL.y + vCL.x * 0.3 - vCL.z * 0.2);
  float n = cdN(sp * 7.0) * 0.6 + cdN(sp * 19.0) * 0.4;
  if (uDirt > 0.001) {
    float line = 0.3 + 0.34 * uDirt + (n - 0.5) * 0.24;                         // граница грязи на порогах
    float band = 1.0 - smoothstep(line - 0.04, line + 0.04, h);
    float back = smoothstep(0.4, 0.8, -N.z) * (1.0 - smoothstep(0.5, 0.9 + 0.35 * uDirt, h + (n - 0.5) * 0.25));   // зад грязнее
    float spk = step(0.84 - 0.2 * uDirt, cdN(sp * 31.0 + 5.0)) * (1.0 - smoothstep(0.4, 0.95, h));                // брызги
    float m = max(max(band, back * 0.8), spk * 0.75) * uDirt;
    c = mix(c, uMudC, clamp(m * (0.72 + 0.28 * n) + uDirt * 0.16 * (0.5 + 0.5 * n), 0.0, 0.9));
  }
  if (uSnowC > 0.001) {
    float up = smoothstep(0.55, 0.85, N.y) * step(0.62, h);
    float s = cdN(vCL.xz * 3.2 + 7.0) * 0.7 + cdN(vCL.xz * 11.0) * 0.3;
    float lim = uSnowC * 1.15 - 0.16;
    c = mix(c, vec3(0.86, 0.9, 0.97), up * (1.0 - smoothstep(lim - 0.06, lim + 0.06, s)));
  }
  return c;
}
`;
function patch (m) {
  if (m.userData.dirt) return;
  m.userData.dirt = 1;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uCarInv;\nvarying vec3 vCL;\n' +
      sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCL = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = FRAG + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = carDirt(diffuseColor.rgb);');
  };
  m.customProgramCacheKey = () => 'carDirt';
  m.needsUpdate = true;
  ST.mats++;
}
/* все матовые материалы машины: кузов, панели, колёса, наклейки (стёкла и фары — нет); warmup.js — образец машины */
export function dress (car) {
  ST.mats = 0;
  car.traverse(o => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial) patch(o.material); });
}

/* новая смена: машина чистая, снег — если зима (простояла ночь во дворе) */
export function wash (snowAmt = 0) {
  ST.dirt = 0; ST.km = 0;
  ST.snow = snowAmt > 0.45 ? SNOW.START * Math.min(1, snowAmt) : 0;
}

export function step (dt, car, vf, w) {
  if (!car) return;
  if (car !== ST.car) { ST.car = car; dress(car); }
  const v = Math.abs(vf || 0), d = v * dt;
  const wetK = Math.min(1, Math.max(w.rain || 0, w.wet || 0)), mudK = w.mud || 0, winK = Math.min(1, (w.snow || 0) * 1.4);
  ST.km += d / 1000;
  ST.dirt = Math.min(1, ST.dirt + d / (DIRT.KM * 1000) * (1 + (DIRT.WET - 1) * wetK + (DIRT.MUD - 1) * mudK + (DIRT.WINTER - 1) * winK));
  // снег на крыше
  const fall = w.snowFall || 0;
  if (fall > 0.05) ST.snow = Math.min(1, ST.snow + fall * dt / SNOW.FALL);
  else if ((w.snow || 0) < 0.2) ST.snow = Math.max(0, ST.snow - dt / SNOW.MELT);
  if (v > SNOW.BLOW && ST.snow > SNOW.KEEP) ST.snow = Math.max(SNOW.KEEP, ST.snow - dt * 0.012 * (v - SNOW.BLOW) / 10);
  // цвет: пыль → грязь (дождь, распутица) → слякоть (зима)
  U.uMudC.value.copy(DUST).lerp(MUD, Math.min(1, Math.max(wetK, mudK))).lerp(SLUSH, winK);
  U.uDirt.value = ST.dirt;
  U.uSnowC.value = ST.snow;
  U.uCarInv.value.copy(M4.compose(car.position, car.quaternion, ONE)).invert();
}

export const DEBUG = { ST, DIRT, SNOW, U, set (dirt, snow) { if (dirt !== undefined) ST.dirt = dirt; if (snow !== undefined) ST.snow = snow; } };
