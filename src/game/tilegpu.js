import * as THREE from '../vendor/three.module.min.js';

/* Upload a cell before publishing it. The scratch render forces every buffer
   through WebGL, including meshes outside the camera. Compile/warm separately
   for the screen: a render target can use a different shader program. */
export function createTileGpu({renderer,scene,cam,keep=()=>{},maxVertices=50000,maxMeshes=8}) {
  // Construct three.js objects inside the stream's cosmetic RNG scope, so
  // their UUIDs cannot consume random draws used by the rest of the city.
  let scratch=null,holder=null,target=null;
  function init() {
    if(scratch)return;
    scratch=new THREE.Scene();holder=new THREE.Object3D();
    scratch.matrixAutoUpdate=false;scratch.matrixWorldAutoUpdate=false;
    holder.traverseVisible=()=>{}; // compile takes lights from scratch once
  }
  const heated=new WeakSet();
  const stats={batches:0,meshes:0,buffers:0,programs:0};
  function* batches(root) {
    const meshes=[];root.traverse(m=>{if(m.isMesh&&m.geometry&&m.material)meshes.push(m);});
    let batch=[],vertices=0;
    for(const m of meshes){
      const n=m.geometry.attributes.position?.count||0;
      if(batch.length&&(vertices+n>maxVertices||batch.length>=maxMeshes)){yield batch;batch=[];vertices=0;}
      batch.push(m);vertices+=n;
    }
    if(batch.length)yield batch;
  }
  function alive() {if(renderer.getContext().isContextLost())throw Error('land.gpu.contextLost');}
  function lighting() {
    // The city's real lights are direct scene children. Give compile a small
    // scene with the same lighting/fog/environment instead of walking every
    // distant mesh again for each upload batch.
    scratch.fog=scene.fog;scratch.environment=scene.environment;
    scratch.environmentIntensity=scene.environmentIntensity;scratch.environmentRotation.copy(scene.environmentRotation);
    return scene.children.filter(o=>o.isLight);
  }
  function uploadBatch(batch) {
    alive();init();
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    const shadows=renderer.shadowMap.autoUpdate,xr=renderer.xr.enabled;
    const states=batch.map(m=>[m,m.frustumCulled,m.visible,m.layers.mask]);
    const callbacks=new Map(),pending=new Set();
    const watch=a=>{
      if(!a)return;
      a=a.isInterleavedBufferAttribute?a.data:a;
      // Mesher's onUpload drops the CPU array only after a successful upload.
      if(!a.array||callbacks.has(a))return;
      const old=a.onUploadCallback;callbacks.set(a,old);pending.add(a);
      a.onUploadCallback=function(){pending.delete(a);stats.buffers++;old.call(this);};
    };
    try {
      for(const m of batch){
        watch(m.geometry.index);for(const a of Object.values(m.geometry.attributes))watch(a);
        m.frustumCulled=false;m.visible=true;m.layers.mask=cam.layers.mask;
      }
      scratch.children=[...lighting(),...batch];
      target??=new THREE.WebGLRenderTarget(4,4);
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(target);renderer.render(scratch,cam);
      alive();
      if(pending.size)throw Error('land.gpu.buffersMissing:'+pending.size);
      stats.batches++;stats.meshes+=batch.length;
    } finally {
      scratch.children=[];
      for(const [a,old] of callbacks)a.onUploadCallback=old;
      for(const [m,culled,visible,mask] of states){m.frustumCulled=culled;m.visible=visible;m.layers.mask=mask;}
      renderer.shadowMap.autoUpdate=shadows;renderer.xr.enabled=xr;
      renderer.setRenderTarget(previous,face,level);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    }
  }
  function compileBatch(batch) {
    alive();init();
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    try {
      holder.children=batch;
      scratch.children=lighting();
      renderer.setRenderTarget(null);
      const materials=renderer.compile(holder,cam,scratch),programs=new Set();
      for(const m of materials)for(const p of renderer.properties.get(m).programs.values())programs.add(p);
      return programs;
    } finally {
      holder.children=[];scratch.children=[];
      renderer.setRenderTarget(previous,face,level);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    }
  }
  return {stats,
    *upload(root){for(const batch of batches(root)){uploadBatch(batch);yield 'land.gpu.upload';}},
    *warm(root){
      for(const batch of batches(root)){
        const programs=compileBatch(batch);yield 'land.gpu.compile';
        for(const p of programs){
          if(heated.has(p))continue;
          alive();if(!p.program)throw Error('land.gpu.programMissing');
          if(p.isReady&&!p.isReady())yield 'land.gpu.wait';
          // These calls finish the real first-use work even without the
          // parallel-compile extension. A single program may exceed a slice.
          p.getUniforms();p.getAttributes();alive();
          if(p.diagnostics?.runnable===false)throw Error('land.gpu.programFailed');
          heated.add(p);stats.programs++;yield 'land.gpu.warm';
        }
        keep();
      }
    },
    dispose(){target?.dispose();target=null;}
  };
}
