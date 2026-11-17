import { deliveryAddresses, deliveryEntrance } from './delivery-addresses.mjs';
import { approachPath, depotEntry } from './depot-path.mjs';
// Collision and map metadata for the Godot drive, generated from a captured city snapshot.
import { readFileSync, writeFileSync } from 'node:fs';
import city from '../../src/maps/seversk/city-data.js';

const assets = new URL('../assets/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('south-original.json', assets)));
const { bounds, home, buildings } = source;
const spawn=[source.spawn[0]-Math.sin(source.angle)*1.15,source.spawn[1]-Math.cos(source.angle)*1.15];
const local = ([x,z]) => [x-city.meta.home[0],z-city.meta.home[1]];
const distance = ([x,z],[u,v]) => Math.hypot(x-u,z-v);
const mix = ([x,z],[u,v],t) => [x+(u-x)*t,z+(v-z)*t];
const key = p => p.join(',');
const inBounds = ([x,z],pad=0) => x>=bounds[0]-pad && z>=bounds[1]-pad && x<=bounds[2]+pad && z<=bounds[3]+pad;
const adjacent = points => points.slice(1).map((p,i)=>[points[i],p]);
const loop = points => adjacent([...points,points[0]]);

function closest([x,z],[u,v],[a,b]) {
  const dx=a-u, dz=b-v;
  return mix([u,v],[a,b],Math.max(0,Math.min(1,((x-u)*dx+(z-v)*dz)/(dx*dx+dz*dz||1))));
}

const real = JSON.parse(readFileSync(new URL('south-physics-source.json',assets)));
const obstacles = JSON.parse(readFileSync(new URL('south-obstacles.json',assets)));

function inside([x,z], poly) {
  let hit=false;
  for(const [[a,b],[u,v]] of loop(poly)) {
    if((b>z)!==(v>z)&&x<(u-a)*(z-b)/(v-b)+a) hit=!hit;
  }
  return hit;
}

function clear(at,pad) {
  if(!inBounds(at,-pad)) return false;
  if(buildings.some(b=>inside(at,b.outline)||loop(b.outline).some(([a,c])=>distance(at,closest(at,a,c))<pad))) return false;
  if(distance(at,home)<9.3+pad) return false;
  return !obstacles.some(o=>{
    const [x,z]=[at[0]-o.at[0],at[1]-o.at[1]];
    if(Math.abs(x)>o.w+o.d+pad||Math.abs(z)>o.w+o.d+pad) return false;
    const c=Math.cos(o.angle),s=Math.sin(o.angle);
    return Math.abs(x*c+z*s)<o.w+pad && Math.abs(-x*s+z*c)<o.d+pad;
  });
}

function nearby(at,pad) {
  if(clear(at,pad)) return at;
  for(let radius=0.5;radius<=6.01;radius+=0.5) {
    for(let i=0;i<16;i++) {
      const angle=i*Math.PI/8;
      const p=[at[0]+Math.cos(angle)*radius,at[1]+Math.sin(angle)*radius];
      if(clear(p,pad)) return p.map(v=>Number(v.toFixed(2)));
    }
  }
  throw new Error(`No clear ground near ${at.join(', ')}`);
}

const entrance=depotEntry(source,real.solids);
const exit=[entrance.door[0]+entrance.front[0]*2.4,entrance.door[1]+entrance.front[1]*2.4];
const back=[spawn[0]+Math.sin(source.angle)*2.39,spawn[1]+Math.cos(source.angle)*2.39];
function clearDepot(point,pad) {
  const [dx,dz]=point.map((value,i)=>value-spawn[i]);
  const c=Math.cos(source.angle),s=Math.sin(source.angle);
  if(Math.abs(dx*c-dz*s)<1.17 && dx*s+dz*c>-2.63 && dx*s+dz*c<2.34) return false;
  return clear(point,pad);
}
const dispatch={door:entrance.door,yaw:entrance.yaw,run:approachPath(exit,back,clearDepot)};
console.log('Pizzeria to the car',dispatch.run.map(p=>p.map(n=>Number(n.toFixed(1)))));

const destinationSpecs=deliveryAddresses.map(address=>({...address}));

for(const order of destinationSpecs) order.stop=nearby(order.stop,0.87);

const roadSegments=city.roads.filter(r=>r.c<=7).flatMap(r=>adjacent(r.p.map(local))
  .filter(([a,b])=>inBounds(a)&&inBounds(b)).map(([a,b])=>({a,b,road:r})));
const start={ stop:spawn, entry:[-43,-25] };
const stops=[start,...destinationSpecs];
const graph=new Map();

for(const stop of stops) {
  const best=roadSegments.reduce((winner,segment)=>{
    const p=closest(stop.entry,segment.a,segment.b), d=distance(stop.entry,p);
    return !winner||d<winner.d?{segment,p,d}:winner;
  },null);
  stop.roadPoint=best.p;
  (best.segment.splits??=[]).push(best.p);
}

function link(a,b) {
  for(const p of [a,b]) if(!graph.has(key(p))) graph.set(key(p),{point:p,neighbors:new Map()});
  graph.get(key(a)).neighbors.set(key(b),distance(a,b));
  graph.get(key(b)).neighbors.set(key(a),distance(a,b));
}
for(const {a,b,splits=[]} of roadSegments) {
  splits.sort((p,q)=>distance(a,p)-distance(a,q));
  for(const [from,to] of adjacent([a,...splits,b])) if(key(from)!==key(to)) link(from,to);
}

function route(from,to) {
  const origin=key(from.roadPoint), goal=key(to.roadPoint);
  const distances=new Map([[origin,0]]), previous=new Map(), queue=new Set([origin]);
  while(queue.size) {
    const next=[...queue].reduce((a,b)=>distances.get(a)<=distances.get(b)?a:b);
    if(next===goal) break;
    queue.delete(next);
    for(const [neighbor,length] of graph.get(next).neighbors) {
      const proposed=distances.get(next)+length;
      if(proposed>=(distances.get(neighbor)??Infinity)) continue;
      distances.set(neighbor,proposed);
      previous.set(neighbor,next);
      queue.add(neighbor);
    }
  }
  if(!distances.has(goal)) throw new Error(`Disconnected destination: ${to.name}`);
  const points=[];
  for(let p=goal;p!==origin;p=previous.get(p)) points.unshift(graph.get(p).point);
  const path=[from.stop,from.roadPoint,...points,to.stop];
  return path.filter((p,i)=>!i||distance(p,path[i-1])>0.08).map(p=>p.map(v=>Number(v.toFixed(2))));
}

const deliveries=destinationSpecs.map((dest,i)=>{
  const entrance=deliveryEntrance(dest,buildings);
  const {at:curb,front}=entrance;
  const customer=nearby([curb[0]+front[0]*1.06,curb[1]+front[1]*1.06],0.42);
  const fromHome=route(start,dest);
  const meters=adjacent(fromHome).reduce((sum,[a,b])=>sum+distance(a,b),0);
  return { name:dest.name, stop:dest.stop,entrance,customer,meters:Math.round(meters),
    route:route(stops[i],dest),from_home:fromHome,back_home:route(dest,start) };
});
const walkers=[];
const centers=[spawn,...deliveries.map(o=>o.stop)];
const candidates=real.roads.filter(([x,z,u,v,w,c])=>c<=5 && w>=5 && Math.hypot(x-u,z-v)>14)
  .map(([x,z,u,v,w],i)=>({a:[x,z],b:[u,v],width:w,i}));
for(const [group,center] of centers.entries()) {
  const sorted=candidates.slice().sort((u,v)=>distance(center,u.a)-distance(center,v.a));
  let made=0;
  for(const {a,b,width,i} of sorted) {
    const length=distance(a,b);
    if(length<13 || distance(center,a)>120) continue;
    const [dx,dz]=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    const head=mix(a,b,0.18),tail=mix(a,b,Math.min(0.82,0.18+32/length));
    for(const sign of [1,-1]) {
      const offset=sign*(width*0.5+1.45);
      const from=[head[0]-dz*offset,head[1]+dx*offset],to=[tail[0]-dz*offset,tail[1]+dx*offset];
      const midpoint=mix(from,to,0.5);
      if(walkers.some(([p,q])=>distance(midpoint,mix(p,q,0.5))<7.5)) continue;
      if(deliveries.some(o=>distance(midpoint,o.customer)<4)) continue;
      if(![0,0.16,0.33,0.50,0.67,0.84,1].every(t=>clear(mix(from,to,t),0.44))) continue;
      walkers.push([from,to,((i*13+group*7)%29)/29]);
      made++;
    }
    if(made>=5) break;
  }
}
for(const spec of source.walkers) {
  const [a,b]=spec;
  if(distance(a,b)>2 && [0,0.25,0.5,0.75,1].every(t=>clear(mix(a,b,t),0.43))) walkers.push(spec);
}
console.log(`${walkers.length} sidewalk routes and ${deliveries.length} walk-up deliveries`);
const data={ bounds, spawn, home, dispatch, angle:source.angle,camera:source.camera,terrain:source.terrain,deliveries,walkers,
  roads:roadSegments.map(({a,b,road})=>[a,b,road.c<=4]),
  buildings:buildings.map(b=>b.outline).filter(p=>p.every(q=>inBounds(q))) };
writeFileSync(new URL('south.json',assets), JSON.stringify(data)+'\n');
