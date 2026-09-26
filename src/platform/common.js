/* Общие куски платформ: языки, localStorage, пауза с причинами, локальная таблица,
   заглушка рекламы. Игру не трогает — только то, что нужно web.js и yandex.js. */

// языки, с которыми игра выходит; порядок — приоритет в меню выбора
export const SUPPORTED_LANGS = ['ru', 'en', 'tr', 'de', 'es', 'pt', 'fr', 'it', 'pl', 'uk', 'kk', 'uz', 'be', 'ja', 'zh'];

// СНГ-языки: если словаря нет, лучше русский, чем английский
const RU_FALLBACK = ['be', 'kk', 'uz', 'uk'];

/** Код площадки/браузера ('pt-BR', 'zh_CN', 'kk') → язык игры из `have`. */
export function mapLang (code, have = SUPPORTED_LANGS) {
  const c = String(code || '').toLowerCase().replace('_', '-').split('-')[0];
  if (have.includes(c)) return c;
  if (RU_FALLBACK.includes(c) && have.includes('ru')) return 'ru';
  return have.includes('en') ? 'en' : have[0];
}

export const LANG_KEY = 'dlv-lang';     // язык, который игрок выбрал сам

/* ── localStorage: всё молча, приватный режим и запреты не роняют игру ── */

// значения лежат JSON-ом; старые сырые строки («1234», «Вася») тоже читаются
export const decode = raw => { if (raw === null || raw === undefined) return undefined; try { return JSON.parse(raw); } catch (e) { return raw; } };
export const lsGet = (k, d) => { try { const v = decode(localStorage.getItem(k)); return v === undefined ? d : v; } catch (e) { return d; } };
export const lsSet = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* — */ } };

/** Все ключи игры (`dlv-*`) из localStorage одним объектом. */
export function lsDump (prefix = 'dlv-') {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out[k] = decode(localStorage.getItem(k));
    }
  } catch (e) { /* — */ }
  return out;
}

/** Хранилище поверх localStorage: синхронное, flush() — пустышка. */
export const localStore = () => ({
  get: (k, d) => lsGet(k, d),
  set: (k, v) => lsSet(k, v),
  flush () {},
});

/* ── пауза: несколько причин сразу (реклама + свёрнутая вкладка + SDK),
   onPause — когда появилась первая, onResume — когда ушла последняя ── */

export function pauseHub () {
  const why = new Set(), onP = [], onR = [];
  const fire = (list, r) => { for (const cb of list) { try { cb(r); } catch (e) { console.error(e); } } };
  const hub = {
    get paused () { return why.size > 0; },
    reasons: why,
    onPause: cb => { onP.push(cb); },
    onResume: cb => { onR.push(cb); },
    pause (r) { if (why.has(r)) return; why.add(r); if (why.size === 1) fire(onP, r); },
    resume (r) { if (!why.delete(r)) return; if (why.size === 0) fire(onR, r); },
    // свернули вкладку / переключили приложение — тоже пауза (звук, таймеры)
    watchVisibility () {
      const sync = () => (document.hidden ? hub.pause('hidden') : hub.resume('hidden'));
      document.addEventListener('visibilitychange', sync);
      sync();
    },
  };
  return hub;
}

/* ── локальная таблица: лучшие смены на этом устройстве ── */

export function localBoard (store, key = 'dlv-lb-local', meName = () => '') {
  const list = () => { const l = store.get(key, []); return Array.isArray(l) ? l : []; };
  const sorted = () => list().slice().sort((a, b) => b.score - a.score || a.ts - b.ts);
  const row = (r, i) => ({ rank: i + 1, name: r.name || '', score: r.score, level: r.level || 0, me: !!r.name && r.name === meName() });
  return {
    async submit (score, extra = {}) {
      const l = list();
      l.push({ name: extra.name || meName(), score: Math.round(+score || 0), level: extra.level || 0, delivered: extra.delivered || 0, ts: Date.now() });
      l.sort((a, b) => b.score - a.score || a.ts - b.ts);
      store.set(key, l.slice(0, 50));
      return true;
    },
    async top (n = 10) { return sorted().slice(0, n).map(row); },
    async mine () {
      const i = sorted().findIndex(r => r.name === meName());
      return i < 0 ? null : { rank: i + 1, score: sorted()[i].score };
    },
  };
}

/* ── заглушка рекламы: DOM-плашка на 1.5 с, чтобы гонять паузу и награды ── */

export function fakeAd (label, ms = 1500) {
  return new Promise(res => {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(0,0,0,.85);color:#fff;font:16px/1.4 monospace;user-select:none;cursor:wait';
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); res(); }, ms);
  });
}

/* ── требования площадок: без выделения текста, контекстного меню и лупы на iOS ── */

export function hardenPage () {
  const css = document.createElement('style');
  css.textContent = 'html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}'
    + 'input,textarea{-webkit-user-select:text;user-select:text}';
  document.head.appendChild(css);
  const editable = t => t && t.closest && t.closest('input,textarea,[contenteditable]');
  document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', e => e.preventDefault());
}

export const timeout = (p, ms, what) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error((what || 'sdk') + ': таймаут ' + ms + ' мс')), ms)),
]);
