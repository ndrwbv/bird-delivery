/* Край газона у дороги без бордюра (11ц, 24.10.2026; для npm run check, id curbgap; можно и так:
   npm run probe -- --eval=tools/probe-checks/curb-gaps.js). Правило — docs/CAREER.md «Бордюр у дорог и проездов».
   По каждой дороге города — по обоим внешним краям мощёного (у улицы класса ≤ 5 — край тротуара 2,75 м за полотном,
   у бульвара — ещё газон r.g; у дворового проезда (7) и пешеходки (6) — метр плитки за асфальтом) — шагом 1 м:
   если в 0,35 м за краем газон (не мощёное, не дом, не вода, не стоянка, не площадка / промзона / гаражи (CITY.lots),
   не карман парковки двора, в черте города),
   то должен быть бордюр:
     • улица — тротуар поднят (бордюр 0,28 м, game.js osmCurbs: клетки RAISED поперёк тротуара);
     • проезд / пешеходка — камень curbs.js ближе 0,35 м к краю плитки.
   Не в счёт (понижение нарочно): перекрёсток (ближе края самой широкой дороги узла + 2 м к узлу с 3+ дорогами), зебра (±3,5 м),
   узкая полоска газона (за ней ближе 1,25 м от края снова мощёное — правило curbs.js STRIP), край в доме (арка).
   Ответ: м газона у края — lawn, без бордюра — bare (по видам: street / drive / foot), sample — где. ok — bare улиц и
   проездов не больше 0,1 % края (цель — 0: остаются обрывки по 1—2 м), пешеходки — для сведения. Было (?oldcurbs, 24.10.2026):
   проезды 82,8 км без бордюра из 212 км края газона, улицы 6,5 из 236 км. --q=cgall — все места, --q=cgcls=7 — только этот класс */
const Q = new URLSearchParams(location.search);
await until(() => d.SPOTS && d.SPOTS.length > 50 && (!d.LATE || !d.LATE.busy()), 90000);
const CB = d.CURBS, A = CB && CB.api;
if (!A) return { err: 'нет __dlv.CURBS.api (бордюры не построены: ?nocurbs?)' };
const C = d.CITY, P = d.PAVE.onPave, RS = d.RAISED, only = Q.get('cgcls');
const rkey = (x, z) => (Math.round(x) + 4000) * 8000 + (Math.round(z) + 4000);
const W = r => A.roadWidth(r);
// узлы: сколько дорог сходится (по точкам ломаных)
const deg = new Map(), wAt = new Map();
const nk = p => p[0] + ',' + p[1];
for (const r of C.roads) for (let i = 0; i < r.p.length; i++) {
  const k = nk(r.p[i]);
  deg.set(k, (deg.get(k) || 0) + (i === 0 || i === r.p.length - 1 ? 1 : 2));
  wAt.set(k, Math.max(wAt.get(k) || 0, W(r) / 2 + (r.c <= 5 ? 2.75 + (r.g || 0) : 1)));
}
const JN = [];
for (const [k, n] of deg) if (n >= 3) { const [x, z] = k.split(',').map(Number); JN.push([x, z, wAt.get(k) + 2]); }
const JG = new Map(), G = 32, gk = (i, j) => (i + 4096) * 8192 + j + 4096;
for (const q of JN) for (let i = Math.floor((q[0] - q[2]) / G); i <= Math.floor((q[0] + q[2]) / G); i++) for (let j = Math.floor((q[1] - q[2]) / G); j <= Math.floor((q[1] + q[2]) / G); j++) {
  const kk = gk(i, j); let a = JG.get(kk); if (!a) JG.set(kk, a = []); a.push(q);
}
const nearJ = (x, z) => { const a = JG.get(gk(Math.floor(x / G), Math.floor(z / G))); if (a) for (const q of a) if (Math.hypot(x - q[0], z - q[1]) < q[2]) return true; return false; };
const nearZ = (x, z) => (d.ZEBRAS || []).some(q => Math.abs(x - q.x) < 12 && Math.abs(z - q.z) < 12 && Math.abs((x - q.x) * q.ux + (z - q.z) * q.uz) < 3.5);
// стоянки (CITY.lots 'park') — асфальт; площадки, промзоны, гаражи (остальные CITY.lots) — тоже не газон
const LOTS = (C.lots || []).filter(l => l.p && l.p.length > 2).map(l => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of l.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  return { p: l.p, x0, x1, z0, z1 };
});
const inLot = (x, z) => LOTS.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && A.inPoly(x, z, b.p));
const paved = (x, z) => !!P(x, z, 0) || inLot(x, z) || (A.ycBlocks && A.ycBlocks(x, z, 0));
const lawn = (x, z) => A.inBounds(x, z, 2) && !paved(x, z) && !A.inHouse(x, z, 0.05) && A.groundH(x, z) >= 0.3;
// для сведения: проезд во дворе (ближе 60 м к подъезду) или дальше
const EG = new Set();
for (const e of C.entrances || []) for (let i = Math.floor((e[0] - 60) / 20); i <= Math.floor((e[0] + 60) / 20); i++) for (let j = Math.floor((e[1] - 60) / 20); j <= Math.floor((e[1] + 60) / 20); j++) if (Math.hypot((i + 0.5) * 20 - e[0], (j + 0.5) * 20 - e[1]) < 60) EG.add(gk(i, j));
const R = { yardBare: 0, lawn: { street: 0, drive: 0, foot: 0 }, bare: { street: 0, drive: 0, foot: 0 }, skip: { junction: 0, zebra: 0, strip: 0 }, sample: [], ms: 0 };
const t0 = performance.now();
const kind = r => (r.c <= 5 ? 'street' : r.c === 7 ? 'drive' : 'foot');
for (const r of C.roads) {
  if (r.b || r.p.length < 2) continue;
  if (only && +only !== r.c) continue;
  if (r.c <= 5 && r.x) continue;                     // обрывок улицы за рамкой (не ездим) — тротуара с бордюром у него нет и не надо
  const k = kind(r), w = W(r), o = w / 2 + (r.c <= 5 ? 2.75 + (r.g || 0) : 1);
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], L = Math.hypot(bx - ax, bz - az);
    if (L < 1) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let t = 0.5; t < L; t += 1) {
      const cx = ax + ux * t, cz = az + uz * t;
      for (const sd of [-1, 1]) {
        const nx = -uz * sd, nz = ux * sd;
        const lx = cx + nx * (o + 0.35), lz = cz + nz * (o + 0.35);
        if (!lawn(lx, lz)) continue;
        if (A.inHouse(cx + nx * o, cz + nz * o, 0)) continue;
        if (nearJ(cx, cz)) { R.skip.junction++; continue; }
        if (r.c <= 5 && nearZ(cx, cz)) { R.skip.zebra++; continue; }
        // узкая полоска газона, за ней вдоль края мощёное (curbs.js STRIP): там бордюра нет нарочно
        { const sx = cx + nx * (o + 1.25), sz = cz + nz * (o + 1.25);
          if (paved(sx, sz) && paved(sx + ux, sz + uz) && paved(sx - ux, sz - uz)) { R.skip.strip++; continue; } }
        R.lawn[k]++;
        let ok = false;
        if (r.c <= 5) for (let q = w / 2 + 0.5; q < o - 0.2 && !ok; q += 0.45) ok = RS.has(rkey(cx + nx * q, cz + nz * q));
        if (!ok) ok = CB.near(cx + nx * (o + 0.04), cz + nz * (o + 0.04), 0.35);
        if (!ok) { R.bare[k]++; if (EG.has(gk(Math.floor(lx / 20), Math.floor(lz / 20)))) R.yardBare++; if (R.sample.length < (Q.has('cgall') ? 1e5 : 12) && (R.bare[k] % 97 === 1 || Q.has('cgall'))) R.sample.push([k, r.c, Math.round(lx), Math.round(lz)]); }
      }
    }
  }
}
R.ms = Math.round(performance.now() - t0);
R.curbs = { m: CB.ST.m, pathM: CB.ST.pathM, driveM: CB.ST.driveM, streetM: CB.ST.streetM || 0, capM: CB.ST.capM || 0, ms: CB.ST.ms, mob: CB.ST.mob };
R.lawnM = R.lawn.street + R.lawn.drive; R.bareM = R.bare.street + R.bare.drive;
// цель — 0; остаются обрывки по 1—2 м (кусок камня короче 0,45 м не кладётся, стык с пятном перекрёстка): до 0,1 % края — ок
R.ok = R.bareM <= R.lawnM * 0.001;
return R;
