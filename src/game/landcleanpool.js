/* Независимые клетки и группы полигонов считаются в рабочих потоках.
   Стыковка между группами, цвета заполнения и запись идут в исходном порядке.
   Не более одной ожидающей пачки на поток: результаты всего города
   одновременно в памяти не копятся. ?landworkers=0 — синхронная сверка. */
import { STARTUP } from './startuptrace.js';
import {landCleanTileRegion,normalizeLandRegions} from './landclean.js';

const makeWorker=()=>new Worker(new URL('./landclean.worker.js',import.meta.url),{type:'module'});
export function createLandCleaner({cover,green,cores,batchSize=64,workerCount,workerFactory=makeWorker,timeoutMs=10000,stats={}}){
  return createPool({items:cores,batchSize,workerCount,workerFactory,timeoutMs,stats,
    init:()=>({type:'init',cover:cover.snapshot(),green:green.snapshot(),trace:STARTUP.enabled}),
    message:(id,cores)=>({type:'batch',id,cores}),calculate:core=>landCleanTileRegion(cover,green,core),
    label:'расчёт газонов',trace:'worker.cleanContours'});
}
export function createLandRegionCleaner(groups,removeSpikes){
  return createPool({items:groups,batchSize:12,workerFactory:makeWorker,timeoutMs:10000,stats:{},
    init:()=>({type:'region-init',trace:STARTUP.enabled}),
    message:(id,groups)=>({type:'region-batch',id,groups,removeSpikes}),
    calculate:group=>normalizeLandRegions(group,removeSpikes),
    label:'сведение контуров',trace:'worker.landRegions'});
}
function createPool({items,batchSize,workerCount,workerFactory,timeoutMs,stats,init,message,calculate,label,trace}){
  const query=typeof location!=='undefined'?new URLSearchParams(location.search):null;
  const requested=query?.has('landworkers')?Number(query.get('landworkers')):null;
  const hardware=typeof navigator!=='undefined'?navigator.hardwareConcurrency||4:4;
  const count=Math.max(0,Math.min(3,Math.floor(workerCount??requested??(hardware>=6?3:2))||0));
  let active=count>0&&(workerFactory!==makeWorker||typeof Worker!=='undefined'),closed=false,cursor=0,frontier=0;
  const slots=[],entries=new Map(),total=Math.ceil(items.length/batchSize);
  stats.workers=0;stats.workerBatches=0;stats.workerFallbacks=0;
  const slice=id=>items.slice(id*batchSize,(id+1)*batchSize);
  const sync=id=>slice(id).map(calculate);
  function entry(id){
    let e=entries.get(id);if(e)return e;
    e={};e.promise=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});
    // Предвычисленная пачка может сломаться до того, как её запросили.
    // Ошибка всё равно доставляется потребителю, без unhandledrejection.
    e.promise.catch(()=>{});entries.set(id,e);return e;
  }
  function shutdown(error=null){
    active=false;
    for(const s of slots){clearTimeout(s.timer);s.worker.onmessage=s.worker.onerror=s.worker.onmessageerror=null;s.worker.terminate();}
    slots.length=0;
    for(const e of entries.values())e.reject(error||Error('Расчёт продолжен в основном потоке'));
    entries.clear();
  }
  function fail(error){if(!active)return;STARTUP.flag('land.workerFallback');stats.workerFallbacks++;shutdown(error);}
  const arm=s=>{clearTimeout(s.timer);s.timer=setTimeout(()=>fail(Error('Время расчёта земли истекло')),timeoutMs);};
  function pump(){
    if(!active)return;
    for(const s of slots){
      if(!s.ready||s.id!==null||cursor>=total||cursor>=frontier+count)continue;
      const id=cursor++;entry(id);s.id=id;arm(s);
      try{s.worker.postMessage(message(id,slice(id)));}catch(error){fail(error);break;}
    }
  }
  if(active){
    try{
      const source=init();
      for(let i=0;i<count;i++){
        const s={worker:workerFactory(),ready:false,id:null,timer:null};slots.push(s);
        s.worker.onmessage=({data})=>{
          if(!active)return;
          if(data?.type==='ready'&&!s.ready){STARTUP.worker('worker.init',data.workMs);clearTimeout(s.timer);s.ready=true;pump();return;}
          if(data?.type==='batch'&&data.id===s.id&&Array.isArray(data.result)&&data.result.length===slice(data.id).length){
            clearTimeout(s.timer);const id=s.id;s.id=null;stats.workerBatches++;STARTUP.worker(trace,data.workMs);entry(id).resolve(data.result);pump();return;
          }
          fail(Error(data?.message||'Неверный ответ расчёта земли'));
        };
        s.worker.onerror=()=>fail(Error('Рабочий поток земли остановился'));
        s.worker.onmessageerror=()=>fail(Error('Не удалось прочитать расчёт земли'));
        arm(s);s.worker.postMessage(source);stats.workers++;
      }
    }catch(error){fail(error);}
  }
  return {
    take(id){
      if(closed||!active)return sync(id);
      frontier=id;for(const k of entries.keys())if(k<id)entries.delete(k);
      const e=entry(id);pump();
      return {label,wait:e.promise,sync:()=>{shutdown();return sync(id);}};
    },
    close(){closed=true;shutdown();},
    batches:total,batchSize
  };
}
