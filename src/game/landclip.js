/* Видимый камень строится с соседними рёбрами за границей участка,
   чтобы сохранить общий угол. Здесь отрезается только готовый рисунок:
   высота новой вершины лежит на исходной грани, её обход не меняется. */
export function clippedMesher(M,bounds,{includeMaxX=false,includeMaxZ=false}={}){
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw Error('Неверные границы участка камня');
  const [x0,z0,x1,z1]=bounds;
  const inside=p=>p[0]>=x0&&p[0]<=x1&&p[2]>=z0&&p[2]<=z1;
  // Most curb faces are wholly inside the tile or outside its seam halo.
  // Classify their coordinates before allocating polygon vertices.
  const classify = (v, n) => {
    let left = v[0], right = left, top = v[2], bottom = top;
    for (let i = 3; i < n; i += 3) {
      left = Math.min(left, v[i]); right = Math.max(right, v[i]);
      top = Math.min(top, v[i + 2]); bottom = Math.max(bottom, v[i + 2]);
    }
    if (right < x0 || left > x1 || bottom < z0 || top > z1 ||
        !includeMaxX && left === x1 && right === x1 ||
        !includeMaxZ && top === z1 && bottom === z1) return -1;
    return +(left >= x0 && right <= x1 && top >= z0 && bottom <= z1);
  };
  // Вертикальная грань ровно на шве принадлежит участку справа/снизу.
  // Обычные поверхности, только касающиеся шва, остаются у обоих соседей.
  const owned=p=>(includeMaxX||!p.every(v=>v[0]===x1))&&(includeMaxZ||!p.every(v=>v[2]===z1));
  const clip=points=>{
    let p=points;
    for(const[axis,value,sign]of [[0,x0,1],[0,x1,-1],[2,z0,1],[2,z1,-1]]){
      const q=[];
      for(let i=0;i<p.length;i++){
        const a=p[i],b=p[(i+1)%p.length],da=(a[axis]-value)*sign,db=(b[axis]-value)*sign;
        if(da>=0)q.push(a);
        if((da>=0)!==(db>=0)){
          const t=da/(da-db),v=a.map((n,k)=>n+(b[k]-n)*t);v[axis]=value;q.push(v);
        }
      }
      p=q;if(p.length<3)return [];
    }
    return p;
  };
  const area=(a,b,c)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    return (u[1]*v[2]-u[2]*v[1])**2+(u[2]*v[0]-u[0]*v[2])**2+(u[0]*v[1]-u[1]*v[0])**2;
  };
  const triangle=(points,up,normals=[])=>{
    if(!owned(points))return;
    if(points.every(inside)){(up?M.up:M.tri).call(M,...points.flat(),...normals);return;}
    const p=clip(points);if(!p.length||!owned(p))return;
    for(let i=1;i<p.length-1;i++)if(area(p[0],p[i],p[i+1])>1e-20)(up?M.up:M.tri).call(M,...p[0],...p[i],...p[i+1],...normals);
  };
  const addTriangle = (v, up) => {
    const k = classify(v, 9);
    if (k < 0) return;
    if (k > 0) { (up ? M.up : M.tri).call(M, ...v); return; }
    triangle([v.slice(0,3),v.slice(3,6),v.slice(6,9)],up,v.slice(9));
  };
  const api={
    color(...args){M.color(...args);return api;},
    up(...v){addTriangle(v,true);},
    tri(...v){addTriangle(v,false);},
    quad(...v){
      const k = classify(v, 12);
      if (k < 0) return;
      if (k > 0) { M.quad(...v); return; }
      const p=[v.slice(0,3),v.slice(3,6),v.slice(6,9),v.slice(9,12)];
      // У неплоской четвёрки две разные плоскости: сохраняем диагональ
      // Mesher.quad, иначе отрезанная грань получит другую высоту/нормаль.
      triangle([p[0],p[1],p[2]],false,v.slice(12));
      triangle([p[0],p[2],p[3]],false,v.slice(12));
    },
  };
  return api;
}
