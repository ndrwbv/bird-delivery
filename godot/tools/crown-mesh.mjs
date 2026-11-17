import { IcosahedronGeometry, Vector3 } from '../../src/vendor/three.module.min.js';

function sphere(detail) {
  const geometry = new IcosahedronGeometry(1,detail);
  const vertices = geometry.attributes.position;
  const samples = [];
  const faces = [];
  const sampleIndices = new Map();
  for (let i = 0; i < vertices.count; i++) {
    const point = new Vector3().fromBufferAttribute(vertices, i).normalize();
    const key = point.toArray().map(value => Math.round(value*100000)).join(',');
    if (!sampleIndices.has(key)) {
      sampleIndices.set(key, samples.length);
      samples.push(point);
    }
    faces.push(sampleIndices.get(key));
  }
  geometry.dispose();
  return {samples,faces};
}
const spheres = [sphere(0),sphere(1)];
const smooth = x => {
  const t = Math.max(0,Math.min(1,x));
  return t*t*(3-2*t);
};

export class CrownMesh {
  positions = [];
  normals = [];
  colors = [];
  indices = [];

  add(center, radii, rotation, style, elevation, detail = 1) {
    const {samples,faces} = spheres[detail];
    const [cosine,sine] = [Math.cos(rotation),Math.sin(rotation)];
    const firstVertex = this.positions.length/3;
    for (const point of samples) {
      const ripple=1+0.13*Math.sin(point.x*6.3+point.z*5.5)*Math.cos(point.y*4.3-point.z*5.2);
      const u=point.x*radii[0]*ripple,w=point.z*radii[2]*ripple;
      this.positions.push(center[0]+u*cosine-w*sine,center[1]+point.y*radii[1]*ripple,center[2]+u*sine+w*cosine);
      const nx=point.x/Math.max(0.1,radii[0]),nz=point.z/Math.max(0.1,radii[2]);
      const ny=point.y/Math.max(0.1,radii[1]);
      const scale=1/Math.max(0.01,Math.hypot(nx,ny,nz));
      this.normals.push((nx*cosine-nz*sine)*scale,ny*scale,(nx*sine+nz*cosine)*scale);
      const gradient=smooth(0.29+elevation*0.37+point.y*0.40+point.x*0.10);
      const color=style.leaf.map((v,j)=> {
        const shade=v*[0.26,0.54,0.69][j];
        const sun=style.outer[j]*[1.08,1.10,0.71][j];
        return Math.round(Math.min(255,shade+(sun-shade)*gradient));
      });
      this.colors.push(...color,255);
    }
    for (const index of faces) this.indices.push(firstVertex+index);
  }

  write(glb, name, material, translation = [0,0,0]) {
    if(!this.indices.length) return;
    glb.mesh(name,Float32Array.from(this.positions,(v,i)=>v-translation[i%3]),this.indices,material,{
      normals:new Float32Array(this.normals),colors:new Uint8Array(this.colors),translation
    });
  }
}
