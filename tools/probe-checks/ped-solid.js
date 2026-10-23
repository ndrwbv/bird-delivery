/* Люди не сквозь твёрдое, машины толкают людей (0п1, pedcollide.js; для npm run check; можно и так:
   npm run probe -- --eval=tools/probe-checks/ped-solid.js; дольше — --q=psecs=120; по-старому — --q=oldped).
   1. Смена на автопилоте (psecs игровых секунд, по умолчанию 45, ускорение ×3), каждые 0,1 с (0,3 игровых) — все люди ближе 250 м (и вне кадра)
      (прохожие, дворовые, гости и клиенты — PEOPLE; бургеры — PEDS; самокатчики — SCOOTS), кроме лежащих, сидящих, идущих к лавочке (садятся на неё) и входящих в подъезд:
      центр человека внутри дома (не арка), внутри твёрдого (стена, гараж, забор, будка, ракушка, заборчик двора — глубже
      0,1 м) или кузова машины (чужой — любой, твоей — когда стоит; глубже 0,1 м). Считаем «входы» — сколько раз человек
      оказался внутри (был снаружи — стал внутри), и долю замеров внутри; по видам и по тому, что человек делал.
   2. Паника у стены: прохожего ставим в 0,5 м от стены дома, пугаем со стороны улицы — бежит не в стену: за 2,5 с
      ушёл дальше 1,5 м и ни разу не в доме.
   3. Катящаяся машина: припаркованную ставим в 6 м перед идущим прохожим носом к нему и толкаем (~13 м/с) — человек
      упал или сбит (не прошёл сквозь).
   4. Стоящая машина поперёк тротуара в 3,5 м перед идущим — 8 с: ни разу не внутри кузова (обходит).
   5. Твёрдая коробка 6 × 3 м (как гараж) поперёк тротуара в 3,5 м перед идущим — 8 с: ни разу не внутри и не по ту сторону
      (раньше проскакивал сквозь: стены выталкивают к ближней стороне, на середине — к дальней). */
const V = d.V, PC = d.PEDC, Q = new URLSearchParams(location.search), PSECS = +(Q.get('psecs') || 45), K = 3, R = 250;
const out = { on: PC.PC.on, gameSecs: 0, samples: 0, inside: 0, entries: 0, byKind: {}, byState: {}, sample: [], stuck: [], panic: null, roll: null };
const stateOf = (p, L) => L === 'peds' ? (p.hang ? 'burger-hang' : 'burger') : L === 'scoots' ? 'scoot' :
  p.guest ? 'guest' : p.after ? 'after' : p.idle ? 'bench' : p.panic ? 'panic' : p.errand ? 'errand' : p.goTo ? 'goTo' : p.cross ? 'cross' : p.path ? 'yard' : 'walk';
const was = new Map(), long = new Map(), YB = (x, z) => d.YARDS && d.YARDS.blocks ? d.YARDS.blocks(x, z, 0.05) : false;
function scan () {
  for (const [L, list] of [['people', d.PEOPLE], ['peds', d.PEDS], ['scoots', d.SCOOTS]]) {
    for (const p of list) {
      if (p.dead || p.fall || p.sitting || p.idle || (p.guest && p.sitAt) || (p.after && p.after.ph !== 'walk') || !p.grp || !p.grp.parent || (L === 'scoots' && !p.grp.visible)) { was.delete(p); continue; }
      if (Math.abs(p.x - V.x) > R || Math.abs(p.z - V.z) > R) { was.delete(p); continue; }
      out.samples++;
      const k = PC.inside(p.x, p.z, 0.1);
      if (!k) { was.set(p, ''); long.delete(p); continue; }
      out.inside++;
      const n = (long.get(p) || 0) + 1; long.set(p, n);
      if (n === 10 && out.stuck.length < 6) out.stuck.push([k, stateOf(p, L), Math.round(p.x), Math.round(p.z), YB(p.x, p.z) ? 'двор' : '']);   // внутри ≥ 3 с подряд
      if (was.get(p) === '') {                      // был снаружи — стал внутри
        const st = stateOf(p, L);
        out.entries++;
        out.byKind[k] = (out.byKind[k] || 0) + 1;
        out.byState[st] = (out.byState[st] || 0) + 1;
        if (out.sample.length < 8) out.sample.push([k, st, Math.round(p.x), Math.round(p.z)]);
      }
      was.set(p, k);
    }
  }
}
await onShift(); autopilot(true);
const st0 = { ...PC.ST };
let gt = 0, last = Date.now();
const t0 = Date.now();
while (Date.now() - t0 < PSECS * 1000 / K) {
  window.__warp = K;
  await wait(100);
  const now = Date.now(); gt += (now - last) / 1000 * K; last = now;
  scan();
}
window.__warp = 1; autopilot(false); d.IN.gas = 0;
out.gameSecs = Math.round(gt);
out.insidePct = +(out.inside / Math.max(1, out.samples) * 100).toFixed(2);
out.st = Object.fromEntries(Object.entries(PC.ST).map(([k, v]) => [k, typeof v === 'number' ? +(v - (st0[k] || 0)).toFixed(k === 'ms' ? 1 : 0) : v]));

/* живой прохожий на тротуаре рядом */
const walker = (skip = 0) => d.PEOPLE.filter(p => !p.dead && !p.fall && !p.guest && !p.after && !p.idle && !p.panic && !p.errand && !p.goTo && !p.cross && p.w && !p.path)
  .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[skip];
V.vx = V.vz = 0;

/* ── 2. паника у стены ── */
{
  const walls = d.SOLIDS.filter(s => s.deckY === undefined && s.hd === 0.5 && s.hw > 5 && Math.hypot(s.cx - V.x, s.cz - V.z) < 140);
  let res = null;
  for (const s of walls.slice(0, 40)) {
    // нормаль стены (локальная z): снаружи — та сторона, где не дом
    const nx = -s.sn, nz = s.cs;
    let sd = 0;
    if (!d.inWall(s.cx + nx * 2, s.cz + nz * 2) && d.inWall(s.cx - nx * 2, s.cz - nz * 2)) sd = 1;
    else if (!d.inWall(s.cx - nx * 2, s.cz - nz * 2) && d.inWall(s.cx + nx * 2, s.cz + nz * 2)) sd = -1;
    if (!sd) continue;
    const px = s.cx + nx * sd * 1.0, pz = s.cz + nz * sd * 1.0;   // 0,5 м от стены
    if (PC.solidAt(px, pz, 0.3) && !PC.solidAt(px, pz, 0)) { /* у другой стены — годится */ }
    if (PC.inside(px, pz, 0) || PC.carAt(px, pz, 0.6, 0.6, false)) continue;
    const p = walker();
    if (!p) break;
    p.x = px; p.z = pz; p.grp.position.set(px, p.grp.position.y, pz);
    PC.scare(px + nx * sd * 4, pz + nz * sd * 4, 8);
    if (!p.panic) continue;
    let inHouse = 0, maxD = 0;
    for (let i = 0; i < 25; i++) {
      await wait(100);
      if (p.dead) break;
      if (d.inWall(p.x, p.z)) inHouse++;
      maxD = Math.max(maxD, Math.hypot(p.x - px, p.z - pz));
    }
    res = { ok: !inHouse && maxD > 1.5, moved: +maxD.toFixed(1), inHouse };
    break;
  }
  out.panic = res;
}

/* ── 3. катящаяся машина ── */
{
  const p = walker();
  const t = p && d.TRAFFIC.filter(t => t.parked && !t.gone && !t.bus && !t.lux && t.model !== 'moped' && Math.hypot(t.x - V.x, t.z - V.z) < 250)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (p && t) {
    const W = p.w, ux = (W.ex - W.sx) / W.L, uz = (W.ez - W.sz) / W.L;   // куда идёт
    const st = { ...PC.ST };
    t.x = p.x + ux * 6; t.z = p.z + uz * 6; t.h = Math.atan2(-ux, -uz);
    if (t.mesh) { t.mesh.position.set(t.x, t.mesh.position.y, t.z); t.mesh.rotation.y = t.h; }
    d.knockCar(t, -ux, -uz, 14);
    t.kvy = 0;                                       // по земле, не подлетая
    let hit = null, minD = 99;
    for (let i = 0; i < 30 && !hit; i++) {
      await wait(50);
      const dd = Math.hypot(p.x - t.x, p.z - t.z); minD = Math.min(minD, dd);
      if (p.dead) hit = 'сбит'; else if (p.fall) hit = 'упал';
    }
    out.roll = { ok: !!hit, hit: hit || 'сквозь', minD: +minD.toFixed(1), fell: PC.ST.fell - st.fell, killed: PC.ST.killed - st.killed };
  }
}

/* ── 4—5. поперёк тротуара прямо перед идущим: стоящая машина (обходит) и твёрдая коробка 3 × 6 м, как гараж (разворачивается) ── */
/* до трёх прохожих: прервался рано (свернул к лавочке, испугался, перешёл к зебре) — следующий */
async function across (tag, far, put, undo) {
  let r = null;
  for (let k = 0; k < 3; k++) { r = await across1(tag, far, put, undo, k); if (!r || r.n >= 40) break; }
  return r;
}
async function across1 (tag, far, put, undo, skip) {
  const p = walker(skip);
  if (!p) return null;
  const W = p.w, ux = (W.ex - W.sx) / W.L, uz = (W.ez - W.sz) / W.L, x0 = p.x, z0 = p.z;
  const o = put(p.x + ux * 3.5, p.z + uz * 3.5, ux, uz);
  let inside = 0, n = 0, back = 0, maxF = -9, px = p.x, pz = p.z, jump = 0;
  for (let i = 0; i < 160; i++) {
    await wait(50);
    if (p.dead || p.fall || p.goTo || p.panic) break;
    if (Math.hypot(p.x - px, p.z - pz) > 2.5) { jump = 1; break; }   // скачок: проскочил сквозь (стена выталкивает к дальней стороне) или перенесли
    px = p.x; pz = p.z;
    n++;
    if (PC.inside(p.x, p.z, 0.1)) inside++;
    const f = (p.x - x0) * ux + (p.z - z0) * uz; maxF = Math.max(maxF, f);
    if (f < maxF - 1) back = 1;
  }
  undo(o);
  const passed = maxF > 3.5 + far + 0.3 ? 1 : 0;
  return { ok: !inside && (tag === 'car' || (!passed && !jump)), inside, n, passed, jump, back, maxF: +maxF.toFixed(1) };
}
{
  const t = d.TRAFFIC.filter(t => t.parked && !t.gone && !t.bus && !t.lux && t.model !== 'moped' && Math.hypot(t.x - V.x, t.z - V.z) < 250)
    .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
  if (t) out.parked = await across('car', 1.0, (x, z, ux, uz) => {
    const h = Math.atan2(-uz, ux), k = { x: t.x, z: t.z, h: t.h };
    t.x = x; t.z = z; t.h = h; t.speed = 0; t.moved = 1;
    if (t.mesh) { t.mesh.position.set(x, t.mesh.position.y, z); t.mesh.rotation.y = h; }
    return k;
  }, k => { t.x = k.x; t.z = k.z; t.h = k.h; t.moved = 1; if (t.mesh) { t.mesh.position.set(t.x, t.mesh.position.y, t.z); t.mesh.rotation.y = t.h; } });
  const G = d.SOLID_GRID, C = 30;
  out.box = await across('solid', 1.5, (x, z, ux, uz) => {
    const h = Math.atan2(-ux, uz), hw = 3, hd = 1.5, cs = Math.cos(h), sn = Math.sin(h);
    const s = { cx: x, cz: z, hw, hd, cs, sn, ex: Math.abs(cs) * hw + Math.abs(sn) * hd, ez: Math.abs(sn) * hw + Math.abs(cs) * hd, cells: [], fresh: [] };
    for (let i = Math.floor((x - s.ex) / C); i <= Math.floor((x + s.ex) / C); i++)
      for (let j = Math.floor((z - s.ez) / C); j <= Math.floor((z + s.ez) / C); j++) { const k = i + ',' + j; let a = G.get(k); if (!a) { G.set(k, a = []); s.fresh.push(k); } a.push(s); s.cells.push(a); }   // клетки нет — заводим (solidsNear сам перечитает)
    return s;
  }, s => { for (const a of s.cells) { const i = a.indexOf(s); if (i >= 0) a.splice(i, 1); } for (const k of s.fresh) G.delete(k); });
}

out.ok = !out.entries && (!out.panic || out.panic.ok) && (!out.roll || out.roll.ok) && (!out.parked || out.parked.ok) && (!out.box || out.box.ok);
return out;
