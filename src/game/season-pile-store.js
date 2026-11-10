/* CPU geometry shared by the live builder and its optional worker.
   For leaf normals, aux.z stores two palette bits and six octahedral bits. */
const normalVertices = new WeakMap();
function normalSources (tpl) {
  let sources = normalVertices.get(tpl);
  if (sources) return sources;
  const bits = new Uint32Array(tpl.buffer, tpl.byteOffset, tpl.length), first = new Map();
  sources = new Uint32Array(tpl.length / 3);
  for (let i = 0; i < sources.length; i++) {
    const k = i * 3, key = bits[k] + ',' + bits[k + 1] + ',' + bits[k + 2];
    let from = first.get(key);
    if (from === undefined) { first.set(key, i); from = i; }
    sources[i] = from;
  }
  normalVertices.set(tpl, sources);
  return sources;
}
function octN (c, v0, tpl, x, y, z, pal, nrm) {
  const sources = normalSources(tpl);
  const w = nrm ? nrm.w : 0;
  for (let j = 0; j < sources.length; j++) {
    const i = v0 + j, from = sources[j];
    if (from !== j) {
      // The identical template vertex has the same transformed position and normal.
      c.a[i * 4 + 2] = c.a[(v0 + from) * 4 + 2];
      c.a[i * 4 + 3] = c.a[(v0 + from) * 4 + 3];
      continue;
    }
    const px = c.p[i * 3], py = c.p[i * 3 + 1], pz = c.p[i * 3 + 2];
    let ax = px - x, ay = py - y, az = pz - z;
    const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= l; ay /= l; az /= l;
    if (w) {
      const bx = px - nrm.cx, by = py - nrm.cy, bz = pz - nrm.cz;
      const m = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      ax = ax * (1 - w) + bx / m * w; ay = ay * (1 - w) + by / m * w; az = az * (1 - w) + bz / m * w;
    }
    const s = Math.abs(ax) + Math.abs(ay) + Math.abs(az) || 1;
    let u = ax / s, v = az / s;
    if (ay < 0) { const u2 = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1), v2 = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1); u = u2; v = v2; }
    c.a[i * 4 + 2] = pal + (Math.round((u * 0.5 + 0.5) * 63) << 2);
    c.a[i * 4 + 3] = Math.round((v * 0.5 + 0.5) * 255);
  }
}

/* ─── своя склейка: клетки по сто метров, позиция + цвет + aux ─── */
export function createSeasonPileStore ({ THREE, CH, WOOD_ON, raisedLand, landBuilt }) {
  const cells = new Map();
  const landParts = raisedLand ? [] : null;
  let landRoot = null;
  const col = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
  let tris = 0;
  const byNum = new Map(), RGB = new Map();         // клетка по числу (строка-ключ на каждую вещь стоила), цвет по строке — разобранный
  function cell (x, z) {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), kn = (i + 50000) * 100000 + j + 50000;
    let c = byNum.get(kn);
    if (!c) {
      const k = i + ',' + j;
      c = cells.get(k);
      if (!c) cells.set(k, c = { k, n: 0, cap: 2048, p: new Float32Array(2048 * 3), c: new Uint8Array(2048 * 3), a: new Uint8Array(2048 * 4) });
      byNum.set(kn, c);
    }
    return c;
  }
  /* вершины шаблона после сдвига, поворота и масштаба — в массив out с o */
  function write (tpl, out, o, x, y, z, sx, sy, sz, rx, ry, rz) {
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YZX')), Sc.set(sx, sy, sz));
    const e = M.elements, nv = tpl.length / 3;
    for (let i = 0; i < nv; i++) {
      const vx = tpl[i * 3], vy = tpl[i * 3 + 1], vz = tpl[i * 3 + 2], q = o + i * 3;
      out[q] = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
      out[q + 1] = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
      out[q + 2] = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
    }
  }
  function room (c, add) {
    if (c.n + add <= c.cap) return;
    while (c.n + add > c.cap) c.cap = Math.ceil(c.cap * 1.5);   // запас ×1,5 (был ×2: на телефоне ~28 МБ пустого из 90 к пику поздней сборки, 23.10.2026)
    const p = new Float32Array(c.cap * 3), cc = new Uint8Array(c.cap * 3), a = new Uint8Array(c.cap * 4);
    p.set(c.p); cc.set(c.c); a.set(c.a);
    c.p = p; c.c = cc; c.a = a;
  }
  return {
    /* tpl — неиндексированные вершины шаблона; поворот: X, потом Z, потом Y */
    /* возвращает, где лежат вершины: клетка и первая вершина */
    /* shade — низ куска темнее, верх светлее (кроны, trees.js): 0 — ровный цвет */
    /* lift — на сколько м поднять вершину зимой (по вершине шаблона, снег на ветках толще: treeform.js), liftK — множитель */
    /* nrm — мягкая листва (2г6, treeform.js): { cx, cy, cz, w } — центр кроны и доля «от центра кроны» в нормали (остальное —
       от середины комка x, y, z); у листвы (вид 1; вид 0 с палитрой 2 — хвоя) нормаль вершины пишется в aux.z (старшие 6 бит)
       и aux.w (8 бит) октаэдром — без лишней памяти; шейдер рисует крону плавно, без граней */
    add (tpl, x, y, z, sx, sy, sz, rx, ry, rz, hex, kind = 0, seed = 0, pal = 0, shade = 0, lift = null, liftK = 1, nrm = null) {
      const c = cell(x, z), nv = tpl.length / 3, v0 = c.n;
      room(c, nv);
      write(tpl, c.p, v0 * 3, x, y, z, sx, sy, sz, rx, ry, rz);
      let rgb = RGB.get(hex);
      if (rgb === undefined) {
        col.set(hex);
        rgb = (Math.round(col.r * 255) << 16) | (Math.round(col.g * 255) << 8) | Math.round(col.b * 255);
        if (typeof hex === 'string' || typeof hex === 'number') RGB.set(hex, rgb);
      }
      const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255;
      const sd = Math.max(1, Math.min(254, Math.round(seed * 253) + 1));
      for (let i = v0; i < v0 + nv; i++) {
        const o = i * 3, q = i * 4;
        if (shade) {
          const f = 1 + shade * (0.6 * tpl[(i - v0) * 3 + 1] - 0.12);
          c.c[o] = Math.min(255, r * f); c.c[o + 1] = Math.min(255, g * f); c.c[o + 2] = Math.min(255, b * f);
        } else { c.c[o] = r; c.c[o + 1] = g; c.c[o + 2] = b; }
        c.a[q] = kind; c.a[q + 1] = sd; c.a[q + 2] = pal; c.a[q + 3] = lift ? Math.min(255, Math.round(lift[i - v0] * liftK * 200)) : 0;
      }
      if (WOOD_ON && (kind === 1 || (kind === 0 && pal === 2))) octN(c, v0, tpl, x, y, z, pal, nrm);
      c.n += nv;
      tris += nv / 3;
      if (landParts && !landBuilt()) landParts.push({ c, v0, nv, x: landRoot ? landRoot[0] : x, z: landRoot ? landRoot[1] : z });
      return { key: c.k, v0, nv };
    },
    landAnchor (x, z) { landRoot = x === undefined ? null : [x, z]; },
    raiseLand (delta) {
      for (const q of landParts || []) {
        const h = delta(q.x, q.z), a = q.c.p;
        if (h && a) for (let v = q.v0; v < q.v0 + q.nv; v++) a[v * 3 + 1] += h;
      }
      if (landParts) landParts.length = 0;
    },
    write,
    tris: () => tris,
    cells: () => cells,
    clear () { cells.clear(); byNum.clear(); },
    /* клетку уже переложили в склейку (jointSteps): её массивы — вон сразу, а не после всех клеток (на телефоне исходники
       деревьев и сугробов ~150 МБ жили рядом с готовыми склейками — пик поздней сборки, 23.10.2026) */
    drop (k) {
      const c = cells.get(k);
      if (!c) return;
      cells.delete(k);
      const [i, j] = k.split(',').map(Number);
      byNum.delete((i + 50000) * 100000 + j + 50000);
      c.p = c.c = c.a = null; c.n = c.cap = 0;
    },
    /* память клеток (отладка): МБ занято массивами / из них вершинами */
    mem () { let cap = 0, used = 0; for (const c of cells.values()) { cap += c.cap * 10; used += c.n * 10; } return { cells: cells.size, cap: +(cap / 1048576).toFixed(1), used: +(used / 1048576).toFixed(1) }; },
  };
}
