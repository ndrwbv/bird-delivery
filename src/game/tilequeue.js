/* One builder at a time: raised land and the mesher share scratch buffers.
   Pending work contains only IDs/priorities, never meshes or decoded payloads. */
export function createTileQueue({build,publish,dispose=()=>{},onRequest=()=>{},onError=()=>{},maxPending=128}) {
  let pending=new Map(),active=null,epoch=0;
  const stats={epoch:0,queued:0,active:0,cancelled:0,maxQueued:0};
  const refresh=()=>{stats.epoch=epoch;stats.queued=pending.size;stats.active=+!!active;stats.maxQueued=Math.max(stats.maxQueued,pending.size);};
  function cancel() {
    const job=active;active=null;
    if(job){stats.cancelled++;try{job.it.return?.();}finally{refresh();}}
  }
  function sync(requests,{reset=false}={}) {
    if(reset)epoch++;
    pending=new Map(requests.sort((a,b)=>a.priority-b.priority||a.id-b.id).slice(0,maxPending).map(q=>[q.id,q]));
    // An epoch change invalidates the old destination. A still-needed cell
    // may keep its builder; it now belongs to the new request explicitly.
    if(active){if(pending.has(active.id))active.epoch=epoch;else cancel();}
    refresh();
  }
  function advance() {
    if(!active){
      const next=pending.values().next().value;if(!next)return false;
      active={id:next.id,epoch,it:null};refresh();
      try{active.it=build(next.id);onRequest();}catch(error){pending.delete(next.id);active=null;refresh();throw error;}
    }
    const job=active;
    let result;
    try{
      result=job.it.next();
      if(result.done){
        if(job.epoch===epoch&&pending.has(job.id))publish(job.id,result.value);
        else dispose(result.value);
        pending.delete(job.id);active=null;
      }
    }catch(error){
      pending.delete(job.id);active=null;
      try{job.it.return?.();}finally{if(result?.done)dispose(result.value);onError(job.id,error);}
      throw error;
    }finally{refresh();}
    return true;
  }
  return {sync,advance,stats};
}
