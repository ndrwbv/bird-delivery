import Platform from '../platform/index.js';
import { t } from '../i18n/index.js';

const BONUS = 500;

export function addShiftReward ({ over, eligible, grant }) {
  over.querySelector('#ov-vk-reward')?.remove();
  if (!eligible || !Platform.features.ads) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'ov-vk-reward';
  button.className = 'pp-note';
  button.textContent = t('Смотреть рекламу · +{amount} игровых ₽', { amount: BONUS });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = t('Загружаем рекламу…');
    const watched = await Platform.showRewarded();
    if (watched) {
      grant(BONUS);
      button.textContent = t('+{amount} игровых ₽ в копилке', { amount: BONUS });
    } else {
      button.disabled = false;
      button.textContent = t('Реклама недоступна · повторить');
    }
  });
  over.querySelector('#ov-menu').before(button);
}
