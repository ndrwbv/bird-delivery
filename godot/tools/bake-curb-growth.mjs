import { readFileSync, writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { generator } from './leaf-sprigs.mjs';

export function bakeCurbGrowth(assets,bounds,sample,tuft) {
  const source=readFileSync(new URL('south-original.glb',assets));
  const header=source.readUInt32LE(12);
  const scene=JSON.parse(source.subarray(20,20+header));
  const random=generator(249003);
  const tiles=new Map();
  const visited=new Set();
  const seenEdges=new Set();
  let growth=0;

  function read(index,stride) {
    const accessor=scene.accessors[index];
    const type=({5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array})[accessor.componentType];
    const at=source.byteOffset+28+header+scene.bufferViews[accessor.bufferView].byteOffset+(accessor.byteOffset??0);
    return new type(source.buffer,at,accessor.count*stride);
  }

  function triangle(a,b,c,color) {
    const tx=Math.floor(a[0]/36),tz=Math.floor(a[2]/36);
    const key=`${tx}_${tz}`.replaceAll('-','n');
    if (!tiles.has(key)) tiles.set(key,{pos:[],color:[],indices:[],at:[tx*36+18,0,tz*36+18]});
    const tile=tiles.get(key);
    const start=tile.pos.length/3;
    for (const p of [a,b,c]) {
      tile.pos.push(p[0]-tile.at[0],p[1],p[2]-tile.at[2]);
      tile.color.push(...color,255);
    }
    tile.indices.push(start,start+1,start+2);
  }

  function weather(x,y,z,along,inside,rise) {
    const point=(u,v,h)=>[x+u*along[0]+v*inside[0],y+h,z+u*along[1]+v*inside[1]];
    const span=0.14+random()*0.21;
    const chips=[[94,87,69],[113,101,78],[84,79,64]];
    const stone=chips[Math.floor(random()*chips.length)];
    const moss=random()<0.58?[23,42,15]:[36,55,23];
    const edge=-0.022;
    triangle(point(-span,edge,0.004),point(0.01,edge,-rise*0.70),point(span*0.68,edge,0.004),stone);
    triangle(point(-span,edge,0.004),point(span*0.68,edge,0.004),point(0.04,0.11,0.008),stone);
    triangle(point(-span*0.48,-0.026,-0.003),point(span*0.32,-0.026,-rise*0.38),point(span*0.56,-0.026,0.002),moss);
    triangle(point(-span*0.48,-0.016,0.015),point(span*0.56,-0.016,0.015),point(0.09,0.08,0.018),moss);
    const cut=-0.06+random()*0.12;
    triangle(point(cut,-0.027,-0.001),point(cut+0.037,-0.027,-rise*0.43),point(cut-0.043,-0.027,-rise*0.87),[28,27,23]);
    if (random()<0.44) {
      // Low, faceted fragments on the paved side below the chipped edge.
      const ground=point(span*0.59,-0.12-random()*0.20,-rise);
      const surface=sample(ground[0],ground[2]);
      const floor=surface?.kind===0 && Math.abs(surface.y-ground[1])<0.08 ? surface.y : ground[1];
      for (let i=0;i<2;i++) {
        const dx=(random()-0.5)*0.21,dz=(random()-0.5)*0.16;
        const w=0.038+random()*0.067,h=w*0.52;
        const a=[ground[0]+dx-w,floor+0.005,ground[2]+dz],b=[ground[0]+dx+w,floor+0.005,ground[2]+dz-w*0.31];
        const c=[ground[0]+dx+w*0.18,floor+0.006,ground[2]+dz+w*0.86];
        const tip=[ground[0]+dx-w*0.22,floor+h,ground[2]+dz+w*0.19];
        triangle(a,b,tip,[119,113,101]);
        triangle(b,c,tip,[92,87,74]);
        triangle(c,a,tip,[72,70,62]);
      }
    }
    const root=point(0,0.025,-rise*0.12);
    tuft([root[0],root[2]],{kind:1,y:root[1],rootHeight:root[1]},inside.map(v=>-0.56*v),
      0.13+random()*0.21,2+Math.floor(random()*3),false,random);
    growth++;
  }

  for (const mesh of scene.meshes) for (const part of mesh.primitives) {
    if (scene.materials[part.material].name!=='City') continue;
    const xyz=read(part.attributes.POSITION,3),paint=read(part.attributes.COLOR_0,4),indices=read(part.indices,1);
    for (let i=0;i<indices.length;i+=3) {
      const first=indices[i]*4;
      if (paint[first+3]!==0 || paint[first]<55 || Math.abs(paint[first]-paint[first+1])>24 || paint[first]-paint[first+2]>47) continue;
      for (let side=0;side<3;side++) {
        const a=indices[i+side]*3,b=indices[i+(side+1)%3]*3,c=indices[i+(side+2)%3]*3;
        const dx=xyz[b]-xyz[a],dz=xyz[b+2]-xyz[a+2];
        const len=Math.hypot(dx,dz);
        if (len<0.24 || Math.abs(xyz[b+1]-xyz[a+1])>0.043+len*0.14) continue;
        const ux=dx/len,uz=dz/len;
        const cross=(xyz[c]-xyz[a])*uz-(xyz[c+2]-xyz[a+2])*ux;
        if (Math.abs(cross)>0.045) continue;
        const t=((xyz[c]-xyz[a])*ux+(xyz[c+2]-xyz[a+2])*uz)/len;
        const rise=xyz[a+1]+t*(xyz[b+1]-xyz[a+1])-xyz[c+1];
        if (rise<0.065 || rise>0.38) continue;
        const edge=[a,b].sort((a,b)=>a-b).join('_');
        if (seenEdges.has(`${mesh.name}_${edge}`)) continue;
        seenEdges.add(`${mesh.name}_${edge}`);
        for (let d=0.27+random()*1.65;d<len-0.08;d+=1.3+random()*3.1) {
          const x=xyz[a]+ux*d,y=xyz[a+1]+(xyz[b+1]-xyz[a+1])*d/len,z=xyz[a+2]+uz*d;
          if (x<bounds[0] || x>bounds[2] || z<bounds[1] || z>bounds[3]) continue;
          const ground=sample(x,z);
          if (ground==null || Math.abs(ground.y-y)>0.39) continue;
          const key=`${Math.round(x*1.45)}_${Math.round(z*1.45)}`;
          if (visited.has(key)) continue;
          let inside=null;
          for (const sign of [-1,1]) {
            const normal=[sign*uz,-sign*ux];
            const grass=[0.30,0.57,0.86].some(d=>sample(x+normal[0]*d,z+normal[1]*d)?.kind===1);
            if (grass && sample(x-normal[0]*0.48,z-normal[1]*0.48)?.kind===0) inside=normal;
          }
          if (inside===null) continue;
          visited.add(key);
          weather(x,y,z,[ux,uz],inside,rise);
        }
      }
    }
  }

  const glb=new Glb();
  glb.data.materials=[{name:'WeatheredCurbs',doubleSided:true}];
  for (const [key,tile] of tiles) {
    glb.mesh(`Curbs_${key}`,Float32Array.from(tile.pos),tile.indices,0,{
      colors:Uint8Array.from(tile.color),translation:tile.at
    });
  }
  writeFileSync(new URL('south-curb-growth.glb',assets),glb.encode());
  console.log(`${growth} chipped curb edges with plant growth`);
}
