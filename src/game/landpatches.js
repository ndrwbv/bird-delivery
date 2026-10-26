/* Один видимый участок вместо внутренних разрезов вычитания. Объединение
   не упрощает контур: вершины возвращаются из исходных фигур, новые —
   на их исходные рёбра. При неоднозначности оставляем прежние части. */
import Clipper from 'clipper-lib';
const SCALE=1e6,NEAR=2e-6;
const key=(x,z)=>x+','+z;
const area=p=>{const a=p[0];let s=0;for(let i=1;i<p.length-1;i++)s+=(p[i][0]-a[0])*(p[i+1][1]-a[1])-(p[i][1]-a[1])*(p[i+1][0]-a[0]);return s/2;};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const same=(a,b)=>Math.fround(a[0])===Math.fround(b[0])&&Math.fround(a[1])===Math.fround(b[1]);
export const SURFACE_STATS={calls:0,joined:0,before:0,after:0,ambiguous:0,unresolved:0,rings:0,noGain:0,area:0};
function rings(path,resolve){
  const encoded=path.map(p=>[p.X,p.Y]),actual=path.map(resolve);
  const keep=encoded.map((_,i)=>i).filter(i=>cross(encoded[(i+path.length-1)%path.length],encoded[i],encoded[(i+1)%path.length])!==0||cross(actual[(i+path.length-1)%path.length],actual[i],actual[(i+1)%path.length])!==0);
  return {encoded:keep.map(i=>encoded[i]),actual:keep.map(i=>actual[i])};
}
export function landSurfacePieces(parts,triangulate,sameVertex=same){
  if(parts.length<2||parts.length>2048||!triangulate)return parts;
  SURFACE_STATS.calls++;
  const origin=parts[0][0];
  const before=parts.reduce((n,p)=>n+p.length-2,0),points=new Map(),segments=[];
  const paths=parts.map(p=>p.map((a,i)=>{
    const X=Math.round((a[0]-origin[0])*SCALE),Y=Math.round((a[1]-origin[1])*SCALE),k=key(X,Y);let list=points.get(k);
    if(!list)points.set(k,list=[]);
    if(!list.some(b=>a[0]===b[0]&&a[1]===b[1]))list.push(a);
    segments.push([a,p[(i+1)%p.length]]);return {X,Y};
  }));
  const c=new Clipper.Clipper(),tree=new Clipper.PolyTree();c.PreserveCollinear=true;
  c.AddPaths(paths,Clipper.PolyType.ptSubject,true);
  if(!c.Execute(Clipper.ClipType.ctUnion,tree,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero))return parts;
  let valid=true;
  const resolve=v=>{
    const k=key(v.X,v.Y),list=points.get(k);
    if(list){
      if(list.some(p=>!sameVertex(p,list[0]))){valid=false;SURFACE_STATS.ambiguous++;return list[0];}
      return list[0];
    }
    const x=origin[0]+v.X/SCALE,z=origin[1]+v.Y/SCALE,near=segments.filter(([a,b])=>{
      if(x<Math.min(a[0],b[0])-NEAR||x>Math.max(a[0],b[0])+NEAR||z<Math.min(a[1],b[1])-NEAR||z>Math.max(a[1],b[1])+NEAR)return false;
      return Math.abs((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]))<=NEAR*Math.hypot(b[0]-a[0],b[1]-a[1]);
    });
    const ends=near.flat().filter(p=>Math.hypot(p[0]-x,p[1]-z)<=NEAR&&same(p,[x,z]));
    if(ends.length&&ends.every(p=>sameVertex(p,ends[0]))){points.set(k,[ends[0]]);return ends[0];}
    for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++){
      const [a,b]=near[i],[d,e]=near[j],ux=b[0]-a[0],uz=b[1]-a[1],vx=e[0]-d[0],vz=e[1]-d[1],den=ux*vz-uz*vx;
      if(Math.abs(den)<1e-12*Math.hypot(ux,uz)*Math.hypot(vx,vz))continue;
      const dx=d[0]-a[0],dz=d[1]-a[1],t=(dx*vz-dz*vx)/den,u=(dx*uz-dz*ux)/den;
      if(t<0||t>1||u<0||u>1)continue;
      const p=[a[0]+ux*t,a[1]+uz*t];if(Math.hypot(p[0]-x,p[1]-z)>NEAR)continue;
      points.set(k,[p]);return p;
    }
    // Почти совпадающие коллинеарные рёбра могут дать служебный узел
    // посреди прямой. Возвращаем его на исходное ребро, а не на сетку.
    for(const[a,b]of near){
      const dx=b[0]-a[0],dz=b[1]-a[1],n=dx*dx+dz*dz;if(!n)continue;
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/n)),p=[a[0]+t*dx,a[1]+t*dz];
      if(Math.hypot(p[0]-x,p[1]-z)<=NEAR&&sameVertex(p,[x,z])){points.set(k,[p]);return p;}
    }
    valid=false;SURFACE_STATS.unresolved++;return [x,z];
  };
  const regions=Clipper.JS.PolyTreeToExPolygons(tree).map(r=>({outer:rings(r.outer,resolve),holes:r.holes.map(h=>rings(h,resolve))}));
  if(!valid)return parts;
  if(regions.some(r=>r.outer.encoded.length<3||r.holes.some(h=>h.encoded.length<3))){SURFACE_STATS.rings++;return parts;}
  const minimum=regions.reduce((n,r)=>n+r.outer.encoded.length+r.holes.reduce((n,h)=>n+h.encoded.length+2,0)-2,0);
  if(minimum>=before){SURFACE_STATS.noGain++;return parts;}
  const out=[];
  for(const r of regions){
    // Индексы считаются по замкнутой топологии, а рисунок — по прежним
    // координатам. Так почти совпавшие края не теряют отверстие в Earcut.
    const {triangles}=triangulate(r.outer.encoded,r.holes.map(h=>h.encoded)),points=[...r.outer.actual,...r.holes.flatMap(h=>h.actual)];
    for(const ids of triangles){const p=ids.map(i=>points[i]);if(area(p)<0)p.reverse();if(area(p)>1e-10)out.push(p);}
  }
  const wanted=parts.reduce((n,p)=>n+Math.abs(area(p)),0),got=out.reduce((n,p)=>n+area(p),0);
  if(out.length<before&&Math.abs(wanted-got)<=1e-8*Math.max(1,wanted)){SURFACE_STATS.joined++;SURFACE_STATS.before+=before;SURFACE_STATS.after+=out.length;return out;}
  SURFACE_STATS.area++;return parts;
}
