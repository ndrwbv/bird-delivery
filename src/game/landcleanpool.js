/* Только независимое раскрытие клеток — в рабочих потоках. Объединение,
   цвета заполнения и запись в сцену остаются в исходном порядке.
   Не более одной ожидающей пачки на поток: результаты всего города
   одновременно в памяти не копятся. ?landworkers=0 — синхронная сверка. */
import {landCleanTileRegion} from './landclean.js';

const makeWorker=()=>new Worker(new URL('./landclean.worker.js',import.meta.url),{type:'module'});
export function createLandCleaner({cover,green,cores,batchSize=64,workerCount,workerFactory=makeWorker,timeoutMs=10000,stats={}}){
  const query=typeof location!=='undefined'?new URLSearchParams(location.search):null;
  const requested=query?.has('landworkers')?Number(query.get('landworkers')):null;
  const hardware=typeof navigator!=='undefined'?navigator.hardwareConcurrency||4:4;
  const count=Math.max(0,Math.min(3,Math.floor(workerCount??requested??(hardware>=6?3:2))||0));
  let active=count>0&&(workerFactory!==makeWorker||typeof Worker!=='undefined'),closed=false,cursor=0,frontier=0;
  const slots=[],entries=new Map(),total=Math.ceil(cores.length/batchSize);
  stats.workers=0;stats.workerBatches=0;stats.workerFallbacks=0;
  const slice=id=>cores.slice(id*batchSize,(id+1)*batchSize);
  const sync=id=>slice(id).map(core=>landCleanTileRegion(cover,green,core));
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
  function fail(error){if(!active)return;stats.workerFallbacks++;shutdown(error);}
  const arm=s=>{clearTimeout(s.timer);s.timer=setTimeout(()=>fail(Error('Время расчёта земли истекло')),timeoutMs);};
  function pump(){
    if(!active)return;
    for(const s of slots){
      if(!s.ready||s.id!==null||cursor>=total||cursor>=frontier+count)continue;
      const id=cursor++;entry(id);s.id=id;arm(s);
      try{s.worker.postMessage({type:'batch',id,cores:slice(id)});}catch(error){fail(error);break;}
    }
  }
  if(active){
    try{
      const source={type:'init',cover:cover.snapshot(),green:green.snapshot()};
      for(let i=0;i<count;i++){
        const s={worker:workerFactory(),ready:false,id:null,timer:null};slots.push(s);
        s.worker.onmessage=({data})=>{
          if(!active)return;
          if(data?.type==='ready'&&!s.ready){clearTimeout(s.timer);s.ready=true;pump();return;}
          if(data?.type==='batch'&&data.id===s.id&&Array.isArray(data.result)&&data.result.length===slice(data.id).length){
            clearTimeout(s.timer);const id=s.id;s.id=null;stats.workerBatches++;entry(id).resolve(data.result);pump();return;
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
      return {label:'расчёт газонов',wait:e.promise,sync:()=>{shutdown();return sync(id);}};
    },
    close(){closed=true;shutdown();},
    batches:total,batchSize
  };
}
