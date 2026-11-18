// Summer beach furniture, kiosk, collision footprints and guest positions from the released factories. Run from any directory.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const capturePath=process.argv[2] ? resolve(process.argv[2]) : null;
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
import vm from 'node:vm';
const THREE=await import(new URL('../../src/vendor/three.module.min.js',import.meta.url));
const src=readFileSync('src/game/beach.js','utf8'),region=JSON.parse(readFileSync('godot/assets/south-region.json'));
const t=region.terrain,w=region.water_y;
const heightPath='godot/assets/south-beach-height.json';
if(capturePath){
 const capture=JSON.parse(readFileSync(capturePath));
 const grid=capture.shoreHeight??capture;
 const height={
  ...grid,
  x:grid.x-region.origin[0], z:grid.z-region.origin[1],
  heights:grid.heights.map(y=>Number((y-region.source_y).toFixed(3))),
 };
 writeFileSync(heightPath,JSON.stringify(height)+'\n');
}
const shore=existsSync(heightPath) ? JSON.parse(readFileSync(heightPath)) : null;
function surface(grid,x,z){
 const gx=(x-grid.x)/grid.step, gz=(z-grid.z)/grid.step;
 const ix=Math.min(grid.width-2,Math.floor(gx)), iz=Math.min(grid.depth-2,Math.floor(gz));
 const i=ix+iz*grid.width, u=gx-ix, v=gz-iz;
 const a=grid.heights[i], b=grid.heights[i+1], c=grid.heights[i+grid.width], d=grid.heights[i+grid.width+1];
 return u>=v ? a+(b-a)*u+(d-b)*v : a+(d-c)*u+(c-a)*v;
}
function ground(x,z){
 const base=surface(t,x,z);
 if(!shore) return base-w;
 const edge=Math.min(x-shore.x,z-shore.z,shore.x+(shore.width-1)*shore.step-x,shore.z+(shore.depth-1)*shore.step-z);
 if(edge<=0) return base-w;
 const t0=Math.min(1,edge/12), blend=t0*t0*(3-2*t0);
 return base+(surface(shore,x,z)-base)*blend-w;
}
const along=new THREE.Vector2(.459,.888).normalize();const SITE={cx:region.beach[0],cz:region.beach[1],ux:along.x,uz:along.y,nx:along.y,nz:-along.x};
const W=(a,b)=>[SITE.cx+a*SITE.ux+b*SITE.nx,SITE.cz+a*SITE.uz+b*SITE.nz];
const hash=(x,z,k=0)=>{let h=Math.sin(x*12.9898+z*78.233+k*37.719)*43758.5453;return h-Math.floor(h)};
const all=[], summer=[],collisions=[],smash=[],towels=[],props=[];
const api={groundH:ground,LIT:[],scene:{add(){}},boxGeo:(w,h,d)=>new THREE.BoxGeometry(w,h,d),
 put(list,g,color,x=0,y=0,z=0,rx=0,ry=0,rz=0){g=g.clone();g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx,ry,rz,'XYZ')));g.translate(x,y,z);g.userData.color=color;list.push(g);all.push(g);},
 obb(x,z,xr,zr,yaw){collisions.push({x,z,xr,zr,yaw})},
 mergeGeos(list){if(!summer.length)summer.push(...list);let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));return g},
 smashMesh(kind,x,z,r,m,v0,nv,hex){smash.push({kind,x,z,r,v0,nv,hex});return smash.at(-1)}
};
const kioskScript=src.slice(src.indexOf('function kioskBuild'),src.indexOf('/* места под полотенце')).replace(/  \/\/ вывеска[\s\S]*?(?=  \/\/ ставни)/,'');
const ctx={THREE,SITE,SHAPE:{OUT:1.5/.045},W,hash,A:api,PROPS:props,NPC_TOWELS:towels,STATS:{},ITEMS:[]};
vm.createContext(ctx);vm.runInContext('let SUMMER_MESH,SUMMER_POS,SHUT_MESH,KIOSK;'+src.slice(src.indexOf('function summerBuild'),src.indexOf('/* ларёк «Квас'))+kioskScript+';summerBuild(); kioskBuild();this.kiosk=KIOSK;',ctx);
const {kiosk}=ctx,ids=new Map();let idx=0;
for(const g of summer){const i=smash.findIndex(q=>idx>=q.v0 && idx<q.v0+q.nv);ids.set(g,i+1);idx+=g.attributes.position.count;}
const fields=[[],[],[],[],[]]; const v=new THREE.Vector3(),norm=new THREE.Vector3();const centers=smash.map(s=>[s.x,ground(s.x,s.z)+w,s.z]);
for(const g of all){const idx=g.index, pos=g.attributes.position, nrm=g.attributes.normal,col=new THREE.Color(g.userData.color);let id=ids.get(g)||0;
 if(!ids.has(g) && g===all.find(x=>x.userData.color==='#7f8a90'))id=63;
 const n=idx?idx.count:pos.count, pivot=id>0&&id<63?centers[id-1]:[0,0,0];
 for(let j=0;j<n;j+=3)for(const k of [0,2,1]){
  const i=idx?idx.getX(j+k):j+k;v.fromBufferAttribute(pos,i);norm.fromBufferAttribute(nrm,i);
  fields[0].push(v.x-SITE.cx,v.y+w,v.z-SITE.cz);fields[1].push(norm.x,norm.y,norm.z);fields[2].push(col.r,col.g,col.b,1);
  fields[3].push(id,pivot[1]);fields[4].push(pivot[0]-SITE.cx,pivot[2]-SITE.cz);
 }
}
writeFileSync('godot/assets/summer_shore.bin',Buffer.concat(fields.map(f=>Buffer.from(Float32Array.from(f).buffer))));
const meta={kiosk:{at:[kiosk.x,kiosk.z],heading:kiosk.ry,seller:kiosk.P(0,.2),buyer:kiosk.P(0,2.3),sign:kiosk.P(0,1.27)},towels,obstacles:collisions,avoid:props,breakable:smash.map(({kind,x,z,r,hex})=>({kind,at:[x,z],r,hex}))};
writeFileSync('godot/assets/summer_shore.json',JSON.stringify(meta));
console.log(towels.length,smash.length,fields[0].length/3);
