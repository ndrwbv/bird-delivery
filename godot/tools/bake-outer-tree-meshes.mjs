import { writeFileSync } from "node:fs";
import { Vector3 } from '../../src/vendor/three.module.min.js';
import { Glb } from './glb.mjs';
import { CrownMesh } from './crown-mesh.mjs';
import { spruceMesh } from './spruce-mesh.mjs';
import { SPRUCE, TREES } from './tree-styles.mjs';
import { generator, Sprigs } from './leaf-sprigs.mjs';

const treeMeshes = new Glb();
treeMeshes.data.materials = [{name:'CrownCore',doubleSided:true}];

const species = [TREES.maple,TREES.linden,TREES.birch,TREES.poplar,TREES.rowan];
for (const [index,style] of species.entries()) {
  const random = generator(index + 42);
  const crown = new CrownMesh();
  const sprigs = new Sprigs();
  const leaves = generator(index + 57);
  for (let group = 0; group < 5; group++) {
    const angle = group * 2.39996;
    const top = group === 0;
    const height = top ? 8.5 : 5.3 + random()*2;
    const reach = (top ? 0.5 : 1.5 + random()*0.65)*style.width;
    const width = (top ? 2.05 : 1.65 + random()*0.65)*style.width;
    const center = [Math.cos(angle)*reach,height,Math.sin(angle)*reach];
    const radii = [width,(top ? 1.9 : 1.55)*style.height,width*.88];
    crown.add(center,radii,angle,style,height/10,1);
    for (let i = 0; i < 18; i++) {
      const azimuth = (i*2.39996 + angle) % (Math.PI*2);
      const y = (i+0.5)/18*2-1;
      const side = Math.sqrt(1-y*y);
      const face = new Vector3(Math.cos(azimuth)*side,y,Math.sin(azimuth)*side);
      const at = center.map((v,j) => v + face.getComponent(j)*radii[j]*1.02);
      const tint = style.outer.map(v => Math.round(v*(1.05 + leaves()*0.47)));
      sprigs.add(at,face,1.35 + leaves()*0.94,[...tint,255],leaves,style.face);
    }
  }
  crown.write(treeMeshes,'Crown'+index,0);
  sprigs.write(treeMeshes,'Sprigs'+index,0);
}

const spruce = {at:[0,0,0],p:[],i:[],c:[]};
spruceMesh(spruce,{x:0,y:0,z:0,crownLimit:3.0},10,0,SPRUCE,generator(9),()=>{});
treeMeshes.mesh('Crown5',new Float32Array(spruce.p),spruce.i,0,{colors:new Uint8Array(spruce.c)});

const shrub = new CrownMesh();
const shrubRandom = generator(170);
for (let i = 0; i < 5; i++) {
  const angle = i * 2.39996;
  const reach = i === 0 ? 0 : 0.53 + shrubRandom()*0.36;
  shrub.add([Math.cos(angle)*reach, 0.65 + shrubRandom()*0.30, Math.sin(angle)*reach],
    [0.70, 0.58 + shrubRandom()*0.23, 0.61], angle, TREES.linden, 0.35, 0);
}
shrub.write(treeMeshes,'Shrub',0);

writeFileSync(new URL('../assets/south-outer-tree-meshes.glb',import.meta.url),treeMeshes.encode());
