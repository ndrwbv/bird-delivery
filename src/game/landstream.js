/* Подробная поверхность нужна вокруг камеры, а не сразу во всём городе.
   Опора и правила движения уже готовы; до замены остаётся исходная земля.
   Готовый участок публикуется целиком, затем скрывается его старый слой. */
export function createLandStream({terrain,build,publish=()=>{},radius=832,now=()=>performance.now()}) {
  const size=terrain.g*16,x0=terrain.x0,z0=terrain.z0;
  const nx=Math.ceil((terrain.nx-1)/16),nz=Math.ceil((terrain.nz-1)/16);
  const ready=new Uint8Array(nx*nz),failed=new Set();
  const stats={ready:0,total:nx*nz,steps:0,maxStep:0,ms:0,failed:0};
  let active=null,visualSeed=0x5a17;
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
  function advance(x,z,r) {
    if(!active){const id=nearest(x,z,r);if(id===null)return false;active={id,it:build(bounds(id))};}
    const t=now();
    try {
      const result=quiet(()=>active.it.next());
      if(result.done){quiet(()=>publish(active.id,result.value));ready[active.id]=255;stats.ready++;active=null;}
    } catch(error) {
      // Не скрываем исходный участок при ошибке. Предохранитель кадра
      // запишет исключение, а очередь сможет строить соседние участки.
      failed.add(active.id);stats.failed++;active=null;throw error;
    } finally {const ms=now()-t;stats.ms+=ms;stats.maxStep=Math.max(stats.maxStep,ms);stats.steps++;}
    return true;
  }
  return {ready,stats,size,nx,nz,x0,z0,x1:x0+(terrain.nx-1)*terrain.g,z1:z0+(terrain.nz-1)*terrain.g,bounds,
    *prepare(x,z,r=640){while(advance(x,z,r))yield 'земля рядом';if(nearest(x,z,r,true)!==null)throw Error('Участок земли не построен');},
    step(x,z,budget=.75){const t=now();while(advance(x,z,radius)&&now()-t<budget){}},
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
