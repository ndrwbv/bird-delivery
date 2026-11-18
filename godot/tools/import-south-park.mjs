// Reuse released park-placement routines on the clipped native map. No renderer is required.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const assets = new URL('../assets/',import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name,assets),'utf8'));
const [r,physics,benches] = await Promise.all([read('south-region.json'),read('south-physics-source.json'),read('south-event-sites.json')]);
const source = name => readFile(new URL('../../src/game/'+name+'.js',import.meta.url),'utf8');
const [game,kites,workout] = await Promise.all(['game','kites','workout'].map(source));
const [ox,oz] = r.origin;
const global = ([x,z]) => [x+ox,z+oz];
const local = ([x,z]) => [x-ox,z-oz];
const round = n => Math.round(n*1000)/1000;
const localPoint = (x,z) => local([x,z]).map(round);
const roads = r.roads.map(s=>({p:s.points.map(global),w:s.width,c:s.class,n:s.name}));
const green = r.greens.map(s=>({p:s.outline.map(global),k:s.kind,n:s.name}));
const buildings = r.buildings.map(s=>s.outline.map(global));
function dist(x,z,a,b) {
  const dx=b[0]-a[0], dz=b[1]-a[1], u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);
}
function inside(x,z,p) {
  let c=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const a=p[i],b=p[j];
    if ((a[1]>z)!=(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) c=!c;
  }
  return c;
}
function nearPoly(x,z,p,pad) {
  return inside(x,z,p) || p.some((v,i)=>dist(x,z,v,p[(i+1)%p.length])<pad);
}
function nearestRoad(x,z,maxClass) {
  let best=Infinity, seg=null;
  for(const road of roads) {
    if(road.c>maxClass)continue;
    for(let i=1;i<road.p.length;i++){
      const d=dist(x,z,road.p[i-1],road.p[i]);
      if(d<best){best=d;seg=road;}
    }
  }
  return seg ? {d:best,seg}:null;
}
const api = {CITY:{roads,green},BENCHES:benches.benches.map(global).map(([x,z])=>({x,z})),PITCHES:[],
  inHouse:(x,z,m)=>buildings.some(p=>nearPoly(x,z,p,m)),
  groundH(x,z){
    const g=r.terrain,[px,pz]=local([x,z]);
    const i=Math.max(0,Math.min(g.width-1,Math.round((px-g.x)/g.step))),j=Math.max(0,Math.min(g.depth-1,Math.round((pz-g.z)/g.step)));
    return g.heights[i+j*g.width]-r.water_y;
  },
  nearestRoad,
  onPave(x,z,pad){ const n=nearestRoad(x,z,11); return n && n.d<n.seg.w/2+pad; },
  wood:(x,z,m)=>green.some(g=>g.k==='wood' && nearPoly(x,z,g.p,m)),
  solidAt(x,z,m){
    const [px,pz]=local([x,z]);
    return physics.solids.some(([qx,qz,a,b,yaw])=>{
      if (a===.12 && b===.12) return false;
      const dx=px-qx,dz=pz-qz,c=Math.cos(yaw),s=Math.sin(yaw);
      return Math.abs(dx*c-dz*s)<a+m && Math.abs(dx*s+dz*c)<b+m;
    });
  }, box(){}, obb(){}
};
function pitchAt(cx,cz,ang,L,W){
  const ux=Math.cos(ang),uz=Math.sin(ang),nx=-uz,nz=ux;
  if(api.PITCHES.some(s=>Math.hypot(cx-s.cx,cz-s.cz)<30))return false;
  for(const [a,b] of [[0,0],[-L/2-1,-W/2-1],[L/2+1,-W/2-1],[-L/2-1,W/2+1],[L/2+1,W/2+1]]){
    const x=cx+a*ux+b*nx,z=cz+a*uz+b*nz,road=nearestRoad(x,z,7);
    if(api.inHouse(x,z,.5) || (road && road.d<road.seg.w/2+.8))return false;
  }
  api.PITCHES.push({cx,cz,ux,uz,nx,nz,L,W}); return true;
}
const pitches=game.slice(game.indexOf('function* osmPitches'),game.indexOf('/* игра: трое на трое'));
runInNewContext(pitches+'\nArray.from(osmPitches());',{CITY:api.CITY,RINK:null,INTRO:false,pitchAt,inPoly:inside});
const barSource = workout.slice(workout.indexOf('export const WO'),workout.indexOf('/* ── люди:')).replaceAll('export ','');
let bars=runInNewContext(barSource+'\nbuild(api); SITES;',{api});
const kiteSource = kites.slice(kites.indexOf('export const KT'),kites.indexOf('/* ── общие геометрии')).replaceAll('export ','');
const flights=runInNewContext(kiteSource+'\nA=api;findSpots();SPOTS;',{api});
// The core already contains the original painted iron and its six solid posts.
const gym=bars.map(s=>({at:localPoint(s.x,s.z),axis:[round(s.ux),round(s.uz)],color:s.paint,baked:false}));
const posts=physics.solids.filter(s=>s[2]===.12&&s[3]===.12);
for(let i=0;i+5<posts.length;i+=6){
  const p=posts[i],q=posts[i+1],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
  if(Math.abs(length-1.4)>.03) continue;
  const axis=[(q[0]-p[0])/length,(q[1]-p[1])/length], at=[p[0]+2*axis[0],p[1]+2*axis[1]];
  const nearby=gym.find(s=>Math.hypot(s.at[0]-at[0],s.at[1]-at[1])<22);
  const s={at:at.map(round),axis:axis.map(round),color:'#3f6fa8',baked:true};
  if(nearby) Object.assign(nearby,s); else gym.push(s);
}
const goals=(await read('south-breakables.json')).filter(p=>p.kind==='goal');
const result={gym,kites:flights.map(s=>({at:localPoint(s.x,s.z),kite:s.kite,wind:round(s.wind),color:s.hex})),
  pitches:api.PITCHES.map(s=>({at:localPoint(s.cx,s.cz),axis:[round(s.ux),round(s.uz)],length:round(s.L),width:round(s.W),baked:goals.some(g=>{const [x,z]=local([s.cx,s.cz]);return Math.hypot(g.at[0]-x,g.at[2]-z)<s.L*.5+2;})}))};
await writeFile(new URL('summer_park.json',assets),JSON.stringify(result)+'\n');
