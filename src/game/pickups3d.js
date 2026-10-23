/* Подбираемое — объёмными модельками (18.10.2026, автор: «все айтемы, которые я подбираю, будь это деньги или
   шайба снюса, — это 3D-предметы, как и кофе»).

   Было: деньги на улице (монетка, купюра, заначка), золотое сердце — пиксель-арт на плоской плашке с искоркой;
   находки «мои находки» — картинка-спрайт 128×128 в жёлтой рамке. Стало: каждая — склейка простых форм
   (коробки, цилиндры, шары, воксели), цвета — в вершинах, тот же неосвещённый материал, что у стаканчика кофе
   (game.js PICK_MAT.vc). Объём читается без света: каждая грань чуть темнее или светлее по тому, куда смотрит
   (верх — светлее, низ — темнее, бока — между), это запечено в цвет вершин.

   Рисует их pickinst.js — по InstancedMesh на вид (деньги, сердце — их бывает несколько; находки — по одной).
   Здесь только геометрия: один раз на игру, общая, не освобождается (userData.shared).

     build(THREE, { col: ['latte', 'snus', …] }) → { coin, bill, stash, life, col: { id: геометрия } }
   Взрослые находки (снюс, сигареты, свёрток, пиво) строятся, только если их id есть в списке — список даёт
   game.js COLLECT, а он за ADULT; в детской вместо них уточка, кактус, кубик и гном. */

/* сборщик склейки: add(геометрия, цвет, x, y, z, rx, ry, rz, sx, sy, sz); done(tilt) — склеить, повернув целиком */
function kit (THREE) {
  const parts = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  const add = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    E.set(rx, ry, rz); Q.setFromEuler(E);
    geo.applyMatrix4(M.compose(P.set(x, y, z), Q, SC.set(sx, sy, sz)));
    parts.push([geo, hex]);
  };
  const box = (w, h, d, hex, x, y, z, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz);
  const cyl = (rt, rb, h, seg, hex, x, y, z, rx, ry, rz) => add(new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, rx, ry, rz);
  const ball = (r, hex, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => add(new THREE.SphereGeometry(r, 10, 7), hex, x, y, z, rx, ry, rz, sx, sy, sz);
  /* tilt — [rx, ry, rz] всей модели (как у стаканчика наклон 0,25), s — масштаб целиком */
  const done = (tilt, s = 1) => {
    const T = new THREE.Matrix4().compose(P.set(0, 0, 0), Q.setFromEuler(E.set(tilt ? tilt[0] : 0, tilt ? tilt[1] : 0, tilt ? tilt[2] : 0)), SC.set(s, s, s));
    let vn = 0, iN = 0;
    for (const [g] of parts) {
      g.applyMatrix4(T);
      if (!g.index) { const n = g.attributes.position.count, a = new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
      vn += g.attributes.position.count; iN += g.index.count;
    }
    const pos = new Float32Array(vn * 3), col = new Float32Array(vn * 3), idx = vn > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
    const c = new THREE.Color();
    let vo = 0, io = 0;
    for (const [g, hex] of parts) {
      const p = g.attributes.position.array, nr = g.attributes.normal.array, n = g.attributes.position.count;
      pos.set(p, vo * 3);
      c.set(hex);
      for (let i = 0; i < n; i++) {
        // запечённый объём: верх 1, бока 0,8, спереди/сзади 0,88, низ 0,6
        const k = 0.8 + 0.2 * nr[i * 3 + 1] + 0.08 * Math.abs(nr[i * 3 + 2]);
        col[(vo + i) * 3] = c.r * k; col[(vo + i) * 3 + 1] = c.g * k; col[(vo + i) * 3 + 2] = c.b * k;
      }
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += n; io += gi.length;
      g.dispose();
    }
    parts.length = 0;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    out.userData.shared = true;                  // общая на всю игру: dropPickup её не освобождает
    return out;
  };
  return { add, box, cyl, ball, done };
}

/* ₽ из брусочков на грани z (сторона sgn: 1 — спереди, −1 — сзади, зеркально, чтобы читался) */
function rub (K, hex, z, sgn, s = 1) {
  const X = x => x * sgn * s;
  K.box(0.07 * s, 0.42 * s, 0.03, hex, X(-0.07), 0, z);           // ножка
  K.box(0.2 * s, 0.065 * s, 0.03, hex, X(0.02), 0.175 * s, z);    // верх петли
  K.box(0.065 * s, 0.17 * s, 0.03, hex, X(0.11), 0.1 * s, z);     // бок петли
  K.box(0.2 * s, 0.065 * s, 0.03, hex, X(0.02), 0.03 * s, z);     // низ петли
  K.box(0.24 * s, 0.055 * s, 0.03, hex, X(-0.05), -0.08 * s, z);  // перекладина
}

/* пачка купюр: зелёная стопка, края бумаги светлее, на верхней купюре рамка и «₽»-кружок, резинка поперёк */
function pack (K, x, y, z, ry, band, w = 1.1, h = 0.34, d = 0.58) {
  const R = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const L = 5;                                    // слои: зелёный / бледный — видна стопка
  for (let i = 0; i < L; i++) {
    const [px, pz] = R(0, 0);
    K.box(w - (i % 2) * 0.03, h / L, d - (i % 2) * 0.03, i % 2 ? '#c9f0bf' : '#3fbf5c', px, y - h / 2 + h / L * (i + 0.5), pz, 0, ry, 0);
  }
  const top = y + h / 2;
  { const [px, pz] = R(0, 0); K.box(w * 0.82, 0.02, d * 0.7, '#1f7a35', px, top + 0.01, pz, 0, ry, 0); }
  { const [px, pz] = R(0, 0); K.box(w * 0.66, 0.025, d * 0.5, '#5fd77c', px, top + 0.015, pz, 0, ry, 0); }
  { const [px, pz] = R(-w * 0.12, 0); K.add(new (K.T.CylinderGeometry)(d * 0.17, d * 0.17, 0.035, 12), '#e9ffe2', px, top + 0.02, pz); }
  { const [px, pz] = R(w * 0.24, 0); K.box(0.13, h + 0.05, d + 0.05, band, px, y, pz, 0, ry, 0); }   // резинка / бумажная лента
}

/* воксельная модель из пиксель-арта: клетка s м, толщина — по удалённости от края (пухлая середина) */
function voxels (K, rows, pal, s, d0, bulge) {
  const H = rows.length, W = rows[0].length;
  const at = (i, j) => (j >= 0 && j < H && i >= 0 && i < W ? rows[j][i] : '.');
  const dist = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let d = 0;
    if (at(i, j) !== '.') for (d = 1; d < 4; d++) if (at(i - d, j) === '.' || at(i + d, j) === '.' || at(i, j - d) === '.' || at(i, j + d) === '.') break;
    dist[j * W + i] = d;
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ch = at(i, j);
    if (ch === '.') continue;
    K.box(s, s, d0 + bulge * (dist[j * W + i] - 1), pal[ch], (i - (W - 1) / 2) * s, ((H - 1) / 2 - j) * s, 0);
  }
}

const HEART = ['..yyy...yyy..', '.yRRRy.yRRRy.', 'yRwwRRyRRRRry', 'yRwRRRRRRRRry', 'yRRRRRRRRRRry', '.yRRRRRRRRry.', '..yRRRRRRry..', '...yRRRRry...', '....yRRry....', '.....yry.....', '......y......'];

/* находки: модель на id (≈1,1—1,4 м, центр — в нуле); tilt и масштаб — в COLS */
const COLS = {
  latte (K) {
    K.cyl(0.36, 0.3, 0.5, 14, '#6b4a3a', 0, -0.3, 0);          // кофе внизу
    K.cyl(0.39, 0.36, 0.3, 14, '#e6cfa8', 0, 0.1, 0);           // молоко
    K.cyl(0.42, 0.39, 0.22, 14, '#ffe08a', 0, 0.36, 0);         // медовая пенка
    K.cyl(0.44, 0.43, 0.08, 14, '#f4f6fb', 0, 0.5, 0);          // крышка
    K.cyl(0.28, 0.42, 0.12, 14, '#f4f6fb', 0, 0.6, 0);
    K.cyl(0.04, 0.04, 0.6, 6, '#f0522a', 0.1, 0.86, 0, 0, 0, -0.25);   // соломинка
    for (const [a, h, y] of [[0.2, 0.26, 0.2], [-0.5, 0.36, 0.15], [1.4, 0.22, 0.22], [2.6, 0.3, 0.17]])   // медовые подтёки
      K.box(0.08, h, 0.05, '#f2b441', Math.sin(a) * 0.4, y, Math.cos(a) * 0.4, 0, a, 0);
    return [[0, 0, 0.18], 1.25];
  },
  snus (K) {
    // шайба: тёмно-синее донце, крышка ярче, по крышке — кремовое кольцо и «Ш» (марка-пародия «Шайба»)
    K.cyl(0.58, 0.58, 0.22, 24, '#1f3f7a', 0, -0.06, 0);
    K.cyl(0.585, 0.585, 0.05, 24, '#fff3d6', 0, -0.06, 0);
    K.cyl(0.6, 0.6, 0.13, 24, '#2f5fd0', 0, 0.1, 0);
    K.cyl(0.47, 0.47, 0.02, 24, '#fff3d6', 0, 0.17, 0);
    K.cyl(0.4, 0.4, 0.03, 24, '#2f5fd0', 0, 0.175, 0);
    for (const x of [-0.15, 0, 0.15]) K.box(0.075, 0.04, 0.32, '#fff3d6', x, 0.2, -0.03);
    K.box(0.375, 0.04, 0.075, '#fff3d6', 0, 0.2, 0.13);
    return [[0.6, 0, 0.15], 1.25];
  },
  cig (K) {
    // пачка «Шапмэн» с вишней: бордовая, розовая полоса, вишенки, торчат три сигареты
    K.box(0.62, 0.9, 0.3, '#8a1c3a', 0, -0.05, 0);
    K.box(0.64, 0.14, 0.32, '#ffd3dc', 0, 0.2, 0);
    K.box(0.64, 0.07, 0.32, '#2b2a30', 0, -0.46, 0);
    K.ball(0.09, '#e8323c', -0.08, -0.14, 0.16); K.ball(0.09, '#e8323c', 0.08, -0.11, 0.16);
    K.box(0.03, 0.16, 0.03, '#4fae3a', 0, 0.0, 0.17, 0, 0, 0.35);
    for (const [x, h] of [[-0.16, 0.26], [0, 0.34], [0.15, 0.22]]) {
      K.cyl(0.05, 0.05, h, 8, '#f3e9d8', x, 0.4 + h / 2 - 0.04, 0);
      K.cyl(0.052, 0.052, 0.08, 8, '#d9832c', x, 0.4 + h - 0.04, 0);
    }
    return [[0, 0, 0.12], 1.3];
  },
  cassette (K) {
    K.box(1.05, 0.66, 0.14, '#2b2a30', 0, 0, 0);
    K.box(0.86, 0.32, 0.16, '#e8e2d4', 0, 0.1, 0);
    K.box(0.86, 0.06, 0.17, '#e04836', 0, 0.2, 0);
    K.box(0.46, 0.14, 0.175, '#57525c', 0, 0.06, 0);
    for (const x of [-0.2, 0.2]) {
      K.cyl(0.1, 0.1, 0.18, 12, '#2b2a30', x, 0.06, 0, Math.PI / 2);
      K.cyl(0.04, 0.04, 0.19, 8, '#e8e2d4', x, 0.06, 0, Math.PI / 2);
    }
    K.box(0.6, 0.14, 0.17, '#57525c', 0, -0.23, 0);
    return [[0, 0, 0.15], 1.25];
  },
  herb (K) {
    // бумажный кулёк, сверху торчит зелень, на боку — «?»
    K.cyl(0.32, 0.42, 0.75, 4, '#c9a877', 0, -0.15, 0, 0, Math.PI / 4);
    K.box(0.5, 0.1, 0.5, '#a88859', 0, 0.26, 0);
    for (const [x, y, z, r, c] of [[-0.14, 0.42, 0, 0.2, '#4fae3a'], [0.1, 0.52, 0.05, 0.22, '#3d8f2c'], [0.18, 0.4, -0.08, 0.17, '#4fae3a'], [0, 0.4, 0.14, 0.16, '#5fc24a']])
      K.add(new (K.T.IcosahedronGeometry)(r, 0), c, x, y, z);
    const z = 0.285, Q = '#6b4a3a';
    K.box(0.16, 0.045, 0.03, Q, 0, 0.0, z); K.box(0.045, 0.1, 0.03, Q, 0.07, -0.05, z);
    K.box(0.045, 0.07, 0.03, Q, 0, -0.12, z); K.box(0.045, 0.045, 0.03, Q, 0, -0.22, z);
    return [[0, 0, 0.1], 1.25];
  },
  beer (K) {
    K.cyl(0.22, 0.22, 0.6, 12, '#6b3f1c', 0, -0.25, 0);
    K.cyl(0.09, 0.22, 0.18, 12, '#6b3f1c', 0, 0.14, 0);
    K.cyl(0.08, 0.09, 0.28, 12, '#6b3f1c', 0, 0.37, 0);
    K.cyl(0.095, 0.095, 0.06, 12, '#e8d7a8', 0, 0.53, 0);
    K.cyl(0.226, 0.226, 0.28, 12, '#f2e3b0', 0, -0.24, 0);       // этикетка «Жигулёвочка»
    K.cyl(0.229, 0.229, 0.05, 12, '#c0392b', 0, -0.2, 0);
    K.cyl(0.092, 0.092, 0.07, 12, '#f2e3b0', 0, 0.36, 0);
    return [[0, 0, 0.25], 1.4];
  },
  duck (K) {
    K.ball(0.42, '#ffd23f', 0, -0.12, 0, 1.2, 0.8, 1);
    K.ball(0.26, '#ffd23f', 0.28, 0.3, 0);
    K.box(0.24, 0.08, 0.2, '#ff8a2b', 0.56, 0.27, 0);
    for (const z of [-0.15, 0.15]) {
      K.ball(0.045, '#1b1a1f', 0.44, 0.38, z);
      K.ball(0.18, '#f2b43a', -0.05, -0.04, z * 2.3, 1.3, 0.6, 0.5);
    }
    K.add(new (K.T.ConeGeometry)(0.13, 0.3, 6), '#ffd23f', -0.48, 0.08, 0, 0, 0, 1.0);
    return [[0, 0, 0], 1.3];
  },
  cactus (K) {
    K.cyl(0.32, 0.24, 0.38, 12, '#c9803a', 0, -0.47, 0);
    K.cyl(0.36, 0.36, 0.1, 12, '#a8652a', 0, -0.26, 0);
    K.cyl(0.3, 0.3, 0.02, 12, '#5a3a22', 0, -0.2, 0);
    K.cyl(0.14, 0.15, 0.75, 8, '#4fae3a', 0, 0.17, 0);
    K.ball(0.14, '#4fae3a', 0, 0.54, 0);
    K.box(0.22, 0.12, 0.12, '#4fae3a', -0.2, 0.08, 0); K.cyl(0.075, 0.075, 0.3, 8, '#4fae3a', -0.3, 0.22, 0); K.ball(0.075, '#4fae3a', -0.3, 0.37, 0);
    K.box(0.22, 0.12, 0.12, '#4fae3a', 0.2, 0.22, 0); K.cyl(0.075, 0.075, 0.24, 8, '#4fae3a', 0.3, 0.33, 0); K.ball(0.075, '#4fae3a', 0.3, 0.45, 0);
    K.ball(0.09, '#ff5d7a', 0, 0.7, 0);
    for (const [x, y, z] of [[0.15, 0.0, 0], [-0.15, 0.3, 0], [0, 0.1, 0.15], [0, 0.35, -0.15], [0.1, 0.42, 0.1]]) K.box(0.04, 0.04, 0.04, '#d8f0c8', x, y, z);
    return [[0, 0, 0], 1.3];
  },
  cube (K) {
    const C = ['#e04836', '#ffd23f', '#4f7fd6', '#59b06a', '#ff8a2b', '#f4f4ee'], h = 0.42;
    K.box(0.84, 0.84, 0.84, '#1b1a1f', 0, 0, 0);
    const F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    F.forEach(([fx, fy, fz], f) => {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const hex = C[(f * 3 + (a + 1) * 2 + (b + 1) + 1) % 6], o = a * 0.27, p = b * 0.27;
        if (fz) K.box(0.24, 0.24, 0.03, hex, o, p, fz * h);
        else if (fx) K.box(0.03, 0.24, 0.24, hex, fx * h, o, p);
        else K.box(0.24, 0.03, 0.24, hex, o, fy * h, p);
      }
    });
    return [[0.5, 0, 0.6], 1.2];
  },
  gnome (K) {
    K.cyl(0.24, 0.32, 0.45, 10, '#4f7fd6', 0, -0.35, 0);
    K.cyl(0.27, 0.27, 0.06, 10, '#3a2c22', 0, -0.25, 0);
    for (const x of [-0.12, 0.12]) K.box(0.16, 0.1, 0.24, '#3a2c22', x, -0.62, 0.04);
    K.add(new (K.T.ConeGeometry)(0.24, 0.38, 10), '#f4f4ee', 0, -0.04, 0.07, Math.PI);   // борода
    K.ball(0.18, '#f0c8a0', 0, 0.15, 0);
    K.ball(0.06, '#ff9a7a', 0, 0.12, 0.17);
    for (const x of [-0.07, 0.07]) K.box(0.04, 0.04, 0.03, '#1b1a1f', x, 0.2, 0.16);
    K.add(new (K.T.ConeGeometry)(0.26, 0.56, 10), '#e04836', 0, 0.52, 0);
    return [[0, 0, 0], 1.3];
  },
  salmon (K) {
    // кусок пиццы с лососем: тесто, сыр, бортик, кусочки лосося и зелень; лежит, наклонён к камере
    K.add(new (K.T.CylinderGeometry)(0.6, 0.6, 0.08, 3), '#e8b563', 0, 0, 0, 0, 0, 0, 0.85, 1, 1);
    K.add(new (K.T.CylinderGeometry)(0.5, 0.5, 0.04, 3), '#fff3d6', 0, 0.05, 0.04, 0, 0, 0, 0.85, 1, 1);
    K.box(0.9, 0.14, 0.14, '#c98a3a', 0, 0.05, -0.31);
    for (const [x, z] of [[0, 0.24], [-0.15, -0.06], [0.15, -0.09], [0.0, 0.05], [-0.06, -0.18]]) {
      K.box(0.15, 0.04, 0.1, '#ff8a70', x, 0.09, z);
      K.box(0.15, 0.045, 0.03, '#ffd0c0', x, 0.095, z - 0.03);
    }
    for (const [x, z] of [[-0.2, -0.16], [0.22, -0.2], [0.07, 0.14], [-0.04, 0.36]]) K.box(0.05, 0.05, 0.05, '#4fae3a', x, 0.1, z);
    return [[0.9, 0, 0], 1.4];
  },
  pager (K) {
    K.box(0.6, 0.8, 0.2, '#3a3940', 0, 0, 0);
    K.box(0.46, 0.26, 0.22, '#9fd08a', 0, 0.18, 0);
    for (let i = 0; i < 4; i++) K.box(0.06, 0.12, 0.23, '#2f5a38', -0.135 + i * 0.09, 0.18, 0);
    for (const x of [-0.15, 0, 0.15]) K.box(0.1, 0.08, 0.22, '#8e8a92', x, -0.12, 0);
    K.box(0.1, 0.08, 0.22, '#e04836', 0.15, -0.27, 0);
    K.box(0.16, 0.09, 0.18, '#57525c', -0.18, 0.44, 0);
    K.box(0.3, 0.5, 0.06, '#2b2a30', 0, 0, -0.13);
    return [[0, 0, 0.12], 1.3];
  },
  penguin (K) {
    K.ball(0.36, '#1b1a1f', 0, -0.15, 0, 1, 1.25, 0.9);
    K.ball(0.27, '#f4f4ee', 0, -0.18, 0.14, 1, 1.2, 0.65);
    K.ball(0.24, '#1b1a1f', 0, 0.38, 0);
    K.ball(0.16, '#f4f4ee', 0, 0.36, 0.13, 1, 1, 0.65);
    for (const x of [-0.06, 0.06]) K.ball(0.035, '#1b1a1f', x, 0.42, 0.22);
    K.add(new (K.T.ConeGeometry)(0.06, 0.14, 6), '#ff8a2b', 0, 0.34, 0.28, Math.PI / 2);
    for (const x of [-0.12, 0.12]) K.box(0.14, 0.06, 0.2, '#ff8a2b', x, -0.6, 0.08);
    K.add(new (K.T.TorusGeometry)(0.24, 0.06, 6, 14), '#e04836', 0, 0.17, 0, Math.PI / 2);
    K.box(0.09, 0.24, 0.05, '#e04836', 0.12, 0.03, 0.24);
    for (const s of [-1, 1]) K.ball(0.13, '#1b1a1f', s * 0.36, -0.1, 0, 0.4, 1.4, 0.8, 0, 0, s * 0.3);
    return [[0, 0, 0], 1.3];
  },
  peel (K) {
    // золотая лопата для пиццы: ручка, шейка, широкое полотно с круглым краем, блик
    K.cyl(0.05, 0.05, 0.7, 8, '#e0a020', 0, -0.4, 0);
    K.cyl(0.07, 0.07, 0.06, 8, '#b07a12', 0, -0.76, 0);
    K.box(0.22, 0.14, 0.06, '#f2b441', 0, 0.0, 0);
    K.box(0.62, 0.48, 0.05, '#ffd85e', 0, 0.3, 0);
    K.cyl(0.31, 0.31, 0.05, 16, '#ffd85e', 0, 0.54, 0, Math.PI / 2);
    K.box(0.07, 0.42, 0.06, '#fff3b0', -0.18, 0.34, 0);
    return [[0, 0, 0.3], 1.3];
  },
};

const FIT = 1.75;                                  // находка: самая длинная сторона, м

export function build (THREE, { col = [] } = {}) {
  const K = kit(THREE);
  K.T = THREE;
  const out = { col: {} };
  // монета на ребре: тёмный обод, золотые грани, «₽» с двух сторон, блик
  K.cyl(0.46, 0.46, 0.12, 20, '#c98a12', 0, 0, 0, Math.PI / 2);
  K.cyl(0.38, 0.38, 0.14, 20, '#ffc93c', 0, 0, 0, Math.PI / 2);
  rub(K, '#d9940f', 0.075, 1, 0.95); rub(K, '#d9940f', -0.075, -1, 0.95);
  K.box(0.08, 0.16, 0.03, '#fffbe0', -0.22, 0.18, 0.073, 0, 0, -0.6);
  out.coin = K.done(null, 1.1);
  // пачка купюр с красной резинкой
  pack(K, 0, 0, 0, 0, '#e8323c');
  out.bill = K.done([0, 0, 0.3]);
  // заначка: четыре пачки в бумажных лентах и пятая сверху поперёк, с резинкой
  pack(K, 0, -0.17, -0.31, 0, '#f4f0dc', 1.0, 0.3, 0.56); pack(K, 0, -0.17, 0.31, 0, '#f4f0dc', 1.0, 0.3, 0.56);
  pack(K, 0, 0.15, -0.31, 0, '#f4f0dc', 1.0, 0.3, 0.56); pack(K, 0, 0.15, 0.31, 0, '#f4f0dc', 1.0, 0.3, 0.56);
  pack(K, 0, 0.47, 0, 0.6, '#e8323c', 1.0, 0.3, 0.56);
  out.stash = K.done([0, 0, 0.12], 1.05);
  // «золотое» сердце: само КРАСНОЕ, как сердца на хаде (автор 23.10.2026, 0п24: жёлтое не читалось как сердце);
  // от аптечки отличает золотая обводка, белый блик и размер (1,6 м); середина толще краёв, правый край — тень
  voxels(K, HEART, { y: '#f2b630', R: '#e8323c', r: '#a81a26', w: '#fff6c8' }, 0.12, 0.26, 0.08);
  out.life = K.done(null, 1.05);
  for (const id of col) {
    const f = COLS[id];
    if (!f) continue;
    const [tilt, s] = f(K);
    // по размеру: самая длинная сторона — FIT м (была картинка 1,9 м), середина — в нуле (висит на 1,9 м, как картинка)
    const g = K.done(tilt, s);
    g.computeBoundingBox();
    const B = g.boundingBox, k = FIT / Math.max(B.max.x - B.min.x, B.max.y - B.min.y, B.max.z - B.min.z);
    g.translate(-(B.max.x + B.min.x) / 2, -(B.max.y + B.min.y) / 2, -(B.max.z + B.min.z) / 2).scale(k, k, k);
    g.computeBoundingSphere();
    out.col[id] = g;
  }
  return out;
}
