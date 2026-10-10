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
/* --q=pline=10 — первый кадр реплики (faceahead.js, 11.10.2026): смена, N заказов подряд (d.newOrder); через 1,5 с после
   «заказ принят» каждому получателю — реплика dialog.js (256 px): мс рисования портрета в этом кадре (FACE.S.ms) и готовы ли
   кадры рта. Перед сменой — Толик (256 / 128 / 48) и первая реплика каждой главы историй и встреч: готовы ли к началу смены.
   Ответ line: n, inFrame — мс в кадре реплики (сумма / среднее / худший), cold — сколько реплик рисовали лицо в кадре,
   talk — у скольких кадры рта готовы к первому слову; boot — [готово, всего] у Толика и героев; ahead — __dlv.FAHEAD. */
if (Q.has('pline')) {
  await run(3);                                   // загрузка: поздние куски (и 'faces') и спокойные кадры меню
  const T = d.CHAT.person(), rdy = (p, s, m) => [0, 1, 2].filter(k => d.FACE.ready(p, s, m || '', k)).length;
  const boot = { boss: [[256, 128, 48].reduce((n, s) => n + rdy(T, s), 0), 9], heroes: [0, 0] };
  for (const st of d.STORY_DBG.STORIES) {
    if (st.arch || !st.who) continue;
    const id = 'story-' + st.id, p = { id, seed: st.who.seed, look: Object.assign(d.makePerson({ seed: st.who.seed, fem: st.who.fem }).look, st.who.look) };
    for (const c of st.chapters || []) {
      const q = (c.script || []).find(x => Array.isArray(x) && (x[0] === 'say' || x[0] === 'ask') && x[1] !== 'courier');
      if (!q) continue;
      boot.heroes[1]++; if (rdy(p, 256, (q[3] && q[3].emo) || '') === 3) boot.heroes[0]++;
    }
  }
  await onShift(); autopilot(false);
  const N = +Q.get('pline') || 10, ms = [], res = { n: 0, cold: 0, talk: 0 };
  for (let i = 0; i < N; i++) {
    if (i) { d.S.order = null; d.newOrder(); }
    const ps = (d.S.order && d.S.order.stops || []).flatMap(s => s.persons || []).filter(Boolean);
    const t1 = performance.now(); while (performance.now() - t1 < 1500) { d.V.vx = d.V.vz = 0; await wait(50); }
    for (const p of ps.slice(0, 2)) {
      const tk = d.FACE.ready(p, 256, '', 1) && d.FACE.ready(p, 256, '', 2);
      const m0 = d.FACE.S.ms, c0 = d.FACE.S.miss;
      d.DLG.say({ person: p, name: 'x', text: 'проверка', accept: 'ok' });
      await wait(80);
      ms.push(d.FACE.S.ms - m0); res.n++; if (d.FACE.S.miss > c0) res.cold++; if (tk) res.talk++;
      d.DLG.dismiss(); await wait(80);
    }
  }
  const sum = ms.reduce((x, y) => x + y, 0);
  res.inFrame = [+sum.toFixed(1), +(sum / (ms.length || 1)).toFixed(2), +Math.max(0, ...ms).toFixed(2)];
  return { line: res, boot, ahead: d.FAHEAD || null, soon: [d.FACE.S.soon, +d.FACE.S.soonMs.toFixed(1), +d.FACE.S.soonMax.toFixed(2)] };
}
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
