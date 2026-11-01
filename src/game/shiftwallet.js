/* Только представление уже записанных денег. Никаких начислений и записей в сохранение. */
const number = value => Number.isFinite(+value) ? Math.round(+value) : 0;
export function walletSummary (before, gain, after) {
  before = number(before); gain = number(gain); after = number(after);
  return { before, gain, after, other: after - before - gain, adjusted: after - gain, delta: after - before };
}
