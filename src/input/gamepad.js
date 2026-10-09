/* Геймпад для езды: Xbox, DualShock/DualSense, Steam Deck, Steam Input.

   Раскладка (подписи Xbox; на PlayStation A=✕ B=○ X=□ Y=△):

   | кнопка              | в езде                         | поле pollPad()        | в меню / карточках         |
   |---------------------|--------------------------------|-----------------------|----------------------------|
   | левый стик ←→       | руль, аналоговый               | steer −1..1           | ←→ выбор (menuLeft/Right)  |
   | левый стик ↑↓       | —                              | ly                    | ↑↓ выбор (menuUp/Down)     |
   | RT                  | газ, аналоговый                | gas 0..1              | таб вправо (trigR)         |
   | LT                  | тормоз, на месте — назад       | brake 0..1            | таб влево (trigL)          |
   | A                   | нитро (держать), принять заказ | nitro, accept         | нажать (menuOk)            |
   | B                   | ручник (держать)               | hand                  | назад (menuBack)           |
   | RB                  | нитро (держать), запасная      | nitro                 | —                          |
   | X                   | свободна                       | btnX                  | пометка [X] на «бумаге»    |
   | Y                   | карта района                   | map, btnY             | закрыть карту; пометка [Y] |
   | Back / View / Select| карта района                   | map                   | —                          |
   | на карте района     | RT/LT — зум, стик — двигать, B — закрыть (game.js, padStep → FM) |   |                |
   | Start / Menu (☰)    | пауза, меню                    | pause                 | продолжить                 |
   | крестовина ← ↑ →    | ответ 1 / 2 / 3 на карточке     | choice1..3            | выбор (menu*)              |
   | крестовина ↓        | радио: следующая станция (radio.js) | dDown            | вниз (menuDown)            |
   | R3 (нажать правый)  | звук вкл/выкл                  | sound                 | —                          |
   | LB                  | повтор последних 10 с (replay.js) | pageL              | LB/RB — листать (pageL/R) |
   | правый стик         | свободен (в повторе — перемотка) | rx, ry (сырые)      | —                          |

   Руль: мёртвая зона 12 %, внешняя 3 %, кривая |x|^1.6 — точнее в центре, полный замок у края.
   Курки: мёртвая зона 6 %. Удержания (hand, nitro, gas…) — состояние кадра; всё остальное —
   одноразовые фронты: true ровно в тот кадр, когда кнопку нажали. pollPad() зовут раз в кадр.

   Три раскладки. `mapping: 'standard'` — номера кнопок по спецификации. «Сырая» Xbox-подобная
   (виртуальный пад Steam Input, xpad): курки и крестовина на осях. «Сырая» Deck'а (Valve 28de:1205,
   старый Chromium не знает её сам): кнопки A B X Y — 3 4 5 6, курки — оси 9 (LT) и 8 (RT),
   ☰ — 12, крестовина — кнопки 16–19. Падов бывает несколько (виртуальный от Steam Input плюс
   сырой Deck) — активным считаем тот, на котором шевелились последним, при равенстве — стандартный.

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

const HOLD = ['hand', 'nitro', 'a', 'b'];
const EDGES = ['pause', 'map', 'accept', 'choice1', 'choice2', 'choice3', 'sound', 'any', 'btnX', 'btnY', 'dDown',
  'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuOk', 'menuBack', 'pageL', 'pageR', 'trigL', 'trigR'];

// один объект на всё время: не мусорим каждый кадр
export const pad = {
  connected: false, active: false, id: '', mapping: '', raw: false, index: -1,
  steer: 0, gas: 0, brake: 0, ly: 0, rx: 0, ry: 0,
  hand: false, nitro: false,
  a: false, b: false,       // A и B держат прямо сейчас — для диалогов и мини-игр со своим учётом нажатий
  pause: false, map: false, accept: false, choice1: false, choice2: false, choice3: false, sound: false, any: false,
  dDown: false,             // крестовина ↓ — только она (не стик): радио в езде
  menuUp: false, menuDown: false, menuLeft: false, menuRight: false, menuOk: false, menuBack: false,
  pageL: false, pageR: false,   // LB / RB — листать страницы (гараж карьеры)
  trigL: false, trigR: false,   // LT / RT нажали до половины — табы настроек (settings.js)
  btnX: false, btnY: false,     // X / Y нажали — прямые кнопки экранов-«бумаг» (конец смены: [X] депнуть, [Y] гараж и траты)
  lastUse: 0,               // performance.now() последнего касания — чтобы прятать подсказки мыши/тача
};

// в лог (Electron --log пишет консоль в stdout): какой пад пришёл и с какой раскладкой
if (typeof addEventListener === 'function') {
  addEventListener('gamepadconnected', e => { const g = e.gamepad; console.log('[pad] +', g.index, g.id, 'mapping=' + (g.mapping || 'raw'), 'axes', g.axes.length, 'buttons', g.buttons.length); });
  addEventListener('gamepaddisconnected', e => console.log('[pad] −', e.gamepad.index, e.gamepad.id));
}

const prev = Object.create(null);     // прошлое состояние кнопок — по смыслу, не по номеру
const padAxes = new Map();            // прошлые оси каждого пада — чтобы понять, на каком играют
const trigSeen = Object.create(null); // сырые курки: пока ось не шевельнули, она врёт нулём (= полкурка)
let activeIndex = -1;

function pickPad () {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const live = [];
  for (const p of pads) if (p && p.connected) live.push(p);
  if (!live.length) { padAxes.clear(); return null; }
  let touched = false, best = null;
  for (const p of live) {
    const was = padAxes.get(p.index);
    let act = false;
    if (was) for (let i = 0; i < p.axes.length; i++) if (Math.abs((p.axes[i] || 0) - (was[i] || 0)) > 0.2) { act = true; break; }
    padAxes.set(p.index, Array.prototype.slice.call(p.axes));
    if (!act) for (const b of p.buttons) if (b && (b.pressed || b.value > 0.5)) { act = true; break; }
    // одно нажатие видят оба пада (виртуальный и сырой Deck) — стандартный важнее
    if (act && (!best || (p.mapping === 'standard' && best.mapping !== 'standard'))) best = p;
  }
  if (best) { activeIndex = best.index; touched = true; }
  const gp = live.find(p => p.index === activeIndex) || live.find(p => p.mapping === 'standard') || live[0];
  pickPad.touched = touched;
  return gp;
}

// Deck и новый Steam Controller без Steam Input: Chromium до ~2024 отдаёт их без раскладки
const VALVE_RAW = ['1205', '1302', '1303', '1304', '1305'];
function isValveRaw (id) {
  const m = /vendor:\s*([0-9a-f]{4}).*product:\s*([0-9a-f]{4})/i.exec(id || '');
  if (m) return m[1].toLowerCase() === '28de' && VALVE_RAW.includes(m[2].toLowerCase());
  return /steam deck/i.test(id || '');
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
  const deck = gp.mapping !== 'standard' && isValveRaw(gp.id) && gp.buttons.length >= 20 && gp.axes.length >= 10;
  const raw = !deck && gp.mapping !== 'standard' && gp.axes.length >= 6;
  pad.raw = raw || deck;

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
  if (deck) {
    lx = ax(0); ly = ax(1); rx = ax(2); ry = ax(3);
    lt = trig(9); rt = trig(8);
    dUp = btn(16); dDown = btn(17); dLeft = btn(18); dRight = btn(19);
    B = { a: 3, b: 4, x: 5, y: 6, lb: 7, rb: 8, back: 11, start: 12, l3: 14, r3: 15 };
  } else if (raw) {
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
  pad.hand = b;
  pad.nitro = a || rb;            // нитро — на A (так просил автор), RB — запасная; X теперь свободна
  pad.a = a; pad.b = b;

  const edge = (name, now) => { const was = prev[name] || false; prev[name] = now; return now && !was; };
  if (edge('a', a)) { pad.accept = true; pad.menuOk = true; }
  if (edge('b', b)) pad.menuBack = true;
  if (edge('y', y)) { pad.map = true; pad.btnY = true; }
  if (edge('x', x)) pad.btnX = true;
  if (edge('back', btn(B.back))) pad.map = true;
  if (edge('start', btn(B.start))) pad.pause = true;
  if (edge('r3', btn(B.r3))) pad.sound = true;
  if (edge('lb', btn(B.lb))) pad.pageL = true;
  if (edge('rb', rb)) pad.pageR = true;
  if (edge('lt', pad.brake > 0.5)) pad.trigL = true;
  if (edge('rt', pad.gas > 0.5)) pad.trigR = true;
  if (edge('up', dUp)) { pad.choice2 = true; pad.menuUp = true; }
  if (edge('left', dLeft)) { pad.choice1 = true; pad.menuLeft = true; }
  if (edge('right', dRight)) { pad.choice3 = true; pad.menuRight = true; }
  if (edge('down', dDown)) { pad.menuDown = true; pad.dDown = true; }
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
