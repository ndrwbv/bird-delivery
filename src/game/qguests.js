/* ──────────────────────────────────────────────────────────────────────────
   Гости за столиками веранд конкурентов — люди-модели, а не коробки (хвост 0п62, автор 24.10.2026: «старые человечки
   всё ещё где-то да встречаются; надо всё вычистить»). Правила словами — docs/CAREER.md «Точки конкурентов» → «Гости».

   Гостей ~600 на город (rivals.js SEAT), до 24.10 — коробочные человечки двумя инстансами. Теперь:
     • ближние (ближе QG.NEAR м к машине, не больше QG.MAX сразу, собираем по QG.BUILD за кадр) — настоящие люди
       (makeHuman, модель Quaternius): сидят на стуле, как на лавочке (qpeople.js SIT, u.qSeat — высота сиденья стула);
       дальше QG.FAR — человек уходит, на его месте снова дальний;
     • дальние — «запечённая» сидячая поза: QG.K разных людей, собранных один раз на игру, усаживаются на стул, их
       скиннинг считается один раз на процессоре — получается обычный меш сидящего человека (столько же треугольников,
       сколько у дальнего прохожего, ~2,4 тыс.). Гость i — человек i % K, по одной отрисовке на каждого из K;
     • дальше 300 м (дальность людей города, gfx.js hideR, + QG.R; прохожих дальше 130 м нет) гостей не рисуем — человек
       там в 3—4 точки ростом; в худшем месте города их ~55 в круге — ~130 тыс. треугольников.
   ?boxguests — по-старому, коробочные человечки до дальности тумана.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import * as GFX from './gfx.js';
import { qPose } from './qpeople.js';

const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const QG = {
  on: !/[?&]boxguests\b/.test(SRCH),
  K: 6,                       // разных людей в дальних гостях
  NEAR: 28, FAR: 33,          // м от машины: ближе — настоящий человек, дальше FAR — снова дальний (меньше дальности модели, gfx.js lod)
  MAX: 8, BUILD: 2,           // настоящих сразу на все точки; собираем за кадр
  R: 170,                     // м сверх дальности людей города (hideR().people), итого 300 м (Низкая — 270): дальше гостей не рисуем
  SEAT_H: 0.48,               // м: верх сиденья стула над землёй (rivals.js — доска на 0,45, толщина 0,06)
  LEGS: -1.45, ARMS: -0.75,   // поза: ноги вперёд (сидит), руки к столу
  baked: 0, bakeMs: 0, live: 0, built: 0, drawn: 0,
};

/* поза «сидит за столом» — на человека игры; группа — на 0,42 над землёй, как всем сидящим */
export function sitPose (u) {
  u.legL.rotation.x = u.legR.rotation.x = QG.LEGS;
  u.armL.rotation.x = u.armR.rotation.x = QG.ARMS;
  u.qSeat = QG.SEAT_H;
}

let GEOS = null, MAT = null;
/* K сидячих мешей — один раз: собрать человека, усадить, посчитать скиннинг на процессоре, человека убрать */
function bake (A) {
  if (GEOS) return GEOS;
  GEOS = [];
  const t0 = performance.now(), v = new THREE.Vector3();
  for (let k = 0; k < QG.K; k++) {
    const g = A.makeHuman(null, {}), u = g.userData, skin = u.skin;
    if (skin && skin.isSkinnedMesh && u.legL) {
      sitPose(u);
      g.position.set(0, 0.42, 0); g.rotation.set(0, 0, 0);
      g.updateMatrixWorld(true);
      qPose(skin);                                   // кости — в позу «сидит» (qpeople.js poseHook)
      skin.updateMatrixWorld(true);
      const src = skin.geometry, n = src.attributes.position.count, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', src.attributes.color.clone());
      geo.setIndex(src.index.clone());
      geo.computeBoundingSphere();
      geo.dispose = () => {};                        // общая на всех гостей до конца игры
      GEOS.push(geo);
      if (!MAT) { MAT = skin.material; MAT.userData.keep = true; }   // общий материал людей
      QG.baked++;
    }
    A.dropMesh(g);
  }
  QG.bakeMs = Math.round(performance.now() - t0);
  return GEOS;
}

/* дальние гости: K инстансов (гость q — человек q.k % K) */
export function build (A, nSeat) {
  if (!QG.on || !A.makeHuman || !A.dropMesh) return null;
  const list = bake(A);
  if (!list.length) return null;
  const K = list.length, meshes = list.map((geo, k) => {
    const m = new THREE.InstancedMesh(geo, MAT, Math.max(1, Math.ceil((nSeat - k) / K)));
    m.count = 0; m.frustumCulled = false; m.visible = false; m.name = 'rival-guests-q';
    A.scene.add(m);
    return m;
  });
  return { K, meshes, n: new Int32Array(K) };
}
/* пересобрать дальних: guests — кого рисовать сейчас ({ x, y, z, ry, k }), GM — матрица гостя */
export function begin (G) { G.n.fill(0); }
export function put (G, q, M) { const k = q.k % G.K, m = G.meshes[k]; if (G.n[k] < m.instanceMatrix.count) m.setMatrixAt(G.n[k]++, M); }
export function end (G) {
  let s = 0;
  G.meshes.forEach((m, k) => { m.count = G.n[k]; m.visible = G.n[k] > 0; m.instanceMatrix.needsUpdate = true; s += G.n[k]; });
  QG.drawn = s;
}
export const farR = () => GFX.hideR().people + QG.R;

/* ближние — настоящие люди; cand — гости ближе NEAR + запас (пересобирает rivals.js); true — кто-то стал/перестал быть
   человеком (пересобрать дальних) */
export function stepNear (A, cand) {
  if (!QG.on) return false;
  const V = A.V, lod = GFX.viewR().lod, NEAR = Math.min(QG.NEAR, lod - 12), FAR = NEAR + (QG.FAR - QG.NEAR);
  let budget = QG.BUILD, dirty = false;
  // ушёл, сбежал или дальность модели стала ближе (тяжёлый кадр) — стоял бы дальним вариантом «стоя»: убрать
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const q = LIVE[i];
    if (!q.on || Math.hypot(q.x - V.x, q.z - V.z) > FAR || q.grp.userData.far) { drop(A, q); dirty = true; }
  }
  for (const q of cand) {
    if (q.grp || !q.on || budget <= 0 || QG.live >= QG.MAX || Math.hypot(q.x - V.x, q.z - V.z) > NEAR) continue;
    budget--;
    const g = A.makeHuman(null, {});
    sitPose(g.userData);
    g.position.set(q.x, q.y + 0.42, q.z); g.rotation.y = q.ry;
    A.scene.add(g);
    q.grp = g; LIVE.push(q); QG.live++; QG.built++; dirty = true;
  }
  return dirty;
}
const LIVE = [];
export function drop (A, q) { if (!q.grp) return; A.dropMesh(q.grp); q.grp = null; QG.live--; const i = LIVE.indexOf(q); if (i >= 0) LIVE.splice(i, 1); }
export function dropAll (A) { while (LIVE.length) drop(A, LIVE[LIVE.length - 1]); }
