/* ──────────────────────────────────────────────────────────────────────────
   Дальняя толпа — люди-модели, а не коробки (0п62, автор 24.10.2026: «старые человечки всё ещё где-то да встречаются;
   надо всё вычистить»; «в собраниях у дома появляются старые человечки»). Правила словами — docs/CAREER.md «Жизнь
   города» → «Толпа».

   Толпы сходок у подъездов, маршей (protests.js) и фестивалей (festivals.js) — десятки—сотни человек инстансами (две
   отрисовки на толпу). Ближние — настоящие люди (makeHuman, не больше нескольких сразу), остальные до 24.10 были
   коробками старого вида. Теперь вместо коробки — дальний вариант модели Quaternius (тот же меш, что у прохожего дальше
   45 м: стоит, руки опущены, одет): Q.K разных людей, собранных один раз на всю игру; член толпы i — человек i % K.
   Одна отрисовка на каждого из K в толпе. Цвет рубашки толпы (setColorAt) не красим — одежда своя у модели.

     body(A, n)  — вместо new THREE.InstancedMesh(BODY, mat, n): группа с тем же, что зовут толпы: setMatrixAt(i, m),
                   setColorAt (ничего), instanceMatrix.needsUpdate, count, visible, dispose(), frustumCulled
     head(n)     — вместо головы-коробки: пустой инстанс (голова — в модели)
   ?boxcrowd — по-старому, коробки (как и ближние настоящие люди).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

const SRCH = typeof location !== 'undefined' ? location.search || '' : '';
export const Q = { on: !/[?&]boxcrowd\b/.test(SRCH), K: 5, built: 0 };
let GEOS = null, MAT = null;
const EMPTY = new THREE.BufferGeometry();
EMPTY.setAttribute('position', new THREE.Float32BufferAttribute([], 3));   // 0 вершин — рисовать нечего
EMPTY.dispose = () => {};

/* K людей — один раз: собрать человека, взять его дальний меш (стоит, руки опущены) в мир с его ростом, человека убрать */
function geos (A) {
  if (GEOS) return GEOS;
  GEOS = [];
  for (let k = 0; k < Q.K; k++) {
    const g = A.makeHuman(null, {});
    const lod = g.userData && g.userData.lod;
    if (lod && lod.geometry && lod.geometry.attributes.position) {
      g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
      g.updateMatrixWorld(true);
      const geo = lod.geometry.clone();
      geo.applyMatrix4(lod.matrixWorld);
      geo.computeBoundingSphere();
      geo.dispose = () => {};                      // общая на все толпы до конца игры
      GEOS.push(geo);
      if (!MAT) { MAT = lod.material; MAT.userData.keep = true; }   // общий материал людей: толпы его не освобождают
      Q.built++;
    }
    A.dropMesh(g);
  }
  return GEOS;
}

class Multi extends THREE.Group {
  constructor (list, n) {
    super();
    this.list = list; this.n = n;
    const K = list.length;
    for (let k = 0; k < K; k++) {
      const c = Math.max(1, Math.ceil((n - k) / K));
      const m = new THREE.InstancedMesh(list[k], MAT, c);
      m.count = Math.max(0, Math.ceil((n - k) / K));
      m.frustumCulled = false;
      this.add(m);
    }
    const kids = this.children;
    this.instanceMatrix = { set needsUpdate (v) { for (const m of kids) m.instanceMatrix.needsUpdate = v; } };
    this.isInstancedMesh = false;
    this.geometry = null;
  }
  get count () { return this.n; }
  set count (v) { this.n = v; const K = this.children.length; this.children.forEach((m, k) => { m.count = Math.max(0, Math.min(m.instanceMatrix.count, Math.ceil((v - k) / K))); }); }
  set frustumCulled (v) {}
  get frustumCulled () { return false; }
  setMatrixAt (i, M) { const K = this.children.length; this.children[i % K].setMatrixAt((i / K) | 0, M); }
  setColorAt () {}
  dispose () { for (const m of this.children) m.dispose(); }
}

/** вместо инстанса-коробки тела толпы; null — по-старому (?boxcrowd или людей собрать не вышло) */
export function body (A, n) {
  if (!Q.on || !A.makeHuman || !A.dropMesh) return null;
  const list = geos(A);
  return list.length ? new Multi(list, n) : null;
}
/** голова толпы: голова уже в модели — пустой инстанс (не рисует ничего) */
export function head (mat, n) {
  const m = new THREE.InstancedMesh(EMPTY, mat, Math.max(1, n));
  m.count = n; m.frustumCulled = false; m.visible = false;
  return m;
}
export const isHead = g => g === EMPTY;
