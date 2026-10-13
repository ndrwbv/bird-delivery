/* ──────────────────────────────────────────────────────────────────────────
   Настоящая «Семёрка» вместо кубиков (проба, ветка test/real-car, 13.10.2026).

   Модель — «Old Car - VAZ 2107», Arkady Gribachev, CC-BY-4.0 (в титры):
   https://sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb
   Ужата tools/realcar.mjs: ~20 тыс. треугольников → ~7 тыс., текстуры 2K → 128—256 px
   с палитрой ~24 цвета. Здесь — гранёный свет (flatShading) и крупный пиксель
   (NearestFilter), как у всего города.

   dress(car) — только своя машина: модель грузится один раз, потом прежний кузов
   (все дети группы — рама, панели, стёкла, колёса, курьер) уходит в спрятанную
   подгруппу, а модель встаёт на его место. Вмятины, стёкла, фары считаются как
   раньше, но их не видно — это проба вида.
   eye — где глаза водителя (вид из-за руля, game.js camStep).
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

const BASE = (import.meta.env.BASE_URL || './') + 'models/vaz2107/';
/* k — во сколько раз больше настоящей: люди в игре рослые, в настоящий размер (4,16 м) машина меньше
   прежних кубиков (4,53 м) и рядом с людьми — игрушечная. eye — в осях модели, до увеличения */
export const REAL = { on: true, k: 1.2, eye: new THREE.Vector3(0.36, 1.2, 0.06) };
let MODEL = null, LOADING = null;

function load () {
  if (LOADING) return LOADING;
  LOADING = Promise.all([fetch(BASE + 'car.json').then(r => r.json()), fetch(BASE + 'car.bin').then(r => r.arrayBuffer())])
    .then(([J, bin]) => {
      const g = new THREE.Group(), tl = new THREE.TextureLoader();
      const cz = (J.box.min[2] + J.box.max[2]) / 2;      // середина по длине — в ноль, как у кузова игры
      for (const p of J.parts) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(bin, p.pos[0], p.pos[1]), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(bin, p.uv[0], p.uv[1]), 2));
        geo.setIndex(new THREE.BufferAttribute(p.idx[2] === 4 ? new Uint32Array(bin, p.idx[0], p.idx[1]) : new Uint16Array(bin, p.idx[0], p.idx[1]), 1));
        geo.translate(0, 0, -cz);
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
        if (p.file) {
          const t = tl.load(BASE + p.file);
          t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
          t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
          mat.map = t;
        }
        if (p.blend) { mat.transparent = true; mat.opacity = Math.min(1, p.alpha); mat.depthWrite = false; }
        const m = new THREE.Mesh(geo, mat);
        m.name = 'real:' + p.name;
        if (p.blend) m.renderOrder = 2;
        g.add(m);
      }
      MODEL = g;
      if (window.__dlv) window.__dlv.REAL = REAL;     // отладка: глаза водителя двигать из probe
      return g;
    })
    .catch(e => { console.warn('realcar: модель не загрузилась', e); REAL.on = false; return null; });
  return LOADING;
}

export function dress (car) {
  if (!REAL.on || !car) return;
  load().then(M => {
    if (!M || car.userData.real) return;
    const old = new THREE.Group();
    old.name = 'old-body';
    old.visible = false;
    for (const c of [...car.children]) old.add(c);   // позиции детей — в осях машины, подгруппа без сдвига: всё на месте
    car.add(old);
    const m = M.clone();
    m.scale.setScalar(REAL.k);
    car.add(m);
    car.userData.real = m;
  });
}
