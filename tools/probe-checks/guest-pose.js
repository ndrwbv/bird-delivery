/* №0п121: synthetic one-stop order through the real checkArrival → handOver → takeBox path.
   npm run probe -- --mode=steam --size=deck --cpu=3 --q='gfx=high&gfxdev=deck'
     --seed=7 --eval=tools/probe-checks/guest-pose.js --max=0 --errors
   Pauses only while capturing a close view; four 1280×800 images go to /tmp/bird-guestpose-*.png.
   Numeric model/season checks: node tools/guest-pose-test.mjs. Not a physical Steam Deck test. */
await onShift();autopilot(false);d.SBX.god=true;d.SBX.noStall=true;
const T=d.THREE;
const p=d.PEOPLE.filter(p=>!p.dead&&!p.guest&&!p.fall&&!p.surf&&p.grp&&p.person&&!d.inHouse(p.x,p.z,.5)).sort((a,b)=>Math.hypot(a.x-d.V.x,a.z-d.V.z)-Math.hypot(b.x-d.V.x,b.z-d.V.z))[0];
if(!p)throw Error('no guest');
p.guest=true;p.served=0;p.sitting=0;p.sitAt=p.waitAt=p.after=p.idle=p.panic=p.fall=p.dg=null;p.party=false;p.inside=null;p.shock=0;
d.V.x=p.x+5;d.V.z=p.z+4;d.V.vx=d.V.vz=0;d.V.y=d.groundH(d.V.x,d.V.z);d.V.h=Math.atan2(p.x-d.V.x,p.z-d.V.z);
const st={peds:[p],persons:[p.person],boxes:1,at:{x:p.x,z:p.z},addr:'probe',reach:6};
d.S.ride=true;d.S.order={stops:[st],idx:0,tut:true,kind:'solo'};d.S.state='drive';d.S.target={x:p.x+1000,z:p.z};d.S.time=d.S.timeMax=100;d.S.fee=100;
const hands=()=>{const q=p.grp.userData.skin.userData.q;if(!q)return null;return ['handL','handR'].map(k=>{const v=new T.Vector3();q.bones[q.F.J[k]].getWorldPosition(v);return {x:+v.x.toFixed(3),y:+v.y.toFixed(3),z:+v.z.toFixed(3)};});};
async function snap(name){d.S.paused=true;d.humanLod();const g=p.grp;d.cam.position.set(g.position.x+3.7,g.position.y+2.0,g.position.z+4.3);d.cam.lookAt(g.position.x,g.position.y+1.0,g.position.z);d.cam.fov=38;d.cam.updateProjectionMatrix();d.renderer.render(d.scene,d.cam);const h=hands();await shot('/tmp/bird-guestpose-'+name+'.png');d.S.paused=false;return h;}
await run(1.2);const waiting=await snap('waiting');
d.S.target={x:d.V.x,z:d.V.z};
await until(()=>p.grp.userData.qReceive,5000);if(!p.grp.userData.qReceive)throw Error('no reach');
await run(.25);const reaching=await snap('reaching');
await until(()=>p.served,6000);if(!p.served)throw Error('no catch');const caught=await snap('caught');
await run(.7);const lowered=await snap('lowered');
const q=p.grp.userData.skin.userData.q;
const out={waiting,reaching,caught,lowered,receive:q.receive,rest:q.rest,served:p.served,holding:!!p.hold,money:d.S.money,state:d.S.state,crash:d.crashlog.entries()};
if(!waiting||!lowered||!p.hold||out.crash.length)throw Error(JSON.stringify(out));
return out;
