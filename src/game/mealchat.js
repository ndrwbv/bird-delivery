/* Бесплатный перерыв карьеры. Тот же DLG.say и его ввод, только оформление перепиской.
   Баф применяется один раз в момент выбора; реплики и полёт показывают уже состоявшийся результат. */
import './mealchat.css';
import { t, tn, lang } from '../i18n/index.js';
import * as DLG from './dialog.js';
import * as ECON from './econ.js';
import * as HUDFONE from './hudphone.js';
import { REPAIR_ICON, HEART_ICON, MONEY_ICON } from './lunchicons.js';
import { heroName } from './playername.js';
import { pad as PAD } from '../input/gamepad.js';

let active = null, serial = 0, last = null;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capture = (S, NOS) => ({ hp: S.hp, hpMax: S.hpMax, tank: NOS.tank, efficiency: S.nosEff || 1, lunch: S.lunch });
const fmt = value => Number(value).toLocaleString(lang() === 'zh' ? 'zh-CN' : lang());

function foods (S, NOS, repair) {
  const L = ECON.LUNCH, T = ECON.TIPS;
  return [
    { id: 'repair', text: t('Починить машину'), reply: t('Машину бы починить.'),
      sub: t('Восстановить сердца, кузов и мотор'),
      apply () {
        repair?.();
        return [{ kind: 'repair', icon: REPAIR_ICON, text: t('Машина починена'), target: '#hearts' }];
      } },
    { id: 'tips', text: t('«Директорская»'), reply: t('«Директорскую».'),
      sub: t('Шанс чаевых +{p} п.п., размер ×{k}', { p: Math.round(T.LUNCH_CHANCE * 100), k: fmt(T.LUNCH_MUL) }),
      apply () { return [{ kind: 'tips', icon: MONEY_ICON,
        text: t('Шанс чаевых +{p} п.п., размер ×{k}', { p: Math.round(T.LUNCH_CHANCE * 100), k: fmt(T.LUNCH_MUL) }), target: '#shiftcash' }]; } },
    { id: 'hp', text: t('Холодная пепперони'), reply: t('Холодную пепперони.'),
      sub: tn(L.hp.hearts, '+{n} сердце|+{n} сердца|+{n} сердец'),
      apply () {
        S.hpMax += L.hp.hearts; S.hp += L.hp.hearts;
        return [{ kind: 'hp', icon: HEART_ICON,
          text: tn(L.hp.hearts, '+{n} сердце|+{n} сердца|+{n} сердец'), target: '#hearts' }];
      } },
  ];
}

function live (run) {
  try { return active === run && !run.cancelled && run.api.valid(); } catch (error) { return false; }
}
function refresh (run, kind) { try { run.api.refresh(kind); } catch (error) { console.warn('[mealchat] refresh', error); } }
function cleanup (run) {
  if (run.cleaned) return;
  run.cleaned = true;
  if (run.raf) cancelAnimationFrame(run.raf);
  if (run.escape) removeEventListener('keydown', run.escape, true);
  if (run.effect) { run.effect.remove(); run.effect = null; }
  if (run.wake) { const wake = run.wake; run.wake = null; wake(false); }
  // Состояние бафа не откатываем: если ответ уже выбран, эффект остаётся и при закрытии переписки.
  if (run.ownedPause) {
    refresh(run);
    const other = run.api.pauseOwners?.() || {};
    if (!other.meal) run.api.S.meal = run.wasMeal;
    if (!other.paused) run.api.S.paused = run.wasPaused;
    document.body.classList.remove('meal-chat-open');
  }
  if (run.held) { run.held = false; DLG.hold(false); }
  if (run.embedded) HUDFONE.endConversation(!run.cancelled && run.api.valid());
  if (active === run) active = null;
}

function stop (run, resume) {
  run.resumeOnClose = resume;
  run.cancelled = true;
  DLG.dismiss(run.owner);                          // другой диалог, уже стоявший в очереди, не закрываем
  cleanup(run);                                   // hold освобождается даже если наша реплика ещё ждёт в DLG.queue
}
/* Смена/меню отменяют продолжение. Esc/B закрывают только показ и возвращают следующий заказ. */
export function cancel () {
  serial++;                                      // инвалидирует и уже закрытый показ до его finally
  if (active) stop(active, false);
}
function closeDisplay () { if (active) stop(active, true); }

function flight (run, effect, origin) {
  return new Promise(resolve => {
    const target = document.querySelector(effect.target), to = target?.getBoundingClientRect();
    if (!to || !to.width || !to.height) { refresh(run); resolve(true); return; }
    const from = origin || document.querySelector('#dlg .dlg-bubble')?.getBoundingClientRect();
    const x0 = from ? from.left + from.width / 2 : innerWidth * 0.75;
    const y0 = from ? from.top + from.height / 2 : innerHeight * 0.45;
    const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
    const el = document.createElement('div'); el.className = 'meal-flight'; el.dataset.effect = effect.kind;
    el.innerHTML = effect.icon + '<b>' + esc(effect.text) + '</b>'; document.body.appendChild(el);
    run.effect = el; run.wake = resolve;
    let elapsed = 0, previous = performance.now(), previousB = !!PAD.b;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 720;
    const tick = now => {
      if (!live(run)) { resolve(false); return; }
      const dt = Math.min(80, now - previous); previous = now;
      const paused = run.api.paused();
      if (!paused && PAD.connected && PAD.b && !previousB) { closeDisplay(); return; }
      previousB = !!PAD.b;
      if (!paused) elapsed += dt;
      const k = Math.min(1, elapsed / duration), smooth = k * k * (3 - 2 * k);
      const x = x0 + (x1 - x0) * smooth, y = y0 + (y1 - y0) * smooth - Math.sin(k * Math.PI) * 70;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.transform = 'translate(-50%, -50%) scale(' + (1 - k * 0.45) + ')';
      el.style.opacity = String(k < 0.82 ? 1 : Math.max(0, (1 - k) / 0.18));
      if (k < 1) { run.raf = requestAnimationFrame(tick); return; }
      run.raf = 0; run.wake = null; run.effect = null; el.remove(); refresh(run, effect.kind);
      target.animate?.([{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 320 });
      resolve(true);
    };
    run.raf = requestAnimationFrame(tick);
  });
}

export function play (api) {
  if (active) return active.promise;                // два нажатия/два кадра не открывают второй выбор
  const run = { id: ++serial, owner: {}, api, cancelled: false, cleaned: false, committed: false,
    held: false, ownedPause: false, wasPaused: !!api.S.paused, wasMeal: !!api.S.meal, stage: 'question' };
  active = run;
  run.escape = event => {
    if (run.stage !== 'effects' || api.paused() || !['Escape', 'Backspace'].includes(event.code)) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) closeDisplay();
  };
  addEventListener('keydown', run.escape, true);
  // Не замораживаем уже открытый разговор, пока вопрос обеда ждёт в той же очереди DLG.
  const takePause = () => {
    if (run.ownedPause || !live(run)) return;
    run.wasPaused = !!api.S.paused; run.wasMeal = !!api.S.meal;
    run.ownedPause = run.held = true; DLG.hold(true); api.S.meal = api.S.paused = true;
    document.body.classList.add('meal-chat-open');
  };
  const manager = { name: api.name || t('Ирина Сергеевна'), person: api.person, courier: false };
  const player = { name: heroName(), courier: true }, history = [];
  const common = { phone: true, compact: false, head: t('Курьерский чат') + (api.title ? ' · ' + api.title : ''), canonicalName: true,
    owner: run.owner, fillers: false, paused: api.paused, skip: () => !live(run),
    host: () => { const host = HUDFONE.conversationHost(); if (host) run.embedded = true; return host; } };
  run.promise = (async () => {
    let receipt = null;
    try {
      const options = foods(api.S, api.NOS, api.repair), question = t('Поешь, что будешь?');
      const picked = await DLG.say({ ...common, ...manager, text: question,
        choices: options.map(o => ({ id: o.id, text: o.text, sub: o.sub })), onShow: () => {
          takePause(); run.embedded = HUDFONE.conversationActive();
          if (run.embedded) HUDFONE.recordMessage({ ...manager, text: question, role: t('управляющая') });
        } });
      if (!live(run)) return null;
      const choice = options.find(o => o.id === picked);
      if (!choice) return null;
      const before = capture(api.S, api.NOS);
      api.S.lunch = choice.id;
      const effects = choice.apply(before);        // единственная точка применения, до анимаций и следующих нажатий
      run.committed = true;
      receipt = { id: choice.id, before, after: capture(api.S, api.NOS), effects: effects.map(e => ({ kind: e.kind, text: e.text })) };
      run.receipt = receipt; run.stage = 'reply';
      if (run.embedded) HUDFONE.recordMessage({ ...player, text: choice.reply, outgoing: true });
      history.push({ ...manager, text: question });
      const replied = await DLG.say({ ...common, ...player, courierLine: true, text: choice.reply, auto: true, history: history.slice() });
      if (!live(run) || replied === null) return receipt;
      run.stage = 'ack'; history.push({ ...player, text: choice.reply });
      const acknowledged = await DLG.say({ ...common, ...manager, text: t('Ок'), auto: true, history: history.slice(),
        onShow: () => { if (run.embedded) HUDFONE.recordMessage({ ...manager, text: t('Ок'), role: t('управляющая') }); } });
      if (!live(run) || acknowledged === null) return receipt;
      run.stage = 'effects';
      if (run.embedded) {
        const text = effects.map(effect => effect.text).join(' · ');
        effects.forEach(effect => refresh(run, effect.kind));
        history.push({ ...manager, text: t('Ок') });
        HUDFONE.recordMessage({ ...manager, text, system: true });
        await DLG.say({ ...common, ...manager, text, auto: true, history: history.slice() });
        return receipt;
      }
      const origin = document.querySelector('#dlg .dlg-bubble')?.getBoundingClientRect();
      for (const effect of effects) if (!await flight(run, effect, origin)) break;
      return receipt;
    } catch (error) {
      console.warn('[mealchat]', error);
      return receipt;
    } finally {
      last = { id: run.id, selected: run.receipt?.id || null, committed: run.committed, cancelled: run.cancelled, receipt };
      const resume = (live(run) || run.resumeOnClose) && run.id === serial && api.valid();
      cleanup(run);
      if (resume && !run.resumed) { run.resumed = true; api.next?.(); }
    }
  })();
  return run.promise;
}

export const DEBUG = { get active () { return active ? { id: active.id, stage: active.stage, committed: active.committed, selected: active.receipt?.id || null } : null; }, get last () { return last; } };
