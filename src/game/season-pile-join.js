// The worker packs static vertices only. Live snow and leaf vertices stay
// at the front with their existing offsets, including in an unindexed cell.
export function joinPackedPile (cell, keep) {
  const n = cell.n + keep, compact = cell.p.length / 3 + keep;
  const bytes = compact <= 65535 ? 2 : 4;
  const indexed = cell.index && (n - compact) * 19 > n * bytes * 1.1;
  const size = indexed ? compact : n;
  const p = new Float32Array(size * 3), c = new Uint8Array(size * 3), a = new Uint8Array(size * 4);
  let index = null;
  if (indexed || !cell.index) {
    p.set(cell.p, keep * 3); c.set(cell.c, keep * 3); a.set(cell.a, keep * 4);
    if (indexed) {
      index = new (bytes === 2 ? Uint16Array : Uint32Array)(n);
      for (let i = 0; i < keep; i++) index[i] = i;
      for (let i = 0; i < cell.n; i++) index[keep + i] = keep + cell.index[i];
    }
  } else {
    const fromPos = new Uint32Array(cell.p.buffer, cell.p.byteOffset, cell.p.length), toPos = new Uint32Array(p.buffer);
    const fromAux = new Uint32Array(cell.a.buffer, cell.a.byteOffset, cell.a.length / 4);
    const toAux = new Uint32Array(a.buffer);
    for (let i = 0; i < cell.n; i++) {
      const from = cell.index[i], to = keep + i, src = from * 3, dst = to * 3;
      toPos[dst] = fromPos[src]; toPos[dst + 1] = fromPos[src + 1]; toPos[dst + 2] = fromPos[src + 2];
      c[dst] = cell.c[src]; c[dst + 1] = cell.c[src + 1]; c[dst + 2] = cell.c[src + 2];
      toAux[to] = fromAux[from];
    }
  }
  return { p, c, a, index };
}
