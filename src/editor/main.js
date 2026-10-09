/* Редактор города — вход (docs/SANDBOX.md, «Редактор города»).

   Город строит сама игра (тот же main.js → game.js, тот же сбор города): берём разметку #game из
   настоящего index.html, ставим флаг window.__EDITOR и грузим игру как обычно. Игра в меню, но
   меню и хад спрятаны, камеру водит редактор (game.js зовёт __dlv.EDL.ED.cam в кадре меню),
   клавиатура, мышь и геймпад игре не достаются. Потом — панель редактора (editor.js). */
import './editor.css';

const Q = new URLSearchParams(location.search);
let changed = false;
for (const k of ['debug', 'mute', 'nolb']) if (!Q.has(k)) { Q.set(k, ''); changed = true; }   // __dlv, без звука (автор 09.10), без таблицы рекордов
if (changed) history.replaceState(null, '', location.pathname + '?' + Q.toString().replace(/=(&|$)/g, '$1'));

// первый запуск на этом порту: язык выбран, гайд и учебный заказ пройдены — как в probe
try {
  const S = { 'dlv-lang': 'ru', 'dlv-msk-guide': 1, 'dlv-msk-tut': '1', 'dlv-msk-nostut': 1 };
  for (const k in S) if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(S[k]));
} catch (e) { /* — */ }

window.__EDITOR = true;
window.__probeReady = false;                       // probe --page=editor.html ждёт, пока город достроится и панель встанет

// клавиатура — только редактору: игра (меню, пауза, карта) кнопок не видит. Поля ввода печатают как обычно
const KEYS = window.__edKeys = { down: new Set(), on: null };
for (const type of ['keydown', 'keyup', 'keypress']) {
  addEventListener(type, e => {
    e.stopImmediatePropagation();
    if (KEYS.on) KEYS.on(e);
  }, true);
}
addEventListener('blur', () => KEYS.down.clear());

const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
const doc = new DOMParser().parseFromString(html, 'text/html');
for (const st of doc.head.querySelectorAll('style')) document.head.appendChild(document.adoptNode(st));
document.documentElement.dataset.map = doc.documentElement.dataset.map || '';
document.body.className = 'booting editor';
for (const id of ['boot', 'game']) {
  const el = doc.getElementById(id);
  if (!el) throw new Error('редактор: в index.html нет #' + id);
  document.body.appendChild(document.adoptNode(el));
}

await import('../main.js');                        // игра: язык, карта, город — как всегда
const ED = await import('./editor.js');
await ED.boot();
window.__probeReady = true;
