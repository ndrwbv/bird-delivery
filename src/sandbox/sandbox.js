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
const CFG = Object.assign({ map: 'seversk', kids: false, fast: false, mute: true, god: false, nitro: false, noStall: false, errNear: true, errOut: 'any' }, (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })());
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
  applyErr();
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

  ...['condoms', 'sister', 'passport', 'vodka'].map(id => {
    const s = SIDE_ORDERS.find(q => q.id === id);
    return { group: 'поручения', name: 'Поручение: ' + (s ? s.what : id), needs: ['sideOrder'],
      run: () => (s ? startErrand(s) : call('sideOrder', id)) };
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

  // встречи у двери (encounters.js): микрогерои катсценой у ближайшего подъезда
  const mt = section('встречи');
  mt.appendChild(el('p', 'dim', 'Катсцена у ближайшего подъезда: машина встаёт сама. B / Esc — пропустить. В игре пока не выпадают.'));
  toggle(mt, 'детская версия (перезагрузка)', 'kids', null, () => reload());
  toggle(mt, 'ночь (23:00; выкл — день, 13:00)', 'meetNight', 'time', () => {});
  const ml = el('div', 'story-list'); ml.id = 'meet-list';
  mt.appendChild(ml);
  // знакомые лица района (faces.js): Глеб — 4 появления по кнопкам, прогресс истории
  mt.appendChild(el('h3', '', 'Глеб — знакомое лицо района <span class="dim">4 появления, по одному за смену</span>'));
  const fl = el('div', 'story-list'); fl.id = 'face-list';
  mt.appendChild(fl);

  // заказы
  const or = section('заказы');
  const orb = el('div', 'grid'); or.appendChild(orb);
  button(orb, 'срочный', 'forceOrder', async () => { await G.onShift(); await call('forceOrder', { kind: 'urgent' }); });
  button(orb, 'в конец района', 'forceOrder', async () => { await G.onShift(); await call('forceOrder', { kind: 'edge' }); });
  button(orb, 'развоз смены', 'staffRide', async () => { await G.onShift(); const r = await call('staffRide'); log('развоз: ' + JSON.stringify(r)); });

  // поручения (errands.js, SIDE_ORDERS): кнопка на каждое — смена и просьба ближайшего клиента; «рядом» и исход у человека
  const er = section('поручения');
  er.appendChild(el('p', 'dim', 'Нажал — смена (если не идёт), просит ближайший клиент: ответь «да». Цель — магазин или человек у подъезда. Список — по галочке «детская версия». Что выбрано, исход и сколько заплатили — в журнале.'));
  toggle(er, 'детская версия (перезагрузка)', 'kids', null, () => reload());
  toggle(er, 'рядом: магазин / человек ближе ' + ERR_NEAR + ' м', 'errNear', null, () => applyErr());
  const ro = row(er, 'исход у человека');
  const osel = el('select'); osel.id = 'err-out';
  for (const [v, n] of ERR_OUT) { const o = el('option', '', n); o.value = v; osel.appendChild(o); }
  osel.value = CFG.errOut;
  osel.addEventListener('change', () => { CFG.errOut = osel.value; saveCfg(); applyErr(); renderErrands(); W().focus(); });
  ro.appendChild(osel);
  const elist = el('div', 'story-list'); elist.id = 'err-list';
  er.appendChild(elist);

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
let poiKey = '', storyKey = '', meetKey = '', faceKey = '', errKey = '';
/* ── поручения (docs/SANDBOX.md «Поручения»): errands.js SBX — near (магазин и человек ближе N м), force (исход),
   talk / paid (что было в разговоре и при вручении) ── */
const ERR_NEAR = 150;
const ERR_OUT = [['any', 'как выпадет'], ['give', 'отдаёт'], ['wrong', 'отдаёт не то'], ['none', 'не отдаёт'], ['cost', 'просит взамен']];
const OUT_RU = { give: 'отдаёт', wrong: 'не то', none: 'не отдаёт', cost: 'просит взамен' };
const rub = n => Math.round(n).toLocaleString('ru') + ' ₽';
/* какие исходы бывают у человека (giver): по talk.onYes / onNo, «просит взамен» — если есть talk.cost */
function errOuts (s) {
  if (!s.giver || !s.talk) return [];
  const ks = new Set([...s.talk.onYes, ...s.talk.onNo].map(q => q.k));
  return ['give', 'wrong', 'none'].filter(k => ks.has(k)).concat(s.talk.cost ? ['cost'] : []);
}
function shopName (s) {
  const p = s.shop && s.shop.prefer;
  if (!p) return 'магазин';
  for (const [w, n] of [['аптека', 'аптека'], ['алко', 'алкомаркет'], ['табак', 'табак'], ['мтс', 'салон связи'], ['зоо', 'зоомагазин'], ['продукт', 'продукты']]) if (p.test(w)) return n;
  return s.shop.kinds && s.shop.kinds[0] === 'pharm' ? 'аптека' : 'магазин';
}
const payRange = s => Array.isArray(s.pay) ? rub(s.pay[0]).replace(' ₽', '') + '—' + rub(s.pay[1]) : s.pay ? rub(s.pay) : '';
function applyErr () {
  const d = D(), E = d && d.ERRS;
  if (!E || !E.SBX) return null;
  E.SBX.near = CFG.errNear ? ERR_NEAR : 0;
  E.SBX.force = ['give', 'wrong', 'none'].includes(CFG.errOut) ? CFG.errOut : null;
  return E;
}
/* поручение s сейчас: смена, просит ближайший клиент; нет магазина / человека ближе 150 м — ищем до 380 м */
async function startErrand (s) {
  if (s.adult && CFG.kids) await G.kids(false);
  if (s.kids && !CFG.kids) await G.kids(true);
  await G.onShift();
  const d = D(), E = applyErr(), out = CFG.errOut, outs = errOuts(s);
  if (!E) log('errands.js не в __dlv — «рядом» и исход не работают', 'warn');
  if (s.giver && out !== 'any' && !outs.includes(out)) { log('у «' + s.what + '» нет исхода «' + OUT_RU[out] + '» — как выпадет', 'warn'); if (E) E.SBX.force = null; }
  const cost = s.talk && s.talk.cost;
  if (out === 'cost' && cost && d.wallet && d.addWallet && d.wallet() < cost) { const add = cost - Math.floor(d.wallet()); d.addWallet(add); log('в кошелёк +' + rub(add) + ' — чтобы было чем заплатить'); }
  let ok = await call('sideOrder', s.id);
  if (!ok && E && E.SBX.near) { log('ближе ' + ERR_NEAR + ' м нет — ищу до 380 м', 'warn'); E.SBX.near = 0; ok = await call('sideOrder', s.id); E.SBX.near = ERR_NEAR; }
  if (!ok && !s.giver) ok = await errToShop(s);
  if (!ok) { log('«' + s.what + '»: рядом нет ' + (s.giver ? 'подъезда' : 'нужного магазина') + ' в районе — отъедь и нажми снова', 'warn'); return; }
  const force = E && E.SBX.force;
  log('поручение «' + s.what + '»: «' + s.ask + '» — ответь «' + s.accept + '»' + (s.giver ? ' · исход: ' + (force ? OUT_RU[force] : out === 'cost' && cost ? 'просит взамен ' + rub(cost) + ' — ответь «' + s.talk.yes + '»' : 'как выпадет') : ''));
  watchErrand(s);
}
/* рядом нет нужного магазина — машину к ближайшему подходящему в районе (в 70 м от него) и ещё раз;
   просит ближайший к машине прохожий — он может стоять и дальше: сначала с «рядом», не вышло — до 380 м */
async function errToShop (s) {
  const d = D(), sh = s.shop, V = d.V, DI = d.DIST, E = d.ERRS, x0 = V.x, z0 = V.z;
  if (!d.SIGNS || !sh) return false;
  const inZone = q => !DI || !DI.at || (DI.city && DI.city()) || DI.at(q.x, q.z) === DI.cur();
  const far = q => Math.hypot(q.x - x0, q.z - z0) || 1;
  const L = d.SIGNS.filter(q => sh.kinds.includes(q.k) && (!sh.anyKind || sh.prefer.test(q.n0)) && inZone(q))
    .sort((a, b) => (sh.prefer.test(b.n0) - sh.prefer.test(a.n0)) || far(a) - far(b)).slice(0, 3);
  let ok = false;
  for (const [i, q] of [...L, ...L].entries()) {
    if (E && E.SBX) E.SBX.near = i < L.length && CFG.errNear ? ERR_NEAR : 0;
    const m = far(q);
    await G.tp({ x: q.x + (x0 - q.x) / m * 70, z: q.z + (z0 - q.z) / m * 70 });
    await sleep(1200);                                            // прохожие вокруг — успеть подойти
    if ((ok = !!(await call('sideOrder', s.id)))) { log('переехал к «' + q.n + '» (' + Math.round(m) + ' м отсюда)'); break; }
  }
  applyErr();
  return ok;
}
/* журнал поручения: взял → куда (магазин / человек, сколько м) → разговор и исход → сколько заплатили */
let ERR_WATCH = 0;
async function watchErrand (s) {
  const my = ++ERR_WATCH, t0 = Date.now(), E0 = D() && D().ERRS, n0 = E0 && E0.SBX ? E0.SBX.n : 0;
  let Sd0 = null, stage = '';
  while (my === ERR_WATCH && Date.now() - t0 < 30 * 60e3) {
    await sleep(250);
    const d = D();
    if (!d || !d.S) return;                                       // игру перезагрузили
    const Sd = d.S.side, X = d.ERRS && d.ERRS.SBX;
    if (!Sd0) {
      if (Sd && Sd.it && Sd.it.id === s.id) {
        Sd0 = Sd; stage = Sd.stage;
        const h = Sd.home || Sd.ped, tg = d.S.target, m = tg && h ? Math.round(Math.hypot(tg.x - h.x, tg.z - h.z)) : '?';
        log('взял «' + s.what + '» за ' + rub(Sd.it.pay || 0) + ': ' + (Sd.giverPed ? Sd.shop.n + ' у подъезда' : 'магазин «' + Sd.shop.n + '»') + ', ' + m + ' м от клиента');
      } else if (Date.now() - t0 > 1500 && d.S.state !== 'handover' && !(d.DLG && d.DLG.isOpen())) {
        log('«' + s.what + '»: не взял (отказ или не успел ответить)', 'warn'); return;
      }
      continue;
    }
    if (Sd === Sd0) {
      if (Sd.stage !== stage) {
        stage = Sd.stage;
        if (stage === 'back') {
          const tk = X && X.talk && X.talk.n > n0 && X.talk.id === s.id ? X.talk : null;
          if (tk) log('разговор: ' + (tk.ans === 'yes' ? '«' + s.talk.yes + '»' : tk.ans === 'no' ? '«' + s.talk.no + '»' : 'промолчал') + ' → ' +
            (tk.k === 'give' ? 'отдаёт' : tk.k === 'wrong' ? 'отдаёт не то: ' + tk.item : 'ничего не дал') + (tk.cost ? ', взял из кошелька ' + rub(tk.cost) : '') + (tk.force ? ' (исход задан)' : '') + ' — обратно к клиенту');
          else log('купил — обратно к клиенту');
        }
      }
      continue;
    }
    const pd = X && X.paid && X.paid.n > n0 && X.paid.id === s.id ? X.paid : null;
    if (pd) log('вручил «' + s.what + '»: <b>+' + rub(pd.pay) + '</b> — оплата ' + rub(pd.base) + (pd.share !== 1 ? ' × ' + Math.round(pd.share * 100) + ' %' : '') + (pd.tip ? ' + чаевые ' + rub(pd.tip) : '') +
      (pd.k === 'wrong' ? ' (привёз не то)' : pd.k === 'none' ? ' (вернулся ни с чем)' : ''));
    else log('«' + s.what + '»: кончилось без вручения (опоздал, клиент ушёл или смена кончилась)', 'warn');
    return;
  }
}
/* кнопки: из магазина и у человека у подъезда — во взрослой или детской (по галочке) */
function renderErrands () {
  const box = $('#err-list');
  if (!box) return;
  const L = SIDE_ORDERS.filter(s => (CFG.kids ? !s.adult : !s.kids));
  const key = (CFG.kids ? 'k' : 'a') + CFG.errOut + L.map(s => s.id).join('|');
  if (key === errKey && box.children.length) return;
  errKey = key;
  box.innerHTML = '';
  const out = CFG.errOut;
  for (const [title, part] of [['из магазина', L.filter(s => !s.giver)], ['у человека у подъезда', L.filter(s => s.giver)]]) {
    if (!part.length) continue;
    box.appendChild(el('h3', '', title + ' <span class="dim">' + part.length + '</span>'));
    const grid = el('div', 'grid');
    for (const s of part) {
      const outs = errOuts(s), miss = s.giver && out !== 'any' && !outs.includes(out);
      const sub = s.giver ? s.giver.who + (s.face ? ' · Глеб' : '') + ' · ' + outs.map(k => k === 'cost' ? 'за ' + rub(s.talk.cost) : OUT_RU[k]).join(', ') : shopName(s) + ' · ' + payRange(s);
      const b = el('button', 'btn sm' + (s.giver ? ' story' : '') + (miss ? ' miss' : ''), s.what + '<small>' + sub + '</small>'); b.type = 'button';
      b.title = '«' + s.ask + '»\n' + (s.giver ? 'забрать: ' + s.giver.who + (s.talk ? ' — «' + s.talk.line + '»\n[да] ' + s.talk.yes + ' · [нет] ' + s.talk.no : '') : 'купить: ' + shopName(s)) +
        '\nплатит: ' + payRange(s) + (s.sex ? ' · просит ' + (s.sex === 'f' ? 'женщина' : 'мужчина') : '') + (miss ? '\nисхода «' + OUT_RU[out] + '» нет — будет как выпадет' : '');
      b.addEventListener('click', () => runPreset({ name: 'поручение «' + s.what + '»', run: () => startErrand(s) }));
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}
/* проиграть встречу m героя h у ближайшего подъезда (песочница: без заказа — деньги образцом) */
async function playMeet (h, m) {
  await ready(); await G.riding();
  if (has('time')) await G.time(CFG.meetNight ? 23 : 13);
  W().focus();
  const r = await D().ENC.play(h.id, m.i);
  // итог деньгами — на образце заказа 1 000 ₽ с чаевыми 100 ₽ (encounters.js EN.SAMPLE; в игре — чаевые этого заказа)
  const sm = r && r.sample, d = sm ? sm.add - sm.cut : 0;
  const pay = r && r.out ? ' → ' + (r.seal || r.out) + (r.row ? ' «' + r.row + '»' : '') + (sm ? ': ' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' ₽ на заказе ' + sm.fee + ' ₽ (чаевые ' + sm.tip + ' ₽)' : '') + ', лицо ' + r.mood : '';
  log(r ? 'встреча «' + h.name + '» (' + r.meet + '): ответ ' + (r.ans || '—') + pay + (r.skip ? ', пропущена' : '') + ', ' + (r.ms / 1000).toFixed(1) + ' с' : 'встреча не началась: нет подъезда рядом (до 320 м) или идёт катсцена', r ? '' : 'warn');
}
/* встречи у двери: герой → его встречи (своя и из smalltalk-lines.js), по кнопке на каждую */
function renderMeets () {
  const box = $('#meet-list'), d = D();
  if (!box) return;
  const L = d && d.ENC ? d.ENC.list() : null;
  const key = L ? L.map(h => h.id + h.meets.length).join('|') + (CFG.kids ? 'k' : '') : '-';
  if (key === meetKey && box.children.length) return;
  meetKey = key;
  box.innerHTML = '';
  if (!L) { box.appendChild(el('span', 'dim', 'encounters.js не в __dlv (игра ещё грузится?)')); return; }
  for (const h of L) {
    box.appendChild(el('h3', '', h.name + ' <span class="dim">' + h.decor + '</span>'));
    const grid = el('div', 'grid');
    for (const m of h.meets) {
      const b = el('button', 'btn sm story', '«' + m.say.slice(0, 38) + (m.say.length > 38 ? '…' : '') + '»'); b.type = 'button';
      b.title = m.say + '\n[A] ' + m.a + ' → ' + m.outA + '\n[X] ' + m.b + ' → ' + m.outB;   // итог ответа: tip тепло · big восторг · cut обида · none облом · 0 ну и ладно
      b.addEventListener('click', () => playMeet(h, m));
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}
/* Глеб (faces.js): кнопка на каждое появление (3-е и 4-е — оба варианта: подписал / не подписал в 1-м), прогресс истории */
function renderFaces () {
  const box = $('#face-list'), d = D();
  if (!box) return;
  const L = d && d.ENC ? d.ENC.list(true) : null, st = d && d.FACES ? d.FACES.state : null;
  const key = L && st ? JSON.stringify(st) + (CFG.kids ? 'k' : '') : '-';
  if (key === faceKey && box.children.length) return;
  faceKey = key;
  box.innerHTML = '';
  if (!L || !st) { box.appendChild(el('span', 'dim', 'faces.js не в __dlv (игра ещё грузится?)')); return; }
  const sign = st.sign === 'yes' ? 'подписал' : st.sign === 'no' ? 'не подписал' : '—';
  box.appendChild(el('p', 'dim', 'в игре: ' + (st.step < 4 ? 'следующее — ' + (st.step + 1) + ' из 4 (' + st.next + ')' : 'история кончилась, у подъезда — плакат') +
    ' · ответ в 1-м: ' + sign + (st.key ? ' · подъезд запомнен' : '') + (st.last ? ' · было в смене ' + st.last : '')));
  const gleb = L.find(h => h.id === 'gleb'), wife = L.find(h => h.id === 'glebwife');
  const grid = el('div', 'grid');
  const meetBtn = (label, h, i) => {
    const m = h && h.meets[i];
    if (!m) return;
    const b = el('button', 'btn sm story', label); b.type = 'button';
    b.title = m.say + '\n[A] ' + m.a + ' → ' + m.outA + '\n[X] ' + m.b + ' → ' + m.outB;
    b.addEventListener('click', () => playMeet(h, m));
    grid.appendChild(b);
  };
  // кнопки перерисовываются с прогрессом — без UI (список хуков панели не растёт)
  const btn = (parent, label, fn, cls = 'sm') => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', async () => { await ready(); await fn(); W().focus(); }); parent.appendChild(b); return b; };
  meetBtn('1 · петиция', gleb, 0);
  btn(grid, '2 · листовки (поручение)', async () => { await G.onShift(); await call('sideOrder', CFG.kids ? 'gleb-leaflets-k' : 'gleb-leaflets'); }, 'sm story');
  meetBtn('3 · машина — подписал', gleb, 1);
  meetBtn('3 · машина — не подписал', gleb, 2);
  meetBtn('4 · жена — подписал', wife, 0);
  meetBtn('4 · жена — не подписал', wife, 1);
  box.appendChild(grid);
  const g2 = el('div', 'grid');
  btn(g2, 'историю — с начала', () => { D().FACES.reset(); log('история Глеба — с начала: в следующей смене (со 2-й, первый район) — петиция'); });
  if (st.door) btn(g2, 'к подъезду Глеба', async () => { const [x, z, nx, nz] = D().FACES.state.door; await G.riding(); await G.tp({ x: x + nx * 10, z: z + nz * 10 }); });
  btn(g2, 'кончить историю (плакат)', () => { const s2 = D().FACES.step(4); log(s2.poster ? 'история кончилась: плакат «Вернись, Глеб» у его подъезда' : 'история кончилась; плаката нет — подъезд ещё не запомнен (сыграй 1-е появление в смене)'); });
  box.appendChild(g2);
}
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
    if (String(s.id).startsWith('meet-')) continue;           // встречи у двери — свой раздел «встречи»
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
  renderMeets();
  renderFaces();
  renderErrands();
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
