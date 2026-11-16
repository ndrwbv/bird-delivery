/* Летние места отдыха VK. Плитка идёт в склейку земли, растения — в
   существующую склейку деревьев. Проверяем проходы до того, как сажать. */
const trees = [];
const recordCell = new Map();
const CELL = 12;
const cellKey = (x, z) => x + ',' + z;
const hash = (x, z) => {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
const shrubs = ['lilac', 'caragana', 'rosehip'];
const tiles = ['#c8ae94', '#c0a48a', '#d2b89e', '#cbb198', '#bfa48f'];

export function recordTree (x, z, shrub) {
  const point = { x, z, shrub };
  trees.push(point);
  const key = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
  if (!recordCell.has(key)) recordCell.set(key, []);
  recordCell.get(key).push(point);
}

function treeNear (x, z, r, includeShrubs = false, except = null) {
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const cell = recordCell.get(cellKey(i, j));
      if (cell?.some(p => p !== except && (includeShrubs || !p.shrub) && Math.hypot(x - p.x, z - p.z) < r)) return true;
    }
  }
  return false;
}

function benchFrame ({ x, z, ry }) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (u, f) => [x + c * u + s * f, z - s * u + c * f];
}

function paving (A, at, x0, x1, z0, z1) {
  // Плиты с швами на малой площадке. Подложка проглядывает в швах.
  const point = (u, f, lift) => {
    const [x, z] = at(u, f);
    return [x, A.groundH(x, z) + A.curbAt(x, z) + lift, z];
  };
  const patch = (l, r, b, f, y) => A.mesh.quad(...point(l, b, y), ...point(l, f, y), ...point(r, f, y), ...point(r, b, y), 0, 1, 0);
  A.mesh.color('#9c826b');
  patch(x0, x1, z0, z1, 0.078);
  const cols = Math.ceil((x1 - x0) / 0.78), rows = Math.ceil((z1 - z0) / 0.68);
  const w = (x1 - x0) / cols, d = (z1 - z0) / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * w, z = z0 + j * d;
      A.mesh.color(tiles[Math.floor(hash(...at(x, z)) * tiles.length)]);
      patch(x + 0.013, x + w - 0.013, z + 0.013, z + d - 0.013, 0.091);
    }
  }
}

function restArea (A, b) {
  const at = benchFrame(b);
  const fits = (x, z, r) => A.inBounds(x, z, 2) && A.groundH(x, z) >= 0.3 &&
    !A.inHouse(x, z, r) && !A.roadWalk(x, z, r) && !A.parking(x, z, r);
  const corner = (u, f) => fits(...at(u, f), 0.22);
  const width = [2.3, 1.65].find(w => [-w, w].every(u => corner(u, -0.6) && corner(u, 1.5)));
  if (!width || !corner(0, 1.5)) return;
  if ([-1, 0, 1].some(u => A.solidAt(...at(u, 1.1), 0.15))) return;
  paving(A, at, -width, width, -0.6, 1.51);
  const shrub = (u, f, i) => {
    const [x, z] = at(u, f);
    if (!fits(x, z, 0.65) || A.onPave(x, z, 0.85) || A.solidAt(x, z, 0.75) || treeNear(x, z, 1.6, true)) return;
    if (A.benches.some(other => Math.hypot(other.x - x, other.z - z) < 1.65)) return;
    A.plant(x, z, shrubs[i]);
  };
  for (const side of [-1, 1]) shrub(side * (width + 0.2), -0.58, side < 0 ? 0 : 2);
  shrub(0.3, -1.73, 1);

  // Подход с открытой стороны: к тротуару перед лавочкой или сбоку.
  const approaches = [
    (u, f) => at(u, 1.5 + f),
    (u, f) => at(-width - f, 0.78 + u),
    (u, f) => at(width + f, 0.78 - u),
  ];
  let best = null;
  for (const approach of approaches) {
    for (let f = 0.26; f <= 8 && (!best || f < best.length); f += 0.36) {
      const [x, z] = approach(0, f);
      if (A.roadWalk(x, z, 0.52) === 'road' || A.inHouse(x, z, 0.7) ||
          A.solidAt(x, z, 0.65) || A.parking(x, z, 0.6)) break;
      if (!A.onPave(x, z, 0.15)) continue;
      best = { approach, length: f };
      break;
    }
  }
  if (best && best.length > 0.3) paving(A, best.approach, -0.52, 0.52, 0, best.length);
  b.vkRest = true;
}

function plantCompanion (A, point) {
  const road = A.nearestRoad(point.x, point.z, 26, 1);
  if (!road || road.seg.c < 2 || road.seg.c > 5 || road.d - road.seg.w / 2 > 16) return;
  const dx = point.x - road.x, dz = point.z - road.z, len = Math.hypot(dx, dz);
  if (len < 1 || treeNear(point.x, point.z, 6.5, false, point)) return;
  const nx = dx / len, nz = dz / len;
  const side = hash(point.x, point.z) < 0.5 ? -1 : 1;
  for (const [along, back] of [[3.9 * side, 2.4], [-4 * side, 2.6], [1.4 * side, 4.7]]) {
    const x = point.x + nx * back + nz * along, z = point.z + nz * back - nx * along;
    if (!A.inBounds(x, z, 2) || A.inHouse(x, z, 1.6) || A.onPave(x, z, 1.25) || A.parking(x, z, 1.6) ||
        A.solidAt(x, z, 1.05) || treeNear(x, z, 3.4, true) ||
        A.benches.some(b => Math.hypot(x - b.x, z - b.z) < 2.8)) continue;
    if (A.plant(x, z, side < 0 ? 'lime' : 'maple')) return;
  }
}

export function* buildNeighborhood (A) {
  const existing = trees.slice();
  for (let i = 0; i < A.benches.length; i++) {
    restArea(A, A.benches[i]);
    if (i % 32 === 31) yield 'rest-areas';
  }
  for (let i = 0; i < existing.length; i++) {
    const p = existing[i];
    if (!p.shrub) plantCompanion(A, p);
    if (i % 128 === 127) yield 'road-groves';
  }
  trees.length = 0;
  recordCell.clear();
}
