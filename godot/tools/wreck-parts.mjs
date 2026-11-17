import { readFileSync } from 'node:fs';

// Reuse the browser's pure model-space definitions, without loading the game.
const source=readFileSync(new URL('../../src/game/carwreck.js',import.meta.url),'utf8');
const declarations=source.slice(source.indexOf('const DRL ='),source.indexOf('const BOX_PANEL'));
const profiles=Function(declarations.replace('export const REAL_PARTS','const REAL_PARTS')+'\nreturn REAL_PARTS;')();
const names={Car_CarBody_0:'body',Car_Details_0:'det',Car_Details_Transparent_0:'lens',winL:'winL',winR:'winR'};

export function wreckProfile(center,scale) {
  const point=([x,y,z])=>[-x*scale,(y-center[1])*scale,-(z-center[2])*scale];
  return Object.entries(profiles).map(([key,p])=>({
    key,kind:p.kind,rear:!!p.rear,hinge:point(p.hinge),at:point([p.at[0],p.hinge[1],p.at[1]])
  }));
}

function planes(profile,role) {
  const result=[];
  for(const [axis,name] of ['x','y','z'].entries()) {
    const [min,max]=profile.box[name];
    if(min>-8) result.push([+(axis===0),+(axis===1),+(axis===2),-min]);
    if(max<8) result.push([-(axis===0),-(axis===1),-(axis===2),max]);
  }
  if(profile.top?.[role]!=null) result.push([0,-1,0,profile.top[role]]);
  return [...result,...(profile.planes??[])];
}

function split(poly,[a,b,c,d]) {
  const value=v=>a*v[0]+b*v[1]+c*v[2]+d;
  const inside=[],outside=[];
  for(const [i,p] of poly.entries()) {
    const q=poly[(i+1)%poly.length],u=value(p),v=value(q);
    (u>=0?inside:outside).push(p);
    if((u>=0)!==(v>=0)) {
      const t=u/(u-v);
      const edge=p.map((n,j)=>n+(q[j]-n)*t);
      inside.push(edge);
      outside.push(edge);
    }
  }
  return [inside,outside];
}

export function tagParts(part, original, vertices, normals, uv, indices) {
  const role=names[part];
  if(!role) return { vertices,normals,uv,indices };
  const parts=Object.values(profiles).map((profile,i)=>({id:i+1,profile,planes:planes(profile,role)}))
    .filter(p=>p.profile.src.includes(role));
  const output={vertices:[],normals:[],uv:[],uv2:[],indices:[]};
  function emit(poly,id) {
    if(poly.length<3) return;
    const start=output.vertices.length/3;
    for(const v of poly) {
      output.vertices.push(...v.slice(3,6));
      output.normals.push(...v.slice(6,9));
      output.uv.push(...v.slice(9,11));
      output.uv2.push((id+0.5)/16,0.5);
    }
    for(let j=1;j<poly.length-1;j++) output.indices.push(start,start+j,start+j+1);
  }
  for(let i=0;i<indices.length;i+=3) {
    const tri=[indices[i],indices[i+1],indices[i+2]].map(j=>[...original.slice(j*3,j*3+3),...vertices.slice(j*3,j*3+3),
      ...normals.slice(j*3,j*3+3),...uv.slice(j*2,j*2+2)]);
    const [a,b,c]=tri;
    const u=b.slice(0,3).map((n,k)=>n-a[k]),v=c.slice(0,3).map((n,k)=>n-a[k]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const horizontal=Math.abs(cross[1])/(Math.hypot(...cross)||1);
    let regions=[tri];
    for(const {id,profile,planes:cut} of parts) {
      if(profile.ny && horizontal<profile.ny) continue;
      const remaining=[];
      for(const poly of regions) {
        let shape=poly;
        const outside=[];
        for(const plane of cut) {
          const [inside,rejected]=split(shape,plane);
          if(rejected.length>=3) outside.push(rejected);
          shape=inside;
          if(shape.length<3) break;
        }
        if(shape.length<3 || (profile.whole && outside.length)) remaining.push(poly);
        else { emit(shape,id);remaining.push(...outside); }
      }
      regions=remaining;
    }
    for(const poly of regions) emit(poly,0);
  }
  return {vertices:new Float32Array(output.vertices),normals:new Float32Array(output.normals),uv:new Float32Array(output.uv),
    uv2:new Float32Array(output.uv2),indices:output.indices};
}
