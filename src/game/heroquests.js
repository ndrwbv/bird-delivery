/* Совместимый расчёт мини-игры «депнуть» после удаления старых героев.
   Теннис играют два безымянных соперника; ставка и выплаты остаются прежними. */
export const ANON = ['pl', 'pr'];
let last = null;
export function init () { /* персонажи больше не регистрируются */ }
export function reload () { last = null; }
export const match = () => ANON.slice();
export const tipFor = () => null;
export function roll ({ game, pick = null, base = 0.1, first = false }) {
  const chance = game === 'tennis' ? 0.5 : base;
  const win = !!first || Math.random() < chance;
  const champ = game === 'tennis' ? (win ? pick : ANON.find(id => id !== pick)) : null;
  last = { game, pick, win, chance, plain: chance, champ, tip: null, claim: null };
  return last;
}
export const verdict = () => [];
export const DEBUG = { get last () { return last; }, match, roll };
