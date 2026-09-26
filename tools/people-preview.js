/* Превью генератора людей: сорок человек в 3D (как в игре — половинное
   разрешение, крупный пиксель) и их портреты с именами. Кнопки языков
   меняют только имена: внешность от зерна та же. */
import * as THREE from '../src/vendor/three.module.min.js';
import { makePerson, createHumanFactory, faceDataURL, setPeopleLocale } from '../src/game/people.js';

const N = 40, COLS = 10;
const HUMAN_VC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const HUMANS = new Set();
const makeHuman = createHumanFactory({ THREE, HUMAN_VC, HUMANS });

const cv = document.getElementById('view');
const ren = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
ren.setPixelRatio(0.5);                            // половинное разрешение — как в игре
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc3e0');
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 8, 10);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

let seeds = [], lang = 'ru', people = [];
const grp = new THREE.Group();
scene.add(grp);
function rebuild () {
  setPeopleLocale(lang);
  people = seeds.map(seed => makePerson({ seed }));
  for (const g of [...grp.children]) { grp.remove(g); g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
  HUMANS.clear();
  people.forEach((p, i) => {
    const g = makeHuman(p);
    g.position.set((i % COLS - (COLS - 1) / 2) * 1.5, 0, -Math.floor(i / COLS) * 2.2);
    g.userData.ph = i;
    grp.add(g);
  });
  document.getElementById('cards').innerHTML = people.map(p =>
    '<div class="c"><img src="' + faceDataURL(p, 128) + '" alt=""><b>' + p.name + '</b><span>' + p.acc + ' · ' + p.pos + '</span><span>' +
    [p.look.hair, p.look.head, p.look.beard, p.look.glasses, p.look.shape].filter(s => s !== 'none').join(' · ') + '</span></div>').join('');
}
function reseed () { seeds = Array.from({ length: N }, () => (Math.random() * 4294967296) >>> 0); rebuild(); }

const LANGS = ['ru', 'uk', 'en', 'tr', 'de', 'es', 'pt', 'fr', 'it', 'pl', 'kk', 'ja', 'zh'];
const bar = document.getElementById('langs');
for (const l of LANGS) {
  const b = document.createElement('button');
  b.textContent = l; b.dataset.l = l;
  b.onclick = () => { lang = l; for (const q of bar.children) q.classList.toggle('on', q.dataset.l === l); rebuild(); };
  bar.appendChild(b);
}
bar.children[0].classList.add('on');
document.getElementById('reseed').onclick = reseed;
reseed();

/* ?near — камера крупно на первых; ?spin — люди крутятся на месте */
const Q = new URLSearchParams(location.search);
function frame (ms) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.floor(w * 0.5)) ren.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  if (Q.has('near')) { cam.position.set(-4.5, 1.9, 4.2); cam.lookAt(-4.5, 1.3, 0); }        // крупно первые четверо
  else { cam.position.set(0, 4.2, 12); cam.lookAt(0, 1.1, -3.2); }
  const tt = ms / 1000;
  for (const g of grp.children) {
    const u = g.userData, sw = Math.sin(tt * 4 + u.ph) * 0.5;
    g.rotation.y = Q.has('spin') ? tt * 0.6 + u.ph : Math.sin(tt * 0.5 + u.ph) * 0.5;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
  }
  ren.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__people = { makePerson, faceDataURL, rebuild, get people () { return people; } };
