import { readFileSync, writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { bakeVerge } from './bake-verge.mjs';
import { generator } from './leaf-sprigs.mjs';
import { crownClearance, footballPitches, onSoil, plantingSpace, PlantPositions, surveyPlots } from './planting-space.mjs';
import { trunkRadiusAt } from './tree-styles.mjs';
import { groundGrid } from './ground-grid.mjs';
import { soilPattern, treeHabitat } from './landscape-pattern.mjs';
import { depotClearances } from './depot-path.mjs';
import { deliveryClearances } from './delivery-addresses.mjs';

const assets = new URL('../assets/', import.meta.url);
const area = JSON.parse(readFileSync(new URL('south-original.json',assets)));
const {solids,props,buildings,roads,arches=[]} = JSON.parse(readFileSync(new URL('south-physics-source.json',assets)));
const {sample:soilAt}=groundGrid(assets);
const near = ([x,z],[u,v]) => Math.hypot(x-u,z-v);
const bounds=area.bounds;
const insideArea=([x,z],pad=0)=>x>=bounds[0]-pad&&x<=bounds[2]+pad&&z>=bounds[1]-pad&&z<=bounds[3]+pad;
const height=([x,z])=>soilAt(x,z)?.y??0;

const breakables=JSON.parse(readFileSync(new URL('south-breakables.json',assets)));
const vertices=readFileSync(new URL('south-breakables.bin',assets));
const dynamic=[];
const lights=JSON.parse(readFileSync(new URL('south-streetlight.json',assets))).fixtures;
const heightsByLamp=new Map(lights.map(({id,scale})=>[id,scale]));
const key=(kind,x,z)=>[kind,x,z].join('/');
const exported=new Set(breakables.map(o=>key(o.kind,o.at[0],o.at[2])));
const rounds = new Set(['lamp','sign','bin','bollard']);
const low = new Set(['bench','table','stop','slide','sand','goal']);
const fences = props.filter(o=>o.kind==='fence'||o.kind==='bigfence');
const obstacles = [];
for(const [x,z,w,d,angle,tree] of solids) {
  if(w<=0.03||d<=0.03||!insideArea([x,z],5)) continue;
  // The browser indexes low obstacles both as solids and as smashable furniture.
  if(!tree&&breakables.some(o=>{
    const dist=Math.hypot(x-o.at[0],z-o.at[2]);
    if(dist>0.46 || Math.max(w,d)>o.radius+0.3) return false;
    return ['fence','bigfence','bench','stop','table','bin','goal','sand','slide','can','dump'].includes(o.kind);
  })) continue;
  obstacles.push({at:[x,z],w,d,angle,h:tree?3.1:2.1,tree:tree===1});
}
for(const prop of breakables) {
  const [x,y,z]=prop.at;
  if(!insideArea([x,z],3)) continue;
  let angle=0;
  let loX=prop.min[0],hiX=prop.max[0],loZ=prop.min[2],hiZ=prop.max[2];
  if(prop.kind==='lamp') {
    loX=loZ=-0.23; hiX=hiZ=0.23;
  } else if(!prop.post && prop.kind!=='bush') {
    // Recover the orientation from the source mesh itself, including isolated panels.
    const points=[];
    const distinct=new Set();
    for(let i=0;i<prop.count;i++) {
      const offset=prop.offset+i*16;
      const u=vertices.readFloatLE(offset),v=vertices.readFloatLE(offset+8);
      const signature=[u.toFixed(3),v.toFixed(3)].join('/');
      if(!distinct.has(signature)) { distinct.add(signature);points.push([u,v]); }
    }
    const avg=points.reduce(([u,v],p)=>[u+p[0]/points.length,v+p[1]/points.length],[0,0]);
    let xx=0,xz=0,zz=0;
    for(const [u,v] of points) {
      const dx=u-avg[0],dz=v-avg[1];
      xx+=dx*dx; xz+=dx*dz; zz+=dz*dz;
    }
    angle=Math.atan2(2*xz,xx-zz)*0.5;
    const c=Math.cos(angle),s=Math.sin(angle);
    const across=points.map(([u,v])=>u*c+v*s);
    const width=points.map(([u,v])=>-u*s+v*c);
    loX=Math.min(...across);hiX=Math.max(...across);
    loZ=Math.min(...width);hiZ=Math.max(...width);
  }
  const u=(loX+hiX)*0.5, v=(loZ+hiZ)*0.5;
  const cx=x+Math.cos(angle)*u-Math.sin(angle)*v,cz=z+Math.sin(angle)*u+Math.cos(angle)*v;
  const w=Math.max(0.08,(hiX-loX)*0.5),d=Math.max(0.075,(hiZ-loZ)*0.5);
  const rise=heightsByLamp.get(prop.id)??1;
  const bottom=Math.min(-0.025,prop.min[1]),top=prop.max[1]*rise;
  dynamic.push([prop.id,cx,y+(top+bottom)*0.5,cz,w,(top-bottom)*0.5,d,angle]);
}
for(const item of props) {
  const {at,radius:r,kind}=item;
  if(!insideArea(at,5)||!(r>0)||exported.has(key(kind,...at))) continue;
  if(rounds.has(kind)) {
    const w = kind==='bollard'?0.18:kind==='bin'?0.31:0.12;
    obstacles.push({at,w,d:w,angle:0,h:kind==='lamp'?4.7:1.1});
  } else if(low.has(kind)) {
    obstacles.push({at,w:Math.min(r,1.05)*0.75,d:Math.min(r,0.56)*0.68,angle:0,h:0.80});
  } else if(kind==='fence'||kind==='bigfence') {
    let closest=null, gap=Math.min(6.0,Math.max(2.85,r*2.6));
    for(const fence of fences) {
      if(fence===item||fence.kind!==kind) continue;
      const d=near(at,fence.at);
      if(d>0.42&&d<gap) { closest=fence; gap=d; }
    }
    if(closest) {
      const angle=Math.atan2(closest.at[1]-at[1],closest.at[0]-at[0]);
      obstacles.push({at,w:Math.min(r,gap*0.51),d:0.085,angle,h:kind==='bigfence'?1.95:0.83});
    }
  }
}

function rectangle({at:[x,z],w,d,angle}) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([u,v])=>[x+c*u-s*v,z+s*u+c*v]);
}
const point=([x,z],y)=>[x,y,z];
const walls=[];
const objects=[];
function wall(out,a,b,lower,upper) {
  if(near(a,b)<0.025) return;
  const v0=point(a,lower),v1=point(b,lower),v2=point(b,upper),v3=point(a,upper);
  out.push(...v0,...v1,...v2,...v0,...v2,...v3);
}
function edges(poly,fn) {
  for(let i=0;i<poly.length;i++) fn(poly[i],poly[(i+1)%poly.length]);
}

function archCuts(a,b) {
  const cuts=[];
  const delta=[b[0]-a[0],b[1]-a[1]];
  for(const arch of arches) {
    let lo=0,hi=1;
    const relative=[a[0]-arch.entry[0],a[1]-arch.entry[1]];
    for(const [dir,min,max] of [[arch.axis,-0.8,arch.length+0.8],[arch.side,-2.6,2.6]]) {
      const at=relative[0]*dir[0]+relative[1]*dir[1];
      const step=delta[0]*dir[0]+delta[1]*dir[1];
      if(Math.abs(step)<1e-6) {
        if(at<min||at>max) {lo=1;hi=0;break;}
        continue;
      }
      const l=(min-at)/step,r=(max-at)/step;
      lo=Math.max(lo,Math.min(l,r));
      hi=Math.min(hi,Math.max(l,r));
    }
    if(hi>lo) cuts.push([lo,hi,arch.crown-area.sourceY]);
  }
  return cuts.sort((a,b)=>a[0]-b[0]);
}
function facade(out,a,b,bottom,top) {
  const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  let from=0;
  for(const [lo,hi,ceiling] of archCuts(a,b)) {
    if(lo>from) wall(out,at(from),at(lo),bottom,top);
    wall(out,at(Math.max(lo,from)),at(hi),Math.max(bottom,ceiling),top);
    from=Math.max(from,hi);
  }
  if(from<1) wall(out,at(from),b,bottom,top);
}

const batch = new Map();
function shadow(poly,y0,y1,side=wall) {
  const [x,z]=poly[0], id=[Math.floor(x/80),Math.floor(z/80)].join('_').replaceAll('-','n');
  if(!batch.has(id)) batch.set(id,[]);
  const out=batch.get(id);
  edges(poly,(a,b)=>side(out,a,b,y0,y1));
  // A triangle fan is sufficient for boxes and round crowns. Building walls are opaque to the low sun.
  if(poly.length<=8) for(let j=2;j<poly.length;j++) out.push(...point(poly[0],y1),...point(poly[j-1],y1),...point(poly[j],y1));
}
function circle([x,z],r,n) {
  return Array.from({length:n},(_,i)=>[x+Math.cos(i/n*Math.PI*2)*r,z+Math.sin(i/n*Math.PI*2)*r]);
}
for(const {outline,levels} of buildings) {
  const ground=Math.min(...outline.map(height));
  const roof=Math.max(...outline.map(height))+Math.max(3.3,levels*3.15+0.8);
  if(outline.some(p=>insideArea(p,5))) edges(outline,(a,b)=>facade(walls,a,b,ground-1.0,roof));
  shadow(outline,ground-0.8,roof,facade);
}
const dome=circle(area.home,9.25,22), domeY=height(area.home);
edges(dome,(a,b)=>wall(walls,a,b,domeY-0.5,domeY+8));
for(let i=0;i<4;i++) {
  const lower=i*1.95, upper=(i+1)*1.95;
  shadow(circle(area.home,Math.sqrt(9.25**2-lower**2),12),domeY+lower,domeY+upper);
}
const [a,b,c,d]=bounds;
edges([[a,b],[c,b],[c,d],[a,d]],(x,z)=>wall(walls,x,z,-34,58));
for(const o of obstacles) {
  const poly=rectangle(o);
  const ground=height(o.at);
  edges(poly,(a,b)=>wall(objects,a,b,ground-0.25,ground+o.h));
  if(!o.tree && (o.h>1.8 || Math.max(o.w,o.d)>0.57)) {
    shadow(poly,ground,ground+o.h);
  }
}

const planted=bakeVerge(assets,height,(x,z)=>{
  if(!insideArea([x,z],-8) || soilAt(x,z)?.kind!==1) return false;
  if(obstacles.some(o=>near(o.at,[x,z])<2.4)) return false;
  if(dynamic.some(o=>near([o[1],o[3]],[x,z])<1.8)) return false;
  return true;
});
for(const [x,z,radius] of planted) {
  const at=[x,z], ground=height(at), poly=circle(at,radius,7);
  edges(poly,(a,b)=>wall(objects,a,b,ground-0.2,ground+3.5));
  obstacles.push({at,w:radius,d:radius,angle:0,h:3.5,tree:true});
}

const parked=JSON.parse(readFileSync(new URL('south-parking.json',assets))).parked;
const reserved=[[...area.home,10.1],[...area.spawn,3.8],...parked.map(([x,z])=>[x,z,2.5]),...deliveryClearances(area.buildings),...depotClearances(area,solids)];
const fixedProps=dynamic.map(([,x,,z,w,,d])=>({at:[x,z],w,d}));
const lots=plantingSpace(buildings,roads,[...obstacles,...fixedProps],reserved,footballPitches(props));
const treePositions=new PlantPositions();
for (const {tree,at} of obstacles) if (tree) treePositions.add(...at);
const vacantTrees=[];
const crownLimitAt=crownClearance(buildings);
function plantTree(x,z,heightMeters,companionOf=-1) {
  const radius=0.065+heightMeters*0.0265;
  const ground=height([x,z]);
  const crownLimit=crownLimitAt(x,z);
  vacantTrees.push([+x.toFixed(3),+ground.toFixed(3),+z.toFixed(3),+heightMeters.toFixed(3),+radius.toFixed(3),companionOf,+crownLimit.toFixed(3)]);
  treePositions.add(x,z);
  lots.exclude(x,z,Math.max(0.48,radius+0.10));
  const trunkHeight=Math.min(4.6,heightMeters*0.72);
  const levels=[-0.20,heightMeters*0.09,trunkHeight];
  const rings=levels.map(y=>circle([x,z],trunkRadiusAt(radius,y/heightMeters),7));
  for (let ring=0;ring<rings.length-1;ring++) {
    const from=rings[ring],to=rings[ring+1];
    for (let i=0;i<from.length;i++) {
      const next=(i+1)%from.length;
      const a=point(from[i],ground+levels[ring]),b=point(from[next],ground+levels[ring]);
      const c=point(to[next],ground+levels[ring+1]),d=point(to[i],ground+levels[ring+1]);
      objects.push(...a,...b,...c,...a,...c,...d);
    }
  }
  obstacles.push({at:[x,z],w:radius,d:radius,angle:0,h:trunkHeight,tree:true});
}
const treeRandom=generator(189031);
function plantRow(a,b,side,offsets,spacing,heightRange) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if (length<5.5) return;
  const ux=dx/length,uz=dz/length;
  const nx=uz*side,nz=-ux*side;
  let previous=-1;
  for (let distance=2.4+treeRandom()*1.5;distance<length-1.8;distance+=spacing*(0.92+treeRandom()*0.17)) {
    for (const offset of offsets) {
      const x=a[0]+ux*distance+nx*offset,z=a[1]+uz*distance+nz*offset;
      if (!insideArea([x,z],-2) || treePositions.near(x,z,4.65)) continue;
      if (!lots.clear(x,z,1.02) || !onSoil(soilAt,x,z,0.92,true)) continue;
      let meters=heightRange[0]+treeRandom()*(heightRange[1]-heightRange[0]);
      let connect=-1;
      if (previous>=0) {
        const [px,py,pz,ph]=vacantTrees[previous];
        if (Math.hypot(px-x,pz-z)<8.7 && Math.abs(py-height([x,z]))<1.5 && lots.clear((px+x)*0.5,(pz+z)*0.5,0.28)) {
          connect=previous;
          meters=meters*0.79+ph*0.21;
        }
      }
      const index=vacantTrees.length;
      plantTree(x,z,meters,connect);
      previous=index;
      break;
    }
  }
}
for (const [x,z,u,v,width,kind] of roads) {
  if (kind>4) continue;
  const base=width*0.5+2.55;
  for (const side of [-1,1]) {
    plantRow([x,z],[u,v],side,[base,base+1.35,base+2.6,base+4.1],6.35,[12.5,22.0]);
  }
}
const streetVergeTrees=vacantTrees.length;
for (const {outline,levels} of buildings) {
  const winding=Math.sign(outline.reduce((sum,[x,z],i)=>{
    const [u,v]=outline[(i+1)%outline.length];
    return sum+x*v-z*u;
  },0));
  if (!winding) continue;
  for (let i=0;i<outline.length;i++) {
    plantRow(outline[i],outline[(i+1)%outline.length],winding,[3.05,4.25,5.65,7.2],
      levels>=5 ? 6.8 : 7.5,levels>=4 ? [12.2,21.0] : [10.0,17.4]);
    if (levels>=3) {
      plantRow(outline[i],outline[(i+1)%outline.length],winding,[8.7,10.1,11.6],7.15,[11.2,19.6]);
    }
  }
}
const facadeVergeTrees=vacantTrees.length-streetVergeTrees;
for (const [x,z,u,v,width,kind] of roads) {
  if (kind!==7) continue;
  const base=width*0.5+1.37;
  for (const side of [-1,1]) {
    plantRow([x,z],[u,v],side,[base,base+1.25,base+2.35],6.55,[10.1,18.5]);
  }
}
const accessVergeTrees=vacantTrees.length-streetVergeTrees-facadeVergeTrees;
// Broad verges carry a second and third line parallel to the same street.
for (const [x,z,u,v,width,kind] of roads) {
  const base=width*0.5+(kind===7 ? 1.37 : 2.55);
  const bands=kind===7 ? [5.7,11.2] : [5.8,11.4,17.1,23.0];
  for (const band of bands) for (const side of [-1,1]) {
    const offset=base+band;
    plantRow([x,z],[u,v],side,[offset,offset+1.35,offset+2.60],6.8,
      kind===7 ? [10.5,18.5] : [12.2,21.2]);
  }
}
const rowTrees=vacantTrees.length;
for (const [x,z] of surveyPlots(bounds,soilAt,lots,9.4,1.15,treeRandom)) {
  const {bare,vigor}=soilPattern(x,z);
  const habitat=treeHabitat(x,z);
  if (bare>0.64 && treeRandom()<0.78) continue;
  const spacing=5.5+3.1*(1-habitat)+bare*3.4;
  if(treePositions.near(x,z,spacing)) continue;
  const heightMeters=8.4+treeRandom()*7.2+vigor*4.4;
  plantTree(x,z,heightMeters);
}
console.log(`${vacantTrees.length-rowTrees} trees in the interiors of lots`);
writeFileSync(new URL('south-vacant-trees.json',assets),JSON.stringify(vacantTrees));
const frontRows=streetVergeTrees+facadeVergeTrees+accessVergeTrees;
console.log(`${streetVergeTrees} street trees, ${facadeVergeTrees} facade trees, ${accessVergeTrees} access trees, ${rowTrees-frontRows} in parallel rows`);

const numbers=array=>array.map(v=>Number(v.toFixed(3))).join(', ');
writeFileSync(new URL('south_collision.tscn',assets),
  '[gd_scene load_steps=3 format=3]\n\n'+
  '[sub_resource type="ConcavePolygonShape3D" id="Walls"]\n'+
  `backface_collision = true\ndata = PackedVector3Array(${numbers(walls)})\n\n`+
  '[sub_resource type="ConcavePolygonShape3D" id="Objects"]\n'+
  `backface_collision = true\ndata = PackedVector3Array(${numbers(objects)})\n\n`+
  '[node name="CityCollision" type="Node3D"]\n\n'+
  '[node name="Architecture" type="StaticBody3D" parent="."]\ncollision_layer = 1\ncollision_mask = 0\n\n'+
  '[node name="Walls" type="CollisionShape3D" parent="Architecture"]\nshape = SubResource("Walls")\n\n'+
  '[node name="StreetFurniture" type="StaticBody3D" parent="."]\ncollision_layer = 8\ncollision_mask = 0\n\n'+
  '[node name="Objects" type="CollisionShape3D" parent="StreetFurniture"]\nshape = SubResource("Objects")\n');

const glb=new Glb();
glb.data.materials=[{name:'Shadow proxy',doubleSided:true}];
for(const [name,points] of batch) {
  const positions=[],indices=[],reuse=new Map();
  for(let i=0;i<points.length;i+=3) {
    const p=points.slice(i,i+3).map(n=>Math.round(n*100)/100), key=p.join(',');
    if(!reuse.has(key)) {reuse.set(key,positions.length/3);positions.push(...p);}
    indices.push(reuse.get(key));
  }
  glb.mesh(`Shade_${name}`,new Float32Array(positions),indices,0);
}
writeFileSync(new URL('south-occluders.glb',assets),glb.encode());
writeFileSync(new URL('south-obstacles.json',assets),JSON.stringify([...obstacles,...dynamic.map(([,x,,z,w,h,d,angle])=>({at:[x,z],w,d,angle,h:h*2}))]));
writeFileSync(new URL('south-breakable-collision.json',assets),JSON.stringify(dynamic.map(entry=>entry.map(v=>+v.toFixed(4)))));
console.log(`${obstacles.length} street collision shapes, ${batch.size} shadow tiles`);
