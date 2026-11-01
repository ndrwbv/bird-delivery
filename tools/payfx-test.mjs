/* Frame-driven common payment keeps its own queue lease under slow rendering. */
import assert from 'node:assert/strict';
let now=1000,serial=0;const timers=new Map();
globalThis.performance={now:()=>now};
globalThis.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;};
globalThis.clearTimeout=id=>timers.delete(id);
const Q=await import('../src/game/notifyq.js'),P=await import('../src/game/payfx.js');
let phase='ride',paid=0;
Q.init({phase:()=>phase});
const el={hidden:true,offsetWidth:1,classList:{add(){},remove(){}},getAnimations:()=>[]};
function tick(wall,game){now+=wall;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}P.step(game);}
Q.push({kind:'pay',manual:true,show:it=>P.show({el,bits:[],target:()=>null,touch:()=>Q.touch(it),ready:()=>phase==='ride'&&Q.showing()==='pay',done:()=>{paid++;Q.done(it);}}),hide:()=>P.hide()});
for(let i=0;i<42;i++)tick(1000,.05);
assert.equal(Q.showing(),'pay');assert.equal(paid,0);assert(P.DEBUG.active.t>2);
phase='wait';const frozen=P.DEBUG.active.t;
for(let i=0;i<4;i++)tick(15000,.05);
assert.equal(P.DEBUG.active.t,frozen);assert.equal(Q.showing(),'pay');
phase='ride';for(let i=0;i<8;i++)tick(1000,.05);
assert.equal(paid,1);assert.equal(P.DEBUG.active,null);assert.equal(Q.showing(),'');assert(el.hidden);
for(let i=0;i<4;i++)tick(1000,.1);assert.equal(paid,1);
P.show({el,bits:[],target:()=>null,done:()=>paid++});P.hide();tick(1000,5);assert.equal(paid,1);
console.log(JSON.stringify({ok:true,cases:3,slowWallSeconds:42,pauseWallSeconds:60,paid}));
