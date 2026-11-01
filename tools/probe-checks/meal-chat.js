/* Приёмка15б: тот же DLG, честный эффект, Esc/B, чужая пауза и конец смены. */
await onShift();
autopilot(false); d.acceptOrder();
const C = d.CAREERM, S = d.S;
const require = (yes, message) => { if (!yes) throw new Error(message); };
const settle = promise => Promise.race([promise,wait(15000).then(() => { throw new Error('Диалог не завершился: '+JSON.stringify({meal:C.MEAL.active,state:S.state,paused:S.paused,flags:d.CH.pause,dlgOpen:d.DLG.isOpen(),text:document.querySelector('#dlg .dlg-text')?.textContent})); })]);
const waitChoice = async () => {
  await wait(50); // DLG.say ставит show в microtask: не читаем оставшиеся кнопки прошлого окна
  require(await until(() => document.querySelector('#dlg.dlg-phone .dlg-btns.on .dlg-option'), 10000), 'Нет трёх вариантов в переписке');
  await wait(350);
  const manager=document.documentElement.lang.startsWith('en')?'Irina Sergeyevna':'Ирина Сергеевна';
  require(document.querySelector('#dlg .dlg-phone-sender')?.textContent===manager,'Имя управляющей взято из случайного аватара');
};
const tap = code => { for (const type of ['keydown', 'keyup']) dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); };
let resumed = 0;
const fixture = (hp, hpMax, tank) => {
  C.skipTo(14);
  S.order = null; S.side = null; S.state = 'handover'; S.handT = 1e9;
  S.hp = hp; S.hpMax = hpMax; S.nosEff = 1; S.lunch = null; d.NOS.tank = tank;
  d.hudHearts(); C.SH.phase = ''; C.SH.on = true;
};
const result = [];

fixture(7, 7, 1);
let flow = C.showLunch(() => resumed++);
await waitChoice();
require(document.querySelectorAll('#dlg .dlg-option').length === 3 && !document.querySelector('#choice:not([hidden])'), 'Дублирующая карточка еды или неверное число ответов');
d.CHAT.say('Проверочное фоновое SMS', null, false, null, { key: 'meal-test-background' });
require(document.body.classList.contains('meal-chat-open'), 'Переписка не защищена от фоновых SMS');
const hp = document.querySelector('#dlg [data-choice="hp"]'); hp.click(); hp.click();
require(await until(() => C.MEAL.active?.committed, 3000), 'Выбор не применился');
require(S.hp === 8 && S.hpMax === 8, 'Полное здоровье не получило одно дополнительное сердце либо начислено дважды');
document.querySelector('#dlg .dlg-phone-exit').click();
await settle(flow);
require(S.hp === 8 && S.hpMax === 8 && resumed === 1 && !S.meal && !S.paused && !d.DLG.isOpen(), 'Закрытие после выбора откатило баф или оставило hold');
result.push({ kind: 'full-health', hp: S.hp, hpMax: S.hpMax, resumed });

fixture(4.5, 7, 0.37);
flow = C.showLunch(() => resumed++); await waitChoice();
tap('Digit1');
require(await until(() => C.MEAL.active?.committed, 3000), 'Цифра1 не выбрала нитро');
require(d.NOS.tank === 1 && Math.abs(S.nosEff - 1 / 1.5) < 1e-9, 'Нитро изменило прежнюю величину эффекта');
require(await until(() => document.querySelector('.meal-flight'), 12000), 'Эффект не начал лететь после Ок');
require(await until(() => !!document.querySelector('.meal-flight')?.style.left, 2000), 'Эффект не получил исходную позицию');
const oldHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
const frozenAt = document.querySelector('.meal-flight').style.cssText;
try {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  await wait(350);
  require(document.querySelector('.meal-flight')?.style.cssText === frozenAt, 'Фоновая пауза не остановила эффект');
} finally {
  if (oldHidden) Object.defineProperty(document, 'hidden', oldHidden); else delete document.hidden;
}
let flights = [], lastEffect = '', maxFlights = 0;
require(await until(() => {
  const nodes = [...document.querySelectorAll('.meal-flight')]; maxFlights = Math.max(maxFlights, nodes.length);
  const effect = nodes[0]?.dataset.effect;
  if (effect && effect !== lastEffect) { lastEffect = effect; flights.push(effect); }
  return !C.MEAL.active;
}, 15000), 'Обед не завершился после анимаций');
await settle(flow);
require(maxFlights === 1 && flights.join(',') === 'nitro-duration,nitro-refill', 'Эффекты нитро летели одновременно или в неверном порядке');
result.push({ kind: 'nitro-partial', efficiency: S.nosEff, flights, receipt: C.MEAL.last.receipt });

fixture(7, 7, 1);
flow = C.showLunch(() => resumed++); await waitChoice(); tap('Digit1');
require(await until(() => C.MEAL.active?.committed, 3000), 'Нитро при полном запасе не выбрано');
document.querySelector('#dlg .dlg-phone-exit').click(); await settle(flow);
require(C.MEAL.last.receipt.effects.length === 1 && C.MEAL.last.receipt.effects[0].kind === 'nitro-duration', 'Полный запас получил фиктивное доливание');
result.push({ kind: 'nitro-full', effects: C.MEAL.last.receipt.effects });

fixture(4.5, 7, 0.4);
const money = S.money;
flow = C.showLunch(() => resumed++); await waitChoice(); tap('ArrowDown'); tap('Enter');
require(await until(() => C.MEAL.active?.selected === 'tips', 3000), 'Стрелка/Enter не выбрали второй вариант');
tap('Escape'); await settle(flow);
require(S.lunch === 'tips' && S.money === money && S.hp === 4.5 && d.NOS.tank === 0.4, 'Чаевые изменили деньги сейчас или другой параметр');
result.push({ kind: 'tips', lunch: S.lunch, currentMoneyUnchanged: true });

fixture(4.5, 7, 0.4);
flow = C.showLunch(() => resumed++); await waitChoice(); tap('Escape'); await settle(flow);
require(S.lunch === null && S.hp === 4.5 && S.hpMax === 7 && d.NOS.tank === 0.4 && !S.paused && !d.DLG.isOpen(), 'Отмена до ответа применила баф/оставила паузу');
result.push({ kind: 'cancel-before-choice', unchanged: true });

fixture(4.5, 7, 0.4);
const oldPads = navigator.getGamepads, gp = { id: 'meal-check gamepad', connected: true, index: 0, mapping: 'standard', axes: [0,0,0,0],
  buttons: Array.from({length:17},()=>({pressed:false,touched:false,value:0})) };
navigator.getGamepads = () => [gp];
const press = async i => { gp.buttons[i] = {pressed:true,touched:true,value:1}; await wait(150); gp.buttons[i] = {pressed:false,touched:false,value:0}; await wait(150); };
try {
  flow = C.showLunch(() => resumed++); await waitChoice();
  await press(13); await press(13); await press(0);
  require(await until(() => C.MEAL.active?.selected === 'hp', 3000), 'Геймпад не выбрал третий ответ');
  await press(1); await settle(flow);
  require(S.hp === 5.5 && S.hpMax === 8 && !S.paused && !d.DLG.isOpen(), 'Геймпад применил здоровье дважды или оставил hold');
  result.push({kind:'gamepad-health',hp:S.hp,hpMax:S.hpMax});
} finally { navigator.getGamepads = oldPads; }

// После «Ок» Escape прекращает только полёт уже начисленного бафа.
fixture(7, 7, 0.25);
flow = C.showLunch(() => resumed++); await waitChoice(); tap('Digit1');
require(await until(() => C.MEAL.active?.stage === 'effects' && document.querySelector('.meal-flight'), 15000), 'Нет стадии полёта');
const resumeBeforeFlightEscape = resumed;
tap('Escape'); await settle(flow);
require(resumed === resumeBeforeFlightEscape + 1, 'Escape прервал обед без продолжения заказа');
require(!C.MEAL.active && !document.querySelector('.meal-flight') && !S.paused && !S.meal && !d.DLG.isOpen() && d.NOS.tank === 1, 'Escape не отменил полёт/откатил баф/оставил hold');
result.push({kind:'escape-during-flight',committed:true});

// Настоящий B на геймпаде во время полёта тоже продолжает выдачу ровно один раз.
fixture(7, 7, 0.25);
navigator.getGamepads = () => [gp];
try {
  flow = C.showLunch(() => resumed++); await waitChoice(); tap('Digit1');
  require(await until(() => C.MEAL.active?.stage === 'effects' && document.querySelector('.meal-flight'), 15000), 'Нет стадии полёта для B');
  const resumeBeforeFlightB = resumed;
  await press(1); await settle(flow);
  require(resumed === resumeBeforeFlightB + 1 && !C.MEAL.active && !S.meal && !S.paused && !d.DLG.isOpen() && d.NOS.tank === 1, 'B оставил обед без продолжения либо повторил эффект');
  result.push({kind:'gamepad-cancel-flight',resumedOnce:true});
} finally { navigator.getGamepads = oldPads; }

// Общая старая карточка тоже держит паузу: уборка переписки её не снимает.
fixture(7, 7, 0.4);
flow = C.showLunch(() => resumed++); await waitChoice();
d.showMeal();
require(d.CH.pause && S.paused && S.meal, 'Не открылась настоящая чужая карточка с паузой');
tap('Escape'); await settle(flow);
require(S.paused && S.meal && d.CH.pause && !d.DLG.isOpen(), 'Уборка обеда сняла чужую паузу');
d.CH.opts[0].fn = () => {}; // изолируем старую noncareer-еду/выдачу: здесь проверяем владельца её настоящей паузы
d.pickChoice(0); // чужой экран закрывается своим штатным владельцем
require(!S.paused && !S.meal, 'Чужой экран не освободил собственную паузу');
result.push({kind:'foreign-pause-preserved',ok:true});

// Вечером это тот же единственный перерыв, с названием «ужин».
fixture(7,7,0.4); C.skipTo(19);
flow = C.showLunch(() => resumed++); await waitChoice();
require(document.querySelector('#dlg .dlg-what').textContent.includes('ужин'),'Вечерний перерыв не назван ужином');
tap('Escape'); await settle(flow);
result.push({kind:'dinner',ok:true});

// Старый двухкнопочный протокол (Геннадий и остальные разговоры) сохраняет boolean.
for (const [text,answer] of [['Проверка первого обычного диалога',true],['Проверка второго обычного диалога',false]]) {
  flow = d.DLG.say({ canonicalName:true,name:'Проверка',text,fillers:false,accept:'Да',decline:'Нет' });
  require(await until(() => {
    const root = document.querySelector('#dlg.on:not(.dlg-phone):not(.dlg-talking)');
    return root?.querySelector('.dlg-text')?.textContent === text && root.querySelector('.dlg-btns.on');
  },10000),'Новая обычная реплика не готова');
  await wait(400); document.querySelector(answer ? '#dlg .dlg-yes' : '#dlg .dlg-no').click();
  require(await settle(flow) === answer, 'Старый DLG перестал возвращать точный boolean');
}
// Возврат настоящим игровым переходом back→handover→atBase(newOrder).
// handT не меняем, newOrder не вызываем: таймер возврата и callback обслуживает игра.
C.skipTo(14); C.SH.lunch = false;
d.backToBase(); tp(d.PIZZA.x,d.PIZZA.z);
await waitChoice();
const ordersBeforeResume = S.orders;
tap('Digit1');
require(await until(() => C.MEAL.active?.stage === 'effects' && document.querySelector('.meal-flight'), 15000), 'Настоящий atBase не довёл обед до эффекта');
tap('Escape');
require(await until(() => S.orders === ordersBeforeResume + 1 && !!S.order && !C.MEAL.active, 8000), 'После отмены полёта настоящий возврат остался в handover без обычного заказа');
require(!S.order.story && !S.paused && !S.meal, 'После обеда выдан неверный заказ/осталась пауза');
await wait(350);
require(S.orders === ordersBeforeResume + 1, 'Закрытие выдало следующий заказ дважды');
result.push({kind:'at-base-real-order',before:ordersBeforeResume,after:S.orders,state:S.state});

// Штатный конец смены отменяет ещё открытый вопрос и не вызывает next.
fixture(7, 7, 0.4);
flow = C.showLunch(() => resumed++); await waitChoice();
const resumeBeforeEnd = resumed;
d.endShift('смена окончена'); await settle(flow);
require(S.state === 'over' && !C.MEAL.active && !S.meal && !S.paused && !document.querySelector('.meal-flight') && !d.DLG.isOpen() && resumed === resumeBeforeEnd, 'Конец смены оставил паузу/hold либо выдал следующий заказ');
result.push({kind:'end-shift-cancels-meal',state:S.state});
return { ok: true, result, resumed, legacyBoolean: true };
