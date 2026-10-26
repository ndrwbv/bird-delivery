import {SHORE_HEIGHT} from './landheight.js';
/* Открытая земля и цветной газон — части одной поверхности. Здесь
   находятся только торцы цветного слоя возле открытой земли; на краю
   мощения их уже закрывает бордюр. */
export function* landPaintEdges(p,green,mask){
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-6)continue;
    const nx=-dz/length,nz=dx/length,cuts=green.breaks(...a,...b).sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
      const from=cuts[j-1],to=cuts[j];if((to-from)*length<1e-6)continue;
      const x=a[0]+dx*(from+to)/2,z=a[1]+dz*(from+to)/2,[left,right]=green.sideHeights(x,z,nx,nz);
      if(left>0||right<=0)continue;
      const u=[a[0]+dx*from,a[1]+dz*from],v=[a[0]+dx*to,a[1]+dz*to],landCuts=(mask?.breaks?.(...u,...v)||[0,1]).sort((a,b)=>a-b);
      for(let k=1;k<landCuts.length;k++){
        const lo=from+(to-from)*landCuts[k-1],hi=from+(to-from)*landCuts[k];if((hi-lo)*length<1e-6)continue;
        const x=a[0]+dx*(lo+hi)/2,z=a[1]+dz*(lo+hi)/2;
        if(mask&&!mask.sides(x,z,nx,nz).every(Boolean))continue;
        yield {a:[a[0]+dx*lo,a[1]+dz*lo],b:[a[0]+dx*hi,a[1]+dz*hi],height:right};
      }
    }
  }
}
export function shoreLine(a,b){
  const cuts=[0,1];
  if(a[2]!==b[2])for(const level of [0,SHORE_HEIGHT]){const t=(level-a[2])/(b[2]-a[2]);if(t>0&&t<1)cuts.push(t);}
  cuts.sort((a,b)=>a-b);
  const at=t=>a.map((v,i)=>v+(b[i]-v)*t);
  return cuts.slice(1).map((t,i)=>[at(cuts[i]),at(t)]);
}
