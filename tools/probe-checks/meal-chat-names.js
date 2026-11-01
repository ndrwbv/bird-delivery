/*15б: канонические ru/en подписи переписки, визуальная приёмка. Кадры — только с ?mealshots. */
await onShift();autopilot(false);d.acceptOrder();
const C=d.CAREERM,S=d.S,en=document.documentElement.lang.startsWith('en'),takeShots=new URLSearchParams(location.search).has('mealshots');
const require=(yes,message)=>{if(!yes)throw new Error(message);};
const manager=en?'Irina Sergeyevna':'Ирина Сергеевна',player=en?'Zhenya':'Женя',reply=en?'Cold pepperoni, please.':'Холодную пепперони.';
C.skipTo(14);S.order=null;S.side=null;S.state='handover';S.handT=1e9;S.hp=S.hpMax=7;
C.SH.on=true;C.SH.phase='';let resumed=0;
const flow=C.showLunch(()=>resumed++);
require(await until(()=>document.querySelector('#dlg.on.dlg-phone .dlg-btns.on .dlg-option'),10000),'Нет выбора');await wait(400);
require(document.querySelector('#dlg .dlg-phone-sender').textContent===manager,'Входящая подписана именем случайного аватара');
if(takeShots)await shot('/tmp/bird-mealchat-15b/question'+(en?'-en':'')+'.png');
document.querySelector('#dlg [data-choice="hp"]').click();
require(await until(()=>document.querySelector('#dlg.on.dlg-phone-courier .dlg-text')?.textContent===reply,10000),'Нет исходящей реплики');
require(document.querySelector('#dlg .dlg-phone-sender').textContent===player,'Исходящая подписана не героем');
require(document.querySelector('#dlg .dlg-phone-history .dph-message > b')?.textContent===manager,'История входящих потеряла управляющую');
if(takeShots)await shot('/tmp/bird-mealchat-15b/reply'+(en?'-en':'')+'.png');
require(await until(()=>C.MEAL.active?.stage==='ack'&&document.querySelector('#dlg .dlg-phone-sender')?.textContent===manager,10000),'Ок подписано другим отправителем');
for(const type of ['keydown','keyup'])dispatchEvent(new KeyboardEvent(type,{code:'Escape',key:'Escape',bubbles:true,cancelable:true}));
require(await until(()=>!C.MEAL.active,5000),'Переписка не закрылась');await flow;
require(resumed===1&&S.hp===8&&S.hpMax===8&&!S.paused&&!S.meal&&!d.DLG.isOpen(),'Имена/закрытие нарушили эффект/продолжение');
let receiptWallet=null;
if(takeShots&&!en){
 S.money=4200;S.tips=200;S.delivered=2;d.addWallet(4200);d.addWallet(-1700);
 d.endShift('смена окончена');require(await until(()=>C.SSTEPS.state.id==='cash',5000),'Нет копилки');await wait(400);C.SSTEPS.skip();
 require(await until(()=>!C.SSTEPS.state.on&&!document.getElementById('over').classList.contains('wait'),7000),'Чек не допечатался');await wait(250);
 if(await until(()=>d.RASK.state.open,3000)){await wait(500);document.querySelector('.ra-desk .ra-yes').click();require(await until(()=>!d.RASK.state.open,3000),'Вопрос навигатора не закрылся');}
 receiptWallet=d.wallet();await shot('/tmp/bird-wallet-19/receipt.png');
}
return{ok:true,lang:en?'en':'ru',manager,player,resumed,hp:S.hp,hpMax:S.hpMax,receiptWallet};
