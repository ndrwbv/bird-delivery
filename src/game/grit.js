/* ──────────────────────────────────────────────────────────────────────────
   Глубина города (13.10.2026; автор: «добавить шум и глубину,
   как в текстуре машины»).

   Одна правка освещения «Ламберт» (так нарисован весь город: дома, асфальт, заборы, деревья):
   цвет поверхности чуть меняется по месту на предмете (город склеен в мировых осях — по месту в мире) — без картинок.
     • пятна — крупные (≈ 3 м) и средние (≈ 0,8 м): светлее / темнее до ±9 %, в тёмных — лёгкий бурый налёт (автор 13.10: «слегка, чтобы просто был»)
     • зерно — «кубиками» по 1/6 м (крупный пиксель, как у новой «Семёрки»), ±4 %;
       дальше 20—70 м гаснет, чтобы не рябило
     • потёки — вытянутые сверху вниз пятна, темнее до 8 % (на стенах как подтёки)
   G — включить / выключить (сравнить). Сила — GRIT.x (0…1), из probe: __dlv.GRIT.
   Подключается до первой отрисовки (импорт в game.js): правит общий текст программы «Ламберт»,
   поэтому её берут и материалы со своими правками (onBeforeCompile).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* общий для всех материалов: three копирует униформы при создании материала, а обычный объект
   (не Vector2) — передаёт ссылкой; поменял GRIT.x — поменялось у всех сразу, без пересборки */
export const GRIT = { x: 1, y: 0 };

const DECL = `
uniform vec2 uGrit;
varying vec3 vGritW;
float gH (vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gN (vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1, 0, 0)), f.x), mix(gH(i + vec3(0, 1, 0)), gH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gH(i + vec3(0, 0, 1)), gH(i + vec3(1, 0, 1)), f.x), mix(gH(i + vec3(0, 1, 1)), gH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 gritCol (vec3 c, float dist) {
  if (uGrit.x <= 0.0) return c;
  vec3 p = floor(vGritW * 6.0) / 6.0;                                   // крупный пиксель: кубики по 1/6 м
  float grain = gH(p * 1.7 + 3.1);
  float stain = gN(p * 0.33) * 0.6 + gN(p * 1.25 + 7.0) * 0.4;
  float streak = gN(vec3(p.x * 2.5, p.y * 0.22, p.z * 2.5) + 13.0);
  float near = smoothstep(70.0, 20.0, dist);
  float k = 1.0 + (grain - 0.5) * 0.08 * near + (stain - 0.5) * 0.18 - smoothstep(0.5, 0.9, streak) * 0.08;
  // снег (светлое и почти без цвета) — не грязный: без бурого налёта и затемнения, только лёгкие голубоватые
  // ямки и бугры — глубина (автор 13.10: «снег серый — пусть глубокий, но не грязный»); дороги темнее — им грязь можно
  float lum = dot(c, vec3(0.3, 0.59, 0.11)), sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float snow = smoothstep(0.6, 0.78, lum) * (1.0 - smoothstep(0.07, 0.18, sat));
  vec3 dirt = mix(c, c * vec3(0.93, 0.87, 0.78), smoothstep(0.5, 0.85, 1.0 - stain) * 0.25);   // бурый налёт в тёмных пятнах
  vec3 drift = c * mix(vec3(1.02, 1.02, 1.02), vec3(0.9, 0.94, 1.0), smoothstep(0.35, 0.75, 1.0 - stain)) * (1.0 + (grain - 0.5) * 0.03 * near);
  c = mix(mix(dirt, dirt * k, uGrit.x), mix(c, drift, uGrit.x), snow);
  return c;
}
`;

const VERT = `
#include <project_vertex>
{
  vec4 gw = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    gw = batchingMatrix * gw;
  #endif
  #ifdef USE_INSTANCING
    gw = instanceMatrix * gw;
  #endif
  vGritW = gw.xyz;   // без modelMatrix: у машин и людей узор едет вместе с ними (автор 13.10: «плывёт текстура»); город склеен в мировых осях
}`;

const L = THREE.ShaderLib.lambert;
if (!L.fragmentShader.includes('gritCol')) {
  L.uniforms.uGrit = { value: GRIT };
  L.vertexShader = 'varying vec3 vGritW;\n' + L.vertexShader.replace('#include <project_vertex>', VERT);
  L.fragmentShader = DECL + L.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = gritCol(diffuseColor.rgb, length(vViewPosition));');
}

export function toggle () { GRIT.x = GRIT.x > 0 ? 0 : 1; return GRIT.x > 0; }
