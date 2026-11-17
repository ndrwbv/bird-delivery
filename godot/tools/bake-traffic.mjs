import { readFileSync,writeFileSync } from 'node:fs';
import city from '../../src/maps/seversk/city-data.js';

const assets=new URL('../assets/',import.meta.url);
const area=JSON.parse(readFileSync(new URL('south.json',assets)));
const origin=city.meta.home;
const [xmin,zmin,xmax,zmax]=area.bounds;
const margin=7;
const nodes=new Map();
const edges=[];
const add=([x,z],[u,v])=>[x+u,z+v];
const sub=([x,z],[u,v])=>[x-u,z-v];
const mul=([x,z],f)=>[x*f,z*f];
const lerp=(a,b,t)=>add(a,mul(sub(b,a),t));
const norm=p=>mul(p,1/Math.hypot(...p));
const distance=(a,b)=>Math.hypot(...sub(a,b));
const inArea=([x,z])=>x>=xmin+margin&&x<=xmax-margin&&z>=zmin+margin&&z<=zmax-margin;
const local=([x,z])=>[x-origin[0],z-origin[1]];
function node(at) {
  const id=at.join('/');
  if(!nodes.has(id)) nodes.set(id,{at,links:new Map()});
  return nodes.get(id);
}
function join(a,b,road) {
  const from=node(a),to=node(b);
  const length=distance(a,b);
  if(length<0.2) return;
  if(from.links.has(to) && from.links.get(to).kind<=road.c) return;
  const edge={from,to,length,kind:road.c,width:road.w||[8.5,8.5,8.4,10.4,10,7,3.5][road.c-1]||4,one:!!road.o};
  edges.push(edge);
  from.links.set(to,edge);
}
for(const road of city.roads) {
  if(road.c>7 || road.x) continue;
  const path=road.p.map(local);
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i];
    if(!inArea(a)||!inArea(b)) continue;
    if(road.o!==-1) join(a,b,road);
    if(!road.o||road.o===-1) join(b,a,road);
  }
}

// Start each circuit with an actual street edge. Find a return leg that cannot
// turn around on that edge. Yard trips may also use public service roads.
function returnLeg(first,allowYard) {
  const queue=[{node:first.to,cost:0}];
  const distances=new Map([[first.to,0]]);
  const prior=new Map();
  while(queue.length) {
    queue.sort((a,b)=>b.cost-a.cost);
    const current=queue.pop();
    if(current.cost!==distances.get(current.node)) continue;
    if(current.node===first.from) {
      const back=[];
      for(let at=first.from;at!==first.to;) {
        const edge=prior.get(at);
        back.unshift(edge);
        at=edge.from;
      }
      return [first,...back];
    }
    for(const edge of current.node.links.values()) {
      if((edge.from===first.to && edge.to===first.from) || (!allowYard&&edge.kind>5)) continue;
      const candidate=current.cost+edge.length*(edge.kind===7?1.35:1);
      if(candidate>950||candidate>=(distances.get(edge.to)??Infinity)) continue;
      distances.set(edge.to,candidate);
      prior.set(edge.to,edge);
      queue.push({node:edge.to,cost:candidate});
    }
  }
  return null;
}

function lane(edge) {
  const [x,z]=norm(sub(edge.to.at,edge.from.at));
  const offset=edge.one||edge.width<4.8?0:Math.min(2.5,edge.width*0.23);
  return [-z*offset,x*offset];
}

function sample(route) {
  const points=[];
  for(let i=0;i<route.length;i++) {
    const current=route[i],prev=route[(i+route.length-1)%route.length];
    const center=current.from.at;
    const entry=add(lerp(center,prev.from.at,Math.min(0.4,4.8/prev.length)),lane(prev));
    const exit=add(lerp(center,current.to.at,Math.min(0.4,4.8/current.length)),lane(current));
    const mid=add(center,mul(add(lane(prev),lane(current)),0.5));
    const dirIn=norm(sub(center,prev.from.at)),dirOut=norm(sub(current.to.at,center));
    const angle=dirIn[0]*dirOut[0]+dirIn[1]*dirOut[1];
    const speed=Math.min(prev.kind,current.kind)<=4?13.5:9;
    for(let k=0;k<=4;k++) {
      const t=k/4;
      const at=lerp(lerp(entry,mid,t),lerp(mid,exit,t),t);
      points.push([...at,k===0||k===4?speed:Math.min(speed,angle<0.7?5.9:9.3)].map(v=>+v.toFixed(2)));
    }
  }
  return points;
}

const candidates=[];
const signatures=new Set();
for(const edge of edges.filter(o=>o.length>8)) {
  for(const allowYard of edge.kind===7?[true]:[false,true]) {
    const circuit=returnLeg(edge,allowYard);
    if(!circuit) continue;
    const total=circuit.reduce((sum,e)=>sum+e.length,0);
    if(total<100||total>960) continue;
    const signature=circuit.map(e=>e.from.at.join('/')).sort().join('_');
    if(signatures.has(signature)) continue;
    signatures.add(signature);
    candidates.push({circuit,total,yard:circuit.filter(e=>e.kind===7).length>=3});
  }
}

const usage=new Map();
const routes=[];
for(let slot=0;slot<18&&candidates.length;slot++) {
  let best=null, score=-Infinity;
  for(const candidate of candidates) {
    const overlap=candidate.circuit.reduce((sum,e)=>sum+e.length*(usage.get(e)||0),0)/candidate.total;
    const nearStart=Math.min(...candidate.circuit.map(e=>distance(e.from.at,area.spawn)));
    const value=(slot>=13===candidate.yard?1.7:0)+Math.min(candidate.total/400,1)-overlap*3-nearStart*0.004;
    if(value>score) {best=candidate;score=value;}
  }
  for(const edge of best.circuit) usage.set(edge,(usage.get(edge)||0)+1);
  routes.push(sample(best.circuit));
  candidates.splice(candidates.indexOf(best),1);
}
if(routes.length===0) throw new Error('No complete circuit in the first district');
writeFileSync(new URL('south-traffic-routes.json',assets),JSON.stringify(routes));
console.log(`${routes.length} street and courtyard circuits`);
