/* Длительные очаги: языки огня, подсветка и столбы дыма на земле и на фасадах. */
import * as THREE from '../vendor/three.module.min.js';

const sites = [];
const clock = { value: 0 };
let root, random, smokeMap, material, light, vehicle;

export function start (group, rand, cloud) {
  root = group; random = rand; smokeMap = cloud;
  material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFireTime: clock },
    vertexShader: `
      #include <fog_pars_vertex>
      attribute vec3 flame;
      varying vec3 vFlame;
      void main() {
        vFlame = flame;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec3 vFlame;
      uniform float uFireTime;
      void main() {
        float h = vFlame.y, t = uFireTime * 5.1 + vFlame.z;
        float curl = sin(t * 0.71 + h * 7.0) * h * 0.33;
        float flicker = 0.78 + 0.13 * sin(t * 1.3) + 0.09 * sin(t * 2.9 + h * 17.0);
        float ripple = sin(t * 2.1 - h * 22.0 + vFlame.x * 11.0) * 0.09;
        float edge = (0.88 - 0.62 * h) * flicker - abs(vFlame.x - curl) + ripple;
        float alpha = smoothstep(-0.04,0.19,edge) * (1.0 - smoothstep(flicker * 0.64,flicker,h));
        if (alpha < 0.04) discard;
        float heart = clamp(edge * (1.9 - h) + (0.44 - h) * 0.66, 0.0, 1.0);
        vec3 color = mix(vec3(0.95,0.023,0.002),vec3(1.0,0.47,0.024),smoothstep(0.0,0.75,heart));
        color = mix(color,vec3(1.0,0.92,0.49),smoothstep(0.68,1.0,heart));
        gl_FragColor = vec4(color, alpha * 0.92);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  light = new THREE.PointLight('#ff6a23', 0, 58, 1.55);
  root.add(light);
}

export const near = (x, z, radius) => sites.some(s => !s.vehicle && Math.hypot(s.x - x, s.z - z) < radius);

export function add (x, y, z, emitters, house = null) {
  const group = new THREE.Group(), positions = [], coords = [], smoke = [];
  group.name = house ? 'hell-house-fire' : 'hell-ground-fire';
  group.position.set(x, y, z);
  const vertex = (px, py, pz, u, v, phase) => { positions.push(px, py, pz); coords.push(u, v, phase); };
  for (const [px, py, pz, height, width] of emitters) {
    const phase = random(0, 31), turn = random(0, Math.PI);
    for (let i = 0; i < 3; i++) {
      const a = turn + i * Math.PI / 3, dx = Math.cos(a) * width, dz = Math.sin(a) * width;
      const x0 = px - dx, z0 = pz - dz, x1 = px + dx, z1 = pz + dz, top = py + height;
      vertex(x0, py, z0, -1, 0, phase); vertex(x1, py, z1, 1, 0, phase); vertex(x1, top, z1, 1, 1, phase);
      vertex(x0, py, z0, -1, 0, phase); vertex(x1, top, z1, 1, 1, phase); vertex(x0, top, z0, -1, 1, phase);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(coords, 3));
  group.add(new THREE.Mesh(geo, material));
  for (let i = 0; i < (house ? 9 : 6); i++) {
    const [px, py, pz, height] = emitters[(i * 3) % emitters.length];
    const m = new THREE.SpriteMaterial({ map: smokeMap, color: i % 3 ? '#261c22' : '#3e292a',
      transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(m);
    group.add(sprite);
    smoke.push({ sprite, x: px, y: py + height * 0.5, z: pz, height,
      phase: i / (house ? 9 : 6), spin: random(-0.64, 0.64), side: random(-3, 3) });
  }
  root.add(group);
  const site = { x, y, z, house, group, geo, smoke, emitters };
  sites.push(site);
  return site;
}

export function onVehicle (car, burning) {
  if (vehicle && (!burning || vehicle.group.parent !== car)) {
    remove(vehicle);
    sites.splice(sites.indexOf(vehicle), 1);
    vehicle = null;
  }
  if (!burning || !car || vehicle) return;
  vehicle = add(0, 0, 0, [
    [-0.48, 0.72, 1.25, 1.8, 0.45], [0.42, 0.78, 1.2, 2.25, 0.5],
    [0, 1.4, 0.1, 1.7, 0.55], [-0.5, 0.55, -1, 1.45, 0.38], [0.5, 0.6, -0.8, 1.6, 0.4],
  ]);
  vehicle.vehicle = true;
  vehicle.group.name = 'hell-burning-car';
  car.add(vehicle.group);
}

export function touches (x, y, z) {
  return sites.some(s => !s.vehicle && Math.abs(x - s.x) < 70 && Math.abs(z - s.z) < 70 &&
    s.emitters.some(([px, py, pz, height, width]) => {
      const lift = y - s.group.position.y - py;
      return lift >= -1.1 && lift <= height * 0.77 && Math.hypot(x - s.x - px, z - s.z - pz) < width + 0.85;
    }));
}

function remove (site) {
  site.geo.dispose();
  for (const { sprite } of site.smoke) sprite.material.dispose();
  site.group.removeFromParent();
}

export function step (time, x, z) {
  clock.value = time;
  let nearest = null, dist = 62;
  for (let i = 0; i < sites.length;) {
    const site = sites[i], d = site.vehicle ? 0 : Math.hypot(x - site.x, z - site.z);
    if (!site.vehicle && (sites.filter(s => !s.vehicle).length > 15 || d > 225)) {
      remove(site); sites.splice(i, 1); continue;
    }
    i++;
    // Крыша горит с момента попадания, пламя опускается вместе с верхними этажами.
    const sink = site.house?.progress || 0;
    site.group.position.y = site.y - (site.house ? site.house.drop * sink : 0);
    for (const p of site.smoke) {
      const f = (time * 0.16 + p.phase) % 1, drift = f * f * (site.house ? 26 : 17);
      p.sprite.position.set(p.x + drift + Math.sin(f * 4 + p.side) * 1.8,
        p.y + f * (site.house ? 35 : 23), p.z + p.side * (0.25 + f) - drift * 0.34);
      p.sprite.scale.setScalar(p.height * (1.3 + f * 2.8) + 2.1);
      p.sprite.material.opacity = Math.sin(f * Math.PI) * 0.70;
      p.sprite.material.rotation = p.phase * 8 + p.spin * f;
    }
    if (d < dist) { nearest = site; dist = d; }
  }
  light.intensity = nearest ? 69 + Math.sin(time * 13) * 17 + Math.sin(time * 7) * 9 : 0;
  if (nearest) {
    nearest.group.getWorldPosition(light.position);
    light.position.y += 2.1;
  }
}

export function stop () {
  for (const site of sites) remove(site);
  sites.length = 0;
  vehicle = null;
  root.remove(light);
  light.dispose(); material.dispose();
  root = random = smokeMap = material = light = null;
}
