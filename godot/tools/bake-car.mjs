import { readFileSync, writeFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry, Color } from '../../src/vendor/three.module.min.js';
import { Glb } from './glb.mjs';
import { tagParts, wreckProfile } from './wreck-parts.mjs';

const source = new URL('../../public/models/vaz2107/', import.meta.url);
const output = new URL('../assets/semerka.glb', import.meta.url);
const { box, parts } = JSON.parse(readFileSync(new URL('car.json', source)));
const file = readFileSync(new URL('car.bin', source));
const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const center = [0, box.min[1], (box.min[2] + box.max[2]) / 2];
const scale = 1.2;
const glb = new Glb();
glb.data.images = [];
glb.data.textures = [];
glb.data.samplers = [{ magFilter: 9729, minFilter: 9987 }];
const textures = new Map();
const materials = new Map();

function material(part) {
  const glass = /^win/.test(part.name);
  const key = glass ? 'glass' : part.file;
  if (materials.has(key)) return materials.get(key);
  const color = glass ? '#566b83' : part.role === 'body' ? '#ead7ba' : '#ffffff';
  const baseColorFactor = [...new Color(color).toArray(), glass ? 0.56 : part.alpha];
  const pbrMetallicRoughness = { baseColorFactor, metallicFactor: glass ? 0.13 : 0.03, roughnessFactor: glass ? 0.31 : 0.67 };
  if (part.file) {
    if (!textures.has(part.file)) {
      const image = readFileSync(new URL(part.file, source));
      const index = glb.data.images.push({ bufferView: glb.view(image), mimeType: 'image/png' }) - 1;
      textures.set(part.file, glb.data.textures.push({ source: index, sampler: 0 }) - 1);
    }
    pbrMetallicRoughness.baseColorTexture = { index: textures.get(part.file) };
  }
  const index = glb.data.materials.push({ name: glass ? 'Glass' : part.role || part.file,
    doubleSided: true, alphaMode: part.blend ? 'BLEND' : 'OPAQUE', pbrMetallicRoughness }) - 1;
  materials.set(key, index);
  return index;
}

for (const part of parts) {
  const original = new Float32Array(data, ...part.pos);
  const positions = original.slice();
  const origin = part.pivot ? [0, 0, 0] : center;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -(positions[i] - origin[0]) * scale;
    positions[i + 1] = (positions[i + 1] - origin[1]) * scale;
    positions[i + 2] = -(positions[i + 2] - origin[2]) * scale;
  }
  const uv = new Float32Array(data, ...part.uv);
  const Index = part.idx[2] === 4 ? Uint32Array : Uint16Array;
  const indices = new Index(data, part.idx[0], part.idx[1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const translation = part.pivot?.map((value, axis) => (value - center[axis]) * scale * (axis === 1 ? 1 : -1));
  const tagged = tagParts(part.name,original,positions,geometry.attributes.normal.array,uv,indices);
  glb.mesh(part.name,tagged.vertices,tagged.indices,material(part),
    { normals:tagged.normals,uv:tagged.uv,uv2:tagged.uv2,translation });
}
// The roof light is part of the car, so its shaded sides and shadow move with the body.
const signPosition=[],signIndex=[],signColor=[];
function polygon(points, hex) {
  const rgb=new Color(hex).toArray().map(v=>Math.round(v*255));
  const base=signPosition.length/3;
  signPosition.push(...points.flat());
  for(let i=1;i+1<points.length;i++) signIndex.push(base,base+i,base+i+1);
  for(let i=0;i<points.length;i++) signColor.push(...rgb,255);
}
const roofPaint = glb.data.materials.push({name:'Pizza roof light',doubleSided:true,
  pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:0.82}})-1;
const roof=box.max[1]*scale-0.027, lightZ=0.02;
const silhouette=[[-0.37,0.02],[-0.37,0.09],[-0.13,0.47],[-0.08,0.50],[0.08,0.50],[0.13,0.47],[0.37,0.09],[0.37,0.02]];
const litFace=(outline,z)=>outline.map(([x,y])=>[x,roof+y,lightZ+z]);
const near=litFace(silhouette,0.145), far=litFace(silhouette,-0.145);
polygon([...near].reverse(),'#c9411c');
polygon(far,'#b53a1e');
for(let i=0;i<near.length;i++) {
  const j=(i+1)%near.length;
  polygon([near[i],near[j],far[j],far[i]],i===3?'#ff9834':'#8a281b');
}
const slice=[[-0.205,0.108],[-0.17,0.106],[0.18,0.106],[0.208,0.13],[0.032,0.392],[0,0.413],[-0.032,0.392]];
for(const side of [-1,1]) {
  const outward=outline=>side>0?[...outline].reverse():outline;
  polygon(outward(litFace(slice,side*0.149)),'#ffd051');
  for(const [x,y,r] of [[-0.087,0.173,0.035],[0.067,0.185,0.033],[0.004,0.275,0.031]]) {
    const dot=Array.from({length:8},(_,j)=>[x+Math.cos(j*Math.PI/4)*r,y+Math.sin(j*Math.PI/4)*r]);
    polygon(outward(litFace(dot,side*0.152)),'#bc5420');
  }
}
const sign=new BufferGeometry();
const signVertices=new Float32Array(signPosition);
sign.setAttribute('position',new BufferAttribute(signVertices,3));
sign.setIndex(new BufferAttribute(new Uint16Array(signIndex),1));
sign.computeVertexNormals();
glb.mesh('PizzaRoofLight',signVertices,signIndex,roofPaint,
  {colors:new Uint8Array(signColor),normals:sign.attributes.normal.array});
writeFileSync(output, glb.encode());
writeFileSync(new URL("../assets/car-parts.json",import.meta.url),JSON.stringify(wreckProfile(center,scale)));
