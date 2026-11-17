// Sample the uppermost visible ground face close to the original physical surface.
// Heights are centimeters and the third byte identifies the driving surface.
import { readFileSync, writeFileSync } from 'node:fs';
import { shapeGround } from './landscape-clearance.mjs';
import { bakeLandscape } from './bake-landscape.mjs';
import { streetlightPositions } from './streetlight-positions.mjs';
import { bakeStreetLight } from './bake-street-light.mjs';
import { groundGrid } from './ground-grid.mjs';
import { depotClearances, depotEntry } from './depot-path.mjs';
import { deliveryAddresses, deliveryClearances, deliveryEntrance } from './delivery-addresses.mjs';

const assets = new URL('../assets/', import.meta.url);
const scene = readFileSync(new URL('south-original.glb', assets));
const base = readFileSync(new URL('south-height.bin', assets));
const readJson=name=>JSON.parse(readFileSync(new URL(name,assets)));
const area=readJson('south-original.json');
const { bounds, terrain } = area;
const headerLength = scene.readUInt32LE(12);
const gltf = JSON.parse(scene.subarray(20,20+headerLength));
const dataOffset = 28+headerLength;
const step = 0.55;
const [x0,z0,x1,z1] = bounds;
const width = Math.ceil((x1-x0)/step)+1;
const depth = Math.ceil((z1-z0)/step)+1;
const size = width*depth;
const lower = new Int16Array(size);
const top = new Int16Array(size).fill(-32768);
const types = new Uint8Array(size).fill(1);

function baseHeight(x,z) {
  const u=Math.min(terrain.width-1,(x-terrain.x)/terrain.step);
  const v=Math.min(terrain.depth-1,(z-terrain.z)/terrain.step);
  const i=Math.min(Math.floor(u),terrain.width-2), j=Math.min(Math.floor(v),terrain.depth-2);
  const a=2*(i+j*terrain.width), b=a+2*terrain.width;
  const xmix=u-i, zmix=v-j;
  const y0=base.readInt16LE(a)*(1-xmix)+base.readInt16LE(a+2)*xmix;
  const y1=base.readInt16LE(b)*(1-xmix)+base.readInt16LE(b+2)*xmix;
  return Math.round(y0*(1-zmix)+y1*zmix);
}
for(let iz=0;iz<depth;iz++) for(let ix=0;ix<width;ix++) lower[iz*width+ix]=baseHeight(x0+ix*step,z0+iz*step);

function readAccessor(index) {
  const {bufferView,componentType,count,type}=gltf.accessors[index];
  const start=scene.byteOffset+dataOffset+gltf.bufferViews[bufferView].byteOffset;
  const stride={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type];
  const C=({5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array})[componentType];
  return new C(scene.buffer,start,count*stride);
}

for(const {primitives} of gltf.meshes) for(const m of primitives) {
  if(gltf.materials[m.material].name!=='City') continue;
  const xyz=readAccessor(m.attributes.POSITION), rgba=readAccessor(m.attributes.COLOR_0), index=readAccessor(m.indices);
  for(let n=0;n<index.length;n+=3) {
    const a=index[n]*3,b=index[n+1]*3,c=index[n+2]*3;
    const dx1=xyz[b]-xyz[a], dz1=xyz[b+2]-xyz[a+2], dy1=xyz[b+1]-xyz[a+1];
    const dx2=xyz[c]-xyz[a], dz2=xyz[c+2]-xyz[a+2], dy2=xyz[c+1]-xyz[a+1];
    const area=dx1*dz2-dx2*dz1;
    if(Math.abs(area)<0.016 || Math.abs(area)<0.8*Math.hypot(dy1*dz2-dy2*dz1,dx1*dy2-dx2*dy1)) continue;
    const xMin=Math.max(0,Math.ceil((Math.min(xyz[a],xyz[b],xyz[c])-x0)/step));
    const xMax=Math.min(width-1,Math.floor((Math.max(xyz[a],xyz[b],xyz[c])-x0)/step));
    const zMin=Math.max(0,Math.ceil((Math.min(xyz[a+2],xyz[b+2],xyz[c+2])-z0)/step));
    const zMax=Math.min(depth-1,Math.floor((Math.max(xyz[a+2],xyz[b+2],xyz[c+2])-z0)/step));
    const ca=index[n]*4;
    const r=rgba[ca],g=rgba[ca+1],blue=rgba[ca+2];
    const surface=g>r*1.19 && g>blue*1.25 ? 1 : r>g*1.2 && g>blue*1.25 ? 2 : 0;
    for(let iz=zMin;iz<=zMax;iz++) for(let ix=xMin;ix<=xMax;ix++) {
      const x=x0+ix*step-xyz[a], z=z0+iz*step-xyz[a+2];
      const u=(x*dz2-z*dx2)/area, v=(z*dx1-x*dz1)/area;
      if(u<0 || v<0 || u+v>1) continue;
      const k=iz*width+ix, y=Math.round((xyz[a+1]+dy1*u+dy2*v)*100);
      if(y>lower[k]+24 || y<lower[k]-18 || y<=top[k]) continue;
      top[k]=y;
      types[k]=surface;
    }
  }
}
const spec={x:x0,z:z0,step,width,depth};
const initial=Int16Array.from(top,(y,k)=>y===-32768?lower[k]:y);
const heights=initial.slice();
const build=readJson('south-physics-source.json');
const parked=readJson('south-parking.json').parked;
const breakables=readJson('south-breakables.json');
const offsets=shapeGround(spec,heights,types,build,area,breakables,parked,[...deliveryClearances(area.buildings),...depotClearances(area,build.solids)]);
const entrances=deliveryAddresses.map(address=>deliveryEntrance(address,area.buildings));
const pizzeria={area,entry:depotEntry(area,build.solids),ground:baseHeight(...area.home)*0.01};
const lights=streetlightPositions(assets,bounds,build.roads,breakables);
bakeLandscape(assets,scene,gltf,readAccessor,spec,initial,offsets,entrances,pizzeria,lights);
const grid=Buffer.alloc(size*3);
for(let k=0;k<size;k++) {
  grid.writeInt16LE(heights[k],k*3);
  grid[k*3+2]=types[k];
}
writeFileSync(new URL('south-ground.bin',assets),grid);
writeFileSync(new URL('south-ground.json',assets),JSON.stringify(spec));
bakeStreetLight(assets,bounds,lights,groundGrid(assets).sample);
console.log(`${width} × ${depth} ground samples, ${types.filter(x=>x===0).length} hard surfaces`);
