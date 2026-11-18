// Capture growth.js on the actual South dome. Positions are local to its existing curved facade.
import {mkdir,readFile} from 'node:fs/promises';

export async function captureDepotGrowth({api,load,server,section,assets,read,writeFile,createCanvas,THREE,original}){
  const directory=new URL('depot-growth/',assets);
  await mkdir(directory,{recursive:true});
  const district=await read('south.json'),props=await read('south-breakables.json');
  const [x,z]=original.home,yaw=district.dispatch.yaw,cs=Math.cos(yaw),sn=Math.sin(yaw);
  const toLocal=([px,pz])=>[(px-x)*cs-(pz-z)*sn,(px-x)*sn+(pz-z)*cs];
  const tables=props.filter(e=>e.kind==='table'&&Math.abs(Math.hypot(e.at[0]-x,e.at[2]-z)-11.75)<.01)
    .map(e=>({id:e.id,at:toLocal([e.at[0],e.at[2]])}));
  tables.sort((a,b)=>Math.hypot(a.at[0],a.at[1]-10.6)-Math.hypot(b.at[0],b.at[1]-10.6));
  const extra=[142,159].map(k=>[11.75*Math.sin(k*Math.PI/180),11.75*Math.cos(k*Math.PI/180)]);
  if(tables.length!==12||extra.some(p=>tables.some(e=>Math.hypot(e.at[0]-p[0],e.at[1]-p[1])<2)))
    throw Error('South dome table layout changed');
  // The flattened capture retained the original hiring poster as its own four-vertex block.
  const city=await readFile(new URL('south-original.glb',assets));
  const n=city.readUInt32LE(12),json=JSON.parse(city.toString('utf8',20,20+n));
  const block=json.meshes.find(m=>m.name==='Block_n1_0_23');
  const acc=json.accessors[block.primitives[0].attributes.POSITION],buffer=json.bufferViews[acc.bufferView];
  if(acc.count!==4)throw Error('Expected the standalone porch poster');
  const pixels=new Float32Array(city.buffer,city.byteOffset+28+n+buffer.byteOffset+(acc.byteOffset||0),12);
  const y=(pixels[1]+pixels[4]+pixels[7]+pixels[10])/4-1.7;
  const growth=await load('growth'),dome=await load('pizzadome');
  const {STYLES}=await load('pizzastyles'),v=STYLES[0],ring=v.ringT*Math.PI/180;
  const d={x:0,z:0,ry:0,base:9,letters:true,gy:0,free:tables.map(t=>t.at),extra,
    porch:{V0:0,V1:10.3,VW:5.8,VH:2.75,ST:1.3},ring:{r:9*Math.cos(ring)+.12,y:.45+v.Hd+v.Hc*Math.sin(ring)}};
  const stage=growth.nativeGrowth({...api,groundH:()=>0,scene:new THREE.Scene(),
    makeHuman:()=>new THREE.Group(),HUMAN_VC:new THREE.MeshLambertMaterial()},d,5);
  const chunks=[],models=[],offsets={};
  let bytes=0;
  function append(key,geos,origin=[0,0,0]){
    const chunk=section(geos,origin);
    offsets[key]=bytes; bytes+=chunk.length;
    chunks.push(chunk);
    models.push(key);
  }
  for(const [i,t] of stage.tables.entries())append('table'+i,[t.m.geometry],[t.x,0,t.z]);
  append('balloons',[stage.balloons[0].geometry]);
  const bulbs=stage.meshes.filter(m=>!stage.balloons.includes(m));
  if(bulbs.length!==4)throw Error('Expected four garland colors');
  for(const [i,g] of bulbs.entries())append('garland'+i,[g.geometry]);
  const sign=dome.signGeo('Птица Пицца',9).clone();
  sign.computeVertexNormals();
  // Keep the live sign just outside the corresponding baked lettering at the same coordinates.
  const pos=sign.attributes.position,norm=sign.attributes.normal;
  for(let i=0;i<pos.count;i++)pos.setXYZ(i,pos.getX(i)+.012*norm.getX(i),pos.getY(i)+.012*norm.getY(i),pos.getZ(i)+.012*norm.getZ(i));
  append('letters',[sign]);
  for(const person of stage.humans.filter(p=>p.inst))append(person.band,[person.inst.geometry]);
  const people=stage.humans.map(p=>{
    const record={kind:p.kind,at:[p.x,p.z],yaw:p.h,instrument:p.band||''};
    if(p.kind==='guest')record.table=tables.reduce((a,b)=>Math.hypot(a.at[0]-p.x,a.at[1]-p.z)<Math.hypot(b.at[0]-p.x,b.at[1]-p.z)?a:b).id;
    return record;
  });
  // The native courier walks from the glass door to the car. Keep its continuous walkway open.
  const lane=[district.dispatch.door,...district.dispatch.run].map(toLocal);
  function clearance([u,v]){
    return Math.min(...lane.slice(1).map(([a,b],i)=>{
      const [x,z]=lane[i],dx=a-x,dz=b-z;
      const t=Math.max(0,Math.min(1,((u-x)*dx+(v-z)*dz)/(dx*dx+dz*dz)));
      return Math.hypot(u-x-t*dx,v-z-t*dz);
    }));
  }
  const queue=people.filter(p=>p.kind==='queue');
  let offset=0;
  while(offset<3 && queue.some(p=>clearance([p.at[0],p.at[1]+offset])<1.25))offset+=.25;
  for(const [i,p] of queue.entries()){
    p.at[1]+=offset;
    const next=i?queue[i-1].at:[1.9,d.porch.V1];
    p.yaw=Math.atan2(next[0]-p.at[0],next[1]-p.at[1]);
    if(clearance(p.at)<1.25)throw Error('Crowd blocks the courier');
  }
  await writeFile(new URL('decor.bin',directory),Buffer.concat(chunks));
  await writeFile(new URL('scene.json',directory),JSON.stringify({origin:[x,y,z],yaw,posterBlock:block.name,models,offsets,
    tables:extra,balloons:stage.balloons.map(m=>[m.position.x,m.position.z]),queueOffset:offset,people})+'\n');
  const previous=globalThis.document;
  globalThis.document={documentElement:{},createElement:()=>createCanvas(1,1)};
  const {initI18n,lang:currentLanguage}=await server.ssrLoadModule('/src/i18n/index.js');
  const previousLanguage=currentLanguage();
  for(const lang of ['ru','en']){
    await initI18n(lang);
    await writeFile(new URL('poster-'+lang+'.png',directory),growth.nativePoster().toBuffer('image/png'));
  }
  await initI18n(previousLanguage);
  globalThis.document=previous;
}
