/* Проверяем настоящую очередь, подменяя только журнал и определение
   устройства (в Node нет Vite import.meta.glob из перевода журнала). */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../src/game/latebuild.js',import.meta.url),'utf8'))
  .replace("import * as CL from '../platform/crashlog.js';","const CL={report(){},trans(){},transEnd(){}};")
  .replace("import { MOB } from './mobile.js';","const MOB={on:false};")
  .replace("const MC = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;","const MC=null;");
let serial=0;
const queue=()=>import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+serial++).toString('base64'));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Async: во время ожидания нет повторных next или sync, затем
// результат доставляется ровно один раз и очередь продолжает работу.
{
  const q=await queue(),events=[];let resolve,syncs=0;
  const promise=new Promise(r=>resolve=r);
  q.enable(true);q.add('async',function*(){events.push('begin');const value=yield {wait:promise,sync:()=>{syncs++;return 7;}};events.push(value);yield 'tail';events.push('end');});
  const done=new Promise(r=>q.onDone(r));q.start();await wait(15);
  assert.deepEqual(events,['begin']);assert.equal(syncs,0);assert.equal(q.left(),1);
  resolve(9);await done;assert.deepEqual(events,['begin',9,'end']);assert.equal(syncs,0);assert.equal(q.busy(),false);
}
// flush отменяет ожидание, синхронный запасной путь — ровно один раз.
{
  const q=await queue(),events=[];let resolve,syncs=0;
  q.enable(true);q.add('flush',function*(){const value=yield {wait:new Promise(r=>resolve=r),sync:()=>{syncs++;return 7;}};events.push(value);});
  q.start();await wait(10);q.flush();assert.deepEqual(events,[7]);assert.equal(syncs,1);
  resolve(9);await wait(10);assert.deepEqual(events,[7]);assert.equal(syncs,1);
}
// Отказ Promise возобновляет ту же задачу через fallback, без зависания.
{
  const q=await queue(),events=[];
  q.enable(true);q.add('reject',function*(){events.push(yield {wait:Promise.reject(Error('worker')),sync:()=>13});});
  const done=new Promise(r=>q.onDone(r));q.start();await done;assert.deepEqual(events,[13]);
}
// ?nolate и flush до самого первого тика тоже выполняют fallback.
for(const immediate of[true,false]){
  const q=await queue(),events=[];let syncs=0;
  q.enable(!immediate);q.add('sync',function*(){events.push(yield {wait:new Promise(()=>{}),sync:()=>{syncs++;return 17;}});});
  if(!immediate)q.flush();assert.deepEqual(events,[17]);assert.equal(syncs,1);
}
console.log('latebuild wait: async, no polling, rejection, flush, late answer and immediate execution — OK');
