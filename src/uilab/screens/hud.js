/* Песочница интерфейса: окна поверх езды — чат Толика, накладная, оплата с лицом клиента, воскрешение.
   Чат — настоящий chat.js. Накладная, оплата и воскрешение живут в game.js (его без мира не запустить),
   поэтому тут — копии их заполнения на тех же узлах index.html и тех же стилях delivery.css:
     накладная   — game.js showOrderCard + orders.js cardRows (полоса цвета и «СРОЧНО» — настоящий orders.js card)
     оплата      — game.js popPay + payMood (лицо клиента: злое / покерфейс / сердечки)
     воскрешение — game.js askRevive + showChoice + надпись #wasted (deathFx)
   Поменял заполнение в game.js — поправь копию тут. Вёрстка и стили — общие, их править только в игре. */
import { translit } from '../../i18n/index.js';
import { ORDER_TYPES } from '../../game/orders.config.js';
import { STORIES } from '../../game/story.js';

const ADDR = ['Ленинградская улица, 21', 'проспект Коммунистический, 51', 'улица Калинина, 85', 'улица Мира, 12', 'Северная улица, 7', 'улица Победы, 3', 'Солнечная улица, 40'];
const NOTES = ['в подъезде живёт кот, он главный', 'стучать ногой, руками нельзя', 'если не открыл — значит открыл', 'просил без ананасов, но с ананасами',
  'у двери стоит стул, это его стул', 'подойдёт после серии, серия идёт третий час', 'пароль от домофона — «пицца123»'];
const PIZZAS = ['пепперони', 'маргарита', 'четыре сыра', 'мясная', 'гавайская', 'птичий микс'];
const ZONES = [['normal', 'город'], ['poor', 'частный сектор'], ['rich', 'особняки'], ['garage', 'гаражи'], ['ind', 'промзона'], ['gang', 'бандитский район']];
const CHAT_KINDS = [['fast', 'быстро — хвалит'], ['bundle', 'сборный вовремя — хвалит'], ['late', 'опоздал — ругает, вычитает'], ['bump', 'задел клиента'],
  ['kill', 'сбил клиента'], ['urgent', 'срочный сорвал'], ['all', 'все по очереди (стопка из трёх)'], ['say', 'свой текст']];

export default function hudScreens (ctx) {
  const { ADULT, t, tn, money, makePerson, faceDataURL, CHAT, ORD, ECON, DIST, $, log, sleep } = ctx;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const people = (seed, n, long) => Array.from({ length: n }, (_, i) => {
    const p = makePerson({ seed: seed + i * 31 });
    if (long) { const q = makePerson({ seed: seed + 900 + i }); p.name = p.name + '-' + (q.last || q.name.split(/\s+/).pop()) + ' ' + (q.first || ''); }
    return p;
  });

  /* ── чат Толика управляющего (chat.js) ── */
  const chat = {
    id: 'chat', group: 'Окна поверх езды', name: 'чат Толика управляющего',
    note: 'chat.js: «печатает…», потом текст крупно на своём месте и уменьшается; больше трёх — старое выталкивается. Место — под хадом справа: включи «хад», чтобы видеть, как встаёт.',
    knobs: [
      { k: 'kind', label: 'что случилось', type: 'sel', def: 'all', opts: CHAT_KINDS },
      { k: 'text', label: 'свой текст', type: 'text', def: 'алло, ты где? клиент уже третий раз звонит' },
      { k: 'n', label: 'сколько раз подряд', type: 'num', def: 1, min: 1, max: 5, step: 1 },
    ],
    async show (o, tok) {
      const kinds = o.kind === 'all' ? ['fast', 'late', 'bump', 'kill'] : [o.kind];
      for (let r = 0; r < Math.max(1, +o.n || 1); r++) {
        for (const k of kinds) {
          if (tok.dead) return;
          if (k === 'say') CHAT.say(String(o.text || ''), null, false); else CHAT.react(k);
          log('Толик: ' + k);
          await sleep(kinds.length > 1 || +o.n > 1 ? 1300 : 0);
        }
      }
    },
  };

  /* ── накладная: копия game.js showOrderCard + orders.js cardRows ── */
  const zina = STORIES.find(s => s.id === 'zina');
  const invoice = {
    id: 'invoice', group: 'Окна поверх езды', name: 'накладная (карточка заказа)',
    note: 'Копия game.js showOrderCard: шапка с номером, таблица, фото на скрепке, «ГАЗ ГАЗ». Полоса цвета вида и печать «СРОЧНО» — настоящий orders.js card.',
    knobs: [
      { k: 'type', label: 'вид заказа', type: 'sel', def: 'pizza', opts: [['pizza', 'пицца'], ['urgent', 'срочно'], ['story', 'история (баба Зина)'], ['staff', 'развоз смены']] },
      { k: 'kind', label: 'сколько адресов', type: 'sel', def: 'solo', opts: [['solo', 'один адрес'], ['group', 'групповой (несколько человек на адресе)'], ['chain', 'последовательный'], ['bundle', 'сборный (свой адрес у каждого)']] },
      { k: 'stops', label: 'адресов (сборный, последовательный)', type: 'num', def: 3, min: 2, max: 7, step: 1 },
      { k: 'group', label: 'человек на адресе (групповой)', type: 'num', def: 3, min: 2, max: 5, step: 1 },
      { k: 'zone', label: 'район города', type: 'sel', def: 'normal', opts: ZONES },
      { k: 'district', label: 'район доставки', type: 'sel', def: 0, opts: DIST.list().map((d, i) => [i, d.name]) },
      { k: 'fee', label: 'оплата, ₽', type: 'num', def: 3200, min: 0, max: 100000, step: 100 },
      { k: 'no', label: 'номер заказа', type: 'num', def: 7, min: 1, max: 9999, step: 1 },
      { k: 'note', label: 'комментарий курьера', type: 'bool', def: true },
      { k: 'gate', label: 'пометка «шлагбаум»', type: 'bool', def: false },
      { k: 'long', label: 'длинные имена', type: 'bool', def: false },
    ],
    async show (o) {
      const el = $('phone');
      const solo = o.kind === 'solo' || o.type === 'story', group = o.kind === 'group' && !solo;
      const nStops = solo || group ? 1 : Math.max(2, +o.stops || 2);
      const stops = Array.from({ length: nStops }, (_, i) => ({
        persons: people(500 + i * 97, group ? Math.max(2, +o.group || 2) : 1, o.long),
        addr: translit(ADDR[i % ADDR.length]),
        note: o.note ? t(NOTES[i % NOTES.length]) : '',
      }));
      const ch = zina && zina.chapters[0];
      if (o.type === 'story' && ch) { stops[0].note = o.note ? t(ch.note) : ''; }
      const kind = o.type === 'staff' ? 'chain' : solo ? 'solo' : o.kind;
      const bundle = kind === 'bundle';
      const total = stops.reduce((n, s) => n + s.persons.length, 0);
      const order = {
        kind, stops,
        items: o.type === 'story' && zina ? t(zina.items) : o.type === 'staff' ? '' : total + ' × ' + t(PIZZAS[(+o.no || 0) % PIZZAS.length]),
        why: o.type === 'story' && ch ? t(ch.why) : o.type === 'staff' ? t('развоз смены') : o.type === 'urgent' ? t('срочный: ждёт дольше всех') : '',
        ord: { type: o.type, color: (ORDER_TYPES[o.type] || ORDER_TYPES.pizza).color, urgent: o.type === 'urgent', bundle: bundle ? {} : null, plain: o.type === 'pizza', zone: o.zone },
      };
      if (o.gate) order.why += (order.why ? ' · ' : '') + t('на парковку шлагбаум, объезжай');
      const KIND_LABEL = { group: t('групповой заказ'), chain: t('последовательный заказ'), bundle: t('сборный заказ'), solo: t('заказ') };
      $('ph-kind').textContent = t('накладная') + ' · ' + (KIND_LABEL[order.kind] || t('заказ'));
      const src = el.querySelector('.ph-src');
      if (src) src.textContent = '№ ' + String(+o.no || 1).padStart(4, '0');
      $('ph-accept').textContent = t('ГАЗ ГАЗ');
      const many = stops.length > 1;
      const face = (p, n) => '<div class="oc-p">' + (n ? '<em>' + n + '</em>' : '') + (p ? '<img src="' + faceDataURL(p) + '" alt="">' : '<i></i>') + '</div>';
      const persons = stops.flatMap(st => st.persons);
      const pics = stops.flatMap((st, i) => st.persons.map(p => face(p, many ? i + 1 : 0))).join('');
      const st0 = stops[0];
      const who = bundle ? stops.map((st, i) => '<b>' + (i + 1) + '. ' + st.persons.map(p => (p && p.name) || t('Иван Иванов')).join(', ') + '</b><small>' + st.addr + '</small>').join('')
        : persons.map(p => '<b>' + ((p && p.name) || t('Иван Иванов')) + '</b>' + (p && p.desc ? '<small>' + p.desc + '</small>' : '')).join('');
      const di = Math.max(0, Math.min(DIST.count() - 1, +o.district || 0));
      const ZL = { rich: 'особняки', gang: 'бандитский район', garage: 'гаражи', ind: 'промзона', poor: 'частный сектор', normal: 'город' };
      const rows = [
        [t('получатель'), who],
        bundle ? null : [t('адрес'), st0.addr + (many ? ' → ' + t('ещё {n}', { n: stops.length - 1 }) : '')],
        [t('заказ'), order.items],
        // orders.js cardRows: район и оплата
        [t('район'), esc(t(ZL[o.zone] || ZL.normal)) + ' · ' + esc(t(DIST.list()[di].name))],
        [t('оплата'), money(+o.fee || 0) + (order.ord.urgent ? ' · <b class="oc-urg">' + t('срочно') + '</b>' : '')],
        order.why ? [t('пометка'), order.why] : null,
        st0.note ? [t('комментарий курьера'), '«' + st0.note + '»'] : null,
      ].filter(Boolean);
      $('ph-list').innerHTML = '<div class="oc-sheet"><table class="oc-inv">' + rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('') + '</table>' +
        '<div class="oc-photos' + (persons.length > 2 ? ' small' : '') + '"><i class="oc-clip"></i>' + pics + '</div></div>';
      $('ph-what').textContent = order.items;
      $('ph-why').textContent = order.why;
      ORD.card(order);
      el.classList.add('on');
      document.body.classList.add('brief');
      $('ph-accept').onclick = () => { el.classList.remove('on'); document.body.classList.remove('brief'); log('«ГАЗ ГАЗ» — заказ принят'); };
    },
  };

  /* ── оплата: копия game.js popPay + payMood ── */
  const P = { el: null };
  const N = 14;
  function payEl () {
    if (P.el && P.el.isConnected) return P;
    const el = document.createElement('div');
    el.id = 'payfx'; el.hidden = true;
    el.innerHTML = '<div class="pf-pile"></div><div class="pf-r"><div class="pf-hd"><div class="pf-face" hidden><img alt=""><i></i><i></i><i></i></div><div class="pf-t"></div></div><div class="pf-sum"></div><div class="pf-chk"></div></div>';
    ($('bonus') ? $('bonus').parentNode : document.body).appendChild(el);
    Object.assign(P, { el, pile: el.querySelector('.pf-pile'), sum: el.querySelector('.pf-sum'), chk: el.querySelector('.pf-chk'), title: el.querySelector('.pf-t'), face: el.querySelector('.pf-face'), bits: [] });
    for (let k = 0; k < N; k++) {
      const b = document.createElement('i');
      b.textContent = '₽';
      b.style.setProperty('--r', (Math.random() * 40 - 20).toFixed(0) + 'deg');
      P.pile.appendChild(b); P.bits.push(b);
    }
    return P;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pay = {
    id: 'pay', group: 'Окна поверх езды', name: 'оплата и лицо клиента',
    note: 'Копия game.js popPay: кучка денег, сумма, чек и лицо клиента с настроением (злое — опоздал или задел машиной, сердечки — быстро или чаевые, покерфейс — впритык).',
    knobs: [
      { k: 'fee', label: 'за заказ, ₽', type: 'num', def: 3200, min: 0, max: 50000, step: 100 },
      { k: 'late', label: 'опоздал', type: 'bool', def: false },
      { k: 'tier', label: 'скорость', type: 'sel', def: 2, opts: [[0, 'впритык (меньше 25 % срока)'], [1, 'быстро («Шустро!»)'], [2, 'очень быстро («А ты харош!»)']] },
      { k: 'tip', label: 'чаевые, ₽', type: 'num', def: 0, min: 0, max: 20000, step: 100 },
      { k: 'rich', label: 'чаевые от богача', type: 'bool', def: false },
      { k: 'bumped', label: 'задел клиента машиной', type: 'bool', def: false },
      { k: 'hold', label: 'не убирать (рассмотреть)', type: 'bool', def: true },
    ],
    async show (o) {
      const fee = +o.fee || 0, tier = o.late ? 0 : +o.tier || 0;
      const bonus = tier ? Math.round(fee * (tier === 2 ? 0.25 : 0.12) / 10) * 10 : 0;
      const tip = o.late || o.bumped ? 0 : +o.tip || 0;
      const part = o.late ? Math.round(fee * 0.45) : fee + bonus + tip;
      const rows = [[t('заказ'), fee, '']];
      if (o.late) rows.push([t('опоздал'), part - fee, 'neg']);
      if (bonus) rows.push([t('за скорость'), bonus, 'tip']);
      if (tip) rows.push([o.rich ? t('чаевые от богача') : t('чаевые'), tip, 'tip']);
      const title = o.late ? t('клиент недоволен') : tier === 2 && bonus ? t('А ты харош!') : tier && bonus ? t('Шустро!') : o.rich && tip ? t('сдачи не надо!') : tip ? t('чаевые!') : '';
      const mood = o.late || o.bumped ? 'angry' : tier || tip ? 'happy' : 'ok';
      const Q = payEl();
      const person = makePerson({ seed: 4711 });
      Q.face.hidden = false;
      Q.face.className = 'pf-face ' + mood;
      Q.face.firstChild.src = faceDataURL(person, 64, mood);
      let plus = 0, coin = 0;
      for (const r of rows) if (r[1] > 0) { plus += r[1]; if (r[2] === 'tip') coin += r[1]; }
      const n = clamp(Math.round(N * (plus > 0 ? part / plus : 1)), 3, N);
      const nc = coin > 0 ? clamp(Math.round(n * coin / plus), 1, n - 1) : 0, nb = n - nc;
      Q.bits.forEach((b, k) => {
        const kind = k < nb ? 'b' : k < n ? 'c' : 'x';
        b.className = kind;
        if (kind === 'x') return;
        const j = kind === 'b' ? k : k - nb, row = kind === 'b' ? Math.floor(j / 3) : 2 + Math.floor(j / 4), col = kind === 'b' ? j % 3 : j % 4;
        b.style.left = (kind === 'b' ? 2 + col * 32 + (row % 2) * 10 : 8 + col * 21) + (Math.random() * 6 - 3) + '%';
        b.style.bottom = (kind === 'b' ? row * 17 : 30 + (row - 2) * 14) + Math.random() * 4 + '%';
        b.style.setProperty('--d', (k * 0.045).toFixed(3) + 's');
        b.style.setProperty('--fd', ((n - 1 - k) * 0.03).toFixed(3) + 's');
      });
      Q.title.textContent = title;
      Q.sum.textContent = (part >= 0 ? '+' : '−') + money(Math.abs(part));
      Q.sum.classList.toggle('late', rows.some(r => r[2] === 'neg'));
      Q.chk.innerHTML = rows.map(r => '<p class="' + (r[2] || '') + '"><span>' + r[0] + '</span><b>' + (r[1] < 0 ? '−' : '') + money(Math.abs(r[1])) + '</b></p>').join('');
      const el = Q.el;
      el.hidden = false;
      el.classList.remove('on', 'fly'); void el.offsetWidth; el.classList.add('on');
      log('оплата +' + money(part) + ' · лицо: ' + mood);
      if (o.hold) {
        // анимация входа (pf-in) уводит блок обратно — в «рассмотреть» держим конечный кадр
        await sleep(1300);
        if (el.classList.contains('on')) el.querySelector('.pf-r').style.animationPlayState = 'paused';
        ctx.cleanup = () => { const r = el.querySelector('.pf-r'); if (r) r.style.animationPlayState = ''; };
        return;
      }
      setTimeout(() => {
        const w = ($('money') || el).getBoundingClientRect(), wx = w.left + w.width / 2, wy = w.top + w.height / 2;
        for (let k = 0; k < n; k++) { const b = Q.bits[k], r = b.getBoundingClientRect(); b.style.setProperty('--fx', Math.round(wx - r.left - r.width / 2) + 'px'); b.style.setProperty('--fy', Math.round(wy - r.top - r.height / 2) + 'px'); }
        el.classList.add('fly');
      }, 1450);
      setTimeout(() => { el.classList.remove('on', 'fly'); el.hidden = true; }, 2450);
    },
  };

  /* ── воскрешение: копия game.js askRevive + showChoice, за ним — надпись #wasted ── */
  const revive = {
    id: 'revive', group: 'Окна поверх езды', name: 'окно воскрешения',
    note: 'Копия game.js askRevive: машина взорвалась — воскреснуть за деньги из кошелька (скидка раз в несколько смен, econ.js REVIVE). Не хватает денег — одна кнопка «ну что ж».',
    knobs: [
      { k: 'wallet', label: 'в кошельке, ₽', type: 'num', def: 12000, min: 0, max: 500000, step: 500 },
      { k: 'sale', label: 'скидка', type: 'sel', def: 0, opts: [[0, 'есть сейчас'], [1, 'через 1 смену'], [2, 'через 2 смены'], [3, 'через 3 смены']] },
      { k: 'why', label: 'как погиб (надпись сзади)', type: 'sel', def: 'машина всё', opts: [['машина всё', 'машина разбита'], ['утонул', 'утонул']] },
      { k: 'timer', label: 'таймер на ответ идёт', type: 'bool', def: true },
    ],
    async show (o, tok) {
      const shiftN = 10, wait = +o.sale || 0;
      const R = ECON.revivePrice(shiftN, wait ? shiftN - ECON.REVIVE.SALE_EVERY + wait : null);
      const price = R.price, have = +o.wallet || 0;
      // надпись смерти (game.js deathFx)
      const word = $('w-word');
      word.textContent = (o.why === 'утонул' ? t('утонул') : ADULT ? t('помер') : t('машина всё')).toUpperCase();
      $('w-sub').textContent = o.why === 'утонул' ? t('ВПЛАВЬ НЕ ДОВЕЗЁШЬ') : '';
      word.classList.toggle('long', word.textContent.length > 20);
      $('wasted').hidden = false;
      document.body.classList.add('w-show');
      const every = ECON.REVIVE.SALE_EVERY;
      const saleLine = R.sale ? t('скидка: {sale} вместо {full}', { sale: money(R.price), full: money(R.full) }) + ' · ' + tn(every, 'раз в {n} смену|раз в {n} смены|раз в {n} смен')
        : tn(R.wait, 'скидка {sale} — через {n} смену|скидка {sale} — через {n} смены|скидка {sale} — через {n} смен', { sale: money(ECON.REVIVE.SALE) });
      const choice = have < price
        ? { title: t('воскреснуть — {money}', { money: money(price) }), sub: t('в кошельке {money} — не хватает', { money: money(have) }) + ' · ' + saleLine,
          opts: [{ label: t('ну что ж'), r: 'нет денег' }], timeout: 4 }
        : { title: R.sale ? t('воскреснуть со скидкой?') : t('воскреснуть?'),
          sub: t('новая машина спустится с неба · из кошелька {money} (там {have})', { money: money(price), have: money(have) }),
          opts: [{ label: t('воскреснуть · {money}', { money: money(price) }) + (R.sale ? ' <s>' + money(R.full) + '</s>' : ''), sub: t('заказ и смена — дальше') + ' · ' + saleLine, r: 'воскрес' },
            { label: t('нет, всё'), r: 'нет, всё' }], timeout: 9 };
      // game.js showChoice({ …, full: true })
      const el = $('choice');
      $('ch-face').innerHTML = '';
      $('ch-t').textContent = choice.title;
      $('ch-s').innerHTML = choice.sub || '';
      $('ch-opts').innerHTML = choice.opts.map((q, i) => '<button type="button" data-i="' + i + '"><em>' + (i + 1) + '</em><b>' + q.label + '</b>' + (q.sub ? '<span>' + q.sub + '</span>' : '') + '</button>').join('');
      el.classList.add('big', 'full');
      el.dataset.kind = '';
      el.style.setProperty('--ch-left', '1');
      el.hidden = false;
      const done = r => { if (el.hidden) return; el.hidden = true; log('воскрешение: ' + r); };
      $('ch-opts').onclick = e => { const b = e.target.closest('button'); if (b) done(choice.opts[+b.dataset.i].r); };
      if (!o.timer) return;
      const t0 = performance.now(), T = choice.timeout * 1000;
      const tick = () => {
        if (tok.dead || el.hidden) return;
        const k = 1 - (performance.now() - t0) / T;
        if (k <= 0) { done('время вышло'); return; }
        el.style.setProperty('--ch-left', String(k));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };

  return [chat, invoice, pay, revive];
}
