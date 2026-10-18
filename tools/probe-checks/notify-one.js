/* Одно уведомление за раз (docs/CAREER.md «Одно уведомление за раз», notifyq.js): смена на автопилоте, раз в 50 мс —
   что из всплывающего поверх езды видно на экране. Смотрим саму страницу (классы и прозрачность узлов), а не очередь:
   так видно и то, что в очередь не попало.

   Что считается уведомлением: чек оплаты (#payfx), реплика Толика на ходу (#dlg-live), новое сообщение чата (печатает…
   или пришло меньше 2 с назад; висящие в ленте прочитанные — нет), тост (#toast), грамота достижения (#ach-toast),
   «задание выполнено» (#daily-pop) и записка заданий (#daily-note), подсказка (#hint), таблица рейтинга (#rank-sheet).
   Пока пауза, окно разговора или мини-игра у двери — не считаем (уведомления там и не должны идти).

   --q=nsecs=180&nshift=6&nwarp=1 — сколько секунд ехать, какая по счёту смена (6 — средняя, с коллегами и сезоном) и
   ускорение мира (2 — доставок вдвое больше, а часы уведомлений — настоящие: проверка на тесноту); ntp=10 — через
   10 с езды к адресу (или назад) машину переносит к цели: вручений втрое больше — проверка тесноты после вручения.
   → { secs, shifts, delivered, shown: {вид: сколько раз}, overlaps: эпизодов «два и больше сразу», overSec, maxAt,
       examples: [{ t, kinds, texts }], log: [[t, вид, текст]] } */
const q = new URLSearchParams(location.search);
const SECS = +(q.get('nsecs') || 180), NSHIFT = +(q.get('nshift') || 6), WARP = +(q.get('nwarp') || 1), NTP = +(q.get('ntp') || 0);
if (d.Store) d.Store.set('dlv-shifts', NSHIFT);

const seen = new WeakMap();
const visible = () => {
  const out = [];
  const on = (sel, cls = 'on') => {
    const e = document.querySelector(sel);
    return e && !e.hidden && (!cls || e.classList.contains(cls)) && getComputedStyle(e).display !== 'none' ? e : null;
  };
  const txt = (e, s) => { const x = s ? e && e.querySelector(s) : e; return x ? x.textContent.trim().slice(0, 60) : ''; };
  let e;
  if ((e = on('#payfx'))) out.push(['pay', txt(e, '.pf-sum')]);
  if ((e = on('#dlg-live'))) out.push(['line', txt(e, 'p')]);
  const now = performance.now();
  for (const m of document.querySelectorAll('#chat .cm:not(.out)')) {
    const p = m.querySelector('.cm-b p');
    if (!p) continue;
    if (p.classList.contains('typing')) { out.push(['chat', txt(m, 'b') + ' печатает…']); continue; }
    if (!seen.has(m)) seen.set(m, now);
    if (now - seen.get(m) < 2000) out.push(['chat', txt(p)]);
  }
  const ts = document.getElementById('toast');
  if (ts && !ts.hidden && ts.textContent && +getComputedStyle(ts).opacity > 0.3) out.push(['toast', txt(ts)]);
  if ((e = on('#ach-toast'))) out.push(['ach', txt(e)]);
  if ((e = on('#daily-pop'))) out.push(['daily', txt(e)]);
  if ((e = on('#daily-note'))) out.push(['note', 'задания на день']);
  if ((e = on('#hint'))) out.push(['hint', txt(e)]);
  if ((e = on('#rank-sheet', ''))) if (e.innerHTML) out.push(['rank', txt(e, '.rk-head b')]);
  return out;
};
const quietNow = () => {
  const S = d.S;
  return !S.paused && ['drive', 'back', 'handover', 'side', 'loading', 'brief'].includes(S.state) && !S.ride
    && !(d.DLG && d.DLG.isOpen && d.DLG.isOpen()) && !document.querySelector('#doorgame > *') && !document.body.classList.contains('story-cut');
};

let shifts = 0, delivered = 0, lastDel = 0;
const start = async () => { await onShift(); autopilot(true); shifts++; lastDel = d.S.delivered || 0; };
await start();
window.__warp = WARP;
const shown = {}, examples = [], tl = [];
let tpKey = '', tpT = 0, apOff = 0, prev = new Set(), was = 0, overlaps = 0, overMs = 0, maxAt = 0, live = 0;
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  await wait(50);
  if (d.S.state === 'over' || d.S.state === 'title') { delivered += Math.max(0, (d.S.delivered || 0) - lastDel); await wait(1500); await start(); prev = new Set(); was = 0; continue; }
  if (apOff && Date.now() > apOff) { apOff = 0; autopilot(true); }
  if (NTP && ['drive', 'back'].includes(d.S.state) && d.S.target) {
    const key = d.S.state + (d.S.order ? d.S.order.idx : '') + (d.S.delivered || 0);
    if (key !== tpKey) { tpKey = key; tpT = Date.now(); }
    else if (Date.now() - tpT > NTP * 1000) {
      // к цели вплотную, без привязки к дороге (адрес бывает во дворе в 50 м от улицы); руль отпускаем на 2 с — вручится
      const V = d.V, x = d.S.target.x + 1.5, z = d.S.target.z + 1.5;
      V.x = x; V.z = z; V.vx = V.vz = 0; V.y = d.surfaceAt(x, z); V.camX = x - Math.sin(V.h) * 11; V.camZ = z - Math.cos(V.h) * 11; V.camY = V.y + 6;
      if (d.car) d.car.position.set(x, V.y, z);
      autopilot(false); apOff = Date.now() + 2000; tpT = Date.now() + 4000;
    }
  }
  if (!quietNow()) { was = 0; continue; }
  live += 50;
  const v = visible(), now = (Date.now() - t0) / 1000;
  const keys = new Set(v.map(x => x[0] + '|' + x[1]));
  for (const x of v) {
    if (prev.has(x[0] + '|' + x[1]) || (x[0] === 'chat' && x[1].endsWith('печатает…'))) continue;   // «печатает…» — не отдельное
    shown[x[0]] = (shown[x[0]] || 0) + 1;
    if (tl.length < 400) tl.push([+now.toFixed(1), x[0], x[1]]);
  }
  prev = keys;
  if (v.length >= 2) {
    overMs += 50; maxAt = Math.max(maxAt, v.length);
    if (was < 2) { overlaps++; if (examples.length < 12) examples.push({ t: +now.toFixed(1), kinds: v.map(x => x[0]).join(' + '), texts: v.map(x => x[1]).join(' | ') }); }
  }
  was = v.length;
}
autopilot(false);
window.__warp = 1;
delivered += Math.max(0, (d.S.delivered || 0) - lastDel);
return { secs: SECS, liveSec: Math.round(live / 1000), shifts, delivered, shown, overlaps, overSec: +(overMs / 1000).toFixed(1), maxAt, examples, log: tl,
  nq: window.__NQ ? window.__NQ.stats() : null };
