/* №0п120: actual arrival/box/wrist/cash path. Steam Deck HIGH, CPU×3 emulation (not physical hardware).
   npm run probe -- --mode=steam --size=deck --cpu=3 --q='gfx=high&gfxdev=deck' --seed=7
     --eval=tools/probe-checks/delivery-sequence.js --max=0 --errors
   Images in /tmp are full-size render captures; no audio. */
await onShift(); autopilot(false); d.SBX.god = true; d.SBX.noStall = true;
await until(() => !d.LATE.busy(), 90000); await run(6);
const H=d.HANDOFF, S=d.S, T=d.THREE, N=window.__NQ;
const out={fail:[],deliveries:[],pause:[],shots:[]};
const check=(v,s)=>{if(!v)out.fail.push(s);};
const untilPhase=async phase=>{const ok=await until(()=>H.current?.phase===phase,12000);check(ok,'phase missing: '+phase);return ok;};
const originalCar=d.car.userData.careerId;
const chance=d.ECON.TIPS.CHANCE;d.ECON.TIPS.CHANCE=-2;
let serial=0;
function ped(){
 const p=d.PEOPLE.filter(p=>!p.dead&&!p.guest&&!p.fall&&!p.surf&&p.grp&&p.person&&!d.inHouse(p.x,p.z,.5)).sort((a,b)=>Math.hypot(a.x-d.V.x,a.z-d.V.z)-Math.hypot(b.x-d.V.x,b.z-d.V.z))[0];
 if(!p)throw Error('no guest');
 Object.assign(p,{guest:true,served:0,sitting:0,sitAt:null,waitAt:null,after:null,idle:null,panic:null,fall:null,dg:null,party:false,inside:null,shock:0});
 p.grp.userData.qReceive=false;p.grp.rotation.y=Math.atan2(d.V.x-p.x,d.V.z-p.z);
 return p;
}
function park(p){
 d.V.x=p.x+5;d.V.z=p.z+4;d.V.vx=d.V.vz=0;d.V.y=d.groundH(d.V.x,d.V.z);d.V.h=Math.atan2(p.x-d.V.x,p.z-d.V.z);
 d.car.position.set(d.V.x,d.V.y,d.V.z);d.car.rotation.y=d.V.h;d.car.updateMatrixWorld(true);
}
function stop(p,extra={}){return{fee:1000,zone:'normal',key:'handover-'+serial++,x:p.x,z:p.z,at:{x:p.x,z:p.z},peds:[p],persons:[p.person],boxes:1,addr:'handover-fixture',reach:7,arrived:true,...extra};}
function start(st,more=[],bundle=false){
 d.setPause(true);H.cancel();d.CHAT.clear();S.ride=false;S.free=false;S.freeRun=false;S.hp=S.hpMax;
 const o={idx:0,kind:'solo',tut:true,stops:[st,...more],ord:{type:'pizza',zone:'normal',fees:[1000,...more.map(()=>1000)],...(bundle?{bundle:{}}:{})}};
 Object.assign(S,{order:o,state:'drive',target:{x:d.V.x,z:d.V.z},time:100,timeMax:100,fee:1000,orders:S.orders+1});
 const money=S.money,wallet=d.wallet(),paid=H.ST.paid,started=H.ST.started;
 d.checkArrival(0);
 const record={id:H.current?.id,paid:0,money:S.money-money,wallet:d.wallet()-wallet,car:d.car.userData.careerId};
 check(record.money===1000+(st.pay?.tip||0)&&record.wallet===record.money,'authoritative single payment');
 const after=S.money,wafter=d.wallet(),state=S.state;
 S.state='drive';d.checkArrival(0);S.state=state;
 check(S.money===after&&d.wallet()===wafter&&H.ST.started===started+1,'repeat entry duplicates payment/box');
 d.setPause(false);
 return{record,money:S.money,wallet:d.wallet(),paid};
}
async function snap(name){await shot('/tmp/bird-handover-'+name+'.png');out.shots.push('/tmp/bird-handover-'+name+'.png');}
async function pauseAt(label){
 d.setPause(true);const h=JSON.stringify(H.current),p=JSON.stringify(d.PAYVIS.active),f=JSON.stringify(H.flights),m=S.money;
 await run(.45);check(JSON.stringify(H.current)===h&&JSON.stringify(d.PAYVIS.active)===p&&JSON.stringify(H.flights)===f&&S.money===m,'pause advances '+label);
 out.pause.push(label);d.setPause(false);
}
async function complete(r){
 check(await until(()=>H.ST.paid===r.paid+1,15000),'payment not visually settled');await run(.4);
 check(S.money===r.money&&d.wallet()===r.wallet,'presentation changes ledger');check(d.SC.pend===0,'visual reserve not released');
 check(!document.querySelector('#payfx:not([hidden])')&&!d.PAYVIS.active,'cash visual remains');
 const events=H.ST.events.filter(e=>e.id===r.record.id).map(e=>e.phase);
 check(events.join(',')==='pin,trunk,flight,lower,pay,settled','wrong sequence '+events.join(','));
 r.record.phases=events;r.record.paid=H.ST.paid-r.paid;out.deliveries.push(r.record);
}
try{
 const p=ped();park(p);const r=start(stop(p));
 check(await until(()=>H.current?.phase==='pin'&&H.current.t>.05,3000),'pin fade frame');
 check(d.car.userData.trunk.want===0,'trunk opens before pin fades');
 await pauseAt('pin');
 if(await untilPhase('flight')){
  check(await until(()=>H.flights.length>0,3000),'no real box flight');
  const f=H.flights[0],tr=d.car.userData.trunk,v=d.car.localToWorld(new T.Vector3(0,tr.py,tr.pz));
  check(f&&Math.hypot(f.from.x-v.x,f.from.y-v.y,f.from.z-v.z)<.04,'flight does not start at actual trunk');
  check(p.grp.userData.qReceive&&!p.served,'customer must reach before catch');
  check(d.SC.flying===0&&d.SC.pend===r.record.money,'second independent money stream');
  r.record.from=f?.from;r.record.catchTarget=f?.target;await snap('flight');await pauseAt('flight');
 }
 await untilPhase('lower');check(p.served===1&&!!p.hold&&!p.grp.userData.qReceive,'catch does not lower arms');await snap('caught');
 await untilPhase('pay');check(!document.querySelector('.sc-fly'),'independent shiftcash flyers during pay');
 check(await until(()=>d.PAYVIS.active?.t>.35,6000),'money pile not shown');await snap('cash');await pauseAt('cash');
 check(await until(()=>d.PAYVIS.active?.flying,6000),'same pile does not fly');
 const target=d.SC.el.getBoundingClientRect(),bits=[...document.querySelectorAll('#payfx .pf-pile i:not(.x)')];
 check(target.width>0&&bits.every(b=>b.style.getPropertyValue('--fx')&&b.style.getPropertyValue('--fy')),'cash has no visible shift-money target');
 await complete(r);
 // Different body geometry: the source must follow the selected car's actual trunk anchor.
 d.setPause(true);d.carlab.use('matiz');await run(.1);
 const p2=ped();park(p2);const r2=start(stop(p2));await untilPhase('flight');await until(()=>H.flights.length,3000);
 const f2=H.flights[0],door2=d.car.userData.rdoor,closed2=door2?.p;
 const v2=closed2&&d.car.localToWorld(new T.Vector3(closed2.x,closed2.y,closed2.z+.17));
 check(!!door2&&door2.want>0&&door2.a>.3,'alternate hatch rear door did not open');
 check(f2&&v2&&Math.hypot(f2.from.x-v2.x,f2.from.y-v2.y,f2.from.z-v2.z)<.04,'alternate car trunk is incorrect');r2.record.from=f2?.from;await complete(r2);
 // A second address remains unpaid while the first is being presented, then pays once.
 const a=ped(),b=ped();park(a);const second=stop(b);second.at={x:d.V.x+80,z:d.V.z+80};
 const multi=start(stop(a),[second],true);const m=S.money;await run(.4);check(S.money===m&&S.order.idx===1,'next address paid during previous presentation');await complete(multi);
 d.setPause(true);park(b);second.at={x:d.V.x,z:d.V.z};S.target={...second.at};S.state='drive';
 const m2=S.money,w2=d.wallet(),paid2=H.ST.paid;d.checkArrival(0);const r3={record:{id:H.current?.id,car:d.car.userData.careerId,money:S.money-m2,wallet:d.wallet()-w2},money:S.money,wallet:d.wallet(),paid:paid2};
 check(r3.record.money===1000+(second.pay?.tip||0)+Math.round(2000*d.ECON.BUNDLE.ALL_BONUS/10)*10&&r3.record.wallet===r3.record.money,'second address amount');d.setPause(false);await untilPhase('pay');
 check(d.SC.flying===0&&d.SC.pend===r3.record.money,'bundle bonus creates competing flyers or misses reserve');
 check(await until(()=>document.querySelector('#payfx:not([hidden]) .pf-chk')?.textContent.includes('премия за развоз'),6000),'bundle bonus is missing from same receipt');
 await complete(r3);
 // A cancelled in-flight delivery must never give the old client a box or emit onPaid later.
 const c=ped();park(c);const aborted=start(stop(c));await untilPhase('flight');await until(()=>H.flights.length,3000);
 const cancels=H.ST.cancelled,paidBefore=H.ST.paid;H.cancel();await run(1.2);
 check(!H.current&&!H.flights.length&&!c.served&&!c.grp.userData.qReceive&&H.ST.cancelled===cancels+1&&H.ST.paid===paidBefore,'old flight/callback survived cancellation');
 check(S.money===aborted.money&&d.wallet()===aborted.wallet&&d.SC.pend===0,'cancellation lost already earned money');
 out.cancelled=true;
}finally{H.cancel();d.ECON.TIPS.CHANCE=chance;if(originalCar)d.carlab.use(originalCar);d.setPause(true);}
out.crash=d.crashlog.entries();check(!out.crash.length,'crash log not empty');out.ok=!out.fail.length;
if(!out.ok)throw Error(JSON.stringify(out));return out;
