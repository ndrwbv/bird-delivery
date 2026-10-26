/* №18: настоящий select, буфер, Retina, сохранение, клавиши и геймпад.
   --q=gfxdev=pc|deck (без ?gfx: он запрещает сохранение). */
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const name=document.querySelector('#crm-nin');
if(name){name.value='Проверка';document.querySelector('.crm-nok').click();}
const canvas=document.querySelector('#view'),gfx=d.GFX,device=gfx.dev;
const sizes=[[960,540],[1280,720],[1280,800],[1600,900],[1680,1050],[1920,1080],[1920,1200],[2560,1440],[2560,1600]];
const css=[canvas.clientWidth,canvas.clientHeight],density=Object.getOwnPropertyDescriptor(window,'devicePixelRatio');
const setDpr=value=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value});dispatchEvent(new Event('resize'));};
gfx.setPreset('high');
assert(gfx.opts.px===(device==='deck'?2:5),'Неверный высокий пресет');
document.querySelector('#panel').hidden=false;d.renderSettings('gfx-px');
const select=document.querySelector('#gfx-px');
assert(select.tagName==='SELECT'&&select.options.length===10,'Нужен выпадающий список всех размеров');
select.focus();
const seen=[];
for(const index of [0,1,2,3,4,5,6,7,8,9]) {
  select.value=String(index);select.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
  const [w,h]=sizes[index]||css.map(n=>Math.round(n*devicePixelRatio));
  assert(canvas.width===w&&canvas.height===h,'Буфер '+index+': '+canvas.width+'×'+canvas.height);
  assert(select.selectedOptions[0].textContent.includes(w+' × '+h),'Подпись не совпала с буфером');
  const stored=JSON.parse(localStorage.getItem('dlv-gfx'))[device];
  assert(stored.rv===2&&(stored.p==='high'||stored.o.px===index),'Выбор не сохранён');
  assert(canvas.clientWidth===css[0]&&canvas.clientHeight===css[1]&&Math.abs(d.cam.aspect-css[0]/css[1])<1e-6,'Изменились размер интерфейса или пропорции мира');
  assert(document.activeElement===select,'Список потерял фокус после выбора');
  seen.push([w,h]);
}
for(const dpr of [1,2]) {
  select.value='5';select.dispatchEvent(new Event('change',{bubbles:true}));setDpr(dpr);await wait(100);
  assert(canvas.width===1920&&canvas.height===1080,'Retina изменила фиксированное 1920×1080');
  select.value='9';select.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
  assert(canvas.width===css[0]*dpr&&canvas.height===css[1]*dpr,'Полное разрешение неверно');
  assert(select.selectedOptions[0].textContent.includes(canvas.width+' × '+canvas.height),'Полное не обновилось после resize');
}
for(const code of ['ArrowDown','ArrowUp','Enter','Space']) {
  const e=new KeyboardEvent('keydown',{key:code,code,bubbles:true,cancelable:true});select.dispatchEvent(e);
  assert(!e.defaultPrevented,'Игра перехватила клавишу списка: '+code);
}
// Настоящий путь pollPad → меню → select.change, без прямого вызова обработчика.
const originalPads=navigator.getGamepads;
const gp={id:'Resolution test',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:performance.now()};
navigator.getGamepads=()=>[gp];
const press=async i=>{gp.buttons[i]={pressed:true,touched:true,value:1};gp.timestamp=performance.now();await wait(150);gp.buttons[i]={pressed:false,touched:false,value:0};await wait(150);};
await press(15);const before=Number(select.value);await press(15);
assert(Number(select.value)===(before+1)%10,'Геймпад не изменил размер вправо');
await press(14);assert(Number(select.value)===before,'Геймпад не изменил размер влево');
await press(13);assert(document.activeElement!==select,'Геймпад не вышел из списка вниз');
navigator.getGamepads=originalPads;
select.value=String(device==='deck'?2:5);select.dispatchEvent(new Event('change',{bubbles:true}));
setDpr(1);await wait(100);
if(new URLSearchParams(location.search).has('resolutionShot'))await shot('/tmp/bird-render-resolution-'+device+'.png');
d.closePanel();await onShift();
gfx.set('px',device==='deck'?2:5);const fixed=[canvas.width,canvas.height];d.DYNRES.pin=3;await run(1);
assert(d.DYNRES.k===.6&&canvas.width===fixed[0]&&canvas.height===fixed[1],'Автоматическое снижение спорит с выбранным размером');
assert(!d.DYNRES.edgeBad,'Ошибка шейдера сглаживания');
d.DYNRES.pin=null;gfx.setDyn(0);await run(.5);
assert(d.DYNRES.k===1,'После отключения автоматики размер не восстановлен');
assert(d.crashlog.entries().length===0,'Ошибка игры');
if(density)Object.defineProperty(window,'devicePixelRatio',density);else delete window.devicePixelRatio;
dispatchEvent(new Event('resize'));
return {ok:true,device,seen,retina:true,keyboard:true,gamepad:true,dynamic:true};
