/* Мини-игра у клиента: разговор у двери (IDEAS блок 13, 09.10.2026). Правила словами — docs/ORDERS.md «Разговор с клиентом».
   Когда выпадает и что даёт деньгами — doorstep.js (числа — ECON.TALK); кто что говорит — smalltalk-lines.js; здесь — только экран.

   Формат мини-игры песочницы (src/uilab/minigames.js): export default { id, name, note, knobs, mount }.
   mount(root, o, api) → убрать за собой.
     o: { sit: id ситуации ('' — случайная), person, fem (true / false / null — не знаем), T: { ask, rush, keep, fun, end, arm } (с),
          p: { rushNone, funWin, bonusP } (шансы), pct: { rush, keep, fun, zhenya } (проценты для подписей), clock() → { s: с до срока, k: доля срока } | null }
     api: t, ADULT, faceDataURL(person, size, mood), makePerson (песочница), log(текст), done(итог) — кончилась
          (итог: { kind: 'rush' | 'keep' | 'fun', timeout, none, win, bonus, sit, t });
          в игре ещё: setStep(fn(dt)) — время идёт кадрами игры (пауза его стоит), setPad(fn(p)) — кнопки геймпада,
          paused(), sfx(имя) — звук (pick, blab, coin, sad), bonus(вид) → { line, note } — подсказка про находку /
          скидка у Дяди Жени (без него — пример для песочницы).
   Как играют: клиент начинает фразу, у курьера три ответа — A / 1 «поторопить», X / 2 «поддержать», Y / 3 смешной;
   клавиатура — 1 2 3 (и Enter, X, Y), палец — тап. Не ответил за T.ask — «кивал молча» (как «поддержать»). */
import './smalltalk.css';
import { inputKind, onInput, glyph } from '../../input/glyphs.js';
import { SITS, KIND, RUSH_ME, BONUS } from './smalltalk-lines.js';
import * as TF from '../talkface.js';           // клиент говорит ртом, пока печатается его реплика

const DT_MAX = 0.1;
const CPS = 42;                // букв в секунду: клиент говорит
const ME_T = 0.6;              // с: реплика курьера — потом клиент отвечает
const READ_T = 1.0;            // с: ответ клиента допечатался — ещё столько висит
const KINDS = ['rush', 'keep', 'fun'];
let lastId = '';

/* какие ситуации подходят: взрослая / детская, кто говорит (женщина / мужчина) */
export function pool (adult, fem) {
  return SITS.filter(s => (!s.adult || adult) && (s.fem === undefined || fem === null || fem === undefined || s.fem === !!fem));
}
export function pickSit (adult, fem, id) {
  if (id) { const s = SITS.find(q => q.id === id); if (s) return s; }
  const all = pool(adult, fem), p = all.filter(s => s.id !== lastId);
  const s = (p.length ? p : all)[(Math.random() * (p.length || all.length)) | 0] || SITS[0];
  lastId = s.id;
  return s;
}

export default {
  id: 'smalltalk', name: 'разговор у двери',
  note: 'Клиент заводит разговор, у курьера 3 ответа: A / 1 поторопить, X / 2 поддержать, Y / 3 смешной. Не ответил за 7 с — «кивал молча». Весь разговор 5—11 с.',
  knobs: [
    { k: 'sit', label: 'ситуация', type: 'sel', def: '', opts: [['', 'случайная']].concat(SITS.map(s => [s.id, s.id + (s.adult ? ' (18+)' : '')])) },
    { k: 'fem', label: 'клиент — женщина', type: 'bool', def: false },
    { k: 'win', label: 'смешной — зайдёт', type: 'bool', def: true },
  ],
  mount (root, o, api) {
    const t = api.t;
    const T = Object.assign({ ask: 7, rush: 2, keep: 5.5, fun: 3.2, end: 1.1, arm: 0.45 }, o.T || {});
    const P = Object.assign({ rushNone: 0.3, funWin: o.win === false ? 0 : o.win === true ? 1 : 0.5, bonusP: 0.2 }, o.p || {});
    const PCT = Object.assign({ rush: 50, keep: 15, fun: 30, zhenya: 20 }, o.pct || {});
    const fem = o.fem === undefined ? null : o.fem;
    const sit = pickSit(!!api.ADULT, fem, o.sit);
    const person = o.person || (api.makePerson ? api.makePerson({ seed: 0x5A11 + sit.id.length * 977, fem: sit.fem !== undefined ? sit.fem : !!fem }) : null);
    const who = o.who || (person ? (person.first || String(person.name || '').split(/\s+/)[0]) : '') || t('клиент');
    const st = { t: 0, phase: 'ask', kind: '', timeout: false, none: false, win: false, bonus: null, rt: 0,
      text: '', shown: 0, tt: 0, blabT: 0, endT: 0, res: null, me: '', replyAt: 0 };
    const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* — */ } };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
    const face = mood => { try { return person && api.faceDataURL ? api.faceDataURL(person, 128, mood) : ''; } catch (e) { return ''; } };

    const box = document.createElement('div');
    box.className = 'tk';
    const subs = [
      t('быстро · чаевые −{n} %', { n: PCT.rush }),
      t('дольше · чаевые +{n} % и респект', { n: PCT.keep }),
      t('зайдёт — +{n} %, нет — без чаевых', { n: PCT.fun }),
    ];
    const meLines = [t(RUSH_ME[(Math.random() * RUSH_ME.length) | 0]), t(sit.keep[0]), t(sit.fun[0])];
    box.innerHTML =
      '<section class="pp-sheet tk-sheet pp-in">' +
        '<header class="pp-head"><span>' + esc(t('у двери')) + ' · ' + esc(t(KIND[sit.kind] || KIND.weird)) + '</span><b class="tk-clock"></b></header>' +
        '<div class="tk-fuse" aria-hidden="true"><i></i></div>' +
        '<div class="tk-body">' +
          '<figure class="tk-who pp-tilt-l"><img class="pp-polaroid tk-face" alt=""><figcaption>' + esc(who) + '</figcaption></figure>' +
          '<div class="tk-talk">' +
            '<p class="tk-say"><span class="tk-txt"></span><i class="tk-caret"></i></p>' +
            '<p class="tk-me" hidden></p>' +
            '<p class="tk-note" hidden></p>' +
          '</div>' +
        '</div>' +
        '<div class="tk-opts">' + KINDS.map((k, i) => '<button type="button" tabindex="-1" data-i="' + i + '" class="tk-o tk-' + k + '" disabled>' +
          '<kbd class="pp-key tk-g"></kbd><b>' + esc(meLines[i]) + '</b><span>' + esc(subs[i]) + '</span></button>').join('') + '</div>' +
        '<p class="tk-out" hidden></p>' +
      '</section>';
    const q = s => box.querySelector(s);
    const elFuse = q('.tk-fuse i'), elClock = q('.tk-clock'), elTxt = q('.tk-txt'), elSay = q('.tk-say'), elMe = q('.tk-me'), elNote = q('.tk-note'),
      elFace = q('.tk-face'), elWho = q('.tk-who'), elOpts = q('.tk-opts'), elOut = q('.tk-out'), elSheet = q('.tk-sheet');
    const btns = [...box.querySelectorAll('.tk-o')];
    let faceMood = null;
    const setFace = mood => {
      if (mood === faceMood) return;
      faceMood = mood;
      if (person && api.faceDataURL && TF.bind(elFace, person, 128, mood)) return;   // кадры рта — talkface.js
      const u = face(mood); if (u && elFace.getAttribute('src') !== u) elFace.src = u; if (!u) elFace.classList.add('tk-noface');
    };
    setFace(sit.emo || 'ok');

    /* значки: геймпад — A / X / Y (PlayStation — ✕ □ △), клавиатура — 1 2 3, палец — без значков */
    const glyphs = () => {
      const k = inputKind().kind;
      box.dataset.input = k;
      btns.forEach((b, i) => { b.querySelector('.tk-g').textContent = k === 'pad' ? glyph(['ok', 'x', 'y'][i]) : k === 'kb' ? String(i + 1) : ''; });
    };
    const say = (text, mood) => {
      st.text = text; st.shown = 0; st.tt = 0;
      elTxt.textContent = '';
      elSay.classList.remove('tk-pop'); void elSay.offsetWidth; elSay.classList.add('tk-pop');
      elWho.classList.add('tk-talking');
      if (mood) setFace(mood);
      TF.talk(elFace);
    };
    say(t(sit.say), sit.emo || 'ok');

    /* ответил: что сказал курьер и что выпало */
    function pick (i, timeout) {
      if (st.phase !== 'ask' || (!timeout && st.t < T.arm)) return;
      const kind = KINDS[i] || 'keep';
      st.phase = 'reply'; st.kind = kind; st.timeout = !!timeout; st.rt = 0;
      box.classList.add('tk-replied');                       // реплика курьера — над ответом клиента (читается сверху вниз)
      btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('tk-picked', j === i && !timeout); b.classList.toggle('tk-off', j !== i || timeout); });
      elMe.hidden = false;
      elMe.textContent = timeout ? t('…молча кивает…') : meLines[i];
      elMe.classList.toggle('tk-mute', !!timeout);
      let reply = '', mood = 'happy';
      if (kind === 'rush') { st.none = Math.random() < P.rushNone; reply = t(sit.rush); mood = st.none ? 'angry' : 'sad'; }
      else if (kind === 'fun') { st.win = Math.random() < P.funWin; reply = t(st.win ? sit.fun[1] : sit.fun[2]); mood = st.win ? 'happy' : 'angry'; }
      else {
        reply = t(sit.keep[1]);
        st.bonus = sit.bonus || (Math.random() < P.bonusP ? (Math.random() < 0.5 ? 'find' : 'zhenya') : null);
        if (st.bonus) {
          let b = null;
          try { b = api.bonus ? api.bonus(st.bonus) : null; } catch (e) { b = null; }
          if (!b && !api.bonus) b = st.bonus === 'find'
            ? { line: t(BONUS.find, { what: t('аудиокассета'), where: t('за рекой'), m: 400 }), note: t('находка — на карте') }
            : { line: t(BONUS.zhenya, { n: PCT.zhenya }), note: t('у Дяди Жени −{n} %', { n: PCT.zhenya }) };
          if (b) { st.bonus = b.kind || st.bonus; reply += ' ' + b.line; st.note = b.note; } else st.bonus = null;
        }
      }
      st.reply = reply; st.mood = mood;
      sfx('pick');
      api.log && api.log((timeout ? 'молчал' : kind) + (st.none ? ', без чаевых' : '') + (kind === 'fun' ? (st.win ? ', зашло' : ', не зашло') : '') + (st.bonus ? ', бонус ' + st.bonus : ''));
    }

    function finish () {
      st.phase = 'end';
      st.endT = T.end;
      const k = st.kind;
      const seal = document.createElement('div');
      const [word, cls, out] = k === 'rush' ? [t('бегом!'), 'pp-seal-rust', st.none ? t('обиделся — без чаевых') : t('чаевые −{n} %', { n: PCT.rush })]
        : k === 'fun' ? (st.win ? [t('зашло!'), 'pp-seal-pink', t('чаевые +{n} %', { n: PCT.fun })] : [t('не зашло'), 'pp-seal-red', t('без чаевых')])
          : [t('по душам'), 'pp-seal-green', t('чаевые +{n} % · респект +1', { n: PCT.keep })];
      seal.className = 'pp-seal ' + cls + ' tk-seal';
      seal.textContent = word;
      elSheet.appendChild(seal);
      elOpts.hidden = true;
      elOut.hidden = false;
      elOut.className = 'tk-out ' + (k === 'keep' || (k === 'fun' && st.win) ? 'pp-plus' : 'pp-minus');
      elOut.textContent = out;
      sfx(k === 'keep' || (k === 'fun' && st.win) ? 'coin' : 'sad');
      st.res = { kind: k, timeout: st.timeout, none: st.none, win: st.win, bonus: st.bonus, sit: sit.id, t: +st.t.toFixed(2) };
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
        const k = Math.max(0, 1 - st.t / T.ask);
        elFuse.style.transform = 'scaleX(' + k.toFixed(3) + ')';
        elFuse.parentNode.classList.toggle('tk-hot', k < 0.3);
        if (st.t >= T.ask) pick(1, true);
      } else if (st.phase === 'reply') {
        st.t += dt; st.rt += dt;
        elFuse.style.transform = 'scaleX(0)';
        if (st.rt >= ME_T && !st.replyAt) { st.replyAt = st.rt; say(st.reply, st.mood); }
        const typed = st.replyAt ? typeStep(dt) : false;
        if (typed && st.note && elNote.hidden) { elNote.hidden = false; elNote.textContent = st.note; elNote.classList.add('tk-pop'); }
        if (typed && st.rt >= Math.max(T[st.kind] || 2, st.replyAt + (st.text.length / CPS) + READ_T)) finish();
      } else if (st.phase === 'end') {
        st.endT -= dt;
        if (st.endT <= 0) { st.phase = 'done'; api.done && api.done(st.res); }
      }
    }

    function pad (p) {
      if (st.phase !== 'ask') return;
      if (p.menuOk || p.accept) pick(0);
      else if (p.btnX) pick(1);
      else if (p.btnY) pick(2);
    }
    /* клавиатура — раньше игры (capture): 1 2 3, Enter, X, Y; Esc — пауза игры, не наша */
    const onKey = e => {
      if (st.phase === 'done' || (api.paused && api.paused())) return;
      const c = e.code;
      let i = -1;
      if (/^(Digit|Numpad)[123]$/.test(c)) i = +c.slice(-1) - 1;
      else if (c === 'Enter' || c === 'NumpadEnter') i = 0;
      else if (c === 'KeyX') i = 1;
      else if (c === 'KeyY') i = 2;
      else if (c === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }   // карта — не во время разговора
      if (i < 0) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) pick(i);
    };
    addEventListener('keydown', onKey, true);
    box.addEventListener('pointerdown', e => {
      const b = e.target.closest('.tk-o');
      if (!b || (api.paused && api.paused())) return;
      e.preventDefault();
      pick(+b.dataset.i);
    });

    root.appendChild(box);
    glyphs();
    const offInput = onInput(glyphs);
    let raf = 0, last = 0;
    if (api.setStep) api.setStep(step);
    else {
      const loop = now => { raf = requestAnimationFrame(loop); step(last ? (now - last) / 1000 : 0); last = now; };
      raf = requestAnimationFrame(loop);
    }
    if (api.setPad) api.setPad(pad);
    // для проверок (probe): ответить как игрок (по умолчанию — «поторопить», как автопилот)
    box.__solve = (kind = 'rush') => { st.t = Math.max(st.t, T.arm); pick(Math.max(0, KINDS.indexOf(kind))); };
    box.__sit = sit.id;
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
