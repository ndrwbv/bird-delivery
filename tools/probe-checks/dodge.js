/* Люди уворачиваются от машины (12аф, peddodge.js; npm run probe -- --eval=tools/probe-checks/dodge.js --max=0 --timeout=300).
   Твою машину ставим на тротуар в ~(1,6 с хода + 6) м от идущего прохожего — носом на него (через раз — сзади, он только
   слышит), и держим скорость (3,5 / 8 / 16 м/с — шагом, бегом вбок, прыжок / кувырок), пока кузов не проедет мимо.
   По каждому: заметил ли, как ушёл (шагом, вбок, прыжок, кувырок), какой клип, сбит / упал / цел, и пока уворачивается
   и возвращается (до 6 с) — ни разу центром не в доме, твёрдом или кузове (pedcollide.js inside, глубже 0,1 м).
   --q=dn=6 — прохожих на скорость (по умолчанию 6). */
const V = d.V, PC = d.PEDC, DG = d.PDODGE, Q = new URLSearchParams(location.search), N = +(Q.get('dn') || 6);
await onShift(); autopilot(false); d.IN.gas = 0;
await run(2);
const walker = used => d.PEOPLE.filter(p => !p.dead && !p.fall && !p.guest && !p.after && !p.idle && !p.panic && !p.errand && !p.goTo && !p.cross && !p.dg && p.w && !p.path && !used.has(p))
  .sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
const out = { trials: [], bySpeed: {}, inside: 0, st: null };
const used = new Set();
let hold = null;
// машина едет по прямой ровно на него (её место — от времени, стены и столбы не сбивают с курса)
const keep = () => { if (hold) { const t = (performance.now() - hold.t0) / 1000; V.x = hold.x + hold.vx * t; V.z = hold.z + hold.vz * t; V.vx = hold.vx; V.vz = hold.vz; V.h = hold.h; } requestAnimationFrame(keep); };
requestAnimationFrame(keep);
const st0 = JSON.parse(JSON.stringify(DG.ST));
for (const sp of [3.5, 8, 16]) {
  const S = out.bySpeed[sp] = { n: 0, noticed: 0, missed: 0, modes: {}, clips: {}, hit: 0, fell: 0, ok: 0, inside: 0 };
  for (let k = 0; k < N; k++) {
    const p = walker(used);
    if (!p) break;
    used.add(p);
    const W = p.w, ux = (W.ex - W.sx) / W.L, uz = (W.ez - W.sz) / W.L, back = k % 2;   // через раз — сзади
    const dir = back ? 1 : -1, far = sp * 1.3 + 6;
    const cx = p.x - ux * dir * far, cz = p.z - uz * dir * far, vx = ux * dir * sp, vz = uz * dir * sp;   // через 1,3 с + 6 м — там, где он сейчас
    const c0 = JSON.parse(JSON.stringify(DG.ST.clips));
    hold = null; V.vx = V.vz = 0;
    V.x = cx; V.z = cz; V.h = Math.atan2(vx, vz);
    await wait(60);
    hold = { vx, vz, h: Math.atan2(vx, vz), x: cx, z: cz, t0: performance.now() };
    let mode = null, hit = null, inside = 0, minA = 99, t = 0, wasDg = false, side = 0;
    while (t < 6000) {
      await wait(40); t += 40;
      if (p.dg) { wasDg = true; mode = p.dg.mode; if (p.grp.userData.qSide) side = 1; }
      if (p.dead) { hit = 'сбит'; break; }
      if (p.fall) { hit = 'упал'; break; }
      const dx = p.x - V.x, dz = p.z - V.z, al = (dx * vx + dz * vz) / sp, ac = Math.abs(dx * vz - dz * vx) / sp;
      if (Math.abs(al) < 2.7) minA = Math.min(minA, ac);
      const ik = wasDg && PC.inside(p.x, p.z, 0.1);
      if (ik) { inside++; out.kinds = out.kinds || {}; out.kinds[ik + ':' + (p.dg ? p.dg.ph : '-')] = (out.kinds[ik + ':' + (p.dg ? p.dg.ph : '-')] || 0) + 1; }
      if (al < -8 && hold) { hold = null; V.vx = V.vz = 0; }     // проехал — стоп
      if (!hold && !p.dg) break;
    }
    hold = null; V.vx = V.vz = 0;
    const cl = {}; for (const c in DG.ST.clips) { const n = DG.ST.clips[c] - (c0[c] || 0); if (n) cl[c] = n; }
    S.n++; if (wasDg) S.noticed++; else S.missed++;
    if (mode) S.modes[mode] = (S.modes[mode] || 0) + 1;
    for (const c in cl) S.clips[c] = (S.clips[c] || 0) + cl[c];
    if (side) S.clips.qSide = (S.clips.qSide || 0) + 1;
    if (hit === 'сбит') S.hit++; else if (hit === 'упал') S.fell++; else S.ok++;
    S.inside += inside; out.inside += inside;
    out.trials.push([sp, back ? 'сзади' : 'спереди', wasDg ? mode : 'не заметил', hit || 'цел', +minA.toFixed(2), inside, Object.keys(cl).join(',')]);
    await wait(300);
  }
}
out.st = Object.fromEntries(Object.entries(DG.ST).filter(([k, v]) => typeof v === 'number').map(([k, v]) => [k, v - (st0[k] || 0)]));
out.ok = out.inside === 0 && out.bySpeed[8] && out.bySpeed[8].noticed > 0;
return out;
