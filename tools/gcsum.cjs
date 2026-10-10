/* Паузы сборщика мусора и выделения памяти из вывода V8 (--trace-gc), 11.10.2026, docs/AGENTS.md «Частицы и мусор».
   npm run probe -- --eval=tools/probe-checks/frametail.js --jsflags="--trace-gc" --cpu=3 --size=deck --max=0 > out.txt 2>&1
   node tools/gcsum.cjs out.txt   — окно замера берёт из ответа frametail.js (поле win: [t0, t1], мс от начала страницы);
   без него — весь вывод. Isolate — тот, у кого больше всего сборок в окне (страница игры).
   Печатает: секунд, выделено МБ/с (сумма «до сборки» минус «после прошлой»), сборок малых (Scavenge / Minor) и больших
   (Mark-Compact), пауз мс всего, мс/с, самая долгая, сколько пауз > 1 / 2 / 5 мс. */
const fs = require('fs');
const txt = fs.readFileSync(process.argv[2], 'utf8');
let win = null;
for (const line of txt.split('\n')) { if (line[0] !== '{') continue; try { const j = JSON.parse(line); if (j.win) win = j.win; } catch (e) { /* не JSON */ } }
const RE = /^\[(\d+):(0x[0-9a-f]+)\]\s+(\d+) ms: (Scavenge|Mark-Compact|Minor Mark-Sweep|Mark-Sweep)[^\d]*([\d.]+) \(([\d.]+)\) -> ([\d.]+) \(([\d.]+)\) MB,.*?([\d.]+) \/ ([\d.]+) ms/;
const by = {};
for (const line of txt.split('\n')) {
  const m = RE.exec(line);
  if (!m) continue;
  const k = m[1] + ':' + m[2];
  (by[k] || (by[k] = [])).push({ t: +m[3], kind: m[4], a: +m[5], c: +m[7], p: +m[9] });
}
const inWin = e => !win || (e.t >= win[0] && e.t <= win[1]);
let best = null;
for (const k in by) { const n = by[k].filter(inWin).length; if (!best || n > best.n) best = { k, n }; }
if (!best) { console.log('сборок не найдено (нужен --jsflags="--trace-gc")'); process.exit(1); }
const all = by[best.k];
let alloc = 0, prev = null, pause = 0, max = 0, o1 = 0, o2 = 0, o5 = 0, minor = 0, major = 0, t0 = Infinity, t1 = -Infinity;
for (const e of all) {
  if (inWin(e)) {
    if (prev) alloc += Math.max(0, e.a - prev.c);
    pause += e.p; if (e.p > max) max = e.p;
    if (e.p > 1) o1++; if (e.p > 2) o2++; if (e.p > 5) o5++;
    if (e.kind === 'Mark-Compact' || e.kind === 'Mark-Sweep') major++; else minor++;
    t0 = Math.min(t0, e.t); t1 = Math.max(t1, e.t);
  }
  prev = e;
}
const secs = win ? (win[1] - win[0]) / 1000 : (t1 - t0) / 1000;
const r = x => Math.round(x * 100) / 100;
console.log(JSON.stringify({ isolate: best.k, secs: r(secs), 'МБ/с': r(alloc / secs), minor, major, 'пауз мс': r(pause), 'мс/с': r(pause / secs), 'макс мс': r(max), '>1': o1, '>2': o2, '>5': o5 }));
