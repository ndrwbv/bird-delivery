/* Только новые неподвижные поверхности земли. Общая сетка всех клеток
   сохраняет одинаковые торцы: горизонталь — 1/1024 м, высота — до 1/512 м.
   Контур движения остаётся Float64; неподходящий меш остаётся Float32. */
export function createLandPositionCodec(x0,z0,y0,stepY=1/1024){
  const stats={cells:0,fallback:0,before:0,after:0,error:0,colors:0,colorFallback:0,colorBefore:0,colorAfter:0,merged:0,mergeBytes:0};
  const colors=new Map(),palette=new Uint8Array(256*4);let revision=0;
  let scratch=null;
  function dedup(data,colors,index){
    const n=colors.length,original={data,colors,index};if(n<3)return original;
    if(!scratch||scratch.n<n){let cap=1024;while(cap<n)cap*=2;scratch={n:cap,table:new Int32Array(cap*2),map:new Uint32Array(cap),source:new Uint32Array(cap)};}
    let size=64;while(size<n*2)size*=2;
    const table=scratch.table.subarray(0,size).fill(-1),mask=table.length-1,map=scratch.map,source=scratch.source,words=new Uint32Array(data.buffer,data.byteOffset,data.byteLength/4);let count=0;
    for(let v=0;v<n;v++){
      const a=words[v*2],b=words[v*2+1],c=colors[v];let h=Math.imul(a,0x9e3779b1)^Math.imul(b,0x85ebca6b)^Math.imul(c,0x27d4eb2f);h^=h>>>15;let at=h&mask;
      for(;;){const first=table[at];if(first<0){table[at]=v;map[v]=count;source[count++]=v;break;}if(words[first*2]===a&&words[first*2+1]===b&&colors[first]===c){map[v]=map[first];break;}at=(at+1)&mask;}
    }
    const ni=index?index.length:n,bytes=count*9+ni*(count<=65535?2:4),before=data.byteLength+colors.byteLength+(index?.byteLength||0);
    if(count===n||bytes>=before)return original;
    const p=new Uint16Array(count*4),c=new Uint8Array(count),ix=count<=65535?new Uint16Array(ni):new Uint32Array(ni);
    for(let i=0;i<count;i++){const v=source[i];for(let j=0;j<4;j++)p[i*4+j]=data[v*4+j];c[i]=colors[v];}
    for(let i=0;i<ni;i++)ix[i]=map[index?index[i]:i];
    stats.merged+=n-count;stats.mergeBytes+=before-bytes;stats.after-=(n-count)*8;stats.colorAfter-=n-count;
    return {data:p,colors:c,index:ix};
  }
  function attributes(data,colors){
    const n=colors.length,p=new Uint16Array(n*3),c=new Uint8Array(n*3);
    for(let i=0;i<n;i++){
      p[i*3]=data[i*4];p[i*3+1]=data[i*4+1];p[i*3+2]=data[i*4+2];
      c[i*3]=data[i*4+3]&255;c[i*3+1]=data[i*4+3]>>8;c[i*3+2]=colors[i];
    }
    stats.after-=n*2;stats.colorAfter+=n*2;return {positions:p,colors:c};
  }
  function packColors(c){
    const extra=new Set();
    for(let i=0;i<c.length;i+=3){const rgb=c[i]<<16|c[i+1]<<8|c[i+2];if(!colors.has(rgb))extra.add(rgb);}
    if(colors.size+extra.size>256){stats.colorFallback++;return null;}
    for(const rgb of extra){const index=colors.size;colors.set(rgb,index);palette.set([rgb>>16,(rgb>>8)&255,rgb&255,255],index*4);}
    if(extra.size){revision++;stats.colors=colors.size;}
    const out=new Uint8Array(c.length/3);for(let i=0,j=0;i<c.length;i+=3,j++)out[j]=colors.get(c[i]<<16|c[i+1]<<8|c[i+2]);
    stats.colorBefore+=c.byteLength;stats.colorAfter+=out.byteLength;return out;
  }
  const decode=(a,i,out=[])=>{
    const tile=a[i+3];out[0]=x0+Math.floor(tile/256)*64+a[i]/1024;
    out[1]=y0+a[i+1]*stepY;out[2]=z0+(tile%256)*64+a[i+2]/1024;return out;
  };
  function pack(p){
    if(!p.length)return null;
    for(let i=0;i<p.length;i+=3){
      const x=Math.round((p[i]-x0)*1024),z=Math.round((p[i+2]-z0)*1024),y=Math.round((p[i+1]-y0)/stepY),tx=Math.floor(x/65536),tz=Math.floor(z/65536);
      if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(y)||tx<0||tx>255||tz<0||tz>255||y<0||y>65535){stats.fallback++;return null;}
    }
    const a=new Uint16Array(p.length/3*4),q=[];
    for(let i=0,j=0;i<p.length;i+=3,j+=4){
      const x=Math.round((p[i]-x0)*1024),z=Math.round((p[i+2]-z0)*1024),y=Math.round((p[i+1]-y0)/stepY),tx=Math.floor(x/65536),tz=Math.floor(z/65536);
      a[j]=x-tx*65536;a[j+1]=y;a[j+2]=z-tz*65536;a[j+3]=tx*256+tz;
      decode(a,j,q);for(let k=0;k<3;k++)stats.error=Math.max(stats.error,Math.abs(q[k]-p[i+k]));
    }
    stats.cells++;stats.before+=p.byteLength;stats.after+=a.byteLength;return a;
  }
  return {pack,decode,packColors,dedup,attributes,release(){scratch=null;},palette,get revision(){return revision;},stats,origin:[x0,y0,z0],step:[1/1024,stepY,1/1024]};
}
export function landPositionMaterial(source,codec,palette=null){
  const m=source.clone(),prev=source.onBeforeCompile,cache=source.customProgramCacheKey;
  const number=x=>Number.isInteger(x)?x+'.0':String(x),vec=v=>'vec3('+v.map(number).join(',')+')';
  m.onBeforeCompile=function(sh,r){
    if(prev)prev.call(this,sh,r);
    const tile=palette?'(color.r + color.g * 256.0)':'landTile';
    sh.vertexShader=(palette?'':'attribute float landTile;\n')+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec2 landCell = vec2(floor(${tile} / 256.0), mod(${tile}, 256.0));
transformed = ${vec(codec.origin)} + vec3(landCell.x * 64.0, 0.0, landCell.y * 64.0) + position * ${vec(codec.step)};`);
    if(palette){
      sh.uniforms.landPalette={value:palette};
      sh.vertexShader='uniform sampler2D landPalette;\n'+sh.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvColor.xyz = texture2D(landPalette, vec2((color.b + 0.5) / 256.0, 0.5)).rgb;');
    }
  };
  m.customProgramCacheKey=()=>cache.call(source)+'|landpos2:'+codec.origin.join(',')+':'+codec.step.join(',')+(palette?'|palette':'');return m;
}
