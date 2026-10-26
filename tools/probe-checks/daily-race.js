/* 0п95: очередь скрыла уведомление до его первого кадра. Проверяем
   реальные show/hide задания и записки, включая уже полученный старый RAF. */
await onShift();
const paused=d.S.paused;d.S.paused=true;
d.DAILY.set(['gentle']); d.DAILY.done('gentle');
const queue=window.__NQ.LIST,at=queue.findIndex(x=>x.kind==='daily');
d.S.paused=paused;
if(at<0)throw Error('Задание не попало в очередь ожидания');
const item=queue.splice(at,1)[0],rows=[];
const on=id=>!!document.querySelector('#'+id+'.on');
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function pending(show){
  const raf=window.requestAnimationFrame;let cb=null;
  window.requestAnimationFrame=fn=>{cb=fn;return -1;};
  try{show();}finally{window.requestAnimationFrame=raf;}
  if(!cb)throw Error('Отложенный показ не создан');
  return cb;
}
try{
  item.show(item);item.hide(item);await frame();
  rows.push({name:'плашка скрыта до первого кадра',ok:!on('daily-pop')});
  const oldPop=pending(()=>item.show(item));item.hide(item);oldPop(performance.now());
  rows.push({name:'старый кадр плашки после скрытия',ok:!on('daily-pop')});
  item.show(item);await frame();
  rows.push({name:'новый показ после прерывания',ok:on('daily-pop')});item.hide(item);
  d.DAILY.note();d.DAILY.hideNote();await frame();
  rows.push({name:'записка скрыта до первого кадра',ok:!on('daily-note')});
  const oldNote=pending(()=>d.DAILY.note());d.DAILY.hideNote();oldNote(performance.now());
  rows.push({name:'старый кадр записки после скрытия',ok:!on('daily-note')});
  // Предыдущее затухание не должно скрыть новый показ, чей кадр задержался.
  const nextNote=pending(()=>d.DAILY.note());await wait(350);nextNote(performance.now());
  const note=document.getElementById('daily-note');
  rows.push({name:'новая записка после старого затухания',ok:on('daily-note')&&!note.hidden});
}finally{item.hide(item);d.DAILY.hideNote();}
return{ok:rows.every(r=>r.ok)&&!d.crashlog.count(),rows,crash:d.crashlog.count()};
