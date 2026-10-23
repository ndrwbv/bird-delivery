/* ──────────────────────────────────────────────────────────────────────────
   Своя машина на телефоне — с обводкой (11бз, автор 24.10.2026: «на телефоне много деталей, которые в кашу
   превращаются»; набор телефона — mobile.js CLEAN, правила словами — docs/CAREER.md «Мобильный режим» → «Чистая картинка»).

   Кузов своей машины обведён тёмной линией CLEAN.outline м: «вывернутая оболочка» — тот же кузов (та же геометрия,
   без копии вершин: вмятины и оторванные куски видны и на обводке), раздутый по нормалям и нарисованный изнутри
   тёмным. Один вызов отрисовки. Из кабины и вплотную (камера ближе NEAR м к машине) обводки нет — она закрыла бы вид.
   Кузов сменился (гараж, ремонт, другая машина) — обводка переезжает на новый сама (проверка раз в CHECK с).
   Только телефон: на компьютере модуль ничего не делает. Отладка: __dlv.MOBV (ST).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';
import { CLEAN } from './mobile.js';

const MV = { NEAR: 3.2, CHECK: 0.5, HEX: 0x1a1410, BODY: /^real:Car_CarBody/ };
export const ST = { on: 0, body: '', moves: 0 };
let A = null, MAT = null, HULL = null, BODY = null, t = 0;
const WS = new THREE.Vector3(), WP = new THREE.Vector3();

function mat () {
  const m = new THREE.MeshBasicMaterial({ color: MV.HEX, side: THREE.BackSide });
  const U = { uOut: { value: CLEAN.outline } };
  m.onBeforeCompile = sh => {
    sh.uniforms.uOut = U.uOut;
    sh.vertexShader = 'uniform float uOut;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += aOut * uOut;');
    sh.vertexShader = 'attribute vec3 aOut;\n' + sh.vertexShader;
  };
  m.customProgramCacheKey = () => 'mobOutline';
  m.userData.U = U;
  return m;
}
function findBody (car) {
  let b = null;
  car.traverse(o => { if (!b && o.isMesh && MV.BODY.test(o.name || '')) b = o; });
  return b;
}
/* нормали для обводки — сглаженные по месту вершины: у кузова на острых рёбрах вершины раздвоены (у каждой грани своя
   нормаль), оболочка по ним рвалась бы щелями. Своя атрибута на той же геометрии (~25 КБ), Ламберт её не читает */
function smooth (g) {
  if (g.attributes.aOut) return;
  const P = g.attributes.position, N = g.attributes.normal, n = P.count, out = new Float32Array(n * 3), K = new Map();
  const key = i => Math.round(P.getX(i) * 500) + ',' + Math.round(P.getY(i) * 500) + ',' + Math.round(P.getZ(i) * 500);
  for (let i = 0; i < n; i++) { const k = key(i); let a = K.get(k); if (!a) K.set(k, a = [0, 0, 0]); a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); }
  for (let i = 0; i < n; i++) { const a = K.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
  g.setAttribute('aOut', new THREE.BufferAttribute(out, 3));
}
function attach (body) {
  if (HULL && HULL.parent) HULL.parent.remove(HULL);
  BODY = body; ST.body = body ? body.name : '';
  if (!body) { HULL = null; return; }
  if (!MAT) MAT = mat();
  if (!body.geometry.attributes.normal) { HULL = null; return; }
  smooth(body.geometry);
  HULL = new THREE.Mesh(body.geometry, MAT);
  HULL.name = 'mobOutline'; HULL.renderOrder = -1;
  HULL.castShadow = HULL.receiveShadow = false;
  body.add(HULL);
  ST.moves++;
}

/* api: { car: () => своя машина, cam } */
export function init (api) {
  if (!CLEAN || !CLEAN.outline) return;
  A = api; ST.on = 1;
}
export function step (dt) {
  if (!A) return;
  const car = A.car();
  if (!car) return;
  if ((t -= dt) <= 0) {
    t = MV.CHECK;
    const b = BODY && BODY.parent && isIn(BODY, car) ? BODY : findBody(car);
    if (b !== BODY || (HULL && HULL.geometry !== b.geometry)) attach(b);
  }
  if (!HULL) return;
  // толщина — в метрах мира: у кузова свой масштаб (модель × 1,2)
  BODY.getWorldScale(WS);
  MAT.userData.U.uOut.value = CLEAN.outline / Math.max(0.01, WS.x);
  car.getWorldPosition(WP);
  HULL.visible = BODY.visible && A.cam.position.distanceTo(WP) > MV.NEAR;
}
function isIn (o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }

export const DEBUG = { MV, ST, get hull () { return HULL; } };
