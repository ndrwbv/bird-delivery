/* Address data only. Keep legacy candidate order, strict 6m exclusion and generator boundaries. */
export function* buildAddressSpotsSteps ({entrances,paths,lots,spots,lerp,inPoly,inBounds,groundH,inHouse,nearestRoad,blocks}) {
  const cand = [];
  for (const [x, z, nx, nz] of entrances) cand.push([x + nx * 3, z + nz * 3]);
  for (const q of paths) {
    if (q.far) continue;                           // длинный выход двора через газон к улице (yards.js farLinks) — не адрес
    let acc = 0;
    for (let i = 1; i < q.length; i++) {
      const l = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      for (let d = 12 - acc; d < l; d += 25) cand.push([lerp(q[i - 1][0], q[i][0], d / l), lerp(q[i - 1][1], q[i][1], d / l)]);
      acc = (acc + l) % 25;
    }
  }
  for (const lot of lots) {
    if (lot.k !== 'park') continue;
    let x = 0, z = 0;
    for (const q of lot.p) { x += q[0] / lot.p.length; z += q[1] / lot.p.length; }
    if (inPoly(x, z, lot.p)) cand.push([x, z]);
  }
  yield 'cand';
  const G = new Map(), gk6 = (i, j) => i * 100003 + j;
  for (const s of spots) { const k = gk6(Math.floor(s.x / 6), Math.floor(s.z / 6)); const a = G.get(k); if (a) a.push(s); else G.set(k, [s]); }
  const near = (x, z) => {
    const ci = Math.floor(x / 6), cj = Math.floor(z / 6);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const a = G.get(gk6(i, j));
      if (a) for (const s of a) if (Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 6) return true;
    }
    return false;
  };
  let n = 0;
  for (const [x, z] of cand) {
    if (++n % 1500 === 0) yield 'spots';
    if (!inBounds(x, z, 20) || groundH(x, z) < 0.3 || inHouse(x, z, 1.4)) continue;
    const any = nearestRoad(x, z, 7, 1);
    if (any && any.d < any.seg.w / 2 + 1.2) continue;           // на асфальте не стоим
    const street = nearestRoad(x, z, 5, 1);
    if (street && street.d < street.seg.w / 2 + 12) continue;   // у самой улицы — не вглубь
    if (near(x, z)) continue;
    if (blocks(x, z, 4)) continue;                       // не на горке, разгоне и полёте большого трамплина (jumps.js)
    const s = { x, z };
    spots.push(s);
    const k = gk6(Math.floor(x / 6), Math.floor(z / 6)); const a = G.get(k); if (a) a.push(s); else G.set(k, [s]);
  }
}
