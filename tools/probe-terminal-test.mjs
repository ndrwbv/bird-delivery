/* Execute the actual probe host with a mocked Electron boundary. No Electron, game, files or builds run. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const source=await fs.readFile(new URL('./probe.cjs',import.meta.url),'utf8');
const requireHere=createRequire(import.meta.url),reportPath='/virtual/report.json';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}throw Error('Probe unit did not reach expected await');}
function host(pause='eval'){
 const pending=deferred(),events=new Map(),fatalEvents=new Map(),writes=[],exits=[],stderr=[];
 const state={destroyed:false,evalStarted:false,logsStarted:false,cleanup:0,footerCalls:0};
 const app={setPath(){},dock:{hide(){}},commandLine:{appendSwitch(){}},whenReady:()=>Promise.resolve(),exit(code){exits.push(code);state.destroyed=true;events.get('render-process-gone')?.({}, {reason:'clean-exit'});}};
 class BrowserWindow{
  constructor(){this.webContents={setFrameRate(){},on:(name,fn)=>events.set(name,fn),executeJavaScript:code=>{
   if(state.destroyed)throw Error('Object has been destroyed');
   if(code.includes('const __r = await')){state.evalStarted=true;return pause==='eval'?pending.promise:Promise.resolve('null');}
   if(code==='window.__probe.logs'){state.logsStarted=true;state.footerCalls++;return pause==='logs'?pending.promise:Promise.resolve([]);}
   if(code==='window.__probe.stats()'){state.footerCalls++;return Promise.resolve({n:1,p50:1,p95:1});}
   return Promise.resolve(true);
  }};}
  loadURL(){return Promise.resolve();}
 }
 const mockFs={mkdirSync(){},readdirSync:()=>[],mkdtempSync:prefix=>prefix+'unit',existsSync:()=>false,
  writeFileSync(file,bytes){writes.push({file:String(file),bytes:String(bytes)});},rmSync(){state.cleanup++;}};
 const mockProcess={argv:['node','probe.cjs','--js=return null;','--q=landcache=1','--report='+reportPath],versions:process.versions,platform:process.platform,arch:process.arch,
  stderr:{write:text=>stderr.push(text)},stdout:{write(){}},on:(name,fn)=>fatalEvents.set(name,fn),exit:code=>exits.push(code)};
 const sandbox={module:{exports:{}},__dirname:path.dirname(new URL('./probe.cjs',import.meta.url).pathname),process:mockProcess,performance,URL,URLSearchParams,
  setTimeout(fn,ms){if(ms<1000)queueMicrotask(fn);return 1;},clearTimeout(){},setInterval(){return 2;},clearInterval(){},
  require(name){
   if(name==='electron')return{app,BrowserWindow,protocol:{registerSchemesAsPrivileged(){}},session:{fromPartition:()=>({protocol:{handle(){}}})},net:{}};
   if(name==='fs')return mockFs;if(name==='os')return{tmpdir:()=>'/virtual'};if(name==='path')return path;
   if(name==='url')return requireHere('node:url');
   if(name==='./probe-build.cjs')return{BASE:'/virtual/probe',ensureBuild:()=>({dir:'/virtual/build'})};
   if(name==='./probe-page.cjs')return{PRELUDE:'',INSTALL:'INSTALL'};
   if(name==='./probe-glmem.cjs')return{GLMEM:''};
   if(name==='./land-cache-host.cjs')return requireHere(name);
   throw Error('Unexpected probe dependency: '+name);
  }};
 vm.runInNewContext(source+'\nmodule.exports={finish,fatal,get finished(){return finished;}};',sandbox,{filename:'probe.cjs',timeout:2000});
 const api=sandbox.module.exports;
 const failure={phase:'failed',reason:'land-cache17a:ACCEPTANCE_CANCEL_PREPARING',cleanCalls:0,cleaned:true,bufferHeld:false,publishedCells:0};
 const terminate=()=>events.get('console-message')({},3,'__landcache17a:failed:'+JSON.stringify(failure),0,'');
 const report=()=>JSON.parse(writes.find(row=>row.file===reportPath)?.bytes||'null');
 const verifyOnce=()=>{assert.equal(writes.filter(row=>row.file===reportPath).length,1);assert.equal(exits.length,1);assert.equal(state.cleanup,1);assert.equal(api.finished,true);};
 return{pending,events,fatalEvents,writes,exits,stderr,state,api,failure,terminate,report,verifyOnce};
}

let checks=0;
for(const completion of ['reject','resolve-invalid-json']){
 const h=host();await until(()=>h.state.evalStarted);h.terminate();
 if(completion==='reject')h.pending.reject(Error('Object has been destroyed'));else h.pending.resolve('invalid JSON after terminal');
 for(let i=0;i<5;i++)await tick();
 h.verifyOnce();assert.equal(h.exits[0],1);assert.deepEqual(h.report().landCacheFailure,h.failure);assert.equal(h.report().uncaught,0);assert.deepEqual(h.report().errors,[]);
 assert.equal(h.report().error,undefined);assert.equal(h.state.footerCalls,0);assert.equal(h.stderr.some(line=>/destroyed|invalid JSON/.test(line)),false);checks++;
}
const late=host('logs');await until(()=>late.state.logsStarted);late.terminate();late.pending.resolve([]);
for(let i=0;i<5;i++)await tick();late.verifyOnce();assert.deepEqual(late.report().landCacheFailure,late.failure);assert.equal(late.stderr.some(line=>/destroyed/.test(line)),false);checks++;
const positive=host();positive.api.finish(0,{ok:true,result:'first'});positive.api.finish(1,{ok:false,error:'second'});
for(let i=0;i<5;i++)await tick();positive.verifyOnce();assert.deepEqual(positive.report(),{ok:true,result:'first'});assert.equal(positive.exits[0],0);checks++;
const fatal=host();await until(()=>fatal.state.evalStarted);fatal.fatalEvents.get('unhandledRejection')(Error('real first fault'));fatal.pending.reject(Error('Object has been destroyed'));
for(let i=0;i<5;i++)await tick();fatal.verifyOnce();assert.equal(fatal.report().probeError,'real first fault');assert.equal(fatal.stderr.filter(line=>/real first fault/.test(line)).length,1);assert.equal(fatal.stderr.some(line=>/destroyed/.test(line)),false);checks++;
console.log(JSON.stringify({ok:true,checks,firstTerminalWins:true,lateEvalCannotOverwrite:true,lateGlobalCatchQuiet:true,realFatalPreserved:true,electronOrGameLaunched:false}));
