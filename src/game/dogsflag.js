/* Собаки в игре выключены (автор 24.10.2026: «убрать собак»). Код не удалён — адрес с ?dogs возвращает их.
   Читают: doorcast.js (собака у ног), yardlife.js / life.js (гуляющие), wastelands.js (пустыри), ambience.js (лай вдали),
   smalltalk-lines.js, intercom.js, oddfolk.js, orders.config.js (реплики и поручение про собаку). Коты остаются. */
export const DOGS_ON = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dogs');
