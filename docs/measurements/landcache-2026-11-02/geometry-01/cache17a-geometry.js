/* №17а outside-timing geometry only. Existing numeric bodies adapted to local streaming readiness.
   First generated run emits samples. Cache MUST receive those exact samples via init script.
   No fullterrain, finishSurface, unlockAll, private startRun or live restore. */
const provenance=[{"path": "tools/probe-checks/startup-ready.js", "sha256": "044da43ee073f0533427231b14d4ef0a92d61a0c46db718819efc47507942c91"}, {"path": "tools/probe-checks/raised-land.js", "sha256": "99324366abd28f28f5e498c68947987cc17791acbfb534792c43852645e7cf3e"}, {"path": "tools/probe-checks/raised-land-drive.js", "sha256": "9ccfc2526f01f276af84164a4180215954bf08fd851f7b1e410a6a1ee806d88e"}, {"path": "tools/probe-checks/land-boundary.js", "sha256": "616066e1d59083c54d85df8771ccf9d9068c7e838c8e560a3d3e7e587cbfea6e"}, {"path": "src/game/landcache17a/landcache-accept.js", "sha256": "a65bc8dc87fded2ef6ecdba5e380449d41efbea1de7b1e00db98c710c4a2e625"}];
const geometry={stage:'startup',samples:null};window.__cacheGeometry17a=geometry;
const need=(ok,message)=>{if(!ok)throw Error('cache-geometry17a: '+message);};
try{
 const startup=await(async()=>{
/* №17ж: actual menu action -> non-held physics + completed visible frame + ready local support.
   Use --early --startup-trace --startup-session=... --startup-fixture=... --cpu=3 --bootcpu --seed=7 --size=deck.
   The test never changes graphics, phase/state, ground support, or calls startRun directly. */
const trace=window.__startupTrace;
if(!trace?.enabled)throw Error('startuptrace instrumentation is required');
const targetValue=new URLSearchParams(location.search).get('startupdistrict');
const expectedDistrict=targetValue===null?null:Number(targetValue);
const before={district:d.DIST.cur(),opened:d.DIST.opened(),city:d.DIST.city(),partySeen:d.CITYOPEN.seen()};
if(expectedDistrict!==null&&(before.district!==expectedDistrict||before.opened<=expectedDistrict||before.city))throw Error('Invalid real saved district before menu: '+JSON.stringify(before));
if(expectedDistrict===7&&(before.opened!==8||!before.partySeen))throw Error('Far fixture must have honestly open districts and an already acknowledged party');
const button=document.querySelector('.crm-card[data-key="go"] .crm-cb');
if(!button)throw Error('Real shift button missing');
const start=performance.now();button.click();
const limit=240000,deadline=start+limit;
let dialogEnd=null,pickerEnd=null,pickerClicks=0,dialogClicks=0,pickerObservedAt=null,pickerClickedAt=null;
const visible=b=>b&&!b.closest('[hidden]')&&!b.disabled&&b.getBoundingClientRect().width>0&&getComputedStyle(b).visibility!=='hidden';
while(performance.now()<deadline&&!trace.firstControl){
  // A saved fully-open career asks its normal district picker before starting.
  if(document.querySelector('#cr-city'))throw Error('Unexpected unlock party; fixture does not describe a settled saved career');
  const target=targetValue;
  const picker=document.querySelector('#cr-dpick:not([hidden])');
  const picked=target===null?null:picker?.querySelector('.dp-card[data-key="'+target+'"] .dp-go');
  if(picker&&visible(picked)){
    if(pickerClicks)throw Error('District picker reopened after its one successful action');
    if(!picked.closest('.dp-card')?.classList.contains('on'))throw Error('Fixture district is not the visible selected card');
    pickerObservedAt=performance.now();pickerEnd=trace.windowStart('external.scriptedDistrict','external');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(!visible(picked))throw Error('District picker disappeared before its visible action');
    pickerClickedAt=performance.now();picked.click();pickerClicks++;
    if(!picker.hidden)throw Error('The one visible district action did not close the picker');
    pickerEnd();pickerEnd=null;
  }
  // Scripted response to a real tutorial/dialog is external input, never attributed to CPU.
  const dialog=d.DLG;
  if(dialog?.isOpen?.()){
    if(!dialogEnd)dialogEnd=trace.windowStart('external.scriptedDialog','external');
    const root=document.querySelector('#dlg:not([hidden])');
    const yes=root?.querySelector('.dlg-yes');
    const b=visible(yes)?yes:Array.from(root?.querySelectorAll('button')||[]).find(visible);if(b){b.click();dialogClicks++;}
  }else if(dialogEnd){dialogEnd();dialogEnd=null;}
  await wait(50);
}
if(dialogEnd)dialogEnd();
if(pickerEnd)pickerEnd();
const report=trace.firstReport||trace.report(),control=report.marks['first.control'];
if(!control)throw Error('No controllable rendered frame within '+limit+'ms: '+JSON.stringify(report));
if(report.dropped)throw Error('Trace aggregate limit reached; report is incomplete');
if(report.resourceCapture?.truncatedCount)throw Error('Resource list truncated; this report is not a complete pilot');
if(!control.data.localReady||!control.data.supportReady||control.data.state!=='drive'||control.data.held)throw Error('False first-control marker');
if(control.data.guardVersion!==2||control.data.paused!==false||control.data.mapOpen!==false)throw Error('Fresh guardVersion2 control state was not proven');
const P=d.PZ_CUR,actualDistrict=d.DIST.cur();
const district={before,actual:actualDistrict,atControl:d.DIST.at(control.data.x,control.data.z),pizzaIndex:d.PIZZERIAS.indexOf(P),pizza:{x:P?.x,z:P?.z,bx:P?.bx,bz:P?.bz},position:{x:control.data.x,z:control.data.z},pickerClicks,pickerObservedAt,pickerClickedAt,dialogClicks};
if(expectedDistrict!==null&&(actualDistrict!==expectedDistrict||district.pizzaIndex!==expectedDistrict||district.atControl!==expectedDistrict))throw Error('Selected district did not become the physical start: '+JSON.stringify(district));
if(expectedDistrict!==null&&expectedDistrict>0&&!pickerClicks)throw Error('Saved district did not pass through its real picker');
const pos={x:d.V.x,z:d.V.z};
document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));
await wait(600);
document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));
const moved=Math.hypot(d.V.x-pos.x,d.V.z-pos.z);
if(!(moved>.05))throw Error('Control marker did not permit real acceleration: '+moved);
const bootstrap=window.__startupBootGuard;
if(!bootstrap?.markerWrites||!bootstrap.bootAbsentAtMarker||bootstrap.earlyBootSeen||!window.__boot)throw Error('Legacy __boot bootstrap semantics changed: '+JSON.stringify(bootstrap));
const crash=d.crashlog.entries();if(crash.length)throw Error('Startup crash: '+JSON.stringify(crash));
const cache=window.__landCache17a?.meta?.()||null;
if(new URLSearchParams(location.search).has('landcache')&&(!cache||cache.source!=='cache'||cache.phase!=='restored'||!cache.hit||cache.cleanCalls!==0||cache.reason||cache.bufferHeld))throw Error('Control did not follow a clean cache restore: '+JSON.stringify(cache));
return {ok:true,protocolVersion:2,district,cache,bootstrap,host:window.__startupHost||null,report,moved,crash,land:{...d.LAND_STREAM?.stats},raised:{...d.RLAND.ST},late:{...d.LATE.T},
  firstControlFromClickMs:control.at-start,firstControlFromNavigationMs:control.at,
  conditions:{lang:document.documentElement.lang,seed:window.__startupHost?.seed??null,url:location.href,physicalDeck:false}};

})();
 geometry.stage='select';
 const L=d.RLAND,stream=d.LAND_STREAM,V=d.V,IN=d.IN,base=d.RLAND_BASE;
 const home={x:startup.report.marks['first.control'].data.x,z:startup.report.marks['first.control'].data.z};
 need(L?.ST.supportReady&&L.finalMask?.ready&&stream?.readyAt(home.x,home.z,640),'initial local/support readiness');
 need(Number.isFinite(L.ST.minWidth)&&L.ST.minWidth>0,'cleaned minWidth metadata missing');
 need(!d.LATE.busy()&&d.S.state==='drive'&&!d.S.paused,'normal driving state');
 const near=(x,z)=>Math.hypot(x-home.x,z-home.z)<=520&&d.DIST.at(x,z)===d.DIST.cur()&&stream.readyAt(x,z,8);
 const blocked=(x,z,margin=1.4)=>{const i=Math.floor(x/30),j=Math.floor(z/30),solids=new Set();
  for(let a=i-1;a<=i+1;a++)for(let b=j-1;b<=j+1;b++)for(const s of d.SOLID_GRID.get(a+','+b)||[])solids.add(s);
  return [...solids].some(s=>{if(s.edGone||s.down)return false;const dx=x-s.cx,dz=z-s.cz;return Math.abs(dx*s.cs-dz*s.sn)<s.hw+margin&&Math.abs(dx*s.sn+dz*s.cs)<s.hd+margin;});};
 const freePose=(x,z)=>near(x,z)&&!d.inHouse(x,z,3)&&!blocked(x,z);
 const stripFree=(x,z,ux,uz)=>[-5,-4,-3,-2,-1,0,1,2,3,4,5].every(r=>freePose(x+ux*r,z+uz*r));
 const wheelLand=(x,z,h,on)=>[1.4,-1.45].every(f=>[-.9,.9].every(s=>L.onLand(x+Math.sin(h)*f+Math.cos(h)*s,z+Math.cos(h)*f-Math.sin(h)*s)===on));
 let samples=window.__landGeometry17aSamples||null;
 const isCache=!!startup.cache;
 need(!isCache||samples,'cache requires generated sample lock, not a new selection');
 if(isCache)need(/^[a-f0-9]{64}$/.test(samples.drawDigest||''),'generated draw digest missing from sample lock');
 if(!samples){
  samples={version:1,district:d.DIST.cur(),home,landPoses:[],pavedPoses:[],driveEdges:[],boundaries:[],seams:[],props:[],benches:[]};
  // raised-land.js selection, with local-ready and obstacle filters only.
  for(const t of L.cover.triangles){
   if(t.lift>=.49)continue;
   for(let i=0;i<3;i++){
    const a=t.p[i],b=t.p[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<4)continue;
    const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,nx=-dz/len,nz=dx/len;if(!near(x,z)||base(x,z)<1)continue;
    const p=[x+nx*.7,z+nz*.7],q=[x-nx*.7,z-nz*.7];if(d.inHouse(...p)||d.inHouse(...q)||L.onLand(...p)===L.onLand(...q))continue;
    const sign=L.onLand(...p)?1:-1,ux=nx*sign,uz=nz*sign,land=sign===1?p:q,paved=sign===1?q:p,h=Math.atan2(ux,uz),pose=[x+ux*4,z+uz*4];
    if(samples.landPoses.length<3&&freePose(...pose)&&wheelLand(...pose,h,true)&&samples.landPoses.every(e=>Math.hypot(e.pose[0]-pose[0],e.pose[1]-pose[1])>30))samples.landPoses.push({pose,h,land,paved});
    const pp=[x-ux*4,z-uz*4],floor=L.cover.height(...pp);
    if(samples.pavedPoses.length<2&&freePose(...pp)&&wheelLand(...pp,h,false)&&Number.isFinite(floor)&&floor<.49&&base(...pp)>1&&Math.abs(d.surfaceAt(...pp)-d.groundH(...pp))<=.05&&samples.pavedPoses.every(e=>Math.hypot(e.pose[0]-pp[0],e.pose[1]-pp[1])>30))samples.pavedPoses.push({pose:pp,h});
    // raised-land-drive.js: long, clear strip crossing a real land/pave edge.
    if(len>=10&&samples.driveEdges.length<2&&[.15,1,3].every(r=>L.onLand(x+ux*r,z+uz*r)&&!L.onLand(x-ux*r,z-uz*r))&&stripFree(x,z,ux,uz)&&samples.driveEdges.every(e=>Math.hypot(e.x-x,e.z-z)>35))samples.driveEdges.push({x,z,ux,uz,kind:'land-boundary'});
   }
   if(samples.landPoses.length===3&&samples.pavedPoses.length===2&&samples.driveEdges.length===2)break;
  }
  // Local contour samples use the unchanged land-boundary predicate below.
  const bounds=[home.x-280,home.z-280,home.x+280,home.z+280];
  for(const edge of L.boundaries({bounds,accept:(x,z)=>near(x,z)&&base(x,z)>.8})){
   if(!edge)continue;if(Math.hypot(edge.b[0]-edge.a[0],edge.b[1]-edge.a[1])<.02)continue;
   if([edge.a,edge.b].every(p=>near(...p)))samples.boundaries.push({a:edge.a.slice(),b:edge.b.slice()});if(samples.boundaries.length===12)break;
  }
  // One shared edge of two already published cells, flat same-kind ground, no forced prepare.
  for(let id=0;id<stream.ready.length&&!samples.seams.length;id++){
   if(!stream.ready[id])continue;const a=stream.bounds(id),i=id%stream.nx,j=Math.floor(id/stream.nx);
   for(const[next,axis]of [[i+1<stream.nx?id+1:-1,'x'],[j+1<stream.nz?id+stream.nx:-1,'z']]){
    if(next<0||!stream.ready[next])continue;const b=stream.bounds(next);
    for(const offset of [0,-32,32,-64,64,-96,96,-128,128]){
     const x=axis==='x'?a[2]:Math.max(a[0]+12,Math.min(home.x+offset,a[2]-12)),z=axis==='z'?a[3]:Math.max(a[1]+12,Math.min(home.z+offset,a[3]-12)),ux=axis==='x'?1:0,uz=axis==='z'?1:0;
     if(!stripFree(x,z,ux,uz)||![-4,-2,0,2,4].every(r=>L.onLand(x+ux*r,z+uz*r))||Math.abs(base(x-ux*.05,z-uz*.05)-base(x+ux*.05,z+uz*.05))>.01)continue;
     samples.seams.push({id,next,axis,a,b,x,z,ux,uz});samples.driveEdges.push({x,z,ux,uz,kind:'cell-seam'});break;
    }if(samples.seams.length)break;
   }
  }
  for(let i=0;i<d.PROPS.length&&samples.props.length<8;i++){const p=d.PROPS[i];if(near(p.x,p.z)&&L.onLand(p.x,p.z)&&!p.down)samples.props.push({index:i,kind:p.kind,x:p.x,z:p.z,y:p.pivot.position.y});}
  for(let i=0;i<d.BENCHES.length&&samples.benches.length<4;i++){const b=d.BENCHES[i];if(near(b.x,b.z)&&L.onLand(b.x,b.z)&&!b.prop?.down)samples.benches.push({index:i,x:b.x,z:b.z,y:b.y,pivotY:b.prop?.pivot.position.y});}
 }
 geometry.samples=samples;
 need(samples.version===1&&samples.district===d.DIST.cur()&&Math.hypot(samples.home.x-home.x,samples.home.z-home.z)<.001,'sample lock belongs to another start');
 need(samples.landPoses.length===3&&samples.pavedPoses.length===2&&samples.driveEdges.filter(e=>e.kind==='land-boundary').length===2&&samples.boundaries.length>=6&&samples.seams.length===1&&samples.props.length>=2,'insufficient independent ready samples');
 for(const p of [...samples.landPoses,...samples.pavedPoses])need(freePose(...p.pose),'locked pose unavailable');
 for(const e of samples.driveEdges)need(stripFree(e.x,e.z,e.ux,e.uz),'locked crossing unavailable');

 geometry.stage='draw-inputs';
 // Exact query shape from existing landcache-accept.js (no live restore or roundtrip).
function query(t,points,skip){const {cover:c,green:g,finalMask:m}=t;return points.map(([x,z])=>{const square=[[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]],bounds=[x-2,z-2,x+2,z+2];return{drawInputs:[c,g,m.kept].map(field=>field.inBox(bounds).slice(0,512).map(t=>({id:t.id,p:t.p,lift:t.lift,rgb:t.rgb,initial:t.initial}))),heights:[c.height(x,z),g.height(x,z),m.kept.height(x,z)],sides:[c.sideHeights(x,z,1,0),g.sideHeights(x,z,1,0),m.sides(x,z,1,0)],state:m.cellState(x,z),contains:m.contains(x,z),parts:[...m.parts(square,p=>c.cut(p))],breaks:m.breaks(x-1,z,x+1,z),boundaries:[...m.boundaries({bounds,accept:(a,b)=>!skip?.(a,b),floorAt:(a,b)=>{const h=c.height(a,b);return Number.isFinite(h)?h:.085;},floorBreaks:(...v)=>c.breaks(...v,.49)})].filter(Boolean)};});}
 const points=[...samples.landPoses.flatMap(e=>[e.land,e.paved,e.pose]),...samples.pavedPoses.map(e=>e.pose),...samples.seams.map(e=>[e.x,e.z])].slice(0,16);
 const queries=query(L,points,null);
 const safe=JSON.stringify(queries,(_k,v)=>typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0))?{$number:Object.is(v,-0)?'-0':String(v)}:v===undefined?{$undefined:true}:v);
 const drawDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(safe))),v=>v.toString(16).padStart(2,'0')).join('');
 if(samples.drawDigest)need(drawDigest===samples.drawDigest,'selected draw/query inputs differ from generated');else samples.drawDigest=drawDigest;
 const props=samples.props.map(e=>{const p=d.PROPS[e.index];need(p&&p.kind===e.kind&&Math.hypot(p.x-e.x,p.z-e.z)<1e-7,'prop identity');need(Math.abs(p.pivot.position.y-e.y)<1e-6,'prop double/missing align');return{...e,actualY:p.pivot.position.y};});
 const benches=samples.benches.map(e=>{const b=d.BENCHES[e.index];need(b&&Math.hypot(b.x-e.x,b.z-e.z)<1e-7,'bench identity');need(Math.abs(b.y-e.y)<1e-6&&Math.abs(b.prop.pivot.position.y-e.pivotY)<1e-6,'bench double/missing align');return{...e,actualY:b.y,actualPivotY:b.prop.pivot.position.y};});
 geometry.stage='boundaries';
 const boundary={checked:0,bad:0,thin:0,narrow:0,minWidth:Infinity};
 // Numeric body from land-boundary.js, plus existing raised-land-width.js threshold.
 for(const edge of samples.boundaries){
  const{a,b}=edge,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
  for(const t of [.17,.5,.83]){
   const x=a[0]+dx*t,z=a[1]+dz*t;let r=Math.min(.00001,len/20);
   const good=()=>L.onLand(x+nx*r,z+nz*r)&&!L.onLand(x-nx*r,z-nz*r);
   if(!good()){const span=.01;for(const C of L.finalMask?.ready?[L.finalMask]:[L.cover,L.green])for(const u of C.breaks(x-nx*span,z-nz*span,x+nx*span,z+nz*span)){const distance=Math.abs(u-.5)*span*2;if(distance>1e-9)r=Math.min(r,distance/4);}if(good())boundary.thin++;else boundary.bad++;}
   const width=L.widthAt(edge,t);boundary.minWidth=Math.min(boundary.minWidth,width);if(width+.001<L.ST.minWidth)boundary.narrow++;
  }boundary.checked++;
 }
 need(!boundary.bad&&!boundary.narrow,'local contour/width');
 const seamHeights=samples.seams.map(e=>{need(stream.ready[e.id]&&stream.ready[e.next],'seam cells not published');const left=d.groundH(e.x-e.ux*.05,e.z-e.uz*.05),right=d.groundH(e.x+e.ux*.05,e.z+e.uz*.05);need(Math.abs(left-right)<=.03,'shared-cell support step');return{...e,left,right};});
 const zeroInput=()=>{for(const key of ['gas','brake','left','right','hand','nitro','joy'])IN[key]=0;};
 const poseAt=(p,h)=>{zeroInput();tp(...p,h);V.x=p[0];V.z=p[1];V.h=h;V.y=d.surfaceAt(...p);V.vx=V.vz=0;V.air=false;V.roof=false;V.pitch=V.roll=V.steer=V.kickW=0;};
 geometry.stage='wheels';
 const poses=[];
 // Existing raised-land.js height/body/wheel tests, no old global built/baseDisposed gate.
 for(const e of samples.landPoses){const p=e.pose;poseAt(p,e.h);await wait(500);need(d.S.state==='drive'&&!d.S.paused,'state changed during pose');need(Math.hypot(V.x-p[0],V.z-p[1])<=3&&L.onLand(V.x,V.z),'land pose obstructed');
  const gap=d.car.position.y-d.groundH(V.x,V.z);need(wheelLand(V.x,V.z,V.h,true),'four wheels not on land');need(Number.isFinite(gap)&&gap>=-.08&&gap<=.65,'land wheel/body height');
  const rise=d.groundH(...e.land)-base(...e.land),flat=d.groundH(...e.paved)-base(...e.paved);need(Math.abs(rise-L.LIFT)<=1e-5&&Math.abs(flat)<=1e-5,'cover/support mismatch');poses.push({x:V.x,z:V.z,gap,rise,flat});}
 const pavedPoses=[];
 for(const e of samples.pavedPoses){poseAt(e.pose,e.h);await wait(500);need(wheelLand(V.x,V.z,V.h,false),'four wheels not on paving');const at=L.cover.height(V.x,V.z),actual=d.car.position.y-base(V.x,V.z),expected=Math.max(.03,at,d.DECOR.lift(V.x,V.z));need(Number.isFinite(at)&&at<.49&&!L.onLand(V.x,V.z)&&Math.abs(actual-expected)<=.03&&!V.cbump,'paving wheel/body height');pavedPoses.push({x:V.x,z:V.z,actual,expected});}
 geometry.stage='drive';
 const driveRows=[];
 // Existing raised-land-drive.js trajectory/thresholds, including a shared ready-cell seam.
 for(const edge of samples.driveEdges)for(const direction of [1,-1]){
  const{x,z,ux,uz}=edge,fx=ux*direction,fz=uz*direction,sx=x-fx*3.8,sz=z-fz*3.8;poseAt([sx,sz],Math.atan2(fx,fz));V.vx=fx;V.vz=fz;await wait(100);
  need(d.S.state==='drive'&&!d.S.paused,'state changed before crossing');const start=performance.now(),bumps=d.CURBS.ST.bumps,hp=d.S.hp;let previous=d.car.position.y,maxStep=0,maxCbump=0;
  while(performance.now()-start<6000){const speed=V.vx*fx+V.vz*fz;IN.gas=speed<2.5?1:0;await wait(16);const y=d.car.position.y;maxStep=Math.max(maxStep,Math.abs(y-previous));previous=y;maxCbump=Math.max(maxCbump,Math.abs(V.cbump||0));if((V.x-sx)*fx+(V.z-sz)*fz>8)break;}
  zeroInput();const distance=(V.x-sx)*fx+(V.z-sz)*fz,lateral=Math.abs((V.x-sx)*fz-(V.z-sz)*fx),row={kind:edge.kind,direction,distance,lateral,bumps:d.CURBS.ST.bumps-bumps,maxCbump,maxStep,hpBefore:hp,hpAfter:d.S.hp};driveRows.push(row);
  need(distance>=8&&lateral<.75&&maxStep<.12&&row.hpAfter===hp&&row.bumps===0&&maxCbump===0,'slow crossing '+JSON.stringify(row));
 }
 geometry.stage='done';
 const finalTrace=window.__startupTrace.report(),alignCalls=finalTrace.rows.find(r=>r.name==='raisedland.alignObjects')?.steps,activateCalls=finalTrace.rows.find(r=>r.name==='raisedland.activate')?.steps;
 need(alignCalls===1&&activateCalls===1,'activation/alignment was repeated');need(stream.stats.failed===0&&!d.crashlog.count()&&finalTrace.dropped===0,'surface/crash/trace failure');
 return{ok:true,timing:false,provenance,sampleMode:isCache?'locked-cache':'generated-selection',samples,selectedDrawInputs:{sha256:drawDigest,points:points.length,queryShape:'existing landcache-accept.js',rendered:false},props,benches,boundary,seamHeights,poses,pavedPoses,driveRows,alignCalls,activateCalls,localReady:stream.readyAt(home.x,home.z,640),supportReady:L.ST.supportReady,land:{...stream.stats},cache:window.__landCache17a?.meta?.()||null,crash:d.crashlog.count(),startup:{protocolVersion:startup.protocolVersion,guardVersion:startup.report.marks['first.control'].data.guardVersion}};
}catch(error){return{ok:false,timing:false,stage:geometry.stage,error:String(error?.stack||error),samples:geometry.samples,cache:window.__landCache17a?.meta?.()||null,crash:d.crashlog.count()};}
finally{for(const key of ['gas','brake','left','right','hand','nitro','joy'])d.IN[key]=0;}
