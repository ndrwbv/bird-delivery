/* Пример мини-игры для песочницы интерфейса (заготовка блока 13, src/uilab/minigames.js):
   домофон-заглушка — набери номер квартиры из накладной. Не игра, а образец формата:
   export default { id, name, note, knobs, mount(root, o, api) → убрать }. */
import './example.css';

export default {
  id: 'example', name: 'пример: домофон (заглушка)',
  note: 'Образец мини-игры: набрать номер квартиры. Новая мини-игра — файл в src/game/minigames/ с тем же форматом — сама появится здесь.',
  knobs: [
    { k: 'flat', label: 'квартира', type: 'num', def: 47, min: 1, max: 999, step: 1 },
  ],
  mount (root, o, api) {
    const { t } = api, flat = String(Math.max(1, Math.round(+o.flat || 1)));
    let typed = '';
    const box = document.createElement('div');
    box.className = 'mgx';
    box.innerHTML = '<b class="mgx-t"></b><div class="mgx-q"></div><div class="mgx-scr">—</div><div class="mgx-keys"></div>';
    box.querySelector('.mgx-t').textContent = t('домофон');
    box.querySelector('.mgx-q').textContent = t('набери квартиру {n}', { n: flat });
    const scr = box.querySelector('.mgx-scr'), keys = box.querySelector('.mgx-keys');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '🔔']) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = k;
      b.addEventListener('click', () => {
        if (k === 'C') typed = '';
        else if (k === '🔔') {
          const ok = typed === flat;
          scr.textContent = ok ? t('открыто!') : t('не та квартира');
          box.classList.toggle('ok', ok); box.classList.toggle('bad', !ok);
          api.done({ ok, typed });
          typed = '';
          return;
        } else if (typed.length < 4) typed += k;
        box.classList.remove('ok', 'bad');
        scr.textContent = typed || '—';
      });
      keys.appendChild(b);
    }
    root.appendChild(box);
    return () => box.remove();
  },
};
