/* ──────────────────────────────────────────────────────────────────────────
   Глубокая палитра (2г1, 25.10.2026; автор: «игра выглядит плоско», рефы — рисованная глубинка).

   Цветокоррекция кадра без нового прохода: своя «тональная кривая» three.js (CustomToneMapping) —
   несколько строк в конце шейдера каждого материала, вызовов отрисовки не прибавляется.
     • плечо — светлое выше 0,78 мягко подходит к белому, а не обрезается: снег и белые стены на солнце
       не выгорают в пятно;
     • S-кривая контраста — тёмное темнее, светлое светлее, середина на месте (сила 0,28);
     • насыщенность +10 %;
     • тёплые света (+3 % красного, −3,5 % синего) и прохладные синие тени (до −5 % красного,
       +6 % синего) — зелень в тени уходит «почти в чёрное», на солнце — светло-зелёная.
   Сила — renderer.toneMappingExposure (0…1, ставит sky.js по времени суток): днём 1, ночью 0,55, в дождь
   на треть меньше. three передаёт это число в каждый материал сам, свои униформы не нужны.
   Небо (sky.js), туман и огни без «Ламберта» (лужи света nightlight.js, снегопад, фейерверки) кривую не
   проходят — их цвета и так «конечные».
   Выключить: ?nograde (только это), ?oldsky (всё небо, свет и палитра), ?oldlook (весь прежний вид).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const GRADE = {
  on: !Q.has('nograde') && !Q.has('oldsky') && !Q.has('oldlook'),
  knee: 0.78, contrast: 0.28, sat: 0.1,
  warm: [0.03, 0.01, -0.035], cool: [-0.05, -0.015, 0.06],
};

const f = x => x.toFixed(4);
const v3 = a => `vec3(${a.map(f).join(', ')})`;
const FN = `vec3 CustomToneMapping( vec3 color ) {
  float w = clamp( toneMappingExposure, 0.0, 1.0 );
  vec3 g = pow( max( color, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
  const float K = ${f(GRADE.knee)};
  vec3 o = max( g - K, 0.0 );
  g = min( g, vec3( K ) ) + ( 1.0 - K ) * ( 1.0 - exp( -o / ( 1.0 - K ) ) );
  g += ${f(GRADE.contrast)} * w * ( 2.0 * g - 1.0 ) * g * ( 1.0 - g );
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
  g = l + ( g - l ) * ( 1.0 + ${f(GRADE.sat)} * w );
  float sh = 1.0 - smoothstep( 0.1, 0.62, l ), hi = smoothstep( 0.55, 1.0, l );
  g *= 1.0 + w * sh * ${v3(GRADE.cool)};
  g += w * hi * ${v3(GRADE.warm)};
  return pow( clamp( g, 0.0, 1.0 ), vec3( 2.2 ) );
}`;

if (GRADE.on) {
  const S = THREE.ShaderChunk.tonemapping_pars_fragment;
  const OLD = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (S.includes(OLD)) THREE.ShaderChunk.tonemapping_pars_fragment = S.replace(OLD, FN);
  else GRADE.on = false;
}

/* до первой отрисовки: программы всех материалов сразу собираются с кривой */
export function init (renderer) {
  if (!GRADE.on) return;
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1;
}
/* сила 0…1 — из sky.js раз в кадр */
export function weight (renderer, w) {
  if (GRADE.on) renderer.toneMappingExposure = w;
}
