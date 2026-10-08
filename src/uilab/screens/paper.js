/* Песочница интерфейса: образец стиля «как накладная» (пачка П0, docs/UI-REVIEW.md) —
   лист со шапкой, строками, печатью итога, штампом [A], пометками на полях и стикером Толика.
   Только классы src/styles/paper.css и значки src/input/glyphs.js — чтобы агенты и автор видели
   набор целиком. Тексты образца — без перевода (песочница в сборки не попадает). */
import { keyHTML, setInput } from '../../input/glyphs.js';
import * as PFX from '../../game/paperfx.js';

const SEALS = [['done', 'ВЫПОЛНЕНО (зелёная)'], ['quit', 'СНЯЛСЯ (красная)'], ['dead', 'СПИСАН (красная)'], ['best', 'РЕКОРД (розовая)'],
  ['open', 'ОТКРЫТ (зелёная)'], ['shut', 'ЗАКРЫТ (красная)'], ['none', 'без печати']];
const SEAL = { done: ['выполнено', 'green'], quit: ['снялся', 'red'], dead: ['списан', 'red'], best: ['рекорд', 'pink'], open: ['открыт', 'green'], shut: ['закрыт', 'red'] };
const INPUTS = [['kb', 'клавиатура'], ['xbox', 'геймпад Xbox / Steam Deck'], ['ps', 'геймпад PlayStation'], ['touch', 'касание']];

export default function paperScreens (ctx) {
  const { $, makePerson, faceDataURL, money, sleep } = ctx;
  return [{
    id: 'paper', group: 'Стиль: как накладная', name: 'лист-образец',
    note: 'paper.css + glyphs.js: лист (или чек) на столе, печать итога с хлопком, штамп [A], пометки [Y] [X] [B], стикер Толика. Значки — по выбранному вводу; курсор геймпада — класс padsel.',
    knobs: [
      { k: 'input', label: 'чем играют', type: 'sel', def: 'xbox', opts: INPUTS },
      { k: 'paper', label: 'бумага', type: 'sel', def: 'receipt', opts: [['receipt', 'чек (зубчатый край)'], ['sheet', 'лист (перфорация)']] },
      { k: 'seal', label: 'печать', type: 'sel', def: 'done', opts: SEALS },
      { k: 'focus', label: 'курсор геймпада', type: 'sel', def: 'stamp', opts: [['stamp', 'на штампе'], ['note', 'на пометке'], ['none', 'нет']] },
      { k: 'tolik', label: 'стикер Толика', type: 'bool', def: true },
      { k: 'ride', label: 'режим «в езде» (тихо: .pp-ride)', type: 'bool', def: false },
      { k: 'calm', label: '«меньше движения» (body.calm-fx)', type: 'bool', def: false },
    ],
    async show (o, tok) {
      if (o.input === 'xbox' || o.input === 'ps') setInput('pad', o.input); else setInput(o.input);
      const face = faceDataURL(makePerson({ seed: 0x2E4A17, fem: false }), 96);
      const seal = SEAL[o.seal];
      const box = document.createElement('div');
      box.id = 'ul-paper';
      box.className = 'pp-desk' + (o.ride ? ' pp-ride' : '');
      document.body.classList.toggle('calm-fx', !!o.calm);
      box.innerHTML = `
        <section class="${o.paper === 'sheet' ? 'pp-sheet' : 'pp-receipt'} pp-in">
          <header class="pp-head"><span>чек смены · Юг</span><b>№ 0007</b></header>
          <p class="pp-row"><span>доставлено</span><i></i><b>5 заказов</b></p>
          <p class="pp-row"><span>заработано</span><i></i><b class="pp-plus">+3 161 ₽</b></p>
          <p class="pp-row"><span>чаевые</span><i></i><b class="pp-plus">+420 ₽</b></p>
          <p class="pp-row"><span>штраф за клиента</span><i></i><b class="pp-minus">−420 ₽</b></p>
          <p class="pp-row"><span>бонус за смену</span><i></i><b class="pp-plus">+2 100 ₽</b></p>
          <p class="pp-row pp-total"><span>итого</span><i></i><b class="pp-plus" id="ul-pp-sum">0 ₽</b></p>
          <p class="pp-hint">Кольцо — ещё 3 смены · в копилке теперь 42 600 ₽</p>
          ${seal ? `<div class="pp-seal pp-seal-${seal[1]} pp-seal-inline" style="visibility: hidden">${seal[0]}</div>` : ''}
          <button class="pp-stamp" autofocus>${keyHTML('ok')}на новую смену</button>
        </section>
        ${o.tolik ? `<aside class="pp-sticker pp-in-side"><img class="pp-polaroid" src="${face}" alt="">
          <p><span class="pp-label">Толик</span>ну вот, можешь же, когда не врезаешься</p></aside>` : ''}
        <nav class="pp-margin">
          <button class="pp-note">${keyHTML('y')}гараж и траты</button>
          <button class="pp-note pp-red">${keyHTML('x')}депнуть</button>
          <button class="pp-note">${keyHTML('back')}в меню</button>
        </nav>`;
      ($('game') || document.body).appendChild(box);
      const pick = o.focus === 'stamp' ? box.querySelector('.pp-stamp') : o.focus === 'note' ? box.querySelector('.pp-note') : null;
      if (pick) pick.classList.add('padsel');
      ctx.cleanup = () => { box.remove(); document.body.classList.remove('calm-fx'); };
      // акценты по очереди: лист влетел → строки допечатались → деньги щёлкнули → печать хлопнула → штамп шлёпнул
      const rows = box.querySelectorAll('.pp-row, .pp-hint');
      PFX.stagger(rows, 0.08, 0.35);
      await sleep(o.ride || o.calm ? 150 : 350 + rows.length * 80);
      if (tok.dead) return;
      const sum = box.querySelector('#ul-pp-sum');
      await PFX.countUp(sum, 0, 5261, { ms: 800, fmt: n => '+' + money(n) });
      if (tok.dead) return;
      const sl = box.querySelector('.pp-seal');
      if (sl) { sl.style.visibility = ''; PFX.replay(sl, 'pp-seal'); }
      if (o.seal === 'done' || o.seal === 'best' || o.seal === 'open') PFX.burst(sum, { kind: o.seal === 'best' ? 'confetti' : 'coins' });
      await sleep(260);
      if (tok.dead) return;
      PFX.slam(box.querySelector('.pp-stamp'));
    },
  }];
}
