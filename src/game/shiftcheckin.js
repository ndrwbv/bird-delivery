// Перед первым заказом курьер отмечается в общем чате. Мир ждёт окончания переписки.
import { t } from '../i18n/index.js';
import * as PHONE from './hudphone.js';

const FADE_AT = 2.12, FINISH_AT = 2.45;
let current = null, curtain = null;
export const active = () => !!current;

function closeChat () {
  current = null;
  PHONE.endShiftChat();
  document.body.classList.remove('shift-check-in');
}

export function cancel () {
  if (current) closeChat();
  curtain?.remove();
  curtain = null;
}

export function open ({ teammates, courier, manager, done }) {
  cancel();
  const [first, second] = teammates;
  const beats = [];
  if (first) {
    beats.push(
      [0.14, () => PHONE.recordMessage({ ...first, text: t('Кто кружку на крыше машины оставил?'), earlier: true })],
      [0.48, () => PHONE.recordMessage({ ...(second || manager), text: second ? t('Так вот почему кофе не было.') : t('Снимите, пока с ней не уехали.'), earlier: true })],
    );
  }
  beats.push(
    [0.82, () => PHONE.recordMessage({ ...courier, text: t('Выхожу сегодня на смену'), outgoing: true })],
    [1.12, () => PHONE.shiftTyping(manager)],
    [1.65, () => { PHONE.shiftTyping(); PHONE.recordMessage({ ...manager, text: t('Ок') }); }],
  );
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (motion) {
    curtain = document.createElement('div');
    curtain.className = 'shift-check-in-fade';
    curtain.setAttribute('aria-hidden', 'true');
    document.body.append(curtain);
  }
  current = { elapsed: 0, next: 0, beats, done };
  document.body.classList.add('shift-check-in');
  PHONE.beginShiftChat();
}

export function step (dt) {
  const scene = current;
  if (!scene) return;
  scene.elapsed += dt;
  while (scene.next < scene.beats.length && scene.elapsed >= scene.beats[scene.next][0]) scene.beats[scene.next++][1]();
  if (curtain && scene.elapsed >= FADE_AT) {
    const progress = Math.min(1, (scene.elapsed - FADE_AT) / (FINISH_AT - FADE_AT));
    curtain.style.opacity = progress * progress;
  }
  if (scene.elapsed < FINISH_AT) return;
  const fade = curtain;
  closeChat();
  scene.done();
  if (fade) requestAnimationFrame(() => {
    if (curtain !== fade) return;
    fade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 330, easing: 'ease-out' }).finished.then(() => {
      fade.remove();
      if (curtain === fade) curtain = null;
    }, () => {});
  });
}
