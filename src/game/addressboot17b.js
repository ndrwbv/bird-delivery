/* Cheap candidate filter only. Actual early input identity remains authoritative after game import.
   No platform imports, mutation/freezing, clocks, RNG, async work or world construction. */
const own=(o,k)=>Object.getOwnPropertyDescriptor(o,k);
const plain=o=>!!o&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
function data(o,k){if(!plain(o))throw Error('data');const d=own(o,k);if(!d)return undefined;if(!Object.hasOwn(d,'value'))throw Error('accessor');return d.value;}
function fields(o,names){if(!plain(o))return false;const keys=Reflect.ownKeys(o);return keys.length===names.length&&names.every(k=>{const d=own(o,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;});}
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const idKeys=['mapId','mapHash','editsHash','sourceHash','inputHash'];
function slot(identity,entry){return fields(identity,idKeys)&&typeof identity.mapId==='string'&&/^[a-z0-9_-]{1,64}$/.test(identity.mapId)&&idKeys.slice(1).every(k=>hash(identity[k]))&&fields(entry,['path','bytes','sha256'])&&hash(entry.sha256)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=16*1024*1024&&entry.path==='address-data/'+entry.sha256+'.addr';}
function catalogVersion(c){
 const version=data(c,'version');
 if(version===1)return fields(c,['version','kind','identity','entry'])&&c.kind==='address-package17b'&&slot(c.identity,c.entry)?1:0;
 if(version!==2||!fields(c,['version','kind','slots'])||c.kind!=='address-package17b'||!Array.isArray(c.slots)||Object.getPrototypeOf(c.slots)!==Array.prototype||c.slots.length!==2||Reflect.ownKeys(c.slots).length!==3)return 0;
 const a=own(c.slots,0),b=own(c.slots,1);if(!a||!b||!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value'))return 0;
 const slots=[a.value,b.value];
 if(!slots.every(s=>fields(s,['graphics','identity','entry'])&&['mid','high'].includes(s.graphics)&&slot(s.identity,s.entry)))return 0;
 return slots[0].graphics!==slots[1].graphics&&slots[0].entry.path!==slots[1].entry.path&&slots[0].identity.inputHash!==slots[1].identity.inputHash&&slots.every(s=>idKeys.slice(0,4).every(k=>s.identity[k]===slots[0].identity[k]))&&slots.reduce((n,s)=>n+s.entry.bytes,0)<=16*1024*1024?2:0;
}
const bare=new Set(['mute','debug','nolb','startuptrace','addressclosure17b','addressexport17b']);
function allowedQuery(tokens,legacy){
 const seen=new Set();
 for(const token of tokens){
  const key=token.split('=',1)[0];
  if(seen.has(key)&&!(legacy&&token==='mute'))return false;seen.add(key);
  if(bare.has(token)||token==='addresspackage17b=1')continue;
  if(legacy&&(token==='gfxdev=deck'||token==='lang=ru'||/^startupdistrict=[0-7]$/.test(token)))continue;
  return false;
 }
 return true;
}
function graphicsFromStore(get){
 const all=get('dlv-gfx');if(all===undefined)return'mid';if(!plain(all))return null;
 const saved=data(all,'deck');if(saved===undefined)return'mid';if(!plain(saved))return null;
 const p=data(saved,'p');return p==='mid'||p==='high'?p:null;
}
const freshRules=[
 ['dlv-shifts',[0]],['dlv-district',[0]],['dlv-dist-open',[1]],['dlv-city-mode',[false,0]],['dlv-city-party',[false,0]],
 ['dlv-season',[2.5]],['dlv-don-trash',[0]],['dlv-don-gang',[0]],['dlv-car-cur',['semerka']],
];
export function selectAddressBoot17b({mode,mapId,deck=false,userAgent='',get,query='',catalog}={}){
 let graphics=null,diagnostic=false;
 const off=reason=>({enabled:false,graphics,diagnostic,reason});
 try{
  if(typeof query!=='string'||query.length>16384)return off('query');
  const params=new URLSearchParams(query),selectors=params.getAll('addresspackage17b');
  diagnostic=selectors.length>0||params.has('addressclosure17b')||params.has('addressexport17b');
  // An explicit opt-out wins even over a malformed catalog, legacy mode or encoded flag spelling.
  if(selectors.includes('0'))return off('explicit-disabled');
  if(mode!=='steam'||mapId!=='seversk')return off('mode-map');
  if(!catalog)return off('no-catalog');const version=catalogVersion(catalog);if(!version)return off('catalog');
  const raw=query.startsWith('?')?query.slice(1):query,tokens=raw===''?[]:raw.split('&');
  const explicit=selectors.length===1&&selectors[0]==='1'&&tokens.filter(t=>t==='addresspackage17b=1').length===1;
  const legacy=version===1&&explicit;
  if(version===1&&!legacy)return off('legacy-explicit-required');
  if(!allowedQuery(tokens,legacy))return off('query');
  const hardware=deck===true||typeof userAgent==='string'&&/steam deck|steamos/i.test(userAgent);
  if(!hardware&&!(legacy&&tokens.includes('gfxdev=deck')))return off('device');
  if(typeof get!=='function')return off('store-port');
  graphics=graphicsFromStore(get);if(!graphics)return off('graphics');
  if(!legacy)for(const[key,allowed]of freshRules){const v=get(key);if(v!==undefined&&!allowed.some(a=>Object.is(a,v)))return off('not-fresh:'+key);}
  return{enabled:true,graphics,diagnostic};
 }catch{return off('read-failed');}
}
