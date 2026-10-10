/* Мини-игра у клиента: встреча у двери (трек 10 п. 7, 10.10.2026; было — разговор с тремя ответами, 09.10).
   Правила словами — docs/ORDERS.md «Разговор с клиентом». Когда выпадает и что даёт деньгами — doorstep.js (числа — ECON.TALK);
   кто что говорит — smalltalk-lines.js; здесь — только экран.

   Как идёт (5—10 с): портрет человека (говорит ртом — talkface.js), его реплика, под ней ДВА коротких ответа столбиком.
   Курсор — стрелки / W S / крестовина (стик), выбрать — Enter / пробел / A, палец — тап; 1 / 2 — сразу ответ.
   Ответил — одна короткая реакция (или молча закрыл дверь), печать итога — и всё. Отдельного таймера нет: идёт срок заказа.
   Не ответил за T.wait — человек закрывает дверь сам (итог «ничего»).

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { sit: id встречи ('' — случайная), person, fem (true / false / null), who (имя на подписи),
          T: { arm, end, wait } (с), pct: { rush, keep, fun } (проценты для итога), clock() → { s, k } | null }
     api: t, ADULT, faceDataURL, makePerson (песочница), log, done(итог), setStep, setPad, paused, sfx (pick, blab, coin, sad), bonus(вид).
   Итог (doorstep.js talkAdjust читает kind / win / none — деньги считает он):
     { kind: 'keep' | 'fun' | 'rush' | '', win, none, out, row, mood, who, bonus, timeout, sit, pick: 0 | 1, t }
       out 'tip' → kind 'keep' (+KEEP_TIP, респект) · 'big' → 'fun' + win (+FUN_TIP) · 'cut' → 'rush' (чаевые × RUSH_K) ·
       'none' → 'fun' без win (без чаевых) · '0' → '' (ничего); row — строка в чеке (ru-ключ), mood — лицо на мини-карточке. */
import './smalltalk.css';
import { inputKind, onInput, glyph } from '../../input/glyphs.js';
import { SITS, WHO } from './smalltalk-lines.js';
import * as TF from '../talkface.js';           // человек говорит ртом, пока печатается его реплика

const N_ = s => s;
const DT_MAX = 0.1;
const CPS = 40;                // букв в секунду: человек говорит
const ME_T = 0.45;             // с: ответ курьера — потом реакция
const READ_T = 0.9;            // с: реакция допечаталась — ещё столько висит
const REPLY_MIN = 1.4;         // с: от ответа до печати — не меньше
const RECENT = 8;              // столько последних встреч не повторяются

/* итог ответа: вид для doorstep.js, печать, строка в чеке по умолчанию */
const OUT = {
  tip:  { kind: 'keep', seal: N_('тепло'), cls: 'pp-seal-green', row: N_('понравился клиенту'), plus: true },
  big:  { kind: 'fun', win: true, seal: N_('восторг'), cls: 'pp-seal-pink', row: N_('клиент в восторге'), plus: true },
  cut:  { kind: 'rush', seal: N_('обида'), cls: 'pp-seal-rust', row: N_('клиенту не понравилось') },
  none: { kind: 'fun', win: false, seal: N_('облом'), cls: 'pp-seal-red', row: N_('остался без чаевых') },
  0:    { kind: '', seal: N_('ну и ладно'), cls: '', row: '' },
};
let recent = [];

/* кто подходит: взрослая / детская, пол клиента (у встречи или у её «кто») */
const sitFem = s => (s.fem !== undefined ? s.fem : WHO[s.who] ? WHO[s.who].fem : undefined);
export function pool (adult, fem) {
  return SITS.filter(s => (!s.adult || adult) && (sitFem(s) === undefined || fem === null || fem === undefined || sitFem(s) === !!fem));
}
/* встреча для показа: детская версия — с мягкими заменами (kids) */
function view (s, adult) {
  if (adult || !s.kids) return s;
  const k = s.kids;
  return Object.assign({}, s, k, { a: Object.assign({}, s.a, k.a || {}), b: Object.assign({}, s.b, k.b || {}) });
}
export function pickSit (adult, fem, id) {
  let s = id ? SITS.find(q => q.id === id) : null;
  if (!s) {
    const all = pool(adult, fem);
    const last = recent.length ? SITS.find(q => q.id === recent[recent.length - 1]) : null;
    // не та же встреча из последних RECENT и не тот же человек два раза подряд
    let p = all.filter(q => !recent.includes(q.id) && !(last && q.who !== 'normis' && q.who === last.who));
    if (!p.length) p = all.filter(q => q.id !== recent[recent.length - 1]);
    if (!p.length) p = all;
    s = p[(Math.random() * p.length) | 0] || SITS[0];
  }
  recent = recent.filter(q => q !== s.id).concat(s.id).slice(-RECENT);
  return view(s, adult);
}
/* портрет «переодевается» под роль (WHO.look): своя копия человека — свой кэш портретов */
function dress (person, who) {
  const w = WHO[who];
  if (!person || !w || !w.look || !person.look) return person;
  return Object.assign({}, person, { id: String(person.id || person.look.seed || 'p') + '~' + who, look: Object.assign({}, person.look, w.look) });
}

export default {
  id: 'smalltalk', name: 'встреча у двери',
  note: 'Человек говорит одну-две фразы, у курьера два коротких ответа столбиком: стрелки / крестовина — выбрать, Enter / A — ответить (1 / 2 — сразу). Реакция — и всё, 5—10 с.',
  knobs: [
    { k: 'sit', label: 'встреча', type: 'sel', def: '', opts: [['', 'случайная']].concat(SITS.map(s => [s.id, s.id + ' · ' + s.who + (s.adult ? ' (18+)' : '')])) },
    { k: 'fem', label: 'клиент — женщина', type: 'bool', def: false },
  ],
  mount (root, o, api) {
    const t = api.t;
    const T = Object.assign({ arm: 0.45, end: 1.1, wait: 20 }, o.T || {});
    if (!(T.wait > 0)) T.wait = 20;
    const PCT = Object.assign({ rush: 50, keep: 15, fun: 30 }, o.pct || {});
    const fem = o.fem === undefined ? null : o.fem;
    const sit = pickSit(!!api.ADULT, fem, o.sit);
    const wfem = sitFem(sit);
    const base = o.person || (api.makePerson ? api.makePerson({ seed: 0x5A11 + sit.id.length * 977 + sit.who.length * 131, fem: wfem !== undefined ? wfem : !!fem }) : null);
    const person = dress(base, sit.who);
    const who = o.who || (base ? (base.first || String(base.name || '').split(/\s+/)[0]) : '') || t('клиент');
    const ans = [sit.a, sit.b];
    const st = { t: 0, phase: 'ask', cur: 0, pick: -1, timeout: false, bonus: null, note: '', rt: 0,
      text: '', shown: 0, tt: 0, blabT: 0, endT: 0, res: null, replyAt: 0, slam: false };
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');

    const box = document.createElement('div');
    box.className = 'tk';
    box.innerHTML =
      '<section class="pp-sheet tk-sheet pp-in">' +
        '<header class="pp-head"><span>' + esc(t('у двери')) + '</span><b class="tk-clock"></b></header>' +
        '<div class="tk-body">' +
          '<figure class="tk-who pp-tilt-l"><img class="pp-polaroid tk-face" alt=""><figcaption>' + esc(who) + '</figcaption></figure>' +
          '<div class="tk-talk">' +
            '<p class="tk-say"><span class="tk-txt"></span><i class="tk-caret"></i></p>' +
            '<p class="tk-me" hidden></p>' +
            '<p class="tk-note" hidden></p>' +
          '</div>' +
        '</div>' +
        '<div class="tk-opts">' + ans.map((x, i) => '<button type="button" tabindex="-1" data-i="' + i + '" class="tk-o' + (i === 0 ? ' tk-cur' : '') + '" disabled><b>' + esc(t(x.me)) + '</b></button>').join('') + '</div>' +
        '<p class="tk-out" hidden></p>' +
        '<p class="tk-hint"></p>' +
      '</section>';
    const q = s => box.querySelector(s);
    const elClock = q('.tk-clock'), elTxt = q('.tk-txt'), elSay = q('.tk-say'), elMe = q('.tk-me'), elNote = q('.tk-note'),
      elFace = q('.tk-face'), elWho = q('.tk-who'), elOpts = q('.tk-opts'), elOut = q('.tk-out'), elSheet = q('.tk-sheet'), elHint = q('.tk-hint');
    const btns = [...box.querySelectorAll('.tk-o')];
    let faceMood = null;
    const setFace = mood => {
      if (mood === faceMood) return;
      faceMood = mood;
      if (person && api.faceDataURL && TF.bind(elFace, person, 128, mood)) return;   // кадры рта — talkface.js
      let u = '';
      try { u = person && api.faceDataURL ? api.faceDataURL(person, 128, mood) : ''; } catch (e) { u = ''; }
      if (u && elFace.getAttribute('src') !== u) elFace.src = u;
      if (!u) elFace.classList.add('tk-noface');
    };
    setFace(sit.emo || 'ok');

    /* подсказка управления — одной строкой внизу: геймпад / клавиатура / палец */
    const hint = () => {
      const k = inputKind().kind;
      box.dataset.input = k;
      elHint.textContent = k === 'pad' ? t('крестовина — выбрать · {a} — ответить', { a: glyph('ok') })
        : k === 'touch' ? t('нажми на ответ') : t('↑ ↓ — выбрать · Enter — ответить');
    };
    const setCur = i => {
      if (st.phase !== 'ask') return;
      st.cur = (i + ans.length) % ans.length;
      btns.forEach((b, j) => b.classList.toggle('tk-cur', j === st.cur));
    };
    const say = (text, mood) => {
      st.text = text; st.shown = 0; st.tt = 0;
      elTxt.textContent = '';
      elSay.classList.remove('tk-pop'); void elSay.offsetWidth; elSay.classList.add('tk-pop');
      if (mood) setFace(mood);
      if (!text) return;
      elWho.classList.add('tk-talking');
      TF.talk(elFace);
    };
    say(t(sit.say), sit.emo || 'ok');

    /* ответил: что сказал курьер и что выпало */
    function pick (i, timeout) {
      if (st.phase !== 'ask' || (!timeout && st.t < T.arm)) return;
      const x = timeout ? { me: '', re: N_('…Ну и стой.'), mood: 'angry', out: '0', slam: true } : ans[i];
      if (!x) return;
      st.phase = 'reply'; st.pick = timeout ? -1 : i; st.timeout = !!timeout; st.rt = 0; st.x = x;
      box.classList.add('tk-replied');                       // ответ курьера — над реакцией (читается сверху вниз)
      btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('tk-picked', j === i && !timeout); b.classList.toggle('tk-off', j !== i || timeout); });
      elOpts.hidden = true;
      elHint.hidden = true;
      elMe.hidden = false;
      elMe.textContent = timeout ? t('…молча стоит…') : t(x.me);
      elMe.classList.toggle('tk-mute', !!timeout);
      if (x.bonus) {
        let b = null;
        try { b = api.bonus ? api.bonus(x.bonus) : null; } catch (e) { b = null; }
        if (!b && !api.bonus) b = x.bonus === 'find' ? { kind: 'find', note: t('находка — на карте') } : { kind: 'zhenya', note: t('у Дяди Жени −{n} %', { n: 20 }) };
        if (b) { st.bonus = b.kind || x.bonus; st.note = b.note; }
      }
      sfx('pick');
      api.log && api.log((timeout ? 'молчал' : (i === 0 ? 'верхний' : 'нижний') + ' «' + x.me + '»') + ' → ' + x.out + (st.bonus ? ', бонус ' + st.bonus : ''));
    }

    function finish () {
      st.phase = 'end';
      st.endT = T.end;
      const x = st.x, O = OUT[x.out] || OUT[0];
      const seal = document.createElement('div');
      seal.className = 'pp-seal ' + O.cls + ' tk-seal';
      seal.textContent = t(O.seal);
      elSheet.appendChild(seal);
      const money = x.out === 'tip' ? t('чаевые +{n} % · респект +1', { n: PCT.keep }) : x.out === 'big' ? t('чаевые +{n} %', { n: PCT.fun })
        : x.out === 'cut' ? t('чаевые −{n} %', { n: PCT.rush }) : x.out === 'none' ? t('без чаевых') : '';
      const row = x.row || O.row;
      const line = [x.row ? t(x.row) : '', money].filter(Boolean).join(' · ');
      elOut.hidden = false;                                   // пустая строка — место под печать
      elOut.className = 'tk-out ' + (O.plus ? 'pp-plus' : x.out === '0' ? '' : 'pp-minus');
      elOut.textContent = line;
      sfx(O.plus ? 'coin' : x.out === '0' ? 'pick' : 'sad');
      st.res = { kind: O.kind, win: !!O.win, none: false, out: x.out, row, mood: x.mood || 'ok', who: sit.who, bonus: st.bonus,
        timeout: st.timeout, sit: sit.id, pick: st.pick, t: +st.t.toFixed(2) };
    }

    function typeStep (dt) {
      if (st.shown >= st.text.length) { elWho.classList.remove('tk-talking'); TF.stop(elFace); return true; }
      st.tt += dt;
      const n = Math.min(st.text.length, Math.floor(st.tt * CPS));
      if (n !== st.shown) { st.shown = n; elTxt.textContent = st.text.slice(0, n); }
      st.blabT -= dt;
      if (st.blabT <= 0) { st.blabT = 0.09; sfx('blab'); }
      return false;
    }

    function step (dt) {
      dt = Math.min(DT_MAX, Math.max(0, dt));
      // срок заказа — словами, как часы на хаде: осталось ≤ 40 % — «горит», ≤ 18 % или меньше 10 с — «вот-вот опоздаешь»
      const c = o.clock ? o.clock() : null;
      const lvl = !c ? '' : c.s <= 0 ? 'late' : (c.k <= 0.18 || c.s < 10) ? 'low' : c.k <= 0.4 ? 'warn' : 'ok';
      if (lvl !== st.lvl) {
        st.lvl = lvl;
        elClock.textContent = lvl === 'late' ? t('опоздал') : lvl === 'low' ? t('вот-вот опоздаешь!') : lvl === 'warn' ? t('срок горит') : lvl ? t('срок идёт') : '';
        elClock.className = 'tk-clock' + (lvl ? ' tk-' + lvl : '');
      }
      if (st.phase === 'ask') {
        st.t += dt;
        typeStep(dt);
        if (st.t >= T.arm && btns[0].disabled) btns.forEach(b => { b.disabled = false; });
        if (st.t >= T.wait) pick(-1, true);
      } else if (st.phase === 'reply') {
        st.t += dt; st.rt += dt;
        if (st.rt >= ME_T && !st.replyAt) { st.replyAt = st.rt; say(t(st.x.re || ''), st.x.mood); }
        const typed = st.replyAt ? typeStep(dt) : false;
        if (typed && st.note && elNote.hidden) { elNote.hidden = false; elNote.textContent = st.note; elNote.classList.add('tk-pop'); }
        if (typed && st.x.slam && !st.slam) { st.slam = true; elWho.classList.add('tk-gone'); const s = document.createElement('p'); s.className = 'tk-slam'; s.textContent = t('хлоп! — дверь закрылась'); q('.tk-talk').appendChild(s); sfx('sad'); }
        if (typed && st.rt >= Math.max(REPLY_MIN, st.replyAt + (st.text.length / CPS) + READ_T)) finish();
      } else if (st.phase === 'end') {
        st.endT -= dt;
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
      }
    }

    function pad (p) {
      if (st.phase !== 'ask') return;
      if (p.menuUp) setCur(st.cur - 1);
      else if (p.menuDown || p.dDown) setCur(st.cur + 1);
      else if (p.menuOk || p.accept) pick(st.cur);
    }
    /* клавиатура — раньше игры (capture): стрелки / W S, Enter / пробел, 1 2; Esc — пауза игры, не наша */
    const onKey = e => {
      if (st.phase === 'done' || (api.paused && api.paused())) return;
      const c = e.code;
      let act = '';
      if (c === 'ArrowUp' || c === 'KeyW') act = 'up';
      else if (c === 'ArrowDown' || c === 'KeyS') act = 'down';
      else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') act = 'ok';
      else if (/^(Digit|Numpad)[12]$/.test(c)) act = 'n' + c.slice(-1);
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время встречи
      if (!act) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || st.phase !== 'ask') return;
      if (act === 'up') setCur(st.cur - 1);
      else if (act === 'down') setCur(st.cur + 1);
      else if (act === 'ok') pick(st.cur);
      else { setCur(+act.slice(1) - 1); pick(st.cur); }
    };
    addEventListener('keydown', onKey, true);
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('.tk-o');
      if (!b || (api.paused && api.paused())) return;
      e.preventDefault();
      setCur(+b.dataset.i);
      pick(+b.dataset.i);
    });
    box.addEventListener('pointermove', e => { const b = e.target.closest('.tk-o'); if (b && e.pointerType === 'mouse') setCur(+b.dataset.i); });

    root.appendChild(box);
    hint();
    const offInput = onInput(hint);
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    // для проверок (probe): ответить как игрок — 0 / 'a' верхний (и прежние 'rush', как автопилот), 1 / 'b' нижний ('keep', 'fun')
    box.__solve = (arg = 0) => {
      const i = arg === 1 || arg === 'b' || arg === 'keep' || arg === 'fun' ? 1 : 0;
      st.t = Math.max(st.t, T.arm); setCur(i); pick(i);
    };
    box.__sit = sit.id;
    box.__who = sit.who;
    return () => {
      removeEventListener('keydown', onKey, true);
      offInput();
      TF.stop(elFace);
      if (raf) cancelAnimationFrame(raf);
      if (api.setStep) api.setStep(null);
      if (api.setPad) api.setPad(null);
      box.remove();
    };
  },
};
