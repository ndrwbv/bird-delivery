import { STARTUP } from './startuptrace.js';
import { createTileQueue } from './tilequeue.js';
/* Подробная поверхность нужна вокруг камеры, а не сразу во всём городе.
   Опора и правила движения уже готовы; до замены остаётся исходная земля.
   Готовый участок публикуется целиком, затем скрывается его старый слой. */
export function createLandStream({terrain,build,publish=()=>{},dispose=()=>{},visible=()=>false,radius=832,now=()=>performance.now()}) {
  const size=terrain.g*16,x0=terrain.x0,z0=terrain.z0;
  const nx=Math.ceil((terrain.nx-1)/16),nz=Math.ceil((terrain.nz-1)/16);
  const ready=new Uint8Array(nx*nz),failed=new Set();
  const stats={ready:0,total:nx*nz,steps:0,maxStep:0,ms:0,failed:0};
  let visualSeed=0x5a17,focus=null,lastPlan=null;
  // UUID мешей three.js используют Math.random. Догрузка рисунка не
  // должна менять случайные события и поведение людей во время смены.
  const quiet=fn=>{const previous=Math.random;Math.random=()=>((visualSeed=(Math.imul(visualSeed,1664525)+1013904223)>>>0)/4294967296);try{return fn();}finally{Math.random=previous;}};
  const bounds=id=>{const i=id%nx,j=Math.floor(id/nx);return [x0+i*size,z0+j*size,Math.min(x0+(i+1)*size,x0+(terrain.nx-1)*terrain.g),Math.min(z0+(j+1)*size,z0+(terrain.nz-1)*terrain.g)];};
  function nearest(x,z,r,includeFailed=false) {
    let best=null,distance=Infinity;
    for(let j=Math.max(0,Math.floor((z-r-z0)/size));j<=Math.min(nz-1,Math.floor((z+r-z0)/size));j++)
      for(let i=Math.max(0,Math.floor((x-r-x0)/size));i<=Math.min(nx-1,Math.floor((x+r-x0)/size));i++){
        const id=j*nx+i;if(ready[id]||!includeFailed&&failed.has(id))continue;
        const b=bounds(id),dx=Math.max(b[0]-x,0,x-b[2]),dz=Math.max(b[1]-z,0,z-b[3]),d=dx*dx+dz*dz;
        if(d<=r*r&&d<distance){distance=d;best=id;}
      }
    return best;
  }
  const queue=createTileQueue({build:id=>build(bounds(id)),dispose,
    onError:id=>failed.add(id),
    onRequest:()=>STARTUP.count('land.cellsRequested'),publish(id,value){publish(id,value);ready[id]=255;stats.ready++;}});
  stats.queue=queue.stats;
  function request(x,z,r,{heading=0,speed=0,route=null,routeIndex=0,initial=false}={}) {
    const requests=new Map(),hx=Math.sin(heading),hz=Math.cos(heading);
    const reset=initial||!!focus&&Math.hypot(x-focus.x,z-focus.z)>radius;
    focus={x,z};
    function add(cx,cz,range,tier) {
      for(let j=Math.max(0,Math.floor((cz-range-z0)/size));j<=Math.min(nz-1,Math.floor((cz+range-z0)/size));j++)
        for(let i=Math.max(0,Math.floor((cx-range-x0)/size));i<=Math.min(nx-1,Math.floor((cx+range-x0)/size));i++){
          const id=j*nx+i;if(ready[id]||failed.has(id))continue;
          const b=bounds(id),dx=Math.max(b[0]-cx,0,cx-b[2]),dz=Math.max(b[1]-cz,0,cz-b[3]);
          if(dx*dx+dz*dz>range*range)continue;
          const distance=Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]));
          const rank=tier===2?(distance<=size?0:visible(b)?1:2):tier;
          const priority=rank*1e6+distance,previous=requests.get(id);
          if(!previous||priority<previous.priority)requests.set(id,{id,priority});
        }
    }
    add(x,z,r,2);
    if(!initial){
      // Bounded speculative work. This is a scheduling hint, not a measured
      // latency reserve and never a replacement for the full near circle.
      const ahead=Math.min(size*3,Math.abs(speed)*4);
      if(ahead>0)add(x+hx*ahead,z+hz*ahead,size,3);
      if(route)for(let i=Math.max(0,routeIndex);i<Math.min(route.length,routeIndex+24);i++){
        const p=route[i];if(Math.hypot(p[0]-x,p[1]-z)<=r+size*2)add(p[0],p[1],size/2,4);
      }
    }
    queue.sync([...requests.values()],{reset});
  }
  function advance() {
    if(!queue.stats.queued)return false;
    const t=now();
    try {
      return quiet(()=>queue.advance());
    } catch(error) {
      // Не скрываем исходный участок при ошибке. Предохранитель кадра
      // запишет исключение, а очередь сможет строить соседние участки.
      stats.failed++;throw error;
    } finally {const ms=now()-t;stats.ms+=ms;stats.maxStep=Math.max(stats.maxStep,ms);stats.steps++;}
  }
  return {ready,stats,size,nx,nz,x0,z0,x1:x0+(terrain.nx-1)*terrain.g,z1:z0+(terrain.nz-1)*terrain.g,bounds,
    *prepare(x,z,r=640){lastPlan=null;quiet(()=>request(x,z,r,{initial:true}));while(advance())yield 'земля рядом';if(nearest(x,z,r,true)!==null)throw Error('Участок земли не построен');},
    step(x,z,budget=.75,options={}){
      const t=now(),heading=options.heading||0,speed=options.speed||0;
      if(!lastPlan||t-lastPlan.at>=200||Math.hypot(x-lastPlan.x,z-lastPlan.z)>32||
        Math.abs(Math.atan2(Math.sin(heading-lastPlan.heading),Math.cos(heading-lastPlan.heading)))>.35||
        Math.abs(speed-lastPlan.speed)>10||options.route!==lastPlan.route){
        quiet(()=>request(x,z,radius,options));lastPlan={x,z,heading,speed,route:options.route,at:t};
      }
      // Include planning in the frame budget; the next indivisible builder
      // step may still exceed it, as before. Do not claim a hard time cap.
      while(now()-t<budget&&advance()){}
    },
    // Publication only. GPU upload/warm and supportReady remain separate
    // startup barriers; this must not be used to bypass LATE.
    readyAt(x,z,r=0){return nearest(x,z,r,true)===null;}
  };
}

// Маска не зависит от групп склейки (их треугольники пересекают границы
// участков). Старую землю убираем точно по границе готовой новой клетки.
export function streamedGroundMaterial(THREE,source,stream) {
  const tex=new THREE.DataTexture(stream.ready,stream.nx,stream.nz,THREE.RedFormat);
  tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;
  const mat=source.clone(),previous=source.onBeforeCompile,cache=source.customProgramCacheKey;
  mat.onBeforeCompile=function(sh,renderer){
    previous.call(this,sh,renderer);
    sh.uniforms.landReady={value:tex};
    sh.uniforms.landEnd={value:new THREE.Vector2(stream.x1,stream.z1)};
    sh.uniforms.landArea={value:new THREE.Vector4(stream.x0,stream.z0,stream.size*stream.nx,stream.size*stream.nz)};
    sh.vertexShader='varying vec2 landXZ;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlandXZ = position.xz;');
    sh.fragmentShader='uniform sampler2D landReady; uniform vec4 landArea; uniform vec2 landEnd; varying vec2 landXZ;\n'+sh.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
vec2 landUV = (landXZ - landArea.xy) / landArea.zw;
if (all(greaterThanEqual(landUV,vec2(0.0))) && all(lessThan(landXZ,landEnd)) && texture2D(landReady,landUV).r > 0.5) discard;`);
  };
  mat.customProgramCacheKey=()=>cache.call(source)+'|stream-ground';
  return {material:mat,update(){tex.needsUpdate=true;}};
}
