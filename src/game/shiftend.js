/* Конец смены: деньги кучей, Толик управляющий, слово директора. Числа — econ.js (SHIFT_BONUS, RAIN,
   BOSS_MOOD), правила — docs/CAREER.md («Экран итогов»).

     END.play({ earned, bonus, money, Snd, mood }, done) — два экрана поверх итогов, у каждого внизу
         «продолжить»:
           1) деньги: купюры насыпаются кучей, как выигрыш в «депнуть» (career.js pile: те же зелёные
              купюры с «₽», падают и ложатся с наклоном), бонус за смену — золотыми монетами сверху,
              сумма докручивается и мигает, три звона (~2,5 с, с бонусом ~3,3 с);
           2) Толик управляющий крупно и одна его фраза по смене (CHAT.shiftLine(mood), хоть «мдаа»).
         Ничего не заработал — сразу второй. done() — после второго «продолжить».
     END.active() / END.skip() / END.root() — идёт ли; skip — любая клавиша / тап / кнопка геймпада:
         пока сыплется или Толик печатает — показать сразу, потом — «продолжить»; root — элемент
     END.boss({ A, mood, opened, killed })  — что сказал директор: { face, name, text }

   Куча — пара сотен DOM-купюр с CSS-анимацией (dep-fall из career.css), без canvas. */
import { t, tn } from '../i18n/index.js';
import { RAIN as R } from './econ.js';
import { BOSS } from './orders.config.js';
import * as CHAT from './chat.js';

const N_ = s => s;

let RUN = null;
const $c = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
export const active = () => !!RUN;
export const root = () => (RUN ? RUN.el : null);
export function skip () { if (RUN) RUN.skip(); }

const GUARD = 350;                                   // мс: после смены экрана нажатия не считаются — не пролистать оба разом
const FALL = 450;                                    // мс: одна купюра падает (dep-fall в career.css)

export function play ({ earned = 0, bonus = 0, money = n => String(Math.round(n)), Snd = null, mood = 'ok' } = {}, done = () => {}) {
  if (RUN) RUN.close(false);
  earned = Math.max(0, Math.round(earned)); bonus = Math.max(0, Math.round(bonus));
  const el = $c('div'); el.id = 'cr-payout';
  const stage = $c('div', 'en-stage');
  const go = $c('button', 'dep-go en-go');
  go.type = 'button';
  go.textContent = t('продолжить');
  el.append(stage, go);
  (document.getElementById('game') || document.body).appendChild(el);

  let step = null, ready = 0, closed = false, raf = 0;
  const timers = [];
  const later = (ms, f) => { timers.push(setTimeout(f, ms)); };
  const stopAll = () => { timers.forEach(clearTimeout); timers.length = 0; cancelAnimationFrame(raf); };
  const blip = (f, d, ty, v) => { if (Snd) try { Snd.blip(f, d, ty, v); } catch (e) { /* — */ } };
  const coins = () => { if (Snd && Snd.coin) [0, 1, 2].forEach(i => later(i * 160, () => Snd.coin())); };   // как выигрыш ставки

  const close = call => {
    if (closed) return;
    closed = true;
    stopAll();
    el.classList.add('out');
    if (RUN && RUN.el === el) RUN = null;
    setTimeout(() => el.remove(), 200);
    if (call) done();
  };
  const next = () => {
    if (performance.now() < ready) return;
    if (step && step.busy) step.finish();
    stopAll();
    if (step && step.id === 'money') tolik();
    else close(true);
  };
  const skipNow = () => {
    if (performance.now() < ready) return;
    if (step && step.busy) { step.finish(); ready = performance.now() + GUARD; return; }
    next();
  };

  /* ── 1) деньги кучей ── */
  function moneyStage () {
    el.dataset.stage = 'money';
    const top = $c('div', 'en-top'), sum = $c('div', 'en-sum'), cap = $c('div', 'en-cap'), bon = $c('div', 'en-bonus');
    cap.textContent = t('заработано за смену');
    bon.hidden = true;
    top.append(sum, cap, bon);
    const pile = $c('div', 'dep-pile en-pile');
    stage.replaceChildren(top, pile);
    const pw = Math.max(120, pile.clientWidth), ph = Math.max(80, pile.clientHeight);
    const cols = pw < 520 ? R.COLS_NARROW : R.COLS, full = cols * R.ROWS;
    const n = earned > 0 ? Math.max(R.MIN, Math.min(full, Math.round(full * earned / R.FULL))) : 0;
    const nB = bonus > 0 ? Math.max(3, Math.min(R.BONUS_MAX, Math.round(bonus / R.BONUS_PER))) : 0;
    // купюра — как в «депнуть»: шире шага (ложатся внахлёст), ряды — внахлёст по высоте
    const sx = pw * 0.9 / cols, bw = sx * 1.5, bh = bw / 1.7;
    const sy = Math.max(4, Math.min(bh * 0.7, (ph - bh * 2.2) / Math.max(1, R.ROWS - 1)));
    const gap = Math.min(35, 1300 / Math.max(1, n));                // мс между купюрами: вся куча — за ~1,3 с
    const rnd = (a, b) => a + Math.random() * (b - a);
    const bills = [];
    const put = (x, y, w, h, cls, delay) => {
      const b = $c('i', cls);
      b.style.left = Math.max(0, Math.min(pw - w, x)).toFixed(1) + 'px';
      b.style.bottom = y.toFixed(1) + 'px';
      b.style.width = w.toFixed(1) + 'px'; b.style.height = h.toFixed(1) + 'px';
      b.style.fontSize = Math.max(8, h * 0.42).toFixed(0) + 'px';
      b.style.setProperty('--r', rnd(-20, 20).toFixed(0) + 'deg');
      b.style.animationDelay = (delay / 1000).toFixed(3) + 's';
      if (!cls) b.textContent = '₽';
      pile.appendChild(b);
      bills.push(delay);
    };
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / cols), inRow = Math.min(cols, n - row * cols), j = k - row * cols;
      // неполный верхний ряд — от середины к краям: горка, а не ступенька
      const c = inRow < cols ? Math.round((cols - inRow) / 2) + j : j;
      put(pw * 0.05 + c * sx + (row % 2 ? sx / 2 : 0) - (bw - sx) / 2 + rnd(-4, 4), row * sy + rnd(0, 3), bw, bh, '', k * gap);
    }
    // бонус — золотые монеты на вершину кучи, с 1,65 с за 0,8 с
    const T_B0 = nB ? Math.max(1650, n * gap + FALL) : 0, T_B = 800;
    // монета ложится на верх кучи там, куда упала: над неполным верхним рядом — выше
    const cs = Math.max(18, bh * 0.8), full_ = Math.floor(n / cols), part = n - full_ * cols, c0 = Math.round((cols - part) / 2);
    const topAt = x => {
      const c = (x + cs / 2 - pw * 0.05) / sx, r = part && c >= c0 - 0.3 && c <= c0 + part + 0.3 ? full_ : full_ - 1;
      return r < 0 ? 0 : r * sy + bh * 0.75;
    };
    const per = Math.max(4, Math.round(cols * 1.2));
    for (let i = 0; i < nB; i++) {
      const x = pw * 0.12 + rnd(0, pw * 0.76 - cs);
      put(x, topAt(x) + Math.floor(i / per) * cs * 0.5 + rnd(0, 4), cs, cs, 'en-coin', T_B0 + T_B * (i / nB));
    }
    const T_E = 1300, T_END = Math.max(nB ? T_B0 + T_B + 700 : 2500, n * gap + FALL + 300);
    const showSum = v => { sum.textContent = '+' + money(v); };
    const showBonus = () => {
      bon.innerHTML = '<span>' + esc(t('бонус за смену')) + '</span> <b>+' + esc(money(bonus)) + '</b>';
      bon.hidden = false;
      cap.textContent = t('итого за смену');
      requestAnimationFrame(() => bon.classList.add('on'));
    };
    showSum(0);
    const t0 = performance.now();
    let landed = 0, lastSnd = 0, bonusShown = false;
    const st = { id: 'money', busy: true };
    const end = () => {
      st.busy = false;
      cancelAnimationFrame(raf);
      showSum(earned + bonus);
      if (nB && !bonusShown) { bonusShown = true; showBonus(); }
      sum.classList.add('win');
      el.classList.add('done');
      if (earned + bonus > 0) coins();
    };
    st.finish = () => { el.classList.add('now'); end(); };       // досыпать сразу: купюры — уже в куче
    const frame = now => {
      if (closed || !st.busy) return;
      const e = now - t0;
      const kE = Math.min(1, e / (T_E + 200)), eE = 1 - (1 - kE) ** 3;
      let v = earned * eE;
      if (nB && e >= T_B0) {
        if (!bonusShown) { bonusShown = true; showBonus(); if (Snd && Snd.coin) Snd.coin(); }
        const kB = Math.min(1, (e - T_B0) / (T_B + 200)), eB = 1 - (1 - kB) ** 3;
        v = earned + bonus * eB;
      }
      showSum(v);
      // стук купюр о кучу (как в «депнуть»): не чаще раза в 110 мс
      let l = 0;
      for (const d of bills) if (d + FALL * 0.7 <= e) l++;
      if (l > landed) {
        landed = l;
        if (now - lastSnd > 110) { lastSnd = now; blip(e >= T_B0 && nB ? 1300 + Math.random() * 500 : 420 + Math.random() * 160, 0.04, 'square', 0.04); }
      }
      if (e >= T_END) { end(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return st;
  }

  /* ── 2) Толик управляющий: только он и его фраза ── */
  function tolik () {
    el.dataset.stage = 'tolik';
    el.classList.remove('now', 'done');
    ready = performance.now() + GUARD;
    const text = CHAT.shiftLine(mood), ava = CHAT.avatar(128);
    const box = $c('div', 'en-tolik');
    box.innerHTML = (ava ? '<img alt="" src="' + esc(ava) + '">' : '<i></i>') +
      '<div class="en-tb"><b>' + esc(t('Толик управляющий')) + '</b><p class="typing"><span></span><span></span><span></span></p></div>';
    stage.replaceChildren(box);
    const p = box.querySelector('p');
    const st = { id: 'tolik', busy: true };
    st.finish = () => {
      if (!st.busy) return;
      st.busy = false;
      p.className = '';
      p.textContent = text;
      el.classList.add('done');
      const f = mood === 'bad' ? [620, 470] : [1320, 1760];       // как «пришло сообщение» в чате
      f.forEach((x, i) => later(i * 95, () => blip(x, 0.12, 'triangle', 0.13)));
    };
    later(600, st.finish);
    step = st;
  }

  el.addEventListener('pointerdown', e => { if (e.target === go) return; e.preventDefault(); e.stopPropagation(); skipNow(); });
  go.addEventListener('pointerdown', e => e.stopPropagation());
  go.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); next(); });
  RUN = { el, skip: skipNow, close };
  requestAnimationFrame(() => el.classList.add('on'));
  if (earned > 0 || bonus > 0) { step = moneyStage(); ready = performance.now() + GUARD; } else tolik();
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── директор после смены ── */
const LINES = {
  great: [
    N_('вот это смена! кухня не успевала печь, а ты уже возвращался за следующей. горжусь, как родным'),
    N_('клиенты звонят и спрашивают, кто им привёз. я говорю — наш лучший. только не зазнавайся'),
    N_('ты так гонял, что у нас кончились коробки. завтра повтори — коробки докупим'),
    N_('я сегодня даже не нервничал. первый раз за двадцать лет. спасибо, сынок'),
  ],
  ok: [
    N_('нормально отработал. не орёл, но и не голубь. иди отдыхай'),
    N_('смена как смена. пиццы доехали, машина почти целая — уже праздник'),
    N_('живой, пиццы развёз, жалоб в меру. завтра можно и пободрее'),
    N_('неплохо. я бы поставил тебе четвёрку. с минусом. маленьким'),
  ],
  bad: [
    N_('ну и смена… такого я не видел с тех пор, как кот уронил тесто в кассу'),
    N_('ты где был? клиенты голодные, повар плачет, я пью валерьянку. завтра — лучше'),
    N_('я не злюсь. я просто записал это в твоё личное дело. большими буквами'),
    N_('пиццы остыли быстрее, чем ты до них доехал. это талант, но не тот'),
  ],
};
const LINES_ADULT = {
  great: [N_('ты гонял, будто за тобой коллекторы. продолжай в том же духе, только им не попадайся')],
  ok: [N_('середнячок. как пицца из морозилки: есть можно, хвалить не за что')],
  bad: [N_('если бы за плохие смены сажали, ты бы уже сидел. пожизненно, без права на чаевые')],
};
const pickOf = a => a[Math.floor(Math.random() * a.length)];
const fmtN = n => { try { return new Intl.NumberFormat('ru-RU').format(n); } catch (e) { return String(n); } };
let BOSS_P = null;
export function boss ({ A, mood = 'ok', opened = '', killed = 0 }) {
  if (!BOSS_P && A.person) BOSS_P = A.person({ seed: BOSS.seed, first: t(BOSS.first), last: t(BOSS.last), fem: !!BOSS.fem });
  const face = BOSS_P && A.face ? A.face(BOSS_P, 128) : '';
  const name = t(BOSS.first) + ' ' + t(BOSS.last) + ' · ' + t(BOSS.role);
  let text;
  if (opened) {
    const head = t('ты у нас самый крутой курьер, поэтому переводим тебя на «{name}».', { name: opened });
    const n = Math.max(0, Math.round(killed));
    text = head + ' ' + (n <= 0 ? t('ты же за всю карьеру никого не сбил — там такие нужны, хоть посмотрят, как это бывает')
      : A.ADULT ? tn(n, 'ты же всего лишь убил {n} клиента|ты же всего лишь убил {n} клиентов|ты же всего лишь убил {n} клиентов', { n: fmtN(n) })
        : tn(n, 'ты же всего лишь сбил {n} клиента|ты же всего лишь сбил {n} клиентов|ты же всего лишь сбил {n} клиентов', { n: fmtN(n) }));
  } else {
    const pool = (LINES[mood] || LINES.ok).concat(A.ADULT ? LINES_ADULT[mood] || [] : []);
    text = t(pickOf(pool));
  }
  return { face, name, text };
}
