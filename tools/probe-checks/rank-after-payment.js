/* №13а: actual checkArrival → cash settlement → temporary courier sheet.
   Steam Deck HIGH CPU×3 emulation, muted by probe. */
await onShift(); autopilot(false); d.SBX.god=true; d.SBX.noStall=true;
await until(()=>!d.LATE.busy(),90000); await run(6);
tp(d.PIZZA.x+180,d.PIZZA.z+180);       // do not immediately enter the next brief while parked at the base
const H=d.HANDOFF,R=d.CREWRANK,S=d.S,N=window.__NQ;
const out={fail:[],timing:{},screens:[]},check=(v,s)=>{if(!v)out.fail.push(s);};
const visible=()=>{const e=document.querySelector('#rank-sheet');return !!e&&!e.hidden&&e.getClientRects().length>0;};
const rows=()=>[...document.querySelectorAll('#rank-sheet .rk-row')];
const settle=async()=>{check(await until(()=>!H.current,15000),'handover did not finish');};
function start(){
 d.setPause(true);H.cancel();d.CHAT.clear();S.ride=false;S.free=false;S.freeRun=false;S.hp=S.hpMax;
 d.V.vx=d.V.vz=0;
 const st={fee:1000,zone:'normal',key:'rank-'+Math.random(),x:d.V.x,z:d.V.z,at:{x:d.V.x,z:d.V.z},peds:[],persons:[],arrived:true,boxes:1};
 Object.assign(S,{order:{idx:0,kind:'solo',tut:false,stops:[st],ord:{type:'pizza',zone:'normal',fees:[1000]}},state:'drive',target:{x:d.V.x,z:d.V.z},time:100,timeMax:100,fee:1000,orders:S.orders+1});
 d.checkArrival(0);check(!!H.current,'actual arrival did not start presentation');d.setPause(false);
}
check(d.RIVALS.length>0,'ranking needs actual shift colleagues');
start();
check(await until(()=>H.current?.phase==='pay',15000),'cash phase missing');
check(!visible()&&R.SH.st==='idle','rank scheduled before cash');
await run(.6);check(H.current?.phase==='pay'&&!visible()&&R.SH.st==='idle','rank overlaps pile');
await settle();out.timing.afterCash=R.SH.t;
check(R.SH.st==='wait'&&!visible(),'settled cash must schedule delayed rank');
await run(.5);check(!visible(),'rank appeared without short delay');
check(await until(visible,6000),'rank never appeared');
check(rows().length>=2&&rows().some(e=>e.classList.contains('me')),'empty rank or missing player');
check(!document.querySelector('#rivals'),'permanent place returned');
const sheet=document.querySelector('#rank-sheet'),hold=R.SH.hold;
out.timing.hold=hold;check(hold===4.2,'normal readable duration changed');
await shot('/tmp/bird-rank-after-payment.png');out.screens.push('/tmp/bird-rank-after-payment.png');
await run(1.8);check(visible(),'rank vanished before it can be read');
check(await until(()=>!visible(),6000),'rank did not disappear automatically');
check(R.SH.st==='idle','rank shrinks into permanent line instead of ending');
// A real second completion queues the table, then pause discards it before it appears.
start();await settle();check(R.SH.st==='wait','second completion was not queued');
d.setPause(true);check(!visible()&&R.SH.st==='idle','pause did not cancel delayed rank');
d.setPause(false);await run(1.5);check(!visible(),'old rank revived after pause');
// Open map while a real third table is visible; it must not return after closing.
start();await settle();check(await until(visible,6000),'third table absent');
d.setFullMap(true);check(!visible()&&R.SH.st==='idle','map did not hide table immediately');
d.setFullMap(false);await run(1.5);check(!visible(),'old table revived after map');
start();await settle();check(await until(visible,6000),'last table absent');
d.endShift('смена окончена');check(!visible()&&R.SH.st==='idle','end screen retained rank');
await run(.5);out.crash=d.crashlog.entries();check(!out.crash.length,'crash log not empty');
out.ok=!out.fail.length;if(!out.ok)throw Error(JSON.stringify(out));return out;
