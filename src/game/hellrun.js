/* 2г24 — окружение и опасности одного пробного заезда. */
import * as THREE from '../vendor/three.module.min.js';
import { collapseTargets, collapseTop, setCollapses, strikeBuilding, restoreImpactHouse } from './hurricane.js';
import * as GROUND from './hellground.js';
import * as FIRE from './hellfire.js';
import * as FIGURES from './hellfigures.js';
import * as RUBBLE from './hellrubble.js';
import * as AFTER from './hellafter.js';

export { cutMaterial, support } from './hellground.js';

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3(), view = new THREE.Vector3(), nextPos = new THREE.Vector3();
const lava = new THREE.Color('#ff500e'), hot = new THREE.Color('#ffbf53');
let C, world, sky, ash, rock, meteorRock, streak, glow, cloud, flash, shockGeo, rubbleMat, time, next, nextCrack, pulse, burnT;
let savedSky, savedAmbient, crackX, crackZ, serial, seed, burnFuel, exposure, aftermath;
const HISTORY_KEY = 'dlv-hell-history';
const meteors = [], blasts = [], collapses = [], pendingFires = [];
export { solids as rubbleSolids, kick as kickRubble } from './hellrubble.js';
const rand = (a, b) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return a + (b - a) * (seed / 4294967296);
};

function makeSky () {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { clock: { value: 0 }, flare: { value: 0 } },
    vertexShader: `
      varying vec3 ray;
      void main() {
        ray = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      varying vec3 ray;
      uniform float clock, flare;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float clouds(vec2 p) {
        float n = 0.0, amp = 0.51;
        for (int i=0; i<5; i++) {
          n += amp*noise(p);
          p = mat2(1.72,1.1,-1.1,1.72)*p + 13.5;
          amp *= 0.48;
        }
        return n;
      }
      void main() {
        vec3 d = normalize(ray);
        float h = max(0.0,d.y);
        vec2 p = d.xz/(h+0.24) * 2.8 + vec2(clock*0.055,clock*0.024);
        float n = clouds(p + clouds(p*0.48)*1.55);
        float glow = exp(-h*4.8);
        float underlit = smoothstep(0.38,0.52,n)*(1.0-smoothstep(0.51,0.63,n));
        vec3 fire = mix(vec3(0.21,0.008,0.013),vec3(0.85,0.079,0.012),glow);
        vec3 col = mix(fire,vec3(0.016,0.002,0.008),smoothstep(0.37,0.66,n)*0.94);
        col += vec3(0.55,0.044,0.004) * underlit * (0.23+glow*0.77);
        float horizon = (h-0.075)*15.0;
        float band = exp(-horizon*horizon);
        col += vec3(0.18,0.023,0.004)*band;
        col = mix(vec3(0.18,0.022,0.018),col,smoothstep(-0.08,0.035,d.y));
        col += flare*vec3(0.10,0.016,0.003);
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e9;
  return mesh;
}

function softTexture (smoke) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < (smoke ? 26 : 1); i++) {
    const x = smoke ? rand(23, 73) : 48, y = smoke ? rand(23, 73) : 48;
    const r = smoke ? Math.min(x, y, 96 - x, 96 - y) * rand(0.65, 1) : 47;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, smoke ? 'rgba(255,255,255,.86)' : 'rgba(255,255,255,1)');
    g.addColorStop(smoke ? 0.46 : 0.17, smoke ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (smoke) {
    // Мягкая круглая граница сохраняется даже у плотного облака из многих клубов.
    ctx.globalCompositeOperation = 'destination-in';
    const edge = ctx.createRadialGradient(48, 48, 14, 48, 48, 47);
    edge.addColorStop(0, 'white'); edge.addColorStop(0.5, 'rgba(255,255,255,.82)'); edge.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, 96, 96);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeAsh () {
  const g = new THREE.BufferGeometry(), n = 230;
  const xyz = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  for (let i = 0; i < xyz.length; i += 3) {
    xyz.set([rand(-67, 67), rand(0, 40), rand(-67, 67)], i);
    (i % 9 ? lava : hot).toArray(colors, i);
  }
  g.setAttribute('position', new THREE.BufferAttribute(xyz, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.28, map: glow, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.84, toneMapped: false });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  return points;
}

function driftAsh (dt) {
  const { V } = C, attr = ash.geometry.attributes.position, xyz = attr.array;
  ash.position.set(V.x, V.y - 2, V.z);
  for (let i = 0; i < xyz.length; i += 3) {
    xyz[i] += dt * (2 + i % 7);
    xyz[i + 1] -= dt * (0.6 + i % 5 * 0.28);
    xyz[i + 2] += dt * (0.8 + Math.sin(time + i) * 0.9);
    if (xyz[i] > 67) xyz[i] -= 134;
    if (xyz[i + 1] < 0) xyz[i + 1] += 40;
    if (xyz[i + 2] > 67) xyz[i + 2] -= 134;
  }
  attr.needsUpdate = true;
}

function pointAhead (distance, sideways) {
  const { V, cam } = C;
  cam.getWorldDirection(view);
  const len = Math.hypot(view.x, view.z);
  const x = len > 0.1 ? view.x / len : Math.sin(V.h);
  const z = len > 0.1 ? view.z / len : Math.cos(V.h);
  return [V.x + x * distance + z * sideways, V.z + z * distance - x * sideways];
}

function groundFire (x, z, size, depth = 0) {
  if (!depth && FIRE.near(x, z, 7)) return;
  const y = C.floorAt(x, z);
  const flames = Array.from({ length: 9 }, () => {
    const spread = depth ? 0.63 : size;
    const dx = rand(-3.5, 3.5) * spread, dz = rand(-2.1, 2.1) * spread;
    return [dx, C.floorAt(x + dx, z + dz) - y + 0.1 - depth, dz, rand(1.5, 4.1) * size + depth, rand(0.4, 1.15) * size];
  });
  FIRE.add(x, y, z, flames);
}

function fireAfterImpact (x, z, size, depth = 0) {
  pendingFires.push({ x, z, size, depth, earliest: time + 0.7, until: time + 12 });
}

function ignitePendingFires () {
  const { V } = C;
  for (let i = pendingFires.length - 1; i >= 0; i--) {
    const f = pendingFires[i];
    if (time >= f.until) { pendingFires.splice(i, 1); continue; }
    if (time < f.earliest || Math.hypot(f.x - V.x, f.z - V.z) < 10) continue;
    groundFire(f.x, f.z, f.size, f.depth);
    pendingFires.splice(i, 1);
  }
}

function houseFire (house, collapse) {
  const { ox: x, oz: z, ux, uz, hx, hz, top } = house;
  const { V } = C, sideX = (V.x - x) * ux + (V.z - z) * uz, sideZ = -(V.x - x) * uz + (V.z - z) * ux;
  const alongX = Math.abs(sideZ) / hz >= Math.abs(sideX) / hx;
  const outer = alongX ? Math.sign(sideZ) * (hz + 0.65) : Math.sign(sideX) * (hx + 0.65);
  const width = alongX ? hx : hz, flames = [];
  for (let i = 0; i < 15; i++) {
    const lateral = (i / 14 * 1.8 - 0.9) * width + rand(-1.1, 1.1);
    const a = alongX ? lateral : outer, b = alongX ? outer : lateral;
    flames.push([ux * a - uz * b, rand(-1.8, 0.3), uz * a + ux * b, rand(3.4, 8.1), rand(0.85, 2.15)]);
  }
  for (let i = 0; i < 8; i++) {
    const a = rand(-0.8, 0.8) * hx, b = rand(-0.8, 0.8) * hz;
    flames.push([ux * a - uz * b, -0.25, uz * a + ux * b, rand(5, 10), rand(1.2, 2.6)]);
  }
  FIRE.add(x, top, z, flames, { get progress () { return collapse?.progress || 0; }, drop: top - house.cut - 0.12 });
}

function roadside () {
  for (const [distance, side] of [[19, 1], [48, -11], [77, 24], [109, -35]]) {
    const [x, z] = pointAhead(distance, side), road = C.nearestRoad(x, z);
    if (!road || road.d > 31 || road.seg.b) continue;
    const s = road.seg, angle = Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
    if (distance === 19) continue;
    for (const sign of [Math.sign(side), -Math.sign(side)]) {
      const offset = s.w * 0.5 + 3.8;
      const fx = road.x - Math.sin(angle) * offset * sign, fz = road.z + Math.cos(angle) * offset * sign;
      if (Math.hypot(fx - C.V.x, fz - C.V.z) < 24 || C.inHouse(fx, fz, 3) || C.roadGap(fx, fz) < 2.2) continue;
      groundFire(fx, fz, rand(0.78, 1.23));
      break;
    }
  }
}

function craterTarget (radius) {
  for (const d of [44, 55, 70, 86, 110, 130]) {
    for (const s of [13, -13, 24, -24, 35, -35, 0]) {
      const [x, z] = pointAhead(d, s);
      if (!C.inBounds(x, z) || C.inHouse(x, z, radius + 2) || C.roadGap(x, z, () => radius * 0.9) < 0
        || GROUND.near(x, z, radius * 2.0)) continue;
      return [x, z];
    }
  }
  return null;
}

function meteorStone () {
  const geo = new THREE.IcosahedronGeometry(1, 1), attr = geo.attributes.position, colors = [];
  const shades = ['#190e16', '#28171a', '#35201f', '#583021', '#b45023', '#ff9c38'].map(c => new THREE.Color(c));
  for (let i = 0; i < attr.count; i += 3) {
    const face = rand(0, 1);
    const c = shades[face < 0.76 ? Math.floor(rand(0, 3)) : face < 0.9 ? 3 : face < 0.98 ? 4 : 5];
    for (let j = 0; j < 3; j++) c.toArray(colors, colors.length);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function sprite (map, hex, additive = false) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map, color: hex, transparent: true, depthWrite: false,
    toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
}

function pedestrianTarget () {
  const [x, z] = pointAhead(43, 0), { V } = C;
  let best = null, score = 41;
  for (const p of C.people) {
    if (!C.canHit(p) || Math.hypot(V.x - p.x, V.z - p.z) < 20 ||
        meteors.some(m => m.person === p) || C.inHouse(p.x, p.z, 1.6)) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < score) { best = p; score = d; }
  }
  return best;
}

// Первый контакт на пройденном за кадр отрезке. Три сферы закрывают ноги, корпус и голову.
function strikePedestrian (from, to, radius, limit) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-6) return null;
  const margin = radius + 0.45, r2 = margin * margin;
  const x0 = Math.min(from.x, to.x) - margin, x1 = Math.max(from.x, to.x) + margin;
  const z0 = Math.min(from.z, to.z) - margin, z1 = Math.max(from.z, to.z) + margin;
  let best = null;
  for (const p of C.people) {
    if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || !C.canHit(p)) continue;
    const x = from.x - p.x, z = from.z - p.z;
    for (const y of p.fall ? [0.27] : [0.36, 0.96, 1.56]) {
      const h = from.y - (p.grp.position.y + y), b = x * dx + h * dy + z * dz;
      const c = x * x + h * h + z * z - r2, det = b * b - a * c;
      if (det < 0 || (c > 0 && b >= 0)) continue;
      const t = Math.max(0, (-b - Math.sqrt(det)) / a);
      if (t > limit) continue;
      limit = t;
      best = { p, t };
    }
  }
  return best;
}

function meteor (x, z, duration, size, { house = null, radius = 0, person = null } = {}) {
  const y = house ? house.top : C.floorAt(x, z);
  const { V } = C, range = Math.hypot(x - V.x, z - V.z) || 1;
  const fx = (x - V.x) / range, fz = (z - V.z) / range;
  const far = person ? rand(6, 14) : radius ? rand(34, 54) : rand(88, 135);
  const side = (person ? rand(4, 11) : radius ? rand(8, 24) : rand(42, 77)) * (serial % 2 ? -1 : 1);
  const start = new THREE.Vector3(x + fx * far + fz * side, y + (person ? rand(29, 38) : radius ? rand(102, 128) : rand(64, 93)), z + fz * far - fx * side);
  const end = new THREE.Vector3(x, y, z);
  const g = new THREE.Group(), core = new THREE.Mesh(meteorRock, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const trail = new THREE.Mesh(streak, new THREE.MeshBasicMaterial({ color: '#ff4f18', transparent: true,
    opacity: 0.51, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const inner = new THREE.Mesh(streak, new THREE.MeshBasicMaterial({ color: '#ffb456', transparent: true, opacity: 0.68, depthWrite: false, fog: false }));
  const halo = sprite(glow, '#ff5e22', true);
  halo.material.fog = false;
  halo.scale.setScalar(size * 6);
  core.scale.set(size * 0.92, size * 1.07, size * 0.84);
  core.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  axis.copy(start).sub(end).normalize();
  g.name = person ? 'hell-meteor-pedestrian' : house ? 'hell-meteor-house' : radius ? 'hell-meteor-heavy' : 'hell-meteor';
  g.quaternion.setFromUnitVectors(UP, axis);
  trail.scale.set(size * 1.5, Math.min(100, size * 31), size * 1.5);
  trail.position.y = trail.scale.y / 2 + size * 0.12;
  inner.scale.set(size * 1.13, Math.min(72, size * 20), size * 1.13);
  inner.position.y = inner.scale.y / 2 + size * 0.22;
  g.add(trail, inner, halo, core);
  for (let i = 1; i <= 6; i++) {
    const tail = sprite(cloud, i < 3 ? '#843523' : '#381f28');
    tail.position.set(rand(-2, 2) * size * i / 6, trail.scale.y * (0.33 + i * 0.17), rand(-2, 2) * size * i / 6);
    tail.scale.setScalar(size * (2.4 + i * 0.62));
    tail.material.opacity = 0.65 - i * 0.065;
    tail.material.rotation = rand(0, 6.28);
    g.add(tail);
  }
  g.position.copy(start);
  world.add(g);
  meteors.push({ g, core, start, end, t: 0, duration, size, house, radius, person, direct: false });
}

function rubbleRoof (house) {
  const flat = house.p.map(([x, z]) => new THREE.Vector2(x, z)), vertices = [];
  for (const face of THREE.ShapeUtils.triangulateShape(flat, [])) {
    for (const i of face) {
      const v = flat[i], y = house.cut + Math.sin(v.x * 0.77 + v.y * 1.04) * 0.12;
      vertices.push(v.x, y, v.y);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, rubbleMat);
  mesh.name = 'hell-collapsed-roof';
  return mesh;
}

function clearRubble (site) {
  world.remove(site.roof);
  site.roof.geometry.dispose();
}

function impact (m) {
  const { x, y, z } = m.end, big = !!(m.house || m.radius);
  const previous = m.house && collapses.find(c => c.house.i === m.house.i);
  const debrisHouse = m.house && (previous ? { ...m.house, top: Math.min(m.house.top, collapseTop(m.house, previous.progress)) } : m.house);
  const g = new THREE.Group(), dust = [];
  const radius = m.radius ? m.radius * 4.6 + 8 : m.house ? 29 + m.size * 2 : 8 + m.size * 5;
  g.name = m.direct ? 'hell-direct-hit' : m.house ? 'hell-collapse' : 'hell-impact';
  g.position.copy(m.end);
  const fireball = sprite(glow, '#ff5b13', true);
  const wave = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: '#ff8b45', side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = C.floorAt(x, z) - y + 0.28;
  g.add(fireball, wave);
  C.blast(x, z, radius);
  FIGURES.blast(x, z, radius);
  const dustBands = debrisHouse ? Math.max(2, Math.ceil((debrisHouse.top - debrisHouse.hHi) / 7)) : 1;
  const dustAround = m.house ? Math.max(12, Math.ceil((m.house.hx + m.house.hz) * 4 / 7)) : 1;
  const dustCount = m.house ? Math.min(180, dustBands * dustAround) : big ? 20 : 8;
  for (let i = 0; i < dustCount; i++) {
    const a = rand(0, Math.PI * 2), r = rand(1, big ? 12 : 7);
    const s = sprite(cloud, m.house ? (i % 3 ? '#71625b' : '#968174') : i % 4 === 0 ? '#692c22' : '#321d20');
    s.material.rotation = rand(0, 6.28);
    g.add(s);
    if (m.house) {
      const h = debrisHouse, side = i % dustAround / dustAround * 4;
      const dx = side < 1 ? -h.hx - 2 : side < 2 ? (side - 1.5) * h.hx * 2 : side < 3 ? h.hx + 2 : (3.5 - side) * h.hx * 2;
      const dz = side < 1 ? (side - 0.5) * h.hz * 2 : side < 2 ? h.hz + 2 : side < 3 ? (2.5 - side) * h.hz * 2 : -h.hz - 2;
      dust.push({ s, x: h.ox - x + dx * h.ux - dz * h.uz + rand(-1.5, 1.5), z: h.oz - z + dx * h.uz + dz * h.ux + rand(-1.5, 1.5),
        y: h.hHi + (Math.floor(i / dustAround) + 0.5) / Math.ceil(dustCount / dustAround) * (h.top - h.hHi) - y + rand(-1.5, 1.5),
        size: rand(24, 31), start: rand(0, 0.12) });
    } else dust.push({ s, x: Math.cos(a) * r, z: Math.sin(a) * r, y: rand(-3, 4),
      size: rand(4, big ? 11 : 8), start: rand(0, 0.3) });
  }
  const road = m.radius ? C.nearestRoad(x, z) : null;
  const entrance = Math.atan2((road?.z ?? C.V.z) - z, (road?.x ?? C.V.x) - x);
  RUBBLE.burst(m.end, debrisHouse, m.radius, entrance);
  world.add(g);
  blasts.push({ g, dust, fireball, wave, radius, t: 0, size: m.size, big, house: !!m.house });
  if (m.house) {
    if (!collapses.some(s => s.house.i === m.house.i)) {
      if (collapses.length >= 10) {
        let index = 0, far = 0;
        for (let i = 0; i < collapses.length; i++) {
          const { house } = collapses[i], d = Math.hypot(house.cx - C.V.x, house.cz - C.V.z);
          if (d > far) { far = d; index = i; }
        }
        clearRubble(collapses[index]); collapses.splice(index, 1);
      }
      const site = { house: m.house, progress: 0, t: 0, roof: rubbleRoof(m.house) };
      collapses.push(site);
      houseFire(m.house, site);
      setCollapses(collapses);
    }
  } else if (m.radius) {
    GROUND.crater(x, z, m.radius, m.radius * 0.52, entrance);
    RUBBLE.clearEntrance();
    const offset = rand(0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = offset + i * Math.PI / 2 + rand(-0.28, 0.28), d = m.radius + rand(3.1, 5.0);
      const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      if (C.inHouse(cx, cz, 2)) continue;
      GROUND.fissure(cx, cz, a, rand(8.0, 12.0), rand(0.48, 0.83), rand(0.8, 1.5));
    }
    fireAfterImpact(x, z, 1.35, m.radius * 0.44);
    FIGURES.emerge(x, z, m.radius, time);
  } else if (Math.hypot(x - C.V.x, z - C.V.z) < 135 && !C.inHouse(x, z, 3)) {
    if (!GROUND.near(x, z, 10)) GROUND.fissure(x, z, rand(0, Math.PI * 2), rand(7, 13), 0.52, 0.95);
    fireAfterImpact(x, z, 0.72);
  }
  saveDamage();
  const d = Math.hypot(x - C.V.x, z - C.V.z), shake = Math.max(0, 1 - d / 165);
  pulse = Math.max(pulse, Math.max(0.18, shake));
  C.S.shake = Math.max(C.S.shake, shake * 0.23);
  C.Snd.fx('hell-impact', s => { s.noise(big ? 1.2 : 0.72, 0.27); s.blip(43, 0.62, 'triangle', 0.16); }, { x, z, far: 200 });
}

function stepBlast (b, dt) {
  b.t += dt;
  const t = b.t;
  b.wave.visible = t < 0.68;
  b.wave.scale.setScalar(b.radius * (1 - Math.exp(-t * 5.1)));
  b.wave.material.opacity = Math.max(0, 0.58 - t * 0.92);
  b.fireball.scale.setScalar(b.size * (6 + Math.min(t, 1.2) * 20));
  b.fireball.material.opacity = Math.exp(-t * 2.7) * 0.9;
  for (const { s, x, y, z, size, start } of b.dust) {
    const age = Math.max(0, t - start);
    const spread = Math.min(age, 3.8), fade = Math.max(0, 1 - age / (b.house ? 12.5 : 8.5));
    const drift = b.house ? 1 + spread * 0.06 : 0.55 + spread * 0.32;
    s.position.set(x * drift + age * 1.2,
      y + Math.sqrt(age) * (b.house ? 1.8 : b.big ? 4.2 : 3) + 1, z * drift);
    s.scale.setScalar(size * (b.house ? 0.9 + spread * 0.25 : 0.4 + spread * 0.52));
    s.material.opacity = Math.min(1, age * (b.house ? 12 : 6)) * fade * (b.house ? 0.98 : 0.88);
  }

}

function discard (g) {
  g.traverse(o => o.material?.dispose());
  world.remove(g);
}

function nextMeteor () {
  serial++;
  const { V } = C;
  if (serial % 4 === 2) {
    const [x, z] = pointAhead(100, 0);
    const targets = collapseTargets(V.x, V.z, 255)
      .filter(h => !collapses.some(s => s.house === h) && !meteors.some(m => m.house === h) && Math.hypot(h.cx - V.x, h.cz - V.z) > 38);
    targets.sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
    if (targets.length) {
      const h = targets[0];
      meteor(h.cx, h.cz, serial === 2 ? 5.4 : rand(3.2, 6.7), rand(2.8, 4.2), { house: h });
      return;
    }
  }
  if (serial % 4 === 1) {
    const radius = serial === 1 ? 6.1 : rand(5.2, 8.4), target = craterTarget(radius);
    if (target) {
      meteor(...target, rand(5.6, 7.9), radius * 0.59, { radius });
      return;
    }
  }
  if (serial % 4 === 3) {
    const person = pedestrianTarget();
    if (person) {
      meteor(person.x, person.z, rand(1.55, 2.05), rand(0.68, 0.94), { person });
      return;
    }
  }
  const distant = serial % 3 === 0;
  const [x, z] = pointAhead(distant ? rand(165, 245) : rand(60, 119), rand(-54, 54));
  meteor(x, z, rand(1.75, 3.1), distant ? rand(1.8, 2.6) : rand(0.9, 1.65));
}

export const active = () => !!C;

function saveDamage () {
  C.Store.set(HISTORY_KEY, { version: 1, houses: collapses.map(c => ({ i: c.house.i, id: c.house.id })), scars: GROUND.history() });
}

function dayAfter () {
  const saved = C.Store.get(HISTORY_KEY, null);
  let houses = saved?.version === 1 && Array.isArray(saved.houses) ? saved.houses.slice(-10).map(restoreImpactHouse).filter(Boolean) : [];
  let scars = saved?.version === 1 && Array.isArray(saved.scars) ? saved.scars.slice(-48) : [];
  // Без предыдущего заезда показываем пример последствий у старта.
  if (!houses.length && !scars.length) {
    const [x, z] = pointAhead(90, 0);
    houses = collapseTargets(C.V.x, C.V.z, 260).filter(h => Math.hypot(h.cx - C.V.x, h.cz - C.V.z) > 35);
    houses.sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
    houses = houses.slice(0, 3);
    for (const distance of [28, 66, 117]) {
      const [px, pz] = pointAhead(distance, 0), road = C.nearestRoad(px, pz);
      if (!road || road.seg.b) continue;
      const r = distance === 66 ? 6.5 : 2.6;
      const outer = Array.from({ length: 25 }, (_, i) => {
        const a = i / 25 * Math.PI * 2, k = rand(0.86, 1.14);
        return [road.x + Math.cos(a) * r * k, 0, road.z + Math.sin(a) * r * k * 0.7];
      });
      scars.push({ x: road.x, z: road.z, outer, contour: outer });
    }
  }
  for (const scar of scars) GROUND.repair(scar);
  for (const house of houses) {
    const site = { house, progress: 1, t: 10, roof: rubbleRoof(house) };
    collapses.push(site); world.add(site.roof); AFTER.rebuild(house);
  }
  setCollapses(collapses);
}

export function start (context) {
  stop();
  C = context;
  aftermath = !!C.aftermath;
  seed = 713; time = 0; serial = 0; next = 0.06; nextCrack = 0.12; pulse = burnT = 0;
  crackX = Infinity; crackZ = Infinity; burnFuel = exposure = 0;
  world = new THREE.Group();
  world.name = 'hellrun';
  C.scene.add(world);
  savedSky = C.sky?.visible;
  savedAmbient = C.amb.color.clone();
  if (C.sky && !aftermath) C.sky.visible = false;
  sky = makeSky();
  rock = new THREE.IcosahedronGeometry(1, 0);
  meteorRock = meteorStone();
  streak = new THREE.ConeGeometry(1, 1, 9);
  glow = softTexture(false); cloud = softTexture(true);
  GROUND.start(world, C.floorAt, rand);
  FIRE.start(world, rand, cloud);
  const surface = (x, z) => GROUND.support(x, z, C.floorAt(x, z));
  FIGURES.start(world, surface, rand, C.humans);
  RUBBLE.start(world, rock, surface, GROUND.rubbleExit, rand);
  shockGeo = new THREE.RingGeometry(0.87, 1, 48);
  rubbleMat = new THREE.MeshLambertMaterial({ color: '#48363a', side: THREE.DoubleSide, flatShading: true });
  ash = makeAsh();
  flash = new THREE.PointLight('#ff5422', 0, 200, 1.35);
  world.add(sky, ash, flash);
  AFTER.start(world);
  if (aftermath) {
    sky.visible = ash.visible = false;
    dayAfter();
  }
}

export function step (dt) {
  time += dt;
  const { scene, V, sun, hemi, amb } = C;
  if (aftermath) {
    scene.fog.color.set('#b6b0a0');
    scene.fog.near = Math.min(scene.fog.near, 70);
    scene.fog.far = Math.min(scene.fog.far, 460);
    GROUND.update(V.x, V.z, dt);
    return;
  }
  scene.background.set('#602526');
  scene.fog.color.set('#713b35');
  scene.fog.near = Math.min(scene.fog.near, 51);
  scene.fog.far = Math.min(scene.fog.far, 340);
  sun.color.set('#ff7750');
  sun.intensity = 1.13 + pulse * 0.55;
  hemi.color.set('#a8a2b4');
  hemi.groundColor.set('#ba4b39');
  hemi.intensity = 0.52;
  amb.color.set('#d99288');
  amb.intensity = 0.33;
  sky.material.uniforms.clock.value = time;
  sky.material.uniforms.flare.value = pulse;
  pulse *= Math.exp(-dt * 4.3);
  driftAsh(dt);

  if (time >= nextCrack && Math.hypot(V.x - crackX, V.z - crackZ) > 35) {
    roadside(); crackX = V.x; crackZ = V.z; nextCrack = time + 0.8;
  }
  if (time >= next) { nextMeteor(); next = time + (serial === 1 ? 1.0 : rand(1.9, 3.3)); }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.t += dt;
    m.core.rotation.x += dt * 0.71;
    m.core.rotation.z += dt * 0.53;
    const t = Math.min(1, m.t / m.duration), heavy = m.radius || m.house || m.size >= 2.4;
    const advance = heavy ? 0.25 * t + 0.20 * t * t + 0.55 * t ** 5 : t ** 1.27;
    if (m.person && C.canHit(m.person)) {
      const follow = 1 - Math.exp(-dt * 12), p = m.person;
      m.end.x += (p.x - m.end.x) * follow;
      m.end.z += (p.z - m.end.z) * follow;
      m.end.y = C.floorAt(m.end.x, m.end.z);
    }
    nextPos.lerpVectors(m.start, m.end, advance);
    const radius = m.size * 0.87;
    const wall = strikeBuilding(m.g.position, nextPos, radius);
    const direct = strikePedestrian(m.g.position, nextPos, radius, wall ? wall.t - 1e-5 : 1);
    if (direct) {
      const vx = nextPos.x - m.g.position.x, vz = nextPos.z - m.g.position.z;
      const length = Math.hypot(vx, vz) || 1;
      C.gib(direct.p, vx / length * 13, vz / length * 13);
      m.end.lerpVectors(m.g.position, nextPos, direct.t);
      m.house = null; m.direct = true;
    } else if (wall) {
      m.house = wall.house; m.radius = 0;
      m.end.set(wall.x, wall.y, wall.z);
    } else if (t < 1) {
      m.g.position.copy(nextPos);
      continue;
    }
    flash.position.copy(m.end);
    flash.position.y += 4;
    impact(m);
    discard(m.g);
    meteors.splice(i, 1);
  }
  flash.intensity = pulse * 330;
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    stepBlast(b, dt);
    if (b.t < (b.house ? 12.7 : 9)) continue;
    discard(b.g);
    blasts.splice(i, 1);
  }
  let changed = false;
  for (const c of collapses) {
    if (c.progress >= 1) continue;
    c.t += dt;
    c.progress = THREE.MathUtils.smoothstep(c.t, 0.55, 3.6);
    if (c.progress >= 1) world.add(c.roof);
    changed = true;
  }
  if (changed) setCollapses(collapses);
  GROUND.update(V.x, V.z, dt);
  RUBBLE.step(dt, V.x, V.z);
  ignitePendingFires();
  FIRE.step(time, V.x, V.z);
  FIGURES.step(time, dt, V.x, V.z);
  const fx = Math.sin(V.h) * 1.2, fz = Math.cos(V.h) * 1.2;
  const burning = ['drive', 'back', 'handover', 'side'].includes(C.S.state) &&
    (FIRE.touches(V.x + fx, V.y + 0.7, V.z + fz) || FIRE.touches(V.x - fx, V.y + 0.7, V.z - fz));
  exposure = burning ? exposure + dt : 0;
  if (exposure > 0.18) burnFuel = 8;
  else burnFuel = Math.max(0, burnFuel - dt);
  FIRE.onVehicle(C.car(), burnFuel > 0);
  burnT = burnFuel > 0 ? burnT + dt : 0;
  if (burnT >= 1.1) { burnT -= 1.1; C.burn(); }
}

export function stop () {
  if (!C) return;
  if (C.sky) C.sky.visible = savedSky;
  C.amb.color.copy(savedAmbient);
  setCollapses([]);
  C.scene.remove(world);
  RUBBLE.stop();
  GROUND.stop();
  FIRE.stop();
  FIGURES.stop();
  AFTER.stop();
  for (const site of collapses) clearRubble(site);
  shockGeo.dispose(); rubbleMat.dispose();
  sky.geometry.dispose();
  ash.geometry.dispose();
  world.traverse(o => o.material?.dispose());
  rock.dispose(); meteorRock.dispose(); streak.dispose(); glow.dispose(); cloud.dispose(); flash.dispose();
  meteors.length = blasts.length = collapses.length = pendingFires.length = 0;
  C = world = sky = ash = rock = meteorRock = streak = glow = cloud = flash = null;
}
