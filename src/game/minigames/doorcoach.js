/* Обучение первого раза в мини-играх у двери (автор 18.10.2026: «на мобиле в подъезде обучение накладывается на игру.
   Надо сначала обучение с постепенной анимацией, подсвечивающей, куда нажимать, и потом уже даёшь подняться»).
   Правила словами — docs/ORDERS.md «Первый раз с каждым видом».

   Мини-игра стоит (её фаза 'learn', срок заказа не идёт — doorstep.js api.hold), поверх — затемнение и записка Толика.
   Шаг за шагом подсвечивается то, что жать: вырез в затемнении вокруг кнопки (или места на сцене), рамка пульсирует,
   на телефоне — палец тапает по ней, на клавиатуре и геймпаде — над ней крупно значок клавиши того, чем играешь.
   Нажал её (или «дальше») — рамка вспыхивает зелёным, следующий шаг. Последний шаг — штамп «поехали!»: только тогда
   мини-игра запускается и идёт срок. «Пропустить» — B / Backspace / тап — сразу в игру. Esc / Start — пауза игры, как всегда.

   coach(box, o) → { on(), pad(p), layout(), skip(), state(), off() }
     box — корень мини-игры (.mk-full / .tk): затемнение ложится поверх всего в нём;
     o: { t, ln: { person, name, add } (кто пишет и сколько секунд добавили к сроку), paused(), goLabel (вместо «поехали!»),
          steps: [{ el(k) → элемент | [элементы] | null, rect(k) → { x, y, w, h } (в координатах box; вместо el),
                    text(k, fam) → HTML, keys(k, fam) → [[надпись, клавиатура?], …] (значки над целью; палец — сам),
                    hit(code) → нажата клавиша цели, pad(p) → нажата кнопка геймпада цели,
                    go: true — последний шаг (штамп «поехали!»), act() — после старта, если нажали цель на шаге go }],
          onEnd(skipped) — обучение кончилось: запустить мини-игру }
   k — 'pad' | 'kb' | 'touch', fam — 'xbox' | 'ps' (glyphs.js inputKind).
   Модуль без export default — песочница (uilab/minigames.js) его кнопкой не показывает. */
import './doorcoach.css';
import { inputKind, onInput } from '../../input/glyphs.js';
import * as TF from '../talkface.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
const ARM = 0.45;              // с: после показа нажатия не считаются (жал газ в машине — не пропустит обучение)
const OK_T = 300;              // мс: рамка вспыхнула зелёным — следующий шаг
const PAD_HOLE = 8;            // px: вырез шире цели
/* клавиши, которые обучение глотает (игра под ним не едет и не открывает карту); Esc, F-клавиши — мимо */
const SWALLOW = /^(Arrow|Key|Digit|Numpad|Enter|Space|Backspace|Tab|Delete)/;
const OK_CODES = ['Enter', 'NumpadEnter', 'Space'];

export const kbd = (s, kb) => '<kbd class="pp-key' + (kb ? ' pp-key-kb' : '') + '">' + esc(s) + '</kbd>';

export function coach (box, o) {
  const t = o.t || (s => s), steps = o.steps || [], ln = o.ln || {};
  let i = 0, live = true, busy = false, born = performance.now(), last = '', hole = null;
  const el = document.createElement('div');
  el.className = 'dc dc-dimmed';
  el.innerHTML =
    '<div class="dc-hole" hidden></div>' +
    '<div class="dc-hint" hidden><span class="dc-hand" aria-hidden="true">👆</span><span class="dc-keys"></span></div>' +
    '<div class="dc-card">' +
      '<header class="dc-head"><span class="dc-av"></span><b>' + esc(ln.name || t('Ирина Сергеевна')) + '</b><em>' + esc(t('первый раз')) + '</em><span class="dc-n"></span></header>' +
      '<p class="dc-txt"></p>' +
      '<div class="dc-btns">' +
        '<button type="button" tabindex="-1" class="dc-skip"><kbd class="pp-key"></kbd><span>' + esc(t('пропустить')) + '</span></button>' +
        '<button type="button" tabindex="-1" class="dc-next"><kbd class="pp-key"></kbd><span>' + esc(t('дальше')) + '</span></button>' +
        '<button type="button" tabindex="-1" class="dc-go pp-stamp"><kbd class="pp-key"></kbd><span>' + esc(o.goLabel || t('поехали!')) + '</span></button>' +
      '</div>' +
    '</div>';
  const q = s => el.querySelector(s);
  const elHole = q('.dc-hole'), elHint = q('.dc-hint'), elKeys = q('.dc-keys'), elCard = q('.dc-card'), elTxt = q('.dc-txt'), elN = q('.dc-n');
  const elSkip = q('.dc-skip'), elNext = q('.dc-next'), elGo = q('.dc-go');
  // аватарка Толика: лицо с ртом (talkface.js); без человека (песочница) — кружок с буквой
  let av = null;
  if (ln.person) {
    av = document.createElement('img'); av.alt = '';
    try { if (!TF.bind(av, ln.person, 96, 'happy')) av = null; } catch (e) { av = null; }
  }
  if (av) q('.dc-av').appendChild(av); else q('.dc-av').textContent = String(ln.name || t('Ирина Сергеевна')).slice(0, 1);
  box.appendChild(el);

  const cur = () => steps[i] || { go: true };
  const ik = () => inputKind();

  /* значки на кнопках записки — по вводу: пропустить B / Bksp, дальше и поехали — A / Enter; касание — без значков */
  function btnKeys () {
    const { kind: k, family: fam } = ik(), ps = fam === 'ps';
    const set = (b, s, kb) => { const kk = b.querySelector('kbd'); kk.textContent = s; kk.hidden = !s; kk.classList.toggle('pp-key-kb', !!kb); };
    set(elSkip, k === 'pad' ? (ps ? '○' : 'B') : k === 'kb' ? 'Bksp' : '', k === 'kb');
    set(elNext, k === 'pad' ? (ps ? '✕' : 'A') : k === 'kb' ? 'Enter' : '', k === 'kb');
    set(elGo, k === 'pad' ? (ps ? '✕' : 'A') : k === 'kb' ? 'Enter' : '', k === 'kb');
  }

  /* шаг на экран: текст, номер, кнопки, значки у цели; рамка встанет в layout() */
  function render (fresh) {
    const s = cur(), { kind: k, family: fam } = ik();
    const html = s.text ? s.text(k, fam) : '';
    const keys = s.keys && k !== 'touch' ? s.keys(k, fam) || [] : [];
    const sig = i + '|' + k + '|' + fam + '|' + html;
    if (sig === last && !fresh) return;
    last = sig;
    elTxt.innerHTML = html;
    const real = steps.filter(x => !x.go).length;
    elN.textContent = s.go || !real ? '' : (i + 1) + ' / ' + real;
    el.classList.toggle('dc-last', !!s.go);
    elNext.hidden = !!s.go; elGo.hidden = !s.go;
    elKeys.innerHTML = keys.map(([g, kb]) => kbd(g, kb)).join('');
    el.dataset.input = k;
    btnKeys();
    if (fresh) {
      elCard.classList.remove('dc-pop'); void elCard.offsetWidth; elCard.classList.add('dc-pop');
      elHint.classList.remove('dc-show'); void elHint.offsetWidth; elHint.classList.add('dc-show');
      if (av) { try { TF.talk(av, TF.talkTime(elTxt.textContent)); } catch (e) { /* — */ } }
    }
    hole = null;
    layout();
  }

  /* где цель (в координатах box): элемент(ы) — по их рамке, или своя рамка шага; скрытые — не в счёт */
  function target () {
    const s = cur(), k = ik().kind;
    if (s.rect) { const r = s.rect(k); if (r && r.w > 0) return r; }
    let els = s.el ? s.el(k) : null;
    if (!els) return null;
    if (!Array.isArray(els)) els = [els];
    const b = box.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) {
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      x0 = Math.min(x0, r.left - b.left); y0 = Math.min(y0, r.top - b.top);
      x1 = Math.max(x1, r.right - b.left); y1 = Math.max(y1, r.bottom - b.top);
    }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  /* вырез, рамка, палец / значки и записка — по месту цели; зовёт мини-игра каждый кадр (дёшево: меняет, только если сдвинулось) */
  function layout () {
    if (!live) return;
    const r = target(), W = box.clientWidth || 1, H = box.clientHeight || 1;
    const key = (r ? [r.x, r.y, r.w, r.h].map(Math.round).join(',') : 'none') + '|' + W + 'x' + H + '|' + ik().kind;
    if (key === hole) return;
    hole = key;
    el.classList.toggle('dc-dimmed', !r);
    elHole.hidden = !r; elHint.hidden = !r;
    if (r) {
      const x = r.x - PAD_HOLE, y = r.y - PAD_HOLE, w = r.w + PAD_HOLE * 2, h = r.h + PAD_HOLE * 2;
      Object.assign(elHole.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', width: Math.round(w) + 'px', height: Math.round(h) + 'px' });
      // палец — кончиком в нижнюю половину цели; значки клавиш — над целью (у верха экрана — под ней)
      const cx = r.x + r.w / 2, touch = ik().kind === 'touch', below = !touch && y < 74;
      elHint.classList.toggle('dc-below', below);
      const top = touch ? Math.min(H - 46, r.y + r.h * 0.55) : below ? y + h + 6 : y - 6;
      Object.assign(elHint.style, { left: Math.round(cx) + 'px', top: Math.round(top) + 'px' });
    }
    // записка — в той половине экрана, где цели нет; цели нет (последний шаг) — посередине
    const cyT = r ? r.y + r.h / 2 : H * 0.6;
    elCard.classList.toggle('dc-top', !!r && cyT > H * 0.5);
    elCard.classList.toggle('dc-bot', !!r && cyT <= H * 0.5);
    elCard.classList.toggle('dc-mid', !r);
  }

  function flash () {
    elHole.classList.remove('dc-ok'); void elHole.offsetWidth; elHole.classList.add('dc-ok');
    const s = cur(), k = ik().kind;
    let els = s.el ? s.el(k) : null;
    if (els && !Array.isArray(els)) els = [els];
    for (const e of els || []) { if (!e) continue; e.classList.remove('dc-press'); void e.offsetWidth; e.classList.add('dc-press'); }
  }
  /* дальше: нажал цель — рамка вспыхнула; через OK_T мс — следующий шаг */
  function next (hit) {
    if (!live || busy) return;
    const s = cur();
    if (s.go) { go(hit); return; }
    busy = true;
    if (hit) flash();
    setTimeout(() => { busy = false; if (!live) return; i = Math.min(steps.length - 1, i + 1); render(true); }, hit ? OK_T : 120);
  }
  function end (skipped, act) {
    if (!live) return;
    live = false;
    removeEventListener('keydown', onKey, true);
    offInput();
    if (av) { try { TF.stop(av); } catch (e) { /* — */ } }
    el.classList.add('dc-out');
    setTimeout(() => el.remove(), 240);
    try { if (o.onEnd) o.onEnd(!!skipped); } catch (e) { /* — */ }
    if (act) { try { act(); } catch (e) { /* — */ } }
  }
  function go (hit) {
    if (!live || busy) return;
    const s = cur();
    elGo.classList.add('pp-down');
    end(false, hit && s.act ? s.act : null);
  }
  const armed = () => (performance.now() - born) / 1000 < ARM;

  const onKey = e => {
    if (!live || (o.paused && o.paused())) return;
    const c = e.code;
    if (!SWALLOW.test(c)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || busy || armed()) return;
    if (c === 'Backspace') { end(true); return; }
    const s = cur(), hit = !!(s.hit && s.hit(c));
    if (hit || OK_CODES.includes(c)) next(hit);
  };
  addEventListener('keydown', onKey, true);

  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (!live || busy || armed() || (o.paused && o.paused())) return;
    if (e.target.closest('.dc-skip')) { end(true); return; }
    if (e.target.closest('.dc-next, .dc-go')) { next(false); return; }
    const r = target();
    if (!r) return;
    const b = box.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    if (x >= r.x - PAD_HOLE && x <= r.x + r.w + PAD_HOLE && y >= r.y - PAD_HOLE && y <= r.y + r.h + PAD_HOLE) next(true);
    else { elHole.classList.remove('dc-nudge'); void elHole.offsetWidth; elHole.classList.add('dc-nudge'); }   // мимо — рамка кивает: «сюда»
  });

  const offInput = onInput(() => render(false));
  render(true);
  requestAnimationFrame(() => { hole = null; layout(); });

  return {
    on: () => live,
    /* геймпад (мини-игра зовёт вместо своего pad, пока идёт обучение): B — пропустить, A или кнопка цели — дальше */
    pad (p) {
      if (!live || busy || !p || armed()) return;
      if (p.menuBack) { end(true); return; }
      const s = cur(), hit = !!(s.pad && s.pad(p));
      if (hit || p.menuOk || p.accept) next(hit);
    },
    layout,
    skip: () => end(true),
    state: () => ({ on: live, step: i, n: steps.length, go: !!cur().go, hole: hole }),
    off: () => { if (live) { live = false; removeEventListener('keydown', onKey, true); offInput(); if (av) { try { TF.stop(av); } catch (e) { /* — */ } } } el.remove(); },
  };
}
