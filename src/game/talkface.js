/* Говорящий портрет: пока реплика печатается или сообщение только что пришло, рот на картинке-лице
   (people.js faceDataURL) открывается и закрывается — три кадра: закрыт / приоткрыт / открыт.
   Кадры рисуются один раз на человека, размер и выражение (кэш портретов people.js), дальше только
   меняется src картинки раз в 0,08—0,12 с; иногда рот закрыт подольше — вдох. Выражение (mood) —
   то же: рот говорит поверх него (злой кричит, весёлый смеётся, испуганный цедит сквозь зубы).
   Договорил — рот закрыт. «Меньше движения» (prefers-reduced-motion или body.calm-fx) — рот не двигается.

     TF.bind(img, person, size, mood)   — картинка показывает лицо (рот закрыт) и умеет говорить; → true / false (нет человека)
     TF.talk(img, sec)                  — говорит sec секунд (0 / нет — пока не скажут stop)
     TF.stop(img)                       — замолчал: рот закрыт
     TF.talkTime(text)                  — сколько «говорит» пришедшее сразу целиком сообщение, с
     TF.nextMouth(m)                    — следующий кадр рта и сколько его держать → [кадр, с] (и 3D-лица actorlife.js)
   Где: диалоги и катсцены, реплики на ходу (dialog.js), чат Толика (chat.js), его сообщение в конце смены
   (shiftend.js) и на празднике «весь город» (cityopen.js), Дядя Женя в гараже (garagetour.js),
   директор во вступлении (intro.js). */
import { faceDataURL } from './people.js';

export const TALK = {
  STEP: [0.08, 0.12],      // кадр рта держится, с
  BREATH: 0.12,            // доля «вдохов»: рот закрыт подольше
  BREATH_T: [0.22, 0.4],   // вдох, с
  CPS: 14,                 // сообщение пришло целиком: говорит, как будто читает вслух — букв в секунду
  MIN: 0.7, MAX: 2.6,      // … но не меньше и не дольше, с
};
const rnd = (a, b) => a + Math.random() * (b - a);

export function nextMouth (m) {
  const st = rnd(TALK.STEP[0], TALK.STEP[1]);
  if (m === 2) return [Math.random() < 0.7 ? 1 : 0, st];
  if (m === 1) return Math.random() < TALK.BREATH ? [0, rnd(TALK.BREATH_T[0], TALK.BREATH_T[1])] : [Math.random() < 0.6 ? 2 : 0, st];
  return [Math.random() < 0.6 ? 1 : 2, st];
}
export const talkTime = text => Math.max(TALK.MIN, Math.min(TALK.MAX, String(text == null ? '' : text).length / TALK.CPS));
export const calm = () => {
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) { /* — */ }
  return !!(document.body && document.body.classList.contains('calm-fx'));
};

const B = new WeakMap();           // img → { person, size, mood, F: [закрыт, приоткрыт, открыт], m, to, end }
const frame = (b, k) => (b.F[k] || (b.F[k] = faceDataURL(b.person, b.size, b.mood, k)));

export function bind (img, person, size = 128, mood = '') {
  if (!img) return false;
  stop(img);
  if (!person) { B.delete(img); return false; }
  const b = { person, size, mood: mood || '', F: [], m: 0, to: 0, end: 0 };
  B.set(img, b);
  img.src = frame(b, 0);
  return true;
}

export function talk (img, sec = 0) {
  const b = img && B.get(img);
  if (!b) return;
  clearTimeout(b.to); b.to = 0;
  if (calm()) { b.m = 0; img.src = frame(b, 0); return; }
  b.end = sec > 0 ? performance.now() + sec * 1000 : 0;
  frame(b, 1); frame(b, 2);        // оба кадра — сразу, чтобы первый «открыл рот» не ждал рисования
  const tick = () => {
    b.to = 0;
    if (!img.isConnected || (b.end && performance.now() >= b.end)) { b.m = 0; img.src = frame(b, 0); return; }
    const [m, hold] = nextMouth(b.m);
    b.m = m; img.src = frame(b, m);
    b.to = setTimeout(tick, hold * 1000);
  };
  tick();
}

export function stop (img) {
  const b = img && B.get(img);
  if (!b) return;
  clearTimeout(b.to); b.to = 0; b.end = 0;
  if (b.m !== 0) { b.m = 0; img.src = frame(b, 0); }
}

/* для ?debug: идёт ли речь у картинки и какой кадр рта сейчас; sheet — все кадры рта по выражениям одной картинкой
   (строки — спокойно, happy, angry, sad, scared, surprised; столбцы — закрыт, приоткрыт, открыт) */
const MOODS = ['', 'happy', 'angry', 'sad', 'scared', 'surprised'];
async function sheet (person, size = 96) {
  const c = document.createElement('canvas');
  c.width = size * 3; c.height = size * MOODS.length;
  const o = c.getContext('2d');
  for (let r = 0; r < MOODS.length; r++) for (let k = 0; k < 3; k++) {
    const im = new Image(); im.src = faceDataURL(person, size, MOODS[r], k);
    await im.decode();
    o.drawImage(im, k * size, r * size);
  }
  return c.toDataURL('image/png');
}
export const DEBUG = { TALK, sheet, state: img => { const b = img && B.get(img); return b ? { mouth: b.m, talking: !!b.to, frames: b.F.filter(Boolean).length } : null; } };
