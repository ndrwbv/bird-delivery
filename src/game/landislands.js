/* Маленький обрывок на шве не становится отдельным газоном. Сначала
   связываем фигуры через общие стороны клеток: маленькая часть большого
   газона сохраняется, касание одной точкой связью не считается. */
const ringArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+(a[0]-p[0][0])*(b[1]-p[0][1])-(a[1]-p[0][1])*(b[0]-p[0][0]);},0))/2;
export function pruneLandIslands(groups,{minArea=.1,open=()=>false,onRemove=()=>{}}={}){
  const shapes=[],lines=new Map();
  const find=i=>{while(shapes[i].parent!==i){shapes[i].parent=shapes[shapes[i].parent].parent;i=shapes[i].parent;}return i;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)shapes[b].parent=a;};
  for(const group of groups)for(const region of group.regions){
    const id=shapes.length,shape={region,group,parent:id,area:ringArea(region.outer)-region.holes.reduce((s,h)=>s+ringArea(h),0),open:false};shapes.push(shape);
    for(const ring of [region.outer,...region.holes])for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      for(let axis=0;axis<2;axis++)for(const side of [0,1]){
        const edge=group.core[axis+side*2];
        if(Math.abs(a[axis]-edge)>1e-6||Math.abs(b[axis]-edge)>1e-6)continue;
        const along=1-axis,lo=Math.min(a[along],b[along]),hi=Math.max(a[along],b[along]);if(hi-lo<1e-6)continue;
        const key=axis+':'+Math.round(edge*1e6);let list=lines.get(key);if(!list)lines.set(key,list=[]);list.push({lo,hi,id,side});
        const p=[(a[0]+b[0])/2,(a[1]+b[1])/2];p[axis]+=side?.001:-.001;
        if(open(...p))shape.open=true;
      }
    }
  }
  for(const list of lines.values()){
    list.sort((a,b)=>a.lo-b.lo);
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length&&list[j].lo<list[i].hi-1e-6;j++){
      const a=list[i],b=list[j];if(a.side!==b.side&&Math.min(a.hi,b.hi)-Math.max(a.lo,b.lo)>1e-6)join(a.id,b.id);
    }
  }
  const totals=new Map();
  for(let i=0;i<shapes.length;i++){
    const root=find(i);let sum=totals.get(root);if(!sum)totals.set(root,sum={area:0,open:false});sum.area+=shapes[i].area;sum.open||=shapes[i].open;
  }
  const keep=new Set();let removed=0;
  for(let i=0;i<shapes.length;i++){const sum=totals.get(find(i));if(sum.open||sum.area>=minArea)keep.add(shapes[i].region);else{removed++;onRemove(shapes[i].region);}}
  for(const group of groups)group.regions=group.regions.filter(p=>keep.has(p));
  return removed;
}
