/* ──────────────────────────────────────────────────────────────────────────
   Свойства материалов: блики и отклик по классу поверхности (2г11, 25.10.2026; автор: «обрати внимание на блики и
   тени и свойства материалов… свет отражается по-разному от разных материалов»).

   Весь город нарисован «Ламбертом» (матовый свет без бликов). Одна правка общего текста его шейдера (как grit.js) —
   несколько строк после расчёта света; новых программ и вызовов нет. Класс поверхности — по тому, что уже есть:
   нормаль (вверх — земля, вбок — стены), цвет (зелень, снег, серый асфальт), признак в цвете вершины склейки LITM
   (четвёртый байт: 255 — реквизит, 128—253 — кусты), и метка материала (#define MAT_CAR — машины, MAT_METAL — металл).
     • отсвет в тени: стороны, отвёрнутые от солнца, подсвечены тёплым светом от освещённых стен и земли напротив
       (реф 6, 9); сила — доля солнца (BOUNCE);
     • край к небу: под скользящим взглядом поверхность чуть отражает небо (френель, матовое — слабо);
     • бетон, штукатурка — «шин»: слабый широкий блик, только когда солнце скользит по стене;
     • листва и трава на просвет: смотришь против солнца — светится тёплым жёлто-зелёным (реф 7, 8); тёмная хвоя —
       почти нет (матовая);
     • снег: мягкий белый отклик и редкие искры на солнце (мерцают, когда едешь);
     • мокрый асфальт (в дождь и ~1,5 мин после): отражает небо под острым углом и блестит солнцем;
     • реквизит серо-тёмного цвета (столбы, решётки, гаражи, ограды) — острый металлический блик; столбы фонарей —
       металл (MAT_METAL);
     • машины (MAT_CAR, все материалы машин — fakeshadows.js carMat): лак — отражение неба по краю кузова и капоту,
       острый блик солнца;
     • вода (у неё своё отражение, water.js) — не трогаем.
   Стёкла окон и балконов — windows.js (отражение неба тем же градиентом, что купол sky.js, и блик солнца).
   Сила по времени суток и погоде — env() раз в кадр. Выключить: ?oldmat (только это), ?oldlook (весь прежний вид).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as WINS from './windows.js';

const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const MAT = {
  on: !Q.has('oldmat') && !Q.has('oldlook'),
  BOUNCE: 0.24,            // отсвет в тени — доля силы солнца
  BOUNCE_C: '#ffd9b0',     // тёплый
  RIM: 0.14,               // край к небу (матовое)
  SHEEN: 0.07,             // «шин» бетона при скользящем солнце
  LEAF: 0.7,               // листва на просвет
  SNOW: 0.9,               // искры снега
  WET_DRY: 90,             // сек: асфальт сохнет после дождя
  METAL: 0.35, CAR: 0.6,   // острый блик реквизита-металла и лак машин
  wet: 0,
};

/* общие униформы: обычные объекты (не Color/Vector) three не копирует — меняются у всех материалов сразу */
const MU = {
  uMatP: { value: { x: 0, y: 0, z: 0, w: 0 } },        // x — отсвет, y — ясный день (0…1: ночью и в дождь блики гаснут), z — мокрый асфальт, w — снег лежит
  uMatZ: { value: { r: 0.05, g: 0.2, b: 0.6 } },       // небо: зенит (линейный)
  uMatH: { value: { r: 0.6, g: 0.75, b: 0.8 } },       // небо: горизонт
  uMatB: { value: { r: 0, g: 0, b: 0 } },              // отсвет: цвет × сила
};

const CODE = `
#if !defined(WQ) && NUM_DIR_LIGHTS > 0
{
  mat3 mIV = transpose(mat3(viewMatrix));
  vec3 mN = normal, mV = normalize(vViewPosition);
  vec3 Nw = mIV * mN, Vw = mIV * mV, Lw = mIV * directionalLights[0].direction;
  vec3 Pw = mIV * (-vViewPosition - viewMatrix[3].xyz);
  vec3 sunC = directionalLights[0].color;
  vec3 alb = diffuseColor.rgb;
  float aL = dot(alb, vec3(0.2126, 0.7152, 0.0722)), aS = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
  float ndl = dot(Nw, Lw), ndv = max(dot(Nw, Vw), 0.0);
  // доля солнца в этой точке (тень домов sunshadow.js гасит directDiffuse): прямой свет есть / каким был бы без тени
  vec3 unsh = sunC * max(dot(mN, directionalLights[0].direction), 0.0) * BRDF_Lambert(alb);
  float sLit = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(dot(unsh, vec3(1.0)), 1e-4), 0.0, 1.0);
  vec3 Rw = reflect(-Vw, Nw);
  float ry = clamp(Rw.y, -1.0, 1.0);
  vec3 skyR = ry > 0.0 ? mix(uMatH, uMatZ, 1.0 - pow(1.0 - ry, 3.0)) : uMatH * 0.45;
  float F = pow(1.0 - ndv, 5.0);
  float flag = 0.0;
  #ifdef USE_COLOR_ALPHA
    flag = floor(vColor.a * 255.0 + 0.5);
  #endif
  // отсвет в тени: свет от освещённого напротив (со стороны, обратной солнцу), на стены
  vec3 bD = normalize(vec3(-Lw.x, 0.0, -Lw.z) + 1e-4);
  float bk = max(dot(Nw, bD), 0.0) * (1.0 - abs(Nw.y)) * (1.0 - smoothstep(0.0, 0.35, ndl));
  outgoingLight += uMatB * bk * BRDF_Lambert(alb);
  float hs = pow(max(dot(Rw, Lw), 0.0), 6.0);
  // снег: белый, почти без цвета, смотрит вверх
  float snow = smoothstep(0.55, 0.75, aL) * (1.0 - smoothstep(0.06, 0.16, aS)) * smoothstep(0.4, 0.8, Nw.y) * uMatP.w;
  // зелень (листва, кусты, трава) на просвет
  float leafy = smoothstep(0.02, 0.1, alb.g - max(alb.r, alb.b)) * smoothstep(0.015, 0.09, aL);
  // только зелень: кроны и ельник (MAT_LEAF — seasons.js pileMat, forest.js), кусты склейки (признак 128—253), газон склейки
  #ifndef MAT_LEAF
    leafy *= (flag > 127.5 && flag < 253.5) || (flag < 0.5 && Nw.y > 0.6) ? 1.0 : 0.0;
    #ifndef USE_COLOR_ALPHA
      leafy = 0.0;
    #endif
  #endif
  float azb = max(dot(normalize(-Vw.xz + 1e-4), normalize(Lw.xz + 1e-4)), 0.0);   // солнце за предметом (по сторонам света): высокое солнце тоже
  float back = max(pow(max(dot(-Vw, Lw), 0.0), 4.0), 0.6 * azb * azb * azb) * (1.0 - smoothstep(-0.1, 0.45, ndl));
  outgoingLight += sunC * alb * vec3(1.25, 1.15, 0.45) * back * leafy * @K_LEAF * uMatP.y;
  // край к небу (френель матового; трава и листва — слабее)
  outgoingLight += skyR * F * @K_RIM * uMatP.y * (0.4 + 0.6 * max(Nw.y + 0.5, 0.0)) * (1.0 - 0.7 * leafy);
  // бетон, штукатурка, всё прочее: слабый широкий «шин», когда солнце скользит
  float graze = smoothstep(0.0, 0.15, ndl) * (1.0 - smoothstep(0.25, 0.6, ndl));
  outgoingLight += sunC * hs * graze * @K_SHEEN * sLit * (1.0 - leafy) * (1.0 - snow) * uMatP.y;
  // снег: мягкий отклик и искры
  if (snow > 0.01 && ndl > 0.0) {
    vec3 cell = floor(Pw * 7.0) + floor(Vw * 30.0) * 0.37;
    float hsh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    outgoingLight += sunC * snow * sLit * (hs * 0.05 + step(0.994, hsh) * @K_SNOW * ndl);
  }
  // мокрый асфальт: серое, смотрит вверх — отражает небо и блестит солнцем
  float wet = uMatP.z * smoothstep(0.75, 0.95, Nw.y) * (1.0 - smoothstep(0.08, 0.2, aS)) * (1.0 - smoothstep(0.35, 0.6, aL)) * step(flag, 127.5);
  if (wet > 0.01) {
    float Fw = 0.04 + 0.96 * F;
    outgoingLight *= 1.0 - 0.25 * wet;              // мокрое — темнее
    outgoingLight = mix(outgoingLight, skyR, Fw * wet * 0.85);
    outgoingLight += sunC * pow(max(dot(Rw, Lw), 0.0), 220.0) * 2.0 * wet * sLit * uMatP.y;   // блеск солнца — когда дождь кончился
  }
  float hp = pow(max(dot(Rw, Lw), 0.0), 40.0);
  // реквизит серо-тёмного цвета — острый металлический блик
  float metal = flag > 254.5 ? (1.0 - smoothstep(0.08, 0.16, aS)) * (1.0 - smoothstep(0.35, 0.55, aL)) : 0.0;
  #ifdef MAT_METAL
    metal = 1.0;
    outgoingLight = mix(outgoingLight, skyR * 0.6, 0.25 * (0.3 + 0.7 * F));
  #endif
  outgoingLight += sunC * hp * metal * @K_METAL * sLit * uMatP.y;
  #ifdef MAT_CAR
    // лак: небо по краю кузова и на капоте, острый блик солнца
    float Fc = 0.04 + 0.96 * F;
    outgoingLight = mix(outgoingLight, skyR, Fc * @K_CAR);
    outgoingLight += sunC * (pow(max(dot(Rw, Lw), 0.0), 120.0) * 1.6 + hs * 0.03) * sLit * uMatP.y;
  #endif
}
#endif
`;

const ANCHOR = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
const f3 = x => x.toFixed(3);
function code () {
  const K = { RIM: f3(MAT.RIM), LEAF: f3(MAT.LEAF), SHEEN: f3(MAT.SHEEN), SNOW: f3(MAT.SNOW), METAL: f3(MAT.METAL), CAR: f3(MAT.CAR) };
  return CODE.replace(/@K_(\w+)/g, (_, k) => K[k]);
}

const L = THREE.ShaderLib.lambert;
if (MAT.on && L.fragmentShader.includes(ANCHOR) && !L.fragmentShader.includes('uMatP')) {
  Object.assign(L.uniforms, MU);
  L.fragmentShader = 'uniform vec4 uMatP;\nuniform vec3 uMatZ, uMatH, uMatB;\n' + L.fragmentShader.replace(ANCHOR, ANCHOR + '\n' + code());
} else MAT.on = false;

/* метка класса: в программу материала — #define (ключ программы меняется вместе с ним, лишних программ нет,
   если у материала она и так своя: машины — '|fsc' fakeshadows.js, столбы фонарей — свой материал) */
export function car (m) { return mark(m, 'MAT_CAR'); }
export function metal (m) { return mark(m, 'MAT_METAL'); }
function mark (m, def) {
  if (!MAT.on || !m || !m.isMeshLambertMaterial) return m;
  if (m.defines && def in m.defines) return m;
  m.defines = Object.assign({}, m.defines, { [def]: '' });
  m.needsUpdate = true;
  return m;
}

const C = new THREE.Color(), CS = new THREE.Color(), BC = new THREE.Color(MAT.BOUNCE_C), V3 = new THREE.Vector3();
/* раз в кадр из game.js updateEnv (после sky.js): небо, солнце, дождь, снег */
export function env ({ night, rain, snow, scene, sun, dt }) {
  const day = 1 - night;
  MAT.wet = rain > MAT.wet ? rain : Math.max(0, MAT.wet - dt / MAT.WET_DRY);
  if (snow > 0.45) MAT.wet = 0;
  const zen = scene.background && scene.background.isColor ? scene.background : C.set(0x86c6f2), hor = scene.fog ? scene.fog.color : zen;
  V3.copy(sun.position).sub(sun.target.position).normalize();
  WINS.sky(MAT.on, zen, hor, V3, CS.copy(sun.color).multiplyScalar(sun.intensity));
  if (!MAT.on) return;
  const P = MU.uMatP.value;
  P.x = MAT.BOUNCE * day; P.y = day * (1 - Math.min(1, rain) * 0.85);   // ясно: в дождь блики солнца почти гаснут
  P.z = Math.min(1, MAT.wet); P.w = Math.min(1, snow);   // мокрый асфальт, снег (26.10: строка была в комментарии — не работали)
  if (MAT.dbg) Object.assign(P, MAT.dbg);           // probe: __dlv.MATS.dbg = { z: 0 } — выключить одно
  const Z = MU.uMatZ.value, H = MU.uMatH.value, B = MU.uMatB.value;
  Z.r = zen.r; Z.g = zen.g; Z.b = zen.b; H.r = hor.r; H.g = hor.g; H.b = hor.b;
  const k = MAT.BOUNCE * day * (1 - Math.min(1, rain) * 0.7) * sun.intensity;
  B.r = BC.r * sun.color.r * k; B.g = BC.g * sun.color.g * k; B.b = BC.b * sun.color.b * k;
}
