export function roadCells (chunk) {
  const cells = new Map();
  let key, cell;
  function tri3 (ax, ay, az, bx, by, bz, cx, cy, cz, c0, c1, c2) {
    const x0 = Math.fround(ax), z0 = Math.fround(az);
    const x1 = Math.fround(bx), z1 = Math.fround(bz);
    const x2 = Math.fround(cx), z2 = Math.fround(cz);
    const span = Math.max(Math.abs(x1 - x0), Math.abs(x2 - x0), Math.abs(z1 - z0), Math.abs(z2 - z0));
    const k = span > chunk ? -1 : (Math.floor((x0 + x1 + x2) / 3 / chunk) + 50000) * 100000
      + Math.floor((z0 + z1 + z2) / 3 / chunk) + 50000;
    if (k !== key) {
      cell = cells.get(k);
      if (!cell) {
        cell = { key: k, length: 0, positions: new Float32Array(3072), colours: new Uint8Array(3072) };
        cells.set(k, cell);
      }
      key = k;
    }
    let { length: at, positions, colours } = cell;
    if (at + 9 > positions.length) {
      const oldPositions = positions, oldColours = colours;
      positions = cell.positions = new Float32Array(oldPositions.length * 2);
      colours = cell.colours = new Uint8Array(oldColours.length * 2);
      positions.set(oldPositions); colours.set(oldColours);
    }
    positions[at] = x0; positions[at + 1] = ay; positions[at + 2] = z0;
    positions[at + 3] = x1; positions[at + 4] = by; positions[at + 5] = z1;
    positions[at + 6] = x2; positions[at + 7] = cy; positions[at + 8] = z2;
    colours[at] = c0 >> 16; colours[at + 1] = (c0 >> 8) & 255; colours[at + 2] = c0 & 255;
    colours[at + 3] = c1 >> 16; colours[at + 4] = (c1 >> 8) & 255; colours[at + 5] = c1 & 255;
    colours[at + 6] = c2 >> 16; colours[at + 7] = (c2 >> 8) & 255; colours[at + 8] = c2 & 255;
    cell.length += 9;
  }
  const take = pack => [...cells.values()].map(({key,length,positions,colours}) => {
    const pos = positions.subarray(0, length), rgb = colours.subarray(0, length);
    const vertices = length / 3;
    const data = pack?.(null, pos, rgb, vertices, 3, false);
    const packed = data?.p ?? pos.slice();
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < packed.length; i += 3) {
      const x = packed[i], z = packed[i + 2];
      if (x < x0) x0 = x;
      if (z < z0) z0 = z;
      if (x > x1) x1 = x;
      if (z > z1) z1 = z;
    }
    return { key, vertices, bounds: [x0, z0, x1, z1], positions: packed, colours: data?.c ?? rgb.slice(), index: data?.i ?? null };
  });
  return { tri3, take };
}
