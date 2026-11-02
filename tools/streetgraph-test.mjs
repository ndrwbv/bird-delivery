/* Tiny exact data/reference contracts. Frozen old algorithm below; never generated from the module. */
import assert from 'node:assert/strict';
import {createStreetGraph,edgeKey,bindSegmentNodes,applyStaticBoundary,buildNodeGrid} from '../src/game/streetgraph.js';
import * as RCHAIN from '../src/game/routechain.js';

/* Frozen game.js block from before extraction, including legacy grid/nearest tie order. */
function oldReference (CITY, RSEG, MAP, roadWidth, drivable, inBorder) {
  const NODES = [];
  const NODE_IDX = new Map();
  const EDGES = new Map();
  const ekey = (a, b) => a * 100000 + b;
  const edgeOf = (a, b) => EDGES.get(ekey(a, b));
  {
    const node = (x, z) => {
      const k = x + ',' + z;
      let i = NODE_IDX.get(k);
      if (i === undefined) { i = NODES.length; NODE_IDX.set(k, i); NODES.push({ x, z, nb: [] }); }
      return i;
    };
    const link = (a, b, r, okAB, okBA) => {
      if (EDGES.has(ekey(a, b))) return;
      const A = NODES[a], B = NODES[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      if (len < 0.3) return;
      const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, w = roadWidth(r);
      const mk = (from, to, ok, sg) => ({
        a: from, b: to, len, ux: ux * sg, uz: uz * sg, rx: -uz * sg, rz: ux * sg,
        w, w0: r.w0 || w, c: r.c, ok, oneway: !!r.o, lanes: r.l || 0, road: r, tA: 0, tB: 0, sig: null, stopAt: 0,
      });
      A.nb.push(b); B.nb.push(a);
      EDGES.set(ekey(a, b), mk(a, b, okAB, 1));
      EDGES.set(ekey(b, a), mk(b, a, okBA, -1));
    };
    for (const r of CITY.roads) {
      if (!drivable(r)) continue;
      let prev = node(r.p[0][0], r.p[0][1]);
      for (let i = 1; i < r.p.length; i++) {
        const cur = node(r.p[i][0], r.p[i][1]);
        if (cur === prev) continue;
        link(prev, cur, r, true, !r.o);
        prev = cur;
      }
    }
  }
  for (const s of RSEG) { s.na = NODE_IDX.get(s.x1 + ',' + s.z1); s.nb = NODE_IDX.get(s.x2 + ',' + s.z2); }
  if (MAP.open) {
    for (const N of NODES) N.out = !inBorder(N.x, N.z);
    for (const e of EDGES.values()) if (NODES[e.a].out || NODES[e.b].out) e.closed = 1;
  }
  const NCELL = 120, NODE_GRID = new Map();
  for (let k = 0; k < NODES.length; k++) {
    const key = Math.floor(NODES[k].x / NCELL) + ',' + Math.floor(NODES[k].z / NCELL);
    let a = NODE_GRID.get(key);
    if (!a) NODE_GRID.set(key, a = []);
    a.push(k);
  }
  return { nodes: NODES, nodeIndex: NODE_IDX, edges: EDGES, grid: NODE_GRID, edgeOf };
}

// The unchanged caller query: first occupied square, i/j scan order, strict <, default node0.
function oldNearest (nodes, grid, x, z) {
  const ci = Math.floor(x / 120), cj = Math.floor(z / 120);
  let best = -1, bd = Infinity;
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = ci - ring; i <= ci + ring; i++)
      for (let j = cj - ring; j <= cj + ring; j++) {
        const a = grid.get(i + ',' + j);
        if (!a) continue;
        for (const k of a) {
          const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
    if (best >= 0) break;
  }
  return best < 0 ? 0 : best;
}
const WIDTHS = [20,16,13.5,11,9,7,5,5.5],roadWidth=r=>r.w||WIDTHS[r.c],drivable=r=>!r.x&&r.c!==6;
const road=(p,fields={})=>({c:4,p,...fields});
let checks=0;const test=(name,fn)=>{fn();checks++;};
function compare(roads,{open=false,inBorder=()=>true,segments=[]}={}){
  const before=JSON.stringify(roads),oldSegments=structuredClone(segments),newSegments=structuredClone(segments);
  const old=oldReference({roads},oldSegments,{open},roadWidth,drivable,inBorder),graph=createStreetGraph({roads,roadWidth,drivable});
  const refs=[graph.nodes,graph.nodeIndex,graph.edges],edgeRefs=[...graph.edges.values()];
  assert.equal(bindSegmentNodes(newSegments,graph.nodeIndex),newSegments);assert.equal(applyStaticBoundary(graph,{open,inBorder}),graph);
  const grid=buildNodeGrid(graph.nodes);
  assert.deepEqual(graph.nodes,old.nodes);assert.deepEqual([...graph.nodeIndex],[...old.nodeIndex]);assert.deepEqual([...graph.edges],[...old.edges]);assert.deepEqual([...grid],[...old.grid]);assert.deepEqual(newSegments,oldSegments);
  assert.equal(graph.nodes,refs[0]);assert.equal(graph.nodeIndex,refs[1]);assert.equal(graph.edges,refs[2]);assert.deepEqual([...graph.edges.values()],edgeRefs);
  assert.equal(JSON.stringify(roads),before);
  for(const [k,e]of graph.edges){const expected=old.edges.get(k);assert.equal(e.road,expected.road);assert.equal(e.road,roads[roads.indexOf(expected.road)]);}
  return{...graph,grid,old,segments:newSegments,edgeOf:(a,b)=>graph.edges.get(edgeKey(a,b))};
}
test('duplicate-first road owns both directions, including reversed duplicate',()=>{
  const roads=[road([[0,0],[10,0]],{o:1,w:7,w0:0,l:2}),road([[10,0],[0,0]],{o:0,w:20,l:4})],g=compare(roads);
  assert.equal(g.edges.size,2);assert.equal(g.edgeOf(0,1).road,roads[0]);assert.equal(g.edgeOf(1,0).road,roads[0]);assert.equal(g.edgeOf(1,0).ok,false);assert.equal(g.edgeOf(0,1).w0,7);assert.deepEqual(g.nodes[0].nb,[1]);
});
test('short segments retain nodes and advance prev;0.3 threshold is included',()=>{
  const g=compare([road([[0,0],[.2,0],[3,0]]),road([[8,0],[8.3,0]])]);
  assert.equal(g.nodes.length,5);assert.deepEqual(g.nodes[0].nb,[]);assert.deepEqual(g.nodes[1].nb,[2]);assert.equal(g.edgeOf(1,2).len,2.8);assert.equal(g.edgeOf(3,4).a,3);
});
test('repeated coordinates including +/-0 merge without rounding decimals',()=>{
  const g=compare([road([[-0,0],[3,0],[0,0],[1/3,0],[.33333333333333337,0]])]);
  assert.ok(Object.is(g.nodes[0].x,-0));assert.equal(g.nodeIndex.get('0,0'),0);assert.equal(g.nodeIndex.get('0.3333333333333333,0'),2);assert.equal(g.nodeIndex.get('0.33333333333333337,0'),3);assert.ok(Object.is(g.edgeOf(1,0).uz,-0));
});
test('c6/x skipped completely while c7 remains a graph road',()=>{
  const g=compare([road([[30,0],[40,0]],{c:6}),road([[60,0],[70,0]],{x:1}),road([[0,0],[10,0]],{c:7})]);
  assert.equal(g.nodes.length,2);assert.equal(g.edgeOf(0,1).c,7);assert.equal(g.edgeOf(0,1).w,5.5);
});
test('oneway/lanes/w0 preserve original truthiness and signed directions',()=>{
  const g=compare([road([[0,0],[10,0]],{o:0,l:0,w:0,w0:0}),road([[10,0],[20,0]],{o:1,l:3,w:8,w0:6})]);
  assert.equal(g.edgeOf(1,0).ok,true);assert.equal(g.edgeOf(0,1).lanes,0);assert.equal(g.edgeOf(0,1).w0,9);assert.equal(g.edgeOf(2,1).ok,false);assert.equal(g.edgeOf(1,2).lanes,3);assert.equal(g.edgeOf(1,2).w0,6);assert.ok(Object.is(g.edgeOf(0,1).rx,-0));
});
test('static out flags and edge closed presence match; closed-boundary off adds nothing',()=>{
  const roads=[road([[-10,0],[0,0],[10,0]])],g=compare(roads,{open:true,inBorder:x=>x>=0});
  assert.deepEqual(g.nodes.map(n=>n.out),[true,false,false]);assert.equal(g.edgeOf(0,1).closed,1);assert.equal(Object.hasOwn(g.edgeOf(1,2),'closed'),false);
  const off=compare(roads,{open:false,inBorder:()=>assert.fail('off must not query mask')});assert.equal(Object.hasOwn(off.nodes[0],'out'),false);assert.equal(Object.hasOwn(off.edgeOf(0,1),'closed'),false);
});
test('segment binding retains bridge flag, missing endpoints and original objects',()=>{
  const g=compare([road([[0,0],[10,0]])],{segments:[{x1:0,z1:0,x2:10,z2:0,b:1},{x1:90,z1:0,x2:100,z2:0,b:0}]});
  assert.equal(g.segments[0].b,1);assert.equal(g.segments[0].na,0);assert.equal(g.segments[0].nb,1);assert.equal(g.segments[1].na,undefined);
  const original=[{x1:0,z1:0,x2:10,z2:0,b:1}],ref=original[0];assert.equal(bindSegmentNodes(original,g.nodeIndex),original);assert.equal(original[0],ref);
});
test('grid floor/order and nearest equidistance tie keep negative-cell scan',()=>{
  const g=compare([road([[10,0],[20,0]]),road([[-10,0],[-20,0]]),road([[-120,-120],[-120.01,-120.01]])]);
  assert.deepEqual([...g.grid.keys()],['0,0','-1,0','-1,-1','-2,-2']);assert.equal(oldNearest(g.nodes,g.grid,0,0),2);
  for(const [x,z]of [[0,0],[-120,-120],[-.01,-.01],[9000,9000]])assert.equal(oldNearest(g.nodes,g.grid,x,z),oldNearest(g.old.nodes,g.old.grid,x,z));
});
test('fresh ownership between builds; road refs stay shared and graph edges stay independently mutable',()=>{
  const points=Object.freeze([Object.freeze([0,0]),Object.freeze([10,0])]),roads=[Object.freeze(road(points))];
  const a=createStreetGraph({roads,roadWidth,drivable}),b=createStreetGraph({roads,roadWidth,drivable});
  assert.notEqual(a.nodes,b.nodes);assert.notEqual(a.nodeIndex,b.nodeIndex);assert.notEqual(a.edges,b.edges);assert.notEqual(a.edges.get(1),b.edges.get(1));assert.equal(a.edges.get(1).road,b.edges.get(1).road);
  a.edges.get(1).closed=1;assert.equal(b.edges.get(1).closed,undefined);
});
test('isolated one-point roads remain nodes; malformed empty polyline still refuses',()=>{
  const g=compare([road([[123,456]])]);assert.equal(g.nodes.length,1);assert.equal(g.edges.size,0);
  assert.throws(()=>createStreetGraph({roads:[road([])],roadWidth,drivable}));assert.throws(()=>oldReference({roads:[road([])]},[],{},roadWidth,drivable,()=>true));
});
test('neighbor/edge insertion orders preserve an equal-length diamond BFS tie',()=>{
  const g=compare([road([[0,0],[0,10],[10,10]]),road([[0,0],[10,0],[10,10]])]);assert.deepEqual(g.nodes[0].nb,[1,3]);assert.deepEqual([...g.edges.keys()],[1,100000,100002,200001,3,300000,300002,200003]);
  const q=[0],prev=new Map([[0,-1]]);for(let i=0;i<q.length;i++)for(const n of g.nodes[q[i]].nb)if(!prev.has(n)){prev.set(n,q[i]);q.push(n);}
  const path=[];for(let n=2;n>=0;n=prev.get(n))path.unshift(n);assert.deepEqual(path,[0,1,2]);
});
test('unchanged routechain EF/EB/OUT retain the same live edge instances',()=>{
  const g=compare([road([[0,0],[10,0],[20,0]]),road([[20,0],[30,0]]),road([[20,0],[20,10]])]),saved={...RCHAIN.STATS};
  try{const rc=RCHAIN.build(g.nodes,g.edgeOf);for(let c=0;c<rc.SEQ.length;c++)for(let i=0;i<rc.EF[c].length;i++){const a=rc.SEQ[c][i],b=rc.SEQ[c][i+1];assert.equal(rc.EF[c][i],g.edgeOf(a,b));assert.equal(rc.EB[c][i],g.edgeOf(b,a));}
    for(const options of rc.OUT)for(const o of options)if(o.c<0)assert.equal(o.e,g.edgeOf(o.e.a,o.e.b));
    const e=rc.EF[0][0],sig={g:{phase:1},ph:0};e.sig=sig;e.closed=1;assert.equal(g.edgeOf(e.a,e.b).sig,sig);assert.equal(rc.EF[0][0].closed,1);
  }finally{Object.assign(RCHAIN.STATS,saved);}
});
console.log(JSON.stringify({ok:true,checks,frozenOldReference:true,float64AndOrderExact:true,liveRoadAndEdgeRefs:true,realCityMeasured:false}));
