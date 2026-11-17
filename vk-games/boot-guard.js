(function () {
  const launch = new URL(location.href);
  const publicKeys = [...launch.searchParams.keys()].filter(key => key !== 'sign' && key !== 'mute' && !key.startsWith('vk_'));
  for (const key of publicKeys) launch.searchParams.delete(key);
  // Keep the original encoding of VK launch parameters whenever the URL is already clean.
  if (publicKeys.length) {
    try { history.replaceState(null, '', launch); } catch { /* The host may restrict history in its frame. */ }
  }

  let failure = '';
  let watchdog;
  const fallback = 'Не удалось загрузить игру. Проверьте соединение и поддержку WebGL 2, затем попробуйте ещё раз.';
  const bootVisible = () => {
    const boot = document.getElementById('boot');
    return boot && !boot.classList.contains('gone');
  };
  function fail (message) {
    if (failure) return;
    failure = message;
    clearTimeout(watchdog);
    const render = () => {
      document.getElementById('vk-load-message').textContent = failure;
      document.getElementById('vk-load-error').hidden = false;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
    else render();
  }

  function watch () {
    clearTimeout(watchdog);
    if (failure || !bootVisible()) return;
    watchdog = setTimeout(() => {
      if (!bootVisible()) return;
      if (document.querySelector('.vk-sheet[open]')) watch();
      else fail('Игра загружается слишком долго. Проверьте соединение и попробуйте ещё раз.');
    }, 75000);
  }
  addEventListener('bird-vk-loading-error', event => fail(event.detail || fallback));
  addEventListener('vite:preloadError', () => { if (bootVisible()) fail(fallback); });
  addEventListener('unhandledrejection', () => { if (bootVisible()) fail(fallback); });
  addEventListener('error', event => {
    if (bootVisible() && (event.target === window || event.target?.tagName === 'SCRIPT')) fail(fallback);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#vk-load-error button').onclick = () => location.reload();
    const boot = document.getElementById('boot');
    if (boot) new MutationObserver(watch).observe(boot, { attributes: true, attributeFilter: ['class'] });
    watch();
  }, { once: true });
})();
