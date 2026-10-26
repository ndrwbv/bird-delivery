/* №16: настоящие кнопки, фактический буфер кадра и сохранённый выбор.
   --mode=steam --size=deck --q=gfxdev=deck (без ?gfx: он запрещает сохранение). */
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const name=document.querySelector('#crm-nin');
if(name){name.value='Проверка';document.querySelector('.crm-nok').click();}
const canvas=document.querySelector('#view'), gfx=d.GFX;
gfx.setPreset('high');
document.querySelector('#panel').hidden=false;
d.renderSettings('gfx-px');
const native=[Math.round(1280*devicePixelRatio),Math.round(800*devicePixelRatio)];
const expected=[[688,430],[864,540],[1152,720],native], seen=[];
// Из высокой (720) — полное, 430, 540, 720: сохранённые номера 0…2 прежние.
for(const index of [3,0,1,2]) {
  document.querySelector('#gfx-px').click();await wait(150);
  const label=document.querySelector('#gfx-px').textContent;
  const [w,h]=expected[index];
  assert(canvas.width===w&&canvas.height===h,'Реальный буфер не совпал: '+canvas.width+'×'+canvas.height);
  assert(label.includes(w+' × '+h),'Подпись не совпала с буфером: '+label);
  const stored=JSON.parse(localStorage.getItem('dlv-gfx')).deck;
  assert(index===2?stored.p==='high':stored.p==='custom'&&stored.o.px===index,'Выбор не сохранён');
  assert(canvas.clientWidth===1280&&canvas.clientHeight===800,'Размер интерфейса изменился');
  seen.push({index,label,width:canvas.width,height:canvas.height});
}
gfx.set('px',3);d.renderSettings('gfx-px');
// Размер Deck в CSS на Retina-хосте ещё не означает плотность экрана Deck.
// Отдельно проверяем физические 1280×800 и обновление подписи открытого меню.
const density=Object.getOwnPropertyDescriptor(window,'devicePixelRatio');
Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1});
dispatchEvent(new Event('resize'));await wait(150);
assert(canvas.width===1280&&canvas.height===800,'Полное разрешение Deck неверно');
assert(document.querySelector('#gfx-px').textContent.includes('1280 × 800'),'Подпись не обновилась после изменения экрана');
if(new URLSearchParams(location.search).has('resolutionShot'))await shot('/tmp/bird-render-resolution.png');
d.closePanel();await onShift();
gfx.set('px',3);d.DYNRES.pin=3;await run(1);
assert(d.DYNRES.k===.6&&canvas.width===1280&&canvas.height===800,'Автоматическое снижение спорит с выбранным размером');
assert(!d.DYNRES.edgeBad,'Ошибка шейдера сглаживания');
d.DYNRES.pin=null;gfx.setDyn(0);await run(.5);
assert(d.DYNRES.k===1,'После отключения автоматики размер не восстановлен');
assert(d.crashlog.entries().length===0,'Ошибка игры');
if(density)Object.defineProperty(window,'devicePixelRatio',density);else delete window.devicePixelRatio;
dispatchEvent(new Event('resize'));
return {ok:true,seen,native,dynamic:true,deckNative:[1280,800]};
