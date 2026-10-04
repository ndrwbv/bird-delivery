/* Обновление игры прямо из меню (04.10.2026). Правила словами — docs/CAREER.md «Обновление игры»,
   как устроено в оболочке — docs/STEAM.md «Обновление».

   Только сборка с GitHub в Электроне (Platform.shell, electron/main.cjs): игра сама спрашивает
   оболочку «что вышло» (update:latest, без окон) и, если вышла новее, на первом экране меню
   появляется плашка «есть новая версия vX.Y.Z — обновить». Нажал — оболочка ставит её сама:
     • Windows — качает установщик (ход — тут же, «скачиваю… 40 %»), игра закрывается,
       установщик встаёт поверх и запускает игру;
     • Linux / Steam Deck — игра закрывается, install-deck.sh качает архив релиза, заменяет файлы
       и запускает игру снова (~1 мин; сохранения в ~/.config/BirdPizza не трогает).
   Из Стима (обновляет Стим), в браузере, в dev — ничего нет (state 'off').

     UPD.init(shell)  — из game.js; сразу спрашивает оболочку
     UPD.check(force) — спросить заново (кнопка «проверить» в настройках)
     UPD.apply()      — поставить последнюю
     UPD.state()      — { st, cur, latest, p, updatable, msg }; st: off | wait | fresh | newer | error | download | restart | fail
     UPD.onChange(cb) — состояние поменялось (меню и настройки перерисовывают плашку)
     UPD.version()    — номер, что стоит сейчас: тег сборки или __BUILD__
     UPD.line()       — строка состояния для плашки и настроек */
import { t } from '../i18n/index.js';

let SH = null;
const S = { st: 'off', cur: '', latest: '', p: 0, updatable: false, msg: '', platform: '' };
const cbs = [];
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : '';
const emit = () => { for (const cb of cbs) { try { cb({ ...S }); } catch (e) { console.error('[update]', e); } } };

export function init (shell) {
  SH = shell && shell.latest ? shell : null;
  if (!SH) return;
  if (SH.onUpdate) SH.onUpdate(d => {
    if (!d) return;
    if (d.stage === 'download') { S.st = 'download'; S.p = Math.max(0, Math.min(1, +d.p || 0)); }
    else if (d.stage === 'restart') S.st = 'restart';
    else if (d.stage === 'error') { S.st = 'fail'; S.msg = String(d.msg || ''); }
    emit();
  });
  check(false);
}
export async function check (force) {
  if (!SH) return { ...S };
  if (S.st === 'download' || S.st === 'restart') return { ...S };
  S.st = 'wait'; emit();
  let r = null;
  try { r = await SH.latest(!!force); } catch (e) { r = { state: 'error' }; }
  r = r || { state: 'error' };
  if (r.current) S.cur = r.current;
  S.latest = r.latest || '';
  S.updatable = !!r.updatable;
  S.platform = r.platform || '';
  S.st = r.state === 'newer' ? 'newer' : r.state === 'fresh' ? 'fresh' : r.state === 'off' ? 'off' : 'error';
  emit();
  return { ...S };
}
export function apply () {
  if (!SH || S.st !== 'newer' || !S.updatable) return false;
  S.st = 'download'; S.p = 0; S.msg = ''; emit();
  Promise.resolve(SH.apply()).then(ok => { if (!ok) { S.st = 'fail'; emit(); } }).catch(() => { S.st = 'fail'; emit(); });
  return true;
}
export const on = () => !!SH;
export const state = () => ({ ...S });
export function onChange (cb) { if (typeof cb === 'function') cbs.push(cb); }
export const version = () => S.cur || BUILD;
/** есть что показать на первом экране меню */
export const newer = () => ['newer', 'download', 'restart', 'fail'].includes(S.st);

export function line () {
  switch (S.st) {
    case 'wait': return t('проверяю…');
    case 'fresh': return t('последняя версия');
    case 'error': return t('нет связи с GitHub');
    case 'newer': return S.updatable ? t('есть новая версия {v} — обновить', { v: S.latest }) : t('вышла {latest} — поставь заново командой из README', { latest: S.latest });
    case 'download': return S.p > 0 ? t('скачиваю обновление… {p} %', { p: Math.round(S.p * 100) }) : t('скачиваю обновление…');
    case 'restart': return S.platform === 'linux' ? t('игра закроется, скачает обновление и запустится сама — около минуты') : t('ставлю обновление, игра перезапустится…');
    case 'fail': return t('не получилось скачать обновление — попробуй позже');
  }
  return '';
}

export const DEBUG = { state, check, apply, line, version, newer };
