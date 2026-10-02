/* Конец смены: денежный дождь и слово директора. Числа — econ.js (SHIFT_BONUS, RAIN, BOSS_MOOD),
   правила — docs/CAREER.md («Экран итогов»).

     END.play({ earned, bonus, money, Snd }, done) — дождь поверх итогов (~3—3,5 с); done() — кончился
                                                    или пропущен (любая клавиша / тап / кнопка геймпада)
     END.active() / END.skip() / END.root()        — идёт ли, пропустить, элемент (геймпад листает его — там пусто)
     END.boss({ A, mood, opened, killed })         — что сказал директор: { face, name, text }

   Дождь — один canvas в низком разрешении (пиксели — крупные, image-rendering: pixelated):
   купюры и монеты падают, упавшие «впекаются» в кучу (отдельный canvas), каждый кадр рисуются
   только летящие. Тысячи DOM-узлов нет, на телефоне и Деке — пара сотен drawImage за кадр. */
import { t, tn } from '../i18n/index.js';
import { RAIN as R } from './econ.js';
import { BOSS } from './orders.config.js';

const N_ = s => s;

/* ── спрайты: пиксель-арт, 1 пиксель картинки = 1 пиксель низкого разрешения ── */
const BILL = ['BBBBBBBBBBBB', 'BFFFFFFFFFFB', 'BFLFFOOFFLFB', 'BFFFOOOOFFFB', 'BFLFFOOFFLFB', 'BFFFFFFFFFFB', 'BBBBBBBBBBBB'];
const COIN = ['..BBB..', '.BYYYB.', 'BYHYYYB', 'BYYYYYB', 'BYYYYDB', '.BYYDB.', '..BBB..'];
const BILL_C = [
  { B: '#1f5e2a', F: '#3fa34d', L: '#2c7a39', O: '#9be09b' },     // зелёная
  { B: '#7a3a12', F: '#e0803a', L: '#b55a20', O: '#ffc08a' },     // оранжевая «пятитысячная»
  { B: '#164a5e', F: '#3b8fb0', L: '#25708d', O: '#a5dcef' },     // голубая
];
const COIN_C = { B: '#8a5a0c', Y: '#ffd24a', H: '#fff6c2', D: '#d9a21c' };
function sprite (rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}
let SPR = null;
const sprites = () => SPR || (SPR = { bills: BILL_C.map(p => sprite(BILL, p)), coin: sprite(COIN, COIN_C) });

/* ── дождь ── */
let RUN = null;
const $c = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
export const active = () => !!RUN;
export const root = () => (RUN ? RUN.el : null);
export function skip () { if (RUN) RUN.end(true); }

export function play ({ earned = 0, bonus = 0, money = n => String(Math.round(n)), Snd = null } = {}, done = () => {}) {
  if (RUN) RUN.end(true);
  earned = Math.max(0, Math.round(earned)); bonus = Math.max(0, Math.round(bonus));
  if (earned <= 0 && bonus <= 0) { done(); return; }
  const S = sprites();
  const vw = innerWidth, vh = innerHeight;
  const PX = Math.max(2, Math.round(Math.min(vw, vh) / 200));      // во сколько раз пиксель крупнее экранного
  const W = Math.ceil(vw / PX), H = Math.ceil(vh / PX);

  const el = $c('div'); el.id = 'cr-rain';
  const cv = $c('canvas'); cv.width = W; cv.height = H;
  const sum = $c('div', 'rn-sum'), cap = $c('div', 'rn-cap'), bon = $c('div', 'rn-bonus'), hint = $c('div', 'rn-hint');
  cap.textContent = t('заработано за смену');
  hint.textContent = t('любая кнопка — пропустить');
  bon.hidden = true;
  const txt = $c('div', 'rn-txt');
  txt.append(sum, cap, bon);
  el.append(cv, txt, hint);
  (document.getElementById('game') || document.body).appendChild(el);
  const g = cv.getContext('2d');
  const pile = $c('canvas'); pile.width = W; pile.height = H;
  const pg = pile.getContext('2d');
  const top = new Float32Array(W).fill(H);                          // где верх кучи в каждом столбце

  const nE = earned > 0 ? Math.max(R.MIN, Math.min(R.MAX, Math.round(earned / R.PER))) : 0;
  const nB = bonus > 0 ? Math.max(R.MIN, Math.min(R.MAX_BONUS, Math.round(bonus / R.PER_BONUS))) : 0;
  const T_E = 1300, T_B0 = nB ? 1650 : 0, T_B = 800;                // мс: сыплется заработок; бонус — с 1,65 с, 0,8 с
  const T_END = nB ? 3300 : 2500;
  const queue = [];                                                  // [когда, бонус?]
  for (let i = 0; i < nE; i++) queue.push([T_E * Math.pow(i / nE, 0.8), false]);
  for (let i = 0; i < nB; i++) queue.push([T_B0 + T_B * (i / nB), true]);
  queue.sort((a, b) => a[0] - b[0]);
  const fall = [];
  let qi = 0, t0 = performance.now(), last = t0, raf = 0, ended = false, lastSnd = 0, bonusShown = false;

  const spawn = isBonus => {
    const coin = isBonus ? Math.random() < 0.85 : Math.random() < 0.18;
    const img = coin ? S.coin : S.bills[Math.random() < 0.55 ? 0 : Math.random() < 0.5 ? 1 : 2];
    const w = img.width, h = img.height;
    fall.push({ img, w, h, coin, x: Math.random() * (W - w), y: -h - Math.random() * H * 0.25,
      vy: H * (0.3 + Math.random() * 0.4), vx: (Math.random() - 0.5) * W * 0.04,
      ph: Math.random() * 6.28, sp: 4 + Math.random() * 6, vmax: H * (coin ? 1.5 : 0.95 + Math.random() * 0.3) });
  };
  const rest = (x0, w) => { let y = H; for (let x = Math.max(0, x0), x1 = Math.min(W, x0 + w); x < x1; x++) y = Math.min(y, top[x]); return y; };
  const land = s => {
    // как песок: скатывается в самую низкую ямку рядом (до ширины купюры в стороны) — куча растёт слоями, не столбиками
    const c0 = Math.max(0, Math.min(W - s.w, Math.round(s.x)));
    let x0 = c0, best = -1;
    for (let d = 0; d <= 12; d++) for (const sg of d ? [-1, 1] : [1]) {
      const x = c0 + d * sg;
      if (x < 0 || x > W - s.w) continue;
      const r = rest(x, s.w);
      if (r > best + 1) { best = r; x0 = x; }
    }
    const x1 = Math.min(W, x0 + s.w);
    let y = H;
    for (let x = x0; x < x1; x++) y = Math.min(y, top[x]);
    y = Math.round(y - s.h + Math.min(2, s.h * 0.3));               // чуть утопает в кучу — плотнее
    pg.save();
    if (Math.random() < 0.5) { pg.translate(x0 + s.w, 0); pg.scale(-1, 1); pg.drawImage(s.img, 0, y); }
    else pg.drawImage(s.img, x0, y);
    pg.restore();
    for (let x = x0; x < x1; x++) top[x] = Math.min(top[x], y + 1);
    const now = performance.now();
    if (Snd && now - lastSnd > (s.coin ? 90 : 140)) { lastSnd = now; Snd.blip(s.coin ? 1300 + Math.random() * 500 : 420 + Math.random() * 160, 0.04, 'square', 0.035); }
  };
  const showSum = v => { sum.textContent = '+' + money(v); };
  showSum(0);

  const frame = now => {
    if (ended) return;
    const el_ = now - t0, dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    while (qi < queue.length && queue[qi][0] <= el_) spawn(queue[qi++][1]);
    // счётчик: заработок за первые 1,5 с, бонус — сверху
    const kE = Math.min(1, el_ / (T_E + 200)), eE = 1 - (1 - kE) ** 3;
    let v = earned * eE;
    if (nB && el_ >= T_B0) {
      if (!bonusShown) {
        bonusShown = true;
        bon.innerHTML = '<span>' + esc(t('бонус за смену')) + '</span> <b>+' + esc(money(bonus)) + '</b>';
        bon.hidden = false;
        requestAnimationFrame(() => bon.classList.add('on'));
        if (Snd && Snd.coin) Snd.coin();
      }
      const kB = Math.min(1, (el_ - T_B0) / (T_B + 200)), eB = 1 - (1 - kB) ** 3;
      v = earned + bonus * eB;
      cap.textContent = t('итого за смену');
    }
    showSum(v);
    g.clearRect(0, 0, W, H);
    g.drawImage(pile, 0, 0);
    for (let i = fall.length - 1; i >= 0; i--) {
      const s = fall[i];
      s.vy = Math.min(s.vmax, s.vy + H * 2.2 * dt);
      s.ph += s.sp * dt;
      s.x = Math.max(0, Math.min(W - s.w, s.x + (s.vx + (s.coin ? 0 : Math.sin(s.ph) * W * 0.05)) * dt));
      s.y += s.vy * dt;
      if (s.y + s.h >= rest(Math.round(s.x), s.w) - 1) { land(s); fall.splice(i, 1); continue; }
      // купюра кувыркается: сплющивается по высоте
      const k = s.coin ? 1 : Math.abs(Math.cos(s.ph * 0.7));
      const h = Math.max(1, Math.round(s.h * k));
      g.drawImage(s.img, Math.round(s.x), Math.round(s.y + (s.h - h) / 2), s.w, h);
    }
    if (el_ >= T_END && qi >= queue.length && (!fall.length || el_ >= T_END + 600)) { finish(false); return; }
    raf = requestAnimationFrame(frame);
  };
  const finish = quick => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    showSum(earned + bonus);
    if (nB && !bonusShown) { bon.innerHTML = '<span>' + esc(t('бонус за смену')) + '</span> <b>+' + esc(money(bonus)) + '</b>'; bon.hidden = false; bon.classList.add('on'); }
    el.classList.add('out');
    if (RUN && RUN.el === el) RUN = null;
    setTimeout(() => { el.remove(); }, quick ? 160 : 300);
    done();
  };
  const tap = e => { e.preventDefault(); e.stopPropagation(); finish(true); };
  el.addEventListener('pointerdown', tap);
  RUN = { el, end: finish };
  requestAnimationFrame(() => el.classList.add('on'));
  raf = requestAnimationFrame(frame);
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
