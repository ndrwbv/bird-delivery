/* Что нравится игроку (17.10.2026, автор 12.10: «если часто отказывает, то надо пореже их показывать. На это завязываться»;
   решение 16.10: про мини-игры у двери и поручения). Правила словами — docs/ORDERS.md «Что нравится игроку», числа —
   ECON.LIKES (econ.js).

   Две группы: 'err' — поручения (id из SIDE_ORDERS: beer, vodka, catfood…), 'mg' — мини-игры у двери (door, stairs, talk).
   У каждого вида — вес MIN…MAX (с начала 1), хранится в сохранении (KEY): { err: { beer: { w, n } }, mg: { … } }, n — сколько
   раз попадался (сказал «да» или «нет»).
   - no(g, id)  — отказался по своей воле (поручение — «нет»; разговор — поторопил; домофон, подъезд — простоял, ничего не
                  нажав, пока не кончился срок): вес × NO;
   - yes(g, id) — согласился / прошёл: ниже 1 — × YES (но не выше 1), от 1 — × UP (медленнее);
   - pick(g, items, idOf) — выбрать из списка случайно с весом вида;
   - slow(g)    — во сколько раз реже таймер группы — по последним LAST ответам группы (любых видов): все «нет» — ×SLOW,
                  половина «да» — ×1, все «да» — ×FAST; ответов меньше LAST_MIN — ×1. По последним, а не по весам видов:
                  передумал и соглашается — частота возвращается за 3—4 «да», а не за часы (редкий вид и попадается редко).
   Таймер и выбор — orders.js (поручения), doorstep.js (мини-игры); настройка «мини-игры у клиента: выкл» важнее весов.
   __dlv.LIKES — DEBUG: all, w(g, id), no / yes, mean(g), slow(g), reset(), set(g, id, w). */
import * as ECON from './econ.js';

const L = ECON.LIKES;
let Store = null;
let DATA = null;

export function init (store) { if (store && !Store) { Store = store; DATA = null; } }

function load () {
  if (DATA) return DATA;
  let v = null;
  try { v = Store ? Store.get(L.KEY, null) : null; } catch (e) { v = null; }
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  DATA = v && typeof v === 'object' ? v : {};
  if (!DATA.err || typeof DATA.err !== 'object') DATA.err = {};
  if (!DATA.mg || typeof DATA.mg !== 'object') DATA.mg = {};
  if (!DATA.last || typeof DATA.last !== 'object') DATA.last = {};
  return DATA;
}
function save () { try { if (Store) Store.set(L.KEY, DATA); } catch (e) { /* без сохранения — живёт до перезапуска */ } }
const clamp = v => Math.max(L.MIN, Math.min(L.MAX, v));
function last (g, v) {
  const d = load(), a = Array.isArray(d.last[g]) ? d.last[g] : (d.last[g] = []);
  a.push(v ? 1 : 0);
  while (a.length > (L.LAST || 8)) a.shift();
}
const rec = (g, id) => { const d = load(); const G = d[g] || (d[g] = {}); return G[id] || (G[id] = { w: 1, n: 0 }); };

/* вес вида (1 — не попадался) */
export function w (g, id) {
  const r = load()[g] && load()[g][id];
  return r && Number.isFinite(+r.w) ? clamp(+r.w) : 1;
}
export function no (g, id) {
  if (!id) return;
  const r = rec(g, id);
  r.w = +clamp((Number.isFinite(+r.w) ? +r.w : 1) * L.NO).toFixed(3); r.n = (r.n || 0) + 1;
  last(g, false);
  LOG.push(g + ':' + id + ' −'); if (LOG.length > 40) LOG.shift();
  save();
}
export function yes (g, id) {
  if (!id) return;
  const r = rec(g, id), v = Number.isFinite(+r.w) ? +r.w : 1;
  r.w = +clamp(v < 1 ? Math.min(1, v * L.YES) : v * L.UP).toFixed(3); r.n = (r.n || 0) + 1;
  last(g, true);
  LOG.push(g + ':' + id + ' +'); if (LOG.length > 40) LOG.shift();
  save();
}
/* среднее веса по видам, что уже попадались (n > 0); не попадалось ничего — 1 */
export function mean (g) {
  const G = load()[g] || {};
  let s = 0, k = 0;
  for (const id in G) { const r = G[id]; if (r && r.n > 0 && Number.isFinite(+r.w)) { s += clamp(+r.w); k++; } }
  return k ? s / k : 1;
}
/* доля «да» среди последних LAST ответов группы (null — ответов меньше LAST_MIN) */
export function yesShare (g) {
  const a = load().last[g];
  if (!Array.isArray(a) || a.length < (L.LAST_MIN || 3)) return null;
  return a.reduce((s, v) => s + v, 0) / a.length;
}
/* во сколько раз реже таймер группы: все «нет» — ×SLOW (мини-игры — MG_SLOW), половина — ×1, все «да» — ×FAST (MG_FAST) */
export function slow (g) {
  const m = yesShare(g), lo = g === 'mg' ? L.MG_SLOW : L.SLOW, hi = g === 'mg' ? L.MG_FAST : L.FAST;
  if (m === null) return 1;
  if (m < 0.5) return 1 + (0.5 - m) / 0.5 * (lo - 1);
  return 1 - (m - 0.5) / 0.5 * (1 - hi);
}
/* случайно из items с весом вида (base(x) — свой вес, по умолчанию 1) */
export function pick (g, items, idOf, base) {
  if (!items || !items.length) return null;
  const ws = items.map(x => Math.max(0, (base ? base(x) : 1)) * w(g, idOf(x)));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return items[(Math.random() * items.length) | 0];
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

const LOG = [];
export const DEBUG = {
  get all () { return JSON.parse(JSON.stringify(load())); },
  get log () { return LOG.slice(); },
  w, no, yes, mean, slow, pick, yesShare,
  set: (g, id, v) => { const r = rec(g, id); r.w = clamp(+v); r.n = Math.max(1, r.n || 0); save(); return r; },
  reset: () => { DATA = { err: {}, mg: {}, last: {} }; save(); return true; },
};
