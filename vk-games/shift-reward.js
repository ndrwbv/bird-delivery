import Platform from '../platform/index.js';
import { t } from '../i18n/index.js';

const BONUS = 500;

export function addShiftReward ({ over, eligible, money, grant }) {
  over.querySelector('#ov-vk-reward')?.remove();
  if (!eligible || !Platform.features.ads) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'ov-vk-reward';
  button.className = 'pp-note';
  const label = t('Реклама за бонус {money}', { money: money(BONUS) });
  button.textContent = label;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = t('Загружаем рекламу…');
    const watched = await Platform.showRewarded();
    if (watched) {
      grant(BONUS);
      button.textContent = t('Бонус получен');
    } else {
      button.disabled = false;
      button.textContent = t('Реклама недоступна · повторить');
    }
  });
  over.querySelector('#ov-menu').before(button);
}
