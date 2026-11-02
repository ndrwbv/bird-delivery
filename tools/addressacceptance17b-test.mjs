/* Read-only production-query observer: actual snapshots stay owned, frozen and detached. */
import assert from 'node:assert/strict';
import {publishAddressAcceptance17b} from '../src/game/addressacceptance17b.js';
let checks=0;const test=(name,fn)=>{fn();checks++;};
function fixture(){
 const target={},state={value:-0,missing:undefined,nested:{text:'Женя',rows:[[1,2],null]}},calls={capture:0,details:0,report:0,queries:0,crashes:0};
 const door=[1,2,-0,1],query={generatedDoors:[door],entrances:[[0,0,1,0],door]},errors=[];
 const opts={target,host:{environment:{productionQuery:true}},read:()=>{calls.capture++;return state;},details:()=>{calls.details++;return{source:'actual',data:state};},report:()=>{calls.report++;return null;},queries:()=>{calls.queries++;return query;},crashes:()=>{calls.crashes++;return errors;}};
 return{target,state,calls,query,errors,opts};
}
const frozen=(value,seen=new Set())=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))frozen(child,seen);};
test('disabled mode never accesses target or invokes callbacks',()=>{
 for(const host of [undefined,null,{}, {environment:{}},{environment:{productionQuery:false}},{environment:{productionQuery:'true'}}]){
  let touches=0;const target=new Proxy({},{defineProperty(){touches++;assert.fail('disabled target write');}}),bad=()=>assert.fail('disabled callback');assert.equal(publishAddressAcceptance17b({target,host,read:bad,details:bad,report:bad,queries:bad,crashes:bad}),null);assert.equal(touches,0);
 }
});
test('installation is lazy, has one immutable private property and exposes no game debug namespace',()=>{
 const s=fixture(),api=publishAddressAcceptance17b(s.opts);assert.equal(api,s.target.__addressAcceptance17b);assert.equal(api.version,1);assert.equal(api.ready,true);frozen(api);assert.deepEqual(s.calls,{capture:0,details:0,report:0,queries:0,crashes:0});
 const d=Object.getOwnPropertyDescriptor(s.target,'__addressAcceptance17b');assert.equal(d.writable,false);assert.equal(d.configurable,false);assert.equal(d.enumerable,false);assert.deepEqual(Object.keys(s.target),[]);assert.equal(Object.hasOwn(s.target,'__dlv'),false);assert.throws(()=>s.target.__addressAcceptance17b={},TypeError);
});
test('capture preserves signed zero/undefined and never freezes or returns live objects',()=>{
 const s=fixture(),api=publishAddressAcceptance17b(s.opts),snapshot=api.capture();assert.notEqual(snapshot,s.state);assert.notEqual(snapshot.nested,s.state.nested);assert.equal(Object.is(snapshot.value,-0),true);assert.equal(Object.hasOwn(snapshot,'missing'),true);assert.equal(snapshot.missing,undefined);frozen(snapshot);assert.equal(Object.isFrozen(s.state),false);assert.equal(Object.isFrozen(s.state.nested.rows),false);assert.throws(()=>snapshot.nested.rows.push('x'),TypeError);
 s.state.nested.text='изменено';s.state.nested.rows[0][0]=99;assert.equal(snapshot.nested.text,'Женя');assert.equal(snapshot.nested.rows[0][0],1);assert.equal(s.calls.capture,1);
});
test('every read is a fresh owned snapshot of current data, not a stale cache',()=>{
 const s=fixture(),api=publishAddressAcceptance17b(s.opts),first=api.capture();s.state.value=3;s.state.nested.text='новое';const second=api.capture();assert.notEqual(second,first);assert.notEqual(second.nested,first.nested);assert.equal(second.value,3);assert.equal(Object.is(first.value,-0),true);assert.equal(second.nested.text,'новое');assert.equal(first.nested.text,'Женя');assert.equal(s.calls.capture,2);
});
test('all independent callbacks are used once and their live sources remain mutable',()=>{
 const s=fixture(),api=publishAddressAcceptance17b(s.opts),details=api.details(),report=api.report(),queries=api.queries(),crashes=api.crashes();assert.deepEqual(s.calls,{capture:0,details:1,report:1,queries:1,crashes:1});assert.equal(report,null);frozen(details);frozen(queries);frozen(crashes);assert.notEqual(details.data,s.state);assert.notEqual(queries,s.query);assert.notEqual(crashes,s.errors);assert.equal(Object.isFrozen(s.errors),false);s.errors.push('later');assert.deepEqual(crashes,[]);
});
test('structured clone retains generated-door/suffix aliases while detaching every live tuple',()=>{
 const s=fixture(),api=publishAddressAcceptance17b(s.opts),a=api.queries(),b=api.queries();assert.equal(a.generatedDoors[0],a.entrances[1]);assert.notEqual(a.generatedDoors[0],s.query.generatedDoors[0]);assert.notEqual(a.generatedDoors[0],b.generatedDoors[0]);assert.equal(Object.is(a.generatedDoors[0][2],-0),true);s.query.generatedDoors[0][0]=99;assert.equal(a.generatedDoors[0][0],1);
});
test('callbacks are readonly readers; original failures are not swallowed or converted into success',()=>{
 for(const [method,callback]of [['capture','read'],['details','details'],['report','report'],['queries','queries'],['crashes','crashes']]){
  const s=fixture(),primary=Error('original '+method);s.opts[callback]=()=>{throw primary;};const api=publishAddressAcceptance17b(s.opts);assert.throws(()=>api[method](),error=>error===primary);assert.equal(api.ready,true);
 }
});
test('an uncloneable callback payload fails without mutating its live input',()=>{
 const s=fixture(),bad={data:s.state,fn(){}};s.opts.read=()=>bad;const api=publishAddressAcceptance17b(s.opts);assert.throws(()=>api.capture(),/clone|cloned/i);assert.equal(Object.isFrozen(bad),false);assert.equal(Object.isFrozen(s.state),false);
});
test('duplicate publication cannot replace the existing accepted reader',()=>{
 const first=fixture(),api=publishAddressAcceptance17b(first.opts),replacement=fixture();replacement.opts.target=first.target;assert.throws(()=>publishAddressAcceptance17b(replacement.opts),TypeError);assert.equal(first.target.__addressAcceptance17b,api);assert.equal(Object.is(api.capture().value,-0),true);assert.deepEqual(replacement.calls,{capture:0,details:0,report:0,queries:0,crashes:0});
});
test('a frozen target refuses installation before any callback is invoked',()=>{
 const s=fixture();Object.freeze(s.target);assert.throws(()=>publishAddressAcceptance17b(s.opts),TypeError);assert.deepEqual(s.calls,{capture:0,details:0,report:0,queries:0,crashes:0});assert.equal(Object.hasOwn(s.target,'__addressAcceptance17b'),false);
});
console.log(JSON.stringify({ok:true,checks,scope:'actual read-only acceptance snapshot module; no game'}));
