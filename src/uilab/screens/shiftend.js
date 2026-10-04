/* Песочница интерфейса: конец смены — один экран (career.js showEnd + shiftend.js): Толик одной фразой →
   деньги смены сыплются в большую копилку → важное строками и выбор («на новую смену», «депнуть»,
   «потратить деньги», «гараж» · «покататься» · «в меню»). Всё — настоящим кодом игры.
   Ручки ставят то, из чего игра сама считает итоги: сохранение (смен, районы, сбито за карьеру),
   S (заработок, заказы, чаевые), SH (удары, штраф). Бонус и настроение — как в игре (econ.js),
   настроение можно и задать руками. */
const MOODS = [['auto', 'как посчитает игра'], ['bad', 'плохая (мдаа)'], ['ok', 'так себе'], ['great', 'отличная']];
const WHY = [
  ['время', 'досидел до конца (бонус)'],
  ['смена окончена', 'снялся сам'],
  ['сбил клиента', 'сбил своего клиента (сняли)'],
  ['машина всё', 'машина разбита'],
  ['утонул', 'утонул'],
];
const WHY_TEXT = { 'машина всё': 'машина разбита — кончились сердца', 'утонул': 'машина ушла под воду — вплавь не довезёшь' };

export default function shiftEndScreens (ctx) {
  const { A, Store, CM, END, DIST, ECON, t, sleep, $, log } = ctx;
  const dists = DIST.list().map((d, i) => [i, (i + 1) + '. ' + d.name]);

  /* показать сразу: Толик сказал, деньги в копилке, кнопки видны */
  async function skipAll (tok) {
    await sleep(120);
    for (let i = 0; i < 10 && !tok.dead && END.active(); i++) { END.skip(); await sleep(400); }
  }

  const full = {
    id: 'shiftend', group: 'Конец смены', name: 'конец смены целиком',
    note: 'career.js showEnd: Толик одной фразой → деньги в копилку → выбор (на новую смену, депнуть, потратить). Как в игре, только без города.',
    knobs: [
      { k: 'earned', label: 'заработал за смену, ₽', type: 'num', def: 24000, min: 0, max: 400000, step: 1000 },
      { k: 'delivered', label: 'заказов доставлено', type: 'num', def: 7, min: 0, max: 40, step: 1 },
      { k: 'tips', label: 'чаевые, ₽', type: 'num', def: 1800, min: 0, max: 50000, step: 100 },
      { k: 'why', label: 'как кончилась смена', type: 'sel', def: 'время', opts: WHY },
      { k: 'fine', label: 'штраф за клиента, ₽ (если сбил)', type: 'num', def: 4000, min: 0, max: 50000, step: 500 },
      { k: 'endH', label: 'во сколько снялся (если не досидел)', type: 'num', def: 17, min: 9, max: 23.9, step: 0.5 },
      { k: 'hits', label: 'ударов за смену', type: 'num', def: 2, min: 0, max: 50, step: 1 },
      { k: 'people', label: 'прохожих сбито за смену', type: 'num', def: 0, min: 0, max: 30, step: 1 },
      { k: 'knocked', label: 'сбито за всю карьеру (Толик при переводе)', type: 'num', def: 3, min: 0, max: 500, step: 1 },
      { k: 'mood', label: 'настроение Толика', type: 'sel', def: 'auto', opts: MOODS },
      { k: 'shiftN', label: 'какая это смена (длина: 1—3 короткие…)', type: 'num', def: 5, min: 1, max: 60, step: 1 },
      { k: 'district', label: 'район, где работаешь', type: 'sel', def: 0, opts: dists },
      { k: 'transfer', label: 'эта смена открывает следующий район (перевод)', type: 'bool', def: false },
      { k: 'city', label: 'весь город открыт (режим «весь город»)', type: 'bool', def: false },
      { k: 'wallet', label: 'в кошельке до смены, ₽', type: 'num', def: 15000, min: 0, max: 2000000, step: 1000 },
      { k: 'stage', label: 'с какого шага', type: 'sel', def: 'all', opts: [['all', 'всё по порядку'], ['end', 'сразу выбор'], ['spend', 'сразу «потратить деньги»'], ['dep', 'сразу «депнуть»']] },
    ],
    async show (o, tok) {
      const n = DIST.count(), di = Math.max(0, Math.min(n - 1, +o.district || 0));
      // сохранение: смены, сбитые, районы
      Store.clear();
      Store.set('dlv-shifts', Math.max(0, (+o.shiftN || 1) - 1));
      Store.set('dlv-knocked', Math.max(0, +o.knocked || 0));
      Store.set('dlv-name', '');
      Store.set('dlv-crew', { me: 40000, n: 5, crew: [{ seed: 101, total: 52000 }, { seed: 202, total: 30000 }, { seed: 303, total: 61000 }, { seed: 404, total: 18000 }] });
      const counts = DIST.list().map((_, i) => (o.city ? DIST.need(i) : i < di ? DIST.need(i) : i === di && o.transfer ? Math.max(0, DIST.need(i) - 1) : 0));
      Store.set('dlv-dist-shifts', counts);
      Store.set('dlv-dist-open', o.city ? n : di + 1);
      Store.set('dlv-district', di);
      Store.set('dlv-city-mode', o.city ? 1 : 0);
      Store.set('dlv-clock', '');
      A.setWallet(+o.wallet || 0);
      CM.startShift();
      CM.SH.forceMood = o.mood !== 'auto' ? o.mood : '';   // career.js moodOf — настроение руками
      // смена: заработок, заказы; деньги смены — уже в кошельке (как в игре: оплата сразу туда)
      const S = A.S;
      Object.assign(S, { money: +o.earned || 0, delivered: +o.delivered || 0, tips: +o.tips || 0, people: +o.people || 0, state: 'over' });
      A.addWallet(S.money);
      const SH = CM.SH;
      SH.hits = +o.hits || 0;
      SH.fine = o.why === 'сбил клиента' ? +o.fine || 0 : 0;
      CM.skipTo(o.why === 'время' ? 24 : Math.max(9.1, Math.min(23.95, +o.endH || 17)));
      CM.showEnd(o.why, WHY_TEXT[o.why] ? t(WHY_TEXT[o.why]) : '', true);
      log('смена ' + (SH.n + 1) + ' (' + (SH.len && SH.len.id) + ') · настроение ' + SH.mood + ' · бонус ' + ctx.money(SH.bonus || 0) +
        (SH.opened >= 0 ? ' · открыт район «' + t(DIST.list()[SH.opened].name) + '»' : '') + (SH.counted ? '' : ' · смена не засчитана'));
      if (o.stage !== 'all') await skipAll(tok);
      if (tok.dead) return;
      if (o.stage === 'spend') CM.openSpend();
      else if (o.stage === 'dep') CM.openDep();
    },
  };

  return [full];
}
