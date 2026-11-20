import { writeFileSync } from 'node:fs';
import { Vector3 } from '../../src/vendor/three.module.min.js';
import { Glb } from './glb.mjs';
import { CrownMesh } from './crown-mesh.mjs';
import { canopyLobe, compactCrownRadius } from './mature-canopy.mjs';
import { spruceMesh } from './spruce-mesh.mjs';
import { SPRUCE, TREES } from './tree-styles.mjs';
import { generator, Sprigs } from './leaf-sprigs.mjs';

const treeMeshes = new Glb();
treeMeshes.data.materials = [{ name: 'CrownCore', doubleSided: true }];

const species = [TREES.maple, TREES.linden, TREES.birch, TREES.poplar, TREES.rowan];
for (const [index, style] of species.entries()) {
  const random = generator(index + 42);
  const crown = new CrownMesh();
  const sprigs = new Sprigs();
  const height = 10;
  const radius = compactCrownRadius(height, style);
  for (let group = 0; group < 5; group++) {
    const { theta, top, skirt, level, width, tall } = canopyLobe(radius, height, 0, group, random);
    const x = Math.cos(theta) * radius * skirt;
    const z = Math.sin(theta) * radius * skirt;
    crown.add([x, height * level, z], [width * 0.67, tall * 0.81, width * 0.62], theta, style, level, top ? 1 : 0);
    leafLayers(sprigs, style, random, [x, height * level, z], [width, tall, width * 0.86], level, top ? 28 : 20, theta);
  }
  crown.write(treeMeshes, 'Crown' + index, 0);
  sprigs.write(treeMeshes, 'Sprigs' + index, 0);
}

const spruce = { at: [0, 0, 0], p: [], i: [], c: [] };
const needles = new Sprigs();
const needleRandom = generator(16);
spruceMesh(spruce, { x: 0, y: 0, z: 0, crownLimit: 3.0 }, 10, 0, SPRUCE, generator(9),
  (level, angle, spread) => {
    const x = Math.cos(angle), z = Math.sin(angle);
    const face = new Vector3(x * 0.61, 0.70, z * 0.61).normalize();
    const tint = SPRUCE.outer.map(value => Math.round(value * (0.78 + level * 0.54)));
    needles.add([x * spread * 0.70, level * 10, z * spread * 0.70], face, spread * 0.87, [...tint, 127], needleRandom, 0);
  });
treeMeshes.mesh('Crown5', new Float32Array(spruce.p), spruce.i, 0, { colors: new Uint8Array(spruce.c) });
needles.write(treeMeshes, 'Sprigs5', 0);

const shrub = new CrownMesh();
const shrubSprigs = new Sprigs();
const shrubRandom = generator(170);
for (let i = 0; i < 5; i++) {
  const angle = i * 2.39996;
  const reach = i === 0 ? 0 : 0.47 + shrubRandom() * 0.23;
  const center = [Math.cos(angle) * reach, 0.63 + shrubRandom() * 0.28, Math.sin(angle) * reach];
  const radii = [0.61, 0.58 + shrubRandom() * 0.19, 0.55];
  shrub.add(center, radii.map(v => v * 0.76), angle, TREES.linden, 0.35, 0);
  leafLayers(shrubSprigs, TREES.linden, shrubRandom, center, radii, 0.35, 8, angle);
}
shrub.write(treeMeshes, 'Shrub', 0);
shrubSprigs.write(treeMeshes, 'ShrubLeaves', 0);

const far = new CrownMesh();
far.add([0, 7.0, 0], [2.6, 3.08, 2.54], 0, TREES.linden, 0.65, 0);
far.add([1.03, 5.66, 0.54], [2.0, 1.66, 1.72], 1.32, TREES.maple, 0.45, 0);
far.add([-1.08, 6.1, -0.51], [1.76, 2.06, 1.84], 0.77, TREES.poplar, 0.51, 0);
farTrunk(far, 6.1);
far.write(treeMeshes, 'FarDeciduous', 0);
const farSpruce = new CrownMesh();
farSpruce.add([0, 5.30, 0], [2.35, 2.48, 2.27], 0, SPRUCE, 0.43, 0);
farSpruce.add([0, 7.91, 0], [1.46, 2.41, 1.35], 0, SPRUCE, 0.8, 0);
farTrunk(farSpruce, 4.2);
farSpruce.write(treeMeshes, 'FarSpruce', 0);

writeFileSync(new URL('../assets/south-outer-tree-meshes.glb', import.meta.url), treeMeshes.encode());

function farTrunk(mesh, height) {
  const start = mesh.positions.length / 3;
  for (const [y, radius] of [[-0.15, 0.26], [height, 0.09]]) {
    for (const [x, z] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      mesh.positions.push(x * radius, y, z * radius);
      mesh.normals.push(x, 0, z);
      mesh.colors.push(37, 24, 13, 255);
    }
  }
  for (let side = 0; side < 4; side++) {
    const a = start + side;
    const b = start + (side + 1) % 4;
    mesh.indices.push(a, b + 4, b, a, a + 4, b + 4);
  }
}

function leafLayers(output, style, random, center, radii, level, count, heading) {
  for (let j = 0; j < count; j++) {
    const y = 1 - 2 * (j + 0.5) / count;
    const angle = heading + j * 2.39996;
    const ring = Math.sqrt(1 - y * y) * (0.79 + random() * 0.36);
    const face = new Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    const at = center.map((v, j) => v + face.getComponent(j) * radii[j]);
    const light = 0.68 + level * 0.29 + y * 0.13 + random() * 0.22;
    const tint = (y > 0.07 ? style.outer : style.leaf).map(value => Math.round(value * light));
    const size = radii[0] * (0.74 + random() * 0.61) * 1.14;
    output.add(at, face.normalize(), size, [...tint, 255], random, 0);
  }
}
