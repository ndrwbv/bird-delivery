import { privacy, sectionsHTML, SUPPORT, terms, TERMS_VERSION } from './vk-legal.mjs';
import './vk-moderation.css';

const CONSENT = 'bird-vk:accepted';

function sheet (title, body, dismissible = false) {
  const dialog = document.createElement('dialog');
  dialog.className = 'vk-sheet';
  dialog.innerHTML = '<h1>' + title + '</h1>' + body;
  dialog.addEventListener('cancel', event => {
    if (!dismissible) event.preventDefault();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

const details = doc => '<details><summary>' + doc.title + '</summary>' + sectionsHTML(doc) + '</details>';
const support = '<a href="' + SUPPORT + '" target="_blank" rel="noopener noreferrer">Поддержка игры</a>';

export async function confirmConsent (scope, inVK) {
  try {
    const accepted = scope && JSON.parse(localStorage.getItem(CONSENT + ':' + scope));
    if (accepted?.version === TERMS_VERSION && Number.isSafeInteger(accepted.at)) return accepted;
  } catch { /* Storage may be blocked inside a frame. */ }
  return new Promise(resolve => {
    const dialog = sheet('Птица Пицца · 12+',
      (inVK ? '<p>Игра использует ID аккаунта ВКонтакте, чтобы узнавать ваш прогресс на разных устройствах.</p>' :
        '<p>При открытии игры по прямой ссылке прогресс сохраняется в этом браузере.</p>') +
      details(terms) + details(privacy) +
      '<label class="vk-consent"><input type="checkbox"> Принимаю пользовательское соглашение и политику конфиденциальности</label>' +
      '<button type="button" disabled>В игру</button>');
    const accept = dialog.querySelector('input');
    const button = dialog.querySelector('button');
    accept.onchange = () => { button.disabled = !accept.checked; };
    button.onclick = () => {
      const consent = { version: TERMS_VERSION, at: Date.now() };
      try { if (scope) localStorage.setItem(CONSENT + ':' + scope, JSON.stringify(consent)); } catch { /* One session still works. */ }
      dialog.close();
      resolve(consent);
    };
  });
}

export function chooseSave () {
  return new Promise(resolve => {
    const dialog = sheet('Какое сохранение оставить?',
      '<p>Прогресс менялся на двух устройствах. Выберите сохранение, с которого хотите продолжить.</p>' +
      '<div class="vk-sheet-actions"><button type="button">Сохранение из VK</button><button type="button">С этого устройства</button></div>');
    dialog.querySelectorAll('button').forEach((button, index) => {
      button.onclick = () => { dialog.close(); resolve(index === 1); };
    });
  });
}

export function loadingError (message) {
  window.dispatchEvent(new CustomEvent('bird-vk-loading-error', { detail: message }));
}

export function syncStatus (message) {
  let notice = document.getElementById('vk-sync-notice');
  if (!message) { notice?.remove(); return; }
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'vk-sync-notice';
    notice.role = 'status';
    document.body.append(notice);
  }
  notice.textContent = message;
}

export function showGuide (removeData) {
  const dialog = sheet('Как играть',
    '<p>Выйдите на смену, возьмите пиццу и следуйте маршруту на мини-карте. Вручите заказ у нужного подъезда, пока не кончилось время.</p>' +
    '<p>На ПК управляйте стрелками или WASD. На телефоне поверните экран боком и используйте руль и педали.</p>' +
    '<p>Сердца показывают состояние машины. Если она разбилась, можно начать новую смену. Деньги за доставки можно тратить в гараже.</p>' +
    details(terms) + details(privacy) + '<p>' + support + '</p>' +
    '<p class="vk-data-result" role="status"></p>' +
    '<div class="vk-sheet-actions"><button type="button" data-close>Закрыть</button>' +
    '<button type="button" data-delete>Удалить данные игры</button></div>', true);
  const result = dialog.querySelector('.vk-data-result');
  const close = dialog.querySelector('[data-close]');
  const remove = dialog.querySelector('[data-delete]');
  let confirmed = false;
  close.onclick = () => dialog.close();
  remove.onclick = async () => {
    if (!confirmed) {
      confirmed = true;
      result.textContent = 'Карьера и настройки будут удалены. Восстановить их не получится.';
      remove.textContent = 'Подтвердить удаление';
      return;
    }
    remove.disabled = true;
    result.textContent = 'Удаляем данные…';
    try {
      await removeData();
      location.reload();
    } catch {
      remove.disabled = false;
      result.textContent = 'Удаление не завершилось. Проверьте соединение и попробуйте ещё раз.';
    }
  };
  return dialog;
}
