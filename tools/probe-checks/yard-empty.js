/* Дворы без пустых мест (yardfill.js; для npm run check, id yardempty; можно и так: npm run probe -- --eval=tools/probe-checks/yard-empty.js).
   Двор — газон ближе 50 м к двери многоэтажки. Сетка 2 м по всем дворам города: занято (дом, дорога с тротуаром, проезд,
   дорожка, площадка, стоянка, карман, вода, лес, парк, у двери подъезда 7 м, твёрдое, мелочь, лавочка, вещь лабиринта и
   двора, дерево — по кроне) или газон. Пустой кусок — круг R = 4,5 м (Ø 9 м, ~64 м²) газона без ничего; соседние — один кусок.
     • pieces — пустых кусков сейчас (с ?nofill — «было»: 2 558 на 23.10.2026), m2 — сколько газона под серединами таких кругов;
     • bad — вещь заполнения (дерево, куст, площадка, сушилка, будка, выбивалка, песок, ракушки) на мощёном или в доме.
   ok — пустых 0 и bad 0; пустых до 20 — предупреждение. --q=yeall — список всех кусков. */
const Q = new URLSearchParams(location.search);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 90000);
const F = d.YFILL;
if (!F) return { err: 'нет __dlv.YFILL' };
const r = F.scan({ n: 10, all: Q.has('yeall') });
let n = 0, bad = 0;
const by = {}, sample = [];
for (const a of F.NEAR.values()) for (let q = 0; q < a.length; q += 6) {
  const k = ['tree', 'shrub', 'play', 'dryer', 'booth', 'beater', 'sand', 'garage'][a[q]], x = a[q + 1], z = a[q + 2];
  n++;
  const pv = d.PAVE.onPave(x, z, 0.3), wall = d.inWall(x, z, 0.3);
  if (pv || wall) { bad++; by[k] = (by[k] || 0) + 1; if (sample.length < 5) sample.push([k, Math.round(x), Math.round(z), pv || 'дом']); }
}
return { ok: r.pieces === 0 && bad === 0, pieces: r.pieces, m2: r.m2, list: r.list, ms: r.ms, things: n, placed: F.ST.placed, trees: F.ST.trees, bushes: F.ST.bushes, buildMs: F.ST.ms, bad, by, sample };
