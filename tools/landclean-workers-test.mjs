/* №15: та же земля при другом порядке ответов, отказе Worker и flush.
   FakeWorker исполняет настоящий расчёт над structuredClone страниц. */
import assert from 'node:assert/strict';
import {createLandCover} from '../src/game/landcover.js';
import {landCleanTileRegion} from '../src/game/landclean.js';
import {createLandCleaner} from '../src/game/landcleanpool.js';

const cover=createLandCover(),green=createLandCover();
for(let i=0;i<12;i++){
  const x=i*32;
  cover.triangle(x+2,2,x+20,2,x+2,28,.1).rgb=[122,111,99];
  green.triangle(x+10,10,x+22,10,x+10,22,.2).rgb=[90,150,70];
}
const extra=createLandCover();extra.triangle(-32,0,-16,0,-32,16,.5);cover.absorb(extra);
const clone=structuredClone(cover.snapshot()),restored=createLandCover(clone.cell,clone);
assert.deepEqual([...restored.triangles],[...cover.triangles],'Страницы с пропусками id восстанавливаются точно');
assert.deepEqual([...restored.cells()],[...cover.cells()],'Порядок индекса не меняется');
assert.equal(cover.count,13,'Передача не опустошает основное поле');
const cores=Array.from({length:12},(_,i)=>[i*32,0,(i+1)*32,32]);
const expected=cores.map(core=>landCleanTileRegion(cover,green,core));
let alive=0,maxAlive=0,started=0,finished=0,maxAhead=0,consumed=0;
function factory(mode='normal'){
  return ()=>{
    let stopped=false,c,g;
    const timers=[];
    alive++;maxAlive=Math.max(maxAlive,alive);
    const worker={onmessage:null,onerror:null,onmessageerror:null,
      postMessage(input){
        const data=structuredClone(input);
        if(mode==='throw')throw Error('Worker blocked');
        if(mode==='silent')return;
        if(data.type==='init'){
          c=createLandCover(data.cover.cell,data.cover);g=createLandCover(data.green.cell,data.green);
          timers.push(setTimeout(()=>{if(!stopped)worker.onmessage?.({data:{type:'ready'}});},0));return;
        }
        started++;maxAhead=Math.max(maxAhead,started-consumed);
        timers.push(setTimeout(()=>{
          if(stopped)return;
          if(mode==='fail'){worker.onerror?.({message:'failed'});return;}
          const result=data.cores.map(core=>landCleanTileRegion(c,g,core));finished++;
          worker.onmessage?.({data:{type:'batch',id:data.id,result}});
        },data.id%3===0?12:1));
      },
      terminate(){if(stopped)return;stopped=true;alive--;for(const timer of timers)clearTimeout(timer);}
    };
    return worker;
  };
}
async function collect(pool){
  const out=[];
  try{for(let i=0;i<pool.batches;i++){
    const req=pool.take(i);let result;
    if(Array.isArray(req))result=req;
    else try{result=await req.wait;}catch{result=req.sync();}
    out.push(...result);consumed++;
  }}finally{pool.close();}
  return out;
}
for(const mode of['normal','fail','silent','throw']){
  started=finished=consumed=maxAhead=0;
  const stats={},pool=createLandCleaner({cover,green,cores,batchSize:2,workerCount:3,workerFactory:factory(mode),timeoutMs:mode==='silent'?10:1000,stats});
  assert.deepEqual(await collect(pool),expected,`Ответ не меняется: ${mode}`);
  assert.equal(alive,0,'Все потоки остановлены');
  if(mode==='normal'){assert.equal(stats.workerBatches,6);assert.ok(maxAhead<=3,'Ожидает не больше одной пачки на поток');}
  else assert.ok(stats.workerFallbacks>0,'Отказ явно учитывается и включает запасной путь');
}
// Вызов flush, пока первые ответы ещё не пришли. Поздние ответы
// не должны перезаписать уже использованный результат.
{
  const pool=createLandCleaner({cover,green,cores,batchSize:2,workerCount:3,workerFactory:factory(),stats:{}}),out=[];
  for(let i=0;i<pool.batches;i++){
    const req=pool.take(i);out.push(...(Array.isArray(req)?req:req.sync()));
  }
  pool.close();assert.deepEqual(out,expected);assert.equal(alive,0);
}
{
  const pool=createLandCleaner({cover,green,cores,batchSize:2,workerCount:0,workerFactory:()=>{throw Error('Не должен создаваться');}});
  assert.deepEqual(await collect(pool),expected);
}
assert.ok(maxAlive<=3);
console.log(JSON.stringify({ok:true,cells:cores.length,maxWorkers:maxAlive,paths:['parallel','error','timeout','blocked','flush','disabled']}));
