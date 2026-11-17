import { Vector3 } from '../../src/vendor/three.module.min.js';

const atlasColumns = 4;
const yAxis = new Vector3(0,1,0);
const xAxis = new Vector3(1,0,0);
const center = new Vector3();
const side = new Vector3();
const up = new Vector3();

export function generator(seed) {
  return () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}

// Each quad carries a different set of individually drawn leaves and a twig.
export class Sprigs {
  positions = [];
  colors = [];
  uv = [];
  indices = [];

  add(at, face, size, tint, random, frame) {
    const index = this.positions.length/3;
    const tile = frame ?? Math.floor(random()*atlasColumns);
    const roll = random()*Math.PI*2;
    center.set(...at);
    side.crossVectors(Math.abs(face.y)>0.91 ? xAxis : yAxis,face).normalize().applyAxisAngle(face,roll);
    up.crossVectors(face,side).normalize();
    side.multiplyScalar(size*0.51);
    up.multiplyScalar(size*0.42);
    for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      this.positions.push(center.x+u*side.x+v*up.x,center.y+u*side.y+v*up.y,center.z+u*side.z+v*up.z);
      this.colors.push(...tint);
      this.uv.push((tile+(u<0?0.004:0.996))/atlasColumns,v<0?0.996:0.004);
    }
    this.indices.push(index,index+1,index+2,index,index+2,index+3);
  }

  write(glb, name, material, translation = [0,0,0]) {
    if(this.indices.length) glb.mesh(name,Float32Array.from(this.positions,(v,i)=>v-translation[i%3]),this.indices,material,{
      colors:new Uint8Array(this.colors),uv:new Float32Array(this.uv),translation
    });
  }
}
