/* №18: настоящие ORD.payStop и game.checkArrival, фиксированные чаевые, без езды/браузера.
   npm run probe -- --mode=steam --size=deck --q='gfx=high&gfxdev=deck' --eval=tools/probe-checks/delivery-payment.js --max=0 --errors
   Геометрию/последовательность коробки проверяет delivery-sequence; здесь финансовые ветки. */
await onShift(); autopilot(false);
await until(() => d.ORD && !d.LATE.busy(), 90000);
d.setPause(true);
const S=d.S,O=d.ORD,E=d.ECON,U=d.car.userData,N=window.__NQ;
const out={fail:[],calculations:[],arrivals:[],messages:[],bundle:[]},check=(v,s)=>{if(!v)out.fail.push(s);};
const original={tips:{...E.TIPS},pace:d.DIST.pace().id,hp:S.hp,hpMax:S.hpMax,rear:U.rear,lost:U.lost,order:S.order,target:S.target,state:S.state,free:S.free,freeRun:S.freeRun};
function isolatePresentation(){
 if(typeof d.HANDOFF?.cancel!=='function')throw Error('№18 requires d.HANDOFF.cancel() to isolate artificial fixtures');
 d.HANDOFF.cancel();
 check(!d.HANDOFF.current,'previous artificial presentation was not cancelled');
}
E.TIPS.CHANCE=2;E.TIPS.AMOUNT=[.2,.2];E.TIPS.RICH_AMOUNT=[.2,.2];d.DIST.setPace('normal');
S.free=false;S.freeRun=false;S.lunch=null;
let serial=0;
function wear(kind){
 S.hpMax=7;S.hp=7;U.rear={...(original.rear||{}),st:0};U.lost={...(original.lost||{}),trunk:false,bumperR:false};
 if(kind==='ajar')U.rear.st=2;
 if(kind==='trunk')U.rear.st=3;
 if(kind==='bumper')U.lost.bumperR=true;
 if(kind==='hearts')S.hp=3;
}
function stop(extra={}){return {fee:1000,zone:'normal',key:(10000+serial++)+',10000',x:d.V.x,z:d.V.z,at:{x:d.V.x,z:d.V.z},peds:[],persons:[],arrived:true,...extra};}
function order(st,extra={}){return{idx:0,kind:'solo',tut:false,stops:[st],ord:{type:'pizza',zone:'normal',fees:[1000]},...extra};}
function calc(label,{tier=0,onTime=true,damage='',...extra}={}){
 wear(damage);S.tips=0;const st=stop(extra),o=order(st),paid=O.payStop(o,st,onTime,tier);
 const row={label,paid,tips:S.tips,pay:st.pay};out.calculations.push(row);
 check(st.pay.bonus===0&&!(st.pay.doorAdd||st.pay.stairsAdd),label+': speed cash survived');
 check(Math.abs(paid-((onTime?1000:450)+st.pay.tip-(st.pay.stairsGop||0)))<.01,label+': amount does not match receipt');
 return row;
}
try{
 const warm=[0,1,2].map(tier=>calc('warm tier '+tier,{tier}));
 const base=warm[0].pay.tip;
 check(base>0&&warm.every(r=>r.paid===1000+base&&r.tips===base),'tier changes normal payment');
 const fast=calc('intercom and stairs fast',{tier:2,door:{ok:true,fast:true},stairs:{ok:true,fast:true}});
 check(fast.paid===warm[0].paid,'fast minigames change payment');
 const keep=calc('warm social tip',{talk:{kind:'keep'}});
 check(keep.pay.tip>base,'independent social tip disappeared');
 const none=calc('two tip cuts',{door:{self:true,tipKeep:false},stairs:{self:true,tipKeep:false}});
 check(none.paid===1000&&none.pay.tip===0,'tip cuts consume base fee');
 const gop=calc('existing gop payment',{stairs:{ok:true,fast:true,gop:'pay'}});
 check(gop.paid===1000+base-100&&gop.tips===base,'gop price or tip total changed');
 const ajar=calc('below cold threshold',{damage:'ajar'});
 const mildLoss=Math.round(base*.2/10)*10;
 check(!ajar.pay.cold&&ajar.pay.tip===base-mildLoss&&ajar.paid===1000+base-mildLoss,'k=.2 lost its old mild tip adjustment or was described as cold');
 const ajarKeep=calc('below cold threshold social tip',{damage:'ajar',talk:{kind:'keep'}});
 check(!ajarKeep.pay.cold&&ajarKeep.paid===keep.paid-mildLoss,'mild cooling incorrectly scales social tips');
 for(const damage of ['bumper','trunk','hearts'])for(const talk of [null,{kind:'keep'},{kind:'fun',win:true}]){
   const r=calc('cold '+damage+' '+(talk?.kind||'plain'),{damage,talk});
   check(r.pay.cold&&r.pay.tip===0&&!(r.pay.talkAdd||0)&&r.paid===1000,'cold pizza has guest tip');
 }
 const late=calc('late cold',{damage:'bumper',onTime:false,talk:{kind:'keep'}});
 check(late.paid===450&&late.pay.cold&&late.pay.tip===0,'late return lost cold state');
 // Independent completion bonus remains identical at every speed tier.
 for(const tier of [0,1,2]){
   const stops=[stop({pay:{late:false,tip:0,bonus:0}}),stop({pay:{late:false,tip:0,bonus:0}})];
   const o={idx:2,stops,ord:{type:'pizza',bundle:{},fees:[1000,1000]}};
   const wallet=d.wallet(),money=S.money;O.delivered(o,stops[1],true);
   const row={tier,money:S.money-money,wallet:d.wallet()-wallet};out.bundle.push(row);
   check(row.money===200&&row.wallet===200,'independent bundle bonus changed');
 }
 function arrival(label,{damage='',late=false,tut=false,freeRun=false,legacy=false,story=false}={}){
   isolatePresentation();                         // only BEFORE a new order fixture, never between repeated arrivals
   wear(damage);d.CHAT.clear();S.paused=true;S.ride=false;S.free=false;S.freeRun=freeRun;
   const st=stop(),o=order(st,{tut});if(legacy)delete o.ord;
   if(story)o.ord.story={storyId:'payment-fixture',interiorDone:true};
   S.order=o;S.target={x:d.V.x,z:d.V.z};S.state='drive';S.time=late?-1:40;S.timeMax=100;S.fee=100;S.orders++;
   d.V.vx=d.V.vz=0;const wallet=d.wallet(),money=S.money,tips=S.tips;
   d.checkArrival(0);
   const row={label,paid:S.money-money,wallet:d.wallet()-wallet,tips:S.tips-tips,pay:st.pay,stop:st,order:o};
   check(!!st.pay,label+': actual arrival was not paid');
   if(st.pay){
     check(row.wallet===(freeRun?0:row.paid),label+': wallet differs from actual payment');
     check(st.pay.bonus===0,label+': speed payment in game fallback');
     const m=S.money,w=d.wallet();d.checkArrival(0);check(S.money===m&&d.wallet()===w,label+': repeat arrival pays twice');
   }
   out.arrivals.push({label,paid:row.paid,wallet:row.wallet,tips:row.tips,pay:st.pay});
   S.order=null;S.target=null;S.state='drive';S.time=100;S.timeMax=100;
   return row;
 }
 // First test notifications without a backlog of payment cards. Cold late owns its single fine callback.
 for(const scenario of [{label:'cold late SMS',damage:'bumper',late:true},{label:'warm late SMS',late:true},{label:'cold with zero random tip',damage:'hearts',zero:true}]){
   if(scenario.zero)E.TIPS.CHANCE=-2;
   const before=N.LOG.length,r=arrival(scenario.label,scenario),cold=!!r.pay?.cold;
   const money=S.money,wallet=d.wallet(),fine=scenario.late?E.lateFine(r.pay.fee):0;
   d.setPause(false);
   const matched=()=>N.LOG.slice(before).filter(e=>e.kind==='boss'&&e.act==='show'&&(cold?/холодную пиццу|cold pizza/i.test(e.text):/Ты опоздал|You were late/i.test(e.text)));
   check(await until(()=>matched().length>0,20000),scenario.label+': message missing');
   await run(1);
   const matches=matched(),sms=matches.map(e=>e.text);
   check(matches.length===1,scenario.label+': duplicate manager SMS');
   check(S.money===money-fine&&d.wallet()===wallet-fine,scenario.label+': late fine not charged once');
   if(!cold)check(!N.LOG.slice(before).some(e=>e.kind==='boss'&&/пицца остыла|cold pizza|pizza got cold/i.test(e.text)),scenario.label+': false cold complaint');
   if(cold)check(r.stop.coldTold===true&&r.pay.tip===0,scenario.label+': cold not tied to paid stop');
   out.messages.push({label:scenario.label,cold,sms,fine,walletDelta:d.wallet()-wallet});
   d.setPause(true);d.CHAT.clear();E.TIPS.CHANCE=2;
 }
 for(const [label,options]of[['ordinary',{}],['ord+tut',{tut:true}],['ord+freeRun',{freeRun:true}],['legacy no ord',{legacy:true}],['paid story',{story:true}],['cold paid story',{story:true,damage:'bumper'}]]){
   const r=arrival(label,options);
   if(!options.legacy)check(r.pay?.fee===1000&&r.paid===1000+(r.pay?.tip||0),label+': ORD payment overwritten by S.fee share');
   else check(r.pay?.fee===100&&r.paid===100+(r.pay?.tip||0),label+': legacy speed survived');
 }
 // Staff has its own existing tariff and bypasses the pizza calculator entirely.
 isolatePresentation();
 wear('bumper');S.freeRun=false;S.state='drive';S.target={x:d.V.x,z:d.V.z};
 const staff=stop({persons:[original.order.stops[0].persons[0]||d.makePerson({seed:0x18})]}),next=stop({at:{x:d.V.x+50,z:d.V.z}});
 const staffOrder=order(staff,{stops:[staff,next],ord:{type:'staff',zone:'normal'}});S.order=staffOrder;
 const staffWallet=d.wallet(),staffMoney=S.money,staffPay=O.STAFF.pay;
 d.checkArrival(0);
 check(S.money-staffMoney===E.ORDERS.STAFF_PAY&&d.wallet()-staffWallet===E.ORDERS.STAFF_PAY&&!staff.pay,'staff tariff changed or pizza calculator leaked into staff');
 out.arrivals.push({label:'dedicated staff',paid:S.money-staffMoney,wallet:d.wallet()-staffWallet});O.STAFF.pay=staffPay;
}finally{
 isolatePresentation();
 Object.assign(E.TIPS,original.tips);d.DIST.setPace(original.pace);U.rear=original.rear;U.lost=original.lost;
 Object.assign(S,{hp:original.hp,hpMax:original.hpMax,order:original.order,target:original.target,state:original.state,free:original.free,freeRun:original.freeRun});
 d.setPause(true);
}
out.crash=d.crashlog.entries();check(!out.crash.length,'crash log is not empty');out.ok=!out.fail.length;
if(!out.ok)throw Error(JSON.stringify(out));
return out;
