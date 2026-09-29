/* Диагностика геймпада (pad.html): что отдаёт браузер (id, mapping, оси, кнопки) и как это
   разобрал src/input/gamepad.js. Нужна, когда на Deck «не рулит» или газ уехал не на тот курок:
   сразу видно, стандартная раскладка или «сырая». Открыть: bird-pizza.sh --page=pad.html,
   в браузере — /pad.html при `npm run dev:steam`. */
import { pollPad, rumble } from './gamepad.js';
import { makePadMenu } from './padmenu.js';
import './padmenu.css';

const out = document.getElementById('out');
const logBox = document.getElementById('log');
const log = [];
const menu = makePadMenu();

const bar = (v, lo = -1) => `<span class="bar"><i style="width:${Math.round((v - lo) / (1 - lo) * 100)}%"></i></span> ${v.toFixed(2)}`;
const flag = (name, on) => `<span class="${on ? 'on' : 'dim'}">${name}</span>`;
const ONESHOT = ['pause', 'map', 'accept', 'choice1', 'choice2', 'choice3', 'sound', 'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuOk', 'menuBack'];

document.getElementById('rumble').addEventListener('click', () => {
  if (!rumble(1, 400)) { log.unshift('отдача: не поддерживается'); }
});

function frame () {
  requestAnimationFrame(frame);
  const p = pollPad();

  const pads = Array.prototype.filter.call(navigator.getGamepads ? navigator.getGamepads() : [], g => g && g.connected);
  let html = '';
  // окно без фокуса или страница не «безопасная» — Chromium геймпад не отдаёт вовсе
  html += `<p>окно: ${flag('фокус', document.hasFocus())} · ${flag('видно', document.visibilityState === 'visible')} · ${flag('secure', window.isSecureContext)} · getGamepads: ${navigator.getGamepads ? 'есть' : 'НЕТ'} · всего слотов ${(navigator.getGamepads ? navigator.getGamepads() : []).length}</p>`;
  if (!pads.length) html += '<p class="dim">Контроллеров не видно. Нажми любую кнопку — браузер показывает геймпад только после нажатия.</p>';
  for (const g of pads) {
    const axes = Array.prototype.map.call(g.axes, (v, i) => `<tr><td>ось ${i}</td><td>${bar(v)}</td></tr>`).join('');
    const btns = Array.prototype.map.call(g.buttons, (b, i) => b.pressed || b.value > 0.1
      ? `<span class="on">${i}${b.value > 0 && b.value < 1 ? `(${b.value.toFixed(2)})` : ''}</span>` : `<span class="dim">${i}</span>`).join(' ');
    html += `<h2>#${g.index} ${g.id}${g.index === p.index ? ' <span class="on">← активный</span>' : ''}</h2>
      <p>mapping: <b>${g.mapping || '(пусто — «сырая» раскладка)'}</b> · осей ${g.axes.length} · кнопок ${g.buttons.length}
       · отдача: ${g.vibrationActuator ? 'есть' : 'нет'}</p>
      <table>${axes}</table><p>кнопки: ${btns}</p>`;
  }
  html += `<h2>Как разобрала игра</h2>
    <p>раскладка: <b>${p.connected ? (p.raw ? 'сырая' : p.mapping || '—') : '—'}</b> · ${flag('active', p.active)}</p>
    <table>
      <tr><td>руль</td><td>${bar(p.steer)}</td></tr>
      <tr><td>газ RT</td><td>${bar(p.gas, 0)}</td></tr>
      <tr><td>тормоз LT</td><td>${bar(p.brake, 0)}</td></tr>
      <tr><td>держит</td><td>${flag('ручник B', p.hand)} · ${flag('нитро X/RB', p.nitro)}</td></tr>
      <tr><td>правый стик</td><td>x ${p.rx.toFixed(2)} · y ${p.ry.toFixed(2)}</td></tr>
    </table>`;
  out.innerHTML = html;

  for (const k of ONESHOT) if (p[k]) { log.unshift(k); if (log.length > 14) log.pop(); }
  logBox.textContent = log.join('  ·  ') || '—';
  menu(p, document.getElementById('nav'));
}
frame();
