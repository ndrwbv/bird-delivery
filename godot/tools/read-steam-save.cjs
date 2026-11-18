// Reads only the user-selected copy. Chromium is allowed to open a disposable
// clone of its LevelDB, never the source. No Steam client, network or game scene.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, protocol} = require('electron');
const arg = process.argv.find(a => a.startsWith('--source='));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-progress-'));
app.setPath('userData', temp);
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-audio-output');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true}}]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const num = (v,min=0,max=Number.MAX_SAFE_INTEGER) => Math.max(min, Math.min(max, Number.isFinite(+v) ? +v : min));
const int = v => Math.round(num(v));
const safeText = k => typeof k === 'string' ? k : '';
const unpack = raw => { try {return JSON.parse(raw);} catch {return raw;} };
const root = path.resolve(__dirname, '../..');
let windowRef;
const timeout = setTimeout(()=>{console.log('PIZZA_ERROR=timeout');app.exit(1);},20000);
timeout.unref();
async function entries(source) {
  const file = fs.statSync(source);
  if (file.isFile()) {
    const raw = JSON.parse(fs.readFileSync(source,'utf8'));
    if (raw.v === 1 && raw.kind === 'backup' && raw.data?.entries) {
      let hash=0xcbf29ce484222325n;
      const s=JSON.stringify(raw.data);
      for(let j=0;j<s.length;j++) hash=BigInt.asUintN(64,(hash^BigInt(s.charCodeAt(j)))*0x100000001b3n);
      if(hash.toString(16).padStart(16,'0') !== raw.digest) throw Error('checksum');
      return raw.data.entries;
    }
    return raw.entries || raw;
  }
  const db = [source,path.join(source,'leveldb'),path.join(source,'Local Storage','leveldb'),path.join(source,'Default','Local Storage','leveldb')].find(p=>fs.existsSync(path.join(p,'CURRENT')));
  if(!db) throw Error('leveldb-folder');
  const copy = path.join(temp,'Local Storage','leveldb');
  fs.mkdirSync(copy,{recursive:true});
  for(const name of fs.readdirSync(db)) {
    if(!/^(CURRENT|MANIFEST-\d+|\d+\.(?:log|ldb|sst))$/.test(name)) continue;
    const item=path.join(db,name);
    if(!fs.lstatSync(item).isFile()) throw Error('unexpected-file');
    fs.copyFileSync(item,path.join(copy,name));
  }
  await app.whenReady();
  app.dock?.hide();
  protocol.handle('app',()=>new Response('<!doctype html>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'none'"}}));
  windowRef = new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
  windowRef.webContents.setAudioMuted(true);
  await windowRef.loadURL('app://birdpizza/');
  return windowRef.webContents.executeJavaScript(`Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('dlv-')).map(k=>[k,localStorage.getItem(k)]))`);
}
function memory(data) {
  const m = new Map();
  for(const [k,v] of Object.entries(object(data))) if(k.startsWith('dlv-')) m.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  if(![...m.keys()].some(k => /^dlv-(?:p\d+-)?(?:msk-|car-|shifts|stars|delivered|story|ach|single-marker)/.test(k))) throw Error('no-game-data');
  return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}
function inside(x,z,poly) {
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
  }
  return yes;
}
function south(region,used,damage) {
  const labels=new Map(), ids=new Set();
  const [ox,oz]=region.origin;
  for(const b of region.buildings) {
    ids.add(+b.id);
    if(!b.street || !b.number) continue;
    const street=b.street.replace(/^улица | улица$/g,'');
    for(const d of array(b.doors)) if(d.at) labels.set(Math.round((d.at[0]+ox)/4).toString(36)+'.'+Math.round((d.at[1]+oz)/4).toString(36),street+', '+b.number);
  }
  const recent=[];
  for(const key of (typeof used==='string'?used.split(' '):array(used))) {
    const name=labels.get(key);
    if(name && !recent.includes(name)) recent.push(name);
  }
  const houses=array(damage.houses).map(h=>Number(object(h).id??h)).filter(id=>ids.has(id));
  const scars=[];
  for(const item of array(damage.scars)){
    const x=+item.x-ox, z=+item.z-oz;
    if(!Number.isFinite(x+z) || !inside(x,z,region.boundary)) continue;
    const points=array(item.outer).length>=3?item.outer:array(item.contour);
    const outline=points.slice(0,128).filter(p=>Array.isArray(p)&&p.length>=3&&Number.isFinite(+p[0]+ +p[2])&&Math.hypot(+p[0]-item.x,+p[2]-item.z)<50).map(p=>[+p[0]-ox,+p[2]-oz]);
    if(outline.length>=3) scars.push({kind:item.kind==="hell-fissure"?"fissure":"crater",center:[x,z],outer:outline});
  }
  return {recent:recent.slice(-24),history:{version:1,houses,scars}};
}
async function convert(source) {
  const data=await entries(source);
  const store=memory(data);
  const fp=crypto.createHash('sha256').update(JSON.stringify(Object.keys(data).sort().filter(k=>k.startsWith('dlv-')).map(k=>[k,store.getItem(k)]))).digest('hex');
  let seq=0;
  const {migrateSingleProgress}=await import(pathToFileURL(path.join(root,'src/game/singleprogress.js')).href);
  const mark=migrateSingleProgress({storage:store,makeId:()=>crypto.createHash('sha256').update('steam-copy/'+fp+'/'+seq++).digest('hex').slice(0,32)});
  const get=k=>{
    let value=unpack(store.getItem('dlv-'+k));
    if(typeof value==='string' && /^[\[{]/.test(value)) value=unpack(value);
    return value;
  };
  const region=JSON.parse(fs.readFileSync(path.join(root,'godot/assets/south-region.json'),'utf8'));
  const {recent,history}=south(region,get('used-addr'),object(get('hell-history')));
  const cashMultiplier=get('money-x8')?1:8;
  const shifts=int(get('shifts'));
  const tune=object(object(get('car-up')).semerka), paint=object(get('car-paint'));
  const hex=safeText(paint.semerka).toLowerCase();
  const motor=object(object(get('car-eng')).semerka), oldL=object(get('car-L')).semerka;
  const worn=oldL!=null || (shifts>0 && (!Array.isArray(get('car-owned')) || get('car-owned').includes('semerka')));
  const r=num(motor.r??100,20,100);
  const engine={c:num(motor.c??(worn?num(95-10*Number(oldL??3),20,95):100),0,r),r,km:num(motor.km??(worn?30:0)),n:int(motor.n)};
  const ach=object(get('ach')), skill=object(get('skill')), story=object(get('story')), crew=object(get('crew')), cycle=object(get('cycle'));
  const crewTotals={};
  array(crew.crew).slice(0,7).forEach((m,i)=>{crewTotals['south-courier-'+(i+1)]=int(object(m).total)*cashMultiplier;});
  const sourceCounts=array(get('dist-shifts')).reduce((sum,v)=>sum+int(v),0);
  const validPaint=/^#[\da-f]{6}$/.test(hex) && (paint._v || hex!=='#f0522a');
  const quick=object(get('quick'));
  const cleanCounters={};
  for(const [k,v] of Object.entries(object(ach.n))) if(typeof v==='number'&&Number.isFinite(v)&&v>=0) cleanCounters[k]=int(v);
  const got={},seen={};
  for(const [k,v] of Object.entries(object(ach.got))) if(/^[A-Z0-9_]+$/.test(k)&&Number.isFinite(+v)&&+v>0) got[k]=+v;
  for(const k of Object.keys(object(ach.seen))) if(object(ach.seen)[k]) seen[k]=true;
  const career={version:1,save_id:mark.saveId,resets:int(mark.resets),source_profile:int(mark.sourceProfile),import_digest:fp,
    wallet:int(get('msk-wallet'))*cashMultiplier,respect:int(get('respect')),depot_turret:int(get('turret'))>0,shifts,stars:int(get('stars')),xp:int(get('msk-xp')),skill:num(skill.u,0,10),skill_shift:int(skill.shift),
    gennady_paid:int(object(story.gennady).ch)>0,deliveries:int(get('delivered')),counted:Math.min(shifts,sourceCounts),knocked:int(get('knocked')),
    best:{earned:int(get('msk-best')),delivered:0},recent,engine,
    seed:int(cycle.seed)||parseInt(crypto.createHash('sha256').update(mark.saveId).digest('hex').slice(0,7),16),
    crew_earned:int(crew.me)*cashMultiplier,crew_count:int(crew.n),crew_totals:crewTotals,
    semerka:{armor:num(tune.armor,0,3)|0,engine:num(tune.engine,0,3)|0,wings:!!tune.wings,gun:!!tune.gun,paint:validPaint?hex:'#ebe6d8'}};
  if(get('don-trash')!=null) career.trash_donated=Math.min(480000,int(get('don-trash'))*cashMultiplier);
  if(get('don-gang')!=null) career.gang_donated=Math.min(640000,int(get('don-gang'))*cashMultiplier);
  if(get('clock')!=null) career.clock_hour=num(get('clock'),0,24);
  if(Array.isArray(get('pz-grow'))) career.south_growth=get('pz-grow').reduce((sum,n)=>sum+int(n),0);
  const oldBoard=array(get('lb-local'));
  if(oldBoard.length){
    career.imported_scores=oldBoard.slice(0,50).map(item=>{
      const row=object(item);
      return {owner:safeText(row.ownerId).slice(0,128),name:safeText(row.name).slice(0,80),score:int(row.score),delivered:int(row.delivered),level:int(row.level),ts:int(row.ts)};
    }).filter(row=>row.score>0);
  }
  if(get('route')!=null) career.road_path=!['0','off','false'].includes(String(get('route')));
  if(['1','2'].includes(String(get('route-ask')))) career.road_path_ask=Number(get('route-ask'));
  const previousDaily=get('daily-last');
  if(previousDaily!=null) {
    const ids=Array.isArray(previousDaily)?previousDaily:safeText(previousDaily).split(/\s+/);
    career.daily_last=ids.filter(id=>typeof id==='string' && /^[a-z]{1,16}$/.test(id)).slice(0,3);
  }
  if(get('doorgames')!=null) career.door_games=!['0','off','false'].includes(String(get('doorgames')));
  return {version:1,career,quick:{best:int(quick.best),history},awards:{got,seen,n:cleanCounters}};
}
convert(arg?arg.slice('--source='.length):'').then(result=>{
  console.log('PIZZA_SAVE='+JSON.stringify(result));
}).catch(e=>{console.log('PIZZA_ERROR='+String(e.code||e.message));process.exitCode=1;}).finally(()=>{
  if(windowRef)windowRef.destroy();
  app.quit();
});
app.on('quit',()=>{clearTimeout(timeout);fs.rmSync(temp,{recursive:true,force:true});});
