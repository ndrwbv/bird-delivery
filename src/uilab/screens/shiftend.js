/* Песочница интерфейса: конец смены — «чек смены» (career.js showEnd + shiftend.js): чек влетает, строки
   допечатываются, итог щёлкает, печать хлопает, стикер Толика; штамп «на новую смену [A]», пометки
   [Y] гараж и траты · [X] депнуть · [B] в меню. Всё — настоящим кодом игры.
   Ручки ставят то, из чего игра сама считает итоги: сохранение (смен, районы, сбито за карьеру),
   S (заработок, заказы, чаевые), SH (удары, штраф). Бонус и настроение — как в игре (econ.js),
   настроение можно и задать руками. */
import { setInput } from '../../input/glyphs.js';

const MOODS = [['auto', 'как посчитает игра'], ['bad', 'плохая (мдаа)'], ['ok', 'так себе'], ['great', 'отличная']];
const WHY = [
  ['время', 'досидел до конца (бонус)'],
  ['смена окончена', 'снялся сам'],
  ['сбил клиента', 'сбил своего клиента (сняли)'],
  ['машина всё', 'машина разбита'],
  ['утонул', 'утонул'],
];
/* машина для листа «акт осмотра» (shiftsteps.js carState: детали 0—3, стёкла 0—2) */
const CAR_DMG = {
  none: { parts: {}, glass: {}, dents: 0, lost: [] },
  light: { parts: { bf: 1, fl: 1 }, glass: { f: 1 }, dents: 3, lost: [] },
  heavy: { parts: { hood: 2, bf: 3, dfl: 1, fr: 2, rl: 1, trunk: 1 }, glass: { f: 1, l: 2 }, dents: 9, lost: ['bf', 'mirror'] },
  wreck: { parts: { hood: 3, bf: 3, br: 3, dfl: 2, dfr: 3, trunk: 3, fl: 2, fr: 2, rl: 2, rr: 1 }, glass: { f: 2, b: 1, l: 2, r: 1 }, dents: 21, lost: ['hood', 'bf', 'br', 'dfr', 'trunk', 'mirror', 'hub'] },
};
const STEP_IDS = ['cash', 'dep', 'rank', 'car', 'check'];
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
    note: 'career.js showEnd: чек смены (строки, итог, печать), стикер Толика, штамп [A] и пометки [Y] [X] [B]. Как в игре, только без города. Значки — по вводу (ручка «чем играют»).',
    knobs: [
      { k: 'earned', label: 'заработал за смену, ₽', type: 'num', def: 24000, min: 0, max: 400000, step: 1000 },
      { k: 'delivered', label: 'заказов доставлено', type: 'num', def: 7, min: 0, max: 40, step: 1 },
      { k: 'tips', label: 'чаевые, ₽', type: 'num', def: 1800, min: 0, max: 50000, step: 100 },
      { k: 'why', label: 'как кончилась смена', type: 'sel', def: 'время', opts: WHY },
      { k: 'fine', label: 'штраф за клиента, ₽ (если сбил)', type: 'num', def: 4000, min: 0, max: 50000, step: 500 },
      { k: 'late', label: 'опоздания и другие штрафы, ₽', type: 'num', def: 0, min: 0, max: 50000, step: 500 },
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
      { k: 'sheet', label: 'экраны по очереди: с какого листа', type: 'sel', def: 'cash', opts: [['cash', '1. деньги (копилка)'], ['dep', '2. «давай депнем?»'], ['rank', '3. рейтинг смены'], ['car', '4. машина (акт осмотра)'], ['check', '5. чек смены'], ['off', 'без экранов (как было)']] },
      { k: 'depOffer', label: '«давай депнем?»', type: 'sel', def: 'yes', opts: [['yes', 'показать'], ['auto', 'как в игре'], ['no', 'нет']] },
      { k: 'crew', label: 'коллег на смене (0 — без рейтинга)', type: 'num', def: 4, min: 0, max: 6, step: 1 },
      { k: 'place', label: 'твоё место в смене', type: 'num', def: 2, min: 1, max: 7, step: 1 },
      { k: 'carDmg', label: 'машина', type: 'sel', def: 'heavy', opts: [['none', 'целая'], ['light', 'чуть помята'], ['heavy', 'побита'], ['wreck', 'в хлам']] },
      { k: 'hp', label: 'сердец осталось', type: 'num', def: 2, min: 0, max: 8, step: 1 },
      { k: 'cond', label: 'мотор в конце, %', type: 'num', def: 74, min: 5, max: 100, step: 1 },
      { k: 'stage', label: 'на чеке: с какого шага', type: 'sel', def: 'all', opts: [['all', 'всё по порядку'], ['end', 'сразу выбор'], ['spend', 'сразу «гараж и траты»'], ['dep', 'сразу «депнуть»']] },
      { k: 'input', label: 'чем играют (значки)', type: 'sel', def: 'xbox', opts: [['kb', 'клавиатура'], ['xbox', 'геймпад Xbox / Deck'], ['ps', 'геймпад PlayStation'], ['touch', 'касание']] },
    ],
    async show (o, tok) {
      if (o.input === 'xbox' || o.input === 'ps') setInput('pad', o.input); else if (o.input) setInput(o.input);
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
      SH.lost = SH.fine + (+o.late || 0); SH.m = S.money;   // чек: все вычеты за смену (career.js watchMoney)
      CM.skipTo(o.why === 'время' ? 24 : Math.max(9.1, Math.min(23.95, +o.endH || 17)));
      // экраны по очереди (shiftsteps.js): рейтинг смены, машина, «давай депнем?» — руками
      const nc = Math.max(0, Math.min(6, +o.crew || 0)), place = Math.max(1, Math.min(nc + 1, +o.place || 1));
      const NAMES = ['Лена', 'Гоша', 'Витя', 'Даша', 'Олег', 'Стас'], fem = [true, false, false, true, false, false], GEN = ['Лены', 'Гоши', 'Вити', 'Даши', 'Олега', 'Стаса'];
      const d0 = +o.delivered || 0, others = [];
      for (let i = 0; i < nc; i++) {
        const k = i < place - 1 ? place - 1 - i : -(i - place + 2);   // выше тебя — больше заказов
        const p = ctx.makePerson({ seed: 9100 + i * 37, fem: fem[i] });
        p.first = NAMES[i]; p.firstGen = GEN[i];
        others.push({ n: NAMES[i], d: Math.max(0, d0 + k), m: Math.max(0, (+o.earned || 0) + k * 2600), hex: '#3f7fd6', person: p, out: i === nc - 1 && nc > 3 });
      }
      const board = others.slice(0, place - 1).concat([{ n: 'Андрей', d: d0, m: +o.earned || 0, me: true }], others.slice(place - 1));
      A.shiftBoard = () => board;
      A.shiftTop = () => (nc ? { place, n: nc, top: board[0].n } : null);
      A.car = null;
      const hpMax = 4;
      SH.forceCar = { ...CAR_DMG[o.carDmg] || CAR_DMG.none, name: t('Семёрка'), hp: Math.min(+o.hp || 0, 8), hpMax: Math.max(hpMax, +o.hp || 0), cond: +o.cond || 0,
        cond0: Math.min(100, (+o.cond || 0) + 4), ceil: 96, km: 9, kmText: '9', hits: SH.hits, repair: (+o.cond || 0) < 95 ? ECON.repairQuote(+o.cond || 0, 96).price : 0 };
      SH.forceDep = o.depOffer === 'auto' ? '' : o.depOffer;
      const SS = CM.SSTEPS;
      CM.showEnd(o.why, WHY_TEXT[o.why] ? t(WHY_TEXT[o.why]) : '', true);
      // к нужному листу: анимацию — сразу, «дальше» (на «давай депнем?» — «не сейчас»)
      const want = STEP_IDS.indexOf(o.sheet);
      if (o.sheet === 'off') SS.skip(true);
      for (let i = 0; i < 12 && !tok.dead && SS.state.on && want >= 0; i++) {
        const st = SS.state, at = STEP_IDS.indexOf(st.id);
        if (at >= want) break;
        await sleep(360);
        if (SS.state.anim) { SS.ok(); await sleep(360); }
        if (SS.state.id === 'dep') { if (!CM.closeDep()) SS.alt(); } else SS.ok();   // «давай депнем?» — сразу окно депа (0п60): «не сейчас» = закрыть его
      }
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
