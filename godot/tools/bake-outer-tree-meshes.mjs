import { writeFileSync } from "node:fs";
import { Glb } from './glb.mjs';
import { CrownMesh } from './crown-mesh.mjs';
import { spruceMesh } from './spruce-mesh.mjs';
import { SPRUCE, TREES } from './tree-styles.mjs';
import { generator } from './leaf-sprigs.mjs';

const treeMeshes = new Glb();
treeMeshes.data.materials = [{name:'CrownCore',doubleSided:true}];

const species = [TREES.maple,TREES.linden,TREES.birch,TREES.poplar,TREES.rowan];
for (const [index,style] of species.entries()) {
  const random = generator(index + 42);
  const crown = new CrownMesh();
  for (let group = 0; group < 5; group++) {
    const angle = group * 2.39996;
    const top = group === 0;
    const height = top ? 8.5 : 5.3 + random()*2;
    const reach = (top ? 0.5 : 1.5 + random()*0.65)*style.width;
    const width = (top ? 2.05 : 1.65 + random()*0.65)*style.width;
    crown.add([Math.cos(angle)*reach,height,Math.sin(angle)*reach],
      [width, (top ? 1.9 : 1.55)*style.height, width*.88], angle,style,height/10,1);
  }
  crown.write(treeMeshes,'Crown'+index,0);
}

const spruce = {at:[0,0,0],p:[],i:[],c:[]};
spruceMesh(spruce,{x:0,y:0,z:0,crownLimit:3.0},10,0,SPRUCE,generator(9),()=>{});
treeMeshes.mesh('Crown5',new Float32Array(spruce.p),spruce.i,0,{colors:new Uint8Array(spruce.c)});
writeFileSync(new URL('../assets/south-outer-tree-meshes.glb',import.meta.url),treeMeshes.encode());
