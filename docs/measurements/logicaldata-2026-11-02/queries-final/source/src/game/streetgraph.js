/* Ordered logical street graph. No world, renderer, RNG, clocks or live overlays. */
export const edgeKey = (a, b) => a * 100000 + b;

/** Each call owns fresh containers/nodes/edges; edge.road borrows the original road object. */
export function createStreetGraph ({ roads, roadWidth, drivable }) {
  const nodes = [], nodeIndex = new Map(), edges = new Map();
  const node = (x, z) => {
    const k = x + ',' + z;
    let i = nodeIndex.get(k);
    if (i === undefined) { i = nodes.length; nodeIndex.set(k, i); nodes.push({ x, z, nb: [] }); }
    return i;
  };
  const link = (a, b, r, okAB, okBA) => {
    if (edges.has(edgeKey(a, b))) return;
    const A = nodes[a], B = nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 0.3) return;
    const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, w = roadWidth(r);
    const mk = (from, to, ok, sg) => ({
      a: from, b: to, len, ux: ux * sg, uz: uz * sg, rx: -uz * sg, rz: ux * sg,
      w, w0: r.w0 || w, c: r.c, ok, oneway: !!r.o, lanes: r.l || 0, road: r, tA: 0, tB: 0, sig: null, stopAt: 0,
    });
    A.nb.push(b); B.nb.push(a);
    edges.set(edgeKey(a, b), mk(a, b, okAB, 1));
    edges.set(edgeKey(b, a), mk(b, a, okBA, -1));
  };
  for (const r of roads) {
    if (!drivable(r)) continue;
    let prev = node(r.p[0][0], r.p[0][1]);
    for (let i = 1; i < r.p.length; i++) {
      const cur = node(r.p[i][0], r.p[i][1]);
      if (cur === prev) continue;
      link(prev, cur, r, true, !r.o);
      prev = cur;
    }
  }
  return { nodes, nodeIndex, edges };
}

/** Bind the original segment objects; b remains their bridge flag, not a graph endpoint. */
export function bindSegmentNodes (segments, nodeIndex) {
  for (const s of segments) { s.na = nodeIndex.get(s.x1 + ',' + s.z1); s.nb = nodeIndex.get(s.x2 + ',' + s.z2); }
  return segments;
}

/** Apply once before routechain/cuts/signals. This preserves optional-field presence. */
export function applyStaticBoundary (graph, { open, inBorder }) {
  if (open) {
    for (const N of graph.nodes) N.out = !inBorder(N.x, N.z);
    for (const e of graph.edges.values()) if (graph.nodes[e.a].out || graph.nodes[e.b].out) e.closed = 1;
  }
  return graph;
}

export function buildNodeGrid (nodes, cellSize = 120) {
  const grid = new Map();
  for (let k = 0; k < nodes.length; k++) {
    const key = Math.floor(nodes[k].x / cellSize) + ',' + Math.floor(nodes[k].z / cellSize);
    let a = grid.get(key);
    if (!a) grid.set(key, a = []);
    a.push(k);
  }
  return grid;
}
