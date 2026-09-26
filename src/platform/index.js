/* Выбор платформы при сборке. Vite подставляет MODE строкой, лишние ветки
   выкидываются — в бандл попадает только нужный модуль.
   steam.js — через import.meta.glob: пока файла нет, dev-сервер не падает
   на «Failed to resolve import» (steam-сборка без файла упадёт с понятной ошибкой).
   Использование:  import Platform from './platform/index.js'; await Platform.init({ langs }); */
const mod = import.meta.env.MODE === 'yandex' ? await import('./yandex.js')
  : import.meta.env.MODE === 'steam' ? await (import.meta.glob('./steam.js')['./steam.js'] || (() => { throw new Error('нет src/platform/steam.js'); }))()
    : await import('./web.js');

const Platform = mod.default;
export default Platform;
export { Platform };
export { SUPPORTED_LANGS, mapLang } from './common.js';
