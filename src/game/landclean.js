/* Минимальная ширина газона. Геометрическое раскрытие удаляет тонкие
   полоски, иглы и островки, сохраняя широкую землю. Соседние клетки
   считают форму с запасом, поэтому их общая граница не становится швом. */
import Clipper from 'clipper-lib';
export const LAND_MIN_WIDTH=.8;
const SCALE=1000;
const path=p=>p.map(v=>({X:Math.round(v[0]*SCALE),Y:Math.round(v[1]*SCALE)}));
const polygon=p=>p.map(v=>[v.X/SCALE,v.Y/SCALE]);
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
function clip(subject,other,type,tree=false){
  const c=new Clipper.Clipper();
  c.AddPaths(subject,Clipper.PolyType.ptSubject,true);
  if(other.length)c.AddPaths(other,Clipper.PolyType.ptClip,true);
  const result=tree?new Clipper.PolyTree():[];
  c.Execute(type,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
  return result;
}
function offset(paths,amount){
  if(!paths.length)return [];
  const o=new Clipper.ClipperOffset(2,5),result=[];
  o.AddPaths(paths,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
  o.Execute(result,amount*SCALE);return result;
}
// Исходные фигуры — внешние контуры против часовой стрелки, отверстия —
// наоборот. Результат Clipper сохраняет эту пару направлений.
export function cleanLandPolygons(polygons,core,width=LAND_MIN_WIDTH,overlap=.005){
  const original=clip(polygons.map(path),[],Clipper.ClipType.ctUnion);
  // Небольшой запас сохраняет минимум 80 см и после подгонки кромки
  // и округлённых дуг. Проверка ширины использует исходный минимум.
  const radius=(width+(overlap ? .04 : 0))/2;
  const opened=offset(offset(original,-radius),radius);
  const removed=clip(original,opened,Clipper.ClipType.ctDifference);
  // Исходный город хранит дробные координаты, расчёт — миллиметры.
  // Заходим на соседнее покрытие на 5 мм, чтобы округление не оставляло
  // вдоль него волосок поднятой зелёной земли с вертикальной стенкой.
  // Заход делается после обрезки клеткой и закрывает также её общий шов.
  const cropped=clip(removed,[path(rectangle(core))],Clipper.ClipType.ctIntersection);
  const tree=clip(overlap?offset(cropped,overlap):cropped,[],Clipper.ClipType.ctUnion,true);
  return Clipper.JS.PolyTreeToExPolygons(tree).map(p=>({outer:polygon(p.outer),holes:p.holes.map(polygon)}));
}
export function landCleanTile(cover,green,core,width=LAND_MIN_WIDTH,overlap=.005){
  const pad=width*2,bounds=[core[0]-pad,core[1]-pad,core[2]+pad,core[3]+pad];
  const frame=[path(rectangle(bounds))];
  const paving=cover.inBox(bounds),groups=new Map();
  const paved=clip(paving.map(t=>path(t.p)),frame,Clipper.ClipType.ctIntersection);
  const pieces=clip(frame,paved,Clipper.ClipType.ctDifference);
  // Сначала ограничиваем все фигуры клеткой. Островки зелени видны
  // только поверх более низкого мощения; пол здания всегда закрывает их.
  for(const t of green.inBox(bounds)){
    let p=groups.get(t.lift);if(!p)groups.set(t.lift,p=[]);p.push(path(t.p));
  }
  for(const [height,paths] of groups){
    const local=clip(paths,frame,Clipper.ClipType.ctIntersection);
    const blockers=paving.filter(t=>t.lift>=height).map(t=>path(t.p));
    pieces.push(...clip(local,blockers,Clipper.ClipType.ctDifference));
  }
  return cleanLandPolygons(pieces.map(polygon),core,width,overlap);
}
/* Независимая проверка ширины: от реальной границы идём поперёк газона
   до следующего покрытия, по точным пересечениям луча с треугольниками.
   Здесь нет повторного округления и нет технологического захода мощения. */
export function landWidth(cover,green,edge,t=.5,limit=2){
  const dx=edge.b[0]-edge.a[0],dz=edge.b[1]-edge.a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
  const x=edge.a[0]+dx*t,z=edge.a[1]+dz*t;
  const land=(r)=>{const px=x+nx*r,pz=z+nz*r,p=cover.height(px,pz);return green.height(px,pz)>p||p===-Infinity;};
  if(!land(.001))return 0;
  const cuts=[.001/limit,...cover.breaks(x,z,x+nx*limit,z+nz*limit),...green.breaks(x,z,x+nx*limit,z+nz*limit)].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
    const a=Math.max(.001,cuts[i-1]*limit),b=cuts[i]*limit;
    if(b-a<1e-7)continue;
    if(!land((a+b)/2))return a;
  }
  return limit;
}
