/* Время суток словами — для реплик, где называют время (обед, полночь, «утро уже»): по часам мира, которые
   игрок видит на приборке и на небе, а не по расписанию смены (в круглосуточной пиццерии «обед» по расписанию
   может выпасть на 4 утра, а конец смены — на 13:00). Правила словами — docs/CAREER.md «Слова про время».

     part(h)           — 'morning' (5—11) | 'day' (11—17) | 'evening' (17—22) | 'night' (22—5); h — часы, любые (по модулю 24)
     nearMidnight(h)   — сейчас «полночь» на часах: 23:30—00:45
     fresh(key, list)  — случайная строка списка, но не та же, что в прошлый раз для этого key
     setClock(fn)      — откуда брать часы мира (career.js init: CAREERM.hour); now() — часы или null (нет карьеры)
     nowPart()         — part(now()) или '' (часов нет — фильтровать по времени нечего)
*/
let CLOCK = null;
export function setClock (fn) { CLOCK = typeof fn === 'function' ? fn : null; }
export function now () { try { const h = CLOCK ? CLOCK() : null; return Number.isFinite(h) ? h : null; } catch (e) { return null; } }
export function nowPart () { const h = now(); return h == null ? '' : part(h); }
export const PARTS = { morning: 5, day: 11, evening: 17, night: 22 };

export function part (h) {
  const d = ((Number(h) % 24) + 24) % 24;
  return d >= PARTS.night || d < PARTS.morning ? 'night' : d >= PARTS.evening ? 'evening' : d >= PARTS.day ? 'day' : 'morning';
}

export function nearMidnight (h) {
  const d = ((Number(h) % 24) + 24) % 24;
  return d >= 23.5 || d < 0.75;
}

const LAST = new Map();
export function fresh (key, list) {
  if (!list || !list.length) return '';
  if (list.length === 1) return list[0];
  const prev = LAST.get(key);
  const pool = list.filter(s => s !== prev);
  const s = pool[Math.floor(Math.random() * pool.length)];
  LAST.set(key, s);
  return s;
}
