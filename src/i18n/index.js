/* Переводы. Ключ — сама русская строка: код читается как раньше, а словари
   языков — это «русский → перевод» (src/i18n/<lang>.json, собирает
   tools/i18n-extract.mjs). Подстановки — {имя}: t('минус {what}', { what }).
   Множественное — tn(n, 'заказ|заказа|заказов'): в словаре у такого ключа
   объект по категориям Intl.PluralRules ({ one, few, many, other }).

   Язык выбирается до загрузки игры (main.js), поэтому t() можно звать и на
   верхнем уровне модуля. Смена языка — перезагрузка страницы. */

export const LANGS = ['ru', 'en', 'tr', 'de', 'es', 'pt', 'fr', 'it', 'pl', 'uk', 'kk', 'uz', 'be', 'ja', 'zh'];
export const LANG_NAMES = {
  ru: 'Русский', en: 'English', tr: 'Türkçe', de: 'Deutsch', es: 'Español', pt: 'Português', fr: 'Français',
  it: 'Italiano', pl: 'Polski', uk: 'Українська', kk: 'Қазақша', uz: 'Oʻzbekcha', be: 'Беларуская', ja: '日本語', zh: '中文',
};
/* у кого кириллица — улицы из карты оставляем как есть, остальным транслитерируем */
const CYR = new Set(['ru', 'uk', 'kk', 'be']);

const LOADERS = import.meta.glob('./[a-z][a-z].json');
let LANG = 'ru', DICT = null, EN = null;

export async function initI18n (want) {
  LANG = LANGS.includes(want) ? want : 'en';
  const load = async l => { const f = LOADERS['./' + l + '.json']; return f ? (await f()).default : null; };
  if (LANG !== 'ru') {
    [DICT, EN] = await Promise.all([load(LANG), LANG === 'en' ? null : load('en')]);
    if (LANG === 'en') EN = DICT;
  }
  document.documentElement.lang = LANG;
  return LANG;
}
export const lang = () => LANG;
export const isCyr = () => CYR.has(LANG);

/* пометка «переведётся позже»: строка попадает в словарь, а $t() зовут над ней потом */
export const N_ = s => s;

const fill = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m)) : s);

/* нет перевода — английский, нет и его — русский исходник */
export function t (src, p) {
  if (LANG === 'ru') return fill(src, p);
  let s = DICT && DICT[src];
  if (typeof s !== 'string' || !s) s = EN && EN[src];
  if (typeof s !== 'string' || !s) s = src;
  return fill(s, p);
}

const ruPlural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const PR = new Map();
export function tn (n, forms, p) {
  const q = Object.assign({ n }, p);
  if (LANG !== 'ru') {
    const v = (DICT && DICT[forms]) || (EN && EN[forms]);
    if (v && typeof v === 'object') {
      if (!PR.has(LANG)) PR.set(LANG, new Intl.PluralRules(LANG));
      const cat = PR.get(LANG).select(n);
      return fill(v[cat] || v.other || v.many || v.one || '', q);
    }
  }
  const [a, b, c] = forms.split('|');
  return fill(ruPlural(Math.abs(n), a, b || a, c || b || a), q);
}

/* Разметка: data-i18n — текст элемента, data-i18n-ph — placeholder,
   data-i18n-title — title, data-i18n-html — innerHTML (ключ — исходный html). */
export function applyDom (root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.textContent.trim();
    el.textContent = t(el.dataset.i18nSrc);
  }
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.innerHTML.trim();
    el.innerHTML = t(el.dataset.i18nSrc);
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.getAttribute('data-i18n-ph'));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.getAttribute('data-i18n-title'));
}

/* Транслитерация названий улиц и домов из карты — для языков без кириллицы */
const TR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
/* слова-типы улиц не транслитерируем, а сокращаем по-английски: так их
   поймут в любой латинице («Leninskaya Sloboda St.») */
const STREET_WORDS = {
  'улица': 'St.', 'проезд': 'Dr.', 'переулок': 'Ln.', 'проспект': 'Ave.', 'набережная': 'Emb.', 'шоссе': 'Hwy',
  'площадь': 'Sq.', 'бульвар': 'Blvd', 'тупик': 'Dead End', 'мост': 'Bridge', 'дом': 'Bldg',
};
export function translit (s) {
  if (!s || isCyr() || !/[А-Яа-яЁё]/.test(s)) return s;
  // «улица Ленинская Слобода, 19» → «Leninskaya Sloboda St., 19»: тип улицы — в конец названия
  const m = s.match(/^(\S+)\s+([^,]+)(,.*)?$/);
  if (m && STREET_WORDS[m[1].toLowerCase()] && m[1].toLowerCase() !== 'дом') s = m[2] + ' ' + m[1] + (m[3] || '');
  return s.replace(/[А-Яа-яЁё]+/g, w => {
    const low = w.toLowerCase();
    if (STREET_WORDS[low]) return STREET_WORDS[low];
    let r = '';
    for (const ch of low) r += TR[ch] !== undefined ? TR[ch] : ch;
    return w[0] !== low[0] ? r.charAt(0).toUpperCase() + r.slice(1) : r;
  });
}
