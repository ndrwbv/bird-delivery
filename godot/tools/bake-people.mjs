import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { Glb } from './glb.mjs';

const server=await createServer({configFile:false,appType:'custom',
  optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false}});
try {
  const THREE=await server.ssrLoadModule('/src/vendor/three.module.min.js');
  const {createHumanFactory,makePerson}=await server.ssrLoadModule('/src/game/people.js');
  const {qPose}=await server.ssrLoadModule('/src/game/qpeople.js');
  const factory=createHumanFactory({THREE,HUMAN_VC:new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}),HUMANS:new Set()});
  for(let i=0;i<6;i++) {
    const person=makePerson({seed:20261116+i*15731,fem:i%2===1&&i!==5,locale:'ru'});
    const group=factory(person,i===5?{summer:true,shirt:"#a94035",pants:"#52616d"}:{summer:true});
    const skin=group.userData.skin;
    qPose(skin);
    const state=skin.userData.q;
    const glb=new Glb();
    glb.data.extensionsUsed=['KHR_materials_unlit'];
    glb.data.materials=[{name:'Clothes',extensions:{KHR_materials_unlit:{}}}];
    const {position,color,skinIndex,skinWeight}=skin.geometry.attributes;
    const rgba=new Uint8Array(position.count*4);
    for(let v=0;v<position.count;v++) {
      rgba.set([color.getX(v),color.getY(v),color.getZ(v)].map(c=>Math.min(255,Math.round(c*255))),v*4);
    }
    glb.mesh('Person',position.array,skin.geometry.index.array,0,{colors:rgba});
    const mesh=glb.data.nodes[0];
    const attrs=glb.data.meshes[0].primitives[0].attributes;
    attrs.JOINTS_0=glb.accessor(skinIndex.array,'VEC4',34962);
    attrs.WEIGHTS_0=glb.accessor(skinWeight.array,'VEC4',34962,{normalized:true});
    mesh.skin=0;
    const {F,bones,root,k}=state;
    if(i===0) writeFileSync(new URL('../assets/actor-hands.json',import.meta.url),
      JSON.stringify([F.J.handL,F.J.handR].map(j=>`Joint_${j}`)));
    const jointIndices=bones.map((bone,j)=>glb.data.nodes.push({name:`Joint_${j}`,
      translation:bone.position.toArray(),rotation:bone.quaternion.toArray(),children:[]})-1);
    const actor={name:'Quaternius',translation:[0,root.position.y*group.scale.x,0],
      scale:[k*group.scale.x,k*group.scale.x,k*group.scale.x],children:[0]};
    for(let j=0;j<bones.length;j++) {
      const parent=F.parent[j];
      (parent<0?actor:glb.data.nodes[jointIndices[parent]]).children.push(jointIndices[j]);
    }
    for(const joint of glb.data.nodes) if(joint.children && !joint.children.length) delete joint.children;
    glb.data.scenes[0].nodes=[glb.data.nodes.push(actor)-1];
    const inverse=Float32Array.from(skin.skeleton.boneInverses.flatMap(m=>m.elements));
    glb.data.skins=[{joints:jointIndices,inverseBindMatrices:glb.accessor(inverse,'MAT4')}];
    const channels=[['rotation','VEC4'],['translation','VEC3']];
    const pose=()=>bones.map(bone=>[bone.quaternion.toArray(),bone.position.toArray()]);
    const idle=pose();
    group.userData.armL.rotation.set(-0.53,0.0,-0.14);
    group.userData.armR.rotation.set(-0.53,0.0,0.14);
    qPose(skin);
    const carry=pose();
    group.userData.armR.rotation.set(-0.73,0.0,0.04);
    qPose(skin);
    const exchange=pose();
    function partsOfArm(index) {
      for(let j=index;j>=0;j=F.parent[j]) if(j===F.J.armL||j===F.J.armR) return true;
      return false;
    }
    function animation(name,times,sample) {
      const input=glb.accessor(times,'SCALAR',undefined,{bounds:true});
      const result={name,samplers:[],channels:[]};
      for(const [joint,node] of jointIndices.entries()) {
        for(const [field,[path,type]] of channels.entries()) {
          const values=[];
          for(let frame=0;frame<times.length;frame++) values.push(...sample(joint,field,frame));
          const output=glb.accessor(new Float32Array(values),type);
          const sampler=result.samplers.push({input,output,interpolation:'LINEAR'})-1;
          result.channels.push({sampler,target:{node,path}});
        }
      }
      return result;
    }
    const clip=F.clips.walk;
    const times=Float32Array.from({length:clip.nF+1},(_,frame)=>clip.T*frame/clip.nF);
    const still=new Float32Array([0,0.10]);
    function walking(joint,field,frame) {
      const start=((frame%clip.nF)*bones.length+joint)*7+(field===0?0:4);
      return clip.data.subarray(start,start+(field===0?4:3));
    }
    glb.data.animations=[
      animation('walk',times,walking),
      animation('idle',still,(joint,field)=>idle[joint][field]),
      animation('carry',still,(joint,field)=>carry[joint][field]),
      animation('exchange',still,(joint,field)=>exchange[joint][field]),
      animation('carry_walk',times,(joint,field,frame)=>partsOfArm(joint)?carry[joint][field]:walking(joint,field,frame)),
    ];
    const asset=i===5?'courier':`pedestrian-${i}`;
    writeFileSync(new URL(`../assets/${asset}.glb`,import.meta.url),glb.encode());
  }
} finally {
  await server.close();
}
