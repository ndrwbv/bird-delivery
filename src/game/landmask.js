/* Окончательный газон хранится положительной областью. Серое заполнение
   больше не может вернуть в него случайную зелёную щель между гранями.
   Та же область отвечает на запросы опоры и обрезает видимую землю. */
import {createLandCover,intersectConvex} from './landcover.js';
import {unionLandRegions,subtractLandRegions} from './landclean.js';
import {pruneLandIslands} from './landislands.js';
const CELL=32,key=(x,z)=>Math.floor(x/CELL)+','+Math.floor(z/CELL);
export function createLandMask(fallback=()=>true,fallbackBreaks=()=>[]){
  const kept=createLandCover(CELL),domain=new Map(),pending=[],removedRegions=[];let segments=[];
  let ready=false;
  function reserve(core){domain.set(key(core[0],core[1]),false);}
  function add(core,regions,triangulate){
    domain.set(key(core[0],core[1]),true);
    pending.push({core,regions,triangulate});
  }
  function weld(){
    const groups=new Map();
    for(const {core,regions}of pending)for(const p of regions)for(const ring of [p.outer,...p.holes])for(const v of ring){
      for(let axis=0;axis<2;axis++){
        if(Math.abs(v[axis]-core[axis])>1e-7&&Math.abs(v[axis]-core[axis+2])>1e-7)continue;
        const along=1-axis,corner=Math.round(v[along]/CELL)*CELL;
        if(Math.abs(v[along]-corner)<.01)v[along]=corner;
        const k=axis+':'+v[axis];let list=groups.get(k);if(!list)groups.set(k,list=[]);list.push({v,along,value:v[along]});
      }
    }
    // Соседние клетки получают одну вершину пересечения на общей стороне.
    // Простое перекрытие клеток оставляло в этом месте тонкий выступ.
    for(const list of groups.values()){
      list.sort((a,b)=>a.value-b.value);
      for(let start=0;start<list.length;){
        let end=start+1;while(end<list.length&&list[end].value-list[start].value<.03)end++;
        const corner=list.slice(start,end).find(p=>Math.abs(p.value/CELL-Math.round(p.value/CELL))<1e-9);
        const value=corner?corner.value:Math.round(list.slice(start,end).reduce((s,p)=>s+p.value,0)/(end-start)*1e6)/1e6;
        for(let i=start;i<end;i++)list[i].v[list[i].along]=value;
        start=end;
      }
    }
  }
  const cleanRing=ring=>{
    const out=[];for(const v of ring){const p=out.at(-1);if(!p||Math.hypot(v[0]-p[0],v[1]-p[1])>1e-8)out.push(v);}
    if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<1e-8)out.pop();
    return out;
  };
  function* finishSteps(){
    weld();yield 'стыки газонов';let n=0;
    // Объединяем соседние области до триангуляции. Клетки служат только
    // для поиска: их внутренние рёбра не должны становиться торцами камня.
    const groups=new Map(),span=CELL*4;
    for(const entry of pending){
      const x=Math.floor(entry.core[0]/span)*span,z=Math.floor(entry.core[1]/span)*span,k=x+','+z;
      let group=groups.get(k);if(!group)groups.set(k,group={core:[x,z,x+span,z+span],regions:[],triangulate:entry.triangulate});
      group.regions.push(...entry.regions);
    }
    pending.length=0;
    for(const group of groups.values()){
      group.regions=unionLandRegions(group.regions);pending.push(group);
      if(++n%64===0)yield 'цельные контуры';
    }
    groups.clear();weld();
    // Подгонка общей точки может оставить обратный шип из нескольких
    // вершин. Убираем его после подгонки, до опоры, рисунка и камня.
    for(const group of pending){
      const cleaned=unionLandRegions(group.regions);removedRegions.push(...subtractLandRegions(group.regions,cleaned));group.regions=cleaned;
    }
    pruneLandIslands(pending,{onRemove:p=>removedRegions.push(p),open:(x,z)=>{const state=domain.get(key(x,z));return state===undefined||state===false&&fallback(x,z);}});n=0;
    for(const {core,regions,triangulate}of pending){
      for(const p of regions){
        const outer=cleanRing(p.outer),holes=p.holes.map(cleanRing).filter(h=>h.length>=3);if(outer.length<3)continue;
        const {points,triangles}=triangulate(outer,holes);
        for(const ids of triangles)kept.triangle(...points[ids[0]],...points[ids[1]],...points[ids[2]]);
        for(const ring of [outer,...holes])for(let i=0;i<ring.length;i++)segments.push(...ring[i],...ring[(i+1)%ring.length]);
        if(kept.rawCount>=16384)kept.compact();
      }
      if(++n%128===0)yield 'единый газон';
    }
    pending.length=0;kept.compact();segments=Float64Array.from(segments);ready=true;
  }
  function contains(x,z){
    const state=domain.get(key(x,z));
    return state===true?kept.covered(x,z):state===undefined?true:fallback(x,z);
  }
  function* parts(p,raw=q=>[q]){
    const bounds=[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
    for(let i=Math.floor(bounds[0]/CELL);i<=Math.floor(bounds[2]/CELL);i++)for(let j=Math.floor(bounds[1]/CELL);j<=Math.floor(bounds[3]/CELL);j++){
      const state=domain.get(i+','+j),x=i*CELL,z=j*CELL;
      const q=intersectConvex(p,[[x,z],[x+CELL,z],[x+CELL,z+CELL],[x,z+CELL]]);if(!q.length)continue;
      if(state===true)yield* kept.inside(q);else if(state===false)yield* raw(q);else yield q;
    }
  }
  function breaks(ax,az,bx,bz){
    const out=[...kept.breaks(ax,az,bx,bz)];
    // Исходные рёбра нужны только в пропущенной области. В очищенном
    // газоне они уже не границы и не должны резать новый камень.
    if(domain.get(key(ax,az))===false||domain.get(key(bx,bz))===false)out.push(...fallbackBreaks(ax,az,bx,bz));
    for(const [a,b] of [[ax,bx],[az,bz]])if(Math.abs(b-a)>1e-9){
      for(let n=Math.ceil(Math.min(a,b)/CELL);n<=Math.floor(Math.max(a,b)/CELL);n++){
        const t=(n*CELL-a)/(b-a);if(t>0&&t<1)out.push(t);
      }
    }
    return out;
  }
  function* boundaries({accept=()=>true,stats={},floorAt=()=>.085,includeWalls=false}={}){
    const seen=new Set(),emitted=new Set(),point=(x,z)=>Math.round(x*1e6)+','+Math.round(z*1e6);
    const edgeKey=(ax,az,bx,bz)=>{const a=point(ax,az),b=point(bx,bz);return a<b?a+':'+b:b+':'+a;};
    stats.edges=stats.segments=stats.length=0;
    for(let i=0;i<segments.length;i+=4){
      const ax=segments[i],az=segments[i+1],bx=segments[i+2],bz=segments[i+3],id=edgeKey(ax,az,bx,bz);
      if(seen.has(id))continue;seen.add(id);stats.edges++;
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<1e-6)continue;
      const nx=-dz/len,nz=dx/len,cuts=breaks(ax,az,bx,bz).sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++){
        const a=cuts[j-1],b=cuts[j];if((b-a)*len<1e-5)continue;
        const x=ax+dx*(a+b)/2,z=az+dz*(a+b)/2;
        const left=contains(x+nx*.0001,z+nz*.0001),right=contains(x-nx*.0001,z-nz*.0001);
        if(left===right||!accept(x,z))continue;
        const lift=floorAt(x+(left?-nx:nx)*.01,z+(left?-nz:nz)*.01);if(lift>=.49&&!includeWalls)continue;
        let p=[ax+dx*a,az+dz*a],q=[ax+dx*b,az+dz*b];if(!left)[p,q]=[q,p];
        const k=edgeKey(...p,...q);if(emitted.has(k))continue;emitted.add(k);
        stats.segments++;stats.length+=(b-a)*len;yield {a:p,b:q,lift};
      }
      if(i%512===0)yield null;
    }
  }
  return {reserve,add,contains,parts,breaks,kept,removedRegions,
    boundaries,finishSteps,finish(){for(const step of finishSteps()){}},get ready(){return ready;},get count(){return kept.count;},
    get segments(){return segments;},get cells(){return domain.size;}};
}
