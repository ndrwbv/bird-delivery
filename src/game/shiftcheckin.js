// Перед первым заказом курьер отмечается в общем чате. Мир ждёт окончания реплики.
import { t } from '../i18n/index.js';
import * as PHONE from './hudphone.js';

const SEND_AT = 1.25, REPLY_AT = 2.45, FINISH_AT = 5.25;
let current = null;
export const active = () => !!current;

export function cancel () {
  if (!current) return;
  current = null;
  PHONE.endShiftChat();
  document.body.classList.remove('shift-check-in');
}

export function open ({ teammates, courier, manager, done }) {
  cancel();
  const [first, second] = teammates;
  const history = first ? [
    { ...first, text: t('Кто кружку на крыше машины оставил?'), earlier: true },
    { ...(second || manager), text: second ? t('Так вот почему кофе не было.') : t('Снимите, пока с ней не уехали.'), earlier: true },
  ] : [];
  current = { elapsed: 0, stage: 0, courier, manager, done };
  document.body.classList.add('shift-check-in');
  PHONE.beginShiftChat(history);
}

export function step (dt) {
  const scene = current;
  if (!scene) return;
  scene.elapsed += dt;
  if (scene.stage === 0 && scene.elapsed >= SEND_AT) {
    PHONE.recordMessage({ ...scene.courier, text: t('Выхожу сегодня на смену'), outgoing: true });
    scene.stage = 1;
  }
  if (scene.stage === 1 && scene.elapsed >= REPLY_AT) {
    PHONE.recordMessage({ ...scene.manager, text: t('Ок') });
    scene.stage = 2;
  }
  if (scene.elapsed >= FINISH_AT) {
    cancel();
    scene.done();
  }
}
