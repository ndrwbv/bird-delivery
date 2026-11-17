import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Glb } from './glb.mjs';

const assets = new URL('../assets/',import.meta.url);
const source = readFileSync(new URL('south-landscape.glb',assets));
const header = source.readUInt32LE(12);
const original = JSON.parse(source.subarray(20,20+header));
const binary = 28+header;
const glb = new Glb();
glb.data.extensionsUsed = original.extensionsUsed;
glb.data.samplers = original.samplers;
glb.data.textures = original.textures;
glb.data.materials = original.materials;
glb.data.images = original.images.map(({bufferView,mimeType})=>{
  const view=original.bufferViews[bufferView];
  const from=binary+view.byteOffset;
  return {mimeType,bufferView:glb.view(source.subarray(from,from+view.byteLength))};
});
const constructors = {5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const strides = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

function read(index) {
  if(index===undefined) return undefined;
  const {componentType,bufferView,count,type}=original.accessors[index];
  const offset=source.byteOffset+binary+original.bufferViews[bufferView].byteOffset;
  return new constructors[componentType](source.buffer,offset,count*strides[type]);
}

function reduce(positions,indices,colors,land) {
  const input=Uint32Array.from(indices);
  const attributes=new Float32Array(positions.length);
  for(let v=0;v<positions.length/3;v++) {
    for(let axis=0;axis<3;axis++) attributes[v*3+axis]=colors[v*4+axis]/255;
  }
  const count=Math.max(3,Math.floor(indices.length*(land ? 0.29 : 0.53)/3)*3);
  const [simplified]=MeshoptSimplifier.simplifyWithAttributes(input,positions,3,attributes,3,
    [0.16,0.16,0.16],null,count,land?0.12:0.074,['ErrorAbsolute','LockBorder']);
  const [remap,used]=MeshoptSimplifier.compactMesh(simplified);
  const points=new Float32Array(used*3);
  const pigment=new Uint8Array(used*4);
  for(let i=0;i<remap.length;i++) {
    const j=remap[i];
    if(j>=used) continue;
    points.set(positions.subarray(i*3,i*3+3),j*3);
    pigment.set(colors.subarray(i*4,i*4+4),j*4);
  }
  return [points,simplified,pigment];
}

await MeshoptSimplifier.ready;
let before=0,after=0;
for(const node of original.nodes) {
  const {material,indices,attributes}=original.meshes[node.mesh].primitives[0];
  const name=original.materials[material].name;
  if(name==='Wood'||name==='Foliage') continue;
  let points=read(attributes.POSITION),faces=read(indices),colors=read(attributes.COLOR_0);
  before+=faces.length/3;
  if((name==='City'||name==='Landscape')&&faces.length>=72) {
    [points,faces,colors]=reduce(points,faces,colors,name==='Landscape');
  }
  after+=faces.length/3;
  glb.mesh(node.name,points,faces,material,{
    colors,uv:read(attributes.TEXCOORD_0),uv2:read(attributes.TEXCOORD_1),translation:node.translation
  });
}
writeFileSync(new URL('south-retro-city.glb',assets),glb.encode());
console.log(`City geometry: ${before} → ${after} triangles, vegetation baked separately`);
