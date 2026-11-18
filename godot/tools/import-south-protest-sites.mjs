// Place the released notice poles and find flat walls in the clipped district once, off the game thread.
import {readFile,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const assets=new URL('../assets/',import.meta.url);
const map=JSON.parse(await readFile(new URL('south-region.json',assets)));
const topics=JSON.parse(await readFile(new URL('south-event-sites.json',assets))).topics;
const source=await readFile(new URL('../../src/game/protests.js',import.meta.url),'utf8');
function fromSource(first,last,vars,name){
  const a=source.indexOf(first),b=source.indexOf(last,a);
  if(a<0||b<=a) throw new Error(first);
  return runInNewContext(source.slice(a,b)+'\n'+name,vars);
}
const mulberry=fromSource('function mulberry (','\n',{},'mulberry');
const bucket=new Map(), homes=new Map(), roads=new Map();
const cell=(x,z,n=64)=>[Math.floor(x/n),Math.floor(z/n)].join(',');
function add(index,key,value){if(!index.has(key)) index.set(key,[]); index.get(key).push(value);}
function bounds(index,x0,z0,x1,z1,value,pad){
  for(let x=Math.floor((x0-pad)/64);x<=Math.floor((x1+pad)/64);x++)
    for(let z=Math.floor((z0-pad)/64);z<=Math.floor((z1+pad)/64);z++) add(index,x+','+z,value);
}
function inside(x,z,poly){
  let result=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
for(const h of map.buildings){
  const xs=h.outline.map(p=>p[0]),zs=h.outline.map(p=>p[1]);
  bounds(homes,Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs),h.outline,0.7);
}
const inHouse=(x,z)=> (homes.get(cell(x,z))||[]).some(poly=>inside(x,z,poly));
for(const road of map.roads){
  for(let i=1;i<road.points.length;i++){
    const [x,z]=road.points[i-1],[a,b]=road.points[i],len=Math.hypot(a-x,b-z);
    if(len<0.1) continue;
    const e={x,z,a,b,len,w:road.width,ux:(a-x)/len,uz:(b-z)/len};
    bounds(roads,Math.min(a,x),Math.min(b,z),Math.max(a,x),Math.max(b,z),e,e.w/2+1);
    if(road.class<=4 && !road.deck_y && len>=14){
      add(bucket,cell((a+x)/2+map.origin[0],(b+z)/2+map.origin[1],200),e);
    }
  }
}
function clear(x,z){
  if(!inside(x,z,map.boundary)||inHouse(x,z)||inHouse(x+.45,z)||inHouse(x-.45,z)||inHouse(x,z+.45)||inHouse(x,z-.45)) return false;
  for(const e of roads.get(cell(x,z))||[]){
    const t=Math.max(0,Math.min(e.len,(x-e.x)*e.ux+(z-e.z)*e.uz));
    if(Math.hypot(x-e.x-e.ux*t,z-e.z-e.uz*t)<e.w*.5+.5) return false;
  }
  return true;
}
const wall=fromSource('function wallHit (','function okPost (',{A:{inHouse,groundH:()=>0}},'wallFrom');
const items=[],counts=[];
for(let topic=0;topic<topics.length;topic++){
  let n=0;
  for(const [tile,segments] of bucket){
    const [ci,cj]=tile.split(',').map(Number),rng=mulberry((ci*73856093)^(cj*19349663)^topic);
    for(const e of segments){
      let d=4+rng()*22;
      while(d<e.len-4){
        const side=rng()<.5?1:-1; rng(); const rg=rng(),r1=rng(),r2=rng(),r3=rng(),r4=rng();
        const nx=e.uz*side,nz=-e.ux*side,rx=e.x+e.ux*d,rz=e.z+e.uz*d;
        const x=rx+nx*(e.w/2+1),z=rz+nz*(e.w/2+1);
        const pole=clear(x,z);
        let w=null;
        if(rg<.60){
          const x0=rx+e.ux*4,z0=rz+e.uz*4;
          w=wall(x0,z0,-nx,-nz,e.w,e.ux,e.uz)||wall(x0,z0,nx,nz,e.w,e.ux,e.uz);
        }
        if(pole||w){
          items.push(x,z,Math.atan2(e.ux,e.uz),Number(pole),w?w.x:0,w?w.z:0,w?Math.atan2(w.nx,w.nz):0,
            w?rg:1,r1,r2,r3,r4);
          n++;
        }
        d+=40+rng()*30;
      }
    }
  }
  counts.push(n);
}
const out=Buffer.alloc(8+counts.length*4+items.length*4);
out.write('PRT1');out.writeUInt32LE(counts.length,4);
counts.forEach((n,i)=>out.writeUInt32LE(n,8+4*i));
items.forEach((v,i)=>out.writeFloatLE(v,8+counts.length*4+i*4));
await writeFile(new URL('south-protest-sites.bin',assets),out);
console.log(counts);
