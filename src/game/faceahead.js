/* Портреты заранее (11.10.2026). Портрет нового лица (people.js faceDataURL) рисуется в тот кадр, где его впервые
   показали: реплика в диалоге (dialog.js, 256 px) — на «Деке» 1,3—2,5 мс, под нагрузкой до 6—8. Здесь лица, которые точно
   скоро понадобятся, заказываются заранее — people.js faceSoon дорисовывает их в спокойные кадры, по портрету:
   - заказ принят (game.js newOrder) — получатели (S.order.stops[*].persons): диалог у двери 256 px без выражения (просьба
     клиента, флирт) и разговор у двери 128 px («ok», smalltalk.js), у каждого — три кадра рта (talkface.js);
   - загрузка (game.js, кусок 'faces') — Толик (чат 48, реплика на ходу и праздник 128, конец смены 96, обед 256), курьер
     катсцен и герои сюжетов и встреч у двери: первая реплика каждой главы (256, её выражение) — story.js faceAhead;
   - катсцена началась (story.js play) — все реплики главы с их выражениями: пока герой выходит из подъезда, они готовы.
   ?noahead — без этого (сравнить). Счётчики — __dlv.FAHEAD. */
import { faceSoon } from './people.js';
import { MOB } from './mobile.js';

export const AHEAD = {
  CLIENT: [[256, ''], [128, 'ok']],             // [размер, выражение] — у получателя заказа
  BOSS: [[48, ''], [128, ''], [96, ''], [256, '']],   // Толик
  LINE: 256,                                    // реплика катсцены (dialog.js say)
  TALK: [0, 1, 2],                              // кадры рта: закрыт (как у выражения), приоткрыт, открыт
};
const OFF = typeof location !== 'undefined' && /[?&]noahead\b/.test(location.search || '');
export const STATS = { orders: 0, faces: 0 };

function ask (p, size, mood) {
  if (OFF || !p) return;
  faceSoon(p, size, [mood || ''], AHEAD.TALK);
  STATS.faces += AHEAD.TALK.length;
}

/* заказ принят: лица получателей */
export function client (order) {
  if (!order || !order.stops) return;
  STATS.orders++;
  for (const st of order.stops) for (const p of st.persons || []) for (const [s, m] of AHEAD.CLIENT) ask(p, s, m);
}

/* Толик — при загрузке */
export function boss (p) { for (const [s, m] of AHEAD.BOSS) ask(p, s, m); }

/* реплики сценария (story.js: ['say' | 'ask', кто, текст, { emo }]); who(кто) → человек; first — только первая */
export function lines (script, who, first = false) {
  if (!Array.isArray(script)) return;
  if (first && MOB.on && !MOB.storyFaces) return;   // мобильный режим: при загрузке — только Толик (память, mobile.js); катсцена — как была
  const seen = new Set();
  for (const q of script) {
    if (!Array.isArray(q) || (q[0] !== 'say' && q[0] !== 'ask')) continue;
    let p = null;
    try { p = who(q[1]); } catch (e) { p = null; }
    const emo = (q[3] && q[3].emo) || '', k = q[1] + ':' + emo;
    if (p && !seen.has(k)) { seen.add(k); ask(p, AHEAD.LINE, emo); }
    if (first) return;
  }
}
