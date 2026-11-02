/* Diagnostic observation only. Own data, never a functional key or a live Store/scene reference. */
const need=(yes,code)=>{if(!yes)throw Error('addressinput17b:'+code);};
const keys=(value,names,code)=>need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===names.split(',').sort().join(','),code);
const carKeys='dlv-car-owned,dlv-car-cur,dlv-car-up,dlv-car-L,dlv-car-paint,dlv-car-eng';
export function snapshotAddressInitial17b(input){
  // structuredClone precedes ALL freezing, including raw objects/arrays returned by Store.get.
  const own=structuredClone(input);
  keys(own,'phase,at,mapId,mode,adult,career,intro,editor,language,season,donation,district,car,graphics,ordinary','ROOT_FIELDS');
  keys(own.season,'value,forced,saved','SEASON_FIELDS');keys(own.donation,'trashRaw,trashGoal,trashFraction','DONATION_FIELDS');
  keys(own.district,'current,opened,city','DISTRICT_FIELDS');keys(own.car,'id,inputs','CAR_FIELDS');
  keys(own.car.inputs,carKeys,'CAR_INPUT_FIELDS');need(Object.keys(own.car.inputs).join(',')===carKeys,'CAR_INPUT_ORDER');
  keys(own.graphics,'preset,device','GRAPHICS_FIELDS');keys(own.ordinary,'provider,ordinaryAtImport,hookOwned,baseSeed','ORDINARY_FIELDS');
  need(own.phase==='before-city-syncBuild'&&Number.isFinite(own.at)&&own.at>=0,'PHASE');
  const seen=new WeakSet();
  function freeze(value){
    if(value===null||typeof value!=='object')return;
    if(seen.has(value))return;
    need(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype,'PLAIN_DATA');seen.add(value);
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  freeze(own);return own;
}
