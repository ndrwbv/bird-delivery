import assert from 'node:assert/strict';
import {snapshotAddressInitial17b} from '../src/game/addressinput17b.js';
let checks=0;const test=(name,fn)=>{fn();checks++;};
const carKeys=['dlv-car-owned','dlv-car-cur','dlv-car-up','dlv-car-L','dlv-car-paint','dlv-car-eng'];
function input(){return{
 phase:'before-city-syncBuild',at:1.25,mapId:'seversk',mode:'steam',adult:true,career:true,intro:false,editor:false,language:'ru',
 season:{value:2.5,forced:false,saved:null},donation:{trashRaw:0,trashGoal:480000,trashFraction:0},district:{current:0,opened:8,city:false},
 car:{id:'semerka',inputs:{'dlv-car-owned':['semerka'],'dlv-car-cur':'semerka','dlv-car-up':{semerka:{armor:1,engine:0}},'dlv-car-L':null,'dlv-car-paint':{semerka:'#abc123',_v:2},'dlv-car-eng':{semerka:{c:100,r:100,km:-0,n:0}}}},
 graphics:{preset:'high',device:'deck'},ordinary:{provider:'edl-owned-fnv1a-mulberry32-v1',ordinaryAtImport:true,hookOwned:true,baseSeed:0x5EED},
};}
function frozen(value,seen=new WeakSet()){
 if(value===null||typeof value!=='object'||seen.has(value))return;seen.add(value);assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))frozen(child,seen);
}
test('all nested snapshot objects/arrays frozen and raw six input keys retain order',()=>{const raw=input(),copy=snapshotAddressInitial17b(raw);frozen(copy);assert.deepEqual(Object.keys(copy.car.inputs),carKeys);assert.deepEqual(copy,raw);});
test('live Store arrays/objects stay mutable and unaliased',()=>{const raw=input(),copy=snapshotAddressInitial17b(raw);for(const key of carKeys){if(raw.car.inputs[key]&&typeof raw.car.inputs[key]==='object'){assert.notEqual(copy.car.inputs[key],raw.car.inputs[key]);assert.equal(Object.isFrozen(raw.car.inputs[key]),false);}}raw.car.inputs['dlv-car-owned'].push('other');raw.car.inputs['dlv-car-up'].semerka.armor=2;assert.equal(copy.car.inputs['dlv-car-owned'].length,1);assert.equal(copy.car.inputs['dlv-car-up'].semerka.armor,1);});
test('frozen observation does not accept a write',()=>{const raw=input(),copy=snapshotAddressInitial17b(raw);assert.throws(()=>copy.car.inputs['dlv-car-owned'].push('other'),TypeError);assert.throws(()=>copy.season.value=.5,TypeError);assert.equal(Object.isFrozen(raw.season),false);});
test('native clone keeps exact Float64 and signed zero without JSON coercion',()=>{const raw=input();raw.season.value=0.5000000000000001;const copy=snapshotAddressInitial17b(raw);assert.equal(copy.season.value,raw.season.value);assert.equal(Object.is(copy.car.inputs['dlv-car-eng'].semerka.km,-0),true);});
test('shape rejects unknown root fields',()=>{const raw=input();raw.precleanHash='guessed';assert.throws(()=>snapshotAddressInitial17b(raw),/ROOT_FIELDS/);assert.equal(Object.isFrozen(raw),false);});
test('raw car keys missing or reordered are rejected',()=>{const raw=input();delete raw.car.inputs['dlv-car-cur'];assert.throws(()=>snapshotAddressInitial17b(raw),/CAR_INPUT_FIELDS/);const swapped=input();swapped.car.inputs=Object.fromEntries([...Object.entries(swapped.car.inputs)].reverse());assert.throws(()=>snapshotAddressInitial17b(swapped),/CAR_INPUT_ORDER/);});
test('nonplain mutable containers cannot masquerade as frozen data',()=>{const raw=input();raw.car.inputs['dlv-car-up']=new Map([['semerka',{armor:1}]]);assert.throws(()=>snapshotAddressInitial17b(raw),/PLAIN_DATA/);assert.equal(Object.isFrozen(raw.car.inputs['dlv-car-up']),false);});
test('capture uses no RNG, Date or IDs',()=>{const random=Math.random,date=Date.now;try{Math.random=()=>assert.fail('RNG called');Date.now=()=>assert.fail('Date called');snapshotAddressInitial17b(input());}finally{Math.random=random;Date.now=date;}});
console.log(JSON.stringify({ok:true,checks,scope:'owned readonly diagnostic inputs; no game run'}));
