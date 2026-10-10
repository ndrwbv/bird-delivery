/* Конец смены — «чек смены» (career.js showEnd рисует его в #over, правила — docs/CAREER.md «Конец смены»;
   стиль — src/styles/paper.css, движение — paperfx.js). С 09.10.2026 вместо копилки-свиньи с купюрами.
   Тот же чек годится для любого итога (быстрый заезд — quickrun.js может звать play со своими строками).

     END.play({ host, tap, head, no, why, rows, total, hints, seal, party, sticker, stamp, money, Snd }, done)
         host  — куда рисовать (#cr-stage); tap — где тап = «допечатать сразу» (#over);
         head  — шапка чека («чек смены · Юг»), no — номер (7 → «№ 0007»), why — строка мелко под шапкой;
         rows  — [[подпись, значение, 'pp-plus' | 'pp-minus' | '']] — строки «подпись ··· значение»;
         total — { k: 'за смену', n: 5261, fmt: n => '+5 261 ₽', cls: 'pp-plus' } — итог крупно, щёлкает счётчиком;
         hints — [{ text, mark, wal }] — мелкие строки под итогом (mark — жёлтым маркером; wal — «в копилке теперь»,
                 сумму потом меняет END.wallet); seal — { text, color: 'green' | 'red' | 'rust' | 'pink' };
         party — 'coins' | 'confetti' | 'both' | '' — что вылетит из итога; sticker — { line, face } сообщение Толика (пузырь iMessage);
         stamp — кнопка-штамп (career.js переносит сюда #ov-again), встаёт внизу чека.
         0 с — чек влетает, 0,25 с — сбоку Толик «печатает…», 0,95 с — его сообщение пузырём со звуком, аватарка говорит ртом (talkface.js); с 0,3 с строки допечатываются по одной (0,09 с);
         потом итог щёлкает вверх (0,8 с), печать хлопает, на хорошей смене — монетки; штамп шлёпает → done(quick).
         Всё — ~2 с. quick — нажали «допечатать сразу»: всё на месте мгновенно.
     END.active() / END.skip() / END.root() — идёт ли; skip — любая клавиша / тап / кнопка геймпада: всё сразу.
         Ещё 0,35 с после «сразу» нажатия глотаются — не нажать «на новую смену» тем же нажатием.
     END.wallet(v) — новая сумма «в копилке теперь» (потратил в «депнуть», гараже, донатах — чек тот же)
     END.tolikLine({ mood, opened, killed, adult }) — что скажет Толик: перевод в новый район (шутка про
         сбитых за карьеру) или фраза по смене (chat.js shiftLine: плохая / так себе / хорошая) */
import { t, tn } from '../i18n/index.js';
import * as CHAT from './chat.js';
import * as PFX from './paperfx.js';
import * as TF from './talkface.js';    // аватарка Толика говорит ртом, когда пришёл текст

let RUN = null, WAL = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const active = () => !!RUN;
export const root = () => (RUN ? RUN.root : null);
export function skip () { if (RUN) RUN.skip(); }
export function wallet (v) { if (WAL && WAL.el.isConnected) WAL.el.textContent = WAL.fmt(Math.round(v)); }

const GUARD = 350;                       // мс: после «сразу» нажатия ещё глотаются
const T = { ROWS0: 300, ROW: 90, COUNT: 800, SEAL: 120, SLAM: 260, MSG: 950 };   // мс; MSG — когда приходит текст Толика

/** разметка чека (без движения) — для play и для других итогов */
export function receiptHTML ({ head = '', no = 0, why = '', rows = [], total = null, hints = [], seal = null, money = n => String(Math.round(n)) } = {}) {
  const num = no ? '№ ' + String(Math.max(0, Math.round(no))).padStart(4, '0') : '';
  const row = ([k, v, cls]) => '<p class="pp-row"><span>' + esc(k) + '</span><i></i><b class="' + (cls || '') + '">' + esc(v) + '</b></p>';
  return '<section class="pp-receipt cr-rc">' +
    '<header class="pp-head"><span>' + esc(head) + '</span>' + (num ? '<b>' + esc(num) + '</b>' : '') + '</header>' +
    (why ? '<p class="pp-hint cr-rc-why">' + esc(why) + '</p>' : '') +
    '<div class="cr-rc-body">' +
      (rows.length ? '<div class="cr-rc-rows">' + rows.map(row).join('') + '</div>' : '') +
      '<div class="cr-rc-end">' +
        (total ? '<p class="pp-row pp-total"><span>' + esc(total.k) + '</span><i></i><b class="cr-rc-sum ' + (total.cls || '') + '">' +
          esc((total.fmt || money)(total.n)) + '</b></p>' : '') +
        '<div class="cr-rc-mid"><div class="cr-rc-hints">' +
        hints.map(h => '<p class="pp-hint' + (h.wal ? ' cr-rc-wal' : '') + '">' + (h.mark ? '<span class="pp-mark">' + esc(h.text) + '</span>' : esc(h.text)) +
          (h.wal ? ' <b>' + esc(money(h.n || 0)) + '</b>' : '') + '</p>').join('') + '</div>' +
        (seal ? '<div class="pp-seal pp-seal-' + (seal.color || 'red') + ' cr-rc-seal">' + esc(seal.text) + '</div>' : '') + '</div>' +
        '<div class="cr-rc-stamp"></div>' +
      '</div>' +
    '</div></section>';
}

export function play ({ host, tap = null, head = '', no = 0, why = '', rows = [], total = null, hints = [], seal = null, party = '', sticker = null,
  stamp = null, money = n => String(Math.round(n)), Snd = null } = {}, done = () => {}) {
  if (RUN) RUN.end();
  if (!host) { done(); return; }
  const face = sticker ? (sticker.face != null ? sticker.face : CHAT.avatar(96)) : '';
  host.innerHTML = receiptHTML({ head, no, why, rows, total, hints, seal, money }) +
    (sticker && sticker.line ? '<aside class="en-tolik cr-tolik">' + (face ? '<img alt="" src="' + esc(face) + '">' : '<i></i>') +
      '<div class="en-tb"><b>' + esc(t('Толик управляющий')) + '</b><div class="en-st"><p class="typing en-dots"><span></span><span></span><span></span></p>' +
      '<p class="en-msg">' + esc(sticker.line) + '</p></div></div></aside>' : '');   // сообщение как в iMessage (chat.css): «печатает…», потом текст
  const rc = host.querySelector('.cr-rc'), tol = host.querySelector('.cr-tolik');
  const ava = tol && sticker.face == null ? tol.querySelector('img') : null;      // своё лицо (sticker.face) — без рта
  if (ava) TF.bind(ava, CHAT.person(), 96);
  const slot = host.querySelector('.cr-rc-stamp'), sealEl = host.querySelector('.cr-rc-seal');
  let sumEl = host.querySelector('.cr-rc-sum');
  if (stamp && slot) slot.appendChild(stamp);
  const walEl = host.querySelector('.cr-rc-wal b');
  WAL = walEl ? { el: walEl, fmt: money } : null;
  const fmt = total ? (total.fmt || money) : money;
  const lines = [...host.querySelectorAll('.cr-rc-why, .cr-rc-rows .pp-row, .cr-rc-end > .pp-row, .cr-rc-hints > .pp-hint')];

  let finished = false, ended = false;
  const timers = [];
  const later = (ms, f) => { timers.push(setTimeout(f, ms)); };
  // name — звук из файла автора (Snd.fx, docs/SOUNDS.md), нет файла — этот тон. sfx-names: seal, stamp, receipt
  const blip = (f, d, ty, v, name) => { if (Snd && Snd.fx) try { Snd.fx(name || 'ui-click', s => s.blip(f, d, ty, v)); } catch (e) { /* — */ } };
  const coin = () => { if (Snd && Snd.coin) try { Snd.coin(); } catch (e) { /* — */ } };

  const pop = () => {                    // печать хлопнула, из итога — монетки / конфетти
    if (sealEl) { sealEl.style.visibility = ''; PFX.replay(sealEl, 'pp-seal'); }
    blip(150, 0.12, 'square', 0.12, 'seal');
    const from = sumEl && sumEl.isConnected ? sumEl : rc;
    if (party === 'coins' || party === 'both') { PFX.burst(from, { kind: 'coins' }); [0, 1, 2].forEach(i => later(i * 140, coin)); }
    if (party === 'confetti' || party === 'both') later(party === 'both' ? 120 : 0, () => PFX.burst(from, { kind: 'confetti' }));
  };
  const said = quiet => {                // текст Толика пришёл (quiet — «сразу всё»: без звука)
    if (!tol || tol.classList.contains('said')) return;
    tol.classList.add('said');
    if (!quiet && ava) TF.talk(ava, TF.talkTime(sticker.line));
    // звук — как «пришло сообщение» в чате (файл chat, docs/SOUNDS.md; нет файла — два коротких тона)
    if (!quiet && Snd && Snd.fx) try { Snd.fx('chat', z => [1320, 1760].forEach((x, i) => setTimeout(() => { try { z.blip(x, 0.12, 'triangle', 0.11); } catch (e) { /* — */ } }, i * 95))); } catch (e) { /* — */ }
  };
  const finish = quick => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout); timers.length = 0;
    said(true);
    if (quick) {
      host.classList.add('cr-now');      // все анимации — сразу в конец (career.css)
      if (sumEl && total) {              // счётчик ещё щёлкает — подменить узел, и он остановится
        const nb = sumEl.cloneNode(false); nb.textContent = fmt(total.n);
        sumEl.replaceWith(nb); sumEl = nb;
      }
      if (sealEl) sealEl.style.visibility = '';
    }
    host.classList.add('done');
    try { done(!!quick); } catch (e) { console.warn('[shiftend]', e); }
    if (!quick && stamp) { PFX.slam(stamp); blip(90, 0.09, 'square', 0.1, 'stamp'); }
    setTimeout(stop, quick ? GUARD : 0);
  };
  const stop = () => {
    if (ended) return;
    ended = true;
    if (tap) tap.removeEventListener('pointerdown', onTap, true);
    if (RUN === run) RUN = null;
  };
  const onTap = e => {
    if (finished) return;
    e.preventDefault(); e.stopPropagation();
    finish(true);
  };

  // чек влетел (CSS .pp-in), сообщение Толика — сбоку; строки допечатываются; итог щёлкает; печать; штамп
  host.classList.remove('cr-now', 'done');
  if (rc) PFX.replay(rc, 'pp-in');
  // сообщение Толика приходит, как в его чате: 0,25 с — аватарка и «печатает…», ещё 0,7 с — текст пузырём и звук «пришло сообщение»
  if (tol) {
    tol.classList.remove('said');
    tol.style.setProperty('--pp-delay', '.25s'); PFX.replay(tol, 'en-in');
    later(T.MSG, said);
  }
  if (sealEl) sealEl.style.visibility = 'hidden';
  if (sumEl && total) sumEl.textContent = fmt(0);   // итог щёлкнет вверх от нуля, когда строки допечатаются
  PFX.stagger(lines, T.ROW / 1000, T.ROWS0 / 1000);
  lines.forEach((_, i) => later(T.ROWS0 + i * T.ROW, () => blip(620 + i * 60, 0.03, 'square', 0.035, 'receipt')));
  const tCount = T.ROWS0 + Math.max(0, lines.length - 1) * T.ROW + 200;
  later(tCount, () => {
    if (!total || !sumEl) { later(T.SEAL, () => { pop(); later(T.SLAM, () => finish(false)); }); return; }
    PFX.countUp(sumEl, 0, total.n, { ms: total.n > 0 ? T.COUNT : 0, fmt }).then(() => {
      if (finished) return;
      later(T.SEAL, () => { pop(); later(T.SLAM + (party ? 120 : 0), () => finish(false)); });
    });
  });
  later(tCount + T.COUNT + 2500, () => finish(false));   // на всякий случай: анимации не идут — всё равно всё на месте

  const run = { root: tap || host, skip: () => { if (!finished) finish(true); }, end: () => { finished = true; timers.forEach(clearTimeout); stop(); } };
  RUN = run;
  if (tap) tap.addEventListener('pointerdown', onTap, true);
}

/* ── что скажет Толик: перевод в новый район (раньше это говорил директор) или фраза по смене ── */
const fmtN = n => { try { return new Intl.NumberFormat('ru-RU').format(n); } catch (e) { return String(n); } };
export function tolikLine ({ mood = 'ok', opened = '', killed = 0, adult = false } = {}) {
  if (!opened) return CHAT.shiftLine(mood);
  const head = t('ты у нас самый крутой курьер, поэтому переводим тебя на «{name}».', { name: opened });
  const n = Math.max(0, Math.round(killed));
  return head + ' ' + (n <= 0 ? t('ты же за всю карьеру никого не сбил — там такие нужны, хоть посмотрят, как это бывает')
    : adult ? tn(n, 'ты же всего лишь убил {n} клиента|ты же всего лишь убил {n} клиентов|ты же всего лишь убил {n} клиентов', { n: fmtN(n) })
      : tn(n, 'ты же всего лишь сбил {n} клиента|ты же всего лишь сбил {n} клиентов|ты же всего лишь сбил {n} клиентов', { n: fmtN(n) }));
}
