/* Карьера (Стим): десять машин, ломучесть, «заглохла» с мини-игрой, ямы на
   дорогах и гараж Дяди Жени. Числа — econ.js (CAR_LIST, UPGRADE, BREAK),
   правила — docs/CAREER.md. Работает только когда в game.js CAREER.

   Переменных игры модуль не видит — всё приходит в api (carsApi в game.js):
     init(api)            — один раз до первой машины; повторный вызов дописывает
                            поля (career.js может подменить wallet / addWallet)
     build()              — из buildCity: ямы и гараж в статику (LITM / LIT)
     step(dt, vf)         — каждый кадр после driveStep
     stalled()            — мотор заглох: driveStep не даёт газа и нитро
     onHit(vn)            — настоящий удар (hurtCar): 40 %, что L + 1
     radar / mapMark      — метка гаража на радаре и на полной карте

   Для экрана конца смены (career.js):
     list()               — все машины: цена, звёзды, сердца, L, куплена ли, прокачка
     buy(id[, api])       — { ok, why: 'owned' | 'stars' | 'money' | 'unknown' }
     select(id)           — выбрать купленную
     upgrade(id, kind)    — kind: 'armor' (+1 сердце) | 'engine' (+4 % скорости)
     current()            — выбранная машина с учётом прокачки (hp, vmax, acc, L…)
     L()                  — ломучесть выбранной
     previewCanvas(id, { w, h, spin }) — картинка машины для карточки магазина

   Сохранения: dlv-car-owned (массив id), dlv-car-cur (id), dlv-car-up
   ({ id: { armor, engine } }), dlv-car-L ({ id: L }). Звёзды — dlv-stars. */
import { CAR_LIST, UPGRADE, BREAK, upgradePrice } from './econ.js';
import { t } from '../i18n/index.js';
import { pad as PAD } from '../input/gamepad.js';
import './cars.css';

const N_ = s => s;
let A = null;

export function init (api) {
  if (!A) A = {};
  Object.defineProperties(A, Object.getOwnPropertyDescriptors(api));   // геттеры (S, V, car) — как геттеры
}

/* ─────────────── каталог ─────────────── */

/* Кузов собирается тем же makeCar, что и весь поток (панели мнутся), но со
   своими габаритами (spec — как CAR_SPEC) и своей мордой (dress). lift —
   клиренс: кузов выше, колёса на месте. chrome — цвет бамперов. */
const LOOK = {
  semerka: {
    name: N_('Семёрка'), note: N_('ВАЗ-2107 в цветах пиццерии: хром, квадратные фары'), hex: '#f0522a', roof: '#fff3e2', chrome: '#d4d8dc', model: 'sedan',
    spec: { L: 4.13, W: 1.62, h: 0.44, hood: 1.35, trunk: 1.0, cab: 1.85, cz: -0.2, ch: 0.6, r: 0.37, fz: 1.3, bz: -1.12 },
  },
  matiz: {
    name: N_('Матизик'), note: N_('крошечный высокий хэтчбек, круглые фары'), hex: '#a6cc3f', model: 'hatch',
    spec: { L: 3.5, W: 1.5, h: 0.5, hood: 0.72, trunk: 0, cab: 2.4, cz: -0.4, ch: 0.8, r: 0.33, fz: 1.15, bz: -1.12 },
  },
  kopeyka: {
    name: N_('Копейка'), note: N_('ВАЗ-2101: двойные круглые фары и клыки на бампере'), hex: '#86b7cf', chrome: '#d4d8dc', model: 'sedan',
    spec: { L: 4.07, W: 1.61, h: 0.44, hood: 1.3, trunk: 1.02, cab: 1.8, cz: -0.18, ch: 0.62, r: 0.36, fz: 1.25, bz: -1.17 },
  },
  priora: {
    name: N_('Приорик'), note: N_('заниженная, тонированная — классика двора'), hex: '#232428', tint: true, low: true, model: 'sedan',
    spec: { L: 4.35, W: 1.68, h: 0.46, hood: 1.3, trunk: 0.95, cab: 2.1, cz: -0.15, ch: 0.54, r: 0.38, fz: 1.3, bz: -1.25 },
  },
  buhanka: {
    name: N_('Буханка'), note: N_('УАЗ-452: фургон-батон, кабина над мотором'), hex: '#7d8a52', chrome: '#3a3a34', model: 'hatch', lift: 0.12,
    spec: { L: 4.36, W: 1.94, h: 0.78, hood: 0.3, trunk: 0, cab: 4.28, cz: 0, ch: 1.0, r: 0.42, fz: 1.25, bz: -1.1 },
  },
  niva: {
    name: N_('Нивка'), note: N_('трёхдверный полный привод: ямы не замечает'), hex: '#e6e1cf', chrome: '#2b2a2e', model: 'hatch', lift: 0.14,
    spec: { L: 3.74, W: 1.68, h: 0.56, hood: 1.15, trunk: 0, cab: 2.3, cz: -0.55, ch: 0.74, r: 0.42, fz: 1.12, bz: -1.08 },
  },
  volga: {
    name: N_('Волжанка'), note: N_('ГАЗ-24: длинная, чёрная, вся в хроме'), hex: '#1b1c21', chrome: '#d9dde2', model: 'sedan',
    spec: { L: 4.74, W: 1.8, h: 0.48, hood: 1.62, trunk: 1.18, cab: 1.95, cz: -0.2, ch: 0.6, r: 0.38, fz: 1.43, bz: -1.37 },
  },
  cruze: {
    name: N_('Шеви Круиз'), note: N_('современный седан: раскосые фары, покатая крыша'), hex: '#b7bcc3', model: 'sedan',
    spec: { L: 4.6, W: 1.8, h: 0.52, hood: 1.25, trunk: 0.8, cab: 2.4, cz: -0.15, ch: 0.56, r: 0.41, fz: 1.35, bz: -1.32 },
  },
  vesta: {
    name: N_('Вестачка'), note: N_('современная, с иксом на морде'), hex: '#2d5fa6', model: 'sedan',
    spec: { L: 4.41, W: 1.76, h: 0.52, hood: 1.2, trunk: 0.82, cab: 2.3, cz: -0.14, ch: 0.56, r: 0.41, fz: 1.3, bz: -1.3 },
  },
  patriot: {
    name: N_('Патриот'), note: N_('большой внедорожник: запаска на двери, ямы не замечает'), hex: '#3a4c3c', chrome: '#2a2a2e', model: 'hatch', lift: 0.2,
    spec: { L: 4.78, W: 1.9, h: 0.66, hood: 1.35, trunk: 0, cab: 3.05, cz: -0.72, ch: 0.82, r: 0.5, fz: 1.42, bz: -1.35 },
  },
};
const BY_ID = new Map(CAR_LIST.map(c => [c.id, c]));
const START = CAR_LIST[0].id;

/* ─────────────── сохранения ─────────────── */
const K_OWN = 'dlv-car-owned', K_CUR = 'dlv-car-cur', K_UP = 'dlv-car-up', K_L = 'dlv-car-L';
const sget = (k, d) => (A && A.Store ? A.Store.get(k, d) : d);
const sset = (k, v) => { if (A && A.Store) A.Store.set(k, v); };
const flush = () => { const p = A && A.Platform; if (p && p.store && p.store.flush) p.store.flush(); };
const obj = k => { const v = sget(k, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const ownedIds = () => { const v = sget(K_OWN, [START]); const a = Array.isArray(v) ? v.filter(id => BY_ID.has(id)) : []; if (!a.includes(START)) a.unshift(START); return a; };
const curId = () => { const id = sget(K_CUR, START); return BY_ID.has(id) && ownedIds().includes(id) ? id : START; };
const ups = id => { const u = obj(K_UP)[id] || {}; return { armor: Math.min(UPGRADE.STEPS, +u.armor || 0), engine: Math.min(UPGRADE.STEPS, +u.engine || 0) }; };
const getL = id => { const v = obj(K_L)[id]; return v === undefined || !isFinite(+v) ? BY_ID.get(id).L : +v; };
function setL (id, v) {
  const m = obj(K_L);
  m[id] = Math.round(Math.max(0, Math.min(Math.max(BREAK.MAX_L, BY_ID.get(id).L), v)) * 100) / 100;
  sset(K_L, m);
  return m[id];
}
const stars = () => +sget('dlv-stars', 0) || 0;
const wallet = api => (api && api.wallet ? +api.wallet() || 0 : 0);
function pay (api, n) {
  if (api.spend) return api.spend(n) !== false;
  if (api.addWallet) { api.addWallet(-n); return true; }
  return false;
}

/* ─────────────── экспорт для гаража в конце смены ─────────────── */
function spec (id) {
  const c = BY_ID.get(id), L = LOOK[id], u = ups(id);
  return {
    id, name: t(L.name), note: t(L.note), hex: L.hex, model: L.model, price: c.price, stars: c.stars,
    hpBase: c.hp, hp: c.hp + u.armor * UPGRADE.HP,
    vmaxBase: c.vmax, vmax: Math.round(c.vmax * (1 + u.engine * UPGRADE.VMAX) * 10) / 10, acc: c.acc,
    Lbase: c.L, L: getL(id), offroad: !!c.offroad, up: u,
    upPrice: { armor: u.armor < UPGRADE.STEPS ? upgradePrice(c, u.armor) : null, engine: u.engine < UPGRADE.STEPS ? upgradePrice(c, u.engine) : null },
  };
}
export function list () {
  const own = ownedIds(), cur = curId();
  return CAR_LIST.map(c => ({ ...spec(c.id), owned: own.includes(c.id), current: c.id === cur }));
}
export const current = () => spec(curId());
export const L = () => getL(curId());
export function buy (id, api = A) {
  const c = BY_ID.get(id);
  if (!c) return { ok: false, why: 'unknown' };
  if (ownedIds().includes(id)) return { ok: false, why: 'owned' };
  if (stars() < c.stars) return { ok: false, why: 'stars', need: c.stars };
  if (wallet(api) < c.price) return { ok: false, why: 'money', need: c.price };
  if (c.price && !pay(api, c.price)) return { ok: false, why: 'money', need: c.price };
  sset(K_OWN, ownedIds().concat(id));
  select(id);
  flush();                                          // покупка — сохранить сразу
  return { ok: true };
}
export function select (id) {
  if (!ownedIds().includes(id)) return false;
  sset(K_CUR, id);
  PREV.delete(id);
  if (A && A.resetCar) A.resetCar();
  return true;
}
export function upgrade (id, kind, api = A) {
  const c = BY_ID.get(id);
  if (!c || (kind !== 'armor' && kind !== 'engine')) return { ok: false, why: 'unknown' };
  if (!ownedIds().includes(id)) return { ok: false, why: 'owned' };
  const u = ups(id);
  if (u[kind] >= UPGRADE.STEPS) return { ok: false, why: 'max' };
  const price = upgradePrice(c, u[kind]);
  if (wallet(api) < price || !pay(api, price)) return { ok: false, why: 'money', need: price };
  const all = obj(K_UP);
  all[id] = { ...u, [kind]: u[kind] + 1 };
  sset(K_UP, all);
  flush();
  PREV.delete(id);
  if (id === curId() && A && A.resetCar) A.resetCar();   // кенгурятник виден сразу
  return { ok: true, price };
}
/* сделать хуже / лучше (бандиты, Дядя Женя, сюжет) */
export function worsen (n = 1, id = curId()) { return setL(id, getL(id) + n); }
export function repair (n = 1, id = curId()) { return setL(id, getL(id) - n); }
export const names = () => Object.fromEntries(CAR_LIST.map(c => [c.id, t(LOOK[c.id].name)]));

/* ─────────────── модели ─────────────── */

export function makeModel (id, o = {}) {
  if (!LOOK[id]) id = START;
  const c = LOOK[id], u = o.up || ups(id);
  // шашка доставки — только на «Семёрке» пиццерии: остальные — свои, по ним узнают прототип
  const g = A.makeCar(c.hex, o.sign !== undefined ? !!o.sign : id === START, c.model, false, {
    spec: c.spec, lift: c.lift || 0, low: c.low, tint: c.tint, chrome: c.chrome || c.hex, roofHex: c.roof,
    dress: (g, add, k) => dress(id, g, add, k, u),
  });
  g.userData.careerId = id;
  return g;
}

/* морда, корма и мелочи — всё, кроме фар, в общий склеенный меш кузова;
   фары и фонари — один меш без света, чтобы горели ночью */
function dress (id, g, add, k, u) {
  const { THREE } = A;
  const { S, W, hl, top, y0, bodyHex, CHR, dy } = k;
  const cy = top + S.ch / 2, roof = top + S.ch, cf = S.cz + S.cab / 2, cb = S.cz - S.cab / 2;
  const lamps = [];
  const B = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (rx) geo.rotateX(rx); if (ry) geo.rotateY(ry); if (rz) geo.rotateZ(rz);
    add(geo, hex, x, y, z);
  };
  const Cy = (r, len, hex, x, y, z, seg = 12) => add(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), hex, x, y, z);
  const lamp = (geo, hex, x, y, z) => A.put(lamps, geo, hex, x, y + dy, z);
  const round = (r, hex, x, y, z) => lamp(new THREE.CylinderGeometry(r, r, 0.05, 12).rotateX(Math.PI / 2), hex, x, y, z);
  const rect = (w, h, hex, x, y, z, ry = 0) => lamp(new THREE.BoxGeometry(w, h, 0.05).rotateY(ry), hex, x, y, z);
  const HEAD = '#fff4cf', TAIL = '#e0283a', AMBER = '#ffa630', DARK = '#1f1e23';
  const both = f => { f(-1); f(1); };
  const fr = hl + 0.02, bk = -hl - 0.02;              // передняя и задняя плоскость

  // склон лобового и заднего стекла: коробка салона плюс клин стекла
  const slope = (front, run, hex = '#4f7197') => {
    const rise = S.ch - 0.06, len = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const z = front ? cf + run / 2 - 0.02 : cb - run / 2 + 0.02;
    B(W - 0.26, 0.05, len, hex, 0, top + rise / 2 + 0.05, z, front ? a : -a);
  };
  const tails = (w, h, y, x = W / 2 - 0.22) => both(s => rect(w, h, TAIL, s * x, y, bk));

  switch (id) {
    case 'semerka': {
      // широкая хромированная решётка между прямоугольными фарами
      B(W * 0.94, 0.28, 0.05, CHR, 0, top - 0.14, fr);
      B(W * 0.5, 0.2, 0.06, '#26232a', 0, top - 0.14, fr + 0.01);
      for (let i = -3; i <= 3; i++) B(0.022, 0.2, 0.07, CHR, i * W * 0.07, top - 0.14, fr + 0.015);
      both(s => { rect(0.3, 0.17, HEAD, s * (W / 2 - 0.25), top - 0.13, fr + 0.03); rect(0.14, 0.06, AMBER, s * (W / 2 - 0.25), top - 0.29, fr + 0.02); });
      // большие фонари с поворотником
      both(s => { rect(0.3, 0.2, TAIL, s * (W / 2 - 0.3), top - 0.13, bk); rect(0.12, 0.2, AMBER, s * (W / 2 - 0.1), top - 0.13, bk); });
      // белая полоса по борту и хромированные молдинги окон
      both(s => B(0.02, 0.07, S.L - 0.5, '#fff3e2', s * (W / 2 + 0.075), top - 0.22, 0));
      both(s => B(0.035, 0.035, S.cab, CHR, s * (W / 2 - 0.05), roof - 0.02, S.cz));
      break;
    }
    case 'kopeyka': {
      // горизонтальная хромированная решётка и по две круглые фары
      B(W * 0.92, 0.26, 0.05, CHR, 0, top - 0.13, fr);
      B(W * 0.86, 0.2, 0.06, '#2a262d', 0, top - 0.13, fr + 0.01);
      for (const oy of [-0.06, 0, 0.06]) B(W * 0.36, 0.018, 0.07, CHR, 0, top - 0.13 + oy, fr + 0.015);
      both(s => {
        for (const x of [W / 2 - 0.17, W / 2 - 0.4]) { Cy(0.105, 0.04, CHR, s * x, top - 0.13, fr + 0.03); round(0.085, HEAD, s * x, top - 0.13, fr + 0.05); }
        rect(0.12, 0.05, AMBER, s * (W / 2 - 0.2), top - 0.29, fr + 0.02);
        B(0.06, 0.22, 0.07, CHR, s * 0.42, y0 - 0.03, hl + 0.1);             // клыки на бампере
        rect(0.26, 0.15, TAIL, s * (W / 2 - 0.24), top - 0.13, bk);
        rect(0.1, 0.15, AMBER, s * (W / 2 - 0.07), top - 0.13, bk);
      });
      // закруглённые углы крыши — фасками
      both(s => B(0.14, 0.14, S.cab - 0.08, bodyHex, s * (W / 2 - 0.16), roof - 0.05, S.cz, 0, 0, Math.PI / 4));
      both(s => B(0.035, 0.035, S.L - 0.8, CHR, s * (W / 2 + 0.075), top - 0.18, 0));
      break;
    }
    case 'matiz': {
      // капот круто вниз, крупные круглые фары на углах, маленькая решётка
      B(W - 0.1, 0.1, 0.62, bodyHex, 0, top + 0.1, hl - 0.34, 0.42);
      both(s => {
        Cy(0.17, 0.08, DARK, s * (W / 2 - 0.26), top + 0.02, fr - 0.02);
        round(0.14, HEAD, s * (W / 2 - 0.26), top + 0.02, fr + 0.02);
        rect(0.12, 0.06, AMBER, s * (W / 2 - 0.2), top - 0.22, fr + 0.02);
        rect(0.14, 0.34, TAIL, s * (W / 2 - 0.11), top + 0.12, bk);
      });
      B(0.42, 0.1, 0.05, DARK, 0, top - 0.14, fr + 0.01);
      B(W * 0.7, 0.14, 0.05, DARK, 0, y0 - 0.12, fr + 0.02);                  // нижний воздухозаборник
      break;
    }
    case 'priora': {
      // узкая хромированная полоса, раскосые фары, губа спойлера
      B(W * 0.34, 0.07, 0.05, '#c9ced4', 0, top - 0.1, fr + 0.01);
      B(W * 0.7, 0.16, 0.05, DARK, 0, y0 - 0.08, fr + 0.02);
      both(s => {
        rect(0.4, 0.12, '#eaf4ff', s * (W / 2 - 0.26), top - 0.08, fr + 0.02, s * 0.12);
        Cy(0.05, 0.03, '#bfe0ff', s * (W / 2 - 0.16), top - 0.08, fr + 0.05);    // «ангельские глазки»
        rect(0.42, 0.13, TAIL, s * (W / 2 - 0.26), top - 0.09, bk);
      });
      B(W - 0.3, 0.05, 0.14, bodyHex, 0, top + 0.2, -hl + 0.12);
      slope(true, 0.42, '#16181e'); slope(false, 0.34, '#16181e');
      break;
    }
    case 'buhanka': {
      // морда — плоская, фары низко, решётка из вертикальных щелей
      B(W * 0.34, 0.34, 0.05, '#5e6a3c', 0, top - 0.3, fr);
      for (let i = -3; i <= 3; i++) B(0.03, 0.28, 0.06, '#1f2217', i * 0.07, top - 0.3, fr + 0.01);
      both(s => {
        Cy(0.14, 0.05, '#2a2c22', s * (W / 2 - 0.3), top - 0.36, fr);
        round(0.115, HEAD, s * (W / 2 - 0.3), top - 0.36, fr + 0.03);
        round(0.05, AMBER, s * (W / 2 - 0.3), top - 0.1, fr + 0.03);
        rect(0.14, 0.2, TAIL, s * (W / 2 - 0.12), top - 0.45, bk);
      });
      // батон: скруглённые рёбра крыши и спереди
      both(s => B(0.26, 0.26, S.cab - 0.2, bodyHex, s * (W / 2 - 0.2), roof - 0.08, S.cz, 0, 0, Math.PI / 4));
      B(W - 0.46, 0.26, 0.26, bodyHex, 0, roof - 0.08, cf - 0.12, Math.PI / 4);
      B(W - 0.46, 0.26, 0.26, bodyHex, 0, roof - 0.08, cb + 0.12, Math.PI / 4);
      B(W - 0.46, 0.08, S.cab - 0.3, bodyHex, 0, roof + 0.02, S.cz);
      // окна в ряд: простенки поверх длинного стекла
      both(s => { for (const z of [cf - 0.95, cf - 1.9, cf - 2.85]) B(0.1, S.ch * 0.66, 0.16, bodyHex, s * (W / 2 - 0.02), cy + 0.03, z); });
      B(W + 0.1, 0.12, 0.2, '#2a2c22', 0, y0 - 0.34, hl + 0.02);              // бампер-балка
      break;
    }
    case 'niva': {
      B(W * 0.6, 0.24, 0.05, DARK, 0, top - 0.14, fr);
      for (const oy of [-0.07, 0, 0.07]) B(W * 0.56, 0.02, 0.06, '#aeb3ba', 0, top - 0.14 + oy, fr + 0.01);
      both(s => {
        B(0.28, 0.28, 0.05, DARK, s * (W / 2 - 0.2), top - 0.14, fr);
        round(0.1, HEAD, s * (W / 2 - 0.2), top - 0.14, fr + 0.03);
        rect(0.14, 0.06, AMBER, s * (W / 2 - 0.2), top - 0.34, fr + 0.02);
        rect(0.14, 0.3, TAIL, s * (W / 2 - 0.1), top - 0.05, bk);
        // чёрные расширители арок и молдинг
        for (const z of [S.fz, S.bz]) B(0.1, 0.1, S.r * 2.3, '#26252a', s * (W / 2 + 0.05), S.r * 2 + 0.08 - dy, z);
        B(0.04, 0.1, S.L - 0.4, '#26252a', s * (W / 2 + 0.07), top - 0.3, 0);
      });
      // багажник на крыше
      both(s => B(0.05, 0.08, S.cab - 0.4, '#2b2a30', s * (W / 2 - 0.2), roof + 0.14, S.cz));
      for (const z of [-0.6, 0, 0.6]) B(W - 0.36, 0.04, 0.05, '#2b2a30', 0, roof + 0.18, S.cz + z);
      break;
    }
    case 'volga': {
      // во всю морду — хромированная решётка с круглыми фарами на краях
      B(W * 0.96, 0.3, 0.05, CHR, 0, top - 0.15, fr);
      B(W * 0.62, 0.22, 0.06, '#1a1a1e', 0, top - 0.15, fr + 0.01);
      for (let i = -2; i <= 2; i++) B(W * 0.6, 0.02, 0.07, CHR, 0, top - 0.15 + i * 0.045, fr + 0.015);
      both(s => {
        Cy(0.13, 0.04, CHR, s * (W / 2 - 0.2), top - 0.14, fr + 0.02);
        round(0.105, HEAD, s * (W / 2 - 0.2), top - 0.14, fr + 0.04);
        B(0.06, 0.2, 0.07, CHR, s * 0.36, y0 - 0.04, hl + 0.1);
        rect(0.16, 0.26, TAIL, s * (W / 2 - 0.14), top - 0.14, bk);
        B(0.02, 0.035, S.L - 0.5, CHR, s * (W / 2 + 0.075), top - 0.12, 0);   // молдинг по борту
        B(0.035, 0.035, S.cab, CHR, s * (W / 2 - 0.05), roof - 0.02, S.cz);
      });
      B(0.05, 0.14, 0.3, CHR, 0, top + 0.19, hl - 0.25);                     // фигурка на капоте — просто хромированный гребень
      break;
    }
    case 'cruze': {
      B(W * 0.44, 0.1, 0.05, DARK, 0, top - 0.08, fr + 0.01);
      B(W * 0.44, 0.025, 0.06, '#d6dade', 0, top - 0.08, fr + 0.02);
      B(W * 0.6, 0.2, 0.05, DARK, 0, y0 - 0.08, fr + 0.02);
      B(W * 0.56, 0.025, 0.06, '#8d9299', 0, y0 - 0.08, fr + 0.03);
      both(s => {
        rect(0.46, 0.1, '#eaf4ff', s * (W / 2 - 0.3), top - 0.06, fr + 0.01, s * 0.2);
        rect(0.46, 0.13, TAIL, s * (W / 2 - 0.3), top - 0.06, bk, -s * 0.12);
      });
      slope(true, 0.62); slope(false, 0.5);
      B(W - 0.36, 0.03, 0.08, bodyHex, 0, top + 0.19, -hl + 0.06);
      break;
    }
    case 'vesta': {
      // икс: два хромированных штриха крест-накрест через всю морду
      const run = W * 0.56, rise = 0.5, len = Math.hypot(run, rise), a = Math.atan2(rise, run);
      B(W * 0.5, 0.34, 0.05, DARK, 0, y0 + 0.02, fr);
      both(s => B(len, 0.09, 0.06, '#dfe3e8', 0, y0 + 0.02, fr + 0.025, 0, 0, s * a));
      both(s => {
        rect(0.4, 0.1, '#eaf4ff', s * (W / 2 - 0.26), top - 0.07, fr + 0.02, s * 0.16);
        rect(0.14, 0.05, '#eaf4ff', s * (W / 2 - 0.2), y0 - 0.18, fr + 0.03);   // противотуманки — концы икса
        rect(0.44, 0.12, TAIL, s * (W / 2 - 0.26), top - 0.08, bk);
      });
      slope(true, 0.6); slope(false, 0.46);
      break;
    }
    case 'patriot': {
      B(W * 0.56, 0.36, 0.05, '#cfd3d8', 0, top - 0.2, fr);
      for (let i = -3; i <= 3; i++) B(0.07, 0.3, 0.06, '#26272c', i * 0.14, top - 0.2, fr + 0.01);
      both(s => {
        B(0.36, 0.24, 0.05, DARK, s * (W / 2 - 0.22), top - 0.17, fr);
        rect(0.3, 0.18, HEAD, s * (W / 2 - 0.22), top - 0.17, fr + 0.03);
        rect(0.14, 0.34, TAIL, s * (W / 2 - 0.1), top + 0.02, bk);
        for (const z of [S.fz, S.bz]) B(0.12, 0.12, S.r * 2.3, '#26252a', s * (W / 2 + 0.06), S.r * 2 + 0.06 - dy, z);
        B(0.22, 0.05, S.fz - S.bz - S.r * 2 - 0.12, '#2a2a2e', s * (W / 2 + 0.08), 0.42 - dy, (S.fz + S.bz) / 2);   // подножка
        B(0.06, 0.08, S.cab - 0.3, '#2b2a30', s * (W / 2 - 0.22), roof + 0.14, S.cz);   // рейлинги
      });
      // запаска на задней двери
      Cy(0.44, 0.26, '#1f1b19', 0, top + 0.08, -hl - 0.16, 14);
      Cy(0.22, 0.28, '#8f949b', 0, top + 0.08, -hl - 0.16, 10);
      break;
    }
  }
  // броня: кенгурятник, на третьей ступени — ещё и люстра на крыше
  if (u.armor >= 1) {
    const zb = hl + 0.22, yb = y0 + 0.02;
    both(s => B(0.07, 0.62, 0.07, '#2b2c31', s * W * 0.34, yb + 0.05, zb));
    B(W * 0.74, 0.07, 0.07, '#2b2c31', 0, yb + 0.34, zb);
    B(W * 0.74, 0.07, 0.07, '#2b2c31', 0, yb - 0.14, zb);
    if (u.armor >= 2) both(s => B(0.07, 0.07, 0.3, '#2b2c31', s * W * 0.34, yb - 0.14, zb - 0.16));
  }
  if (u.armor >= 3) {
    B(W * 0.7, 0.06, 0.12, '#2b2c31', 0, roof + 0.12, cf - 0.2);
    for (let i = -1; i <= 1; i++) round(0.07, HEAD, i * 0.3, roof + 0.2, cf - 0.14);
  }
  // мотор: на второй ступени — двойной выхлоп
  if (u.engine >= 2) both(s => add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateX(Math.PI / 2), '#9aa0a8', s * 0.25, y0 - 0.2, -hl - 0.05));
  if (lamps.length) {
    const m = new THREE.Mesh(A.mergeGeos(lamps), new THREE.MeshBasicMaterial({ vertexColors: true }));
    m.position.y = -dy;                           // склейку сдвинет вместе с кузовом, put уже поднял
    g.add(m);
  }
}

/* ─────────────── картинка для витрины ───────────────
   Один маленький WebGL на все карточки: рисует машину и копирует кадр в
   обычный canvas. spin — медленно крутится, пока карточка на экране. */
let PV = null;
const PREV = new Map();
function rig () {
  if (PV) return PV;
  const { THREE } = A;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6070, 1.9));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(5, 8, 6); sc.add(d);
  const cam = new THREE.PerspectiveCamera(26, 1.6, 0.1, 100);
  return (PV = { r, sc, cam });
}
function model (id) {
  let m = PREV.get(id);
  if (!m) { m = makeModel(id); PREV.set(id, m); }
  return m;
}
function drawPreview (cv, id, ang) {
  const { r, sc, cam } = rig();
  if (r.domElement.width !== cv.width || r.domElement.height !== cv.height) r.setSize(cv.width, cv.height, false);
  const m = model(id), Lc = LOOK[id].spec.L;
  sc.add(m);
  m.rotation.set(0, ang, 0);
  cam.aspect = cv.width / cv.height; cam.updateProjectionMatrix();
  const dist = Lc * 1.55 + 3.2;
  cam.position.set(Math.sin(0.35) * dist, dist * 0.36, Math.cos(0.35) * dist);
  cam.lookAt(0, 0.8, 0);
  r.setClearColor(0x000000, 0);
  r.render(sc, cam);
  sc.remove(m);
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  x.drawImage(r.domElement, 0, 0);
}
export function previewCanvas (id, o = {}) {
  const cv = document.createElement('canvas');
  cv.width = o.w || 240; cv.height = o.h || 150;
  cv.className = 'car-prev';
  if (!A || !BY_ID.has(id)) return cv;
  let ang = o.angle !== undefined ? o.angle : 0.55;
  try { drawPreview(cv, id, ang); } catch (e) { console.warn('[cars] preview', e); return cv; }
  if (o.spin) {
    let last = performance.now(), gone = 0;
    const tick = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!cv.isConnected) { if ((gone += dt) > 2) return; } else gone = 0;
      if (cv.isConnected) { ang += dt * 0.7; drawPreview(cv, id, ang); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return cv;
}

/* ─────────────── ямы ───────────────
   Несколько сотен по городу, гуще в частном секторе, промзоне и у гаражей
   (ZN.zoneAt). Рисуются прямо в статику дорог: кромка битого асфальта,
   светлый скол с одной стороны (как будто свет падает в яму), сама яма и
   тёмное дно, пара трещин. Раскладка — от зерна карты, всегда одна и та же. */
const POT = [], PGRID = new Map(), PCELL = 16;
const pkey = (x, z) => Math.floor(x / PCELL) + ',' + Math.floor(z / PCELL);
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let q = Math.imul(seed ^ (seed >>> 15), 1 | seed); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
const ZONE_W = { poor: 4, garage: 5, ind: 4, gang: 3, normal: 1, rich: 0.2 };

function potholeNear (x, z, r) {
  const ci = Math.floor(x / PCELL), cj = Math.floor(z / PCELL);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++)
    for (const p of PGRID.get(i + ',' + j) || []) if (Math.hypot(p.x - x, p.z - z) < p.r + r) return p;
  return null;
}

function buildPotholes () {
  const { CITY, MAP, LITM, ZN } = A;
  const R = rng([...String(MAP.id || 'x')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const want = MAP.id === 'moscow' ? 140 : 460;
  const segs = [];
  let tot = 0;
  for (const r of CITY.roads) {
    if (r.b || r.x || r.c > 5) continue;           // мосты, пешеходка — без ям
    const w = A.roadWidth(r);
    for (let i = 1; i < r.p.length; i++) {
      const [x1, z1] = r.p[i - 1], [x2, z2] = r.p[i];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 8) continue;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      if (A.inBounds && !A.inBounds(mx, mz, -20)) continue;
      const k = (ZONE_W[ZN.zoneAt(mx, mz)] || 1) * (1 + r.c * 0.3) * len;
      tot += k;
      segs.push({ x1, z1, x2, z2, len, w, c: r.c, acc: tot });
    }
  }
  if (!segs.length) return;
  const avoid = [];
  if (A.PIZZA) avoid.push([A.PIZZA.x, A.PIZZA.z, 22]);
  if (GAR) avoid.push([GAR.ox, GAR.oz, 14]);
  const pickSeg = () => {
    const v = R() * tot;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (segs[m].acc < v) lo = m + 1; else hi = m; }
    return segs[lo];
  };
  let made = 0;
  for (let tries = 0; made < want && tries < want * 6; tries++) {
    const s = pickSeg();
    const ux = (s.x2 - s.x1) / s.len, uz = (s.z2 - s.z1) / s.len, nx = -uz, nz = ux;
    let along = s.len * (0.12 + R() * 0.76);
    const side = R() < 0.5 ? -1 : 1;
    const n = R() < 0.3 ? 2 + (R() < 0.35 ? 1 : 0) : 1;     // бывают по две-три подряд
    for (let q = 0; q < n && made < want; q++) {
      const r = 0.34 + R() * R() * 0.7;
      const lat = side * Math.min(s.w / 2 - r - 0.35, s.w / 2 * (0.15 + R() * 0.62));
      if (lat * side < 0) continue;
      const x = s.x1 + ux * along + nx * lat, z = s.z1 + uz * along + nz * lat;
      along += 1.6 + R() * 2.4;
      if (along > s.len - 2) break;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      if (potholeNear(x, z, r + 0.4)) continue;
      const lift = 0.206 + (7 - s.c) * 0.001;
      if (q === 0 && R() < 0.22) patch(LITM, x + ux * (R() - 0.5) * 1.5, z + uz * (R() - 0.5) * 1.5, Math.atan2(uz, ux), R, lift);
      hole(LITM, x, z, r, Math.atan2(uz, ux) + (R() - 0.5) * 0.8, 0.62 + R() * 0.3, R, lift);
      const p = { x, z, r, t: 0 };
      POT.push(p);
      const k = pkey(x, z);
      let a = PGRID.get(k);
      if (!a) PGRID.set(k, a = []);
      a.push(p);
      made++;
    }
  }
}

function hole (M, x, z, r, ang, el, R, lift) {
  const n = 10, base = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, k = 0.74 + R() * 0.4;
    base.push([Math.cos(a) * k, Math.sin(a) * k * el]);
  }
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (s, ox = 0, oz = 0) => base.map(([u, v]) => { const X = u * r * s + ox, Z = v * r * s + oz; return [x + X * ca - Z * sa, z + X * sa + Z * ca]; });
  M.color('#7b7e86'); M.poly(at(1.28), lift);                           // кромка битого асфальта
  M.color('#b3b6bc'); M.poly(at(1.02, r * 0.1, r * 0.1), lift + 0.006); // скол, на который падает свет
  M.color('#4b4c53'); M.poly(at(1), lift + 0.012);                      // яма
  M.color('#323339'); M.poly(at(0.56, -r * 0.1, -r * 0.08), lift + 0.018);   // дно, в дождь — лужа
  // волосяные трещины от кромки — коротко и зигзагом, почти в цвет асфальта
  M.color('#747881');
  const cracks = 1 + (R() * 2 | 0);
  for (let i = 0; i < cracks; i++) {
    let a = R() * Math.PI * 2, px = x + Math.cos(a) * r * 1.2, pz = z + Math.sin(a) * r * 1.2 * el;
    for (let k = 0; k < 3; k++) {
      const l = r * (0.18 + R() * 0.22), nx = px + Math.cos(a) * l, nz = pz + Math.sin(a) * l;
      M.ribbon(px, pz, nx, nz, 0.045 - k * 0.01, lift + 0.004);
      px = nx; pz = nz; a += (R() - 0.5) * 1.3;
    }
  }
}
/* заплатка: прямоугольник свежего асфальта, который положили рядом и не туда */
function patch (M, x, z, ang, R, lift) {
  const w = 0.7 + R() * 0.9, d = 0.5 + R() * 0.6, ca = Math.cos(ang), sa = Math.sin(ang);
  const P = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => { u += (R() - 0.5) * 0.2; v += (R() - 0.5) * 0.2; return [x + u * ca - v * sa, z + u * sa + v * ca]; });
  M.color('#8a8e97'); M.poly(P, lift - 0.002);
}

/* ─────────────── гараж Дяди Жени ───────────────
   Кирпичная коробка с открытыми воротами к улице, вывеска, смотровая яма,
   стеллаж с инструментом, покрышки и бочка. Стены держат машину (obb),
   внутрь заезжаешь через ворота. Всё — в статику LIT, вывеска — один меш. */
let GAR = null, ZHENYA = null;
const GW = 5.8, GD = 8.4, GH = 3.3, DOOR = 3.4;

function garageSpot () {
  const G = A.MAP.career && A.MAP.career.garage;
  if (!G) return null;
  /* Точка из карты стоит посреди гаражного ряда: свой бокс ставим рядом, на
     свободное место — ворота к ближайшей улице, от неё до ворот 4—40 м, под
     коробкой и площадкой перед воротами ни домов, ни деревьев, ни полотна. */
  const near = (A.SOLIDS || []).filter(s => Math.abs(s.cx - G.x) < 140 && Math.abs(s.cz - G.z) < 140);
  const blocked = (x, z) => {
    if (A.inHouse && A.inHouse(x, z, 0.6)) return true;
    for (const s of near) {
      const dx = x - s.cx, dz = z - s.cz;
      if (Math.abs(dx * s.cs + dz * s.sn) < s.hw + 0.8 && Math.abs(-dx * s.sn + dz * s.cs) < s.hd + 0.8) return true;
    }
    const r = A.nearestRoad(x, z, 6, 1);
    return !!r && r.d < r.seg.w / 2 + 1.2;
  };
  const make = (ox, oz, fx, fz) => ({ ox, oz, fx, fz, rx: fz, rz: -fx, ry: Math.atan2(fx, fz), gy: A.groundH(ox, oz) });
  for (let rad = 0; rad <= 120; rad += 3) {
    const n = Math.max(1, Math.round(rad * 2 * Math.PI / 4));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, cx = G.x + Math.cos(a) * rad, cz = G.z + Math.sin(a) * rad;
      const road = A.nearestRoad(cx, cz, 5, 3);
      if (!road) continue;
      const d = road.d, w = road.seg.w;
      if (d < w / 2 + GD / 2 + 4 || d > w / 2 + GD / 2 + 40) continue;
      const fx = (road.x - cx) / d, fz = (road.z - cz) / d;
      const g = make(cx + fx * GD / 2, cz + fz * GD / 2, fx, fz);
      let ok = true;
      for (let u = -GW / 2 - 0.6; u <= GW / 2 + 0.61 && ok; u += 1.2)
        for (let v = -GD - 0.6; v <= 4.01 && ok; v += 1.2)
          if (blocked(g.ox + g.rx * u + g.fx * v, g.oz + g.rz * u + g.fz * v)) ok = false;
      if (!ok) continue;
      g.road = { x: road.x, z: road.z, w };
      return g;
    }
  }
  const road = A.nearestRoad(G.x, G.z, 5, 4);
  const d = road ? Math.max(0.01, road.d) : 1;
  return make(G.x, G.z, road ? (road.x - G.x) / d : 0, road ? (road.z - G.z) / d : 1);
}

function signMat () {
  const { THREE } = A;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#f3e7c6'; x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#b8322c'; x.lineWidth = 8; x.strokeRect(4, 4, 504, 88);
  // гаечный ключ слева
  x.save(); x.translate(52, 48); x.rotate(-0.7);
  x.fillStyle = '#4a4f58'; x.fillRect(-6, -26, 12, 52);
  x.beginPath(); x.arc(0, -28, 14, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f3e7c6'; x.fillRect(-5, -44, 10, 16);
  x.restore();
  x.fillStyle = '#2a1d10'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 36;
  const txt = t('Автосервис у Дяди Жени');
  do { x.font = 'bold ' + fs + 'px sans-serif'; fs -= 2; } while (x.measureText(txt).width > 400 && fs > 14);
  x.fillText(txt, 290, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex });
}

function buildGarage () {
  const g = garageSpot();
  if (!g) return;
  GAR = g;
  const { THREE, LIT, FLAT, box, put, obb } = A;
  const { fx, fz, rx, rz, ry, gy } = g;
  const at = (u, v) => [g.ox + rx * u + fx * v, g.oz + rz * u + fz * v];   // u — вбок, v — наружу (внутри гаража v < 0)
  const B = (w, h, d, hex, u, y, v, rot = 0) => { const [x, z] = at(u, v); box(LIT, w, h, d, hex, x, gy + y, z, ry + rot); };
  const P = (geo, hex, u, y, v, rxA = 0, ryA = 0, rzA = 0, list = LIT) => { const [x, z] = at(u, v); put(list, geo, hex, x, gy + y, z, rxA, ry + ryA, rzA); };
  const WALL = '#cfc4b0', PLINTH = '#8f877b', ROOF = '#4d474b', T = 0.3;
  const hw = GW / 2 + T / 2, back = -GD - T / 2;
  // пол и площадка перед воротами
  B(GW + 0.6, 0.08, GD + 0.4, '#8b8983', 0, 0.04, -GD / 2);
  B(DOOR + 2, 0.06, 3.2, '#9c9990', 0, 0.03, 1.6);
  if (g.road) {                                  // накатанный заезд от улицы: щебёнка по земле
    const [x0, z0] = at(0, 3), x1 = g.road.x - fx * g.road.w / 2, z1 = g.road.z - fz * g.road.w / 2;
    A.LITM.color('#a8a192'); A.LITM.ribbon(x0, z0, x1, z1, DOOR + 0.8, 0.05);
    A.LITM.color('#8e887b');
    for (const s of [-1, 1]) A.LITM.ribbon(x0 + rx * s * 0.9, z0 + rz * s * 0.9, x1 + rx * s * 0.9, z1 + rz * s * 0.9, 0.5, 0.06);   // колея
  }
  // стены: бока, зад, перед с проёмом; цоколь темнее
  for (const s of [-1, 1]) {
    B(T, GH, GD + T, WALL, s * hw, GH / 2, -GD / 2);
    B(T + 0.04, 0.5, GD + T + 0.04, PLINTH, s * hw, 0.25, -GD / 2);
    const [cx, cz] = at(s * hw, -GD / 2); obb(cx, cz, T / 2 + 0.05, GD / 2 + T / 2, ry);
  }
  B(GW + T * 2, GH, T, WALL, 0, GH / 2, back);
  B(GW + T * 2 + 0.04, 0.5, T + 0.04, PLINTH, 0, 0.25, back);
  { const [cx, cz] = at(0, back); obb(cx, cz, GW / 2 + T, T / 2 + 0.05, ry); }
  const side = (GW - DOOR) / 2;
  for (const s of [-1, 1]) {
    const u = s * (DOOR / 2 + side / 2 + T / 2);
    B(side + T, GH, T, WALL, u, GH / 2, -T / 2);
    B(side + T + 0.04, 0.5, T + 0.04, PLINTH, u, 0.25, -T / 2);
    const [cx, cz] = at(u, -T / 2); obb(cx, cz, (side + T) / 2, T / 2 + 0.05, ry);
  }
  B(DOOR, GH - 2.75, T, WALL, 0, 2.75 + (GH - 2.75) / 2, -T / 2);           // над воротами
  // плоская крыша из рубероида с капельником
  B(GW + T * 2 + 0.5, 0.2, GD + T + 0.7, ROOF, 0, GH + 0.1, -GD / 2 + 0.1);
  B(GW + T * 2 + 0.56, 0.08, 0.1, '#6b646a', 0, GH + 0.02, 0.45);
  // открытые створки ворот — наружу, облезлая синяя краска
  for (const s of [-1, 1]) {
    const a = 1.25, dx = Math.cos(a) * s, dz = Math.sin(a), len = DOOR / 2 - 0.05;
    const u = s * DOOR / 2 + dx * len / 2, v = dz * len / 2 + 0.05;
    B(0.07, 2.7, len, '#3f7488', u, 1.37, v, -Math.atan2(dx, dz) + Math.PI);
    B(0.08, 0.22, len * 0.4, '#8a5a3a', u + dx * 0.2, 0.7, v + dz * 0.2, -Math.atan2(dx, dz) + Math.PI);   // ржавчина
  }
  // смотровая яма: чёрная щель с жёлто-чёрной окантовкой
  B(0.9, 0.02, 4.6, '#131215', 0, 0.09, -GD / 2 - 0.2);
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) B(0.14, 0.022, 0.38, i % 2 ? '#1d1c20' : '#f0c43a', s * 0.52, 0.095, -GD / 2 - 0.2 - 2.3 + 0.19 + i * 0.383);
  // стена с инструментом: перфощит, ключи, молоток
  B(3.0, 1.2, 0.05, '#b08a5a', 0.6, 1.75, -GD + 0.05);
  for (let i = 0; i < 8; i++) B(0.05, 0.28 + (i % 3) * 0.08, 0.04, '#8d949c', -0.6 + i * 0.3, 1.9, -GD + 0.1);
  B(0.3, 0.07, 0.05, '#7a4b2e', 1.1, 1.45, -GD + 0.1); B(0.1, 0.1, 0.06, '#5a5f66', 1.25, 1.45, -GD + 0.1);
  // верстак с тисками
  B(2.2, 0.08, 0.7, '#6b4f3a', 0.6, 0.9, -GD + 0.4);
  for (const s of [-1, 1]) B(0.08, 0.86, 0.6, '#4a3a2e', 0.6 + s * 1.0, 0.45, -GD + 0.4);
  B(0.24, 0.18, 0.2, '#3f6f8a', 0.0, 1.03, -GD + 0.35);
  // покрышки стопкой, бочка, канистра, аккумулятор
  for (let i = 0; i < 4; i++) P(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), '#1f1d1f', GW / 2 - 0.55, 0.12 + i * 0.23, -1.3);
  P(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), '#b8322c', GW / 2 - 0.5, 0.45, -2.4);
  P(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12), '#8a2622', GW / 2 - 0.5, 0.92, -2.4);
  B(0.34, 0.44, 0.18, '#3d6b3a', -GW / 2 + 0.4, 0.22, -1.2);
  B(0.3, 0.22, 0.18, '#2a2a2e', -GW / 2 + 0.4, 0.11, -1.8);
  // старый мотор на подставке и покрышка у ворот снаружи
  B(0.7, 0.5, 0.5, '#5a5f66', -GW / 2 + 0.6, 0.62, -GD + 0.7);
  B(0.5, 0.36, 0.5, '#3a3a40', -GW / 2 + 0.6, 0.18, -GD + 0.7);
  P(new THREE.TorusGeometry(0.36, 0.12, 6, 12), '#1f1d1f', DOOR / 2 + 1.1, 0.3, 0.9, 0, 0.4, 0);
  // лампочка под потолком — ночью горит
  P(new THREE.BoxGeometry(0.2, 0.2, 0.2), '#fff1b8', 0, GH - 0.35, -GD / 2, 0, 0, 0, A.LAMPH);
  P(new THREE.BoxGeometry(0.03, 0.3, 0.03), '#2b2a30', 0, GH - 0.12, -GD / 2);
  if (A.LAMP_SPOTS) A.LAMP_SPOTS.push(at(0, 1.5));
  // окошко в боковой стене
  P(new THREE.PlaneGeometry(0.9, 0.6), '#5b7ea3', -hw - T / 2 - 0.01, 2.1, -GD + 2, 0, -Math.PI / 2, 0, FLAT);
  // вывеска над воротами — в мировых координатах, чтобы легла в заморозку CULL
  const sg = new THREE.PlaneGeometry(4.8, 0.9);
  const [sx, sz] = at(0, 0.02);
  sg.rotateY(ry); sg.translate(sx, gy + GH + 0.62, sz);
  A.scene.add(new THREE.Mesh(sg, signMat()));
  B(5.0, 1.0, 0.1, '#6b4f3a', 0, GH + 0.62, -0.05);
  for (const s of [-1, 1]) B(0.08, 0.5, 0.08, '#2b2a30', s * 2.2, GH + 0.1, -0.05);
  buildZhenya();
}

/* Дядя Женя: большой, с животом, в замасленном синем комбинезоне и кепке */
function buildZhenya () {
  const { THREE, makePerson, makeHuman } = A;
  const person = makePerson({ seed: 0x2E1A, fem: false, fat: true });
  Object.assign(person.look, { age: 'adult', beard: 'mustache', hair: 'receding', head: 'cap', headC: '#3b4a5a', capBack: false,
    glasses: 'none', shape: 'chubby', hairC: '#5a3c26', browC: '#4a3020', mouth: 'smile', bg: '#c6d8a0', pack: null, top: 'tee',
    skin: '#eab993', stubble: true, nose: 'big', brows: 'thick', shirt: '#34507a', pants: '#2f4870', blush: true, freckles: false, mole: -1 });
  person.name = t('Дядя Женя');
  const fig = makeHuman(person, { fat: true, shirt: '#34507a', pants: '#2f4870' });
  // пятна мазута, тряпка в кармане, ключ в руке
  const blot = [];
  A.put(blot, new THREE.BoxGeometry(0.56, 0.38, 0.2), '#34507a', 0, 0.86, 0.26);            // живот
  A.put(blot, new THREE.BoxGeometry(0.46, 0.2, 0.12), '#34507a', 0, 0.72, 0.3);
  for (const [x, y, w, h] of [[0.12, 0.96, 0.14, 0.1], [-0.14, 0.8, 0.1, 0.13], [0.06, 0.66, 0.16, 0.07]]) A.put(blot, new THREE.BoxGeometry(w, h, 0.02), '#1c2230', x, y, 0.365);
  for (const s of [-1, 1]) A.put(blot, new THREE.BoxGeometry(0.06, 0.4, 0.02), '#2a4066', s * 0.14, 1.12, 0.22);   // лямки комбинезона
  A.put(blot, new THREE.BoxGeometry(0.1, 0.18, 0.04), '#c9453a', -0.26, 0.6, 0.2);           // тряпка в кармане
  fig.add(new THREE.Mesh(A.mergeGeos(blot), A.HUMAN_VC || new THREE.MeshLambertMaterial({ vertexColors: true })));
  const u = fig.userData;
  if (u.armR) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    w.position.set(0, -0.62, 0.08);
    u.armR.add(w);
  }
  const [x, z] = [GAR.ox + GAR.rx * -1.7 + GAR.fx * -2.4, GAR.oz + GAR.rz * -1.7 + GAR.fz * -2.4];
  fig.position.set(x, GAR.gy + 0.08, z);
  fig.scale.x *= 1.12; fig.scale.z *= 1.15;       // большой дядька
  // смотрит на ворота, чуть к середине
  fig.rotation.y = Math.atan2(GAR.fx + GAR.rx * 0.5, GAR.fz + GAR.rz * 0.5);
  A.scene.add(fig);
  ZHENYA = { fig, person, t: 0 };
}

export function build () {
  if (!A) return;
  const t0 = performance.now();
  if (A.ZN && A.ZN.init) A.ZN.init({ CITY: A.CITY, MAP: A.MAP, donated: A.donated || (() => 0) });   // районы нужны ямам уже сейчас
  buildGarage();
  buildPotholes();
  return { ms: Math.round(performance.now() - t0), potholes: POT.length, garage: !!GAR };
}
export const potholes = () => POT;
export const garage = () => GAR;

/* ─────────────── заглохла ─────────────── */
const ST = { on: false, t: 0, ui: false, need: 0, done: 0, p: 0, dir: 1, z0: 0, zw: 0.2, smokeT: 0, lastPress: 0, pad: false, flash: 0, blinkT: 0 };
let EL = null, pending = -1, lastKey = null, stepAt = 0;
const rolled = new WeakSet();
const LIVE = new Set(['drive', 'back', 'side', 'handover', 'brief', 'loading']);
const DRIVING = new Set(['drive', 'back', 'side']);

export const stalled = () => ST.on;
export const stallNow = (why = 'debug') => stall(why);     // песочница и ?debug
export const stallInfo = () => ({ ...ST, pending });

function ui () {
  if (EL) return EL;
  EL = document.createElement('div');
  EL.id = 'stall';
  EL.hidden = true;
  EL.innerHTML = '<div class="st-t"></div><div class="st-h"></div><div class="st-bar"><i class="st-zone"></i><i class="st-mk"></i></div><div class="st-dots"></div>';
  (document.getElementById('game') || document.body).appendChild(EL);
  EL.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(); });
  addEventListener('keydown', e => {
    if (!ST.ui || EL.hidden) return;
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) press();
  }, true);
  return EL;
}
function dots () {
  const d = EL.querySelector('.st-dots');
  d.innerHTML = '';
  for (let i = 0; i < ST.done + ST.need; i++) { const b = document.createElement('i'); if (i < ST.done) b.className = 'on'; d.appendChild(b); }
}
function newZone () {
  ST.zw = BREAK.MINIGAME_ZONE(L());
  let z;
  for (let k = 0; k < 6; k++) { z = 0.06 + Math.random() * (0.88 - ST.zw); if (Math.abs(z + ST.zw / 2 - ST.p) > 0.22) break; }
  ST.z0 = z;
  const zone = EL.querySelector('.st-zone');
  zone.style.left = (ST.z0 * 100).toFixed(1) + '%';
  zone.style.width = (ST.zw * 100).toFixed(1) + '%';
}
function stall (why) {
  if (ST.on || !A) return;
  // песочница: «не глохнет» (кроме поломки по кнопке)
  const sbx = typeof window !== 'undefined' && window.__dlv && window.__dlv.SBX;
  if (why !== 'sandbox' && sbx && sbx.noStall) return;
  const S = A.S;
  if (!LIVE.has(S.state)) return;
  Object.assign(ST, { on: true, t: 0, ui: false, need: BREAK.MINIGAME_HITS, done: 0, p: 0, dir: 1, smokeT: 0, why });
  pending = -1;
  const Snd = A.Snd;
  if (Snd) { Snd.blip(70, 0.35, 'sawtooth', 0.2); setTimeout(() => Snd.blip(52, 0.4, 'square', 0.14), 160); Snd.noise(0.3, 0.2); }
  if (A.rumble) A.rumble(0.5, 300);
  A.toast(why === 'pothole' ? t('ой… в яме заглохла') : t('заглохла!'));
}
function showGame () {
  ui();
  ST.ui = true;
  const touch = document.body.classList.contains('touch');
  EL.querySelector('.st-t').textContent = t('заглохла — заводим');
  EL.querySelector('.st-h').textContent = touch ? t('тыкай, когда метка в зелёном') : t('пробел, E или A — когда метка в зелёном');
  newZone(); dots();
  EL.hidden = false;
  EL.classList.remove('ok');
}
function press () {
  if (!ST.on || !ST.ui) return;
  const now = performance.now();
  if (now - stepAt > 250 || now - ST.lastPress < 110) return;     // игра стоит (пауза, карта) или дребезг
  ST.lastPress = now;
  const Snd = A.Snd;
  const hit = ST.p >= ST.z0 - 0.01 && ST.p <= ST.z0 + ST.zw + 0.01;
  EL.classList.remove('hit', 'miss'); void EL.offsetWidth;
  if (hit) {
    ST.need--; ST.done++;
    EL.classList.add('hit');
    if (Snd) { Snd.noise(0.12, 0.22); Snd.blip(95 + ST.done * 25, 0.12, 'sawtooth', 0.16); }   // стартер: «чих»
    if (ST.need <= 0) { dots(); start(); return; }
    newZone();
  } else {
    ST.need++;
    EL.classList.add('miss');
    if (Snd) Snd.blip(120, 0.18, 'square', 0.1);
    if (A.rumble) A.rumble(0.3, 120);
  }
  dots();
}
/* завелась: стартер, чих-пых, мотор набирает обороты, клуб дыма из выхлопа */
function start () {
  ST.on = false; ST.ui = false;
  EL.classList.add('ok');
  EL.querySelector('.st-t').textContent = t('завелась!');
  setTimeout(() => { if (!ST.on) EL.hidden = true; }, 650);
  const Snd = A.Snd, V = A.V;
  if (Snd) {
    [0, 90, 180].forEach((d, i) => setTimeout(() => Snd.noise(0.07, 0.18), d + i * 10));
    setTimeout(() => { Snd.blip(110, 0.3, 'sawtooth', 0.2); Snd.blip(165, 0.35, 'square', 0.1); }, 280);
    setTimeout(() => Snd.blip(220, 0.25, 'sawtooth', 0.14), 480);
  }
  if (A.rumble) A.rumble(0.7, 220);
  const bx = V.x - Math.sin(V.h) * 2.3, bz = V.z - Math.cos(V.h) * 2.3;
  for (let i = 0; i < 4; i++) setTimeout(() => A.puff(bx, 0.5, bz, true, 0.5 + i * 0.12), i * 70);
  A.S.shake = Math.max(A.S.shake || 0, 0.25);
  hazard(false);
}
function cancel () {
  ST.on = false; ST.ui = false; pending = -1;
  if (EL) EL.hidden = true;
  hazard(false);
}
export const reset = cancel;
function hazard (on) {
  const c = A.car, h = c && c.userData && c.userData.hazard;
  if (h) for (const m of h) m.visible = on;
}

function stallStep (dt, vf) {
  const S = A.S, V = A.V;
  if (!LIVE.has(S.state)) { cancel(); return; }
  ST.t += dt;
  // дым из-под капота
  if ((ST.smokeT -= dt) <= 0) {
    ST.smokeT = 0.2;
    A.puff(V.x + Math.sin(V.h) * 1.9 + (Math.random() - 0.5) * 0.6, 1.15, V.z + Math.cos(V.h) * 1.9 + (Math.random() - 0.5) * 0.6, ST.t > 4, 0.3 + Math.random() * 0.25);
  }
  // аварийка мигает
  ST.blinkT += dt;
  hazard(Math.floor(ST.blinkT * 2.5) % 2 === 0);
  if (!ST.ui && (Math.abs(vf) < 1.2 || ST.t > 2.4)) showGame();
  if (!ST.ui) return;
  // метка бегает туда-обратно; к концу ещё и чуть быстрее
  const sp = 1.05 + Math.min(0.5, (ST.done + Math.max(0, ST.need - BREAK.MINIGAME_HITS)) * 0.08);
  ST.p += ST.dir * sp * dt;
  if (ST.p > 1) { ST.p = 2 - ST.p; ST.dir = -1; } else if (ST.p < 0) { ST.p = -ST.p; ST.dir = 1; }
  EL.querySelector('.st-mk').style.left = (ST.p * 100).toFixed(2) + '%';
  // геймпад: A
  const a = PAD.a;                              // раскладка — в input/gamepad.js
  if (a && !ST.pad) press();
  ST.pad = a;
}

/* удар: 40 %, что машина станет хуже заводиться */
export function onHit (vn) {
  if (!A || !(vn > 0)) return;
  if (Math.random() < BREAK.HIT_WORSE) {
    const was = L();
    if (worsen(1) > was) A.toast(t('машина стала хуже заводиться'));
  }
}

/* ─────────────── ямы: тряхнуло, притормозило, может заглохнуть ─────────────── */
function potStep (dt, vf) {
  const V = A.V, S = A.S;
  if (V.air || Math.abs(vf) < 3) return;
  const fx = Math.sin(V.h), fz = Math.cos(V.h), sx = fz, sz = -fx;
  const c = current(), w = 0.8;
  const wheels = [[1.3, -w], [1.3, w], [-1.25, -w], [-1.25, w]];
  const now = performance.now() / 1000;
  const ci = Math.floor(V.x / PCELL), cj = Math.floor(V.z / PCELL);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const a = PGRID.get(i + ',' + j);
    if (!a) continue;
    for (const p of a) {
      if (now - p.t < 1.2) continue;
      for (const [al, ac] of wheels) {
        const x = V.x + fx * al + sx * ac, z = V.z + fz * al + sz * ac;
        if ((x - p.x) ** 2 + (z - p.z) ** 2 > (p.r * 0.95) ** 2) continue;
        p.t = now;
        const k = Math.min(1, Math.abs(vf) / 30);
        S.shake = Math.max(S.shake || 0, (c.offroad ? 0.12 : 0.3) + k * 0.25);
        V.pitch = (V.pitch || 0) + (al > 0 ? -1 : 1) * (0.05 + k * 0.05);
        if (!c.offroad) { const d = 1 - (0.1 + k * 0.12); V.vx *= d; V.vz *= d; }
        if (A.Snd) { A.Snd.blip(58, 0.16, 'triangle', 0.2 + k * 0.1); A.Snd.noise(0.08, 0.12 + k * 0.1); }
        if (A.rumble) A.rumble(0.35 + k * 0.3, 90);
        if (!ST.on && DRIVING.has(S.state) && Math.random() < L() * BREAK.POTHOLE) stall('pothole');
        break;
      }
    }
  }
}

/* ─────────────── гараж: заехал и встал — Дядя Женя предлагает подшаманить ─────────────── */
const GS = { stillT: 0, offered: false, busy: false };
function garageStep (dt, vf) {
  if (!GAR) return;
  const V = A.V, S = A.S;
  const dx = V.x - GAR.ox, dz = V.z - GAR.oz;
  const u = dx * GAR.rx + dz * GAR.rz, v = dx * GAR.fx + dz * GAR.fz;
  const near = dx * dx + dz * dz < 18 * 18;
  if (!near) { GS.offered = false; GS.stillT = 0; }
  // Дядя Женя: дышит, а когда подъезжаешь — машет ключом
  if (ZHENYA) {
    ZHENYA.t += dt;
    const ud = ZHENYA.fig.userData, wave = near && !GS.offered;
    if (ud.armR) ud.armR.rotation.x = wave ? -2.4 + Math.sin(ZHENYA.t * 7) * 0.35 : -0.25 + Math.sin(ZHENYA.t * 1.3) * 0.05;
    if (ud.armL) ud.armL.rotation.x = Math.sin(ZHENYA.t * 1.3 + 1) * 0.05;
    if (ud.head) ud.head.rotation.y = near ? Math.max(-0.7, Math.min(0.7, Math.atan2(V.x - ZHENYA.fig.position.x, V.z - ZHENYA.fig.position.z) - ZHENYA.fig.rotation.y)) : Math.sin(ZHENYA.t * 0.4) * 0.3;
  }
  const inside = Math.abs(u) < GW / 2 - 0.4 && v < -1.2 && v > -GD + 0.6;
  const ok = inside && Math.abs(vf) < 0.8 && !ST.on && !GS.offered && !GS.busy && (DRIVING.has(S.state) || S.ride);
  GS.stillT = ok ? GS.stillT + dt : 0;
  if (GS.stillT > 0.6) { GS.offered = true; GS.stillT = 0; offer(); }
}
async function offer () {
  const DLG = A.DLG, id = curId(), Lc = getL(id);
  const price = BREAK.REPAIR_BASE + Math.round(BREAK.REPAIR_PER_L * Lc);
  const face = ZHENYA ? ZHENYA.person : null, name = t('Дядя Женя'), color = '#6f8a3a';
  GS.busy = true;
  try {
    if (Lc < 0.05) {
      await DLG.say({ person: face, name, color, text: t('о, здорово. машина как часы — нечего тут крутить. езжай давай'), accept: t('ну ок') });
      return;
    }
    if (wallet(A) < price) {
      await DLG.say({ person: face, name, color, text: t('ну чё, опять стучит? за {money} подшаманю, но у тебя столько нет. заезжай, как заработаешь', { money: A.money(price) }), accept: t('ладно') });
      return;
    }
    const yes = await DLG.say({ person: face, name, color, mood: 'calm',
      text: t('ну чё, опять стучит? давай гляну — за {money} подшаманю', { money: A.money(price) }),
      accept: t('давай, Дядь Жень'), decline: t('не, потом') });
    if (!yes) return;
    if (!pay(A, price)) return;
    const now = repair(1, id);
    if (A.Snd) [0, 140, 300, 420].forEach((d, i) => setTimeout(() => A.Snd.blip(900 + i * 140, 0.06, 'square', 0.08), d));
    await DLG.say({ person: face, name, color, text: now < 0.05 ? t('во, другое дело. теперь как новая, езжай аккуратней') : t('ну вот, получше. совсем как новая не станет — заезжай ещё'), accept: t('спасибо!') });
    A.toast(t('заводится лучше: ломучесть {n}', { n: String(Math.round(now * 10) / 10) }));
    if (A.hudMoney) A.hudMoney();
  } finally { GS.busy = false; }
}

/* ─────────────── каждый кадр ─────────────── */
export function step (dt, vf = 0) {
  if (!A) return;
  stepAt = performance.now();
  const S = A.S;
  // заказ: один бросок на заказ — заглохнет ли где-то по дороге
  const key = S.order || S.side || null;
  if (key !== lastKey) {
    lastKey = key;
    pending = -1;
    if (key && typeof key === 'object' && !rolled.has(key)) {
      rolled.add(key);
      if (Math.random() < L() * BREAK.PER_ORDER) pending = 4 + Math.random() * 26;   // столько секунд езды до поломки
    }
  }
  if (pending > 0 && !ST.on && DRIVING.has(S.state) && Math.abs(vf) > 7) {
    pending -= dt;
    if (pending <= 0) stall('order');
  }
  if (ST.on) stallStep(dt, vf);
  else if (!LIVE.has(S.state) && EL && !EL.hidden && !EL.classList.contains('ok')) cancel();
  if (LIVE.has(S.state) || S.ride) potStep(dt, vf);
  garageStep(dt, vf);
}

/* ─────────────── метки ─────────────── */
function wrench (x, a, b, s, bg) {
  x.save();
  x.translate(a, b);
  x.fillStyle = bg; x.strokeStyle = '#33210c'; x.lineWidth = 1.4 * s;
  x.beginPath(); x.arc(0, 0, 5.2 * s, 0, Math.PI * 2); x.fill(); x.stroke();
  x.rotate(-0.8);
  x.fillStyle = '#fff';
  x.fillRect(-0.9 * s, -2.4 * s, 1.8 * s, 5 * s);
  x.beginPath(); x.arc(0, -2.6 * s, 1.9 * s, 0, Math.PI * 2); x.fill();
  x.fillStyle = bg; x.fillRect(-0.7 * s, -4.4 * s, 1.4 * s, 1.9 * s);
  x.restore();
}
/* радар: tr — мир → радар, R — радиус; вне круга — прижато к краю */
export function radar (ctx, tr, R) {
  if (!GAR) return;
  let [a, b] = tr(GAR.ox, GAR.oz);
  const len = Math.hypot(a, b);
  if (len > R - 8) { a *= (R - 8) / len; b *= (R - 8) / len; }
  wrench(ctx, a, b, 1, '#6f8a3a');
}
export function mapMark (ctx, fmX, fmZ, u) {
  if (!GAR) return;
  wrench(ctx, fmX(GAR.ox), fmZ(GAR.oz), 1.6 * u, '#6f8a3a');
}
