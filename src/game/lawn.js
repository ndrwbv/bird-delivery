/* ──────────────────────────────────────────────────────────────────────────
   Пятна на газоне (04.10.2026, трек «Наполнение мира», шаг 1).

   Земля склеена из больших треугольников, у каждого один цвет, — газон
   выглядел ровной зелёной скатертью. Теперь краска травы меняется по месту,
   прямо в шейдере статики (LITM): новых предметов и треугольников нет.

   Что рисуется (всё — по мировым x/z, поэтому каждый запуск одинаково):
   • крупные пятна 20—60 м: светлее / темнее, где-то желтее, где-то сочнее;
   • лёгкая тень-рельеф: невидимые бугры ~25 м, склон «от солнца» темнее —
     той же краской, земля остаётся плоской (горки ломают езду, DIRECTION.md);
   • проплешины 3—8 м голой земли, кучками, с краем «пикселями» по 0,5 м;
   • мелкая рябь клетками 0,5—1 м — под пиксельный стиль игры.
   Рябь и пиксельный край гаснут, когда клетка меньше пары точек экрана
   (вдали — ровный цвет, не мерцает). На «Низкой» графике (чёткость ~430)
   ряби нет, край проплешин гладкий.

   Сезоны (юниформы seasons.js) поверх: осенью жёлтых пятен больше, весной
   проплешины — мокрая грязь, в жару проплешин больше и они пыльные, зимой
   всё под снегом, как было (снег кладёт seasons.js после нас).

   Травой считаем то же, что seasons.js: зелёный цвет вершины и грань,
   смотрящая вверх. Асфальт, плитку, стены и воду не трогаем.
   ────────────────────────────────────────────────────────────────────────── */

import * as GFX from './gfx.js';

/* чёткость: на «Низкой» (~430 точек по короткой стороне) — без ряби */
const uLawnLo = { get value () { try { return GFX.pixelShort() < 480 ? 1 : 0; } catch (e) { return 0; } } };

const LAWN_GLSL = `
{
  vec3 lc0 = vColor.rgb;
  float lgr = smoothstep(0.05, 0.18, lc0.g - max(lc0.r, lc0.b));
  vec3 lN = normalize(cross(dFdx(vSW), dFdy(vSW)));
  lgr *= smoothstep(0.42, 0.8, lN.y);
  if (lgr > 0.0) {
    vec2 q = vSW.xz;
    vec3 c = diffuseColor.rgb, c0 = c;
    // крупные пятна: светлее / темнее (~40 и ~17 м), желтее / сочнее (~55 м)
    float big = sNoise(q * 0.025 + 3.1) * 0.65 + sNoise(q * 0.06 + 7.7) * 0.35;
    float hue = sNoise(q * 0.018 + 11.3);
    c *= 0.8 + 0.38 * big;
    float yel = smoothstep(0.52, 0.82, hue - uDry * 0.25);
    c = mix(c, c * vec3(1.22, 1.03, 0.62), yel * 0.75);
    c = mix(c, c * vec3(0.82, 0.98, 0.86), smoothstep(0.45, 0.12, hue) * 0.6);
    // тень-рельеф: бугры ~25 м, наклон к солнцу (с юго-запада) светлее; градиент — конечной разностью
    vec2 hq = q * 0.04;
    float h0 = sNoise(hq), hx = sNoise(hq + vec2(0.06, 0.0)), hz = sNoise(hq + vec2(0.0, 0.06));
    float rel = clamp(dot(vec2(hx - h0, hz - h0) / 0.06, vec2(-0.6, -0.8)), -1.5, 1.5);
    c *= 1.0 + 0.085 * rel;
    // проплешины 3—8 м, кучками: край — клетками по 0,5 м, вдали гладкий
    vec2 bc = (floor(q * 2.0) + 0.5) * 0.5;
    float pix = 1.0 - smoothstep(0.35, 0.9, max(fwidth(q.x * 2.0), fwidth(q.y * 2.0)));
    vec2 bq = mix(q, bc, pix * (1.0 - uLawnLo));
    float clump = sNoise(bq * 0.021 + 19.0);   // где проплешин больше (~50 м)
    float bn = sNoise(bq * 0.14 + 5.0) * 0.82 + sNoise(bq * 0.5 + 9.0) * 0.18;
    float bTh = 0.84 - clump * 0.1 - uHeat * 0.08 - uDry * 0.02 - uMud * 0.03;
    float bald = smoothstep(bTh, bTh + 0.03, bn);
    float bt = sNoise(q * 0.9 + 2.0);
    vec3 dirt = vec3(0.30, 0.22, 0.13) * (0.86 + 0.24 * bt);
    dirt = mix(dirt, vec3(0.13, 0.09, 0.05), uMud * 0.85);                     // весна — мокрая грязь
    dirt = mix(dirt, vec3(0.52, 0.42, 0.28) * (0.9 + 0.2 * bt), uHeat * 0.7);  // жара — пыль
    vec3 rim = mix(c, dirt, 0.45);                                              // вытертая трава вокруг
    float near = smoothstep(bTh - 0.05, bTh, bn) * (1.0 - bald);
    c = mix(c, rim, near * 0.6);
    c = mix(c, dirt, bald);
    // рябь: клетки 0,5 и 1 м, ±6 %; гаснет, когда клетка меньше пары точек
    if (uLawnLo < 0.5) {
      vec2 r1 = q * 1.6;
      float fr = max(fwidth(r1.x), fwidth(r1.y));
      float rip = (1.0 - smoothstep(0.3, 0.75, fr));
      if (rip > 0.0) {
        float k = sHash(floor(r1)) * 0.6 + sHash(floor(q * 0.8) + 41.0) * 0.4;
        c *= 1.0 + (k - 0.5) * 0.13 * rip;
      }
    }
    diffuseColor.rgb = mix(c0, c, lgr);
  }
}`;

/* материал земли (LITM): поверх сезонного (seasons.js — vSW, sHash, sNoise,
   uDry, uMud, uHeat уже объявлены) — пятна газона; кладутся до снега и луж */
export function lawnMat (m) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nolawn')) return m;   // ?nolawn — без пятен (сравнить)
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (!/sNoise/.test(sh.fragmentShader) || !/vSW/.test(sh.fragmentShader) || !/uHeat/.test(sh.fragmentShader)) return;   // без сезонного шейдера — как было
    sh.uniforms.uLawnLo = uLawnLo;
    sh.fragmentShader = 'uniform float uLawnLo;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + LAWN_GLSL);
  };
  m.customProgramCacheKey = () => key + 'lawn';
  return m;
}
