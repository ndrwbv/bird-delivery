/* Read-only acceptance port for a host-owned probe without the game's debug namespace. */
function ownFrozen(value){
  const own=structuredClone(value);
  const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
  return freeze(own);
}
export function publishAddressAcceptance17b({target,host,read,details,report,queries,crashes}){
  if(host?.environment?.productionQuery!==true)return null;
  const api=Object.freeze({version:1,ready:true,
    capture:()=>ownFrozen(read()),details:()=>ownFrozen(details()),report:()=>ownFrozen(report()),
    queries:()=>ownFrozen(queries()),crashes:()=>ownFrozen(crashes()),
  });
  Object.defineProperty(target,'__addressAcceptance17b',{value:api,writable:false,configurable:false});
  return api;
}
