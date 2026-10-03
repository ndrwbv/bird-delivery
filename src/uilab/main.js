/* Песочница интерфейса (ui.html, docs/SANDBOX.md «Песочница интерфейса»).
   ?frame — экран игры (frame.js): настоящие модули игры без мира, window.__ui;
   иначе — панель (shell.js): список экранов, ручки, размер экрана, язык, рамка-iframe с ?frame.
   __probeReady — для probe (--page=ui.html): false, пока страница не готова. */
window.__probeReady = false;
const Q = new URLSearchParams(location.search);
if (Q.has('frame')) await import('./frame.js');
else await import('./shell.js');
