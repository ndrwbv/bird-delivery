/* Настройки (04.10.2026): табы — Игра · Графика · Звук · Управление · Язык. Один и тот же экран —
   из главного меню и из паузы (game.js renderSettings → SET.render). Правила словами —
   docs/CAREER.md «Главное меню, пауза и настройки».

   Табы: игра (имя, профиль, мини-игры у клиента вкл / выкл, путь на дороге вкл / выкл (routeask.js), сбросить прогресс, тестовые районы, версия и обновление, update.js) ·
   графика (качество и 7 пунктов, gfx.js) · звук (вкл / выкл и три ползунка: музыка, звуки, мотор — docs/SOUNDS.md;
   радио в машине вкл / выкл и станция — radio.js) · управление (какие кнопки за что — геймпад,
   клавиатура или палец) · язык (сетка языков). Внутри таба — обычный вертикальный список; не влез
   (телефон боком) — листается внутри таба, окно целиком не прокручивается.
   Переключить таб: LB/RB и LT/RT геймпада, ←→ (крестовина, стик, клавиши), когда подсветка на строке
   табов, Q/E и PageUp/PageDown, клик или тап по табу. Строка табов для геймпада и клавиатуры — один
   пункт (виден только выбранный таб, остальные data-pad-skip): ↓ с неё — в список, ↑ с первой строки — к ней.
   Что перезагружает игру (язык, профиль, сброс) — только в главном меню: в паузе подпись
   «меняется в главном меню». Графика и звук из паузы — сразу. Взрослая / детская версия — не
   настройка: её задаёт сборка (Стим — взрослая, Яндекс — детская).

     SET.init(api)     — из game.js (что нужно — ниже, в render)
     SET.render(focus, tab) — нарисовать в окно #panel; focus — id кнопки, на которой встать (её таб
                         откроется сам); tab — какой таб открыть ('game' | 'gfx' | 'snd' | 'ctrl' | 'lang')
     SET.flip(±1, force) — соседний таб: force — всегда (LB/RB, LT/RT), без него — только если
                         подсветка на строке табов или её нет (←→); true — переключили
     SET.on()          — настройки на экране */
import './settings.css';
import { t } from '../i18n/index.js';
import * as UPD from './update.js';
import { keyHTML } from '../input/glyphs.js';

let A = null, TAB = 'game', TABS = [];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
const TAB_NAMES = { game: 'игра', gfx: 'графика', snd: 'звук', ctrl: 'управление', lang: 'язык' };

export function init (api) {
  A = api;
  UPD.onChange(() => { if (on() && TAB === 'game') render(focusId()); });
  // Q / E и PageUp / PageDown — соседний таб (клавиатура)
  addEventListener('keydown', e => {
    if (!on() || e.repeat) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    const d = e.code === 'KeyQ' || e.code === 'PageUp' ? -1 : e.code === 'KeyE' || e.code === 'PageDown' ? 1 : 0;
    if (d && flip(d, true)) e.preventDefault();
  });
}
export const on = () => !!(A && A.kind() === 'settings' && !A.panel().hidden && A.body().querySelector('.set-tabs'));
const focusId = () => { const e = A.selected && A.selected(); return (e && e.id) || undefined; };
/* какая кнопка в каком табе */
const tabOf = id => !id ? null : id === 'set-snd' || id.startsWith('set-vol-') || id.startsWith('set-radio') ? 'snd' : id.startsWith('gfx-') ? 'gfx' : id.startsWith('set-l-') ? 'lang' : id.startsWith('set-tab-') ? id.slice(8) : 'game';

/** соседний таб; force — LB/RB, LT/RT, Q/E (всегда), без него — ←→ (только со строки табов) */
export function flip (d, force) {
  if (!on() || !TABS.length) return false;
  if (!force) {
    const P = A.panel(), sel = P.querySelector('.padsel') || (P.contains(document.activeElement) ? document.activeElement : null);
    if (sel && !sel.closest('.set-tabs')) return false;
  }
  const i = TABS.indexOf(TAB);
  const j = Math.max(0, Math.min(TABS.length - 1, i + d));
  if (j === i) return true;                        // край: ←→ всё равно наши, в список не уходят
  TAB = TABS[j];
  if (A.Snd && A.Snd.click) try { A.Snd.click(520); } catch (e) { /* — */ }
  render('set-tab-' + TAB);
  A.navReset();
  return true;
}

const row = (label, val, id, focus, opt = {}) => '<div class="set-row"><span>' + label + (opt.extra || '') + '</span><button type="button" id="' + id + '"' +
  (id === focus ? ' autofocus' : '') + (opt.cls ? ' class="' + opt.cls + '"' : '') + '>' + val + '</button></div>';
const note = s => '<div class="pn-n">' + s + '</div>';
/* ползунок громкости — линейка анкеты: ←→ геймпада и клавиш, мышь, палец; шаг 10 % */
const slider = (k, label, v, focus, extra = '') => {
  v = Math.max(0, Math.min(100, v == null ? 100 : +v));
  const id = 'set-vol-' + k;
  return '<div class="set-row set-vol"><span>' + label + extra + '</span><label class="set-sl" style="--v:' + v + '%">' +
    '<input type="range" id="' + id + '" data-vol="' + k + '" min="0" max="100" step="10" value="' + v + '" aria-label="' + esc(label) + '"' +
    (id === focus ? ' autofocus' : '') + '><b>' + v + ' %</b></label></div>';
};
const head = s => '<div class="set-h">' + s + '</div>';
/* без кнопок (управление, «меняется в главном меню»): геймпад встаёт на него сам (data-pad), A — ничего */
const still = html => '<div class="set-still" data-pad tabindex="-1">' + html + '</div>';

export function render (focus, tab) {
  if (!A) return;
  const P = A.panel(), body = A.body();
  P.dataset.kind = 'settings'; P.dataset.back = ''; P.dataset.sub = '';
  const menu = A.inMenu();                          // из главного меню (не посреди смены)
  const onlyMenu = t('меняется в главном меню');
  TABS = ['game', 'gfx', 'snd', 'ctrl', 'lang'];
  if (tab && TABS.includes(tab)) TAB = tab;
  else if (tabOf(focus)) TAB = tabOf(focus);
  if (!TABS.includes(TAB)) TAB = TABS[0];

  const tabsHtml = '<div class="set-tabs" role="tablist"><i class="set-tk" data-d="-1" aria-hidden="true">' + keyHTML('lb') + '</i>' +
    TABS.map(k => '<button type="button" role="tab" class="set-tab' + (k === TAB ? ' on' : '') + '" id="set-tab-' + k + '" data-tab="' + k + '"' +
      (k === TAB ? ' aria-selected="true"' + (focus === 'set-tab-' + k || !focus ? ' autofocus' : '') : ' aria-selected="false" data-pad-skip') + '>' + esc(t(TAB_NAMES[k])) + '</button>').join('') +
    '<i class="set-tk" data-d="1" aria-hidden="true">' + keyHTML('rb') + '</i></div>';
  // анкета сотрудника (UI-REVIEW № 45): шапка капсом, табы — ярлычки папки, внизу — пометка «[B] готово»
  body.innerHTML = '<header class="pn-t set-head"><span>' + t('анкета сотрудника') + '</span><b>' + t('настройки') + '</b></header>' + tabsHtml +
    '<div class="set-pane" data-tab="' + TAB + '"><div class="set-list"></div></div>' +
    '<div class="set-foot"><button type="button" class="pp-note set-close">' + keyHTML('back') + esc(t('готово')) + '</button>' +
    // единственная подпись OSM в игре (лицензия ODbL требует) — в самом низу, мелко, но читаемо
    '<div class="pn-n set-cred">' + t('карта — © участники OpenStreetMap, лицензия ODbL. Рельеф — SRTM (NASA).') + '</div></div>';
  const list = body.querySelector('.set-list');

  if (TAB === 'snd') {
    // вкл / выкл — общий (M, R3), под ним три ползунка громкости: музыка, звуки, мотор (game.js Snd.setVol)
    const vol = A.Snd.vol || {};
    list.innerHTML = row(t('звук'), A.Snd.on ? t('вкл') : t('выкл'), 'set-snd', focus) +
      slider('music', t('музыка'), vol.music, focus, A.Snd.music ? '' : ' <small class="set-tag">' + t('скоро') + '</small>') +
      slider('sfx', t('звуки'), vol.sfx, focus) +
      slider('eng', t('мотор'), vol.eng, focus) +
      note(t('M на клавиатуре, R3 на геймпаде — звук вкл / выкл прямо в игре')) +
      // радио в машине (radio.js): вкл — в смене играет станция, выкл — музыка игры; «станция» — для телефона, где нет клавиш
      (A.radio ? row(t('радио в машине'), A.radio.on() ? t('вкл') : t('выкл'), 'set-radio', focus) +
        (A.radio.on() ? row(t('станция'), esc(A.radio.name()), 'set-radio-st', focus) : '') +
        note(t('F на клавиатуре, ↓ на крестовине — следующая станция; в меню и на чеке смены радио нет')) : '');
  } else if (TAB === 'gfx') {
    A.GFX.panel(list, focus, true);                 // gfx.js рисует сама: качество и семь пунктов
  } else if (TAB === 'ctrl') {
    // лист без кнопок: курсор на него не встаёт (UI-REVIEW № 34) — остаётся на строке табов, B закрывает
    list.innerHTML = '<div class="set-still"><div class="set-keys">' + A.keys() + '</div></div>';
  } else if (TAB === 'lang') {
    // смена — перезагрузка, поэтому только в меню
    list.innerHTML = menu
      ? '<div class="lang-grid">' + A.langs.map(l => '<button type="button" lang="' + l + '" data-l="' + l + '" id="set-l-' + l + '"' +
          (l === A.lang() ? ' class="cur"' : '') + ('set-l-' + l === focus ? ' autofocus' : '') + '>' + A.langNames[l] + '</button>').join('') + '</div>'
      : still('<b class="set-big">' + esc(A.langNames[A.lang()]) + '</b>' + note(onlyMenu));
  } else {
    let h = '';
    // профиль (карьера): имя курьера и профили
    if (A.career) {
      const name = A.name();
      h += head(t('профиль'));
      // одна строка (UI-REVIEW № 29): профили есть — «профиль: имя · сменить» (там же и переименовать), нет — «имя»
      if (!menu) h += still('<b class="set-big">' + esc(name || '—') + '</b>' + note(onlyMenu));
      else if (A.prof.on()) h += row(t('курьер'), esc(A.prof.curName() || name || '—') + ' · ' + t('сменить'), 'set-prof', focus) +
        note(t('у каждого профиля свой прогресс: копилка, машины, районы'));
      else h += row(t('имя'), esc(name || '—'), 'set-name', focus);
    }
    // мини-игры у клиента (doorstep.js): домофон у подъезда и разговор у двери; выкл — только езда. Меняется и из паузы — со следующего адреса
    if (A.door) {
      h += row(t('мини-игры у клиента'), A.door.on() ? t('вкл') : t('выкл'), 'set-door', focus) +
        note(t('домофон у подъезда и разговоры с клиентами при вручении; выкл — только езда'));
    }
    // путь на дороге (routeask.js): оранжевая полоса к клиенту, зелёная — в пиццерию; в первой смене горит всегда. Меняется и из паузы — сразу
    if (A.route) {
      h += row(t('путь на дороге'), A.route.on() ? t('вкл') : t('выкл'), 'set-route', focus) +
        note(t('полоса на асфальте до клиента и обратно в пиццерию; в первой смене горит всегда') +
          (A.route.first() ? ' · ' + t('сейчас первая смена — горит') : ''));
    }
    // версия и обновление
    {
      const st = UPD.state(), v = UPD.version();
      const vv = x => String(x || '—').replace(/^v(?=\d)/, '');      // «v0.8.2» → «0.8.2»
      h += '<div class="set-ver">' + t('версия {v}', { v: '<b>' + esc(vv(v)) + '</b>' }) + (st.latest && st.latest !== v ? ' · ' + t('вышла') + ' <b>' + esc(vv(st.latest)) + '</b>' : '') + '</div>';
      if (UPD.on()) {
        const can = st.st === 'newer' && st.updatable;
        h += row(can ? '<b>' + esc(UPD.line()) + '</b>' : t('обновления с GitHub'), can ? t('обновить до {v}', { v: esc(st.latest) }) : st.st === 'wait' ? t('проверяю…') : t('проверить обновления'),
          can ? 'set-upd-go' : 'set-upd', focus, { extra: !can && UPD.line() ? '<small class="set-msg">' + esc(UPD.line()) + '</small>' : '' });
      } else h += note(A.steam ? t('игру обновляет Стим') : t('в браузере — всегда последняя версия'));
    }
    // ТЕСТ: «открыть все районы» — в релизе (BUILD_VERSION, __RELEASE__) нет, с ?debug — есть
    if (menu && A.unlock.on()) h += row(t('районы') + ' <small class="set-msg">' + t('для тестов') + '</small>', A.unlock.all() ? t('все открыты') : t('открыть все районы'), 'set-unlock', focus);
    if (menu && A.canReset()) h += '<button type="button" id="set-reset" class="set-danger"' + ('set-reset' === focus ? ' autofocus' : '') + '>' + t('сбросить прогресс') + '</button>';
    if (!menu) h += note(t('сбросить прогресс — в главном меню'));
    list.innerHTML = h;
  }
  ticks(list);
  // графика перерисовывает свой список сама (gfx.js panel) — галочки ставим заново
  new MutationObserver(() => ticks(list)).observe(list, { childList: true });
  wire(body);
}

/* галочки анкеты: кнопки «вкл» / «выкл» (звук, графика) — с квадратиком ☑ / ☐ (только вид, gfx.js не трогаем) */
function ticks (list) {
  const on1 = t('вкл'), off1 = t('выкл');
  list.querySelectorAll('.set-row button').forEach(b => {
    const v = b.textContent.trim();
    b.classList.toggle('set-on', v === on1 || v.startsWith(on1 + ' ·'));
    b.classList.toggle('set-off', v === off1 || v.startsWith(off1 + ' ·'));
  });
}

function wire (body) {
  { const c = body.querySelector('.set-close'), x = A.panel().querySelector('#pn-close'); if (c && x) c.addEventListener('click', () => x.click()); }
  const $ = id => body.querySelector('#' + id);
  body.querySelectorAll('.set-tab').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === TAB) return;
    TAB = b.dataset.tab;
    render('set-tab-' + TAB);
    A.navReset();
  }));
  body.querySelectorAll('.set-tk').forEach(b => b.addEventListener('click', () => flip(+b.dataset.d, true)));
  if ($('set-snd')) $('set-snd').onclick = () => { A.Snd.set(!A.Snd.on); render('set-snd'); };
  // ползунки: тянешь — громкость сразу, отпустил — короткий пример этого звука
  body.querySelectorAll('input[data-vol]').forEach(inp => {
    const k = inp.dataset.vol, lab = inp.closest('.set-sl'), num = lab && lab.querySelector('b');
    inp.addEventListener('input', () => {
      if (A.Snd.setVol) A.Snd.setVol(k, +inp.value);
      if (lab) lab.style.setProperty('--v', inp.value + '%');
      if (num) num.textContent = inp.value + ' %';
    });
    inp.addEventListener('change', () => { if (A.Snd.preview) try { A.Snd.preview(k); } catch (e) { /* — */ } });
  });
  body.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => A.setLang(b.dataset.l)));
  if ($('set-name')) $('set-name').onclick = () => A.askName(() => render('set-name'));
  if ($('set-prof')) $('set-prof').onclick = () => A.openProfiles();
  if ($('set-route')) $('set-route').onclick = () => { A.route.set(!A.route.on()); render('set-route'); };
  if ($('set-door')) $('set-door').onclick = () => { A.door.set(!A.door.on()); render('set-door'); };
  if ($('set-radio')) $('set-radio').onclick = () => { A.radio.set(!A.radio.on()); render('set-radio'); };
  if ($('set-radio-st')) $('set-radio-st').onclick = () => { A.radio.next(); render('set-radio-st'); };
  if ($('set-unlock')) $('set-unlock').onclick = () => A.unlock.run();
  if ($('set-reset')) $('set-reset').onclick = () => A.reset();
  if ($('set-upd')) $('set-upd').onclick = () => { UPD.check(true); render('set-upd'); };
  if ($('set-upd-go')) $('set-upd-go').onclick = () => { UPD.apply(); render(); };
}

export const DEBUG = { render, flip, on, get tab () { return TAB; }, get tabs () { return TABS.slice(); } };
