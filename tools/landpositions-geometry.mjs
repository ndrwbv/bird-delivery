import assert from 'node:assert/strict';
import * as THREE from '../src/vendor/three.module.min.js';
import {createLandPositionCodec,landPositionMaterial,landPositionMaskMaterial} from '../src/game/landpositions.js';
let seed=177;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const step of[1/1024,1/512]){
  const codec=createLandPositionCodec(-8192,-8192,-16,step),n=30000,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){p[i*3]=rand()*15000-7500;p[i*3+1]=-15+rand()*(65535*step-2);p[i*3+2]=rand()*15000-7500;}
  const copy=p.slice(),a=codec.pack(p);assert.ok(a);assert.deepEqual(p,copy,'Оригинальные позиции не меняются');
  assert.equal(a.byteLength,p.byteLength*2/3);const q=[];
  for(let i=0;i<n;i++){
    codec.decode(a,i*4,q);
    for(let k=0;k<3;k++)assert.ok(Math.abs(q[k]-p[i*3+k])<=(k===1?step/2:1/2048)+1e-9,'Ошибка ограничена половиной шага, включая ±7,5 км');
    const tile=a[i*4+3],shader=[Math.fround(-8192+Math.floor(tile/256)*64+a[i*4]/1024),Math.fround(-16+a[i*4+1]*step),Math.fround(-8192+tile%256*64+a[i*4+2]/1024)];
    assert.deepEqual(shader,q,'Шейдер Float32 декодирует те же мировые координаты');
  }
  const points=new Float32Array([-.0004,0,63.9997,64,3,64,5119.0004,17,-5120.0004]);
  const first=codec.pack(points),second=codec.pack(points.slice());assert.deepEqual(first,second,'Общие торцы разных мешей кодируются одинаково');
  const reversed=codec.pack(new Float32Array([...points.slice(6),...points.slice(3,6),...points.slice(0,3)]));
  assert.deepEqual([...reversed.slice(8,12)],[...first.slice(0,4)],'Порядок и клетка записи не создают шва');
  for(const values of[[-8193,0,0],[9000,0,0],[0,1000,0],[0,-100,0],[NaN,0,0],[Infinity,0,0]])assert.equal(codec.pack(new Float32Array(values)),null,'За пределами формата остаётся Float32');
  assert.equal(codec.pack(new Float32Array()),null);
  const data=new THREE.InterleavedBuffer(first,4),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));g.setAttribute('landTile',new THREE.InterleavedBufferAttribute(data,1,3));
  assert.equal(g.attributes.position.count,3);assert.equal(g.attributes.landTile.data,g.attributes.position.data,'Обе ручки используют один буфер');
  data.onUpload(function(){this.array=null;});data.onUploadCallback();assert.equal(g.attributes.position.array,null);assert.equal(g.attributes.landTile.array,null,'Обе копии отпускаются после загрузки');
}
const source=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide});
source.onBeforeCompile=sh=>{sh.fragmentShader+=' season';sh.vertexShader=sh.vertexShader.replace('#include <project_vertex>','transformed=hurHole(transformed);\n#include <project_vertex>');};source.customProgramCacheKey=()=> 'existing-world';
const codec=createLandPositionCodec(-8192,-8192,-16),mat=landPositionMaterial(source,codec),sh={vertexShader:'#include <begin_vertex>\n#include <project_vertex>',fragmentShader:''};
mat.onBeforeCompile(sh,{});assert.ok(sh.fragmentShader.endsWith('season'));assert.ok(sh.vertexShader.indexOf('landCell')<sh.vertexShader.indexOf('hurHole(transformed)'),'Декодирование — до урагана и мировых эффектов');
assert.equal(mat.vertexColors,source.vertexColors);assert.equal(mat.side,source.side);assert.ok(mat.customProgramCacheKey().startsWith('existing-world|landpos2:'));
assert.notEqual(mat.customProgramCacheKey(),landPositionMaterial(source,createLandPositionCodec(-4096,-8192,-16)).customProgramCacheKey(),'Разные карты не делят неподходящую программу');
console.log('landpositions: ошибка до 1 мм, общие торцы и границы плиток, мировые координаты, один буфер, прежние эффекты и Float32 вне диапазона — OK');
{
  const codec=createLandPositionCodec(0,0,0),bytes=new Uint8Array(256*3);
  for(let i=0;i<256;i++)bytes.set([i,255-i,i^83],i*3);
  const encoded=codec.packColors(bytes);assert.ok(encoded);assert.equal(encoded.length,256);
  for(let i=0;i<256;i++)assert.deepEqual([...codec.palette.slice(encoded[i]*4,encoded[i]*4+3)],[...bytes.slice(i*3,i*3+3)],'Палитра сохраняет каждый байт цвета');
  const revision=codec.revision;assert.deepEqual(codec.packColors(bytes),encoded);assert.equal(codec.revision,revision,'Старые индексы не меняются');
  const copy=codec.palette.slice();assert.equal(codec.packColors(new Uint8Array([0,0,0])),null,'257-й цвет сохраняет прежний RGB');assert.deepEqual(codec.palette,copy,'Неудачная запись не меняет существующую палитру');
  const tex=new THREE.DataTexture(codec.palette,256,1,THREE.RGBAFormat),m=landPositionMaterial(source,codec,tex),shader={vertexShader:'#include <begin_vertex>\n#include <color_vertex>\n#include <project_vertex>',fragmentShader:'',uniforms:{}};
  m.onBeforeCompile(shader,{});assert.equal(shader.uniforms.landPalette.value,tex);assert.ok(shader.vertexShader.includes('vColor.xyz = texture2D'));
  assert.ok(m.customProgramCacheKey().endsWith('|palette'));
}
console.log('landpositions: точная палитра 256 цветов, постоянные индексы и RGB после переполнения — OK');
for(const indexed of[false,true]){
  const codec=createLandPositionCodec(-64,-64,-16),p=new Float32Array([0,1,0,1,1,0,0,1,1,.0001,1,0,1,1,0,0,1,1]),rgb=new Uint8Array(18).fill(37);
  // Один совпавший угол другого цвета обязан остаться отдельным.
  rgb.set([15,23,31],12);
  const data=codec.pack(p),colors=codec.packColors(rgb),index=indexed?new Uint32Array([0,1,2,3,4,5,5,4,3]):null;
  const result=codec.dedup(data,colors,index),count=index?.length||colors.length;
  assert.ok(result.data.length<data.length);assert.equal(result.index.length,count,'Состав и порядок треугольников сохранены');
  for(let i=0;i<count;i++){const before=index?index[i]:i,after=result.index[i];assert.deepEqual([...result.data.slice(after*4,after*4+4)],[...data.slice(before*4,before*4+4)]);assert.equal(result.colors[after],colors[before],'Разные цвета не сливаются');}
  codec.release();assert.deepEqual(codec.dedup(data,colors,index).data,result.data,'Повторная запись после освобождения даёт тот же результат');
}
{
  const codec=createLandPositionCodec(-64,-64,-16),n=66000,p=new Float32Array(n*3),rgb=new Uint8Array(n*3).fill(85),ix=Uint32Array.from({length:n},(_,i)=>n-1-i);
  for(let i=0;i<n;i++){const v=i%33000;p[i*3]=(v%256)/100;p[i*3+1]=0;p[i*3+2]=Math.floor(v/256)/100;}
  const data=codec.pack(p),colors=codec.packColors(rgb),out=codec.dedup(data,colors,ix);assert.equal(out.data.length/4,33000);assert.ok(out.index instanceof Uint16Array,'После слияния доступен 16-битный индекс');
  for(let i=0;i<n;i++){const a=out.index[i],b=ix[i];for(let k=0;k<4;k++)assert.equal(out.data[a*4+k],data[b*4+k]);}
}
console.log('landpositions: одинаковые декодированные вершины сливаются без изменения цвета, состава и порядка граней; 32 → 16 бит — OK');
{
  const codec=createLandPositionCodec(-8192,-8192,-16),points=new Float32Array([-5000,2,5000,0,1,0,64,3,64,7500,7,-7500]),data=codec.pack(points),rgb=new Uint8Array(12).fill(77),colors=codec.packColors(rgb),a=codec.attributes(data,colors);
  assert.equal(a.positions.byteLength+a.colors.byteLength,data.byteLength+colors.byteLength,'Два обычных атрибута занимают те же 9 байт');
  for(let i=0;i<4;i++){
    const tile=a.colors[i*3]+a.colors[i*3+1]*256;assert.equal(tile,data[i*4+3]);assert.equal(a.colors[i*3+2],colors[i]);
    assert.deepEqual([...a.positions.slice(i*3,i*3+3)],[...data.slice(i*4,i*4+3)],'Мировая позиция и цвет не меняются при смене раскладки');
  }
}
console.log('landpositions: обычные position/color вместо дополнительных объектов атрибутов, без изменения позиции и цвета — OK');

{
  const codec=createLandPositionCodec(-8192,-8192,-16),tex=new THREE.DataTexture(codec.palette,256,1,THREE.RGBAFormat);
  const mask=new THREE.ShaderMaterial({uniforms:{uC:{value:new THREE.Vector3()}}});
  for(const palette of[null,tex]){
    const land=landPositionMaterial(source,codec,palette),m=landPositionMaskMaterial(mask,land);
    assert.notEqual(m,mask);assert.equal(m.uniforms,mask.uniforms,'Маска использует текущий центр и высоту камеры');
    assert.equal(landPositionMaskMaterial(mask,land),m,'Материал маски повторно используется');
    const sh={vertexShader:'vW = (modelMatrix * vec4(position, 1.0)).xyz; vC = vec4(color, 0.0);',uniforms:{}};
    m.onBeforeCompile(sh);assert.ok(!sh.vertexShader.includes('vec4(position, 1.0)'),'Маска восстанавливает мировые координаты');
    if(palette){assert.equal(sh.uniforms.landPalette.value,tex);assert.ok(sh.vertexShader.includes('texture2D(landPalette'),'Цвет маски — исходная зелень, а не номер плитки');}
    else assert.ok(sh.vertexShader.includes('attribute float landTile'));
  }
  assert.equal(landPositionMaskMaterial(mask,source),mask,'Обычные покрытия используют прежнюю маску');
}
console.log('landpositions: маска новой травы использует те же координаты, точный цвет и текущую камеру — OK');
