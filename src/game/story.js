/* Сценарные встречи. Данные и прогресс отделены от подъезда, камеры и диалога.
   Подъезд играет сцену через doorstep.js / stairs.js; здесь только описание и сохранение. */
import { t, N_ } from '../i18n/index.js';
import * as ECON from './econ.js';
import * as QR from './quickrun.js';
import { STORY_PEOPLE, ORDER_TYPES } from './orders.config.js';
import { makePerson } from './people.js';

export const COLOR = (ORDER_TYPES.story && ORDER_TYPES.story.color) || ECON.ORDERS.COLORS.story || '#ff3ea5';
const COURIER_LOOK = { f: false, age: 'young', hair: 'short', hairC: '#4a3020', head: 'cap', headC: '#ff6a13',
  top: 'tee', bottom: 'pants', shirt: '#ff6a13', pants: '#2f3540', shoes: '#1f1c1a' };

/* Новую встречу добавляют записью с уникальным id и chapters[].dialogue[].
   choices: [{text, flag}, {text, flag}] — второй вариант можно не давать. */
export const STORIES = [{
  id: 'gennady', name: N_('Геннадий'), intro: true,
  who: { seed: 0x6e6e6164, fem: false, look: { f: false, age: 'middle', hair: 'bald', hairC: '#574438', beard: 'none',
    top: 'tee', shirt: '#e0d8c7', bottom: 'pants', pants: '#596276', shoes: '#47434a', shape: 'normal', bg: '#c9b9a3' } },
  home: { addr: ['Ленинградская улица', '21'], near: [3099, 2876] }, items: N_('пицца'),
  chapters: [{ id: 'gennady-sausage', name: N_('Докторская к пицце'),
    note: N_('Панельный дом. Квартира и код — в накладной.'), why: N_('Геннадий ждёт пиццу дома'),
    dialogue: [
      { speaker: 'gennady', text: N_('О, пицца! А я как раз докторской купил наразвес. Хочу вашу пиццу посыпать. Мне так больше нравится') },
      { speaker: 'courier', text: N_('А зачем тогда пиццу заказывали?') },
      { speaker: 'gennady', text: N_('Ну не буду же я одну колбасу есть') },
    ] },
  ],
}];

const KEY = 'dlv-story';
let API = null, DATA = null;
const issued = Object.create(null);
const people = new Map();
function load () {
  if (DATA) return DATA;
  let value = null;
  try { value = API && API.Store && API.Store.get(KEY, null); } catch (e) { /* сохранение отсутствует */ }
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch (e) { value = null; } }
  DATA = value && typeof value === 'object' ? value : {};
  return DATA;
}
function save () { if (API && API.Store) API.Store.set(KEY, load()); }
const prog = id => load()[id] || (load()[id] = { ch: 0, last: -99 });
export const progress = () => JSON.parse(JSON.stringify(load()));
export function reload (all) { DATA = null; people.clear(); if (all) for (const id of Object.keys(issued)) delete issued[id]; }
export const progOf = id => prog(id);
export const persist = () => save();
export function reset (id) { const d = load(); if (id) delete d[id]; else for (const k of Object.keys(d)) delete d[k]; save(); }
export function register (story) {
  if (!story || !story.id || !story.who || !Array.isArray(story.chapters) || !story.chapters.length || STORIES.some(s => s.id === story.id)) return false;
  const ids = new Set(STORIES.flatMap(s => s.chapters.map((c, i) => c.id || s.id + '-' + i)));
  for (let i = 0; i < story.chapters.length; i++) {
    const id = story.chapters[i].id || story.id + '-' + i;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  STORIES.push(story); return true;
}
export function onFrame () { /* сценарии больше не ставят обработчик на каждый кадр */ }
export const list = () => STORIES.map(s => ({ id: s.id, name: t(s.name), done: prog(s.id).ch,
  chapters: s.chapters.map((c, i) => ({ i, name: t(c.name), hours: c.hours || null, minShift: c.minShift || 0 })) }));
const cfgOf = s => STORY_PEOPLE.find(p => p.id === s.id) || { name: s.name, fromShift: 1, every: 1 };
function storyPerson (s) {
  if (people.has(s.id)) return people.get(s.id);
  const p = makePerson({ seed: s.who.seed, fem: !!s.who.fem });
  Object.assign(p.look, s.who.look);
  const name = t(cfgOf(s).name || s.name);
  Object.assign(p, { id: 'story-' + s.id, name, first: name, last: '', acc: name, gen: name, dat: name,
    firstAcc: name, firstGen: name, firstDat: name, pos: '', posRu: '',
    app: { nick: name, kind: 'name', av: 'face', avSeed: s.who.seed, adult: !!API.ADULT }, story: s.id });
  people.set(s.id, p); return p;
}
function courierPerson () {
  if (people.has('_courier')) return people.get('_courier');
  const p = makePerson({ seed: 0xc0de, fem: false });
  Object.assign(p.look, COURIER_LOOK);
  Object.assign(p, { id: 'story-courier', name: t('Евгений'), first: t('Евгений'), last: '', pos: '' });
  people.set('_courier', p); return p;
}
export const PERSON = { host: id => { const s = STORIES.find(q => q.id === id); return s ? storyPerson(s) : null; }, courier: courierPerson };
export function faceAhead () { /* портрет создаётся при открытии компактного диалога */ }

const HOME = new Map();
function homeOf (s) {
  // своё место (Стёпа на лавочке, stepabench.js): { ex, ez, nx, nz, sx, sz, x, z, addr, door } — «дверь» = где он сидит,
  // door — настоящий подъезд (туда уходит: 'in')
  if (typeof s.place === 'function') return s.place();
  // home-функция: дом выбирают заново (герой города — у подъезда рядом с тем местом, где стоит)
  const HM = typeof s.home === 'function' ? s.home() : s.home;
  if (!HM) return null;
  const hk = s.id + (HM.near ? ':' + HM.near.map(Math.round).join(',') : '');
  if (HOME.has(hk)) return HOME.get(hk);
  const C = API.CITY, B = C.buildings || [];
  const want = HM.addr;
  let b = want ? B.find(q => q.a && q.a[0] === want[0] && q.a[1] === want[1]) : null;
  if (!b && HM.near) {               // нет в карте — ближайшая панелька к точке (any — любой дом с адресом)
    let bd = Infinity;
    for (const q of B) {
      if (!q.a || (!HM.any && q.st !== 'panel')) continue;
      const c = centroid(q.p), d = (c[0] - HM.near[0]) ** 2 + (c[1] - HM.near[1]) ** 2;
      if (d < bd) { bd = d; b = q; }
    }
  }
  if (!b) return null;
  const [cx, cz] = centroid(b.p);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  // подъезд этого дома: из карты или сгенерированный; первый по списку — всегда тот же
  let e = null, ed = Infinity;
  for (const q of C.entrances) {
    const inBox = q[0] > x0 - 4 && q[0] < x1 + 4 && q[1] > z0 - 4 && q[1] < z1 + 4;
    const d = (q[0] - cx) ** 2 + (q[1] - cz) ** 2 + (inBox ? 0 : 1e9);
    if (d < ed) { ed = d; e = q; }
  }
  if (!e) return null;
  let [ex, ez, nx, nz] = e;
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  // куда ставить машину: точка доставки во дворе рядом с подъездом (SPOTS), иначе — перед дверью
  const want4 = { x: ex + nx * 4, z: ez + nz * 4 };
  let spot = null, sd = 30 * 30;
  for (const q of API.SPOTS || []) {
    const d = (q.x - want4.x) ** 2 + (q.z - want4.z) ** 2;
    if (d < sd) { sd = d; spot = q; }
  }
  if (!spot) spot = want4;
  const h = { ex, ez, nx, nz, sx: -nz, sz: nx, x: spot.x, z: spot.z, addr: b.a ? API.realAddress(ex + nx * 2, ez + nz * 2) : '' };
  HOME.set(hk, h);
  return h;
}
const centroid = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);


const specOf = o => !o ? null : o.storyId ? o : o.ord && o.ord.story ? o.ord.story : o.story || null;
const hourOk = (c, h) => !c.hours || h == null || (h >= c.hours[0] && h < c.hours[1]);
export function nextOrder (ctx = {}) {
  if (!API || QR.on()) return null;
  const shift = +ctx.shift || (API.shift ? +API.shift() || 0 : 1);
  for (const s of STORIES) {
    const cfg = cfgOf(s), p = prog(s.id), c = s.chapters[p.ch];
    if (!c || issued[s.id] === shift || !hourOk(c, ctx.hour)) continue;
    if (s.ready ? !s.ready(ctx, p, shift) : shift < (cfg.fromShift || 1) || shift < (c.minShift || 0) ||
      (p.ch > 0 && shift - p.last < Math.max(1, cfg.every || 1))) continue;
    const o = orderFor(s.id, p.ch);
    if (!o) continue;
    o.shift = shift; issued[s.id] = shift; return o;
  }
  return null;
}
export function orderFor (storyId, chapter) {
  const s = STORIES.find(q => q.id === storyId), c = s && s.chapters[chapter], h = s && API && homeOf(s);
  if (!c || !h) return null;
  const p = storyPerson(s);
  return { kind: 'story', type: 'story', storyId, chapter, color: COLOR, x: h.x, z: h.z,
    door: { x: h.ex, z: h.ez, nx: h.nx, nz: h.nz }, addr: h.addr, person: p, name: p.name,
    title: t(c.name), items: t(c.items || s.items), note: t(c.note), why: t(c.why), reach: 6 };
}
export function onCancel () { /* глава остаётся доступной в следующую смену */ }
export function interiorFor (order) {
  const sp = specOf(order), s = sp && STORIES.find(q => q.id === sp.storyId), c = s && s.chapters[sp.chapter];
  if (!c) return null;
  return { id: c.id || s.id + '-' + sp.chapter, name: t(s.name), person: storyPerson(s), courier: courierPerson(),
    lines: c.dialogue.map(q => ({ speaker: q.speaker === 'courier' ? t('Евгений') : t(s.name), text: t(q.text),
      choices: q.choices ? q.choices.map(x => ({ text: t(x.text), flag: x.flag })) : null })) };
}
export function onDeliver (order) {
  const sp = specOf(order), s = sp && STORIES.find(q => q.id === sp.storyId);
  if (!s || !sp.interiorDone) return Promise.resolve({ stars: 0, money: 0 });
  const p = prog(s.id);
  if (sp.chapter >= p.ch) {
    p.ch = sp.chapter + 1; p.last = Number.isFinite(+sp.shift) ? +sp.shift : p.last;
    p.at = Date.now(); p.flags = { ...(p.flags || {}), ...(sp.flags || {}) }; save();
  }
  return Promise.resolve({ stars: 0, money: 0 });
}
export const active = () => false;
export function stage () { /* клиент появляется только у двери квартиры */ }
export function unstage () { /* уличной катсцены больше нет */ }
export function decorate () { /* предметов старой катсцены на машине нет */ }
export function frame () { return false; }
export function init (api) { API = api; DATA = null; load(); }
export const DEBUG = { STORIES, homeOf: id => homeOf(STORIES.find(s => s.id === id)), get cam () { return API && API.cam; } };
