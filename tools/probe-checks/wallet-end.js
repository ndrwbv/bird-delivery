/* Приёмка19: анимация уже сохранённого кошелька не начисляет деньги. */
await onShift(); autopilot(false);
const C = d.CAREERM, SS = C.SSTEPS, S = d.S;
const require = (yes, message) => { if (!yes) throw new Error(message); };
const money = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
require(C.SH.wallet0 === d.wallet(), 'Начальный кошелёк не сохранён до денег смены');
const wallet = d.wallet(), wasPaused = S.paused;
S.paused = true;
let paused = false, completed = 0;
const host = document.createElement('div');
host.id = 'wallet-check'; host.style.cssText = 'position:fixed;inset:0;z-index:999;background:#000';
document.body.appendChild(host);
const result = [];
const start = (before, gain, after) => {
  host.hidden = false;
  SS.play({ host, paused: () => paused, screens: [{ id: 'cash', before, after, total: gain, head: 'Проверка кошелька', money, fmt,
    rows: [{ k: 'заказы', n: gain }] }] }, () => completed++);
};
try {
  // Прочие изменения — честная разница, а не восстановленный из заработка стартовый баланс.
  const cases = [
    { before: 10000, gain: 5000, after: 15000, other: 0 },
    { before: 10000, gain: 5000, after: 11000, other: -4000 },
    { before: 1000, gain: 5000, after: 100, other: -5900 },
    { before: 10000, gain: 5000, after: 17000, other: 2000 },
    { before: 10000, gain: 0, after: 10000, other: 0 },
    { before: 10000, gain: 0, after: 8000, other: -2000 },
    { before: 10000, gain: -500, after: 7500, other: -2000 },
    { before: -1000, gain: 2000, after: 1000, other: 0 },
  ];
  for (const c of cases) {
    const summary = SS.walletSummary(c.before,c.gain,c.after);
    require(summary.before === c.before && summary.other === c.other && summary.adjusted + summary.gain === c.after, 'Арифметика кошелька не сходится');
    start(c.before,c.gain,c.after);
    require(+host.querySelector('[data-wallet]').dataset.wallet === c.before, 'Показан выдуманный начальный кошелёк');
    require([...host.querySelectorAll('.ss-rows .pp-row')].every(row => getComputedStyle(row).visibility !== 'hidden'), 'Подробности ждут анимацию');
    await wait(400);
    if (c.gain <= 0) require(!document.querySelector('.ss-wallet-bill'), 'Нулевой/отрицательный заработок получил положительные купюры');
    let rangeOK=true;
    require(await until(() => {
      const shown=+host.querySelector('[data-wallet]').dataset.wallet;
      rangeOK=rangeOK&&shown>=Math.min(c.before,c.after)&&shown<=Math.max(c.before,c.after);
      return !SS.state.anim;
    },5000), 'Кошелёк не дошёл до конца');
    require(rangeOK,'Выдуманный промежуточный баланс за пределами начала/итога');
    require(+host.querySelector('[data-wallet]').dataset.wallet === c.after && d.wallet() === wallet, 'Анимация изменила сохранённые деньги либо итог не сошёлся');
    require(!document.querySelector('.ss-wallet-bill'), 'После конца остались купюры');
    result.push({ ...c, shown: c.after });
  }
  // На внешней паузе стоит и число, и полёт.
  start(10000,5000,15000); await wait(450); paused = true;
  const frozen = host.querySelector('[data-wallet]').dataset.wallet;
  const billStyle = [...document.querySelectorAll('.ss-wallet-bill')].map(el => el.style.cssText).join('|');
  await wait(400);
  require(host.querySelector('[data-wallet]').dataset.wallet === frozen && [...document.querySelectorAll('.ss-wallet-bill')].map(el => el.style.cssText).join('|') === billStyle, 'Внешняя пауза не остановила анимацию');
  paused = false; await wait(180);
  SS.ok(); // первое A/Enter — мгновенный точный итог, без новой выплаты
  require(+host.querySelector('[data-wallet]').dataset.wallet === 15000 && !document.querySelector('.ss-wallet-bill') && d.wallet() === wallet, 'Пропуск не завершил визуальный кошелёк точно');
  // Повторный вход в280мс выхода старого последнего листа: старый done не завершает новый показ.
  start(10000,5000,15000); await wait(400);
  const doneBeforeReplace=completed;
  SS.skip(); start(20000,1000,21000);
  await wait(400);
  require(SS.state.on&&SS.state.id==='cash'&&completed===doneBeforeReplace&&host.querySelector('[data-wallet]'),'Таймер старого выхода оборвал новый показ/вызвал его done');
  SS.ok();
  require(+host.querySelector('[data-wallet]').dataset.wallet===21000&&d.wallet()===wallet,'Повторный вход в выход старого листа изменил деньги/потерял новый баланс');
  // Закрытие/повторный вход не оставляют старые кадры/купюры.
  start(10000,5000,15000); await wait(400); host.hidden = true; SS.ok(); await wait(60);
  require(!SS.state.on && !document.querySelector('.ss-wallet-bill') && d.wallet() === wallet, 'Закрытый итог продолжает анимацию/меняет деньги');
  start(10000,5000,15000); await wait(400); SS.skip();
  require(await until(() => !SS.state.on, 1200), 'Пропустить всё не завершил показ');
  require(!document.querySelector('.ss-wallet-bill') && d.wallet() === wallet, 'Повторный вход/пропуск повторно начислил деньги');
} finally { host.hidden = true; SS.ok(); host.remove(); S.paused = wasPaused; }

// Настоящий итог смены: оплата уже в балансе, сохранённый старт не выводится вычитанием.
S.order = null; S.state = 'drive'; S.money = 4200; S.tips = 200; S.delivered = 2;
const atStart = C.SH.wallet0;
d.addWallet(4200); d.addWallet(-1700); // уже заработанное и настоящая трата, не анимационная выплата
const beforeEnd = d.wallet();
d.endShift('смена окончена');
require(await until(() => SS.state.id === 'cash', 5000), 'Настоящий итог не открыл копилку');
require(SS.cash?.before === atStart && SS.cash?.after === beforeEnd && SS.cash?.other === -1700, 'Покупка за смену потерялась в показанном балансе');
await wait(400); SS.skip();
require(await until(() => document.querySelector('#over .cr-rc-balance-sum'), 5000), 'В конечном чеке нет общего кошелька');
require(d.wallet() === beforeEnd && document.querySelector('#over .cr-rc-balance-sum').textContent === money(beforeEnd), 'Чек повторно начислил деньги либо показывает старый кошелёк');
const shifts = d.Store.get('dlv-shifts',0);
await wait(1800);
require(d.wallet() === beforeEnd && d.Store.get('dlv-shifts',0) === shifts && !document.querySelector('.ss-wallet-bill'), 'После закрытия анимации прошла повторная выплата/смена');
// Полный конец следующей смены: заработок уже сохранён, сейчас платятся только прежние bonus/win.
const afterEarlyEnd = d.wallet();
await onShift();autopilot(false);d.acceptOrder();
S.order=null;S.state='drive';S.money=6500;S.tips=450;S.delivered=5;
d.addWallet(6500);
const beforeFullEnd=d.wallet(),fullStart=C.SH.wallet0;
d.endShift('время');
const expectedBonus=C.SH.bonus+ C.SH.win,fullWallet=d.wallet();
require(fullWallet-beforeFullEnd===expectedBonus,'Полный конец повторно начислил заработок либо изменил существующую премию');
require(await until(()=>SS.state.id==='cash',5000),'Полный конец не открыл копилку');
require(SS.cash?.before===fullStart&&SS.cash?.after===fullWallet&&SS.cash?.gain===6500+expectedBonus,'Полный расчёт не совпал с началом/сохранённым балансом');
await wait(400);SS.skip();
require(await until(()=>!SS.state.on&&document.querySelector('#over .cr-rc-balance-sum')?.textContent===money(fullWallet),5000),'Конечный чек полного расчёта показывает другой баланс');
const fullShiftCounter=d.Store.get('dlv-shifts',0);
await wait(2200);
require(d.wallet()===fullWallet&&d.Store.get('dlv-shifts',0)===fullShiftCounter&&!document.querySelector('.ss-wallet-bill'),'Полный расчёт выплатился повторно после пропуска/ожидания');
return { ok:true, cases:result, paused:true, skip:true, closed:true, repeated:true, beforeEnd, afterEarlyEnd, atStart, completed,
 full:{beforeFullEnd,bonus:C.SH.bonus,win:C.SH.win,expectedBonus,fullWallet,delta:fullWallet-beforeFullEnd,fullShiftCounter} };
