import {mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';

// The central-district club lies outside the native South. Keep the released storefront tests,
// but require an existing commercial façade inside the playable district.
export async function captureClub({api,server,local,writeFile,assets,section,people,factory,base,createCanvas,initI18n,THREE,groundH,variant,bufferOf,u32}) {
  const directory=new URL('evening-club/',assets);
  await mkdir(directory,{recursive:true});
  const src=await server.ssrLoadModule('/src/game/nightlife.js');
  const all=api.CITY.buildings;
  const commercial=all.filter(b=>['shop','mall','off'].includes(b.kind));
  const city={...api.CITY,buildings:commercial,meta:{home:base},
    pois:commercial.map(b=>({k:'cafe',w:b.p[0]})),
    stops:api.CITY.stops.map(s=>({x:s.p[0],z:s.p[1]}))};
  await initI18n('ru');
  const interface_={...api,CITY:city,makePerson:people.makePerson,makeHuman:factory,
    HUMAN_VC:new THREE.MeshLambertMaterial({vertexColors:true}),scene:new THREE.Scene(),LIT:[],addFoot(){},obb(){}};
  let club=src.nativeRoom(interface_);
  // A single-district map also admits a local shopping street. The three-metre
  // sidewalk, delivery doors, footprint and distance checks remain the released ones.
  for(const rank of [4,5,6]){
    if(club)break;
    interface_.nearestRoad=(x,z,c,near)=>api.nearestRoad(x,z,c===3?rank:c,near);
    club=src.nativeRoom(interface_);
  }
  for(const distance of [18,28,45]){
    if(club)break;
    interface_.facadeDistance=distance;
    club=src.nativeRoom(interface_);
  }
  if(!club)throw new Error('No commercial frontage within the released curb and entrance clearances.');
  const facade=src.findWall(),root=club.root;
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const flat=new Map(),chunks=[],parts=[],black=new Set();
  const info={street:facade.b.street,number:facade.b.number,width:club.W,at:local(root.position.x,root.position.z),
    floor:root.position.y-groundH(root.position.x,root.position.z),yaw:root.rotation.y,center:local(club.x,club.z),parts,people:[],guests:[],planes:[],beams:[]};
  function place(name,geometry){
    if(!flat.has(name))flat.set(name,[]);
    flat.get(name).push(geometry);
  }
  for(const g of interface_.LIT)place('architecture',g.clone().applyMatrix4(inv));
  function tint(g,c){
    const src=g.attributes.color,n=g.attributes.position.count,out=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      out[i*3]=c.r*(src?src.getX(i):1);out[i*3+1]=c.g*(src?src.getY(i):1);out[i*3+2]=c.b*(src?src.getZ(i):1);
    }
    g.setAttribute('color',new THREE.BufferAttribute(out,3));
    return g;
  }
  function groupGeo(node,basis,except=new Set()){
    const list=[];
    function visit(q){
      if(except.has(q)||!q.visible)return;
      if(q.geometry){
        const geo=q.geometry.clone(),pose=new THREE.Matrix4().multiplyMatrices(basis,q.matrixWorld);
        if(q.isSkinnedMesh){
          const pos=geo.attributes.position,pt=new THREE.Vector3();
          for(let i=0;i<pos.count;i++){q.getVertexPosition(i,pt);pos.setXYZ(i,pt.x,pt.y,pt.z);}
        }
        geo.applyMatrix4(pose);
        list.push(tint(geo,q.material.color||new THREE.Color(1,1,1)));
      }
      for(const child of q.children)visit(child);
    }
    visit(node);return list;
  }
  const qpeople=await server.ssrLoadModule('/src/game/qpeople.js');
  for(const [k,person] of club.dancers.entries()){
    black.add(person.piv);
    const frames=k===1?1:12,period=2*Math.PI/(k===2?2.4:2);
    const row={x:person.piv.position.x,mode:person.mode,phase:person.ph,period,frames,file:'dancer-'+k+'.bin'};
    let basePositions,nullShapes;
    const poses=[];
    for(let frame=0;frame<frames;frame++){
      src.poseDancers(club,frame*period/frames,0);
      root.updateMatrixWorld(true);
      qpeople.qPose(person.u.skin);
      root.updateMatrixWorld(true);
      const shapes=groupGeo(person.g,new THREE.Matrix4().copy(person.g.matrixWorld).invert());
      const positions=Float32Array.from(shapes.flatMap(g=>Array.from(g.attributes.position.array)));
      if(frame===0){basePositions=positions;nullShapes=shapes;continue;}
      if(positions.length!==basePositions.length)throw new Error('Stage dancer topology changed between frames.');
      const delta=positions.map((n,i)=>n-basePositions[i]);
      const body=variant(36,delta.length/3,bufferOf(delta,Float32Array)),packed=deflateSync(body);
      poses.push(Buffer.concat([u32(packed.length),u32(body.length),packed]));
    }
    await writeFile(new URL(row.file,directory),Buffer.concat([section(nullShapes,[0,0,0]),...poses]));
    info.people.push(row);
  }
  for(const [i,guest] of club.guests.entries()){
    black.add(guest.g);
    if(i===0){
      const localGuest=new THREE.Matrix4().copy(guest.g.matrixWorld).invert(),localArm=new THREE.Matrix4().copy(guest.arm.matrixWorld).invert();
      for(const g of groupGeo(guest.g,localGuest,new Set([guest.arm])))place('guest',g);
      for(const g of groupGeo(guest.arm,localArm))place('arm',g);
    }
    info.guests.push({at:guest.g.position.toArray(),ph:guest.ph});
  }
  const tags=['signMat','wallM','floorM','ceilM','sideM','glassM','tubeA','tubeB','poolM','edgeM'];
  const white=new THREE.Color(1,1,1);
  for(const beam of club.beams){black.add(beam);info.beams.push(beam.position.toArray());}
  function collect(node){
    if(black.has(node))return;
    if(node.geometry){
      const m=node.material,key=tags.find(k=>club[k]===m)||'body';
      if(key==='signMat'||key==='wallM'){
        info.planes.push({key,at:node.position.toArray(),size:[node.geometry.parameters.width,node.geometry.parameters.height]});
      }else{
        const g=node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,node.matrixWorld));
        place(key,tint(g,key==='body'?m.color:white));
      }
    }
    for(const c of node.children)collect(c);
  }
  collect(root);
  for(const [key,geos] of flat){parts.push(key);chunks.push(section(geos,[0,0,0]));}
  await writeFile(new URL('room.bin',directory),Buffer.concat(chunks));
  for(const language of ['ru','en']){
    await initI18n(language);
    await writeFile(new URL('sign-'+language+'.png',directory),src.signTex().image.toBuffer('image/png'));
  }
  await writeFile(new URL('wall.png',directory),src.wallTex().image.toBuffer('image/png'));
  await writeFile(new URL('room.json',directory),JSON.stringify(info)+'\n');
  console.log('CLUB',info.street,info.number,info.width,info.center);
}
