/* Размер игрового кадра — физические пиксели, не CSS-пиксели × Retina.
   Индексы сохраняются в gfx с rv:2; новые варианты добавлять в конец. */
export const RESOLUTIONS = [[960,540],[1280,720],[1280,800],[1600,900],[1680,1050],[1920,1080],[1920,1200],[2560,1440],[2560,1600],0];
export const RESOLUTION_PRESETS = {pc:[1,3,5],deck:[0,1,2]};
export function migrateResolution(index,device) {
  const levels=RESOLUTION_PRESETS[device];
  return levels&&Number.isInteger(index)&&index>=0&&index<=3 ? levels[Math.min(index,2)] : null;
}
export function resolutionSize(choice,w,h,dpr=1) {
  if(Array.isArray(choice))return [...choice];
  // Прежние числовые значения оставлены для отложенного телефонного трека.
  const px=Math.max(1,Math.min(w,h)*dpr/(choice||Infinity));
  return [Math.max(200,Math.round(w*dpr/px)),Math.max(112,Math.round(h*dpr/px))];
}
