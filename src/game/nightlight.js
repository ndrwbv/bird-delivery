import { STYLE as SOFT_STYLE } from './softcity.js';
/* ──────────────────────────────────────────────────────────────────────────
   Свет ночью на земле (11бж, автор 24.10.2026: «ночью город лучше осветить надо»; правила словами и числами —
   docs/CAREER.md «Свет ночью на земле»).

   Источников света в игре нет: всё, что светит на асфальт, — плоскости поверх земли, которые умножают её цвет
   (земля × (1 + свет)): тёмное светлеет, но остаётся темнее светлого.
   • Пятно фонаря — у каждого вида свой круг (POOL ниже): яркая середина под плафоном (r) и широкая мягкая «юбка» (s):
     на освещённой улице юбки соседних фонарей сходятся — асфальт между столбами не чёрный, а в полутени.
     Прожекторная мачта — большое пятно на стоянку. Окраины — тёмные, как были.
   • Подъезды (11бо) — лампочка над каждой дверью: маленькое тёплое пятно у двери (POOL.porch, NL.PORCH), часть перегорела,
     часть мигает (жребий по месту, aS вершины — зерно мигания). Дворовые фонари — streetlamps.js yardLamps (POOL.ydrive).
   • Окна первого этажа — горящее окно кладёт на землю у фасада тёплую полосу (WIN): шейдер решает «горит ли» тем
     же зерном и той же формулой, что и само окно (windows.js) — погасло окно, погасла и полоса.
   • Витрины магазинов (открытых) — пятно на тротуар перед витриной (SHOP), белее и ярче окна.
   Всё — две склейки на клетку NL.CELL × CHUNK (умножение и блик), один шейдер, видно только ночью.
   Сбитый фонарь гасит своё пятно по метке track (streetlamps.js) — вершины уходят под землю.
   ?oldnight — как до 24.10.2026: пятно 11 × 11 м у всех фонарей, без окон и витрин на земле, прежние ночь и фары.

   Из game.js: win / shop — при сборке фасадов (копим места), build(A) — кусок поздней сборки 'nightlit'
   (генератор: шаг — 6 клеток), update(night, t, snow) — в updateEnv. streetlamps.js кладёт в пятно вид (spotOf).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { ON as MOB } from './mobile.js';

export const OLD = typeof location !== 'undefined' && /[?&]oldnight(&|$)/.test(location.search);

/* цвета ламп (sRGB): натрий — оранжевый, ртуть (колокол РКУ) — голубовато-белый, лампа накаливания, светодиод, прожектор */
const C = { na: [1, 0.74, 0.44], hg: [0.86, 0.93, 1], inc: [1, 0.76, 0.48], warm: [1, 0.82, 0.58], led: [1, 0.93, 0.8], mast: [0.92, 0.96, 1], old: [1, 0.86, 0.59] };
/* пятно фонаря по виду: r — яркая середина (м, радиус), s — мягкий край (м, радиус, до него свет сходит на нет), k — сила.
   До 24.10.2026 у всех — квадрат 11 × 11 м (радиус 5,5) */
export const POOL = {
  // 0п57 (24.10.2026, автор: «свет фонарей делает всё белым; свет должен быть лёгкий, и его должно быть больше»):
  // середина слабее, круги шире (r ×1,15, s ×1,3) — юбки соседних фонарей сходятся. Было: cobra r 8,5 s 20 и т. д.
  cobra:  { r: 9.5, s: 26, k: 1.0 },     // проспекты, высокий столб 8,4—9,4 м
  double: { r: 9.5, s: 26, k: 1.0 },     // двойная консоль на разделительной — у каждой половины своё
  conc:   { r: 8.5, s: 22, k: 0.95 },    // бетонный частного сектора с «коброй»
  cast:   { r: 7, s: 17, k: 0.9 },       // чугунный Старого города
  twin:   { r: 7.5, s: 18, k: 0.9 },     // два шара
  ball:   { r: 6.5, s: 16, k: 0.85 },    // шар на макушке
  torch:  { r: 6, s: 14, k: 0.85 },      // торшер 4,3—5 м
  wood:   { r: 7, s: 16, k: 0.8 },       // деревянный столб, колпак с лампочкой
  park:   { r: 5.5, s: 12.5, k: 0.75 },  // шар у аллеи
  yard:   { r: 6.5, s: 16, k: 0.9 },     // парковка пиццерии
  mast:   { r: 14, s: 36, k: 0.45 },     // прожекторная мачта 13 м — на стоянку (светлая середина большая — сила меньше)
  def:    { r: 6.5, s: 13, k: 0.85 },    // прочие (пиццерия, площади, ТЦ…)
  // 11бо (24.10.2026, автор: «во дворы так же надо добавить освещение»)
  porch:  { r: 2.4, s: 7.5, k: 1.0 },    // лампочка над подъездом: тёплое пятно у двери (край, середина и блик — без дымки)
  ydrive: { r: 6, s: 15, k: 0.75 },      // дворовый фонарь у проезда и у детской площадки (streetlamps.js yardLamps)
};
/* Свет умножает то, что на земле (тёмный асфальт светлеет вдвое-втрое, белая разметка и снег — ярко; тёмное
   остаётся тёмнее светлого), а не прибавляет одинаковую белизну всему: «не день ночью». Середина фонаря — юбка ×
   середина — до ~×1,85 (до 0п57 — до ×4,4: выбеливало); под плафоном ещё едва заметный блик сложением (на чёрном
   асфальте умножать нечего — без него пятно не видно) */
export const NL = {
  GAIN: 1.0,          // общая сила ночью (× ENV.night)
  // 0п57: под фонарём — не больше ~×1,85 (было до ×4,4: асфальт и снег выгорали в белый), зато круг шире и край мягче
  CORE: 0.3,          // середина пятна: до ×(1 + CORE × k), ровно до трети радиуса r (было 0,7 и второй слой 0,55)
  CORE2: 0,           // второй слой середины (0 — нет; было 0,55)
  SKIRT: 0.42,        // мягкий край: до ×(1 + SKIRT × k) под фонарём, к краю s сходит на нет (было 0,65)
  SKIRT_POW: 1.15,    // как быстро край сходит на нет (было 1,5): между фонарями — полутень, а не темнота
  LIFT: 0.3,          // м над землёй (как раньше)
  WIN: { k: 0.85, d: 3.6, pad: 0.7, n: 1 },   // окно первого этажа: сила, на сколько м от стены, шире окна на pad с каждой стороны, слоёв
  SHOP: { k: 1.0, d: 6, pad: 1.4, n: 2 },     // витрина магазина: два слоя — до ×4 у стекла
  GLARE: 0.05,        // блик под плафоном — прибавка (до 0,05 × k; было 0,16 — белое пятно), его тоже умножает середина
  GLARE_R: 0.8,       // радиус блика — доля середины r
  HAZE: 0.06,         // и чуть-чуть сложением по всему кругу s: чёрный асфальт между фонарями не чёрный
  SNOW: 0.5,          // в снег свет слабее на столько (белое и так светлое: иначе пятна «выгорают» в белый)
  CELL: 3,            // клетка склейки — 3 × 3 клетки города (600 м): два меша на клетку, вызовов не больше, чем у прежних пятен
  WIN_MOB: false,     // на телефоне окна на землю не кладём (память)
  // 11бо: лампочка над каждым подъездом — пятно на 1,6 м от стены; у части не горит, у части мигает (жребий по месту двери)
  // круг маленький — у двери чуть ярче фонаря (до ×1,95), но белым не выгорает; glare — блик сложением (на тёмной плитке умножать нечего)
  PORCH: { out: 1.6, off: 0.14, blink: 0.07, skirt: 0.5, core: 0.45, glare: 0.12 },
};

/* вид пятна для фонаря: { r, s, k, c } — streetlamps.js кладёт в само пятно */
export function spotOf (style, kind) {
  const P = POOL[style] || POOL.def;
  const c = style === 'cobra' || style === 'double' || style === 'conc' ? (kind ? C.hg : C.na)
    : style === 'cast' || style === 'torch' ? C.warm : style === 'wood' || style === 'woodball' ? (kind === 1 ? C.na : C.inc)
      : style === 'mast' ? C.mast : style === 'ball' || style === 'twin' || style === 'park' || style === 'yard' ? C.led : C.old;
  return { r: P.r, s: P.s, k: P.k, c };
}
/* жребий по месту (без Math.random — зерно города не трогаем) */
const hp = (x, z, s) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
/* пятна лампочек над подъездами: e = [x, z, nx, nz] (CITY.entrances) → пятна, как у фонарей; .lite — два слоя, .bl — мигает */
function porchSpots (list) {
  const out = [], P = POOL.porch, N = NL.PORCH;
  for (const e of list || []) {
    const [x, z, nx, nz] = e, h = hp(x, z, 11);
    if (h < N.off) { STATS.porchOff++; continue; }      // перегорела
    const sp = [x + nx * N.out, z + nz * N.out];
    sp.r = P.r; sp.s = P.s; sp.k = P.k; sp.c = C.inc; sp.lite = 1;
    if (h < N.off + N.blink) { sp.bl = 0.05 + hp(x, z, 12) * 0.95; STATS.porchBlink++; }
    out.push(sp);
  }
  STATS.porches = out.length;
  PORCHES.push(...out);
  return out;
}

/* места окон и витрин у земли: [x, z (середина у стены), ox, oz (наружу), ux, uz (вдоль), ширина, зерно, вид] —
   вид 0 — окно (горит по зерну), 1 — витрина (горит), 2 — аптека (холоднее) */
const WG = [];
export const STATS = { porches: 0, porchOff: 0, porchBlink: 0, pools: 0, wins: 0, shops: 0, meshes: 0, verts: 0, ms: 0, shopAt: [] };
export function win (w, from, to, seed) {
  if (OLD || (MOB && !NL.WIN_MOB) || seed === undefined) return;
  const m = (from + to) / 2;
  WG.push(w.a[0] + w.ux * m + w.ox * 0.12, w.a[1] + w.uz * m + w.oz * 0.12, w.ox, w.oz, w.ux, w.uz, to - from, seed, 0);
}
export function shop (w, from, to, kind) {
  const m = (from + to) / 2;
  if (STATS.shopAt.length < 6000) STATS.shopAt.push([+(w.a[0] + w.ux * m).toFixed(1), +(w.a[1] + w.uz * m).toFixed(1), w.ox, w.oz]);   // где витрины — для проверки (tools/probe-checks/nightlight.js)
  if (OLD) return;
  WG.push(w.a[0] + w.ux * m + w.ox * 0.12, w.a[1] + w.uz * m + w.oz * 0.12, w.ox, w.oz, w.ux, w.uz, to - from, 0, kind === 3 ? 2 : 1);
}

const DEF = spotOf('def');
const PORCHES = [];   // горящие лампочки подъездов (для проверки)
const U = { uK: { value: 0 }, uNight: { value: 0 }, uT: { value: 0 } };
const MATS = [null, null];   // 0 — умножение, 1 — блик (сложение)
const MESHES = [];
function material (add) {
  if (MATS[add]) return MATS[add];
  const MAT = MATS[add] = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    // умножение: цвет земли × (1 + свет) = src × dst + dst; блик — просто сложение
    ...(add ? { blending: THREE.AdditiveBlending } : { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor }),
    polygonOffset: true, polygonOffsetFactor: -4,
    vertexShader: `attribute vec2 aQ; attribute vec4 aC; attribute float aS;
uniform float uK, uNight, uT;
varying vec2 vQ; varying vec3 vCol; varying float vKind;
#include <fog_pars_vertex>
vec4 wh4 (float s) { vec4 p = fract(vec4(s) * vec4(443.897, 441.423, 437.195, 444.129) + vec4(0.13, 0.71, 0.37, 0.53)); p += dot(p, p.wzxy + 19.19); return fract((p.xxyz + p.yzzw) * p.zywx); }
void main () {
  vQ = aQ; vKind = floor(aC.a * 255.0 + 0.5);
  vec3 col = aC.rgb;
  if (vKind > 1.5 && vKind < 2.5) {
    // окно: горит ли и каким светом — та же формула, что у окна (windows.js FRAG_BODY)
    float seed = aS;
    float per = 240.0 + seed * 360.0;
    float ph = uT / per + seed * 13.0;
    float slot = step(0.88, fract(seed * 57.31)) * floor(ph);
    float on0 = step(0.64, fract(sin((slot + seed * 91.7) * 12.9898) * 43758.5453));
    float on1 = step(0.64, fract(sin((slot - 1.0 + seed * 91.7) * 12.9898) * 43758.5453));
    float on = slot > 0.0 ? mix(on1, on0, smoothstep(0.0, 1.2 / per, fract(ph))) : on0;
    vec4 B = wh4(seed + 0.371);
    vec3 L;
    if (B.x < 0.09) L = vec3(0.22, 0.4, 1.0) * (0.75 + 0.12 * sin(uT * 2.1 + seed * 30.0));
    else if (B.x < 0.12) L = vec3(0.5, 0.1, 1.0);
    else if (B.x < 0.32) L = vec3(0.72, 0.85, 1.0);
    else L = mix(vec3(1.0, 0.58, 0.24), vec3(1.0, 0.78, 0.46), B.y);
    col *= L * on * smoothstep(0.15, 0.7, uNight);
  } else if (aS > 0.0) {
    // мигающая лампочка (11бо): раз в 5—14 с — секунда-две дребезга
    float burst = step(0.8, fract(uT / (5.0 + aS * 9.0) + aS * 17.0));
    float fl = step(0.45, fract(sin(floor(uT * 13.0 + aS * 50.0) * 12.9898) * 43758.5453));
    col *= 1.0 - burst * (1.0 - fl) * 0.92;
  }
  vCol = col * uK;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float uK;
varying vec2 vQ; varying vec3 vCol; varying float vKind;
#include <fog_pars_fragment>
void main () {
  float f, d = length(vQ);
  if (vKind < 0.5) f = pow(max(1.0 - d, 0.0), ${NL.SKIRT_POW.toFixed(2)});   // фонарь, мягкий край: сходит на нет к s
  else if (vKind > 3.5) f = pow(max(1.0 - d, 0.0), 1.8);       // блик под плафоном (сложение)
  else if (vKind > 2.5) f = 1.0 - smoothstep(${SOFT_STYLE.on ? '0.08' : '0.3'}, 1.0, d);      // фонарь, середина под плафоном (радиус r)
  else {
    // окно и витрина: ярче у стены, к краям вдоль стены мягко
    float a = abs(vQ.x), o = clamp(vQ.y, 0.0, 1.0);
    f = (1.0 - smoothstep(0.45, 1.0, a)) * pow(1.0 - o, 1.6) * smoothstep(0.0, 0.05, o);
  }
  gl_FragColor = vec4(vCol * f, 1.0);
#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
}`,
  });
  MAT.uniforms.uK = U.uK; MAT.uniforms.uNight = U.uNight; MAT.uniforms.uT = U.uT;
  return MAT;
}

/* сборка: A = { scene, groundH, curbAt, CHUNK, spots } — пятна фонарей (массивы [x, z] с .r/.s/.k/.c и .track).
   Клетка — NL.CELL × CHUNK: в ней два меша — «умножение» (края, середины, окна, витрины) и «блик» (сложение под плафоном) */
export function* build (A) {
  if (OLD) return;
  const t0 = performance.now();
  const { groundH, curbAt } = A, CS = A.CHUNK * NL.CELL, gy = (x, z) => groundH(x, z) + curbAt(x, z) + NL.LIFT;
  const by = new Map();
  const cell = (x, z) => { const k = Math.floor(x / CS) + ',' + Math.floor(z / CS); let c = by.get(k); if (!c) { c = { L: [], W: [] }; by.set(k, c); } return c; };
  for (const sp of A.spots) cell(sp[0], sp[1]).L.push(sp);
  for (const sp of porchSpots(A.porches)) cell(sp[0], sp[1]).L.push(sp);   // лампочки над подъездами (11бо)
  for (let i = 0; i < WG.length; i += 9) cell(WG[i], WG[i + 1]).W.push(i);
  const seg = r => Math.max(2, Math.min(8, Math.ceil(r * 2 / 8)));
  let n = 0;
  for (const c of by.values()) {
    // слои фонаря: [радиус, вид, сила, в блик?] — вид 0 — мягкий край, 3 — середина, 4 — блик
    // на телефоне — без второго слоя середины и дымки (вершин вдвое меньше)
    const lay = P => P.lite ? [[P.s, 0, NL.PORCH.skirt, 0], [P.r, 3, NL.PORCH.core, 0], [P.r * NL.GLARE_R, 4, NL.PORCH.glare, 1]] : MOB ? [[P.s, 0, NL.SKIRT, 0], [P.r, 3, Math.min(1, NL.CORE + NL.CORE2), 0], [P.r * NL.GLARE_R, 4, NL.GLARE, 1]]
      : [[P.s, 0, NL.SKIRT, 0], [P.r, 3, NL.CORE, 0], ...(NL.CORE2 ? [[P.r, 3, NL.CORE2, 0]] : []), [P.r * NL.GLARE_R, 4, NL.GLARE, 1], [P.s, 0, NL.HAZE, 1]];
    const sz = [{ nv: 0, ni: 0 }, { nv: 0, ni: 0 }];
    for (const o of c.W) { const k = WG[o + 8] ? NL.SHOP.n : NL.WIN.n; sz[0].nv += 4 * k; sz[0].ni += 6 * k; }
    for (const sp of c.L) for (const [r, , , g2] of lay(sp.r ? sp : DEF)) { const g = seg(r); sz[g2].nv += (g + 1) * (g + 1); sz[g2].ni += g * g * 6; }
    const B = sz.map(z => ({ pos: new Float32Array(z.nv * 3), q: new Int8Array(z.nv * 2), col: new Uint8Array(z.nv * 4), aS: new Float32Array(z.nv),
      idx: z.nv > 65535 ? new Uint32Array(z.ni) : new Uint16Array(z.ni), v: 0, ii: 0, trk: [], nv: z.nv }));
    for (const sp of c.L) {
      const [x, z] = sp, P = sp.r ? sp : DEF, rgb = P.c || C.old, v0 = [B[0].v, B[1].v];
      // слои — одним куском вершин в каждом меше: у сбитого фонаря гаснут все
      for (const [s, kd, kk, g2] of lay(P)) {
        const b = B[g2], g = seg(s), w0 = b.v, k = Math.min(1, (0.4 + 0.6 * P.k) * kk);   // k вида — мягче: слабый фонарь не гаснет совсем
        const cr = Math.round(rgb[0] * k * 255), cg = Math.round(rgb[1] * k * 255), cb = Math.round(rgb[2] * k * 255);
        for (let j = 0; j <= g; j++) for (let i = 0; i <= g; i++) {
          const u = i / g * 2 - 1, w = j / g * 2 - 1, px = x + u * s, pz = z + w * s, v = b.v++;
          b.pos[v * 3] = px; b.pos[v * 3 + 1] = gy(px, pz) + (kd === 3 ? 0.01 : 0); b.pos[v * 3 + 2] = pz;
          b.q[v * 2] = Math.round(u * 127); b.q[v * 2 + 1] = Math.round(w * 127);
          b.col[v * 4] = cr; b.col[v * 4 + 1] = cg; b.col[v * 4 + 2] = cb; b.col[v * 4 + 3] = kd;
          if (P.bl) b.aS[v] = P.bl;                       // мигает (11бо)
        }
        for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
          const a = w0 + j * (g + 1) + i, bb = a + 1, d = a + g + 1, e = d + 1, I = b.idx;
          I[b.ii++] = a; I[b.ii++] = d; I[b.ii++] = bb; I[b.ii++] = bb; I[b.ii++] = d; I[b.ii++] = e;
        }
      }
      if (sp.track) for (const g2 of [0, 1]) B[g2].trk.push([sp.track, v0[g2], B[g2].v - v0[g2]]);
      STATS.pools++;
    }
    const b = B[0];
    for (const o of c.W) {
      const x = WG[o], z = WG[o + 1], ox = WG[o + 2], oz = WG[o + 3], ux = WG[o + 4], uz = WG[o + 5], ww = WG[o + 6], seed = WG[o + 7], kd = WG[o + 8];
      const S = kd ? NL.SHOP : NL.WIN, hw = ww / 2 + S.pad, D = S.d;
      const rgb = kd === 2 ? [0.85, 1, 0.92] : kd ? [1, 0.95, 0.84] : [1, 1, 1];
      const cr = Math.round(rgb[0] * S.k * 255), cg = Math.round(rgb[1] * S.k * 255), cb = Math.round(rgb[2] * S.k * 255);
      for (let L = 0; L < S.n; L++) {
        const v0 = b.v;
        for (const [a, o2] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
          const px = x + ux * a * hw + ox * o2 * D, pz = z + uz * a * hw + oz * o2 * D, v = b.v++;
          b.pos[v * 3] = px; b.pos[v * 3 + 1] = gy(px, pz) - 0.06 + L * 0.01; b.pos[v * 3 + 2] = pz;
          b.q[v * 2] = a * 127; b.q[v * 2 + 1] = o2 * 127;
          b.col[v * 4] = cr; b.col[v * 4 + 1] = cg; b.col[v * 4 + 2] = cb; b.col[v * 4 + 3] = kd ? 1 : 2;
          b.aS[v] = seed;
        }
        const I = b.idx;
        I[b.ii++] = v0; I[b.ii++] = v0 + 2; I[b.ii++] = v0 + 1; I[b.ii++] = v0; I[b.ii++] = v0 + 3; I[b.ii++] = v0 + 2;
      }
      if (kd) STATS.shops++; else STATS.wins++;
    }
    for (const g2 of [1, 0]) {
      const bb = B[g2];
      if (!bb.nv) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(bb.pos, 3));
      geo.setAttribute('aQ', new THREE.BufferAttribute(bb.q, 2, true));
      geo.setAttribute('aC', new THREE.BufferAttribute(bb.col, 4, true));
      geo.setAttribute('aS', new THREE.BufferAttribute(bb.aS, 1));
      for (const nm of ['aQ', 'aC', 'aS']) geo.attributes[nm].onUpload(function () { this.array = null; });   // позиции — в памяти: сбитый фонарь гасит пятно (streetlamps.js hide)
      geo.setIndex(new THREE.BufferAttribute(bb.idx, 1));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, material(g2));
      m.visible = false; m.renderOrder = g2 ? 2 : 2.5; m.name = g2 ? 'nightglare' : 'nightlight';   // блик раньше: умножение его подкрашивает
      m.matrixAutoUpdate = false;
      A.scene.add(m); MESHES.push(m);
      for (const [f, v0, cnt] of bb.trk) f(m, v0, cnt);
      STATS.meshes++; STATS.verts += bb.nv;
    }
    if (++n % 6 === 0) yield 'nightlit';
  }
  WG.length = 0;
  STATS.ms = Math.round(performance.now() - t0);
}

/* каждый кадр из updateEnv */
export function update (night, t, snow = 0) {
  U.uK.value = night * NL.GAIN * (1 - NL.SNOW * Math.min(1, snow)); U.uNight.value = night; U.uT.value = t;   // снег светлый — умножать надо меньше
  const on = night > 0.05;
  for (let i = 0; i < MESHES.length; i++) MESHES[i].visible = on;
}
/* спрятать на время (снимок без ночного: game.js — как NIGHT_OBJ) */
export const meshes = () => MESHES;
export const DEBUG = { NL, POOL, STATS, U, MESHES, WG, PORCHES };
