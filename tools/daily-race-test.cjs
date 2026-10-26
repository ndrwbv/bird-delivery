/* Реальные функции daily.js с управляемыми кадрами и часами: скрытие
   раньше первого кадра, устаревший callback и повторный показ до затухания. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const filename=process.argv[2]||path.join(__dirname,'../src/game/daily.js'),source=fs.readFileSync(filename,'utf8');
const ui=source.slice(source.indexOf('let NOTE ='),source.indexOf('const DEBUG ='));
assert.ok(ui.includes('function showPop'),'Функции интерфейса найдены в исходном модуле');
const elements=new Map(),frames=new Map(),timers=new Map();let seq=0,now=0,lastFrame=null;
const context={D:{list:[{id:'gentle',pay:10}]},A:{money:String,Snd:{fx(){}}},esc:String,t:String,label:q=>q.id,
  document:{createElement(){const classes=new Set();return{hidden:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};},body:{appendChild(e){elements.set(e.id,e);}}},
  requestAnimationFrame(fn){lastFrame=fn;frames.set(++seq,fn);return seq;},cancelAnimationFrame(id){frames.delete(id);},
  setTimeout(fn,ms){timers.set(++seq,{fn,at:now+ms});return seq;},clearTimeout(id){timers.delete(id);}};
vm.createContext(context);vm.runInContext(ui+'\nglobalThis.api={showPop,hidePop,showNote,hideNote};',context);
const api=context.api,q=context.D.list[0],on=id=>elements.get(id)?.classList.contains('on');
function flush(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f());}
function advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}
api.showPop(q);api.hidePop();flush();assert.equal(on('daily-pop'),false,'Скрытая до первого кадра плашка не возвращается');
api.showPop(q);const oldPop=lastFrame;api.hidePop();oldPop();assert.equal(on('daily-pop'),false,'Уже полученный старый кадр не возвращает плашку');
api.showPop(q);flush();assert.equal(on('daily-pop'),true,'Следующий нормальный показ работает');api.hidePop();
api.showNote();api.hideNote();flush();assert.equal(on('daily-note'),false,'Скрытая записка не возвращается');
api.showNote();const oldNote=lastFrame;api.hideNote();oldNote();assert.equal(on('daily-note'),false,'Старый кадр записки не возвращает её');
api.showNote();api.hideNote();api.showNote();advance(350);flush();
assert.equal(on('daily-note'),true);assert.equal(elements.get('daily-note').hidden,false,'Прежнее затухание не скрывает новую записку');
api.hideNote();advance(350);assert.equal(elements.get('daily-note').hidden,true,'Окончательное скрытие записки работает');
console.log('daily-race: прерывание до кадра, поздний callback, повторный показ и старое затухание — OK');
