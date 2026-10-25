/* ──────────────────────────────────────────────────────────────────────────
   Пятна на газоне (04.10.2026, трек «Наполнение мира», шаг 1).

   Земля склеена из больших треугольников, у каждого один цвет, — газон
   выглядел ровной зелёной скатертью. Теперь краска травы меняется по месту,
   прямо в шейдере статики (LITM): новых предметов и треугольников нет.

   Что рисуется (всё — по мировым x/z, поэтому каждый запуск одинаково):
   • крупные пятна 20—60 м: светлее / темнее, где-то желтее, где-то сочнее;
   • лёгкая тень-рельеф: невидимые бугры ~25 м, склон «от солнца» темнее —
     той же краской, земля остаётся плоской (горки ломают езду, DIRECTION.md);
   • проплешины 3—8 м голой земли, кучками, край мягкий — земля переходит в траву
     пятном за полметра (О5, 09.10.2026; до того край шёл клетками по 0,5 м);
   • мелкая рябь клетками 0,5—1 м — под пиксельный стиль игры.
   Рябь гаснет, когда клетка меньше пары точек экрана (вдали — ровный цвет,
   не мерцает). На «Низкой» графике (чёткость ~430) ряби нет.

   Летом цвет травы — как до 09.10.2026: сочную траву (+25 % насыщенности) автор
   вернул 10.10.2026 («слишком зелёная»).

   Сезоны (юниформы seasons.js) поверх: осенью трава золотисто-зелёная и
   жёлтая, пятнами ~10 м темнее (сырое) и светлее (сухое), где листьев гуще —
   рыжая подстилка, у листьев тень (лежат поверх травы, О7); проплешины —
   светлая сухая трава и опавшие листья, по газону — яркие листья вразброс,
   кучками (золотая осень — гуще; leafAt в seasons.js: у каждого листа свой
   сдвиг и поворот, рядов нет); грязь — только весной
   (мокрые проплешины); в жару проплешин больше и они пыльные, листьев нет;
   зимой всё под снегом, как было (снег кладёт seasons.js после нас).

   Травой считаем то же, что seasons.js: зелёный цвет вершины и грань,
   смотрящая вверх. Асфальт, плитку, стены и воду не трогаем.

   25.10.2026 (2г8—2г9, «Стиль глубинки»): поверх — «бархат» после сезона (VELVET), край газона на асфальте и
   плитке, плиты дворовых дорожек со швами и тропинки (EDGE_GLSL; рядом с камерой — по маске земли meadow.js).
   ?oldgrass / ?oldlook — без них.
   ────────────────────────────────────────────────────────────────────────── */

import * as GFX from './gfx.js';
import { CLEAN } from './mobile.js';
import * as MD from './meadow.js';         // некошеная трава: маска земли рядом с камерой, цвета-метки тропинок и дорожек (2г8—2г9)
/* телефон (mobile.js CLEAN.lawnCalm, 11бз): проплешин меньше (порог выше), светлые / тёмные и жёлтые пятна мягче —
   на маленьком экране они рябили вместе с мелочью; на компьютере — как было */
const CALM = !!(CLEAN && CLEAN.lawnCalm);

/* чёткость: на «Низкой» (~430 точек по короткой стороне) — без ряби */
const uLawnLo = { get value () { try { return GFX.pixelShort() < 480 ? 1 : 0; } catch (e) { return 0; } } };
/* полная краска (gfx.js DETAIL.lawn): на «Средней» и «Низкой» — без тени-рельефа (рельеф теперь
   настоящий, relief.js) и без вторых октав шума: 4 шума на точку вместо 10 */
const uLawnQ = { get value () { try { return GFX.detail().lawn ? 1 : 0; } catch (e) { return 1; } } };

/* «Бархат» (2г8, 25.10.2026, автор: «трава нежная», рефы — тёплые жёлто-зелёные и тёмные холодные пятна): ПОСЛЕ сезона
   (seasons.js seasonTint красит газон свежей зеленью — «салатовая скатерть»), только где газон и сейчас зелёный (осень,
   жара и снег — как были). Пятна ~30—70 м: тёплые — жёлто-зелёные, холодные — темнее; синевы меньше (салат → олива);
   под скользящим взглядом (вдаль) — светлее и теплее, как кончики некошеной травы на солнце. ?oldgrass / ?oldlook — как было */
const VELVET = `
{
  vec3 pc = diffuseColor.rgb;
  vec3 pN = normalize(cross(dFdx(vSW), dFdy(vSW)));
  float pg = smoothstep(0.03, 0.14, pc.g - max(pc.r, pc.b)) * smoothstep(0.42, 0.8, pN.y);
  if (!(S_LAND)) pg *= smoothstep(0.95, 0.99, pN.y);   // реквизит: только ровный верх (газон палисадника, клумбы), не кусты
  if (pg > 0.0) {
    vec2 q = vSW.xz;
    float pw = mdNoise(q * 0.028 + 57.0) * 0.6 + mdNoise(q * 0.09 + 13.0) * 0.4;
    // цвет — по яркости, а не множителем: салатовый от сезона (свежая зелень) тоже уходит в оливу (второй круг 25.10.2026)
    float lum = clamp(dot(pc, vec3(0.3, 0.59, 0.11)) / 0.43, 0.55, 1.05);   // 0,43 — яркость газона #95c579; свежая зелень сезона не светлее
    vec3 cool = vec3(0.07, 0.13, 0.025), mid = vec3(0.17, 0.245, 0.045), warm = vec3(0.33, 0.34, 0.07);   // олива: тёмная холодная → тёплая жёлто-зелёная
    vec3 tgt = mix(mix(cool, mid, smoothstep(0.12, 0.5, pw)), warm, smoothstep(0.5, 0.86, pw)) * lum;
    vec3 c = mix(pc, tgt, 0.88);
    float fine = mdNoise(q * 0.9 + 3.0) * 0.6 + mdNoise(q * 2.7) * 0.4;
    c *= 0.88 + 0.22 * fine * (1.0 - smoothstep(0.3, 0.9, fwidth(q.x * 2.7)));
    // под травинками (meadow.js) земля темнее и глубже — трава её затеняет; гаснет вместе с травой вдали
    if (uMdOn > 0.5) {
      vec2 cuv = (q - uMdWin.xy) * uMdWin.z + 0.5;
      vec2 ce = abs(cuv - 0.5);
      float cov = texture2D(uMdMap, cuv).r * (1.0 - smoothstep(0.42, 0.48, max(ce.x, ce.y)))
        * (1.0 - smoothstep(uMdCover.x, uMdCover.y, length(q - cameraPosition.xz)));
      c = mix(c, c * vec3(0.52, 0.6, 0.5), cov * uMdCover.z);
    }
    vec3 vv = normalize(cameraPosition - vSW);
    float gz = 1.0 - clamp(vv.y, 0.0, 1.0); gz *= gz;
    c = mix(c, c * vec3(1.2, 1.12, 0.75), gz * 0.3);
    diffuseColor.rgb = mix(pc, c, pg);
  }
}`;

const LAWN_GLSL = `
{
  vec3 lc0 = vColor.rgb;
  float lgr = smoothstep(0.05, 0.18, lc0.g - max(lc0.r, lc0.b));
  vec3 lN = normalize(cross(dFdx(vSW), dFdy(vSW)));
  lgr *= smoothstep(0.42, 0.8, lN.y);
  if (S_LAND && lgr > 0.0) {                  // S_LAND — не реквизит (seasons.js: признак в цвете вершины склейки LITM)
    vec2 q = vSW.xz;
    vec3 c = diffuseColor.rgb, c0 = c;
    // крупные пятна: светлее / темнее (~40 и ~17 м), желтее / сочнее (~55 м)
    float big = uLawnQ > 0.5 ? sNoise(q * 0.025 + 3.1) * 0.65 + sNoise(q * 0.06 + 7.7) * 0.35 : sNoise(q * 0.025 + 3.1);
    float hue = sNoise(q * 0.018 + 11.3);
    // осень: трава — тёплая золотисто-зелёная и жёлтая (не бурая), яркость травы сохраняем
    if (uDry > 0.0) {
      float lum0 = clamp(dot(c, vec3(0.3, 0.55, 0.15)) / 0.2, 0.8, 1.2);
      vec3 gold = mix(vec3(0.34, 0.44, 0.05), vec3(0.78, 0.52, 0.04), smoothstep(0.3, 0.72, hue));
      gold = mix(gold, vec3(0.86, 0.66, 0.08), uGold * 0.35 * big);
      c = mix(c, gold * lum0, uDry * 0.85);
    }
    ${CALM ? 'c *= 0.9 + uDry * 0.04 + (0.19 - uDry * 0.06) * big;               // телефон: пятна вдвое мягче' : 'c *= 0.8 + uDry * 0.08 + (0.38 - uDry * 0.12) * big;               // осенью пятна светлее, без тёмных провалов'}
    float yel = smoothstep(0.52, 0.82, hue - uDry * 0.25);
    c = mix(c, c * vec3(1.22, 1.03, 0.62), yel * ${CALM ? '0.4' : '0.75'});
    c = mix(c, c * vec3(0.82, 0.98, 0.86), smoothstep(0.45, 0.12, hue) * 0.6 * (1.0 - uDry * 0.7));
    // тень-рельеф: бугры ~25 м, наклон к солнцу (с юго-запада) светлее; градиент — конечной разностью
    if (uLawnQ > 0.5) {
      vec2 hq = q * 0.04;
      float h0 = sNoise(hq), hx = sNoise(hq + vec2(0.06, 0.0)), hz = sNoise(hq + vec2(0.0, 0.06));
      float rel = clamp(dot(vec2(hx - h0, hz - h0) / 0.06, vec2(-0.6, -0.8)), -1.5, 1.5);
      c *= 1.0 + 0.085 * rel;
    }
    // осень (О7, 09.10.2026): газон не ровной жёлтой простынёй — пятна ~10 м: в низинках сыро и темнее (оливковое,
    // бурое), на буграх суше и светлее; где листва гуще (пятна ~12 м, те же, что у листьев ниже) — под листьями
    // рыжая подстилка. Один шум на точку и только осенью
    float aClump = 0.0;
    if (uDry > 0.0) {
      float mid = sNoise(mat2(0.94, -0.34, 0.34, 0.94) * q * 0.095 + 23.0);
      c = mix(c, c * vec3(0.7, 0.68, 0.55), uDry * smoothstep(0.48, 0.82, mid) * 0.9);    // сырое — темнее, бурее
      c = mix(c, c * vec3(1.14, 1.1, 0.9), uDry * smoothstep(0.42, 0.12, mid) * 0.7);     // сухое — светлее
      aClump = smoothstep(0.35, 0.85, sNoise(q * 0.085 + 41.0));
      c = mix(c, vec3(0.62, 0.34, 0.08) * (0.85 + 0.3 * big), uDry * (0.12 + 0.3 * uGold) * aClump * aClump);   // подстилка
    }
    // проплешины 3—8 м, кучками: край — мягкий, пятном (О5, 09.10.2026: до того край шёл клетками по 0,5 м —
    // ступеньками). Сетка шума повёрнута (31° и −50°), у октав по-своему: пятна без углов по осям мира
    float pix = 1.0 - smoothstep(0.35, 0.9, max(fwidth(q.x * 2.0), fwidth(q.y * 2.0)));   // листья и рябь вблизи (ниже)
    vec2 bq = mat2(0.857, 0.515, -0.515, 0.857) * q;
    float clump = sNoise(q * 0.021 + 19.0);    // где проплешин больше (~50 м)
    float bn = sNoise(bq * 0.14 + 5.0) * 0.82 + (uLawnQ > 0.5 ? sNoise(mat2(0.643, -0.766, 0.766, 0.643) * q * 0.5 + 9.0) : 0.5) * 0.18;
    float bTh = 0.84 - clump * 0.1 - uHeat * 0.08 - uDry * 0.02 - uMud * 0.03${CALM ? ' + 0.07' : ''};
    float bald = smoothstep(bTh - 0.012, bTh + 0.05, bn);
    float bt = bn > bTh - 0.05 ? sNoise(q * 0.9 + 2.0) : 0.5;
    vec3 dirt = vec3(0.30, 0.22, 0.13) * (0.86 + 0.24 * bt);
    // осень — не грязь, а светлая сухая трава и опавшие листья вразброс (лист ~0,2 м, свой сдвиг и поворот;
    // вдали — ровный тёплый цвет). До 04.10.2026 листья были клетками сетки — лежали ровными рядами
    if (uDry > 0.0) {
      float lpk, lon = leafAt(q, 0.5, 0.7, 11.0, lpk);
      vec3 lf = lpk < 0.3 ? vec3(0.9, 0.36, 0.03) : lpk < 0.6 ? vec3(0.92, 0.66, 0.06) : vec3(0.72, 0.1, 0.03);
      vec3 straw = vec3(0.74, 0.58, 0.22) * (0.9 + 0.2 * bt);
      straw = mix(straw, lf, lon * pix * (1.0 - uLawnLo));
      dirt = mix(dirt, mix(vec3(0.8, 0.5, 0.12), straw, pix * (1.0 - uLawnLo)), uDry);
    }
    dirt = mix(dirt, vec3(0.13, 0.09, 0.05), uMud * 0.85);                     // весна — мокрая грязь (только весной)
    dirt = mix(dirt, vec3(0.52, 0.42, 0.28) * (0.9 + 0.2 * bt), uHeat * 0.7);  // жара — пыль
    vec3 rim = mix(c, dirt, 0.45);                                              // вытертая трава вокруг
    float near = smoothstep(bTh - 0.05, bTh, bn) * (1.0 - bald);
    c = mix(c, rim, near * 0.6);
    c = mix(c, dirt, bald);
    // осень: по газону яркие листья вразброс — кучками (пятна ~12 м: где-то густо, где-то пусто; золотая осень —
    // гуще), каждый лист со своим сдвигом и поворотом; вдали гаснут, не мерцают
    // у каждого листа — тень на северо-восток (свет с юго-запада, как у рельефа): лист лежит поверх травы, а не
    // нарисован на ней (О7). Тень — тот же лист, сдвинутый на 6 см; вдали гаснет вместе с листьями
    if (uDry > 0.0 && uLawnLo < 0.5) {
      float clump = aClump;
      float dens = (uDry * 0.12 + uGold * 0.16) * (0.15 + 2.2 * clump * clump) * (0.6 + 0.8 * big);
      float lp, lon = leafAt(q, 0.6, dens, 3.0, lp);
      if (pix > 0.0) { float sp, sh = leafAt(q - vec2(0.045, 0.06), 0.6, dens, 3.0, sp); c *= 1.0 - 0.32 * sh * (1.0 - lon) * pix; }
      vec3 lv = lp < 0.4 ? vec3(0.92, 0.4, 0.03) : lp < 0.8 ? vec3(0.95, 0.7, 0.07) : vec3(0.78, 0.12, 0.03);
      c = mix(c, lv, lon * pix);
    }
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

/* Край газона, плиты и тропинки (2г8—2г9, 25.10.2026) — не газон, а то, что рядом. Кладётся перед сезоном (seasons.js
   seasonTint): нарисованная трава осенью желтеет, зимой под снегом, как настоящий газон.
   • тропинки (wastelands.js, цвета-метки): середина — рыжая утоптанная земля, посередине светлее; край — трава с
     проплешинами земли (неровно) — везде, без маски;
   • рядом с камерой (маска meadow.js, ±50 м): трава заходит на край асфальта, плитки, бордюра и тропинки на 10—50 см —
     неровным краем (шум по месту): ровные полосы дорожек кажутся кривыми, у края — темнее (земля);
   • дворовые дорожки и отмостка (цвета-метки yards.js YARD.COLOR, game.js отмостка, world.js PAVE.path): плиты по
     1,15 м поперёк дорожки (направление — из маски), швы, часть плит темнее (просели, сырые) или светлее (новые),
     в части швов — трава. Вдали швы гаснут (не рябят). */
const EDGE_GLSL = `
{
  if (S_LAND) {
    vec3 mc0 = vColor.rgb;
    vec3 mN = normalize(cross(dFdx(vSW), dFdy(vSW)));
    float mup = smoothstep(0.42, 0.8, mN.y);
    float mgr = smoothstep(0.05, 0.18, mc0.g - max(mc0.r, mc0.b));
    if (mup > 0.0 && mgr < 0.5) {
      vec2 q = vSW.xz;
      vec3 c = diffuseColor.rgb;
      float wn = mdNoise(q * 1.7) * 0.55 + mdNoise(q * 4.9 + 3.0) * 0.3 + mdNoise(q * 12.0 + 7.0) * 0.15;
      vec3 grass = vec3(0.30, 0.56, 0.19) * (0.7 + 0.25 * mdNoise(q * 0.7 + 2.0) + 0.2 * wn);   // как газон (#95c579): «бархат» после сезона красит его так же
      vec3 earth = vec3(0.30, 0.16, 0.075) * (0.8 + 0.4 * mdNoise(q * 2.3 + 1.0));
      float isTr = mdTag(mc0, uMdTr0) + mdTag(mc0, uMdTr1) + mdTag(mc0, uMdTr2);
      float isTe = mdTag(mc0, uMdTe);
      float isPath = mdTag(mc0, uMdPy) + mdTag(mc0, uMdPw) + mdTag(mc0, uMdPp);
      if (isTr > 0.5) {
        float mid = mdNoise(q * 0.6 + 11.0);
        c = mix(earth, earth * vec3(1.35, 1.25, 1.1), smoothstep(0.45, 0.8, mid) * 0.7);   // вытоптано до светлого
        float pb = step(0.93, mdHash(floor(q * 9.0)));                                         // камешки
        c = mix(c, vec3(0.42, 0.38, 0.33), pb * (1.0 - smoothstep(0.1, 0.3, fwidth(q.x * 9.0))) * 0.7);
      }
      if (isTe > 0.5) c = mix(grass, earth * 1.08, smoothstep(0.52, 0.64, mdNoise(q * 1.4 + 5.0) * 0.7 + wn * 0.3));
      vec2 muv = (q - uMdWin.xy) * uMdWin.z + 0.5;
      vec2 me = abs(muv - 0.5);
      float mwin = uMdOn * (1.0 - smoothstep(0.40, 0.47, max(me.x, me.y)));
      if (mwin > 0.0) {
        float r = 0.3 * uMdWin.z;
        float l0 = texture2D(uMdMap, muv).r;
        float ln = max(max(texture2D(uMdMap, muv + vec2(r, 0.0)).r, texture2D(uMdMap, muv - vec2(r, 0.0)).r),
                       max(texture2D(uMdMap, muv + vec2(0.0, r)).r, texture2D(uMdMap, muv - vec2(0.0, r)).r));
        ln = max(ln * 0.8, l0);
        if (isPath > 0.5) {
          float aE = texelFetch(uMdMap, min(ivec2(clamp(muv, 0.0, 1.0) * uMdN), ivec2(int(uMdN) - 1)), 0).a;
          if (aE > 0.05) {
            float ang = (aE - 0.1) / 0.85 * 3.14159265;
            vec2 dir = vec2(cos(ang), sin(ang));
            float u = dot(q, dir) / 1.15;
            float k = floor(u), fw = fwidth(u), ks = floor(u + 0.5);                      // плита и ближайший шов
            float vis = (1.0 - smoothstep(0.06, 0.2, fw)) * mwin * (1.0 - smoothstep(0.1, 0.4, uSnow));   // зимой — под снегом
            float an = floor(aE * 300.0);
            float h1 = mdHash(vec2(k, an)), h2 = mdHash(vec2(ks + 17.0, an));          // h2 — шов (тот же жребий у травы meadow.js)
            float tone = h1 < 0.18 ? 0.78 : h1 > 0.82 ? 1.07 : 0.93 + 0.1 * h1;
            c *= mix(1.0, tone, vis);
            c = mix(c, c * vec3(0.86, 0.95, 0.76), (h1 < 0.18 ? 0.55 : 0.0) * vis);                    // просела — сыро, мох
            float e = abs(u - ks) * 1.15;
            float sw = h2 < 0.3 ? 0.055 : 0.018;
            float seam = (1.0 - smoothstep(sw, sw + max(fw * 1.15, 0.012), e)) * vis;
            c *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.1, e)) * vis;                                   // фаска у шва
            c = mix(c, h2 < 0.3 ? grass * (0.7 + 0.5 * mdNoise(q * 8.0)) : c * 0.68, seam * (h2 < 0.3 ? smoothstep(0.3, 0.6, mdNoise(q * 3.0 + ks)) : 1.0));
          }
        }
        float amp = isPath > 0.5 ? 1.15 : isTr + isTe > 0.5 ? 1.25 : 0.85;
        float cr = ln * (0.62 + amp * (wn - 0.5));
        float gk = smoothstep(0.36, 0.44, cr) * mwin;
        float sk = smoothstep(0.24, 0.36, cr) * (1.0 - gk) * mwin;
        c = mix(c, c * vec3(0.72, 0.66, 0.55), sk * 0.6);
        c = mix(c, grass, gk);
      }
      diffuseColor.rgb = c;
    }
  }
}
`;
const EDGE_HEAD = `uniform sampler2D uMdMap; uniform vec3 uMdWin, uMdCover; uniform float uMdOn, uMdN;
uniform vec3 uMdTr0, uMdTr1, uMdTr2, uMdTe, uMdPy, uMdPw, uMdPp;
float mdHash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mdNoise (vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mdHash(i), mdHash(i + vec2(1.0, 0.0)), f.x), mix(mdHash(i + vec2(0.0, 1.0)), mdHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float mdTag (vec3 c, vec3 t) { vec3 d = abs(c - t); return step(max(d.r, max(d.g, d.b)), 0.0022); }
`;
const MDT = { uMdTr0: { value: MD.tagLin(MD.TAGS.trail[0]) }, uMdTr1: { value: MD.tagLin(MD.TAGS.trail[1]) }, uMdTr2: { value: MD.tagLin(MD.TAGS.trail[2]) },
  uMdTe: { value: MD.tagLin(MD.TAGS.trailEdge) }, uMdPy: { value: MD.tagLin(MD.TAGS.yard) }, uMdPw: { value: MD.tagLin(MD.TAGS.walk) }, uMdPp: { value: MD.tagLin(MD.TAGS.path) } };

/* материал земли (LITM): поверх сезонного (seasons.js — vSW, sHash, sNoise,
   uDry, uMud, uHeat уже объявлены) — пятна газона; кладутся до снега и луж */
export function lawnMat (m) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nolawn')) return m;   // ?nolawn — без пятен (сравнить)
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (!/sNoise/.test(sh.fragmentShader) || !/vSW/.test(sh.fragmentShader) || !/uHeat/.test(sh.fragmentShader) || !/leafAt/.test(sh.fragmentShader)) return;   // без сезонного шейдера — как было
    sh.uniforms.uLawnLo = uLawnLo; sh.uniforms.uLawnQ = uLawnQ;
    let f = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + LAWN_GLSL);
    // край газона, плиты, тропинки (2г8—2г9) — перед сезоном; без сезонного вызова или с ?oldgrass — нет
    const at = MD.OLD ? -1 : f.indexOf('diffuseColor.rgb = seasonTint(');
    if (at >= 0) {
      f = f.slice(0, at) + EDGE_GLSL + f.slice(at);
      const end = f.indexOf(';', f.indexOf('diffuseColor.rgb = seasonTint(')) + 1;   // «бархат» — сразу после сезона
      f = f.slice(0, end) + '\n' + VELVET + f.slice(end);
    }
    if (!MD.OLD) Object.assign(sh.uniforms, MD.MU, MDT);
    sh.fragmentShader = 'uniform float uLawnLo;\nuniform float uLawnQ;\n' + (MD.OLD ? '' : EDGE_HEAD) + f;
  };
  m.customProgramCacheKey = () => key + 'lawn' + (MD.OLD ? '' : 'md');
  return m;
}
