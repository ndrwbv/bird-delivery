/* ──────────────────────────────────────────────────────────────────────────
   Тень под машиной игрока (docs/CAREER.md «Город: как выглядит» → «Тень под машиной»).

   Настоящих теней в игре нет (дорого на Деке и телефоне), и машина казалась
   висящей над асфальтом. Теперь под ней — мягкое тёмное пятно по размеру кузова:
   одна плоскость с размытым прямоугольником (рисуется один раз в маленький холст),
   без записи глубины, чуть над тем, на чём стоят колёса. Поворачивается с машиной,
   ложится по склону (тангаж и крен кузова). Днём гуще и чуть сдвинуто от солнца, ночью
   бледнее и ровно под машиной (свет фонарей со всех сторон). В прыжке пятно остаётся на земле, светлеет и сжимается.
   Один вызов отрисовки на кадр.
   ────────────────────────────────────────────────────────────────────────── */
import * as THREE from '../vendor/three.module.min.js';

export const SHADOW = {
  W: 3.3, L: 5.9,                 // размер пятна, м (кузов ~2 × 4,4 + широкий мягкий край)
  DAY: 0.35, NIGHT: 0.2,         // насколько тёмное в середине (04.10.2026: было 0,7 / 0,4 — чёрное пятно)
  SUN: 0.45,                      // сдвиг от солнца, м: днём пятно чуть выглядывает из-под машины
  UP: 0.035,                      // над тем, на чём стоят колёса, м
  AIR: 3,                         // высота прыжка, на которой пятно почти пропадает, м
};

let M = null;
function tex () {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 144;     // 1 px ≈ 4 см: холст во всё пятно SHADOW.W × SHADOW.L
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.filter = 'blur(7px)';
  // прямоугольник со скруглёнными углами, размытый: тень кузова, а не круг. От кузова до края
  // холста — больше двух радиусов размытия: к краю плоскости пятно сходит на нет, без ступеньки
  x.beginPath();
  x.roundRect(16, 18, 48, 108, 14);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function init (scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: null, map: null, transparent: true, opacity: SHADOW.DAY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const t = tex();
  mat.alphaMap = t;                // чёрный цвет, прозрачность — из размытого пятна (холст: альфа в каналах)
  mat.onBeforeCompile = sh => {    // alphaMap берёт зелёный канал; у нас пятно в альфе холста
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n  diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;\n#endif');
  };
  mat.customProgramCacheKey = () => 'carShadow';
  M = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW.W, SHADOW.L).rotateX(-Math.PI / 2), mat);
  M.renderOrder = -1;              // до машины и прозрачного: пятно лежит на асфальте
  M.frustumCulled = false;
  M.matrixAutoUpdate = false;
  scene.add(M);
  return M;
}

const E = new THREE.Euler(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
/* x, z, h — машина; ground — верх того, на чём колёса (рельеф + асфальт/бордюр); y — низ кузова сейчас;
   pitch, roll — наклон кузова; night 0…1; show — видно ли машину; sx, sz — откуда светит солнце (по земле) */
export function step (x, z, h, ground, y, pitch, roll, night, show, sx = 0, sz = 0) {
  if (!M) return;
  M.visible = !!show;
  if (!show) return;
  const air = Math.max(0, y - ground), k = Math.max(0, 1 - air / SHADOW.AIR);
  M.material.opacity = (SHADOW.DAY + (SHADOW.NIGHT - SHADOW.DAY) * night) * (0.25 + 0.75 * k);
  const sc = 0.75 + 0.25 * k;
  const sl = Math.hypot(sx, sz) || 1, off = SHADOW.SUN * (1 - night) * (1 + air * 0.5);
  P.set(x - sx / sl * off, ground + SHADOW.UP, z - sz / sl * off);
  Q.setFromEuler(E.set(air > 0.2 ? 0 : pitch, h, air > 0.2 ? 0 : roll));   // порядок — как у кузова (car.rotation)
  S.set(sc, 1, sc);
  M.matrix.compose(P, Q, S);
  M.matrixWorld.copy(M.matrix);
}

export const DEBUG = { SHADOW, get mesh () { return M; } };
