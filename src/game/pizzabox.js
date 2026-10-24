/* Коробка с пиццей (game.js pizzaBox: летит из багажника, у клиента в руках, у курьера в катсценах).
   Оранжевая коробка 0,36 × 0,09 × 0,36 м (как настоящая ~33—36 см; было 0,85 — «размером с человека», 0п54), на крышке — логотип «Птицы Пиццы»: птица с куском пиццы
   (public/brand/logo-px.png, крупный пиксель без сглаживания; автор 23.10.2026, 0п9). Картинка смотрит верхом
   от того, кто смотрит на клиента спереди, — курьер из машины видит птицу ровно.
   Материалы и картинка — общие на все коробки (userData.keep: при выбросе коробки их не удалять).
   Дети: [0] — коробка, [1] — логотип (game.js openBox прячет его, когда откидывает крышку).
   userData.pbox — по нему люди-модели держат её двумя руками на кистях (qpeople.js CARRY) и роняют при ударе (carried.js). */
let M = null;
function mats (THREE) {
  if (M) return M;
  const box = new THREE.MeshLambertMaterial({ color: '#f0522a', flatShading: true });
  const tex = new THREE.TextureLoader().load('./brand/logo-px.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const logo = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  box.userData.keep = logo.userData.keep = true;
  M = { box, logo };
  return M;
}
export const BOX = { W: 0.36, H: 0.09 };      // коробка, м: сторона и высота (в руках, в полёте, в багажнике — всегда такая, без scale)
export const LOGO = { S: 0.22, Y: BOX.H / 2 + 0.001 };   // сторона картинки, м; над серединой коробки
export function makeBox (THREE) {
  const m = mats(THREE), g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(BOX.W, BOX.H, BOX.W), m.box);
  const l = new THREE.Mesh(new THREE.PlaneGeometry(LOGO.S, LOGO.S), m.logo);
  l.rotation.x = -Math.PI / 2;                  // лицом вверх, верх картинки — к тому, кто держит
  l.position.y = LOGO.Y;
  g.add(b, l);
  g.userData.pbox = 1;
  return g;
}

/* Стопка коробок — много пицц одному (12бл, автор 24.10.2026: «один человек может заказать много пицц, и они тогда ему
   башенкой накидываются»). Правила словами — docs/ORDERS.md «Много пицц одному — стопкой».
   Заказ одному человеку изредка — не одна пицца, а N (STACK.N, шанс STACK.P с STACK.FROM-го заказа смены): из багажника
   летит стопка, клиент держит её двумя руками (как одну — qpeople.js CARRY), курьер в сцене вручения и в подъезде — тоже
   стопку. Выше STACK.WOBBLE коробок стопка шатается. Бросок стопки из STACK.SPILL_N и больше — с шансом STACK.SPILL
   верхние коробки слетают и лежат на земле (carried.js), в руках остаётся остальное.
   Устройство: дети [0] — нижняя коробка, [1] — её логотип (спрятан — сверху другая), [2] — группа «верх» (остальные
   коробки, логотип — на верхней). userData.stack — сколько коробок. */
export const STACK = {
  P: 0.14,                          // шанс, что заказ одному — стопкой
  FROM: 3,                          // с какого заказа смены
  N: [2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 8],   // сколько коробок (равновероятно из списка: чаще две-три, изредка восемь)
  MAX: 8,                           // выше не бывает
  WOBBLE: 6,                        // больше стольких — шатается
  SPILL_N: 4, SPILL: 0.3,           // бросок стопки от SPILL_N коробок: с этим шансом верх слетает
  JIT: 0.025, ROT: 0.14,            // м, рад: коробки лежат неровно
  PAY: 0.5,                         // за каждую коробку после первой — такая доля базы заказа (групповой — целая база за человека)
};
export const stackN = () => STACK.N[(Math.random() * STACK.N.length) | 0];
export function makeStack (THREE, n) {
  n = Math.max(1, Math.min(STACK.MAX, n | 0));
  const g = makeBox(THREE);
  if (n < 2) return g;
  const m = mats(THREE), geo = g.children[0].geometry;
  g.children[1].visible = false;                // логотип нижней — под следующей
  const up = new THREE.Group();
  up.name = 'stack-up';
  const r = () => (Math.random() * 2 - 1);
  for (let i = 1; i < n; i++) {
    const b = new THREE.Mesh(geo, m.box);
    b.position.set(r() * STACK.JIT, i * BOX.H, r() * STACK.JIT);
    b.rotation.y = r() * STACK.ROT * Math.min(1, i / 3);
    up.add(b);
  }
  const l = new THREE.Mesh(new THREE.PlaneGeometry(LOGO.S, LOGO.S), m.logo);
  l.rotation.x = -Math.PI / 2;
  l.name = 'stack-logo';
  up.add(l);
  g.add(up);
  g.userData.stack = n;
  topLogo(g);
  if (n > STACK.WOBBLE) {                       // шатается: «верх» качается на нижней коробке
    const ph = Math.random() * 6.28, k = (n - STACK.WOBBLE) * 0.035;
    g.children[0].onBeforeRender = () => {
      const t = performance.now() / 1000;
      up.rotation.z = Math.sin(t * 2.3 + ph) * k; up.rotation.x = Math.sin(t * 1.7 + ph * 2) * k * 0.7;
    };
  }
  return g;
}
/* логотип — на верхнюю коробку стопки */
function topLogo (g) {
  const up = g.children[2], l = up && up.getObjectByName('stack-logo');
  if (!l) return;
  const boxes = up.children.filter(c => c !== l);
  const top = boxes[boxes.length - 1];
  l.visible = !!top;
  if (top) { l.position.set(top.position.x, top.position.y + LOGO.Y, top.position.z); l.rotation.z = top.rotation.y; }
}
/** верх стопки: { y — середина верхней коробки над серединой нижней, м; logo — её логотип } (game.js openBox: крышку — сверху) */
export function topOf (g) {
  const up = g && g.userData.stack > 1 ? g.children[2] : null;
  if (!up) return { y: 0, logo: g && g.children[1] };
  const l = up.getObjectByName('stack-logo'), boxes = up.children.filter(c => c !== l);
  return { y: boxes.length ? boxes[boxes.length - 1].position.y : 0, logo: l };
}
/** снять верхние k коробок стопки: → их мировые матрицы (вместо них — отдельные коробки, game.js spillStack) */
export function unstack (g, k) {
  const up = g && g.userData.stack > 1 ? g.children[2] : null;
  if (!up) return [];
  const l = up.getObjectByName('stack-logo'), boxes = up.children.filter(c => c !== l);
  k = Math.min(k, boxes.length);
  const out = [];
  g.updateMatrixWorld(true);
  for (let i = 0; i < k; i++) { const b = boxes[boxes.length - 1 - i]; out.push(b.matrixWorld.clone()); up.remove(b); }
  g.userData.stack -= k;
  if (g.userData.stack < 2) { g.remove(up); up.remove(l); l.geometry.dispose(); g.children[1].visible = true; g.children[0].onBeforeRender = () => {}; g.userData.stack = 1; }
  else topLogo(g);
  return out;
}
