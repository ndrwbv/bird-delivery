import assert from 'node:assert/strict';
import {ShapeUtils,Vector2} from '../src/vendor/three.module.min.js';
import {createLandMask} from '../src/game/landmask.js';
import {intersectConvex} from '../src/game/landcover.js';

const rect=(x,z,w,h)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h]];
const triangulate=(outer,holes=[])=>({points:[...outer,...holes.flat()],triangles:ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(h=>h.map(p=>new Vector2(...p))))});
const mask=createLandMask();
for(let j=-12;j<12;j++)for(let i=-12;i<12;i++){
  const x=i*32,z=j*32,core=[x,z,x+32,z+32],regions=[];
  // Continuous diagonal and isolated parcels cover seams, negative
  // coordinates, holes, 128m union groups and the 256m segment index.
  const diagonal=intersectConvex([[x-40,z+3],[x+40,z+19],[x+40,z+27],[x-40,z+11]],rect(x,z,32,32));
  if(diagonal.length)regions.push({outer:diagonal,holes:[]});
  if((i+j)%3===0)regions.push({outer:rect(x+2,z+20,26,10),holes:[rect(x+10,z+23,5,4).reverse()]});
  mask.reserve(core);mask.add(core,regions,triangulate);
}
mask.finish();
const overlaps=(e,b)=>Math.max(e.a[0],e.b[0])>=b[0]&&Math.min(e.a[0],e.b[0])<=b[2]&&Math.max(e.a[1],e.b[1])>=b[1]&&Math.min(e.a[1],e.b[1])<=b[3];
const options={
  floorAt:(x,z)=>x<-100?.5:z<0?.085:.11,
  floorBreaks:(ax,az,bx,bz)=>{
    const out=[];
    if(ax!==bx){const t=(-100-ax)/(bx-ax);if(t>0&&t<1)out.push(t);}
    if(az!==bz){const t=-az/(bz-az);if(t>0&&t<1)out.push(t);}
    return out;
  }
};
const windows=[[-512,-512,512,512],[-256,-256,0,0],[0,0,256,256],[-1e-6,-1e-6,1e-6,1e-6],[-512,-512,-385,-385],[256,-256,256,256]];
let seed=73;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<80;i++){
  const x=random()*1024-512,z=random()*1024-512,w=random()*300,h=random()*300;
  windows.push([x,z,x+w,z+h]);
}
let comparisons=0;
for(const coalesce of[false,true])for(const includeWalls of[false,true]){
  const all=[...mask.boundaries({...options,coalesce,includeWalls})].filter(Boolean);
  for(const bounds of windows){
    const selected=[...mask.boundaries({...options,coalesce,includeWalls,bounds})].filter(Boolean);
    assert.deepEqual(selected.filter(e=>overlaps(e,bounds)),all.filter(e=>overlaps(e,bounds)),
      'spatial boundary selection must preserve exact edges, heights, order and wall exclusions');
    comparisons++;
  }
}
console.log(`landmask bounds: ${comparisons} exact comparisons across seams, holes, wall exclusions and index edges passed`);
