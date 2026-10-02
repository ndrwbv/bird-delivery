/* Песочница: игра в iframe и ручки на её window.__dlv (есть с ?debug).
   Каждая ручка — хук (HOOKS): где его искать в __dlv. Хука нет (модуль
   ещё не дописан или не подключён) — кнопка серая, в подсказке — что нужно.
   Список хуков и кто их должен дать — docs/SANDBOX.md.

   Пресеты (PRESETS) — данные: название, какие хуки нужны, и что сделать.
   Новый пресет — строка в массиве. */
import './sandbox.css';
import { SIDE_ORDERS } from '../game/orders.config.js';
import { CAR_LIST, DONATE, SHIFT, tOfHour, hourOf, clock } from '../game/econ.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = $('#game');
const W = () => frame.contentWindow;
const D = () => { try { return W() && W().__dlv; } catch (e) { return null; } };

/* ── настройки песочницы: переживают перезагрузку ── */
const LS = 'sbx-state';
const CFG = Object.assign({ map: 'seversk', kids: false, fast: false, mute: true, god: false, nitro: false, noStall: false }, (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })());
const saveCfg = () => { try { localStorage.setItem(LS, JSON.stringify(CFG)); } catch (e) { /* — */ } };

/* ── журнал ── */
function log (msg, kind = '') {
  const l = $('#log');
  const row = el('div', 'lg ' + kind, '<i>' + new Date().toLocaleTimeString('ru', { hour12: false }) + '</i> ' + msg);
  l.prepend(row);
  while (l.children.length > 40) l.lastChild.remove();
}

/* ─────────────── хуки ───────────────
   mod — в каком объекте __dlv искать (первый найденный), names — какие имена
   функций подойдут. __dlv.HOOKS[ключ] — всегда первым: так ведущий может
   подключить что угодно, не трогая модули. fallback(D) — своя реализация
   на том, что game.js уже отдаёт. */
const MODS = {
  career: d => d.CAREERM || d.CAREER_API || null,
  orders: d => d.ORDM || d.ORDERS || d.ORD || (d.CAREERM && d.CAREERM.ORD) || null,
  cars: d => d.CARSM || d.CARM || d.CARS_API || null,          // cars.js (модуль или его DEBUG) — ведущий кладёт в __dlv.CARSM
  world: d => d.WORLDM || d.WORLD || null,
};
const HOOKS = {
  // встроенные: game.js уже отдаёт всё нужное
  // время — через смену (CAREERM.skipTo): перемотка за 14:00 засчитывает обед, иначе он всплывает в любом пресете
  time: { who: 'game.js', need: 'ENV, ECON', fallback: d => d.ENV && d.ECON ? h => { if (d.CAREERM && d.CAREERM.skipTo) d.CAREERM.skipTo(h); else d.ENV.t = d.ECON.tOfHour(h); if (d.updateEnv) d.updateEnv(0); } : null },
  season: { who: 'seasons.js', need: '__dlv.season.set', fallback: d => d.season && d.season.set ? v => d.season.set(v) : null },
  rain: { who: 'game.js', need: 'ENV', fallback: d => d.ENV ? on => { d.ENV.rainWant = on ? 1 : 0; d.ENV.rainT = on ? 1e6 : 240; if (on) d.ENV.rain = Math.max(d.ENV.rain, 0.6); } : null },
  teleport: { who: 'game.js', need: 'V, nearestRoad, surfaceAt', fallback: d => d.V && d.nearestRoad ? (x, z, h) => teleport(d, x, z, h) : null },
  shift: { who: 'game.js', need: 'startRun', fallback: d => d.startRun ? () => d.startRun(false) : null },
  ride: { who: 'game.js', need: 'startRun', fallback: d => d.startRun ? () => d.startRun(true) : null },
  accept: { who: 'game.js', need: 'acceptOrder', fallback: d => d.acceptOrder ? () => d.acceptOrder() : null },
  endShift: { who: 'game.js', need: 'endShift', fallback: d => d.endShift ? () => d.endShift('время') : null },
  money: { mod: 'career', names: ['addMoney'], who: 'career.js / game.js', need: 'S, addWallet', fallback: d => d.S && d.addWallet ? n => { d.S.money += n; d.addWallet(n); } : null },
  stars: { mod: 'career', names: ['addStars'], who: 'career.js', need: 'CAREERM.addStars' },
  donate: { mod: 'career', names: ['setDonation', 'setDonated'], who: 'career.js', need: 'Store',
    fallback: d => d.Store ? (k, frac) => { d.Store.set('dlv-don-' + k, Math.round(((DONATE[k] && DONATE[k].goal) || 0) * frac)); } : null },
  lunch: { mod: 'career', names: ['lunch', 'showLunch', 'forceLunch'], who: 'career.js', need: 'CAREERM.lunch()' },
  story: { who: 'story.js', need: '__dlv.STORY', fallback: d => d.STORY && d.STORY.list ? d.STORY : null },
  district: { who: 'districts.js', need: '__dlv.DIST', fallback: d => d.DIST && d.DIST.list ? d.DIST : null },
  god: { who: 'game.js', need: 'SBX', fallback: d => d.SBX ? on => { d.SBX.god = !!on; if (on && d.S) { d.S.hp = d.S.hpMax; d.hudHearts && d.hudHearts(); } } : null },
  nitro: { who: 'game.js', need: 'SBX', fallback: d => d.SBX ? on => { d.SBX.nitro = !!on; } : null },
  noStall: { mod: 'cars', names: ['setNoStall'], who: 'cars.js читает SBX.noStall', need: 'SBX + cars.js', fallback: d => d.SBX && MODS.cars(d) ? on => { d.SBX.noStall = !!on; } : null },
  // заказы (orders.js)
  forceOrder: { mod: 'orders', names: ['force', 'forceOrder', 'setCurrent'], who: 'orders.js', need: 'orders.force(spec)' },
  sideOrder: { mod: 'orders', names: ['forceSide', 'side', 'offerSideById'], who: 'orders.js', need: 'orders.forceSide(id)' },
  staffRide: { mod: 'orders', names: ['staffRide'], who: 'orders.js', need: 'orders.staffRide()' },
  // машины (cars.js): своих имён под песочницу у него нет — переходники к тому, что он экспортирует
  setCar: { mod: 'cars', names: ['setCar'], who: 'cars.js → __dlv.CARSM', need: 'CARSM.select(id)',
    fallback: d => { const m = MODS.cars(d); return m && m.select ? id => { own(d, id); m.select(id); } : null; } },
  setL: { mod: 'cars', names: ['setL'], who: 'cars.js → __dlv.CARSM', need: 'CARSM.setL (мотор = 100 − 10·L)',
    fallback: d => { const m = MODS.cars(d); return m && m.worsen && m.L ? v => m.worsen(v - m.L()) : null; } },
  stall: { mod: 'cars', names: ['stallIn'], who: 'cars.js → __dlv.CARSM', need: 'CARSM.stallNow()',
    fallback: d => { const m = MODS.cars(d); return m && m.stallNow ? sec => (sec > 0 ? new Promise(r => setTimeout(() => r(m.stallNow('sandbox')), sec * 1000)) : m.stallNow('sandbox')) : null; } },
  unlockAll: { mod: 'cars', names: ['unlockAll'], who: 'cars.js (сохранение dlv-car-owned)', need: 'Store',
    fallback: d => d.Store ? () => own(d, ...CAR_LIST.map(c => c.id)) : null },
  potholes: { mod: 'cars', names: ['potholeStreet'], who: 'cars.js → __dlv.CARSM', need: 'CARSM.potholes()',
    fallback: d => { const m = MODS.cars(d); return m && m.potholes ? () => potholeStreet(m.potholes()) : null; } },
  // город (world.js)
  thugs: { mod: 'world', names: ['thugs', 'forceThugs', 'gang'], who: 'world.js → __dlv.WORLD', need: 'WORLD.gang()' },
  thugsNext: { mod: 'world', names: ['thugsNext', 'forceThugsNext'], who: 'world.js', need: 'world.thugsNext(true)' },
};
function hook (key) {
  const d = D();
  if (!d) return null;
  const h = HOOKS[key];
  if (d.HOOKS && typeof d.HOOKS[key] === 'function') return d.HOOKS[key];
  if (h.mod) {
    const m = MODS[h.mod](d);
    if (m) for (const n of h.names) if (typeof m[n] === 'function') return m[n].bind(m);
  }
  // staffRide: orders.js отдаёт его и через career (он его зовёт в полночь)
  if (h.fallback) { try { return h.fallback(d); } catch (e) { return null; } }
  return null;
}
const has = key => !!hook(key);
async function call (key, ...args) {
  const f = hook(key);
  if (!f) { log('нет хука <b>' + key + '</b> — ' + HOOKS[key].need + ' (' + HOOKS[key].who + ')', 'warn'); return undefined; }
  try { return await f(...args); } catch (e) { log(key + ': ' + e.message, 'err'); console.error(e); return undefined; }
}

/* купленные машины — сохранение cars.js */
function own (d, ...ids) {
  const cur = d.Store.get('dlv-car-owned', ['semerka']);
  const a = [...new Set([...(Array.isArray(cur) ? cur : []), 'semerka', ...ids])];
  d.Store.set('dlv-car-owned', a);
  return a;
}
/* улица, где ям гуще всего: яма, у которой больше всего соседей в 60 м */
function potholeStreet (P) {
  if (!P || !P.length) return null;
  let best = P[0], bn = -1;
  for (let i = 0; i < P.length; i += Math.max(1, Math.floor(P.length / 400))) {
    const p = P[i];
    let n = 0;
    for (const q of P) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 3600) n++;
    if (n > bn) { bn = n; best = p; }
  }
  log('ямы: ' + bn + ' штук в 60 м');
  return { x: best.x, z: best.z };
}

function teleport (d, x, z, h) {
  const r = d.nearestRoad(x, z, 5, 4);
  const V = d.V;
  if (r) { V.x = r.x; V.z = r.z; V.h = h !== undefined ? h : Math.atan2(r.seg.x2 - r.seg.x1, r.seg.z2 - r.seg.z1); }
  else { V.x = x; V.z = z; if (h !== undefined) V.h = h; }
  V.vx = V.vz = 0; V.y = d.surfaceAt(V.x, V.z);
  V.camX = V.x - Math.sin(V.h) * 11; V.camZ = V.z - Math.cos(V.h) * 11; V.camH = V.h; V.camY = V.y + 6; V.hero = 0;
  if (d.car) { d.car.position.set(V.x, V.y, V.z); d.car.rotation.y = V.h; }
}

/* ─────────────── загрузка игры ─────────────── */
let READY = null;
function url () {
  const q = ['debug', 'sandbox', 'nolb', 'lang=ru', 'map=' + CFG.map];
  if (CFG.kids) q.push('kids');
  if (CFG.fast) q.push('fastshift');
  if (CFG.mute) q.push('mute');
  return './index.html?' + q.join('&');
}
function load () {
  const u = url();
  $('#loading').hidden = false;
  $('#loading-url').textContent = u.replace('./', '');
  READY = new Promise(res => {
    frame.onload = async () => {
      for (let i = 0; i < 240; i++) {
        const d = D();
        if (d && d.frame && d.S && !W().document.body.classList.contains('booting')) break;
        await sleep(250);
      }
      $('#loading').hidden = true;
      applyToggles();
      if (D() && D().S && D().S.state === 'title') await call('ride');
      refresh();
      log('игра загружена: ' + CFG.map + (CFG.kids ? ', детская' : '') + (CFG.fast ? ', fastshift' : ''));
      res(D());
    };
  });
  frame.src = u;
  return READY;
}
async function reload () { saveCfg(); await load(); }
const ready = () => READY || load();

function applyToggles () {
  for (const k of ['god', 'nitro', 'noStall']) { const f = hook(k); if (f) f(CFG[k]); }
}

/* ─────────────── помощники для пресетов ─────────────── */
const G = {
  D, call, has, log, sleep,
  async until (fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn(D())) return true; } catch (e) { /* — */ } await sleep(100); } return false; },
  async map (id) { if (CFG.map !== id) { CFG.map = id; syncInputs(); await reload(); } },
  async kids (on) { if (!!CFG.kids !== !!on) { CFG.kids = !!on; syncInputs(); await reload(); } },
  /* идёт смена и руль в руках: начать, если надо, принять карточку заказа */
  async onShift () {
    const d = D();
    if (!d) return;
    const cm = MODS.career(d);
    const on = cm && cm.shiftOn ? cm.shiftOn() : !d.S.ride && ['drive', 'back', 'handover', 'brief', 'loading', 'side'].includes(d.S.state);
    if (!on || d.S.ride) { await call('shift'); await sleep(300); }
    if (D().S.state === 'brief') { await call('accept'); await G.until(x => x.S.state === 'drive', 4000); }
  },
  async riding () { const d = D(); if (!d) return; if (d.S.state === 'title' || d.S.state === 'over') { await call('ride'); await sleep(200); } },
  time: h => call('time', h),
  season: v => call('season', v),
  rain: on => call('rain', on),
  tp: poi => { const p = typeof poi === 'string' ? POI()[poi] : poi; if (p) return call('teleport', p.x, p.z, p.h); log('нет точки ' + poi, 'warn'); },
  /* глава как текущий заказ; нет orders.force — катсцена сразу у подъезда */
  async story (id, ch) {
    const S = hook('story');
    if (!S) return log('нет story.js в __dlv', 'err');
    const c = S.list().find(s => s.id === id).chapters[ch];
    await G.time(c.hours ? c.hours[0] + 1.5 : 12);
    if (has('forceOrder')) {
      await G.onShift();
      const o = S.orderFor(id, ch);
      const home = D().STORY_DBG.homeOf(id);
      await G.tp({ x: home.x + home.nx * 45, z: home.z + home.nz * 45 });
      await call('forceOrder', o);
      log('глава ' + (ch + 1) + ' «' + c.name + '» — текущий заказ, дом рядом');
    } else {
      await G.riding();
      log('нет orders.force — сразу катсцена главы ' + (ch + 1), 'warn');
      const r = await S.play(id, ch, { teleport: true });
      log('глава ' + (ch + 1) + ' пройдена: +' + r.stars + ' ★, +' + r.money + ' ₽');
    }
  },
};

/* точки города для телепорта */
function POI () {
  const d = D();
  if (!d) return {};
  const out = {};
  const P = d.PZ_CUR || d.PIZZA;
  if (P) out['пиццерия'] = { x: P.x, z: P.z };
  // пиццерии районов (districts.js)
  if (d.DIST && d.PIZZERIAS) d.PIZZERIAS.forEach((q, i) => { if (q && q !== P) out['пиццерия ' + (i + 1)] = { x: q.x, z: q.z }; });
  const C = d.MAP && d.MAP.career;
  if (C) {
    if (C.garage) out['гараж Дяди Жени'] = C.garage;
    if (C.rich) out['особняки'] = C.rich;
    (C.gang || []).forEach((g, i) => { out[g.n ? 'банда: ' + g.n : 'банда ' + (i + 1)] = g; });
    if (C.edge) out['конец города'] = C.edge;
  }
  if (d.STORY_DBG) { try { const h = d.STORY_DBG.homeOf('zina'); if (h) out['баба Зина'] = { x: h.x, z: h.z }; } catch (e) { /* — */ } }
  return out;
}

/* ─────────────── пресеты ───────────────
   needs — без этих хуков пресет серый; want — желательно (без них — упрощённо, в журнал) */
const PRESETS = [
  { group: 'сюжет', name: 'Баба Зина, глава 1', needs: ['story'], want: ['forceOrder'], run: () => G.story('zina', 0) },
  { group: 'сюжет', name: 'Баба Зина, глава 2', needs: ['story'], want: ['forceOrder'], run: () => G.story('zina', 1) },
  { group: 'сюжет', name: 'Баба Зина, глава 3', needs: ['story'], want: ['forceOrder'], run: () => G.story('zina', 2) },

  { group: 'смена', name: 'Бандиты вечером', needs: ['time', 'teleport'], want: ['forceOrder', 'thugsNext'],
    async run () {
      await G.map('seversk'); await G.onShift(); await G.time(19.5);
      const g = D().MAP.career.gang[0];
      await G.tp({ x: g.x + 25, z: g.z + 25 });
      if (has('forceOrder')) await call('forceOrder', { kind: 'pizza', zone: 'gang', near: { x: g.x, z: g.z }, r: 120, dist: { min: 20, max: 90 } });
      if (has('thugsNext')) await call('thugsNext', true); else if (has('thugs')) await call('thugs');
    } },
  { group: 'смена', name: 'Поломка', needs: ['stall'], want: ['setL'],
    async run () { await G.onShift(); await call('setL', 9); log('через 2 с заглохнет'); await call('stall', 2); } },
  { group: 'смена', name: 'Ямы', needs: ['potholes', 'teleport'],
    async run () { await G.map('seversk'); await G.onShift(); const p = await call('potholes'); if (p) { await G.tp(p); D().IN.gas = 1; setTimeout(() => { if (D()) D().IN.gas = 0; }, 1500); } } },
  { group: 'смена', name: 'Гараж Дяди Жени', needs: ['teleport'], want: ['setL'],
    async run () { await G.map('seversk'); await G.onShift(); await call('setL', 6); await G.tp('гараж Дяди Жени'); } },
  { group: 'смена', name: 'Обед', needs: ['time', 'shift'],
    async run () { await G.onShift(); if (has('lunch')) { await G.time(14); await call('lunch'); } else { await G.time(13.97); log('обед — в 14:00, через пару секунд'); } } },
  { group: 'смена', name: 'Конец смены + развоз', needs: ['time', 'shift'], want: ['staffRide'],
    async run () {
      await G.onShift();
      const d = D();
      if (d.ECON && d.ECON.ORDERS) d.ECON.ORDERS.STAFF_CHANCE = 1;       // в полночь развоз — наверняка
      await G.time(23.97);
      log('полночь через пару секунд, развоз смены — наверняка (STAFF_CHANCE = 1 до перезагрузки)');
    } },
  { group: 'смена', name: 'Экран итогов', needs: ['shift', 'endShift', 'money'], want: ['stars'],
    async run () { await G.onShift(); await call('money', 3500); if (has('stars')) await call('stars', 3, 'песочница'); D().S.delivered = 9; await G.time(23.5); await call('endShift'); } },

  { group: 'донаты', name: 'Мусор 0 %', needs: ['donate'], run: () => donate('trash', 0) },
  { group: 'донаты', name: 'Мусор 50 %', needs: ['donate'], run: () => donate('trash', 0.5) },
  { group: 'донаты', name: 'Мусор 100 %', needs: ['donate'], run: () => donate('trash', 1) },
  { group: 'донаты', name: 'Бандиты 0 %', needs: ['donate'], run: () => donate('gang', 0) },
  { group: 'донаты', name: 'Бандиты 100 %', needs: ['donate'], run: () => donate('gang', 1) },

  ...['beer', 'snus', 'lemonade'].map(id => {
    const s = SIDE_ORDERS.find(q => q.id === id);
    return { group: 'поручения', name: 'Поручение: ' + (s ? s.what : id), needs: ['sideOrder'],
      async run () { if (s && s.adult) await G.kids(false); await G.onShift(); await call('sideOrder', id); } };
  }),
  { group: 'заказы', name: 'Срочный заказ', needs: ['forceOrder'], async run () { await G.onShift(); await call('forceOrder', { kind: 'urgent' }); } },
  { group: 'заказы', name: 'Заказ в конец района', needs: ['forceOrder'], async run () { await G.onShift(); await call('forceOrder', { kind: 'edge' }); } },

  { group: 'погода', name: 'Зима ночью, снег', needs: ['season', 'time', 'rain'], async run () { await G.riding(); await G.season(2.4); await G.time(22.5); await G.rain(true); } },
  { group: 'погода', name: 'Осень, дождь', needs: ['season', 'time', 'rain'], async run () { await G.riding(); await G.season(1.4); await G.time(15); await G.rain(true); } },
  { group: 'погода', name: 'Лето, день', needs: ['season', 'time', 'rain'], async run () { await G.riding(); await G.season(0.4); await G.time(12); await G.rain(false); } },

  { group: 'машины', name: 'Все машины', needs: ['unlockAll'], want: ['setCar'], async run () { await call('unlockAll'); log('все 10 открыты — выбери в «машине»'); $('#car-pick') && $('#car-pick').focus(); } },
];
async function donate (k, frac) {
  await call('donate', k, frac);
  const d = D(), cm = MODS.career(d), wm = MODS.world(d);
  // бандитские круги считаются от сохранения каждый раз (ZN.gangZones); кучи мусора пересобирает world.js
  if (k === 'trash' && wm && wm.trash && !(cm && cm.setDonation)) wm.trash(frac);
  const live = !!(cm && (cm.setDonation || cm.setDonated)) || k === 'gang' || (k === 'trash' && wm && wm.trash);
  const v = d && d.donated ? Math.round(d.donated(k) * 100) : Math.round(frac * 100);
  log('донат «' + (k === 'trash' ? 'мусор' : 'бандиты') + '»: ' + v + ' %' + (live ? '' : ' — записал в сохранение, перезагружаю (кучи и круги строятся при загрузке)'));
  if (!live) await reload();
}

let BUSY = false;
async function runPreset (p) {
  if (BUSY) return;
  BUSY = true;
  document.body.classList.add('busy');
  log('▶ ' + p.name);
  try {
    await ready();
    const miss = (p.want || []).filter(k => !has(k));
    if (miss.length) log('упрощённо, нет: ' + miss.join(', '), 'warn');
    // хвосты прошлого пресета: заглохшая машина и открытый выбор не переезжают в следующий
    try { const d = W().__dlv; if (d.CARSM && d.CARSM.reset) d.CARSM.reset(); } catch (e) { /* — */ }
    await p.run();
    applyToggles();                                     // бесконечное здоровье и прочее — поверх пресета
    W().focus();
  } catch (e) { log(p.name + ': ' + e.message, 'err'); console.error(e); }
  BUSY = false;
  document.body.classList.remove('busy');
  refresh();
}

/* ─────────────── панель ─────────────── */
const UI = [];      // { el, hooks: [...] } — перекрашиваем по наличию хуков
function section (title, open = true) {
  const s = el('details', 'sec');
  s.open = open;
  s.appendChild(el('summary', '', title));
  const body = el('div', 'body');
  s.appendChild(body);
  $('#sections').appendChild(s);
  return body;
}
function button (parent, label, hooks, fn, cls = '') {
  const b = el('button', 'btn ' + cls, label);
  b.type = 'button';
  b.addEventListener('click', async () => { if (b.disabled) return; await ready(); await fn(); W().focus(); refresh(); });
  parent.appendChild(b);
  UI.push({ el: b, hooks: [].concat(hooks || []) });
  return b;
}
function row (parent, label) { const r = el('div', 'row'); if (label) r.appendChild(el('label', '', label)); parent.appendChild(r); return r; }
function toggle (parent, label, key, hooks, onChange) {
  const r = el('label', 'tgl');
  const i = el('input'); i.type = 'checkbox'; i.checked = !!CFG[key]; i.dataset.key = key;
  r.appendChild(i); r.appendChild(el('span', '', label));
  i.addEventListener('change', async () => { CFG[key] = i.checked; saveCfg(); await onChange(i.checked); W().focus(); refresh(); });
  parent.appendChild(r);
  UI.push({ el: i, hooks: [].concat(hooks || []), wrap: r });
  return i;
}
function slider (parent, label, min, max, step, value, fmt, hooks, onInput) {
  const r = row(parent, label);
  const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
  const out = el('output', '', fmt(+value));
  i.addEventListener('input', () => { out.textContent = fmt(+i.value); onInput(+i.value); });
  r.appendChild(i); r.appendChild(out);
  UI.push({ el: i, hooks: [].concat(hooks || []), wrap: r });
  return { i, out, set: v => { i.value = v; out.textContent = fmt(+v); } };
}
function syncInputs () { for (const i of document.querySelectorAll('input[data-key]')) i.checked = !!CFG[i.dataset.key]; const m = $('#map-pick'); if (m) m.value = CFG.map; }

function build () {
  // пресеты
  const pre = section('пресеты');
  const groups = [...new Set(PRESETS.map(p => p.group))];
  for (const g of groups) {
    pre.appendChild(el('h3', '', g));
    const grid = el('div', 'grid');
    pre.appendChild(grid);
    for (const p of PRESETS.filter(q => q.group === g)) button(grid, p.name, p.needs, () => runPreset(p), g === 'сюжет' ? 'story' : '');
  }

  // читы
  const ch = section('читы');
  toggle(ch, 'бесконечное здоровье', 'god', 'god', v => call('god', v));
  toggle(ch, 'бесконечное нитро', 'nitro', 'nitro', v => call('nitro', v));
  toggle(ch, 'не глохнет', 'noStall', 'noStall', v => call('noStall', v));

  // игра
  const g = section('игра');
  const r = row(g, 'карта');
  const sel = el('select'); sel.id = 'map-pick';
  for (const [v, n] of [['seversk', 'Солнечный'], ['moscow', 'Москва']]) { const o = el('option', '', n); o.value = v; sel.appendChild(o); }
  sel.value = CFG.map;
  sel.addEventListener('change', () => { CFG.map = sel.value; reload(); });
  r.appendChild(sel);
  toggle(g, 'детская версия (?kids)', 'kids', null, () => reload());
  toggle(g, 'быстрая смена (?fastshift)', 'fast', null, () => reload());
  toggle(g, 'без звука (?mute)', 'mute', null, () => reload());
  const gb = el('div', 'grid'); g.appendChild(gb);
  button(gb, 'начать смену', 'shift', () => call('shift'));
  button(gb, 'просто покататься', 'ride', () => call('ride'));
  button(gb, 'принять заказ', 'accept', () => call('accept'));
  button(gb, 'перезагрузить', null, () => reload());

  // время и погода
  const tw = section('время и погода');
  const hour = slider(tw, 'час', 9, 24, 0.25, 12, v => clock(v), 'time', v => call('time', Math.min(v, 23.99)));
  const sea = slider(tw, 'сезон', 0, 4, 0.05, 0.4, v => v.toFixed(2) + ' · ' + seasonName(v), 'season', v => call('season', v));
  const wb = el('div', 'grid'); tw.appendChild(wb);
  button(wb, 'дождь', 'rain', () => call('rain', true));
  button(wb, 'снег', ['rain', 'season'], async () => { const d = D(); if (!(d.season && d.season.amounts && d.season.amounts.snow > 0.45)) { await call('season', 2.4); sea.set(2.4); } await call('rain', true); });
  button(wb, 'ясно', 'rain', () => call('rain', false));
  UI.hour = hour; UI.sea = sea;

  // сюжет
  const st = section('сюжет');
  const box = el('div', 'story-list'); box.id = 'story-list';
  st.appendChild(box);
  const sb = el('div', 'grid'); st.appendChild(sb);
  button(sb, 'пропустить катсцену', 'story', () => D().STORY_DBG.skip());
  button(sb, 'сбросить прогресс', 'story', () => { D().STORY.reset(); renderStory(); log('прогресс сюжета сброшен'); });

  // заказы
  const or = section('заказы');
  const orb = el('div', 'grid'); or.appendChild(orb);
  button(orb, 'срочный', 'forceOrder', async () => { await G.onShift(); await call('forceOrder', { kind: 'urgent' }); });
  button(orb, 'в конец района', 'forceOrder', async () => { await G.onShift(); await call('forceOrder', { kind: 'edge' }); });
  button(orb, 'развоз смены', 'staffRide', async () => { await G.onShift(); const r = await call('staffRide'); log('развоз: ' + JSON.stringify(r)); });
  const rs = row(or, 'поручение');
  const side = el('select');
  for (const s of SIDE_ORDERS) { const o = el('option', '', s.what + (s.adult ? ' · 18+' : s.kids ? ' · дет.' : '')); o.value = s.id; side.appendChild(o); }
  rs.appendChild(side);
  button(rs, 'сейчас', 'sideOrder', async () => { await G.onShift(); await call('sideOrder', side.value); }, 'sm');

  // районы и волны щедрости (districts.js, econ.js DISTRICT / PACE)
  const ds = section('районы и волны');
  const dr = row(ds, 'район');
  const dsel = el('select'); dsel.id = 'dist-pick';
  for (let i = 0; i < 8; i++) { const o = el('option', '', String(i + 1)); o.value = i; dsel.appendChild(o); }
  dr.appendChild(dsel);
  button(dr, 'работать тут', 'district', async () => {
    const d = D(); d.DIST.unlockAll(); d.DIST.set(+dsel.value);
    log('район ' + (+dsel.value + 1) + ': ' + d.DIST.list()[+dsel.value].name + ' · смена заново');
    await call('shift');
  }, 'sm');
  UI.push({ el: dsel, hooks: ['district'] });
  const db = el('div', 'grid'); ds.appendChild(db);
  button(db, 'открыть все районы', 'district', () => { D().DIST.unlockAll(); log('все районы открыты'); });
  button(db, 'сбросить районы', 'district', () => { D().DIST.reset(); log('районы: открыт только первый, смен — ноль'); });
  for (const [id, name] of [['generous', 'щедрая'], ['normal', 'обычная'], ['tight', 'час пик']])
    button(db, 'волна: ' + name, 'district', () => { const d = D(); d.DIST.setPace(id); if (d.scatterPickups) d.scatterPickups(); log('волна «' + name + '»: кофе ' + (d.PICK_INFO ? d.PICK_INFO.nos + ', бонусов ' + d.PICK_INFO.bonus : '') + ' (заказы — со следующего)'); });

  // смена и события
  const ev = section('смена и события');
  const evb = el('div', 'grid'); ev.appendChild(evb);
  button(evb, 'обед сейчас', ['shift', 'time'], async () => { await G.onShift(); if (has('lunch')) await call('lunch'); else { await G.time(13.97); hour.set(13.97); } });
  button(evb, 'полночь', ['shift', 'time'], async () => { await G.onShift(); await G.time(23.97); hour.set(23.97); });
  button(evb, 'итоги смены', 'endShift', async () => { await G.onShift(); await call('endShift'); });
  button(evb, 'заглохнуть', 'stall', () => call('stall', 0));
  button(evb, 'бандиты', 'thugs', () => call('thugs'));
  button(evb, 'бандиты на след. заказе', 'thugsNext', () => call('thugsNext', true));

  // машина
  const cr = section('машина');
  const rc = row(cr, 'машина');
  const cars = el('select'); cars.id = 'car-pick';
  for (const c of CAR_LIST) { const o = el('option', '', c.id + ' · ' + (c.price ? c.price.toLocaleString('ru') + ' ₽' : 'даром') + (c.stars ? ' + ' + c.stars + '★' : '') + ' · износ ×' + (0.4 + 0.2 * c.L).toFixed(2)); o.value = c.id; cars.appendChild(o); }
  rc.appendChild(cars);
  button(rc, 'сесть', 'setCar', () => call('setCar', cars.value), 'sm');
  UI.push({ el: cars, hooks: ['setCar'] });
  const L = slider(cr, 'износ (мотор = 100 − 10·L %)', 0, 10, 0.1, 0, v => v.toFixed(1) + ' → ' + Math.round(100 - 10 * v) + ' %', 'setL', v => call('setL', v));
  const cb = el('div', 'grid'); cr.appendChild(cb);
  button(cb, 'открыть все', 'unlockAll', () => call('unlockAll'));
  button(cb, 'улица с ямами', ['potholes', 'teleport'], async () => { const p = await call('potholes'); if (p) G.tp(p); });
  UI.L = L;

  // деньги и звёзды
  const mn = section('деньги и звёзды');
  const mb = el('div', 'grid'); mn.appendChild(mb);
  for (const n of [1000, 10000, 100000]) button(mb, '+' + n.toLocaleString('ru') + ' ₽', 'money', () => call('money', n));
  for (const n of [1, 5, 12]) button(mb, '+' + n + ' ★', 'stars', () => call('stars', n, 'песочница'));
  for (const k of ['trash', 'gang']) {
    const s = slider(mn, k === 'trash' ? 'донат: мусор' : 'донат: бандиты', 0, 100, 5, 0, v => v + ' %', 'donate', () => {});
    s.i.addEventListener('change', () => donate(k, +s.i.value / 100));
    UI['don_' + k] = s;
  }

  // телепорт
  const tp = section('телепорт');
  const tpb = el('div', 'grid'); tpb.id = 'poi-grid'; tp.appendChild(tpb);
}
let poiKey = '', storyKey = '';
function renderPOI () {
  const g = $('#poi-grid');
  if (!g) return;
  const key = Object.keys(POI()).join('|');
  if (key === poiKey && g.children.length) return;
  poiKey = key;
  g.innerHTML = '';
  for (const [n, p] of Object.entries(POI())) {
    const b = el('button', 'btn', n); b.type = 'button';
    b.addEventListener('click', async () => { await G.riding(); await G.tp(p); W().focus(); });
    g.appendChild(b);
  }
  if (!g.children.length) g.appendChild(el('span', 'dim', 'нет точек — игра ещё грузится'));
}
function renderStory () {
  const box = $('#story-list'), d = D();
  if (!box) return;
  const key = d && d.STORY ? JSON.stringify(d.STORY.progress()) + has('forceOrder') : '-';
  if (key === storyKey && box.children.length) return;
  storyKey = key;
  box.innerHTML = '';
  if (!d || !d.STORY) { box.appendChild(el('span', 'dim', 'story.js не в __dlv')); return; }
  for (const s of d.STORY.list()) {
    box.appendChild(el('h3', '', s.name + ' <span class="dim">пройдено ' + s.done + ' из ' + s.chapters.length + '</span>'));
    const grid = el('div', 'grid');
    for (const c of s.chapters) {
      const card = el('div', 'chap' + (c.i < s.done ? ' done' : ''));
      card.appendChild(el('b', '', (c.i + 1) + '. ' + c.name));
      card.appendChild(el('span', 'dim', c.hours ? clock(c.hours[0]) + '—' + clock(c.hours[1]) : 'в любое время'));
      const bb = el('div', 'bb');
      const a = el('button', 'btn sm story', 'как заказ'); a.type = 'button';
      a.disabled = !has('forceOrder'); a.title = a.disabled ? 'нужен orders.force(spec) — docs/SANDBOX.md' : '';
      a.addEventListener('click', () => runPreset({ name: s.name + ', глава ' + (c.i + 1), run: () => G.story(s.id, c.i) }));
      const p = el('button', 'btn sm', 'катсцена'); p.type = 'button';
      p.addEventListener('click', async () => { await ready(); await G.riding(); W().focus(); const r = await d.STORY.play(s.id, c.i, { teleport: true }); log('глава ' + (c.i + 1) + ': +' + r.stars + ' ★, +' + r.money + ' ₽'); renderStory(); });
      bb.appendChild(a); bb.appendChild(p);
      card.appendChild(bb);
      grid.appendChild(card);
    }
    box.appendChild(grid);
  }
}

const SEASONS = ['начало лета', 'разгар лета', 'конец лета', 'ранняя осень', 'золотая осень', 'поздняя осень', 'начало зимы', 'разгар зимы', 'конец зимы', 'ранняя весна', 'разгар весны', 'поздняя весна'];
const seasonName = v => SEASONS[Math.floor((((v % 4) + 4) % 4) * 3) % 12];

/* доступность ручек — по наличию хуков */
function refresh () {
  for (const u of UI) {
    if (!u.el) continue;
    const miss = u.hooks.filter(k => !has(k));
    u.el.disabled = miss.length > 0;
    const tip = miss.length ? 'нет хука: ' + miss.map(k => k + ' (' + HOOKS[k].who + ')').join(', ') + ' — docs/SANDBOX.md' : '';
    u.el.title = tip;
    if (u.wrap) { u.wrap.classList.toggle('off', miss.length > 0); u.wrap.title = tip; }
  }
  renderPOI();
  renderStory();
  const d = D();
  if (d && d.ENV && UI.hour && document.activeElement !== UI.hour.i) UI.hour.set(Math.min(24, Math.max(9, hourOf(d.ENV.t))));
  if (d && d.season && UI.sea && document.activeElement !== UI.sea.i) UI.sea.set(d.season.value);
  if (d && d.donated) for (const k of ['trash', 'gang']) { const s = UI['don_' + k]; if (s && document.activeElement !== s.i) s.set(Math.round(d.donated(k) * 100)); }
}
function status () {
  const d = D(), s = $('#status');
  if (!d || !d.S) { s.textContent = 'грузится…'; return; }
  const cm = MODS.career(d);
  const h = d.ENV ? hourOf(d.ENV.t) : 0;
  const stars = cm && cm.stars ? cm.stars() : '—';
  const bits = [
    '<b>' + (d.S.state || '—') + '</b>' + (d.S.ride ? ' · катаемся' : cm && cm.shiftOn && cm.shiftOn() ? ' · смена' : ''),
    clock(h) + (d.ENV && d.ENV.rainWant ? ' · осадки' : ''),
    '♥ ' + d.S.hp + '/' + d.S.hpMax,
    Math.round(d.S.money || 0).toLocaleString('ru') + ' ₽ · кошелёк ' + (d.wallet ? Math.round(d.wallet()).toLocaleString('ru') : '—') + ' · ★ ' + stars,
    d.STORY && d.STORY.active() ? '<i class="pink">катсцена</i>' : '',
  ].filter(Boolean);
  s.innerHTML = bits.join('<br>');
}

build();
syncInputs();
load();
setInterval(status, 250);
setInterval(() => { if (!BUSY) refresh(); }, 2500);
addEventListener('keydown', e => { if (e.target === document.body && D()) W().focus(); });
// SHIFT и tOfHour — те же числа, что у игры: проверка, что песочница собрана с тем же econ.js
if (Math.abs(tOfHour(SHIFT.KEYS[0][1]) - SHIFT.T0) > 1e-6) console.warn('[sandbox] econ.js: tOfHour не сходится с SHIFT');
