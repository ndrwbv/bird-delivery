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
