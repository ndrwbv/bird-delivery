/* №12: только три UI-кадра после уже пройденной семантической проверки.
   --q=...&heroshots=/tmp/bird-singlehero12-ru; временная чистая сессия, сброс НЕ подтверждается. */
const prefix=new URLSearchParams(location.search).get('heroshots');
if(!prefix)throw Error('heroshots output prefix is required');
const $=s=>document.querySelector(s);
const click=selector=>{const el=$(selector);if(!el)throw Error('Missing '+selector);const card=el.closest('.cz-card');if(card&&!card.classList.contains('on'))el.click();el.click();};
const capture=async suffix=>{await wait(800);return shot(prefix+'-'+suffix+'.png');};
d.CAREERM.menu();
const shots={menu:await capture('menu')};
click('.crm-stats');
if(!$('#courier-card'))throw Error('Courier card did not open');
shots.card=await capture('card');
click('.cc-back');click('.crm-card.k-settings .crm-cb');click('#set-reset');
if($('#panel').hidden||$('#panel').dataset.kind!=='reset'||$('#courier-card'))throw Error('Reset confirmation is not the visible dialog');
shots.reset=await capture('reset');
return {ok:true,shots,name:$('.crm-who b').textContent,resetConfirmed:false,crash:d.crashlog.entries()};
