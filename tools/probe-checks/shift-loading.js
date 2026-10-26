/* №15: раннее нажатие настоящей карточки, поездка и смена района.
   --early --seed=7 --size=deck --q=gfx=high&gfxdev=deck */
const fail=message=>{throw Error(message);};
const inp=document.querySelector('#crm-nin');
if(inp){inp.value='Проверка';document.querySelector('.crm-nok').click();}
const button=document.querySelector('.crm-card[data-key="go"] .crm-cb');
if(!button)fail('Нет настоящей кнопки смены');
const clicked=performance.now();button.click();
const deadline=new URLSearchParams(location.search).has('slowboot')?110000:55000;
if(!await until(()=>!!window.__boot.full,deadline))fail('Превышен срок запуска '+deadline/1000+' секунд');
if(!await until(()=>d.S.state==='drive',10000))fail('Карточка не довела игрока до езды');
if(document.querySelector('.late-wait'))fail('Экран загрузки остался поверх игры');
const stream=d.LAND_STREAM;
if(!stream||!d.RLAND.ST.supportReady||!stream.readyAt(d.V.x,d.V.z,450))fail('Ближний город или опора не готовы');
const first={bootMs:window.__boot.full,clickMs:Math.round(performance.now()-clicked),tiles:stream.stats.ready,total:stream.stats.total,
  workers:d.RLAND.ST.workers,fallbacks:d.RLAND.ST.workerFallbacks,heapMB:Math.round((performance.memory?.usedJSHeapSize||0)/1048576)};
first.stages={contours:d.LATE.T.raisedland,surface:d.LATE.T.raisedlandSurface,total:d.LATE.T.total};log({first});
if(first.tiles>=first.total/4)fail('До старта снова строится дальний город');
const home=[d.V.x,d.V.z],frame0=P.n;
autopilot();await run(10);autopilot(false);
const moved=Math.hypot(d.V.x-home[0],d.V.z-home[1]);
if(moved<15)fail('После загрузки машина не едет');
const driveFrames=frames(frame0);
d.DIST.unlockAll();d.districtLocks();
const far=d.PIZZERIAS.filter(Boolean).sort((a,b)=>Math.hypot(b.bx-home[0],b.bz-home[1])-Math.hypot(a.bx-home[0],a.bz-home[1]))[0];
const before=stream.stats.ready;tp(far.bx,far.bz);await wait(500);
const target=[d.V.x,d.V.z],height=d.groundH(...target),travel=performance.now();
if(!await until(()=>stream.readyAt(...target,450),60000))fail('Новый район не достроился при приближении');
if(stream.stats.ready<=before)fail('Поездка не запросила дальние участки');
if(d.groundH(...target)!==height)fail('Высота физики поменялась при загрузке рисунка');
const crash=d.crashlog.entries();
if(crash.length||stream.stats.failed)fail('Ошибка во время догрузки: '+JSON.stringify(crash));
return {ok:true,first,moved:Math.round(moved),driveFrames,newAreaMs:Math.round(performance.now()-travel),stream:stream.stats,crash};
