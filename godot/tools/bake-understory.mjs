import { readFileSync, writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { generator } from './leaf-sprigs.mjs';
import { soilPattern } from './landscape-pattern.mjs';
import { deliveryClearances } from './delivery-addresses.mjs';
import { footballPitches, onSoil, plantingSpace, PlantPositions, surveyPlots } from './planting-space.mjs';

// Colorful Bushes by rubberduck, with hand-painted leaves by Sinestesia (CC0).
const meshes=JSON.parse(readFileSync(new URL('foliage/bush-meshes.json',import.meta.url)));
const palette = [[161,174,122],[199,184,131],[117,170,150],[178,196,129],[143,169,156],[196,170,112]];
const tileWidth = 32;
const approachBeds = [
  [-65.8,37.1,1.43],[-67.3,39.5,1.22],[-66.8,34.2,1.38],[-69.5,34.9,1.57],
  [-68.1,31.4,1.31],[-65.2,28.6,1.28],[-67.9,27.3,1.43],[-64.8,24.3,1.17],
  [-46.4,24.6,0.69],[-46.2,30.8,0.68],[-46.3,38.9,0.61],[-47.5,45.8,0.78],
];

// Three intersecting cutouts from the same painted atlas fill smaller patches cheaply.
const smallCover={positions:[],uv:[],indices:[]};
for (const angle of [0,Math.PI/3,2*Math.PI/3]) {
  const i=smallCover.positions.length/3;
  const x=Math.cos(angle),z=Math.sin(angle);
  smallCover.positions.push(-x,0,-z,x,0,z,x*0.62,1,z*0.62,-x*0.62,1,-z*0.62);
  smallCover.uv.push(0.44,0.59,0.66,0.59,0.66,0.02,0.44,0.02);
  smallCover.indices.push(i,i+1,i+2,i,i+2,i+3);
}

export function bakeUnderstory(assets, bounds, sample, focus, grassTuft) {
  const {buildings,roads,props} = JSON.parse(readFileSync(new URL('south-physics-source.json',assets)));
  const obstacles = JSON.parse(readFileSync(new URL('south-obstacles.json',assets)));
  const parked=JSON.parse(readFileSync(new URL('south-parking.json',assets))).parked;
  const random = generator(186613);
  const reserved=[[...focus[0],10.1],...focus.slice(1),...parked.map(([x,z])=>[x,z,2.5]),...deliveryClearances(buildings)];
  const space=plantingSpace(buildings,roads,obstacles,reserved,footballPitches(props));
  const shrubPositions=new PlantPositions();
  const tiles = new Map();
  const keyAt = (x,z,step) => `${Math.floor(x/step)}_${Math.floor(z/step)}`;
  let shrubCount = 0;
  let tuftCount = 0;

  function plant(x,z,ground,model,yaw,width,height,tint) {
    const key=keyAt(x,z,tileWidth);
    if (!tiles.has(key)) {
      const tx=Math.floor(x/tileWidth),tz=Math.floor(z/tileWidth);
      tiles.set(key,{at:[tx*tileWidth+tileWidth/2,0,tz*tileWidth+tileWidth/2],positions:[],uv:[],colors:[],indices:[]});
    }
    const tile=tiles.get(key);
    const firstVertex=tile.positions.length/3;
    const along=width*(0.83+random()*0.24),across=width*(0.60+random()*0.21);
    const cosine=Math.cos(yaw),sine=Math.sin(yaw);
    for (let i=0;i<model.positions.length;i+=3) {
      const u=model.positions[i]*along,v=model.positions[i+1],w=model.positions[i+2]*across;
      const fade=0.68+Math.sqrt(v)*0.32;
      tile.positions.push(x+u*cosine-w*sine-tile.at[0],ground.y+v*height-0.02,z+u*sine+w*cosine-tile.at[2]);
      tile.colors.push(...tint.map(value=>Math.round(value*fade)),Math.round(v*255));
    }
    for (const value of model.uv) tile.uv.push(value);
    for (const index of model.indices) tile.indices.push(firstVertex+index);
  }

  function shrub(x,z,scale,heightScale,spread=false,small=false,allowDirt=false) {
    const radius=scale*0.92;
    if (!onSoil(sample,x,z,radius,allowDirt) || !space.clear(x,z,radius)) return false;
    const ground=sample(x,z);
    const {bare,vigor}=soilPattern(x,z);
    if (bare>0.78 && random()<0.81) return false;
    const light=0.81+vigor*0.31;
    const tint=palette[Math.floor(random()*palette.length)].map(value=>value*light);
    const yaw=random()*Math.PI*2;
    const height=scale*heightScale;
    const index=scale>=1.12 ? 2 : Math.floor(random()*2);
    plant(x,z,ground,small ? smallCover : meshes[index],yaw,scale,height,tint);
    if (spread) {
      for (let i=0;i<3;i++) {
        const turn=yaw+i*2.52+random()*0.45;
        const reach=scale*(0.53+random()*0.62);
        const px=x+Math.cos(turn)*reach,pz=z+Math.sin(turn)*reach;
        const width=scale*(0.32+random()*0.27);
        if (!onSoil(sample,px,pz,width,allowDirt) || !space.clear(px,pz,width)) continue;
        plant(px,pz,sample(px,pz),smallCover,turn,width,width*(0.45+random()*0.67),tint);
      }
      if (scale > 1.0) plant(x,z,{y:ground.y+height*0.22},meshes[0],yaw+1.2,scale*0.58,height*0.93,tint);
    }
    space.exclude(x,z,scale*0.63);
    shrubPositions.add(x,z);
    shrubCount++;
    return true;
  }

  function tuftsAround(x,z,count,radius) {
    for (let i=0;i<count;i++) {
      const turn=random()*Math.PI*2,offset=0.43+random()*radius;
      const position=[x+Math.cos(turn)*offset,z+Math.sin(turn)*offset];
      const base=sample(...position);
      if (base?.kind!==1) continue;
      const {bare,vigor}=soilPattern(...position);
      if (bare>0.7 && random()<0.85) continue;
      grassTuft(position,base,null,0.38+random()*0.31+vigor*0.23,5,bare>0.33,random);
      tuftCount++;
    }
  }

  for (const [x,z,scale] of approachBeds) {
    shrub(x,z,scale,0.89+random()*0.43,true);
    tuftsAround(x,z,12,1.6);
  }
  for (const {at:[x,z],tree} of obstacles) {
    if (!tree || x<bounds[0] || x>bounds[2] || z<bounds[1] || z>bounds[3]) continue;
    const close=focus.some(([a,b])=>Math.hypot(x-a,z-b)<95);
    tuftsAround(x,z,close ? 7 : 3,close ? 1.62 : 0.98);
    if (random()>(close ? 0.95 : 0.47)) continue;
    for (let i=0;i<(close ? 4 : 2);i++) {
      const turn=random()*Math.PI*2,distance=1.55+random()*2.3;
      shrub(x+Math.cos(turn)*distance,z+Math.sin(turn)*distance,0.59+random()*1.12,0.67+random()*0.65,close);
    }
  }
  // Open lawns get overlapping patches, while a buffer keeps paths readable.
  for (let x=bounds[0]+2;x<bounds[2]-3;x+=3.9) {
    for (let z=bounds[1]+2;z<bounds[3]-3;z+=3.9) {
      const a=x+random()*3.5,b=z+random()*3.5;
      const close=focus.some(([u,v])=>Math.hypot(a-u,b-v)<91);
      const drift=0.5+0.5*Math.sin(a*0.27+b*0.10)*Math.cos(b*0.34-a*0.16);
      if (random()>(close ? 0.34+drift*0.45 : 0.14+drift*0.26)) continue;
      const previous=shrubCount;
      const size=0.64+random()**1.25*(close ? 1.60 : 0.95);
      const small=!close||size<0.88;
      shrub(a,b,size,0.44+random()*0.68,close&&size>0.8,small);
      if (previous===shrubCount) continue;
      tuftsAround(a,b,close ? 4 : 2,size+0.67);
    }
  }

  const shrubPoints=[...surveyPlots(bounds,sample,space,3.85,0.65,generator(180217))];
  const before=shrubCount;
  for (const [x,z] of shrubPoints) {
    const drift=0.5+0.5*Math.sin(x*0.17+z*0.084)*Math.cos(z*0.21-x*0.038);
    if (shrubPositions.near(x,z,3.85+drift*1.3)) continue;
    const close=focus.some(([a,b])=>Math.hypot(x-a,z-b)<95);
    const scale=0.87+random()*0.79;
    const height=0.60+random()*0.58;
    const detailed=close && scale>1.18 && random()<0.52;
    const planted=shrub(x,z,scale,height,detailed,!detailed,true);
    if (!planted) shrub(x,z,0.69,height,false,true,true);
  }
  const uncovered=shrubPoints.filter(([x,z])=>!shrubPositions.near(x,z,5.16)).length;
  console.log(`${shrubPoints.length} open plots surveyed for shrubs, ${shrubCount-before} gaps planted, ${uncovered} beyond 5.16 m`);

  const glb=new Glb();
  glb.data.materials=[{name:'Understory'}];
  for (const [key,{at,positions,colors,indices,uv}] of tiles) {
    glb.mesh(`Shrubs_${key}`,Float32Array.from(positions),indices,0,{
      uv:Float32Array.from(uv),colors:Uint8Array.from(colors),translation:at
    });
  }
  writeFileSync(new URL('south-understory.glb',assets),glb.encode());
  console.log(`${shrubCount} shrubs, ${tuftCount} tall grass tufts, ${tiles.size} vegetation tiles`);
  return (x,z)=>!space.clear(x,z,0.13);
}
