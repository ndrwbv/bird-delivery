/* ──────────────────────────────────────────────────────────────────────────
   Снег на машинах города зимой (18.10.2026, автор: «Зимой все машины в снегу должны быть, как моя. Ну вернее,
   все по-разному, но в снегу»). Правила словами — docs/CAREER.md «Снег на машинах города».

   Как у своей машины (cardirt.js): кусочек шейдера красит белым то, что смотрит вверх (крыша, капот, багажник),
   пятнами шума в осях машины — пятна едут вместе с ней. Только у каждой машины своя доля снега:
     • едущие (поток, такси) — CSN.DRIVE: местами на крыше и капоте, часть — совсем чистые (CSN.CLEAN_CAR);
     • стоящие у дорог и на парковках — CSN.PARK: крыша и капот почти целиком;
     • во дворах (стоят ночами) — CSN.YARD: заметены целиком — крыша, капот, стёкла и верх боков; у части
       (CSN.WIPED) почищено только лобовое;
     • курьеры и конкуренты — CSN.RIVAL, автобусы — CSN.BUS.
   Сколько снега — одно число на машину (байт в вершинах её склейки или в данных экземпляра у машин дворов),
   поэтому ни одной новой отрисовки, текстуры или материала: шейдеры общих материалов лёгких машин (LITE_MAT),
   склейки стоящих (parkmerge.js), машин дворов (yardcars.js) и автобусов (buses.js).
   Сезон — одним числом на всех (season): зима — как есть, оттепель — меньше и мокрый серый, летом — ничего
   (шейдер даже не считает шум).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

/* доля снега [от, до] по месту машины; CLEAN_CAR — доля едущих без снега (только что из тёплого гаража или с мойки);
   WIPED — доля заметённых машин двора с почищенным лобовым */
export const CSN = {
  DRIVE: [0.18, 0.62], CLEAN_CAR: 0.12,
  PARK: [0.5, 0.95],
  YARD: [0.72, 1], WIPED: 0.3,
  RIVAL: [0.12, 0.5],
  BUS: [0.45, 0.65],
};
const U = { uCSnow: { value: 0 }, uCSWet: { value: 0 } };
export const ST = { k: 0, wet: 0, tagged: 0 };

const rnd = (a, b) => a + Math.random() * (b - a);
/* доля снега машины → байт: 0…120 — доля (×120), +128 — почищено лобовое */
export function byteOf (kind) {
  if (typeof kind === 'number') return kind;
  let a = 0, wiped = false;
  if (kind === 'drive') a = Math.random() < CSN.CLEAN_CAR ? 0 : rnd(...CSN.DRIVE);
  else if (kind === 'park') a = rnd(...CSN.PARK);
  else if (kind === 'yard') { a = rnd(...CSN.YARD); wiped = a > 0.8 && Math.random() < CSN.WIPED; }
  else if (kind === 'rival') a = rnd(...CSN.RIVAL);
  else if (kind === 'bus') a = rnd(...CSN.BUS);
  return Math.round(Math.min(1, a) * 120) + (wiped ? 128 : 0);
}
/** снег машины в её склейку: атрибут aSnw — один байт на вершину (все одинаковые) */
export function tag (geo, kind) {
  const n = geo.attributes.position.count, b = byteOf(kind);
  geo.setAttribute('aSnw', new THREE.BufferAttribute(new Uint8Array(n).fill(b), 1, true));
  ST.tagged++;
  return b;
}

const FRAG = `
uniform float uCSnow, uCSWet;
varying float vSnA; varying vec3 vSnP;
float csH (vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float csN (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(csH(i), csH(i + vec2(1.0, 0.0)), f.x), mix(csH(i + vec2(0.0, 1.0)), csH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 carSnow (vec3 c) {
  if (uCSnow < 0.01 || vSnA < 0.003) return c;
  float b = floor(vSnA * 255.0 + 0.5), wiped = step(127.5, b), a = (b - 128.0 * wiped) / 120.0 * uCSnow;
  vec3 N = normalize(cross(dFdx(vSnP), dFdy(vSnP)));
  float h = vSnP.y;
  float top = smoothstep(0.5, 0.8, N.y) * step(0.58, h);                          // крыша, капот, багажник
  float slope = smoothstep(0.16, 0.42, N.y) * (1.0 - top) * step(0.7, h);         // стёкла, скаты
  float side = (1.0 - smoothstep(0.16, 0.42, abs(N.y))) * step(0.85, h);          // верх боков — у заметённых
  float front = wiped * smoothstep(0.2, 0.5, N.z);                                // почищенное лобовое (перед — +z)
  float cov = top * a + (slope * a * 0.85 + side * clamp((a - 0.74) * 3.2, 0.0, 0.9)) * (1.0 - front);
  if (cov < 0.01) return c;
  vec2 q = vSnP.xz * 2.6 + vec2(vSnP.y * 1.7, -vSnP.y * 1.3) + fract(b * 0.618) * 40.0;
  float s = csN(q) * 0.65 + csN(q * 3.7) * 0.35;
  float lim = cov * 1.2 - 0.12;
  float k = 1.0 - smoothstep(lim - 0.07, lim + 0.07, s);
  return mix(c, mix(vec3(0.86, 0.9, 0.97), vec3(0.6, 0.63, 0.66), uCSWet), k * (1.0 - 0.3 * uCSWet));
}
`;
/** в шейдер материала: mode 'lite' — лёгкие машины и автобусы (aSnw в вершинах; экземпляры — колёса курьеров — без снега),
    'inst' — машины дворов (aSnI в экземплярах), 'merged' — склейка стоящих (вершины уже на месте, середина — aC) */
export function inject (sh, mode = 'lite') {
  sh.uniforms.uCSnow = U.uCSnow; sh.uniforms.uCSWet = U.uCSWet;
  const decl = (mode === 'inst' ? 'attribute float aSnI;\n' : mode === 'lite' ? '#ifndef USE_INSTANCING\nattribute float aSnw;\n#endif\n' : 'attribute float aSnw;\n') +
    'varying float vSnA;\nvarying vec3 vSnP;\n';
  const body = mode === 'inst' ? 'vSnA = aSnI; vSnP = position;'
    : mode === 'merged' ? 'vSnA = aSnw; vSnP = position - aC;'
    : '#ifdef USE_INSTANCING\nvSnA = 0.0;\n#else\nvSnA = aSnw;\n#endif\nvSnP = position;';
  sh.vertexShader = decl + sh.vertexShader.replace('#include <project_vertex>', body + '\n#include <project_vertex>');
  sh.fragmentShader = FRAG + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = carSnow(diffuseColor.rgb);');
}
/** общий материал (LITE_MAT, кузов автобуса): снег поверх его шейдера; key — имя программы */
export function patch (m, key) {
  m.onBeforeCompile = sh => inject(sh, 'lite');
  m.customProgramCacheKey = () => 'carSnow:' + key;
  m.defaultAttributeValues = { aSnw: [0] };          // меш без своего снега (вдруг) — без снега
  m.needsUpdate = true;
}

/** каждый кадр (game.js): снег на земле и мокрость (seasons.js snowAmt / wetAmt) → сколько снега на машинах */
export function season (snow, wet) {
  const k = DEBUG.off ? 0 : Math.max(0, Math.min(1, ((snow || 0) - 0.08) / 0.5));
  ST.k = k; ST.wet = k > 0 ? Math.min(1, (wet || 0) * 1.5) : 0;
  U.uCSnow.value = k; U.uCSWet.value = ST.wet;
}

export const DEBUG = { CSN, ST, U, byteOf, off: false };   // off — без снега на машинах (сравнить кадр)
