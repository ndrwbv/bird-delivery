import { readFileSync,writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { groundGrid } from './ground-grid.mjs';
import { generator } from './leaf-sprigs.mjs';
import { plantingSpace,footballPitches,PlantPositions } from './planting-space.mjs';
import { soilPattern,treeHabitat } from './landscape-pattern.mjs';

const assets=new URL('../assets/',import.meta.url);
const json=name=>JSON.parse(readFileSync(new URL(name,assets)));
const {bounds,spawn,home,deliveries}=json('south.json');
const {buildings,roads,props,solids}=json('south-physics-source.json');
const {sample}=groundGrid(assets);
const tiles=new Map();
const r=generator(71451);
const bark=[84,62,47], dead=[120,91,65];
const foliage=[[94,112,57],[119,126,62],[78,113,74],[98,125,82],[139,133,68],[79,106,87]];
const fir=[[47,88,70],[53,95,73],[60,103,74]];
const short=[[74,98,48],[118,127,58],[151,134,67]];
const planted=new PlantPositions();
const clearance=plantingSpace(buildings,roads,[],[[...home,13],[...spawn,5],
  ...deliveries.map(d=>[...d.customer,3.8])],footballPitches(props));
const shade=(c,f)=>[...c.map(v=>Math.round(Math.min(255,v*f))),255];

function tile(x,z) {
  const u=Math.floor(x/52),v=Math.floor(z/52),key=`${u}_${v}`;
  if(!tiles.has(key)) tiles.set(key,{x:u*52,z:v*52,points:[],color:[],indices:[]});
  return tiles.get(key);
}

function vertex(t,[x,y,z],color) {
  const i=t.points.length/3;
  t.points.push(x-t.x,y,z-t.z);
  t.color.push(...color);
  return i;
}

function frustum(t,from,to,base,tip,sides,turn,paint) {
  const rings=[[],[]];
  for(let i=0;i<sides;i++) {
    const a=turn+i*2*Math.PI/sides;
    const dx=Math.cos(a),dz=Math.sin(a);
    const light=0.79+0.26*Math.max(0,dx*0.79+dz*0.62);
    rings[0].push(vertex(t,[from[0]+dx*base,from[1],from[2]+dz*base],shade(paint,0.88*light)));
    rings[1].push(vertex(t,[to[0]+dx*tip,to[1],to[2]+dz*tip],shade(paint,light)));
  }
  for(let i=0;i<sides;i++) {
    const j=(i+1)%sides;
    t.indices.push(rings[0][i],rings[1][i],rings[1][j],rings[0][i],rings[1][j],rings[0][j]);
    if(i>1) t.indices.push(rings[0][0],rings[0][i],rings[0][i-1],
      rings[1][0],rings[1][i-1],rings[1][i]);
  }
}

function crown(t,x,y,z,radius,height,paint,rotation,sides=6) {
  const bottom=vertex(t,[x,y-height*0.50,z],shade(paint,0.61));
  const top=vertex(t,[x+radius*0.16,y+height*0.65,z],shade(paint,1.22));
  const ring=[];
  for(let i=0;i<sides;i++) {
    const a=rotation+i*2*Math.PI/sides;
    const xOffset=Math.cos(a)*radius*(0.79+r()*0.29),zOffset=Math.sin(a)*radius*(0.72+r()*0.28);
    ring.push(vertex(t,[x+xOffset,y+height*(r()-0.5)*0.43,z+zOffset],
      shade(paint,0.91+0.15*Math.cos(a-0.71)+0.14*r())));
  }
  for(let i=0;i<sides;i++) {
    const j=(i+1)%sides;
    t.indices.push(bottom,ring[i],ring[j],top,ring[j],ring[i]);
  }
}

function tree(x,y,z,height,stem,maxRadius) {
  if(x<bounds[0]||x>bounds[2]||z<bounds[1]||z>bounds[3]) return;
  if(planted.near(x,z,1.25)) return;
  planted.add(x,z);
  const t=tile(x,z),turn=r()*Math.PI*2;
  const {bare,vigor}=soilPattern(x,z);
  const dice=r(),conifer=dice>0.84-treeHabitat(x,z)*0.13;
  const withered=dice<0.036+bare*0.09;
  const radius=Math.min(maxRadius,Math.max(1.42,height*(conifer?0.22:0.255)));
  const leanX=(r()-0.5)*height*0.11,leanZ=(r()-0.5)*height*0.11;
  frustum(t,[x,y-0.15,z],[x+leanX,y+height*(withered?0.96:0.73),z+leanZ],
    Math.min(stem,0.47),0.046,5,turn,withered?dead:bark);
  if(withered) {
    for(let i=0;i<5;i++) {
      const a=turn+i*2.4;
      const u=0.42+i*0.079;
      frustum(t,[x+leanX*u,y+height*u,z+leanZ*u],
        [x+leanX+Math.cos(a)*radius*0.86,y+height*(u+0.19),z+leanZ+Math.sin(a)*radius*0.86],
        0.11,0.014,4,a,dead);
    }
  } else if(conifer) {
    const paint=fir[Math.floor(r()*fir.length)];
    for(let i=0;i<5;i++) {
      const u=0.24+i*0.144;
      frustum(t,[x+leanX*u,y+height*u,z+leanZ*u],
        [x+leanX*(u+0.25),y+height*(u+0.20),z+leanZ*(u+0.25)],
        radius*(1.12-i*0.185),0.035,6,turn+0.41*i,paint);
    }
  } else {
    const paint=foliage[Math.min(foliage.length-1,Math.floor((vigor*0.47+r()*0.52)*foliage.length))];
    crown(t,x+leanX,y+height*0.84,z+leanZ,radius*0.93,height*0.25,paint,turn);
    for(let i=0;i<4;i++) {
      const a=turn+i*Math.PI*0.5;
      const branch=radius*(0.51+r()*0.19);
      const from=[x+leanX*0.55,y+height*0.52,z+leanZ*0.55];
      const end=[x+leanX+Math.cos(a)*branch,y+height*(0.63+r()*0.13),z+leanZ+Math.sin(a)*branch];
      frustum(t,from,end,stem*0.43,0.029,4,a,bark);
      crown(t,end[0],end[1]+height*0.048,end[2],radius*(0.61+r()*0.18),height*0.23,paint,a);
    }
  }
}

for(const [x,y,z,h,radius,,crownLimit] of json('south-vacant-trees.json')) tree(x,y,z,h,radius,crownLimit);
for(const [x,z,w,d,,isTree] of solids) {
  const floor=isTree&&w>0.03&&d>0.03?sample(x,z):null;
  if(!floor) continue;
  tree(x,floor.y,z,7.5+r()*10.8,Math.min(0.38,Math.max(w,d)),2.7+r());
}
for(let a=bounds[0];a<bounds[2];a+=3.82) for(let b=bounds[1];b<bounds[3];b+=3.82) {
  const x=a+r()*3.7,z=b+r()*3.7;
  const floor=sample(x,z);
  if(floor?.kind!==1 || !clearance.clear(x,z,0.38)) continue;
  const {bare,vigor}=soilPattern(x,z);
  if(r()<0.34+bare*0.41) continue;
  const t=tile(x,z),paint=short[Math.floor(r()*short.length)];
  if(r()<0.38+vigor*0.31 && !planted.near(x,z,1.24)) {
    const s=0.36+r()*0.81;
    crown(t,x,floor.y+s*0.43,z,s,s*0.78,paint,r()*6.28,5);
    if(s>0.89) crown(t,x+0.43,floor.y+s*0.48,z+0.35,s*0.63,s*0.94,paint,r()*6.28,5);
  } else {
    for(let i=0;i<3;i++) {
      const turn=r()*6.28,x0=x+(r()-0.5)*0.31,z0=z+(r()-0.5)*0.31;
      const dx=Math.cos(turn)*0.08,dz=Math.sin(turn)*0.08;
      t.indices.push(vertex(t,[x0-dx,floor.y-0.03,z0-dz],shade(paint,0.63)),
        vertex(t,[x0+dx,floor.y-0.03,z0+dz],shade(paint,0.75)),
        vertex(t,[x0+dz*1.6,floor.y+0.16+r()*0.55,z0-dx*1.6],shade(paint,1.14)));
    }
  }
}
const glb=new Glb();
glb.data.materials=[{name:'RetroVegetation',doubleSided:true}];
let faces=0;
for(const [key,t] of tiles) {
  glb.mesh(`Retro_${key.replaceAll('-','n')}`,Float32Array.from(t.points),t.indices,0,
    {colors:Uint8Array.from(t.color),translation:[t.x,0,t.z]});
  faces+=t.indices.length/3;
}
writeFileSync(new URL('south-retro-vegetation.glb',assets),glb.encode());
console.log(`Vegetation: ${faces} triangles across ${tiles.size} tiles`);
