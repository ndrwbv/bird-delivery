/* ──────────────────────────────────────────────────────────────────────────
   Клиент ошибся адресом (12аи, автор 23.10.2026): «иногда (редко, не в первых сменах) по дороге приходит сообщение
   «ой, сорян, не туда — я на <улица>, <дом>» — заказ переезжает на другой ближний адрес (тот же район, разумное
   расстояние, срок — с небольшой добавкой)». Правило словами — docs/ORDERS.md «Клиент ошибся адресом», числа —
   ECON.WRONG (econ.js).

   Как: стала текущей остановка заказа — один бросок (доля P), если подходит: карьера, обычная пицца (не срочная,
   не пляж, не фестиваль, не сюжет, не учебный), один клиент, не поручение, не бандиты, без мини-игры у двери на этом
   адресе, не в первые FROM смен, не больше PER_SHIFT за смену, до адреса по прямой не ближе MIN_D м. Выпало — когда
   проехал долю AFTER пути (по прямой) и до адреса ещё дальше NEAR м, клиент пишет в чат (с лицом и ником). В ту же
   секунду цель переезжает (game.js guestMove: пин, маршрут, адрес, клиент там на улице): точка в R м по прямой от
   прежнего адреса, тот же район, открытый, не у бандитов, по дорогам — не дальше вдвое прямой. В накладной прежний
   адрес зачёркнут (st.addrWas, как у «клиента не дома»). Срок — + разница пути от машины (новый − прежний, не меньше 0)
   / V м/с × SLACK + ADD с; уже опоздал — не добавляется. Не нашлось точки — ничего не было.

   init(api): { S, V, ADULT, CHAT, NICK, DIST, ZN, SPOTS, routeLen, realAddress, guestMove, nearestRoad,
                shiftsDone(), onShiftStart(fn), freeOk() }
   step(dt) — каждый кадр мира (game.js CL.step). DEBUG — __dlv.WRONG: force() — следующий заказ точно, last, n
   ────────────────────────────────────────────────────────────────────────── */
import { t, lang } from '../i18n/index.js';
import * as ECON from './econ.js';

let A = null;
const W = ECON.WRONG;
const ST = { shift: 0, force: false, last: null, n: 0, rolls: 0 };

export function init (api) {
  A = api;
  if (A.onShiftStart) A.onShiftStart(() => { ST.shift = 0; });
}

/* подходит ли остановка (бросок — один раз на остановку) */
function okStop (o, st) {
  const sp = o.ord;
  if (!sp || o.tut || sp.type !== 'pizza' || sp.urgent || sp.beach || sp.fest || sp.story) return false;
  if (!st.peds || st.peds.length !== 1 || st.pickup || st.surf || st.beach || st.fest || st.done) return false;
  if (st.mgPlan || st.mgIn || st.addrWas) return false;                       // у двери мини-игра / клиент дома / уже переезжал
  if ((st.zone || sp.zone) === 'gang') return false;
  return true;
}

/* «я на …»: улица в предложном падеже (ru): «улица Славского» → «улице Славского», «Речной тупик» → «Речном тупике»,
   «Набережная улица» → «Набережной улице». Слова до вида улицы — прилагательные, после — как есть */
const NOUN = { 'улица': 'улице', 'проспект': 'проспекте', 'переулок': 'переулке', 'площадь': 'площади', 'бульвар': 'бульваре',
  'проезд': 'проезде', 'тупик': 'тупике', 'шоссе': 'шоссе', 'набережная': 'набережной', 'аллея': 'аллее', 'микрорайон': 'микрорайоне' };
const adj = w => /[кгх]ий$/.test(w) ? w.slice(0, -2) + 'ом' : /ий$/.test(w) ? w.slice(0, -2) + 'ем' : /[ыо]й$/.test(w) ? w.slice(0, -2) + 'ом'
  : /яя$/.test(w) ? w.slice(0, -2) + 'ей' : /ая$/.test(w) ? w.slice(0, -2) + 'ой' : /ое$/.test(w) ? w.slice(0, -2) + 'ом' : w;
export function onStreet (addr) {
  if (lang() !== 'ru') return addr;
  const i = addr.indexOf(','), street = i < 0 ? addr : addr.slice(0, i), rest = i < 0 ? '' : addr.slice(i);
  const ws = street.split(' '), k = ws.findLastIndex(w => NOUN[w.toLowerCase()]);   // «Набережная улица» — вид улицы последним
  if (k < 0) return addr;
  for (let j = 0; j < k; j++) ws[j] = adj(ws[j]);
  const n = NOUN[ws[k].toLowerCase()];
  ws[k] = ws[k][0] === ws[k][0].toUpperCase() ? n[0].toUpperCase() + n.slice(1) : n;
  return ws.join(' ') + rest;
}

const OPEN_R = 25;
function openAt (x, z) {
  const D = A.DIST;
  if (!D || !D.has()) return true;
  const ok = (px, pz) => D.isOpen(D.at(px, pz));
  const r = A.nearestRoad ? A.nearestRoad(x, z, 60, 1) : null;
  if (r && !ok(r.x, r.z)) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ok(x + Math.cos(a) * OPEN_R, z + Math.sin(a) * OPEN_R)) return false; }
  return true;
}
/* куда «на самом деле»: { x, z, addr, L — от машины по дорогам } | null */
function spot (at) {
  const SP = A.SPOTS || [], D = A.DIST, V = A.V;
  const [r0, r1] = W.R, di = D && D.has() ? D.at(at.x, at.z) : -1;
  const cand = [];
  for (const q of SP) {
    const d = Math.hypot(q.x - at.x, q.z - at.z);
    if (d < r0 || d > r1) continue;
    if (di >= 0 && D.at(q.x, q.z) !== di) continue;
    cand.push(q);
  }
  for (let k = 0; k < 14 && cand.length; k++) {
    const q = cand.splice((Math.random() * cand.length) | 0, 1)[0];
    if (!openAt(q.x, q.z) || (A.ZN && A.ZN.zoneAt(q.x, q.z) === 'gang')) continue;
    const addr = A.realAddress ? A.realAddress(q.x, q.z) : '';
    if (!addr) continue;                                                     // писать клиенту нечего — не эта
    const Lq = A.routeLen ? A.routeLen(at.x, at.z, q.x, q.z) : Math.hypot(q.x - at.x, q.z - at.z) * 1.4;
    if (!Number.isFinite(Lq) || Lq > Math.max(2 * Math.hypot(q.x - at.x, q.z - at.z), r1)) continue;   // не в объезд через полрайона
    const L = A.routeLen ? A.routeLen(V.x, V.z, q.x, q.z) : Math.hypot(q.x - V.x, q.z - V.z) * 1.4;
    if (!Number.isFinite(L)) continue;
    return { x: q.x, z: q.z, addr, L };
  }
  return null;
}

/* переезд: сообщение клиента и цель — в ту же секунду */
function fire (o, st) {
  const at = st.at || st.peds[0], V = A.V, S = A.S;
  const sp = spot(at);
  if (!sp) { st.wrong = { failed: true }; return; }
  const L0 = A.routeLen ? A.routeLen(V.x, V.z, at.x, at.z) : Math.hypot(at.x - V.x, at.z - V.z) * 1.4;
  const flat = st.home && st.home.flat;
  st.addrWas = (st.addr || '') + (flat ? ', ' + t('кв. {n}', { n: flat }) : '');
  st.home = null;
  const p = st.peds[0], person = p && (p.person || (p.grp && p.grp.userData && p.grp.userData.person));
  st.wrong = { from: { x: +at.x.toFixed(1), z: +at.z.toFixed(1), addr: st.addrWas }, to: { x: +sp.x.toFixed(1), z: +sp.z.toFixed(1), addr: sp.addr }, add: 0 };
  const text = t('ой, сорян, не туда — я на {addr}', { addr: onStreet(sp.addr) });
  const who = { name: A.NICK && person ? A.NICK.label(person, t('клиент')) : t('клиент'), person: person || undefined, role: t('клиент') };
  let moved = false;
  const move = () => {
    if (moved) return;
    moved = true;
    if (S.order !== o || st.done || S.state !== 'drive') return;            // пока ждали очередь, всё кончилось
    A.guestMove(st, sp.x, sp.z);
    if (sp.addr) st.addr = sp.addr;
    if (!S.free && S.time > 0) {
      const add = Math.round(Math.max(0, sp.L - (Number.isFinite(L0) ? L0 : sp.L)) / W.V * W.SLACK + W.ADD);
      S.time += add; S.timeMax += add;
      st.wrong.add = add;
    }
    ST.last = { ...st.wrong, at: Date.now() };
    ST.n++;
  };
  ST.shift++;
  if (A.CHAT && A.CHAT.say) A.CHAT.say(text, move, false, who);
  else move();
}

export function step () {
  if (!A) return;
  const S = A.S, o = S && S.order;
  if (!o || !o.stops || S.state !== 'drive' || S.free) return;
  const st = o.stops[o.idx | 0];
  if (!st) return;
  if (st.wrongRoll === undefined) {
    // бросок — один раз, как только остановка стала текущей
    let go = false;
    if (okStop(o, st) && (ST.force || (A.shiftsDone() >= W.FROM && ST.shift < W.PER_SHIFT && (!A.freeOk || A.freeOk())))) {
      const at = st.at || st.peds[0], d = Math.hypot(at.x - A.V.x, at.z - A.V.z);
      ST.rolls++;
      go = d >= W.MIN_D && (ST.force || Math.random() < W.P);
      if (go) st.wrongD0 = d;
    }
    st.wrongRoll = go;
    if (go) ST.force = false;
    return;
  }
  if (!st.wrongRoll || st.wrong) return;
  const at = st.at || st.peds[0], d = Math.hypot(at.x - A.V.x, at.z - A.V.z);
  if (d < W.NEAR) { st.wrong = { late: true }; return; }                  // почти доехал — поздно путать
  if (d <= st.wrongD0 * (1 - W.AFTER) && okStop(o, st)) fire(o, st);
}

export const DEBUG = { ST, force () { ST.force = true; return true; }, get last () { return ST.last; }, get n () { return ST.n; } };
