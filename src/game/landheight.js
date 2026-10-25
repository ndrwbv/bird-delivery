/* У воды подъём грунта плавно сходит к нулю. Режем по двум изолиниям,
   чтобы нарисованная плоскость совпадала с высотой движения внутри грани. */
export const LAND_LIFT=.46,SHORE_HEIGHT=.8;
export const landLift=h=>LAND_LIFT*Math.max(0,Math.min(1,h/SHORE_HEIGHT));
function half(p,level,above){
  const out=[];
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],da=a[2]-level,db=b[2]-level;
    const ai=above?da>=0:da<=0,bi=above?db>=0:db<=0;
    if(ai)out.push(a);
    if(ai!==bi){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,level]);}
  }
  return out;
}
export function shoreParts(p){
  const lo=Math.min(...p.map(q=>q[2])),hi=Math.max(...p.map(q=>q[2]));
  if(hi<=0||lo>=SHORE_HEIGHT||(lo>=0&&hi<=SHORE_HEIGHT))return [p];
  return [half(p,0,false),half(half(p,0,true),SHORE_HEIGHT,false),half(p,SHORE_HEIGHT,true)].filter(q=>q.length>=3);
}
