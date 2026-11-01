/* №17ж observational init-script. No injected storage failure, no state/progress changes.
   Native marker publication must still precede legacy __boot; __startupTrace may exist earlier. */
(() => {
  const state = window.__startupBootGuard = { markerWrites: 0, bootAbsentAtMarker: true, earlyBootSeen: false };
  const nativeSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === 'dlv-single-marker-v1') {
      state.markerWrites++;
      if (window.__boot !== undefined) { state.bootAbsentAtMarker = false; state.earlyBootSeen = true; }
    }
    return nativeSet.call(this, key, value);
  };
})();

/* Injected before game import. Faults only the one packaged land URL; no RNG/state changes. */
(() => {
  const kind="missing-asset",path="/city-data/2ecd942570b7955f82c20fe7e11bfbcfd006b00c382e5ab044e095a2834dc8bd.land.gz";
  const state=window.__landPackageNegative={version:1,kind,assetCalls:0,injections:0,wrongFileChanged:false,cancelled:false,
    firstObservedPhase:null,baselineCaptured:false,unchangedAtCancel:null,cancelBefore:null,cancelAfter:null,error:null};
  let baseline=null;
  const packedRefs=d=>{
    const s=d.RLAND;if(s.cover.rawCount!==0||s.green.rawCount!==0)throw Error('negative observer requires already compact prepared input');
    const c=s.cover.snapshot(),g=s.green.snapshot();return[c.packed,c.grid,g.packed,g.grid,s.finalMask.kept,s.ST];
  };
  const flags=d=>({built:d.RLAND.ST.built,supportReady:d.RLAND.ST.supportReady,maskReady:d.RLAND.finalMask.ready,
    maskCells:d.RLAND.finalMask.cells,maskCount:d.RLAND.finalMask.count,published:d.LAND_STREAM?.stats.ready||0,
    cacheCommitSteps:window.__startupTrace?.report().rows.find(r=>r.name==='raisedland.cache.commit')?.steps||0});
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(resource,options){
    const url=new URL(typeof resource==='string'?resource:resource.url,location.href);
    if(url.pathname!==path)return nativeFetch(resource,options);
    state.assetCalls++;
    if(kind==='missing-asset'){state.injections++;return new Response(null,{status:404,statusText:'acceptance missing packaged land'});}
    const response=await nativeFetch(resource,options);
    if(kind!=='wrong-wire-sha')return response;
    state.injections++;const reader=response.body.getReader();
    const body=new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){controller.close();reader.releaseLock();return;}
      let value=part.value;if(!state.wrongFileChanged&&value.length){value=value.slice();value[0]^=1;state.wrongFileChanged=true;}controller.enqueue(value);
    }catch(error){controller.error(error);}},cancel(reason){return reader.cancel(reason);}});
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  const observe=setInterval(()=>{
    try{
      const d=window.__dlv,reader=d?.LAND_PACKAGE;if(!reader)return;
      const meta=reader.meta();state.firstObservedPhase??=meta.phase;
      if(kind==='cancel-preparing'&&!baseline&&meta.phase==='preclean'){
        baseline=packedRefs(d);state.baselineCaptured=true;
      }
      if(kind==='cancel-preparing'&&!state.cancelled&&meta.phase==='preparing'){
        if(!baseline)throw Error('preparing reached without preclean baseline');
        state.cancelBefore=flags(d);const current=packedRefs(d);
        state.unchangedAtCancel=baseline.every((ref,i)=>ref===current[i]);
        reader.cancel('ACCEPTANCE_CANCEL_PREPARING');state.cancelled=true;state.injections++;
        state.cancelAfter={...flags(d),meta:reader.meta()};
        state.unchangedAtCancel&&=baseline.every((ref,i)=>ref===packedRefs(d)[i]);
        baseline=null;clearInterval(observe);
      }else if(meta.phase==='restored'||meta.phase==='fatal'||meta.phase==='fallback'){
        baseline=null;clearInterval(observe);
      }
    }catch(error){state.error=String(error?.message||error);baseline=null;clearInterval(observe);}
  },0);
})();
