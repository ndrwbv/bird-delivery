// Select open/plated balconies with the released building and balcony rules.
// Existing captured geometry supplies the exact slab height inside the fully baked neighbourhood.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const assets=new URL('../assets/',import.meta.url);
const r=JSON.parse(await readFile(new URL('south-region.json',assets)));
const [ox,oz]=r.origin;
const reference=JSON.parse(await readFile(process.argv[2],'utf8'));
if(reference.version!=='v0.36.0'||reference.late!==0)throw Error('Expected a complete v0.36.0 world');
const original=await readFile(new URL('south-original.glb',assets)),size=original.readUInt32LE(12);
const glb=JSON.parse(original.subarray(20,20+size)),bin=original.subarray(28+size);
const meshMap=new Map();
function accessor(i) {
  const a=glb.accessors[i],b=glb.bufferViews[a.bufferView];
  const ctor=({5126:Float32Array,5125:Uint32Array,5123:Uint16Array})[a.componentType];
  return new ctor(bin.buffer,bin.byteOffset+(b.byteOffset||0)+(a.byteOffset||0),a.count*(a.type==='VEC3'?3:1));
}
for(const mesh of glb.meshes)for(const p of mesh.primitives){
  if(!['City','Flat'].includes(glb.materials[p.material]?.name))continue;
  const xyz=accessor(p.attributes.POSITION),ids=accessor(p.indices);
  for(let i=0;i<ids.length;i+=3){
    const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3;
    if(Math.abs(xyz[a+1]-xyz[b+1])>.007||Math.abs(xyz[a+1]-xyz[c+1])>.007)continue;
    const triangle=[a,b,c];
    const edges=triangle.map((j,k)=>[j,triangle[(k+1)%3],Math.hypot(xyz[j]-xyz[triangle[(k+1)%3]],xyz[j+2]-xyz[triangle[(k+1)%3]+2])]).sort((p,q)=>p[2]-q[2]);
    if(Math.abs(edges[0][2]-1.05)>.02 || Math.abs(edges[1][2]-2.75)>.03)continue;
    const [u,v]=edges[2],x=(xyz[u]+xyz[v])*.5,z=(xyz[u+2]+xyz[v+2])*.5,k=Math.round(x*3)+'/'+Math.round(z*3),y=xyz[u+1];
    if(!meshMap.has(k))meshMap.set(k,[]);
    meshMap.get(k).push(y);
  }
}
function ground(x,z) {
 const t=r.terrain,gx=(x-t.x)/t.step,gz=(z-t.z)/t.step,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
 const i=ix+iz*t.width,[a,b,c,d]=[t.heights[i],t.heights[i+1],t.heights[i+t.width],t.heights[i+t.width+1]];
 return u>=v?a+(b-a)*u+(d-b)*v:a+(d-c)*u+(c-a)*v;
}
function centroid(p){
 let s=0,x=0,z=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],k=a[0]*b[1]-b[0]*a[1];s+=k;x+=(a[0]+b[0])*k;z+=(a[1]+b[1])*k;}
 return [x/(3*s),z/(3*s),s>=0?1:-1];
}
const src=await readFile(new URL('../../src/game/balconies.js',import.meta.url),'utf8');
const constants=src.slice(src.indexOf('export const BALC ='),src.indexOf('if (CLEAN) BALC.')).replace('export ','')
 +src.slice(src.indexOf('const SIDING ='),src.indexOf('export const ST')).replaceAll('export ','').replace(/const OLDCOL = .*?;/,'const OLDCOL = false;');
const fns=src.slice(src.indexOf('const hsh ='),src.indexOf('export function setup'));
const code=src.slice(src.indexOf('function wallIn'),src.indexOf('/* Перестройка дома'));
const rows=[];
const vm=runInNewContext(constants+fns+'\n'+code+'\nwallIn;',{
 ST:{skipped:0},one(w,o,b){
  const x=w.a[0]-ox+w.ux*b.c,z=w.a[1]-oz+w.uz*b.c,core=r.core_bounds;
  const built=x>=core[0]&&z>=core[1]&&x<=core[2]&&z<=core[3];
  if(built)return;
  const y=b.Y+.02;
  const color=parseInt((b.railHex||'#a89e90').replace('#',''),16);
  const sd=b.side*Math.sign(w.ux*w.oz-w.uz*w.ox||1);
  const kind=b.glazed?0:b.rail==='grate'?2:1;
  rows.push([x,y,z,w.ox,w.oz,sd,color,kind,b.h,built?1:0]);
 }});
for(const building of r.buildings){
 if(building.kind!=='res')continue;
 const lv=Math.round((building.height-1.1)/3.15);
 if(lv<3)continue;
 const poly=building.outline.map(([x,z])=>[x+ox,z+oz]),[cx,cz,sign]=centroid(poly);
 const base=Math.max(...building.outline.map(([x,z])=>ground(x,z)));
 for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<=16)continue;
   const ux=dx/len,uz=dz/len,cols=Math.floor((len-1)/3);
   vm({a,len,ux,uz,ox:sign*uz,oz:-sign*ux},{seed:Math.abs(Math.round(cx*7+cz*13)),cols,pad:(len-3*cols)/2,step:3,floors:Math.min(lv,16),
     base,FH:3.15,inArch:()=>false,shopHit:()=>false,wallHex:building.color,gaps:[]});
 }
}
// Use the original resident registry in the captured centre. Only allow a
// physical slab also present in our baked mesh and take its actual height.
for(const s of reference.balc){
  if(s.h*7.3%1>.22)continue;
  const sd=-Math.sign((s.x-s.dx)*s.oz-(s.z-s.dz)*s.ox);
  const x=s.x-ox-s.ox*.62-s.oz*sd*.25,z=s.z-oz-s.oz*.62+s.ox*sd*.25;
  const [x0,z0,x1,z1]=r.core_bounds;
  if(x<x0||z<z0||x>x1||z>z1)continue;
  const k=Math.round((x+s.ox*.525)*3)+'/'+Math.round((z+s.oz*.525)*3);
  const heights=meshMap.get(k)||[],y=s.y+r.water_y;
  if(!heights.length)continue;
  const slab=heights.reduce((best,next)=>Math.abs(next-y)<Math.abs(best-y)?next:best);
  if(Math.abs(slab-y)>.4)continue;
  rows.push([x,slab,z,s.ox,s.oz,sd,0,1,s.h,1]);
}
const tiles=new Map();
for(const row of rows) {
  const [x,y,z,nx,nz,sd,rgb,kind,h,baked]=row,key=Math.floor(x/88)+'/'+Math.floor(z/88);
  if(!tiles.has(key))tiles.set(key,{bins:[[],[],[]],people:[]});
  const tile=tiles.get(key);
  if(!baked) {
    // Godot MultiMesh 3D stores the three transform rows followed by an instance custom colour.
    const srgb=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
    tile.bins[kind].push(nz,0,nx,x, 0,1,0,y, -nx,0,nz,z, srgb(((rgb>>16)&255)/255),srgb(((rgb>>8)&255)/255),srgb((rgb&255)/255),1);
  }
  if(kind && (h*7.3)%1<=.22)tile.people.push(x,y,z,nx,nz,sd,h);
}
const catalog={},buffers=[];let bytes=0;
for(const [key,t] of tiles){
  const sections=[];
  for(const data of [...t.bins,t.people]){
    const buf=Buffer.from(Float32Array.from(data).buffer);sections.push([bytes,buf.length]);buffers.push(buf);bytes+=buf.length;
  }
  catalog[key]=sections;
}
await writeFile(new URL('summer_balconies.bin',assets),Buffer.concat(buffers));
await writeFile(new URL('summer_balconies.json',assets),JSON.stringify(catalog)+'\n');
console.log(rows.length,'balconies,',tiles.size,'sectors,',rows.filter(row=>row[9]).length,'occupied candidates matched to original slabs');
