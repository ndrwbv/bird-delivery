/* Портреты (people.js faceDataURL, 10.10.2026): одинаковы ли картинки и сколько стоят. В npm run check не входит.
   Запуск: npm run probe -- --eval=tools/probe-checks/portraits.js --cpu=3 --size=deck --max=0
   30 людей по зерну (часть — с особыми чертами: шрам, мешки, щетина, очки…) × 7 выражений × 3 кадра рта × размеры 128/64/48:
   хеш пикселей каждой картинки (декодированной, не строки PNG) — сравнить до/после правок (`all` — один хеш на всё,
   `bad` — отличия против --q=ref=<all из прошлого запуска>), время первого рисования (холодный кэш) и повторного.
   --q=pmood=1 — печатать и хеши по людям, --q=psize=1 — по размерам, --q=sizes=256,96 — другие размеры.
   --q=tags=20 — ещё и граффити (life.js makeTag): столько тегов на свободных стенах (через один — «старые», готовые),
   время makeTag целиком (рисует в кадре) и, через раз, — рисование заранее (drawTag, как в спокойные кадры) и makeTag
   с готовым холстом. */
const Q = new URLSearchParams(location.search);
await run(1);
const F = d.FACE.url, P = [];
const SPEC = [{ scar: 'cheek' }, { bags: true, bristle: true }, { scar: 'eye', eyes: 'bulge' }, { glasses: 'round' }, { glasses: 'sun', stubble: true }, { eyes: 'alien' }];
for (let i = 0; i < 30; i++) {
  const p = d.makePerson({ seed: 1000 + i * 7919, fem: i % 3 === 0 });
  if (i < SPEC.length) Object.assign(p.look, SPEC[i]);
  P.push(p);
}
const MOODS = ['', 'happy', 'angry', 'sad', 'scared', 'surprised', 'ok'], SIZES = (Q.get('sizes') || '128,64,48').split(',').map(Number);
const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
const fnv = (h, a) => { for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
const hashUrl = async u => {
  const im = new Image(); im.src = u; await im.decode();
  cv.width = im.width; cv.height = im.height; cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0);
  return fnv(fnv(2166136261, [im.width, im.height]), cx.getImageData(0, 0, cv.width, cv.height).data);
};
const cold = [], warm = [], urls = [];
if (d.FACE.clear) d.FACE.clear();
for (const p of P) for (const m of MOODS) for (const k of [0, 1, 2]) for (const s of SIZES) {
  let t = performance.now(); const u = F(p, s, m, k); cold.push(performance.now() - t);
  t = performance.now(); F(p, s, m, k); warm.push(performance.now() - t);
  urls.push(u);
}
let all = 2166136261 >>> 0;
const per = [], hs = [];
for (let i = 0; i < urls.length; i++) { const h = await hashUrl(urls[i]); hs.push(h); all = fnv(all, [h & 0xffff, h >>> 16]); }
for (let j = 0; j < P.length; j++) { let h = 2166136261 >>> 0; const n = MOODS.length * 3 * SIZES.length; for (let i = j * n; i < (j + 1) * n; i++) h = fnv(h, [hs[i] & 0xffff, hs[i] >>> 16]); per.push(h.toString(16)); }
const st = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return { n, sum: +s.reduce((x, y) => x + y, 0).toFixed(1), avg: +(s.reduce((x, y) => x + y, 0) / n).toFixed(3), p50: +s[n >> 1].toFixed(3), p95: +s[Math.floor(n * 0.95)].toFixed(3), max: +s[n - 1].toFixed(2) }; };
const r = { pictures: urls.length, all: all.toString(16), cold: st(cold), warm: st(warm), urlKB: +(urls.reduce((x, u) => x + u.length, 0) / urls.length / 1024).toFixed(2), stats: d.FACE.S };
if (Q.get('ref')) r.same = Q.get('ref') === r.all;
if (Q.has('pmood')) r.per = per;
if (Q.has('psize')) { r.bySize = SIZES.map((sz, j) => { let h = 2166136261 >>> 0; for (let i = j; i < hs.length; i += SIZES.length) h = fnv(h, [hs[i] & 0xffff, hs[i] >>> 16]); return sz + ':' + h.toString(16); }); }
if (Q.has('pdump')) r.dump = urls.slice(0, 3);
const NT = +(Q.get('tags') || 0);
if (NT) {
  const L = d.LIFE, W = L.WALLS.filter(w => !w.tag && !w.busy).slice(0, NT), mk = [];
  const pre = [], mkPre = [];
  for (const w of W) {
    const old = mk.length % 2 === 0;
    if (L.debug.drawTag && (mk.length + mkPre.length) % 4 >= 2) {        // заранее (как в спокойные кадры), потом в кадре — только меш
      let t = performance.now(); w.pre = L.debug.drawTag(w, old); pre.push(performance.now() - t);
      t = performance.now(); L.debug.makeTag(w, old); mkPre.push(performance.now() - t);
    } else { const t = performance.now(); L.debug.makeTag(w, old); mk.push(performance.now() - t); }
    await wait(30);
  }
  r.tags = { n: W.length, makeTag: st(mk) };
  if (pre.length) { r.tags.drawAhead = st(pre); r.tags.makeTagReady = st(mkPre); }
}
return r;
