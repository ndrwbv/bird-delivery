// Import the summer geometry and interactive props from the released game.
// The optional CLI argument points to a local @napi-rs/canvas install for the original sign artwork.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import * as THREE from '../../src/vendor/three.module.min.js';
import {captureClub} from './capture-south-club.mjs';
import {captureDepotGrowth} from './capture-south-growth.mjs';

const {createCanvas}=createRequire(import.meta.url)(process.argv[2]||'@napi-rs/canvas');
const assets = new URL('../assets/',import.meta.url);
const packageDir = new URL('worksites/',assets);
const read = async name => JSON.parse(await readFile(new URL(name,assets),'utf8'));
const [map,original,furniture] = await Promise.all([read('south-region.json'),read('south-original.json'),read('south-physics-source.json')]);
const [ox,oz] = map.origin;
const global = ([x,z]) => [x+ox,z+oz];
const local = (x,z) => [Math.round((x-ox)*1000)/1000,Math.round((z-oz)*1000)/1000];
const boundary = map.boundary.map(global);
const city = {
  roads:map.roads.map(r=>({p:r.points.map(global),c:r.class,b:r.deck_y?1:0,w:r.width,n:r.name})),
  green:map.greens.map(g=>({p:g.outline.map(global),k:g.kind})),
  buildings:map.buildings.map(h=>({p:h.outline.map(global),id:h.id,kind:h.kind,street:h.street,number:h.number})),
  entrances:map.entrances.map(global),lots:map.parking_lots.map(l=>({p:l.outline.map(global)})),
  paths:[],garlots:[],malls:[],rails:map.rails.map(r=>({p:r.points.map(global)})),streams:map.streams.map(r=>({p:r.points.map(global)})),
  pois:[],kpp:[],stops:map.stops.map(s=>({p:global(s.at)}))
};
const tile = (x,z) => Math.floor(x/40)+','+Math.floor(z/40);
function mark(grid,x0,z0,x1,z1,val){
  for(let x=Math.floor(x0/40);x<=Math.floor(x1/40);x++)
    for(let z=Math.floor(z0/40);z<=Math.floor(z1/40);z++){
      const k=x+','+z;
      if(!grid.has(k))grid.set(k,[]);
      grid.get(k).push(val);
    }
}
function inside(x,z,poly){
  let ok=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])ok=!ok;
  }return ok;
}
function nearSegment(x,z,a,b){
  const u=b[0]-a[0],v=b[1]-a[1];
  const t=Math.min(1,Math.max(0,((x-a[0])*u+(z-a[1])*v)/(u*u+v*v||1)));
  const q=[a[0]+t*u,a[1]+t*v];return {x:q[0],z:q[1],d:Math.hypot(q[0]-x,q[1]-z)};
}
const houses=new Map(),rgrid=new Map(),segments=[];
for(const h of city.buildings){
  const xs=h.p.map(p=>p[0]),zs=h.p.map(p=>p[1]);
  mark(houses,Math.min(...xs)-20,Math.min(...zs)-20,Math.max(...xs)+20,Math.max(...zs)+20,h.p);
}
function inHouse(x,z,pad=0){
  return (houses.get(tile(x,z))||[]).some(p=>inside(x,z,p)||(pad>0&&p.some((a,i)=>nearSegment(x,z,a,p[(i+1)%p.length]).d<pad)));
}
for(const r of city.roads)for(let i=1;i<r.p.length;i++){
  const [x1,z1]=r.p[i-1],[x2,z2]=r.p[i];
  const e={x1,z1,x2,z2,w:r.w,c:r.c,b:r.b,g:0,name:r.n};
  segments.push(e);mark(rgrid,Math.min(x1,x2)-60,Math.min(z1,z2)-60,Math.max(x1,x2)+60,Math.max(z1,z2)+60,e);
}
function nearestRoad(x,z,max=11){
  let best=null;
  for(const e of rgrid.get(tile(x,z))||[]){
    if(e.c>max) continue;
    const p=nearSegment(x,z,[e.x1,e.z1],[e.x2,e.z2]);
    if(!best||p.d<best.d)best={...p,seg:e};
  }return best;
}
const clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
function groundH(x,z){
  const t=map.terrain,px=clamp((x-ox-t.x)/t.step,0,t.width-1),pz=clamp((z-oz-t.z)/t.step,0,t.depth-1);
  const sample=(i,j)=>t.heights[clamp(i,0,t.width-1)+t.width*clamp(j,0,t.depth-1)];
  const i=Math.floor(px),j=Math.floor(pz),f=px-i,g=pz-j;
  return ((1-f)*sample(i,j)+f*sample(i+1,j))*(1-g)+((1-f)*sample(i,j+1)+f*sample(i+1,j+1))*g;
}
const solid=furniture.solids.map(([x,z,hw,hd,angle])=>{const cs=Math.cos(angle),sn=Math.sin(angle);return {cx:x+ox,cz:z+oz,hw,hd,cs,sn,ex:Math.abs(cs)*hw+Math.abs(sn)*hd,ez:Math.abs(sn)*hw+Math.abs(cs)*hd};});
globalThis.location??=new URL('file:///');
if(!globalThis.navigator)Object.defineProperty(globalThis,'navigator',{value:{userAgent:''}});
globalThis.matchMedia??=()=>({matches:false});
globalThis.addEventListener??=()=>{};
const server=await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:false,appType:'custom',
  server:{middlewareMode:true,hmr:false,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent',
  plugins:[{name:'summer-shop-geometry',transform(s,id){
    if(id.endsWith('/src/game/growth.js'))return s+'\nexport function nativeGrowth(api,d,s){A=api;buildDecor(d,0,s);return DECOR.get(d);} export function nativePoster(){POSTER_MAT=null;return posterMat().map.image;}';
    if(id.endsWith('/src/game/pizzadome.js'))return s+'\nexport {signGeo};';
    if(id.endsWith('/src/game/horsebox.js'))return s+'\nexport function nativeTrailer(api){A=api;build();return GEO;}';
    if(id.endsWith('/src/game/nightlife.js')){
      const start=s.indexOf('  for (const q of C.dancers) {',s.indexOf('function clubStep'));
      const end=s.indexOf('  for (const g of C.guests)',start);
      return s.replace('road.d > 10','road.d > (A.facadeDistance || 10)')+
        '\nexport function nativeRoom(api){A=api;return buildClub();} export {findWall,signTex,wallTex};'+
        '\nexport function poseDancers(C,tt,dt){'+s.slice(start,end)+'}';
    }
    if(id.endsWith('/src/game/construction.js'))return s+'\nexport function nativeFind(api){A=api;PLIST=PASS.filter(p=>api.ADULT||!p.adult);for(const _ of findSites()){} return SITES;} export function nativeMake(s,i){build1(s,i);return STANDS[STANDS.length-1];} export {PLIST,CRANES,BODIES,drawPass};';
    if(id.endsWith('/src/game/qguests.js'))return s+'\nexport {bake};';
    if(id.endsWith('/src/game/rivals.js'))return s+'\nexport function nativeFind(api){A=api;const g=findSites();for(;;){const r=g.next();if(r.done)return r.value;}} export function nativeMake(s,i){build1(s,i);return SHOPS[SHOPS.length-1];} export {mascotGeos,SIGNQ,SEAT,LINES,CH,PIECES,signCanvas,jobOf};';
  }}]});
const load=n=>server.ssrLoadModule('/src/game/'+n+'.js');
const lit=[],lamps=[],smash=[],obbs=[],items=[];
const base=global(original.home);
const api={CITY:city,ADULT:true,CAREER:true,SOLIDS:solid,PIZZERIAS:[{x:base[0],z:base[1]}],GEN_ENTR:[],SMASH:smash,NODES:[],V:{x:base[0],z:base[1]},S:{},GORE:[],scene:new THREE.Scene(),
  LIT:lit,LAMPH:lamps,roadWidth:r=>r.w,inHouse,nearestRoad,groundH,distAt:()=>0,inBounds:(x,z)=>inside(x,z,boundary),RSEG:segments,CAR_L:2.49,CAR_W:1,
  boxGeo:(w,h,d)=>new THREE.BoxGeometry(w,h,d),addFoot(){},obb(x,z,w,d,yaw){obbs.push({at:local(x,z),w,d,yaw});},
  smashAdd(kind,x,z,r,geometry,hex){const it={kind,x,z,r,geometry,hex};smash.push(it);items.push(it);return it;}};
function put(array,g,hex,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  const geometry=g.clone();
  if(rx)geometry.rotateX(rx);if(ry)geometry.rotateY(ry);if(rz)geometry.rotateZ(rz);geometry.translate(x,y,z);
  const n=geometry.attributes.position.count;
  if(!geometry.attributes.color){
    const col=new THREE.Color(hex),rgb=new Float32Array(n*3);
    for(let i=0;i<n;i++) rgb.set([col.r,col.g,col.b],3*i);
    geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));
  }
  array.push(geometry);return geometry;
}
api.put=put;
api.box=(a,w,h,d,hex,x,y,z,yaw=0)=>put(a,api.boxGeo(w,h,d),hex,x,y,z,0,yaw,0);
function flatten(meshes){
  const p=[],c=[],n=[],ix=[];
  for(const g of meshes){
    if(!g?.attributes?.position)continue;
    if(!g.attributes.normal)g.computeVertexNormals();
    const count=g.attributes.position.count,offset=p.length/3;
    for(let j=0;j<count;j++){
      const a=g.attributes.position,b=g.attributes.normal,k=g.attributes.color;
      p.push(a.getX(j),a.getY(j),a.getZ(j));n.push(b.getX(j),b.getY(j),b.getZ(j));
      c.push(k?k.getX(j):1,k?k.getY(j):1,k?k.getZ(j):1,1);
    }
    const indices=g.index?g.index.array:Array.from({length:count},(_,i)=>i);
    for(const id of indices)ix.push(offset+id);
  }
  return {p,c,n,ix};
}
api.mergeGeos=list=>{const {p,c,n,ix}=flatten(list),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c.filter((_,i)=>i%4!==3),3));g.setIndex(ix);return g;};
let tint='#ffffff';
api.LITM={color(s){tint=s;},ribbon(x,z,a,b,w,h){
  const dist=Math.hypot(a-x,b-z);api.box(lit,w,.07,dist,tint,(x+a)/2,groundH((x+a)/2,(z+b)/2)+h-.035,(z+b)/2,Math.atan2(a-x,b-z));
},dtri(x,z,a,b,e,f,h){const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.Float32BufferAttribute([x,groundH(x,z)+h,z,a,groundH(a,b)+h,b,e,groundH(e,f)+h,f],3));put(lit,tri,tint);}};
const bufferOf=(v,Type)=>{const a=new Type(v);return Buffer.from(a.buffer,a.byteOffset,a.byteLength);};
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
function variant(id,count,raw){return Buffer.concat([u32(raw.length+8),u32(id),u32(count),raw]);}
function section(shapes,origin){
  const {p,c,n,ix}=flatten(shapes);
  for(let i=0;i<p.length;i+=3){p[i]-=origin[0];p[i+1]-=origin[1];p[i+2]-=origin[2];}
  for(let i=0;i<ix.length;i+=3){const tmp=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=tmp;}
  const body=Buffer.concat([variant(36,p.length/3,bufferOf(p,Float32Array)),variant(36,n.length/3,bufferOf(n,Float32Array)),variant(37,c.length/4,bufferOf(c,Float32Array)),variant(30,ix.length,bufferOf(ix,Int32Array))]);
  const packed=deflateSync(body);
  return Buffer.concat([u32(packed.length),u32(body.length),packed]);
}
if(!process.argv.includes('--depot-only')){
  const horsebox=(await load('horsebox')).nativeTrailer(api);
  await writeFile(new URL('south-horsebox.bin',assets),Buffer.concat(
    ['body','lights','horse','tail'].map(part=>section([horsebox[part]],[0,0,0]))
  ));
}
if(process.argv.includes('--horsebox-only')){
  await server.close();
  process.exit(0);
}
await captureDepotGrowth({api,load,server,section,assets,read,writeFile,createCanvas,THREE,original});
if(process.argv.includes('--depot-only')){
  await server.close();
  process.exit(0);
}
const originalRandom=Math.random;
let visualSeed=0x361107;
Math.random=()=>((visualSeed=(Math.imul(visualSeed,1664525)+1013904223)>>>0)/4294967296);
try{
  const cons=await load('construction'),riv=await load('rivals'),pave=await load('pave');
  pave.init(api);
  const builds=cons.nativeFind(api),shops=riv.nativeFind(api);
  const output=[];
  await mkdir(packageDir,{recursive:true});
  for(const [index,site] of [...builds,...shops].entries()){
    lit.length=lamps.length=items.length=obbs.length=api.scene.children.length=0;
    const r=site.chain?riv.nativeMake(site,index):cons.nativeMake(site,index);
    const sx=site.cx??site.x,sz=site.cz??site.z,origin=[sx,groundH(sx,sz),sz];
    const descriptor={name:site.chain||'work',at:local(sx,sz),ground:origin[1],yaw:Math.atan2(site.ux,site.uz),items:[],walls:[...obbs]};
    const chunks=[section([...lit,...lamps],origin)];
    for(const it of items){
      if(!it.geometry?.length||it.winter||['cons_digger','cons_mixer'].includes(it.kind)||it.kind==='glass')continue;
      const start=[it.x,groundH(it.x,it.z),it.z];
      const body=cons.BODIES.find(b=>b.it===it);
      descriptor.items.push({kind:it.kind,at:local(it.x,it.z),radius:it.r,yaw:body?.ry??it.ry??0});
      chunks.push(section(it.geometry,start));
    }
    if(site.chain){
      descriptor.front=local(site.fx,site.fz);
      descriptor.door=local(...r.door);
      if(site.chain==='sushi'){riv.jobOf(r);descriptor.jobs=r.jobs.map(p=>local(...p));}
      descriptor.roam=r.roam.map(p=>local(...p));
      descriptor.mascots=r.mascots.map(m=>({kind:m.kind,at:local(m.x,m.z)}));
      descriptor.seats=riv.SEAT.filter(seat=>seat.shop===r).map(p=>({at:local(p.x,p.z),yaw:p.ry,y:p.y-origin[1],table:items.indexOf(p.table),variant:p.k%6}));
      descriptor.signs=(riv.SIGNQ[site.chain]||[]).filter(q=>Math.hypot(q[0]-sx,q[2]-sz)<40).map(([x,y,z,nx,nz,w,h])=>({at:local(x,z),y:y-origin[1],normal:[nx,nz],w,h}));
    }else{
      descriptor.gate=local(site.x+site.uz*site.D/2,site.z-site.ux*site.D/2);
      if(r)descriptor.sign={at:local(r.x,r.z),raw:cons.PLIST[site.pass],index:site.pass,yaw:Math.atan2(site.uz,-site.ux)};
      const crane=cons.CRANES.at(-1);
      if(crane&&Math.hypot(crane.x-sx,crane.z-sz)<100){
        const mesh=crane.grp;
        if(mesh){
          descriptor.crane={at:local(crane.x,crane.z),y:crane.grp.position.y-origin[1],yaw:crane.ang};
          chunks.push(section([mesh.geometry],[0,0,0]));
        }
      }
    }
    descriptor.file='block-'+index+'.bin';
    await writeFile(new URL(descriptor.file,packageDir),Buffer.concat(chunks));
    output.push(descriptor);
  }
  const mascots=riv.mascotGeos();
  const people=await load('people'),guests=await load('qguests');
  const factory=people.createHumanFactory({THREE,HUMAN_VC:new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}),HUMANS:new Set()});
  let guest=0;
  const seated=guests.bake({dropMesh(g){ g.traverse(m=>m.geometry?.dispose()); },makeHuman(){const k=guest++;return factory(people.makePerson({seed:20261116+k*15731,fem:k%2===1,locale:'ru'}),{summer:true});}});
  seated.forEach((g,i)=>{mascots['guest'+i]=g;});
  const list=[];
  for(const [name,g] of Object.entries(mascots)){
    if(!g?.attributes) continue;
    await writeFile(new URL(name+'.bin',packageDir),section([g],[0,0,0]));
    list.push(name);
  }
  const dict=JSON.parse(await readFile(new URL('../../src/i18n/en.json',import.meta.url),'utf8'));
  const labels=[riv.CH.sushi.name,riv.CH.burger.name,...riv.LINES.sushi,...riv.LINES.burger,...riv.LINES.up.sushi,...riv.LINES.up.burger];
  const en=Object.fromEntries(labels.filter(s=>dict[s]).map(s=>[s,dict[s]]));
  await writeFile(new URL('sites.json',packageDir),JSON.stringify({sites:output,models:list,lines:riv.LINES,brands:riv.CH,pieces:riv.PIECES,en})+'\n');
  globalThis.document={documentElement:{},createElement:()=>createCanvas(1,1)};
  const {initI18n}=await server.ssrLoadModule('/src/i18n/index.js');
  for(const lang of ['ru','en']){
    await initI18n(lang);
    for(const brand of Object.values(riv.CH)){
      await writeFile(new URL(brand.key+'-'+lang+'.png',packageDir),riv.signCanvas(brand).toBuffer('image/png'));
    }
    for(const {sign} of output.filter(x=>x.sign)){
      const tile=createCanvas(384,288);
      cons.drawPass(tile.getContext('2d'),sign.raw,sign.index);
      await writeFile(new URL('pass-'+sign.index+'-'+lang+'.png',packageDir),tile.toBuffer('image/png'));
    }
  }
  await captureClub({api,server,local,writeFile,assets,packageDir,section,people,factory,groundH,base,createCanvas,initI18n,THREE,variant,bufferOf,u32});
  console.log(output.map(s=>[s.name,s.at,s.items.length]),list);
}finally{Math.random=originalRandom;await server.close();}
