/* Руль на телефоне не «застревает» (0п44, автор 24.10.2026: «в один момент у меня перестал крутиться руль на мобиле»).
   Запуск: npm run probe -- --eval=tools/probe-checks/touchwheel.js --size=phone-land --sa=59,21 --max=0 --timeout=300
   Палец — PointerEvent из скрипта: «опустил» — тому элементу, что под точкой (elementFromPoint — как браузер), «повёл» и
   «отпустил» — ему же (как захват пальца). Сценарий: держишь руль вправо → случилось X → отпустил (обычно / отпускание
   потерялось / система отменила касание) → X кончилось → новый палец на руль влево: руль должен повернуть влево и
   отпуститься в ноль. X: ничего, окно разговора, пауза, домофон у подъезда, уведомления (тост, плашка, чат),
   уход вкладки в фон (visibilitychange), потеря фокуса (blur), поворот экрана, три пальца (руль + газ + осмотр).
   Ещё: поверх руля и педалей ничего (elementFromPoint в 5 точках руля и в центре каждой педали) — в езде, после
   каждого X; окно, пауза, фон, фокус, поворот — руль отпущен сразу; палец рядом с рулём (на картинке, в 24 px от зоны
   руля) — руль, а не взгляд (camlook.js); посреди экрана — взгляд. В npm run check — id touchwheel. */
const W = window.__wheel, IN = d.IN, LK = d.LOOK.LK;
const tp = document.querySelector('#touchpad .tp-left');
const bad = [], log2 = [];
let pid = 300;
const pe = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false,
  clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true }));
const rect = el => el.getBoundingClientRect();
const mid = el => { const r = rect(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const inside = (el, root) => !!el && (el === root || root.contains(el));
const who = el => el ? (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') : 'null';
// поверх руля и педалей — ничего
function cover (tag) {
  if (document.getElementById('touchpad').hidden) { bad.push(tag + ': руль спрятан'); return; }
  const c = mid(tp), r = rect(tp);
  const pts = [[c.x, c.y], [c.x - r.width * 0.3, c.y], [c.x + r.width * 0.3, c.y], [c.x, c.y - r.height * 0.3], [c.x, c.y + r.height * 0.25]];
  for (const [x, y] of pts) { const e = document.elementFromPoint(x, y); if (!inside(e, tp)) { bad.push(tag + `: поверх руля (${x | 0},${y | 0}) — ${who(e)}`); break; } }
  for (const b of document.querySelectorAll('#touchpad button[data-k]')) {
    if (b.hidden || !b.offsetWidth) continue;
    const m = mid(b), e = document.elementFromPoint(m.x, m.y);
    if (!inside(e, b)) bad.push(tag + `: поверх педали ${b.dataset.k} — ${who(e)}`);
  }
}
// палец на руль: куда попал — тому и события (захват)
async function grip (dx) {
  const c = mid(tp), tgt = document.elementFromPoint(c.x, c.y) || tp, id = ++pid;
  pe(tgt, 'pointerdown', id, c.x, c.y);
  pe(tgt, 'pointermove', id, c.x + dx * 0.5, c.y);
  pe(tgt, 'pointermove', id, c.x + dx, c.y);
  await run(0.15);
  return { id, tgt, x: c.x + dx, y: c.y, s: +W.W.s.toFixed(2), jx: +(IN.jx || 0).toFixed(2), joy: IN.joy };
}
function letGo (g, mode) {
  if (mode === 'up') pe(g.tgt, 'pointerup', g.id, g.x, g.y);
  else if (mode === 'cancel') pe(g.tgt, 'pointercancel', g.id, g.x, g.y);
  else if (mode === 'win') pe(document.body, 'pointerup', g.id, g.x, g.y);        // захват пропал — отпускание пришло не рулю
  // 'lost' — отпускание не пришло вовсе
}
const FREE = ['dialog', 'pause', 'hidden', 'blur', 'turn'];
const playing = () => !d.S.paused && ['drive', 'back', 'side', 'handover'].includes(d.S.state);

const EVENTS = {
  none: { on: async () => {}, off: async () => {} },
  dialog: { on: async () => { d.DLG.say({ person: d.CHAT_PERSON(), name: 'Толик', head: 'проверка', text: 'проверка руля', accept: 'дальше' }); await run(0.6); },
    off: async () => { d.DLG.dismiss(); await run(0.6); } },
  pause: { on: async () => { d.setPause(true); await run(0.3); }, off: async () => { d.setPause(false); await run(0.3); } },
  notify: { on: async () => { d.popBonus('проверка', 'уведомление поверх руля'); d.CHAT.say && d.CHAT.say('проверка: сообщение в чате'); await run(0.8); },
    off: async () => { await run(4); } },
  hidden: { on: async () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); await run(0.3); },
    off: async () => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); await run(0.3); } },
  blur: { on: async () => { dispatchEvent(new Event('blur')); await run(0.3); }, off: async () => { dispatchEvent(new Event('focus')); await run(0.3); } },
  turn: { on: async () => { console.log('__proberesize:390x844'); await wait(900); dispatchEvent(new Event('orientationchange')); await run(0.5); },
    off: async () => { console.log('__proberesize:844x390'); await wait(900); dispatchEvent(new Event('orientationchange')); await run(0.5); if (d.S.paused) d.setPause(false); await run(0.4); } },
};

await onShift();
autopilot(true); await run(3); autopilot(false);
d.S.paused = false;
await run(0.5);
const out = { cover: null, rows: {} };
cover('езда');
// база: руль слушается
{ const g = await grip(60); letGo(g, 'up'); await run(0.1); out.base = { s: g.s, jx: g.jx, after: +(IN.jx || 0).toFixed(2), held: W.W.id !== null };
  if (!(g.s > 0.5 && g.jx > 0.3)) bad.push('руль не слушается и без помех: ' + JSON.stringify(g)); }

for (const ev of Object.keys(EVENTS)) {
  for (const mode of ['up', 'lost', 'cancel', 'win']) {
    if (!playing()) { d.S.paused = false; await run(0.3); }
    const E = EVENTS[ev], tag = ev + '/' + mode;
    const g1 = await grip(60);
    await E.on();
    const freed = W.W.id === null && !(IN.jx || 0);   // окно, пауза, фон, фокус, поворот — руль отпущен сразу (game.js touchReset)
    letGo(g1, mode);
    await E.off();
    if (!playing()) { if (d.S.paused) d.setPause(false); await run(0.4); }
    if (d.DLG.isOpen()) { d.DLG.dismiss(); await run(0.4); }
    cover(tag);
    const g2 = await grip(-60);
    letGo(g2, 'up');
    await run(0.15);
    const r = { s1: g1.s, freed, s2: g2.s, jx2: g2.jx, after: +(IN.jx || 0).toFixed(2), held: W.W.id !== null };
    out.rows[tag] = r;
    if (FREE.includes(ev) && !freed) bad.push(tag + ': руль не отпущен на входе — ' + JSON.stringify(r));
    if (!(g2.s < -0.5 && g2.jx < -0.3)) bad.push(tag + ': руль не слушается после — ' + JSON.stringify(r));
    else if (r.after !== 0 || r.held) bad.push(tag + ': руль не отпустился — ' + JSON.stringify(r));
  }
}

// три пальца: руль + газ + палец по картинке (осмотр); газ отпущен потерянно, осмотр — обычно
{
  const gas = document.querySelector('#touchpad button[data-k="gas"]');
  const cv = document.getElementById('view');
  const g = await grip(60);
  const gm = mid(gas), gid = ++pid;
  pe(gas, 'pointerdown', gid, gm.x, gm.y);
  const lid = ++pid;
  pe(cv, 'pointerdown', lid, 420, 120); pe(cv, 'pointermove', lid, 480, 120);
  await run(0.2);
  const held = { s: +W.W.s.toFixed(2), gas: IN.gas, look: LK.src };
  pe(cv, 'pointerup', lid, 480, 120);
  // газ и руль «потерялись» (iOS: системный жест), потом пальцы снова
  dispatchEvent(new Event('blur')); await run(0.2); dispatchEvent(new Event('focus'));
  await run(0.3);
  const after = { gas: IN.gas, gasOn: gas.classList.contains('on'), look: LK.src };
  const g2 = await grip(-60); letGo(g2, 'up'); await run(0.15);
  out.multi = { held, after, s2: g2.s, jx2: g2.jx };
  if (!(held.s > 0.5 && held.gas === 1)) bad.push('три пальца: руль и газ не держатся вместе — ' + JSON.stringify(held));
  if (after.gas || after.gasOn) bad.push('три пальца: газ остался зажат — ' + JSON.stringify(after));
  if (!(g2.s < -0.5)) bad.push('три пальца: руль не слушается после — ' + JSON.stringify(out.multi));
}

// палец рядом с рулём (на картинке, не на руле) — не осмотр
{
  const cv = document.getElementById('view'), r = rect(tp), lid = ++pid;
  const x = r.right + 24, y = r.top + r.height / 2;
  const e = document.elementFromPoint(x, y);
  pe(e || cv, 'pointerdown', lid, x, y); pe(e || cv, 'pointermove', lid, x + 50, y); await run(0.15);
  out.nearWheel = { on: who(e), look: LK.src, yaw: d.LOOK.yawDeg, wheel: W.W.id === lid, s: +W.W.s.toFixed(2) };
  pe(e || cv, 'pointerup', lid, x + 50, y); await run(0.6);
  if (out.nearWheel.look === 'touch') bad.push('палец в 24 px от руля крутит взгляд (camlook.js)');
  if (!out.nearWheel.wheel || !(out.nearWheel.s > 0.4)) bad.push('палец в 24 px от руля — не руль: ' + JSON.stringify(out.nearWheel));
  if (W.W.id !== null) bad.push('палец у руля отпустил — руль не отпущен');
  // и далеко от руля и педалей (середина экрана сверху) — осмотр работает
  const fid = ++pid;
  pe(cv, 'pointerdown', fid, innerWidth / 2, innerHeight * 0.3); pe(cv, 'pointermove', fid, innerWidth / 2 + 60, innerHeight * 0.3); await run(0.15);
  out.farLook = { look: LK.src, yaw: d.LOOK.yawDeg };
  pe(cv, 'pointerup', fid, innerWidth / 2 + 60, innerHeight * 0.3); await run(0.6);
  if (out.farLook.look !== 'touch') bad.push('осмотр пальцем посреди экрана не работает: ' + JSON.stringify(out.farLook));
}
out.bad = bad;
return out;
