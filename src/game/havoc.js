/* Внутренние счётчики разрушений за смену для ежедневных заданий (daily.js).
   Понятнее №15а: реплики-перечисления и их таймеры удалены; сами числа и порог удара прежние.
   people / stop приходят из состояния игры, car — помятая машина один раз за смену,
   bench / post / fence / bin — разрушенные предметы, other — остальная мелочь. */
export const HV = { CAR_HIT: 8 };
const KINDS = ['people', 'car', 'stop', 'bench', 'post', 'fence', 'bin'];
const OF = { bench: 'bench', lamp: 'post', light: 'post', sign: 'post', fence: 'fence', bigfence: 'fence', bin: 'bin' };
let A = { S: null };
const H = { n: {}, other: 0, shift: 0 };
export function init (api) { A = { ...A, ...api }; reset(); }
export function reset () {
  for (const k of KINDS) H.n[k] = 0; H.other = 0; H.shift++;
  Math.random();   // прежний reset тянул срок реплики; сохраняем жребий, чтобы не сдвинуть позднюю сборку города
}
export function counts () {
  const S = A.S || {};
  return { ...H.n, people: (S.people || 0) + (S.scoots || 0), stop: S.stops || 0, other: H.other };
}
export function smash (kind) { const k = OF[kind]; if (k) H.n[k]++; else H.other++; }
export function carHit (car, hit) {
  if (!car || !(hit > HV.CAR_HIT) || car.havShift === H.shift) return;
  car.havShift = H.shift; H.n.car++;
}
export const DEBUG = { counts, H, HV };
