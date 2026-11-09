/* Горожане в коричнево-чёрной корке: выбираются из кратера и расходятся. */
import * as THREE from '../vendor/three.module.min.js';

const figures = [];
let world, floor, random, makeHuman, dropHuman, coating;

export function start (group, height, rand, humans) {
  world = group; floor = height; random = rand;
  makeHuman = humans.make; dropHuman = humans.drop;
  coating = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  coating.userData.keep = true;
  coating.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vCrust;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCrust = position;');
    sh.fragmentShader = 'varying vec3 vCrust;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float crust = sin(vCrust.x * 27.0 + sin(vCrust.y * 21.0)) * sin(vCrust.z * 33.0 - vCrust.y * 13.0);
      vec3 mud = mix(vec3(0.014,0.009,0.007),vec3(0.105,0.052,0.024),smoothstep(-0.5,0.6,crust));
      diffuseColor.rgb = mud + diffuseColor.rgb * 0.045;
    `);
  };
  coating.customProgramCacheKey = () => 'hell-human-crust';
}

function remove (f) {
  for (const [mesh, material] of f.materials) mesh.material = material;
  f.body.removeFromParent();
  dropHuman(f.body);
  world.remove(f.root);
}

export function emerge (x, z, radius, now) {
  const turn = random(0, Math.PI * 2);
  for (let i = 0; i < (radius > 7 ? 4 : 3); i++) {
    const a = turn + i * 1.46, dx = Math.sin(a), dz = Math.cos(a);
    const root = new THREE.Group();
    root.name = 'hell-crater-figure';
    const human = makeHuman(), materials = [];
    root.add(human);
    human.traverse(o => {
      if (!o.isMesh) return;
      materials.push([o, o.material]);
      o.material = coating;
    });
    const u = human.userData;
    const arms = [u.armL, u.armR], legs = [u.legL, u.legR];
    root.rotation.y = a;
    root.visible = false;
    world.add(root);
    figures.push({ root, body: human, materials, arms, legs, x, z, dx, dz, radius, born: now + 1.5 + i * 0.9,
      phase: random(0, 6), lift: 0, vy: 0, kx: 0, kz: 0, ox: 0, oz: 0, hit: 0 });
  }
}

export function blast (x, z, r) {
  for (const f of figures) {
    if (!f.root.visible) continue;
    const dx = f.root.position.x - x, dz = f.root.position.z - z, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    const force = (1 - d / r) * 16;
    f.kx = d > 0.1 ? dx / d * force : force;
    f.kz = d > 0.1 ? dz / d * force : 0;
    f.vy = force * 0.46;
    f.hit = 1.4;
  }
}

export function step (time, dt, x, z) {
  for (let i = figures.length - 1; i >= 0; i--) {
    const f = figures[i], t = time - f.born;
    if (t > 70 || Math.hypot(f.x - x, f.z - z) > 190 || figures.length > 24 && i === 0) {
      remove(f); figures.splice(i, 1); continue;
    }
    if (t < 0) continue;
    f.root.visible = true;
    const climb = Math.min(1, t / 3.8), travel = f.radius * (0.12 + climb) + Math.max(0, t - 3.8) * 1.48;
    f.ox += f.kx * dt; f.oz += f.kz * dt;
    f.kx *= Math.exp(-2.5 * dt); f.kz *= Math.exp(-2.5 * dt);
    f.lift = Math.max(0, f.lift + f.vy * dt);
    f.vy = f.lift > 0 ? f.vy - 18 * dt : 0;
    f.hit = Math.max(0, f.hit - dt);
    const px = f.x + f.dx * travel + f.ox, pz = f.z + f.dz * travel + f.oz;
    const gait = Math.sin(t * (climb < 1 ? 7.8 : 6.1) + f.phase);
    f.root.position.set(px, floor(px, pz) + f.lift + Math.abs(gait) * 0.07, pz);
    f.body.userData.qV = f.hit ? 0 : climb < 1 ? f.radius / 3.8 : 1.48;
    f.body.rotation.x = f.hit ? -1.45 * Math.min(1, f.hit * 2.2) : 0.62 * (1 - climb);
    for (let k = 0; k < 2; k++) {
      const swing = gait * (k ? 1 : -1);
      f.legs[k].rotation.x = swing * 0.5;
      f.arms[k].rotation.x = swing * -0.72 - (1 - climb) * 1.25;
    }
  }
}

export function stop () {
  for (const f of figures) remove(f);
  figures.length = 0;
  coating.dispose();
  world = floor = random = makeHuman = dropHuman = coating = null;
}
