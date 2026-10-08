/* Заборчики и конструкции не на тротуарах и дорожках (для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/pave-props.js).
   «Где ходят» — pave.js (d.PAVE.onPave): полотно, тротуар улицы (2,75 м за полотном, у бульвара —
   за газоном), пешеходка, дворовые дорожки и аллеи. Проверяем:
     • сбиваемые заборы всего города (SMASH: fence, bigfence — дворовые, уличные, стройки, пустыри,
       чёрные заборы частных домов) — середина секции не на тротуаре, дорожке и аллее;
     • мелочь газона у каждого 15-го подъезда (lawnprops.js собирает клетки у камеры — соберём сами):
       оградки, выбивалки, бельевые столбы, песок, покрышки, ракушки — ни одна опора не на мощёном;
       заросли (бурьян 2 м, камыш, борщевик) — ни один стебель не на мощёном;
     • высокое во дворах: заросли, бельё, выбивалки, ракушки — не ближе 40 м к большой улице
       (класс ≤ 4), если между ними нет дома (lawnprops.js inYard);
     • стойки площадок-качалок (workout.js), лавочка Стёпы (stepabench.js), места змеев и дронов (kites.js). */
const P = d.PAVE.onPave;
const R = { n: {}, by: {}, sample: [], street: {}, thick: 0, perK: 0 };
const cnt = k => { R.n[k] = (R.n[k] || 0) + 1; };
const hit = (k, x, z, w) => { R.by[k] = (R.by[k] || 0) + 1; if (R.sample.length < 8) R.sample.push([k, Math.round(x), Math.round(z), w]); };
// 1) заборы
for (const it of (d.SMASH.list || d.SMASH)) {
  if ((it.kind !== 'fence' && it.kind !== 'bigfence') || it.rshop) continue;      // веранды конкурентов — на тротуаре нарочно
  const x = it.x ?? it.x0, z = it.z ?? it.z0;
  cnt(it.kind);
  const w = P(x, z, 0);
  if (w && w !== 'road') hit(it.kind + (it.cons ? '/стройка' : ''), x, z, w);
}
// 2) мелочь газона
const ents = d.CITY.entrances, done = new Set();
const THICK = ['tall', 'reed', 'hog'];
let thickN = 0, cells = 0;
for (let q = 0; q < ents.length; q += 15) {
  d.LAWN.warm(ents[q][0], ents[q][1], 45);
  for (const c of d.LAWN.CELLS.values()) {
    if (done.has(c)) continue;
    done.add(c); cells++;
    for (const it of c.items) {
      if (['rail', 'beater', 'line', 'garage', 'sand', 'tire'].indexOf(it.kind) < 0) continue;
      cnt(it.kind);
      for (const [px, pz] of it.pts) { const w = P(px, pz, 0); if (w) { hit(it.kind, px, pz, w); break; } }
      if (it.kind === 'line' || it.kind === 'garage' || it.kind === 'beater') {
        const nr = d.nearestRoad(it.x, it.z, 4, 2);
        if (nr && nr.d < d.LAWN.LAWN.YARD_R) R.street[it.kind] = (R.street[it.kind] || 0) + 1;   // ближе 40 м к большой улице — значит, за домом (для сведения)
      }
    }
    for (const k of THICK) {
      const L = c.L[k];
      if (!L || !L.m) continue;
      for (let i = 0; i < L.n; i++) {
        const x = L.m[i * 16 + 12], z = L.m[i * 16 + 14];
        thickN++;
        const w = P(x, z, 0);
        if (w) hit(k, x, z, w);
      }
    }
  }
}
// 3) площадки-качалки (workout.js): стойки турника и брусьев; лавочка Стёпы (stepabench.js); места змеев и дронов (kites.js)
for (const st of (d.WORK && d.WORK.SITES) || []) for (const [px, pz] of st.posts || []) { cnt('workout'); const w = P(px, pz, 0); if (w) hit('workout', px, pz, w); }
if (d.STEPAB && d.STEPAB.place) { const b = d.STEPAB.place; cnt('stepa-bench'); const w = P(b.ex, b.ez, 0); if (w) hit('stepa-bench', b.ex, b.ez, w); }
for (const sp of (d.KITES && d.KITES.SPOTS) || []) { cnt('kite'); const w = P(sp.x, sp.z, 0); if (w) hit('kite', sp.x, sp.z, w); }
R.thick = thickN; R.cells = cells; R.perK = cells ? +(thickN / cells).toFixed(2) : 0;
const bad = Object.values(R.by).reduce((a, b) => a + b, 0);
return { ok: bad === 0 && (R.n.fence || 0) > 0 && cells > 0, bad, ...R };
