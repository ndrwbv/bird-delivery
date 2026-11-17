const MAX_PROPS = 4095;
const MAX_DEBRIS_VERTICES = 1200;
const SOLID_KINDS = new Set(['lamp','sign','fence','bigfence','bin','bollard','bench','table','stop','slide','sand','goal','bush','cone','litter','can','dump']);

export function breakablesFor(game, origin, within) {
  const meshes = new Map();
  const props = [null];
  for(const item of game.SMASH) {
    if(!SOLID_KINDS.has(item.kind) || item.down || !item.mesh || !item.nv ||
      !within(item.x-origin[0],item.z-origin[2],2) || props.length>MAX_PROPS) continue;
    const position = item.mesh.geometry.attributes.position;
    if(!position?.array || !Number.isInteger(item.v0) || item.v0+item.nv>position.count) continue;
    const id = props.length;
    const x=item.x-origin[0],z=item.z-origin[2];
    const y=game.surfaceAt(item.x,item.z)-origin[1];
    props.push({ id, kind:item.kind, at:[x,y,z], post:!!item.post, heavy:!!item.heavy, radius:item.r, vertices:[], min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] });
    if(!meshes.has(item.mesh)) meshes.set(item.mesh,new Uint16Array(position.count));
    meshes.get(item.mesh).fill(id,item.v0,item.v0+item.nv);
  }
  return { meshes,props };
}

export function recordProp(prop,xyz,rgba) {
  for(let axis=0;axis<3;axis++) {
    prop.min[axis]=Math.min(prop.min[axis],xyz[axis]-prop.at[axis]);
    prop.max[axis]=Math.max(prop.max[axis],xyz[axis]-prop.at[axis]);
  }
  if(prop.vertices.length/7<MAX_DEBRIS_VERTICES) prop.vertices.push(...xyz.map((v,i)=>v-prop.at[i]),...rgba);
}

export function encodeBreakables(props) {
  const valid = props.slice(1).filter(p=>p.vertices.length>=21);
  const count=valid.reduce((n,p)=>n+p.vertices.length/7,0);
  const bytes=new Uint8Array(count*16);
  const view=new DataView(bytes.buffer);
  let offset=0;
  const result=[];
  for(const p of valid) {
    const first=offset;
    for(let i=0;i<p.vertices.length;i+=7) {
      for(let a=0;a<3;a++) view.setFloat32(offset+a*4,p.vertices[i+a],true);
      for(let a=0;a<4;a++) bytes[offset+12+a]=p.vertices[i+3+a];
      offset+=16;
    }
    const round=v=>Number(v.toFixed(3));
    result.push({id:p.id,kind:p.kind,at:p.at.map(round),min:p.min.map(round),max:p.max.map(round),
      radius:round(p.radius),post:p.post,heavy:p.heavy,offset:first,count:(offset-first)/16});
  }
  return { bytes, result };
}
