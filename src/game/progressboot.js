/* Runs after i18n and before map/game imports. A storage failure offers ONLY retry.
   Dependencies are supplied by main, so this module cannot eagerly read progress/Platform. */
function retryPanel ({ host, t, error, pollPad, makePadMenu, raf, cancelRaf }) {
  return new Promise(resolve => {
    const doc = host.ownerDocument, panel = doc.createElement('section'), text = doc.createElement('p'), button = doc.createElement('button');
    const oldAria = host.getAttribute('aria-hidden');
    host.removeAttribute('aria-hidden'); host.classList.add('save-error');
    panel.className = 'boot-save-error'; panel.setAttribute('role', 'alert');
    panel.dataset.code = error?.code || 'storage-failed';
    text.textContent = t('Не удалось открыть сохранение. Повторите попытку.');
    button.type = 'button'; button.textContent = t('Повторить');
    panel.appendChild(text); panel.appendChild(button); host.appendChild(panel);
    let frame = 0, done = false;
    const finish = () => {
      if (done) return; done = true; button.disabled = true;
      if (frame) cancelRaf(frame);
      panel.remove(); host.classList.remove('save-error');
      if (oldAria === null) host.removeAttribute('aria-hidden'); else host.setAttribute('aria-hidden', oldAria);
      resolve();
    };
    button.addEventListener('click', finish);
    button.focus();
    if (pollPad && makePadMenu) {
      const menu = makePadMenu();
      const tick = () => {
        if (done) return;
        const p = pollPad(); doc.body.classList.toggle('pad', !!p.active); menu(p, panel);
        if (!done) frame = raf(tick);
      };
      frame = raf(tick);
    }
  });
}
export async function requireSingleProgress ({ migrate, host, t, pollPad, makePadMenu,
  raf = globalThis.requestAnimationFrame, cancelRaf = globalThis.cancelAnimationFrame }) {
  for (;;) {
    try { return migrate(); }
    catch (error) { await retryPanel({ host, t, error, pollPad, makePadMenu, raf, cancelRaf }); }
  }
}
