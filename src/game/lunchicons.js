/* Иконки вещей из игры — для окон выбора (обед, 11бр) и подсказок: банка нитро (синяя, с молнией, как на дороге),
   сердце, деньги. Рисованные от руки, тёмная обводка, как накладная. Строки SVG — вставляются в innerHTML. */
const INK = '#33210c';

/* синяя банка с белой окантовкой и жёлтой молнией — такая же лежит на дороге (game.js PICK_ONE.nos) */
export const NITRO_ICON =
  '<svg viewBox="0 0 64 80" aria-hidden="true">' +
  '<rect x="14" y="10" width="36" height="62" rx="6" fill="#1f5bff" stroke="' + INK + '" stroke-width="3"/>' +
  '<rect x="14" y="10" width="36" height="8" rx="3" fill="#0c2f9e"/><rect x="14" y="64" width="36" height="8" rx="3" fill="#0c2f9e"/>' +
  '<rect x="17" y="3" width="30" height="9" rx="3" fill="#c9d3e0" stroke="' + INK + '" stroke-width="3"/>' +
  '<polygon points="37,21 21,45 30,45 26,64 43,37 33,37" fill="#ffd91a" stroke="#fff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>' +
  '<polygon points="37,21 21,45 30,45 26,64 43,37 33,37" fill="#ffd91a" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/>' +
  '</svg>';

export const HEART_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true">' +
  '<path d="M32 57C9 41 5 26 11 18C17 10 28 12 32 20C36 12 47 10 53 18C59 26 55 41 32 57Z" fill="#e8323c" stroke="' + INK + '" stroke-width="3.5" stroke-linejoin="round"/>' +
  '<path d="M16 23C17 19 21 18 24 20" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>' +
  '</svg>';

export const MONEY_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true">' +
  '<circle cx="32" cy="34" r="25" fill="#ffc93c" stroke="' + INK + '" stroke-width="3.5"/>' +
  '<circle cx="32" cy="34" r="17.5" fill="none" stroke="#c98d12" stroke-width="2.5"/>' +
  '<text x="32" y="44" text-anchor="middle" font-size="28" font-weight="bold" font-family="Arial, sans-serif" fill="' + INK + '">₽</text>' +
  '</svg>';
