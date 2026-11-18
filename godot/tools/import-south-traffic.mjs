// Data-only extraction of the player's district. Coordinates are metres in the Godot scene.
import { readFile, writeFile } from 'node:fs/promises';
import city from '../../src/maps/seversk/city-data.js';
const assets = new URL('../assets/', import.meta.url);
const region = JSON.parse(await readFile(new URL('south-region.json', assets)));
const [ox, oz] = region.origin;
const nodes = [], roads = [], ids = new Map(), pairs = new Map(), groups = [], crossings = [];
const dist = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function node(p) {
  const key = p.join(',');
  if (!ids.has(key)) { ids.set(key,nodes.length); nodes.push({ p, links: [] }); }
  return ids.get(key);
}
function segment(a,b) { return pairs.get(a < b ? a+','+b : b+','+a); }
function axis(a,b) {
  const A=nodes[a].p,B=nodes[b].p,d=dist(A,B);
  return [(B[0]-A[0])/d,(B[1]-A[1])/d];
}
function pos(a,b,m) { const A=nodes[a].p,u=axis(a,b); return [A[0]+u[0]*m,A[1]+u[1]*m]; }
for (const r of region.roads) {
  for (let i=1;i<r.points.length;i++) {
    const a=node(r.points[i-1]),b=node(r.points[i]);
    if (a===b || segment(a,b)) continue;
    const e={a,b,w:r.width,c:r.class,name:r.name||'',ow:r.oneway,len:dist(nodes[a].p,nodes[b].p),t:[0,0]};
    roads.push(e);pairs.set(a<b ? a+','+b : b+','+a,e);
    nodes[a].links.push(b);nodes[b].links.push(a);
  }
}
for (let n=0;n<nodes.length;n++) {
  const links=nodes[n].links,w=Math.max(0,...links.map(m=>segment(n,m).w));
  let trim=0;
  if(links.length>=3) trim=w/2+1.2;
  else if(links.length===2 && -dot(axis(n,links[0]),axis(n,links[1]))<.96) trim=Math.min(6,w/2);
  for(const m of links){const e=segment(n,m);e.t[e.a===n?0:1]=Math.min(trim,e.len*.42);}
}
const centers = city.signals.map(([x,z])=>[x-ox,z-oz]).filter(p=>nodes.some(n=>dist(n.p,p)<24));
for(const n of nodes){
  if(n.links.length<3) continue;
  const id=ids.get(n.p.join(','));
  const names=new Set(n.links.map(m=>segment(id,m)).filter(e=>e.c<=3).map(e=>e.name||e));
  if(names.size>=2 && !centers.some(p=>dist(p,n.p)<70)) centers.push(n.p);
}
const claimed=new Set(), byApproach=new Map();
function zebra(a,b,along,phase=-1) {
  const center=pos(a,b,along),dir=axis(a,b);
  if(crossings.some(q=>dist(q,center)<9)) return;
  crossings.push([...center,...dir,segment(a,b).w,phase]);
}
for(const seed of centers){
  if(claimed.has(seed)) continue;
  const cluster=[seed];claimed.add(seed);
  for(let i=0;i<cluster.length;i++) for(const p of centers) if(!claimed.has(p)&&dist(cluster[i],p)<40){cluster.push(p);claimed.add(p);}
  const within=new Set();
  nodes.forEach((n,i)=>{if(n.links.length>=3 && cluster.some(p=>dist(p,n.p)<24)) within.add(i);});
  if(!within.size){const near=nodes.reduce((a,n,i)=>dist(n.p,seed)<dist(nodes[a].p,seed)?i:a,0);if(dist(nodes[near].p,seed)<14)within.add(near);}
  const approaches=[];
  for(const b of within) for(const a of nodes[b].links) if(!within.has(a)&&segment(a,b).c<=5) approaches.push([a,b]);
  if(approaches.length<2) continue;
  approaches.sort(([a,b],[c,d])=>segment(a,b).c-segment(c,d).c || segment(c,d).len-segment(a,b).len);
  const main=axis(...approaches[0]);
  for(const [a,b] of approaches){
    const e=segment(a,b),u=axis(a,b),phase=Math.abs(dot(u,main))>=.7?0:1;
    const hasZebra=e.len-e.t[0]-e.t[1]>3.4+6,end=e.t[e.a===b?0:1];
    const stop=e.len-end-(hasZebra?3.4+1.4:.6);
    groups.push([...pos(a,b,stop),...u,e.w,phase]);
    byApproach.set(a+','+b,phase);
    if(hasZebra)zebra(a,b,e.len-end-3.4/2-.3,phase);
  }
}
for(const [x,z] of city.crossings){
  const p=[x-ox,z-oz];let best=5,bestE,along;
  for(const e of roads){
    if(e.c>4)continue;
    const a=nodes[e.a].p,u=axis(e.a,e.b);
    const m=clamp((p[0]-a[0])*u[0]+(p[1]-a[1])*u[1],0,e.len),d=dist(p,pos(e.a,e.b,m));
    if(d<best){best=d;bestE=e;along=m;}
  }
  if(!bestE)continue;
  const {a,b,t,len}=bestE;
  if(len-t[0]-t[1]<5.4)continue;
  const near=groups.some(q=>dist(p,q)<45);
  zebra(a,b,clamp(along,t[0]+2,len-t[1]-2),near?(byApproach.get(a+','+b)??byApproach.get(b+','+a)??-1):-1);
}
// Original also marks a 45% sample of otherwise uncontrolled junctions. A stable draw
// is used so the baked markings, nav paths and the saved South always agree.
let seed=360;
for(let n=0;n<nodes.length;n++){
  const {links,p}=nodes[n];if(links.length<3)continue;
  seed=(Math.imul(1664525,seed)+1013904223)>>>0;
  if(seed/4294967296>.45||crossings.some(q=>dist(q,p)<30))continue;
  for(const m of links){const e=segment(m,n);if(e.c<=4&&e.len-e.t[0]-e.t[1]>=9.4)zebra(m,n,e.len-e.t[e.a===n?0:1]-2);}
}
const round=n=>Math.round(n*1000)/1000;
const output={signals:groups.map(a=>a.map(round)),crossings:crossings.map(a=>a.map(round))};
await writeFile(new URL('south-crossings.json', assets),JSON.stringify(output)+'\n');
