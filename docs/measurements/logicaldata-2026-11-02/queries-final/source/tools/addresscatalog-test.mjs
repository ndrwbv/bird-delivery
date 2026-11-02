import assert from 'node:assert/strict';
import {createAddressCatalogRecorder} from '../src/game/addresscatalog.js';

let checks=0;const test=fn=>{fn();checks++;};
const house=(x=1)=>({x,z:2,mx:3,mz:4,addr:'улица, 7',name:'',lv:5});
const setup=(buildings=[{id:2**40},{id:'7-1'},{}],prefix=[[10,20,1,0],[30,40,0,1]])=>{
 const targets={buildings,houses:[],generatedDoors:[],entrances:prefix,spots:[]};return{targets,rec:createAddressCatalogRecorder(targets)};
};
const fail=(fn,code)=>assert.throws(fn,new RegExp('addresscatalog:'+code));
const oldRandom=Math.random;Math.random=()=>assert.fail('recorder must not consume RNG');
try{
 test(()=>{
  const {targets:t,rec:r}=setup(),b=t.buildings,prefix=t.entrances.slice(),h0=house(-0),h1=house(11),d0=[5,6,1,0],d1=[7,8,0,1],d2=[9,10,-1,0];
  const legacy={houses:[],generatedDoors:[],entrances:prefix.slice(),spots:[]};
  // Frozen legacy transcript: per-house doors precede its HOUSES push, one house emits several doors.
  legacy.generatedDoors.push(d0);assert.equal(r.acceptDoor(b[0],d0,true),d0);
  legacy.generatedDoors.push(d1);r.acceptDoor(b[0],d1,false);
  legacy.houses.push(h0);assert.equal(r.acceptHouse(b[0],h0),h0);
  legacy.generatedDoors.push(d2);r.acceptDoor(b[1],d2,false);legacy.houses.push(h1);r.acceptHouse(b[1],h1);
  const osm=legacy.entrances.length;for(const e of legacy.generatedDoors)legacy.entrances.push(e);
  const calls=[],push=t.entrances.push;t.entrances.push=function(...args){calls.push(args);return push.apply(this,args);};
  assert.equal(r.mergeDoorsOnce(),osm);assert.deepEqual(calls,[[d0],[d1],[d2]]);delete t.entrances.push;
  for(let i=0;i<prefix.length;i++)assert.equal(t.entrances[i],prefix[i]);
  for(let i=0;i<t.generatedDoors.length;i++)assert.equal(t.entrances[osm+i],t.generatedDoors[i]);
  const s0={x:50,z:60},s1={x:70,z:80};legacy.spots.push(s0,s1);t.spots.push(s0,s1);
  assert.equal(r.sealSpots(),2);assert.deepEqual({houses:t.houses,generatedDoors:t.generatedDoors,entrances:t.entrances,spots:t.spots},legacy);
  const v=r.snapshot();assert.equal(r.snapshot(),v);assert.equal(r.resolveBuilding(0),b[0]);assert.equal(r.resolveBuilding(1),b[1]);
  assert.deepEqual(v.houseLinks,[{building:0,sourceId:2**40},{building:1,sourceId:'7-1'}]);
  assert.deepEqual(v.doorLinks,[{building:0,sourceId:2**40,grand:true},{building:0,sourceId:2**40,grand:false},{building:1,sourceId:'7-1',grand:false}]);
  assert.equal(v.generatedDoors[0],v.entrances[osm]);assert.notEqual(v.generatedDoors[0],d0);assert.notEqual(v.houses[0],h0);assert.equal(d0.length,4);assert.equal(Object.hasOwn(d0,'grand'),false);assert.equal(Object.hasOwn(h0,'building'),false);
  assert.equal(Object.is(v.houses[0].x,-0),true);assert.equal(Object.isFrozen(h0),false);assert.equal(Object.isFrozen(d0),false);assert.throws(()=>v.spots.push({x:0,z:0}));assert.equal(r.cancel(),false);
 });
 test(()=>{const{rec:r}=setup([],[]);assert.equal(r.mergeDoorsOnce(),0);r.sealSpots();assert.deepEqual(r.snapshot().spots,[]);assert.equal(r.snapshot().buildingCount,0);});
 test(()=>{const{targets:t,rec:r}=setup([{}]);r.acceptHouse(t.buildings[0],house());r.mergeDoorsOnce();r.sealSpots();assert.equal(r.snapshot().houseLinks[0].sourceId,null);});
 test(()=>{const{targets:t,rec:r}=setup();const row=Object.freeze(house()),door=Object.freeze([1,2,0,1]);r.acceptDoor(t.buildings[0],door,false);r.acceptHouse(t.buildings[0],row);r.mergeDoorsOnce();r.sealSpots();assert.deepEqual(r.snapshot().generatedDoors[0],door);});
 test(()=>{const p=[1,2,0,1],{rec:r}=setup([],[p,p]);r.mergeDoorsOnce();r.sealSpots();assert.equal(r.snapshot().entrances[0],r.snapshot().entrances[1]);});
 test(()=>{const{targets:t,rec:r}=setup();fail(()=>r.acceptHouse({id:t.buildings[0].id},house()),'BUILDING_CHANGED');assert.equal(t.houses.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();t.buildings.reverse();fail(()=>r.mergeDoorsOnce(),'BUILDING_CHANGED');assert.equal(t.entrances.length,2);});
 test(()=>{const{targets:t,rec:r}=setup();t.buildings[0].id='changed';fail(()=>r.acceptDoor(t.buildings[0],[1,2,0,1],false),'BUILDING_CHANGED');assert.equal(t.generatedDoors.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();t.houses=[];fail(()=>r.acceptHouse(t.buildings[0],house()),'TARGET_CHANGED');});
 test(()=>{const{targets:t,rec:r}=setup();const b=t.buildings[0],h=house();r.acceptHouse(b,h);fail(()=>r.acceptHouse(b,house(2)),'DUPLICATE_HOUSE');fail(()=>r.acceptHouse(t.buildings[1],h),'DUPLICATE_HOUSE');assert.equal(t.houses.length,1);});
 test(()=>{const{targets:t,rec:r}=setup(),d=[1,2,0,1];r.acceptDoor(t.buildings[0],d,false);fail(()=>r.acceptDoor(t.buildings[1],d,true),'DUPLICATE_DOOR');assert.equal(t.generatedDoors.length,1);});
 test(()=>{const{targets:t,rec:r}=setup();fail(()=>r.acceptDoor(t.buildings[0],t.entrances[0],false),'DUPLICATE_DOOR');assert.equal(t.generatedDoors.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();r.acceptDoor(t.buildings[0],[1,2,0,1],false);r.acceptDoor(t.buildings[1],[1,2,0,1],true);r.mergeDoorsOnce();r.sealSpots();assert.equal(r.snapshot().generatedDoors.length,2);});
 test(()=>{const{targets:t,rec:r}=setup();fail(()=>r.acceptDoor(t.buildings[0],[1,2,0,1],1),'GRAND');fail(()=>r.acceptDoor(t.buildings[0],[1,2,0,1,1],true),'DOOR_ROW');assert.equal(t.generatedDoors.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();fail(()=>r.acceptHouse(t.buildings[0],{...house(),x:NaN}),'ROW_FIELD');assert.equal(t.houses.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();t.houses.push(house());fail(()=>r.mergeDoorsOnce(),'LIVE_COUNTS');assert.equal(t.entrances.length,2);});
 test(()=>{const{targets:t,rec:r}=setup();r.acceptDoor(t.buildings[0],[1,2,0,1],false);r.mergeDoorsOnce();const n=t.entrances.length;fail(()=>r.mergeDoorsOnce(),'COLLECT_PHASE');assert.equal(t.entrances.length,n);fail(()=>r.acceptHouse(t.buildings[0],house()),'COLLECT_PHASE');});
 test(()=>{const{rec:r}=setup();fail(()=>r.snapshot(),'SNAPSHOT_PHASE');fail(()=>r.sealSpots(),'SEAL_PHASE');r.mergeDoorsOnce();fail(()=>r.snapshot(),'SNAPSHOT_PHASE');r.sealSpots();fail(()=>r.sealSpots(),'SEAL_PHASE');});
 for(const merged of [false,true])test(()=>{const{targets:t,rec:r}=setup();const h=house(),d=[1,2,0,1];r.acceptHouse(t.buildings[0],h);r.acceptDoor(t.buildings[0],d,false);if(merged)r.mergeDoorsOnce();assert.equal(r.cancel(),true);assert.equal(r.cancel(),false);assert.equal(t.houses[0],h);assert.equal(t.generatedDoors[0],d);assert.equal(t.entrances.length,merged?3:2);fail(()=>r.snapshot(),'CANCELLED');fail(()=>r.sealSpots(),'CANCELLED');fail(()=>r.mergeDoorsOnce(),'CANCELLED');fail(()=>r.acceptDoor(t.buildings[0],[3,4,0,1],false),'CANCELLED');});
 test(()=>{const{targets:t,rec:r}=setup();t.entrances[0]=[10,20,1,0];fail(()=>r.mergeDoorsOnce(),'PREFIX_CHANGED');assert.equal(t.generatedDoors.length,0);});
 test(()=>{const{targets:t,rec:r}=setup();t.spots.push({x:1,z:2});fail(()=>r.mergeDoorsOnce(),'LIVE_COUNTS');});
 test(()=>{const{targets:t,rec:r}=setup();r.acceptDoor(t.buildings[0],[1,2,0,1],false);r.mergeDoorsOnce();t.entrances[2]=[1,2,0,1];fail(()=>r.sealSpots(),'DOOR_ALIAS_CHANGED');});
 test(()=>{const{targets:t,rec:r}=setup();r.mergeDoorsOnce();const s={x:1,z:2};t.spots.push(s,s);fail(()=>r.sealSpots(),'DUPLICATE_SPOT');fail(()=>r.snapshot(),'SNAPSHOT_PHASE');});
 for(const kind of ['spot','house','prefix'])test(()=>{const{targets:t,rec:r}=setup();r.acceptHouse(t.buildings[0],house());r.mergeDoorsOnce();t.spots.push({x:1,z:2});r.sealSpots();if(kind==='spot')t.spots[0].x=99;if(kind==='house')t.houses[0].addr='changed';if(kind==='prefix')t.entrances[0][0]=99;fail(()=>r.snapshot(),'SEALED_CHANGED');});
 test(()=>{const b={};assert.throws(()=>setup([b,b]),/BUILDINGS/);assert.throws(()=>setup([{id:true}]),/SOURCE_ID/);});
 test(()=>{const{rec:r}=setup();fail(()=>r.resolveBuilding(-1),'BUILDING_INDEX');fail(()=>r.resolveBuilding(3),'BUILDING_INDEX');});
}finally{Math.random=oldRandom;}
console.log(JSON.stringify({ok:true,checks,legacyTranscript:true,originalAliases:true,grandSeparate:true,ordinalRawId:true,noEarlySnapshot:true,noWorldOrRNG:true,gameIntegration:false}));
