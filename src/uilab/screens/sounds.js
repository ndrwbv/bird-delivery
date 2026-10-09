/* Песочница интерфейса: пульт «все звуки» (М2а, docs/SOUNDS.md «Генерация»). Список имён и подписи —
   tools/sfx-list.json, какие файлы лежат — sfx/index.json (тот же, что читает игра; в dev — свежий
   на каждый показ: положил / удалил файл — «показать» заново). Кнопка имени — случайный вариант,
   цифры — каждый вариант по отдельности. Нет файла — имя серое (в игре звучит синтез).
   Играет обычным <audio>, без шин игры и без поправок громкости из sfx.js — чтобы слышать сам файл.
   Тексты — без перевода (песочница в сборки игры не попадает). */
import LIST from '../../../tools/sfx-list.json';

export default function soundScreens (ctx) {
  const { $ } = ctx;
  return [{
    id: 'sounds', group: 'Звуки', name: 'все звуки',
    note: 'Пульт: каждое имя из docs/SOUNDS.md, кнопка — случайный вариант, цифры — каждый вариант. Серое — файла нет (в игре синтез). Лишний вариант — удалить файл из public/sfx и «показать» заново.',
    knobs: [
      { k: 'vol', label: 'громкость, %', type: 'num', def: 70, min: 0, max: 100, step: 5 },
      { k: 'only', label: 'показать', type: 'sel', def: 'all', opts: [['all', 'все'], ['have', 'только с файлами'], ['miss', 'только без файлов']] },
    ],
    async show (o, tok) {
      let idx = {};
      try { const r = await fetch('sfx/index.json', { cache: 'no-cache' }); if (r.ok) idx = await r.json(); } catch (e) { /* списка нет — всё серое */ }
      if (tok.dead) return;
      const vol = Math.max(0, Math.min(1, (+o.vol || 0) / 100));
      let cur = null;
      const play = f => {
        if (cur) { cur.pause(); cur = null; }
        const a = new Audio('sfx/' + encodeURIComponent(f));
        a.volume = vol;
        a.play().then(() => ctx.log('▶ ' + f)).catch(e => ctx.log(f + ': ' + (e && e.message || e), 'err'));
        cur = a;
      };

      const box = document.createElement('div');
      box.id = 'ul-sounds';
      box.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:16px 20px 40px;background:rgba(20,18,30,.92);color:#f3ead7;font:14px/1.35 system-ui,sans-serif;z-index:50';
      const listed = new Set(LIST.sounds.map(s => s.name));
      const stray = Object.keys(idx).filter(n => !listed.has(n));
      const files = Object.values(idx).reduce((n, a) => n + a.length, 0);
      const have = LIST.sounds.filter(s => idx[s.name]).length;
      const head = document.createElement('p');
      head.style.cssText = 'margin:0 0 12px;opacity:.85';
      head.textContent = `Файлов в public/sfx: ${files}. Имён с файлами: ${have} из ${LIST.sounds.length}.` + (stray.length ? ` Неизвестные имена (игра не возьмёт): ${stray.join(', ')}.` : '');
      box.appendChild(head);

      const groups = new Map();
      for (const s of LIST.sounds) {
        const got = idx[s.name] || [];
        if ((o.only === 'have' && !got.length) || (o.only === 'miss' && got.length)) continue;
        if (!groups.has(s.group)) groups.set(s.group, []);
        groups.get(s.group).push([s, got]);
      }
      const btn = (label, title, on, dim) => {
        const b = document.createElement('button');
        b.textContent = label; b.title = title;
        b.style.cssText = 'margin:0 4px 0 0;padding:3px 8px;border:1px solid #6b6080;border-radius:4px;background:' + (dim ? 'transparent;color:#8a8298;cursor:default' : '#3a3150;color:#fff4d8;cursor:pointer') + ';font:inherit';
        if (on) b.onclick = on; else b.disabled = true;
        return b;
      };
      for (const [g, rows] of groups) {
        const h = document.createElement('h3');
        h.textContent = g;
        h.style.cssText = 'margin:14px 0 6px;font-size:15px;color:#ffd85e';
        box.appendChild(h);
        for (const [s, got] of rows) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;flex-wrap:wrap';
          row.appendChild(btn(s.name, s.prompt, got.length ? () => play(got[Math.floor(Math.random() * got.length)]) : null, !got.length));
          got.forEach((f, i) => row.appendChild(btn(String(i + 1), f, () => play(f))));
          const ru = document.createElement('span');
          ru.textContent = s.ru + (got.length ? '' : ' — синтез') + (s.loop ? ' (петля)' : '');
          ru.style.cssText = 'opacity:' + (got.length ? '.85' : '.5');
          row.appendChild(ru);
          box.appendChild(row);
        }
      }
      ($('game') || document.body).appendChild(box);
      ctx.cleanup = () => { if (cur) cur.pause(); box.remove(); };
    },
  }];
}
