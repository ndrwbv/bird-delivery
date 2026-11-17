import { readFileSync, writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { generator } from './leaf-sprigs.mjs';
import { bakeUnderstory } from './bake-understory.mjs';
import { bakeCurbGrowth } from './bake-curb-growth.mjs';
import { footballPitches, plantingSpace } from './planting-space.mjs';
import { groundGrid } from './ground-grid.mjs';
import { soilPattern } from './landscape-pattern.mjs';
import { deliveryClearances } from './delivery-addresses.mjs';

const assets=new URL('../assets/',import.meta.url);
const {bounds,spawn,deliveries,home}=JSON.parse(readFileSync(new URL('south.json',assets)));
const {spec:{width,depth,x,z,step},data:heights,sample}=groundGrid(assets);
const {roads,props,buildings}=JSON.parse(readFileSync(new URL('south-physics-source.json',assets)));
const pitches=footballPitches(props);
const open=plantingSpace(buildings,[],[],deliveryClearances(buildings),pitches);
const points=[home,spawn,[-52,35],...deliveries.map(o=>o.stop)];
const random=generator(437191);
const street=roads.filter(r=>r[5]<=4);
const region=new Map();
const spacing=48;
for(const [a,b,c,d] of street) {
  for(let i=Math.floor((Math.min(a,c)-14)/spacing);i<=Math.floor((Math.max(a,c)+14)/spacing);i++)
    for(let j=Math.floor((Math.min(b,d)-14)/spacing);j<=Math.floor((Math.max(b,d)+14)/spacing);j++) {
      const key=i+'_'+j;
      if(!region.has(key)) region.set(key,[]);
      region.get(key).push([a,b,c-a,d-b]);
    }
}
function nextToStreet(u,v) {
  const nearby=region.get(Math.floor(u/spacing)+'_'+Math.floor(v/spacing))||[];
  return nearby.some(([a,b,dx,dz])=>{
    const t=Math.max(0,Math.min(1,((u-a)*dx+(v-b)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(u-a-dx*t,v-b-dz*t)<14;
  });
}
const offsets=[[0.52,0],[-0.52,0],[0,0.52],[0,-0.52]];
const meadow=[[25,51,22],[39,71,24],[54,90,34],[70,104,34],[94,117,42]];
const dryGrass=[[87,89,39],[114,105,54],[132,118,65]];
const batches=new Map();
const planted=new Uint8Array(width*depth);
function tuft(at,base,border,baseHeight,grand,dry,rng) {
  if (!open.clear(...at,0.20)) return;
  const col=Math.round((at[0]-x)/step),row=Math.round((at[1]-z)/step);
  if (col>=0&&col<width&&row>=0&&row<depth) planted[row*width+col]=1;
  const cell=[Math.floor(at[0]/36),Math.floor(at[1]/36)];
  const key=cell.join('_').replaceAll('-','n');
  if(!batches.has(key)) batches.set(key,{pos:[],indices:[],color:[],at:[cell[0]*36+18,0,cell[1]*36+18]});
  const tile=batches.get(key);
  const card=Math.PI*rng();
  const {vigor}=soilPattern(...at);
  const palette=dry ? dryGrass : meadow;
  const hue=palette[Math.floor((vigor*0.65+rng()*0.34)*palette.length)];
  for(let k=0;k<grand;k++) {
    const a=card+k*2.399,c=Math.cos(a),s=Math.sin(a);
    const width=0.021+0.030*rng();
    const tall=baseHeight*(0.68+rng()*0.68);
    const p=at.map((x,i)=>x+(rng()-0.5)*(i===0?0.37:0.29));
    const lean=[c*(0.13+rng()*0.17),s*(0.13+rng()*0.17)];
    if(border&&base.kind===1) {
      lean[0]+=border[0]*0.68;
      lean[1]+=border[1]*0.68;
    }
    const floor=base.rootHeight??sample(...p)?.y??base.y;
    const tone=0.83+rng()*0.28;
    const [red,green,blue]=hue.map(v=>Math.round(v*tone));
    const i=tile.pos.length/3;
    tile.pos.push(p[0]-s*width,floor-0.019,p[1]+c*width,p[0]+s*width,floor-0.019,p[1]-c*width,
      p[0]+0.37*lean[0]-s*width*0.68,floor+tall*0.62,p[1]+0.37*lean[1]+c*width*0.68,
      p[0]+0.37*lean[0]+s*width*0.68,floor+tall*0.62,p[1]+0.37*lean[1]-c*width*0.68,
      p[0]+lean[0],floor+tall,p[1]+lean[1]);
    tile.indices.push(i,i+1,i+2,i+1,i+3,i+2,i+2,i+3,i+4);
    tile.color.push(red-12,green-20,blue-8,0,red-12,green-20,blue-8,0,
      red,green,blue,125,red,green,blue,125,red+9,green+12,blue+8,255);
  }
}
for(let u=bounds[0];u<bounds[2];u+=1.27) for(let v=bounds[1];v<bounds[3];v+=1.27) {
  const at=[u+random()*1.19,v+random()*1.19];
  const {bare,vigor}=soilPattern(...at);
  const patch=0.5+0.5*Math.sin(at[0]*0.54+Math.sin(at[1]*0.34))*Math.sin(at[1]*0.45);
  const near=points.some(([a,b])=>Math.hypot(at[0]-a,at[1]-b)<86);
  if(!near&&!nextToStreet(...at)) continue;
  const base=sample(...at);
  if(!base || (base.kind===2 && (bare>0.81 || random()>0.11))) continue;
  const border=offsets.find(([a,b])=>sample(at[0]+a,at[1]+b)?.kind===(base.kind===0?1:0));
  if(base.kind===0&&(!border||random()>0.18)) continue;
  if(!border && random()>(0.36+patch*0.55)*(1-0.78*bare)) continue;
  const height=base.kind===0 ? 0.15 : 0.20+0.33*patch*vigor+(border?0.14:0.0);
  const blades=border ? (near?6:4) : (near?4:3);
  tuft(at,base,border,height,blades,random()<0.12+bare*0.77+patch*0.13,random);
}
const occupied=bakeUnderstory(assets,bounds,sample,points,tuft);
let meadowTufts=0;
for (let u=bounds[0]+1;u<bounds[2]-1;u+=2.5) {
  for (let v=bounds[1]+1;v<bounds[3]-1;v+=2.5) {
    const at=[u+random()*2.39,v+random()*2.39];
    const base=sample(...at);
    const {bare,vigor}=soilPattern(...at);
    if (base?.kind!==1 || occupied(...at) || random()<bare*0.89) continue;
    if ((nextToStreet(...at)||points.some(([a,b])=>Math.hypot(at[0]-a,at[1]-b)<86))&&random()<0.65) continue;
    const density=(0.5+0.5*Math.sin(u*0.49)*Math.cos(v*0.38))*0.51+vigor*0.49;
    tuft(at,base,null,0.23+0.54*density,density>0.59 ? 4 : 2,random()<0.09+0.7*bare,random);
    meadowTufts++;
  }
}
bakeCurbGrowth(assets,bounds,sample,tuft);

// Small isolated greens can fall between the scatter grid points.
const visited=new Uint8Array(width*depth);
const pending=new Int32Array(width*depth);
let isolated=0;
for (let i=0;i<visited.length;i++) {
  if (visited[i] || heights[i*3+2]!==1) continue;
  let count=1,covered=false;
  let candidate=null;
  pending[0]=i;
  visited[i]=1;
  for (let j=0;j<count;j++) {
    const pixel=pending[j];
    const col=pixel%width,row=Math.floor(pixel/width);
    covered||=planted[pixel]===1;
    if (!covered && candidate===null && col>0 && row>0 && col<width-1 && row<depth-1) {
      const point=[x+col*step,z+row*step];
      if (!occupied(...point)) candidate=point;
    }
    for (const adj of [col>0?pixel-1:-1,col<width-1?pixel+1:-1,pixel-width,pixel+width]) {
      if (adj<0 || adj>=visited.length || visited[adj] || heights[adj*3+2]!==1) continue;
      visited[adj]=1;
      pending[count++]=adj;
    }
  }
  if (!covered && candidate!==null && count>=3) {
    tuft(candidate,sample(...candidate),null,0.27,3,false,random);
    isolated++;
  }
}
console.log(`${meadowTufts} additional meadow tufts, ${isolated} isolated green patches filled`);
const glb=new Glb();
glb.data.materials=[{name:'Grass'}];
for(const [name,{pos,indices,color,at}] of batches) {
  const shifted=Float32Array.from(pos,(v,i)=>v-at[i%3]);
  glb.mesh(`Grass_${name}`,shifted,indices,0,{colors:new Uint8Array(color),translation:at});
}
writeFileSync(new URL('south-grass.glb',assets),glb.encode());
