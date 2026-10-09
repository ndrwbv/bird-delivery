/* ──────────────────────────────────────────────────────────────────────────
   Вода: Томь и пруды (Л2, 09.10.2026). Правила словами — docs/CAREER.md
   «Город: как выглядит» → «Вода». Речки и пруды — streams.js: свой меш тем же
   шейдером (buildInland, WIN — глубина из цвета вершины).

   Раньше гладь была куском общей статики (LITM) — ровный голубой цвет. Теперь
   это свой меш со своим шейдером, геометрия та же: одна плоскость на нуле
   (берег выше — кромка там, где земля уходит под ноль) и пруды из карты.
   Всё живое — в шейдере, без лишней геометрии и без второго прохода отрисовки:
   • волны — сумма трёх-четырёх бегущих синусов с извилиной от шума, двигают
     только нормаль (вершины на месте); вдали затихают — не рябит;
   • отражение неба и тумана по Френелю: под ногами вода своего цвета, к
     горизонту — цвет неба (вечером оранжевая, ночью тёмная, в дождь серая);
   • отражение берега: луч отражения идёт над рельефом (текстура высот — та же
     сетка, что у земли) несколько шагов; упёрся в берег — тёмная зелень берега,
     ночью на ней редкие тёплые огоньки окон;
   • блик солнца (ночью — того же «солнца», тусклого и синего, — луны): дорожка
     искр по волнам;
   • пена у берега — по настоящей глубине (рельеф считается как у земли,
     по тем же треугольникам), каёмка и полосы, бегущие к берегу;
   • ясным днём (uWDay: солнце белое — не рассвет и не закат, без дождя, не лёд) дальняя вода синее:
     вдали (40→320 м) меньше отражения светлой дымки, гладь насыщенно-синяя,
     туман над водой в середине слабее (у дальнего края — как у всех);
   • в дождь — круги от капель (чем сильнее дождь, тем гуще), блик гаснет;
   • зимой — лёд (Л4, 09.10.2026): снег с голубыми проплешинами голого льда
     (глубже — темнее, белые прожилки, блик солнца), у самого берега торосы —
     глыбы клетками; эффекты воды гаснут вместе с ростом снега (uWIce).
     Езда по льду, треск и пролом — ice.js.
   Настройка графики (gfx.js): «эффекты» выкл (низкая) — без отражения берега,
   один слой кругов, три волны; средняя — берег в 3 шага; высокая (дальность
   490) — берег в 5 шагов и четвёртая мелкая волна.

   Куда расти:
   • Л4 лёд — setIce(k) (0 — вода, 1 — лёд; null — снова по снегу); вид
     льда — в WATER_BODY под uWIce, езда и пролом — ice.js;
   • Л3 пляж — depthAt(x, z) (глубина, м) и uWShore (ширина пены);
     песок на берегу — в цвете земли (game.js groundHex), не тут.
   ────────────────────────────────────────────────────────────────────────── */

let DAYF = null, THREE = null, MAT = null, MESH = null, A = null, ICE = null, MAT2 = null, MESH2 = null;
const CUR = { q: -1 };

const U = {
  uWT: { value: 0 },                    // время, с
  uWRain: { value: 0 },                 // дождь 0…1
  uWNight: { value: 0 },                // ночь 0…1
  uWIce: { value: 0 },                  // лёд 0…1 (зимой — по снегу)
  uWDay: { value: 0 },                  // ясный день 0…1: дальняя вода синее (не ночь, не рассвет/закат, не дождь, не лёд)
  uWShore: { value: 1 },                // ширина пены у берега (×)
  uWSky: { value: null },               // цвет неба (scene.background — та же ссылка)
  uWFog: { value: null },               // цвет тумана (горизонт)
  uWSunD: { value: null },              // куда светит солнце (от воды к солнцу)
  uWSunC: { value: null },              // цвет × сила солнца
  uWH: { value: null },                 // рельеф: R8, байт = (h + 4) × 16
  uWG: { value: [0, 0, 12, 0] },        // x0, z0, шаг сетки, —
  uWN: { value: [2, 2] },               // клеток по x, z
};

/* Кусок фрагментного шейдера. Стоит перед opaque_fragment: у нас уже есть outgoingLight
   (вода, освещённая как раньше, с сезоном), diffuseColor, vSW (мировая позиция — seasons.js)
   и sNoise / lHash из seasons.js. */
const WATER_HEAD = `
uniform float uWT, uWRain, uWNight, uWIce, uWShore, uWDay;
uniform vec3 uWSky, uWFog, uWSunD, uWSunC;
uniform sampler2D uWH;
uniform vec4 uWG;
uniform vec2 uWN;
float wH (vec2 p) {                       // высота земли, билинейно (для отражения берега)
  vec2 uv = ((p - uWG.xy) / uWG.z + 0.5) / uWN;
  return texture2D(uWH, uv).r * 15.9375 - 4.0;
}
float wHx (vec2 p) {                      // высота земли ровно как groundH: клетка, диагональ, два треугольника
  vec2 u = (p - uWG.xy) / uWG.z;
  vec2 ij = clamp(floor(u), vec2(0.0), uWN - 2.0);
  vec2 f = clamp(u - ij, 0.0, 1.0);
  ivec2 c = ivec2(ij);
  float h00 = texelFetch(uWH, c, 0).r, h10 = texelFetch(uWH, c + ivec2(1, 0), 0).r, h01 = texelFetch(uWH, c + ivec2(0, 1), 0).r;
  float h;
  if (f.x + f.y <= 1.0) h = h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
  else { float h11 = texelFetch(uWH, c + ivec2(1, 1), 0).r; h = h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y); }
  return h * 15.9375 - 4.0;
}
/* круги от капель в клетке s м: наклон поверхности (g) и яркость кольца */
float wRing (vec2 p, float s, float salt, float dens, inout vec2 g) {
  vec2 q = p / s, c = floor(q) + salt, f = fract(q);
  float h1 = lHash(c);
  if (h1 > dens) return 0.0;
  vec2 dv = f - (vec2(lHash(c + 3.1), lHash(c + 7.7)) * 0.5 + 0.25);
  float ph = fract(uWT * 0.9 + h1 * 7.0), dl = length(dv);
  float ring = (1.0 - smoothstep(0.0, 0.08, abs(dl - ph * 0.42))) * (1.0 - ph);
  g += dv / max(dl, 0.001) * ring * 0.9;
  return ring;
}
`;
const WATER_BODY = `
{
vec3 wp = vSW;
// ── глубина: Томь — по рельефу; речки и пруды (WIN, streams.js) — из цвета вершины ──
#ifdef WIN
float D = wInD;
#else
float D = wp.y < 0.01 ? max(-wHx(wp.xz), 0.0) : 2.5;
#endif
vec3 irr = outgoingLight / max(diffuseColor.rgb, vec3(0.03));   // сколько света падает на гладь
vec3 iceC = outgoingLight;
if (uWIce > 0.001) {
  // ── лёд (Л4, ice.js): снег, сдутый до голубого льда пятнами; у берега — торосы ──
  vec2 q = wp.xz;
  float nn = sNoise(q * 0.035 + 11.0) * 0.65 + sNoise(q * 0.11 + 5.0) * 0.35;
  float fk = smoothstep(0.2, 1.2, D);                  // у берега — почти один снег, вдали — проплешины
  float thr = 0.6 - 0.16 * fk - (1.0 - uWIce) * 0.2;   // снега мало — голого льда больше
  float bare = step(thr, nn);
  float rim = smoothstep(thr - 0.06, thr, nn) * (1.0 - bare);
  vec3 snowC = vec3(0.93, 0.955, 1.0) * (0.95 + 0.05 * sNoise(q * 0.45));
  vec3 blue = mix(vec3(0.60, 0.79, 0.90), vec3(0.34, 0.54, 0.71), smoothstep(0.3, 2.5, D));   // глубже — темнее
  float vein = 1.0 - smoothstep(0.0, 0.035, abs(sNoise(q * 0.5 + 7.0) - 0.5));
  blue = mix(blue, vec3(0.86, 0.94, 1.0), vein * 0.55);                                       // белые прожилки во льду
  vec3 ic = mix(snowC, blue, bare);
  ic = mix(ic, vec3(0.80, 0.88, 0.95), rim * 0.55);
  // торосы: у самого берега глыбы (клетки 1,3 м под углом), освещены по-разному, щели темнее
  float ridge = (1.0 - smoothstep(0.25, 0.7, D)) * step(0.02, D) * step(0.42, sNoise(q * 0.07 + 3.0));
  if (ridge > 0.0) {
    vec2 rr = mat2(0.8, -0.6, 0.6, 0.8) * q / 1.3;
    vec2 rc = floor(rr), rf = fract(rr);
    float rh = lHash(rc + 5.0);
    float redge = step(min(min(rf.x, rf.y), min(1.0 - rf.x, 1.0 - rf.y)), 0.08);
    vec3 slab = mix(vec3(0.95, 0.97, 1.0), vec3(0.62, 0.78, 0.9), step(0.72, rh)) * mix(0.72, 1.12, lHash(rc + 9.0));
    ic = mix(ic, slab * (1.0 - redge * 0.2), ridge * step(0.5, rh));
  }
  // блик солнца на голом льду
  vec3 Vi = normalize(cameraPosition - wp);
  float sg = pow(max(dot(reflect(-Vi, vec3(0.0, 1.0, 0.0)), normalize(uWSunD)), 0.0), 80.0);
  iceC = ic * irr + uWSunC * sg * bare * 0.5;
}
if (uWIce < 0.999) {
  float wdist = length(cameraPosition.xz - wp.xz);
  float wFade = 1.0 / (1.0 + wdist * 0.012);         // вдали волны тише: не рябит (мелкие — ещё тише, см. ниже)
  // ── волны: наклон поверхности g (dh/dx, dh/dz) ──
  float wn = sNoise(wp.xz * 0.035 + vec2(uWT * 0.03, 0.0));
  vec2 p = wp.xz + vec2(wn, -wn) * 5.0;              // извилина: гребни не по линейке
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.47, 0.88), d3 = vec2(0.96, -0.28);
  g += d1 * 0.090 * cos(dot(p, d1) * 0.85 + uWT * 1.25);
  g += d2 * 0.085 * cos(dot(p, d2) * 1.45 - uWT * 1.7) / (1.0 + wdist * 0.02);
  g += d3 * 0.080 * cos(dot(p, d3) * 2.4 + uWT * 2.3) / (1.0 + wdist * 0.04);
  #if WQ > 1
  g += vec2(-0.2, -0.98) * 0.06 * cos(dot(p, vec2(-0.2, -0.98)) * 4.1 + uWT * 3.1) / (1.0 + wdist * 0.08);
  #endif
  g *= wFade * (1.0 - uWRain * 0.35);
  // ── круги от капель ──
  float wr = 0.0;
  if (uWRain > 0.03 && wdist < 80.0) {
    vec2 gr = vec2(0.0);
    float dens = uWRain * 0.75;
    wr = wRing(wp.xz, 1.4, 0.0, dens, gr);
    #if WQ > 0
    wr = max(wr, wRing(wp.xz + 0.53, 1.1, 41.0, dens, gr));
    #endif
    float rf = 1.0 - smoothstep(30.0, 80.0, wdist);
    g += gr * rf; wr *= rf;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 Vd = normalize(cameraPosition - wp);
  float NV = max(dot(N, Vd), 0.0);
  float F = (0.03 + 0.97 * pow(1.0 - NV, 5.0)) * 0.72;   // не зеркало: к горизонту вода всё равно своего цвета
  // ясным днём вдали отражения светлой дымки меньше: река читается синей полосой до горизонта
  float wFar = smoothstep(40.0, 260.0, wdist) * uWDay;
  F *= 1.0 - 0.5 * wFar;
  vec3 R = reflect(-Vd, N);
  R.y = max(R.y, 0.01);
  float sh = 1.0 - smoothstep(0.15, 2.4, D);
  vec3 body = outgoingLight * mix(vec3(0.72, 0.86, 0.97), vec3(0.95, 1.12, 1.0), sh);
  body = mix(body, outgoingLight * vec3(0.5, 0.74, 1.02), wFar * 0.6);    // днём вдали — синее
  // ── отражение: небо к горизонту светлее (туман), берег ──
  vec3 refl = mix(uWFog, uWSky, smoothstep(0.0, 0.3, R.y)) * vec3(0.88, 0.95, 1.0);
  refl = mix(refl, uWSky * vec3(0.62, 0.84, 1.0), wFar * 0.7);   // днём вдали — небо над головой, насыщеннее, не дымка
  #if WQ > 0
  {
    vec2 rd = normalize(R.xz + vec2(1e-4)); float rs = R.y / max(length(R.xz), 1e-3);
    float bank = 0.0; vec2 hp = wp.xz;
    #if WQ > 1
    const int WS = 5; float ST[5] = float[5](4.0, 10.0, 22.0, 45.0, 90.0);
    #else
    const int WS = 3; float ST[3] = float[3](6.0, 20.0, 60.0);
    #endif
    for (int i = 0; i < WS; i++) {
      vec2 q = wp.xz + rd * ST[i];
      if (wH(q) - wp.y > rs * ST[i] + 0.35) { bank = 1.0; hp = q; break; }
    }
    vec3 bankC = vec3(0.10, 0.16, 0.07) * irr;
    // ночью на берегу окна: редкие тёплые огоньки дрожат в волнах
    float lit = step(0.86, lHash(floor(hp / 7.0))) * smoothstep(0.3, 0.8, uWNight);
    bankC += vec3(1.0, 0.62, 0.25) * lit * 0.9;
    refl = mix(refl, bankC, bank * (1.0 - uWRain * 0.4));
  }
  #endif
  vec3 col = mix(body, refl, F);
  // ── блик солнца (ночью — тусклый синеватый: луна) ──
  float sd = max(dot(R, normalize(uWSunD)), 0.0);
  // искры, а не пятно: дорожка к солнцу из мигающих точек ровно в пиксель кадра (крупный пиксель игры)
  float spark = step(0.6, lHash(floor(gl_FragCoord.xy) + floor(uWT * 7.0) * 17.0));
  float glint = pow(sd, 500.0) * 0.8 + smoothstep(0.986, 0.997, sd) * spark * 1.3;
  col += uWSunC * glint * (1.0 + uWNight * 1.2) * (1.0 - uWRain * 0.9);
  // ── пена у берега: каёмка и полосы к берегу ──
  float fn = sNoise(wp.xz * 0.3 + vec2(uWT * 0.12, uWT * 0.05));
  float sw = uWShore;
  float edge = 1.0 - step(0.09 * sw + 0.14 * sw * fn, D);
  float band = fract(D * 2.0 / sw - uWT * 0.32 + fn * 0.7);
  float lines = step(0.8, band) * step(D, 0.75 * sw) * step(0.38, fn);
  #ifdef WIN
  lines = step(0.86, band) * step(D, 0.3 * sw) * step(0.5, fn) * 0.6;   // речки и пруды: полос к берегу меньше и тише
  #endif
  #ifdef WIN
  float foam = max(edge, lines);
  #else
  float foam = max(edge, lines) * step(wp.y, 0.01);
  #endif
  col = mix(col, vec3(0.9, 0.95, 1.0) * irr, foam * 0.85);
  col += irr * vec3(0.16, 0.18, 0.2) * wr;            // кольца капель светлее
  outgoingLight = mix(col, iceC, uWIce);
} else outgoingLight = iceC;
}
`;

/* материал воды: Ламберт с сезоном (lit — функция-обёртка из game.js, как у статики) + наш кусок.
   inland — речки и пруды (streams.js): глубина для пены — красный канал цвета вершины (0…1 → 0…4 м),
   цвет воды — тот же, что у Томи (до сезона: лёд и снег зимой — как у Томи) */
function waterMat (seasonMat, inland) {
  const m = seasonMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    let fs = sh.fragmentShader.replace('void main() {', WATER_HEAD + 'void main() {').replace('#include <opaque_fragment>', WATER_BODY + '#include <opaque_fragment>');   // после seasons.js (sNoise, lHash)
    if (inland) fs = '#define WIN 1\n' + fs.replace('void main() {', 'float wInD = 0.0;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\nwInD = diffuseColor.r * 4.0; diffuseColor.rgb = vec3(0.159, 0.434, 0.584);');   // #6fb0c9 в линейном
    // туман (линейный, game.js): ясным днём над водой в середине слабее — синяя полоса до горизонта; у дальнего края — как у всех (шва нет)
    fs = fs.replace('#include <fog_fragment>', `#ifdef USE_FOG
      #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      fogFactor = pow(fogFactor, 1.0 + 4.0 * uWDay);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`);
    sh.fragmentShader = '#define WQ ' + CUR.q + '\n' + fs;
  };
  m.customProgramCacheKey = () => 'water' + CUR.q + (inland ? 'i' : '');
  return m;
}

/* текстура высот: та же сетка, что у земли (TH из game.js), байтом: шаг 1/16 м, ноль — ровно */
function heightTex (TH, nx, nz) {
  const a = new Uint8Array(nx * nz);
  for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(255, Math.round((TH[i] + 4) * 16)));
  const t = new THREE.DataTexture(a, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/* уровень по настройке графики: 0 — низкая (эффекты выкл), 1 — средняя, 2 — высокая (дальность полная) */
const quality = gfx => (gfx.fxLow() ? 0 : gfx.rangeK() < 0.99 ? 1 : 2);

/* Сборка: вместо голубой плоскости в общей статике. api: THREE, scene, Mesher, seasonMat, gfx,
   TH, ter { g, nx, nz, x0, z0 }, rect [x0, z0, x1, z1] (гладь до горизонта), ponds (контуры прудов),
   env() → ENV, sun, snowAmt(), groundH */
export function build (api) {
  A = api; THREE = api.THREE;
  const T = api.ter;
  U.uWH.value = heightTex(api.TH, T.nx, T.nz);
  U.uWG.value = [T.x0, T.z0, T.g, 0];
  U.uWN.value = [T.nx, T.nz];
  U.uWSky.value = api.scene.background;
  U.uWFog.value = api.scene.fog.color;
  U.uWSunD.value = new THREE.Vector3(0.5, 0.7, 0.3);
  U.uWSunC.value = new THREE.Color(0, 0, 0);
  CUR.q = quality(api.gfx);
  MAT = waterMat(api.seasonMat);
  const M = api.Mesher();
  M.color('#6fb0c9');
  const [x0, z0, x1, z1] = api.rect;
  M.up(x0, 0, z1, x1, 0, z1, x1, 0, z0);
  M.up(x0, 0, z1, x1, 0, z0, x0, 0, z0);
  for (const p of api.ponds) M.poly(p, 0.03);
  MESH = M.mesh(MAT);
  // после земли и всей статики: под сушей пиксели воды отбрасываются по глубине, шейдер не считается
  MESH.traverse(o => { o.renderOrder = 2; });
  MESH.name = 'water';
  api.scene.add(MESH);
  return MESH;
}

/* Речки и пруды (streams.js): свой меш тем же шейдером. M — Mesher с готовыми треугольниками
   (глубина для глаза — в красном канале цвета вершины). Рисуется после земли, как Томь */
export function buildInland (M) {
  if (!A) return null;
  MAT2 = MAT2 || waterMat(A.seasonMat, true);
  MESH2 = M.mesh(MAT2);
  MESH2.traverse(o => { o.renderOrder = 2; });
  MESH2.name = 'water-inland';
  A.scene.add(MESH2);
  return MESH2;
}

/* каждый кадр: время, небо, солнце, дождь, лёд, качество */
export function step (dt) {
  if (!MAT) return;
  U.uWT.value = (U.uWT.value + dt) % 3600;
  const E = A.env(), sun = A.sun;
  U.uWRain.value = E.rain || 0;
  U.uWNight.value = E.night || 0;
  U.uWSunD.value.copy(sun.position).sub(sun.target.position).normalize();
  U.uWSunC.value.copy(sun.color).multiplyScalar(sun.intensity * 0.7);
  const snow = A.snowAmt();
  U.uWIce.value = ICE !== null ? ICE : Math.min(1, Math.max(0, (snow - 0.12) / 0.33));
  // ясный день: солнце белое (днём #fff4de, в линейном цвете синий/красный ≈ 0,73; на рассвете ≈ 0,33, на закате ≈ 0,15), не ночь, без дождя, не лёд (закат и ночь — как было)
  const sc = sun.color, dk = Math.min(1, Math.max(0, (sc.b / Math.max(sc.r, 0.01) - 0.4) / 0.25));
  U.uWDay.value = DAYF !== null ? DAYF : dk * dk * (3 - 2 * dk) * (1 - U.uWNight.value) * (1 - U.uWRain.value) * (1 - U.uWIce.value);
  const q = quality(A.gfx);
  if (q !== CUR.q) { CUR.q = q; MAT.needsUpdate = true; if (MAT2) MAT2.needsUpdate = true; }
}

/* Л4: лёд вручную (0…1), null — снова по снегу */
export function setIce (k) { ICE = k === null || k === undefined ? null : Math.max(0, Math.min(1, +k)); }
/* лёд сейчас (0 — вода, 1 — лёд): речки и пруды зимой — по льду, не вброд (streams.js) */
export const ice = () => U.uWIce.value;
/* Л3: ширина пены у берега (1 — как сейчас) */
export function setShore (k) { U.uWShore.value = Math.max(0.2, +k || 1); }
/* глубина воды в точке, м (0 — суша); по той же сетке, что земля */
export function depthAt (x, z) { return A ? Math.max(0, -A.groundH(x, z)) : 0; }

/* ясный день вручную (0…1, сравнить «до/после»), null — по солнцу */
export function setDay (k) { DAYF = k === null || k === undefined ? null : Math.max(0, Math.min(1, +k)); }

export const DEBUG = { setDay, U, CUR, get mesh () { return MESH; }, get inland () { return MESH2; }, setIce, setShore, depthAt, quality: () => CUR.q };
