// Accessible parking side on class 6/7 drives and original rich-tip building centres.
import {readFile,writeFile} from 'node:fs/promises';
import city from '../../src/maps/seversk/city-data.js';
const assets=new URL('../assets/',import.meta.url);
const r=JSON.parse(await readFile(new URL('south-region.json',assets)));
const [ox,oz]=r.origin;
const physical=r.buildings.map(b=>b.outline);
const distance=(p,a,b)=>{
 const x=b[0]-a[0],z=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*z)/(x*x+z*z||1)));
 return Math.hypot(a[0]+u*x-p[0],a[1]+u*z-p[1]);
};
function inside(p,poly){
 let v=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])v=!v;
 }return v;
}
const round=n=>Math.round(n*1000)/1000;
const free=(p,pad)=>physical.every(poly=>!inside(p,poly)&&poly.every((a,i)=>distance(p,a,poly[(i+1)%poly.length])>pad));
const lanes=r.roads.filter(s=>s.class<=5).flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i],b,limit:s.width/2+5})));
const sites=[];
for(const s of r.roads.filter(s=>s.class>=6&&!s.deck_y)){
 for(let i=1;i<s.points.length;i++){
  const a=s.points[i-1],b=s.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
  if(l<9)continue;
  const ux=dx/l,uz=dz/l,n=Math.max(1,Math.round(l*.7/15));
  for(let j=0;j<n;j++)for(const side of [-1,1]){
   const t=.15+.7*(j+.5)/n,nx=-uz*side,nz=ux*side;
   const x=a[0]+dx*t+nx*(s.width/2-.95),z=a[1]+dz*t+nz*(s.width/2-.95),px=x+nx*1.75-ux*.4,pz=z+nz*1.75-uz*.4;
   if(!inside([x,z],r.boundary)||r.boundary.some((b,k,p)=>distance([x,z],b,p[(k+1)%p.length])<15))continue;
   if(lanes.some(q=>distance([x,z],q.a,q.b)<q.limit)||!free([x,z],1.2)||!free([px,pz],.4))continue;
   if([-2.4,2.4].some(d=>[-1,1].some(w=>!free([x+d*ux+w*nx,z+d*uz+w*nz],.3))))continue;
   sites.push([x,z,Math.atan2(ux,uz),px,pz,Math.atan2(nx,nz)].map(round));
  }
 }
}
const ids=new Set(r.buildings.map(b=>b.id));
const posh=city.buildings.filter(b=>ids.has(b.id)&&(b.k==='off'||b.st==='stalin')).map(b=>
 b.p.reduce((a,q)=>[a[0]+q[0]/b.p.length,a[1]+q[1]/b.p.length],[-ox,-oz]).map(round));
await writeFile(new URL('summer_chauffeur.json',assets),JSON.stringify({sites,posh})+'\n');
console.log(sites.length,'eligible parking positions;',posh.length,'office or Stalin-era buildings');
