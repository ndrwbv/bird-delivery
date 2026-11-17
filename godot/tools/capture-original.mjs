import { Glb } from './glb.mjs';
import { captureTraffic } from './capture-traffic.mjs';
import { breakablesFor, recordProp, encodeBreakables } from './capture-breakables.mjs';

const origin = [3181, 0, 2071];
const limits = [-365, -545, 310, 284];
const dial = 130;
const within = (x,z,pad=0) => x >= limits[0]-pad && x <= limits[2]+pad && z >= limits[1]-pad && z <= limits[3]+pad;
async function write(name, bytes) {
  const response=await fetch('/__write/'+name,{method:'POST',body:bytes});
  if(!response.ok) throw new Error('Cannot write '+name);
}

export async function run(game) {
  try {
    await write('capture-status.json', JSON.stringify({ phase: 'started' }));
    return await bake(game);
  } catch (error) {
    await write('capture-status.json', JSON.stringify({ error: String(error.stack || error) }));
    return false;
  }
}

async function bake(game) {
  const T = game.THREE;
  const surface = (x,z) => game.surfaceAt(x+origin[0],z+origin[2]);
  origin[1] = surface(0,0);
  const local = v => [v.x-origin[0],v.y-origin[1],v.z-origin[2]];
  game.scene.updateMatrixWorld(true);
  const breakables = breakablesFor(game,origin,within);
  const records = new Map();
  const sources = [];
  const glb = new Glb();
  glb.data.extensionsUsed = ['KHR_materials_unlit'];
  glb.data.images = [];
  glb.data.textures = [];
  glb.data.samplers = [{ magFilter: 9728, minFilter: 9987 }];
  const textureIndices = new Map();
  const materialIndices = new Map();
  const light = game.scene.children.find(x=>x.isDirectionalLight);
  const sun = light.position.clone().sub(light.target.position).normalize();
  const point = new T.Vector3();
  const scratch = new T.Vector3();
  const instance = new T.Matrix4();
  const transform = new T.Matrix4();
  const floatColor = new T.Color();
  const blocked = new Set([game.car, game.marker, ...game.PEDS.map(x=>x.grp), ...game.TRAFFIC.map(x=>x.grp || x.mesh || x.g), ...game.ROUTE_LINE.slots.map(slot=>slot.m)]);
  const excluded = /^(parked$|sky|nightlight|nightglare|wake|headBeam|route|snow|winter|gore)/i;

  function material(m, layer, texture) {
    const textured = texture !== undefined;
    const mode = m.alphaTest > 0 || (textured && m.transparent) ? 'MASK' : 'OPAQUE';
    const key = [layer,texture,mode].join('_');
    if(materialIndices.has(key)) return materialIndices.get(key);
    const pbrMetallicRoughness = { baseColorFactor: [1,1,1,1], metallicFactor: 0, roughnessFactor: 1 };
    if(textured) pbrMetallicRoughness.baseColorTexture = { index: texture };
    const index = glb.data.materials.push({ name: layer, doubleSided: layer==='Flat' || layer==='Texture' || layer==='Windows' || layer==='Foliage' || layer.startsWith('Prop'),
      alphaMode: mode, alphaCutoff: m.alphaTest || 0.35, pbrMetallicRoughness,
      extensions:{KHR_materials_unlit:{}} })-1;
    materialIndices.set(key,index);
    return index;
  }

  function textureFor(map) {
    if(!map?.image?.width || !map.image.height) return;
    if(textureIndices.has(map)) return textureIndices.get(map);
    const canvas=document.createElement('canvas');
    const shrink=Math.min(1,1024/Math.max(map.image.width,map.image.height));
    canvas.width=Math.max(1,Math.round(map.image.width*shrink));
    canvas.height=Math.max(1,Math.round(map.image.height*shrink));
    try {
      canvas.getContext('2d').drawImage(map.image,0,0,canvas.width,canvas.height);
      const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),s=>s.charCodeAt(0));
      const i=glb.data.images.push({bufferView:glb.view(bytes),mimeType:'image/png'})-1;
      const t=glb.data.textures.push({source:i,sampler:0})-1;
      textureIndices.set(map,t);
      return t;
    } catch { return undefined; }
  }

  function batch(x,z,mat,hasUV,hasProps=false) {
    const key = `${Math.floor(x/dial)}_${Math.floor(z/dial)}_${mat}`;
    if(!records.has(key)) records.set(key,{ positions:[], colors:[], index:[], uv:hasUV?[]:null, uv2:hasProps?[]:null, mat });
    return records.get(key);
  }

  function putVertex(rec,x,y,z,r,g,b,a,u,v,prop=0) {
    const index=rec.positions.length/3;
    rec.positions.push(x,y,z);
    rec.colors.push(r,g,b,a);
    if(rec.uv) rec.uv.push(u,v);
    if(rec.uv2) rec.uv2.push((prop+0.5)/4096,0.5);
    return index;
  }

  const neutral = new T.MeshBasicMaterial();
  const windowMaterial = material(neutral,'Windows');
  function bakeWindows(g) {
    const p=g.attributes.iP, d=g.attributes.iD, variant=g.attributes.iS;
    for(let i=0;i<g.instanceCount;i++) {
      const x=p.getX(i)-origin[0],y=p.getY(i)-origin[1],z=p.getZ(i)-origin[2];
      if(!within(x,z,155)) continue;
      const dx=d.getY(i), dz=-d.getX(i), width=d.getZ(i), height=d.getW(i);
      const r=batch(x,z,windowMaterial,false);
      const value=variant.getX(i);
      const palette=['#667d9c','#b1a38d','#616d8b','#71849a','#9b9584','#6b83a0'];
      const col=new T.Color(palette[Math.floor(Math.abs(value)*233)%palette.length]);
      const frame=new T.Color(width>3.1?'#494e52':'#81736a');
      const quad=(x0,y0,x1,y1,offset,a,b)=>{
        const first=r.positions.length/3;
        for(const [u,v,c] of [[x0,y0,a],[x1,y0,a],[x1,y1,b],[x0,y1,b]]) {
          putVertex(r,x+dx*u+d.getX(i)*offset,y+v,z+dz*u+d.getY(i)*offset,
            Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),0,0,0);
        }
        r.index.push(first,first+1,first+2,first,first+2,first+3);
      };
      quad(0,0,width,height,0,frame,frame);
      const trim=Math.min(0.065,width*0.13,height*0.13);
      const divisions=Math.max(1,Math.round(width/0.9));
      for(let cell=0;cell<divisions;cell++) {
        const u=cell*width/divisions;
        quad(u+trim,trim,u+width/divisions-trim,height-trim,0.012,
          col.clone().multiplyScalar(0.68+cell*0.07),col.clone().multiplyScalar(1.12));
      }
    }
  }

  function bakeMesh(mesh, matrix, mat, rangeStart=0, rangeCount=Infinity) {
    const g=mesh.geometry, a=g.attributes, pos=a.position;
    const cellPosition=g.boundingSphere.center.clone().applyMatrix4(matrix);
    const radius=g.boundingSphere.radius*matrix.getMaxScaleOnAxis();
    if(!within(cellPosition.x-origin[0],cellPosition.z-origin[2],radius+160) || radius>5300) return;
    const vc=a.color, uv=a.uv;
    const texture=uv ? textureFor(mat.map) : undefined;
    const hasUV=texture!==undefined;
    const flat=mat.isMeshBasicMaterial;
    const layer=hasUV?'Texture':flat?'Flat':'City';
    const m=material(mat,layer,texture);
    const ids=breakables.meshes.get(mesh);
    const attached=ids ? material(mat,hasUV?'PropTexture':'PropColor',texture) : m;
    const from=Math.max(g.drawRange.start,rangeStart);
    const to=Math.min(from+Math.min(g.drawRange.count,rangeCount),g.index?.count??pos.count);
    const index=g.index;
    const known = new Map();
    const temp = [new T.Vector3(),new T.Vector3(),new T.Vector3()];
    const seasonPile = a.aux && mat.customProgramCacheKey().includes('seasonPile');
    const leaves = seasonPile ? material(mat,'Foliage') : m;
    const wood = seasonPile ? material(mat,'Wood') : m;
    const usePanels = !flat && !hasUV && vc?.itemSize===4 && !a.aux;
    const base = mat.color || floatColor.setRGB(1,1,1);
    for(let i=from;i+2<to;i+=3) {
      const v = [index ? index.getX(i) : i,index ? index.getX(i+1) : i+1,index ? index.getX(i+2) : i+2];
      const kind=seasonPile?Math.round(a.aux.getX(v[0])*255):-1;
      if(kind>=2) continue;
      const conifer=kind===0&&Math.round(a.aux.getZ(v[0])*255)%4===2;
      const foliage=kind===1||conifer;
      const surface=foliage?leaves:kind===0?wood:m;
      for(let k=0;k<3;k++) temp[k].fromBufferAttribute(pos,v[k]).applyMatrix4(matrix);
      const x=(temp[0].x+temp[1].x+temp[2].x)/3-origin[0], z=(temp[0].z+temp[1].z+temp[2].z)/3-origin[2];
      if(!within(x,z,145)) continue;
      const altitude=(temp[0].y+temp[1].y+temp[2].y)/3;
      if(altitude < origin[1]-35 || altitude > origin[1]+135) continue;
      const prop=ids && ids[v[0]]===ids[v[1]] && ids[v[0]]===ids[v[2]] ? ids[v[0]] : 0;
      const r=batch(x,z,prop?attached:surface,hasUV,prop>0);
      let cache=known.get(r);
      if(!cache) known.set(r,cache=new Map());
      const [aa,bb,cc]=temp;
      scratch.copy(bb).sub(aa);
      point.copy(cc).sub(aa);
      scratch.cross(point).normalize();
      const facing=flat ? 1.0 : 0.60 + Math.max(0,scratch.dot(sun))*0.40 + Math.max(0,scratch.y)*0.24;
      const panel = usePanels && v.every(j=>vc.getW(j)*255 >= 0.5 && vc.getW(j)*255 < 127.5);
      // Flat shading is encoded after the panel flags so seams still know the exact optical floor height.
      for(let k=0;k<3;k++) {
        const j=v[k], ident=panel || flat || a.normal ? j : j*64+Math.round(facing*25);
        let target=cache.get(ident);
        if(target===undefined) {
          const p=temp[k];
          const shade=panel||seasonPile?1:facing;
          const limit=f=>Math.round(Math.max(0,Math.min(1,f))*255);
          const color=mat.vertexColors && vc ? [vc.getX(j)*base.r,vc.getY(j)*base.g,vc.getZ(j)*base.b] : [base.r,base.g,base.b];
          const alpha=foliage ? (conifer?0:128)+Math.round(a.aux.getY(j)*127) : panel ? Math.round(vc.getW(j)*255) : 0;
          target=putVertex(r,p.x-origin[0],p.y-origin[1],p.z-origin[2],
            ...color.map(c=>limit(c*shade)),alpha,hasUV?uv.getX(j):0,hasUV?(mat.map.flipY?1-uv.getY(j):uv.getY(j)):0,prop);
          cache.set(ident,target);
        }
        r.index.push(target);
        if (prop) recordProp(breakables.props[prop],r.positions.slice(target*3,target*3+3),
          r.colors.slice(target*4,target*4+4));
      }
    }
  }

  function traverse(o,visible=true) {
    if(blocked.has(o) || excluded.test(o.name) || o.isSkinnedMesh || o.userData.lod || o.userData.pbox) return;
    visible &&=o.visible;
    if(o.isMesh && o.geometry?.attributes.position?.array && !o.material.wireframe) {
      const g=o.geometry;
      if(o.name==='windows') {
        bakeWindows(g);
      } else if(visible || breakables.meshes.has(o)) {
        if(!g.boundingSphere) g.computeBoundingSphere();
        if(g.boundingSphere && Number.isFinite(g.boundingSphere.radius) && !g.userData.landPacked) {
          const materials=Array.isArray(o.material)?o.material:[o.material];
          const groups=Array.isArray(o.material)?g.groups:[{materialIndex:0,start:0,count:Infinity}];
          for(const group of groups) {
            const m=materials[group.materialIndex];
            if(!m?.visible || (m.transparent && !m.map) || (m.type!=='MeshLambertMaterial' && m.type!=='MeshBasicMaterial' && m.type!=='MeshStandardMaterial')) continue;
            if(o.isInstancedMesh) {
              for(let i=0;i<o.count;i++) {
                o.getMatrixAt(i,instance);
                bakeMesh(o,transform.multiplyMatrices(o.matrixWorld,instance),m,group.start,group.count);
              }
            } else {
              bakeMesh(o,o.matrixWorld,m,group.start,group.count);
            }
          }
          sources.push(o.name);
        }
      }
    }
    for(const child of o.children) traverse(child,visible);
  }
  traverse(game.scene);
  for(const [key,r] of records) {
    if(r.index.length<3) continue;
    glb.mesh(`Block_${key.replaceAll('-','n')}`,new Float32Array(r.positions),r.index,r.mat,
      { colors:new Uint8Array(r.colors),uv:r.uv ? new Float32Array(r.uv):undefined,uv2:r.uv2 ? new Float32Array(r.uv2):undefined });
  }

  // Collision height uses a denser raster near roads than the visible city tiles require.
  const step=1.5;
  const width=Math.ceil((limits[2]-limits[0])/step)+1;
  const depth=Math.ceil((limits[3]-limits[1])/step)+1;
  const grid=new Int16Array(width*depth);
  for(let z=0;z<depth;z++) for(let x=0;x<width;x++) {
    const h=surface(limits[0]+x*step,limits[1]+z*step);
    grid[z*width+x]=Math.round((h-origin[1])*100);
  }
  const start=game.V;
  const cameraTarget=game.cam.position.clone().addScaledVector(game.cam.getWorldDirection(new T.Vector3()),15);
  const fixed=([x,z])=>[x-origin[0],z-origin[2]];
  const pose={ spawn:fixed([start.x,start.z]), angle:start.h+Math.PI,
    home:fixed([game.PZ_CUR.bx,game.PZ_CUR.bz]),
    terrain:{ x:limits[0],z:limits[1],step,width,depth },
    bounds: limits, sun:sun.toArray(), sourceY:origin[1],
    camera:[local(game.cam.position),local(cameraTarget)],
    buildings:game.CITY.buildings.filter(b=>b.p.some(q=>within(...fixed(q),10)))
      .map(b=>({id:b.id, outline:b.p.map(fixed)})),
    walkers:game.PEDS.filter(person=>within(...fixed([person.x,person.z]),-4))
      .slice(0,24).map((person,i)=>{
        const at=fixed([person.x,person.z]);
        const heading=person.grp?.rotation.y || i;
        const tries=[0,Math.PI/2,-Math.PI/2,Math.PI].map(angle=>[Math.sin(heading+angle),Math.cos(heading+angle)]);
        let stop=at;
        for(const [dx,dz] of tries) {
          const attempt=[at[0]+dx*10,at[1]+dz*10];
          if(!within(...attempt)) continue;
          if([0.2,0.4,0.6,0.8,1].some(t=>game.inHouse(origin[0]+at[0]+dx*10*t,origin[2]+at[1]+dz*10*t,0.25))) continue;
          stop=attempt;
          break;
        }
        return [at,stop,(i*0.29)%1];
      }),
  };
  console.log(`GODOT_EXPORT ${sources.length} source objects, ${records.size} tile/material batches, ${textureIndices.size} textures`);
  const { bytes, result } = encodeBreakables(breakables.props);
  await write('south-breakables.json',JSON.stringify(result));
  await write('south-breakables.bin',bytes);
  await captureTraffic(game,origin,within,write);
  await write('south-original.glb',glb.encode());
  await write('south-height.bin',new Uint8Array(grid.buffer));
  await write('south-original.json',JSON.stringify(pose));
  await write('capture-status.json', JSON.stringify({ phase:'complete', objects:sources.length, batches:records.size, textures:textureIndices.size }));
  return true;
}

