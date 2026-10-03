/* Мини-игры у клиента (IDEAS.md, блок 13) — заготовка: каждая мини-игра сама получает кнопку в
   песочнице интерфейса (раздел «Мини-игры»), ничего регистрировать руками не надо.

   Где лежат: src/game/minigames/<имя>.js (настоящие, для игры) и src/uilab/minigames/<имя>.js
   (примеры для песочницы). Модуль отдаёт export default — описание мини-игры:
     {
       id: 'intercom', name: 'домофон', note: 'что проверять',
       knobs: [ручки, как у экранов песочницы: { k, label, type: 'num'|'bool'|'sel'|'text', def, … }],
       mount (root, o, api) → () => {}   — нарисовать игру в root (на весь экран поверх игры),
                                           o — значения ручек; вернуть функцию «убрать за собой»
     }
   api: { t, tn, money, ADULT, log(текст), done(итог) — игра кончилась (итог — в журнал панели),
          makePerson, faceDataURL — лица клиентов, как в игре }.
   Строки — через t (ru в коде, en — src/i18n/en.json). Числа мини-игры — в её модуле или econ.js. */

const MODS = {
  ...import.meta.glob('../game/minigames/*.js', { eager: true }),
  ...import.meta.glob('./minigames/*.js', { eager: true }),
};

export const MINIGAMES = [];
/* зарегистрировать руками (если мини-игра лежит не в этих папках) — до загрузки песочницы */
export function register (mg) {
  if (!mg || !mg.id || typeof mg.mount !== 'function' || MINIGAMES.some(m => m.id === mg.id)) return false;
  MINIGAMES.push(mg);
  return true;
}
for (const m of Object.values(MODS)) register(m && (m.default || m.MINIGAME));

/* каждая мини-игра → экран песочницы в группе «Мини-игры» */
export function minigameScreens (ctx) {
  const { t, tn, money, ADULT, log, makePerson, faceDataURL, $ } = ctx;
  return MINIGAMES.map(mg => ({
    id: 'mg:' + mg.id, group: 'Мини-игры', name: mg.name || mg.id, note: mg.note || '',
    knobs: mg.knobs || [],
    async show (o, tok) {
      let host = $('ul-mg');
      if (!host) { host = document.createElement('div'); host.id = 'ul-mg'; ($('game') || document.body).appendChild(host); }
      host.replaceChildren();
      host.hidden = false;
      const api = { t, tn, money, ADULT, makePerson, faceDataURL, log: s => log(mg.id + ': ' + s), done: r => { if (!tok.dead) log(mg.id + ' — итог: ' + JSON.stringify(r)); } };
      const off = mg.mount(host, o, api);
      ctx.cleanup = () => { if (typeof off === 'function') off(); host.replaceChildren(); host.hidden = true; };
    },
  }));
}
