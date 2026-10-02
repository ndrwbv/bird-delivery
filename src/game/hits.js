/* Сила удара по человеку (docs/CONTENT.md «Сила удара»). Решает скорость машины
   в момент удара, км/ч — как на спидометре:
     медленнее FALL           — упал и встал: полежал ~2 с, поднялся, грозит кулаком; не «сбит»;
     FALL … BURST             — отлетел и лежит. Во взрослой — в аккуратной тёмной луже, которая
                                медленно растекается; иногда (LIMB) отрывает руку или ногу —
                                она летит отдельно. В детской — лежит со звёздочками, встаёт и уходит;
     BURST и быстрее          — во взрослой разрывает на куски (старый gibHuman), в детской —
                                отлетает дальше и лежит дольше, потом тоже встаёт.
   Самокат при ударе отделяется от самокатчика: кувыркается, скользит и лежит на боку.
   Сколько всего одновременно — CAP: лишнее самое старое тает. */

export const TIER = { FALL: 20, HIGH: 55, BURST: 85 };          // км/ч
export const LIMB = { MID: 0.15, HIGH: 0.4 };                   // шанс оторвать руку/ногу: 20–55 и 55–85 км/ч
export const TIME = {
  FALL_LIE: 1.8,        // упал и встал: сколько лежит
  BODY: 30,             // взрослая: сколько лежит тело (потом тает)
  KID_LIE: 3,           // детская: лежит со звёздочками
  KID_LIE_HIGH: 5,      //   … если быстрее BURST
  WALK: 3,              // встал и уходит — сколько секунд видно
  WRECK: 25,            // самокат лежит
  CHUNK: [25, 40],      // взрослая, «разорвало»: кусок лежит в крови столько секунд…
  SINK: 3,              //   … потом за столько уходит в землю и тает
};
export const CAP = { BODIES: 12, LIMBS: 12, PUDDLES: 10, WRECKS: 8, CHUNKS: 30, SPLATS: 30 };
const PUDDLE_HEX = 0x5a0e16;
const FALL_LIFT = 0.17;   // упал и встал: спина над верхом слоя (толщина модели прохожего)
const UP = { x: 0, y: 1, z: 0 };

let A;
/* api: THREE, scene, box, mergeGeos, HUMAN_VC, groundH, surfaceAt, curbAt, nearestRoad, driftTop, pavedLift, groundNormal,
   emote, puff, pushOut, burst (кусками — старый gibHuman), scare, callAmbulance, Snd, adult */
export function init (api) { A = api; }

/* ── по чему лежать: верх того, что нарисовано в точке ──
   Рельеф (groundH) — только подложка: поверх него лежат полотно, тротуар, бордюр, плитка, а
   зимой — сугробы. Тело, положенное на рельеф, тонуло в асфальте на 15 см, на поднятом тротуаре —
   на 30. Высоты слоёв — те же, что у отрисовки (game.js osmRoads / osmCurbs / мосты). */
export const LAYER = {
  CURB: 0.31,           // поднятый тротуар (0,30) и бордюрный камень (0,31)
  ROAD: 0.185,          // полотно 0,14—0,17, разметка и зебры поверх — 0,2: посередине — над асфальтом
                        //   на 2—4 см, в разметку уходит не глубже 1,5 см
  WALK: 0.095,          // тротуар без бордюра: 0,09 + 0,004 × (7 − класс)
  GREEN: 0.045,         // газон (0,04) и голая земля — на 4 см над ней
};
export function topAt (x, z, prevY) {
  const s = A.surfaceAt(x, z, prevY);                // земля или настил моста
  // ближайшая по краю полотна, а не по оси: широкий проспект рядом с узкой улицей
  let r = A.nearestRoad(x, z, 99, 1);
  const r2 = A.nearestRoad(x, z, 2, 1);
  if (r2 && (!r || r2.d - r2.seg.w / 2 < r.d - r.seg.w / 2)) r = r2;
  const c = r ? r.seg.c : 7, k = (7 - c) * 0.004, hw = r ? r.seg.w / 2 : 0;   // k — главная чуть выше
  let y;
  const sw = r ? r.seg.g || 2.75 : 0;                // ширина плиты тротуара за бордюром (у бульвара — газон)
  // клетки бордюра — метровые и с краёв плиты врут на полметра: за внешним краем (sw) уже трава,
  // ближе края асфальта — асфальт. Бордюры — только у улиц с машинами (класс до 5)
  const curb = A.curbAt(x, z), own = r && r.seg.c <= 5;
  if (own && r.d > 0.01 && r.d >= hw - 0.02 && r.d < hw + sw + 0.03 && (curb || raisedOut(r, x, z, hw, sw))) y = curbTop(r, x, z, hw, sw) - s;
  else if (curb && !own) y = LAYER.CURB;
  else if (r && r.d < hw + 0.2) y = LAYER.ROAD;
  else {
    y = r && r.d < hw + (c <= 5 ? 2.75 : 1) ? LAYER.WALK + k : LAYER.GREEN;
    const p = A.pavedLift ? A.pavedLift(x, z) : -1;   // дорожка, плитка, площадка, парковка (tracks.js)
    if (p + 0.005 > y) y = p + 0.005;
  }
  const d = A.driftTop ? A.driftTop(x, z) : -Infinity;   // сугроб — сверху всего
  return Math.max(s + y, d);
}
/* верх поднятого тротуара. Плита (game.js osmCurbs) — ровные куски по 6 м: поперёк улицы она на
   высоте рельефа своей средней линии (sw/2 за краем асфальта), вдоль — прямая между высотами концов
   куска, поэтому в ложбине середина куска выше рельефа на 5—15 см. Берём рельеф на средней линии и
   добавляем прогиб рельефа на ±3 м вдоль улицы; у края асфальта — ещё бордюрный камень (0,31) */
function chordH (px, pz, ux, uz) {
  const g = A.groundH(px, pz), m = (A.groundH(px - ux * 3, pz - uz * 3) + A.groundH(px + ux * 3, pz + uz * 3)) / 2;
  return m > g ? m : g;
}
function curbTop (r, x, z, hw, sw) {
  const nx = (x - r.x) / r.d, nz = (z - r.z) / r.d, ux = -nz, uz = nx;
  let y = chordH(r.x + nx * (hw + sw / 2), r.z + nz * (hw + sw / 2), ux, uz) + 0.30;
  if (r.d < hw + 0.4) y = Math.max(y, chordH(r.x + nx * (hw + 0.12), r.z + nz * (hw + 0.12), ux, uz) + LAYER.CURB);
  return y + 0.005;
}
/* поднят ли тротуар у этой точки: клетки бордюра (curbAt) метровые и не доходят ни до края
   асфальта (полметра), ни до внешнего края плиты (~0,5 м) — смотрим по нормали к улице и дальше
   от оси, и ближе к ней (ближе — только пока не вышли за плиту: 2,75 м от асфальта) */
const RO = new Float64Array(5);
function raisedOut (r, x, z, hw, sw) {
  const nx = (x - r.x) / r.d, nz = (z - r.z) / r.d, d = r.d;
  RO[0] = hw + 0.6; RO[1] = hw + 1.1; RO[2] = d + 0.5; RO[3] = d - 0.5; RO[4] = d - 0.9;
  for (let i = 0; i < 5; i++) {
    const t = RO[i];
    if (t < hw + 0.4 || t > hw + sw || Math.abs(t - d) > 1.7) continue;
    if (A.curbAt(r.x + nx * t, r.z + nz * t)) return true;
  }
  return false;
}
/* верх слоя под куском: середина и четыре угла его тени (BX) — на краю бордюра не проваливается.
   Куски лежат вдоль оси мира, тень у них плотная; у тела (лежит наискось) — floorUnder */
function topUnder (px, pz, py) {
  if (!BX) return topAt(px, pz, py);
  const cx = (BX.min.x + BX.max.x) / 2, cz = (BX.min.z + BX.max.z) / 2;
  const ex = (BX.max.x - BX.min.x) * 0.45, ez = (BX.max.z - BX.min.z) * 0.45;
  let y = topAt(px, pz, py);
  for (let i = 0; i < 4; i++) { const v = topAt(cx + (i & 1 ? ex : -ex), cz + (i & 2 ? ez : -ez), py); if (v > y) y = v; }
  return y;
}

/* ── «видно, что сбил» ──
   В точке удара — белая звёздочка-«бум» на четверть секунды (поверх всего, даже машины),
   глухой удар в звук; под сбитым — тёмное пятно-тень, по нему тело читается и на снегу, и на
   асфальте. Звёздочек — пул из 4, пятна — общая геометрия и материал. */
const FLASH_T = 0.28, SHADOW_A = 0.5;
const FLASHES = [];
let FLASH_TEX = null, SHADOW_GEO = null, SHADOW_MAT = null, BX = null, V3 = null;
function canvasTex (size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new A.THREE.CanvasTexture(c);
  t.colorSpace = A.THREE.SRGBColorSpace;
  return t;
}
function flashAt (x, y, z) {
  const T = A.THREE;
  if (!FLASH_TEX) {
    FLASH_TEX = canvasTex(64, (g, n) => {
      const star = (r1, r2, k) => {
        g.beginPath();
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * TAU + 0.15, r = i % 2 ? r2 : r1 * (0.8 + 0.2 * ((i * 7) % 3) / 2);
          g.lineTo(n / 2 + Math.cos(a) * r * k, n / 2 + Math.sin(a) * r * k);
        }
        g.closePath();
      };
      g.imageSmoothingEnabled = false;
      star(31, 12, 1); g.fillStyle = '#1b1b22'; g.fill();          // тёмная кайма — видна на снегу
      star(26, 9, 1); g.fillStyle = '#ffffff'; g.fill();
      star(13, 5, 1); g.fillStyle = '#ffe36a'; g.fill();
    });
    FLASH_TEX.magFilter = T.NearestFilter;                           // пиксельный, как вся игра
  }
  let F = FLASHES.find(f => f.t >= FLASH_T);
  if (!F) {
    if (FLASHES.length >= 4) F = FLASHES[0];
    else {
      const mat = new T.SpriteMaterial({ map: FLASH_TEX, transparent: true, depthTest: false, depthWrite: false });
      const s = new T.Sprite(mat); s.renderOrder = 999; s.visible = false;
      A.scene.add(s);
      F = { s, mat, t: FLASH_T, rot: 0 };
      FLASHES.push(F);
    }
  }
  F.t = 0; F.rot = rand(-0.6, 0.6);
  F.s.position.set(x, y, z); F.s.visible = true;
  F.mat.rotation = F.rot; F.mat.opacity = 1;
}
function stepFlashes (dt) {
  for (const F of FLASHES) {
    if (F.t >= FLASH_T) continue;
    F.t += dt;
    const k = Math.min(1, F.t / FLASH_T);
    F.s.scale.setScalar(0.9 + 1.5 * Math.sqrt(k));
    F.mat.opacity = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    if (F.t >= FLASH_T) F.s.visible = false;
  }
}
function shadowFor () {
  const T = A.THREE;
  if (!SHADOW_GEO) {
    SHADOW_GEO = new T.PlaneGeometry(2, 2);
    const tex = canvasTex(32, (g, n) => {
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    });
    SHADOW_MAT = new T.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: SHADOW_A, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  const m = new T.Mesh(SHADOW_GEO, SHADOW_MAT);
  m.rotation.order = 'YXZ';
  m.renderOrder = 1;
  A.scene.add(m);
  return m;
}

/* самая низкая точка тела (по вершинам, без новых объектов) и подъём, чтобы она легла на верх
   слоя: смотрим под серединой и под обоими концами — на краю бордюра тело не проваливается */
function lowest (o) {
  if (!BX) { BX = new A.THREE.Box3(); V3 = new A.THREE.Vector3(); }   // самокат (wreck) мог упасть раньше первого тела
  BX.makeEmpty();
  o.traverseVisible(LOW);
  return BX.isEmpty() ? o.position.y : BX.min.y;
}
const LOW = m => { if (m.isMesh && m.geometry && m.geometry.attributes.position) BX.expandByObject(m, true); };
function floorUnder (r, s) {
  const ax = Math.sin(r.rotation.y) * 0.4 * s, az = Math.cos(r.rotation.y) * 0.4 * s, py = r.position.y;
  const x = r.position.x, z = r.position.z;
  let y = topAt(x, z, py);
  for (let k = -2; k <= 2; k++) { if (!k) continue; const v = topAt(x + ax * k, z + az * k, py); if (v > y) y = v; }   // вдоль тела, через 40 см
  return y;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const TAU = Math.PI * 2;

export const kmhOf = (vx, vz) => Math.hypot(vx, vz) * 3.6;
export const isFall = kmh => kmh < TIER.FALL;

const BODIES = [], LIMBS = [], PUDDLES = [], WRECKS = [], CHUNKS = [], SPLATS = [];
export const STATS = { BODIES, LIMBS, PUDDLES, WRECKS, CHUNKS, SPLATS };

/* ── упал и встал: живой человек из PEOPLE, его же модель ── */
export function fall (p, vx, vz) {
  const l = Math.hypot(vx, vz) || 1;
  p.fall = { t: 0, yaw: Math.atan2(-vx, -vz), vx: vx / l * 2.6, vz: vz / l * 2.6, mad: 0 };
  A.Snd.noise(0.12, 0.2);
  A.puff(p.x, 0.3, p.z, false, 0.5);
}

/* на сколько поднять лежащего прохожего, чтобы самая низкая его точка легла на 1 см над слоем:
   один раз примеряем позу «лёг» и меряем видимые куски модели (у прохожих свои размеры) */
function fallLift (g) {
  const u = g.userData;
  if (!BX) { BX = new A.THREE.Box3(); V3 = new A.THREE.Vector3(); }
  const rx = g.rotation.x, ry = g.rotation.y, rz = g.rotation.z, y0 = g.position.y, ro = g.rotation.order;
  const keep = [u.legL, u.legR, u.armL, u.armR].map(m => m ? m.rotation.x : 0);
  g.rotation.order = 'YXZ'; g.rotation.set(-Math.PI / 2, ry, 0); g.position.y = 0;
  if (u.legL) u.legL.rotation.x = 0.25; if (u.legR) u.legR.rotation.x = -0.15;
  if (u.armL) u.armL.rotation.x = -2.6; if (u.armR) u.armR.rotation.x = -2.2;
  g.updateMatrixWorld(true);
  BX.makeEmpty();
  // по кускам с шарнирами (а не по дальнему мешу-«статуе»): он поднимается выше, а не тонет
  for (const m of u.parts || []) if (m) BX.expandByObject(m, true);
  if (BX.isEmpty()) g.traverseVisible(m => { if (m.isMesh && m.geometry && m.geometry.attributes.position) BX.expandByObject(m, true); });
  const lo = BX.isEmpty() ? -FALL_LIFT : BX.min.y;
  [u.legL, u.legR, u.armL, u.armR].forEach((m, i) => { if (m) m.rotation.x = keep[i]; });
  g.rotation.order = ro; g.rotation.set(rx, ry, rz); g.position.y = y0;
  return clamp(0.01 - lo, 0, 0.6);
}

/* шаг «упал и встал»; true — ещё лежит/встаёт (остальную логику человека пропускаем) */
export function fallStep (p, dt) {
  const F = p.fall, g = p.grp, u = g.userData;
  const t = (F.t += dt);
  const T1 = 0.35, T2 = T1 + TIME.FALL_LIE, T3 = T2 + 0.6, T4 = T3 + 1.1;
  if (t < T1 + 0.3) {                              // по инерции проезжает по асфальту
    const k = 1 - t / (T1 + 0.3);
    p.x += F.vx * k * dt; p.z += F.vz * k * dt;
    A.pushOut(p, 0.45);
  }
  const a = t < T1 ? ease(t / T1) : t < T2 ? 1 : t < T3 ? 1 - ease((t - T2) / (T3 - T2)) : 0;
  g.rotation.order = 'YXZ';
  g.rotation.set(-Math.PI / 2 * a, F.yaw, 0);     // на спину, головой туда, куда толкнули
  // стоит — как все прохожие (рельеф + бордюр), лёг — на верх асфальта/плитки/сугроба
  const base = A.groundH(p.x, p.z) + A.curbAt(p.x, p.z);
  if (t < T1 + 0.3 || F.top === undefined) F.top = topAt(p.x, p.z);
  if (F.lift === undefined) F.lift = fallLift(g);
  g.position.set(p.x, base + (F.top - base + F.lift) * a, p.z);
  u.legL.rotation.x = 0.25 * a; u.legR.rotation.x = -0.15 * a;
  u.armL.rotation.x = -2.6 * a; u.armR.rotation.x = -2.2 * a;
  if (t >= T3) {                                   // встал — грозит кулаком
    if (!F.mad) { F.mad = 1; A.emote(p.x, 2.1, p.z, 'angry', 3); }
    u.armL.rotation.x = 0;
    u.armR.rotation.x = -2.7 + Math.sin(t * 24) * 0.35;
  }
  if (t < T4) return true;
  g.rotation.set(0, F.yaw, 0); g.rotation.order = 'XYZ';
  u.armL.rotation.x = 0; u.armR.rotation.x = 0; u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  p.fall = null;
  return false;
}

/* ── сбит: отлетает. p — { x, z, grp } (grp — модель из makeHuman, её прячет вызывающий).
   o.up — встанет и уйдёт в любой версии (самокатчик на малой скорости), без скорой и счёта.
   o.y0 — с какой высоты летит (самокатчик стоит на деке). Возвращает true — «сбит» (считать). */
export function hit (p, vx, vz, kmh, o = {}) {
  if (kmh == null) kmh = kmhOf(vx, vz);
  if (!o.up) {                                      // сбит: «бум» в точке удара и глухой удар
    flashAt(p.x, A.groundH(p.x, p.z) + 1.1 + (o.y0 || 0), p.z);
    A.Snd.blip(62, 0.2, 'sine', 0.34); A.Snd.noise(0.08, 0.16);
  }
  if (A.adult && kmh >= TIER.BURST && !o.up) { A.burst(p, vx, vz); return true; }
  const up = o.up || !A.adult;
  const lie = o.up ? TIME.FALL_LIE : !A.adult ? (kmh >= TIER.BURST ? TIME.KID_LIE_HIGH : TIME.KID_LIE) : TIME.BODY;
  const B = throwBody(p, vx, vz, kmh, up, lie, o.y0 || 0);
  if (A.adult && !o.up && kmh >= TIER.FALL && Math.random() < (kmh >= TIER.HIGH ? LIMB.HIGH : LIMB.MID)) tearLimb(B);
  if (!o.up) { A.scare(p.x, p.z); A.callAmbulance(p.x, p.z); }
  return !o.up;
}

function part (list, x, y, z) {
  const m = new A.THREE.Mesh(A.mergeGeos(list), A.HUMAN_VC);
  m.position.set(x, y, z);
  return m;
}

/* тело из шести кусков с шарнирами: таз — центр вращения, ноги и руки качаются */
function buildBody (c) {
  const T = A.THREE, box = A.box;
  const root = new T.Group(), L = [];
  const leg = x => { const l = []; box(l, 0.16, 0.7, 0.16, c.pants, 0, -0.35, 0); return part(l, x, -0.25, 0); };
  const arm = x => { const l = []; box(l, 0.13, 0.55, 0.13, c.shirt, 0, -0.27, 0); box(l, 0.12, 0.1, 0.12, c.skin, 0, -0.58, 0); return part(l, x, 0.57, 0); };
  const tl = []; box(tl, 0.44, 0.6, 0.26, c.shirt, 0, 0, 0);
  const hl = []; box(hl, 0.5, 0.5, 0.3, c.skin, 0, 0, 0); if (c.hair) box(hl, 0.54, 0.14, 0.34, c.hair, 0, 0.28, 0);
  const parts = { legL: leg(-0.12), legR: leg(0.12), torso: part(tl, 0, 0.05, 0), armL: arm(-0.3), armR: arm(0.3), head: part(hl, 0, 0.63, 0) };
  for (const k in parts) { root.add(parts[k]); L.push(parts[k]); }
  root.rotation.order = 'YXZ';
  return { root, parts };
}

function throwBody (p, vx, vz, kmh, up, lie, y0) {
  const c = (p.grp && p.grp.userData.colors) || { skin: '#e0b48c', shirt: '#4a6fa5', pants: '#333' };
  const { root, parts } = buildBody(c);
  const s = (p.grp && p.grp.scale.x) || 1;
  root.scale.setScalar(s);
  const fl = A.groundH(p.x, p.z) + A.curbAt(p.x, p.z);
  root.position.set(p.x, fl + (0.95 + y0) * s, p.z);
  const l = Math.hypot(vx, vz) || 1;
  root.rotation.y = Math.atan2(vx / l, vz / l);     // +Z — куда толкнули
  A.scene.add(root);
  if (!BX) { BX = new A.THREE.Box3(); V3 = new A.THREE.Vector3(); }
  const k = clamp(kmh / 50, 0.35, 1.6);
  const B = {
    root, parts, s, t: 0, mode: 'fly', up, lie, life: lie, shadow: shadowFor(), floor: fl, settle: 0,
    vx: vx * 0.42 + rand(-1.5, 1.5), vy: clamp(2.5 + kmh / 18, 3, 9), vz: vz * 0.42 + rand(-1.5, 1.5),
    spin: rand(5, 9) * k * (Math.random() < 0.5 ? -1 : 1), roll: rand(-3, 3) * k, landed: 0, puddle: null, starT: 0, wx: 0, wz: 0,
  };
  BODIES.push(B);
  if (BODIES.length > CAP.BODIES) for (const q of BODIES) if (q.mode !== 'gone') { fadeBody(q); break; }
  return B;
}

function fadeBody (B) { if (B.mode !== 'fade') { B.mode = 'fade'; B.t = 0; } }

/* оторвать руку или ногу: летит своим кусочком, где упала — маленькая лужица */
function tearLimb (B) {
  const keys = ['armL', 'armR', 'legL', 'legR'];
  const k = keys[Math.floor(Math.random() * 4)];
  const m = B.parts[k];
  B.root.updateMatrixWorld(true);
  A.scene.attach(m);
  B.parts[k] = null;
  LIMBS.push({ m, vx: B.vx * 1.2 + rand(-3, 3), vy: B.vy + rand(0.5, 2.5), vz: B.vz * 1.2 + rand(-3, 3),
    spin: rand(-14, 14), rest: 0, life: TIME.BODY, puddle: null, s: m.scale.x });
  if (LIMBS.length > CAP.LIMBS) { const q = LIMBS.find(q => q.life > 1); if (q) q.life = 1; }
}

/* высота лужи: середина и четыре точки на 0,6 радиуса — по большинству (медиана). Лужа у края
   тротуара не висит над асфальтом, а уходит под плиту — будто стекает с бордюра */
const PY = [0, 0, 0, 0, 0];
function puddleY (x, z, R) {
  const o = R * 0.6;
  PY[0] = topAt(x, z); PY[1] = topAt(x + o, z); PY[2] = topAt(x - o, z); PY[3] = topAt(x, z + o); PY[4] = topAt(x, z - o);
  PY.sort((a, b) => a - b);
  return PY[2];
}

/* лужа: тёмно-красный круг под телом, растёт до R за несколько секунд */
let PUD_GEO = null;
function puddle (x, z, R) {
  const T = A.THREE;
  if (!PUD_GEO) PUD_GEO = new T.CircleGeometry(1, 18);
  const mat = new T.MeshBasicMaterial({ color: PUDDLE_HEX, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new T.Mesh(PUD_GEO, mat);
  // на верх слоя (асфальт, тротуар, сугроб), чуть выше — без мерцания; на мосту и сугробе — плоско
  const y = puddleY(x, z, R), g = A.groundH(x, z), flat = y - g > LAYER.CURB + 0.05;
  const nrm = flat ? UP : A.groundNormal(x, z), lift = 0.025 + PUDDLES.length * 0.003;
  m.position.set(x + nrm.x * lift, y + nrm.y * lift, z + nrm.z * lift);
  m.lookAt(m.position.x + nrm.x, m.position.y + nrm.y, m.position.z + nrm.z);
  m.scale.set(0.01, 0.01, 1);
  A.scene.add(m);
  const P = { m, mat, t: 0, R, sx: rand(0.85, 1.15), sy: rand(0.85, 1.15), fade: 0 };
  PUDDLES.push(P);
  let live = PUDDLES.filter(q => !q.fade).length;
  for (const q of PUDDLES) { if (live <= CAP.PUDDLES) break; if (!q.fade) { q.fade = 1; live--; } }
  return P;
}

/* ── взрослая, быстрее TIER.BURST: разрывает на куски ──
   Голова, туловище, руки, ноги и пара ошмётков разлетаются, кувыркаются, ложатся плашмя на верх
   асфальта/тротуара/сугроба. Рваные края и пятна на кусках — красные; под каждым растекается своя
   лужица. Лежат TIME.CHUNK, потом за TIME.SINK уходят в землю и тают. Больше CAP.CHUNKS кусков
   (CAP.SPLATS лужиц) — самые старые начинают таять раньше. */
const BLOOD = '#8f1f2b', BLOOD_D = '#5e0f18', MEAT = '#a3222c';
export function burst (p, vx, vz) {
  const box = A.box;
  const c = (p.grp && p.grp.userData.colors) || { skin: '#e0b48c', shirt: '#4a6fa5', pants: '#333' };
  const hair = c.hair;
  const sm = (l, w, h, d, y) => box(l, w * 1.06, 0.07, d * 1.06, BLOOD, 0, y, 0);          // рваный край
  const smear = (l, w, h, d) => box(l, w * 0.7, h * 0.45, 0.02, BLOOD_D, w * 0.08, h * rand(-0.15, 0.15), d / 2 + 0.006);
  const kinds = [
    l => { box(l, 0.3, 0.32, 0.28, c.skin, 0, 0, 0); if (hair) box(l, 0.32, 0.1, 0.3, hair, 0, 0.15, 0); sm(l, 0.3, 0.32, 0.28, -0.16); },
    l => { box(l, 0.44, 0.6, 0.26, c.shirt, 0, 0, 0); sm(l, 0.44, 0.6, 0.26, 0.3); sm(l, 0.44, 0.6, 0.26, -0.3); smear(l, 0.44, 0.6, 0.26); },
    l => { box(l, 0.13, 0.45, 0.13, c.shirt, 0, 0.05, 0); box(l, 0.12, 0.1, 0.12, c.skin, 0, -0.22, 0); sm(l, 0.13, 0.45, 0.13, 0.27); },
    l => { box(l, 0.13, 0.45, 0.13, c.shirt, 0, 0.05, 0); box(l, 0.12, 0.1, 0.12, c.skin, 0, -0.22, 0); sm(l, 0.13, 0.45, 0.13, 0.27); },
    l => { box(l, 0.16, 0.7, 0.16, c.pants, 0, 0, 0); sm(l, 0.16, 0.7, 0.16, 0.35); smear(l, 0.16, 0.7, 0.16); },
    l => { box(l, 0.16, 0.7, 0.16, c.pants, 0, 0, 0); sm(l, 0.16, 0.7, 0.16, 0.35); },
    l => box(l, 0.16, 0.12, 0.14, MEAT, 0, 0, 0),
    l => box(l, 0.12, 0.1, 0.18, BLOOD, 0, 0, 0),
  ];
  const fl = topAt(p.x, p.z);
  if (!BX) { BX = new A.THREE.Box3(); V3 = new A.THREE.Vector3(); }
  for (let i = 0; i < kinds.length; i++) {
    const l = []; kinds[i](l);
    const m = part(l, p.x + rand(-0.25, 0.25), fl + rand(0.6, 1.4), p.z + rand(-0.25, 0.25));
    m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    A.scene.add(m);
    const long = i >= 1 && i <= 5;                  // туловище, руки, ноги — ложатся вдоль земли
    CHUNKS.push({ m, vx: vx * 0.3 + rand(-5, 5), vy: rand(3, 8), vz: vz * 0.3 + rand(-5, 5), spin: rand(-12, 12),
      rest: 0, long, life: rand(TIME.CHUNK[0], TIME.CHUNK[1]) + TIME.SINK, splat: null, R: i === 1 ? rand(0.55, 0.75) : i >= 6 ? rand(0.18, 0.28) : rand(0.3, 0.45) });
  }
  let over = CHUNKS.length - CAP.CHUNKS;
  for (const q of CHUNKS) { if (over <= 0) break; if (q.life > TIME.SINK) { q.life = TIME.SINK; over--; } }
}
/* лужица под куском: общий круг, свой материал (тает своим темпом) */
function splat (x, z, R) {
  const T = A.THREE;
  if (!PUD_GEO) PUD_GEO = new T.CircleGeometry(1, 18);
  const mat = new T.MeshBasicMaterial({ color: PUDDLE_HEX, transparent: true, opacity: 0.9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new T.Mesh(PUD_GEO, mat);
  const y = puddleY(x, z, R), flat = y - A.groundH(x, z) > LAYER.CURB + 0.05;
  const nrm = flat ? UP : A.groundNormal(x, z), lift = 0.022 + SPLATS.length * 0.0015;
  m.position.set(x + nrm.x * lift, y + nrm.y * lift, z + nrm.z * lift);
  m.lookAt(m.position.x + nrm.x, m.position.y + nrm.y, m.position.z + nrm.z);
  m.scale.set(0.01, 0.01, 1);
  A.scene.add(m);
  const S = { m, mat, t: 0, R, sx: rand(0.8, 1.25), sy: rand(0.8, 1.25), fade: 0 };
  SPLATS.push(S);
  let live = SPLATS.filter(q => !q.fade).length;
  for (const q of SPLATS) { if (live <= CAP.SPLATS) break; if (!q.fade) { q.fade = 1; live--; } }
  return S;
}
function stepChunks (dt) {
  for (let i = CHUNKS.length - 1; i >= 0; i--) {
    const C = CHUNKS[i], m = C.m;
    if (!C.rest) {
      C.vy -= 19 * dt;
      m.position.x += C.vx * dt; m.position.y += C.vy * dt; m.position.z += C.vz * dt;
      m.rotation.x += C.spin * dt; m.rotation.z += C.spin * 0.6 * dt;
      const g0 = A.groundH(m.position.x, m.position.z), near = m.position.y < g0 + 1.4;
      const fl = near ? topAt(m.position.x, m.position.z, m.position.y) : g0;
      const lo = near ? (m.updateMatrixWorld(true), lowest(m)) : Infinity;
      if (lo < fl + 0.01) {
        m.position.y += fl + 0.01 - lo;
        C.vy = C.vy < 0 ? -C.vy * 0.28 : C.vy; C.vx *= 0.55; C.vz *= 0.55; C.spin *= 0.5;
        if (Math.hypot(C.vx, C.vz) < 0.6 && Math.abs(C.vy) < 0.9) {
          C.rest = 1;
          m.rotation.set(C.long ? Math.PI / 2 : 0, m.rotation.y, C.long ? 0 : nearest(m.rotation.z, Math.PI / 2, 0));
          m.updateMatrixWorld(true);
          const lo = lowest(m), f2 = topUnder(m.position.x, m.position.z, m.position.y);
          m.position.y += f2 + 0.01 - lo;             // плашмя на верх слоя (с краёв — тоже)
          C.y = m.position.y;
          C.splat = splat(m.position.x, m.position.z, C.R);
        }
      }
    }
    C.life -= dt;
    if (C.life < TIME.SINK) {                         // уходит в землю и тает
      const k = Math.max(0, C.life / TIME.SINK);
      if (C.rest) m.position.y = C.y - (1 - k) * 0.2;
      m.scale.setScalar(Math.max(0.001, 0.25 + 0.75 * k));
      if (C.splat && !C.splat.fade) C.splat.fade = 1;
    }
    if (C.life <= 0) { dispose(m); CHUNKS.splice(i, 1); }
  }
  for (let i = SPLATS.length - 1; i >= 0; i--) {
    const S = SPLATS[i];
    S.t += dt;
    const r = Math.max(0.02, S.R * (1 - Math.exp(-S.t / 2.5)));
    S.m.scale.set(r * S.sx, r * S.sy, 1);
    if (S.fade) {
      S.mat.opacity -= dt * 0.3;                      // ~3 с, вместе с куском
      if (S.mat.opacity <= 0) { A.scene.remove(S.m); S.mat.dispose(); SPLATS.splice(i, 1); }
    }
  }
}

/* ── самокат отдельно: sc — группа самоката из makeScooter, отрываем от человека ── */
export function wreck (sc, vx, vz) {
  // мировое положение собираем сами: модель вдали могла не обновлять матрицы
  const g = sc.parent;
  g.updateMatrix(); sc.updateMatrix();
  const M = new A.THREE.Matrix4().multiplyMatrices(g.matrix, sc.matrix);
  g.remove(sc); A.scene.add(sc);
  M.decompose(sc.position, sc.quaternion, sc.scale);
  sc.matrixAutoUpdate = true;
  sc.rotation.reorder('YXZ');
  const W = { o: sc, vx: vx * 0.55 + rand(-2, 2), vy: rand(2.5, 4.5), vz: vz * 0.55 + rand(-2, 2),
    spinY: rand(-9, 9), spinX: rand(-7, 7), side: Math.random() < 0.5 ? -1 : 1, landed: 0, life: TIME.WRECK, s: sc.scale.x };
  WRECKS.push(W);
  if (WRECKS.length > CAP.WRECKS) { const q = WRECKS.find(q => q.life > 1); if (q) q.life = 1; }
}

function nearest (a, step, off) { return Math.round((a - off) / step) * step + off; }

function dispose (o) {
  A.scene.remove(o);
  o.traverse(m => {
    if (!m.isMesh) return;
    if (m.geometry !== PUD_GEO) m.geometry.dispose();
    if (m.material !== A.HUMAN_VC) m.material.dispose();
  });
}

/* поза «лежит»: руки-ноги в плоскости тела (поворот x — 0 или π, разброс — по z), чтобы
   ничего не уходило в землю, лицом вниз или вверх — всё равно */
function lieTargets (B) {
  const up = Math.random() < 0.5;
  B.pose = {
    armL: [up ? -Math.PI : 0, -rand(0.3, 1.3)], armR: [Math.random() < 0.5 ? -Math.PI : 0, rand(0.3, 1.3)],
    legL: [0, -rand(0.05, 0.35)], legR: [0, rand(0.05, 0.35)],
  };
}
function poseLimbs (B, dt, k) {
  const P = B.parts;
  for (const n in B.pose) {
    const m = P[n]; if (!m) continue;
    const [tx, tz] = B.pose[n];
    // ближайший к текущему вид того же угла: в полёте руки накрутили обороты
    const x0 = m.rotation.x, tx2 = tx + Math.round((x0 - tx) / TAU) * TAU;
    m.rotation.x = damp(x0, tx2, k, dt); m.rotation.z = damp(m.rotation.z, tz, k, dt);
  }
}
/* поставить тело на верх слоя: самая низкая вершина — на 1 см над ним */
function rest (B, again) {
  const r = B.root;
  r.updateMatrixWorld(true);
  const lo = lowest(r);
  if (!again) B.floor = floorUnder(r, B.s);         // где лёг — считаем раз, дальше только поза
  r.position.y += B.floor + 0.01 - lo;
}
/* тень-пятно под телом: по оси тела, в полёте — меньше и бледнее */
function placeShadow (B, fade) {
  const m = B.shadow, r = B.root;
  if (!m) return;
  const h = Math.max(0, r.position.y - B.floor), k = clamp(1 - h / 3, 0.35, 1) * fade * B.s;
  m.position.set(r.position.x, B.floor + 0.02, r.position.z);
  m.rotation.set(-Math.PI / 2, r.rotation.y, 0);
  m.scale.set(0.5 * k, 1.05 * k, 1);
}

function stepBody (B, dt) {
  const r = B.root, P = B.parts;
  B.t += dt;
  if (B.mode === 'fly') {
    B.vy -= 19 * dt;
    r.position.x += B.vx * dt; r.position.y += B.vy * dt; r.position.z += B.vz * dt;
    const g0 = A.groundH(r.position.x, r.position.z);
    B.floor = r.position.y < g0 + 2.2 * B.s ? topAt(r.position.x, r.position.z, r.position.y) : g0;   // высоко — слой не нужен
    if (!B.landed) {
      r.rotation.x += B.spin * dt; r.rotation.z += B.roll * dt;
      const w = Math.sin(B.t * 16);                  // руками-ногами машет в полёте
      if (P.armL) P.armL.rotation.x = -1.6 + w * 1.2;
      if (P.armR) P.armR.rotation.x = -1.6 - w * 1.2;
      if (P.legL) P.legL.rotation.x = w * 0.8;
      if (P.legR) P.legR.rotation.x = -w * 0.8;
    } else {
      // лёг: на спину или лицом вниз — что ближе
      r.rotation.x = damp(r.rotation.x, B.lx, 10, dt); r.rotation.z = damp(r.rotation.z, B.lz, 10, dt);
      poseLimbs(B, dt, 8);
    }
    // касание — самой низкой точкой, а не серединой: иначе голова и руки уходили в асфальт
    const lo = r.position.y < B.floor + 1.6 * B.s ? (r.updateMatrixWorld(true), lowest(r)) : Infinity;
    if (lo < B.floor + 0.01) {
      r.position.y += B.floor + 0.01 - lo;
      if (!B.landed) { B.landed = 1; B.lx = nearest(r.rotation.x, Math.PI, Math.PI / 2); B.lz = nearest(r.rotation.z, TAU, 0); lieTargets(B); }
      B.vy = B.vy < 0 ? -B.vy * 0.25 : B.vy; B.vx *= 0.55; B.vz *= 0.55;
      if (Math.hypot(B.vx, B.vz) < 0.7 && Math.abs(B.vy) < 0.9) {
        B.mode = 'lie'; B.t = 0;
        rest(B);
        if (A.adult && !B.up) B.puddle = puddle(r.position.x, r.position.z, rand(1.1, 1.5) * B.s);
      }
    }
    placeShadow(B, 1);
    return;
  }
  if (B.mode === 'lie') {
    if (B.t < 1.5) {                                 // доворачивается и укладывает руки — держим на поверхности
      r.rotation.x = damp(r.rotation.x, B.lx, 10, dt); r.rotation.z = damp(r.rotation.z, B.lz, 10, dt);
      poseLimbs(B, dt, 6);
      rest(B, true);
      placeShadow(B, 1);
    }
    if (B.up && (B.starT -= dt) <= 0) { B.starT = 0.7; A.emote(r.position.x, B.floor - A.groundH(r.position.x, r.position.z) + 0.75, r.position.z, 'star', 1); }
    if (B.t >= B.lie) {
      if (B.up) { B.mode = 'rise'; B.t = 0; B.x0 = r.rotation.x - nearest(r.rotation.x, TAU, 0); B.lz = r.rotation.z - nearest(r.rotation.z, TAU, 0); B.y0 = r.position.y; }
      else fadeBody(B);
    }
    return;
  }
  if (B.mode === 'rise') {
    const fl = A.groundH(r.position.x, r.position.z) + A.curbAt(r.position.x, r.position.z);
    const k = ease(Math.min(1, B.t / 0.7));
    r.rotation.x = B.x0 * (1 - k); r.rotation.z = B.lz * (1 - k);
    r.position.y = B.y0 + (fl + 0.95 * B.s - B.y0) * k;
    for (const n of ['armL', 'armR', 'legL', 'legR']) if (P[n]) { P[n].rotation.x *= 1 - k; P[n].rotation.z *= 1 - k; }
    placeShadow(B, 1 - k);
    if (B.t >= 0.7) {
      B.mode = 'walk'; B.t = 0;
      if (B.shadow) B.shadow.visible = false;
      const a = r.rotation.y + rand(-1.2, 1.2);    // уходит примерно туда, куда отлетел
      B.wx = Math.sin(a); B.wz = Math.cos(a);
      r.rotation.y = a;
      for (const n of ['armL', 'armR', 'legL', 'legR']) if (P[n]) P[n].rotation.z = 0;
      if (B.lie === TIME.FALL_LIE) A.emote(r.position.x, 2.1, r.position.z, 'angry', 3);
    }
    return;
  }
  if (B.mode === 'walk') {
    const fl = A.groundH(r.position.x, r.position.z) + A.curbAt(r.position.x, r.position.z);
    const ph = B.t * 7;
    r.position.x += B.wx * 1.4 * dt; r.position.z += B.wz * 1.4 * dt;
    r.position.y = fl + (0.95 + Math.abs(Math.sin(ph)) * 0.04) * B.s;
    r.rotation.z = A.adult ? 0 : Math.sin(B.t * 3) * 0.12;   // в детской ещё пошатывается
    const sw = Math.sin(ph) * 0.8;
    if (P.legL) P.legL.rotation.x = sw;
    if (P.legR) P.legR.rotation.x = -sw;
    if (P.armL) P.armL.rotation.x = -sw * 0.7;
    if (P.armR) P.armR.rotation.x = sw * 0.7;
    if (B.t >= TIME.WALK) { A.puff(r.position.x, 0.6, r.position.z, false, 0.9); B.mode = 'gone'; }
    return;
  }
  if (B.mode === 'fade') {
    const k = Math.max(0.001, 1 - B.t);
    r.scale.setScalar(B.s * k);
    if (B.shadow) B.shadow.scale.set(0.5 * B.s * k, 1.05 * B.s * k, 1);
    if (B.t >= 1) B.mode = 'gone';
  }
}

export function update (dt) {
  for (let i = BODIES.length - 1; i >= 0; i--) {
    const B = BODIES[i];
    stepBody(B, dt);
    if (B.mode === 'gone') {
      if (B.puddle) B.puddle.fade = 1;
      if (B.shadow) A.scene.remove(B.shadow);
      dispose(B.root); BODIES.splice(i, 1);
    }
  }
  for (let i = LIMBS.length - 1; i >= 0; i--) {
    const L = LIMBS[i], m = L.m;
    if (!L.rest) {
      L.vy -= 19 * dt;
      m.position.x += L.vx * dt; m.position.y += L.vy * dt; m.position.z += L.vz * dt;
      m.rotation.x += L.spin * dt; m.rotation.z += L.spin * 0.6 * dt;
      const g0 = A.groundH(m.position.x, m.position.z);
      const fl = m.position.y < g0 + 1 ? topAt(m.position.x, m.position.z, m.position.y) : g0;
      if (m.position.y < fl + 0.12) {
        m.position.y = fl + 0.12;
        L.vy *= -0.3; L.vx *= 0.5; L.vz *= 0.5; L.spin *= 0.5;
        if (Math.hypot(L.vx, L.vz) < 0.6 && Math.abs(L.vy) < 0.8) {
          L.rest = 1;
          m.rotation.set(Math.PI / 2, m.rotation.y, 0);
          m.updateMatrixWorld(true);
          const lo = lowest(m), f2 = topUnder(m.position.x, m.position.z, m.position.y);
          m.position.y += f2 + 0.01 - lo;                    // плашмя на верх асфальта/плитки (с краёв — тоже)
          // шарнир на конце куска: центр лужицы — середина руки/ноги
          L.puddle = puddle(m.position.x, m.position.z + 0.3, 0.45);
        }
      }
    }
    L.life -= dt;
    if (L.life < 1) m.scale.setScalar(L.s * Math.max(0.001, L.life));
    if (L.life <= 0) { if (L.puddle) L.puddle.fade = 1; dispose(m); LIMBS.splice(i, 1); }
  }
  for (let i = PUDDLES.length - 1; i >= 0; i--) {
    const P = PUDDLES[i];
    P.t += dt;
    const r = Math.max(0.02, P.R * (1 - Math.exp(-P.t / 3.5)));     // растекается секунд 10
    P.m.scale.set(r * P.sx, r * P.sy, 1);
    if (P.fade) {
      P.mat.opacity -= dt * 0.6;
      if (P.mat.opacity <= 0) { A.scene.remove(P.m); P.mat.dispose(); PUDDLES.splice(i, 1); }
    }
  }
  for (let i = WRECKS.length - 1; i >= 0; i--) {
    const W = WRECKS[i], o = W.o;
    W.life -= dt;
    if (W.life < 1) o.scale.setScalar(W.s * Math.max(0.001, W.life));
    if (W.life <= 0) { dispose(o); WRECKS.splice(i, 1); continue; }
    if (W.done) continue;                                      // улёгся — больше не считаем
    W.vy -= 19 * dt;
    o.position.x += W.vx * dt; o.position.y += W.vy * dt; o.position.z += W.vz * dt;
    o.rotation.y += W.spinY * dt;
    const g0 = A.groundH(o.position.x, o.position.z);
    const fl = o.position.y < g0 + 2 ? topAt(o.position.x, o.position.z, o.position.y) : g0;
    if (!W.landed) { o.rotation.x += W.spinX * dt; o.rotation.z += W.side * 6 * dt; }
    else {
      // лежит на боку и скользит, пока не остановится
      o.rotation.x = damp(o.rotation.x, nearest(o.rotation.x, TAU, 0), 8, dt);
      o.rotation.z = damp(o.rotation.z, W.lz, 8, dt);
      const f = Math.exp(-2.6 * dt);
      W.vx *= f; W.vz *= f; W.spinY *= Math.exp(-3 * dt);
    }
    // касание — самой низкой точкой самоката (руль, колесо), а не его серединой
    const lo = o.position.y < fl + 1.5 ? (o.updateMatrixWorld(true), lowest(o)) : Infinity;
    const f2 = W.landed && lo < Infinity ? topUnder(o.position.x, o.position.z, o.position.y) : fl;   // лёг — по всей длине
    if (lo < f2 + 0.01) {
      o.position.y += f2 + 0.01 - lo;
      if (!W.landed) { W.landed = 1; W.lz = nearest(o.rotation.z, Math.PI, Math.PI / 2); }
      W.vy = Math.abs(W.vy) > 2 ? -W.vy * 0.3 : 0;
      if (W.vy === 0 && Math.hypot(W.vx, W.vz) < 0.05 && W.life < TIME.WRECK - 3) W.done = 1;
    }
  }
  stepChunks(dt);
  stepFlashes(dt);
}
