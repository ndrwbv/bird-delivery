// Released placement functions, item meshes, lines and character blocking, evaluated without running the game.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const assets=new URL('../assets/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name+'.json',assets)));
const [r,physics,parts,boxes]=await Promise.all(['south-region','south-physics-source','south-breakables','south-breakable-collision'].map(read));
const src=await readFile(new URL('../../src/game/yardlife.js',import.meta.url),'utf8');
const en=JSON.parse(await readFile(new URL('../../src/i18n/en.json',import.meta.url)));
const [ox,oz]=r.origin;
const grid=new Map(), scale=48;
function index(item,x0,z0,x1,z1) {
  for(let x=Math.floor(x0/scale);x<=Math.floor(x1/scale);x++) for(let z=Math.floor(z0/scale);z<=Math.floor(z1/scale);z++) {
    const k=x+'/'+z;
    if(!grid.has(k))grid.set(k,[]);
    grid.get(k).push(item);
  }
}
function polygon(p,item,margin=8) {
  const xx=p.map(v=>v[0]),zz=p.map(v=>v[1]);
  index(item,Math.min(...xx)-margin,Math.min(...zz)-margin,Math.max(...xx)+margin,Math.max(...zz)+margin);
}
for(const b of r.buildings)polygon(b.outline,{house:b.outline});
for(const p of r.parking_lots)polygon(p.outline,{park:p.outline});
for(const s of r.roads)for(let i=1;i<s.points.length;i++)polygon([s.points[i-1],s.points[i]],{road:s,p:s.points[i-1],q:s.points[i]},15);
for(const s of physics.solids){const [x,z,w,d,ry]=s,k=Math.hypot(w,d)+2;index({solid:[x,z,w,d,ry]},x-k,z-k,x+k,z+k);}
for(const s of parts){const [x,y,z]=s.at,k=s.radius+2;index({prop:[x,z,s.radius]},x-k,z-k,x+k,z+k);}
const near=(x,z)=>grid.get(Math.floor((x-ox)/scale)+'/'+Math.floor((z-oz)/scale))||[];
function dist(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-dx*u,z-a[1]-dz*u);
}
function poly(x,z,p,m=0) {
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i],b=p[j];
    if(m && dist(x,z,a,b)<m)return true;
    if((a[1]>z)!=(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const A={
 CITY:{entrances:r.entrances.map(([x,z,nx,nz])=>[x+ox,z+oz,nx,nz])}, ADULT:true,
 groundH(x,z){const g=r.terrain;const i=Math.round((x-ox-g.x)/g.step),j=Math.round((z-oz-g.z)/g.step);return (g.heights[i+j*g.width]??r.water_y)-r.water_y;},
 inBounds:(x,z)=>poly(x-ox,z-oz,r.boundary),
 inHouse:(x,z,m)=>near(x,z).some(o=>o.house && poly(x-ox,z-oz,o.house,m)),
 nearestRoad(x,z,max){let best=null;for(const o of near(x,z)){if(!o.road||o.road.class>max)continue;const d=dist(x-ox,z-oz,o.p,o.q);if(!best||d<best.d)best={d,seg:{w:o.road.width,c:o.road.class}};}return best;},
 solidAt:(x,z,m)=>near(x,z).some(o=>{if(!o.solid)return false;const [px,pz,w,d,ry]=o.solid,dx=x-ox-px,dz=z-oz-pz;return Math.abs(dx*Math.cos(ry)-dz*Math.sin(ry))<w+m && Math.abs(dx*Math.sin(ry)+dz*Math.cos(ry))<d+m;})
};
const blocks=(x,z,m)=>near(x,z).some(o=>o.park?poly(x-ox,z-oz,o.park,m):o.prop && Math.hypot(x-ox-o.prop[0],z-oz-o.prop[1])<o.prop[2]+m);
const onPave=(x,z,m)=>{const road=A.nearestRoad(x,z,12);return road && road.d<road.seg.w*.5+m;};
const code=src.slice(src.indexOf('function ptOk'),src.indexOf('function walkPt'));
const checks={YCARS:{blocks},YARDS:{blocks},YMAZE:{blocks},COURTS:{blocks},LAWNP:{busy:blocks}};
const places=runInNewContext(code+'\nA.CITY.entrances.map((e,i)=>[yardSpot(i),doorSpot(i)]);',{
 A,...checks,onPave,performance,SPOT:new Map(),DOOR:new Map(),ST:{},hsh:(x,z,k)=>{const n=Math.sin(x*12.9898+z*78.233+k*37.719)*43758.5453;return n-Math.floor(n);}
});
const round=n=>Math.round(n*1000)/1000;
const spots=[];
for(const [yard,door] of places){for(const [s,kind] of [[yard,'yard'],[door,'door']])if(s)spots.push({at:[round(s.x-ox),round(s.z-oz)],face:round(s.face),kind,big:!!s.big});}
const byId=new Map(boxes.map(b=>[b[0],b]));
for(const s of parts.filter(q=>q.kind==='bench')) {
  const b=byId.get(s.id); if(b)spots.push({at:[s.at[0],s.at[2]],face:b[7],kind:'bench',id:s.id});
}
for(const b of r.buildings.filter(b=>b.kind==='gar' && b.door && b.approach)) {
  const [x,z]=b.door,[ex,ez]=b.approach,d=Math.hypot(ex-x,ez-z)||1;
  const px=x+(ex-x)*3.8/d,pz=z+(ez-z)*3.8/d;
  if(!blocks(px+ox,pz+oz,.7))spots.push({at:[round(px),round(pz)],face:Math.atan2(x-px,z-pz),kind:'garage'});
}
function block(from,to){return src.slice(src.indexOf(from),src.indexOf(to));}
const lex=runInNewContext(block('const LINES =','const COL =')+'\nLINES;',{N_:s=>s});
const weights=runInNewContext(block('const KIND =','/* реплики')+'\nKIND;');
const props=runInNewContext(block('function mangal','/* ── люди')+'\n({shashlik:mangal(),domino:dominoTable()});',{
 propMesh(fn){const out=[];fn((w,h,d,color,x,y,z,rx=0,ry=0,rz=0)=>out.push([w,h,d,color,x,y,z,rx,ry,rz]));return out;}
});
await writeFile(new URL('summer_yards.json',assets),JSON.stringify({spots,weights,props,lines:lex,en:Object.fromEntries(Object.values(lex).flat().filter(s=>en[s]).map(s=>[s,en[s]]))})+'\n');
