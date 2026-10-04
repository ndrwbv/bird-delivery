/* Конец смены — один экран (career.js showEnd рисует его в #over, правила — docs/CAREER.md «Конец смены»):
   сверху Толик управляющий одной фразой, в центре большая копилка-свинья — деньги смены сыплются в неё
   купюрами, сумма копилки докручивается; потом под свиньёй — кнопки выбора (их делает career.js, END —
   только Толик, свинья и купюры). Числа — econ.js RAIN.

     END.play({ host, tap, line, earned, bonus, wallet, money, Snd }, done)
         host — куда рисовать (#cr-stage); tap — где тап = «показать сразу» (#over);
         line — фраза Толика (tolikLine; пусто — без Толика); earned / bonus — заработок и бонус за смену;
         wallet — кошелёк, уже с ними (копилка докручивается от wallet − earned − bonus до wallet).
         0 с — Толик печатает, 0,45 с — фраза; с 0,65 с — купюры летят сверху в свинью (каждая 0,6 с, вся
         пачка — за ≤ 1,2 с), бонус — золотыми монетами следом; свинья пухнет от каждой, сумма копилки растёт;
         всё легло — свинья подпрыгивает, сумма мигает, три звона → done(quick) (кнопки выбора; quick — нажали
         «показать сразу»). Ничего не заработал — только Толик (~0,6 с) → done().
     END.active() / END.skip() / END.root() — идёт ли; skip — любая клавиша / тап / кнопка геймпада: всё сразу.
         Ещё 0,35 с после конца нажатия глотаются — не нажать «на новую смену» тем же нажатием.
     END.wallet(v) — новая сумма в копилке (потратил в «депнуть», гараже, донатах — экран выбора тот же)
     END.tolikLine({ mood, opened, killed, adult }) — что скажет Толик: перевод в новый район (шутка про
         сбитых за карьеру) или фраза по смене (chat.js shiftLine: плохая / так себе / хорошая)

   Купюры — DOM-элементы с Web Animations (transform/opacity), без canvas и без работы в кадре. */
import { t, tn } from '../i18n/index.js';
import { RAIN as R } from './econ.js';
import * as CHAT from './chat.js';
import { PIGGY } from './shiftcash.js';

let RUN = null, PIG = null;
const $c = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const active = () => !!RUN;
export const root = () => (RUN ? RUN.root : null);
export function skip () { if (RUN) RUN.skip(); }
export function wallet (v) { if (PIG && PIG.num.isConnected) PIG.set(v); }

const GUARD = 350;                       // мс: после конца анимации нажатия ещё глотаются
const T = { TYPE: 450, RAIN0: 650, FLY: 600, SPAN: 1200, COINS: 400 };   // мс

export function play ({ host, tap = null, line = '', earned = 0, bonus = 0, wallet = null, money = n => String(Math.round(n)), Snd = null } = {}, done = () => {}) {
  if (RUN) RUN.end();
  if (!host) { done(); return; }
  earned = Math.max(0, Math.round(earned)); bonus = Math.max(0, Math.round(bonus));
  const after = wallet == null ? earned + bonus : Math.max(0, Math.round(wallet)), before = Math.max(0, after - earned - bonus);
  const ava = line ? CHAT.avatar(96) : '';
  host.innerHTML = (line ? '<div class="en-tolik">' + (ava ? '<img alt="" src="' + esc(ava) + '">' : '<i></i>') +
      '<div class="en-tb"><b>' + esc(t('Толик управляющий')) + '</b><p class="typing"><span></span><span></span><span></span></p></div></div>' : '') +
    '<div class="en-pigbox"><div class="en-pig">' + PIGGY + '</div><div class="en-wal"><span>' + esc(t('в копилке')) + '</span><b></b></div>' +
    (earned + bonus > 0 ? '<div class="en-plus">' + (earned ? '<span><b>+' + esc(money(earned)) + '</b> ' + esc(t('заработано за смену')) + '</span>' : '') +
      (bonus ? '<span class="bn">' + esc(t('бонус за смену')) + ' <b>+' + esc(money(bonus)) + '</b></span>' : '') + '</div>' : '') +
    '</div><div class="en-rain"></div>';
  const num = host.querySelector('.en-wal b'), ico = host.querySelector('.pg-ico'), pigEl = host.querySelector('.en-pig');
  const rain = host.querySelector('.en-rain'), plus = host.querySelector('.en-plus'), p = host.querySelector('.en-tb p');
  PIG = { num, set: v => { num.textContent = money(Math.round(v)); } };
  PIG.set(before);

  let finished = false, ended = false;
  const timers = [];
  const later = (ms, f) => { timers.push(setTimeout(f, ms)); };
  const blip = (f, d, ty, v) => { if (Snd) try { Snd.blip(f, d, ty, v); } catch (e) { /* — */ } };

  const say = () => {
    if (!p || !p.classList.contains('typing')) return;
    p.className = ''; p.textContent = line;
    [1320, 1760].forEach((x, i) => later(i * 95, () => blip(x, 0.12, 'triangle', 0.11)));   // как «пришло сообщение» в чате
  };
  // всё легло: свинья подпрыгивает, сумма мигает, три звона → кнопки
  const finish = quick => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout); timers.length = 0;
    say();
    rain.getAnimations({ subtree: true }).forEach(a => a.cancel());
    rain.replaceChildren();
    PIG.set(after);
    if (plus) plus.classList.add('on');
    if (earned + bonus > 0) {
      pigEl.classList.remove('fill'); void pigEl.offsetWidth; pigEl.classList.add('fill', 'win');
      if (Snd && Snd.coin) [0, 1, 2].forEach(i => setTimeout(() => { try { Snd.coin(); } catch (e) { /* — */ } }, i * 160));
    }
    host.classList.add('done');
    try { done(!!quick); } catch (e) { console.warn('[shiftend]', e); }
    setTimeout(stop, quick ? GUARD : 120);
  };
  const stop = () => {
    if (ended) return;
    ended = true;
    if (tap) tap.removeEventListener('pointerdown', onTap, true);
    if (RUN === run) RUN = null;
  };
  const onTap = e => {
    e.preventDefault(); e.stopPropagation();
    if (!finished) finish(true);
  };

  // купюры (и монеты бонуса) сверху экрана летят в свинью
  const pour = () => {
    if (finished) return;
    const hr = host.getBoundingClientRect(), r = ico.getBoundingClientRect();
    const px = r.left + r.width / 2 - hr.left, py = r.top + r.height * 0.45 - hr.top;
    const n = earned > 0 ? Math.max(R.MIN, Math.min(R.MAX, Math.round(R.MAX * earned / R.FULL))) : 0;
    const nB = bonus > 0 ? Math.max(3, Math.min(R.BONUS_MAX, Math.round(bonus / R.BONUS_PER))) : 0;
    if (!(r.width > 0) || n + nB === 0) { finish(false); return; }
    if (plus) plus.classList.add('on');
    const span = Math.min(T.SPAN, 150 + n * 30), W = Math.max(200, hr.width);
    let got = 0, sum = 0, lastPuff = 0;
    const land = (add, coin) => {
      if (finished) return;
      sum += add;
      PIG.set(before + Math.min(earned + bonus, sum));
      const now = performance.now();
      if (now - lastPuff > 70) {
        lastPuff = now;
        ico.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12,1.08)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
        blip(coin ? 1300 + Math.random() * 400 : 700 + Math.random() * 300, 0.03, 'square', 0.03);
      }
      if (++got >= n + nB) later(120, () => finish(false));
    };
    const fly = (cls, add, delay) => {
      const b = $c('i', cls);
      if (!cls) b.textContent = '₽';
      b.style.left = px.toFixed(0) + 'px'; b.style.top = py.toFixed(0) + 'px';
      rain.appendChild(b);
      const dx = (Math.random() - 0.5) * W * 0.9, dy = -py - hr.top - 60 - Math.random() * 60, rr = (Math.random() - 0.5) * 60;
      const an = b.animate([
        { transform: `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px) rotate(${rr.toFixed(0)}deg)`, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: `translate(${(dx * 0.35).toFixed(0)}px,${(dy * 0.3).toFixed(0)}px) rotate(${(rr * 2).toFixed(0)}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(0px,0px) rotate(${(rr * 4).toFixed(0)}deg) scale(.3)`, opacity: 0.2 },
      ], { duration: T.FLY, delay, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'both' });
      an.onfinish = () => { b.remove(); land(add, !!cls); };
    };
    for (let i = 0; i < n; i++) fly('', earned / n, n > 1 ? i * span / (n - 1) : 0);
    for (let i = 0; i < nB; i++) fly('c', bonus / nB, span * 0.85 + (nB > 1 ? i * T.COINS / (nB - 1) : 0));
    later(span + T.COINS + T.FLY + 600, () => finish(false));   // на всякий случай: анимации не идут — всё равно всё в копилке
  };

  const run = { root: tap || host, skip: () => { if (!finished) finish(true); }, end: () => { finished = true; timers.forEach(clearTimeout); stop(); } };
  RUN = run;
  if (tap) tap.addEventListener('pointerdown', onTap, true);
  if (line) later(T.TYPE, say);
  if (earned + bonus > 0) later(line ? T.RAIN0 : 150, pour);
  else later(line ? T.TYPE + 150 : 0, () => finish(false));
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
