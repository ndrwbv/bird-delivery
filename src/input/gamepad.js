/* Геймпад для езды: Xbox, DualShock/DualSense, Steam Deck, Steam Input.

   Раскладка (подписи Xbox; на PlayStation A=✕ B=○ X=□ Y=△):

   | кнопка              | в езде                         | поле pollPad()        | в меню / карточках         |
   |---------------------|--------------------------------|-----------------------|----------------------------|
   | левый стик ←→       | руль, аналоговый               | steer −1..1           | ←→ выбор (menuLeft/Right)  |
   | левый стик ↑↓       | —                              | ly                    | ↑↓ выбор (menuUp/Down)     |
   | RT                  | газ, аналоговый                | gas 0..1              | —                          |
   | LT                  | тормоз, на месте — назад       | brake 0..1            | —                          |
   | A                   | ручник (держать)               | hand                  | нажать (menuOk), принять заказ (accept) |
   | B                   | ручник (держать)               | hand                  | назад (menuBack)           |
   | X или RB            | нитро (держать)                | nitro                 | —                          |
   | Y                   | карта района                   | map                   | закрыть карту              |
   | Back / View / Select| карта района                   | map                   | —                          |
   | Start / Menu        | пауза                          | pause                 | продолжить                 |
   | крестовина ← ↑ →    | ответ 1 / 2 / 3 на карточке     | choice1..3            | выбор (menu*)              |
   | крестовина ↓        | —                              | —                     | вниз (menuDown)            |
   | R3 (нажать правый)  | звук вкл/выкл                  | sound                 | —                          |
   | LB, правый стик     | свободны                       | rx, ry (сырые)        | LB/RB — листать (pageL/R) |

   Руль: мёртвая зона 12 %, внешняя 3 %, кривая |x|^1.6 — точнее в центре, полный замок у края.
   Курки: мёртвая зона 6 %. Удержания (hand, nitro, gas…) — состояние кадра; всё остальное —
   одноразовые фронты: true ровно в тот кадр, когда кнопку нажали. pollPad() зовут раз в кадр.

   Две раскладки. `mapping: 'standard'` — номера кнопок по спецификации. «Сырая» (игра запущена
   мимо Steam, например из десктоп-режима Deck'а): другой порядок кнопок, курки и крестовина на
   осях. Падов бывает несколько (виртуальный от Steam Input плюс сырой) — активным считаем тот,
   на котором шевелились последним.

   Подключение в игру (набросок; IN — объект ввода moscow.js):
     const p = pollPad();
     if (!S.paused && !FM.open) applyToIN(IN, p);   // руль/газ/тормоз/ручник/нитро, клавиатуру не затирает
     if (p.pause) setPause(!S.paused);
     if (p.map) setFullMap(!FM.open);
     if (p.accept && S.state === 'brief') acceptOrder();
     if (CH.opts.length && !CH.pause) { if (p.choice1) pickChoice(0); … }   // CH.pause → padmenu
     menu(p, открытыйЭкран);                  // padmenu.js: пауза, обед, заставка, магазин
     rumble(0.8, 250);                        // на аварии */

const CFG = { dead: 0.12, outer: 0.03, curve: 1.6, trigDead: 0.06, rumble: true };
export function setPadConfig (o) { Object.assign(CFG, o); }

const HOLD = ['hand', 'nitro'];
const EDGES = ['pause', 'map', 'accept', 'choice1', 'choice2', 'choice3', 'sound', 'any',
  'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuOk', 'menuBack', 'pageL', 'pageR'];

// один объект на всё время: не мусорим каждый кадр
export const pad = {
  connected: false, active: false, id: '', mapping: '', raw: false, index: -1,
  steer: 0, gas: 0, brake: 0, ly: 0, rx: 0, ry: 0,
  hand: false, nitro: false,
  pause: false, map: false, accept: false, choice1: false, choice2: false, choice3: false, sound: false, any: false,
  menuUp: false, menuDown: false, menuLeft: false, menuRight: false, menuOk: false, menuBack: false,
  pageL: false, pageR: false,   // LB / RB — листать страницы (гараж карьеры)
  lastUse: 0,               // performance.now() последнего касания — чтобы прятать подсказки мыши/тача
};

const prev = Object.create(null);     // прошлое состояние кнопок — по смыслу, не по номеру
const padAxes = new Map();            // прошлые оси каждого пада — чтобы понять, на каком играют
const trigSeen = Object.create(null); // сырые курки: пока ось не шевельнули, она врёт нулём (= полкурка)
let activeIndex = -1;

function pickPad () {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const live = [];
  for (const p of pads) if (p && p.connected) live.push(p);
  if (!live.length) { padAxes.clear(); return null; }
  let touched = false;
  for (const p of live) {
    const was = padAxes.get(p.index);
    let act = false;
    if (was) for (let i = 0; i < p.axes.length; i++) if (Math.abs((p.axes[i] || 0) - (was[i] || 0)) > 0.2) { act = true; break; }
    padAxes.set(p.index, Array.prototype.slice.call(p.axes));
    if (!act) for (const b of p.buttons) if (b && (b.pressed || b.value > 0.5)) { act = true; break; }
    if (act) { activeIndex = p.index; touched = true; }
  }
  const gp = live.find(p => p.index === activeIndex) || live.find(p => p.mapping === 'standard') || live[0];
  pickPad.touched = touched;
  return gp;
}

const dz = (v, d) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));
function curveSteer (v) {
  let a = Math.abs(v);
  if (a < CFG.dead) return 0;
  a = Math.min(1, (a - CFG.dead) / (1 - CFG.dead - CFG.outer));
  return Math.sign(v) * Math.pow(a, CFG.curve);
}

function clearState () {
  pad.connected = false; pad.active = false;
  pad.steer = pad.gas = pad.brake = pad.ly = pad.rx = pad.ry = 0;
  for (const k of HOLD) pad[k] = false;
  for (const k of EDGES) pad[k] = false;
}

/** Опрос раз в кадр. Возвращает всегда один и тот же объект `pad`. */
export function pollPad () {
  for (const k of EDGES) pad[k] = false;
  const gp = pickPad();
  if (!gp) { clearState(); return pad; }
  pad.connected = true;
  pad.id = gp.id; pad.mapping = gp.mapping; pad.index = gp.index;
  const raw = gp.mapping !== 'standard' && gp.axes.length >= 6;
  pad.raw = raw;

  const ax = i => gp.axes[i] || 0;
  const bv = i => { const b = gp.buttons[i]; return b ? (typeof b === 'object' ? b.value || (b.pressed ? 1 : 0) : +b) : 0; };
  const btn = i => { const b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.35)); };
  // сырой курок: покой −1, до упора +1; до первого движения ось отдаёт 0 — считаем отпущенным
  const trig = i => {
    const v = ax(i);
    if (!trigSeen[gp.index + ':' + i]) { if (Math.abs(v) < 0.02) return 0; trigSeen[gp.index + ':' + i] = true; }
    return (v + 1) / 2;
  };

  let lx, ly, rx, ry, lt, rt, dUp, dDown, dLeft, dRight, B;
  if (raw) {
    lx = ax(0); ly = ax(1); rx = ax(3); ry = ax(4);
    lt = trig(2); rt = trig(5);
    const hx = ax(6), hy = ax(7);                         // крестовина тоже осями
    dLeft = hx < -0.5; dRight = hx > 0.5; dUp = hy < -0.5; dDown = hy > 0.5;
    B = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 6, start: 7, l3: 9, r3: 10 };
  } else {
    lx = ax(0); ly = ax(1); rx = ax(2); ry = ax(3);
    lt = bv(6); rt = bv(7);
    dUp = btn(12); dDown = btn(13); dLeft = btn(14); dRight = btn(15);
    B = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9, l3: 10, r3: 11 };
  }

  pad.steer = curveSteer(lx);
  pad.ly = dz(ly, CFG.dead);
  pad.rx = dz(rx, CFG.dead); pad.ry = dz(ry, CFG.dead);
  pad.gas = Math.min(1, dz(Math.max(0, rt), CFG.trigDead));
  pad.brake = Math.min(1, dz(Math.max(0, lt), CFG.trigDead));

  const a = btn(B.a), b = btn(B.b), x = btn(B.x), y = btn(B.y), rb = btn(B.rb);
  pad.hand = a || b;
  pad.nitro = x || rb;

  const edge = (name, now) => { const was = prev[name] || false; prev[name] = now; return now && !was; };
  if (edge('a', a)) { pad.accept = true; pad.menuOk = true; }
  if (edge('b', b)) pad.menuBack = true;
  if (edge('y', y)) pad.map = true;
  if (edge('back', btn(B.back))) pad.map = true;
  if (edge('start', btn(B.start))) pad.pause = true;
  if (edge('r3', btn(B.r3))) pad.sound = true;
  if (edge('lb', btn(B.lb))) pad.pageL = true;
  if (edge('rb', rb)) pad.pageR = true;
  if (edge('up', dUp)) { pad.choice2 = true; pad.menuUp = true; }
  if (edge('left', dLeft)) { pad.choice1 = true; pad.menuLeft = true; }
  if (edge('right', dRight)) { pad.choice3 = true; pad.menuRight = true; }
  if (edge('down', dDown)) pad.menuDown = true;
  // левый стик тоже листает меню — на Deck'е крестовиной пользуются реже
  if (edge('sUp', ly < -0.6)) pad.menuUp = true;
  if (edge('sDown', ly > 0.6)) pad.menuDown = true;
  if (edge('sLeft', lx < -0.6)) pad.menuLeft = true;
  if (edge('sRight', lx > 0.6)) pad.menuRight = true;
  // любая кнопка — «нажми, чтобы начать» и разбудить звук
  let anyNow = false;
  for (let i = 0; i < gp.buttons.length; i++) if (btn(i)) { anyNow = true; break; }
  if (edge('any', anyNow)) pad.any = true;

  if (pickPad.touched || anyNow || pad.gas || pad.brake || pad.steer) pad.lastUse = performance.now();
  pad.active = performance.now() - pad.lastUse < 8000 && pad.lastUse > 0;
  return pad;
}

/* ── в объект ввода игры ──
   Нули пишем только на отпускании — зажатые клавиши не затираются каждый кадр.
   Газ и тормоз в IN — булевы (так их понимает физика), руль — аналоговый через joy/jx:
   moscow.js поворачивает на −jx·1.35, поэтому делим на 1.35, чтобы край стика был ровно
   полным замком. */
const own = { gas: 0, brake: 0, hand: 0, nitro: 0, joy: 0, jx: 0, left: 0, right: 0 };
export function applyToIN (IN, p = pad) {
  const want = {
    gas: p.gas > 0.1 ? 1 : 0,
    brake: p.brake > 0.1 ? 1 : 0,
    hand: p.hand ? 1 : 0,
    nitro: p.nitro ? 1 : 0,
    joy: p.steer ? 1 : 0,
    jx: p.steer / 1.35,
    left: p.steer < -0.2 ? 1 : 0,
    right: p.steer > 0.2 ? 1 : 0,
  };
  for (const k in want) {
    // держим — подтверждаем каждый кадр (setPause/setFullMap обнуляют IN); отпустили — пишем 0 один раз
    if (want[k] ? IN[k] !== want[k] : own[k]) IN[k] = want[k];
    own[k] = want[k];
  }
}

/* ── отдача: удар об машину, взрыв, сбитый самокатчик ──
   strength 0..1, ms — длительность. Chrome/Electron: vibrationActuator 'dual-rumble'.
   На Deck через Steam Input работает, на «сырой» раскладке — как повезёт. */
let rumbleUntil = 0;
export function rumble (strength = 0.6, ms = 200) {
  if (!CFG.rumble || activeIndex < 0) return false;
  const now = performance.now();
  if (now < rumbleUntil - ms * 0.5) return false;          // не долбим поверх длинной отдачи
  const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[activeIndex];
  const act = gp && gp.vibrationActuator;
  if (!act || !act.playEffect) return false;
  const s = Math.max(0, Math.min(1, strength));
  rumbleUntil = now + ms;
  try { act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: s, weakMagnitude: Math.min(1, s * 0.6 + 0.2) }).catch(() => {}); }
  catch (e) { return false; }
  return true;
}
export function setRumble (on) { CFG.rumble = !!on; }
