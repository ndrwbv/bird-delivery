import { writeFileSync } from 'node:fs';
import { Vector3 } from '../../src/vendor/three.module.min.js';
import { Glb } from './glb.mjs';
import { CrownMesh } from './crown-mesh.mjs';
import { canopyLobe, compactCrownRadius } from './mature-canopy.mjs';
import { DRY, SPRUCE, TREES } from './tree-styles.mjs';
import { generator, Sprigs } from './leaf-sprigs.mjs';

const glb = new Glb();
glb.data.materials = [{ name: 'Crown and bark', doubleSided: true }];
const broad = new CrownMesh();
const leaves = new Sprigs();
const random = generator(42);
const style = TREES.linden;
const radius = compactCrownRadius(10, style);
for (let index = 0; index < 4; index++) {
  const { theta, top, skirt, level, width, tall } = canopyLobe(radius, 10, 0, index, random);
  const center = [Math.cos(theta) * radius * skirt, 10 * level, Math.sin(theta) * radius * skirt];
  broad.add(center, [width * .80, tall * .92, width * .77], theta, style, level, 0);
  leafLayers(leaves, style, random, center, [width, tall, width * .86], level, top ? 20 : 13, theta);
}
stem(broad, [[0,-.22,0],[0,.62,0],[.12,4.8,-.08],[.25,7.0,-.15]], [.30,.23,.12,.035], [61,39,25]);
for (let i = 1; i <= 3; i++) {
  const angle = i * 2.39996;
  tube(broad, [.09,3.25+i*.35,-.05], [Math.cos(angle)*1.86,6.2+i*.12,Math.sin(angle)*1.86],
    .085,.022,[62,42,23],127);
}
broad.write(glb, 'Broadleaf', 0);
leaves.write(glb, 'Leaves', 0);

const pine = new CrownMesh();
const needles = new Sprigs();
const coniferRandom = generator(93);
stem(pine, [[0,-.22,0],[0,.67,0],[0,5.20,0],[0,9.7,0]], [.30,.23,.11,.024], [54,38,24]);
for (let tier = 0; tier < 7; tier++) {
  const y = 3.0 + tier * 1.04;
  const radius = 2.65 * (1 - tier*.127);
  const peak = y + 1.68-tier*.077;
  const heading = tier * 2.39996;
  const start = pine.positions.length / 3;
  for (let arm = 0; arm < 10; arm++) {
    const angle = heading + arm * Math.PI * .20;
    const size = radius * (arm % 2 === 0 ? 1.0 : .63);
    const point = [Math.cos(angle)*size,y+(arm%2)*.21,Math.sin(angle)*size];
    vertex(pine,point,[Math.cos(angle)*.68,.66,Math.sin(angle)*.68],SPRUCE.outer.map(c=>Math.round(c*(.72+tier*.044))),255);
    if (arm % 2 === 0) {
      const normal = new Vector3(Math.cos(angle)*.60,.76,Math.sin(angle)*.60).normalize();
      needles.add([point[0]*.78,y+.29,point[2]*.78],normal,Math.max(.27,radius*.51),
        [...SPRUCE.outer,127],coniferRandom,0);
    }
  }
  vertex(pine,[0,peak,0],[0,1,0],SPRUCE.outer,255);
  for (let arm = 0; arm < 10; arm++) pine.indices.push(start+arm,start+(arm+1)%10,start+10);
}
pine.write(glb, 'Spruce', 0);
needles.write(glb, 'Needles', 0);

const dry = new CrownMesh();
const deadRandom = generator(449);
const dryBark = [67,53,39];
stem(dry, [[0,-.22,0],[0,.63,0],[.33,4.3,-.23],[-.14,7.45,.19],[.32,10.2,.12]],
  [.30,.23,.15,.065,.02],dryBark);
for (let i = 0; i < 7; i++) {
  const angle = i * 2.39996;
  const base = [0.11,2.7+i*.76,-.03];
  const length = (2.85 - i*.25)*(0.88+deadRandom()*.27);
  const bend = [Math.cos(angle)*length*.57,base[1]+.71,Math.sin(angle)*length*.57];
  const tip = [Math.cos(angle)*length,base[1]+1.44+deadRandom()*.48,Math.sin(angle)*length];
  const forkAngle = angle + 1.04;
  const fork = [bend[0]+Math.cos(forkAngle)*length*.35,bend[1]+.98,bend[2]+Math.sin(forkAngle)*length*.35];
  tube(dry,base,bend,.122-i*.009,.065-i*.005,dryBark,127);
  tube(dry,bend,tip,.065-i*.005,.01,dryBark,127);
  tube(dry,bend,fork,.038-i*.003,.008,dryBark,127);
}
dry.write(glb, 'Dry', 0);

const shrub = new CrownMesh();
const shrubRandom = generator(170);
for (let i = 0; i < 5; i++) {
  const angle = i * 2.39996;
  const reach = i === 0 ? 0 : .47 + shrubRandom()*.23;
  const center = [Math.cos(angle)*reach,.63+shrubRandom()*.28,Math.sin(angle)*reach];
  shrub.add(center,[.59,.51+shrubRandom()*.20,.48],angle,TREES.linden,.33,0);
}
shrub.write(glb, 'Shrub', 0);
writeFileSync(new URL('../assets/south-outer-tree-meshes.glb', import.meta.url), glb.encode());

function vertex(mesh, p, normal, color, alpha) {
  mesh.positions.push(...p);
  mesh.normals.push(...normal);
  mesh.colors.push(...color, alpha);
}

function stem(mesh, points, radii, color) {
  for (let i = 1; i < points.length; i++) tube(mesh, points[i-1], points[i], radii[i-1], radii[i], color, 64);
}

function tube(mesh, a, b, startRadius, endRadius, color, alpha) {
  const axis = new Vector3(...b).sub(new Vector3(...a)).normalize();
  const horizontal = new Vector3().crossVectors(axis, Math.abs(axis.y) > .90 ? new Vector3(1,0,0) : new Vector3(0,1,0)).normalize();
  const depth = new Vector3().crossVectors(axis, horizontal);
  const first = mesh.positions.length / 3;
  const sides = alpha === 64 ? 6 : 4;
  for (const [point, r] of [[a, startRadius], [b, endRadius]]) {
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      const n = horizontal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(depth, Math.sin(angle));
      const pigment = color.map(c => Math.round(c * (.78 + .31 * i / (sides - 1))));
      vertex(mesh,new Vector3(...point).addScaledVector(n,r).toArray(),n.toArray(),pigment,alpha);
    }
  }
  for (let i = 0; i < sides; i++) {
    const a = first + i, b = first + (i + 1) % sides;
    mesh.indices.push(a,b,b+sides,a,b+sides,a+sides);
  }
}

function leafLayers(output, style, random, center, radii, level, count, heading) {
  for (let j = 0; j < count; j++) {
    const y = 1 - 2*(j+.5)/count;
    const angle = heading+j*2.39996;
    const ring = Math.sqrt(1-y*y)*(.79+random()*.36);
    const face = new Vector3(Math.cos(angle)*ring,y,Math.sin(angle)*ring);
    const at = center.map((v,j) => v + face.getComponent(j)*radii[j]);
    const light = .68+level*.29+y*.13+random()*.22;
    const tint = (y > .07 ? style.outer : style.leaf).map(value => Math.round(value*light));
    output.add(at,face.normalize(),radii[0]*(.75+random()*.61),[...tint,255],random,0);
  }
}
