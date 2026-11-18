// Extract only reachable South sites from a running v0.36.0 state captured after LATE.left()==0.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {bench,kit} from '../../src/game/propvar.js';
const assets=new URL('../assets/',import.meta.url);
const read=async(name)=>JSON.parse(await readFile(new URL(name+'.json',assets)));
const [region,props]=await Promise.all([read('south-region'),read('south-breakables')]);
const reference=JSON.parse(await readFile(process.argv[2],'utf8'));
if(reference.version!=='v0.36.0' || reference.late!==0)throw Error('Expected a complete v0.36.0 world');
const [ox,oz]=region.origin, border=region.boundary;
const round=n=>Math.round(n*1000)/1000;
const at=q=>[round((q.x??q.cx)-ox),round((q.z??q.cz)-oz)];
function inside(q){
 const [x,z]=at(q);let result=false;
 for(let i=0,j=border.length-1;i<border.length;j=i++){
  const a=border[i],b=border[j];
  if((a[1]>z)!=(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
 }
 return result;
}
const same=(p,q,r)=>Math.hypot(p[0]-q[0],p[1]-q[1])<r;
const solids=await read('south-physics-source');
const posts=solids.solids.filter(q=>q[2]===.12 && q[3]===.12);
const gym=reference.gym.filter(inside).map(s=>({at:at(s),axis:[round(s.ux),round(s.uz)],color:s.paint,
 baked:posts.some(p=>same(p,[at(s)[0]-2*s.ux,at(s)[1]-2*s.uz],.07))}));
const kites=reference.kites.filter(inside).map(s=>({at:at(s),kite:s.kite,wind:round(s.wind),color:s.hex}));
const goals=props.filter(s=>s.kind==='goal').map(s=>[s.at[0],s.at[2]]);
const pitches=reference.pitches.filter(inside).map(s=>({at:at(s),axis:[round(s.ux),round(s.uz)],length:round(s.L),width:round(s.W),
 baked:goals.some(p=>same(p,[at(s)[0]+s.ux*s.L*.5,at(s)[1]+s.uz*s.L*.5],1.5)||same(p,[at(s)[0]-s.ux*s.L*.5,at(s)[1]-s.uz*s.L*.5],1.5))}));
const courts=reference.courts.filter(inside);
await writeFile(new URL('summer_park.json',assets),JSON.stringify({gym,kites,pitches,courts})+'\n');
const yards=await read('summer_yards');
yards.spots=yards.spots.filter(s=>s.kind!=='bench');
const captured=props.filter(s=>s.kind==='bench');
// The South delivery district uses the original mid-town palette.
const fvar=await readFile(new URL('../../src/game/fencevar.js',import.meta.url),'utf8');
const variant=runInNewContext(fvar.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nitem;', {CLEAN:null,distHas:()=>true,distAt:()=>0});
const benchStyles=[],stylesByParts=new Map();
const benches=reference.benches.filter(inside).map((s,i)=>{
 const point=at(s);
 const prop=captured.find(p=>same(point,[p.at[0],p.at[2]],.1));
 const style=variant('bench',s.x,s.z,'#8a6b4e');
 const raw={at:point,face:round(s.ry),kind:'bench',id:prop?.id??(-i-1),seat:style.form};
 if(prop)return raw;
 const parts=bench(kit(),{...style,k:s.seatF?1.08:1}).P.map(p=>[p.w,p.h,p.d,p.c,p.x,p.y,p.z,p.rx,p.ry,p.rz].map(n=>typeof n==='number'?round(n):n));
 const key=JSON.stringify(parts);
 if(!stylesByParts.has(key)){stylesByParts.set(key,benchStyles.length);benchStyles.push(parts);}
 raw.style=stylesByParts.get(key);
 return raw;
});
yards.spots.push(...benches);
yards.bench_models=benchStyles;
yards.hookah=reference.hookah.filter(s=>inside(s.b)).map(s=>{
 const anchor=benches.find(b=>same(at(s.b),b.at,.03));
 if(!anchor)throw Error('Hookah without bench');
 return {id:anchor.id,n:s.n};
});
await writeFile(new URL('summer_yards.json',assets),JSON.stringify(yards)+'\n');
console.log({gym:gym.length,kites:kites.length,pitches:pitches.length,courts:courts.length,benches:benches.length,hookah:yards.hookah.length});
