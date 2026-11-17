import { writeFileSync } from 'node:fs';
import { Glb } from './glb.mjs';
import { soilPattern } from './landscape-pattern.mjs';
import { windowCoordinates } from './window-coordinates.mjs';
import { bakePizzeriaGlass } from './pizzeria-glass.mjs';

const fixtureMaskWidth = 4096;

const MAX_EDGE_SQUARED=2.25**2;

function sampleGrid(spec, values, x, z, fallback) {
  const {x:x0,z:z0,step,width,depth}=spec;
  const u=(x-x0)/step,v=(z-z0)/step;
  if(u<0 || v<0 || u>=width-1 || v>=depth-1) return fallback;
  const a=Math.floor(u),b=Math.floor(v),i=b*width+a;
  const dx=u-a,dz=v-b;
  return ((values[i]*(1-dx)+values[i+1]*dx)*(1-dz)
    +(values[i+width]*(1-dx)+values[i+width+1]*dx)*dz)*0.01;
}

function landscapeFace(a,b,c,color,spec,initial) {
  const [r,g,blue,alpha]=color;
  const grass=g>r*1.19 && g>blue*1.25;
  const dirt=r>g*1.2 && g>blue*1.25;
  if(alpha!==0 || (!grass && !dirt)) return false;
  const [dx,dy,dz]=b.map((value,i)=>value-a[i]);
  const [ux,uy,uz]=c.map((value,i)=>value-a[i]);
  if(Math.abs(dx*uz-dz*ux)<0.8*Math.hypot(dy*uz-dz*uy,dx*uy-dy*ux)) return false;
  const [x,y,z]=a.map((value,i)=>(value+b[i]+c[i])/3);
  return Math.abs(y-sampleGrid(spec,initial,x,z,Infinity))<0.4;
}

function terrainMesh(spec,offsets) {
  const positions=[],colors=[],indices=[];
  const vertices=new Map();
  const borders=new Map();
  const edge=(a,b)=>(a[0]-b[0])**2+(a[2]-b[2])**2;
  const midpoint=(a,b)=>a.map((value,i)=>(value+b[i])*0.5);
  function vertex([x,y,z],dirt,lower=false) {
    const key=[x,y,z,dirt,lower].join('/');
    if(vertices.has(key)) return vertices.get(key);
    const first=positions.length/3;
    const offset=sampleGrid(spec,offsets,x,z,0);
    const {bare,sand,vigor}=soilPattern(x,z);
    positions.push(x,y+(lower ? Math.min(0,offset)-2.85 : offset),z);
    colors.push(Math.round(Math.max(bare,dirt?0.88:0)*255),Math.round(sand*255),
      Math.round(vigor*255),255);
    vertices.set(key,first);
    return first;
  }
  function triangle(a,b,c,dirt) {
    const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a);
    const longest=Math.max(ab,bc,ca);
    if(longest<=MAX_EDGE_SQUARED) {
      indices.push(vertex(a,dirt),vertex(b,dirt),vertex(c,dirt));
    } else if(longest===ab) {
      const mid=midpoint(a,b);
      triangle(a,mid,c,dirt);
      triangle(mid,b,c,dirt);
    } else if(longest===bc) {
      const mid=midpoint(b,c);
      triangle(b,mid,a,dirt);
      triangle(mid,c,a,dirt);
    } else {
      const mid=midpoint(c,a);
      triangle(c,mid,b,dirt);
      triangle(mid,a,b,dirt);
    }
  }
  function border(a,b,dirt) {
    const key=[a.join('/'),b.join('/')].sort().join('|');
    if(borders.has(key)) borders.delete(key);
    else borders.set(key,[a,b,dirt]);
  }
  function skirt(a,b,dirt) {
    if(edge(a,b)>MAX_EDGE_SQUARED) {
      const mid=midpoint(a,b);
      skirt(a,mid,dirt);
      skirt(mid,b,dirt);
      return;
    }
    const a0=vertex(a,dirt),b0=vertex(b,dirt);
    if(Math.abs(positions[a0*3+1]-a[1])<0.008 && Math.abs(positions[b0*3+1]-b[1])<0.008) return;
    const a1=vertex(a,dirt,true),b1=vertex(b,dirt,true);
    indices.push(a0,b0,a1,b0,b1,a1);
  }
  function seal() {
    for(const [a,b,dirt] of borders.values()) skirt(a,b,dirt);
  }
  return {positions,colors,indices,triangle,border,seal};
}

export function bakeLandscape(assets,source,document,read,spec,initial,offsets,entrances,pizzeria,lights) {
  const city=new Glb();
  city.data.extensionsUsed=document.extensionsUsed;
  city.data.samplers=document.samplers;
  city.data.textures=document.textures;
  const binaryStart=28+source.readUInt32LE(12);
  city.data.images=document.images.map(image=>{
    const view=document.bufferViews[image.bufferView];
    const start=binaryStart+view.byteOffset;
    return {...image,bufferView:city.view(source.subarray(start,start+view.byteLength))};
  });
  city.data.materials=[...document.materials,{name:'Landscape',doubleSided:true}];
  const landMaterial=city.data.materials.length-1;
  const doors=entrances.map(entrance=>{
    const {at:[x,z],front:[nx,nz]}=entrance;
    const y=sampleGrid(spec,initial,x+nx*0.40,z+nz*0.40,0);
    return {...entrance,y};
  });
  const taller=lights.filter(lamp=>lamp.scale>1.001);
  const byId=new Map(taller.map(lamp=>[lamp.id,lamp]));
  let groundTriangles=0;
  for (const node of document.nodes) {
    const [mesh]=document.meshes[node.mesh].primitives;
    const {POSITION,COLOR_0,TEXCOORD_0,TEXCOORD_1}=mesh.attributes;
    const positions=read(POSITION),colors=read(COLOR_0),indices=read(mesh.indices);
    const name=document.materials[mesh.material].name;
    if(name==='Windows') {
      const windows=windowCoordinates(positions,colors,indices,doors);
      city.mesh(node.name,windows.positions,windows.indices,mesh.material,windows);
      continue;
    }
    if(name!=='City') {
      let points=positions;
      const tag=TEXCOORD_1===undefined?undefined:read(TEXCOORD_1);
      if(name.startsWith('Prop') && tag) {
        points=positions.slice();
        for(let i=0;i<points.length/3;i++) {
          const lamp=byId.get(Math.floor(tag[i*2]*fixtureMaskWidth));
          if(lamp) points[i*3+1]=lamp.base[1]+(points[i*3+1]-lamp.base[1])*lamp.scale;
        }
      } else if(name==='Flat') {
        points=positions.slice();
        for(let i=0;i<points.length;i+=3) {
          const [x,y,z]=points.subarray(i,i+3);
          for(const lamp of taller) {
            const [u,v,w]=lamp.head;
            const oldY=lamp.base[1]+(v-lamp.base[1])/lamp.scale;
            if(Math.abs(y-oldY)<0.39 && (x-u)**2+(z-w)**2<0.55**2) {
              points[i+1]=lamp.base[1]+(y-lamp.base[1])*lamp.scale;
              break;
            }
          }
        }
      }
      city.mesh(node.name,points,indices,mesh.material,{
        colors,uv:TEXCOORD_0===undefined?undefined:read(TEXCOORD_0),uv2:tag,
      });
      continue;
    }
    const land=terrainMesh(spec,offsets);
    const otherPositions=[],otherColors=[],otherIndices=[];
    const otherVertices=new Map();
    function keep(index) {
      if(otherVertices.has(index)) return otherVertices.get(index);
      const first=otherPositions.length/3;
      otherPositions.push(...positions.subarray(index*3,index*3+3));
      otherColors.push(...colors.subarray(index*4,index*4+4));
      otherVertices.set(index,first);
      return first;
    }
    for(let i=0;i<indices.length;i+=3) {
      const [a,b,c]=indices.subarray(i,i+3);
      const points=[a,b,c].map(index=>positions.subarray(index*3,index*3+3));
      const paint=colors.subarray(a*4,a*4+4);
      if(landscapeFace(...points,paint,spec,initial)) {
        const dirt=paint[0]>paint[1];
        land.triangle(...points,dirt);
        const [first,second,third]=points;
        land.border(first,second,dirt);
        land.border(second,third,dirt);
        land.border(third,first,dirt);
      } else {
        otherIndices.push(keep(a),keep(b),keep(c));
      }
    }
    if(otherIndices.length) city.mesh(node.name,Float32Array.from(otherPositions),otherIndices,mesh.material,
      {colors:Uint8Array.from(otherColors)});
    if(land.indices.length) {
      land.seal();
      city.mesh(`${node.name}_Landscape`,Float32Array.from(land.positions),land.indices,landMaterial,
        {colors:Uint8Array.from(land.colors)});
      groundTriangles+=land.indices.length/3;
    }
  }
  const glass=city.data.materials.findIndex(material=>material.name==='Windows');
  bakePizzeriaGlass(city,glass,pizzeria.area,pizzeria.entry,pizzeria.ground);
  writeFileSync(new URL('south-landscape.glb',assets),city.encode());
  console.log(`${groundTriangles} tessellated landscape triangles`);
}
