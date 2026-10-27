/* Старое вступление со Стёпой удалено. Совместимый интерфейс для игрового цикла. */
export function init () {}
export const on = () => false;
export const wants = () => false;
export function play () { return false; }
export function frame () { return false; }
export function skip () {}
export function next () {}
export const DEBUG = { on, wants };
