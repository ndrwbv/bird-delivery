/* ──────────────────────────────────────────────────────────────────────────
   Припаркованные машины — склейкой по клеткам (11.10.2026, трек «Производительность», пункт 4;
   docs/AGENTS.md «Стоящие машины и сетка „кто рядом“»).

   У бордюров и на парковках стоит 200—280 лёгких машин (makeCarLite: кузов-склейка + фары — два меша
   и два вызова отрисовки на машину), и каждая — группа на сцене, которую каждый кадр перебирают
   отсечение (cullFar, CULL.step) и десяток циклов по машинам.
   Теперь все нетронутые припаркованные склеены по клеткам CELL м: кузова и фары всех моделей клетки —
   ОДИН меш (один вызов на клетку, в кадре 0—6 клеток). Вершины — те же, что у их лёгких моделей
   (makeCarLite: цвет кузова уже в вершинах), только сразу на своём месте.
     • фары (у лёгкой — свой меш без света, LITE_BASIC, у китайца LED_MAT) — в той же склейке с пометкой
       aF: 1 — цвет как у LITE_BASIC (ночью его темнит игра), 2 — как у LED (не темнеет); остальное —
       свет и туман LITE_MAT;
     • как у машин на сцене (game.js cullFar, farShrink): дальше GFX.hideR().cars (220 / 200 м) от курьера —
       не видно, в последние FAR_BAND.cars (35 м) — плавно сжимается к своей середине (aC); считает
       видеокарта, процессор трогает три числа на кадр и видимость клеток;
     • машину толкнули, задели, сдвинули, взорвали (trafficgrid.js wake) — её вершины в склейке
       схлопываются в точку (как у сбиваемых предметов города), а на сцену возвращается её собственная
       лёгкая модель — дальше всё как раньше (fullCar, мятины, полёт). Обратно в склейку не возвращается;
     • повтор (replay.js): кто проснулся в окне повтора, до своего толчка снова виден в склейке (replay).
   ────────────────────────────────────────────────────────────────────────── */

const CELL = 160;
let THREE = null, SCENE = null, SRC = null, MAT = null;
const U = { uPl: { value: null }, uR: { value: 220 }, uBand: { value: 35 }, uBasic: { value: null }, uLed: { value: null } };
const CELLS = [];             // { mesh, pos (атрибут позиций), cars: [], cx, cz, rad, n — сколько ещё стоит }
export const ST = { n: 0, out: 0, cells: 0, lost: 0, verts: 0 };

function material (base) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    for (const k in U) sh.uniforms[k] = U[k];
    sh.vertexShader = 'attribute float aF;\nattribute vec3 aC;\nuniform vec2 uPl;\nuniform float uR, uBand;\nvarying float vF;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { float pmD = distance(aC.xz, uPl), pmK = clamp((uR - pmD) / uBand, 0.0, 1.0);
    transformed = aC + (transformed - aC) * (pmD > uR ? 0.0 : max(0.02, pmK * pmK * (3.0 - 2.0 * pmK))); }
  vF = aF;`);
    sh.fragmentShader = 'uniform vec3 uBasic, uLed;\nvarying float vF;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `if (vF > 0.5) outgoingLight = vColor * (vF > 1.5 ? uLed : uBasic);   // фары — без света, как LITE_BASIC / LED
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'parkcells';
  m.userData.shared = true;
  return m;
}

/** api: { THREE, scene, LITE_MAT, LITE_BASIC, LED_MAT, now() — время записи повтора } */
export function init (api) {
  THREE = api.THREE; SCENE = api.scene; SRC = api;
  U.uPl.value = new THREE.Vector2(1e9, 1e9);
  U.uBasic.value = new THREE.Color(1, 1, 1); U.uLed.value = new THREE.Color(1, 1, 1);
  MAT = material(api.LITE_MAT);
}

/** все стоящие разом (LATE 'cars'): cars — лёгкие машины на сцене (дети — кузов и, если есть, фары); ставит t.pk */
export function build (cars) {
  const per = new Map(), v = new THREE.Vector3();
  for (const t of cars) {
    const k = Math.floor(t.x / CELL) + ',' + Math.floor(t.z / CELL);
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(t);
  }
  for (const L of per.values()) {
    let vn = 0, iN = 0;
    for (const t of L) for (const m of t.mesh.children) { vn += m.geometry.attributes.position.count; iN += m.geometry.index.count; }
    const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3), aC = new Float32Array(vn * 3), aF = new Float32Array(vn);
    const idx = new Uint32Array(iN);
    const C = { mesh: null, pos: null, cars: [], cx: 0, cz: 0, rad: 0, n: 0 };
    let vo = 0, io = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const t of L) {
      const g = t.mesh;
      g.updateMatrix();
      const v0 = vo, ox = g.position.x, oy = g.position.y, oz = g.position.z;
      for (const m of g.children) {
        const G = m.geometry, P = G.attributes.position, N = G.attributes.normal, K = G.attributes.color, I = G.index.array, n = P.count;
        const f = m.material === SRC.LITE_BASIC ? 1 : m.material === SRC.LED_MAT ? 2 : 0;
        for (let i = 0; i < n; i++) {
          const j = (vo + i) * 3;
          v.fromBufferAttribute(P, i).applyMatrix4(g.matrix);
          pos[j] = v.x; pos[j + 1] = v.y; pos[j + 2] = v.z;
          v.fromBufferAttribute(N, i).transformDirection(g.matrix);
          nor[j] = v.x; nor[j + 1] = v.y; nor[j + 2] = v.z;
          col[j] = K.getX(i); col[j + 1] = K.getY(i); col[j + 2] = K.getZ(i);
          aC[j] = ox; aC[j + 1] = oy; aC[j + 2] = oz;
          aF[vo + i] = f;
        }
        for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
        vo += n; io += I.length;
      }
      minX = Math.min(minX, ox); maxX = Math.max(maxX, ox); minZ = Math.min(minZ, oz); maxZ = Math.max(maxZ, oz);
      t.pk = { C, v0, nv: vo - v0, x: t.x, z: t.z, h: t.h, mesh: g };
      C.cars.push(t);
      SCENE.remove(g);                             // своя модель — со сцены, пока стоит в склейке
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
    geo.setAttribute('aF', new THREE.BufferAttribute(aF, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT);
    mesh.name = 'parked';
    SCENE.add(mesh);
    C.mesh = mesh; C.pos = geo.attributes.position;
    C.cx = (minX + maxX) / 2; C.cz = (minZ + maxZ) / 2; C.rad = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 4; C.n = L.length;
    CELLS.push(C);
    ST.n += L.length; ST.verts += vn;
  }
  ST.cells = CELLS.length;
}

/* схлопнуть вершины машины в склейке — в её середину aC (шейдер даёт точку) */
function collapse (P) {
  const a = P.C.pos.array, c = P.C.mesh.geometry.attributes.aC.array, s = P.v0 * 3, e = (P.v0 + P.nv) * 3;
  for (let i = s; i < e; i++) a[i] = c[i];
  P.C.pos.addUpdateRange(s, e - s); P.C.pos.needsUpdate = true;
}

/* вынутые за последние 15 с: { P, at — время записи повтора, orig — их вершины до толчка, shown — повтор показал } */
const RECENT = [];
/** вынуть машину из склейки: вершины — в точку; своя модель — обратно на сцену (bare — не ставить: её убрали) */
export function out (t, bare) {
  const P = t.pk;
  if (!P) return;
  const s = P.v0 * 3, e = (P.v0 + P.nv) * 3, at = SRC.now ? SRC.now() : 0;
  while (RECENT.length && (RECENT.length >= 64 || at - RECENT[0].at > 15)) RECENT.shift();
  RECENT.push({ P, at, orig: P.C.pos.array.slice(s, e), shown: false });   // повтор (replay): до этого мгновения стояла тут
  collapse(P);
  P.C.n--;
  t.pk = undefined;
  if (!bare && !P.mesh.parent && t.mesh === P.mesh && !t.gone) SCENE.add(P.mesh);   // fullCar / самосвал уже поставили свою — не трогаем
  ST.n--; ST.out++;
}

let SHOWN = 0;
/** повтор (game.js, кадр повтора): tRec — где повтор во времени записи (replay.js playAt; закрыт — Infinity).
    Кто проснулся позже этого мгновения — снова виден в склейке: своя модель до толчка в повторе не записана */
export function replay (tRec) {
  if (!SHOWN && tRec === Infinity) return;
  SHOWN = 0;
  for (const r of RECENT) {
    const want = r.at > tRec;
    if (want !== r.shown) {
      r.shown = want;
      if (want) { const s = r.P.v0 * 3; r.P.C.pos.array.set(r.orig, s); r.P.C.pos.addUpdateRange(s, r.orig.length); r.P.C.pos.needsUpdate = true; r.P.C.mesh.visible = true; }
      else collapse(r.P);
    }
    if (want) SHOWN++;
  }
}

let SW = 0;
/** каждый кадр (game.js cullFar): где курьер и дальность (клетки дальше — не рисуем); цвет фар — как у
    LITE_BASIC / LED; по кусочку — машины, которых нет в TRAFFIC (фестиваль убрал с площадки) — прячем */
export function view (x, z, R, band, fullF) {       // fullF — проход последнего полного перебора TRAFFIC (trafficgrid.js)
  if (!CELLS.length) return;
  U.uPl.value.set(x, z); U.uR.value = R; U.uBand.value = band;
  U.uBasic.value.copy(SRC.LITE_BASIC.color); U.uLed.value.copy(SRC.LED_MAT.color);
  MAT.color.copy(SRC.LITE_MAT.color); MAT.emissive.copy(SRC.LITE_MAT.emissive);
  for (let i = 0; i < CELLS.length; i++) {
    const C = CELLS[i], dx = C.cx - x, dz = C.cz - z, r = R + C.rad;
    C.mesh.visible = (C.n > 0 || SHOWN > 0) && dx * dx + dz * dz < r * r;
  }
  const C = CELLS[SW++ % CELLS.length];
  for (const t of C.cars) {
    if (!t.pk || t.tgF >= fullF) continue;
    // нет в TRAFFIC (trafficgrid.js не видел): фестиваль убрал с площадки (вернёт своей моделью) — из склейки, без своей модели
    t.still = 0; out(t, true); ST.lost++;
  }
}

/** для проверок (ghost-cars.js): машины склейки, которых нет в списке, которые «не стоят» или стоят не там */
export function orphans (TR) {
  const live = new Set(TR), bad = [];
  for (const C of CELLS)
    for (const t of C.cars) {
      if (!t.pk) continue;
      if (!live.has(t) || t.gone || !t.still || t.pk.x !== t.x || t.pk.z !== t.z || t.pk.h !== t.h) bad.push([t.model, Math.round(t.x), Math.round(t.z)]);
    }
  return bad;
}

export const DEBUG = { ST, CELLS, U, CELL };
